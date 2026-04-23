import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
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

    default:
      throw new Error(`Tipo de tarefa desconhecido: ${tipo}`);
  }
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

// 20min apos chegada: notifica admin que cliente nao confirmou
async function handleRastreioLiberaFretista(corridaId: string, _payload: any) {
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, clientes!inner(telefone)")
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

  if (sessao?.step === "aguardando_confirmacao_entrega") {
    await notificarAdmins(
      `⚠️ *Cliente nao confirmou entrega ha 20 min*`,
      clientePhone,
      `Corrida: ${corridaId}\nCliente: ${clientePhone}\n\nVerifique e resolva.`
    );
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
