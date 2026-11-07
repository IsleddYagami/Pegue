// Buscar o BAIRRO e a tela mostrar em quais cidades ele existe — o jeito Waze.
//
// ORDEM DO FABIO (7/Nov/2026), depois de a primeira versao dar erro na mao
// dele: *"ja deu erro estou escrevendo o a cidade e nao esta reconhecendo, o
// certo seria assim q ele colocar o birro em baixo aparecer as cidades que tem
// bairro com aquele nome igual o waze"*.
//
// Antes eram dois campos: escrever o bairro e, separado, escolher a cidade.
// Quem digitava a cidade e nao TOCAVA no nome da lista ficava preso, com o
// botao apagado. Agora o bairro manda: a pessoa escreve uma vez e toca na
// linha "Bairro · Cidade".
//
// DE ONDE VEM A LISTA
// Nominatim (OpenStreetMap), a mesma fonte que o projeto ja usa como rede de
// seguranca do geocoder. E gratuita e nao precisa de chave.
//
// O QUE ELA NAO TEM — e por que a tela nao depende so dela
// O OSM nao conhece todo bairro do Brasil. Conferido nesta maquina em
// 7/Nov/2026: "Centro" devolve Guarulhos, Santos, Santo Andre, Taboao,
// Diadema, Avare, Campinas e Ribeirao Preto — perfeito. Mas "Vila Yara", que
// e bairro de verdade em Osasco, **nao existe no OSM**: a busca devolve um
// Vila Yara em Sao Goncalo (RJ) e um bairro vizinho errado em Sao Paulo.
// E a mesma falha que derrubou um cliente real em 28/Abr com "Vila Atlantico"
// (registrada no comentario do geocodeAddress).
//
// Por isso a tela SEMPRE deixa o caminho manual aberto: "nao achou? escolhe a
// cidade" cai na lista local dos 645 municipios, que nao depende de internet
// nem de API nenhuma. Sugestao que falha vira inconveniente, nao bloqueio.
//
// E o PRECO nao passa por aqui: quem cota continua sendo o geocoder completo
// (Google + Nominatim) no servidor, com "Bairro, Cidade, SP". Esta busca so
// ajuda a preencher o formulario.

import { cidadeValida, semAcento } from "./cidades-sp";

export const MIN_LETRAS_BUSCA = 3;
export const MAX_SUGESTOES = 8;

export interface SugestaoBairro {
  bairro: string;
  cidade: string;
}

/** Pedaco do que o Nominatim devolve que a gente usa. O resto e ignorado. */
interface ResultadoNominatim {
  name?: string;
  addresstype?: string;
  address?: {
    suburb?: string;
    neighbourhood?: string;
    quarter?: string;
    city_district?: string;
    residential?: string;
    city?: string;
    town?: string;
    municipality?: string;
    village?: string;
    state?: string;
  };
}

/** Tipos de lugar que valem como bairro. Rua, estacao e loja nao entram. */
const TIPOS_DE_BAIRRO = new Set([
  "suburb",
  "neighbourhood",
  "quarter",
  "city_district",
  "residential",
  "village",
  "hamlet",
]);

function nomeDoBairro(r: ResultadoNominatim): string | null {
  const a = r.address ?? {};
  const candidato =
    a.suburb || a.neighbourhood || a.quarter || a.city_district || a.residential || r.name;
  return candidato ? String(candidato).trim() : null;
}

function nomeDaCidade(r: ResultadoNominatim): string | null {
  const a = r.address ?? {};
  const candidato = a.city || a.town || a.municipality || a.village;
  return candidato ? String(candidato).trim() : null;
}

/**
 * Transforma a resposta crua do Nominatim na lista que a tela mostra.
 *
 * Regras, todas por um motivo:
 *  - so estado de Sao Paulo: a Pegue nao atende fora, e "Centro" existe em
 *    todo municipio do Brasil;
 *  - a cidade tem que existir na lista oficial do IBGE, senao o OSM manda
 *    nome de distrito que nao e municipio e a cotacao quebra depois;
 *  - o bairro tem que COMECAR com o que a pessoa digitou — sem isso, digitar
 *    "Vila Yara" devolve "Vila Grao Mogol" e a pessoa acha que escolheu certo;
 *  - uma linha por cidade: o OSM repete o mesmo bairro em varios nos.
 */
export function normalizarSugestoes(
  bruto: unknown,
  termoDigitado: string,
  limite = MAX_SUGESTOES,
): SugestaoBairro[] {
  if (!Array.isArray(bruto)) return [];
  const termo = semAcento(termoDigitado);
  if (termo.length < MIN_LETRAS_BUSCA) return [];

  const vistos = new Set<string>();
  const saida: SugestaoBairro[] = [];

  for (const cru of bruto as ResultadoNominatim[]) {
    if (!cru || typeof cru !== "object") continue;
    if (cru.addresstype && !TIPOS_DE_BAIRRO.has(cru.addresstype)) continue;
    if ((cru.address?.state ?? "") !== "São Paulo") continue;

    const bairro = nomeDoBairro(cru);
    const cidade = nomeDaCidade(cru);
    if (!bairro || !cidade) continue;
    if (!cidadeValida(cidade)) continue;
    if (!semAcento(bairro).startsWith(termo)) continue;

    const chave = `${semAcento(bairro)}|${semAcento(cidade)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    saida.push({ bairro, cidade });
    if (saida.length >= limite) break;
  }

  return saida;
}

/**
 * URL da busca. Fica aqui pra ter teste e nao viver solta dentro da rota.
 *
 * O ", São Paulo, Brasil" no fim NAO e enfeite: medido em 7/Nov/2026, buscar
 * so "Centro" devolve 12 linhas quase todas de outros estados (Alagoas, Rio
 * Grande do Sul...) e sobram 2 cidades paulistas depois do filtro. Com o
 * estado na busca, sobram 8 — Guarulhos, Santos, Santo Andre, Taboao,
 * Diadema, Avare, Campinas, Ribeirao Preto. O filtro por estado continua
 * valendo do mesmo jeito; isto so faz o Nominatim procurar no lugar certo.
 */
export function urlNominatim(termo: string, limite = 20): string {
  const p = new URLSearchParams({
    q: `${termo}, São Paulo, Brasil`,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limite),
    countrycodes: "br",
  });
  return `https://nominatim.openstreetmap.org/search?${p.toString()}`;
}
