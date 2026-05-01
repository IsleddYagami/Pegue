import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cron `/api/cron/aprendiz-prompt-ia` — recomendado rodar 1x/semana
// (segunda-feira manha). Analisa as top divergencias da semana, agrupa
// por padroes, e gera sugestoes concretas de melhoria do prompt
// extrair-contexto.ts pra Fabio aprovar em /admin/aprendizado.
//
// Cumpre regra mestra APRENDIZADO CONSTANTE — sistema se auto-aprende
// continuamente baseado em dados reais (nao em palpite).
//
// Output: novas linhas em incidentes_atendimento com:
//   ultimo_step="prompt_extraction_proposta"
//   diagnostico_ia=resumo do padrao detectado
//   proposta_acao=sugestao concreta de regra/exemplo pro prompt

const JANELA_DIAS = 7;
const MIN_OCORRENCIAS = 3;        // padroes com menos de 3 ocorrencias sao ruido
const MAX_PROPOSTAS_POR_RODADA = 8;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const desde = new Date(Date.now() - JANELA_DIAS * 24 * 3600_000).toISOString();

  // 1) Busca medicoes da semana
  const { data: medicoes, error } = await supabase
    .from("qualidade_extracao_ia")
    .select("mensagem_original, extracao_ia, valores_finais, campos_incorretos")
    .gte("criado_em", desde)
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!medicoes || medicoes.length === 0) {
    return NextResponse.json({ status: "ok", motivo: "sem medicoes na janela", propostas: 0 });
  }

  // 2) Agrupa erros por padrao (campo + valor IA + valor real)
  const padroes: Map<string, { campo: string; ia: any; real: any; qtd: number; exemplos: string[] }> = new Map();

  for (const m of medicoes) {
    const ia = (m.extracao_ia || {}) as any;
    const real = (m.valores_finais || {}) as any;
    for (const campo of (m.campos_incorretos || []) as string[]) {
      const valIA = pegarValorIA(campo, ia);
      const valReal = pegarValorReal(campo, real);
      const chave = `${campo}|${JSON.stringify(valIA)}|${JSON.stringify(valReal)}`;
      if (!padroes.has(chave)) {
        padroes.set(chave, { campo, ia: valIA, real: valReal, qtd: 0, exemplos: [] });
      }
      const p = padroes.get(chave)!;
      p.qtd++;
      if (p.exemplos.length < 5 && m.mensagem_original) {
        p.exemplos.push(String(m.mensagem_original).slice(0, 200));
      }
    }
  }

  // 3) Filtra padroes recorrentes (>= MIN_OCORRENCIAS) e ordena por qtd
  const padroesRelevantes = [...padroes.values()]
    .filter((p) => p.qtd >= MIN_OCORRENCIAS)
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, MAX_PROPOSTAS_POR_RODADA);

  if (padroesRelevantes.length === 0) {
    return NextResponse.json({
      status: "ok",
      motivo: `sem padroes >= ${MIN_OCORRENCIAS} ocorrencias`,
      total_medicoes: medicoes.length,
      padroes_encontrados: padroes.size,
      propostas: 0,
    });
  }

  // 4) Pra cada padrao, IA gera sugestao concreta de melhoria do prompt
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
  let propostasInseridas = 0;
  let custoUsd = 0;
  const erros: { padrao: string; erro: string }[] = [];

  for (const p of padroesRelevantes) {
    try {
      const promptUser = `Sistema Pegue — IA de extracao de contexto inicial (extrair-contexto.ts) ESTA ERRANDO um padrao especifico:

Campo errado: ${p.campo}
Valor que IA extraiu (errado): ${JSON.stringify(p.ia)}
Valor real usado na corrida: ${JSON.stringify(p.real)}
Vezes que isso aconteceu na semana: ${p.qtd}

Exemplos de mensagens originais dos clientes (literais):
${p.exemplos.map((e, i) => `${i + 1}. "${e}"`).join("\n")}

PROMPT ATUAL da IA (resumo): extrai 14 campos como servico, origem_texto, destino_texto, veiculo_sugerido, itens, qtd_caixas, etc. Retorna JSON.

Retorne APENAS este JSON:
{
  "diagnostico": "<o que a IA esta interpretando errado e por que? 1-2 frases>",
  "proposta_acao": "<acao concreta que pode ser adicionada no prompt pra evitar isso. Ex: 'Adicionar regra: se mensagem contem palavra X, mapear para Y'. Ser ESPECIFICO. 1-3 frases>",
  "exemplo_few_shot": "<um exemplo curto que poderia ser injetado no prompt como few-shot. Mensagem -> JSON esperado. Pode ser null se nao aplicavel>"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Voce e um engenheiro de prompts especialista em extrair contexto de mensagens de clientes brasileiros pedindo frete/mudanca/guincho. Seja direto, especifico, acionavel. Responda APENAS JSON.",
          },
          { role: "user", content: promptUser },
        ],
        max_tokens: 600,
        temperature: 0.2,
      });

      custoUsd += 0.001;
      const resposta = completion.choices[0]?.message?.content || "";
      const jsonMatch = resposta.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        erros.push({ padrao: `${p.campo}: ${JSON.stringify(p.ia)}`, erro: "ia_sem_json" });
        continue;
      }
      const parsed = JSON.parse(jsonMatch[0]);

      // 5) Insere proposta em incidentes_atendimento
      // Reusa schema existente — categoriza pelo phone "prompt_aprendiz"
      // pra distinguir das propostas de incidentes normais.
      const phoneSintetico = `prompt_${p.campo}_${p.qtd}_${Date.now()}`;
      const proposta = `${parsed.proposta_acao}${parsed.exemplo_few_shot && parsed.exemplo_few_shot !== "null" ? `\n\nExemplo few-shot sugerido:\n${parsed.exemplo_few_shot}` : ""}`;

      const { error: errInsert } = await supabase.from("incidentes_atendimento").insert({
        phone: phoneSintetico,
        phone_masked: `🤖 prompt-aprendiz`,
        ultimo_step: "prompt_extraction_proposta",
        duracao_min: 0,
        mensagens_qtd: p.qtd,
        resumo_msgs: `Padrao detectado em ${p.qtd} mensagens.\n\nCampo: ${p.campo}\nIA extraiu: ${JSON.stringify(p.ia)}\nReal era: ${JSON.stringify(p.real)}\n\nExemplos:\n${p.exemplos.map((e, i) => `${i + 1}. "${e}"`).join("\n")}`,
        diagnostico_ia: parsed.diagnostico,
        proposta_acao: proposta,
        status: "pendente",
      });

      if (errInsert) {
        // 23505 = duplicate (phone unique por dia) — ignora silencioso
        if (errInsert.code !== "23505") {
          erros.push({ padrao: `${p.campo}: ${JSON.stringify(p.ia)}`, erro: errInsert.message });
        }
        continue;
      }
      propostasInseridas++;
    } catch (e: any) {
      erros.push({ padrao: `${p.campo}: ${JSON.stringify(p.ia)}`, erro: e?.message?.slice(0, 200) || "exception" });
    }
  }

  // 6) Loga custo
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "custo_estimado_ia",
      servico: "aprendiz_prompt_ia",
      modelo: "gpt-4o-mini",
      custo_usd_estimado: custoUsd,
      propostas_geradas: propostasInseridas,
    },
  });

  return NextResponse.json({
    status: "ok",
    janela_dias: JANELA_DIAS,
    total_medicoes: medicoes.length,
    padroes_recorrentes: padroesRelevantes.length,
    propostas_inseridas: propostasInseridas,
    custo_usd: Math.round(custoUsd * 10000) / 10000,
    erros,
  });
}

function pegarValorIA(campo: string, ia: any): any {
  switch (campo) {
    case "servico": return ia.servico;
    case "origem": return ia.origem_texto;
    case "destino": return ia.destino_texto;
    case "veiculo": return ia.veiculo_sugerido;
    case "ajudante": return ia.precisa_ajudante;
    case "andar": return ia.andar_origem;
    case "escada": return ia.tem_escada_origem;
    case "elevador": return ia.tem_elevador_destino;
    case "itens": return ia.itens;
    case "veiculo_marca": return ia.veiculo_marca_modelo;
    case "periodo": return ia.periodo;
    default: return null;
  }
}

function pegarValorReal(campo: string, real: any): any {
  switch (campo) {
    case "servico": return real.tipo_servico;
    case "origem": return real.origem_endereco;
    case "destino": return real.destino_endereco;
    case "veiculo": return real.tipo_veiculo;
    case "ajudante": return (real.qtd_ajudantes || 0) > 0;
    case "andar": return real.andares_origem;
    case "escada": return !!real.escada_origem;
    case "elevador": return !!real.elevador_destino;
    case "itens": return real.descricao_carga;
    case "veiculo_marca": return real.descricao_carga;
    case "periodo": return real.periodo;
    default: return null;
  }
}
