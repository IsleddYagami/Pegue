import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron /api/cron/cleanup-bot-logs — roda 1x/dia (cron-job.org).
// Apaga logs antigos (>30d) pra evitar bloat de bot_logs.
//
// Bug detectado em auditoria 26/Abr: 38.558 logs acumulados em poucos
// dias (~10k/dia). Em 1 ano = 3.6 milhoes de linhas. Sem cleanup,
// queries de log ficam lentas e consome espaco caro do plano Supabase.
//
// Estrategia: manter apenas ultimos 30 dias. Logs antigos quase nunca
// sao consultados (debug eh sempre na janela recente).
//
// URL: https://www.chamepegue.com.br/api/cron/cleanup-bot-logs?key=CRON_SECRET
// Schedule: 0 9 * * * (09:00 UTC = 06:00 BRT)

const DIAS_RETENCAO = 30;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!isValidCronKey(key)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - DIAS_RETENCAO * 24 * 60 * 60 * 1000).toISOString();

  // Conta antes (pra log)
  const { count: totalAntes } = await supabase
    .from("bot_logs")
    .select("id", { count: "exact", head: true });

  const { error, count: removidos } = await supabase
    .from("bot_logs")
    .delete({ count: "exact" })
    .lt("criado_em", cutoff);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Loga proprio cleanup pra auditoria
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "cleanup_bot_logs_ok",
      total_antes: totalAntes ?? 0,
      removidos: removidos ?? 0,
      cutoff,
      retencao_dias: DIAS_RETENCAO,
    },
  });

  return NextResponse.json({
    status: "ok",
    total_antes: totalAntes ?? 0,
    removidos: removidos ?? 0,
    cutoff,
    retencao_dias: DIAS_RETENCAO,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
