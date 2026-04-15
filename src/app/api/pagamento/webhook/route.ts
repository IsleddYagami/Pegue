import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { buscarPagamento } from "@/lib/mercadopago";
import { sendMessage } from "@/lib/chatpro";
import { formatarTelefoneExibicao } from "@/lib/bot-utils";
import { MSG } from "@/lib/bot-messages";
import { updateSession } from "@/lib/bot-sessions";

export const dynamic = "force-dynamic";

// Webhook do Mercado Pago - recebe notificacoes de pagamento
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Log no Supabase
    await supabase.from("bot_logs").insert({
      payload: { tipo: "webhook_mercadopago", body },
    });

    // Mercado Pago envia diferentes tipos de notificacao
    if (body.type === "payment" || body.action === "payment.created" || body.action === "payment.updated") {
      const paymentId = body.data?.id?.toString();

      if (!paymentId) {
        return NextResponse.json({ status: "no_payment_id" });
      }

      // Busca detalhes do pagamento
      const pgto = await buscarPagamento(paymentId);

      if (pgto.status === "approved" && pgto.referencia) {
        const corridaId = pgto.referencia;

        // Verifica se corrida ja foi paga (evita duplicidade)
        const { data: corrida } = await supabase
          .from("corridas")
          .select("*, prestadores(nome, telefone), clientes(nome, telefone)")
          .eq("id", corridaId)
          .single();

        if (!corrida || corrida.status === "paga" || corrida.status === "concluida") {
          return NextResponse.json({ status: "ja_processado" });
        }

        // Atualiza corrida como paga (rastreio ativa depois, na coleta)
        await supabase
          .from("corridas")
          .update({
            status: "paga",
            pago_em: new Date().toISOString(),
          })
          .eq("id", corridaId);

        const clienteTel = (corrida.clientes as any)?.telefone;
        const prestador = corrida.prestadores as any;

        if (clienteTel) {
          // Atualiza sessao do cliente
          await updateSession(clienteTel, { step: "aguardando_pagamento" });

          // Notifica cliente - pagamento confirmado
          if (prestador) {
            const telFormatado = formatarTelefoneExibicao(prestador.telefone);
            await sendMessage({
              to: clienteTel,
              message: MSG.pagamentoConfirmado(prestador.nome, telFormatado),
            });

            // Envia orientacoes
            await sendMessage({
              to: clienteTel,
              message: MSG.orientacoesCliente,
            });
          }

          // Busca dados pra notificar fretista
          if (prestador) {
            const clienteNome = (corrida.clientes as any)?.nome || formatarTelefoneExibicao(clienteTel);
            const qtdAjudantes = corrida.qtd_ajudantes || 0;
            let ajudanteInfo = "Sem ajudante";
            if (qtdAjudantes > 0) {
              ajudanteInfo = `Com ${qtdAjudantes} ajudante${qtdAjudantes > 1 ? "s" : ""}`;
            }

            await sendMessage({
              to: prestador.telefone,
              message: `✅ *Pagamento confirmado! Servico liberado!*

👤 *Cliente:* ${clienteNome}
📱 *Contato:* ${formatarTelefoneExibicao(clienteTel)}

━━━━━━━━━━━━━━━━

📍 *Retirada:* ${corrida.origem_endereco}
🏠 *Entrega:* ${corrida.destino_endereco}
📦 *Material:* ${corrida.descricao_carga}
📅 *Data:* ${corrida.periodo || "A combinar"}
🙋 *${ajudanteInfo}*

━━━━━━━━━━━━━━━━

⚠️ *PROTOCOLO OBRIGATORIO:*
📸 Fotografe TODOS os itens na *COLETA*
📸 Fotografe TODOS os itens na *ENTREGA*
🚫 Sem fotos = pagamento *BLOQUEADO*

━━━━━━━━━━━━━━━━

⏳ *IMPORTANTE - APOS A ENTREGA:*
Apos descarregar, *aguarde no local* ate o cliente conferir e confirmar que esta tudo certo.
Seu pagamento so sera processado apos a confirmacao do cliente.
*Nao saia do local sem a confirmacao!*

Bom trabalho! 🚚✨`,
            });

            // Rastreio sera ativado na coleta (quando fretista digitar PRONTO)
          }
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    console.error("Erro webhook MP:", error?.message);
    return NextResponse.json({ status: "ok" }); // Sempre 200 pro MP nao reenviar
  }
}

// GET pra verificacao do webhook
export async function GET() {
  return NextResponse.json({ status: "Webhook Mercado Pago ativo" });
}
