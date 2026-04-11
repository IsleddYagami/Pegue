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

// Numero do Fabio para notificacoes de atendimento humano
const FABIO_PHONE = "5511970363713";

// Webhook recebe mensagens do ChatPro
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    console.log("Webhook RAW recebido:", JSON.stringify(rawBody, null, 2));

    // Log TODOS os webhooks no Supabase para debug
    await supabase.from("bot_logs").insert({ payload: rawBody });


    // Formato real do ChatPro v5:
    // {
    //   "Type": "receveid_message",
    //   "Body": {
    //     "Info": { "RemoteJid": "55..@s.whatsapp.net", "FromMe": false, "PushName": "..." },
    //     "Text": "mensagem"
    //   }
    // }

    const eventType = rawBody.Type || rawBody.type || "";

    // Aceita mensagens e localizacao do ChatPro
    const allowedTypes = [
      "receveid_message",
      "received_message",
      "receveid_location",
      "received_location",
      "receveid_image",
      "received_image",
      "receveid_audio",
      "received_audio",
      "receveid_document",
      "received_document",
      "receveid_video",
      "received_video",
    ];

    if (!allowedTypes.some((t) => eventType.toLowerCase().includes(t.toLowerCase()))) {
      console.log("Evento ignorado:", eventType);
      return NextResponse.json({ status: "ignored_event", eventType });
    }

    const info = rawBody.Body?.Info || rawBody.Info || {};
    const message = rawBody.Body?.Text || "";
    const from = info.RemoteJid || info.SenderJid || "";
    const isGroup = from.includes("@g.us");
    const isFromMe = info.FromMe || false;

    // Localizacao - ChatPro envia como "receveid_location" com lat/lng em Source.message
    const sourceMsg = info.Source?.message || {};
    const lat = sourceMsg.lat || sourceMsg.degreesLatitude || null;
    const lng = sourceMsg.lng || sourceMsg.degreesLongitude || null;

    // Media (fotos, audios etc)
    const isMediaType = eventType.toLowerCase().includes("image") ||
      eventType.toLowerCase().includes("audio") ||
      eventType.toLowerCase().includes("video") ||
      eventType.toLowerCase().includes("document");
    const hasMedia = isMediaType || !!(sourceMsg.imageMessage || sourceMsg.audioMessage || sourceMsg.documentMessage || sourceMsg.videoMessage);

    // URL da imagem (ChatPro disponibiliza em varios caminhos)
    const imageUrl =
      rawBody.Url ||
      rawBody.Info?.Url ||
      rawBody.Body?.Info?.Source?.message?.imageMessage?.url ||
      sourceMsg.imageMessage?.url ||
      null;

    console.log("DEBUG imageUrl:", imageUrl, "| rawBody.Url:", rawBody.Url, "| hasMedia:", hasMedia);

    // Ignora mensagens de grupo e proprias
    if (isGroup || isFromMe || !from) {
      return NextResponse.json({ status: "ignored" });
    }

    const phoneNumber = from.replace("@s.whatsapp.net", "");

    // Se é imagem e tem URL, salva na sessao e processa com IA direto
    if (hasMedia && imageUrl) {
      const session = await getSession(phoneNumber);
      if (session && session.step === "aguardando_foto") {
        // Analisa com IA
        const analise = await analisarFotoIA(imageUrl);

        await supabase.from("bot_logs").insert({
          payload: { debug: "IA_resultado", analise, imageUrl }
        });

        if (analise) {
          const emoji = getItemEmoji(analise.item);
          const precisaAjudante = analise.tamanho === "grande";
          const veiculoNome: Record<string, string> = {
            utilitario: "utilitario",
            van: "van",
            caminhao_bau: "caminhao bau",
            caminhao_grande: "caminhao grande",
          };

          await updateSession(phoneNumber, {
            step: "aguardando_destino",
            descricao_carga: `${analise.item} (${analise.quantidade})`,
            veiculo_sugerido: analise.veiculo_sugerido,
            precisa_ajudante: precisaAjudante,
            foto_url: imageUrl,
          });

          const ajudanteTexto = precisaAjudante
            ? "e vai precisar de ajudante pra carregar"
            : "e nao vai precisar de ajudante";

          await sendMessage({
            to: phoneNumber,
            message: `📸 Recebi sua foto!\n\nVi que e *${analise.item}* ${emoji}\nTamanho ${analise.tamanho}, cabe em um *${veiculoNome[analise.veiculo_sugerido] || "utilitario"}* ${ajudanteTexto}!\n\nE pra onde a gente leva? Me manda o endereco ou CEP do destino 🏠\n\n(Se eu errei alguma coisa, me corrige que eu ajusto! 😊)`,
          });
          return NextResponse.json({ status: "ok" });
        }

        // IA falhou - fallback
        await updateSession(phoneNumber, {
          step: "aguardando_destino",
          descricao_carga: "Material (foto recebida)",
          foto_url: imageUrl,
        });
        await sendMessage({ to: phoneNumber, message: MSG.fotoSemIA });
        return NextResponse.json({ status: "ok" });
      }
    }

    // Verifica se e prestador respondendo a dispatch
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
      // Nao retorna 500 - sempre responde 200 pro ChatPro
      // senao ele pode parar de enviar webhooks
    }

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    console.error("Erro no webhook:", error?.message, error?.stack);
    // Sempre retorna 200 pro ChatPro nao parar de enviar
    return NextResponse.json(
      { error: "Erro interno", detail: error?.message },
      { status: 200 }
    );
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
  hasMedia: boolean,
  imageUrl: string | null = null
) {
  // Log debug no Supabase
  await supabase.from("bot_logs").insert({
    payload: { debug: "handleClienteMessage", phone, message, hasMedia, imageUrl, lat, lng }
  });

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

  let session = await getSession(phone);

  // Nova conversa ou saudacao
  if (!session || isSaudacao(message)) {
    await createSession(phone);
    await updateSession(phone, { step: "aguardando_localizacao" });
    await sendMessage({ to: phone, message: MSG.boasVindas });
    return;
  }

  // Processa de acordo com o step atual
  switch (session.step) {
    case "aguardando_localizacao":
      await handleLocalizacao(phone, message, lat, lng);
      break;

    case "aguardando_foto":
      await handleFoto(phone, message, hasMedia, imageUrl);
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
      await createSession(phone);
      await updateSession(phone, { step: "aguardando_localizacao" });
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
    await updateSession(phone, {
      step: "aguardando_foto",
      origem_endereco: endereco,
      origem_lat: lat,
      origem_lng: lng,
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
      await updateSession(phone, {
        step: "aguardando_foto",
        origem_endereco: endereco,
        origem_lat: coords?.lat || null,
        origem_lng: coords?.lng || null,
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
    await updateSession(phone, {
      step: "aguardando_foto",
      origem_endereco: message,
      origem_lat: coords?.lat || null,
      origem_lng: coords?.lng || null,
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
  hasMedia: boolean,
  imageUrl: string | null = null
) {
  // Log detalhado no Supabase
  await supabase.from("bot_logs").insert({
    payload: { debug: "handleFoto", hasMedia, imageUrl, messageLen: message.length }
  });

  if (hasMedia && imageUrl) {
    // Analisa foto com OpenAI Vision
    await supabase.from("bot_logs").insert({
      payload: { debug: "antes_da_IA", imageUrl, hasMedia }
    });

    const analise = await analisarFotoIA(imageUrl);

    await supabase.from("bot_logs").insert({
      payload: { debug: "resultado_IA", analise, imageUrl }
    });

    if (analise) {
      const emoji = getItemEmoji(analise.item);
      const precisaAjudante = analise.tamanho === "grande";
      const veiculoNome: Record<string, string> = {
        utilitario: "utilitario",
        van: "van",
        caminhao_bau: "caminhao bau",
        caminhao_grande: "caminhao grande",
      };

      await updateSession(phone, {
        step: "aguardando_destino",
        descricao_carga: `${analise.item} (${analise.quantidade})`,
        veiculo_sugerido: analise.veiculo_sugerido,
        precisa_ajudante: precisaAjudante,
      });

      const ajudanteTexto = precisaAjudante
        ? "e vai precisar de ajudante pra carregar"
        : "e nao vai precisar de ajudante";

      await sendMessage({
        to: phone,
        message: `📸 Recebi sua foto!

Vi que e *${analise.item}* ${emoji}
Tamanho ${analise.tamanho}, cabe em um *${veiculoNome[analise.veiculo_sugerido] || "utilitario"}* ${ajudanteTexto}!

E pra onde a gente leva? Me manda o endereco ou CEP do destino 🏠

(Se eu errei alguma coisa, me corrige que eu ajusto! 😊)`,
      });
      return;
    }

    // IA nao conseguiu analisar - segue sem
    await updateSession(phone, {
      step: "aguardando_destino",
      descricao_carga: "Material (foto recebida)",
    });
    await sendMessage({ to: phone, message: MSG.fotoSemIA });
    return;
  }

  // Se mandou texto descrevendo o material
  if (message.length > 2) {
    await updateSession(phone, {
      step: "aguardando_destino",
      descricao_carga: message,
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

// Analisa foto usando OpenAI Vision
async function analisarFotoIA(
  imageUrl: string
): Promise<{
  item: string;
  quantidade: string;
  tamanho: string;
  veiculo_sugerido: string;
  observacao: string;
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
Analise a foto enviada pelo cliente e retorne APENAS um JSON com:
{
  "item": "nome do item principal na foto (ex: Geladeira, Sofa, Caixas, Violao)",
  "quantidade": "quantidade estimada (ex: 1, 3, varias caixas)",
  "tamanho": "pequeno, medio ou grande",
  "veiculo_sugerido": "utilitario, van ou caminhao_bau",
  "observacao": "frase curta sobre o que voce ve (max 15 palavras)"
}
Regras:
- pequeno: cabe no banco de um carro (ex: violao, caixa pequena, mala)
- medio: precisa de utilitario (ex: mesa, geladeira, maquina de lavar)
- grande: precisa de van ou caminhao (ex: mudanca completa, sofa grande + caixas)
- utilitario: para itens pequenos e medios
- van: para itens grandes ou varios medios
- caminhao_bau: para mudancas grandes
Responda SOMENTE o JSON, nada mais.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl, detail: "low" },
            },
            {
              type: "text",
              text: "O que e esse material? Qual veiculo ideal?",
            },
          ],
        },
      ],
      max_tokens: 200,
      temperature: 0.1,
    });

    const texto = response.choices[0]?.message?.content || "";
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (error: any) {
    console.error("Erro OpenAI Vision:", error?.message);
    return null;
  }
}

// Emoji baseado no item
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
  if (lower.includes("moto")) return "🏍️";
  if (lower.includes("piano") || lower.includes("teclado")) return "🎹";
  return "📦";
}

// STEP 3: Receber destino
async function handleDestino(phone: string, message: string) {
  const session = await getSession(phone);
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

  await updateSession(phone, {
    step: "aguardando_detalhes",
    destino_endereco: destinoEndereco,
    destino_lat: destinoLat,
    destino_lng: destinoLng,
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
  const session = await getSession(phone);
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
  if (session.origem_lat && session.origem_lng && session.destino_lat && session.destino_lng) {
    distanciaKm = calcularDistanciaKm(
      session.origem_lat,
      session.origem_lng,
      session.destino_lat,
      session.destino_lng
    );
  }

  const precos = calcularPrecos(
    distanciaKm,
    session.veiculo_sugerido || "utilitario",
    precisaAjudante,
    andar
  );

  await updateSession(phone, {
    step: "aguardando_data",
    tem_escada: temEscada,
    andar,
    precisa_ajudante: precisaAjudante,
    distancia_km: distanciaKm,
    valor_estimado: precos.padrao,
  });

  await sendMessage({
    to: phone,
    message: MSG.detalhesRecebidos(
      session.origem_endereco || "Origem",
      session.destino_endereco || "Destino",
      session.descricao_carga || "Material",
      distanciaKm.toString(),
      precos.economica.toString(),
      precos.padrao.toString(),
      precos.premium.toString()
    ),
  });
}

// STEP 5: Receber plano escolhido e data
async function handleData(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  // Se ainda nao escolheu plano
  if (!session.plano_escolhido) {
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

    const valorBase = session.valor_estimado || 80;
    const valorFinal = Math.round((valorBase / 1.0) * multiplicador);

    await updateSession(phone, {
      plano_escolhido: plano,
      valor_estimado: valorFinal,
    });

    await sendMessage({ to: phone, message: MSG.planoEscolhido });
    return;
  }

  // Ja escolheu plano, agora recebe data
  await updateSession(phone, {
    step: "aguardando_confirmacao",
    data_agendada: message,
  });

  await sendMessage({
    to: phone,
    message: MSG.resumoFrete(
      session.origem_endereco || "Origem",
      session.destino_endereco || "Destino",
      session.descricao_carga || "Material",
      message,
      session.plano_escolhido || "Padrao",
      (session.valor_estimado || 0).toString()
    ),
  });
}

// STEP 6: Confirmacao final
async function handleConfirmacao(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  if (lower.startsWith("sim") || lower === "s" || lower === "confirmar") {
    // Salva corrida no Supabase
    const corridaId = await salvarCorrida(session);

    if (corridaId) {
      await updateSession(phone, {
        step: "aguardando_pagamento",
        corrida_id: corridaId,
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
    await createSession(phone);
    await updateSession(phone, { step: "aguardando_localizacao" });
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
    await updateSession(phone, { step: "atendimento_humano" });
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
  session: BotSession
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
      (session.valor_estimado || 0) * 0.8
    );

    // Cria dispatch
    createDispatch(corridaId, session.phone, telefones);

    // Envia mensagem para todos
    const mensagem = MSG.novoFreteDisponivel(
      session.origem_endereco || "SP",
      session.destino_endereco || "Destino",
      session.descricao_carga || "Material",
      session.data_agendada || "A combinar",
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
  session: BotSession
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
        origem_endereco: session.origem_endereco || "",
        origem_lat: session.origem_lat,
        origem_lng: session.origem_lng,
        destino_endereco: session.destino_endereco || "",
        destino_lat: session.destino_lat,
        destino_lng: session.destino_lng,
        distancia_km: session.distancia_km,
        tipo_servico: "frete",
        descricao_carga: session.descricao_carga,
        escada_origem: session.tem_escada,
        andares_origem: session.andar,
        plano: session.plano_escolhido?.toLowerCase(),
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

    return corrida?.id || null;
  } catch (error: any) {
    console.error("Erro ao salvar corrida:", error?.message);
    return null;
  }
}
