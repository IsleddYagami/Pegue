// Classificador de intent do cliente em texto natural usando IA.
//
// Filosofia (8/Mai/2026 — Fabio): chega de regex pegando 'sim' em
// 'simples', 'urgent' em 'nao eh urgente', 'mudanca' em 'nao eh
// mudanca'. Cliente real escreve texto humano. IA NER (Named Entity
// Recognition) eh comprovada (Uber, Lalamove fazem assim).
//
// Como funciona: handler critico (handleConfirmacao, handleAjudante,
// handleData) chama classificarIntent(msg, step). Se confianca ALTA,
// usa intent IA. Se MEDIA/BAIXA, cai no fallback regex atual (que pelo
// menos tem guard de negacao agora).
//
// Custo: ~R$0,003 por mensagem com gpt-4o-mini. Hobby ~R$30/mes pra
// 10k msgs. Substitui parser quebrado por IA confiavel.

import { fetchComTimeout } from "@/lib/fetch-utils";

export type IntentCliente =
  | "confirma" // sim, OK, confirmar, '1', etc
  | "cancela" // cancelar, desistir
  | "edita" // mudar, corrigir, editar
  | "urgente" // 'frete agora', 'urgente'
  | "data_horario" // texto de data/horario ('amanha 14h', '25/04 manha')
  | "ajudante_sim" // 'preciso de 1 ajudante'
  | "ajudante_nao" // 'nao preciso, sem ajudante'
  | "ajudante_2" // '2 ajudantes', 'preciso de dois'
  | "tipo_terreo" // 'terreo', 'casa', 'no chao'
  | "tipo_elevador" // 'predio com elevador'
  | "tipo_escada" // 'escada', 'sem elevador'
  | "duvida" // pergunta, duvida
  | "intencao_servico_frete"
  | "intencao_servico_mudanca"
  | "intencao_servico_guincho"
  | "desconhecido"; // IA nao conseguiu classificar

export interface IntentResult {
  intent: IntentCliente;
  confianca: "ALTA" | "MEDIA" | "BAIXA";
  // Entidades opcionais extraidas
  entidades?: {
    qtd_ajudantes?: number;
    andar?: number;
    data?: string;
    horario?: string;
    valor?: number;
  };
  // Texto humano-amigavel pra log/debug
  raciocinio?: string;
}

// Contexto do step atual ajuda IA a focar (ex: se step e
// 'aguardando_ajudante', IA prioriza intencoes ajudante_*).
export type StepContext =
  | "aguardando_servico"
  | "aguardando_ajudante"
  | "aguardando_tipo_local"
  | "aguardando_andar"
  | "aguardando_data"
  | "aguardando_horario"
  | "aguardando_confirmacao"
  | "aguardando_aceite_termos"
  | "confirmando_origem"
  | "confirmando_destino"
  | "aguardando_confirmacao_coleta"
  | "generico";

export async function classificarIntent(
  mensagem: string,
  step: StepContext = "generico",
): Promise<IntentResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY ausente — intent-extractor desabilitado");
    return null;
  }

  if (!mensagem || mensagem.trim().length < 1) return null;

  // Skip mensagens claramente nao-texto (numeros puros, palavras unicas
  // que regex existente ja cobre bem)
  const trim = mensagem.trim();
  if (/^[0-9]+$/.test(trim)) return null; // soh numero - regex existente OK
  if (trim.length < 3) return null; // muito curto pra extrair sentido

  const focoStep = stepParaFocoIA(step);

  const promptSystem = `Voce eh um classificador de intencao de cliente brasileiro num bot de WhatsApp de cotacao de frete.

Cliente real escreve texto humano com girias, erros, negacoes implicitas. Sua tarefa: identificar a INTENCAO real do cliente, considerando o STEP atual da conversa.

Step atual: ${focoStep}

Retorne APENAS JSON valido com este formato exato:
{
  "intent": "confirma" | "cancela" | "edita" | "urgente" | "data_horario" | "ajudante_sim" | "ajudante_nao" | "ajudante_2" | "tipo_terreo" | "tipo_elevador" | "tipo_escada" | "duvida" | "intencao_servico_frete" | "intencao_servico_mudanca" | "intencao_servico_guincho" | "desconhecido",
  "confianca": "ALTA" | "MEDIA" | "BAIXA",
  "entidades": {
    "qtd_ajudantes": numero | null,
    "andar": numero | null,
    "data": "string ou null",
    "horario": "string ou null",
    "valor": numero | null
  },
  "raciocinio": "1 frase explicando por que escolheu esse intent"
}

REGRAS CRITICAS:
- ATENCAO A NEGACOES: "nao eh urgente" -> NAO eh urgente. "nao preciso de ajudante" -> ajudante_nao. "nao eh mudanca, eh frete" -> intencao_servico_frete.
- "sim" como confirmacao SO se for resposta direta a pergunta sim/nao. "simples", "simultaneamente" NAO sao confirmacao.
- Cliente que pergunta ("voce vai cobrar quanto?", "como funciona?") = duvida.
- Cliente que descreve itens/moveis ("tenho 3 caixas e um sofa") NAO eh confirmacao — eh descricao. Retorne "desconhecido" + confianca BAIXA.
- Quando duvidoso, retorne BAIXA confianca (caller usa fallback regex).
- ALTA confianca = certeza absoluta (>95%).

Responda SOMENTE o JSON, sem markdown, sem explicacao extra.`;

  try {
    const r = await fetchComTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 200,
        temperature: 0,
        messages: [
          { role: "system", content: promptSystem },
          { role: "user", content: mensagem },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      console.warn("intent-extractor erro:", r.status);
      return null;
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    if (!parsed.intent) return null;

    const intentsValidos: IntentCliente[] = [
      "confirma", "cancela", "edita", "urgente", "data_horario",
      "ajudante_sim", "ajudante_nao", "ajudante_2",
      "tipo_terreo", "tipo_elevador", "tipo_escada",
      "duvida",
      "intencao_servico_frete", "intencao_servico_mudanca", "intencao_servico_guincho",
      "desconhecido",
    ];
    if (!intentsValidos.includes(parsed.intent)) {
      return { intent: "desconhecido", confianca: "BAIXA" };
    }

    return {
      intent: parsed.intent,
      confianca: ["ALTA", "MEDIA", "BAIXA"].includes(parsed.confianca)
        ? parsed.confianca
        : "BAIXA",
      entidades: parsed.entidades,
      raciocinio: parsed.raciocinio,
    };
  } catch (e: unknown) {
    console.warn(
      "intent-extractor exception:",
      e instanceof Error ? e.message : "erro",
    );
    return null;
  }
}

function stepParaFocoIA(step: StepContext): string {
  const map: Record<StepContext, string> = {
    aguardando_servico: "Esperando cliente escolher o servico (Frete=1, Mudanca=2, Guincho=3, Duvidas=4).",
    aguardando_ajudante: "Esperando cliente dizer se precisa de ajudante (sem=0, sim=1, dois=2).",
    aguardando_tipo_local: "Esperando cliente dizer se eh terreo, elevador ou escada.",
    aguardando_andar: "Esperando cliente dizer numero do andar (1, 2, 3...).",
    aguardando_data: "Esperando cliente dizer data e horario do frete.",
    aguardando_horario: "Esperando cliente dizer horario.",
    aguardando_confirmacao: "Mostrou resumo do frete. Esperando: 1=confirmar, 2=urgente AGORA, 3=editar.",
    aguardando_aceite_termos: "Mostrou termos de pagamento. Esperando: 1=aceito chamar fretista, 2=editar.",
    confirmando_origem: "Mostrou endereco de origem encontrado. Esperando 1=confirmar, 2=corrigir.",
    confirmando_destino: "Mostrou endereco de destino. Esperando 1=confirmar, 2=corrigir.",
    aguardando_confirmacao_coleta: "Cliente avalia se fretista coletou bem. Esperando 1=ok, 2=problema.",
    generico: "Step generico — interpretar intencao geral.",
  };
  return map[step] || map.generico;
}
