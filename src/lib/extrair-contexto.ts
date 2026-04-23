// Extrai contexto inicial da mensagem do cliente via GPT-4o-mini.
// Objetivo: se cliente ja chega falando "quero um frete de sofa pra barra funda",
// pular etapas do bot e ir direto pra confirmacao.
//
// Retorna null se:
// - Mensagem muito curta (< 10 chars) ou so saudacao
// - IA nao conseguiu extrair nada util
// - Erro na API
//
// NAO chama IA pra mensagens tipicas de fluxo (ex: "1", "2", "sim", "oi")
// pra economizar custo e latencia.

import OpenAI from "openai";

export type ServicoDetectado = "frete" | "mudanca" | "guincho";

export interface ContextoExtraido {
  servico: ServicoDetectado | null;
  itens: string[];           // ex: ["Sofa", "Geladeira"]
  origem_texto: string | null;  // texto livre: "Presidente Altino", "Rua Brasil"
  destino_texto: string | null; // texto livre: "Barra Funda", "Cotia"
  veiculo_sugerido: string | null; // "utilitario" | "hr" | "caminhao_bau" | "carro_comum"
  confianca: "alta" | "media" | "baixa";
  observacao: string | null;
}

function ehSomenteSaudacao(texto: string): boolean {
  const lower = texto.toLowerCase().trim();
  const saudacoesCurtas = [
    "oi", "ola", "olá", "oii", "oie",
    "bom dia", "boa tarde", "boa noite",
    "hey", "eae", "e ai", "fala", "salve", "opa",
    "boa", "blz", "beleza", "obrigado", "obrigada",
  ];
  // Se a mensagem INTEIRA eh uma dessas (sem texto extra)
  return saudacoesCurtas.includes(lower);
}

function ehRespostaDeFluxo(texto: string): boolean {
  const lower = texto.toLowerCase().trim();
  // Numeros curtos, sim/nao, comandos - sao respostas a perguntas do bot
  if (/^\d{1,2}$/.test(lower)) return true;
  if (["sim", "nao", "não", "s", "n", "pegar", "ok", "pronto", "so isso", "só isso"].includes(lower)) return true;
  return false;
}

export async function extrairContextoInicial(mensagem: string): Promise<ContextoExtraido | null> {
  if (!mensagem) return null;
  const texto = mensagem.trim();

  // Mensagens muito curtas ou so saudacao - nao vale chamar IA
  if (texto.length < 10) return null;
  if (ehSomenteSaudacao(texto)) return null;
  if (ehRespostaDeFluxo(texto)) return null;

  // Deve ter pelo menos 3 palavras com sentido
  const palavras = texto.split(/\s+/).filter((p) => p.length > 2);
  if (palavras.length < 3) return null;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Voce eh um assistente de uma empresa de fretes chamada Pegue (Osasco, SP).
Sua tarefa: extrair informacoes que o cliente JA FORNECEU na primeira mensagem
pra bot poder pular etapas e agilizar o atendimento.

Analise a mensagem e retorne APENAS um JSON:
{
  "servico": "frete" | "mudanca" | "guincho" | null,
  "itens": ["Item1", "Item2"],
  "origem_texto": "<endereço ou bairro de retirada, texto livre>" ou null,
  "destino_texto": "<endereço ou bairro de entrega, texto livre>" ou null,
  "veiculo_sugerido": "utilitario" | "hr" | "caminhao_bau" | "carro_comum" | null,
  "confianca": "alta" | "media" | "baixa",
  "observacao": "<frase curta do que entendeu>"
}

REGRAS:
1. "servico": default "frete" se cliente menciona sofa, geladeira, item isolado pra levar.
   "mudanca" se menciona mudanca, mudar de casa, apartamento inteiro, varios itens.
   "guincho" se menciona carro quebrado, moto pifada, rebocar veiculo.
   null se nao deu pra identificar.

2. "itens": lista TODOS os objetos/materiais que o cliente mencionou transportar.
   Ex: "sofa + geladeira" => ["Sofa", "Geladeira"]. "mudanca completa" => [].

3. "origem_texto" e "destino_texto": preserve exatamente como o cliente falou.
   - "de Presidente Altino pra Barra Funda" => origem="Presidente Altino", destino="Barra Funda"
   - "pra Cotia" (so destino) => origem=null, destino="Cotia"
   - "rua X numero 123 em Osasco" => capture o texto
   - Se mencionou so 1 lugar sem dizer se eh origem ou destino, coloca em destino_texto.

4. "veiculo_sugerido":
   - 1 item pequeno/medio => "utilitario"
   - 1 item grande sozinho => "utilitario" (Strada cabe muita coisa)
   - 2-3 itens grandes => "hr"
   - Mudanca completa => "caminhao_bau"
   - Guincho => null (sera definido depois pelo tipo de veiculo)

5. "confianca":
   - "alta": mensagem clara, servico + item + pelo menos origem ou destino
   - "media": detectou servico + item mas sem enderecos
   - "baixa": detectou 1 informacao fraca (so servico ou so 1 lugar)

6. "observacao": frase curta resumindo o que cliente quer
   Ex: "Frete de sofa pra Barra Funda"

Se a mensagem NAO tem nada util (cliente so cumprimentou, perguntou algo generico),
retorne confianca "baixa" e campos null.

Responda SOMENTE o JSON, nada mais.`,
        },
        {
          role: "user",
          content: `Mensagem do cliente: "${texto.slice(0, 500)}"`,
        },
      ],
      max_tokens: 300,
      temperature: 0.1,
    });

    const resposta = response.choices[0]?.message?.content || "";
    const jsonMatch = resposta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Normaliza resposta
    const contexto: ContextoExtraido = {
      servico: ["frete", "mudanca", "guincho"].includes(parsed.servico)
        ? parsed.servico
        : null,
      itens: Array.isArray(parsed.itens) ? parsed.itens : [],
      origem_texto: parsed.origem_texto || null,
      destino_texto: parsed.destino_texto || null,
      veiculo_sugerido: ["utilitario", "hr", "caminhao_bau", "carro_comum"].includes(parsed.veiculo_sugerido)
        ? parsed.veiculo_sugerido
        : null,
      confianca: ["alta", "media", "baixa"].includes(parsed.confianca)
        ? parsed.confianca
        : "baixa",
      observacao: parsed.observacao || null,
    };

    // Se confianca baixa E nao detectou servico nem item, trata como nada detectado
    if (
      contexto.confianca === "baixa" &&
      !contexto.servico &&
      contexto.itens.length === 0 &&
      !contexto.origem_texto &&
      !contexto.destino_texto
    ) {
      return null;
    }

    return contexto;
  } catch (error: any) {
    console.error("Erro ao extrair contexto inicial:", error?.message);
    return null;
  }
}

// Formata mensagem de confirmacao pra mandar pro cliente.
// Mostra tudo que detectou + pede confirmacao.
export function formatarConfirmacaoContexto(ctx: ContextoExtraido): string {
  const linhas: string[] = ["Entendi que voce quer:\n"];

  if (ctx.servico) {
    const nomeServico: Record<string, string> = {
      frete: "🚚 *Frete*",
      mudanca: "📦 *Mudança*",
      guincho: "🚗 *Guincho*",
    };
    linhas.push(nomeServico[ctx.servico] || `*${ctx.servico}*`);
  }

  if (ctx.itens.length > 0) {
    linhas.push(`📦 Material: *${ctx.itens.join(", ")}*`);
  }

  if (ctx.origem_texto) {
    linhas.push(`📍 De: *${ctx.origem_texto}*`);
  }

  if (ctx.destino_texto) {
    linhas.push(`🏠 Para: *${ctx.destino_texto}*`);
  }

  linhas.push("\nEstá correto?\n");
  linhas.push("1️⃣ ✅ *SIM* - vamos continuar (pulo as etapas já informadas)");
  linhas.push("2️⃣ ❌ *NÃO* - prefiro preencher tudo do zero");

  return linhas.join("\n");
}
