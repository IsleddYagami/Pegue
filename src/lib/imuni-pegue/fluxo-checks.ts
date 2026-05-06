// IMUNI plugin Pegue — checks de FLUXO DE VENDA (cota -> cobra -> executa -> repassa).
//
// Categoria adicionada 4/Mai/2026 (Onda 2 do refino IMUNI). Razao
// estrategica (Fabio): "se a IMUNI conseguir atacar isso — pedido
// errado e preco e pgto errado — ai realmente vira ouro". Dor universal
// em qualquer empresa com fluxo de venda. Pegue eh laboratorio: ao
// validar aqui, mesma logica vai pra Otimizi.
//
// O que essas sentinelas atacam:
//   - Cliente paga valor diferente do cotado/cobrado
//   - IA recalculou silenciosamente o valor entre cotacao e cobranca
//   - Split fretista+Pegue nao bate com total da corrida (bug aritmetico)
//   - Fretista executando frete que nao foi pago (sequencia quebrada)
//
// Filosofia: cada sentinela cruza DUAS etapas do fluxo. Divergencia =
// bug ou fraude — humano decide qual.

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import type { ResultadoInvariante } from "@/lib/imuni/types";

// === CONSTANTES DE TOLERANCIA ===
// Tolerancia centavo: diferenca de 1 centavo eh aceitavel (arredondamento
// em calculos com mult por percentual). Acima disso eh bug.
const TOLERANCIA_CENTAVOS = 0.01;

// Tolerancia de re-calculo: cliente aceita pequeno reajuste entre
// cotacao e valor final (ex: ajudante adicional, andar a mais). 5% eh
// limite empirico — acima sugere mudanca substantiva sem revalidacao.
const TOLERANCIA_RECALCULO_PCT = 5;

const HORAS_24 = 24 * 60 * 60 * 1000;

function hAtras(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

/**
 * INV-24 (ALTA): Valor cobrado em pagamentos != valor_final da corrida.
 *
 * Cenario alvo: cliente pagou R$ 80 (valor da corrida), mas em
 * `pagamentos.valor` foi gravado R$ 79 ou R$ 81. Bug de copy/paste,
 * ou — pior — adulteracao manual no admin.
 *
 * Excecoes legitimas (NAO disparam):
 *   - Pagamentos com status=rejeitado ou pendente (cliente desistiu/falhou)
 *   - Diferenca <= R$ 0.01 (arredondamento de calculo percentual)
 *
 * Cruzamento: corridas.valor_final ↔ pagamentos.valor (mesma corrida_id).
 */
export async function invValorPagoDivergeDaCorrida(): Promise<ResultadoInvariante> {
  try {
    // Busca pagamentos aprovados nos ultimos 30 dias com a corrida.
    // Filtra status='aprovado' (MP) ou via repasse_status (Asaas):
    // pagamento que efetivamente entrou.
    const { data, error } = await supabase
      .from("pagamentos")
      .select("id, corrida_id, valor, status, criado_em, corridas!inner(id, codigo, valor_final, status)")
      .in("status", ["aprovado", "pago"])
      .gte("criado_em", hAtras(24 * 30));
    if (error) throw error;
    if (!data || data.length === 0) {
      return { nome: "INV-24", descricao: "valor_pago_diverge_da_corrida", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    const divergentes = data.filter((p: any) => {
      const valorPago = Number(p.valor);
      const valorCorrida = Number(p.corridas?.valor_final);
      if (!valorPago || !valorCorrida) return false; // dados incompletos — nao trata como divergencia
      return Math.abs(valorPago - valorCorrida) > TOLERANCIA_CENTAVOS;
    });

    return {
      nome: "INV-24",
      descricao:
        "Pagamentos aprovados (ult 30d) com valor != corridas.valor_final (cobranca incorreta ou adulteracao)",
      severidade: "alta",
      count: divergentes.length,
      amostra: divergentes.slice(0, 5).map((p: any) => ({
        codigo: p.corridas?.codigo,
        valor_pago: Number(p.valor),
        valor_corrida: Number(p.corridas?.valor_final),
        diferenca: Number(p.valor) - Number(p.corridas?.valor_final),
        pagamento_id: p.id,
      })),
      ok: divergentes.length === 0,
      comoAgir:
        "Cliente pagou valor diferente do cobrado da corrida. Investigar: 1) bug de copy/paste no codigo que setou o valor; 2) cliente pagou parcial via PIX manual; 3) cobranca foi ajustada apos pagamento. Conferir bot_logs e webhook MP/Asaas. Se confirmado erro, regularizar com cliente.",
    };
  } catch (e: any) {
    return { nome: "INV-24", descricao: "valor_pago_diverge_da_corrida", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro ao consultar pagamentos+corridas" };
  }
}

/**
 * INV-25 (MEDIA): Cotacao (valor_estimado) >> Valor final (valor_final)
 * por divergencia maior que TOLERANCIA_RECALCULO_PCT (5%).
 *
 * Cenario alvo: IA cotou R$ 80, mas na hora de cobrar saiu R$ 110 sem
 * cliente revalidar. Pode ser legitimo (adicionou andar, ajudante) mas
 * acima de 5% precisa cliente confirmar — senao vira reclamacao.
 *
 * Severidade media: pode ser legitimo, so alerta admin pra conferir.
 *
 * Excecoes legitimas:
 *   - Divergencia <= 5% (re-calculo razoavel)
 *   - valor_estimado nulo (cotacao manual sem registrar estimativa)
 */
export async function invCotacaoVsValorFinalDivergente(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("corridas")
      .select("id, codigo, valor_estimado, valor_final, status, criado_em")
      .not("valor_estimado", "is", null)
      .not("valor_final", "is", null)
      .gt("valor_estimado", 0)
      .gt("valor_final", 0)
      .gte("criado_em", hAtras(24 * 30))
      .in("status", ["pago", "buscando_prestador", "prestador_confirmado", "em_coleta", "coletado", "em_transito", "em_entrega", "entregue", "finalizado", "concluida", "paga"]);
    if (error) throw error;
    if (!data || data.length === 0) {
      return { nome: "INV-25", descricao: "cotacao_vs_valor_final", severidade: "media", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    const divergentes = data.filter((c: any) => {
      const est = Number(c.valor_estimado);
      const fin = Number(c.valor_final);
      const pctDiff = Math.abs(fin - est) / est * 100;
      return pctDiff > TOLERANCIA_RECALCULO_PCT;
    });

    return {
      nome: "INV-25",
      descricao:
        "Corridas onde valor_final divergiu mais de 5% do valor_estimado (re-calculo silencioso entre cotacao e cobranca)",
      severidade: "media",
      count: divergentes.length,
      amostra: divergentes.slice(0, 5).map((c: any) => ({
        codigo: c.codigo,
        valor_estimado: Number(c.valor_estimado),
        valor_final: Number(c.valor_final),
        delta_pct: Math.round(Math.abs(Number(c.valor_final) - Number(c.valor_estimado)) / Number(c.valor_estimado) * 100),
      })),
      ok: divergentes.length === 0,
      comoAgir:
        "Cliente cotou um valor com a IA, mas o valor cobrado divergiu mais de 5% sem revalidacao. Pode ser legitimo (andar, ajudante adicional) ou bug. Verificar logs da IA pra entender se houve revalidacao com cliente. Se nao houve, regra negocio precisa avisar cliente antes de cobrar.",
    };
  } catch (e: any) {
    return { nome: "INV-25", descricao: "cotacao_vs_valor_final", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-26 (ALTA): Split valor_prestador + valor_pegue != valor_final.
 *
 * Cenario alvo: bug aritmetico no calculo da comissao. Resultado:
 * fretista vai receber valor errado E/OU Pegue vai ficar com valor
 * errado. Catastrofico financeiramente — afeta margem real e relacao
 * com fretista.
 *
 * Excecoes legitimas:
 *   - Diferenca <= R$ 0.01 (arredondamento de percentual)
 *   - valor_prestador OU valor_pegue nulos (corrida ainda nao precificou
 *     totalmente — comum em status iniciais)
 */
export async function invSplitValorErrado(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("corridas")
      .select("id, codigo, valor_final, valor_prestador, valor_pegue, status, criado_em")
      .not("valor_final", "is", null)
      .not("valor_prestador", "is", null)
      .not("valor_pegue", "is", null)
      .gte("criado_em", hAtras(24 * 30));
    if (error) throw error;
    if (!data || data.length === 0) {
      return { nome: "INV-26", descricao: "split_valor_errado", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    const divergentes = data.filter((c: any) => {
      const total = Number(c.valor_final);
      const fretista = Number(c.valor_prestador);
      const pegue = Number(c.valor_pegue);
      if (!total) return false;
      return Math.abs(total - (fretista + pegue)) > TOLERANCIA_CENTAVOS;
    });

    return {
      nome: "INV-26",
      descricao:
        "Corridas onde valor_prestador + valor_pegue != valor_final (split aritmetico errado)",
      severidade: "alta",
      count: divergentes.length,
      amostra: divergentes.slice(0, 5).map((c: any) => ({
        codigo: c.codigo,
        valor_final: Number(c.valor_final),
        valor_prestador: Number(c.valor_prestador),
        valor_pegue: Number(c.valor_pegue),
        soma: Number(c.valor_prestador) + Number(c.valor_pegue),
        diferenca: Number(c.valor_final) - (Number(c.valor_prestador) + Number(c.valor_pegue)),
      })),
      ok: divergentes.length === 0,
      comoAgir:
        "Bug aritmetico no calculo do split. Fretista vai receber errado OU Pegue vai ficar com margem errada. Investigar funcao que calcula split (provavelmente em src/lib/precificacao* ou cotador). Corrigir codigo + ajustar valores das corridas afetadas manualmente.",
    };
  } catch (e: any) {
    return { nome: "INV-26", descricao: "split_valor_errado", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-27 (ALTA): Corrida em status pos-pagamento (em_coleta+) sem
 * pagamento aprovado correspondente.
 *
 * Cenario alvo: fretista esta executando frete (coletou ou ja em
 * transito) mas o pagamento NAO foi aprovado/pago. Sequencia quebrada:
 * cliente recebeu servico sem ter pago. Risco de prejuizo direto.
 *
 * Causas possiveis:
 *   1. Bug que evoluiu status sem checar pagamento
 *   2. Webhook MP/Asaas perdido (pagamento foi mas nao confirmou)
 *   3. Admin avancou manualmente sem conferir
 *
 * Excecao: corridas com canal_origem='admin_manual' que tem fluxo
 * proprio de pagamento offline (nao tem hoje, mas previsto).
 */
export async function invStatusAvancadoSemPagamento(): Promise<ResultadoInvariante> {
  try {
    const STATUS_POS_PAGAMENTO = [
      "em_coleta",
      "coletado",
      "em_transito",
      "em_entrega",
      "entregue",
      "finalizado",
      "concluida",
    ];
    const { data, error } = await supabase
      .from("corridas")
      .select("id, codigo, status, valor_final, pago_em, asaas_payment_id, criado_em")
      .in("status", STATUS_POS_PAGAMENTO)
      .gte("criado_em", hAtras(24 * 30));
    if (error) throw error;
    if (!data || data.length === 0) {
      return { nome: "INV-27", descricao: "status_avancado_sem_pagamento", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    // Pra cada corrida em status avancado, conferir se ha pagamento
    // aprovado OU asaas_payment_id presente.
    const ids = data.map((c: any) => c.id);
    const { data: pgts } = await supabase
      .from("pagamentos")
      .select("corrida_id, status")
      .in("corrida_id", ids);
    const idsComPagamento = new Set(
      (pgts || [])
        .filter((p: any) => ["aprovado", "pago"].includes(p.status))
        .map((p: any) => p.corrida_id),
    );

    const orfas = data.filter((c: any) => {
      const temAsaasOuMp = idsComPagamento.has(c.id) || !!c.asaas_payment_id;
      return !temAsaasOuMp;
    });

    return {
      nome: "INV-27",
      descricao:
        "Corridas com status pos-pagamento (em_coleta/em_transito/entregue/concluida) SEM pagamento aprovado (ult 30d)",
      severidade: "alta",
      count: orfas.length,
      amostra: orfas.slice(0, 5).map((c: any) => ({
        codigo: c.codigo,
        status: c.status,
        valor_final: Number(c.valor_final),
        pago_em: c.pago_em,
        asaas_payment_id: c.asaas_payment_id,
      })),
      ok: orfas.length === 0,
      comoAgir:
        "Fretista executou ou esta executando frete sem pagamento confirmado. Conferir: 1) webhook MP/Asaas pode ter sido perdido (procurar bot_logs tipo=webhook_*); 2) admin avancou manualmente; 3) bug que evolui status sem checar. Se cliente realmente pagou, registrar pagamento manual. Se nao pagou, decidir cobrar a posteriori ou absorver perda.",
    };
  } catch (e: any) {
    return { nome: "INV-27", descricao: "status_avancado_sem_pagamento", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}
