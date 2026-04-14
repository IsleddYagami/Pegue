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

A partir de agora voce recebe indicacoes de fretes direto aqui no WhatsApp. Fique atento! 📱`,
      });

      // Segunda mensagem - Ferramentas disponiveis
      await sendMessage({
        to: prestador.telefone,
        message: `📋 *SUAS FERRAMENTAS PEGUE*

Preparamos tudo pra voce ter o melhor controle do seu trabalho. Veja o que voce pode fazer aqui pelo WhatsApp:

━━━━━━━━━━━━━━━━

📊 *PAINEL PESSOAL*
Acompanhe seus fretes, faturamento, score e ranking.
👉 Digite: *meu painel*

━━━━━━━━━━━━━━━━

💰 *CONTROLE FINANCEIRO*
Registre seus gastos do dia a dia e saiba seu lucro real!

*Como registrar uma despesa:*
👉 Digite: *despesa [valor] [descricao]*

*Exemplos:*
- *despesa 50 combustivel*
- *despesa 12.90 almoco*
- *despesa 6.20 zona azul*
- *despesa 35 ajudante*
- *despesa 150 carrinho transporte*
- *despesa 180 troca oleo*
- *despesa 7 agua*
- *despesa 20 recarga celular*

*Para ver seu resumo de gastos do mes:*
👉 Digite: *meus gastos*

Voce vera: ganhos x gastos x lucro e com o que mais gasta!

━━━━━━━━━━━━━━━━

🌐 *PAINEL NO SITE*
Acesse graficos completos pelo navegador:
👉 pegue-eta.vercel.app/parceiro
(role ate "Seu painel" e digite seu telefone)

━━━━━━━━━━━━━━━━

📱 *INSTAGRAM*
Siga *@chamepegue* pra novidades e oportunidades!
👉 instagram.com/chamepegue

━━━━━━━━━━━━━━━━

⚡ *DICA IMPORTANTE:*
O segredo e estar sempre atento ao WhatsApp! Quando um frete aparecer, *aceite o mais rapido possivel*. Outros parceiros tambem recebem a mesma indicacao — quem aceitar primeiro, leva o trabalho!

*Como aceitar um frete:*
Quando receber uma indicacao, basta digitar *PEGAR*
Somente a palavra *PEGAR* confirma o aceite.

━━━━━━━━━━━━━━━━

*RESUMO DOS COMANDOS:*
✅ *PEGAR* → aceitar um frete
✅ *meu painel* → ver seus dados
✅ *despesa 50 combustivel* → registrar gasto
✅ *meus gastos* → ver resumo financeiro
✅ *minha conta* → historico de servicos
⏸️ *modo ferias* → parar de receber indicacoes
▶️ *voltei* → retomar indicacoes

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

Tente novamente em alguns dias, estamos sempre abrindo novas oportunidades!

Obrigado e ate breve! 🚚✨`,
      });

      return NextResponse.json({ status: "rejeitado" });
    }

    return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
