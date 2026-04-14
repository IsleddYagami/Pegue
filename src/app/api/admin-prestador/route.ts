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

      // Notifica prestador - mensagem completa
      await sendMessage({
        to: prestador.telefone,
        message: `🎉 *Parabens ${prestador.nome}!*

Seu cadastro foi *aprovado*! Bem-vindo a familia Pegue! 🚚✨

A partir de agora voce recebe indicacoes de fretes pelo WhatsApp. Fique atento! 📱

📊 *SEU PAINEL PESSOAL*
Digite *meu painel* pra ver:
- Seus fretes realizados
- Faturamento e lucro real
- Score e ranking
- Regioes mais atendidas

Voce tambem pode acessar pelo site:
👉 pegue-eta.vercel.app/parceiro

💰 *CONTROLE FINANCEIRO*
Quer controlar seus gastos do dia a dia? E simples!
Digite *despesa* seguido do valor e descricao.
Exemplo: *despesa 50 combustivel*
Ou: *despesa 12.90 almoco*

Pra ver seu resumo financeiro, digite *meus gastos*

📱 *SIGA NO INSTAGRAM*
Siga @chamepegue pra novidades, vagas e dicas!
👉 instagram.com/chamepegue

Conte com a gente! 🚚✨`,
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
        message: `Oi ${prestador.nome}, agradecemos muito seu interesse em ser parceiro da Pegue! 😊

No momento todas as posicoes estao preenchidas na sua regiao.

Tente novamente em alguns dias, estamos sempre abrindo novas vagas!

Obrigado e ate breve! 🚚✨`,
      });

      return NextResponse.json({ status: "rejeitado" });
    }

    return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
