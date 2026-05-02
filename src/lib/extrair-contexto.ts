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

export type PeriodoDetectado = "manha" | "tarde" | "noite";

export interface ContextoExtraido {
  servico: ServicoDetectado | null;
  itens: string[];           // ex: ["Sofa", "Geladeira"]
  qtd_caixas: number | null; // "15 caixas" => 15
  qtd_sacolas: number | null; // "8 sacolas" => 8 (sacolas pesam menos mas ocupam volume)
  veiculo_marca_modelo: string | null; // SO pra guincho: "Honda Civic 2018", "Hilux 2020"
  origem_texto: string | null;  // texto livre: "Presidente Altino", "Rua Brasil"
  destino_texto: string | null; // texto livre: "Barra Funda", "Cotia"
  andar_origem: number | null;  // "4º andar" => 4. 0 ou null se terreo/nao mencionou
  tem_escada_origem: boolean;   // "sem elevador", "só escada" => true
  tem_elevador_destino: boolean; // "com elevador (de servico)" => true
  precisa_ajudante: boolean;    // "preciso de ajudantes pra carregar" => true
  data_texto: string | null;    // "11 de maio", "11/05", "amanha", "segunda" - normalizacao depois
  periodo: PeriodoDetectado | null; // "manha", "tarde", "noite"
  veiculo_sugerido: string | null; // "utilitario" | "hr" | "caminhao_bau" | "carro_comum"
  confianca: "alta" | "media" | "baixa";
  observacao: string | null;
  // Audit 2/Mai/2026: itens proibidos detectados (animais vivos, drogas,
  // armas, bebes, etc). Caller decide como tratar (geralmente recusar +
  // mensagem amiga). Vazio/undefined = OK.
  itens_proibidos_detectados?: { categoria: string; termo: string }[];
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
          content: `Extraia infos da mensagem do cliente da Pegue (fretes Osasco/SP) e retorne APENAS este JSON (campos null/[] se nao mencionado):

{
  "data_texto": <"11 de maio"|"amanha"|"15/05"|"segunda"|null - texto LITERAL da data>,
  "periodo": <"manha"|"tarde"|"noite"|null - inclui horarios: 8-12h=manha, 13-17h=tarde, 18h+=noite>,
  "servico": <"frete"|"mudanca"|"guincho"|null>,
  "itens": <lista TODOS itens explicitamente mencionados, ex: ["Sofa","Cama","Geladeira"]. Se "mudanca completa" sem listar items: []. NAO inclua "caixas"/"sacolas" no array - eles vao em qtd_caixas/qtd_sacolas>,
  "qtd_caixas": <numero ou null, ex: "15 caixas" => 15. Soma se cliente menciona em 2 lugares ("3 caixas... mais 5 caixinhas" => 8)>,
  "qtd_sacolas": <numero ou null, ex: "8 sacolas" => 8. Sacolas pesam menos mas ocupam volume>,
  "veiculo_marca_modelo": <texto livre da marca/modelo/ano do veiculo - SO se servico=guincho. Ex: "Honda Civic 2018", "Fiat Uno 2015", "moto Honda CG 160". null se nao mencionou>,
  "origem_texto": <texto livre da origem ou null. "de Osasco pra Sao Paulo" => "Osasco">,
  "destino_texto": <texto livre destino ou null. Se mencionou 1 lugar sem dizer origem/destino, poe em destino>,
  "andar_origem": <numero do andar coleta ou null. "4o andar" => 4. "terreo" => 0>,
  "tem_escada_origem": <true se "sem elevador"|"escada"|"subir escada", false caso contrario>,
  "tem_elevador_destino": <true se destino tem "elevador"|"elevador de servico", false caso contrario>,
  "precisa_ajudante": <true se "ajudante"|"carregadores"|"alguem pra ajudar", false caso contrario>,
  "veiculo_sugerido": <"utilitario"(1-2 itens)|"hr"(3+ itens grandes)|"caminhao_bau"(mudanca completa)|"carro_comum"|null>,
  "confianca": <"alta"(servico+itens+origem ou destino)|"media"|"baixa">,
  "observacao": <resumo 1 linha>
}

REGRAS:
- NUNCA invente. Se nao tem certeza, use null/false/[].
- LEIA A MENSAGEM INTEIRA antes de responder. Data e periodo costumam estar no fim ("seria dia X de Y", "no periodo da manha").
- Itens: se cliente listou (ex: "- sofa\\n- cama\\n- geladeira"), capture TODOS mesmo dentro de "mudanca completa".
- ATENCAO: "boa tarde", "boa manha", "boa noite", "bom dia" sao SAUDACOES, NAO indicam o periodo do servico. So coloque "periodo" se cliente disser explicitamente quando precisa do servico (ex: "pra amanha de manha", "no periodo da tarde", "as 14h"). Saudacoes sozinhas NAO contam.

Responda SOMENTE o JSON.`,
        },
        {
          role: "user",
          // Limite generoso (2000 chars) - mensagens completas de mudanca chegam a 700+ chars
          // e cortar em 500 faz IA perder dados (ex: data e periodo no fim do texto).
          content: `Mensagem do cliente: "${texto.slice(0, 2000)}"`,
        },
      ],
      max_tokens: 600,
      temperature: 0.1,
    });

    const resposta = response.choices[0]?.message?.content || "";
    const jsonMatch = resposta.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Normaliza resposta. Defesa: nunca confia cegamente no que IA retornou.
    const numOuNull = (v: any): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
    };
    const contexto: ContextoExtraido = {
      servico: ["frete", "mudanca", "guincho"].includes(parsed.servico)
        ? parsed.servico
        : null,
      itens: Array.isArray(parsed.itens)
        ? parsed.itens.filter((i: any) => typeof i === "string" && i.trim().length > 0).slice(0, 30)
        : [],
      qtd_caixas: numOuNull(parsed.qtd_caixas),
      qtd_sacolas: numOuNull(parsed.qtd_sacolas),
      veiculo_marca_modelo: typeof parsed.veiculo_marca_modelo === "string" && parsed.veiculo_marca_modelo.trim() ? parsed.veiculo_marca_modelo.trim() : null,
      origem_texto: typeof parsed.origem_texto === "string" && parsed.origem_texto.trim() ? parsed.origem_texto.trim() : null,
      destino_texto: typeof parsed.destino_texto === "string" && parsed.destino_texto.trim() ? parsed.destino_texto.trim() : null,
      andar_origem: numOuNull(parsed.andar_origem),
      tem_escada_origem: parsed.tem_escada_origem === true,
      tem_elevador_destino: parsed.tem_elevador_destino === true,
      precisa_ajudante: parsed.precisa_ajudante === true,
      data_texto: typeof parsed.data_texto === "string" && parsed.data_texto.trim() ? parsed.data_texto.trim() : null,
      periodo: ["manha", "tarde", "noite"].includes(parsed.periodo) ? parsed.periodo : null,
      veiculo_sugerido: ["utilitario", "hr", "caminhao_bau", "carro_comum"].includes(parsed.veiculo_sugerido)
        ? parsed.veiculo_sugerido
        : null,
      confianca: ["alta", "media", "baixa"].includes(parsed.confianca)
        ? parsed.confianca
        : "baixa",
      observacao: typeof parsed.observacao === "string" && parsed.observacao.trim() ? parsed.observacao.trim() : null,
    };

    // Se confianca baixa E nao detectou nada util, trata como nada detectado
    if (
      contexto.confianca === "baixa" &&
      !contexto.servico &&
      contexto.itens.length === 0 &&
      !contexto.origem_texto &&
      !contexto.destino_texto
    ) {
      return null;
    }

    // (audit 2/Mai/2026) Filtro de itens proibidos: animais vivos, drogas,
    // armas, bebes/criancas, explosivos, material biologico. Sinaliza no
    // contexto pra caller decidir como tratar (recusar com mensagem amiga
    // + log + escalar admin se necessario).
    const { detectarItensProibidos } = await import("./itens-proibidos");
    const proibidos = detectarItensProibidos({
      textoLivre: texto,
      itens: contexto.itens,
    });
    if (proibidos.length > 0) {
      contexto.itens_proibidos_detectados = proibidos.map((p) => ({
        categoria: p.categoria,
        termo: p.termo,
      }));
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
  const linhas: string[] = ["✅ Entendi tudo! Confere se está certo:\n"];

  if (ctx.servico) {
    const nomeServico: Record<string, string> = {
      frete: "🚚 *Frete*",
      mudanca: "📦 *Mudança completa*",
      guincho: "🚗 *Guincho*",
    };
    linhas.push(nomeServico[ctx.servico] || `*${ctx.servico}*`);
  }

  // Pra guincho, mostra marca/modelo do veiculo em vez de lista de itens
  if (ctx.servico === "guincho" && ctx.veiculo_marca_modelo) {
    linhas.push(`🚗 Veículo: *${ctx.veiculo_marca_modelo}*`);
  } else if (ctx.itens.length > 0) {
    if (ctx.itens.length <= 6) {
      linhas.push(`📦 Itens: *${ctx.itens.join(", ")}*`);
    } else {
      linhas.push(`📦 ${ctx.itens.length} itens: *${ctx.itens.slice(0, 5).join(", ")}* e mais ${ctx.itens.length - 5}`);
    }
  }

  if (ctx.qtd_caixas && ctx.qtd_sacolas) {
    linhas.push(`📦 Volumes: *${ctx.qtd_caixas} caixas + ${ctx.qtd_sacolas} sacolas*`);
  } else if (ctx.qtd_caixas) {
    linhas.push(`📦 Caixas: *${ctx.qtd_caixas}*`);
  } else if (ctx.qtd_sacolas) {
    linhas.push(`📦 Sacolas: *${ctx.qtd_sacolas}*`);
  }

  // Origem: mostra se tem texto OU se tem andar/escada (info parcial vale exibir)
  const temInfoOrigem = ctx.origem_texto || (ctx.andar_origem !== null && ctx.andar_origem > 0) || ctx.tem_escada_origem;
  if (temInfoOrigem) {
    const partes: string[] = ["📍 Coleta:"];
    if (ctx.origem_texto) {
      partes.push(`*${ctx.origem_texto}*`);
    }
    if (ctx.andar_origem !== null && ctx.andar_origem > 0) {
      partes.push(`— ${ctx.andar_origem}º andar`);
    }
    if (ctx.tem_escada_origem) {
      partes.push(ctx.origem_texto || ctx.andar_origem ? "(sem elevador)" : "*sem elevador*");
    }
    linhas.push(partes.join(" "));
  }

  const temInfoDestino = ctx.destino_texto || ctx.tem_elevador_destino;
  if (temInfoDestino) {
    const partes: string[] = ["🏠 Entrega:"];
    if (ctx.destino_texto) {
      partes.push(`*${ctx.destino_texto}*`);
    }
    if (ctx.tem_elevador_destino) {
      partes.push(ctx.destino_texto ? "(com elevador)" : "*com elevador*");
    }
    linhas.push(partes.join(" "));
  }

  if (ctx.precisa_ajudante) {
    linhas.push(`🙋 Com ajudante`);
  }

  if (ctx.data_texto) {
    let dataLinha = `📅 Quando: *${ctx.data_texto}*`;
    if (ctx.periodo) {
      const nomePeriodo: Record<string, string> = { manha: "manhã", tarde: "tarde", noite: "noite" };
      dataLinha += ` (${nomePeriodo[ctx.periodo]})`;
    }
    linhas.push(dataLinha);
  } else if (ctx.periodo) {
    const nomePeriodo: Record<string, string> = { manha: "manhã", tarde: "tarde", noite: "noite" };
    linhas.push(`📅 Período: ${nomePeriodo[ctx.periodo]}`);
  }

  linhas.push("\n*Está tudo certo?*\n");
  linhas.push("1️⃣ ✅ *SIM* - continuar (pulo as etapas que já me contou)");
  linhas.push("2️⃣ ❌ *NÃO* - prefiro preencher tudo do zero");

  return linhas.join("\n");
}
