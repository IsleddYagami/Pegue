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
 * Sumario "ao vivo" — formato canonico que o dashboard ja calcula a cada
 * abertura da tela. Usado pra calibrar o score real (em vez de depender
 * SO do que tem no bot_logs, que pode estar atrasado/incompleto).
 */
export interface SumarioAoVivo {
  sumario: { nome: string; severidade: Severidade; ok: boolean }[];
}

/**
 * Score 0-100 da saude atual do sistema.
 *
 * Filosofia (audit 2/Mai/2026 com Fabio): score deve refletir COMO O
 * SISTEMA ESTA AGORA, com peso secundario pra historico recente. Versao
 * antiga punia injustamente porque:
 *   1. Lia "estado atual" do bot_logs (sempre atrasado por 1+ patrulha).
 *   2. Com pouco historico, 1 falso positivo amplificava em 30% da nota.
 *   3. Resultado: dashboard gritava CRITICO 48/100 com TODOS os 16
 *      sentinelas saudaveis ao vivo.
 *
 * Versao nova:
 *   - 80% estado AO VIVO (preferencialmente; cai pra ultima do bot_logs
 *     se ao vivo nao for fornecido).
 *   - 15% saude ultimos 7d (% execucoes sem violacao alta) — so conta
 *     se >=3 execucoes na janela. Senao redistribui pro estado atual.
 *   - 5%  saude ultimos 30d (idem) — so conta se >=5 execucoes.
 *   - Penalidade -10 se ao vivo tem violacao ALTA aberta (era -15).
 *   - Bonus +5 se ao vivo 100% limpo E historico (>=3 exec) tambem 100%.
 */
export function calcularScore(
  execucoes: ExecucaoHistorica[],
  aoVivo?: SumarioAoVivo,
): number {
  // Sem dados nem estado ao vivo: neutro
  if (execucoes.length === 0 && !aoVivo) return 50;

  // === Estado AO VIVO (preferencial) ===
  // Se nao foi passado, cai pra ultima execucao do bot_logs.
  const sumarioAtual = aoVivo
    ? aoVivo.sumario
    : execucoes[0]?.payload.sumario || [];
  const totalAtual = sumarioAtual.length || 1;
  const saudaveisAtual = sumarioAtual.filter((s) => s.ok).length;
  const pctAtual = (saudaveisAtual / totalAtual) * 100;

  // === Janelas historicas ===
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

  // Ponderacao adaptativa: so aplica 7d/30d se janela tiver volume minimo.
  // Senao redistribui peso pro estado atual (mais confiavel).
  let pesoAtual = 0.8;
  let peso7d = 0;
  let peso30d = 0;
  if (ultimos7d.length >= 3) peso7d = 0.15;
  if (ultimos30d.length >= 5) peso30d = 0.05;
  pesoAtual = 1 - peso7d - peso30d;

  const pct7d = peso7d > 0 ? pctSemViolacaoAlta(ultimos7d) : 0;
  const pct30d = peso30d > 0 ? pctSemViolacaoAlta(ultimos30d) : 0;

  let score = pctAtual * pesoAtual + pct7d * peso7d + pct30d * peso30d;

  // Penalidade reduzida (-10 em vez de -15): violacao ALTA aberta AGORA.
  // Aplica so se a fonte do pctAtual indica realmente ameaca atual viva.
  const temAltaAgora = sumarioAtual.some((s) => !s.ok && s.severidade === "alta");
  if (temAltaAgora) score = Math.max(0, score - 10);

  // Bonus de confianca: ao vivo limpo E historico solido tambem limpo.
  const historicoLimpo =
    ultimos7d.length >= 3 &&
    pctSemViolacaoAlta(ultimos7d) === 100 &&
    pctSemViolacaoAlta(ultimos30d) === 100;
  if (pctAtual === 100 && historicoLimpo) score = Math.min(100, score + 5);

  return Math.round(Math.max(0, Math.min(100, score)));
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
