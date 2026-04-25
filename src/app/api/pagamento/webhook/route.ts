import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { buscarPagamento, validarAssinaturaWebhookMP } from "@/lib/mercadopago";
import { sendToClient } from "@/lib/chatpro";
import { formatarTelefoneExibicao } from "@/lib/bot-utils";
import { MSG } from "@/lib/bot-messages";
import { updateSession } from "@/lib/bot-sessions";

export const dynamic = "force-dynamic";

// Webhook do Mercado Pago - recebe notificacoes de pagamento.
// Retorna:
//   200 - processado com sucesso ou evento irrelevante
//   401 - assinatura invalida (atacante tentando forjar notificacao)
//   500 - erro interno processando (MP reenvia ate 8x)
// Atencao: antes estava retornando 200 em erros pra MP nao reenviar.
// Isso silenciava bugs. Agora erros reais -> 500 -> MP reenvia -> maior chance de recuperar.
export async function POST(req: NextRequest) {
  // 1) Valida assinatura ANTES de ler body/processar
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  const dataIdFromUrl = req.nextUrl.searchParams.get("data.id") || req.nextUrl.searchParams.get("id");

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body invalido" }, { status: 400 });
  }

  const dataId = body?.data?.id?.toString() || dataIdFromUrl;

  const assinaturaOk = validarAssinaturaWebhookMP({
    xSignature,
    xRequestId,
    dataId,
  });

  if (!assinaturaOk) {
    // Log pra auditoria (sem payload completo pra nao armazenar PII de atacante)
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "webhook_mercadopago_REJEITADO",
        motivo: "assinatura_invalida",
        headers_presentes: {
          x_signature: !!xSignature,
          x_request_id: !!xRequestId,
        },
        data_id_presente: !!dataId,
      },
    });
    return NextResponse.json({ error: "assinatura invalida" }, { status: 401 });
  }

  // 2) Processa (ja com assinatura confirmada)
  try {
    // Log minimo, sem body completo - MP manda email do pagador, dados do cartao, etc.
    // So o necessario: tipo, action, dataId, status
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "webhook_mercadopago",
        action: body.action,
        type: body.type,
        data_id: dataId,
      },
    });

    if (body.type === "payment" || body.action === "payment.created" || body.action === "payment.updated") {
      const paymentId = dataId;

      if (!paymentId) {
        return NextResponse.json({ status: "no_payment_id" });
      }

      const pgto = await buscarPagamento(paymentId);

      if (pgto.status === "approved" && pgto.referencia) {
        const corridaId = pgto.referencia;

        const { data: corrida } = await supabase
          .from("corridas")
          .select("*, prestadores(nome, telefone), clientes(nome, telefone)")
          .eq("id", corridaId)
          .single();

        if (!corrida) {
          // Referencia invalida. Isso eh suspeito mas nao eh erro do sistema.
          console.error("Webhook MP: corrida nao encontrada:", corridaId);
          return NextResponse.json({ status: "corrida_nao_encontrada" });
        }

        if (corrida.status === "paga" || corrida.status === "concluida") {
          return NextResponse.json({ status: "ja_processado" });
        }

        await supabase
          .from("corridas")
          .update({
            status: "paga",
            pago_em: new Date().toISOString(),
          })
          .eq("id", corridaId);

        const clienteTel = (corrida.clientes as any)?.telefone;
        const prestador = corrida.prestadores as any;

        if (clienteTel && prestador) {
          const telFormatado = formatarTelefoneExibicao(prestador.telefone);
          await sendToClient({
            to: clienteTel,
            message: MSG.pagamentoConfirmado(prestador.nome, telFormatado),
          });

          await updateSession(clienteTel, { step: "aguardando_numero_coleta" });
          await sendToClient({
            to: clienteTel,
            message: `📍 *Pra o fretista nao errar na coleta:*\n\nMe manda o *numero* e *complemento* do endereco de retirada 😊\n\nExemplo:\n• *450, Apto 12B*\n• *230, Casa 2*\n• *1500, Bloco 3 Apto 45*\n\nSe for so numero, manda so o numero 👍`,
          });

          const clienteNome = (corrida.clientes as any)?.nome || formatarTelefoneExibicao(clienteTel);
          const qtdAjudantes = corrida.qtd_ajudantes || 0;
          let ajudanteInfo = "Sem ajudante";
          if (qtdAjudantes > 0) {
            ajudanteInfo = `Com ${qtdAjudantes} ajudante${qtdAjudantes > 1 ? "s" : ""}`;
          }

          const isGuincho = (corrida.descricao_carga || "").toLowerCase().includes("guincho");

          if (isGuincho) {
            await sendToClient({
              to: prestador.telefone,
              message: `✅ *Pagamento confirmado! Servico de guincho liberado!*

👤 *Cliente:* ${clienteNome}
📱 *Contato:* ${formatarTelefoneExibicao(clienteTel)}

━━━━━━━━━━━━━━━━

📍 *Coleta:* ${corrida.origem_endereco}
🏠 *Destino:* ${corrida.destino_endereco}
🚗 *Servico:* ${corrida.descricao_carga}
📅 *Data:* ${corrida.periodo || "AGORA"}

━━━━━━━━━━━━━━━━

⚠️ *PROTOCOLO OBRIGATORIO:*
📸 Fotografe o veiculo *ANTES* de carregar (frontal, traseira, laterais)
📸 Fotografe o veiculo *APOS* descarregar
📸 Fotografe danos pre-existentes
🚫 Sem fotos = pagamento *BLOQUEADO*

━━━━━━━━━━━━━━━━

⏳ *IMPORTANTE - APOS A ENTREGA:*
Apos descarregar o veiculo, *aguarde no local* ate o cliente confirmar que esta tudo certo.
Seu pagamento so sera processado apos a confirmacao do cliente.
*Nao saia do local sem a confirmacao!*

Bom trabalho! 🚗✨`,
            });
          } else {
            await sendToClient({
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
          }
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    console.error("Erro webhook MP:", error?.message, error?.stack);
    // Importante: NAO retornar 200 aqui. MP precisa saber pra reenviar.
    // Senao, se o processamento falhar (ex: conexao Supabase), pagamento fica orfao.
    return NextResponse.json(
      { error: "erro_interno", details: error?.message },
      { status: 500 }
    );
  }
}

// GET pra verificacao/healthcheck do webhook
export async function GET() {
  return NextResponse.json({ status: "Webhook Mercado Pago ativo" });
}
