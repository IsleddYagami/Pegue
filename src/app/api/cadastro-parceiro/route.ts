import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/chatpro";
import { formatarTelefoneExibicao } from "@/lib/bot-utils";

export const dynamic = "force-dynamic";

const FABIO_PHONE = "5511970363713";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nome, cpf, email, telefone, tipoVeiculo, placa } = body;

    if (!nome || !cpf || !email || !telefone || !tipoVeiculo || !placa) {
      return NextResponse.json({ error: "Preencha todos os campos" }, { status: 400 });
    }

    const telCompleto = telefone.startsWith("55") ? telefone : `55${telefone}`;

    // Verifica se ja existe
    const { data: existe } = await supabase
      .from("prestadores")
      .select("id")
      .eq("telefone", telCompleto)
      .single();

    if (existe) {
      return NextResponse.json({ error: "Este telefone ja possui cadastro" }, { status: 400 });
    }

    // Salva prestador
    const { error: errPrestador } = await supabase.from("prestadores").insert({
      telefone: telCompleto,
      nome,
      cpf: cpf.replace(/\D/g, ""),
      status: "pendente",
      score: 5.0,
      total_corridas: 0,
      total_reclamacoes: 0,
      disponivel: false,
      termos_aceitos: false,
    });

    if (errPrestador) {
      return NextResponse.json({ error: "Erro ao cadastrar" }, { status: 500 });
    }

    // Salva veiculo
    const { data: prestador } = await supabase
      .from("prestadores")
      .select("id")
      .eq("telefone", telCompleto)
      .single();

    if (prestador) {
      await supabase.from("prestadores_veiculos").insert({
        prestador_id: prestador.id,
        tipo: tipoVeiculo,
        placa: placa.toUpperCase(),
        ativo: true,
      });
    }

    // Registra pre-cadastro
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "pre_cadastro_site",
        nome,
        email,
        telefone: telCompleto,
        tipoVeiculo,
        placa,
        data_hora: new Date().toISOString(),
      },
    });

    // Notifica Santos
    try {
      await sendMessage({
        to: FABIO_PHONE,
        message: `🆕 *Novo pre-cadastro pelo SITE!*\n\n👤 ${nome}\n📱 ${formatarTelefoneExibicao(telCompleto)}\n📧 ${email}\n🚗 ${tipoVeiculo}\n🪪 Placa: ${placa}\n\n⚠️ Faltam fotos - aguarde envio pelo WhatsApp`,
        instance: 1, // notificacao interna sempre pelo numero principal
      });
    } catch {
      // nao bloqueia se notificacao falhar
    }

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
