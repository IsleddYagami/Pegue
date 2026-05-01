// Classificador de itens com IA OpenAI gpt-4o-mini.
//
// Por que: cliente envia texto livre vago tipo "cama geladeira sofa e algumas
// coisas pequenas". Sistema antigo:
//   - contava 3-4 itens
//   - sugeria veiculo por contagem (3+ = HR)
//   - NAO sabia que sofa pode ser conjunto, cama pode ser casal box (volume 2x)
//   - Resultado: veiculo errado (utilitario em vez de HR), fretista perde frete
//
// Esta lib:
//   - Identifica cada item separado (mesmo sem virgula: "cama geladeira sofa")
//   - Detecta itens VAGOS (precisam clarificacao antes de cotar):
//     * sofa sem qualificacao -> "1, 2 ou 3 lugares? Conjunto?"
//     * cama sem qualificacao -> "solteiro, casal ou box?"
//     * "coisas pequenas" -> "quantas? caixas, sacolas?"
//   - Estima volume_m3 e peso_kg de cada item (com base em padroes mercado)
//   - Retorna sugestao de veiculo via volume+peso (delegado pro caller)
//
// Custo: ~R$0,003 por classificacao (gpt-4o-mini, low input/output).

import { fetchComTimeout } from "@/lib/fetch-utils";

export interface ItemClassificado {
  nome: string;
  qtd: number;
  volume_m3: number; // estimado por item unitario
  peso_kg: number; // estimado por item unitario
  vago: boolean; // true = falta info pra estimar volume/peso confiavel
}

export interface ResultadoClassificacao {
  itens: ItemClassificado[];
  // Itens que nao da pra estimar com confianca — precisa perguntar antes
  vagos: { item: string; pergunta: string }[];
  volume_total_m3: number;
  peso_total_kg: number;
  // ALTA = pode prosseguir | MEDIA = pode prosseguir mas mostra resumo | BAIXA = perguntar
  confianca: "ALTA" | "MEDIA" | "BAIXA";
}

const PROMPT_SYSTEM = `Voce classifica itens de mudanca/frete em portugues do Brasil.

Cliente brasileiro digita texto livre informal:
- "geladeira fogao sofa cama" (sem virgula, todos itens)
- "1 maquina de lavar 1 sofa e algumas coisas pequenas" (com qtd vaga)
- "geladeira nova sofa 3 lugares cama de casal box"

Sua tarefa: extrair cada item separado com quantidade, volume estimado, peso estimado E sinalizar se eh VAGO.

REGRAS DE VAGUEZA (item vago = NAO da pra estimar volume com seguranca):
- "sofa" sozinho (sem 1/2/3 lugares ou conjunto) -> VAGO
- "cama" sozinho (sem solteiro/casal/box) -> VAGO
- "armario" sozinho (sem qtd portas ou tamanho) -> VAGO
- "guarda-roupa" sozinho -> VAGO
- "coisas pequenas", "alguns itens" sem qtd -> VAGO
- "caixas" sem quantidade -> VAGO
- itens explicitos como "geladeira", "fogao 4 bocas", "microondas" -> NAO vago
- "sofa 3 lugares", "cama de casal" -> NAO vago (qualificado)

ESTIMATIVAS DE VOLUME (m³) E PESO (kg) — referencias de mercado SP:
- Geladeira duplex: 0.5m3 / 90kg
- Geladeira simples: 0.35m3 / 60kg
- Fogao 4 bocas: 0.2m3 / 35kg
- Fogao 6 bocas: 0.3m3 / 55kg
- Microondas: 0.06m3 / 15kg
- Maquina de lavar: 0.4m3 / 70kg
- Sofa 2 lugares: 1.2m3 / 50kg
- Sofa 3 lugares: 1.8m3 / 70kg
- Sofa conjunto (2+3): 3.0m3 / 120kg
- Cama solteiro c/ colchao: 1.0m3 / 40kg
- Cama casal c/ colchao: 1.6m3 / 60kg
- Cama box casal: 1.8m3 / 80kg
- Beliche: 1.4m3 / 55kg
- Armario 3 portas: 1.5m3 / 80kg
- Armario 6 portas (guarda-roupa grande): 3.0m3 / 150kg
- Estante simples: 0.6m3 / 30kg
- Mesa 4 cadeiras: 1.0m3 / 40kg
- Rack TV: 0.4m3 / 25kg
- Tv 50": 0.1m3 / 25kg
- Caixa media: 0.05m3 / 8kg
- Caixa grande: 0.1m3 / 15kg

QUANDO VAGO: estima conservadoramente (volume um pouco MAIOR pra prevenir veiculo subdimensionado).
- "sofa" vago -> assume 3 lugares (1.8m3, 70kg) e marca vago=true
- "cama" vaga -> assume casal box (1.8m3, 80kg) e marca vago=true
- "armario" vago -> assume 3 portas (1.5m3, 80kg) e marca vago=true
- "coisas pequenas" -> 5 caixas medias (0.25m3, 40kg total)

PERGUNTA DE CLARIFICACAO (gere texto natural pt-BR amigavel):
- sofa: "O sofá é de 1, 2, 3 lugares ou conjunto completo?"
- cama: "A cama é solteiro, casal ou box?"
- armario: "O armário tem quantas portas? (ex: 3 portas, guarda-roupa grande)"
- coisas pequenas: "Quantas coisas pequenas? São caixas, sacolas, ou itens individuais?"

CONFIANCA:
- ALTA: zero itens vagos
- MEDIA: 1 item vago
- BAIXA: 2+ itens vagos OU texto totalmente confuso

Retorne APENAS JSON valido:
{
  "itens": [
    {"nome": "geladeira duplex", "qtd": 1, "volume_m3": 0.5, "peso_kg": 90, "vago": false}
  ],
  "vagos": [
    {"item": "sofa", "pergunta": "O sofá é de 1, 2, 3 lugares ou conjunto completo?"}
  ],
  "volume_total_m3": 2.3,
  "peso_total_kg": 160,
  "confianca": "MEDIA"
}`;

export async function classificarItensComIA(
  textoLivre: string,
): Promise<ResultadoClassificacao | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY ausente - classificador-itens nao funciona");
    return null;
  }
  if (!textoLivre || textoLivre.trim().length < 3) return null;

  try {
    const r = await fetchComTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 600,
        temperature: 0,
        messages: [
          { role: "system", content: PROMPT_SYSTEM },
          { role: "user", content: textoLivre },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      console.error("OpenAI classificador erro:", r.status);
      return null;
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return {
      itens: Array.isArray(parsed.itens) ? parsed.itens : [],
      vagos: Array.isArray(parsed.vagos) ? parsed.vagos : [],
      volume_total_m3: typeof parsed.volume_total_m3 === "number" ? parsed.volume_total_m3 : 0,
      peso_total_kg: typeof parsed.peso_total_kg === "number" ? parsed.peso_total_kg : 0,
      confianca: ["ALTA", "MEDIA", "BAIXA"].includes(parsed.confianca) ? parsed.confianca : "BAIXA",
    };
  } catch (e: any) {
    console.error("classificador-itens excecao:", e?.message);
    return null;
  }
}

// Helper pra montar mensagem com perguntas em sequencia.
// Cliente brasileiro nao le longo: junta no maximo 2 perguntas por vez,
// numera e pede pra responder em uma mensagem so.
export function montarPerguntaClarificacao(vagos: { item: string; pergunta: string }[]): string {
  if (vagos.length === 0) return "";
  if (vagos.length === 1) {
    return `🤔 Pra eu cotar certo, me responde:\n\n${vagos[0].pergunta}`;
  }
  // 2+ vagos
  const lista = vagos.slice(0, 3).map((v, i) => `${i + 1}. ${v.pergunta}`).join("\n");
  return `🤔 Pra eu cotar certo, preciso de ${vagos.length} info${vagos.length > 1 ? "s" : ""}:\n\n${lista}\n\nResponde tudo numa mensagem so 😊`;
}
