// IMUNI plugin: invariantes do dominio Pegue (corridas, repasse,
// dispatch, etc). Roda no cron /api/cron/auditar-invariantes via
// runner generico do core IMUNI.
//
// Audit 1/Mai/2026 (diretiva Fabio): IMUNI eh produto reutilizavel
// em multiplos negocios. Pegue eh apenas o primeiro plugin/cliente.
// Pra adicionar invariantes de outro dominio (ex: Otimizi), criar
// src/lib/imuni-{dominio}/ seguindo o mesmo padrao.
//
// Regra de ouro: invariantes sao SOBRE DADOS, nao sobre codigo.
// Pegam o que linter/typecheck/teste unitario nao alcancam — bugs
// que so aparecem com volume real, com tempo, com integracoes
// externas.

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import type { ResultadoInvariante, PluginImuni } from "@/lib/imuni/types";
import {
  invHeaderGeolocationPermitido,
  invHeaderHsts,
  invHeaderCspProducao,
  invEnvVarsCriticas,
  invAsaasEmProducao,
} from "./infra-checks";

const HORAS_24 = 24 * 60 * 60 * 1000;
const HORAS_1 = 60 * 60 * 1000;

function hAtras(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

// ============================================================
// INVARIANTES — em ordem de severidade
// ============================================================

/**
 * INV-1 (ALTA): Toda corrida marcada "concluida" deve ter pagamento aprovado.
 * Sintoma: cliente recebeu servico mas pagamento nao foi liberado pro fretista.
 * Causa potencial: webhook MP/Asaas perdido, repasse falhou silenciosamente.
 */
async function invCorridasConcluidasSemPagamento(): Promise<ResultadoInvariante> {
  try {
    const { data: corridas, error } = await supabase
      .from("corridas")
      .select("id, codigo, valor_final, entrega_em")
      .eq("status", "concluida")
      .gte("entrega_em", hAtras(24 * 30)); // ultimos 30d
    if (error) throw error;

    const ids = (corridas || []).map((c) => c.id);
    if (ids.length === 0) {
      return { nome: "INV-1", descricao: "corridas_concluidas_sem_pagamento", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    const { data: pagsPagas } = await supabase
      .from("pagamentos")
      .select("corrida_id, repasse_status")
      .in("corrida_id", ids);

    const idsComRepassePago = new Set(
      (pagsPagas || [])
        .filter((p: any) => p.repasse_status === "pago")
        .map((p: any) => p.corrida_id),
    );

    const semPagamento = (corridas || []).filter((c) => !idsComRepassePago.has(c.id));

    return {
      nome: "INV-1",
      descricao: "Corridas marcadas concluida nos ultimos 30d sem pagamento.repasse_status=pago",
      severidade: "alta",
      count: semPagamento.length,
      amostra: semPagamento.slice(0, 5).map((c) => ({ id: c.id, codigo: c.codigo, valor: c.valor_final, entrega_em: c.entrega_em })),
      ok: semPagamento.length === 0,
      comoAgir: "Verificar /admin/financeiro. Pode ser webhook perdido OU repasse ainda em processamento (Asaas tem ate 2h pra liquidar). Se >2h, fazer PIX manual.",
    };
  } catch (e: any) {
    return { nome: "INV-1", descricao: "corridas_concluidas_sem_pagamento", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro ao executar invariante" };
  }
}

/**
 * INV-2 (ALTA): Prestadores aprovados+disponiveis devem ter chave_pix.
 * Sintoma: dispatch envia frete, fretista aceita, completa, mas repasse trava
 * porque sistema descobre na hora que nao tem chave PIX cadastrada.
 */
async function invPrestadoresAprovadosSemPix(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("prestadores")
      .select("id, nome, telefone")
      .eq("status", "aprovado")
      .eq("disponivel", true)
      .or("chave_pix.is.null,chave_pix.eq.");
    if (error) throw error;
    return {
      nome: "INV-2",
      descricao: "Prestadores aprovados E disponiveis sem chave PIX cadastrada",
      severidade: "alta",
      count: (data || []).length,
      amostra: (data || []).slice(0, 5).map((p) => ({ id: p.id, nome: p.nome, telefone_masked: p.telefone?.replace(/\d(?=\d{4})/g, "*") })),
      ok: (data || []).length === 0,
      comoAgir: "Pausar prestador (disponivel=false) ate cadastrar PIX. Senao primeiro frete dele vai travar repasse.",
    };
  } catch (e: any) {
    return { nome: "INV-2", descricao: "prestadores_aprovados_sem_pix", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro ao executar" };
  }
}

/**
 * INV-3 (ALTA): Pagamentos com repasse_status=pago devem ter pago_em.
 * Sintoma: bug de schema (coluna errada). Foi exatamente o BUG #BATCH4-5.
 * Detecta regressoes futuras desse tipo automaticamente.
 */
async function invPagamentosPagoSemTimestamp(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("pagamentos")
      .select("id, corrida_id, valor, criado_em")
      .eq("repasse_status", "pago")
      .is("pago_em", null);
    if (error) throw error;
    return {
      nome: "INV-3",
      descricao: "Pagamentos repasse_status=pago sem pago_em (regressao do BUG BATCH4-5)",
      severidade: "alta",
      count: (data || []).length,
      amostra: (data || []).slice(0, 5),
      ok: (data || []).length === 0,
      comoAgir: "Algum endpoint admin esta atualizando coluna errada de novo. Procurar no codigo por 'repasse_status: pago' sem pago_em adjacente.",
    };
  } catch (e: any) {
    return { nome: "INV-3", descricao: "pagamentos_pago_sem_timestamp", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-4 (ALTA): Corridas com prestador_id atribuido nao devem ter dispatch_ativo=true.
 * Sintoma: dispatch zumbi — fretista ja aceitou mas dispatch ainda esta aberto.
 * Outro fretista pode "pegar" mesmo apos primeiro aceitar (race nao corrigido).
 */
async function invDispatchZumbi(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("corridas")
      .select("id, codigo, prestador_id, dispatch_iniciado_em")
      .not("prestador_id", "is", null)
      .eq("dispatch_ativo", true);
    if (error) throw error;
    return {
      nome: "INV-4",
      descricao: "Corridas com prestador atribuido mas dispatch_ativo=true (zumbi)",
      severidade: "alta",
      count: (data || []).length,
      amostra: (data || []).slice(0, 5),
      ok: (data || []).length === 0,
      comoAgir: "Atomicidade do dispatch quebrada. Marcar dispatch_ativo=false manualmente nas IDs listadas e investigar tryAceitarDispatch.",
    };
  } catch (e: any) {
    return { nome: "INV-4", descricao: "dispatch_zumbi", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-5 (ALTA): Corridas em status "paga" devem ter asaas_payment_id ou mp ref.
 * Sintoma: corrida marcada paga sem prova externa de pagamento — bug ou fraude.
 */
async function invCorridasPagaSemProvaPagamento(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("corridas")
      .select("id, codigo, valor_final, pago_em, asaas_payment_id")
      .eq("status", "paga")
      .is("asaas_payment_id", null)
      .gte("pago_em", hAtras(24 * 7)); // ultimos 7d
    if (error) throw error;
    // Filtra: tambem nao tem registro em pagamentos (MP legacy)
    const ids = (data || []).map((c) => c.id);
    if (ids.length === 0) {
      return { nome: "INV-5", descricao: "corridas_paga_sem_prova", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }
    const { data: pgts } = await supabase
      .from("pagamentos")
      .select("corrida_id")
      .in("corrida_id", ids);
    const idsComMp = new Set((pgts || []).map((p: any) => p.corrida_id));
    const orfas = (data || []).filter((c) => !idsComMp.has(c.id));
    return {
      nome: "INV-5",
      descricao: "Corridas em status=paga (ult 7d) sem asaas_payment_id E sem registro em pagamentos",
      severidade: "alta",
      count: orfas.length,
      amostra: orfas.slice(0, 5),
      ok: orfas.length === 0,
      comoAgir: "Conferir manualmente. Se houver, pode ser bug de codigo OU tentativa de marcar pago sem PIX real (fraude).",
    };
  } catch (e: any) {
    return { nome: "INV-5", descricao: "corridas_paga_sem_prova", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-6 (MEDIA): Tarefas agendadas atrasadas > 1h sem execucao podem indicar
 * cron de tarefas-agendadas parado.
 */
async function invTarefasAgendadasAtrasadas(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("tarefas_agendadas")
      .select("id, tipo, executar_em, tentativas, erro")
      .is("executado_em", null)
      .lt("executar_em", hAtras(1))
      .lt("tentativas", 3);
    if (error) throw error;
    return {
      nome: "INV-6",
      descricao: "Tarefas agendadas atrasadas > 1h sem execucao",
      severidade: "media",
      count: (data || []).length,
      amostra: (data || []).slice(0, 5),
      ok: (data || []).length === 0,
      comoAgir: "Cron /api/cron/tarefas-agendadas pode estar parado. Verificar Vercel/cron-job.org.",
    };
  } catch (e: any) {
    return { nome: "INV-6", descricao: "tarefas_atrasadas", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-7 (MEDIA): Ocorrencias abertas > 24h sem resolucao.
 * Sintoma: admin esqueceu de tratar OU sistema falhou em fechar.
 */
async function invOcorrenciasAbertasMuitoTempo(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("ocorrencias")
      .select("id, tipo, criado_em, status")
      .eq("status", "aberta")
      .lt("criado_em", hAtras(24));
    if (error) throw error;
    return {
      nome: "INV-7",
      descricao: "Ocorrencias abertas ha mais de 24h",
      severidade: "media",
      count: (data || []).length,
      amostra: (data || []).slice(0, 5),
      ok: (data || []).length === 0,
      comoAgir: "Resolver via /admin/operacao-real. Se for muito comum, aumentar timeout do cron ocorrencia_timeout_admin.",
    };
  } catch (e: any) {
    return { nome: "INV-7", descricao: "ocorrencias_abertas_24h", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-8 (MEDIA): Logs asaas_repasse_iniciado sem TRANSFER_DONE/FAILED em 24h.
 * Sintoma: repasse iniciado e Asaas nao confirmou — pode ter perdido webhook.
 */
async function invRepassesAsaasPendentes(): Promise<ResultadoInvariante> {
  try {
    const { data: iniciados } = await supabase
      .from("bot_logs")
      .select("id, payload, criado_em")
      .filter("payload->>tipo", "eq", "asaas_repasse_iniciado")
      .lt("criado_em", hAtras(24))
      .limit(100);
    if (!iniciados || iniciados.length === 0) {
      return { nome: "INV-8", descricao: "asaas_repasses_sem_confirmacao", severidade: "media", count: 0, amostra: [], ok: true, comoAgir: "" };
    }
    const transferIds = iniciados.map((l) => (l.payload as any)?.transfer_id).filter(Boolean);
    if (transferIds.length === 0) {
      return { nome: "INV-8", descricao: "asaas_repasses_sem_confirmacao", severidade: "media", count: 0, amostra: [], ok: true, comoAgir: "" };
    }
    const { data: confirmacoes } = await supabase
      .from("bot_logs")
      .select("payload")
      .or(`payload->>tipo.eq.webhook_asaas,payload->>tipo.eq.asaas_transfer_failed`);
    const idsConfirmados = new Set(
      (confirmacoes || [])
        .map((l) => (l.payload as any)?.transfer_id)
        .filter(Boolean),
    );
    const semConfirmacao = iniciados.filter(
      (l) => !idsConfirmados.has((l.payload as any)?.transfer_id),
    );
    return {
      nome: "INV-8",
      descricao: "Repasses Asaas iniciados ha >24h sem TRANSFER_DONE nem FAILED",
      severidade: "media",
      count: semConfirmacao.length,
      amostra: semConfirmacao.slice(0, 5).map((l) => ({
        criado_em: l.criado_em,
        transfer_id: (l.payload as any)?.transfer_id,
        valor: (l.payload as any)?.valor,
      })),
      ok: semConfirmacao.length === 0,
      comoAgir: "Verificar webhook Asaas configurado em https://www.asaas.com/integration/webhooks. Pode ter parado de chegar.",
    };
  } catch (e: any) {
    return { nome: "INV-8", descricao: "asaas_repasses_sem_confirmacao", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-9 (MEDIA): Corridas em status=pendente ha mais de 24h.
 * Sintoma: cliente nao pagou e ninguem cancelou. Sessao zumbi do cliente.
 */
async function invCorridasPendentesMuitoTempo(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("corridas")
      .select("id, codigo, criado_em, valor_estimado")
      .eq("status", "pendente")
      .lt("criado_em", hAtras(24));
    if (error) throw error;
    return {
      nome: "INV-9",
      descricao: "Corridas em status=pendente ha mais de 24h",
      severidade: "media",
      count: (data || []).length,
      amostra: (data || []).slice(0, 5),
      ok: (data || []).length === 0,
      comoAgir: "Marcar como cancelada_admin no /admin. Cliente provavelmente desistiu sem responder.",
    };
  } catch (e: any) {
    return { nome: "INV-9", descricao: "corridas_pendentes_24h", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-10 (MEDIA): Prestadores com placa duplicada AINDA disponiveis.
 * Sintoma: anti-fraude do BUG #9 (auditoria 29/Abr) detectou e bloqueou
 * auto-aprovacao, mas se admin nao reverter o bloqueio, prestador real pode
 * ficar parado. Tambem pega caso novo de duplicidade.
 */
async function invPlacasDuplicadasAtivas(): Promise<ResultadoInvariante> {
  try {
    const { data: veiculos } = await supabase
      .from("prestadores_veiculos")
      .select("placa, prestador_id, prestadores!inner(disponivel, status)")
      .eq("ativo", true);
    if (!veiculos || veiculos.length === 0) {
      return { nome: "INV-10", descricao: "placas_duplicadas_ativas", severidade: "media", count: 0, amostra: [], ok: true, comoAgir: "" };
    }
    const porPlaca: Record<string, any[]> = {};
    for (const v of veiculos) {
      const p = (v as any).prestadores;
      if (p?.disponivel && p?.status === "aprovado") {
        if (!porPlaca[v.placa]) porPlaca[v.placa] = [];
        porPlaca[v.placa].push(v);
      }
    }
    const duplicadas = Object.entries(porPlaca)
      .filter(([_, lista]) => lista.length > 1)
      .map(([placa, lista]) => ({ placa, qtd: lista.length, prestadores_ids: lista.map((l) => l.prestador_id) }));
    return {
      nome: "INV-10",
      descricao: "Placas duplicadas em prestadores ATIVOS+disponiveis",
      severidade: "media",
      count: duplicadas.length,
      amostra: duplicadas.slice(0, 5),
      ok: duplicadas.length === 0,
      comoAgir: "Verificar manualmente se eh mesmo dono cadastrado 2x ou tentativa de fraude. Pausar um dos prestadores ate validar.",
    };
  } catch (e: any) {
    return { nome: "INV-10", descricao: "placas_duplicadas_ativas", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-11 (ALTA — descoberto 1/Mai/2026 com Fabio):
 * TODA corrida com pago_em != null deve ter registro em `pagamentos`.
 *
 * Bug historico catastrofico: webhooks MP e Asaas marcavam corrida como
 * paga mas NAO criavam registro em pagamentos. Cliente pagava de verdade
 * (cartao da Jackeline R$1 em 27/Abr foi confirmado pelo MP), corrida
 * marcava como paga, mas o sistema nao tinha rastro do pagamento real.
 * Auditoria fiscal impossivel, estorno impossivel. Detectado pela INV-1
 * mas INV-11 cobre especificamente o cenario "pago_em sem prova".
 *
 * Diferenca pro INV-1: INV-1 busca CONCLUIDAS sem repasse pago. INV-11
 * busca QUALQUER status com pago_em sem prova de pagamento (pega bug
 * desde o instante que pago_em eh setado, antes mesmo de concluir).
 */
async function invCorridasPagaSemRegistroPagamento(): Promise<ResultadoInvariante> {
  try {
    const { data: corridas, error } = await supabase
      .from("corridas")
      .select("id, codigo, valor_final, pago_em, asaas_payment_id, status")
      .not("pago_em", "is", null)
      .gte("pago_em", hAtras(24 * 60)); // ultimos 60 dias
    if (error) throw error;
    if (!corridas || corridas.length === 0) {
      return { nome: "INV-11", descricao: "corridas_paga_sem_registro_pagamento", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    const ids = corridas.map((c) => c.id);
    const { data: pgtsExistentes } = await supabase
      .from("pagamentos")
      .select("corrida_id")
      .in("corrida_id", ids);
    const idsComPagamento = new Set((pgtsExistentes || []).map((p: any) => p.corrida_id));

    const orfas = corridas.filter((c) => {
      // OK se tem registro em pagamentos OU asaas_payment_id (Asaas guarda
      // rastro tambem na coluna direta da corrida)
      const temRegistro = idsComPagamento.has(c.id);
      const temAsaasId = !!c.asaas_payment_id;
      return !temRegistro && !temAsaasId;
    });

    return {
      nome: "INV-11",
      descricao: "Corridas com pago_em != null mas SEM registro em pagamentos E SEM asaas_payment_id (rastro de pagamento perdido)",
      severidade: "alta",
      count: orfas.length,
      amostra: orfas.slice(0, 5).map((c) => ({ id: c.id, codigo: c.codigo, valor: c.valor_final, pago_em: c.pago_em, status: c.status })),
      ok: orfas.length === 0,
      comoAgir: "Pagamento real ocorreu (pago_em setado) mas sumiu do banco. Verificar bot_logs (tipo=webhook_mercadopago ou webhook_asaas) pra recuperar dados. Se confirmado pagamento, criar registro retroativo em pagamentos.",
    };
  } catch (e: any) {
    return { nome: "INV-11", descricao: "corridas_paga_sem_registro_pagamento", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-19 (MEDIA — descoberto 2/Mai/2026, audit fluxo cadastro):
 * Sessoes de cadastro de prestador abandonadas ha mais de 7 dias.
 *
 * Sintoma: bot_sessions com step iniciando com "cadastro_" sem
 * atualizacao recente — fretista comecou cadastro e abandonou. Acumula
 * indefinidamente, polui dashboard de operacao e ocupa espaco.
 *
 * Tratamento sugerido: cron de limpeza (proxima rodada) que deleta
 * sessoes >7d em step de cadastro. Por enquanto, IMUNI alerta volume.
 */
async function invSessoesCadastroAbandonadas(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("bot_sessions")
      .select("phone, step, atualizado_em")
      .like("step", "cadastro_%")
      .lt("atualizado_em", hAtras(24 * 7));
    if (error) throw error;
    return {
      nome: "INV-19",
      descricao: "Sessoes de cadastro de prestador abandonadas (>7 dias sem atividade)",
      severidade: "media",
      count: (data || []).length,
      amostra: (data || []).slice(0, 5).map((s) => ({ phone_masked: s.phone?.replace(/\d(?=\d{4})/g, "*"), step: s.step, atualizado_em: s.atualizado_em })),
      ok: (data || []).length === 0,
      comoAgir: "Cron de limpeza de bot_sessions abandonadas em cadastro nao foi implementado ainda. Por enquanto: limpar manualmente via SQL `DELETE FROM bot_sessions WHERE step LIKE 'cadastro_%' AND atualizado_em < NOW() - INTERVAL '7 days'`.",
    };
  } catch (e: any) {
    return { nome: "INV-19", descricao: "sessoes_cadastro_abandonadas", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-20 (ALTA — descoberto 2/Mai/2026, audit fluxo pedido de frete):
 * Cobrancas Asaas duplicadas no mesmo corrida_id (bot_logs com tipo
 * asaas_cobranca_duplicada_evitada nao deve existir, mas se existe sao
 * casos onde a guarda PEGOU).
 *
 * O alerta dispara so quando a guarda foi acionada (sintoma de race que
 * a IMUNI esta cacando). Volume zero = saudavel.
 */
async function invCobrancasDuplicadasEvitadas(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("bot_logs")
      .select("payload, criado_em")
      .filter("payload->>tipo", "eq", "asaas_cobranca_duplicada_evitada")
      .gte("criado_em", hAtras(24 * 7));
    if (error) throw error;
    return {
      nome: "INV-20",
      descricao: "Tentativas de cobranca duplicada evitadas pela guarda (ult 7d) — sinal de race condition no fluxo",
      severidade: "media",
      count: (data || []).length,
      amostra: (data || []).slice(0, 5).map((l: any) => ({ corrida_id: l.payload?.corrida_id, payment_id: l.payload?.payment_id_existente })),
      ok: (data || []).length === 0,
      comoAgir: "A guarda esta funcionando — duplicidade foi evitada. Se volume eh alto (>5/dia), investigar trigger upstream que esta disparando 2x: pode ser double-click do cliente, retry de cron ou webhook duplicado.",
    };
  } catch (e: any) {
    return { nome: "INV-20", descricao: "cobrancas_duplicadas_evitadas", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-18 (ALTA — descoberto 2/Mai/2026):
 * Corridas canceladas ha >1h com asaas_payment_id presente mas SEM
 * registro de estorno em bot_logs.
 *
 * Sintoma: cliente pagou, admin cancelou, mas o sistema nao estornou
 * (ou estorno falhou silenciosamente). Cliente fica sem servico E sem
 * dinheiro. Catastrofe legal (CDC art 18) e de reputacao.
 *
 * Implementacao via dois SELECTs:
 *   1. Lista corridas com status=cancelada nas ultimas 30d com
 *      asaas_payment_id != null;
 *   2. Lista bot_logs tipo=corrida_cancelada_admin com estorno_status
 *      em ('executado','bloqueado_repasse_pago') no mesmo periodo;
 *   3. Diff: corridas que cancelaram ha mais de 1h E nao tem log de
 *      estorno tratado = orfas.
 */
async function invCorridasCanceladasSemEstorno(): Promise<ResultadoInvariante> {
  try {
    const desde30d = hAtras(24 * 30);
    const { data: corridas } = await supabase
      .from("corridas")
      .select("id, codigo, valor_final, cancelado_em, asaas_payment_id")
      .eq("status", "cancelada")
      .not("asaas_payment_id", "is", null)
      .lt("cancelado_em", hAtras(1))
      .gte("cancelado_em", desde30d);
    if (!corridas || corridas.length === 0) {
      return { nome: "INV-18", descricao: "corridas_canceladas_sem_estorno", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    const ids = corridas.map((c) => c.id);
    const { data: logs } = await supabase
      .from("bot_logs")
      .select("payload")
      .filter("payload->>tipo", "eq", "corrida_cancelada_admin")
      .gte("criado_em", desde30d);
    const tratadas = new Set<string>();
    for (const l of logs || []) {
      const p: any = l.payload;
      const status = p?.estorno_status;
      if (
        p?.corrida_id &&
        (status === "executado" || status === "bloqueado_repasse_pago")
      ) {
        tratadas.add(p.corrida_id);
      }
    }

    const orfas = corridas.filter((c) => !tratadas.has(c.id));
    return {
      nome: "INV-18",
      descricao: "Corridas canceladas (>1h, ult 30d) com pagamento Asaas mas SEM registro de estorno tratado em bot_logs",
      severidade: "alta",
      count: orfas.length,
      amostra: orfas.slice(0, 5).map((c) => ({ id: c.id, codigo: c.codigo, valor: c.valor_final, cancelado_em: c.cancelado_em, asaas_payment_id: c.asaas_payment_id })),
      ok: orfas.length === 0,
      comoAgir: "Corrida cancelada mas estorno nao foi processado. Conferir manualmente no painel Asaas (POST /payments/{id}/refund). Se ja estornado por fora, criar log com tipo=corrida_cancelada_admin + estorno_status=executado pra silenciar invariante.",
    };
  } catch (e: any) {
    return { nome: "INV-18", descricao: "corridas_canceladas_sem_estorno", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

/**
 * INV-17 (MEDIA — descoberto 2/Mai/2026):
 * Alertas admin com claim pendente ha mais de 24h.
 *
 * Sintoma: tabela alertas_admin_pendentes acumula claims que nenhum admin
 * assumiu via "OK XXXX". Causas possiveis:
 *   - Codigo nao chegou ao admin (WhatsApp falhou) — todo o sistema fica
 *     com alerta sem dono;
 *   - Admin viu mas esqueceu;
 *   - Webhook ChatPro com filtro descartando a resposta do admin.
 *
 * Cron expira esses naturalmente, mas se acumular eh sinal de canal de
 * alerta degradado.
 */
async function invClaimsAdminPendentesMuitoTempo(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("alertas_admin_pendentes")
      .select("id, codigo, titulo, criado_em")
      .eq("status", "pendente")
      .lt("criado_em", hAtras(24));
    if (error) throw error;
    return {
      nome: "INV-17",
      descricao: "Alertas admin com claim pendente ha >24h (canal de alerta possivelmente degradado)",
      severidade: "media",
      count: (data || []).length,
      amostra: (data || []).slice(0, 5).map((a) => ({ codigo: a.codigo, titulo: a.titulo, criado_em: a.criado_em })),
      ok: (data || []).length === 0,
      comoAgir: "Verificar se admins receberam alertas via WhatsApp/Telegram. Investigar instancia ChatPro do admin. Marcar claims antigos como expirado manualmente se confirmado descarte.",
    };
  } catch (e: any) {
    return { nome: "INV-17", descricao: "claims_admin_pendentes_24h", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro" };
  }
}

// ============================================================
// PLUGIN IMUNI — exporta o conjunto de invariantes deste dominio
// no formato esperado pelo runner do core.
// ============================================================

export const pluginPegue: PluginImuni = {
  dominio: "pegue",
  invariantes: [
    // === BANCO (estado de dados) ===
    invCorridasConcluidasSemPagamento,
    invPrestadoresAprovadosSemPix,
    invPagamentosPagoSemTimestamp,
    invDispatchZumbi,
    invCorridasPagaSemProvaPagamento,
    invTarefasAgendadasAtrasadas,
    invOcorrenciasAbertasMuitoTempo,
    invRepassesAsaasPendentes,
    invCorridasPendentesMuitoTempo,
    invPlacasDuplicadasAtivas,
    invCorridasPagaSemRegistroPagamento,
    invClaimsAdminPendentesMuitoTempo,
    invCorridasCanceladasSemEstorno,
    invSessoesCadastroAbandonadas,
    invCobrancasDuplicadasEvitadas,
    // === INFRA (headers, env vars, configs externas) ===
    invHeaderGeolocationPermitido,
    invHeaderHsts,
    invHeaderCspProducao,
    invEnvVarsCriticas,
    invAsaasEmProducao,
  ],
};

// Compat: helper que roda o plugin Pegue. Mantem assinatura antiga
// pra nao quebrar callers existentes.
export async function executarTodasInvariantes(): Promise<ResultadoInvariante[]> {
  const { executarPlugin } = await import("@/lib/imuni/runner");
  return executarPlugin(pluginPegue);
}
