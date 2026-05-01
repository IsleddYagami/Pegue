import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { extrairContextoInicial } from "@/lib/extrair-contexto";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cron `/api/cron/aprendiz-vocabulario-externo` — recomendado rodar
// 1x/mes (dia 1, 7h). Usa GPT-4 como "pesquisador sintetico" — ele ja
// foi treinado em milhoes de exemplos de PT-BR informal (WhatsApp,
// Insta, fóruns) ate seu cutoff. Extraimos esse conhecimento de forma
// estruturada, sem violar ToS de redes sociais (que e o que scraping
// faria).
//
// Pipeline:
//   1) GPT-4o gera 50 mensagens sinteticas variadas (frete/mudanca/guincho)
//      considerando regionalismos, faixas etarias, niveis de formalidade
//   2) Pra cada mensagem, testa o prompt atual (extrair-contexto.ts)
//   3) Identifica termos especificos NAO presentes no prompt
//   4) Cruza com top divergencias REAIS da semana (qualidade_extracao_ia)
//      — padroes que aparecem em AMBOS sao prioridade alta
//   5) Pra padroes prioritarios, gera proposta de melhoria → incidentes_atendimento
//
// Custo: ~$0.50/rodada (50 sinteticas + 50 testes + 5-8 propostas)

const QTD_MENSAGENS_SINTETICAS = 50;
const MAX_PROPOSTAS_POR_RODADA = 5;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY nao configurado" }, { status: 500 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let custoUsd = 0;

  // === FASE 1: Gerar mensagens sinteticas variadas ===
  const promptGeracao = `Voce e especialista em comunicacao informal brasileira via WhatsApp. Gere ${QTD_MENSAGENS_SINTETICAS} mensagens REAIS e VARIADAS que clientes brasileiros enviariam pra contratar:
- Frete pequeno (10x)
- Mudanca completa (15x)
- Guincho (15x)
- Pedido ambiguo / curto (10x)

Considere:
- Gírias regionais (norte/nordeste/sul/sudeste)
- Faixas etarias diferentes (jovem 18-25, adulto 26-50, idoso 50+)
- Niveis de formalidade (muito informal -> formal)
- Erros de digitacao comuns
- Abreviacoes (vc, tb, blz, oq, etc)
- Mensagens curtas (1 frase) e longas (briefing detalhado)
- Inclua os 14 campos relevantes em algumas: servico, origem, destino, veiculo, itens, ajudante, andar, escada, elevador, data, periodo, marca/modelo (guincho), caixas, sacolas

Retorne APENAS um array JSON de strings, sem texto explicativo:
["mensagem 1", "mensagem 2", ...]`;

  let mensagensSinteticas: string[] = [];
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Responda apenas array JSON, sem prosa." },
        { role: "user", content: promptGeracao },
      ],
      max_tokens: 4000,
      temperature: 0.9, // alta variedade
    });
    custoUsd += 0.05; // gpt-4o ~$0.05/chamada (4k tokens)
    const resp = completion.choices[0]?.message?.content || "";
    const match = resp.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("IA nao retornou array");
    mensagensSinteticas = JSON.parse(match[0]).filter((x: any) => typeof x === "string" && x.length > 5);
  } catch (e: any) {
    return NextResponse.json({ status: "erro_geracao", erro: e?.message }, { status: 500 });
  }

  if (mensagensSinteticas.length === 0) {
    return NextResponse.json({ status: "ok", motivo: "sem mensagens sinteticas geradas" });
  }

  // === FASE 2: Testar cada mensagem contra prompt atual ===
  // Limita a 30 testes pra controlar custo (~$0.001 cada)
  const amostraTeste = mensagensSinteticas.slice(0, 30);
  const resultadosTeste: Array<{
    mensagem: string;
    extracao: any;
    confianca: string;
    extraiu_servico: boolean;
    extraiu_origem: boolean;
    extraiu_destino: boolean;
  }> = [];

  for (const msg of amostraTeste) {
    try {
      const ctx = await extrairContextoInicial(msg);
      custoUsd += 0.001;
      resultadosTeste.push({
        mensagem: msg,
        extracao: ctx,
        confianca: ctx?.confianca || "null",
        extraiu_servico: !!ctx?.servico,
        extraiu_origem: !!ctx?.origem_texto,
        extraiu_destino: !!ctx?.destino_texto,
      });
    } catch {
      // ignora falha individual
    }
  }

  // === FASE 3: Identifica mensagens onde prompt atual FALHOU ===
  // Falhou = nao conseguiu identificar servico OU confianca == 'baixa'
  const falhas = resultadosTeste.filter(
    (r) => !r.extraiu_servico || r.confianca === "baixa" || r.extracao === null,
  );

  // === FASE 4: Cruza com top divergencias REAIS da semana ===
  // Pra cada mensagem-falha, ve se padroes similares aparecem em
  // qualidade_extracao_ia das ultimas 4 semanas
  const desde = new Date(Date.now() - 28 * 24 * 3600_000).toISOString();
  const { data: medicoesReais } = await supabase
    .from("qualidade_extracao_ia")
    .select("mensagem_original, campos_incorretos")
    .gte("criado_em", desde)
    .filter("taxa_acerto", "lt", "0.7")
    .limit(200);

  const errosReaisTexto = (medicoesReais || [])
    .map((m: any) => String(m.mensagem_original || "").toLowerCase())
    .join(" \n ");

  // === FASE 5: Salva resultados em vocabulario_observado ===
  let salvos = 0;
  let priorityHigh = 0;
  for (const r of resultadosTeste) {
    const errou = !r.extraiu_servico || r.confianca === "baixa";
    const palavrasMsg = r.mensagem.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const cruzou = palavrasMsg.some((p) => errosReaisTexto.includes(p));

    if (cruzou) priorityHigh++;

    const { error } = await supabase.from("vocabulario_observado").insert({
      mensagem_sintetica: r.mensagem.slice(0, 1000),
      categoria: r.extracao?.servico || null,
      termos_novos: palavrasMsg.slice(0, 10),
      prompt_atual_errou: errou,
      campos_errados: errou ? ["servico_ou_confianca_baixa"] : [],
      cruzou_com_real: cruzou,
      qtd_ocorrencias_reais: cruzou ? 1 : 0,
    });
    if (!error) salvos++;
  }

  // === FASE 6: Pra falhas que TAMBEM cruzam com erros reais, gera proposta ===
  const prioritarias = resultadosTeste
    .filter((r) => !r.extraiu_servico || r.confianca === "baixa")
    .filter((r) => {
      const palavras = r.mensagem.toLowerCase().match(/\b\w{4,}\b/g) || [];
      return palavras.some((p) => errosReaisTexto.includes(p));
    })
    .slice(0, MAX_PROPOSTAS_POR_RODADA);

  let propostas = 0;
  for (const r of prioritarias) {
    try {
      const promptProposta = `Sistema Pegue (frete/mudanca/guincho via WhatsApp). Prompt atual de extracao FALHOU em entender:

Mensagem: "${r.mensagem}"
Confianca da IA: ${r.confianca}
Conseguiu extrair servico? ${r.extraiu_servico ? "sim" : "NAO"}

PADRAO TAMBEM aparece em mensagens REAIS de clientes onde a taxa de acerto foi <70%.

Retorne APENAS este JSON:
{
  "diagnostico": "<1-2 frases sobre o que ha de especifico nessa mensagem que confunde IA>",
  "proposta_acao": "<regra concreta a adicionar no prompt extrair-contexto.ts. Ex: 'Termo X = servico Y'. 1-3 frases>",
  "exemplo_few_shot": "<exemplo curto de mensagem -> JSON esperado pra adicionar no prompt como referencia>"
}`;

      const c = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Responda APENAS JSON. Seja especifico, acionavel." },
          { role: "user", content: promptProposta },
        ],
        max_tokens: 500,
        temperature: 0.2,
      });
      custoUsd += 0.001;
      const resp = c.choices[0]?.message?.content || "";
      const m = resp.match(/\{[\s\S]*\}/);
      if (!m) continue;
      const parsed = JSON.parse(m[0]);

      const phoneSintetico = `vocab_externo_${Date.now()}_${propostas}`;
      const proposta = `${parsed.proposta_acao}${parsed.exemplo_few_shot && parsed.exemplo_few_shot !== "null" ? `\n\nExemplo few-shot sugerido:\n${parsed.exemplo_few_shot}` : ""}`;

      const { error: errInsert } = await supabase.from("incidentes_atendimento").insert({
        phone: phoneSintetico,
        phone_masked: `🌐 vocab-externo`,
        ultimo_step: "vocabulario_externo_proposta",
        duracao_min: 0,
        mensagens_qtd: 1,
        resumo_msgs: `Mensagem sintetica (gerada por IA pesquisadora) que prompt atual NAO consegue interpretar:\n\n"${r.mensagem}"\n\nPadrao TAMBEM aparece em clientes reais (taxa<70%).`,
        diagnostico_ia: parsed.diagnostico,
        proposta_acao: proposta,
        status: "pendente",
      });

      if (!errInsert) propostas++;
    } catch {
      // ignora
    }
  }

  // Loga custo
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "custo_estimado_ia",
      servico: "aprendiz_vocabulario_externo",
      modelo: "gpt-4o + gpt-4o-mini",
      custo_usd_estimado: custoUsd,
      mensagens_geradas: mensagensSinteticas.length,
      mensagens_testadas: resultadosTeste.length,
      falhas_detectadas: falhas.length,
      cruzaram_com_real: priorityHigh,
      propostas_inseridas: propostas,
    },
  });

  return NextResponse.json({
    status: "ok",
    mensagens_geradas: mensagensSinteticas.length,
    mensagens_testadas: resultadosTeste.length,
    falhas_detectadas: falhas.length,
    cruzaram_com_real: priorityHigh,
    salvos_no_vocabulario: salvos,
    propostas_inseridas: propostas,
    custo_usd: Math.round(custoUsd * 1000) / 1000,
  });
}
