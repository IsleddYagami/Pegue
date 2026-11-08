// Google Maps Geocoding API adapter.
//
// Quando ativado (chave presente — ver chave-google.ts), substitui Nominatim
// como geocoder primario. Cobertura ~99% Brasil vs ~80% Nominatim.
//
// Custo (conferido na tabela oficial em 8/Nov/2026): o SKU "Geocoding" e da
// categoria Essentials — 10.000 chamadas GRATIS por mes, depois US$ 5,00 por
// mil. O credito de US$ 200/mes que estava escrito aqui NAO existe mais: a
// Google trocou por franquia gratuita por SKU em 1/Mar/2025.
// Volume Pegue (~600/mes) = 6% da franquia. Gratis de verdade, com folga.
// https://developers.google.com/maps/billing-and-pricing/pricing
// https://developers.google.com/maps/billing-and-pricing/march-2025
// Reference: https://developers.google.com/maps/documentation/geocoding
//
// IMPORTANTE: nao quebra fluxo se chave ausente — retorna null e
// caller cai pro Nominatim automaticamente.

import { chaveGoogle } from "./chave-google";

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export interface GoogleGeocodeResult {
  lat: number;
  lng: number;
  enderecoFormatado: string;
  // UF e cidade vem de address_components. A UF e o que decide se a Pegue
  // atende: SP (capital, litoral e interior). null quando o Google nao disse.
  uf: string | null;
  cidade: string | null;
  // location_type: ROOFTOP > RANGE_INTERPOLATED > GEOMETRIC_CENTER > APPROXIMATE
  precisao: "ROOFTOP" | "RANGE_INTERPOLATED" | "GEOMETRIC_CENTER" | "APPROXIMATE" | "UNKNOWN";
  // partial_match=true se Google teve que adivinhar parte do endereco
  partial: boolean;
}

// Le um address_component pelo tipo. short=true pega a sigla (SP), senao o
// nome por extenso (Osasco).
function componente(
  components: any[] | undefined,
  tipo: string,
  short = false,
): string | null {
  if (!Array.isArray(components)) return null;
  const c = components.find((x) => Array.isArray(x?.types) && x.types.includes(tipo));
  const v = short ? c?.short_name : c?.long_name;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function googleGeocodeAtivo(): boolean {
  return !!chaveGoogle();
}

// Geocode forward: endereco -> coords
export async function googleGeocode(
  endereco: string,
  timeoutMs = 4000,
): Promise<GoogleGeocodeResult | null> {
  const key = chaveGoogle();
  if (!key) return null;
  if (!endereco || endereco.trim().length < 3) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // region=br vies Brasil. components=country:BR garante so resultados BR.
    // language=pt-BR formata enderecos em portugues.
    const url = `${GOOGLE_GEOCODE_URL}?address=${encodeURIComponent(endereco)}&region=br&language=pt-BR&components=country:BR&key=${key}`;
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!r.ok) {
      console.warn(`[google-geocode] HTTP ${r.status}`);
      return null;
    }

    const data = await r.json();

    // Google retorna status="OK" so quando achou. ZERO_RESULTS = nao achou.
    // OVER_QUERY_LIMIT = passou da franquia (alarme!). REQUEST_DENIED = chave
    // invalida ou API nao habilitada. INVALID_REQUEST = malformado.
    if (data.status === "OVER_QUERY_LIMIT") {
      console.error("[google-geocode] OVER_QUERY_LIMIT — passou da franquia $200/mes!");
      return null;
    }
    if (data.status === "REQUEST_DENIED") {
      console.error("[google-geocode] REQUEST_DENIED:", data.error_message);
      return null;
    }
    if (data.status !== "OK" || !data.results?.length) return null;

    const result = data.results[0];
    const loc = result.geometry?.location;
    if (typeof loc?.lat !== "number" || typeof loc?.lng !== "number") return null;

    return {
      lat: loc.lat,
      lng: loc.lng,
      enderecoFormatado: result.formatted_address || endereco,
      uf: componente(result.address_components, "administrative_area_level_1", true),
      cidade:
        componente(result.address_components, "administrative_area_level_2") ||
        componente(result.address_components, "locality"),
      precisao: result.geometry?.location_type || "UNKNOWN",
      partial: !!result.partial_match,
    };
  } catch (e: any) {
    if (e?.name !== "AbortError") {
      console.warn("[google-geocode] excecao:", e?.message);
    }
    return null;
  }
}

// Reverse: coords -> endereco formatado
export async function googleReverseGeocode(
  lat: number,
  lng: number,
  timeoutMs = 4000,
): Promise<{ enderecoFormatado: string; bairro: string | null; cidade: string | null } | null> {
  const key = chaveGoogle();
  if (!key) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const url = `${GOOGLE_GEOCODE_URL}?latlng=${lat},${lng}&language=pt-BR&result_type=street_address|route|premise|neighborhood&key=${key}`;
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!r.ok) return null;
    const data = await r.json();
    if (data.status !== "OK" || !data.results?.length) {
      // Tenta de novo sem result_type filtrado (mais permissivo)
      const url2 = `${GOOGLE_GEOCODE_URL}?latlng=${lat},${lng}&language=pt-BR&key=${key}`;
      const r2 = await fetch(url2);
      if (!r2.ok) return null;
      const d2 = await r2.json();
      if (d2.status !== "OK" || !d2.results?.length) return null;
      return parseReverse(escolherMelhorReverso(d2.results));
    }

    // BUG REAL 8/Mai (Natan 11994207932): Google retornou
    // "R. Arinos, 766" pra coords exatas que estavam em "Rua Serra das
    // Antas". Pegar o primeiro result eh o street_address da casa numerada
    // mais proxima — que pode ser na rua VIZINHA. Cliente recebe endereco
    // INVENTADO e desconfia do sistema.
    //
    // Fix: priorizar 'route' (rua sem numero arbitrario) em vez de
    // 'street_address' (casa numerada que pode ser na rua errada).
    return parseReverse(escolherMelhorReverso(data.results));
  } catch (e: any) {
    if (e?.name !== "AbortError") {
      console.warn("[google-reverse] excecao:", e?.message);
    }
    return null;
  }
}

// Escolhe o melhor resultado do reverse geocode pra mostrar pro cliente.
// Prioridade:
//   1. 'route' (rua sem numero) — mais confiavel, nao inventa casa
//   2. 'street_address' (casa numerada — pode ser na rua errada se
//      coord estiver na fronteira)
//   3. 'premise' / 'neighborhood' / qualquer outro
//
// Bug 8/Mai (Natan): coord em Rua Serra das Antas retornava
// 'R. Arinos, 766' (casa vizinha). Agora prefere a rua exata.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function escolherMelhorReverso(results: any[]): any {
  const rota = results.find((r) =>
    (r.types || []).includes("route"),
  );
  if (rota) return rota;
  const street = results.find((r) =>
    (r.types || []).includes("street_address"),
  );
  if (street) return street;
  return results[0];
}

function parseReverse(result: any): { enderecoFormatado: string; bairro: string | null; cidade: string | null } {
  const comps = result.address_components || [];
  const find = (tipo: string) =>
    comps.find((c: any) => c.types?.includes(tipo))?.long_name || null;

  const bairro = find("sublocality_level_1") || find("sublocality") || find("neighborhood");
  const cidade = find("administrative_area_level_2") || find("locality");

  return {
    enderecoFormatado: result.formatted_address || "Localizacao recebida",
    bairro,
    cidade,
  };
}
