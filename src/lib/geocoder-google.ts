// Google Maps Geocoding API adapter.
//
// Quando ativado (GOOGLE_MAPS_API_KEY presente), substitui Nominatim
// como geocoder primario. Cobertura ~99% Brasil vs ~80% Nominatim.
//
// Custo: $200 free credit/mes da Google = ~40k requests gratis.
// Volume Pegue (~600/mes) = ~1.5% da franquia. Gratis na pratica.
// Reference: https://developers.google.com/maps/documentation/geocoding
//
// IMPORTANTE: nao quebra fluxo se chave ausente — retorna null e
// caller cai pro Nominatim automaticamente.

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export interface GoogleGeocodeResult {
  lat: number;
  lng: number;
  enderecoFormatado: string;
  // location_type: ROOFTOP > RANGE_INTERPOLATED > GEOMETRIC_CENTER > APPROXIMATE
  precisao: "ROOFTOP" | "RANGE_INTERPOLATED" | "GEOMETRIC_CENTER" | "APPROXIMATE" | "UNKNOWN";
  // partial_match=true se Google teve que adivinhar parte do endereco
  partial: boolean;
}

export function googleGeocodeAtivo(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

// Geocode forward: endereco -> coords
export async function googleGeocode(
  endereco: string,
  timeoutMs = 4000,
): Promise<GoogleGeocodeResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
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
  const key = process.env.GOOGLE_MAPS_API_KEY;
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
      return parseReverse(d2.results[0]);
    }

    return parseReverse(data.results[0]);
  } catch (e: any) {
    if (e?.name !== "AbortError") {
      console.warn("[google-reverse] excecao:", e?.message);
    }
    return null;
  }
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
