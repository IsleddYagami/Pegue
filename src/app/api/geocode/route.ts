import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");

  if (!q) {
    return NextResponse.json({ error: "Informe ?q=endereco" }, { status: 400 });
  }

  try {
    // Tenta ViaCEP se parece CEP
    const cepClean = q.replace(/\D/g, "");
    if (cepClean.length === 8) {
      const r = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
      const data = await r.json();
      if (!data.erro && data.localidade) {
        const query = `${data.logradouro || ""}, ${data.bairro || ""}, ${data.localidade}, ${data.uf}, Brasil`;
        const result = await buscarNominatim(query);
        if (result) {
          return NextResponse.json({
            lat: result.lat,
            lng: result.lng,
            nome: `${data.bairro || data.localidade}, ${data.localidade}`,
          });
        }
      }
    }

    // Busca Nominatim com contexto SP
    const searchQuery = q.toLowerCase().includes("sp") || q.toLowerCase().includes("paulo")
      ? q + ", Brasil"
      : q + ", Sao Paulo, SP, Brasil";

    const result = await buscarNominatim(searchQuery);
    if (result) {
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Endereco nao encontrado" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Erro ao buscar endereco" }, { status: 500 });
  }
}

async function buscarNominatim(query: string) {
  const encoded = encodeURIComponent(query);
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=br`,
    {
      headers: {
        "User-Agent": "Pegue-Bot/1.0",
        "Accept-Language": "pt-BR",
      },
    }
  );
  const data = await r.json();
  if (data && data.length > 0) {
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      nome: data[0].display_name.split(",").slice(0, 3).join(",").trim(),
    };
  }
  return null;
}
