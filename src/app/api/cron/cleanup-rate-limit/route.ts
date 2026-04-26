import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cron /api/cron/cleanup-rate-limit
// Limpa registros antigos de rate_limit_buckets (tabela cresce indefinidamente
// se nao houver limpeza). Cada chamada do webhook insere/atualiza 1 linha por
// (chave + janela_iso). Janelas antigas (> 24h) sao inuteis e so consomem
// espaco/memoria nos selects.
//
// Configurar em cron-job.org pra rodar 1x/dia (ex: 04:00 UTC).
// URL: https://www.chamepegue.com.br/api/cron/cleanup-rate-limit?key=CRON_SECRET

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!isValidCronKey(key)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Conta antes de deletar (pra log)
  const { count: countAntes } = await supabase
    .from("rate_limit_buckets")
    .select("id", { count: "exact", head: true });

  const { error, count: removidos } = await supabase
    .from("rate_limit_buckets")
    .delete({ count: "exact" })
    .lt("janela_iso", cutoff);

  if (error) {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "cleanup_rate_limit_falhou",
        erro: error.message,
        code: error.code,
      },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "cleanup_rate_limit_ok",
      removidos: removidos ?? 0,
      total_antes: countAntes ?? 0,
      cutoff,
    },
  });

  return NextResponse.json({
    status: "ok",
    removidos: removidos ?? 0,
    total_antes: countAntes ?? 0,
    cutoff,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
