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

*Para parceiros:*
✅ *PEGAR* → aceitar um frete
✅ *meu painel* → ver seus dados e ranking
✅ *meus gastos* → ver resumo financeiro do mes
✅ *despesa [valor] [descricao]* → registrar gasto
   Ex: *despesa 50 combustivel*
⏸️ *modo ferias* → parar de receber indicacoes
▶️ *voltei* → voltar a receber indicacoes

*Para se cadastrar como parceiro:*
🤝 *Parcerias Pegue* → iniciar cadastro

*Precisa de ajuda?*
📱 Fale com nosso especialista Santos:
(11) 97142-9605`,
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
    await sendMessage({ to: phone, message: MSG.guincho });
    return;
  }

  if (lower === "4" || lower.includes("santos") || lower.includes("especialista")) {
    await handleAtendente(phone);
    return;
  }

  await sendMessage({
    to: phone,
    message: "Escolhe uma opcao, por favor! 😊\n\n1️⃣ Pequenos Fretes\n2️⃣ Mudanca completa\n3️⃣ Guincho (carro ou moto)\n4️⃣ Falar com nosso especialista Santos",
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
  const precos = calcularPrecos(distanciaKm, veiculo, qtdAjudantes > 0, session.andar || 0, false);

  // Adiciona segundo ajudante se necessario
  const ajudanteExtra = qtdAjudantes === 2 ? (distanciaKm <= 10 ? 80 : 100) : 0;
  const p = {
    ...precos.padrao,
    total: precos.padrao.total + ajudanteExtra,
  };

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
      await updateSession(phone, { step: "aguardando_fretista", corrida_id: corridaId });

      // Informa que esta reservando a agenda
      await sendMessage({ to: phone, message: MSG.freteRecebido });

      // Envia orientacoes e protocolos ao cliente
      await sendMessage({ to: phone, message: MSG.orientacoesCliente });

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

async function dispararParaFretistas(corridaId: string, session: BotSession, clientePhone: string) {
  try {
    const { data: prestadores } = await supabase
      .from("prestadores")
      .select("telefone, nome")
      .eq("disponivel", true)
      .eq("status", "aprovado");

    if (!prestadores || prestadores.length === 0) {
      // Nenhum fretista disponivel - notifica cliente
      await sendMessage({ to: clientePhone, message: MSG.nenhumFretista });
      return;
    }

    const telefones = prestadores.map((p) => p.telefone);
    const valorPrestador = Math.round((session.valor_estimado || 0) * 0.88);

    createDispatch(corridaId, clientePhone, telefones);

    // Info ajudante
    let ajudanteInfo = "*Sem ajudante*";
    if (session.precisa_ajudante) {
      // Verifica se tem 2 ajudantes pelo valor (se valor > base + 1 ajudante)
      ajudanteInfo = "*Com ajudante*";
    }

    const mensagem = MSG.novoFreteDisponivel(
      session.origem_endereco || "SP",
      session.destino_endereco || "Destino",
      session.descricao_carga || "Material",
      session.data_agendada || "A combinar",
      valorPrestador.toString(),
      corridaId,
      ajudanteInfo
    );

    await sendMessageToMany(telefones, mensagem);

    // Apos 31s, se ninguem aceitou, notifica cliente
    setTimeout(async () => {
      const vencedor = resolveDispatch(corridaId);
      if (vencedor) {
        await notificarResultadoDispatch(corridaId, vencedor, clientePhone);
      } else {
        // Ninguem aceitou na janela - espera mais respostas
        // Se ninguem aceitar em 5 min, notifica Santos
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
  await updateSession(phone, { step: "cadastro_tipo_veiculo", periodo: message.toUpperCase() });
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
  } else if (lower === "3" || lower.includes("hr")) {
    tipoVeiculo = "hr";
  } else if (lower === "4" || lower.includes("caminhao") || lower.includes("bau")) {
    tipoVeiculo = "caminhao_bau";
  } else {
    await sendMessage({ to: phone, message: "Escolhe o tipo do veiculo:\n\n1️⃣ Carro comum\n2️⃣ Utilitario\n3️⃣ HR\n4️⃣ Caminhao Bau" });
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
      message: "Para prosseguir, digite exatamente: *eu concordo*\n\nOu se tiver duvidas, fale com nosso especialista Santos:\n📱 (11) 97142-9605",
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

    await sendMessage({ to: phone, message: MSG.cadastroConcluido });

    // Notifica Santos
    await sendMessage({
      to: FABIO_PHONE,
      message: `🆕 *Novo prestador pra aprovar!*\n\n👤 ${nome}\n📱 ${formatarTelefoneExibicao(phone)}\n🚗 ${tipoVeiculo}\n🪪 Placa: ${placa}\n\nAcesse o painel pra aprovar!`,
    });
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
      .update({ status: "concluida", entrega_em: new Date().toISOString() })
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
      }
    }

    const { data: corrida } = await supabase
      .from("corridas")
      .select("prestador_id, prestadores(telefone)")
      .eq("id", session.corrida_id)
      .single();

    if (corrida?.prestadores) {
      const fretistaTel = (corrida.prestadores as any).telefone;
      await sendMessage({ to: fretistaTel, message: MSG.fretistaPagamentoLiberado });
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

    await sendMessage({
      to: FABIO_PHONE,
      message: `⚠️ *Problema na entrega!*\n\nCliente: ${formatarTelefoneExibicao(phone)}\nCorrida: ${session.corrida_id}\n\nVerifique e resolva!`,
    });

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
    } else {
      // Entrega concluída - notifica fretista e pede confirmação do cliente
      await updateSession(phone, { step: "concluido" });
      await sendMessage({ to: phone, message: MSG.fretistaEntregaConfirmada });

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
          // Muda sessão do cliente pra aguardar confirmação
          await updateSession(clienteTel, { step: "aguardando_confirmacao_entrega" });
          await sendMessage({
            to: clienteTel,
            message: MSG.clienteConfirmarEntrega(corrida.descricao_carga || "seus materiais"),
          });
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

  // Aceita SOMENTE "pegar"
  if (lower !== "pegar") {
    await sendMessage({
      to: prestadorPhone,
      message: "Pra aceitar o frete, responda exatamente *PEGAR*\n\n⚠️ Respostas automaticas nao sao aceitas. Voce precisa digitar manualmente.",
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
