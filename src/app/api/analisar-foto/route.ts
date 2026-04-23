import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
    });

    if (!imageBase64) {
      return NextResponse.json({ error: "Imagem nao enviada" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Voce e um assistente de uma empresa de fretes chamada Pegue.
Analise a foto enviada pelo cliente e IDENTIFIQUE TODOS os itens visiveis.
Se houver 2, 3 ou mais itens (ex: rack com TV em cima = 2 itens, sofa + poltrona = 2 itens), LISTE TODOS.

Para cada item, INFIRA o tamanho quando relevante e INCLUA no nome:
- Guarda-roupa: "solteiro" (2 portas, ~1m largura), "casal" (3 portas, ~1.5m), "king" (4+ portas, ~1.8m+)
- Cama: "solteiro", "casal", "queen", "king"
- Mesa: "4 lugares", "6 lugares", "8+ lugares"
- Sofa: "2 lugares", "3 lugares", "retratil"
Ex: "Guarda-roupa casal", "Mesa 6 lugares", "Cama solteiro".
Se NAO tiver certeza do tamanho, coloque "(?)": "Guarda-roupa (tamanho?)", "Mesa (tamanho?)".

Retorne APENAS um JSON com:
{
  "itens": ["Item 1 com tamanho", "Item 2 com tamanho", ...],
  "quantidade_total": <numero de itens identificados>,
  "tamanho_geral": "pequeno, medio ou grande",
  "veiculo_sugerido": "utilitario, hr ou caminhao_bau",
  "observacao": "uma frase curta sobre o que voce ve (max 15 palavras)"
}

REGRAS RIGIDAS para veiculo_sugerido (siga nesta ordem):
1. Se for APENAS 1 item pequeno/medio (sofa 2 lugares, cama solteiro, guarda-roupa solteiro) => "utilitario".
2. Se forem 2 itens pequenos/medios => "utilitario".
3. Se tiver guarda-roupa casal/king, cama casal/queen/king, sofa 3 lugares, ou 2-3 itens grandes => "hr".
4. Se for mudanca quase completa (4+ itens grandes) => "caminhao_bau".
5. Na duvida entre utilitario e hr => "hr" (seguranca).

IMPORTANTE: se ver 2 ou mais itens na mesma foto (mesmo empilhados ou juntos), LISTE TODOS no array "itens".
Exemplos: "rack com TV em cima" => ["Rack", "TV 50pol"]. "sofa + mesa" => ["Sofa 3 lugares", "Mesa 6 lugares"].

Responda SOMENTE o JSON, nada mais.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: imageBase64.startsWith("data:")
                  ? imageBase64
                  : `data:image/jpeg;base64,${imageBase64}`,
                detail: "low",
              },
            },
            {
              type: "text",
              text: "O que e esse material? Qual veiculo ideal para transportar?",
            },
          ],
        },
      ],
      max_tokens: 200,
      temperature: 0.1,
    });

    const texto = response.choices[0]?.message?.content || "";

    // Extrair JSON da resposta
    let analise: any = null;
    try {
      const jsonMatch = texto.match(/\{[\s\S]*\}/);
      analise = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      analise = null;
    }

    // Valida e normaliza: garante que "itens" eh array. Se vier o formato antigo ("item" string),
    // converte pra array. Fallback robusto pra JSON malformado.
    if (!analise) {
      return NextResponse.json(fallbackAnalise());
    }

    if (!Array.isArray(analise.itens)) {
      // Compatibilidade com prompt antigo: se veio "item" singular, converte
      if (typeof analise.item === "string") {
        analise.itens = [analise.item];
      } else {
        analise.itens = ["Material identificado"];
      }
    }

    // Normaliza demais campos
    analise.quantidade_total = analise.quantidade_total || analise.itens.length;
    analise.tamanho_geral = analise.tamanho_geral || analise.tamanho || "medio";
    analise.veiculo_sugerido = analise.veiculo_sugerido || "utilitario";
    analise.observacao = analise.observacao || "";

    // Mantem compatibilidade: "item" retorna primeiro item (callers antigos)
    analise.item = analise.itens.join(", ");

    return NextResponse.json(analise);
  } catch (error: any) {
    console.error("Erro ao analisar foto:", error?.message);
    return NextResponse.json(fallbackAnalise(), { status: 200 });
  }
}

function fallbackAnalise() {
  return {
    itens: ["Material"],
    item: "Material",
    quantidade_total: 1,
    tamanho_geral: "medio",
    veiculo_sugerido: "utilitario",
    observacao: "Nao foi possivel analisar. Confirme no WhatsApp.",
  };
}
