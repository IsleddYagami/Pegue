// Pre-processador de endereço com IA (OpenAI gpt-4o-mini).
//
// Por que: clientes brasileiros mandam endereços em formato livre que o
// geocoder Nominatim NAO entende. Exemplo real (cliente 558994638131
// em 28/Abr):
//   "Rua gasparino de quadros n 52 uma travessa da rua Coronel
//    José Venâncio dias perto do céu Vila Atlântico"
// Nominatim retorna nada porque tem ruido (referencias soltas).
//
// IA extrai partes-chave estruturadas:
//   { rua, numero, bairro, cidade, estado }
//
// Caller depois reformata em string limpa e tenta geocodar novamente.
// Custo: ~R$0,003 por interpretacao (gpt-4o-mini, low input/output).

import { fetchComTimeout } from "@/lib/fetch-utils";

export interface EnderecoEstruturado {
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  // String limpa pronta pra geocodar (concatenacao otimizada)
  textoLimpo: string;
  // Confianca declarada pela IA: ALTA, MEDIA, BAIXA
  confianca: "ALTA" | "MEDIA" | "BAIXA";
}

export async function interpretarEnderecoComIA(
  textoOriginal: string,
  contextoCidade?: string,
): Promise<EnderecoEstruturado | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY nao configurada - geocoder-ia nao funciona");
    return null;
  }

  if (!textoOriginal || textoOriginal.trim().length < 5) return null;

  const promptSystem = `Voce extrai endereços brasileiros de texto livre informal.

Cliente brasileiro pode escrever de forma confusa, com referências soltas (ex: "perto do céu", "uma travessa de", "embaixo da ponte"). Sua tarefa: extrair APENAS dados geográficos estruturados, IGNORANDO referências subjetivas.

Retorne APENAS JSON válido com este formato exato:
{
  "rua": "Rua/Av/Travessa Nome" ou null,
  "numero": "52" ou null,
  "bairro": "Vila Atlantico" ou null,
  "cidade": "Sao Paulo" ou null,
  "estado": "SP" (sigla 2 letras) ou null,
  "textoLimpo": "string concatenada otimizada pra geocoder",
  "confianca": "ALTA" | "MEDIA" | "BAIXA"
}

REGRAS:
- IGNORE referências tipo "perto do", "uma travessa de", "embaixo de", "ao lado de" — sao ruido.
- Se cliente mencionou nome de rua + bairro + cidade, confianca = ALTA.
- Se faltar bairro OU cidade, confianca = MEDIA.
- Se so disse uma coisa vaga (ex: "rua amazonas"), confianca = BAIXA.
- textoLimpo: monte string final concatenando rua + numero + bairro + cidade + estado, omitindo nulls. Pronta pra colar em Google Maps.
- IMPORTANTE: contexto Brasil. Se nao houver estado, presume SP (maioria dos clientes Pegue eh em SP).
${contextoCidade ? `- Contexto: cliente provavelmente esta em ${contextoCidade}.` : ""}

Responda SOMENTE o JSON, sem markdown, sem explicacao.`;

  try {
    const r = await fetchComTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 300,
        temperature: 0,
        messages: [
          { role: "system", content: promptSystem },
          { role: "user", content: textoOriginal },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error("OpenAI geocoder-ia erro:", r.status, errText.slice(0, 200));
      return null;
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);

    // Sanitiza campos
    return {
      rua: parsed.rua || null,
      numero: parsed.numero ? String(parsed.numero) : null,
      bairro: parsed.bairro || null,
      cidade: parsed.cidade || null,
      estado: parsed.estado || null,
      textoLimpo: parsed.textoLimpo || textoOriginal,
      confianca: ["ALTA", "MEDIA", "BAIXA"].includes(parsed.confianca) ? parsed.confianca : "BAIXA",
    };
  } catch (e: any) {
    console.error("geocoder-ia exception:", e?.message);
    return null;
  }
}
