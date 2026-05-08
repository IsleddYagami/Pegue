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
  etapa1_total?: number;
  etapa1_ok?: number;
  etapa1_100?: boolean;
  etapa2_total?: number;
  etapa2_ok?: number;
  etapa2_100?: boolean;
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

  // Helper: extrai numero do step (ex: "16_aceite_termos_dispatch" -> 16)
  const numeroDoStep = (stepName: string): number => {
    const m = stepName.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };
  // Etapa 1 = cotacao (steps 0-15). Etapa 2 = pagamento + execucao (16+).
  const ETAPA_DIVISOR = 16;

  const smokeFelizRuns: SmokeRunSummary[] = (smokeFeliz || []).map(
    (l: { payload: Record<string, unknown>; criado_em: string }) => {
      const detalhes =
        (l.payload.detalhes as Array<{ step: string; ok: boolean }> | undefined) || [];
      const stepsEtapa1 = detalhes.filter((s) => numeroDoStep(s.step) < ETAPA_DIVISOR);
      const stepsEtapa2 = detalhes.filter((s) => numeroDoStep(s.step) >= ETAPA_DIVISOR);
      return {
        ts: l.criado_em,
        ok: l.payload.tipo === "imuni_smoke_e2e_ok",
        duracao_ms: l.payload.duracao_ms as number | undefined,
        qtd_total: detalhes.length,
        qtd_ok: detalhes.filter((s) => s.ok).length,
        qtd_falhas: detalhes.filter((s) => !s.ok).length,
        motivo: l.payload.motivo as string | undefined,
        detalhes: l.payload.detalhes,
        // Por etapa
        etapa1_total: stepsEtapa1.length,
        etapa1_ok: stepsEtapa1.filter((s) => s.ok).length,
        etapa1_100: stepsEtapa1.length > 0 && stepsEtapa1.every((s) => s.ok),
        etapa2_total: stepsEtapa2.length,
        etapa2_ok: stepsEtapa2.filter((s) => s.ok).length,
        etapa2_100: stepsEtapa2.length > 0 && stepsEtapa2.every((s) => s.ok),
      };
    },
  );

  // Metricas agregadas — soh contam runs que TEVERAM steps na etapa.
  // Runs antigas anteriores ao smoke v6 (so 15 steps) nao tinham etapa 2.
  // Sem essa exclusao, denominador inflava e taxa caia artificialmente.
  type RunComEtapas = SmokeRunSummary & {
    etapa1_total?: number;
    etapa1_100?: boolean;
    etapa2_total?: number;
    etapa2_100?: boolean;
  };
  const runsComEtapa1 = smokeFelizRuns.filter(
    (r) => ((r as RunComEtapas).etapa1_total || 0) > 0,
  );
  const runsComEtapa2 = smokeFelizRuns.filter(
    (r) => ((r as RunComEtapas).etapa2_total || 0) > 0,
  );
  const etapa1Sucesso100 = runsComEtapa1.filter(
    (r) => (r as RunComEtapas).etapa1_100,
  ).length;
  const etapa2Sucesso100 = runsComEtapa2.filter(
    (r) => (r as RunComEtapas).etapa2_100,
  ).length;
  const etapa1Falhas = runsComEtapa1.length - etapa1Sucesso100;
  const etapa2Falhas = runsComEtapa2.length - etapa2Sucesso100;

  const metricas_etapas = {
    total_execucoes: smokeFelizRuns.length,
    etapa1_cotacao: {
      label: "Cotação (entrada → aceite termos)",
      tentativas: runsComEtapa1.length,
      sucesso_100: etapa1Sucesso100,
      com_falhas: etapa1Falhas,
      taxa_sucesso_pct:
        runsComEtapa1.length > 0
          ? Math.round((etapa1Sucesso100 / runsComEtapa1.length) * 100)
          : 0,
    },
    etapa2_pagamento_repasse: {
      label: "Pagamento até repasse (aceite → entrega → PIX)",
      tentativas: runsComEtapa2.length,
      sucesso_100: etapa2Sucesso100,
      com_falhas: etapa2Falhas,
      taxa_sucesso_pct:
        runsComEtapa2.length > 0
          ? Math.round((etapa2Sucesso100 / runsComEtapa2.length) * 100)
          : 0,
    },
  };

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

  // Smoke adversarial: estatistica de cenarios passados/falhados
  const totalAdvRuns = smokeAdvRuns.length;
  const advSucesso100 = smokeAdvRuns.filter((r) => r.qtd_falhas === 0).length;
  const metricas_adversarial = {
    total_execucoes: totalAdvRuns,
    sucesso_100: advSucesso100,
    com_falhas: totalAdvRuns - advSucesso100,
    taxa_sucesso_pct: totalAdvRuns > 0 ? Math.round((advSucesso100 / totalAdvRuns) * 100) : 0,
  };

  return NextResponse.json({
    gerado_em: new Date().toISOString(),
    metricas_etapas,
    metricas_adversarial,
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
