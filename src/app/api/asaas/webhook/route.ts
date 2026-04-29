import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { sendToClient } from "@/lib/chatpro";
import { formatarTelefoneExibicao } from "@/lib/bot-utils";
import { MSG } from "@/lib/bot-messages";
import { updateSession } from "@/lib/bot-sessions";
import { validarWebhookAsaas } from "@/lib/asaas";
import { gerarPinEntrega, montarMensagemPinCliente } from "@/lib/pin-entrega";

export const dynamic = "force-dynamic";

// Timeout 60s. Mesmo motivo do webhook MP: validar + UPDATE corrida +
// sendToClient cliente x2 + sendToClient prestador. Total >10s default Vercel.
export const maxDuration = 60;

// Webhook Asaas — recebe notificacoes de eventos:
// - PAYMENT_RECEIVED: pagamento confirmado pelo cliente (cobranca paga)
// - PAYMENT_CONFIRMED: dinheiro disponivel na conta (apos liquidacao Pix/cartao)
// - TRANSFER_DONE: repasse PIX pra fretista executado com sucesso
// - TRANSFER_FAILED: repasse falhou (devolver dinheiro / acionar manual)
//
// Configurar em https://www.asaas.com/integration/webhooks (sandbox e producao):
//   URL: https://www.chamepegue.com.br/api/asaas/webhook
//   Token: gerar UUID e adicionar como ASAAS_WEBHOOK_TOKEN na Vercel
//   Eventos marcados: PAYMENT_RECEIVED, PAYMENT_CONFIRMED, TRANSFER_DONE, TRANSFER_FAILED
//
// Status retornados:
//   200 - processado OU evento ignorado
//   401 - token invalido
//   500 - erro interno (Asaas reenvia)
export async function POST(req: NextRequest) {
  // 1) Valida origem (header asaas-access-token)
  if (!validarWebhookAsaas(req.headers)) {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "webhook_asaas_REJEITADO",
        motivo: "token_invalido",
      },
    });
    return NextResponse.json({ error: "token invalido" }, { status: 401 });
  }

  // 2) Parse body
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body invalido" }, { status: 400 });
  }

  const evento = body?.event as string | undefined;
  const payment = body?.payment as { id: string; status: string; value: number; externalReference?: string } | undefined;
  const transfer = body?.transfer as { id: string; status: string; value: number; externalReference?: string } | undefined;

  // Log minimo (sem dados pessoais)
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "webhook_asaas",
      event: evento,
      payment_id: payment?.id,
      payment_status: payment?.status,
      transfer_id: transfer?.id,
      transfer_status: transfer?.status,
    },
  });

  try {
    // === EVENTOS DE PAGAMENTO (cliente paga a cobranca) ===
    if (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED") {
      if (!payment?.externalReference) {
        return NextResponse.json({ status: "sem_external_reference" });
      }

      const corridaId = payment.externalReference;

      // Idempotencia: se corrida ja foi marcada paga, retorna OK silencioso
      const { data: corrida } = await supabase
        .from("corridas")
        .select("status, prestadores!prestador_id(nome, telefone), clientes(nome, telefone)")
        .eq("id", corridaId)
        .single();

      if (!corrida) {
        return NextResponse.json({ status: "corrida_nao_encontrada" });
      }
      if (corrida.status === "paga" || corrida.status === "concluida") {
        return NextResponse.json({ status: "ja_processado" });
      }

      // Gera PIN 4 digitos pra confirmacao de entrega (cliente entrega ao
      // fretista no destino — anti-fraude). Marca corrida como paga.
      const pinEntrega = gerarPinEntrega();
      await supabase
        .from("corridas")
        .update({
          status: "paga",
          pago_em: new Date().toISOString(),
          pin_entrega: pinEntrega,
        })
        .eq("id", corridaId);

      const clienteTel = (corrida.clientes as any)?.telefone;
      const prestador = corrida.prestadores as any;

      if (clienteTel && prestador) {
        // Atualiza sessions ANTES das chamadas chatpro (garantia)
        await Promise.all([
          updateSession(clienteTel, { step: "aguardando_numero_coleta" }),
          supabase.from("bot_sessions").upsert(
            {
              phone: prestador.telefone,
              step: "fretista_coleta_fotos",
              corrida_id: corridaId,
              instance_chatpro: 1,
              atualizado_em: new Date().toISOString(),
            } as any,
            { onConflict: "phone" },
          ),
        ]);

        const telFormatado = formatarTelefoneExibicao(prestador.telefone);

        // 4 mensagens em paralelo (nao bloqueia uma na outra)
        await Promise.allSettled([
          sendToClient({
            to: clienteTel,
            message: MSG.pagamentoConfirmado(prestador.nome, telFormatado),
          }),
          sendToClient({
            to: clienteTel,
            message: montarMensagemPinCliente(pinEntrega, prestador.nome),
          }),
          sendToClient({
            to: clienteTel,
            message: `📍 *Pra o fretista nao errar na coleta:*\n\nMe manda o *numero* e *complemento* do endereco de retirada 😊\n\nExemplo:\n• *450, Apto 12B*\n• *230, Casa 2*\n• *1500, Bloco 3 Apto 45*\n\nSe for so numero, manda so o numero 👍`,
          }),
          sendToClient({
            to: prestador.telefone,
            message: `✅ *Pagamento confirmado! Servico liberado!*

👤 *Cliente:* ${(corrida.clientes as any)?.nome || formatarTelefoneExibicao(clienteTel)}
📱 *Contato:* ${formatarTelefoneExibicao(clienteTel)}

━━━━━━━━━━━━━━━━

⚠️ *PROTOCOLO OBRIGATORIO - COLETA*

📸 *Fotografe TODOS os itens* na coleta. Pode mandar varias fotos aqui mesmo no chat (uma por uma).

✅ Quando terminar de fotografar a coleta, digite *PRONTO* aqui no chat — voce recebe o link do GPS pra acompanhar a entrega.

🚫 Sem fotos = pagamento *BLOQUEADO*.

━━━━━━━━━━━━━━━━

⏳ *APOS A ENTREGA:*
Fotografe os itens no local de entrega. Aguarde o cliente confirmar antes de sair.
Seu pagamento so sera liberado depois dessa confirmacao.

Bom trabalho! 🚚✨`,
          }),
        ]);
      }

      return NextResponse.json({ status: "ok" });
    }

    // === EVENTOS DE TRANSFERENCIA (Pegue paga fretista) ===
    if (evento === "TRANSFER_DONE") {
      if (!transfer?.externalReference) {
        return NextResponse.json({ status: "sem_external_reference" });
      }

      // Marca pagamento como repasse pago (idempotente)
      await supabase
        .from("pagamentos")
        .update({ repasse_status: "pago", pago_em: new Date().toISOString() })
        .eq("metodo", "asaas_pix")
        .like("corrida_id", `${transfer.externalReference}%`);

      return NextResponse.json({ status: "ok" });
    }

    if (evento === "TRANSFER_FAILED") {
      // Asaas nao conseguiu fazer o PIX. Notifica admin pra acao manual.
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "asaas_transfer_failed",
          transfer_id: transfer?.id,
          external_ref: transfer?.externalReference,
          valor: transfer?.value,
        },
      });

      // notificarAdmin importado dinamicamente pra evitar circular dep
      const { notificarAdmins } = await import("@/lib/admin-notify");
      await notificarAdmins(
        `🚨 *ASAAS TRANSFER FAILED*`,
        "sistema",
        `ID: ${transfer?.id}\nValor: R$ ${transfer?.value}\nRef: ${transfer?.externalReference}\n\n👉 Verificar Asaas + fazer PIX manual se necessario.`,
      );

      return NextResponse.json({ status: "ok_failed_logged" });
    }

    // Eventos nao tratados (ex: SUBSCRIPTION_CREATED) - 200 silencioso
    return NextResponse.json({ status: "evento_ignorado", event: evento });
  } catch (error: any) {
    console.error("Erro webhook Asaas:", error?.message);
    return NextResponse.json({ error: "erro_interno", details: error?.message }, { status: 500 });
  }
}

// GET pra healthcheck
export async function GET() {
  return NextResponse.json({ status: "Webhook Asaas ativo" });
}
