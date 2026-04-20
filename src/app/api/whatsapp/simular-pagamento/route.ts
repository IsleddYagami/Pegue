import { NextRequest, NextResponse } from "next/server";
import { sendToClient } from "@/lib/chatpro";
import { getSession, updateSession } from "@/lib/bot-sessions";
import { MSG } from "@/lib/bot-messages";
import { formatarTelefoneExibicao } from "@/lib/bot-utils";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Simula confirmacao de pagamento para testes
// GET /api/whatsapp/simular-pagamento?phone=5511971429605
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");

  if (!phone) {
    return NextResponse.json({ error: "Informe ?phone=5511..." }, { status: 400 });
  }

  const session = await getSession(phone);
  if (!session) {
    return NextResponse.json({ error: "Sessao nao encontrada" }, { status: 404 });
  }

  if (session.step !== "aguardando_pagamento") {
    return NextResponse.json({ error: "Sessao nao esta aguardando pagamento", step: session.step }, { status: 400 });
  }

  if (!session.corrida_id) {
    return NextResponse.json({ error: "Corrida nao encontrada na sessao" }, { status: 400 });
  }

  // Busca corrida com prestador
  const { data: corrida } = await supabase
    .from("corridas")
    .select("*, prestador:prestadores(nome, telefone)")
    .eq("id", session.corrida_id)
    .single();

  if (!corrida) {
    return NextResponse.json({ error: "Corrida nao encontrada no banco" }, { status: 404 });
  }

  // Atualiza corrida como paga
  await supabase
    .from("corridas")
    .update({ status: "paga", pago_em: new Date().toISOString() })
    .eq("id", session.corrida_id);

  // Envia confirmacao pro cliente com dados do fretista
  const prestador = corrida.prestador;
  if (prestador) {
    const telFormatado = formatarTelefoneExibicao(prestador.telefone);

    await sendToClient({
      to: phone,
      message: MSG.pagamentoConfirmado(prestador.nome, telFormatado),
    });

    // Envia orientacoes apos pagamento
    await sendToClient({
      to: phone,
      message: MSG.orientacoesCliente,
    });

    // Busca nome do cliente e qtd ajudantes
    const { data: clienteInfo } = await supabase
      .from("clientes")
      .select("nome")
      .eq("telefone", phone)
      .single();

    const nomeCliente = clienteInfo?.nome || formatarTelefoneExibicao(phone);

    let ajudanteInfo = "Sem ajudante";
    if (corrida.qtd_ajudantes && corrida.qtd_ajudantes > 0) {
      ajudanteInfo = `Com ${corrida.qtd_ajudantes} ajudante${corrida.qtd_ajudantes > 1 ? "s" : ""}`;
    }

    // Envia detalhes do servico pro fretista
    await sendToClient({
      to: prestador.telefone,
      message: `✅ *Pagamento confirmado! Servico liberado!*

👤 *Cliente:* ${nomeCliente}
📱 *Contato:* ${formatarTelefoneExibicao(phone)}

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

  await updateSession(phone, { step: "concluido" });

  return NextResponse.json({
    status: "ok",
    message: "Pagamento simulado com sucesso",
    corrida_id: session.corrida_id,
    prestador: prestador?.nome || "nenhum"
  });
}
