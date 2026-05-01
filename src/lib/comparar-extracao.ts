// Compara extracao da IA com valores finais da corrida pra calcular
// taxa de acerto por campo. Funcao pura — testavel sem mock.
//
// Estrategia de comparacao por tipo de campo:
//   - Boolean: match exato (true === true)
//   - Enum: match exato com mapeamento (servico → tipo_servico)
//   - String endereco: fuzzy (substring lowercase ou primeira palavra match)
//   - Numero: faixa ±20% pra qtd_caixas/sacolas, exato pra andares
//   - Itens (array de strings): pelo menos 50% dos itens da IA aparecem na descricao final

export interface ContextoIA {
  servico?: string | null;
  itens?: string[];
  qtd_caixas?: number | null;
  qtd_sacolas?: number | null;
  veiculo_marca_modelo?: string | null;
  origem_texto?: string | null;
  destino_texto?: string | null;
  andar_origem?: number | null;
  tem_escada_origem?: boolean;
  tem_elevador_destino?: boolean;
  precisa_ajudante?: boolean;
  data_texto?: string | null;
  periodo?: string | null;
  veiculo_sugerido?: string | null;
  confianca?: string;
}

export interface ValoresFinaisCorrida {
  tipo_servico?: string | null;            // "frete" / "guincho"
  tipo_veiculo?: string | null;            // "utilitario" / "hr" / "caminhao_bau" / "carro_comum" / "guincho"
  descricao_carga?: string | null;         // texto livre com itens / descricao guincho
  origem_endereco?: string | null;
  destino_endereco?: string | null;
  andares_origem?: number | null;
  escada_origem?: boolean;
  elevador_destino?: boolean;
  qtd_ajudantes?: number | null;
  periodo?: string | null;
}

function normalizarStr(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
}

function fuzzyMatchEndereco(extraido: string | null | undefined, real: string | null | undefined): boolean {
  const a = normalizarStr(extraido);
  const b = normalizarStr(real);
  if (!a || !b) return false;
  if (a === b) return true;
  // Considera acerto se a string extraida (geralmente curta tipo "Osasco")
  // aparece dentro da string real (que costuma ser endereco completo).
  if (b.includes(a)) return true;
  if (a.includes(b)) return true;
  // Match palavra-a-palavra: pelo menos 1 palavra significativa em comum.
  const palavrasA = a.split(" ").filter((p) => p.length >= 4);
  const palavrasB = b.split(" ").filter((p) => p.length >= 4);
  if (palavrasA.length === 0 || palavrasB.length === 0) return false;
  return palavrasA.some((p) => palavrasB.includes(p));
}

function fuzzyMatchItens(itensIA: string[] | undefined, descricaoCarga: string | null | undefined): boolean | null {
  if (!itensIA || itensIA.length === 0) return null; // skip — IA nao extraiu
  if (!descricaoCarga) return false;
  const desc = normalizarStr(descricaoCarga);
  const acertos = itensIA.filter((item) => {
    const norm = normalizarStr(item);
    return norm && desc.includes(norm.split(" ")[0]); // 1a palavra do item
  }).length;
  return acertos / itensIA.length >= 0.5;
}

export interface ResultadoComparacao {
  campos_corretos: string[];
  campos_incorretos: string[];
  taxa_acerto: number; // 0..1
}

// Compara campo a campo. Campos que IA NAO extraiu (null) sao IGNORADOS
// (nao penaliza nem premia). Apenas conta acerto/erro quando ha valor.
export function compararExtracao(
  ia: ContextoIA,
  real: ValoresFinaisCorrida,
): ResultadoComparacao {
  const corretos: string[] = [];
  const incorretos: string[] = [];

  // === servico ===
  if (ia.servico) {
    // IA usa "frete"|"mudanca"|"guincho". Corrida usa "frete"|"guincho"
    // ("mudanca" da IA = "frete" no banco — corrida nao tem subtipo).
    const iaServico = ia.servico === "mudanca" ? "frete" : ia.servico;
    if (iaServico === real.tipo_servico) corretos.push("servico");
    else incorretos.push("servico");
  }

  // === origem ===
  if (ia.origem_texto) {
    if (fuzzyMatchEndereco(ia.origem_texto, real.origem_endereco)) corretos.push("origem");
    else incorretos.push("origem");
  }

  // === destino ===
  if (ia.destino_texto) {
    if (fuzzyMatchEndereco(ia.destino_texto, real.destino_endereco)) corretos.push("destino");
    else incorretos.push("destino");
  }

  // === veiculo_sugerido ===
  if (ia.veiculo_sugerido) {
    if (ia.veiculo_sugerido === real.tipo_veiculo) corretos.push("veiculo");
    else incorretos.push("veiculo");
  }

  // === precisa_ajudante (boolean → qtd_ajudantes>0) ===
  if (typeof ia.precisa_ajudante === "boolean") {
    const realPrecisa = (real.qtd_ajudantes || 0) > 0;
    if (ia.precisa_ajudante === realPrecisa) corretos.push("ajudante");
    else incorretos.push("ajudante");
  }

  // === andar_origem ===
  if (typeof ia.andar_origem === "number" && ia.andar_origem !== null) {
    if (ia.andar_origem === (real.andares_origem || 0)) corretos.push("andar");
    else incorretos.push("andar");
  }

  // === tem_escada_origem ===
  if (typeof ia.tem_escada_origem === "boolean") {
    if (ia.tem_escada_origem === !!real.escada_origem) corretos.push("escada");
    else incorretos.push("escada");
  }

  // === tem_elevador_destino ===
  if (typeof ia.tem_elevador_destino === "boolean") {
    if (ia.tem_elevador_destino === !!real.elevador_destino) corretos.push("elevador");
    else incorretos.push("elevador");
  }

  // === itens (fuzzy contra descricao_carga) ===
  const matchItens = fuzzyMatchItens(ia.itens, real.descricao_carga);
  if (matchItens !== null) {
    if (matchItens) corretos.push("itens");
    else incorretos.push("itens");
  }

  // === veiculo_marca_modelo (so guincho — busca em descricao_carga) ===
  if (ia.veiculo_marca_modelo) {
    const desc = normalizarStr(real.descricao_carga);
    const marca = normalizarStr(ia.veiculo_marca_modelo).split(" ")[0]; // "Honda Civic 2018" → "honda"
    if (marca && desc.includes(marca)) corretos.push("veiculo_marca");
    else incorretos.push("veiculo_marca");
  }

  // === periodo ===
  if (ia.periodo) {
    const realPeriodo = normalizarStr(real.periodo);
    if (realPeriodo.includes(ia.periodo)) corretos.push("periodo");
    else incorretos.push("periodo");
  }

  const total = corretos.length + incorretos.length;
  const taxa = total > 0 ? corretos.length / total : 0;

  return {
    campos_corretos: corretos,
    campos_incorretos: incorretos,
    taxa_acerto: Math.round(taxa * 1000) / 1000,
  };
}
