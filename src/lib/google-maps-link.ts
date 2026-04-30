// Resolve link de Google Maps (incluindo shortlinks maps.app.goo.gl/) em
// coordenadas lat/lng. Cliente real 29/Abr (47-9901-0385) mandou shortlink
// em vez de seguir o tutorial de localizacao do clipe — sistema rejeitou.
//
// Patterns suportados:
//   https://maps.app.goo.gl/XXXX           (shortlink, segue redirect)
//   https://goo.gl/maps/XXXX               (legado, segue redirect)
//   https://www.google.com/maps/.../@-23.5,-46.6,17z/...
//   https://www.google.com/maps?q=-23.5,-46.6
//   https://maps.google.com/?q=-23.5,-46.6

const REGEX_LINK_MAPS = /(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.com\/maps|maps\.google\.com)\/?[^\s]*/i;

export function detectarLinkGoogleMaps(texto: string): string | null {
  if (!texto) return null;
  const m = texto.match(REGEX_LINK_MAPS);
  if (!m) return null;
  let url = m[0];
  if (!/^https?:\/\//.test(url)) url = "https://" + url;
  return url;
}

// Extrai lat/lng de uma URL ja "resolvida" (sem shortlink).
// Suporta varios formatos do Google Maps web.
function extrairCoordsDeUrl(url: string): { lat: number; lng: number } | null {
  // pattern: @-23.5,-46.6,17z (place)
  let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

  // pattern: !3d-23.5!4d-46.6 (data param do place)
  m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

  // pattern: ?q=-23.5,-46.6 ou &q=-23.5,-46.6
  m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

  // pattern: ?ll=-23.5,-46.6
  m = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

  return null;
}

export async function resolverGoogleMapsLink(
  url: string,
  timeoutMs = 4000
): Promise<{ lat: number; lng: number } | null> {
  try {
    let urlFinal = url;

    // Se for shortlink, segue redirect pra URL completa
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; PegueBot/1.0)",
          },
        });
        urlFinal = response.url || url;
      } finally {
        clearTimeout(timer);
      }
    }

    return extrairCoordsDeUrl(urlFinal);
  } catch (error: any) {
    console.error(`[google-maps-link] falha ao resolver ${url}:`, error?.message);
    return null;
  }
}
