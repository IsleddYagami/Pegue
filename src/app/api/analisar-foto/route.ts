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
Analise a foto enviada pelo cliente e retorne APENAS um JSON com:
{
  "item": "nome do item principal na foto (ex: Geladeira, Sofa, Caixas, Maquina de lavar)",
  "quantidade": "quantidade estimada de itens (ex: 1, 3, varias caixas)",
  "tamanho": "pequeno, medio ou grande",
  "veiculo_sugerido": "utilitario, van ou caminhao_bau",
  "observacao": "uma frase curta sobre o que voce ve (max 15 palavras)"
}
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
    let analise;
    try {
      const jsonMatch = texto.match(/\{[\s\S]*\}/);
      analise = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      analise = null;
    }

    if (!analise) {
      return NextResponse.json({
        item: "Material identificado",
        quantidade: "1",
        tamanho: "medio",
        veiculo_sugerido: "utilitario",
        observacao: "Envie pelo WhatsApp para confirmacao do veiculo ideal.",
      });
    }

    return NextResponse.json(analise);
  } catch (error: any) {
    console.error("Erro ao analisar foto:", error?.message);
    return NextResponse.json(
      {
        item: "Material",
        quantidade: "1",
        tamanho: "medio",
        veiculo_sugerido: "utilitario",
        observacao: "Nao foi possivel analisar. Confirme no WhatsApp.",
      },
      { status: 200 }
    );
  }
}
