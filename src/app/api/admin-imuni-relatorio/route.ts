import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey, isValidCronKey } from "@/lib/admin-auth";
import {
  promptDeFalhaSmokeStep,
  promptDeClienteTravado,
  promptDeHandlerError,
} from "@/lib/imuni-prompt-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Endpoint que agrega TODOS os problemas detectados pelo IMUNI nas ultimas
// 6h e devolve, pra cada um, um PROMPT PRONTO PRA COLAR PRO CLAUDE.
//
// Uso (GET): ?key=ADMIN_KEY_OR_CRON_SECRET
// POST tambem aceito (mesmo comportamento).
//
// Modo notificar=1: dispara WhatsApp pros admins com cada prompt em
// mensagens separadas (um problema = uma mensagem). Usado por cron.
//
// Filosofia: IMUNI nao apenas DETECTA — descreve o erro de forma copy-paste-friendly
// pra Fabio levar pro Claude sem precisar pensar.
export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

interface Problema {
  tipo: string;
  severidade: "alta" | "media" | "baixa";
  detectado_em: string;
  resumo: string;
  prompt_para_claude: string;
}

// Hash determinístico do problema pra dedup. Mesmo bug detectado varias
// vezes seguidas vira UM hash — notifica 1 vez, depois respeita janela.
function hashDoProblema(p: Problema): string {
  if (p.tipo === "smoke_falhou") {
    const m = p.resumo.match(/step `([^`]+)`/);
    return `smoke_${m?.[1] || "unknown"}`;
  }
  if (p.tipo === "cliente_travado") {
    const m = p.resumo.match(/Cliente (\d+)/);
    return `travado_${m?.[1] || "unknown"}`;
  }
  if (p.tipo === "webhook_handler_error_cluster") {
    return "handler_error_cluster";
  }
  return `${p.tipo}_${p.detectado_em.slice(0, 13)}`;
}

async function jaNotificouRecente(hash: string, janelaHoras: number = 6): Promise<boolean> {
  const limite = new Date(Date.now() - janelaHoras * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("bot_logs")
    .select("id")
    .filter("payload->>tipo", "eq", "imuni_notificacao_enviada")
    .filter("payload->>hash", "eq", hash)
    .gte("criado_em", limite)
    .limit(1);
  return (data?.length || 0) > 0;
}

async function registrarNotificacao(hash: string, problema: Problema): Promise<void> {
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "imuni_notificacao_enviada",
      hash,
      problema_tipo: problema.tipo,
      resumo: problema.resumo.slice(0, 200),
    },
  });
}

// Janela de dedup: nao re-notifica o mesmo problema (mesmo hash) por essas horas.
// 6h = razoavel: cron roda a cada 30min, janela de problemas = 2h. Significa que
// um problema persistente vai gerar 1 notificacao a cada 6h em vez de 12.
const DEDUP_JANELA_HORAS = 6;

// Maximo de notificacoes por execucao do relatorio (pra evitar flood mesmo
// quando ha muitos problemas NOVOS de uma vez, ex: deploy ruim que quebrou
// 10 steps do smoke).
const MAX_NOTIFICACOES_POR_RUN = 5;

async function handle(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidAdminKey(key) && !isValidCronKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const notificar = req.nextUrl.searchParams.get("notificar") === "1";
  const janelaHoras = Number(req.nextUrl.searchParams.get("janela_horas") || "6");
  const inicioJanela = new Date(Date.now() - janelaHoras * 3600 * 1000).toISOString();

  const problemas: Problema[] = [];

  // ============ 1) SMOKE E2E FALHOU ============
  // FILTRO TEMPORAL (7/Mai/2026 — pedido Fabio): smoke falha so vira
  // problema ATIVO se NAO houver smoke verde mais recente. Caso contrario,
  // significa que o bug ja foi corrigido e o smoke seguinte passou.
  // Sem isso, cada deploy fix gera notificacao fantasma pelo backlog.
  const { data: ultimoSmokeOk } = await supabase
    .from("bot_logs")
    .select("criado_em")
    .filter("payload->>tipo", "eq", "imuni_smoke_e2e_ok")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const corteFalhas = ultimoSmokeOk?.criado_em || inicioJanela;

  const { data: smokeFalhas } = await supabase
    .from("bot_logs")
    .select("payload, criado_em")
    .filter("payload->>tipo", "eq", "imuni_smoke_e2e_falhou")
    .gte("criado_em", corteFalhas)
    .order("criado_em", { ascending: false })
    .limit(5);

  for (const log of smokeFalhas || []) {
    const payload = log.payload as Record<string, unknown>;
    const detalhes = payload.detalhes as Array<{
      step: string;
      ok: boolean;
      esperado?: string;
      obtido?: string;
      webhook_status?: number;
      webhook_resposta?: unknown;
      erro?: string;
    }> | undefined;
    const stepFalhou = detalhes?.find((s) => !s.ok);
    if (!stepFalhou) continue;

    // Pega bot_logs do phone smoke (5500000000001) ao redor da falha
    const tsFalha = new Date(log.criado_em);
    const inicioLogs = new Date(tsFalha.getTime() - 60_000).toISOString();
    const fimLogs = new Date(tsFalha.getTime() + 60_000).toISOString();
    const { data: logsRelevantes } = await supabase
      .from("bot_logs")
      .select("payload, criado_em")
      .filter("payload->>phone", "eq", "5500000000001")
      .gte("criado_em", inicioLogs)
      .lte("criado_em", fimLogs)
      .order("criado_em", { ascending: false })
      .limit(10);

    problemas.push({
      tipo: "smoke_falhou",
      severidade: "alta",
      detectado_em: log.criado_em,
      resumo: `Smoke step \`${stepFalhou.step}\` falhou (esperado=${stepFalhou.esperado}, obtido=${stepFalhou.obtido})`,
      prompt_para_claude: promptDeFalhaSmokeStep(stepFalhou, logsRelevantes || []),
    });
  }

  // ============ 2) CLIENTES REAIS TRAVADOS >2H ============
  // Steps que indicam travamento (cliente em meio de fluxo, nao avancou)
  const stepsZumbi = [
    "atendimento_humano",
    "aguardando_localizacao",
    "aguardando_destino",
    "aguardando_foto",
    "aguardando_mais_fotos",
  ];
  const corteTravado = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { data: travados } = await supabase
    .from("bot_sessions")
    .select("phone, step, atualizado_em")
    .in("step", stepsZumbi)
    .lt("atualizado_em", corteTravado)
    .order("atualizado_em", { ascending: false })
    .limit(10);

  for (const sess of travados || []) {
    // Ignora phones de teste (smoke, admin, etc)
    if (/^55000\d+$/.test(sess.phone)) continue;
    const horasParado = (Date.now() - new Date(sess.atualizado_em).getTime()) / 3600000;
    // Pega amostra de conversas pra contexto
    const { data: convs } = await supabase
      .from("conversas_whatsapp")
      .select("conteudo, direcao")
      .eq("telefone", sess.phone)
      .eq("direcao", "in")
      .order("criado_em", { ascending: false })
      .limit(5);
    const amostra = (convs || []).map((c: { conteudo: string }) => c.conteudo);
    problemas.push({
      tipo: "cliente_travado",
      severidade: "alta",
      detectado_em: sess.atualizado_em,
      resumo: `Cliente ${sess.phone} parado em \`${sess.step}\` ha ${horasParado.toFixed(1)}h`,
      prompt_para_claude: promptDeClienteTravado({
        phone: sess.phone,
        step: sess.step,
        ultima_atividade_iso: sess.atualizado_em,
        horas_parado: horasParado,
        amostra_conversas: amostra,
      }),
    });
  }

  // ============ 3) WEBHOOK_HANDLER_ERROR (cluster) ============
  const { data: handlerErrors } = await supabase
    .from("bot_logs")
    .select("payload, criado_em")
    .filter("payload->>tipo", "eq", "webhook_handler_error")
    .gte("criado_em", inicioJanela)
    .order("criado_em", { ascending: false })
    .limit(50);

  if (handlerErrors && handlerErrors.length >= 3) {
    const amostras = handlerErrors.slice(0, 5).map((l: { payload: Record<string, unknown>; criado_em: string }) => ({
      erro: String(l.payload.erro || ""),
      mensagem: String(l.payload.mensagem || ""),
      stack: String(l.payload.stack || "").slice(0, 500),
      phone_masked: String(l.payload.phone_masked || ""),
      ts: l.criado_em,
    }));
    problemas.push({
      tipo: "webhook_handler_error_cluster",
      severidade: "alta",
      detectado_em: handlerErrors[0].criado_em,
      resumo: `${handlerErrors.length} \`webhook_handler_error\` em ${janelaHoras}h`,
      prompt_para_claude: promptDeHandlerError({
        qtd_ocorrencias: handlerErrors.length,
        janela_horas: janelaHoras,
        amostras,
      }),
    });
  }

  // ============ 4) NOTIFICAR ADMINS VIA WHATSAPP (COM DEDUP) ============
  let notificacoes_enviadas = 0;
  let notificacoes_skippadas_dedup = 0;
  let notificacoes_skippadas_limite = 0;
  if (notificar && problemas.length > 0) {
    const { notificarAdmins } = await import("@/lib/admin-notify");
    for (const p of problemas) {
      // Limite hard pra nao floodar
      if (notificacoes_enviadas >= MAX_NOTIFICACOES_POR_RUN) {
        notificacoes_skippadas_limite++;
        continue;
      }
      // Dedup: nao re-notifica o mesmo bug se ja avisou nas ultimas N horas
      const hash = hashDoProblema(p);
      const jaAvisado = await jaNotificouRecente(hash, DEDUP_JANELA_HORAS);
      if (jaAvisado) {
        notificacoes_skippadas_dedup++;
        continue;
      }
      try {
        await notificarAdmins(
          `🦠 *IMUNI: ${p.resumo}*`,
          "sistema",
          `Detectado em ${p.detectado_em}\n\n${p.prompt_para_claude}\n\nCopia o bloco entre === === e cola pro Claude. Ele tem contexto completo pra corrigir sem precisar de back-and-forth.`,
        );
        await registrarNotificacao(hash, p);
        notificacoes_enviadas++;
        // Pequeno delay pra nao floodar ChatPro
        await new Promise((r) => setTimeout(r, 1000));
      } catch (e) {
        console.error("notificarAdmins falhou pra problema:", p.tipo, e);
      }
    }
  }

  return NextResponse.json({
    gerado_em: new Date().toISOString(),
    janela_horas: janelaHoras,
    qtd_problemas: problemas.length,
    notificacoes_enviadas,
    notificacoes_skippadas_dedup,
    notificacoes_skippadas_limite,
    dedup_janela_horas: DEDUP_JANELA_HORAS,
    max_por_run: MAX_NOTIFICACOES_POR_RUN,
    problemas,
  });
}
