// Validacoes de sanidade de preco antes do cliente ver o valor.
// Duas camadas:
// 1. Limites absolutos por veiculo (hardcoded) - pega erros absurdos
// 2. Validacao cruzada com historico recente - pega anomalias sutis
//
// Se preco for anomalo: cotacao fica em "revisao_admin", bot avisa cliente
// que equipe vai responder em instantes, e notifica admin pra aprovar.

import { supabase } from "@/lib/supabase";

// === CAMADA 1: Limites absolutos por veiculo (cliente final paga) ===
// Esses sao os tetos. Acima disso = quase certo que tem erro em algum lugar.
const LIMITES_PRECO: Record<string, { min: number; max: number }> = {
  carro_comum: { min: 120, max: 500 },
  utilitario: { min: 150, max: 800 },
  hr: { min: 220, max: 1800 },
  caminhao_bau: { min: 500, max: 4000 },
  guincho: { min: 150, max: 800 },
  moto_guincho: { min: 130, max: 600 },
};

export type ResultadoSanidade =
  | { ok: true; preco: number; motivo?: string }
  | { ok: false; precoOriginal: number; motivo: string; tipo: "acima_max" | "anomalia_historica" };

export function validarLimiteAbsoluto(
  preco: number,
  veiculo: string
): ResultadoSanidade {
  const limite = LIMITES_PRECO[veiculo];
  if (!limite) {
    // Veiculo desconhecido: nao trava mas registra
    return { ok: true, preco };
  }

  // ABAIXO DO MINIMO: cobra o minimo automaticamente (nao trava)
  if (preco < limite.min) {
    return {
      ok: true,
      preco: limite.min,
      motivo: `Preco calculado R$ ${preco} abaixo do minimo R$ ${limite.min}, cobrado minimo automaticamente`,
    };
  }

  // ACIMA DO MAXIMO: bloqueia, precisa revisao manual
  if (preco > limite.max) {
    return {
      ok: false,
      precoOriginal: preco,
      motivo: `Preco calculado R$ ${preco} acima do limite R$ ${limite.max} pra ${veiculo}`,
      tipo: "acima_max",
    };
  }

  return { ok: true, preco };
}

// === CAMADA 2: Validacao cruzada com historico recente ===
// Compara cotacao atual com media de cotacoes similares dos ultimos 30 dias.
// Se variacao for grande (40%+), sinaliza.
export async function validarComHistorico(
  precoAtual: number,
  cenario: {
    veiculo: string;
    km: number;
    qtdItens: number;
    temAjudante: boolean;
  }
): Promise<ResultadoSanidade> {
  try {
    // Busca cotacoes similares dos ultimos 30 dias (janela ampla pra ter volume)
    const kmMin = Math.max(1, cenario.km - 5);
    const kmMax = cenario.km + 5;
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const { data } = await supabase
      .from("corridas")
      .select("valor_estimado, valor_final")
      .eq("tipo_veiculo", cenario.veiculo)
      .gte("distancia_km", kmMin)
      .lte("distancia_km", kmMax)
      .gte("criado_em", trintaDiasAtras.toISOString())
      .in("status", ["aceita", "paga", "concluida"]); // so corridas que rodaram, nao pendentes

    if (!data || data.length < 3) {
      // Menos de 3 cotacoes historicas similares - sem dados suficientes, deixa passar
      return { ok: true, preco: precoAtual };
    }

    // Calcula media das cotacoes (prefere valor_final, cai pra valor_estimado)
    const precos = data
      .map(c => c.valor_final || c.valor_estimado)
      .filter(v => v && v > 0);
    if (precos.length < 3) {
      return { ok: true, preco: precoAtual };
    }

    const mediaHistorica = precos.reduce((a, b) => a + b, 0) / precos.length;
    const variacao = ((precoAtual - mediaHistorica) / mediaHistorica) * 100;

    // Se variacao maior que 40% (pra mais OU pra menos), e anomalia
    if (Math.abs(variacao) > 40) {
      return {
        ok: false,
        precoOriginal: precoAtual,
        motivo: `Preco R$ ${precoAtual} ${variacao > 0 ? "acima" : "abaixo"} da media historica (R$ ${Math.round(mediaHistorica)}, baseado em ${precos.length} corridas). Variacao ${Math.round(variacao)}%`,
        tipo: "anomalia_historica",
      };
    }

    return { ok: true, preco: precoAtual };
  } catch (e: any) {
    // Em caso de erro na consulta, deixa passar (melhor ter cotacao que travar)
    console.error("Erro validacao historica:", e?.message);
    return { ok: true, preco: precoAtual };
  }
}

// Funcao principal: aplica as 2 camadas em sequencia
export async function validarPrecoFinal(
  preco: number,
  cenario: {
    veiculo: string;
    km: number;
    qtdItens: number;
    temAjudante: boolean;
  }
): Promise<ResultadoSanidade> {
  // Camada 1: limite absoluto
  const c1 = validarLimiteAbsoluto(preco, cenario.veiculo);
  if (!c1.ok) return c1; // se abaixo do min, ja aplicou correcao. Se acima do max, bloqueia

  // Camada 2: historico (so se camada 1 passou)
  const c2 = await validarComHistorico(c1.preco, cenario);
  if (!c2.ok) return c2;

  return { ok: true, preco: c1.preco, motivo: c1.motivo };
}
