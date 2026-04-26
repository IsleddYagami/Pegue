import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cron /api/cron/cleanup-sessoes-zumbis — roda 1x/dia.
// Limpa sessoes ZUMBIS — clientes que abandonaram o fluxo e ficaram em
// estado intermediario por dias. Bug detectado em 26/Abr: tinha sessao
// parada ha 9 dias em "aguardando_servico".
//
// Criterio: sessao com `atualizado_em` > 72h e step != "concluido".
// Preserva: admin/prestador/cadastro_aguardando_aprovacao (cadastro pendente).
//
// Configurar em cron-job.org:
// URL: https://www.chamepegue.com.br/api/cron/cleanup-sessoes-zumbis?key=CRON_SECRET
// Schedule: 0 8 * * * (08:00 UTC = 05:00 BRT)

// Steps que NAO devem ser apagados mesmo apos 72h
const STEPS_PRESERVADOS = new Set([
  "concluido",
  "cadastro_aguardando_aprovacao", // prestador esperando aprovacao manual
  "atendimento_humano", // admin precisa atender, nao perder
  "aguardando_revisao_admin", // anti-erro de preco, admin precisa aprovar
]);

const HORAS_LIMITE = 72;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!isValidCronKey(key)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - HORAS_LIMITE * 60 * 60 * 1000).toISOString();

  // Conta total ANTES (pra log)
  const { count: totalAntes } = await supabase
    .from("bot_sessions")
    .select("phone", { count: "exact", head: true })
    .lt("atualizado_em", cutoff);

  // Busca candidatos (pra contar quantos serao preservados)
  const { data: candidatos } = await supabase
    .from("bot_sessions")
    .select("phone, step")
    .lt("atualizado_em", cutoff);

  const preservados = (candidatos || []).filter((s) => STEPS_PRESERVADOS.has(s.step));
  const remover = (candidatos || []).filter((s) => !STEPS_PRESERVADOS.has(s.step));

  let removidos = 0;
  if (remover.length > 0) {
    const phonesRemover = remover.map((s) => s.phone);
    const { error, count } = await supabase
      .from("bot_sessions")
      .delete({ count: "exact" })
      .in("phone", phonesRemover);

    if (error) {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "cleanup_sessoes_zumbis_falhou",
          erro: error.message,
        },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    removidos = count ?? 0;
  }

  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "cleanup_sessoes_zumbis_ok",
      total_antes: totalAntes ?? 0,
      removidos,
      preservados: preservados.length,
      cutoff,
    },
  });

  return NextResponse.json({
    status: "ok",
    total_antes: totalAntes ?? 0,
    removidos,
    preservados: preservados.length,
    preservados_breakdown: preservados.reduce((acc: Record<string, number>, s) => {
      acc[s.step] = (acc[s.step] || 0) + 1;
      return acc;
    }, {}),
    cutoff,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
