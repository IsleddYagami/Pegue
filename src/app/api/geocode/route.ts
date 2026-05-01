import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// BUG #BATCH5-3 (re-audit 1/Mai/2026): endpoint era publico sem rate limit.
// Como faz proxy gratuito ao Nominatim (free service), atacante podia abusar
// dele e queimar nossa quota IP-baseada do Nominatim. Agora 30 req/min/IP
// (suficiente pra UI legitima do site, agressivo pra spam).
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit({ chave: `geocode_pub:${ip}`, max: 30 });
  if (!rl.permitido) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 1 minuto." },
      { status: 429 },
    );
  }

  const q = req.nextUrl.searchParams.get("q");

  if (!q) {
    return NextResponse.json({ error: "Informe ?q=endereco" }, { status: 400 });
  }
  if (q.length > 200) {
    return NextResponse.json({ error: "Query muito longa" }, { status: 400 });
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

    // Corrige nomes comuns da Grande SP
    let queryCorrigida = q;
    const ql = q.toLowerCase().trim();
    const correcoes: Record<string, string> = {
      "sao bernardo": "Sao Bernardo do Campo, SP",
      "são bernardo": "São Bernardo do Campo, SP",
      "santo andre": "Santo Andre, SP",
      "santo andré": "Santo André, SP",
      "sao caetano": "Sao Caetano do Sul, SP",
      "são caetano": "São Caetano do Sul, SP",
      "maua": "Maua, SP",
      "mauá": "Mauá, SP",
      "embu": "Embu das Artes, SP",
      "taboao": "Taboao da Serra, SP",
      "taboão": "Taboão da Serra, SP",
      "itapecerica": "Itapecerica da Serra, SP",
      "ferraz": "Ferraz de Vasconcelos, SP",
    };
    for (const [chave, correcao] of Object.entries(correcoes)) {
      if (ql === chave || ql.startsWith(chave + " ")) {
        queryCorrigida = correcao;
        break;
      }
    }

    // Busca Nominatim com contexto SP
    const searchQuery = queryCorrigida.toLowerCase().includes("sp") || queryCorrigida.toLowerCase().includes("paulo")
      ? queryCorrigida + ", Brasil"
      : queryCorrigida + ", Sao Paulo, SP, Brasil";

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
