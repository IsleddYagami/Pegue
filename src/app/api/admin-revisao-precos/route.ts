import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdminAuth } from "@/lib/admin-auth";
import { sendToClient } from "@/lib/chatpro";

export const dynamic = "force-dynamic";

// GET /api/admin-revisao-precos?key=X
// Lista sessoes atualmente em aguardando_revisao_admin pra admin aprovar/rejeitar.
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data } = await supabase
    .from("bot_sessions")
    .select("phone, step, atualizado_em, origem_endereco, destino_endereco, descricao_carga, veiculo_sugerido, valor_estimado, distancia_km, data_agendada, periodo")
    .eq("step", "aguardando_revisao_admin")
    .order("atualizado_em", { ascending: false })
    .limit(100);

  return NextResponse.json({ sessoes: data || [] });
}

// POST /api/admin-revisao-precos
// Body: { key, phone, acao: "aprovar" | "ajustar" | "rejeitar", valor_novo?: number, motivo?: string }
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { phone, acao, valor_novo, motivo } = body as {
      phone: string;
      acao: "aprovar" | "ajustar" | "rejeitar";
      valor_novo?: number;
      motivo?: string;
    };

    if (!phone || !acao) {
      return NextResponse.json({ error: "phone e acao sao obrigatorios" }, { status: 400 });
    }

    const { data: sessao } = await supabase
      .from("bot_sessions")
      .select("*")
      .eq("phone", phone)
      .single();

    if (!sessao || sessao.step !== "aguardando_revisao_admin") {
      return NextResponse.json({ error: "sessao nao esta em revisao" }, { status: 400 });
    }

    if (acao === "aprovar") {
      // Libera o preco original. Move sessao pra aguardando_confirmacao (resumo ja foi
      // calculado, aqui so confirmamos que valor passa). Cliente recebe resumo pra SIM/ALTERAR.
      await supabase
        .from("bot_sessions")
        .update({
          step: "aguardando_confirmacao",
          atualizado_em: new Date().toISOString(),
        })
        .eq("phone", phone);

      const valorFormatado = Number(sessao.valor_estimado || 0).toFixed(2).replace(".", ",");
      await sendToClient({
        to: phone,
        message: `✅ *Cotação liberada!*\n\n📍 Retirada: ${sessao.origem_endereco || "-"}\n🏠 Entrega: ${sessao.destino_endereco || "-"}\n📦 ${sessao.descricao_carga || "-"}\n📅 ${sessao.data_agendada || sessao.periodo || "A combinar"}\n\n💰 *Total: R$ ${valorFormatado}*\n\nConfirma?\n\n1️⃣ ✅ *SIM*\n2️⃣ ✏️ *ALTERAR*`,
      });

      return NextResponse.json({ status: "aprovada", phone });
    }

    if (acao === "ajustar") {
      if (typeof valor_novo !== "number" || valor_novo <= 0) {
        return NextResponse.json({ error: "valor_novo invalido" }, { status: 400 });
      }

      await supabase
        .from("bot_sessions")
        .update({
          step: "aguardando_confirmacao",
          valor_estimado: valor_novo,
          atualizado_em: new Date().toISOString(),
        })
        .eq("phone", phone);

      const valorFormatado = valor_novo.toFixed(2).replace(".", ",");
      await sendToClient({
        to: phone,
        message: `✅ *Cotação ajustada pela equipe:*\n\n📍 Retirada: ${sessao.origem_endereco || "-"}\n🏠 Entrega: ${sessao.destino_endereco || "-"}\n📦 ${sessao.descricao_carga || "-"}\n📅 ${sessao.data_agendada || sessao.periodo || "A combinar"}\n\n💰 *Novo total: R$ ${valorFormatado}*\n\nConfirma?\n\n1️⃣ ✅ *SIM*\n2️⃣ ✏️ *ALTERAR*`,
      });

      return NextResponse.json({ status: "ajustada", phone, valor_novo });
    }

    if (acao === "rejeitar") {
      await supabase
        .from("bot_sessions")
        .update({
          step: "inicio",
          atualizado_em: new Date().toISOString(),
        })
        .eq("phone", phone);

      const motivoTexto = motivo && motivo.trim().length > 0
        ? motivo.trim()
        : "Infelizmente nao conseguimos atender esse frete neste momento.";

      await sendToClient({
        to: phone,
        message: `😔 ${motivoTexto}\n\nQualquer dúvida, fale com a nossa equipe pelo WhatsApp. Obrigado pelo contato!`,
      });

      return NextResponse.json({ status: "rejeitada", phone });
    }

    return NextResponse.json({ error: "acao invalida" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
