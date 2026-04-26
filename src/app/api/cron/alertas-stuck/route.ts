import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cron /api/cron/alertas-stuck - roda a cada 5min (configurado em vercel.json).
// Detecta sessoes em steps de "cotacao aberta aguardando humano" e alerta admins
// via WhatsApp. Dedupe: nao reenviaraquela sessao se ja alertou ha menos de 30min.

// Configuracao de steps monitorados. Threshold 0 = alerta imediato (primeira passagem).
// Outros valores = minutos parado antes de alertar.
const STEPS_MONITORADOS: Record<string, { thresholdMin: number; titulo: string; comoAgir: string }> = {
  aguardando_revisao_admin: {
    thresholdMin: 0, // imediato - preco foi bloqueado pelo anti-erro, precisa aprovar
    titulo: "🔍 *COTACAO EM REVISAO — APROVAR/REJEITAR*",
    comoAgir: "Sistema anti-erro bloqueou o preço. Veja em /admin/revisao-precos e: APROVAR (envia cotação ao cliente), AJUSTAR (preço novo) ou REJEITAR (com motivo).",
  },
  aguardando_pagamento: {
    thresholdMin: 15,
    titulo: "💰 *CLIENTE NAO PAGOU EM 15 MIN — RECUPERAR*",
    comoAgir: "Cliente recebeu cotação mas não fechou pagamento. Chama no WhatsApp pra perguntar se ficou alguma dúvida ou se quer outro horário.",
  },
  aguardando_numero_coleta: {
    thresholdMin: 15,
    titulo: "📍 *CLIENTE TRAVADO NO NUMERO DA CASA — AJUDAR*",
    comoAgir: "Cliente pagou mas não informou o número/complemento da rua de retirada. Chama e pergunta o número da casa.",
  },
  aguardando_confirmacao: {
    thresholdMin: 15,
    titulo: "📋 *CLIENTE NAO CONFIRMOU COTACAO — RECUPERAR*",
    comoAgir: "Cliente viu o orçamento mas não digitou SIM nem ALTERAR. Chama no WhatsApp pra ajudar a decidir.",
  },
  aguardando_contraoferta_data: {
    thresholdMin: 20,
    titulo: "📅 *CLIENTE NAO RESPONDEU CONTRAOFERTA DE DATA*",
    comoAgir: "Fretista propôs outra data e cliente não disse SIM nem NAO. Chama pra confirmar se aceita ou prefere outra data.",
  },
};

const DEDUPE_MIN = 30; // nao realerta mesma sessao por 30min

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const stepsList = Object.keys(STEPS_MONITORADOS);
  const dedupeCutoff = new Date(Date.now() - DEDUPE_MIN * 60 * 1000).toISOString();

  // Busca candidatos: sessoes em steps monitorados, atualizadas em periodo relevante,
  // que NAO foram alertadas recentemente.
  const { data: sessoes, error: errFetch } = await supabase
    .from("bot_sessions")
    .select("phone, step, atualizado_em, corrida_id, alerta_admin_enviado_em")
    .in("step", stepsList)
    .or(`alerta_admin_enviado_em.is.null,alerta_admin_enviado_em.lt.${dedupeCutoff}`)
    .limit(50);

  if (errFetch) {
    console.error("alertas-stuck: erro fetch sessoes:", errFetch);
    return NextResponse.json({ error: "fetch_error", details: errFetch.message }, { status: 500 });
  }

  if (!sessoes || sessoes.length === 0) {
    return NextResponse.json({ status: "ok", alertas: 0 });
  }

  const agora = Date.now();
  const alertados: any[] = [];
  const ignorados: any[] = [];

  for (const sessao of sessoes) {
    const config = STEPS_MONITORADOS[sessao.step];
    if (!config) continue;

    const idadeMs = agora - new Date(sessao.atualizado_em).getTime();
    const idadeMin = Math.floor(idadeMs / 60000);

    // Threshold ainda nao atingido
    if (idadeMin < config.thresholdMin) {
      ignorados.push({ phone: sessao.phone, step: sessao.step, idadeMin, motivo: "aguardando_threshold" });
      continue;
    }

    // Monta detalhes da corrida pra facilitar atuacao manual
    const phoneClicavel = sessao.phone.replace(/\D/g, "");
    let detalhes = [
      `📞 *Cliente:* +${phoneClicavel}`,
      `   wa.me/${phoneClicavel}`,
      ``,
      `⏱️ *Parado ha:* ${idadeMin} min (step: ${sessao.step})`,
    ].join("\n");

    if (sessao.corrida_id) {
      try {
        const { data: c } = await supabase
          .from("corridas")
          .select("codigo, origem_endereco, destino_endereco, descricao_carga, periodo, data_agendada, valor_estimado, tipo_veiculo")
          .eq("id", sessao.corrida_id)
          .single();
        if (c) {
          detalhes += [
            ``,
            `━━━━━━━━━━━━━━━━`,
            `🔖 *Codigo:* ${c.codigo || "-"}`,
            `🚚 Veiculo: ${c.tipo_veiculo || "-"}`,
            `📍 Coleta: ${c.origem_endereco || "-"}`,
            `🏠 Destino: ${c.destino_endereco || "-"}`,
            `📦 Carga: ${c.descricao_carga || "-"}`,
            `📅 Quando: ${c.periodo || c.data_agendada || "A combinar"}`,
            `💰 Valor: R$ ${c.valor_estimado || "-"}`,
          ].join("\n");
        }
      } catch (e: any) {
        console.error("alertas-stuck: erro fetch corrida:", e?.message);
      }
    }

    detalhes += [
      ``,
      `━━━━━━━━━━━━━━━━`,
      `🎯 *Como agir:*`,
      config.comoAgir,
      ``,
      `🔗 https://chamepegue.com.br/admin/corridas`,
    ].join("\n");

    const enviados = await notificarAdmins(config.titulo, sessao.phone, detalhes);

    // Marca alerta enviado mesmo que algum admin tenha falhado (evita spam)
    await supabase
      .from("bot_sessions")
      .update({ alerta_admin_enviado_em: new Date().toISOString() })
      .eq("phone", sessao.phone);

    alertados.push({
      phone: sessao.phone,
      step: sessao.step,
      idadeMin,
      admins_notificados: enviados,
    });
  }

  return NextResponse.json({
    status: "ok",
    alertas: alertados.length,
    ignorados: ignorados.length,
    detalhes: { alertados, ignorados },
  });
}
