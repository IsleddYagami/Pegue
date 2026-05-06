// IMUNI plugin Pegue — checks de FLUXO DO PRESTADOR (Onda 5).
//
// 6/Mai/2026. Cobre o fluxo completo do PRESTADOR (fretista):
//   interesse → cadastro → aprovacao → disponivel → recebe ofertas →
//   aceita → executa → recebe repasse PIX → mantem score.
//
// Razao (Fabio): "ver fluxo completo dos prestadores de serviço
// começo meio e fim". Sem prestador funcionando, nenhum cliente eh
// atendido. Sentinelas anteriores cobriam o lado do CLIENTE — esta
// onda cobre o lado do FRETISTA.

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import type { ResultadoInvariante } from "@/lib/imuni/types";

function dAtras(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * INV-41 (ALTA): Prestador status='pendente' ha >5d. Aprovacao
 * travada — admin esqueceu de revisar OU prestador nao completou
 * algum requisito.
 *
 * Cenario alvo: prestador completou cadastro, esta esperando admin
 * aprovar. Sem aprovacao = nao recebe ofertas = perde o interesse e
 * vai pra concorrencia (Lalamove, 99 Frete).
 *
 * Severidade: ALTA. Cada prestador perdido = capacidade reduzida da
 * frota = clientes futuros sem fretista (INV-36 dispatch sem aceite
 * vai disparar mais).
 */
export async function invPrestadorAprovacaoTravada(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("prestadores")
      .select("id, telefone, nome, status, criado_em")
      .eq("status", "pendente")
      .lt("criado_em", dAtras(5))
      .gte("criado_em", dAtras(60));
    if (error) throw error;

    return {
      nome: "INV-41",
      descricao: "Prestadores com status='pendente' ha >5d (aprovacao travada)",
      severidade: "alta",
      count: data?.length || 0,
      amostra: (data || []).slice(0, 5).map((p) => ({
        nome: p.nome,
        telefone_masked: (p.telefone as string).replace(/\d(?=\d{4})/g, "*"),
        criado_em: p.criado_em,
        dias_pendente: Math.round((Date.now() - new Date(p.criado_em as string).getTime()) / (24 * 3600000)),
      })),
      ok: !data || data.length === 0,
      comoAgir:
        "Prestador esperando aprovacao ha mais de 5 dias. Acoes: 1) admin revisar cadastro em /admin/prestadores; 2) ligar pro fretista pra confirmar interesse e completar dados faltantes; 3) se requisitos nao atendidos, recusar formalmente (status='bloqueado') com mensagem de feedback. Ignorar = perder fretista pra concorrencia.",
    };
  } catch (e: any) {
    return { nome: "INV-41", descricao: "prestador_aprovacao_travada", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando prestadores" };
  }
}

/**
 * INV-42 (MEDIA): Prestador aprovado + disponivel ha >7d mas com
 * 0 corridas no periodo. Indica zonificacao ruim (frota concentrada
 * fora da regiao do fretista) ou prestador esquecido pelo dispatch.
 *
 * Cenario alvo: fretista cadastrado em Pompeia, mas Pegue so tem
 * demanda em Osasco. Frutista fica online, nunca recebe oferta,
 * desiste e some.
 *
 * Severidade: MEDIA. Indica problema estrutural (cobertura) que
 * exige expansao de marketing OU regiao de atuacao do prestador.
 */
export async function invPrestadorSemOfertas(): Promise<ResultadoInvariante> {
  try {
    const { data: prestadores, error: errP } = await supabase
      .from("prestadores")
      .select("id, telefone, nome, regiao_atuacao, criado_em")
      .eq("status", "aprovado")
      .eq("disponivel", true)
      .lt("criado_em", dAtras(7));
    if (errP) throw errP;
    if (!prestadores || prestadores.length === 0) {
      return { nome: "INV-42", descricao: "prestador_sem_ofertas", severidade: "media", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    // Pra cada prestador, contar corridas onde apareceu como prestador (aceita ou nao)
    // nos ultimos 7d. Se ZERO corridas, e suspeito.
    const violacoes: any[] = [];
    for (const p of prestadores) {
      const { count } = await supabase
        .from("corridas")
        .select("id", { count: "exact", head: true })
        .eq("prestador_id", p.id)
        .gte("criado_em", dAtras(7));
      if ((count || 0) === 0) {
        violacoes.push({
          nome: p.nome,
          telefone_masked: (p.telefone as string).replace(/\d(?=\d{4})/g, "*"),
          regiao: p.regiao_atuacao,
          dias_ativo: Math.round((Date.now() - new Date(p.criado_em as string).getTime()) / (24 * 3600000)),
        });
      }
    }

    return {
      nome: "INV-42",
      descricao: "Prestadores aprovados+disponiveis ha >7d sem nenhuma corrida no periodo",
      severidade: "media",
      count: violacoes.length,
      amostra: violacoes.slice(0, 5),
      ok: violacoes.length === 0,
      comoAgir:
        "Fretista online ha dias mas sem nunca receber oferta. Causas: 1) regiao de atuacao do fretista nao tem demanda (Osasco vs Sao Paulo); 2) bug em dispatch que ignora ele (regiao_atuacao mal cadastrada); 3) frota concentrada em outros fretistas mais proximos. ACAO: ligar pro fretista pra entender expectativas + revisar regiao + considerar marketing geo-targeted pra demanda na area dele.",
    };
  } catch (e: any) {
    return { nome: "INV-42", descricao: "prestador_sem_ofertas", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando prestadores+corridas" };
  }
}

/**
 * INV-43 (MEDIA): Prestador com score < 3.5 ainda ativo (status=aprovado
 * + disponivel=true). Score baixo indica qualidade ruim consistente —
 * cliente frustrado virando reclamante.
 *
 * Score default eh 5.0. Cair pra <3.5 exige varias avaliacoes ruins
 * consecutivas (algoritmo media ponderada).
 *
 * Excecoes legitimas: prestador com poucas corridas (volume insuficiente
 * pra score representar qualidade real). Filtro: total_corridas >= 5.
 *
 * Severidade: MEDIA. Sinal pra revisar — bloquear, treinar, ou separar
 * pra fretes menos sensiveis.
 */
export async function invPrestadorScoreBaixoAtivo(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("prestadores")
      .select("id, telefone, nome, score, total_corridas, total_reclamacoes")
      .eq("status", "aprovado")
      .eq("disponivel", true)
      .lt("score", 3.5)
      .gte("total_corridas", 5);
    if (error) throw error;

    return {
      nome: "INV-43",
      descricao: "Prestadores ativos com score < 3.5 e >=5 corridas (qualidade comprometida)",
      severidade: "media",
      count: data?.length || 0,
      amostra: (data || []).slice(0, 5).map((p: any) => ({
        nome: p.nome,
        telefone_masked: (p.telefone as string).replace(/\d(?=\d{4})/g, "*"),
        score: Number(p.score),
        total_corridas: p.total_corridas,
        total_reclamacoes: p.total_reclamacoes,
      })),
      ok: !data || data.length === 0,
      comoAgir:
        "Fretista com nota consistentemente baixa ainda ativo. Acoes: 1) revisar avaliacoes recentes (avaliacoes table) pra entender padrao de reclamacao; 2) ligar pro fretista pra dar feedback; 3) se padrao for sistematico (atraso, comportamento, qualidade), suspender (status='bloqueado'); 4) considerar 'modo treinamento' — fretes pequenos com supervisao admin antes de voltar a fluxo normal.",
    };
  } catch (e: any) {
    return { nome: "INV-43", descricao: "prestador_score_baixo_ativo", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando prestadores" };
  }
}

/**
 * INV-44 (ALTA): Prestador com taxa de reclamacoes alta (>= 20% das
 * corridas geraram reclamacao). Diferente de score (subjetivo), aqui
 * eh objetivo: ocorrencias formais.
 *
 * Severidade: ALTA. Reclamacao formal pode virar processo, chargeback
 * ou reputacao publica negativa.
 */
export async function invPrestadorAltaTaxaReclamacao(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("prestadores")
      .select("id, telefone, nome, total_corridas, total_reclamacoes, status")
      .eq("status", "aprovado")
      .gte("total_corridas", 5);
    if (error) throw error;

    const violacoes = (data || []).filter((p: any) => {
      const total = Number(p.total_corridas || 0);
      const reclamacoes = Number(p.total_reclamacoes || 0);
      if (total < 5) return false;
      return (reclamacoes / total) >= 0.2;
    });

    return {
      nome: "INV-44",
      descricao: "Prestadores ativos com >=20% das corridas geraram reclamacao formal",
      severidade: "alta",
      count: violacoes.length,
      amostra: violacoes.slice(0, 5).map((p: any) => ({
        nome: p.nome,
        telefone_masked: (p.telefone as string).replace(/\d(?=\d{4})/g, "*"),
        total_corridas: p.total_corridas,
        total_reclamacoes: p.total_reclamacoes,
        taxa: `${Math.round((p.total_reclamacoes / p.total_corridas) * 100)}%`,
      })),
      ok: violacoes.length === 0,
      comoAgir:
        "Fretista com 1 reclamacao a cada 5 corridas (ou pior). Risco juridico/reputacional alto. ACAO: 1) revisar TODAS as ocorrencias formais desse fretista; 2) suspender preventivamente (status='bloqueado') ate avaliar; 3) marcar pra nunca aceitar fretes de carga sensivel/longo curso; 4) considerar bloqueio definitivo se padrao for cronico.",
    };
  } catch (e: any) {
    return { nome: "INV-44", descricao: "prestador_alta_taxa_reclamacao", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando prestadores" };
  }
}

/**
 * INV-45 (ALTA): Prestador aceitou frete e CANCELOU >=3x na ultima
 * semana. Indica fretista instavel — aceita pra "guardar" e cancela
 * quando aparece servico melhor. Cliente paga e fica sem frete.
 *
 * Cruzamento: corridas com prestador_id setado E status='cancelada'
 * agrupadas por prestador.
 *
 * Severidade: ALTA. Cada cancelamento pos-aceite = cliente pagando
 * e ninguem indo (INV-34). Repetido = padrao de mau comportamento.
 */
export async function invPrestadorCancelamentosRepetidos(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("corridas")
      .select("prestador_id, codigo, status, atualizado_em")
      .eq("status", "cancelada")
      .not("prestador_id", "is", null)
      .gte("atualizado_em", dAtras(7));
    if (error) throw error;
    if (!data || data.length === 0) {
      return { nome: "INV-45", descricao: "prestador_cancelamentos_repetidos", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    // Agrupa por prestador_id
    const porPrestador = new Map<string, number>();
    for (const c of data) {
      const id = c.prestador_id as string;
      porPrestador.set(id, (porPrestador.get(id) || 0) + 1);
    }

    const reincidentes = Array.from(porPrestador.entries()).filter(([, count]) => count >= 3);
    if (reincidentes.length === 0) {
      return { nome: "INV-45", descricao: "prestador_cancelamentos_repetidos", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    // Busca nome dos prestadores
    const ids = reincidentes.map(([id]) => id);
    const { data: prestadores } = await supabase
      .from("prestadores")
      .select("id, telefone, nome")
      .in("id", ids);

    const nomePorId = new Map((prestadores || []).map((p: any) => [p.id, { nome: p.nome, tel: (p.telefone as string).replace(/\d(?=\d{4})/g, "*") }]));

    return {
      nome: "INV-45",
      descricao: "Prestadores com >=3 cancelamentos pos-aceite na ultima semana",
      severidade: "alta",
      count: reincidentes.length,
      amostra: reincidentes.slice(0, 5).map(([id, count]) => ({
        prestador_id: id,
        nome: nomePorId.get(id)?.nome || "(desconhecido)",
        telefone_masked: nomePorId.get(id)?.tel || "?",
        cancelamentos_7d: count,
      })),
      ok: false,
      comoAgir:
        "Fretista que aceita e depois cancela repetidamente. Comportamento prejudicial: cliente pagou, ficou esperando, frustrado. ACAO: 1) ligar pro fretista pra entender padrao; 2) se for tatica de 'reservar enquanto procura algo melhor', bloquear preventivamente; 3) impor cooldown automatico (apos 1 cancelamento pos-aceite, suspender 24h); 4) score deveria cair por isso — auditar algoritmo de score.",
    };
  } catch (e: any) {
    return { nome: "INV-45", descricao: "prestador_cancelamentos_repetidos", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando corridas+prestadores" };
  }
}
