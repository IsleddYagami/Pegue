// IMUNI plugin Pegue — checks de FLUXO DE ATENDIMENTO (porta de entrada).
//
// Categoria adicionada 5/Mai/2026 (Onda 3 do refino IMUNI).
// Razao: o cliente real 5511953731463 e 5519983355000 travaram no fluxo
// de atendimento ANTES de chegar na cotacao. As 27 sentinelas anteriores
// olhavam estado financeiro (corridas, pagamentos, repasses) — todas
// ignoraram porque cliente nunca chegou ao banco financeiro pra deixar
// rastro. Ficou claro que "comeco-meio-fim" exige sentinelas pra cada
// estagio do funil, nao soh pra finanças.
//
// O que essas sentinelas atacam:
//   - Bot atropelando atendimento humano (admin assumiu, bot reativou)
//   - Conversas perdidas (bot_logs ativos mas conversas_whatsapp vazia)
//   - Cliente preso em coleta de dados (origem/destino/material) >30min
//   - Origem nao identificada repetida sem cliente ser escalado
//
// Filosofia: cada sentinela mira um padrao de FALHA OBSERVADA em prod.
// Cada bug visto vira invariante quando aplicavel — regra inegociavel
// (feedback_aprendizado_constante.md).

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import type { ResultadoInvariante } from "@/lib/imuni/types";

const HORAS_24 = 24 * 60 * 60 * 1000;

function hAtras(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

function maskPhone(phone: string): string {
  return phone.replace(/\d(?=\d{4})/g, "*");
}

// Tipos de bot_log que indicam o BOT processou ATIVAMENTE uma mensagem
// (em oposicao a logs passivos como webhook_chatpro_event ou
// msg_em_atendimento_humano que sao apenas registros).
const TIPOS_BOT_PROCESSANDO = [
  "servico_escolhido",
  "origem_nao_identificada",
  "contexto_extraido_inicial",
  "ia_contexto_falhou",
  "custo_estimado_ia",
  "ia_contexto_rate_limit_excedido",
];

// Steps em que o bot esta COLETANDO dados do cliente (pre-cotacao).
// Cliente preso aqui >30min = bot travou ou cliente desistiu sem aviso.
const STEPS_COLETA_DADOS = [
  "aguardando_servico",
  "aguardando_localizacao",
  "aguardando_destino",
  "confirmar_origem",
  "confirmar_destino",
  "confirmar_contexto_inicial",
  "guincho_categoria",
  "guincho_localizacao",
  "guincho_destino",
];

/**
 * INV-28 (CRITICA): Bot processou mensagem do cliente DEPOIS dele entrar
 * em atendimento_humano. Atropelo do admin: 2 vozes falando com o cliente
 * pelo whatsapp.
 *
 * Cenario alvo: caso real 5/Mai/2026. Jack assumiu cliente 5511953731463
 * pelo Pegue 2 (step=atendimento_humano). Cliente mandou "oi" pelo Pegue 1.
 * Webhook do Pegue 1 entrou no fluxo de saudacao, recriou sessao
 * (createSession upsert sobrescreveu step), bot mandou menu de novo.
 * Jack falando + bot do Pegue 1 falando = experiencia caotica.
 *
 * Detecta: bot_logs com tipos "bot processando" cujo phone esta AGORA em
 * step=atendimento_humano E o log eh POSTERIOR ao atualizado_em da
 * sessao (cobertura do periodo em que sessao ja estava em atendimento).
 *
 * Severidade: CRITICA. Atropelo de admin viola regra basica de UX.
 */
export async function invBotAtropelandoAtendimentoHumano(): Promise<ResultadoInvariante> {
  try {
    // 1. Pega sessoes em atendimento_humano (universo a verificar)
    const { data: sessoes, error: errSes } = await supabase
      .from("bot_sessions")
      .select("phone, atualizado_em, instance_chatpro")
      .eq("step", "atendimento_humano")
      .gte("atualizado_em", hAtras(24));
    if (errSes) throw errSes;
    if (!sessoes || sessoes.length === 0) {
      return { nome: "INV-28", descricao: "bot_atropelando_atendimento_humano", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    // 2. Pra cada sessao, busca bot_logs do BOT processando posterior a atualizado_em
    const violacoes: any[] = [];
    for (const ses of sessoes) {
      const phone = ses.phone as string;
      const desdeSession = ses.atualizado_em as string;

      // Filtro JSONB: payload->>phone OU payload->>phone_masked
      const phoneMasked = maskPhone(phone);
      const orFilter = TIPOS_BOT_PROCESSANDO
        .map((t) => `payload->>tipo.eq.${t}`)
        .join(",");

      const { data: logs } = await supabase
        .from("bot_logs")
        .select("id, criado_em, payload")
        .or(orFilter)
        .gte("criado_em", desdeSession)
        .order("criado_em", { ascending: false })
        .limit(20);

      const logsDoCliente = (logs || []).filter((l) => {
        const p = (l.payload as any) || {};
        return p.phone === phone || p.phone_masked === phoneMasked;
      });

      if (logsDoCliente.length > 0) {
        violacoes.push({
          phone_masked: phoneMasked,
          atualizado_em: desdeSession,
          instance: ses.instance_chatpro,
          logs_atropelo: logsDoCliente.length,
          tipos: Array.from(new Set(logsDoCliente.map((l) => (l.payload as any)?.tipo))),
        });
      }
    }

    return {
      nome: "INV-28",
      descricao: "Bot processou msg de cliente em atendimento_humano (atropelo de admin)",
      severidade: "alta",
      count: violacoes.length,
      amostra: violacoes.slice(0, 5),
      ok: violacoes.length === 0,
      comoAgir:
        "Cliente em atendimento_humano teve mensagem processada pelo bot — admin foi atropelado. Investigar: 1) gate em handleClienteMessage falhou? (ver commit ab96ce4); 2) outro caminho de createSession sem checagem? (cadastro_prestador, repetir, parcerias_pegue); 3) FromMe nao detectou e veio do proprio admin?. Verificar bot_logs do phone afetado pra reconstruir timeline.",
    };
  } catch (e: any) {
    return { nome: "INV-28", descricao: "bot_atropelando_atendimento_humano", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando bot_sessions+bot_logs" };
  }
}

/**
 * INV-29 (ALTA): Phone com bot_sessions ativa + msgs_contador > 5 mas
 * ZERO registros em conversas_whatsapp. Indica bug de armazenamento:
 * historico de conversa sendo perdido silenciosamente.
 *
 * Cenario alvo: 5/Mai/2026. Clientes 5511953731463 e 5519983355000
 * conversaram >50 mensagens cada e a tabela conversas_whatsapp ficou
 * VAZIA pros dois. Bot_logs registraram (com mascara), mas o conteudo
 * literal das mensagens sumiu. Viola feedback_armazenamento_inegociavel
 * (LGPD/auditoria).
 *
 * Severidade: ALTA. Perda silenciosa de dados que existem em outras
 * tabelas-prova mas nao na canonica.
 */
export async function invConversasWhatsappVazia(): Promise<ResultadoInvariante> {
  try {
    // 1. Sessoes ativas com volume razoavel de msgs
    const { data: sessoes, error: errSes } = await supabase
      .from("bot_sessions")
      .select("phone, msgs_contador, atualizado_em")
      .gte("msgs_contador", 5)
      .gte("atualizado_em", hAtras(24 * 7)); // ultimos 7d
    if (errSes) throw errSes;
    if (!sessoes || sessoes.length === 0) {
      return { nome: "INV-29", descricao: "conversas_whatsapp_vazia", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    // 2. Pra cada uma, contar conversas_whatsapp existentes
    const violacoes: any[] = [];
    for (const ses of sessoes) {
      const { count } = await supabase
        .from("conversas_whatsapp")
        .select("id", { count: "exact", head: true })
        .eq("telefone", ses.phone);
      if (!count || count === 0) {
        violacoes.push({
          phone_masked: maskPhone(ses.phone as string),
          msgs_contador: ses.msgs_contador,
          atualizado_em: ses.atualizado_em,
          conversas_whatsapp_count: 0,
        });
      }
    }

    return {
      nome: "INV-29",
      descricao: "Sessoes com >5 msgs e ZERO conversas_whatsapp (perda silenciosa de historico)",
      severidade: "alta",
      count: violacoes.length,
      amostra: violacoes.slice(0, 5),
      ok: violacoes.length === 0,
      comoAgir:
        "Bot esta conversando com cliente mas conversas_whatsapp NAO esta sendo populada. Investigar: 1) handler do webhook esta inserindo em conversas_whatsapp em CADA msg recebida/enviada?; 2) RLS/policies bloqueando insert?; 3) coluna telefone com formato divergente entre tabelas (com/sem 55)?. Risco LGPD: nao temos prova canonica do que cliente disse / o que respondemos.",
    };
  } catch (e: any) {
    return { nome: "INV-29", descricao: "conversas_whatsapp_vazia", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando bot_sessions+conversas_whatsapp" };
  }
}

/**
 * INV-30 (MEDIA): Cliente preso em step de COLETA DE DADOS por mais de
 * 30min. Bot deveria ter avancado, escalado ou expirado a sessao.
 *
 * Cenario alvo: cliente entrou no fluxo, deu localizacao/destino, mas
 * algum step travou (foto nao chegou, mensagem perdida, IA falhou em
 * silencio). Sessao fica zumbi consumindo memoria do operador.
 *
 * Steps cobertos: aguardando_servico, aguardando_localizacao,
 * aguardando_destino, confirmar_origem, confirmar_destino,
 * confirmar_contexto_inicial, guincho_categoria, guincho_localizacao,
 * guincho_destino.
 *
 * Severidade: media. Geralmente cliente desistiu silenciosamente.
 * Admin pode chamar pra retomar OU sistema pode expirar.
 */
export async function invClientePresoEmColeta(): Promise<ResultadoInvariante> {
  try {
    const min30AtrasIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const horas24AtrasIso = hAtras(24);

    const { data: sessoes, error } = await supabase
      .from("bot_sessions")
      .select("phone, step, atualizado_em")
      .in("step", STEPS_COLETA_DADOS)
      .lt("atualizado_em", min30AtrasIso)
      .gte("atualizado_em", horas24AtrasIso); // janela razoavel — alem disso vira lixo
    if (error) throw error;

    return {
      nome: "INV-30",
      descricao: "Sessoes presas em step de coleta de dados >30min nas ultimas 24h",
      severidade: "media",
      count: sessoes?.length || 0,
      amostra: (sessoes || []).slice(0, 5).map((s) => ({
        phone_masked: maskPhone(s.phone as string),
        step: s.step,
        atualizado_em: s.atualizado_em,
        minutos_preso: Math.round((Date.now() - new Date(s.atualizado_em as string).getTime()) / 60000),
      })),
      ok: !sessoes || sessoes.length === 0,
      comoAgir:
        "Cliente parou no meio do fluxo sem terminar cotacao. Acoes: 1) chamar manualmente pelo whatsapp pra retomar (pode ter desistido por dificuldade UX); 2) revisar mensagens da etapa pra ver se sao confusas; 3) avaliar se precisa cron de expiracao automatica + msg de retorno; 4) se virou padrao em algum step especifico, e bug de UX desse step.",
    };
  } catch (e: any) {
    return { nome: "INV-30", descricao: "cliente_preso_em_coleta", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando bot_sessions" };
  }
}

/**
 * INV-31 (ALTA): Cliente teve >=2 origem_nao_identificada em 24h e a
 * sessao NAO esta em atendimento_humano nem concluido. Bug de
 * escalation: webhook deveria ter movido pra atendimento_humano apos
 * 1+ falha (ja existe codigo na linha ~2110), mas algo desfez (saudacao
 * recriou sessao? cliente fez VOLTA IRIS por engano?).
 *
 * Cenario alvo: caso real 5/Mai/2026. Cliente 5511953731463 teve 3
 * `origem_nao_identificada` (2 instance 2 + 1 instance 1) e em algum
 * momento o bot continuou ativo apos as falhas — atropelo via saudacao.
 *
 * Severidade: alta. Cliente ficando preso em loop sem admin saber.
 */
export async function invOrigemNaoIdentificadaSemEscalation(): Promise<ResultadoInvariante> {
  try {
    // 1. Agrupa origem_nao_identificada das ultimas 24h por phone_masked
    const { data: logs, error } = await supabase
      .from("bot_logs")
      .select("payload, criado_em")
      .filter("payload->>tipo", "eq", "origem_nao_identificada")
      .gte("criado_em", hAtras(24))
      .order("criado_em", { ascending: false });
    if (error) throw error;

    const porMask = new Map<string, number>();
    for (const log of logs || []) {
      const mask = (log.payload as any)?.phone_masked;
      if (!mask) continue;
      porMask.set(mask, (porMask.get(mask) || 0) + 1);
    }

    const reincidentes = Array.from(porMask.entries()).filter(([, count]) => count >= 2);
    if (reincidentes.length === 0) {
      return { nome: "INV-31", descricao: "origem_nao_identificada_sem_escalation", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    // 2. Pra cada reincidente, ver se sessao esta em atendimento_humano OU concluido
    // (estados que indicam escalation feita ou cliente saiu do fluxo).
    // Como o phone esta MASCARADO, busco bot_sessions e mascaro pra cruzar.
    const { data: sessoes } = await supabase
      .from("bot_sessions")
      .select("phone, step")
      .gte("atualizado_em", hAtras(24));

    const stepPorMask = new Map<string, string>();
    for (const s of sessoes || []) {
      stepPorMask.set(maskPhone(s.phone as string), s.step as string);
    }

    const ESTADOS_OK = ["atendimento_humano", "concluido"];
    const violacoes = reincidentes
      .map(([mask, count]) => ({
        phone_masked: mask,
        falhas_24h: count,
        step_atual: stepPorMask.get(mask) || "(sessao nao encontrada)",
      }))
      .filter((v) => !ESTADOS_OK.includes(v.step_atual));

    return {
      nome: "INV-31",
      descricao: "Cliente com >=2 origem_nao_identificada em 24h sem escalar pra humano",
      severidade: "alta",
      count: violacoes.length,
      amostra: violacoes.slice(0, 5),
      ok: violacoes.length === 0,
      comoAgir:
        "Cliente travado em coleta de origem (ja falhou >=2x) mas bot NAO escalou pra atendimento humano. Verificar: 1) webhook escalou (linha ~2110) e algo reverteu o step?; 2) saudacao recriou sessao em aguardando_servico (bug ja corrigido em ab96ce4 — re-verificar deploy)?; 3) cliente fez VOLTA IRIS sem terminar?. Acao imediata: chamar cliente manualmente.",
    };
  } catch (e: any) {
    return { nome: "INV-31", descricao: "origem_nao_identificada_sem_escalation", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando bot_logs+bot_sessions" };
  }
}
