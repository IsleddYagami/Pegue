// IMUNI runner — executa um conjunto de invariantes em paralelo e
// retorna o consolidado.
//
// Agnostico de dominio: aceita InvarianteFn[] (vindo de qualquer
// plugin Pegue, Otimizi, etc).

import type { InvarianteFn, ResultadoInvariante, PluginImuni } from "./types";

/**
 * Executa todas as invariantes de UM plugin. Cada invariante eh
 * independente — falhas em uma nao afetam outras (Promise.all com
 * captura ja eh feita dentro de cada InvarianteFn).
 */
export async function executarPlugin(plugin: PluginImuni): Promise<ResultadoInvariante[]> {
  return Promise.all(plugin.invariantes.map((fn) => fn()));
}

/**
 * Executa multiplos plugins em paralelo (uso futuro: mesma instancia
 * IMUNI rodando invariantes de Pegue + invariantes de outras integracoes).
 * Retorna lista plana com todos os resultados.
 */
export async function executarPlugins(plugins: PluginImuni[]): Promise<ResultadoInvariante[]> {
  const resultadosPorPlugin = await Promise.all(plugins.map(executarPlugin));
  return resultadosPorPlugin.flat();
}

/**
 * Helper de classificacao apos execucao. Util pro alertador decidir
 * se notifica admin imediato ou so loga.
 */
export function classificar(resultados: ResultadoInvariante[]) {
  return {
    total: resultados.length,
    saudaveis: resultados.filter((r) => r.ok).length,
    violacoes_alta: resultados.filter((r) => !r.ok && r.severidade === "alta"),
    violacoes_media: resultados.filter((r) => !r.ok && r.severidade === "media"),
    violacoes_baixa: resultados.filter((r) => !r.ok && r.severidade === "baixa"),
    erros: resultados.filter((r) => r.erro),
  };
}

// Re-export tipos pra callers nao precisarem importar de 2 lugares
export type { InvarianteFn, ResultadoInvariante, PluginImuni } from "./types";
export type { Severidade } from "./types";
