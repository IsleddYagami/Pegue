import { NextRequest, NextResponse } from "next/server";
import { interpretarEnderecoComIA } from "@/lib/geocoder-ia";

// Endpoint TEMPORARIO de teste do geocoder-ia.
// Sem auth (rate-limited via secret no path).
//
// Usar:
//   GET /api/test-geocoder/teste-pegue-2026?texto=Rua+gasparino...
//
// REMOVER depois de validar funcionamento.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // Secret simples no path query pra evitar abuso
  const secret = req.nextUrl.searchParams.get("s");
  if (secret !== "teste-pegue-2026") {
    return NextResponse.json({ error: "secret invalido" }, { status: 401 });
  }

  const texto = req.nextUrl.searchParams.get("texto") || "";
  if (!texto) {
    return NextResponse.json({ error: "use ?texto=..." }, { status: 400 });
  }

  // 1) Tenta IA limpar
  const interpretado = await interpretarEnderecoComIA(texto);

  // 2) Geocoder Nominatim com texto ORIGINAL (controle)
  let geosOriginal: any[] = [];
  try {
    const u1 = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(texto)}&countrycodes=br&limit=3`;
    const r1 = await fetch(u1, { headers: { "User-Agent": "PegueMarketplace/1.0" } });
    geosOriginal = await r1.json();
  } catch {}

  // 3) Geocoder com texto LIMPO da IA
  let geosLimpo: any[] = [];
  if (interpretado?.textoLimpo) {
    try {
      const u2 = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(interpretado.textoLimpo)}&countrycodes=br&limit=3`;
      const r2 = await fetch(u2, { headers: { "User-Agent": "PegueMarketplace/1.0" } });
      geosLimpo = await r2.json();
    } catch {}
  }

  return NextResponse.json({
    entrada: texto,
    ia_funciona: interpretado !== null,
    ia_resultado: interpretado,
    geocoder_com_original: {
      n: geosOriginal.length,
      top3: geosOriginal.slice(0, 3).map((g: any) => ({ nome: g.display_name, lat: g.lat, lon: g.lon })),
    },
    geocoder_com_textolimpo_ia: {
      n: geosLimpo.length,
      top3: geosLimpo.slice(0, 3).map((g: any) => ({ nome: g.display_name, lat: g.lat, lon: g.lon })),
    },
    veredito:
      geosOriginal.length === 0 && geosLimpo.length > 0
        ? "✅ IA RESOLVEU (Nominatim falhava sem IA, achou COM IA)"
        : geosOriginal.length > 0 && geosLimpo.length > 0
        ? "✅ AMBOS funcionam"
        : geosOriginal.length === 0 && geosLimpo.length === 0
        ? "❌ NENHUM funciona (cliente teria que escalar pra humano)"
        : "⚠️ OUTRA SITUAÇÃO",
  });
}
