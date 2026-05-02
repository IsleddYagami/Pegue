// IMUNI analytics — agregacoes de saude longitudinal a partir de execucoes
// historicas registradas em bot_logs (tipo=auditoria_invariantes_executada).
//
// Tudo agnostico de dominio: funciona com qualquer plugin (Pegue, Otimizi,
// futuros clientes). Recebe linhas de log brutas, devolve metricas.
//
// Saidas usadas pelo dashboard /admin/imuni:
//   - calcularScore()              0-100 baseado em tendencia ponderada
//   - tempoDesdeUltimoIncidente() horas desde ultima violacao por severidade
//   - topInvariantesViolantes()    top N que mais violam em janela
//   - tendenciaSemanal()           % melhor/pior que semana anterior
//   - heatmapPorDiaDaSemana()      contagem por dia (0=dom..6=sab)
//   - saudePorCategoria()          banco vs infra vs etc

import type { Severidade } from "./types";

// Estrutura esperada de cada execucao logada (vem do cron):
//   {
//     tipo: "auditoria_invariantes_executada",
//     total: 16,
//     violacoes: 1,
//     duracao_ms: 1234,
//     sumario: [{ nome, count, severidade, ok }, ...]
//   }
export interface ExecucaoHistorica {
  criado_em: string;
  payload: {
    total?: number;
    violacoes?: number;
    duracao_ms?: number;
    sumario?: { nome: string; count: number; severidade: Severidade; ok: boolean }[];
  };
}

/**
 * Score 0-100. Pondera:
 *   - 70% saude atual (% invariantes saudaveis na ultima execucao)
 *   - 20% saude ultimos 7d (% execucoes sem violacao alta)
 *   - 10% saude ultimos 30d (idem)
 *
 * Punicao extra pra violacao ALTA recente (-15 se < 24h).
 */
export function calcularScore(execucoes: ExecucaoHistorica[]): number {
  if (execucoes.length === 0) return 50; // sem dados, neutro

  const ultima = execucoes[0];
  const sumario = ultima.payload.sumario || [];
  const totalUltima = ultima.payload.total || sumario.length || 1;
  const saudaveisUltima = sumario.filter((s) => s.ok).length;
  const pctAtual = (saudaveisUltima / totalUltima) * 100;

  const agora = Date.now();
  const dia = 24 * 60 * 60 * 1000;
  const ultimos7d = execucoes.filter(
    (e) => agora - new Date(e.criado_em).getTime() < 7 * dia,
  );
  const ultimos30d = execucoes.filter(
    (e) => agora - new Date(e.criado_em).getTime() < 30 * dia,
  );

  function pctSemViolacaoAlta(arr: ExecucaoHistorica[]): number {
    if (arr.length === 0) return 100;
    const limpas = arr.filter((e) =>
      (e.payload.sumario || []).every((s) => s.ok || s.severidade !== "alta"),
    ).length;
    return (limpas / arr.length) * 100;
  }
  const pct7d = pctSemViolacaoAlta(ultimos7d);
  const pct30d = pctSemViolacaoAlta(ultimos30d);

  let score = pctAtual * 0.7 + pct7d * 0.2 + pct30d * 0.1;

  // Penalidade: violacao ALTA aberta agora
  const temAltaAgora = sumario.some((s) => !s.ok && s.severidade === "alta");
  if (temAltaAgora) score = Math.max(0, score - 15);

  return Math.round(score);
}

/**
 * Quantas horas desde a ultima execucao com violacao da severidade indicada.
 * Retorna null se NUNCA teve (sistema sempre saudavel).
 */
export function tempoDesdeUltimoIncidente(
  execucoes: ExecucaoHistorica[],
  severidade: Severidade,
): { horas: number; data: string } | null {
  for (const e of execucoes) {
    const tem = (e.payload.sumario || []).some(
      (s) => !s.ok && s.severidade === severidade,
    );
    if (tem) {
      const ms = Date.now() - new Date(e.criado_em).getTime();
      return { horas: Math.floor(ms / (60 * 60 * 1000)), data: e.criado_em };
    }
  }
  return null;
}

/**
 * Top N invariantes que mais violaram nos ultimos 30 dias.
 * Util pra cliente entender padroes recorrentes.
 */
export function topInvariantesViolantes(
  execucoes: ExecucaoHistorica[],
  n: number = 5,
): { nome: string; ocorrencias: number; severidade: Severidade }[] {
  const cont: Record<string, { ocorrencias: number; severidade: Severidade }> = {};
  for (const e of execucoes) {
    for (const s of e.payload.sumario || []) {
      if (!s.ok) {
        if (!cont[s.nome]) cont[s.nome] = { ocorrencias: 0, severidade: s.severidade };
        cont[s.nome].ocorrencias++;
      }
    }
  }
  return Object.entries(cont)
    .map(([nome, d]) => ({ nome, ...d }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias)
    .slice(0, n);
}

/**
 * Compara semana atual (ultimos 7d) com semana anterior (8-14d atras).
 * Retorna delta percentual de violacoes (negativo = melhorou).
 */
export function tendenciaSemanal(execucoes: ExecucaoHistorica[]): {
  semanaAtual: number;
  semanaAnterior: number;
  delta_pct: number;
  rumo: "melhor" | "pior" | "igual";
} {
  const agora = Date.now();
  const dia = 24 * 60 * 60 * 1000;
  function violacoesNaJanela(inicio: number, fim: number): number {
    let total = 0;
    for (const e of execucoes) {
      const t = new Date(e.criado_em).getTime();
      if (t >= inicio && t < fim) total += e.payload.violacoes || 0;
    }
    return total;
  }
  const semanaAtual = violacoesNaJanela(agora - 7 * dia, agora);
  const semanaAnterior = violacoesNaJanela(agora - 14 * dia, agora - 7 * dia);
  const delta = semanaAnterior === 0
    ? (semanaAtual === 0 ? 0 : 100)
    : ((semanaAtual - semanaAnterior) / semanaAnterior) * 100;
  const rumo: "melhor" | "pior" | "igual" =
    delta < -5 ? "melhor" : delta > 5 ? "pior" : "igual";
  return { semanaAtual, semanaAnterior, delta_pct: Math.round(delta), rumo };
}

/**
 * Distribuicao de violacoes por dia da semana (0=domingo..6=sabado).
 * Util pra detectar padroes (ex: bug toca toda segunda de manha).
 */
export function heatmapPorDiaSemana(execucoes: ExecucaoHistorica[]): number[] {
  const dist = [0, 0, 0, 0, 0, 0, 0];
  for (const e of execucoes) {
    const dia = new Date(e.criado_em).getDay();
    dist[dia] += e.payload.violacoes || 0;
  }
  return dist;
}

/**
 * Distribuicao por hora (0..23).
 */
export function heatmapPorHora(execucoes: ExecucaoHistorica[]): number[] {
  const dist = new Array(24).fill(0);
  for (const e of execucoes) {
    const h = new Date(e.criado_em).getHours();
    dist[h] += e.payload.violacoes || 0;
  }
  return dist;
}

/**
 * Conta total de execucoes em um intervalo (pra mostrar "rodou X vezes").
 */
export function totalExecucoes(execucoes: ExecucaoHistorica[]): number {
  return execucoes.length;
}
