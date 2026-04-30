import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // ate 5min - pode processar varios incidentes

// Cron `/api/cron/aprendizado-incidentes` — roda 1x/dia (manha, ex: 08:00 BR).
// Implementa Aprendizado Constante Fase 1:
//   1) Busca sessoes nao-concluidas atualizadas 24-48h atras (janela passada,
//      garantindo que cliente ja teve tempo de voltar e nao voltou).
//   2) Pra cada sessao, junta logs/mensagens, monta resumo textual.
//   3) Chama gpt-4o-mini com prompt de diagnostico estruturado.
//   4) Salva linha em `incidentes_atendimento` com status='pendente'.
//   5) No fim, manda pro admin um resumo das top propostas pendentes.
//
// Idempotente: indice unico em (phone, date_trunc('day', criado_em)) evita
// duplicar incidente do mesmo cliente no mesmo dia. Re-rodar = no-op.

const JANELA_INICIO_HORAS = 48;
const JANELA_FIM_HORAS = 24;
const MAX_INCIDENTES_POR_RODADA = 30; // limite de seguranca (custo + tempo)

// Steps que nao contam como incidente (concluido com sucesso ou em fluxo
// passivo aguardando algo externo)
const STEPS_OK = new Set([
  "concluido",
  "aguardando_pagamento",
  "atendimento_humano", // foi escalado, nao eh "incidente"
  "cadastro_aguardando_aprovacao",
  "aguardando_revisao_admin",
  "fretista_aguardando_pin",
  "fretista_aguardando_cliente_ok_coleta",
]);

// Steps de fluxo de prestador (incidente nao se aplica - prestador tem fluxo proprio)
const PREFIXOS_PRESTADOR = ["cadastro_", "fretista_", "guincho_", "avaliacao_"];

interface SessionParaAnalise {
  phone: string;
  step: string;
  origem_endereco: string | null;
  destino_endereco: string | null;
  descricao_carga: string | null;
  valor_estimado: number | null;
  veiculo_sugerido: string | null;
  criado_em: string;
  atualizado_em: string;
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const agora = Date.now();
  const inicio = new Date(agora - JANELA_INICIO_HORAS * 3600_000).toISOString();
  const fim = new Date(agora - JANELA_FIM_HORAS * 3600_000).toISOString();

  // 1) Busca sessoes que pararam na janela 24-48h atras
  const { data: sessoes, error: errSessoes } = await supabase
    .from("bot_sessions")
    .select("phone,step,origem_endereco,destino_endereco,descricao_carga,valor_estimado,veiculo_sugerido,criado_em,atualizado_em")
    .gte("atualizado_em", inicio)
    .lte("atualizado_em", fim)
    .limit(200);

  if (errSessoes) {
    return NextResponse.json({ error: errSessoes.message }, { status: 500 });
  }

  const candidatas = (sessoes || []).filter((s: any) => {
    if (STEPS_OK.has(s.step)) return false;
    if (PREFIXOS_PRESTADOR.some((p) => s.step.startsWith(p))) return false;
    return true;
  }) as SessionParaAnalise[];

  if (candidatas.length === 0) {
    return NextResponse.json({ status: "ok", incidentes_novos: 0, candidatas: 0 });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });
  let novos = 0;
  let custoUsdTotal = 0;
  const erros: { phone_masked: string; motivo: string }[] = [];

  for (const sess of candidatas.slice(0, MAX_INCIDENTES_POR_RODADA)) {
    try {
      const phoneMasked = sess.phone.replace(/\d(?=\d{4})/g, "*");

      // Idempotencia: ja existe incidente desse phone hoje?
      const { count } = await supabase
        .from("incidentes_atendimento")
        .select("*", { count: "exact", head: true })
        .eq("phone", sess.phone)
        .gte("criado_em", new Date(agora - 24 * 3600_000).toISOString());
      if ((count || 0) > 0) continue;

      // 2) Junta logs + msgs do phone na janela. So tipos uteis pra contexto.
      const { data: logs } = await supabase
        .from("bot_logs")
        .select("criado_em,payload")
        .or(`payload->>phone.eq.${sess.phone},payload->>phone_masked.eq.${phoneMasked}`)
        .gte("criado_em", sess.criado_em)
        .lte("criado_em", sess.atualizado_em)
        .order("criado_em", { ascending: true })
        .limit(50);

      const resumoMsgs = (logs || [])
        .map((l: any) => {
          const tipo = l.payload?.tipo || "?";
          const txt = l.payload?.amostra || l.payload?.mensagem_original?.slice(0, 100) || "";
          return `[${tipo}] ${txt}`.slice(0, 200);
        })
        .join("\n")
        .slice(0, 4000);

      const duracaoMin = Math.round(
        (new Date(sess.atualizado_em).getTime() - new Date(sess.criado_em).getTime()) / 60_000,
      );

      // 3) Chama IA pra diagnosticar
      const promptUser = `Analise este atendimento NAO concluido:

Phone: ${phoneMasked}
Ultimo step: ${sess.step}
Duracao: ${duracaoMin}min
Descricao carga: ${sess.descricao_carga || "(nao informada)"}
Origem: ${sess.origem_endereco || "(nao informada)"}
Destino: ${sess.destino_endereco || "(nao informado)"}
Valor cotado: ${sess.valor_estimado ? `R$ ${sess.valor_estimado}` : "(nao chegou em cotacao)"}
Veiculo sugerido: ${sess.veiculo_sugerido || "(nenhum)"}

Eventos/logs do atendimento:
${resumoMsgs || "(sem logs ricos)"}

Retorne APENAS este JSON:
{
  "diagnostico": "<o que aconteceu? por que cliente nao fechou? (1-3 frases)>",
  "categoria": "<abandonou_apos_cotacao | bot_travou | endereco_nao_geocodou | foto_falhou | ia_nao_entendeu | outro>",
  "proposta_acao": "<acao concreta pro time tomar ou ajuste de codigo. Ex: 'Adicionar fallback de geocoder com Nominatim quando Google falha em rua sem numero' (1-2 frases)>"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Voce eh um analista de atendimentos do Pegue (servico de fretes). Seu trabalho eh diagnosticar por que clientes nao fecharam corrida e propor melhorias. Seja direto e acionavel. Responda APENAS o JSON pedido.",
          },
          { role: "user", content: promptUser },
        ],
        max_tokens: 400,
        temperature: 0.2,
      });

      const resposta = completion.choices[0]?.message?.content || "";
      custoUsdTotal += 0.0005; // estimativa conservadora gpt-4o-mini
      const jsonMatch = resposta.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        erros.push({ phone_masked: phoneMasked, motivo: "ia_sem_json" });
        continue;
      }
      const parsed = JSON.parse(jsonMatch[0]);

      // 4) Insere incidente
      const { error: errInsert } = await supabase.from("incidentes_atendimento").insert({
        phone: sess.phone,
        phone_masked: phoneMasked,
        ultimo_step: sess.step,
        duracao_min: duracaoMin,
        mensagens_qtd: (logs || []).length,
        resumo_msgs: resumoMsgs,
        diagnostico_ia: typeof parsed.diagnostico === "string" ? parsed.diagnostico : null,
        proposta_acao: typeof parsed.proposta_acao === "string" ? parsed.proposta_acao : null,
        status: "pendente",
      });

      if (errInsert) {
        erros.push({ phone_masked: phoneMasked, motivo: errInsert.message });
        continue;
      }

      novos++;
    } catch (e: any) {
      erros.push({
        phone_masked: sess.phone.replace(/\d(?=\d{4})/g, "*"),
        motivo: e?.message?.slice(0, 200) || "erro desconhecido",
      });
    }
  }

  // 5) Loga custo + alerta admin com resumo (se houver novos)
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "custo_estimado_ia",
      servico: "aprendizado_incidentes",
      modelo: "gpt-4o-mini",
      custo_usd_estimado: custoUsdTotal,
      incidentes_processados: novos,
    },
  });

  if (novos > 0) {
    const { data: pendentes } = await supabase
      .from("incidentes_atendimento")
      .select("phone_masked,ultimo_step,proposta_acao")
      .eq("status", "pendente")
      .order("criado_em", { ascending: false })
      .limit(5);

    const resumoTop = (pendentes || [])
      .map((p: any, i: number) => `${i + 1}. *${p.phone_masked}* (${p.ultimo_step}): ${p.proposta_acao || "(sem proposta)"}`)
      .join("\n");

    await notificarAdmins(
      `📚 *APRENDIZADO DIARIO* — ${novos} incidente(s) novos`,
      "Sistema",
      `Janela: ${JANELA_FIM_HORAS}-${JANELA_INICIO_HORAS}h atras\nTotal pendentes (top 5):\n\n${resumoTop}\n\nRevisar em /admin/aprendizado e aprovar/rejeitar.`,
    );
  }

  return NextResponse.json({
    status: "ok",
    candidatas: candidatas.length,
    incidentes_novos: novos,
    custo_usd: custoUsdTotal.toFixed(4),
    erros,
  });
}
