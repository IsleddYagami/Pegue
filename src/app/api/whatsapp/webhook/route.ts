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
  detectarZona,
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

const FABIO_PHONE = "5511970363713"; // WhatsApp Pegue
const ADMIN_PHONE = "5511971429605"; // WhatsApp pessoal Fabio (recebe notificacoes)

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
    const pushName = info.PushName || "";
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

    // Filtra respostas automaticas do WhatsApp Business
    const msgLower = (message || "").toLowerCase();
    const ehAutoReply = [
      "obrigado por entrar em contato", "agradecemos sua mensagem",
      "retornaremos em breve", "mensagem automatica", "estamos indisponiveis",
      "horario de atendimento", "aguarde um momento", "em breve retornaremos",
      "obrigado pelo contato", "mensagem de ausencia", "fora do horario",
    ].some(r => msgLower.includes(r));

    if (ehAutoReply) {
      return NextResponse.json({ status: "ignored_auto_reply" });
    }

    const phoneNumber = from.replace("@s.whatsapp.net", "");

    // Foto - processa de acordo com o step
    if (hasMedia && imageUrl) {
      const session = await getSession(phoneNumber);

      // Cadastro prestador - selfie com documento
      if (session && session.step === "cadastro_selfie") {
        await updateSession(phoneNumber, { step: "cadastro_foto_placa", foto_url: imageUrl });
        await sendMessage({ to: phoneNumber, message: `Selfie recebida! ✅\n\n${MSG.cadastroFotoPlaca}` });
        return NextResponse.json({ status: "ok" });
      }

      // Cadastro prestador - foto da placa
      if (session && session.step === "cadastro_foto_placa") {
        await updateSession(phoneNumber, { step: "cadastro_foto_veiculo" });
        // TODO: salvar foto placa no storage
        await sendMessage({ to: phoneNumber, message: `Foto da placa recebida! ✅\n\n${MSG.cadastroFotoVeiculo}` });
        return NextResponse.json({ status: "ok" });
      }

      // Cadastro prestador - foto do veiculo inteiro
      if (session && session.step === "cadastro_foto_veiculo") {
        await updateSession(phoneNumber, { step: "cadastro_placa" });
        // TODO: salvar foto veiculo no storage
        await sendMessage({ to: phoneNumber, message: `Foto do veiculo recebida! ✅\n\nAgora me passa a *placa* do veiculo por texto` });
        return NextResponse.json({ status: "ok" });
      }

      // Fotos coleta/entrega do fretista
      if (session && (session.step === "fretista_coleta_fotos" || session.step === "fretista_entrega_fotos")) {
        // Conta fotos (usa descricao_carga como contador temporario)
        const contadorAtual = parseInt(session.descricao_carga || "0") || 0;
        const novoContador = contadorAtual + 1;
        await updateSession(phoneNumber, { descricao_carga: novoContador.toString() });
        // TODO: salvar foto no storage vinculada a corrida
        await sendMessage({ to: phoneNumber, message: MSG.fretistaFotoRecebida(novoContador) });
        return NextResponse.json({ status: "ok" });
      }

      // Foto do cliente - IA Vision
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

    // Fretista confirmando presenca no lembrete (responde SIM)
    if (message.toLowerCase().trim() === "sim") {
      const { data: prestador } = await supabase
        .from("prestadores")
        .select("id")
        .eq("telefone", phoneNumber)
        .single();

      if (prestador) {
        const { data: corridaLembrete } = await supabase
          .from("corridas")
          .select("id, urgencia")
          .eq("prestador_id", prestador.id)
          .in("urgencia", ["lembrete_2h", "lembrete_1h", "lembrete_40min"])
          .limit(1)
          .single();

        if (corridaLembrete) {
          await supabase.from("corridas").update({ urgencia: "confirmado" }).eq("id", corridaLembrete.id);
          await sendMessage({
            to: phoneNumber,
            message: "Presenca confirmada! ✅ Bom trabalho no frete! 🚚",
          });
          return NextResponse.json({ status: "ok" });
        }
      }
    }

    // Fluxo do cliente
    try {
      await handleClienteMessage(phoneNumber, message, lat, lng, hasMedia, imageUrl, pushName);
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
  imageUrl: string | null = null,
  pushName: string = ""
) {
  // Salva nome do WhatsApp se tiver
  if (pushName && pushName.length > 1) {
    await supabase
      .from("clientes")
      .update({ nome: pushName })
      .eq("telefone", phone);
  }
  if (isAtendente(message)) {
    await handleAtendente(phone);
    return;
  }

  if (isAgradecimento(message)) {
    await sendMessage({ to: phone, message: MSG.obrigado });
    return;
  }

  const lower = message.toLowerCase().trim();

  // Dashboard do fretista
  if (lower === "meu painel" || lower === "meus fretes" || lower === "meu dashboard" || lower === "meu score") {
    await handleDashboardFretista(phone);
    return;
  }

  // Dashboard do cliente
  if (lower === "minha conta" || lower === "meu historico" || lower === "meus servicos") {
    await handleDashboardCliente(phone);
    return;
  }

  // Lista de comandos
  if (lower === "esqueci" || lower === "comandos" || lower === "ajuda" || lower === "help") {
    await sendMessage({
      to: phone,
      message: `📋 *COMANDOS PEGUE*

*Para clientes:*
✅ *Oi* → iniciar atendimento
✅ *minha conta* → ver seu historico
🎮 *JOGAR* → jogar Pegue Runner!

*Para parceiros:*
✅ *PEGAR* → aceitar um frete
✅ *meu painel* → ver seus dados e ranking
✅ *meus gastos* → ver resumo financeiro do mes
✅ *despesa [valor] [descricao]* → registrar gasto
   Ex: *despesa 50 combustivel*
⏸️ *modo ferias* → parar de receber indicacoes
▶️ *voltei* → voltar a receber indicacoes

✋ *CANCELAR* → cancelar um frete aceito
🤝 *INDICAR* → transferir frete pra um amigo

*Para se cadastrar como parceiro:*
🤝 *Parcerias Pegue* → iniciar cadastro

*Precisa de ajuda?*
🤝 Digite *4* no menu pra falar com um especialista`,
    });
    return;
  }

  // Modo ferias
  if (lower === "modo ferias" || lower === "ativar modo ferias") {
    await handlePausarPrestador(phone);
    return;
  }

  if (lower === "voltei") {
    await handleAtivarPrestador(phone);
    return;
  }

  // Controle financeiro - registrar despesa
  if (lower.startsWith("despesa ") || lower.startsWith("gasto ")) {
    await handleRegistrarDespesa(phone, message);
    return;
  }

  // Controle financeiro - ver gastos
  if (lower === "meus gastos" || lower === "minhas despesas" || lower === "extrato" || lower === "gastos" || lower === "despesas" || lower === "meu extrato") {
    await handleVerGastos(phone);
    return;
  }

  // Comando JOGAR - envia link do jogo Pegue Runner
  if (lower === "jogar" || lower === "jogo" || lower === "game" || lower === "pegue runner") {
    const primeiroNome = pushName ? pushName.split(" ")[0] : "voce";
    await sendMessage({
      to: phone,
      message: `🎮 *PEGUE RUNNER!*

${primeiroNome}, jogue enquanto espera seu frete! 🚚💨

Desvie dos obstaculos pelas ruas de SP, enfrente bosses e entre pro ranking!

👉 pegue-eta.vercel.app/jogo

🏆 Recorde atual? Veja no ranking dentro do jogo!
Boa sorte! 🎯`,
    });
    return;
  }

  // Comando CANCELAR frete (fretista)
  if (lower === "cancelar" || lower === "cancelar frete") {
    await handleCancelarFrete(phone);
    return;
  }

  // Comando INDICAR amigo (fretista)
  if (lower === "indicar" || lower === "transferir" || lower === "indicar amigo") {
    await handleIndicarFrete(phone);
    return;
  }

  // Detecta interesse em ser prestador
  if (lower.includes("parcerias pegue") || lower.includes("parceria pegue") || lower.includes("quero ser parceiro") || lower.includes("ser parceiro") || lower.includes("cadastro prestador")) {
    await createSession(phone);
    await updateSession(phone, { step: "cadastro_nome" });
    await sendMessage({ to: phone, message: MSG.cadastroInicio });
    return;
  }

  let session = await getSession(phone);

  // Nova conversa ou saudacao
  if (!session || isSaudacao(message)) {
    await createSession(phone);
    await updateSession(phone, { step: "aguardando_servico" });

    // Personaliza com nome se tiver
    const primeiroNome = pushName ? pushName.split(" ")[0] : "";
    const saudacao = primeiroNome
      ? `Oii ${primeiroNome}! 😊 Que bom ter voce aqui no Pegue! 🚚\nEstou aqui pra te ajudar com o que precisar.\n\nO que voce precisa?\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudanca completa*\n3️⃣ *Guincho* (carro ou moto)\n4️⃣ *Duvidas frequentes*`
      : MSG.boasVindas;

    await sendMessage({ to: phone, message: saudacao });
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

    case "aguardando_fretista":
      await sendMessage({
        to: phone,
        message: "Estamos reservando a agenda! 😊 Ja ja te retornamos com a confirmacao!",
      });
      break;

    // === CADASTRO PRESTADOR ===
    case "cadastro_nome":
      await handleCadastroNome(phone, message);
      break;
    case "cadastro_cpf":
      await handleCadastroCpf(phone, message);
      break;
    case "cadastro_email":
      await handleCadastroEmail(phone, message);
      break;
    case "cadastro_selfie":
      await sendMessage({ to: phone, message: MSG.cadastroSelfie });
      break;
    case "cadastro_foto_placa":
      await sendMessage({ to: phone, message: MSG.cadastroFotoPlaca });
      break;
    case "cadastro_foto_veiculo":
      await sendMessage({ to: phone, message: MSG.cadastroFotoVeiculo });
      break;
    case "cadastro_placa":
      await handleCadastroPlaca(phone, message);
      break;
    case "cadastro_chave_pix":
      await handleCadastroChavePix(phone, message);
      break;
    case "cadastro_tipo_veiculo":
      await handleCadastroTipoVeiculo(phone, message);
      break;
    case "cadastro_termos":
      await handleCadastroTermos(phone, message);
      break;
    case "cadastro_aguardando_aprovacao":
      await sendMessage({ to: phone, message: "Seu cadastro esta em analise! 😊 Te avisamos assim que for aprovado!" });
      break;

    // === FOTOS COLETA/ENTREGA ===
    case "fretista_coleta_fotos":
      await handleFretistFotos(phone, message, "coleta");
      break;
    case "fretista_entrega_fotos":
      await handleFretistFotos(phone, message, "entrega");
      break;

    case "aguardando_confirmacao_entrega":
      await handleConfirmacaoEntrega(phone, message);
      break;

    case "avaliacao_atendimento":
      await handleAvaliacao(phone, message, "atendimento");
      break;
    case "avaliacao_praticidade":
      await handleAvaliacao(phone, message, "praticidade");
      break;
    case "avaliacao_fretista":
      await handleAvaliacao(phone, message, "fretista");
      break;
    case "avaliacao_sugestao":
      await handleAvaliacaoSugestao(phone, message);
      break;

    case "aguardando_pagamento":
      await sendMessage({
        to: phone,
        message: "Seu frete já tá confirmado! 😊 Assim que o pagamento for identificado, te aviso aqui!",
      });
      break;

    case "aguardando_horario":
      await handleHorario(phone, message);
      break;

    // === FRETISTA CANCELAR/INDICAR ===
    case "fretista_cancelar_qual":
      await handleCancelarQual(phone, message);
      break;
    case "fretista_cancelar_confirma":
      await handleCancelarConfirma(phone, message);
      break;
    case "fretista_indicar_qual":
      await handleIndicarQual(phone, message);
      break;
    case "fretista_indicar_telefone":
      await handleIndicarTelefone(phone, message);
      break;

    // === GUINCHO ===
    case "guincho_categoria":
      await handleGuinchoCategoria(phone, message);
      break;
    case "guincho_tipo_veiculo":
      await handleGuinchoTipoVeiculo(phone, message);
      break;
    case "guincho_marca_modelo":
      await handleGuinchoMarcaModelo(phone, message);
      break;
    case "guincho_localizacao":
      await handleGuinchoLocalizacao(phone, message, lat, lng);
      break;
    case "guincho_destino":
      await handleGuinchoDestino(phone, message);
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

  if (lower === "1" || lower.includes("pequeno") || lower.includes("frete")) {
    await updateSession(phone, { step: "aguardando_localizacao" });
    await sendMessage({ to: phone, message: MSG.pedirLocalizacao });
    return;
  }

  if (lower === "2" || lower.includes("mudanca") || lower.includes("mudança")) {
    await updateSession(phone, { step: "aguardando_localizacao" });
    await sendMessage({ to: phone, message: MSG.pedirLocalizacao });
    return;
  }

  if (lower === "3" || lower.includes("guincho")) {
    // Verifica se guincho esta habilitado no controle
    const { data: cfgGuincho } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "sistema_guincho")
      .single();

    if (cfgGuincho?.valor === "desabilitado") {
      await sendMessage({ to: phone, message: MSG.guinchoDesativado });
      await notificarAdmin(
        `🚗 *GUINCHO SOLICITADO (desabilitado)*`,
        phone,
        `Cliente pediu guincho mas o servico esta desativado no controle.`
      );
      return;
    }

    await updateSession(phone, { step: "guincho_categoria" as any });
    await sendMessage({ to: phone, message: MSG.guinchoMenu });
    return;
  }

  if (lower === "4" || lower.includes("duvida") || lower.includes("faq") || lower.includes("pergunta")) {
    await sendMessage({
      to: phone,
      message: `📋 *DUVIDAS FREQUENTES*

*Como funciona?*
Voce manda a localizacao, foto dos itens e destino. A gente calcula o preco e envia um fretista verificado.

*Quanto custa?*
Pequenos fretes a partir de R$ 150. O preco depende da distancia e volume. Manda *1* pra fazer um orcamento gratis!

*Como pago?*
Pix (sem taxa) ou cartao de credito. O pagamento e feito por link seguro do Mercado Pago.

*Quando recebo o frete?*
Voce escolhe a data e horario. Temos disponibilidade pra hoje mesmo!

*E se der problema na entrega?*
O fretista fotografa tudo na coleta e entrega. Se houver qualquer problema, nosso time resolve.

*Quero ser parceiro/fretista*
Digite: *Parcerias Pegue*

━━━━━━━━━━━━━━━━
Sua duvida nao esta aqui?
Digite *ajuda* que nosso time entrara em contato.

Ou escolha um servico:
1️⃣ Pequenos Fretes
2️⃣ Mudanca completa
3️⃣ Guincho`,
    });
    return;
  }

  // Pediu especialista explicitamente
  if (lower.includes("especialista") || lower === "ajuda") {
    await handleAtendente(phone);
    return;
  }

  await sendMessage({
    to: phone,
    message: "Escolhe uma opcao, por favor! 😊\n\n1️⃣ Pequenos Fretes\n2️⃣ Mudanca completa\n3️⃣ Guincho (carro ou moto)\n4️⃣ Duvidas frequentes",
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

  // Se tem mais de 5 caracteres, tenta geocodificar mesmo assim
  if (message.length > 5) {
    const coords = await geocodeAddress(message);
    if (coords) {
      await updateSession(phone, {
        step: "aguardando_foto",
        origem_endereco: message,
        origem_lat: coords.lat,
        origem_lng: coords.lng,
      });
      await sendMessage({ to: phone, message: MSG.enderecoRecebido(message) });
      return;
    }
  }

  await sendMessage({
    to: phone,
    message: `Nao consegui identificar o endereco 😅

Tenta de uma dessas formas:
📍 Manda sua *localizacao* pelo clipe 📎
📮 Digita o *CEP* (ex: 06010-000)
🏠 Digita *rua e bairro* (ex: Rua Augusta, Consolacao)

💡 Se a localizacao nao funcionar:
- Verifique se o *GPS esta ligado*
- Configuracoes do celular > Apps > WhatsApp > Permissoes > *Localizacao* > Permitir`,
  });
}

// STEP 2: Foto
// Itens da lista rapida de mudanca
const ITENS_MUDANCA: Record<string, string> = {
  "1": "Geladeira", "2": "Fogao", "3": "Micro-ondas", "4": "Maquina de lavar",
  "5": "Armario de cozinha", "6": "Mesa com cadeiras", "7": "Cama casal",
  "8": "Cama solteiro", "9": "Guarda-roupa", "10": "Comoda", "11": "Colchao",
  "12": "Escrivaninha", "13": "Sofa", "14": "Rack/Estante", "15": "TV",
  "16": "Mesa de centro", "17": "Poltrona", "18": "Caixas", "19": "Bicicleta",
  "20": "Maquina de costura", "21": "Tanquinho", "22": "Ventilador/Ar condicionado",
};

async function handleFoto(
  phone: string, message: string, hasMedia: boolean, imageUrl: string | null = null
) {
  const lower = message.toLowerCase().trim();

  // Opcao 2 - Lista rapida
  if (lower === "2" || lower === "lista" || lower.includes("lista rapida")) {
    await sendMessage({ to: phone, message: MSG.listaMudanca });
    return;
  }

  // Opcao 1 - Foto (so texto, foto real e processada no topo do POST)
  if (lower === "1" || lower === "foto") {
    await sendMessage({ to: phone, message: "Manda a foto do material 📸" });
    return;
  }

  // Opcao 3 ou texto livre
  if (lower === "3" || lower === "texto" || lower === "descrever") {
    await sendMessage({ to: phone, message: "Descreve os materiais que precisa transportar 😊\n\nEx: *geladeira, fogao, cama casal, 5 caixas*" });
    return;
  }

  // Detecta numeros da lista (ex: 1, 3, 7, 9, 18x5)
  const temNumeros = message.match(/\d+/g);
  if (temNumeros && temNumeros.length >= 2) {
    const partes = message.split(/[,\s]+/).filter(p => p.trim());
    const itensEncontrados: string[] = [];

    for (const parte of partes) {
      // Detecta NUMEROxQUANTIDADE (ex: 17x4 = 4 Poltronas, 18x5 = 5 Caixas)
      const qtdMatch = parte.match(/^(\d+)[x×](\d+)/i);
      if (qtdMatch) {
        const itemNum = qtdMatch[1];
        const qtd = qtdMatch[2];
        if (ITENS_MUDANCA[itemNum]) {
          itensEncontrados.push(`${qtd}x ${ITENS_MUDANCA[itemNum]}`);
        }
        continue;
      }
      const num = parte.replace(/\D/g, "");
      if (ITENS_MUDANCA[num]) {
        itensEncontrados.push(ITENS_MUDANCA[num]);
      }
    }

    if (itensEncontrados.length > 0) {
      const descricao = itensEncontrados.join(", ");

      // Sugere veiculo baseado na quantidade
      let veiculo = "utilitario";
      if (itensEncontrados.length >= 8) veiculo = "caminhao_bau";
      else if (itensEncontrados.length >= 3) veiculo = "hr";

      await updateSession(phone, {
        step: "aguardando_destino",
        descricao_carga: descricao,
        veiculo_sugerido: veiculo,
      });

      const veiculoNome: Record<string, string> = {
        utilitario: "Utilitario (Strada/Saveiro)",
        hr: "HR",
        caminhao_bau: "Caminhao Bau",
      };

      await sendMessage({
        to: phone,
        message: `Anotado! ✅\n\n📦 *Seus itens:*\n${itensEncontrados.map(i => `- ${i}`).join("\n")}\n\n🚚 Veiculo sugerido: *${veiculoNome[veiculo]}*\n\nE pra onde a gente leva? Me manda o endereco ou CEP do destino 🏠`,
      });
      return;
    }
  }

  // Texto livre descrevendo itens
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
    message: "Escolha como informar os materiais:\n\n1️⃣ *Mandar foto* 📸\n2️⃣ *Lista rapida de mudanca*\n3️⃣ *Descrever por texto*",
  });
}

// STEP 2b: Mais fotos ou PRONTO
async function handleMaisFotos(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  if (lower === "pronto" || lower === "so isso" || lower === "só isso" || lower === "nao" || lower === "não" || lower === "n") {
    const veiculoNome: Record<string, string> = {
      carro_comum: "Carro Comum",
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

  // Verifica se destino é area indisponivel (favela/area livre)
  const zonaDestino = detectarZona(destinoEndereco);
  if (zonaDestino === "indisponivel") {
    await sendMessage({
      to: phone,
      message: `Que pena 😕 Mas essa rota está *indisponível* no momento.\n\nSe quiser tentar outro destino, manda o endereço! 📍`,
    });
    return;
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
  let qtdAjudantes = 0;

  if (lower === "1" || lower.includes("nao") || lower === "n" || lower.includes("não") || lower.includes("sem")) {
    qtdAjudantes = 0;
  } else if (lower === "2" || lower === "1 ajudante" || (lower.includes("sim") && !lower.includes("2"))) {
    qtdAjudantes = 1;
  } else if (lower === "3" || lower === "2 ajudantes" || lower.includes("2 ajudante") || lower.includes("dois")) {
    qtdAjudantes = 2;
  } else {
    await sendMessage({
      to: phone,
      message: "Vai precisar de ajudante? 😊\n\n1️⃣ *Nao*, sem ajudante\n2️⃣ *Sim*, 1 ajudante\n3️⃣ *Sim*, 2 ajudantes",
    });
    return;
  }

  await updateSession(phone, { precisa_ajudante: qtdAjudantes > 0 });
  // Salva qtd ajudantes temporario no bot_logs pra usar na corrida
  await supabase.from("bot_logs").insert({ payload: { tipo: "qtd_ajudantes", phone, qtd: qtdAjudantes } });

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
  const precos = calcularPrecos(distanciaKm, veiculo, qtdAjudantes > 0, session.andar || 0, false, session.destino_endereco || "");

  // Adiciona segundo ajudante se necessario
  const ajudanteExtra = qtdAjudantes === 2 ? (distanciaKm <= 10 ? 80 : 100) : 0;
  const p = {
    ...precos.padrao,
    total: precos.padrao.total + ajudanteExtra,
  };
  const zonaInfo = precos.zona;

  const veiculoNome: Record<string, string> = {
    utilitario: "Utilitario (Strada/Saveiro)",
    hr: "HR",
    caminhao_bau: "Caminhao Bau",
    guincho: "Guincho",
    moto_guincho: "Guincho de Moto",
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

// STEP 6: Data e Horario
async function handleData(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  // Se digitou AGORA, pula direto pra confirmacao
  if (lower === "agora" || lower === "ja" || lower === "já" || lower === "urgente") {
    await updateSession(phone, {
      step: "aguardando_confirmacao",
      data_agendada: "AGORA - Urgente",
    });
  } else {
    // Tenta extrair horario da mensagem
    const horarioExtraido = extrairHorario(lower);
    // Tenta extrair data da mensagem
    const dataExtraida = extrairData(lower);

    // Verifica se ja tem horario salvo de mensagem anterior (no campo periodo)
    const horarioSalvo = session.periodo || null;
    const horarioFinal = horarioExtraido || horarioSalvo;

    if (dataExtraida && horarioFinal) {
      // Tem data E horario - pula direto pra confirmacao
      const dataCompleta = `${dataExtraida} - ${horarioFinal}`;
      await updateSession(phone, {
        step: "aguardando_confirmacao",
        data_agendada: dataCompleta,
        periodo: null,
      });
    } else if (dataExtraida && !horarioFinal) {
      // So tem data, pede horario
      await updateSession(phone, {
        step: "aguardando_horario" as any,
        data_agendada: dataExtraida,
      });
      await sendMessage({
        to: phone,
        message: `📅 *${dataExtraida}* - Anotado!\n\nAgora informe o *horario*:\n\n1️⃣ *Manha* (08:00 - 12:00)\n2️⃣ *Tarde* (13:00 - 17:00)\n\nOu digite o horario direto (ex: *14h*, *15:30*, *9 horas*)`,
      });
      return;
    } else if (!dataExtraida && horarioExtraido) {
      // So tem horario, pede data
      await sendMessage({
        to: phone,
        message: `⏰ *${horarioExtraido}* - Anotado!\n\nAgora informe o *dia*:\n\nExemplo: *25/04*, *amanha*, *segunda*`,
      });
      // Salva horario temporariamente no periodo
      await updateSession(phone, { periodo: horarioExtraido });
      return;
    } else {
      // Nao entendeu nada
      await sendMessage({
        to: phone,
        message: `📅 *Pra agendar, preciso do dia e horario* 😊\n\nEssas informacoes sao essenciais pra garantir o melhor atendimento!\n\nVoce pode enviar tudo junto ou um de cada vez:\n\n*Exemplos:*\n• *25/04 as 15h*\n• *amanha 14:30*\n• *segunda 9h*\n• *25/04* (depois pergunto o horario)\n• *15h* (depois pergunto o dia)\n\nOu digite *AGORA* se for urgente`,
      });
      return;
    }
  }

  const veiculo = session.veiculo_sugerido || "utilitario";
  const veiculoNome: Record<string, string> = {
    utilitario: "Utilitario (Strada/Saveiro)",
    hr: "HR",
    caminhao_bau: "Caminhao Bau",
    guincho: "Guincho",
    moto_guincho: "Guincho de Moto",
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
      await updateSession(phone, { step: "aguardando_fretista", corrida_id: corridaId });

      // Informa que esta reservando a agenda
      await sendMessage({ to: phone, message: MSG.freteRecebido });

      // Dispara para fretistas e aguarda resposta
      await dispararParaFretistas(corridaId, session, phone);
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
  await updateSession(phone, { step: "atendimento_humano" });

  if (isHorarioAtendimentoHumano()) {
    await sendMessage({ to: phone, message: MSG.transferenciaHumano });
  } else {
    await sendMessage({ to: phone, message: MSG.foraHorarioHumano });
  }

  // Notifica admin no WhatsApp pessoal
  await notificarAdmin(
    `🔔 *ATENDIMENTO SOLICITADO*`,
    phone,
    `Horario: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\nDentro do horario: ${isHorarioAtendimentoHumano() ? "Sim" : "Nao"}`
  );
}

// === NOTIFICACAO ADMIN ===
async function notificarAdmin(titulo: string, clientePhone: string, detalhes: string) {
  try {
    await sendMessage({
      to: ADMIN_PHONE,
      message: `${titulo}\n\n👤 Cliente: ${formatarTelefoneExibicao(clientePhone)}\n📱 wa.me/${clientePhone}\n${detalhes}\n\n⏰ ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    });
  } catch (e) {
    console.error("Erro ao notificar admin:", e);
  }
}

// === DISPATCH FRETISTAS ===

async function dispararParaFretistas(corridaId: string, session: BotSession, clientePhone: string) {
  try {
    const isGuincho = (session.descricao_carga || "").toLowerCase().includes("guincho");

    // Filtra prestadores pelo tipo de veiculo
    // Guincho: so prestadores com veiculo tipo "guincho"
    // Frete: so prestadores com veiculo tipo utilitario/hr/caminhao (exclui guincho)
    let prestadores: { telefone: string; nome: string }[] = [];

    if (isGuincho) {
      const { data } = await supabase
        .from("prestadores")
        .select("telefone, nome, id")
        .eq("disponivel", true)
        .eq("status", "aprovado");

      if (data) {
        // Filtra prestadores que tem veiculo tipo guincho
        for (const p of data) {
          const { data: veiculos } = await supabase
            .from("prestadores_veiculos")
            .select("tipo")
            .eq("prestador_id", p.id)
            .eq("ativo", true);

          const temGuincho = veiculos?.some(v =>
            v.tipo === "guincho" || v.tipo === "guincho_plataforma"
          );
          if (temGuincho) prestadores.push(p);
        }
      }
    } else {
      const { data } = await supabase
        .from("prestadores")
        .select("telefone, nome, id")
        .eq("disponivel", true)
        .eq("status", "aprovado");

      if (data) {
        // Filtra prestadores que NAO sao guincheiros (tem veiculo de frete)
        for (const p of data) {
          const { data: veiculos } = await supabase
            .from("prestadores_veiculos")
            .select("tipo")
            .eq("prestador_id", p.id)
            .eq("ativo", true);

          const ehFretista = veiculos?.some(v =>
            ["utilitario", "hr", "caminhao_bau", "carro_comum"].includes(v.tipo)
          );
          if (ehFretista) prestadores.push(p);
        }
      }
    }

    if (prestadores.length === 0) {
      await sendMessage({ to: clientePhone, message: MSG.nenhumFretista });
      await notificarAdmin(
        isGuincho ? `⚠️ *NENHUM GUINCHEIRO DISPONIVEL*` : `⚠️ *NENHUM FRETISTA DISPONIVEL*`,
        clientePhone,
        `Corrida: ${corridaId}\nTipo: ${isGuincho ? "GUINCHO" : "FRETE"}\nOrigem: ${session.origem_endereco}\nDestino: ${session.destino_endereco}\nValor: R$ ${session.valor_estimado}`
      );
      return;
    }

    const telefones = prestadores.map((p) => p.telefone);
    const valorPrestador = Math.round((session.valor_estimado || 0) * 0.88);

    createDispatch(corridaId, clientePhone, telefones);

    let mensagem = "";

    if (isGuincho) {
      // Mensagem de GUINCHO pro guincheiro
      mensagem = `🚗 *Guincho solicitado!*\n\n📍 Coleta: ${session.origem_endereco || "SP"}\n🏠 Destino: ${session.destino_endereco || "Destino"}\n🔧 ${session.descricao_carga || "Guincho"}\n📅 ${session.data_agendada || "AGORA"}\n💰 Voce recebe: R$ ${valorPrestador}\n\n━━━━━━━━━━━━━━━━\n1️⃣ ✅ *PEGAR* - Quero esse guincho!\n2️⃣ 🙏 *EM ATENDIMENTO* - Estou ocupado no momento`;
    } else {
      // Mensagem de FRETE pro fretista
      let ajudanteInfo = "*Sem ajudante*";
      if (session.precisa_ajudante) {
        const { data: corridaInfo } = await supabase
          .from("corridas")
          .select("qtd_ajudantes")
          .eq("id", corridaId)
          .single();
        const qtd = corridaInfo?.qtd_ajudantes || 1;
        ajudanteInfo = `*Com ${qtd} ajudante${qtd > 1 ? "s" : ""}*`;
      }

      mensagem = MSG.novoFreteDisponivel(
        session.origem_endereco || "SP",
        session.destino_endereco || "Destino",
        session.descricao_carga || "Material",
        session.data_agendada || "A combinar",
        valorPrestador.toString(),
        corridaId,
        ajudanteInfo
      );
    }

    await sendMessageToMany(telefones, mensagem);

    // Apos 31s, se ninguem aceitou, notifica cliente
    setTimeout(async () => {
      const vencedor = resolveDispatch(corridaId);
      if (vencedor) {
        await notificarResultadoDispatch(corridaId, vencedor, clientePhone);
      } else {
        // Ninguem aceitou na janela - espera mais respostas
        // Se ninguem aceitar em 5 min, notifica admin
        setTimeout(async () => {
          const dispatch = getDispatchByCorridaId(corridaId);
          if (dispatch && !dispatch.finalizado) {
            finalizeDispatch(corridaId);
            await sendMessage({ to: clientePhone, message: MSG.nenhumFretista });
          }
        }, 270000); // 4.5 min adicionais (total 5 min)
      }
    }, 31000);
  } catch (error: any) {
    console.error("Erro dispatch:", error?.message);
    await sendMessage({ to: clientePhone, message: MSG.nenhumFretista });
  }
}

// === CADASTRO PRESTADOR ===

async function handleCadastroNome(phone: string, message: string) {
  if (message.length < 3) {
    await sendMessage({ to: phone, message: "Me passa seu nome completo, por favor 😊" });
    return;
  }
  // Salva nome temporariamente no campo origem_endereco
  await updateSession(phone, { step: "cadastro_cpf", origem_endereco: message });
  await sendMessage({ to: phone, message: MSG.cadastroCpf });
}

async function handleCadastroCpf(phone: string, message: string) {
  const cpf = message.replace(/\D/g, "");
  if (cpf.length !== 11) {
    await sendMessage({ to: phone, message: "CPF precisa ter 11 dígitos. Tenta de novo 😊" });
    return;
  }
  await updateSession(phone, { step: "cadastro_email", destino_endereco: cpf });
  await sendMessage({ to: phone, message: MSG.cadastroEmail });
}

async function handleCadastroEmail(phone: string, message: string) {
  const email = message.trim().toLowerCase();
  if (!email.includes("@") || !email.includes(".")) {
    await sendMessage({ to: phone, message: "Email inválido. Tenta de novo 😊\nExemplo: *seunome@email.com*" });
    return;
  }
  // Salva email no campo plano_escolhido (campo temporário)
  await updateSession(phone, { step: "cadastro_selfie", plano_escolhido: email });
  await sendMessage({ to: phone, message: MSG.cadastroSelfie });
}

async function handleCadastroPlaca(phone: string, message: string) {
  if (message.length < 5) {
    await sendMessage({ to: phone, message: "Me passa a placa do veiculo, por favor 😊" });
    return;
  }
  await updateSession(phone, { step: "cadastro_chave_pix", periodo: message.toUpperCase() });
  await sendMessage({ to: phone, message: MSG.cadastroChavePix });
}

async function handleCadastroChavePix(phone: string, message: string) {
  if (message.length < 5) {
    await sendMessage({ to: phone, message: "Me passa sua chave Pix (CPF, email, telefone ou chave aleatoria) 😊" });
    return;
  }
  // Salva chave Pix no bot_logs (sera usada no pagamento)
  await supabase.from("bot_logs").insert({
    payload: { tipo: "chave_pix_prestador", phone, chave_pix: message.trim() },
  });
  await updateSession(phone, { step: "cadastro_tipo_veiculo" });
  await sendMessage({ to: phone, message: MSG.cadastroTipoVeiculo });
}

async function handleCadastroTipoVeiculo(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();
  let tipoVeiculo = "";

  if (lower === "1" || lower.includes("comum") || lower.includes("kicks") || lower.includes("livina")) {
    tipoVeiculo = "carro_comum";
  } else if (lower === "2" || lower.includes("utilitario") || lower.includes("strada") || lower.includes("saveiro")) {
    tipoVeiculo = "utilitario";
  } else if (lower === "3" || lower.includes("hr") || lower.includes("bongo")) {
    tipoVeiculo = "hr";
  } else if (lower === "4" || lower.includes("caminhao") || lower.includes("bau")) {
    tipoVeiculo = "caminhao_bau";
  } else if (lower === "5" || lower.includes("guincho") || lower.includes("plataforma")) {
    tipoVeiculo = "guincho";
  } else {
    await sendMessage({ to: phone, message: "Escolhe o tipo do veiculo:\n\n1️⃣ Carro comum\n2️⃣ Utilitario\n3️⃣ HR / Bongo\n4️⃣ Caminhao Bau\n5️⃣ Guincho / Plataforma" });
    return;
  }

  // Salva tipo veiculo temporariamente e envia termos
  await updateSession(phone, { step: "cadastro_termos", veiculo_sugerido: tipoVeiculo });
  await sendMessage({ to: phone, message: MSG.cadastroTermos });
}

async function handleCadastroTermos(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  if (lower !== "eu concordo") {
    await sendMessage({
      to: phone,
      message: "Para prosseguir, digite exatamente: *eu concordo*\n\nOu se tiver duvidas, digite *4* pra falar com um especialista.",
    });
    return;
  }

  const dataHoraAceite = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  // Registra aceite dos termos como prova jurídica
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "aceite_termos",
      phone,
      mensagem_original: message,
      data_hora: new Date().toISOString(),
      data_hora_sp: dataHoraAceite,
      ip: "whatsapp",
      nome: session.origem_endereco,
      cpf: session.destino_endereco,
      email: session.plano_escolhido,
    },
  });

  // Envia cópia dos termos por email
  const emailPrestador = session.plano_escolhido || "";
  if (emailPrestador && emailPrestador.includes("@")) {
    const { enviarEmailTermosAceitos } = await import("@/lib/email");
    await enviarEmailTermosAceitos(
      emailPrestador,
      session.origem_endereco || "Prestador",
      session.destino_endereco || "",
      dataHoraAceite
    );
  }

  // Salva prestador no Supabase
  const nome = session.origem_endereco || "Prestador";
  const cpf = session.destino_endereco || "";
  const placa = session.periodo || "";
  const selfieUrl = session.foto_url || "";
  const tipoVeiculo = session.veiculo_sugerido || "utilitario";

  const { error } = await supabase.from("prestadores").insert({
    telefone: phone,
    nome,
    cpf,
    status: "pendente",
    score: 5.0,
    total_corridas: 0,
    total_reclamacoes: 0,
    disponivel: false,
    termos_aceitos: true,
  });

  if (error && error.code === "23505") {
    await sendMessage({ to: phone, message: "Voce ja tem cadastro na Pegue! 😊 Em breve recebera indicacoes!" });
  } else {
    const { data: prestador } = await supabase
      .from("prestadores")
      .select("id")
      .eq("telefone", phone)
      .single();

    if (prestador) {
      await supabase.from("prestadores_veiculos").insert({
        prestador_id: prestador.id,
        tipo: tipoVeiculo,
        placa,
        foto_url: selfieUrl,
        ativo: true,
      });
    }

    // Verifica se aprovacao automatica esta ativa
    const { data: cfgAutoAprov } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "aceitar_novos_prestadores")
      .single();

    const autoAprovar = cfgAutoAprov?.valor === "habilitado";
    const docsCompletos = nome.length >= 3 && cpf.length >= 11 && placa.length >= 7 && selfieUrl;

    if (autoAprovar && docsCompletos && prestador) {
      // Aprovacao automatica - docs completos
      await supabase
        .from("prestadores")
        .update({ status: "aprovado", disponivel: true })
        .eq("id", prestador.id);

      await sendMessage({
        to: phone,
        message: `🎉 *Parabens ${nome}!*\n\nSeu cadastro foi *aprovado automaticamente*! Bem-vindo a familia Pegue! 🚚✨\n\nA partir de agora voce recebe indicacoes de fretes direto aqui no WhatsApp. Fique atento! 📱\n\nDigite *esqueci* pra ver todos os comandos disponiveis.`,
      });

      // Notifica admin da aprovacao automatica
      await notificarAdmin(
        `✅ *PRESTADOR APROVADO AUTOMATICAMENTE*`,
        phone,
        `👤 ${nome}\n🚗 ${tipoVeiculo}\n🪪 Placa: ${placa}\n📸 Selfie: ${selfieUrl ? "Sim" : "Nao"}\n\n⚠️ Revise no /admin se necessario`
      );
    } else {
      // Aprovacao manual - notifica admin
      await sendMessage({ to: phone, message: MSG.cadastroConcluido });

      await notificarAdmin(
        `🆕 *NOVO PRESTADOR PRA APROVAR*`,
        phone,
        `👤 ${nome}\n🚗 ${tipoVeiculo}\n🪪 Placa: ${placa}\n📸 Selfie: ${selfieUrl ? "Sim" : "Nao"}\nDocs completos: ${docsCompletos ? "Sim" : "Nao"}\nAuto-aprovacao: ${autoAprovar ? "Ligada" : "Desligada"}\n\n👉 Acesse /admin pra aprovar`
      );
    }
  }

  await updateSession(phone, { step: "cadastro_aguardando_aprovacao" });
}

// === FOTOS COLETA/ENTREGA FRETISTA ===

// === DASHBOARD FRETISTA ===

async function handleDashboardFretista(phone: string) {
  // Busca prestador
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id, nome, score, total_corridas, status, disponivel")
    .eq("telefone", phone)
    .single();

  if (!prestador) {
    await sendMessage({
      to: phone,
      message: "Você ainda não tem cadastro de parceiro na Pegue 😊\n\nPra se cadastrar, envie: *Parcerias Pegue*",
    });
    return;
  }

  // Busca faturamento total
  const { data: corridas } = await supabase
    .from("corridas")
    .select("valor_prestador")
    .eq("prestador_id", prestador.id)
    .eq("status", "concluida");

  const faturamento = corridas
    ? corridas.reduce((sum, c) => sum + (c.valor_prestador || 0), 0)
    : 0;

  const statusTexto = prestador.status === "aprovado"
    ? prestador.disponivel ? "✅ Ativo" : "⏸️ Pausado"
    : prestador.status === "pendente" ? "🔄 Em análise" : "❌ Inativo";

  await sendMessage({
    to: phone,
    message: MSG.dashboardFretista(
      prestador.nome,
      prestador.score?.toFixed(1) || "5.0",
      prestador.total_corridas || 0,
      faturamento.toFixed(2),
      statusTexto
    ),
  });
}

// === MODO FERIAS / PAUSAR / ATIVAR ===

async function handlePausarPrestador(phone: string) {
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id, nome, disponivel")
    .eq("telefone", phone)
    .single();

  if (!prestador) {
    await sendMessage({ to: phone, message: "Voce nao tem cadastro de parceiro na Pegue. Para se cadastrar, envie *Parcerias Pegue*" });
    return;
  }

  if (!prestador.disponivel) {
    await sendMessage({ to: phone, message: "Voce ja esta pausado! 😊\n\nPra voltar a receber indicacoes, digite *voltei*" });
    return;
  }

  await supabase
    .from("prestadores")
    .update({ disponivel: false })
    .eq("id", prestador.id);

  await sendMessage({
    to: phone,
    message: `⏸️ *Modo ferias ativado!*

Voce nao recebera indicacoes de frete por enquanto.

Aproveite o descanso! 😊

Quando quiser voltar, basta digitar *voltei*

Seus dados, score e historico continuam salvos.`,
  });
}

async function handleAtivarPrestador(phone: string) {
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id, nome, disponivel, status")
    .eq("telefone", phone)
    .single();

  if (!prestador) {
    await sendMessage({ to: phone, message: "Voce nao tem cadastro de parceiro na Pegue. Para se cadastrar, envie *Parcerias Pegue*" });
    return;
  }

  if (prestador.status !== "aprovado") {
    await sendMessage({ to: phone, message: "Seu cadastro ainda esta em analise. Aguarde a aprovacao! 😊" });
    return;
  }

  if (prestador.disponivel) {
    await sendMessage({ to: phone, message: "Voce ja esta ativo! 😊 Fique atento as indicacoes de frete!" });
    return;
  }

  await supabase
    .from("prestadores")
    .update({ disponivel: true })
    .eq("id", prestador.id);

  await sendMessage({
    to: phone,
    message: `✅ *Voce esta de volta!*

Bem-vindo de volta a familia Pegue! 🚚✨

Voce ja pode receber indicacoes de frete novamente. Fique atento ao WhatsApp!

Lembre-se: quem aceitar primeiro, leva o trabalho! ⚡
Digite *PEGAR* pra aceitar um frete.`,
  });
}

// === CONTROLE FINANCEIRO PESSOAL ===

async function handleRegistrarDespesa(phone: string, message: string) {
  // Formato: "despesa 50 combustivel" ou "gasto 12.90 almoco"
  const partes = message.replace(/^(despesa|gasto)\s+/i, "").trim();
  const match = partes.match(/^(\d+[.,]?\d*)\s*(.*)/);

  if (!match) {
    await sendMessage({
      to: phone,
      message: `Para registrar uma despesa, use o formato:\n\n*despesa [valor] [descricao]*\n\nExemplos:\n- despesa 50 combustivel\n- despesa 12.90 almoco\n- despesa 6.20 gasolina`,
    });
    return;
  }

  const valor = parseFloat(match[1].replace(",", "."));
  const descricao = match[2] || "Despesa geral";

  if (isNaN(valor) || valor <= 0) {
    await sendMessage({ to: phone, message: "Valor invalido. Use: *despesa 50 combustivel*" });
    return;
  }

  // Salva no Supabase
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "despesa_pessoal",
      phone,
      valor,
      descricao,
      data: new Date().toISOString(),
      data_sp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      mes: new Date().getMonth() + 1,
      ano: new Date().getFullYear(),
    },
  });

  // Busca total do mes
  const mesAtual = new Date().getMonth() + 1;
  const anoAtual = new Date().getFullYear();

  const { data: despesasMes } = await supabase
    .from("bot_logs")
    .select("payload")
    .filter("payload->>tipo", "eq", "despesa_pessoal")
    .filter("payload->>phone", "eq", phone);

  const totalMes = despesasMes
    ? despesasMes
        .filter(d => {
          const p = d.payload as any;
          return p.mes === mesAtual && p.ano === anoAtual;
        })
        .reduce((s, d) => s + ((d.payload as any).valor || 0), 0)
    : 0;

  await sendMessage({
    to: phone,
    message: `✅ Despesa registrada!\n\n📝 ${descricao}: *R$ ${valor.toFixed(2)}*\n\n📊 Total de gastos este mes: *R$ ${totalMes.toFixed(2)}*\n\nPra ver o resumo completo, digite *meus gastos*`,
  });
}

async function handleVerGastos(phone: string) {
  const mesAtual = new Date().getMonth() + 1;
  const anoAtual = new Date().getFullYear();
  const nomeMes = ["", "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][mesAtual];

  // Busca despesas do mes
  const { data: despesas } = await supabase
    .from("bot_logs")
    .select("payload")
    .filter("payload->>tipo", "eq", "despesa_pessoal")
    .filter("payload->>phone", "eq", phone);

  const despesasMes = despesas
    ? despesas.filter(d => {
        const p = d.payload as any;
        return p.mes === mesAtual && p.ano === anoAtual;
      })
    : [];

  const totalGastos = despesasMes.reduce((s, d) => s + ((d.payload as any).valor || 0), 0);

  // Agrupa por categoria
  const categorias: Record<string, number> = {};
  despesasMes.forEach(d => {
    const desc = ((d.payload as any).descricao || "Outros").toLowerCase();
    // Simplifica categorias
    let cat = "Outros";
    if (desc.includes("combustivel") || desc.includes("gasolina") || desc.includes("etanol") || desc.includes("diesel")) cat = "Combustivel";
    else if (desc.includes("almoco") || desc.includes("janta") || desc.includes("lanche") || desc.includes("comida") || desc.includes("refeicao") || desc.includes("cafe")) cat = "Alimentacao";
    else if (desc.includes("bebida") || desc.includes("agua") || desc.includes("suco") || desc.includes("refrigerante") || desc.includes("coca")) cat = "Bebidas";
    else if (desc.includes("pedagio") || desc.includes("estacionamento") || desc.includes("zona azul") || desc.includes("parking")) cat = "Pedagio/Estac/Zona Azul";
    else if (desc.includes("manutencao") || desc.includes("oficina") || desc.includes("pneu") || desc.includes("oleo") || desc.includes("troca") || desc.includes("lavagem")) cat = "Manutencao Veiculo";
    else if (desc.includes("ajudante") || desc.includes("chapas") || desc.includes("carga") || desc.includes("descarga")) cat = "Ajudante/Chapas";
    else if (desc.includes("celular") || desc.includes("internet") || desc.includes("recarga") || desc.includes("chip")) cat = "Celular/Internet";
    else if (desc.includes("carrinho") || desc.includes("palet") || desc.includes("ferramenta") || desc.includes("corda") || desc.includes("lona") || desc.includes("fita") || desc.includes("cobertor") || desc.includes("cinta") || desc.includes("roda")) cat = "Ferramentas/Materiais";
    else cat = (d.payload as any).descricao || "Outros";

    categorias[cat] = (categorias[cat] || 0) + (d.payload as any).valor;
  });

  // Busca ganhos do mes (corridas)
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id")
    .eq("telefone", phone)
    .single();

  let ganhosMes = 0;
  if (prestador) {
    const { data: corridas } = await supabase
      .from("corridas")
      .select("valor_prestador, criado_em")
      .eq("prestador_id", prestador.id)
      .eq("status", "concluida");

    if (corridas) {
      ganhosMes = corridas
        .filter(c => {
          const d = new Date(c.criado_em);
          return d.getMonth() + 1 === mesAtual && d.getFullYear() === anoAtual;
        })
        .reduce((s, c) => s + (c.valor_prestador || 0), 0);
    }
  }

  const lucro = ganhosMes - totalGastos;

  let msg = `📊 *Seu Controle Financeiro*\n📅 ${nomeMes} ${anoAtual}\n\n`;
  msg += `💰 Ganhos (fretes): *R$ ${ganhosMes.toFixed(2)}*\n`;
  msg += `💸 Gastos totais: *R$ ${totalGastos.toFixed(2)}*\n`;
  msg += `${lucro >= 0 ? "✅" : "⚠️"} Lucro: *R$ ${lucro.toFixed(2)}*\n`;

  if (Object.keys(categorias).length > 0) {
    msg += "\n📋 *Gastos por categoria:*\n";
    Object.entries(categorias)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, val]) => {
        const pct = totalGastos > 0 ? Math.round((val / totalGastos) * 100) : 0;
        msg += `- ${cat}: R$ ${val.toFixed(2)} (${pct}%)\n`;
      });
  }

  if (despesasMes.length === 0) {
    msg += "\nNenhuma despesa registrada este mes.\nPra registrar: *despesa [valor] [descricao]*";
  }

  msg += "\n\n💡 Registre seus gastos diarios pra ter controle total!";
  msg += "\nExemplo: *despesa 6.20 gasolina*";

  await sendMessage({ to: phone, message: msg });
}

// === DASHBOARD CLIENTE ===

async function handleDashboardCliente(phone: string) {
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome, nivel, total_corridas")
    .eq("telefone", phone)
    .single();

  if (!cliente) {
    await sendMessage({
      to: phone,
      message: "Voce ainda nao tem historico na Pegue 😊\n\nPra solicitar um frete, envie: *Oi*\n\n📱 Painel completo: pegue-eta.vercel.app/minha-conta",
    });
    return;
  }

  const { data: corridas } = await supabase
    .from("corridas")
    .select("valor_final, status, descricao_carga, destino_endereco, periodo")
    .eq("cliente_id", cliente.id)
    .order("criado_em", { ascending: false })
    .limit(5);

  const concluidas = corridas?.filter(c => c.status === "concluida") || [];
  const totalGasto = concluidas.reduce((s, c) => s + (c.valor_final || 0), 0);

  let historico = "";
  if (corridas && corridas.length > 0) {
    historico = "\n📋 *Ultimos servicos:*\n";
    corridas.slice(0, 5).forEach(c => {
      const status = c.status === "concluida" ? "✅" : c.status === "aceita" ? "🔄" : c.status === "paga" ? "💰" : "⏳";
      historico += `${status} ${c.descricao_carga || "Frete"} → ${c.destino_endereco?.substring(0, 25) || "---"} | R$ ${c.valor_final || 0}\n`;
    });
  }

  await sendMessage({
    to: phone,
    message: `📊 *Sua Conta - Pegue*

👤 *${cliente.nome || "Cliente"}*
🏷 Nivel: *${cliente.nivel || "Bronze"}*
🚚 Servicos contratados: *${concluidas.length}*
💰 Total investido: *R$ ${totalGasto.toFixed(0)}*
${historico}
📱 Painel completo: pegue-eta.vercel.app/minha-conta

Pra ver novamente, digite *minha conta* 😊`,
  });
}

// === AVALIAÇÃO DO CLIENTE ===

async function handleAvaliacao(phone: string, message: string, tipo: "atendimento" | "praticidade" | "fretista") {
  const nota = parseInt(message.trim());

  if (isNaN(nota) || nota < 1 || nota > 5) {
    await sendMessage({
      to: phone,
      message: "Me manda uma nota de *1 a 5* 😊\n(1 = péssimo, 5 = excelente)",
    });
    return;
  }

  const session = await getSession(phone);

  // Salva nota no Supabase (usa bot_logs por enquanto)
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "avaliacao",
      categoria: tipo,
      nota,
      phone,
      corrida_id: session?.corrida_id,
    },
  });

  if (tipo === "atendimento") {
    await updateSession(phone, { step: "avaliacao_praticidade" });
    await sendMessage({ to: phone, message: MSG.clientePedirNotaPraticidade });
  } else if (tipo === "praticidade") {
    await updateSession(phone, { step: "avaliacao_fretista" });
    await sendMessage({ to: phone, message: MSG.clientePedirNotaFretista });
  } else if (tipo === "fretista") {
    await updateSession(phone, { step: "avaliacao_sugestao" });
    await sendMessage({ to: phone, message: MSG.clientePedirSugestao });
  }
}

async function handleAvaliacaoSugestao(phone: string, message: string) {
  const session = await getSession(phone);
  const lower = message.toLowerCase().trim();

  if (lower !== "pular") {
    // Salva sugestão
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "avaliacao",
        categoria: "sugestao",
        texto: message,
        phone,
        corrida_id: session?.corrida_id,
      },
    });
  }

  await updateSession(phone, { step: "concluido" });
  await sendMessage({ to: phone, message: MSG.clienteAvaliacaoConcluida });
}

// === CONFIRMAÇÃO DE ENTREGA PELO CLIENTE ===

async function handleConfirmacaoEntrega(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session || !session.corrida_id) return;

  const lower = message.toLowerCase().trim();

  if (lower === "1" || lower.startsWith("sim") || lower === "s") {
    await updateSession(phone, { step: "avaliacao_atendimento" });
    await sendMessage({ to: phone, message: MSG.clienteConfirmouEntrega });

    await supabase
      .from("corridas")
      .update({
        status: "concluida",
        entrega_em: new Date().toISOString(),
        rastreio_ativo: false,
      })
      .eq("id", session.corrida_id);

    // Verifica se e primeiro frete concluido — envia mensagem especial
    const { data: clienteData } = await supabase
      .from("clientes")
      .select("id, total_corridas")
      .eq("telefone", phone)
      .single();

    if (clienteData) {
      // Atualiza total de corridas
      await supabase
        .from("clientes")
        .update({ total_corridas: (clienteData.total_corridas || 0) + 1 })
        .eq("id", clienteData.id);

      if ((clienteData.total_corridas || 0) === 0) {
        // Primeiro frete concluido!
        await sendMessage({ to: phone, message: MSG.primeiroFreteCliente });
        await sendMessage({ to: phone, message: MSG.ferramentasCliente });
      }
    }

    const { data: corrida } = await supabase
      .from("corridas")
      .select("prestador_id, prestadores(telefone)")
      .eq("id", session.corrida_id)
      .single();

    if (corrida?.prestadores) {
      const fretistaTel = (corrida.prestadores as any).telefone;

      // Busca dados completos da corrida pra pagamento
      const { data: corridaCompleta } = await supabase
        .from("corridas")
        .select("valor_prestador, valor_pegue, prestador_id, prestadores(nome, telefone)")
        .eq("id", session.corrida_id)
        .single();

      const valorPrestador = corridaCompleta?.valor_prestador || 0;
      const nomePrestador = (corridaCompleta?.prestadores as any)?.nome || "Fretista";

      // Busca chave Pix do fretista
      const { data: prestadorData } = await supabase
        .from("prestadores")
        .select("id, nome, total_corridas")
        .eq("telefone", fretistaTel)
        .single();

      // Atualiza total de corridas do fretista
      if (prestadorData) {
        await supabase
          .from("prestadores")
          .update({ total_corridas: (prestadorData.total_corridas || 0) + 1 })
          .eq("id", prestadorData.id);
      }

      // Notifica fretista que pagamento foi liberado
      await sendMessage({
        to: fretistaTel,
        message: `✅ *Pagamento LIBERADO!* 🎉\n\nO cliente confirmou a entrega.\n💰 *Valor: R$ ${valorPrestador}*\n\nSeu pagamento sera processado em breve via Pix.\n\nObrigado pelo excelente servico! 🚚✨`,
      });

      // Notifica admin pra fazer o Pix
      await notificarAdmin(
        `💰 *PAGAMENTO LIBERADO - FAZER PIX*`,
        phone,
        `Fretista: ${nomePrestador} (${formatarTelefoneExibicao(fretistaTel)})\n💰 *Valor: R$ ${valorPrestador}*\nCorrida: ${session.corrida_id}\n\n👉 Acesse /admin pra marcar como pago`
      );

      // Registra pagamento pendente no log
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "pagamento_fretista_liberado",
          corrida_id: session.corrida_id,
          fretista: fretistaTel,
          valor: valorPrestador,
          status: "aguardando_pix",
        },
      });
    }
  } else if (lower === "2" || lower.startsWith("nao") || lower.startsWith("não") || lower === "n") {
    await updateSession(phone, { step: "concluido" });
    await sendMessage({ to: phone, message: MSG.clienteReclamouEntrega });

    const { data: corrida } = await supabase
      .from("corridas")
      .select("prestador_id, prestadores(telefone)")
      .eq("id", session.corrida_id)
      .single();

    if (corrida?.prestadores) {
      const fretistaTel = (corrida.prestadores as any).telefone;
      await sendMessage({ to: fretistaTel, message: MSG.fretistaProblemaNaEntrega });
    }

    await notificarAdmin(
      `🚨 *PROBLEMA NA ENTREGA*`,
      phone,
      `Corrida: ${session.corrida_id}\nCliente reportou problema.\nPagamento retido automaticamente.`
    );

    await supabase
      .from("corridas")
      .update({ status: "problema" })
      .eq("id", session.corrida_id);
  } else {
    await sendMessage({
      to: phone,
      message: "Está tudo certo com a entrega? 😊\n\n1️⃣ *SIM* - Tudo OK\n2️⃣ *NÃO* - Tive algum problema",
    });
  }
}

async function handleFretistFotos(phone: string, message: string, tipo: "coleta" | "entrega") {
  const lower = message.toLowerCase().trim();

  if (lower === "pronto") {
    if (tipo === "coleta") {
      await updateSession(phone, { step: "concluido" });
      await sendMessage({ to: phone, message: MSG.fretistaColetaConfirmada });

      // === ATIVA RASTREIO EM TEMPO REAL ===
      // Fretista coletou os itens, agora vai dirigir pro destino
      const sessionData = await getSession(phone);
      if (sessionData?.corrida_id) {
        // Ativa rastreio
        await supabase
          .from("corridas")
          .update({ rastreio_ativo: true })
          .eq("id", sessionData.corrida_id);

        // Busca dados pra montar links
        const { data: corridaRastreio } = await supabase
          .from("corridas")
          .select("rastreio_token, codigo, cliente_id, prestador_id, clientes(telefone), prestadores(nome)")
          .eq("id", sessionData.corrida_id)
          .single();

        if (corridaRastreio?.rastreio_token) {
          const rastreioToken = corridaRastreio.rastreio_token;
          const codigoCorrida = corridaRastreio.codigo;
          const baseUrl = "https://pegue-eta.vercel.app";
          const nomePrestador = (corridaRastreio.prestadores as any)?.nome || "Fretista";

          // Link pro fretista (GPS sender)
          const linkFretista = `${baseUrl}/rastrear/motorista/${rastreioToken}`;
          await sendMessage({
            to: phone,
            message: MSG.rastreioLinkFretista(linkFretista),
          });

          // Link pro cliente (mapa tempo real)
          const clienteTel = (corridaRastreio.clientes as any)?.telefone;
          if (clienteTel) {
            const linkCliente = `${baseUrl}/rastrear/${codigoCorrida}?t=${rastreioToken}`;
            await sendMessage({
              to: clienteTel,
              message: MSG.rastreioLinkCliente(linkCliente, nomePrestador),
            });
          }
        }
      }
    } else {
      // Entrega concluída
      await updateSession(phone, { step: "concluido" });

      // Avisa fretista pra aguardar no local
      await sendMessage({ to: phone, message: MSG.fretistaAguardarConfirmacao });

      // Busca corrida pra encontrar o cliente
      const session = await getSession(phone);
      if (session?.corrida_id) {
        const { data: corrida } = await supabase
          .from("corridas")
          .select("cliente_id, descricao_carga, clientes(telefone)")
          .eq("id", session.corrida_id)
          .single();

        if (corrida?.clientes) {
          const clienteTel = (corrida.clientes as any).telefone;
          const isGuincho = (corrida.descricao_carga || "").toLowerCase().includes("guincho");
          // Muda sessao do cliente pra aguardar confirmacao
          await updateSession(clienteTel, { step: "aguardando_confirmacao_entrega" });
          await sendMessage({
            to: clienteTel,
            message: isGuincho
              ? MSG.guinchoClienteConfirmarEntrega(corrida.descricao_carga || "Servico de guincho")
              : MSG.clienteConfirmarEntrega(corrida.descricao_carga || "seus materiais"),
          });

          // Lembrete apos 10 min se cliente nao responder
          setTimeout(async () => {
            const sessaoCliente = await getSession(clienteTel);
            if (sessaoCliente?.step === "aguardando_confirmacao_entrega") {
              await sendMessage({ to: clienteTel, message: MSG.lembreteConfirmacao });
            }
          }, 10 * 60 * 1000);

          // Apos 20 min: libera fretista + notifica admin
          setTimeout(async () => {
            const sessaoCliente = await getSession(clienteTel);
            if (sessaoCliente?.step === "aguardando_confirmacao_entrega") {
              // Libera fretista
              await sendMessage({
                to: phone,
                message: `⏳ *20 minutos sem confirmacao do cliente.*\n\nVoce pode se retirar do local. Aguarde o andamento das tratativas.\n\nSeu pagamento sera processado assim que o cliente confirmar.`,
              });

              // Notifica admin
              await notificarAdmin(
                `⏳ *CLIENTE NAO CONFIRMOU ENTREGA (20min)*`,
                clienteTel,
                `Fretista: ${formatarTelefoneExibicao(phone)}\nFretista liberado do local.\nPagamento pendente.`
              );

              // Ultimo lembrete pro cliente
              await sendMessage({
                to: clienteTel,
                message: `⚠️ *O fretista aguardou 20 minutos e precisou se retirar.*\n\nPor favor, confirme se a entrega esta correta:\n\n1️⃣ *SIM* - Tudo certo, servicos concluidos com sucesso! ✅\n2️⃣ *NAO* - Tenho observacoes`,
              });
            }
          }, 20 * 60 * 1000);
        }
      }
    }
    return;
  }

  await sendMessage({
    to: phone,
    message: `Manda as fotos ou digite *PRONTO* quando terminar 📸`,
  });
}

// === DISPATCH ===

async function handlePrestadorResponse(prestadorPhone: string, message: string, corridaId: string) {
  const lower = message.toLowerCase().trim();

  // Filtra respostas automaticas do WhatsApp Business
  const respostasAutomaticas = [
    "obrigado por entrar em contato",
    "agradecemos sua mensagem",
    "retornaremos em breve",
    "mensagem automatica",
    "no momento nao",
    "estamos indisponiveis",
    "horario de atendimento",
    "aguarde um momento",
    "em breve retornaremos",
    "obrigado pelo contato",
    "mensagem de ausencia",
  ];

  const ehRespostaAutomatica = respostasAutomaticas.some(r => lower.includes(r));
  if (ehRespostaAutomatica) {
    return; // Ignora silenciosamente
  }

  // Resposta "em atendimento" / "2" - prestador ocupado
  if (lower === "2" || lower === "em atendimento" || lower.includes("atendimento") || lower.includes("ocupado")) {
    await sendMessage({
      to: prestadorPhone,
      message: "🙏 Entendido! Quando estiver disponivel, fique atento as proximas indicacoes! 🚚",
    });
    return;
  }

  // Aceita variações de aceite: pegar, 1, quero, sim, aceito, vou, pode, eu quero, bora
  const aceitou = lower === "pegar" || lower === "1" || lower === "quero" || lower === "sim"
    || lower === "aceito" || lower === "vou" || lower === "pode" || lower === "bora"
    || lower === "eu quero" || lower === "vou pegar" || lower === "quero pegar"
    || lower === "aceitar" || lower === "vou sim" || lower === "pode ser";

  if (!aceitou) {
    await sendMessage({
      to: prestadorPhone,
      message: "Pra aceitar, responda:\n\n1️⃣ ✅ *PEGAR*\n2️⃣ 🙏 *EM ATENDIMENTO*\n\n⚠️ Respostas automaticas nao sao aceitas.",
    });
    return;
  }

  addDispatchResponse(corridaId, prestadorPhone, 0);
  const vencedor = resolveDispatch(corridaId);

  if (vencedor) {
    const dispatch = getDispatchByCorridaId(corridaId);
    const clientePhone = dispatch?.clientePhone || "";
    await notificarResultadoDispatch(corridaId, vencedor, clientePhone);
  } else {
    await sendMessage({
      to: prestadorPhone,
      message: "Resposta recebida! ✅ Aguardando outros prestadores... Resultado em instantes!",
    });
  }
}

async function notificarResultadoDispatch(corridaId: string, vencedorPhone: string, clientePhone: string) {
  const dispatch = getDispatchByCorridaId(corridaId);
  if (!dispatch) return;

  // Avisa fretista vencedor
  await sendMessage({ to: vencedorPhone, message: MSG.freteAceito });

  // Avisa os outros
  for (const phone of dispatch.prestadores) {
    if (phone !== vencedorPhone) {
      await sendMessage({ to: phone, message: MSG.freteJaPego });
    }
  }

  // Busca dados do prestador vencedor
  try {
    const { data: prestador } = await supabase
      .from("prestadores")
      .select("id, nome, telefone")
      .eq("telefone", vencedorPhone)
      .single();

    if (prestador) {
      // Atualiza corrida
      await supabase
        .from("corridas")
        .update({ prestador_id: prestador.id, status: "aceita" })
        .eq("id", corridaId);

      // Busca data da corrida
      const { data: corridaData } = await supabase
        .from("corridas")
        .select("periodo, data_agendada")
        .eq("id", corridaId)
        .single();

      const dataFrete = corridaData?.periodo || corridaData?.data_agendada || "a data combinada";

      // Notifica cliente com link de pagamento
      // TODO: Gerar link Mercado Pago
      const linkPagamento = "https://pegue-eta.vercel.app/simular";

      await sendMessage({
        to: clientePhone,
        message: MSG.freteConfirmadoEnviaPagamento(linkPagamento, dataFrete),
      });

      await updateSession(clientePhone, { step: "aguardando_pagamento" });
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
        qtd_ajudantes: await (async () => {
          const { data: qtdLog } = await supabase.from("bot_logs").select("payload").filter("payload->>tipo","eq","qtd_ajudantes").filter("payload->>phone","eq",session.phone).order("criado_em",{ascending:false}).limit(1);
          return qtdLog?.[0] ? (qtdLog[0].payload as any).qtd : 0;
        })(),
        plano: "padrao",
        valor_estimado: session.valor_estimado,
        valor_final: session.valor_estimado,
        valor_prestador: Math.round((session.valor_estimado || 0) * 0.88),
        valor_pegue: Math.round((session.valor_estimado || 0) * 0.12),
        // data_agendada salva como texto no campo periodo (data_agendada e tipo date no banco)
        periodo: session.data_agendada,
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
- carro_comum: Kicks/Livina/Renegade (porta-malas) - itens muito pequenos (caixas, malas, pacotes)
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

// === HORARIO OBRIGATORIO ===

async function handleHorario(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  // Opcoes rapidas
  let horario: string | null = null;
  if (lower === "1") horario = "Manha (08:00 - 12:00)";
  else if (lower === "2") horario = "Tarde (13:00 - 17:00)";
  else horario = extrairHorario(lower);

  if (!horario) {
    await sendMessage({
      to: phone,
      message: "Nao entendi o horario 😅\n\nPode digitar de qualquer forma:\n*14:30*, *15h*, *9 horas*, *10hs*, *15*\n\nOu escolha:\n1️⃣ *Manha* (08:00 - 12:00)\n2️⃣ *Tarde* (13:00 - 17:00)",
    });
    return;
  }

  const dataCompleta = `${session.data_agendada} - ${horario}`;

  await updateSession(phone, {
    step: "aguardando_confirmacao",
    data_agendada: dataCompleta,
  });

  const veiculo = session.veiculo_sugerido || "utilitario";
  const veiculoNome: Record<string, string> = {
    utilitario: "Utilitario (Strada/Saveiro)",
    hr: "HR",
    caminhao_bau: "Caminhao Bau",
    guincho: "Guincho",
    moto_guincho: "Guincho de Moto",
  };

  let detalhes = "";
  if (session.precisa_ajudante) detalhes += "🙋 Com ajudante\n";
  if (session.tem_escada && session.andar && session.andar > 0) detalhes += `🪜 ${session.andar}o andar (escada)\n`;

  await sendMessage({
    to: phone,
    message: MSG.resumoFrete(
      session.origem_endereco || "Origem",
      session.destino_endereco || "Destino",
      session.descricao_carga || "Material",
      dataCompleta,
      veiculoNome[veiculo] || "Utilitario",
      (session.valor_estimado || 0).toString(),
      detalhes
    ),
  });
}

// === CANCELAR FRETE (FRETISTA) ===

async function handleCancelarFrete(phone: string) {
  // Busca fretes ativos do fretista
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id")
    .eq("telefone", phone)
    .single();

  if (!prestador) {
    await sendMessage({ to: phone, message: "Voce nao tem cadastro de prestador na Pegue." });
    return;
  }

  const { data: corridas } = await supabase
    .from("corridas")
    .select("id, origem_endereco, destino_endereco, periodo, valor_prestador, status")
    .eq("prestador_id", prestador.id)
    .in("status", ["aceita", "paga", "em_andamento"])
    .order("criado_em", { ascending: true });

  if (!corridas || corridas.length === 0) {
    await sendMessage({ to: phone, message: "Voce nao tem fretes ativos pra cancelar. 😊" });
    return;
  }

  if (corridas.length === 1) {
    // So tem 1 frete - pergunta direto
    const c = corridas[0];
    await updateSession(phone, { step: "fretista_cancelar_confirma" as any, corrida_id: c.id });
    await sendMessage({
      to: phone,
      message: `⚠️ *Quer cancelar este frete?*\n\n📍 ${c.origem_endereco} → ${c.destino_endereco}\n📅 ${c.periodo}\n💰 R$ ${c.valor_prestador}\n\n⚠️ Cancelar afeta seu *score* na plataforma.\n\nConfirma? Responda *SIM* ou *NAO*`,
    });
    return;
  }

  // Multiplos fretes - lista pra escolher
  let lista = "📋 *Seus fretes ativos:*\n\n";
  corridas.forEach((c, i) => {
    lista += `${i + 1}️⃣ ${c.periodo} - ${c.origem_endereco} → ${c.destino_endereco} (R$ ${c.valor_prestador})\n`;
  });
  lista += "\nQual quer cancelar? Manda o *numero*";

  // Salva IDs no plano_escolhido pra referencia
  await updateSession(phone, {
    step: "fretista_cancelar_qual" as any,
    plano_escolhido: JSON.stringify(corridas.map(c => c.id)),
  });

  await sendMessage({ to: phone, message: lista });
}

async function handleCancelarQual(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session?.plano_escolhido) return;

  const ids: string[] = JSON.parse(session.plano_escolhido);
  const num = parseInt(message.trim());

  if (isNaN(num) || num < 1 || num > ids.length) {
    await sendMessage({ to: phone, message: `Manda um numero de 1 a ${ids.length}` });
    return;
  }

  const corridaId = ids[num - 1];

  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, origem_endereco, destino_endereco, periodo, valor_prestador")
    .eq("id", corridaId)
    .single();

  if (!corrida) return;

  await updateSession(phone, { step: "fretista_cancelar_confirma" as any, corrida_id: corridaId });
  await sendMessage({
    to: phone,
    message: `⚠️ *Quer cancelar este frete?*\n\n📍 ${corrida.origem_endereco} → ${corrida.destino_endereco}\n📅 ${corrida.periodo}\n💰 R$ ${corrida.valor_prestador}\n\n⚠️ Cancelar afeta seu *score* na plataforma.\n3 cancelamentos = conta inativa.\n\nConfirma? Responda *SIM* ou *NAO*`,
  });
}

async function handleCancelarConfirma(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session?.corrida_id) return;

  const lower = message.toLowerCase().trim();

  if (lower.startsWith("nao") || lower === "n" || lower.startsWith("não")) {
    await updateSession(phone, { step: "aguardando_servico" as any });
    await sendMessage({ to: phone, message: "Cancelamento anulado! ✅ Bom trabalho no frete! 🚚" });
    return;
  }

  if (!lower.startsWith("sim") && lower !== "s") {
    await sendMessage({ to: phone, message: "Responda *SIM* pra confirmar ou *NAO* pra manter o frete." });
    return;
  }

  const corridaId = session.corrida_id;

  // Busca dados da corrida
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, cliente_id, clientes(telefone), origem_endereco, destino_endereco, periodo, valor_prestador, status")
    .eq("id", corridaId)
    .single();

  // Penaliza fretista - score -2
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id, score, total_reclamacoes")
    .eq("telefone", phone)
    .single();

  if (prestador) {
    const novoScore = Math.max(0, (prestador.score || 5) - 2);
    const cancelamentos = (prestador.total_reclamacoes || 0) + 1;
    const desativar = cancelamentos >= 3;

    await supabase
      .from("prestadores")
      .update({
        score: novoScore,
        total_reclamacoes: cancelamentos,
        ...(desativar ? { disponivel: false } : {}),
      })
      .eq("id", prestador.id);

    if (desativar) {
      await sendMessage({
        to: phone,
        message: "⛔ *Sua conta esta INATIVA* por excesso de cancelamentos.\n\nPara reativar, envie justificativa com provas pelo WhatsApp.\nSua situacao sera analisada pela equipe.",
      });
    }
  }

  // Libera corrida pra re-dispatch
  await supabase
    .from("corridas")
    .update({ prestador_id: null, status: "pendente" })
    .eq("id", corridaId);

  await sendMessage({ to: phone, message: "Frete cancelado. ⚠️ Seu score foi penalizado (-2 pontos)." });

  // Avisa o cliente
  const clienteTel = (corrida?.clientes as any)?.telefone;
  if (clienteTel) {
    await sendMessage({
      to: clienteTel,
      message: "⚠️ Seu fretista teve um imprevisto e nao podera realizar o servico.\n\n*Ja estamos providenciando outro fretista de confianca!*\nVoce sera notificado assim que confirmarmos. 😊",
    });

    // Re-dispatch - busca novos fretistas (excluindo o que cancelou)
    const sessionCliente = await getSession(clienteTel);
    if (sessionCliente) {
      await reDispatchUrgente(corridaId, sessionCliente, clienteTel, phone);
    }
  }

  // Notifica admin
  await notificarAdmin(
    `⚠️ *FRETISTA CANCELOU*`,
    clienteTel || phone,
    `Fretista: ${formatarTelefoneExibicao(phone)}\nCorrida: ${corridaId}\n${corrida?.origem_endereco} → ${corrida?.destino_endereco}\n📅 ${corrida?.periodo}\nRe-dispatch em andamento`
  );

  await updateSession(phone, { step: "aguardando_servico" as any, corrida_id: null });
}

// === INDICAR AMIGO PRA FRETE ===

async function handleIndicarFrete(phone: string) {
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id")
    .eq("telefone", phone)
    .single();

  if (!prestador) {
    await sendMessage({ to: phone, message: "Voce nao tem cadastro de prestador na Pegue." });
    return;
  }

  const { data: corridas } = await supabase
    .from("corridas")
    .select("id, origem_endereco, destino_endereco, periodo, valor_prestador")
    .eq("prestador_id", prestador.id)
    .in("status", ["aceita", "paga"])
    .order("criado_em", { ascending: true });

  if (!corridas || corridas.length === 0) {
    await sendMessage({ to: phone, message: "Voce nao tem fretes ativos pra indicar. 😊" });
    return;
  }

  if (corridas.length === 1) {
    await updateSession(phone, { step: "fretista_indicar_telefone" as any, corrida_id: corridas[0].id });
    const c = corridas[0];
    await sendMessage({
      to: phone,
      message: `🤝 *Indicar amigo para este frete:*\n\n📍 ${c.origem_endereco} → ${c.destino_endereco}\n📅 ${c.periodo}\n💰 R$ ${c.valor_prestador}\n\nManda o *numero de WhatsApp* do parceiro (com DDD):`,
    });
    return;
  }

  let lista = "📋 *Qual frete quer indicar pra um amigo?*\n\n";
  corridas.forEach((c, i) => {
    lista += `${i + 1}️⃣ ${c.periodo} - ${c.origem_endereco} → ${c.destino_endereco} (R$ ${c.valor_prestador})\n`;
  });
  lista += "\nManda o *numero*";

  await updateSession(phone, {
    step: "fretista_indicar_qual" as any,
    plano_escolhido: JSON.stringify(corridas.map(c => c.id)),
  });

  await sendMessage({ to: phone, message: lista });
}

async function handleIndicarQual(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session?.plano_escolhido) return;

  const ids: string[] = JSON.parse(session.plano_escolhido);
  const num = parseInt(message.trim());

  if (isNaN(num) || num < 1 || num > ids.length) {
    await sendMessage({ to: phone, message: `Manda um numero de 1 a ${ids.length}` });
    return;
  }

  const corridaId = ids[num - 1];
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, origem_endereco, destino_endereco, periodo, valor_prestador")
    .eq("id", corridaId)
    .single();

  if (!corrida) return;

  await updateSession(phone, { step: "fretista_indicar_telefone" as any, corrida_id: corridaId });
  await sendMessage({
    to: phone,
    message: `🤝 *Indicar amigo para:*\n\n📍 ${corrida.origem_endereco} → ${corrida.destino_endereco}\n📅 ${corrida.periodo}\n\nManda o *numero de WhatsApp* do parceiro (com DDD):`,
  });
}

async function handleIndicarTelefone(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session?.corrida_id) return;

  // Limpa telefone
  const tel = message.replace(/\D/g, "");
  const telFormatado = tel.startsWith("55") ? tel : `55${tel}`;

  if (tel.length < 10) {
    await sendMessage({ to: phone, message: "Numero invalido. Manda com DDD (ex: 11 95555-1234)" });
    return;
  }

  // Verifica se o amigo tem cadastro aprovado
  const { data: amigo } = await supabase
    .from("prestadores")
    .select("id, nome, telefone, status")
    .eq("telefone", telFormatado)
    .single();

  if (!amigo) {
    await sendMessage({
      to: phone,
      message: `Esse numero nao esta cadastrado na Pegue. 😔\n\nPede pro seu amigo se cadastrar mandando *Parcerias Pegue* pro nosso WhatsApp!`,
    });
    await updateSession(phone, { step: "aguardando_servico" as any });
    return;
  }

  if (amigo.status !== "aprovado") {
    await sendMessage({ to: phone, message: "Esse parceiro ainda nao foi aprovado no sistema. Assim que for aprovado, podera receber indicacoes." });
    await updateSession(phone, { step: "aguardando_servico" as any });
    return;
  }

  // Busca dados da corrida
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, origem_endereco, destino_endereco, periodo, valor_prestador, descricao_carga")
    .eq("id", session.corrida_id)
    .single();

  if (!corrida) return;

  // Envia convite pro amigo
  await sendMessage({
    to: amigo.telefone,
    message: `🤝 *Indicacao de parceiro!*\n\nUm parceiro Pegue esta te indicando pra um frete:\n\n📍 ${corrida.origem_endereco} → ${corrida.destino_endereco}\n📦 ${corrida.descricao_carga || "Material"}\n📅 ${corrida.periodo}\n💰 Voce recebe: R$ ${corrida.valor_prestador}\n\nQuer *PEGAR* esse frete? Responda *PEGAR*`,
  });

  // Transfere o frete pro amigo (o antigo fretista sai)
  await supabase
    .from("corridas")
    .update({ prestador_id: amigo.id })
    .eq("id", session.corrida_id);

  await sendMessage({
    to: phone,
    message: `Frete transferido pra *${amigo.nome}*! ✅\nEle ja foi notificado. Obrigado pela indicacao! 🤝`,
  });

  // Notifica admin
  await notificarAdmin(
    `🤝 *FRETE INDICADO*`,
    phone,
    `De: ${formatarTelefoneExibicao(phone)}\nPara: ${amigo.nome} (${formatarTelefoneExibicao(amigo.telefone)})\nCorrida: ${session.corrida_id}`
  );

  await updateSession(phone, { step: "aguardando_servico" as any, corrida_id: null });
}

// === RE-DISPATCH URGENTE (PRIORIDADE IMEDIATA) ===

async function reDispatchUrgente(corridaId: string, session: BotSession, clientePhone: string, excluirPhone?: string) {
  try {
    const { data: prestadores } = await supabase
      .from("prestadores")
      .select("telefone, nome")
      .eq("disponivel", true)
      .eq("status", "aprovado");

    if (!prestadores || prestadores.length === 0) {
      await sendMessage({ to: clientePhone, message: MSG.nenhumFretista });
      await notificarAdmin(
        `🚨 *URGENTE: NENHUM FRETISTA PRA RE-DISPATCH*`,
        clientePhone,
        `Corrida: ${corridaId}\nOrigem: ${session.origem_endereco}\nDestino: ${session.destino_endereco}\nValor: R$ ${session.valor_estimado}`
      );
      return;
    }

    // Exclui o fretista que cancelou/sumiu
    const telefones = prestadores
      .map(p => p.telefone)
      .filter(t => t !== excluirPhone);

    if (telefones.length === 0) {
      await sendMessage({ to: clientePhone, message: MSG.nenhumFretista });
      await notificarAdmin(`🚨 *SEM FRETISTAS DISPONIVEIS PRA RE-DISPATCH*`, clientePhone, `Corrida: ${corridaId}`);
      return;
    }

    createDispatch(corridaId, clientePhone, telefones);

    const valorPrestador = Math.round((session.valor_estimado || 0) * 0.88);

    const mensagem = `🚨 *PRIORIDADE IMEDIATA*\n⚡ Servico URGENTE!\n\n📍 Origem: ${session.origem_endereco || "SP"}\n🏠 Destino: ${session.destino_endereco || "Destino"}\n📦 ${session.descricao_carga || "Material"}\n📅 ${session.data_agendada || "AGORA"}\n💰 Voce recebe: R$ ${valorPrestador}\n\n━━━━━━━━━━━━━━━━\n1️⃣ ✅ *PEGAR* - Posso ir AGORA!\n2️⃣ 🙏 *EM ATENDIMENTO* - Estou ocupado`;

    await sendMessageToMany(telefones, mensagem);

    // Timeout: se ninguem aceitar em 5min, notifica admin
    setTimeout(async () => {
      const vencedor = resolveDispatch(corridaId);
      if (vencedor) {
        await notificarResultadoDispatch(corridaId, vencedor, clientePhone);
      } else {
        finalizeDispatch(corridaId);
        await notificarAdmin(
          `🚨 *URGENTE: NINGUEM ACEITOU RE-DISPATCH*`,
          clientePhone,
          `Corrida: ${corridaId}\nNenhum fretista aceitou o frete urgente.\nCliente aguardando. Intervencao necessaria.`
        );
      }
    }, 300000); // 5 min
  } catch (error: any) {
    console.error("Erro re-dispatch:", error?.message);
    await notificarAdmin(`🚨 *ERRO NO RE-DISPATCH*`, clientePhone, `Corrida: ${corridaId}\nErro: ${error?.message}`);
  }
}

// === LEMBRETE PROGRESSIVO (2h/1h/40min) ===
// Nota: Este sistema funciona via API /api/enviar-lembrete que pode ser chamada
// por um cron job externo. Os lembretes sao agendados quando o frete e confirmado.

async function agendarLembretes(corridaId: string, fretistaTel: string, clienteTel: string, dataAgendada: string) {
  // Salva na corrida que lembretes foram agendados
  await supabase
    .from("corridas")
    .update({ urgencia: "lembrete_agendado" })
    .eq("id", corridaId);

  // Os lembretes serao disparados pela API /api/enviar-lembrete via cron
  // Aqui so registramos no log pra rastreabilidade
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "lembrete_agendado",
      corrida_id: corridaId,
      fretista: fretistaTel,
      cliente: clienteTel,
      data: dataAgendada,
    },
  });
}

// === GUINCHO HANDLERS ===

const GUINCHO_CATEGORIAS: Record<string, string> = {
  "1": "Guincho Imediato",
  "2": "Guincho Agendado",
};

// Precos por tipo de veiculo (guincho e ponto A ao ponto B, sem variar por motivo)
const GUINCHO_PRECOS_VEICULO: Record<string, { base: number; porKm: number }> = {
  moto: { base: 150, porKm: 5 },
  carro_comum: { base: 200, porKm: 5 },
  caminhonete_suv: { base: 280, porKm: 7 },
  veiculo_grande: { base: 350, porKm: 8 },
};

const TIPO_VEICULO_GUINCHO: Record<string, string> = {
  "1": "carro_comum",
  "2": "caminhonete_suv",
  "3": "veiculo_grande",
  "4": "moto",
};

const TIPO_VEICULO_NOME: Record<string, string> = {
  carro_comum: "Hatch/Sedan",
  caminhonete_suv: "SUV/Caminhonete",
  veiculo_grande: "Van/Caminhao",
  moto: "Moto",
};

async function handleGuinchoCategoria(phone: string, message: string) {
  const lower = message.trim();

  const categoria = GUINCHO_CATEGORIAS[lower];
  if (!categoria) {
    await sendMessage({
      to: phone,
      message: "Escolha uma opcao! 😊\n\n1️⃣ *Guincho Imediato* (preciso AGORA)\n2️⃣ *Guincho Agendado* (escolher data e horario)",
    });
    return;
  }

  await updateSession(phone, {
    step: "guincho_tipo_veiculo" as any,
    descricao_carga: `Guincho: ${categoria}`,
    plano_escolhido: lower, // 1=imediato, 2=agendado
  });
  await sendMessage({
    to: phone,
    message: `Qual o tipo do seu veiculo?

1️⃣ *Hatch / Sedan* (Gol, Onix, Corolla, Strada, Fiorino, Saveiro...)
2️⃣ *SUV / Caminhonete* (Hilux, S10, Ranger, Tracker, HR, Bongo...)
3️⃣ *Van / Caminhao* (Sprinter, Master, Caminhao medio...)
4️⃣ *Moto*

Manda o numero!`,
  });
}

async function handleGuinchoTipoVeiculo(phone: string, message: string) {
  const lower = message.trim();
  const tipoVeiculo = TIPO_VEICULO_GUINCHO[lower];

  if (!tipoVeiculo) {
    await sendMessage({
      to: phone,
      message: "Escolha de 1 a 4:\n\n1️⃣ *Hatch/Sedan* (Gol, Onix, Strada, Fiorino...)\n2️⃣ *SUV/Caminhonete* (Hilux, S10, HR, Bongo...)\n3️⃣ *Van/Caminhao* (Sprinter, Master...)\n4️⃣ *Moto*",
    });
    return;
  }

  const session = await getSession(phone);
  const categoria = session?.descricao_carga || "Guincho";
  const nomeVeiculo = TIPO_VEICULO_NOME[tipoVeiculo];

  await updateSession(phone, {
    step: "guincho_marca_modelo" as any,
    descricao_carga: `${categoria} - ${nomeVeiculo}`,
    veiculo_sugerido: tipoVeiculo === "moto" ? "moto_guincho" : "guincho",
  });

  await sendMessage({
    to: phone,
    message: `Qual a *marca, modelo e ano* do veiculo?\n\nExemplo: *Fiat Uno 2018* ou *Honda CG 160 2022*`,
  });
}

async function handleGuinchoMarcaModelo(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const texto = message.trim();

  if (texto.length < 3) {
    await sendMessage({
      to: phone,
      message: "Informe a *marca, modelo e ano* do veiculo 😊\n\nExemplo: *Fiat Uno 2018* ou *Honda CG 160 2022*",
    });
    return;
  }

  // Adiciona info do veiculo na descricao
  const descAtual = session.descricao_carga || "Guincho";
  await updateSession(phone, {
    step: "guincho_localizacao" as any,
    descricao_carga: `${descAtual} | ${texto}`,
  });

  await sendMessage({ to: phone, message: MSG.guinchoPedirLocalizacao(texto) });
}

async function handleGuinchoLocalizacao(
  phone: string, message: string, lat: number | null, lng: number | null
) {
  let endereco = "";
  let latitude = lat;
  let longitude = lng;

  // Tenta GPS primeiro
  if (lat && lng) {
    const geo = await reverseGeocode(lat, lng);
    endereco = geo || `${lat},${lng}`;
  } else {
    // Tenta CEP
    const cep = extrairCep(message);
    if (cep) {
      const endCep = await buscaCep(cep);
      if (endCep) {
        endereco = endCep;
        const coords = await geocodeAddress(endCep);
        latitude = coords?.lat || null;
        longitude = coords?.lng || null;
      }
    }
    // Tenta endereco
    if (!endereco && pareceEndereco(message)) {
      const coords = await geocodeAddress(message);
      if (coords) {
        endereco = message.trim();
        latitude = coords.lat;
        longitude = coords.lng;
      }
    }
  }

  if (!endereco) {
    await sendMessage({
      to: phone,
      message: "Nao consegui achar esse endereco 😅\n\nManda sua *localizacao pelo clipe* 📎 ou digite o *CEP* ou *endereco completo* (rua + bairro)",
    });
    return;
  }

  await updateSession(phone, {
    step: "guincho_destino" as any,
    origem_endereco: endereco,
    origem_lat: latitude,
    origem_lng: longitude,
  });

  await sendMessage({ to: phone, message: MSG.guinchoPedirDestino });
}

async function handleGuinchoDestino(phone: string, message: string) {
  const lower = message.toLowerCase().trim();
  const session = await getSession(phone);
  if (!session) return;

  let destino = "";
  let destLat: number | null = null;
  let destLng: number | null = null;

  // Tenta CEP
  const cep = extrairCep(message);
  if (cep) {
    const endCep = await buscaCep(cep);
    if (endCep) {
      destino = endCep;
      const coords = await geocodeAddress(endCep);
      destLat = coords?.lat || null;
      destLng = coords?.lng || null;
    }
  }
  // Tenta endereco
  if (!destino && pareceEndereco(message)) {
    const coords = await geocodeAddress(message);
    if (coords) {
      destino = message.trim();
      destLat = coords.lat;
      destLng = coords.lng;
    }
  }
  // Aceita texto livre
  if (!destino) {
    destino = message.trim();
  }

  // Calcular preco baseado na categoria
  const categoriaNum = session.plano_escolhido || "1";
  let distKm = 0;

  // Se tem coordenadas dos dois pontos, calcula distancia
  if (session.origem_lat && session.origem_lng && destLat && destLng) {
    distKm = calcularDistanciaKm(session.origem_lat, session.origem_lng, destLat, destLng);
  }

  // Detecta tipo de veiculo da descricao
  const descCarga = session.descricao_carga || "";
  let tipoVeic = "carro_comum"; // padrao
  if (descCarga.includes("Moto")) tipoVeic = "moto";
  else if (descCarga.includes("Caminhonete") || descCarga.includes("SUV")) tipoVeic = "caminhonete_suv";
  else if (descCarga.includes("Veiculo grande")) tipoVeic = "veiculo_grande";

  // Preco: base + porKm/km apos 5km
  const precoInfo = GUINCHO_PRECOS_VEICULO[tipoVeic] || { base: 200, porKm: 5 };
  const kmExtra = Math.max(0, distKm - 5);
  let valorTotal = Math.round(precoInfo.base + kmExtra * precoInfo.porKm);

  // Taxa noturna: +30% entre 22h e 6h
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hora = agora.getHours();
  const diaSemana = agora.getDay(); // 0=domingo, 6=sabado
  const isNoturno = hora >= 22 || hora < 6;
  const isFimDeSemana = diaSemana === 0 || diaSemana === 6;

  // Feriados nacionais fixos (mes-dia)
  const feriados = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];
  const mesdia = `${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  const isFeriado = feriados.includes(mesdia);

  let taxaExtra = "";
  if (isNoturno) {
    valorTotal = Math.round(valorTotal * 1.3);
    taxaExtra = "noturno";
  }
  if (isFeriado) {
    valorTotal = Math.round(valorTotal * (isNoturno ? 1 : 1.3)); // nao acumula, aplica 30% se ainda nao aplicou
    taxaExtra = taxaExtra ? "noturno + feriado" : "feriado";
  }
  if (isFimDeSemana && !isFeriado && !isNoturno) {
    valorTotal = Math.round(valorTotal * 1.2); // fim de semana: +20%
    taxaExtra = "fim de semana";
  }

  const categoria = GUINCHO_CATEGORIAS[categoriaNum] || "Guincho";

  // Guincho Imediato pula direto pra confirmacao
  if (categoriaNum === "1") {
    await updateSession(phone, {
      step: "aguardando_confirmacao",
      destino_endereco: destino,
      destino_lat: destLat,
      destino_lng: destLng,
      distancia_km: distKm || null,
      valor_estimado: valorTotal,
      data_agendada: "AGORA - Urgente",
    });

    const nomeVeic = TIPO_VEICULO_NOME[tipoVeic] || "Veiculo";

    await sendMessage({
      to: phone,
      message: `🚨 *GUINCHO IMEDIATO*

📍 *Coleta:* ${session.origem_endereco || ""}
🏠 *Destino:* ${destino}
🚗 *Veiculo:* ${nomeVeic}
📅 *AGORA - Saida imediata*
${taxaExtra ? `🌙 *Taxa ${taxaExtra} aplicada*\n` : ""}
✅ *Total: R$ ${valorTotal}*

Ta tudo certo? Posso confirmar? 😊
Responda *SIM* pra confirmar ou *NAO* pra ajustar algo.`,
    });
  } else {
    await updateSession(phone, {
      step: "aguardando_data",
      destino_endereco: destino,
      destino_lat: destLat,
      destino_lng: destLng,
      distancia_km: distKm || null,
      valor_estimado: valorTotal,
    });

    await sendMessage({
      to: phone,
      message: MSG.guinchoOrcamento(categoria, session.origem_endereco || "", destino, valorTotal.toString(), taxaExtra),
    });
  }
}

// === EXTRAIR DATA E HORARIO ===

function extrairHorario(texto: string): string | null {
  // Palavras: manha, tarde
  if (texto.includes("manha") || texto.includes("manhã")) return "Manha (08:00 - 12:00)";
  if (texto.includes("tarde")) return "Tarde (13:00 - 17:00)";

  // Formato: 14:30, 14h30, 14hs30
  const matchHM1 = texto.match(/(\d{1,2})\s*[h:]\s*(\d{1,2})/);
  if (matchHM1) {
    const h = parseInt(matchHM1[1]);
    const m = parseInt(matchHM1[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  // Formato: 15h, 15hs, 15 horas, 15 hs, 15hora
  const matchH = texto.match(/(\d{1,2})\s*(?:h|hs|hrs|horas|hora)/);
  if (matchH) {
    const h = parseInt(matchH[1]);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:00`;
    }
  }

  // Formato: "as 15", "às 15"
  const matchAs = texto.match(/[aà]s?\s+(\d{1,2})(?!\s*[\/\-])/);
  if (matchAs) {
    const h = parseInt(matchAs[1]);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:00`;
    }
  }

  // So numero solto (15, 9) - apenas se NAO tem data na mensagem
  const temData = /\d{1,2}[\/\-]\d{1,2}|amanh|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo|hoje/i.test(texto);
  if (!temData) {
    const matchNum = texto.match(/^(\d{1,2})$/);
    if (matchNum) {
      const h = parseInt(matchNum[1]);
      if (h >= 6 && h <= 23) {
        return `${String(h).padStart(2, "0")}:00`;
      }
    }
  }

  return null;
}

function extrairData(texto: string): string | null {
  // Formato: 25/04, 25/4, 25-04
  const matchData = texto.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (matchData) {
    const dia = String(parseInt(matchData[1])).padStart(2, "0");
    const mes = String(parseInt(matchData[2])).padStart(2, "0");
    return `${dia}/${mes}`;
  }

  // Palavras
  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

  if (texto.includes("hoje")) {
    return `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  }
  if (texto.includes("amanh")) {
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    return `${String(amanha.getDate()).padStart(2, "0")}/${String(amanha.getMonth() + 1).padStart(2, "0")}`;
  }

  const diasSemana: Record<string, number> = {
    domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3,
    quinta: 4, sexta: 5, sabado: 6, sábado: 6,
  };

  for (const [nome, numDia] of Object.entries(diasSemana)) {
    if (texto.includes(nome)) {
      const diff = (numDia - hoje.getDay() + 7) % 7 || 7;
      const data = new Date(hoje);
      data.setDate(data.getDate() + diff);
      return `${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}`;
    }
  }

  return null;
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
