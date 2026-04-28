import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { buscarPagamento, validarAssinaturaWebhookMP } from "@/lib/mercadopago";
import { sendToClient } from "@/lib/chatpro";
import { formatarTelefoneExibicao } from "@/lib/bot-utils";
import { MSG } from "@/lib/bot-messages";
import { updateSession } from "@/lib/bot-sessions";

export const dynamic = "force-dynamic";

// Timeout 60s (default Vercel sao 10s, mas processamento envolve:
// 1) validar assinatura, 2) buscar pagamento na MP API, 3) UPDATE corrida,
// 4) sendToClient pro cliente (2x) + 1x pro fretista via ChatPro.
// Cada chamada externa pode demorar 1-3s. Total >10s ja viola default
// Vercel -> 502 Bad Gateway -> MP achava webhook quebrado.
export const maxDuration = 60;

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

      // Log diagnostico: status real do pagamento + se tem referencia
      // (External_reference = corrida_id, deve estar setado no preference).
      // Sem isso nao tem como vincular pagamento -> corrida.
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "webhook_mp_buscar_pagamento",
          payment_id: paymentId,
          status: pgto.status,
          tem_referencia: !!pgto.referencia,
          referencia: pgto.referencia || null,
          valor: pgto.valor,
          metodo: pgto.metodo,
        },
      });

      // Pagamento NAO aprovado OU sem referencia: log e ignora silenciosamente.
      if (pgto.status !== "approved" || !pgto.referencia) {
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "webhook_mp_ignorado",
            motivo: pgto.status !== "approved" ? "status_nao_approved" : "sem_external_reference",
            payment_id: paymentId,
            status: pgto.status,
          },
        });
        return NextResponse.json({ status: "ignorado", motivo_status: pgto.status, tem_ref: !!pgto.referencia });
      }

      {
        const corridaId = pgto.referencia;

        // IDEMPOTENCIA: tenta marcar payment_id como processado ANTES de qualquer
        // efeito colateral. Se ja foi processado (codigo 23505 = UNIQUE violation),
        // retorna 200 silencioso. Protege contra MP reenviando o mesmo webhook ou
        // contra 2 webhooks chegando simultaneos (race condition).
        const { error: errIdempotencia } = await supabase
          .from("webhooks_mp_processados")
          .insert({
            payment_id: paymentId,
            status_pagamento: pgto.status,
            corrida_id: corridaId,
            resultado: "iniciando",
          });

        if (errIdempotencia) {
          if (errIdempotencia.code === "23505") {
            return NextResponse.json({ status: "ja_processado_idempotencia" });
          }
          // Outro erro real (ex: tabela inexistente, conexao). Propaga pra MP reenviar.
          throw errIdempotencia;
        }

        // Especifica FK pra evitar PGRST201 (corridas tem 2 FKs pra prestadores:
        // prestador_id e contraoferta_prestador_id - sem !prestador_id, Supabase
        // nao sabe qual usar e retorna null silenciosamente).
        const { data: corrida, error: errCorrida } = await supabase
          .from("corridas")
          .select("*, prestadores!prestador_id(nome, telefone), clientes(nome, telefone)")
          .eq("id", corridaId)
          .single();

        if (errCorrida) {
          await supabase.from("bot_logs").insert({
            payload: {
              tipo: "webhook_mp_select_corrida_falhou",
              corrida_id: corridaId,
              erro: errCorrida.message,
              code: errCorrida.code,
            },
          });
        }

        if (!corrida) {
          // Referencia invalida. Isso eh suspeito mas nao eh erro do sistema.
          console.error("Webhook MP: corrida nao encontrada:", corridaId);
          await supabase
            .from("webhooks_mp_processados")
            .update({ resultado: "corrida_nao_encontrada" })
            .eq("payment_id", paymentId);
          return NextResponse.json({ status: "corrida_nao_encontrada" });
        }

        if (corrida.status === "paga" || corrida.status === "concluida") {
          await supabase
            .from("webhooks_mp_processados")
            .update({ resultado: "ja_processado_por_status" })
            .eq("payment_id", paymentId);
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

          // Atualiza sessions ANTES das chamadas chatpro pra garantir steps
          // mesmo se ChatPro falhar/atrasar.
          // - Cliente: aguardando_numero_coleta (responde com numero/complemento)
          // - Fretista: fretista_coleta_fotos (UPSERT pra cobrir caso de fretista
          //   sem session - acontece se cleanup zumbis tiver removido).
          //   Sem isso, foto que fretista manda nao eh reconhecida como prova
          //   de coleta -> bug que bloqueava todo o resto do fluxo.
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

          const clienteNome = (corrida.clientes as any)?.nome || formatarTelefoneExibicao(clienteTel);
          const qtdAjudantes = corrida.qtd_ajudantes || 0;
          let ajudanteInfo = "Sem ajudante";
          if (qtdAjudantes > 0) {
            ajudanteInfo = `Com ${qtdAjudantes} ajudante${qtdAjudantes > 1 ? "s" : ""}`;
          }

          const isGuincho = (corrida.descricao_carga || "").toLowerCase().includes("guincho");

          // Mensagem do prestador (montada em variavel pra usar no allSettled)
          const mensagemPrestador = isGuincho
            ? `✅ *Pagamento confirmado! Servico de guincho liberado!*

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

Bom trabalho! 🚗✨`
            : `✅ *Pagamento confirmado! Servico liberado!*

👤 *Cliente:* ${clienteNome}
📱 *Contato:* ${formatarTelefoneExibicao(clienteTel)}

━━━━━━━━━━━━━━━━

📍 *Retirada:* ${corrida.origem_endereco}
🏠 *Entrega:* ${corrida.destino_endereco}
📦 *Material:* ${corrida.descricao_carga}
📅 *Data:* ${corrida.periodo || "A combinar"}
🙋 *${ajudanteInfo}*

━━━━━━━━━━━━━━━━

⚠️ *PROTOCOLO OBRIGATORIO - COLETA*

📸 *Fotografe TODOS os itens* na coleta. Pode mandar varias fotos aqui mesmo no chat (uma por uma).

✅ Quando terminar de fotografar a coleta, digite *PRONTO* aqui no chat — voce recebe o link do GPS pra acompanhar a entrega.

🚫 Sem fotos = pagamento *BLOQUEADO*.

━━━━━━━━━━━━━━━━

⏳ *APOS A ENTREGA:*
Fotografe os itens no local de entrega. Aguarde o cliente confirmar antes de sair.
Seu pagamento so sera liberado depois dessa confirmacao.

Bom trabalho! 🚚✨`;

          // Envia 3 mensagens em PARALELO (cliente x2 + prestador x1).
          // Antes era sequencial (~3-6s). Agora ~1-2s = nao estoura timeout.
          // allSettled: se 1 falhar, outras seguem (resiliencia).
          await Promise.allSettled([
            sendToClient({
              to: clienteTel,
              message: MSG.pagamentoConfirmado(prestador.nome, telFormatado),
            }),
            sendToClient({
              to: clienteTel,
              message: `📍 *Pra o fretista nao errar na coleta:*\n\nMe manda o *numero* e *complemento* do endereco de retirada 😊\n\nExemplo:\n• *450, Apto 12B*\n• *230, Casa 2*\n• *1500, Bloco 3 Apto 45*\n\nSe for so numero, manda so o numero 👍`,
            }),
            sendToClient({
              to: prestador.telefone,
              message: mensagemPrestador,
            }),
          ]);

        }

        // Marca processamento concluido com sucesso na tabela de idempotencia.
        await supabase
          .from("webhooks_mp_processados")
          .update({ resultado: "ok" })
          .eq("payment_id", paymentId);
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
