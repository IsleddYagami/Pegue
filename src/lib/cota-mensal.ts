// Teto de chamadas por MES em API paga de fora.
//
// ORDEM DO FABIO (8/Nov/2026), ao autorizar o Google Places:
// *"se esse recurso eu nao gastar nada ok"*.
//
// "Nao gastar nada" nao pode ser confianca no volume — tem que ser trava. O
// Google da 10.000 chamadas gratis por mes no SKU Autocomplete e cobra US$ 2,83
// por mil depois disso. Sem teto, um robo batendo no /api/bairros viraria
// fatura: o limite por IP (40/min) ainda deixaria passar centenas de milhares
// de chamadas no mes.
//
// Entao: contamos as chamadas do mes e paramos ANTES da franquia acabar. Teto
// batido = a busca volta pro OpenStreetMap e pra lista dos 645 municipios, que
// sao de graca. A pessoa perde sugestao boa, nunca perde o orcamento — e a
// Pegue nao recebe conta.
//
// Onde conta: a tabela rate_limit_buckets, que ja existe e ja e usada pelo
// rate limit. A janela aqui e o mes do calendario ("2026-11"), igual ao da
// franquia do Google, em vez do balde de minutos do rate-limit.
//
// LIMITE CONHECIDO: o incremento e SELECT + UPDATE, nao atomico (o mesmo do
// rate-limit). Duas chamadas no mesmo instante podem contar como uma. Por isso
// o teto fica 2.000 chamadas ABAIXO da franquia: a folga cobre a corrida.

/** Franquia gratuita do SKU Autocomplete Requests (Essentials), por mes. */
export const FRANQUIA_GOOGLE_AUTOCOMPLETE = 10_000;

/** Onde paramos. A folga cobre a contagem nao atomica e qualquer surpresa. */
export const TETO_PLACES_MES = 8_000;

/** Mes do calendario em UTC, no formato "2026-11". */
export function mesAtual(agora: Date = new Date()): string {
  return agora.toISOString().slice(0, 7);
}

export interface Cota {
  permitido: boolean;
  contador: number;
  teto: number;
  mes: string;
}

/**
 * Soma 1 ao contador do mes e diz se ainda pode chamar.
 *
 * Nunca lanca: se o banco falhar, devolve `permitido: false`. Falha de
 * contagem tem que virar "nao chama a API paga", nunca "chama sem contar" —
 * um contador cego e exatamente como nasce uma fatura inesperada.
 */
export async function consumirCotaMensal(cfg: {
  servico: string;
  teto?: number;
}): Promise<Cota> {
  const mes = mesAtual();
  const teto = cfg.teto ?? TETO_PLACES_MES;
  const chave = `cota:${cfg.servico}`;

  try {
    // Import tardio de proposito: supabase-admin lanca na hora de CARREGAR se
    // a chave de servico nao estiver no ambiente. Carregando so aqui, as
    // constantes e o mesAtual continuam testaveis fora do servidor.
    const { supabaseAdmin: supabase } = await import("@/lib/supabase-admin");

    const { data: atual } = await supabase
      .from("rate_limit_buckets")
      .select("contador")
      .eq("chave", chave)
      .eq("janela_iso", mes)
      .maybeSingle();

    const novo = (atual?.contador || 0) + 1;

    if (atual) {
      await supabase
        .from("rate_limit_buckets")
        .update({ contador: novo })
        .eq("chave", chave)
        .eq("janela_iso", mes);
    } else {
      await supabase
        .from("rate_limit_buckets")
        .insert({ chave, janela_iso: mes, contador: 1 });
    }

    return { permitido: novo <= teto, contador: novo, teto, mes };
  } catch {
    return { permitido: false, contador: -1, teto, mes };
  }
}
