import { NextRequest, NextResponse } from "next/server";
import { sendMessage, sendMessageToMany } from "@/lib/chatpro";
import {
  type BotSession,
  getSession,
  createSession,
  updateSession,
  getDispatchForPrestador,
  getDispatchByCorridaId,
  addDispatchResponse,
  resolveDispatch,
  createDispatch,
  finalizeDispatch,
} from "@/lib/bot-sessions";
import { MSG } from "@/lib/bot-messages";
import {
  reverseGeocode,
  buscaCep,
  geocodeAddress,
  calcularDistanciaKm,
  calcularPrecos,
  extrairCep,
  pareceEndereco,
  isSaudacao,
  isAgradecimento,
  isAtendente,
  extrairRespostaPrestador,
  isHorarioAtendimentoHumano,
  formatarTelefoneExibicao,
} from "@/lib/bot-utils";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const FABIO_PHONE = "5511970363713";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    // Log no Supabase
    await supabase.from("bot_logs").insert({ payload: rawBody });

    const eventType = rawBody.Type || rawBody.type || "";

    const allowedTypes = [
      "receveid_message", "received_message",
      "receveid_location", "received_location",
      "receveid_image", "received_image",
      "receveid_audio", "received_audio",
      "receveid_document", "received_document",
      "receveid_video", "received_video",
    ];

    if (!allowedTypes.some((t) => eventType.toLowerCase().includes(t.toLowerCase()))) {
      return NextResponse.json({ status: "ignored_event", eventType });
    }

    const info = rawBody.Body?.Info || rawBody.Info || {};
    const message = rawBody.Body?.Text || "";
    const from = info.RemoteJid || info.SenderJid || "";
    const isGroup = from.includes("@g.us");
    const isFromMe = info.FromMe || false;

    const sourceMsg = info.Source?.message || {};
    const lat = sourceMsg.lat || sourceMsg.degreesLatitude || null;
    const lng = sourceMsg.lng || sourceMsg.degreesLongitude || null;

    const isMediaType = eventType.toLowerCase().includes("image");
    const hasMedia = isMediaType || !!sourceMsg.imageMessage;

    const imageUrl =
      rawBody.Url ||
      rawBody.Info?.Url ||
      rawBody.Body?.Info?.Source?.message?.imageMessage?.url ||
      sourceMsg.imageMessage?.url ||
      null;

    if (isGroup || isFromMe || !from) {
      return NextResponse.json({ status: "ignored" });
    }

    const phoneNumber = from.replace("@s.whatsapp.net", "");

    // Foto com IA - processa direto (aceita fotos em varios steps pra nao perder nenhuma)
    if (hasMedia && imageUrl) {
      const session = await getSession(phoneNumber);
      const stepsAceitamFoto = ["aguardando_foto", "aguardando_mais_fotos", "aguardando_destino"];
      if (session && stepsAceitamFoto.includes(session.step)) {
        const analise = await analisarFotoIA(imageUrl);

        if (analise) {
          const emoji = getItemEmoji(analise.item);
          let veiculoSugerido = analise.veiculo_sugerido;
          if (veiculoSugerido === "van") veiculoSugerido = "hr";

          // Adiciona item a lista existente
          const itensAnteriores = session.descricao_carga || "";
          const novoItem = analise.item;
          const listaItens = itensAnteriores
            ? `${itensAnteriores}, ${novoItem}`
            : novoItem;

          // Determina melhor veiculo baseado em todos os itens
          const melhorVeiculo = determinarMelhorVeiculo(
            session.veiculo_sugerido,
            veiculoSugerido
          );

          // Re-busca sessao pra pegar descricao atualizada (evita race condition)
          const sessaoAtual = await getSession(phoneNumber);
          const itensAtuais = sessaoAtual?.descricao_carga || "";
          const listaFinal = itensAtuais
            ? `${itensAtuais}, ${novoItem}`
            : novoItem;

          const melhorVeiculoFinal = determinarMelhorVeiculo(
            sessaoAtual?.veiculo_sugerido || null,
            veiculoSugerido
          );

          await updateSession(phoneNumber, {
            step: "aguardando_mais_fotos",
            descricao_carga: listaFinal,
            veiculo_sugerido: melhorVeiculoFinal,
            foto_url: imageUrl,
          });

          await sendMessage({
            to: phoneNumber,
            message: MSG.fotoItemAdicionado(novoItem, emoji, listaFinal),
          });
          return NextResponse.json({ status: "ok" });
        }

        // IA falhou mas recebeu foto
        const sessaoAtual = await getSession(phoneNumber);
        const itensAtuais = sessaoAtual?.descricao_carga || "";
        const listaItens = itensAtuais
          ? `${itensAtuais}, Material (foto)`
          : "Material (foto)";

        await updateSession(phoneNumber, {
          step: "aguardando_mais_fotos",
          descricao_carga: listaItens,
          foto_url: imageUrl,
        });

        await sendMessage({
          to: phoneNumber,
          message: `📸 Recebi a foto! Anotado! ✅\n\nAte agora temos: ${listaItens}\n\nTem mais algum item? Manda outra foto ou digite *PRONTO* pra seguir 😊`,
        });
        return NextResponse.json({ status: "ok" });
      }
    }

    // Prestador respondendo dispatch
    const dispatch = getDispatchForPrestador(phoneNumber);
    if (dispatch) {
      await handlePrestadorResponse(phoneNumber, message, dispatch.corridaId);
      return NextResponse.json({ status: "ok" });
    }

    // Fluxo do cliente
    try {
      await handleClienteMessage(phoneNumber, message, lat, lng, hasMedia, imageUrl);
    } catch (flowError: any) {
      console.error("Erro no fluxo:", flowError?.message);
    }

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    console.error("Erro no webhook:", error?.message, error?.stack);
    return NextResponse.json({ error: "Erro interno", detail: error?.message }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "Webhook Pegue ativo" });
}

// === FLUXO DO CLIENTE ===

async function handleClienteMessage(
  phone: string,
  message: string,
  lat: number | null,
  lng: number | null,
  hasMedia: boolean,
  imageUrl: string | null = null
) {
  if (isAtendente(message)) {
    await handleAtendente(phone);
    return;
  }

  if (isAgradecimento(message)) {
    await sendMessage({ to: phone, message: MSG.obrigado });
    return;
  }

  let session = await getSession(phone);

  // Nova conversa ou saudacao
  if (!session || isSaudacao(message)) {
    await createSession(phone);
    await updateSession(phone, { step: "aguardando_servico" });
    await sendMessage({ to: phone, message: MSG.boasVindas });
    return;
  }

  switch (session.step) {
    case "aguardando_servico":
      await handleEscolhaServico(phone, message);
      break;

    case "aguardando_localizacao":
      await handleLocalizacao(phone, message, lat, lng);
      break;

    case "aguardando_foto":
      await handleFoto(phone, message, hasMedia, imageUrl);
      break;

    case "aguardando_mais_fotos":
      await handleMaisFotos(phone, message);
      break;

    case "aguardando_destino":
      await handleDestino(phone, message);
      break;

    case "aguardando_tipo_local":
      await handleTipoLocal(phone, message);
      break;

    case "aguardando_andar":
      await handleAndar(phone, message);
      break;

    case "aguardando_ajudante":
      await handleAjudante(phone, message);
      break;

    case "aguardando_data":
      await handleData(phone, message);
      break;

    case "aguardando_confirmacao":
      await handleConfirmacao(phone, message);
      break;

    case "aguardando_pagamento":
      await sendMessage({
        to: phone,
        message: "Seu frete ja ta confirmado! 😊 Assim que o pagamento for identificado, te aviso aqui!",
      });
      break;

    default:
      await createSession(phone);
      await updateSession(phone, { step: "aguardando_servico" });
      await sendMessage({ to: phone, message: MSG.boasVindas });
      break;
  }
}

// STEP 0: Escolha do servico
async function handleEscolhaServico(phone: string, message: string) {
  const lower = message.toLowerCase().trim();

  if (lower === "1" || lower.includes("frete") || lower.includes("mudanc")) {
    await updateSession(phone, { step: "aguardando_localizacao" });
    await sendMessage({ to: phone, message: MSG.pedirLocalizacao });
    return;
  }

  if (lower === "2" || lower.includes("guincho")) {
    await sendMessage({ to: phone, message: MSG.guincho });
    return;
  }

  if (lower === "3" || lower.includes("santos") || lower.includes("especialista")) {
    await handleAtendente(phone);
    return;
  }

  await sendMessage({
    to: phone,
    message: "Escolhe uma opcao, por favor! 😊\n\n1️⃣ Pequenos Fretes ou Mudanca\n2️⃣ Guincho (carro ou moto)\n3️⃣ Falar com nosso especialista Santos",
  });
}

// STEP 1: Localizacao
async function handleLocalizacao(
  phone: string, message: string, lat: number | null, lng: number | null
) {
  if (lat && lng) {
    const endereco = await reverseGeocode(lat, lng);
    await updateSession(phone, {
      step: "aguardando_foto",
      origem_endereco: endereco,
      origem_lat: lat,
      origem_lng: lng,
    });
    await sendMessage({ to: phone, message: MSG.localizacaoRecebida(endereco) });
    return;
  }

  const cep = extrairCep(message);
  if (cep) {
    const endereco = await buscaCep(cep);
    if (endereco) {
      const coords = await geocodeAddress(endereco);
      await updateSession(phone, {
        step: "aguardando_foto",
        origem_endereco: endereco,
        origem_lat: coords?.lat || null,
        origem_lng: coords?.lng || null,
      });
      await sendMessage({ to: phone, message: MSG.enderecoRecebido(endereco) });
      return;
    }
  }

  if (pareceEndereco(message)) {
    const coords = await geocodeAddress(message);
    await updateSession(phone, {
      step: "aguardando_foto",
      origem_endereco: message,
      origem_lat: coords?.lat || null,
      origem_lng: coords?.lng || null,
    });
    await sendMessage({ to: phone, message: MSG.enderecoRecebido(message) });
    return;
  }

  await sendMessage({ to: phone, message: MSG.naoEntendi });
}

// STEP 2: Foto
async function handleFoto(
  phone: string, message: string, hasMedia: boolean, imageUrl: string | null = null
) {
  if (message.length > 2) {
    await updateSession(phone, {
      step: "aguardando_destino",
      descricao_carga: message,
    });
    await sendMessage({ to: phone, message: MSG.fotoRecebida(message) });
    return;
  }

  await sendMessage({
    to: phone,
    message: "Me manda uma foto do material ou descreve o que precisa levar 📸😊",
  });
}

// STEP 2b: Mais fotos ou PRONTO
async function handleMaisFotos(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  if (lower === "pronto" || lower === "so isso" || lower === "só isso" || lower === "nao" || lower === "não" || lower === "n") {
    const veiculoNome: Record<string, string> = {
      utilitario: "Utilitario (Strada/Saveiro)",
      hr: "HR",
      caminhao_bau: "Caminhao Bau",
    };

    const itens = session.descricao_carga || "Material";
    const veiculo = session.veiculo_sugerido || "utilitario";

    // Formata lista de itens com emoji
    const itensFormatados = itens.split(", ").map((i) => `📦 ${i}`).join("\n");

    await updateSession(phone, { step: "aguardando_destino" });

    await sendMessage({
      to: phone,
      message: MSG.todosItensProntos(
        itensFormatados,
        veiculoNome[veiculo] || "Utilitario"
      ),
    });
    return;
  }

  // Se mandou texto descrevendo mais itens
  if (message.length > 2) {
    const itensAnteriores = session.descricao_carga || "";
    const listaItens = itensAnteriores ? `${itensAnteriores}, ${message}` : message;

    await updateSession(phone, { descricao_carga: listaItens });

    await sendMessage({
      to: phone,
      message: `Anotado! ✅\n\nAte agora temos: ${listaItens}\n\nTem mais algum item? Manda outra foto ou digite *PRONTO* pra seguir 😊`,
    });
    return;
  }

  await sendMessage({
    to: phone,
    message: "Manda outra foto ou digite *PRONTO* pra seguir 😊",
  });
}

// Determina melhor veiculo baseado nos itens (sempre o maior necessario)
function determinarMelhorVeiculo(
  veiculoAtual: string | null,
  veiculoNovo: string
): string {
  const hierarquia: Record<string, number> = {
    utilitario: 1,
    hr: 2,
    caminhao_bau: 3,
  };

  const nivelAtual = hierarquia[veiculoAtual || "utilitario"] || 1;
  const nivelNovo = hierarquia[veiculoNovo] || 1;

  // Sempre sobe, nunca desce
  if (nivelNovo > nivelAtual) return veiculoNovo;
  return veiculoAtual || "utilitario";
}

// STEP 3: Destino
async function handleDestino(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  let destinoEndereco = message;
  let destinoLat: number | null = null;
  let destinoLng: number | null = null;

  const cep = extrairCep(message);
  if (cep) {
    const endereco = await buscaCep(cep);
    if (endereco) {
      destinoEndereco = endereco;
      const coords = await geocodeAddress(endereco);
      destinoLat = coords?.lat || null;
      destinoLng = coords?.lng || null;
    }
  } else {
    const coords = await geocodeAddress(message);
    destinoLat = coords?.lat || null;
    destinoLng = coords?.lng || null;
  }

  await updateSession(phone, {
    step: "aguardando_tipo_local",
    destino_endereco: destinoEndereco,
    destino_lat: destinoLat,
    destino_lng: destinoLng,
  });

  const cidadeDestino = destinoEndereco.split(",").pop()?.trim() || destinoEndereco;
  await sendMessage({ to: phone, message: MSG.destinoRecebido(cidadeDestino) });
}

// STEP 4: Tipo do local (terreo/elevador/escada)
async function handleTipoLocal(phone: string, message: string) {
  const lower = message.toLowerCase().trim();

  if (lower === "1" || lower.includes("terreo") || lower.includes("térreo") || lower.includes("casa")) {
    // Terreo - sem adicional
    await updateSession(phone, {
      step: "aguardando_ajudante",
      tem_escada: false,
      andar: 0,
    });
    await sendMessage({
      to: phone,
      message: MSG.precisaAjudante("Local terreo, anotado! ✅"),
    });
    return;
  }

  if (lower === "2" || lower.includes("elevador")) {
    // Elevador - +R$50
    await updateSession(phone, {
      step: "aguardando_ajudante",
      tem_escada: false,
      andar: 0,
    });
    await sendMessage({
      to: phone,
      message: MSG.precisaAjudante("Predio com elevador, anotado! ✅"),
    });
    return;
  }

  if (lower === "3" || lower.includes("escada") || lower.includes("sem elevador")) {
    await updateSession(phone, { step: "aguardando_andar", tem_escada: true });
    await sendMessage({ to: phone, message: MSG.qualAndar });
    return;
  }

  await sendMessage({
    to: phone,
    message: "Escolhe uma opcao, por favor! 😊\n\n1️⃣ Casa ou terreo\n2️⃣ Predio com elevador (+R$ 50)\n3️⃣ Predio sem elevador / escada (+R$ 30 por andar)",
  });
}

// STEP 4b: Qual andar (escada)
async function handleAndar(phone: string, message: string) {
  const andarMatch = message.match(/(\d+)/);
  if (andarMatch) {
    const andar = parseInt(andarMatch[1]);
    const valorEscada = andar * 30;

    await updateSession(phone, {
      step: "aguardando_ajudante",
      andar,
    });
    await sendMessage({
      to: phone,
      message: MSG.precisaAjudante(`${andar}o andar por escada, anotado! ✅`),
    });
    return;
  }

  await sendMessage({
    to: phone,
    message: "Me manda o numero do andar 😊 Exemplo: *5*",
  });
}

// STEP 5: Precisa ajudante?
async function handleAjudante(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();
  let precisaAjudante = false;

  if (lower === "1" || lower.includes("nao") || lower === "n" || lower.includes("não") || lower.includes("sozinho")) {
    precisaAjudante = false;
  } else if (lower === "2" || lower.includes("sim") || lower === "s" || lower.includes("preciso") || lower.includes("ajudante")) {
    precisaAjudante = true;
  } else {
    await sendMessage({
      to: phone,
      message: "Vai precisar de ajudante? 😊\n\n1️⃣ *Nao*, consigo sozinho\n2️⃣ *Sim*, preciso de ajudante",
    });
    return;
  }

  await updateSession(phone, { precisa_ajudante: precisaAjudante });

  // Calcular distancia
  let distanciaKm = 2;
  if (session.origem_lat && session.origem_lng && session.destino_lat && session.destino_lng) {
    distanciaKm = calcularDistanciaKm(
      session.origem_lat, session.origem_lng,
      session.destino_lat, session.destino_lng
    );
  }

  // Detectar se tem elevador (step anterior salvou tem_escada=false e andar=0 para elevador)
  // Precisamos distinguir terreo de elevador - vamos checar pela mensagem anterior
  // Se tem_escada=false e andar=0, pode ser terreo ou elevador
  // Vamos usar um campo extra - por ora checamos o destino_endereco

  const temElevador = !session.tem_escada && session.andar === 0 ? false : false;
  // TODO: salvar temElevador na sessao (por ora nao temos campo)

  const veiculo = session.veiculo_sugerido || "utilitario";
  const precos = calcularPrecos(distanciaKm, veiculo, precisaAjudante, session.andar || 0, false);

  const p = precos.padrao;

  const veiculoNome: Record<string, string> = {
    utilitario: "Utilitario (Strada/Saveiro)",
    hr: "HR",
    caminhao_bau: "Caminhao Bau",
  };

  await updateSession(phone, {
    step: "aguardando_data",
    distancia_km: distanciaKm,
    valor_estimado: p.total,
  });

  await sendMessage({
    to: phone,
    message: MSG.orcamento(
      session.origem_endereco || "Origem",
      session.destino_endereco || "Destino",
      session.descricao_carga || "Material",
      veiculoNome[veiculo] || "Utilitario",
      p.total.toString()
    ),
  });
}

// STEP 6: Data
async function handleData(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  await updateSession(phone, {
    step: "aguardando_confirmacao",
    data_agendada: message,
  });

  const veiculo = session.veiculo_sugerido || "utilitario";
  const veiculoNome: Record<string, string> = {
    utilitario: "Utilitario (Strada/Saveiro)",
    hr: "HR",
    caminhao_bau: "Caminhao Bau",
  };

  // Montar detalhes
  let detalhes = "";
  if (session.precisa_ajudante) detalhes += "🙋 Com ajudante\n";
  if (session.tem_escada && session.andar && session.andar > 0) detalhes += `🪜 ${session.andar}o andar (escada)\n`;

  await sendMessage({
    to: phone,
    message: MSG.resumoFrete(
      session.origem_endereco || "Origem",
      session.destino_endereco || "Destino",
      session.descricao_carga || "Material",
      message,
      veiculoNome[veiculo] || "Utilitario",
      (session.valor_estimado || 0).toString(),
      detalhes
    ),
  });
}

// STEP 7: Confirmacao
async function handleConfirmacao(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  if (lower.startsWith("sim") || lower === "s" || lower === "confirmar") {
    const corridaId = await salvarCorrida(session);

    if (corridaId) {
      await updateSession(phone, { step: "aguardando_pagamento", corrida_id: corridaId });

      // TODO: Gerar link Mercado Pago
      const linkPagamento = `https://pegue-eta.vercel.app/simular`;

      await sendMessage({ to: phone, message: MSG.linkPagamento(linkPagamento) });
      await dispararParaFretistas(corridaId, session);
    } else {
      await sendMessage({ to: phone, message: MSG.erroInterno });
    }
  } else if (lower.startsWith("nao") || lower === "n" || lower === "não") {
    await createSession(phone);
    await updateSession(phone, { step: "aguardando_servico" });
    await sendMessage({
      to: phone,
      message: "Sem problema! 😊 Vamos comecar de novo.\n\n" + MSG.boasVindas,
    });
  } else {
    await sendMessage({
      to: phone,
      message: "Responda *SIM* pra confirmar ou *NAO* pra ajustar algo 😊",
    });
  }
}

// === ATENDIMENTO HUMANO ===

async function handleAtendente(phone: string) {
  if (isHorarioAtendimentoHumano()) {
    await updateSession(phone, { step: "atendimento_humano" });
    await sendMessage({ to: phone, message: MSG.transferenciaHumano });
    await sendMessage({
      to: FABIO_PHONE,
      message: `🔔 *Atendimento solicitado!*\n\nCliente: ${formatarTelefoneExibicao(phone)}\nHorario: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    });
  } else {
    await sendMessage({ to: phone, message: MSG.foraHorarioHumano });
  }
}

// === DISPATCH FRETISTAS ===

async function dispararParaFretistas(corridaId: string, session: BotSession) {
  try {
    const { data: prestadores } = await supabase
      .from("prestadores")
      .select("telefone, nome")
      .eq("disponivel", true)
      .eq("status", "aprovado");

    if (!prestadores || prestadores.length === 0) return;

    const telefones = prestadores.map((p) => p.telefone);
    const valorPrestador = Math.round((session.valor_estimado || 0) * 0.8);

    createDispatch(corridaId, session.phone, telefones);

    const mensagem = MSG.novoFreteDisponivel(
      session.origem_endereco || "SP",
      session.destino_endereco || "Destino",
      session.descricao_carga || "Material",
      session.data_agendada || "A combinar",
      valorPrestador.toString(),
      corridaId
    );

    await sendMessageToMany(telefones, mensagem);

    setTimeout(async () => {
      const vencedor = resolveDispatch(corridaId);
      if (vencedor) await notificarResultadoDispatch(corridaId, vencedor);
    }, 31000);
  } catch (error: any) {
    console.error("Erro dispatch:", error?.message);
  }
}

async function handlePrestadorResponse(prestadorPhone: string, message: string, corridaId: string) {
  const { aceite, valor } = extrairRespostaPrestador(message);

  if (!aceite) {
    await sendMessage({
      to: prestadorPhone,
      message: "Pra aceitar o frete, responda *SIM* seguido do seu valor.\nExemplo: *SIM 200*",
    });
    return;
  }

  addDispatchResponse(corridaId, prestadorPhone, valor || 9999);
  const vencedor = resolveDispatch(corridaId);

  if (vencedor) {
    await notificarResultadoDispatch(corridaId, vencedor);
  } else {
    await sendMessage({
      to: prestadorPhone,
      message: "Resposta recebida! ✅ Aguardando outros prestadores... Resultado em instantes!",
    });
  }
}

async function notificarResultadoDispatch(corridaId: string, vencedorPhone: string) {
  const dispatch = getDispatchByCorridaId(corridaId);
  if (!dispatch) return;

  await sendMessage({ to: vencedorPhone, message: MSG.freteAceito });

  for (const phone of dispatch.prestadores) {
    if (phone !== vencedorPhone) {
      await sendMessage({ to: phone, message: MSG.freteJaPego });
    }
  }

  try {
    const { data: prestador } = await supabase
      .from("prestadores")
      .select("id, nome")
      .eq("telefone", vencedorPhone)
      .single();

    if (prestador) {
      await supabase
        .from("corridas")
        .update({ prestador_id: prestador.id, status: "aceita" })
        .eq("id", corridaId);
    }
  } catch (error: any) {
    console.error("Erro atualizar corrida:", error?.message);
  }

  finalizeDispatch(corridaId);
}

// === SALVAR CORRIDA ===

async function salvarCorrida(session: BotSession): Promise<string | null> {
  try {
    let clienteId: string | null = null;

    const { data: clienteExistente } = await supabase
      .from("clientes")
      .select("id")
      .eq("telefone", session.phone)
      .single();

    if (clienteExistente) {
      clienteId = clienteExistente.id;
    } else {
      const { data: novoCliente, error: errCliente } = await supabase
        .from("clientes")
        .insert({ telefone: session.phone, nivel: "bronze", total_corridas: 0, ativo: true })
        .select("id")
        .single();

      if (errCliente) {
        await supabase.from("bot_logs").insert({ payload: { debug: "erro_criar_cliente", error: errCliente.message, phone: session.phone } });
        return null;
      }
      clienteId = novoCliente?.id || null;
    }

    if (!clienteId) {
      await supabase.from("bot_logs").insert({ payload: { debug: "cliente_id_null", phone: session.phone } });
      return null;
    }

    const codigo = `PG${Date.now().toString(36).toUpperCase()}`;

    const { data: corrida, error: errCorrida } = await supabase
      .from("corridas")
      .insert({
        codigo,
        cliente_id: clienteId,
        origem_endereco: session.origem_endereco || "",
        origem_lat: session.origem_lat,
        origem_lng: session.origem_lng,
        destino_endereco: session.destino_endereco || "",
        destino_lat: session.destino_lat,
        destino_lng: session.destino_lng,
        distancia_km: session.distancia_km,
        tipo_servico: "frete",
        tipo_veiculo: session.veiculo_sugerido,
        descricao_carga: session.descricao_carga,
        escada_origem: session.tem_escada,
        andares_origem: session.andar,
        plano: "padrao",
        valor_estimado: session.valor_estimado,
        valor_final: session.valor_estimado,
        valor_prestador: Math.round((session.valor_estimado || 0) * 0.8),
        valor_pegue: Math.round((session.valor_estimado || 0) * 0.2),
        data_agendada: session.data_agendada,
        status: "pendente",
        canal_origem: "whatsapp",
      })
      .select("id")
      .single();

    if (errCorrida) {
      await supabase.from("bot_logs").insert({ payload: { debug: "erro_criar_corrida", error: errCorrida.message, code: errCorrida.code } });
      return null;
    }

    return corrida?.id || null;
  } catch (error: any) {
    await supabase.from("bot_logs").insert({ payload: { debug: "erro_salvar_catch", error: error?.message } });
    return null;
  }
}

// === OPENAI VISION ===

async function analisarFotoIA(imageUrl: string): Promise<{
  item: string; quantidade: string; tamanho: string;
  veiculo_sugerido: string; observacao: string;
} | null> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Voce e um assistente de uma empresa de fretes chamada Pegue.
Analise a foto e retorne APENAS um JSON:
{
  "item": "nome do item (ex: Geladeira, Sofa, Violao)",
  "quantidade": "quantidade (ex: 1, 3, varias caixas)",
  "tamanho": "pequeno, medio ou grande",
  "veiculo_sugerido": "utilitario, hr ou caminhao_bau",
  "observacao": "frase curta (max 15 palavras)"
}
Veiculos disponiveis:
- utilitario: Strada/Saveiro (cacamba 1.2m x 1.5m) - itens pequenos e medios ate 1 item grande
- hr: Hyundai HR (1.7m x 2.8m) - 1-3 itens grandes (geladeira+fogao+cama)
- caminhao_bau: (2.5m x 3.5m) - mudanca completa, muitos itens grandes
Responda SOMENTE o JSON.`,
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
            { type: "text", text: "O que e esse material? Qual veiculo ideal?" },
          ],
        },
      ],
      max_tokens: 200,
      temperature: 0.1,
    });

    const texto = response.choices[0]?.message?.content || "";
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return null;
  } catch (error: any) {
    console.error("Erro OpenAI Vision:", error?.message);
    return null;
  }
}

function getItemEmoji(item: string): string {
  const lower = item.toLowerCase();
  if (lower.includes("sofa") || lower.includes("sofá")) return "🛋️";
  if (lower.includes("geladeira") || lower.includes("refrigerador")) return "🧊";
  if (lower.includes("maquina") || lower.includes("máquina")) return "🫧";
  if (lower.includes("caixa")) return "📦";
  if (lower.includes("mesa")) return "🪑";
  if (lower.includes("cama") || lower.includes("colchao")) return "🛏️";
  if (lower.includes("tv") || lower.includes("televisao")) return "📺";
  if (lower.includes("violao") || lower.includes("guitarra")) return "🎸";
  if (lower.includes("bicicleta") || lower.includes("bike")) return "🚲";
  if (lower.includes("piano") || lower.includes("teclado")) return "🎹";
  return "📦";
}
