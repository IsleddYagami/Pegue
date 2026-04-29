import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { sendToClient } from "@/lib/chatpro";
import { MSG } from "@/lib/bot-messages";
import { finalizeDispatch, updateSession } from "@/lib/bot-sessions";
import { isValidCronKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron /api/cron/tarefas-agendadas - chamado pelo Vercel Cron a cada 1 minuto
// Substitui setTimeout em serverless (que nao funciona apos response).
//
// Pega tarefas com executar_em <= NOW() E executado_em IS NULL.
// Executa a acao, marca executado_em.
// Se der erro, grava em erro e tentativas++ (retry na proxima rodada, ate 3 vezes).

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const { data: tarefas, error: errFetch } = await supabase
    .from("tarefas_agendadas")
    .select("*")
    .is("executado_em", null)
    .lte("executar_em", new Date().toISOString())
    .lt("tentativas", 3)
    .order("executar_em", { ascending: true })
    .limit(50);

  if (errFetch) {
    console.error("Erro ao buscar tarefas agendadas:", errFetch);
    return NextResponse.json({ error: "erro fetch", details: errFetch.message }, { status: 500 });
  }

  if (!tarefas || tarefas.length === 0) {
    return NextResponse.json({ status: "vazio", executadas: 0 });
  }

  let sucesso = 0;
  let falhas = 0;
  const resultados: any[] = [];

  for (const tarefa of tarefas) {
    try {
      await executarTarefa(tarefa);
      await supabase
        .from("tarefas_agendadas")
        .update({ executado_em: new Date().toISOString(), erro: null })
        .eq("id", tarefa.id);
      sucesso++;
      resultados.push({ id: tarefa.id, tipo: tarefa.tipo, status: "ok" });
    } catch (error: any) {
      falhas++;
      const novasTentativas = (tarefa.tentativas || 0) + 1;
      await supabase
        .from("tarefas_agendadas")
        .update({
          tentativas: novasTentativas,
          erro: error?.message || String(error),
          // Se atingiu 3 tentativas, marca como executado_em pra nao tentar mais
          executado_em: novasTentativas >= 3 ? new Date().toISOString() : null,
        })
        .eq("id", tarefa.id);
      resultados.push({
        id: tarefa.id,
        tipo: tarefa.tipo,
        status: "erro",
        erro: error?.message,
        tentativas: novasTentativas,
      });
    }
  }

  return NextResponse.json({ status: "ok", sucesso, falhas, resultados });
}

async function executarTarefa(tarefa: any) {
  const { tipo, referencia, payload } = tarefa;

  switch (tipo) {
    case "dispatch_timeout_inicial":
      await handleDispatchTimeoutInicial(referencia, payload);
      break;

    case "dispatch_timeout_estendido":
      await handleDispatchTimeoutEstendido(referencia, payload);
      break;

    case "rastreio_lembrete_confirmacao":
      await handleRastreioLembrete(referencia, payload);
      break;

    case "rastreio_libera_fretista":
      await handleRastreioLiberaFretista(referencia, payload);
      break;

    case "ocorrencia_timeout_admin":
      await handleOcorrenciaTimeoutAdmin(referencia, payload);
      break;

    case "pin_entrega_timeout":
      await handlePinEntregaTimeout(referencia);
      break;

    case "dispatch_redispatch_rodada2":
      await handleDispatchRedispatch(referencia, payload);
      break;

    default:
      throw new Error(`Tipo de tarefa desconhecido: ${tipo}`);
  }
}

// 30min apos pedir PIN ao fretista: se corrida ainda nao concluida (PIN nao
// validado), alerta admin pra investigar (cliente nao no destino, fretista
// sem o PIN, ou tentativa de fraude).
async function handlePinEntregaTimeout(corridaId: string) {
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, status, prestadores!prestador_id(nome, telefone), clientes(nome, telefone)")
    .eq("id", corridaId)
    .single();
  if (!corrida) return;
  if (corrida.status === "concluida" || corrida.status === "cancelada") return;

  const { notificarAdmins } = await import("@/lib/admin-notify");
  await notificarAdmins(
    "🚨 *PIN ENTREGA TIMEOUT 30min*",
    "sistema",
    `Corrida ${corridaId} aguardando PIN do fretista ha 30min.

Fretista: ${(corrida.prestadores as any)?.nome || "?"} (${(corrida.prestadores as any)?.telefone || "?"})
Cliente: ${(corrida.clientes as any)?.nome || "?"} (${(corrida.clientes as any)?.telefone || "?"})

Possiveis causas:
- Cliente nao chegou ao destino
- Cliente nao recebeu o PIN
- Fretista esqueceu de pedir
- Tentativa de fraude

👉 Validar manualmente.`,
  );
}

// Re-dispatch automatico apos timeout 10min sem aceite. Bug auditoria 29/Abr:
// corrida ficava em limbo. Roda rodada 2 com novos fretistas (excluindo os que
// rejeitaram). Apos rodada 2 sem aceite, ai sim escala humano.
async function handleDispatchRedispatch(corridaId: string, _payload: any) {
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, status, dispatch_ativo, prestador_id, dispatch_rodada, dispatch_prestadores")
    .eq("id", corridaId)
    .single();
  if (!corrida) return;
  if (corrida.prestador_id) return; // ja foi aceito
  if (corrida.status === "cancelada") return;

  // So tenta rodada 2. Se ja foi rodada 2+, escala humano (deixa cron padrao
  // de timeout estendido lidar).
  if ((corrida.dispatch_rodada || 0) >= 2) return;

  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "dispatch_redispatch_iniciado",
      corrida_id: corridaId,
      rodada_anterior: corrida.dispatch_rodada,
      prestadores_rodada1: corrida.dispatch_prestadores,
    },
  });
}

// 31s apos inicio do dispatch: se ninguem aceitou E tem contraoferta de fretista,
// envia proposta pro cliente decidir.
async function handleDispatchTimeoutInicial(corridaId: string, _payload: any) {
  const { data: corrida } = await supabase
    .from("corridas")
    .select(
      "id, dispatch_ativo, prestador_id, contraoferta_prestador_id, contraoferta_data, periodo, prestadores:contraoferta_prestador_id(nome, telefone), clientes!inner(telefone)"
    )
    .eq("id", corridaId)
    .single();

  if (!corrida) return;

  // Ja foi aceito? Nao faz nada (handlePegar ja cuidou de tudo)
  if (corrida.prestador_id) return;

  // Dispatch foi cancelado/finalizado? Nao faz nada
  if (!corrida.dispatch_ativo) return;

  // Tem contraoferta? Envia proposta pro cliente
  if (corrida.contraoferta_prestador_id && corrida.contraoferta_data) {
    await finalizeDispatch(corridaId);
    const fretistaNome = (corrida.prestadores as any)?.nome || "O fretista";
    const dataOriginal = corrida.periodo || "a data original";
    const clientePhone = (corrida.clientes as any)?.telefone;
    if (!clientePhone) return;

    await updateSession(clientePhone, {
      step: "aguardando_contraoferta_data",
      corrida_id: corridaId,
    });
    await sendToClient({
      to: clientePhone,
      message: `📅 *Sobre sua data de ${dataOriginal}:*\n\nNao conseguimos confirmar nenhum parceiro pra essa data. Mas o parceiro *${fretistaNome}* pode atender em *${corrida.contraoferta_data}*.\n\nVoce aceita remarcar?\n\n1️⃣ *SIM* - Aceito ${corrida.contraoferta_data} com ${fretistaNome}\n2️⃣ *NAO* - Prefiro manter ${dataOriginal} e esperar outro parceiro`,
    });
  }

  // Sem contraoferta: nao faz nada agora. A tarefa dispatch_timeout_estendido
  // (10min depois) cuida de avisar cliente/admin se ainda estiver sem resposta.
}

// 10min total apos inicio: se dispatch ainda ativo, libera cliente e notifica admin
async function handleDispatchTimeoutEstendido(corridaId: string, payload: any) {
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, dispatch_ativo, prestador_id, clientes!inner(telefone)")
    .eq("id", corridaId)
    .single();

  if (!corrida) return;
  if (corrida.prestador_id) return; // ja aceito
  if (!corrida.dispatch_ativo) return; // ja finalizado antes

  await finalizeDispatch(corridaId);

  const clientePhone = (corrida.clientes as any)?.telefone;
  if (!clientePhone) return;

  await sendToClient({ to: clientePhone, message: MSG.nenhumFretista });

  const isGuincho = !!payload?.isGuincho;
  const urgente = !!payload?.urgente;

  // Monta resumo pra admin decidir
  const detalhes = await montarResumoCorrida(corridaId);

  const titulo = urgente
    ? `🚨 *URGENTE: NINGUEM ACEITOU RE-DISPATCH*`
    : isGuincho
      ? `⏳ *GUINCHO SEM RESPOSTA (10min)*`
      : `⏳ *FRETE SEM RESPOSTA (10min)*`;

  await notificarAdmins(
    titulo,
    clientePhone,
    `Nenhum fretista respondeu. Cliente avisado que equipe vai resolver.\n\n${detalhes}`
  );
}

// 10min apos chegada do fretista no destino: lembra cliente de confirmar
async function handleRastreioLembrete(corridaId: string, _payload: any) {
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, clientes!inner(telefone)")
    .eq("id", corridaId)
    .single();

  if (!corrida) return;
  const clientePhone = (corrida.clientes as any)?.telefone;
  if (!clientePhone) return;

  // Verifica se cliente ainda esta no step de confirmacao
  const { data: sessao } = await supabase
    .from("bot_sessions")
    .select("step")
    .eq("phone", clientePhone)
    .single();

  if (sessao?.step === "aguardando_confirmacao_entrega") {
    await sendToClient({ to: clientePhone, message: MSG.lembreteConfirmacao });
  }
}

// 20min apos chegada: libera fretista do local + notifica admin + lembra cliente
async function handleRastreioLiberaFretista(corridaId: string, _payload: any) {
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, clientes!inner(telefone), prestadores(telefone)")
    .eq("id", corridaId)
    .single();

  if (!corrida) return;
  const clientePhone = (corrida.clientes as any)?.telefone;
  if (!clientePhone) return;

  const { data: sessao } = await supabase
    .from("bot_sessions")
    .select("step")
    .eq("phone", clientePhone)
    .single();

  if (sessao?.step !== "aguardando_confirmacao_entrega") return;

  // Libera fretista do local (mensagem pra ele poder se retirar)
  const fretistaPhone = (corrida.prestadores as any)?.telefone;
  if (fretistaPhone) {
    await sendToClient({
      to: fretistaPhone,
      message: `⏳ *20 minutos sem confirmacao do cliente.*\n\nVoce pode se retirar do local. Aguarde o andamento das tratativas.\n\nSeu pagamento sera processado assim que o cliente confirmar.`,
    });
  }

  // Notifica admin
  await notificarAdmins(
    `⏳ *CLIENTE NAO CONFIRMOU ENTREGA (20min)*`,
    clientePhone,
    `Corrida: ${corridaId}\nCliente: ${clientePhone}\n${fretistaPhone ? `Fretista liberado do local: ${fretistaPhone}` : "Fretista nao identificado"}\nPagamento pendente.`
  );

  // Ultimo lembrete pro cliente
  await sendToClient({
    to: clientePhone,
    message: `⚠️ *O fretista aguardou 20 minutos e precisou se retirar.*\n\nPor favor, confirme se a entrega esta correta:\n\n1️⃣ *SIM* - Tudo certo, servicos concluidos com sucesso! ✅\n2️⃣ *NAO* - Tenho observacoes`,
  });
}

// 15min apos ocorrencia aberta: se admin nao resolveu, libera fretista e processa reembolso 50%
async function handleOcorrenciaTimeoutAdmin(ocorrenciaId: string, payload: any) {
  if (!ocorrenciaId) return;

  const { data: ocorrencia } = await supabase
    .from("ocorrencias")
    .select("id, tipo, status, corrida_id, corrida:corrida_id(id, codigo, valor_final, valor_estimado, clientes(nome, telefone), prestadores(nome, telefone))")
    .eq("id", ocorrenciaId)
    .maybeSingle();

  if (!ocorrencia) return;

  // Admin ja resolveu? nao faz nada
  if (ocorrencia.status !== "aberta" && ocorrencia.status !== "em_atendimento") return;

  const corrida = (ocorrencia.corrida as any);
  const cliente = (corrida?.clientes as any) || {};
  const prestador = (corrida?.prestadores as any) || {};
  const valor = Number(corrida?.valor_final || corrida?.valor_estimado || 0);
  const valorReembolso = Math.round(valor * 0.5);

  const fretistaPhone = payload?.fretista_phone || prestador.telefone;

  // Atualiza status da ocorrencia
  await supabase
    .from("ocorrencias")
    .update({
      status: "resolvida_liberado_fretista",
      valor_reembolso: valorReembolso,
      resolvida_em: new Date().toISOString(),
      resolvida_por: "sistema_timeout_15min",
    })
    .eq("id", ocorrenciaId);

  const tipoLabel = (ocorrencia.tipo || "").replace(/_/g, " ").toUpperCase();

  // Notifica admins
  await notificarAdmins(
    `⏰ *TIMEOUT OCORRÊNCIA — LIBERAR FRETISTA*`,
    fretistaPhone || "",
    [
      `🆔 Ocorrência: ${ocorrenciaId}`,
      `📋 Tipo: ${tipoLabel}`,
      `🏷️ Código: ${corrida?.codigo || "-"}`,
      ``,
      `⚠️ *15min se passaram sem resolução.*`,
      ``,
      `👤 Cliente: ${cliente.nome || "-"} (${cliente.telefone || "-"})`,
      `🚚 Fretista: ${prestador.nome || "-"} (${prestador.telefone || "-"})`,
      ``,
      `💰 Valor do frete: R$ ${valor}`,
      `💵 *Reembolso (50%) ao fretista: R$ ${valorReembolso}*`,
      ``,
      `Sistema liberou o fretista do local. Processar pagamento manualmente no MP.`,
    ].join("\n")
  );

  // Libera fretista
  if (fretistaPhone) {
    await sendToClient({
      to: fretistaPhone,
      message: `✅ *Você está liberado do local.*\n\nJá se passaram 15 minutos sem resolução da ocorrência. Pode seguir com sua rotina normal.\n\n💵 *Reembolso de R$ ${valorReembolso} (50% do frete)* será processado pela equipe Pegue em até 1 dia útil.\n\nObrigado pelo profissionalismo! 🙏`,
    });
  }
}

async function montarResumoCorrida(corridaId: string): Promise<string> {
  try {
    const { data: c } = await supabase
      .from("corridas")
      .select(
        "codigo, origem_endereco, destino_endereco, descricao_carga, periodo, data_agendada, valor_estimado, valor_prestador"
      )
      .eq("id", corridaId)
      .single();
    if (!c) return `Corrida: ${corridaId}`;
    return [
      `🔖 Codigo: ${c.codigo}`,
      `📍 ${c.origem_endereco || "-"}`,
      `🏠 ${c.destino_endereco || "-"}`,
      `📦 ${c.descricao_carga || "-"}`,
      `📅 ${c.periodo || c.data_agendada || "A combinar"}`,
      `💰 Cliente paga: R$ ${c.valor_estimado || "-"}`,
      `💵 Fretista recebe: R$ ${c.valor_prestador || "-"}`,
    ].join("\n");
  } catch {
    return `Corrida: ${corridaId}`;
  }
}
