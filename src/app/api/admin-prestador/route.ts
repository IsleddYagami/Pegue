import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/chatpro";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { key, prestadorId, acao } = await req.json();

    if (key !== "P3gu32026@@") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
    }

    if (!prestadorId || !acao) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    const { data: prestador } = await supabase
      .from("prestadores")
      .select("id, nome, telefone")
      .eq("id", prestadorId)
      .single();

    if (!prestador) {
      return NextResponse.json({ error: "Prestador nao encontrado" }, { status: 404 });
    }

    if (acao === "aprovar") {
      await supabase
        .from("prestadores")
        .update({ status: "aprovado", disponivel: true })
        .eq("id", prestadorId);

      // Notifica prestador
      await sendMessage({
        to: prestador.telefone,
        message: `🎉 *Parabens ${prestador.nome}!*

Seu cadastro foi *aprovado*!

Voce ja comeca a receber indicacoes de fretes pelo WhatsApp. Fique atento! 📱

Para ver seu painel, digite *meu painel* a qualquer momento.

Bem-vindo a Pegue! 🚚✨`,
      });

      return NextResponse.json({ status: "aprovado" });
    }

    if (acao === "rejeitar") {
      await supabase
        .from("prestadores")
        .update({ status: "rejeitado", disponivel: false })
        .eq("id", prestadorId);

      await sendMessage({
        to: prestador.telefone,
        message: `Oi ${prestador.nome}, infelizmente nao conseguimos aprovar seu cadastro no momento.

Se tiver duvidas, fale com nosso especialista Santos:
📱 (11) 97142-9605`,
      });

      return NextResponse.json({ status: "rejeitado" });
    }

    return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
