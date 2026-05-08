import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey, isValidCronKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Endpoint que agrega dados pro dashboard /admin/imuni-smoke. Retorna:
// - Resumo das ultimas execucoes de cada sentinela (smoke feliz, adversarial,
//   self-heal, relatorio).
// - Histórico das ultimas 30 execucoes de cada.
// - Conversa do cliente smoke fictício (pra Fabio ver o que o bot respondeu
//   em cada step).
// - Eventos IMUNI: rollbacks, notificacoes enviadas, locks orfaos.

interface SmokeRunSummary {
  ts: string;
  ok: boolean;
  duracao_ms?: number;
  qtd_total?: number;
  qtd_ok?: number;
  qtd_falhas?: number;
  motivo?: string;
  detalhes?: unknown;
}

export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidAdminKey(key) && !isValidCronKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const cortRecente = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  // ============ 1) Smoke E2E feliz ============
  const { data: smokeFeliz } = await supabase
    .from("bot_logs")
    .select("payload, criado_em")
    .or(
      "payload->>tipo.eq.imuni_smoke_e2e_ok,payload->>tipo.eq.imuni_smoke_e2e_falhou",
    )
    .gte("criado_em", cortRecente)
    .order("criado_em", { ascending: false })
    .limit(30);

  const smokeFelizRuns: SmokeRunSummary[] = (smokeFeliz || []).map(
    (l: { payload: Record<string, unknown>; criado_em: string }) => {
      const detalhes = (l.payload.detalhes as Array<{ ok: boolean }> | undefined) || [];
      return {
        ts: l.criado_em,
        ok: l.payload.tipo === "imuni_smoke_e2e_ok",
        duracao_ms: l.payload.duracao_ms as number | undefined,
        qtd_total: detalhes.length,
        qtd_ok: detalhes.filter((s) => s.ok).length,
        qtd_falhas: detalhes.filter((s) => !s.ok).length,
        motivo: l.payload.motivo as string | undefined,
        detalhes: l.payload.detalhes,
      };
    },
  );

  // ============ 2) Smoke adversarial ============
  const { data: smokeAdv } = await supabase
    .from("bot_logs")
    .select("payload, criado_em")
    .or(
      "payload->>tipo.eq.imuni_smoke_adversario_ok,payload->>tipo.eq.imuni_smoke_adversario_falhou",
    )
    .gte("criado_em", cortRecente)
    .order("criado_em", { ascending: false })
    .limit(30);

  const smokeAdvRuns: SmokeRunSummary[] = (smokeAdv || []).map(
    (l: { payload: Record<string, unknown>; criado_em: string }) => {
      const detalhes = (l.payload.detalhes as Array<{ ok: boolean }> | undefined) || [];
      return {
        ts: l.criado_em,
        ok: l.payload.tipo === "imuni_smoke_adversario_ok",
        duracao_ms: l.payload.duracao_ms as number | undefined,
        qtd_total: detalhes.length,
        qtd_ok: detalhes.filter((s) => s.ok).length,
        qtd_falhas: detalhes.filter((s) => !s.ok).length,
        detalhes: l.payload.detalhes,
      };
    },
  );

  // ============ 3) Self-heal ============
  const { data: selfHeal } = await supabase
    .from("bot_logs")
    .select("payload, criado_em")
    .filter("payload->>tipo", "eq", "imuni_self_heal_executado")
    .gte("criado_em", cortRecente)
    .order("criado_em", { ascending: false })
    .limit(30);

  const selfHealRuns = (selfHeal || []).map(
    (l: { payload: Record<string, unknown>; criado_em: string }) => ({
      ts: l.criado_em,
      duracao_ms: l.payload.duracao_ms as number | undefined,
      total_corrigido: l.payload.total_corrigido as number | undefined,
      resultados: l.payload.resultados,
    }),
  );

  // ============ 4) Eventos IMUNI relevantes ============
  const tiposEventos = [
    "imuni_rollback_executado",
    "imuni_notificacao_enviada",
    "webhook_handler_error",
    "cliente_destravado_admin",
    "imuni_smoke_e2e_iniciado",
  ];
  const { data: eventos } = await supabase
    .from("bot_logs")
    .select("payload, criado_em")
    .in("payload->>tipo", tiposEventos)
    .gte("criado_em", cortRecente)
    .order("criado_em", { ascending: false })
    .limit(40);

  // ============ 5) Conversa do cliente smoke (ultimas 50 msgs) ============
  const { data: conversaSmoke } = await supabase
    .from("conversas_whatsapp")
    .select("conteudo, direcao, tipo, criado_em")
    .eq("telefone", "5500000000001")
    .order("criado_em", { ascending: false })
    .limit(50);

  // ============ 6) Quando foi a ultima vez de cada cron? ============
  const ultimaSmokeFeliz = smokeFelizRuns[0]?.ts;
  const ultimaSmokeAdv = smokeAdvRuns[0]?.ts;
  const ultimaSelfHeal = selfHealRuns[0]?.ts;

  return NextResponse.json({
    gerado_em: new Date().toISOString(),
    smoke_feliz: {
      ultima_execucao: ultimaSmokeFeliz || null,
      ultimas_runs: smokeFelizRuns,
    },
    smoke_adversarial: {
      ultima_execucao: ultimaSmokeAdv || null,
      ultimas_runs: smokeAdvRuns,
    },
    self_heal: {
      ultima_execucao: ultimaSelfHeal || null,
      ultimas_runs: selfHealRuns,
    },
    eventos: (eventos || []).map(
      (l: { payload: Record<string, unknown>; criado_em: string }) => ({
        ts: l.criado_em,
        tipo: l.payload.tipo,
        payload: l.payload,
      }),
    ),
    conversa_smoke: (conversaSmoke || []).reverse(),
  });
}
