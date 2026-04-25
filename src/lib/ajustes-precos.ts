// Aplica ajustes manuais (regras de excecao) ao preco calculado pela formula base.
// Admin cria regras via WhatsApp ou painel. Sistema consulta e aplica quando bate nos criterios.

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

type AjusteRegra = {
  id: string;
  veiculo: string | null;
  zona: string | null;
  km_min: number | null;
  km_max: number | null;
  qtd_itens_min: number | null;
  qtd_itens_max: number | null;
  com_ajudante: boolean | null;
  fator_multiplicador: number;
  valor_fixo: number;
  descricao: string | null;
};

type CenarioCotacao = {
  veiculo: string;
  zona: string;
  km: number;
  qtdItens: number;
  comAjudante: boolean;
};

// Cache simples pra nao consultar banco a cada cotacao. Invalidar quando criar/editar regra.
let cacheRegras: AjusteRegra[] | null = null;
let cacheAte = 0;

async function getRegrasAtivas(): Promise<AjusteRegra[]> {
  if (cacheRegras && cacheAte > Date.now()) return cacheRegras;
  const { data } = await supabase
    .from("ajustes_precos")
    .select("*")
    .eq("ativo", true);
  cacheRegras = (data as AjusteRegra[] | null) || [];
  cacheAte = Date.now() + 60_000; // cache de 1 minuto
  return cacheRegras;
}

export function invalidarCacheAjustes() {
  cacheRegras = null;
  cacheAte = 0;
}

function regraAplicavel(regra: AjusteRegra, c: CenarioCotacao): boolean {
  if (regra.veiculo && regra.veiculo !== c.veiculo) return false;
  if (regra.zona && regra.zona !== c.zona) return false;
  if (regra.km_min !== null && c.km < regra.km_min) return false;
  if (regra.km_max !== null && c.km > regra.km_max) return false;
  if (regra.qtd_itens_min !== null && c.qtdItens < regra.qtd_itens_min) return false;
  if (regra.qtd_itens_max !== null && c.qtdItens > regra.qtd_itens_max) return false;
  if (regra.com_ajudante !== null && regra.com_ajudante !== c.comAjudante) return false;
  return true;
}

// Aplica as regras (se houver) sobre o preco ja calculado pela formula base.
// Se mais de 1 regra bater, aplica todas em sequencia (mult antes, valor_fixo depois).
// Retorna: preco final + lista de regras aplicadas (pra log/debug)
export async function aplicarAjustes(
  precoBase: number,
  cenario: CenarioCotacao
): Promise<{ precoFinal: number; regrasAplicadas: AjusteRegra[] }> {
  const regras = await getRegrasAtivas();
  const aplicaveis = regras.filter(r => regraAplicavel(r, cenario));

  let preco = precoBase;
  for (const r of aplicaveis) {
    preco = Math.round(preco * r.fator_multiplicador) + r.valor_fixo;
  }

  return { precoFinal: preco, regrasAplicadas: aplicaveis };
}

// Gera criterios "media" pra criar regra baseada numa simulacao que o admin avaliou
// Ex: HR + zona normal + 20-25km + 2-4 itens + com ajudante -> regra com esses ranges
export function criteriosMediaDaSimulacao(sim: {
  veiculo: string;
  rota: { km: number; zonaDestino: string };
  qtdItens: number;
  temAjudante: boolean;
}) {
  // Faixa de km: +- 5km do valor atual (minimo 1)
  const kmMin = Math.max(1, sim.rota.km - 5);
  const kmMax = sim.rota.km + 5;

  // Faixa de itens: +- 1 do valor atual (minimo 1)
  const qtdMin = Math.max(1, sim.qtdItens - 1);
  const qtdMax = sim.qtdItens + 1;

  return {
    veiculo: sim.veiculo,
    zona: sim.rota.zonaDestino,
    km_min: kmMin,
    km_max: kmMax,
    qtd_itens_min: qtdMin,
    qtd_itens_max: qtdMax,
    com_ajudante: sim.temAjudante,
  };
}
