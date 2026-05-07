import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey, isValidCronKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Endpoint pra silenciar backlog do IMUNI: marca todos os hashes de
// problemas atuais como "ja notificado" (timestamp NOW), pra que o dedup
// de 6h bloqueie re-envio. Util pra zerar acumulado quando admin ja
// processou ou quando bug ja foi corrigido mas log ficou.
//
// Uso (POST ou GET): ?key=ADMIN_KEY_OR_CRON_SECRET
//
// Idempotente: rodar varias vezes nao gera duplicatas inuteis (apenas
// renova o timestamp do dedup).
export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidAdminKey(key) && !isValidCronKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  // Coleta hashes em uso (smoke steps + clientes travados + handler errors)
  const inicioJanela = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Smoke steps que falharam (de qualquer log, nao filtrado por verde recente
  // — propositalmente, queremos silenciar TUDO acumulado)
  const { data: smokeFalhas } = await supabase
    .from("bot_logs")
    .select("payload")
    .filter("payload->>tipo", "eq", "imuni_smoke_e2e_falhou")
    .gte("criado_em", inicioJanela);

  const hashes = new Set<string>();

  for (const log of smokeFalhas || []) {
    const payload = log.payload as Record<string, unknown>;
    const detalhes = payload.detalhes as Array<{ step: string; ok: boolean }> | undefined;
    const stepFalhou = detalhes?.find((s) => !s.ok);
    if (stepFalhou) hashes.add(`smoke_${stepFalhou.step}`);
  }

  // Clientes travados
  const stepsZumbi = [
    "atendimento_humano",
    "aguardando_localizacao",
    "aguardando_destino",
    "aguardando_foto",
    "aguardando_mais_fotos",
  ];
  const { data: travados } = await supabase
    .from("bot_sessions")
    .select("phone")
    .in("step", stepsZumbi)
    .lt("atualizado_em", new Date(Date.now() - 2 * 3600 * 1000).toISOString());
  for (const sess of travados || []) {
    if (/^55000\d+$/.test(sess.phone)) continue;
    hashes.add(`travado_${sess.phone}`);
  }

  // Handler error cluster (sempre 1 hash)
  const { data: handlerErrors } = await supabase
    .from("bot_logs")
    .select("id")
    .filter("payload->>tipo", "eq", "webhook_handler_error")
    .gte("criado_em", inicioJanela)
    .limit(3);
  if (handlerErrors && handlerErrors.length >= 3) {
    hashes.add("handler_error_cluster");
  }

  // Registra notificacao "fantasma" pra cada hash (silencia dedup por 6h)
  let silenciados = 0;
  for (const hash of hashes) {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "imuni_notificacao_enviada",
        hash,
        problema_tipo: "silenciado_manualmente",
        resumo: "backlog limpo via admin-imuni-silenciar-backlog",
      },
    });
    silenciados++;
  }

  return NextResponse.json({
    ok: true,
    hashes_silenciados: silenciados,
    detalhes: Array.from(hashes),
    msg: `${silenciados} hashes marcados como notificados. Dedup vai bloquear re-envio por 6h.`,
  });
}
