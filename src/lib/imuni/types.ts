// IMUNI — sistema imuno-corretivo agnostico de dominio.
//
// Tipos do core. Nao depende de nenhuma tabela especifica, nenhum
// dominio de negocio. Pegue, Otimizi e qualquer outro sistema usam
// estes mesmos tipos atraves de plugins (src/lib/imuni-{dominio}/).
//
// Visao 1/Mai/2026 (diretiva Fabio): IMUNI eh produto separado da Pegue,
// reutilizavel em multiplos negocios. Pegue eh apenas o primeiro caso de
// uso — a fonte de aprendizado e a prova de valor.

export type Severidade = "alta" | "media" | "baixa";

/**
 * Resultado da execucao de uma invariante.
 *
 * Invariantes sao assercoes sobre ESTADO que devem ser sempre verdadeiras
 * num sistema saudavel. Ex: "todo cliente VIP tem cupom ativo", "toda
 * cobranca enviada tem registro fiscal". Quando falsas, indicam bug
 * latente, fraude ou estado inconsistente que precisa atencao humana.
 */
export interface ResultadoInvariante {
  /** ID curto da invariante (ex: "INV-1", "OTIMIZI-INV-3"). */
  nome: string;
  /** Frase em portugues claro do que a invariante valida. */
  descricao: string;
  /** "alta" notifica admin imediato; "media" so log + agregado; "baixa" historico. */
  severidade: Severidade;
  /** Quantos casos foram encontrados violando a invariante. */
  count: number;
  /** Ate 5 exemplos (com PII mascarada quando aplicavel). */
  amostra: any[];
  /** true se count === 0 (invariante saudavel). */
  ok: boolean;
  /** Instrucao operacional pro admin sobre como agir. */
  comoAgir: string;
  /** Se a propria execucao falhou (ex: query erro), captura aqui. */
  erro?: string;
}

/**
 * Funcao que implementa uma invariante. Sem parametros — toda informacao
 * vem do estado do banco. Retorna sempre — nunca lanca; falhas viram
 * `erro` no resultado.
 */
export type InvarianteFn = () => Promise<ResultadoInvariante>;

/**
 * Configuracao de um plugin IMUNI. Plugin = conjunto de invariantes
 * de um dominio especifico (Pegue, Otimizi, etc).
 */
export interface PluginImuni {
  /** Nome do dominio (ex: "pegue", "otimizi"). Aparece em logs/alertas. */
  dominio: string;
  /** Lista de funcoes que checam invariantes desse dominio. */
  invariantes: InvarianteFn[];
}
