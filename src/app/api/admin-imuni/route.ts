import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { executarPlugin, classificar } from "@/lib/imuni/runner";
import { pluginPegue } from "@/lib/imuni-pegue/invariantes";
import {
  calcularScore,
  tempoDesdeUltimoIncidente,
  topInvariantesViolantes,
  tendenciaSemanal,
  heatmapPorDiaSemana,
  heatmapPorHora,
  type ExecucaoHistorica,
} from "@/lib/imuni/analytics";

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

  // 2) Historico (ultimos 90d pra calcular score, tendencia, heatmap)
  const dias90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: historicoCru } = await supabase
    .from("bot_logs")
    .select("payload, criado_em")
    .filter("payload->>tipo", "eq", "auditoria_invariantes_executada")
    .gte("criado_em", dias90)
    .order("criado_em", { ascending: false })
    .limit(500);

  const execucoes: ExecucaoHistorica[] = (historicoCru || []).map((l: any) => ({
    criado_em: l.criado_em,
    payload: l.payload || {},
  }));

  const historicoSimplificado = execucoes.slice(0, 14).map((e) => ({
    criado_em: e.criado_em,
    total: e.payload.total || 0,
    violacoes: e.payload.violacoes || 0,
    duracao_ms: e.payload.duracao_ms || 0,
    sumario: e.payload.sumario || [],
  }));

  // 3) Analytics agregadas via core IMUNI.
  // Passa o estado AO VIVO (resultados que acabaram de rodar) pra que
  // o score reflita a verdade atual, nao a ultima execucao do cron.
  const aoVivoSumario = {
    sumario: resultados.map((r) => ({
      nome: r.nome,
      severidade: r.severidade,
      ok: r.ok,
    })),
  };
  const score = calcularScore(execucoes, aoVivoSumario);
  const ultIncidenteAlta = tempoDesdeUltimoIncidente(execucoes, "alta");
  const ultIncidenteMedia = tempoDesdeUltimoIncidente(execucoes, "media");
  const top5 = topInvariantesViolantes(execucoes, 5);
  const tendencia = tendenciaSemanal(execucoes);
  const heatmapDia = heatmapPorDiaSemana(execucoes);
  const heatmapHora = heatmapPorHora(execucoes);

  // 4) Saude por categoria. Inferida pelo prefixo do nome:
  //    INV-1 a INV-11 = banco; INV-12 a INV-16 = infra.
  const detalhes = stats; // ja calculado
  const banco = resultados.filter((r) => {
    const num = parseInt(r.nome.replace("INV-", ""));
    return num >= 1 && num <= 11;
  });
  const infra = resultados.filter((r) => {
    const num = parseInt(r.nome.replace("INV-", ""));
    return num >= 12;
  });

  function scoreCategoria(arr: typeof resultados): { saudaveis: number; total: number; pct: number } {
    const total = arr.length || 1;
    const saudaveis = arr.filter((r) => r.ok).length;
    return { saudaveis, total: arr.length, pct: Math.round((saudaveis / total) * 100) };
  }

  return NextResponse.json({
    plugin: pluginPegue.dominio,
    timestamp: new Date().toISOString(),

    // === SAUDE GERAL ===
    score,
    tempo_desde_ult_incidente: {
      alta: ultIncidenteAlta,
      media: ultIncidenteMedia,
    },

    // === AO VIVO ===
    aovivo: {
      total: resultados.length,
      saudaveis: stats.saudaveis,
      violacoes_alta: stats.violacoes_alta.length,
      violacoes_media: stats.violacoes_media.length,
      erros: stats.erros.length,
      detalhes: resultados,
    },

    // === SAUDE POR CATEGORIA ===
    saude_por_categoria: {
      banco: scoreCategoria(banco),
      infra: scoreCategoria(infra),
    },

    // === TENDENCIA ===
    tendencia_semanal: tendencia,

    // === RECORRENCIA ===
    top_5_invariantes_violantes_30d: top5,

    // === HEATMAPS ===
    heatmap: {
      dia_semana: heatmapDia, // [domingo, segunda, ..., sabado]
      hora: heatmapHora,      // [0h, 1h, ..., 23h]
    },

    // === HISTORICO ===
    historico: historicoSimplificado,
    metricas: {
      execucoes_ultimos_30d: execucoes.filter(
        (e) => Date.now() - new Date(e.criado_em).getTime() < 30 * 24 * 60 * 60 * 1000,
      ).length,
      execucoes_ultimos_90d: execucoes.length,
    },

    // === CAMADAS ===
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
