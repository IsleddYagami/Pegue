import { NextRequest, NextResponse } from "next/server";
import { sendMessage, sendMessageToMany } from "@/lib/chatpro";
import {
  getSession,
  createSession,
  updateSession,
  getDispatchForPrestador,
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

// Numero do Fabio para notificacoes de atendimento humano
const FABIO_PHONE = "5511970363713";

// Webhook recebe mensagens do ChatPro
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log("Webhook recebido:", JSON.stringify(body, null, 2));

    // Filtra apenas mensagens recebidas
    if (!body || body.type !== "ReceivedCallback") {
      return NextResponse.json({ status: "ignored" });
    }

    const message = body.body || "";
    const from = body.from || "";
    const isGroup = body.isGroup || false;
    const isFromMe = body.fromMe || false;
    const lat = body.lat || null;
    const lng = body.lng || null;
    const hasMedia = body.hasMedia || false;

    // Ignora mensagens de grupo e proprias
    if (isGroup || isFromMe || !from) {
      return NextResponse.json({ status: "ignored" });
    }

    const phoneNumber = from.replace("@s.whatsapp.net", "");

    console.log(`Mensagem de ${phoneNumber}: ${message}`);

    // Verifica se e prestador respondendo a dispatch
    const dispatch = getDispatchForPrestador(phoneNumber);
    if (dispatch) {
      await handlePrestadorResponse(phoneNumber, message, dispatch.corridaId);
      return NextResponse.json({ status: "ok" });
    }

    // Fluxo do cliente
    await handleClienteMessage(phoneNumber, message, lat, lng, hasMedia);

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    console.error("Erro no webhook:", error?.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// GET healthcheck
export async function GET() {
  return NextResponse.json({ status: "Webhook Pegue ativo" });
}

// === FLUXO DO CLIENTE ===

async function handleClienteMessage(
  phone: string,
  message: string,
  lat: number | null,
  lng: number | null,
  hasMedia: boolean
) {
  // Detecta pedido de atendente em qualquer momento
  if (isAtendente(message)) {
    await handleAtendente(phone);
    return;
  }

  // Detecta agradecimento
  if (isAgradecimento(message)) {
    await sendMessage({ to: phone, message: MSG.obrigado });
    return;
  }

  let session = getSession(phone);

  // Nova conversa ou saudacao
  if (!session || isSaudacao(message)) {
    session = createSession(phone);
    updateSession(phone, { step: "aguardando_localizacao" });
    await sendMessage({ to: phone, message: MSG.boasVindas });
    return;
  }

  // Processa de acordo com o step atual
  switch (session.step) {
    case "aguardando_localizacao":
      await handleLocalizacao(phone, message, lat, lng);
      break;

    case "aguardando_foto":
      await handleFoto(phone, message, hasMedia);
      break;

    case "aguardando_destino":
      await handleDestino(phone, message);
      break;

    case "aguardando_detalhes":
      await handleDetalhes(phone, message);
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
        message:
          "Seu frete ja ta confirmado! 😊 Assim que o pagamento for identificado, te aviso aqui!",
      });
      break;

    default:
      // Mensagem fora de contexto - reinicia
      session = createSession(phone);
      updateSession(phone, { step: "aguardando_localizacao" });
      await sendMessage({ to: phone, message: MSG.boasVindas });
      break;
  }
}

// STEP 1: Receber localizacao ou endereco de origem
async function handleLocalizacao(
  phone: string,
  message: string,
  lat: number | null,
  lng: number | null
) {
  // Recebeu localizacao GPS
  if (lat && lng) {
    const endereco = await reverseGeocode(lat, lng);
    updateSession(phone, {
      step: "aguardando_foto",
      origemEndereco: endereco,
      origemLat: lat,
      origemLng: lng,
    });
    await sendMessage({
      to: phone,
      message: MSG.localizacaoRecebida(endereco),
    });
    return;
  }

  // Verifica se mandou CEP
  const cep = extrairCep(message);
  if (cep) {
    const endereco = await buscaCep(cep);
    if (endereco) {
      const coords = await geocodeAddress(endereco);
      updateSession(phone, {
        step: "aguardando_foto",
        origemEndereco: endereco,
        origemLat: coords?.lat || null,
        origemLng: coords?.lng || null,
      });
      await sendMessage({
        to: phone,
        message: MSG.enderecoRecebido(endereco),
      });
      return;
    }
  }

  // Verifica se parece endereco
  if (pareceEndereco(message)) {
    const coords = await geocodeAddress(message);
    updateSession(phone, {
      step: "aguardando_foto",
      origemEndereco: message,
      origemLat: coords?.lat || null,
      origemLng: coords?.lng || null,
    });
    await sendMessage({
      to: phone,
      message: MSG.enderecoRecebido(message),
    });
    return;
  }

  // Nao entendeu - pede novamente
  await sendMessage({
    to: phone,
    message: MSG.naoEntendi,
  });
}

// STEP 2: Receber foto do material
async function handleFoto(
  phone: string,
  message: string,
  hasMedia: boolean
) {
  if (hasMedia) {
    // TODO: integrar OpenAI Vision para analisar foto
    // Por enquanto aceita a foto e segue
    updateSession(phone, {
      step: "aguardando_destino",
      descricaoCarga: "Material (foto recebida)",
    });
    await sendMessage({ to: phone, message: MSG.fotoSemIA });
    return;
  }

  // Se mandou texto descrevendo o material
  if (message.length > 2) {
    updateSession(phone, {
      step: "aguardando_destino",
      descricaoCarga: message,
    });
    await sendMessage({
      to: phone,
      message: MSG.fotoRecebida(message),
    });
    return;
  }

  await sendMessage({
    to: phone,
    message:
      "Me manda uma foto do material ou descreve o que precisa levar 📸😊",
  });
}

// STEP 3: Receber destino
async function handleDestino(phone: string, message: string) {
  const session = getSession(phone);
  if (!session) return;

  let destinoEndereco = message;
  let destinoLat: number | null = null;
  let destinoLng: number | null = null;

  // Verifica CEP
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

  updateSession(phone, {
    step: "aguardando_detalhes",
    destinoEndereco,
    destinoLat,
    destinoLng,
  });

  // Extrai cidade para exibicao
  const cidadeDestino =
    destinoEndereco.split(",").pop()?.trim() || destinoEndereco;

  await sendMessage({
    to: phone,
    message: MSG.destinoRecebido(cidadeDestino),
  });
}

// STEP 4: Receber detalhes (escada, ajudante)
async function handleDetalhes(phone: string, message: string) {
  const session = getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase();

  const temEscada =
    lower.includes("escada") ||
    lower.includes("andar") ||
    lower.includes("lance");
  const precisaAjudante =
    lower.includes("ajudante") ||
    lower.includes("ajuda") ||
    lower.includes("carregar");

  // Tenta extrair numero do andar
  let andar = 0;
  const andarMatch = message.match(/(\d+)\s*(andar|o\s*andar|lance)/i);
  if (andarMatch) {
    andar = parseInt(andarMatch[1]);
  }

  // Calcula distancia e precos
  let distanciaKm = 5; // minimo
  if (session.origemLat && session.origemLng && session.destinoLat && session.destinoLng) {
    distanciaKm = calcularDistanciaKm(
      session.origemLat,
      session.origemLng,
      session.destinoLat,
      session.destinoLng
    );
  }

  const precos = calcularPrecos(
    distanciaKm,
    session.veiculoSugerido || "utilitario",
    precisaAjudante,
    andar
  );

  updateSession(phone, {
    step: "aguardando_data",
    temEscada,
    andar,
    precisaAjudante,
    distanciaKm,
  });

  // Guarda precos na sessao para uso posterior
  updateSession(phone, {
    valorEstimado: precos.padrao,
  });

  await sendMessage({
    to: phone,
    message: MSG.detalhesRecebidos(
      session.origemEndereco || "Origem",
      session.destinoEndereco || "Destino",
      session.descricaoCarga || "Material",
      distanciaKm.toString(),
      precos.economica.toString(),
      precos.padrao.toString(),
      precos.premium.toString()
    ),
  });

  // Atualiza step para escolha de plano
  updateSession(phone, { step: "aguardando_data" });
}

// STEP 5: Receber plano escolhido e data
async function handleData(phone: string, message: string) {
  const session = getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  // Se ainda nao escolheu plano
  if (!session.planoEscolhido) {
    let plano = "";
    let multiplicador = 1.0;

    if (lower === "1" || lower.includes("economic")) {
      plano = "Economica";
      multiplicador = 0.7;
    } else if (lower === "2" || lower.includes("padrao") || lower.includes("padrão")) {
      plano = "Padrao";
      multiplicador = 1.0;
    } else if (lower === "3" || lower.includes("premium")) {
      plano = "Premium";
      multiplicador = 1.4;
    } else {
      await sendMessage({
        to: phone,
        message:
          "Escolhe uma opcao, por favor! 😊\n\n1️⃣ Economica\n2️⃣ Padrao\n3️⃣ Premium",
      });
      return;
    }

    const valorBase = session.valorEstimado || 80;
    const valorFinal = Math.round((valorBase / 1.0) * multiplicador);

    updateSession(phone, {
      planoEscolhido: plano,
      valorEstimado: valorFinal,
    });

    await sendMessage({ to: phone, message: MSG.planoEscolhido });
    return;
  }

  // Ja escolheu plano, agora recebe data
  updateSession(phone, {
    step: "aguardando_confirmacao",
    dataAgendada: message,
  });

  await sendMessage({
    to: phone,
    message: MSG.resumoFrete(
      session.origemEndereco || "Origem",
      session.destinoEndereco || "Destino",
      session.descricaoCarga || "Material",
      message,
      session.planoEscolhido || "Padrao",
      (session.valorEstimado || 0).toString()
    ),
  });
}

// STEP 6: Confirmacao final
async function handleConfirmacao(phone: string, message: string) {
  const session = getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  if (lower.startsWith("sim") || lower === "s" || lower === "confirmar") {
    // Salva corrida no Supabase
    const corridaId = await salvarCorrida(session);

    if (corridaId) {
      updateSession(phone, {
        step: "aguardando_pagamento",
        corridaId,
      });

      // TODO: Gerar link de pagamento Mercado Pago
      const linkPagamento = `https://pegue-eta.vercel.app/simular`;

      await sendMessage({
        to: phone,
        message: MSG.linkPagamento(linkPagamento),
      });

      // Dispara para fretistas
      await dispararParaFretistas(corridaId, session);
    } else {
      await sendMessage({ to: phone, message: MSG.erroInterno });
    }
  } else if (lower.startsWith("nao") || lower === "n" || lower === "não") {
    // Reinicia
    createSession(phone);
    updateSession(phone, { step: "aguardando_localizacao" });
    await sendMessage({
      to: phone,
      message:
        "Sem problema! 😊 Vamos comecar de novo.\n\n" + MSG.boasVindas,
    });
  } else {
    await sendMessage({
      to: phone,
      message:
        "Responda *SIM* pra confirmar ou *NAO* pra ajustar algo 😊",
    });
  }
}

// === ATENDIMENTO HUMANO ===

async function handleAtendente(phone: string) {
  if (isHorarioAtendimentoHumano()) {
    updateSession(phone, { step: "atendimento_humano" });
    await sendMessage({ to: phone, message: MSG.transferenciaHumano });

    // Notifica Fabio
    await sendMessage({
      to: FABIO_PHONE,
      message: `🔔 *Atendimento solicitado!*\n\nCliente: ${formatarTelefoneExibicao(phone)}\nHorario: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    });
  } else {
    await sendMessage({ to: phone, message: MSG.foraHorarioHumano });
  }
}

// === DISPATCH PARA FRETISTAS ===

async function dispararParaFretistas(
  corridaId: string,
  session: import("@/lib/bot-sessions").BotSession
) {
  try {
    // Busca prestadores disponiveis no Supabase
    const { data: prestadores } = await supabase
      .from("prestadores")
      .select("telefone, nome")
      .eq("disponivel", true)
      .eq("status", "aprovado");

    if (!prestadores || prestadores.length === 0) {
      console.log("Nenhum prestador disponivel");
      return;
    }

    const telefones = prestadores.map((p) => p.telefone);
    const valorPrestador = Math.round(
      (session.valorEstimado || 0) * 0.8
    );

    // Cria dispatch
    createDispatch(corridaId, session.phone, telefones);

    // Envia mensagem para todos
    const mensagem = MSG.novoFreteDisponivel(
      session.origemEndereco || "SP",
      session.destinoEndereco || "Destino",
      session.descricaoCarga || "Material",
      session.dataAgendada || "A combinar",
      valorPrestador.toString(),
      corridaId
    );

    await sendMessageToMany(telefones, mensagem);

    // Agenda resolucao da janela de 30s
    setTimeout(async () => {
      await resolverDispatchAposJanela(corridaId);
    }, 31000);
  } catch (error: any) {
    console.error("Erro ao disparar para fretistas:", error?.message);
  }
}

// Resolve dispatch apos janela de 30 segundos
async function resolverDispatchAposJanela(corridaId: string) {
  const vencedor = resolveDispatch(corridaId);

  if (vencedor) {
    await notificarResultadoDispatch(corridaId, vencedor);
  }
  // Se ninguem respondeu, a proxima resposta sera processada em handlePrestadorResponse
}

// === RESPOSTA DO PRESTADOR ===

async function handlePrestadorResponse(
  prestadorPhone: string,
  message: string,
  corridaId: string
) {
  const { aceite, valor } = extrairRespostaPrestador(message);

  if (!aceite) {
    await sendMessage({
      to: prestadorPhone,
      message:
        "Pra aceitar o frete, responda *SIM* seguido do seu valor.\nExemplo: *SIM 200*",
    });
    return;
  }

  // Registra resposta
  addDispatchResponse(
    corridaId,
    prestadorPhone,
    valor || 9999
  );

  // Tenta resolver
  const vencedor = resolveDispatch(corridaId);

  if (vencedor) {
    await notificarResultadoDispatch(corridaId, vencedor);
  } else {
    await sendMessage({
      to: prestadorPhone,
      message:
        "Resposta recebida! ✅ Aguardando outros prestadores... Resultado em instantes!",
    });
  }
}

// Notifica todos sobre resultado do dispatch
async function notificarResultadoDispatch(
  corridaId: string,
  vencedorPhone: string
) {
  const { getDispatchByCorridaId } = await import("@/lib/bot-sessions");
  const dispatch = getDispatchByCorridaId(corridaId);
  if (!dispatch) return;

  // Avisa vencedor
  await sendMessage({
    to: vencedorPhone,
    message: MSG.freteAceito,
  });

  // Avisa os outros
  for (const phone of dispatch.prestadores) {
    if (phone !== vencedorPhone) {
      await sendMessage({
        to: phone,
        message: MSG.freteJaPego,
      });
    }
  }

  // Atualiza corrida no Supabase com prestador vencedor
  try {
    const { data: prestador } = await supabase
      .from("prestadores")
      .select("id, nome")
      .eq("telefone", vencedorPhone)
      .single();

    if (prestador) {
      await supabase
        .from("corridas")
        .update({
          prestador_id: prestador.id,
          status: "aceita",
        })
        .eq("id", corridaId);
    }
  } catch (error: any) {
    console.error("Erro ao atualizar corrida:", error?.message);
  }

  finalizeDispatch(corridaId);
}

// === SALVAR NO SUPABASE ===

async function salvarCorrida(
  session: import("@/lib/bot-sessions").BotSession
): Promise<string | null> {
  try {
    // Busca ou cria cliente
    let clienteId: string | null = null;

    const { data: clienteExistente } = await supabase
      .from("clientes")
      .select("id")
      .eq("telefone", session.phone)
      .single();

    if (clienteExistente) {
      clienteId = clienteExistente.id;
    } else {
      const { data: novoCliente } = await supabase
        .from("clientes")
        .insert({
          telefone: session.phone,
          nivel: "bronze",
          total_corridas: 0,
          ativo: true,
        })
        .select("id")
        .single();

      clienteId = novoCliente?.id || null;
    }

    if (!clienteId) return null;

    // Gera codigo da corrida
    const codigo = `PG${Date.now().toString(36).toUpperCase()}`;

    const { data: corrida } = await supabase
      .from("corridas")
      .insert({
        codigo,
        cliente_id: clienteId,
        origem_endereco: session.origemEndereco || "",
        origem_lat: session.origemLat,
        origem_lng: session.origemLng,
        destino_endereco: session.destinoEndereco || "",
        destino_lat: session.destinoLat,
        destino_lng: session.destinoLng,
        distancia_km: session.distanciaKm,
        tipo_servico: "frete",
        descricao_carga: session.descricaoCarga,
        escada_origem: session.temEscada,
        andares_origem: session.andar,
        plano: session.planoEscolhido?.toLowerCase(),
        valor_estimado: session.valorEstimado,
        valor_final: session.valorEstimado,
        valor_prestador: Math.round((session.valorEstimado || 0) * 0.8),
        valor_pegue: Math.round((session.valorEstimado || 0) * 0.2),
        data_agendada: session.dataAgendada,
        status: "pendente",
        canal_origem: "whatsapp",
      })
      .select("id")
      .single();

    return corrida?.id || null;
  } catch (error: any) {
    console.error("Erro ao salvar corrida:", error?.message);
    return null;
  }
}
