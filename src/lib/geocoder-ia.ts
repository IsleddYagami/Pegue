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
  // POI/instituicao reconhecida (escola, hospital, shopping). Quando presente,
  // textoLimpo prioriza instituicao + cidade — Google Maps geocoda melhor.
  instituicao: string | null;
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
  "instituicao": "IFSP Osasco" ou "Hospital das Clinicas SP" ou null,
  "textoLimpo": "string concatenada otimizada pra geocoder",
  "confianca": "ALTA" | "MEDIA" | "BAIXA"
}

REGRAS:
- IGNORE referências tipo "perto do", "uma travessa de", "embaixo de", "ao lado de" — sao ruido.
- INSTITUIÇÕES: se o texto mencionar nome de uma instituicao reconhecivel (escola, faculdade, hospital, shopping, ponto turistico, empresa conhecida — ex: "IFSP", "USP", "Sodimac", "Hospital Sirio Libanes", "Shopping Iguatemi"), preserve no campo "instituicao" E inclua o nome no textoLimpo. Geocoder Google reconhece esses nomes melhor que ruas genericas.
- Se cliente mencionou nome de rua + bairro + cidade, confianca = ALTA.
- Se mencionou apenas instituicao + cidade, confianca = ALTA (geocoder Google resolve bem).
- Se faltar bairro/cidade E nao tiver instituicao reconhecivel, confianca = MEDIA.
- Se so disse uma coisa vaga (ex: "rua amazonas") sem cidade NEM instituicao, confianca = BAIXA.
- textoLimpo: priorize INSTITUICAO + cidade/estado se houver instituicao. Senao concatene rua + numero + bairro + cidade + estado, omitindo nulls. Pronta pra colar em Google Maps.
- NUNCA reduza textoLimpo a APENAS "Cidade, Estado" sem rua nem instituicao — isso geocoda no centro generico da cidade (resultado errado). Se nao houver rua nem instituicao, deixe textoLimpo igual ao texto original e marque confianca = BAIXA.
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
    const result: EnderecoEstruturado = {
      rua: parsed.rua || null,
      numero: parsed.numero ? String(parsed.numero) : null,
      bairro: parsed.bairro || null,
      cidade: parsed.cidade || null,
      estado: parsed.estado || null,
      instituicao: parsed.instituicao || null,
      textoLimpo: parsed.textoLimpo || textoOriginal,
      confianca: ["ALTA", "MEDIA", "BAIXA"].includes(parsed.confianca) ? parsed.confianca : "BAIXA",
    };

    // GUARD CRITICO (7/Mai/2026 — caso Igor): IA reduzia "IFSP OSASCO" pra
    // "Osasco, SP" que geocoder Google retornava ponto generico no centro
    // de Osasco e reverseGeocode pegava uma rua aleatoria. Cliente recebia
    // endereco INVENTADO. Fix: se textoLimpo eh APENAS cidade+estado (sem
    // rua, numero, bairro, NEM instituicao), forca confianca=BAIXA pra
    // evitar uso indevido upstream.
    const semRuaSemInstituicao = !result.rua && !result.instituicao && !result.numero;
    const soCidadeOuMenos = !result.bairro;
    if (semRuaSemInstituicao && soCidadeOuMenos) {
      result.confianca = "BAIXA";
    }
    return result;
  } catch (e: any) {
    console.error("geocoder-ia exception:", e?.message);
    return null;
  }
}
