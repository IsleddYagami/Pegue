import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { executarPlugin, classificar } from "@/lib/imuni/runner";
import { pluginPegue } from "@/lib/imuni-pegue/invariantes";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// API do dashboard /admin/imuni — saude do meta-sistema.
//
// Retorna:
//   - Resultado AO VIVO das 16 invariantes (rodando agora)
//   - Historico das ultimas 14 execucoes do cron
//   - Estatisticas: bugs cacados, dias rodando saudavel, etc
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 1) Roda invariantes ao vivo
  const resultados = await executarPlugin(pluginPegue);
  const stats = classificar(resultados);

  // 2) Historico (ultimas 14 execucoes do cron)
  const { data: historico } = await supabase
    .from("bot_logs")
    .select("payload, criado_em")
    .filter("payload->>tipo", "eq", "auditoria_invariantes_executada")
    .order("criado_em", { ascending: false })
    .limit(14);

  const historicoSimplificado = (historico || []).map((l: any) => {
    const p = l.payload || {};
    return {
      criado_em: l.criado_em,
      total: p.total || 0,
      violacoes: p.violacoes || 0,
      duracao_ms: p.duracao_ms || 0,
      sumario: p.sumario || [],
    };
  });

  // 3) Estatisticas agregadas (ultimos 30d)
  const dias30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: totalExecucoes30d } = await supabase
    .from("bot_logs")
    .select("id", { count: "exact", head: true })
    .filter("payload->>tipo", "eq", "auditoria_invariantes_executada")
    .gte("criado_em", dias30);

  // 4) Conta quantas vezes uma invariante foi violada nos ultimos 30d
  // (proxy de "quanto IMUNI esta trabalhando")
  const violacoesPorInvariante: Record<string, number> = {};
  for (const ex of historico || []) {
    const sumario: any[] = ((ex.payload as any)?.sumario as any[]) || [];
    for (const item of sumario) {
      if (!item.ok) {
        violacoesPorInvariante[item.nome] = (violacoesPorInvariante[item.nome] || 0) + 1;
      }
    }
  }

  return NextResponse.json({
    plugin: pluginPegue.dominio,
    timestamp: new Date().toISOString(),

    // ao vivo
    aovivo: {
      total: resultados.length,
      saudaveis: stats.saudaveis,
      violacoes_alta: stats.violacoes_alta.length,
      violacoes_media: stats.violacoes_media.length,
      erros: stats.erros.length,
      detalhes: resultados,
    },

    // historico
    historico: historicoSimplificado,

    // metricas
    metricas: {
      execucoes_ultimos_30d: totalExecucoes30d ?? 0,
      violacoes_por_invariante_ultimos_14_runs: violacoesPorInvariante,
    },

    // status das camadas
    camadas: [
      { id: "1", nome: "Supabase types", status: "ativa" },
      { id: "1B", nome: "ESLint plugin (3 regras)", status: "ativa" },
      { id: "2", nome: "Testes regressivos (450)", status: "ativa" },
      { id: "3", nome: "Cron invariantes (16)", status: "ativa" },
      { id: "4", nome: "Pre-commit hook", status: "ativa" },
      { id: "5", nome: "Sentry + alertas WhatsApp", status: "ativa" },
    ],
  });
}
