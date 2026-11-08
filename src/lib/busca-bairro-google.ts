// Buscar bairro no Google Places — o mapa que TEM os bairros que o
// OpenStreetMap nao tem (ex: Vila Yara, em Osasco).
//
// POR QUE ISTO EXISTE
// A busca por Nominatim/OSM (lib/busca-bairro) acerta "Centro", "Jardim das
// Flores", "Vila Mariana" — e nao conhece "Vila Yara", que e bairro de verdade.
// A mesma falha derrubou um cliente real em 28/Abr com "Vila Atlantico".
//
// O QUE CUSTA (conferido na tabela oficial do Google em 8/Nov/2026)
// SKU "Autocomplete Requests", categoria Essentials: 10.000 chamadas GRATIS
// por mes; depois US$ 2,83 por mil. Nao chamamos Place Details (que e cobrado
// a parte) — o bairro e a cidade vem na propria resposta do autocomplete, em
// structuredFormat. Logo, uma busca = uma chamada de UM unico SKU.
// https://developers.google.com/maps/billing-and-pricing/pricing
//
// ORDEM DO FABIO (8/Nov/2026): *"se esse recurso eu nao gastar nada ok"*.
// Entao o gasto zero nao e promessa, e trava: lib/cota-mensal corta em 8.000
// chamadas por mes (2.000 de folga dentro da franquia) e a tela volta pro OSM
// + lista dos 645 municipios. Teto alcancado = busca pior, nunca conta.
//
// Docs do pedido e da resposta:
// https://developers.google.com/maps/documentation/places/web-service/place-autocomplete

import { cidadeValida, semAcento } from "./cidades-sp";
import { MAX_SUGESTOES, MIN_LETRAS_BUSCA, type SugestaoBairro } from "./busca-bairro";

export const URL_AUTOCOMPLETE = "https://places.googleapis.com/v1/places:autocomplete";

/** O Google cobra por campo pedido; pedimos so o que a tela usa. */
export const FIELD_MASK =
  "suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types";

/**
 * Retangulo do estado de Sao Paulo (extremos: Rosana a oeste, Ubatuba a leste,
 * Barra do Turvo ao sul, norte na divisa com Minas). Com folga de ~5 km.
 *
 * Nao e o filtro de verdade — quem decide se a cidade existe e a lista do IBGE
 * em cidades-sp. Isto so faz o Google procurar no lugar certo.
 */
export const RETANGULO_SP = {
  low: { latitude: -25.4, longitude: -53.2 },
  high: { latitude: -19.7, longitude: -44.1 },
};

/** Tipos que valem como bairro (Table B do Google). Rua e cidade nao entram. */
const TIPOS_DE_BAIRRO = new Set([
  "neighborhood",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "sublocality_level_3",
  "sublocality_level_4",
  "sublocality_level_5",
]);

interface PredicaoGoogle {
  placePrediction?: {
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
    types?: string[];
  };
}

/**
 * Corpo do POST.
 *
 * Nao mandamos `regionCode`: a doc do Google avisa que com ele o
 * `secondaryText` pode vir vazio — e o secondaryText e justamente de onde sai
 * a CIDADE. O pais entra por `includedRegionCodes`, que nao tem esse efeito.
 *
 * `includedPrimaryTypes: ["(regions)"]` e o unico jeito documentado de pedir
 * "areas e divisoes, como bairros". Vem cidade e CEP junto; quem separa e o
 * filtro por tipo na normalizacao.
 */
export function corpoAutocomplete(termo: string) {
  return {
    input: termo,
    includedPrimaryTypes: ["(regions)"],
    includedRegionCodes: ["br"],
    locationRestriction: { rectangle: RETANGULO_SP },
    languageCode: "pt-BR",
  };
}

/**
 * Tira a cidade de um texto do Google.
 *
 * Formatos vistos na doc e no app: "Osasco - SP, Brasil",
 * "Jundiai - Sao Paulo, Brasil", "Centro, Santos - SP, Brasil".
 * Varre pedaco por pedaco e aceita o PRIMEIRO que for municipio paulista —
 * a cidade sempre vem antes do estado, entao a ordem resolve o caso em que
 * "Sao Paulo" e cidade e estado ao mesmo tempo.
 */
export function cidadeDoTexto(texto: string | undefined): string | null {
  if (!texto) return null;
  for (const bruto of texto.split(",")) {
    let pedaco = bruto.trim();
    if (!pedaco) continue;
    // "Osasco - SP" / "Jundiai - Sao Paulo" -> "Osasco" / "Jundiai"
    const corte = pedaco.lastIndexOf(" - ");
    if (corte > 0) {
      const antes = pedaco.slice(0, corte).trim();
      if (cidadeValida(antes)) return antes;
      pedaco = antes || pedaco;
    }
    if (cidadeValida(pedaco)) return pedaco;
  }
  return null;
}

/**
 * Resposta crua do Google -> lista "Bairro · Cidade" que a tela mostra.
 *
 * As regras sao as MESMAS do caminho do OSM, de proposito: a tela nao muda de
 * comportamento quando a fonte muda.
 *  - so vale o que o Google marcou como bairro/sublocality;
 *  - a cidade tem que existir na lista do IBGE;
 *  - o bairro tem que COMECAR com o que a pessoa digitou (senao digitar
 *    "Vila Yara" devolve "Vila Grao Mogol" e ela acha que escolheu certo);
 *  - uma linha por cidade.
 */
export function normalizarGoogle(
  bruto: unknown,
  termoDigitado: string,
  limite = MAX_SUGESTOES,
): SugestaoBairro[] {
  const lista = (bruto as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(lista)) return [];

  const termo = semAcento(termoDigitado);
  if (termo.length < MIN_LETRAS_BUSCA) return [];

  const vistos = new Set<string>();
  const saida: SugestaoBairro[] = [];

  for (const cru of lista as PredicaoGoogle[]) {
    const p = cru?.placePrediction;
    if (!p) continue;

    const tipos = Array.isArray(p.types) ? p.types : [];
    if (!tipos.some((t) => TIPOS_DE_BAIRRO.has(t))) continue;

    const bairro = p.structuredFormat?.mainText?.text?.trim();
    if (!bairro) continue;
    if (!semAcento(bairro).startsWith(termo)) continue;

    // Primeiro o secondaryText ("Osasco - SP, Brasil"); se vier vazio, a
    // descricao inteira ("Vila Yara, Osasco - SP, Brasil") ainda tem a cidade.
    const cidade =
      cidadeDoTexto(p.structuredFormat?.secondaryText?.text) ?? cidadeDoTexto(p.text?.text);
    if (!cidade) continue;

    const chave = `${semAcento(bairro)}|${semAcento(cidade)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    saida.push({ bairro, cidade });
    if (saida.length >= limite) break;
  }

  return saida;
}
