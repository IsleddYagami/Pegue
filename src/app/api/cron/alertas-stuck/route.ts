import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cron /api/cron/alertas-stuck - roda a cada 5min (configurado em vercel.json).
// Detecta sessoes em steps de "cotacao aberta aguardando humano" e alerta admins
// via WhatsApp. Dedupe: nao reenviaraquela sessao se ja alertou ha menos de 30min.

// Configuracao de steps monitorados. Threshold 0 = alerta imediato (primeira passagem).
// Outros valores = minutos parado antes de alertar.
const STEPS_MONITORADOS: Record<string, { thresholdMin: number; titulo: string }> = {
  aguardando_revisao_admin: {
    thresholdMin: 0, // imediato - preco foi bloqueado pelo anti-erro, precisa aprovar
    titulo: "🔍 *COTACAO EM REVISAO (sistema anti-erro)*",
  },
  aguardando_pagamento: {
    thresholdMin: 15,
    titulo: "💰 *CLIENTE TRAVADO EM PAGAMENTO*",
  },
  aguardando_numero_coleta: {
    thresholdMin: 15,
    titulo: "📍 *CLIENTE TRAVADO EM ENDERECO DE COLETA*",
  },
  aguardando_confirmacao: {
    thresholdMin: 15,
    titulo: "📋 *CLIENTE TRAVADO EM CONFIRMACAO*",
  },
  aguardando_contraoferta_data: {
    thresholdMin: 20,
    titulo: "📅 *CLIENTE NAO DECIDIU CONTRAOFERTA*",
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
    let detalhes = `Step: ${sessao.step}\nParado ha: ${idadeMin} min`;
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
            `🔖 Codigo: ${c.codigo || "-"}`,
            `🚚 Veiculo: ${c.tipo_veiculo || "-"}`,
            `📍 ${c.origem_endereco || "-"}`,
            `🏠 ${c.destino_endereco || "-"}`,
            `📦 ${c.descricao_carga || "-"}`,
            `📅 ${c.periodo || c.data_agendada || "A combinar"}`,
            `💰 R$ ${c.valor_estimado || "-"}`,
            ``,
            `🔗 Admin: https://chamepegue.com.br/admin/corridas`,
          ].join("\n");
        }
      } catch (e: any) {
        console.error("alertas-stuck: erro fetch corrida:", e?.message);
      }
    }

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
