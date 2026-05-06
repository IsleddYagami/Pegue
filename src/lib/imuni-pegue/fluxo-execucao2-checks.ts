// IMUNI plugin Pegue — checks de FLUXO DE EXECUCAO PARTE 2
// (dispatch + coleta + transito + entrega + avaliacao).
//
// Onda 4b — 5/Mai/2026. Continua a cobertura iniciada em Onda 4a
// (cotacao → cobranca → pagamento). Aqui foca os estagios FISICOS
// do servico: fretista vai, coleta, leva, entrega, cliente avalia.
//
// Razao: cliente pode estar pagando e o fluxo fisico travar
// silenciosamente. Cada estagio que falha sem alerta = cliente
// frustrado + reputacao da marca afetada.

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import type { ResultadoInvariante } from "@/lib/imuni/types";

function hAtras(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

function minAtras(minutos: number): string {
  return new Date(Date.now() - minutos * 60 * 1000).toISOString();
}

/**
 * INV-36 (CRITICA): Dispatch encerrado SEM aceite (todos os fretistas
 * notificados ignoraram OU ninguem foi notificado por bug).
 *
 * Cenario alvo: cliente pagou, sistema notificou N fretistas, todos
 * ignoraram OU nao havia fretista disponivel na regiao. Cliente fica
 * pagando e ninguem foi.
 *
 * Cruzamento: corridas com dispatch_finalizado_em mas vencedor_phone=NULL.
 * Diferente de INV-4 (dispatch zumbi ainda ativo): aqui o dispatch JA
 * encerrou sem ninguem aceitar.
 *
 * Severidade: CRITICA. Cliente pagou e ninguem assumiu o frete.
 */
export async function invDispatchEncerradoSemAceite(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("corridas")
      .select("id, codigo, status, prestador_id, dispatch_ativo, dispatch_finalizado_em, valor_final, atualizado_em")
      .eq("status", "paga")
      .is("prestador_id", null)
      .eq("dispatch_ativo", false)
      .not("dispatch_finalizado_em", "is", null)
      .gte("dispatch_finalizado_em", hAtras(48));
    if (error) throw error;

    return {
      nome: "INV-36",
      descricao: "Corridas pagas com dispatch encerrado sem nenhum fretista aceitar (ninguem foi)",
      severidade: "alta",
      count: data?.length || 0,
      amostra: (data || []).slice(0, 5).map((c: any) => ({
        codigo: c.codigo,
        valor_final: Number(c.valor_final),
        dispatch_finalizado_em: c.dispatch_finalizado_em,
        horas_sem_fretista: Math.round((Date.now() - new Date(c.dispatch_finalizado_em).getTime()) / 3600000),
      })),
      ok: !data || data.length === 0,
      comoAgir:
        "Cliente pagou e dispatch terminou sem ninguem aceitar. Causas: 1) zero fretistas na regiao naquele horario; 2) fretistas viram a oferta mas valor baixo demais; 3) regiao indesejada (interior, periferia perigosa); 4) bug no createDispatch nao notificou ninguem. ACAO: estornar cliente AUTOMATICAMENTE (cron) E reengajar admin pra cotar manualmente. Adicionar canal de fretista emergencial (admin ligando direto).",
    };
  } catch (e: any) {
    return { nome: "INV-36", descricao: "dispatch_encerrado_sem_aceite", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando corridas" };
  }
}

/**
 * INV-37 (ALTA): Coleta concluida (corrida saiu de 'aceita' pra 'paga'->'em_andamento'
 * ou avancou) mas SEM foto de prova em provas_digitais (tipo='coleta').
 *
 * Cenario alvo: fretista digitou PRONTO/COLETEI mas nao mandou foto, OU
 * upload da foto falhou silenciosamente. Sem prova digital = sem prova
 * juridica em caso de divergencia.
 *
 * Viola feedback_armazenamento_inegociavel.md: "fotos da Jack nao foram
 * salvas porque sessao dela nao estava em fretista_coleta_fotos no momento".
 *
 * Severidade: ALTA. LGPD/auditoria + risco de reclamacao sem defesa.
 */
export async function invColetaSemProvaDigital(): Promise<ResultadoInvariante> {
  try {
    // Corridas que ja passaram da fase de coleta (status concluida ha 1d a 30d)
    const { data: corridas, error: errC } = await supabase
      .from("corridas")
      .select("id, codigo, status, atualizado_em")
      .eq("status", "concluida")
      .gte("atualizado_em", hAtras(24 * 30))
      .lt("atualizado_em", hAtras(1)); // dar 1h de janela pra upload async chegar
    if (errC) throw errC;
    if (!corridas || corridas.length === 0) {
      return { nome: "INV-37", descricao: "coleta_sem_prova_digital", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    const ids = corridas.map((c) => c.id);
    const { data: provas } = await supabase
      .from("provas_digitais")
      .select("corrida_id, tipo")
      .in("corrida_id", ids)
      .eq("tipo", "coleta");

    const idsComProva = new Set((provas || []).map((p: any) => p.corrida_id));
    const semProva = corridas.filter((c) => !idsComProva.has(c.id));

    return {
      nome: "INV-37",
      descricao: "Corridas concluidas (1d a 30d) sem prova_digital tipo='coleta' (foto nao salvou)",
      severidade: "alta",
      count: semProva.length,
      amostra: semProva.slice(0, 5).map((c) => ({
        codigo: c.codigo,
        atualizado_em: c.atualizado_em,
      })),
      ok: semProva.length === 0,
      comoAgir:
        "Frete concluido sem foto de coleta salva. Causas: 1) fretista digitou PRONTO mas nao mandou foto; 2) upload Storage falhou e bot nao percebeu; 3) bug de step (sessao nao estava em fretista_coleta_fotos). Auditar handleFretistFotos. Em caso real: cliente abre disputa = nao temos prova de que coletou. Recomendado refazer com fretista pra colher relato + foto retroativa, OU debitar do score do fretista.",
    };
  } catch (e: any) {
    return { nome: "INV-37", descricao: "coleta_sem_prova_digital", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando corridas+provas_digitais" };
  }
}

/**
 * INV-38 (MEDIA): Corrida em andamento (status='aceita', dispatch
 * finalizado, fretista deveria estar a caminho) sem update de GPS
 * em rastreio_localizacoes nos ultimos 15min.
 *
 * Cenario alvo: fretista aceitou, abriu link de rastreio, mas o GPS
 * dele parou de enviar (tela travada, app saiu, sinal caiu, ou pior:
 * fretista nao esta seguindo). Cliente vendo mapa parado = ansiedade.
 *
 * Excecoes: dispatch acabou de finalizar (<5min — fretista pode ainda
 * nao ter aberto o link).
 *
 * Severidade: media. Pode ser tecnico legitimo (sinal ruim periferia).
 */
export async function invRastreioGpsParado(): Promise<ResultadoInvariante> {
  try {
    // Corridas aceitas (em transito) ha mais de 5min mas menos de 4h
    const { data: corridas, error } = await supabase
      .from("corridas")
      .select("id, codigo, status, atualizado_em, dispatch_finalizado_em")
      .eq("status", "aceita")
      .lt("atualizado_em", minAtras(5))
      .gte("atualizado_em", hAtras(4));
    if (error) throw error;
    if (!corridas || corridas.length === 0) {
      return { nome: "INV-38", descricao: "rastreio_gps_parado", severidade: "media", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    // Pra cada corrida, ver se ha update de rastreio nos ultimos 15min
    const violacoes: any[] = [];
    for (const c of corridas) {
      const { data: ultimoGps } = await supabase
        .from("rastreio_localizacoes")
        .select("criado_em")
        .eq("corrida_id", c.id)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      const semGpsRecente =
        !ultimoGps ||
        new Date(ultimoGps.criado_em as string).getTime() < Date.now() - 15 * 60 * 1000;

      if (semGpsRecente) {
        violacoes.push({
          codigo: c.codigo,
          atualizado_em: c.atualizado_em,
          ultimo_gps: ultimoGps?.criado_em || "(nunca recebeu GPS)",
        });
      }
    }

    return {
      nome: "INV-38",
      descricao: "Corridas em andamento sem update GPS >15min (fretista perdido?)",
      severidade: "media",
      count: violacoes.length,
      amostra: violacoes.slice(0, 5),
      ok: violacoes.length === 0,
      comoAgir:
        "Fretista aceito mas GPS parou de atualizar. Causas: 1) fretista fechou pagina de rastreio; 2) sinal ruim (periferia/tunel); 3) celular sem bateria; 4) fretista nao esta seguindo (preocupante). ACAO: ligar pro fretista pra confirmar status. Se nao responder, alertar cliente + enviar segundo fretista. Sistema poderia: alerta automatico ao cliente apos 20min sem GPS pra dar transparencia.",
    };
  } catch (e: any) {
    return { nome: "INV-38", descricao: "rastreio_gps_parado", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando corridas+rastreio_localizacoes" };
  }
}

/**
 * INV-39 (ALTA): Corrida concluida SEM foto de prova de entrega.
 * Mesmo padrao da INV-37 mas pro lado da entrega.
 *
 * Cenario alvo: fretista digitou ENTREGUEI mas foto nao foi salva.
 * Sem prova juridica de entrega = se cliente alegar que nao recebeu,
 * sem defesa.
 */
export async function invEntregaSemProvaDigital(): Promise<ResultadoInvariante> {
  try {
    const { data: corridas, error: errC } = await supabase
      .from("corridas")
      .select("id, codigo, status, atualizado_em")
      .eq("status", "concluida")
      .gte("atualizado_em", hAtras(24 * 30))
      .lt("atualizado_em", hAtras(1));
    if (errC) throw errC;
    if (!corridas || corridas.length === 0) {
      return { nome: "INV-39", descricao: "entrega_sem_prova_digital", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    const ids = corridas.map((c) => c.id);
    const { data: provas } = await supabase
      .from("provas_digitais")
      .select("corrida_id, tipo")
      .in("corrida_id", ids)
      .eq("tipo", "entrega");

    const idsComProva = new Set((provas || []).map((p: any) => p.corrida_id));
    const semProva = corridas.filter((c) => !idsComProva.has(c.id));

    return {
      nome: "INV-39",
      descricao: "Corridas concluidas (1d a 30d) sem prova_digital tipo='entrega' (foto nao salvou)",
      severidade: "alta",
      count: semProva.length,
      amostra: semProva.slice(0, 5).map((c) => ({
        codigo: c.codigo,
        atualizado_em: c.atualizado_em,
      })),
      ok: semProva.length === 0,
      comoAgir:
        "Frete concluido sem foto de entrega. Mesmas causas/acoes da INV-37 (coleta). Pior em entrega: se cliente alegar 'nao recebi' nao temos prova alguma. Investigar handleFretistFotos pra step fretista_entrega_fotos.",
    };
  } catch (e: any) {
    return { nome: "INV-39", descricao: "entrega_sem_prova_digital", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando corridas+provas_digitais" };
  }
}

/**
 * INV-40 (MEDIA): Corrida concluida ha >24h mas SEM avaliacao do
 * cliente. Bot deveria pedir avaliacao logo apos confirmar entrega.
 *
 * Cenario alvo: bot esqueceu de pedir avaliacao OU cliente ignorou.
 * Sem feedback = sistema nao aprende, score do fretista nao reflete
 * realidade, IMUNI APRENDIZADO CONSTANTE perde insumo.
 *
 * Severidade: media. Cada avaliacao perdida = 1 ponto de melhoria
 * que nao foi capturado.
 */
export async function invConcluidaSemAvaliacao(): Promise<ResultadoInvariante> {
  try {
    const { data: corridas, error: errC } = await supabase
      .from("corridas")
      .select("id, codigo, atualizado_em")
      .eq("status", "concluida")
      .gte("atualizado_em", hAtras(24 * 14)) // ult 14d
      .lt("atualizado_em", hAtras(24)); // pelo menos 24h pra dar tempo de avaliar
    if (errC) throw errC;
    if (!corridas || corridas.length === 0) {
      return { nome: "INV-40", descricao: "concluida_sem_avaliacao", severidade: "media", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    const ids = corridas.map((c) => c.id);
    const { data: avaliacoes } = await supabase
      .from("avaliacoes")
      .select("corrida_id")
      .in("corrida_id", ids);

    const idsAvaliadas = new Set((avaliacoes || []).map((a: any) => a.corrida_id));
    const semAvaliacao = corridas.filter((c) => !idsAvaliadas.has(c.id));

    return {
      nome: "INV-40",
      descricao: "Corridas concluidas (1-14d) sem avaliacao do cliente",
      severidade: "media",
      count: semAvaliacao.length,
      amostra: semAvaliacao.slice(0, 5).map((c) => ({
        codigo: c.codigo,
        atualizado_em: c.atualizado_em,
        dias_sem_avaliar: Math.round((Date.now() - new Date(c.atualizado_em as string).getTime()) / (24 * 3600000)),
      })),
      ok: semAvaliacao.length === 0,
      comoAgir:
        "Cliente nao avaliou frete concluido. Causas: 1) bot nao pediu avaliacao apos ENTREGUEI; 2) bot pediu mas cliente ignorou (UX da pergunta confusa?); 3) cliente avaliou em outro lugar. ACAO: enviar push manual pedindo avaliacao 1d apos entrega pras concluidas sem nota. Reformular mensagem de pedido de avaliacao se taxa de resposta <30%.",
    };
  } catch (e: any) {
    return { nome: "INV-40", descricao: "concluida_sem_avaliacao", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando corridas+avaliacoes" };
  }
}
