// Segunda chance pra BAIRRO DE DIVISA.
//
// A trava de cidade (lib/cotacao) recusa quando o mapa confirma uma cidade
// diferente da que a pessoa escolheu. Isso esta certo pro caso que motivou a
// trava — "Centro, Sao Paulo" caindo em Diadema — mas pegava junto um caso
// legitimo: Alphaville e' endereco de Barueri e o mapa devolve Santana de
// Parnaiba. Medido em 21/Nov/2026: o ponto fica a 4,2 km do centro de Barueri
// e a cotacao da' 15,0 km contra 15,1 km do centro — o mesmo preco.
//
// Entao: so' quando a primeira decisao recusou por cidade, a gente busca o
// centro da cidade ESCOLHIDA e decide de novo. Uma chamada a mais de geocode,
// e so' no caso raro — nao em toda cotacao.

import { geocodeAddress } from "@/lib/bot-utils";
import {
  decidirCotacao,
  cidadeConfere,
  type Cotacao,
  type PedidoCotacao,
  type Ponto,
  type Recusa,
} from "@/lib/cotacao";

/**
 * Decide a cotacao e, se a recusa for de cidade, tenta de novo com o centro da
 * cidade escolhida em maos. Qualquer outra recusa volta na hora.
 */
export async function decidirCotacaoComDivisa(
  pedido: PedidoCotacao,
  geoOrigem: Ponto | null,
  geoDestino: Ponto | null,
): Promise<Cotacao | Recusa> {
  const primeira = decidirCotacao(pedido, geoOrigem, geoDestino);
  if (primeira.ok || primeira.motivo !== "cidade_nao_confere") return primeira;

  // Busca o centro so' da ponta que divergiu.
  const precisaOrigem = !!geoOrigem && !cidadeConfere(pedido.cidadeOrigem, geoOrigem.cidade);
  const precisaDestino = !!geoDestino && !cidadeConfere(pedido.cidadeDestino, geoDestino.cidade);

  const [origem, destino] = await Promise.all([
    precisaOrigem && pedido.cidadeOrigem ? geocodeAddress(`${pedido.cidadeOrigem}, SP`) : null,
    precisaDestino && pedido.cidadeDestino ? geocodeAddress(`${pedido.cidadeDestino}, SP`) : null,
  ]);

  return decidirCotacao(pedido, geoOrigem, geoDestino, { origem, destino });
}
