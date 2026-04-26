import { NextRequest, NextResponse } from "next/server";
import { sendMessage, sendToClient, sendToClients, sendImageToClient, invalidateInstanceCache, setInstanceCache } from "@/lib/chatpro";
import {
  type BotSession,
  getSession,
  createSession,
  updateSession,
  getDispatchForPrestador,
  getDispatchByCorridaId,
  tryAceitarDispatch,
  createDispatch,
  finalizeDispatch,
  agendarTarefa,
  cancelarTarefas,
  verificarRateLimit,
  pareceMensagemDeBotExterno,
} from "@/lib/bot-sessions";
import { MSG } from "@/lib/bot-messages";
import {
  reverseGeocode,
  reverseGeocodeBairroCidade,
  inputContemRua,
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
  isInicioServico,
  ehRespostaAutomatica,
  precisaDesmontar,
  isPalavraReservadaEndereco,
  extrairData,
  extrairHorario,
  sugerirVeiculoPorVolumePeso,
  parseDimensoes,
  calcularVolumeM3,
  contarItensTexto,
} from "@/lib/bot-utils";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { uploadFotoPrestador } from "@/lib/storage-prestadores";
import { gerarSimulacao, formatarMensagemSimulacao, nomeVeiculo as nomeVeiculoAval, type SimulacaoAvaliacao } from "@/lib/simulacao-avaliacao";
import { criteriosMediaDaSimulacao, invalidarCacheAjustes } from "@/lib/ajustes-precos";
import { isAdminPhone } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";
import { extrairContextoInicial, formatarConfirmacaoContexto, type ContextoExtraido } from "@/lib/extrair-contexto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1) Valida secret do webhook (ChatPro configura ?secret=X na URL do webhook)
    // Fail-OPEN se WEBHOOK_WHATSAPP_SECRET nao estiver configurado (compat transitoria),
    // mas registra warning. Configurar env var = passa a ser fail-CLOSED automaticamente.
    const expectedSecret = process.env.WEBHOOK_WHATSAPP_SECRET;
    if (expectedSecret) {
      const providedSecret =
        req.nextUrl.searchParams.get("secret") ||
        req.headers.get("authorization")?.replace("Bearer ", "") ||
        "";
      if (providedSecret !== expectedSecret) {
        console.error("Webhook WhatsApp: secret invalido ou ausente");
        return NextResponse.json({ error: "acesso negado" }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === "production") {
      console.warn("[SEGURANCA] WEBHOOK_WHATSAPP_SECRET nao configurado em producao");
    }

    const rawBody = await req.json();

    // Detecta qual instancia recebeu a mensagem (via query param ?instance=2)
    const instanceParam = req.nextUrl.searchParams.get("instance");
    const instance: 1 | 2 = instanceParam === "2" ? 2 : 1;

    const eventType = rawBody.Type || rawBody.type || "";
    const rawFrom = rawBody.Body?.Info?.RemoteJid || rawBody.Info?.RemoteJid || "";
    const fromMasked = rawFrom.replace(/\d(?=\d{4})/g, "*");

    // Log minimo no Supabase (sem rawBody completo por LGPD).
    // Armazena so: instancia, tipo de evento, remetente mascarado, tamanho da msg.
    await supabase.from("bot_logs").insert({
      payload: {
        _instance: instance,
        event_type: eventType,
        from_masked: fromMasked,
        msg_length: (rawBody.Body?.Text || "").length,
      },
    });

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

    const phoneNumber = from.replace("@s.whatsapp.net", "");

    // ========================================================
    // ANTI-LOOP (proteção contra bot trocando mensagem com bot)
    // ========================================================
    // 1) Filtro de mensagens claramente automáticas (qualquer phone)
    //    Ex: bot da Positron respondeu o menu do Pegue com próprio menu.
    if (ehRespostaAutomatica(message) || pareceMensagemDeBotExterno(message)) {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "ignorado_bot_externo",
          phone_masked: phoneNumber.replace(/\d(?=\d{4})/g, "*"),
          amostra: (message || "").slice(0, 80),
        },
      });
      return NextResponse.json({ status: "ignored_auto_reply" });
    }

    // 2) Rate limit: mais de 6 msgs em 60s => silencia por 30min.
    //    Cobre phones próprios da Pegue e blocklist permanente também.
    const rl = await verificarRateLimit(phoneNumber);
    if (!rl.permitido) {
      if (rl.silenciar) {
        // Silenciou agora. Notifica admins UMA UNICA VEZ pro caso de ser real.
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "phone_silenciado",
            phone_masked: phoneNumber.replace(/\d(?=\d{4})/g, "*"),
            motivo: rl.motivo,
          },
        });
        await notificarAdmins(
          `🔇 *PHONE SILENCIADO POR LOOP/FLOOD*`,
          phoneNumber,
          `Motivo: ${rl.motivo}\nSilenciado por 30 min.\nSe for cliente real, remover em /admin/phones-bloqueados ou chamar no WhatsApp e reativar sessao.`
        );
      }
      return NextResponse.json({ status: "rate_limited", motivo: rl.motivo });
    }

    // Pre-popula cache de instance pra este phone: garante que sendToClient responda
    // pela mesma instancia que recebeu a mensagem, mesmo antes da session existir no DB
    setInstanceCache(phoneNumber, instance);

    // ========================================================
    // MODO MANUTENCAO (toggle /admin/controle)
    // Bloqueia atendimento novo quando ATIVO. Admins continuam
    // passando (Fabio/Jack precisam testar correcoes sem reabrir
    // publicamente). Resposta amigavel pro cliente.
    // ========================================================
    {
      const { data: cfgManutencao } = await supabase
        .from("configuracoes")
        .select("valor")
        .eq("chave", "modo_manutencao")
        .single();

      if (cfgManutencao?.valor === "habilitado" && !isAdminPhone(phoneNumber)) {
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "bloqueado_modo_manutencao",
            phone_masked: phoneNumber.replace(/\d(?=\d{4})/g, "*"),
          },
        });
        await sendToClient({
          to: phoneNumber,
          message: "🛠️ *Estamos em manutencao!*\n\nVoltamos em alguns minutos com tudo melhor pra te atender. Por favor, tenta de novo daqui a pouco. Obrigado pela paciencia! 💛",
        });
        return NextResponse.json({ status: "modo_manutencao" });
      }
    }

    // Foto - processa de acordo com o step
    if (hasMedia && imageUrl) {
      const session = await getSession(phoneNumber);

      // Cadastro prestador - selfie com documento
      if (session && session.step === "cadastro_selfie") {
        // Sobe foto pro Storage permanente (URL do ChatPro expira ~30d)
        const urlPermanente = await uploadFotoPrestador(imageUrl, phoneNumber, "selfie");
        const urlFinal = urlPermanente || imageUrl; // fallback pra URL temporaria se upload falhar
        await updateSession(phoneNumber, { step: "cadastro_foto_documento", foto_url: urlFinal });
        await supabase.from("bot_logs").insert({
          payload: { tipo: "foto_cadastro_selfie", phone: phoneNumber, url: urlFinal, uploaded_to_storage: !!urlPermanente },
        });
        await sendToClient({ to: phoneNumber, message: `Selfie recebida! ✅\n\n${MSG.cadastroFotoDocumento}` });
        return NextResponse.json({ status: "ok" });
      }

      // Cadastro prestador - foto do documento aberto (RG/CNH sozinho)
      if (session && session.step === "cadastro_foto_documento") {
        const urlPermanente = await uploadFotoPrestador(imageUrl, phoneNumber, "documento");
        const urlFinal = urlPermanente || imageUrl;
        await updateSession(phoneNumber, { step: "cadastro_foto_placa" });
        await supabase.from("bot_logs").insert({
          payload: { tipo: "foto_cadastro_documento", phone: phoneNumber, url: urlFinal, uploaded_to_storage: !!urlPermanente },
        });
        await sendToClient({ to: phoneNumber, message: `Documento recebido! ✅\n\n${MSG.cadastroFotoPlaca}` });
        return NextResponse.json({ status: "ok" });
      }

      // Cadastro prestador - foto da placa
      if (session && session.step === "cadastro_foto_placa") {
        const urlPermanente = await uploadFotoPrestador(imageUrl, phoneNumber, "placa");
        const urlFinal = urlPermanente || imageUrl;
        await updateSession(phoneNumber, { step: "cadastro_foto_veiculo" });
        await supabase.from("bot_logs").insert({
          payload: { tipo: "foto_cadastro_placa", phone: phoneNumber, url: urlFinal, uploaded_to_storage: !!urlPermanente },
        });
        await sendToClient({ to: phoneNumber, message: `Foto da placa recebida! ✅\n\n${MSG.cadastroFotoVeiculo}` });
        return NextResponse.json({ status: "ok" });
      }

      // Cadastro prestador - foto do veiculo inteiro
      if (session && session.step === "cadastro_foto_veiculo") {
        const urlPermanente = await uploadFotoPrestador(imageUrl, phoneNumber, "veiculo");
        const urlFinal = urlPermanente || imageUrl;
        await updateSession(phoneNumber, { step: "cadastro_placa" });
        await supabase.from("bot_logs").insert({
          payload: { tipo: "foto_cadastro_veiculo", phone: phoneNumber, url: urlFinal, uploaded_to_storage: !!urlPermanente },
        });
        await sendToClient({ to: phoneNumber, message: `Foto do veiculo recebida! ✅\n\nAgora me passa a *placa* do veiculo por texto` });
        return NextResponse.json({ status: "ok" });
      }

      // Fotos coleta/entrega do fretista
      if (session && (session.step === "fretista_coleta_fotos" || session.step === "fretista_entrega_fotos")) {
        // Conta fotos (usa descricao_carga como contador temporario)
        const contadorAtual = parseInt(session.descricao_carga || "0") || 0;
        const novoContador = contadorAtual + 1;
        await updateSession(phoneNumber, { descricao_carga: novoContador.toString() });
        // TODO: salvar foto no storage vinculada a corrida
        await sendToClient({ to: phoneNumber, message: MSG.fretistaFotoRecebida(novoContador) });
        return NextResponse.json({ status: "ok" });
      }

      // Foto no guincho - Cotacao Express
      if (session && session.step === "guincho_categoria") {
        const primeiroNome = pushName ? pushName.split(" ")[0] : "voce";
        await sendToClient({
          to: phoneNumber,
          message: `📸 *Cotacao Express!* Analisando seu veiculo... 🔍`,
        });

        // IA identifica o veiculo pela foto
        const analiseVeiculo = await analisarFotoGuincho(imageUrl);
        const marcaModelo = analiseVeiculo || "Veiculo (identificado por foto)";
        const categoriaDetectada = detectarCategoriaVeiculo(marcaModelo);

        await updateSession(phoneNumber, {
          step: "guincho_categoria" as any,
          descricao_carga: `Guincho - ${categoriaDetectada.nome} | ${marcaModelo}`,
          veiculo_sugerido: categoriaDetectada.tipo === "moto" ? "moto_guincho" : "guincho",
          foto_url: imageUrl,
        });

        await sendToClient({
          to: phoneNumber,
          message: `✅ *${marcaModelo}* identificado!\n\nVoce precisa do guincho pra quando?\n\n1️⃣ *Guincho Imediato* (preciso AGORA)\n2️⃣ *Guincho Agendado* (escolher dia e horario)`,
        });
        return NextResponse.json({ status: "ok" });
      }

      // Foto sem sessao - inicia atendimento direto pela foto
      if (!session || session.step === "aguardando_servico" || session.step === "concluido" || session.step === "inicio") {
        await createSession(phoneNumber, instance);
        invalidateInstanceCache(phoneNumber);
        const primeiroNome = pushName ? pushName.split(" ")[0] : "voce";
        await sendToClient({
          to: phoneNumber,
          message: `Olá ${primeiroNome}! 😊 Recebi sua foto, já estou analisando!`,
        });

        // Analisa foto e salva lista de itens
        const analise = await analisarFotoIA(imageUrl);
        if (analise && Array.isArray(analise.itens) && analise.itens.length > 0) {
          let veiculoSugerido = analise.veiculo_sugerido;
          if (veiculoSugerido === "van") veiculoSugerido = "hr";

          const listaFormatada = analise.itens.map((i: string) => `• ${i}`).join("\n");
          const descricaoSalva = analise.itens.join(", ");

          // Detecta itens que precisam de desmontagem + destaca itens com tamanho ambiguo
          const itensDesmontar = precisaDesmontar(analise.itens);
          const temAmbiguo = analise.itens.some((i: string) => i.includes("(?)") || i.toLowerCase().includes("tamanho?"));

          let avisos = "";
          if (itensDesmontar.length > 0) {
            avisos += `\n\n⚠️ *${itensDesmontar.join(", ")}* precisa${itensDesmontar.length > 1 ? "m" : ""} estar *desmontado${itensDesmontar.length > 1 ? "s" : ""}* antes da coleta (não fazemos montagem).`;
          }
          if (temAmbiguo) {
            avisos += `\n\n📏 Identifiquei algum item com *tamanho duvidoso* (marcado com ?). Se puder me dizer o tamanho correto em "CORRIGIR", ajuda muito na precificação.`;
          }

          await updateSession(phoneNumber, {
            step: "confirmar_itens_foto",
            descricao_carga: descricaoSalva,
            veiculo_sugerido: veiculoSugerido,
            foto_url: imageUrl,
          });

          await sendToClient({
            to: phoneNumber,
            message: `📸 Identifiquei na foto:\n\n${listaFormatada}${avisos}\n\nEstá correto?\n\n1️⃣ *SIM*, seguir\n2️⃣ *ADICIONAR* mais itens (manda outra foto)\n3️⃣ *CORRIGIR* (digite o que realmente é)`,
          });
        } else {
          // Falha na analise - pede descricao manual
          await updateSession(phoneNumber, {
            step: "aguardando_foto",
            foto_url: imageUrl,
          });
          await sendToClient({
            to: phoneNumber,
            message: "Não consegui identificar direito os itens 😅\n\nPode me descrever por texto o que precisa transportar?\n\nEx: *geladeira, fogão, cama casal, 5 caixas*",
          });
        }
        return NextResponse.json({ status: "ok" });
      }

      // Foto do cliente - IA Vision (sessao ja ativa)
      // Foto em step de adicionar item pequeno - delega pro handler
      if (session && session.step === "adicionar_item_descricao") {
        await handleAdicionarItemDescricao(phoneNumber, "", true, imageUrl);
        return NextResponse.json({ status: "ok" });
      }

      // Foto de divergencia do fretista (evidencia de problema no local)
      if (session && session.step === "fretista_divergencia_foto") {
        await handleFretistaDivergenciaFoto(phoneNumber, "", true, imageUrl);
        return NextResponse.json({ status: "ok" });
      }

      const stepsAceitamFoto = ["aguardando_foto", "aguardando_mais_fotos", "aguardando_destino"];
      if (session && stepsAceitamFoto.includes(session.step)) {
        // Feedback IMEDIATO pro cliente nao achar que travou.
        // IA Vision demora 4-6s (download + OpenAI). Sem isso, cliente que
        // manda 3 fotos juntas espera 30s sem retorno e aperta '2 Editar'
        // achando que travou (bug 26/Abr).
        const itensExistentes = (session.descricao_carga || "").split(", ").filter((i) => i.trim().length > 0).length;
        const numeroFoto = itensExistentes + 1;
        await sendToClient({
          to: phoneNumber,
          message: `📸 Foto ${numeroFoto} recebida! Analisando... ⏳`,
        });

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

          await sendToClient({
            to: phoneNumber,
            message: MSG.fotoItemAdicionado(novoItem, emoji, listaFinal),
          });
          return NextResponse.json({ status: "ok" });
        }

        // IA falhou mas recebeu foto - LOG pra rastrear quando isso acontece em producao
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "vision_fallback_material_foto",
            phone_masked: phoneNumber.replace(/\d(?=\d{4})/g, "*"),
            step_atual: session.step,
            url_dominio: (() => { try { return new URL(imageUrl).hostname; } catch { return "url_invalida"; } })(),
          },
        });

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

        await sendToClient({
          to: phoneNumber,
          message: `📸 Recebi a foto! Anotado! ✅\n\nAte agora temos: ${listaItens}\n\nTem mais algum item? Manda outra foto ou digite *PRONTO* pra seguir 😊`,
        });
        return NextResponse.json({ status: "ok" });
      }
    }

    // Prestador respondendo dispatch
    const dispatch = await getDispatchForPrestador(phoneNumber);
    if (dispatch) {
      await handlePrestadorResponse(phoneNumber, message, dispatch.corrida_id);
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
          await sendToClient({
            to: phoneNumber,
            message: "Presenca confirmada! ✅ Bom trabalho no frete! 🚚",
          });
          return NextResponse.json({ status: "ok" });
        }
      }
    }

    // Fluxo do cliente
    try {
      await handleClienteMessage(phoneNumber, message, lat, lng, hasMedia, imageUrl, pushName, instance);
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
  pushName: string = "",
  instance: 1 | 2 = 1
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
    await sendToClient({ to: phone, message: MSG.obrigado });
    return;
  }

  const lower = message.toLowerCase().trim();

  // Dashboard do fretista
  if (lower === "meu painel" || lower === "meus fretes" || lower === "meu dashboard" || lower === "meu score") {
    await handleDashboardFretista(phone);
    return;
  }

  // Comando AVALIAR - inicia fluxo de avaliacao de precos
  if (lower === "avaliar" || lower === "avaliar precos" || lower === "avaliar preço" || lower === "avaliar preços") {
    await handleAvaliarIniciar(phone);
    return;
  }

  // Dashboard do cliente
  if (lower === "minha conta" || lower === "meu historico" || lower === "meus servicos") {
    await handleDashboardCliente(phone);
    return;
  }

  // Lista de comandos
  if (lower === "esqueci" || lower === "comandos" || lower === "ajuda" || lower === "help") {
    await sendToClient({
      to: phone,
      message: `📋 *COMANDOS PEGUE*

*Para clientes:*
✅ *Oi* → iniciar atendimento
✅ *minha conta* → ver seu historico
🔄 *REPETIR* → refazer ultimo pedido
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
    await sendToClient({
      to: phone,
      message: `🎮 *PEGUE RUNNER!*

${primeiroNome}, jogue enquanto espera seu frete! 🚚💨

Desvie dos obstaculos pelas ruas de SP, enfrente bosses e entre pro ranking!

👉 chamepegue.com.br/jogo

🏆 Recorde atual? Veja no ranking dentro do jogo!
Boa sorte! 🎯`,
    });
    return;
  }

  // Comando REPETIR - refazer ultimo pedido (cliente)
  if (lower === "repetir" || lower === "refazer" || lower === "mesmo frete") {
    // Busca ultima corrida do cliente
    const { data: cliente } = await supabase
      .from("clientes")
      .select("id")
      .eq("telefone", phone)
      .single();

    if (cliente) {
      const { data: ultimaCorrida } = await supabase
        .from("corridas")
        .select("origem_endereco, destino_endereco, descricao_carga, tipo_veiculo, valor_estimado")
        .eq("cliente_id", cliente.id)
        .order("criado_em", { ascending: false })
        .limit(1)
        .single();

      if (ultimaCorrida) {
        await createSession(phone, instance);
        await updateSession(phone, {
          step: "aguardando_data",
          origem_endereco: ultimaCorrida.origem_endereco,
          destino_endereco: ultimaCorrida.destino_endereco,
          descricao_carga: ultimaCorrida.descricao_carga,
          veiculo_sugerido: ultimaCorrida.tipo_veiculo,
          valor_estimado: ultimaCorrida.valor_estimado,
        });

        const primeiroNome = pushName ? pushName.split(" ")[0] : "voce";
        await sendToClient({
          to: phone,
          message: `Ola ${primeiroNome}! 😊 Encontrei seu ultimo pedido:\n\n📍 *Retirada:* ${ultimaCorrida.origem_endereco}\n🏠 *Destino:* ${ultimaCorrida.destino_endereco}\n📦 *Material:* ${ultimaCorrida.descricao_carga}\n✅ *Valor:* R$ ${ultimaCorrida.valor_estimado}\n\n📅 *Informe o dia e horario* pra agendar novamente 😊\n\nOu digite *AGORA* se for urgente`,
        });
        return;
      }
    }

    await sendToClient({ to: phone, message: "Voce ainda nao tem pedidos anteriores 😊\nDigite *oi* pra fazer seu primeiro!" });
    return;
  }

  // Comando CANCELAR frete (fretista)
  if (lower === "cancelar" || lower === "cancelar frete") {
    await handleCancelarFrete(phone);
    return;
  }

  // Comando PROBLEMA / DIVERGENCIA (fretista reporta no local)
  if (lower === "problema" || lower === "divergencia" || lower === "divergência"
      || lower === "cliente ausente" || lower === "divergencia horario"
      || lower === "divergência horário" || lower === "divergencia com horario"
      || lower === "problema no local" || lower === "ocorrencia" || lower === "ocorrência") {
    await handleFretistaProblemaIniciar(phone);
    return;
  }

  // Comando SEGURO / COMO FUNCIONA - explicacao do pagamento retido (cliente desconfiado)
  if (lower === "seguro" || lower === "pagamento seguro" || lower === "e seguro" || lower === "é seguro"
      || lower === "eh seguro" || lower === "como funciona" || lower === "como funciona o pagamento"
      || lower === "e confiavel" || lower === "é confiável" || lower === "confiavel"
      || lower === "golpe" || lower === "e golpe" || lower === "é golpe"
      || lower === "seguranca" || lower === "segurança") {
    await sendToClient({ to: phone, message: MSG.explicaSeguranca });
    return;
  }

  // Comando ADICIONAR itens a um frete ja contratado (cliente)
  if (lower === "adicionar" || lower === "incluir" || lower === "adicionar item" || lower === "incluir item" || lower === "adicionar itens" || lower === "incluir itens") {
    await handleAdicionarIniciar(phone);
    return;
  }

  // Comando INDICAR amigo (fretista)
  if (lower === "indicar" || lower === "transferir" || lower === "indicar amigo") {
    await handleIndicarFrete(phone);
    return;
  }

  // Detecta interesse em ser prestador
  if (lower.includes("parcerias pegue") || lower.includes("parceria pegue") || lower.includes("quero ser parceiro") || lower.includes("ser parceiro") || lower.includes("cadastro prestador")) {
    await createSession(phone, instance);
    await updateSession(phone, { step: "cadastro_nome" });
    await sendToClient({ to: phone, message: MSG.cadastroInicio });
    return;
  }

  let session = await getSession(phone);

  // Nova conversa, saudacao ou termo de servico direto
  if (!session || isSaudacao(message) || (!session && isInicioServico(message))) {
    await createSession(phone, instance);
    await updateSession(phone, { step: "aguardando_servico" });

    const primeiroNome = pushName ? pushName.split(" ")[0] : "";
    const nome = primeiroNome || "voce";

    // NOVO: tenta extrair contexto da mensagem inicial via IA.
    // Se cliente ja chega falando "quero sofa pra barra funda", pulamos etapas.
    // Se IA nao detectou ou confianca baixa, cai no fluxo tradicional abaixo.
    if (!isSaudacao(message) && message.trim().length >= 10) {
      // Mostra "analisando" pra cliente nao achar que travou (IA leva 1-2s)
      await sendToClient({
        to: phone,
        message: `Ola ${nome}! 😊 Recebi sua mensagem, ja estou analisando pra agilizar o atendimento...`,
      });

      const contexto = await extrairContextoInicial(message);

      if (contexto && contexto.confianca !== "baixa") {
        // Salva o que detectou na sessao (pra usar depois)
        await updateSession(phone, {
          step: "confirmar_contexto_inicial",
          descricao_carga: contexto.itens.length > 0 ? contexto.itens.join(", ") : null,
          veiculo_sugerido: contexto.veiculo_sugerido,
        });

        // Registra contexto completo em bot_logs (origem/destino textos vao ser usados depois)
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "contexto_extraido_inicial",
            phone,
            contexto,
            mensagem_original: message.slice(0, 500),
          },
        });

        await sendToClient({
          to: phone,
          message: formatarConfirmacaoContexto(contexto),
        });
        return;
      }
    }

    // Se digitou termo de servico direto (frete, guincho, carreto, mudanca)
    if (isInicioServico(message)) {
      const saudacaoRapida = `Ola ${nome}! 😊 Que bom ter voce aqui na Pegue!\n\nVamos rapidamente fazer sua cotacao? Eu te ajudo, vamos la! 🚚\n\nO que voce precisa?\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudanca completa*\n3️⃣ *Guincho*\n4️⃣ *Duvidas frequentes*`;
      await sendToClient({ to: phone, message: saudacaoRapida });

      // Se ja da pra identificar o servico, encaminha direto
      const lowerMsg = lower;
      if (lowerMsg.includes("guincho")) {
        await handleEscolhaServico(phone, "3");
        return;
      } else if (lowerMsg.includes("mudanca") || lowerMsg.includes("mudança")) {
        await handleEscolhaServico(phone, "2");
        return;
      } else if (lowerMsg.includes("frete") || lowerMsg.includes("carreto")) {
        await handleEscolhaServico(phone, "1");
        return;
      }
      return;
    }

    // Saudacao normal
    const saudacao = `Ola ${nome}! 😊 Que bom ter voce aqui na Pegue!\n\nVamos rapidamente fazer sua cotacao? Eu te ajudo, vamos la! 🚚\n\nO que voce precisa?\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudanca completa*\n3️⃣ *Guincho*\n4️⃣ *Duvidas frequentes*`;
    await sendToClient({ to: phone, message: saudacao });
    return;
  }

  // Cliente com sessao ativa que digita termo de servico - reinicia
  if (session && session.step === "concluido" && isInicioServico(message)) {
    await createSession(phone, instance);
    await updateSession(phone, { step: "aguardando_servico" });
    const primeiroNome = pushName ? pushName.split(" ")[0] : "voce";
    await sendToClient({
      to: phone,
      message: `Ola ${primeiroNome}! 😊 Que bom ter voce de volta na Pegue!\n\nVamos rapidamente fazer sua cotacao? Eu te ajudo, vamos la! 🚚\n\nO que voce precisa?\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudanca completa*\n3️⃣ *Guincho*\n4️⃣ *Duvidas frequentes*`,
    });

    const lowerMsg = lower;
    if (lowerMsg.includes("guincho")) { await handleEscolhaServico(phone, "3"); return; }
    if (lowerMsg.includes("mudanca") || lowerMsg.includes("mudança")) { await handleEscolhaServico(phone, "2"); return; }
    if (lowerMsg.includes("frete") || lowerMsg.includes("carreto")) { await handleEscolhaServico(phone, "1"); return; }
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
      await handleConfirmacao(phone, message, instance);
      break;

    case "editando_escolha":
      await handleEditandoEscolha(phone, message, instance);
      break;

    case "confirmar_itens_foto":
      await handleConfirmarItensFoto(phone, message);
      break;

    case "confirmando_origem":
      await handleConfirmandoOrigem(phone, message);
      break;

    case "confirmando_destino":
      await handleConfirmandoDestino(phone, message);
      break;

    case "aguardando_outros_descricao":
      await handleOutrosDescricao(phone, message);
      break;

    case "aguardando_outros_quantidade":
      await handleOutrosQuantidade(phone, message);
      break;

    case "aguardando_outros_dimensoes":
      await handleOutrosDimensoes(phone, message);
      break;

    case "aguardando_outros_peso":
      await handleOutrosPeso(phone, message);
      break;

    case "aguardando_fretista":
      await sendToClient({
        to: phone,
        message: "Estamos reservando a agenda! 😊 Ja ja te retornamos com a confirmacao!",
      });
      break;

    case "aguardando_numero_coleta":
      await handleNumeroColeta(phone, message);
      break;

    case "aguardando_numero_destino":
      await handleNumeroDestino(phone, message);
      break;

    case "adicionar_pequeno_grande":
      await handleAdicionarPequenoGrande(phone, message);
      break;

    case "adicionar_item_descricao":
      await handleAdicionarItemDescricao(phone, message, false, null);
      break;

    case "confirmar_contexto_inicial":
      await handleConfirmarContextoInicial(phone, message);
      break;

    case "fretista_divergencia_tipo":
      await handleFretistaDivergenciaTipo(phone, message);
      break;

    case "fretista_divergencia_foto":
      await handleFretistaDivergenciaFoto(phone, message, false, null);
      break;

    case "fretista_divergencia_descricao":
      await handleFretistaDivergenciaDescricao(phone, message);
      break;

    case "aguardando_contraoferta_data":
      await handleContraofertaData(phone, message);
      break;

    case "avaliar_escolher_veiculos":
      await handleAvaliarEscolherVeiculos(phone, message);
      break;

    case "avaliar_aguardando_preco":
      await handleAvaliarAguardandoPreco(phone, message);
      break;

    case "aguardando_revisao_admin":
      await sendToClient({
        to: phone,
        message: "Ainda esta na segunda camada de analise com a nossa equipe 😊 Em poucos minutos te retornamos com o valor final. Obrigado pela paciencia!",
      });
      break;

    case "admin_confirmar_ajuste":
      // Dupla protecao: handler tambem valida internamente, mas aqui ja filtramos
      if (isAdminPhone(phone)) {
        await handleAdminConfirmarAjuste(phone, message);
      } else {
        await updateSession(phone, { step: "inicio" });
      }
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
      await sendToClient({ to: phone, message: MSG.cadastroSelfie });
      break;
    case "cadastro_foto_placa":
      await sendToClient({ to: phone, message: MSG.cadastroFotoPlaca });
      break;
    case "cadastro_foto_veiculo":
      await sendToClient({ to: phone, message: MSG.cadastroFotoVeiculo });
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
      await sendToClient({ to: phone, message: "Seu cadastro esta em analise! 😊 Te avisamos assim que for aprovado!" });
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
      await sendToClient({
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
    case "guincho_marca_modelo":
      await handleGuinchoMarcaModelo(phone, message);
      break;
    case "guincho_localizacao":
      await handleGuinchoLocalizacao(phone, message, lat, lng);
      break;
    case "guincho_destino":
      await handleGuinchoDestino(phone, message);
      break;

    default: {
      // Step desconhecido: NAO reseta sessao silenciosamente (isso fazia cliente
      // perder contexto em bugs/migrations). Registra ocorrencia e notifica admin
      // pra investigar. Cliente recebe mensagem discreta pedindo pra aguardar.
      console.error(`[BOT] Step desconhecido: "${session.step}" (phone=${phone})`);
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "step_desconhecido",
          step: session.step,
          phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
        },
      });
      await sendToClient({
        to: phone,
        message: "⏳ Um momento, estamos verificando seu atendimento com a equipe.",
      });
      await notificarAdmins(
        `⚠️ *STEP DESCONHECIDO NO BOT*`,
        phone,
        `Step atual: ${session.step}\nA sessao NAO foi resetada - o cliente esta em um state que o codigo nao reconhece. Investigar.`
      );
      break;
    }
  }
}

// STEP 0: Escolha do servico
async function handleEscolhaServico(phone: string, message: string) {
  const lower = message.toLowerCase().trim();

  if (lower === "1" || lower.includes("pequeno") || lower.includes("frete")) {
    await updateSession(phone, { step: "aguardando_localizacao" });
    // Tenta GIF tutorial (mostra visualmente onde clicar). Fallback: texto puro.
    try {
      await sendImageToClient({
        to: phone,
        url: MSG.TUTORIAL_LOCALIZACAO_URL,
        caption: MSG.pedirLocalizacao,
      });
    } catch {
      await sendToClient({ to: phone, message: MSG.pedirLocalizacao });
    }
    return;
  }

  if (lower === "2" || lower.includes("mudanca") || lower.includes("mudança")) {
    // Default de MUDANCA eh HR (nao utilitario). Se depois cliente mandar lista pequena, pode
    // ajustar pra baixo (mas determinarMelhorVeiculo so SOBE - entao HR vira caminhao_bau se precisar).
    await updateSession(phone, {
      step: "aguardando_localizacao",
      veiculo_sugerido: "hr",
    });
    // Aviso de desmontagem vem ANTES da localizacao - cliente precisa saber desde ja
    await sendToClient({
      to: phone,
      message: `📦 *Antes de começar — importante:*\n\n⚠️ Nossos fretistas *não fazem desmontagem/montagem* de móveis.\n\n*Guarda-roupas, camas, beliches, estantes e armários grandes precisam estar DESMONTADOS* antes da coleta.\n\nTambém, se tiver *geladeira*, deixe descongelada e seca 6h antes.\n\n✅ Preparou os móveis? Vamos seguir!`,
    });
    try {
      await sendImageToClient({
        to: phone,
        url: MSG.TUTORIAL_LOCALIZACAO_URL,
        caption: MSG.pedirLocalizacao,
      });
    } catch {
      await sendToClient({ to: phone, message: MSG.pedirLocalizacao });
    }
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
      await sendToClient({ to: phone, message: MSG.guinchoDesativado });
      await notificarAdmin(
        `🚗 *GUINCHO SOLICITADO (desabilitado)*`,
        phone,
        `Cliente pediu guincho mas o servico esta desativado no controle.`
      );
      return;
    }

    await updateSession(phone, { step: "guincho_categoria" as any });
    await sendToClient({ to: phone, message: MSG.guinchoMenu });
    return;
  }

  if (lower === "4" || lower.includes("duvida") || lower.includes("faq") || lower.includes("pergunta")) {
    await sendToClient({
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

  await sendToClient({
    to: phone,
    message: "Escolhe uma opcao, por favor! 😊\n\n1️⃣ Pequenos Fretes\n2️⃣ Mudanca completa\n3️⃣ Guincho (carro ou moto)\n4️⃣ Duvidas frequentes",
  });
}

// Helper: salva origem identificada e pede confirmacao do cliente.
// Defesa em camadas (feedback_jamais_cotar_sem_certeza camada 3): cliente
// SEMPRE confirma o endereco antes de avancar. Bug 25/Abr: sistema dizia
// 'Coleta em: Rua X' apenas ecoando o que o cliente digitou, sem provar
// identificacao real.
async function apresentarOrigemPraConfirmacao(
  phone: string,
  enderecoFormatado: string,
  lat: number,
  lng: number
) {
  await updateSession(phone, {
    step: "confirmando_origem",
    origem_endereco: enderecoFormatado,
    origem_lat: lat,
    origem_lng: lng,
  });
  await sendToClient({
    to: phone,
    message: `📍 *Encontrei este endereço de retirada:*\n\n${enderecoFormatado}\n\n1️⃣ *CONFIRMAR* (é esse mesmo)\n2️⃣ *CORRIGIR* (é outro)`,
  });
}

// STEP 1: Localizacao
async function handleLocalizacao(
  phone: string, message: string, lat: number | null, lng: number | null
) {
  // Caminho A: cliente mandou GPS pelo clipe (mais confiavel)
  if (lat && lng) {
    const endereco = await reverseGeocode(lat, lng);
    await apresentarOrigemPraConfirmacao(phone, endereco, lat, lng);
    return;
  }

  // GUARD: rejeita palavras reservadas como endereço (ver feedback_jamais_cotar_sem_certeza)
  if (isPalavraReservadaEndereco(message)) {
    await sendToClient({
      to: phone,
      message: `Ops! Preciso do *endereço de retirada* 📍\n\n${MSG.pedirLocalizacao}`,
    });
    return;
  }

  // Feedback imediato pro cliente nao achar que bot travou (geocoder pode demorar 1-3s)
  if (message && message.trim().length >= 5) {
    await sendToClient({ to: phone, message: "📍 Anotei, tô localizando..." });
  }

  // Caminho B: CEP
  const cep = extrairCep(message);
  if (cep) {
    const enderecoViaCep = await buscaCep(cep);
    if (enderecoViaCep) {
      const coords = await geocodeAddress(enderecoViaCep);
      if (coords?.lat && coords?.lng) {
        // Re-formata via reverseGeocode pra padronizar (rua, bairro, cidade)
        const enderecoFormatado = await reverseGeocode(coords.lat, coords.lng);
        await apresentarOrigemPraConfirmacao(
          phone,
          enderecoFormatado || enderecoViaCep,
          coords.lat,
          coords.lng
        );
        return;
      }
      // CEP achou endereco mas geocoder nao deu coords - cai no fluxo de erro abaixo
      console.warn(`[cep] ViaCEP OK mas geocoder falhou pra: ${enderecoViaCep}`);
    } else {
      // CEP invalido / nao encontrado
      await supabase.from("bot_logs").insert({
        payload: { tipo: "cep_nao_encontrado", phone, cep, origem_tentativa: message.slice(0, 100) },
      });
      await sendToClient({
        to: phone,
        message: `🤔 Não achei esse CEP (*${cep}*) no ViaCEP.\n\nConfere se digitou certo ou tenta mandar:\n• *Rua, bairro e cidade* (ex: Rua Augusta, Consolacao, Sao Paulo)\n• *Localização* pelo *icone de anexo* (canto inferior direito do WhatsApp)`,
      });
      return;
    }
  }

  // Caminho C: texto livre (nao palavra reservada, nao CEP)
  // Exige minimo 2 palavras de 3+ chars pra evitar geocodar lixo.
  const palavras = message.split(/\s+/).filter((p) => p.length > 2);
  if (palavras.length >= 2) {
    const coords = await geocodeAddress(message);
    if (coords?.lat && coords?.lng) {
      // Bug 25/Abr: cliente digitou so "Agua Branca" (bairro), reverseGeocode
      // retornou "Rua X, Agua Branca" — cliente pensou que sistema inventou rua.
      // Solucao: se input nao mencionou rua/avenida/etc, mostrar so bairro+cidade.
      const enderecoFormatado = inputContemRua(message)
        ? await reverseGeocode(coords.lat, coords.lng)
        : await reverseGeocodeBairroCidade(coords.lat, coords.lng);
      await apresentarOrigemPraConfirmacao(
        phone,
        enderecoFormatado || message,
        coords.lat,
        coords.lng
      );
      return;
    }
  }

  // Geocoder falhou OU texto muito vago.
  // ANTES: aceitavamos com fallback Osasco hardcoded (-23.5329, -46.7916).
  // Isso violava feedback_jamais_cotar_sem_certeza (lat/lng falsos = fretista
  // vai pro endereco errado). Agora pedimos endereco melhor.
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "origem_nao_identificada",
      phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
      texto_amostra: message.slice(0, 200),
    },
  });
  await sendToClient({
    to: phone,
    message: `Não consegui identificar esse endereço 😅

Tenta de uma dessas formas pra eu garantir que o fretista vai pro lugar certo:

📍 Manda sua *localizacao* pelo *icone de anexo* (canto inferior direito do WhatsApp) (mais preciso)
📮 Digita o *CEP* (ex: 06010-000)
🏠 Digita *rua + bairro + cidade* (ex: Rua Augusta, Consolacao, Sao Paulo)

🔒 Não precisa do número da casa agora — só depois do pagamento.`,
  });
}

// STEP 2: Foto
// Itens da lista rapida de mudanca
const ITENS_MUDANCA: Record<string, string> = {
  // COZINHA
  "1": "Geladeira", "2": "Fogao", "3": "Micro-ondas", "4": "Maquina de lavar",
  "5": "Armario de cozinha", "6": "Mesa com cadeiras", "7": "Freezer",
  // QUARTO
  "8": "Cama casal", "9": "Cama solteiro", "10": "Beliche", "11": "Berco",
  "12": "Guarda-roupa", "13": "Comoda", "14": "Colchao",
  // SALA
  "15": "Sofa", "16": "Rack/Estante", "17": "TV", "18": "Mesa de centro",
  "19": "Poltrona", "20": "Estante de livros", "21": "Espelho grande",
  // ESCRITORIO
  "22": "Escrivaninha", "23": "Cadeira de escritorio",
  // OUTROS
  "24": "Caixas", "25": "Bicicleta", "26": "Maquina de costura",
  "27": "Tanquinho", "28": "Ventilador/Ar condicionado",
  "29": "Ar condicionado split",
  // ESPECIAL — item 30 abre fluxo de dimensoes+peso (handleOutrosDescricao)
  "30": "Outros (especificar)",
};

async function handleFoto(
  phone: string, message: string, hasMedia: boolean, imageUrl: string | null = null
) {
  const lower = message.toLowerCase().trim();

  // GUARD: ignora silenciosamente eventos vazios (ChatPro as vezes manda
  // evento extra quando cliente envia carrosel de varias fotos — text vazio
  // sem media). Bug 26/Abr: cliente mandou 3 fotos juntas, bot mandou 'Nao
  // entendi' antes de processar as imagens.
  if (!hasMedia && lower.length === 0) {
    return;
  }

  // Opcao 2 - Lista rapida
  if (lower === "2" || lower === "lista" || lower.includes("lista rapida")) {
    await sendToClient({ to: phone, message: MSG.listaMudanca });
    return;
  }

  // Opcao 1 - Foto (so texto, foto real e processada no topo do POST)
  if (lower === "1" || lower === "foto") {
    await sendToClient({ to: phone, message: "Manda a foto do material 📸" });
    return;
  }

  // Opcao 3 ou texto livre
  if (lower === "3" || lower === "texto" || lower === "descrever") {
    await sendToClient({ to: phone, message: "Descreve os materiais que precisa transportar 😊\n\nEx: *geladeira, fogao, cama casal, 5 caixas*" });
    return;
  }

  // Item 30 = "Outros" — vai pro fluxo de dimensoes+peso (handleOutros*)
  if (lower === "30" || lower === "outros" || lower === "outro") {
    await updateSession(phone, { step: "aguardando_outros_descricao" });
    await sendToClient({
      to: phone,
      message: `🔧 *Item especial!*\n\nQue item voce quer transportar?\n\n_Ex: drywall, barras de aco, MDF, piano, vidro grande_`,
    });
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

      // Sugere veiculo baseado na quantidade - MAS nunca regride
      // (ex: se cliente escolheu MUDANCA e ja esta com HR default, nao cai pra utilitario)
      const sessao = await getSession(phone);
      let veiculoSugerido = "utilitario";
      if (itensEncontrados.length >= 8) veiculoSugerido = "caminhao_bau";
      else if (itensEncontrados.length >= 3) veiculoSugerido = "hr";
      const veiculo = determinarMelhorVeiculo(sessao?.veiculo_sugerido || null, veiculoSugerido);

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

      await sendToClient({
        to: phone,
        message: `Anotado! ✅\n\n📦 *Seus itens:*\n${itensEncontrados.map(i => `- ${i}`).join("\n")}\n\n🚚 Veiculo sugerido: *${veiculoNome[veiculo]}*\n\nE pra onde a gente leva? Me manda o endereco ou CEP do destino 🏠`,
      });
      return;
    }
  }

  // Texto livre descrevendo itens
  if (message.length > 2) {
    // IMPORTANTE: bloqueia se texto parece endereco ou CEP.
    // Cliente as vezes se perde e manda o endereco do destino aqui em vez dos itens.
    // Se aceitar, salva "Rua X, Osasco" como descricao_carga (bug relatado).
    if (extrairCep(message) || pareceEndereco(message)) {
      await sendToClient({
        to: phone,
        message: `🤔 Parece que você mandou um *endereço*, mas agora preciso saber o *que* você vai transportar (não pra onde).\n\nMe manda:\n📸 Uma *foto* dos itens\nOU digite: *geladeira, sofá, cama casal* (separados por vírgula)\n\nDepois pergunto o endereço de destino 😊`,
      });
      return;
    }

    // Inferencia basica de veiculo pelo numero de itens mencionados - mas nao regride.
    // Conta quantidade real via contarItensTexto (testavel via Vitest):
    // "2 camas, 3 cadeiras" = 5 itens (nao 2).
    let qtdItens = contarItensTexto(message);
    if (qtdItens === 0) qtdItens = 1;
    let veiculoSugerido = "utilitario";
    if (qtdItens >= 8) veiculoSugerido = "caminhao_bau";
    else if (qtdItens >= 3) veiculoSugerido = "hr";
    const sessaoAtual = await getSession(phone);
    const veiculo = determinarMelhorVeiculo(sessaoAtual?.veiculo_sugerido || null, veiculoSugerido);

    await updateSession(phone, {
      step: "aguardando_destino",
      descricao_carga: message,
      veiculo_sugerido: veiculo,
    });
    await sendToClient({ to: phone, message: MSG.fotoRecebida(message) });
    return;
  }

  // Fallback quando entrada nao foi reconhecida (nem foto, nem numero da lista,
  // nem texto descritivo). NAO repete pedido cheio de opcoes (cliente nao le).
  await sendToClient({
    to: phone,
    message: "Nao entendi 🤔\n\nManda *foto*, *digita os itens* (ex: geladeira, sofa) ou digite *3* para ver lista de mudanca.",
  });
}

// Helper: monta lista numerada dos itens (pra cliente ver e editar)
function formatarListaNumerada(descricao: string | null): string {
  if (!descricao) return "";
  return descricao
    .split(", ")
    .filter((i) => i.trim().length > 0)
    .map((item, idx) => `${idx + 1}. ${item}`)
    .join("\n");
}

// STEP 2b: Mais fotos ou PRONTO
async function handleMaisFotos(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  // Comando APAGAR/LIMPAR/ZERAR - limpa lista e volta a pedir itens do zero
  if (lower === "limpar" || lower === "apagar" || lower === "apagar tudo" || lower === "zerar" || lower === "zerar itens" || lower === "comecar de novo" || lower === "começar de novo" || lower === "recomecar" || lower === "recomeçar") {
    await updateSession(phone, {
      step: "aguardando_foto",
      descricao_carga: null,
      veiculo_sugerido: null,
      foto_url: null,
    });
    await sendToClient({
      to: phone,
      message: "🧹 Lista limpa! Vamos começar de novo.\n\nComo você quer me passar os itens?\n\n1️⃣ *Mandar foto* 📸\n2️⃣ *Lista rápida de mudança*\n3️⃣ *Descrever por texto*",
    });
    return;
  }

  // Comando REMOVER/TIRAR/RETIRAR <numero> - remove item especifico da lista
  const matchRemover = lower.match(/^(remover|tirar|retirar|excluir|apagar)\s+(\d+)$/);
  if (matchRemover) {
    const idx = parseInt(matchRemover[2], 10) - 1; // 1-indexed pro humano, 0-indexed pro array
    const itens = (session.descricao_carga || "").split(", ").filter((i) => i.trim().length > 0);
    if (idx < 0 || idx >= itens.length) {
      await sendToClient({
        to: phone,
        message: `Número inválido. Sua lista tem ${itens.length} item${itens.length === 1 ? "" : "s"}.\n\n${formatarListaNumerada(session.descricao_carga)}\n\nDigite *remover 1*, *remover 2*, etc.`,
      });
      return;
    }
    const itemRemovido = itens[idx];
    itens.splice(idx, 1);
    const novaLista = itens.join(", ");

    await updateSession(phone, { descricao_carga: novaLista || null });

    if (itens.length === 0) {
      // Lista ficou vazia, volta pra pedir item
      await updateSession(phone, {
        step: "aguardando_foto",
        descricao_carga: null,
        veiculo_sugerido: null,
        foto_url: null,
      });
      await sendToClient({
        to: phone,
        message: `✅ Removi *${itemRemovido}*. Sua lista ficou vazia.\n\nComo você quer me passar os itens?\n\n1️⃣ *Mandar foto* 📸\n2️⃣ *Lista rápida de mudança*\n3️⃣ *Descrever por texto*`,
      });
      return;
    }

    await sendToClient({
      to: phone,
      message: `✅ Removi *${itemRemovido}*.\n\nLista atual:\n${formatarListaNumerada(novaLista)}\n\nTem mais algum item? 📦\n• Manda outra *foto* ou *descrição*\n• Digite *PRONTO* pra seguir\n• Ou *remover N* pra tirar outro item`,
    });
    return;
  }

  // Comando TROCAR <n> POR <descricao> - substitui item N
  const matchTrocar = message.match(/^(trocar|substituir|mudar|alterar|corrigir)\s+(\d+)\s+(por|para)\s+(.+)/i);
  if (matchTrocar) {
    const idx = parseInt(matchTrocar[2], 10) - 1;
    const novaDesc = matchTrocar[4].trim();
    const itens = (session.descricao_carga || "").split(", ").filter((i) => i.trim().length > 0);

    if (idx < 0 || idx >= itens.length) {
      await sendToClient({
        to: phone,
        message: `Número inválido. Sua lista tem ${itens.length} item${itens.length === 1 ? "" : "s"}.\n\n${formatarListaNumerada(session.descricao_carga)}\n\nDigite *trocar 1 por <novo item>*, etc.`,
      });
      return;
    }

    if (novaDesc.length < 2) {
      await sendToClient({
        to: phone,
        message: "Me fala o que você quer colocar no lugar.\n\nEx: *trocar 2 por geladeira*",
      });
      return;
    }

    const itemAntigo = itens[idx];
    itens[idx] = novaDesc;
    const novaLista = itens.join(", ");
    await updateSession(phone, { descricao_carga: novaLista });

    await sendToClient({
      to: phone,
      message: `✅ Troquei *${itemAntigo}* por *${novaDesc}*.\n\n📦 *Lista atualizada:*\n${formatarListaNumerada(novaLista)}\n\n• *PRONTO* = seguir\n• *remover N* ou *trocar N por X* = editar mais\n• *APAGAR* = limpar tudo`,
    });
    return;
  }

  // Comando LISTA / VER - mostra lista atual numerada
  if (lower === "lista" || lower === "ver" || lower === "ver lista" || lower === "minha lista" || lower === "itens") {
    const listaNum = formatarListaNumerada(session.descricao_carga);
    if (!listaNum) {
      await sendToClient({
        to: phone,
        message: "Lista está vazia. Manda uma foto ou descreve os itens 📦",
      });
      return;
    }
    await sendToClient({
      to: phone,
      message: `📦 *Sua lista atual:*\n\n${listaNum}\n\nOpções:\n• Manda outra *foto* ou *descrição* = adicionar\n• *remover 2* = tira o item 2\n• *APAGAR* = limpa tudo\n• *PRONTO* = seguir pra destino`,
    });
    return;
  }

  // Botao "2 Editar" - mostra lista atual com instrucao SUPER simples
  if (lower === "2" || lower === "editar") {
    const listaNum = formatarListaNumerada(session.descricao_carga);
    if (!listaNum) {
      await sendToClient({
        to: phone,
        message: "Lista vazia. Manda uma foto ou descreve os itens 📦",
      });
      return;
    }
    await sendToClient({
      to: phone,
      message: `📦 *Sua lista:*\n\n${listaNum}\n\n*Qual item remover?* Manda o número.\n\n_Ou:_\n➕ *adicionar* — incluir mais\n✅ *pronto* — seguir`,
    });
    return;
  }

  // Comando "adicionar" / "+" / "novo" - volta pra adicionar mais itens
  if (lower === "adicionar" || lower === "+" || lower === "novo" || lower === "incluir" || lower === "mais") {
    await sendToClient({
      to: phone,
      message: `📦 Manda outra *foto* ou *descreve por texto* o que quer adicionar.\n\n_Ex: 'cama solteiro' ou '5 caixas'_`,
    });
    return;
  }

  // NUMERO SOZINHO (sem "remover") - interpreta como remocao do item N
  // Ex: cliente digitou '2' apos ver lista numerada
  // Bug Fabio 26/Abr: comandos 'remover N', 'trocar N por X' eram confusos.
  // Agora aceita apenas o NUMERO direto.
  const matchNum = lower.match(/^(\d+)$/);
  if (matchNum) {
    const idx = parseInt(matchNum[1], 10) - 1;
    const itens = (session.descricao_carga || "").split(", ").filter((i) => i.trim().length > 0);

    if (idx < 0 || idx >= itens.length) {
      await sendToClient({
        to: phone,
        message: `Numero invalido. Sua lista tem ${itens.length} item${itens.length === 1 ? "" : "s"}:\n\n${formatarListaNumerada(session.descricao_carga)}\n\nManda um numero de *1* a *${itens.length}*.`,
      });
      return;
    }

    const itemRemovido = itens[idx];
    itens.splice(idx, 1);
    const novaLista = itens.join(", ");

    await updateSession(phone, { descricao_carga: novaLista || null });

    if (itens.length === 0) {
      await updateSession(phone, {
        step: "aguardando_foto",
        descricao_carga: null,
        veiculo_sugerido: null,
        foto_url: null,
      });
      await sendToClient({
        to: phone,
        message: `✅ Removi *${itemRemovido}*. Lista vazia.\n\n📸 Manda uma *foto* ou *descreve* pra recomecar.`,
      });
      return;
    }

    await sendToClient({
      to: phone,
      message: `✅ Removi: *${itemRemovido}*\n\n📦 Sua lista:\n${formatarListaNumerada(novaLista)}\n\n*Mais alguma edicao?*\n• Manda outro numero pra remover\n➕ *adicionar* — incluir mais\n✅ *pronto* — seguir`,
    });
    return;
  }

  // Botao "1 Tudo certo" + sinonimos textuais
  if (lower === "1" || lower === "tudo certo" || lower === "pronto" || lower === "so isso" || lower === "só isso" || lower === "nao" || lower === "não" || lower === "n") {
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

    await sendToClient({
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

    const listaNumerada = formatarListaNumerada(listaItens);
    await sendToClient({
      to: phone,
      message: `Anotado! ✅\n\n📦 *Sua lista:*\n${listaNumerada}\n\nTem mais algum item?\n• Manda outra *foto* ou *descrição* = adicionar\n• *remover 2* = tira o item 2\n• *PRONTO* = seguir\n• *APAGAR* = limpar tudo`,
    });
    return;
  }

  await sendToClient({
    to: phone,
    message: "📦 Manda outra foto, outra descrição, ou digite:\n• *PRONTO* pra seguir\n• *remover N* pra tirar um item\n• *APAGAR* pra limpar tudo\n• *LISTA* pra ver os itens atuais",
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

  // GUARD: rejeita palavras reservadas como endereço (ver feedback_jamais_cotar_sem_certeza)
  // Bug 25/Abr: cliente digitou "PRONTO" pra fechar fotos, sistema geocodificou como destino.
  if (isPalavraReservadaEndereco(message)) {
    await sendToClient({
      to: phone,
      message: `Ops! Preciso do *endereço de entrega* 🏠\n\nDigita rua + bairro + cidade do destino.\n\n_Ex: Av Paulista, Bela Vista, Sao Paulo_\n\nOu manda a *localizacao* pelo *icone de anexo* (canto inferior direito do WhatsApp)`,
    });
    return;
  }

  // Feedback imediato pro cliente nao achar que bot travou
  if (message && message.trim().length >= 5) {
    await sendToClient({ to: phone, message: "📍 Anotei, tô localizando o destino..." });
  }

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
    } else {
      await supabase.from("bot_logs").insert({
        payload: { tipo: "cep_destino_nao_encontrado", phone, cep, destino_tentativa: message.slice(0, 100) },
      });
      await sendToClient({
        to: phone,
        message: `🤔 Não achei esse CEP (*${cep}*) de destino.\n\nConfere se digitou certo ou manda:\n• *Rua, bairro e cidade* do destino\n\nExemplo: *Rua Augusta, Consolação, São Paulo*`,
      });
      return;
    }
  } else {
    const coords = await geocodeAddress(message);
    destinoLat = coords?.lat || null;
    destinoLng = coords?.lng || null;
  }

  // SEM coords reais = NAO ACEITAMOS. ANTES usavamos fallback Osasco hardcoded
  // (-23.5329, -46.7916), o que viola feedback_jamais_cotar_sem_certeza:
  // fretista ia pro endereco errado, cliente cobrado por destino que nao existia.
  if (!destinoLat || !destinoLng) {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "destino_nao_identificado",
        phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
        texto_amostra: message.slice(0, 200),
      },
    });
    await sendToClient({
      to: phone,
      message: `🤔 Não consegui localizar esse endereço de entrega.\n\nMe manda assim, pra eu garantir que o fretista entrega no lugar certo:\n• Nome completo da *rua*\n• *Bairro*\n• *Cidade*\n\nExemplo: *Rua Brasil, Centro, Osasco*\n\nOu manda a *localização* do destino pelo *icone de anexo* (canto inferior direito do WhatsApp)\n\n🔒 Número da casa só depois do pagamento.`,
    });
    return;
  }

  // Re-formata via Nominatim pra ter rua + bairro + cidade reais (nao so eco do texto).
  // Bug 25/Abr: 'Encontrei este endereço: Pronto' — sistema apenas ecoava o input.
  // Se cliente nao digitou rua (so bairro), nao acrescentamos uma rua inventada.
  const enderecoFormatado = (cep || inputContemRua(message))
    ? await reverseGeocode(destinoLat, destinoLng)
    : await reverseGeocodeBairroCidade(destinoLat, destinoLng);
  if (enderecoFormatado && enderecoFormatado !== "Localizacao recebida") {
    destinoEndereco = enderecoFormatado;
  }

  // Verifica se destino é area indisponivel (favela/area livre)
  const zonaDestino = detectarZona(destinoEndereco);
  if (zonaDestino === "indisponivel") {
    await sendToClient({
      to: phone,
      message: `Que pena 😕 Mas essa rota está *indisponível* no momento.\n\nSe quiser tentar outro destino, manda o endereço! 📍`,
    });
    return;
  }

  await updateSession(phone, {
    step: "confirmando_destino",
    destino_endereco: destinoEndereco,
    destino_lat: destinoLat,
    destino_lng: destinoLng,
  });

  await sendToClient({
    to: phone,
    message: `📍 *Encontrei este endereço de entrega:*\n\n${destinoEndereco}\n\n1️⃣ *CONFIRMAR* (é esse mesmo)\n2️⃣ *CORRIGIR* (é outro)`,
  });
}

// === FLUXO "OUTROS" (item 30 da lista) ===
// 4 perguntas em sequencia: descricao -> quantidade -> dimensoes -> peso.
// Sugere veiculo baseado em volume*qtd + peso total.

async function handleOutrosDescricao(phone: string, message: string) {
  const desc = message.trim();
  if (desc.length < 2) {
    await sendToClient({
      to: phone,
      message: "Me fala que item eh? _Ex: drywall, barras de aco, MDF, piano_",
    });
    return;
  }
  // Salva em descricao_carga temporariamente (vai virar formato final no peso)
  await updateSession(phone, {
    step: "aguardando_outros_quantidade",
    descricao_carga: desc,
  });
  await sendToClient({
    to: phone,
    message: `Anotado: *${desc}* ✅\n\n*Quantos itens?* (so o numero)`,
  });
}

async function handleOutrosQuantidade(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;
  const num = parseInt(message.replace(/\D/g, ""), 10);
  if (isNaN(num) || num < 1 || num > 9999) {
    await sendToClient({
      to: phone,
      message: "Hum, nao entendi a quantidade. Manda *so o numero*. _Ex: 10_",
    });
    return;
  }
  // Append qtd ao descricao_carga
  const desc = session.descricao_carga || "Item";
  await updateSession(phone, {
    step: "aguardando_outros_dimensoes",
    descricao_carga: `${num}x ${desc}`,
  });
  await sendToClient({
    to: phone,
    message: `${num}x *${desc}* ✅\n\n*Dimensoes de UMA unidade* (em cm):\n\n_Manda nesse formato:_\n*Largura x Altura x Comprimento*\n_Ex: 30x10x300_ (3 metros)`,
  });
}

async function handleOutrosDimensoes(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;
  const dims = parseDimensoes(message);
  if (!dims) {
    await sendToClient({
      to: phone,
      message: "Hum, nao consegui ler as dimensoes. Manda nesse formato:\n*Largura x Altura x Comprimento* (em cm)\n_Ex: 30x10x300_",
    });
    return;
  }
  const volumeUnitarioM3 = calcularVolumeM3(dims.largura, dims.altura, dims.comprimento);
  // Salva dimensoes serializadas em descricao_carga (vai compor formato final no peso)
  const descAtual = session.descricao_carga || "Item";
  const descCom = `${descAtual} (${dims.largura}x${dims.altura}x${dims.comprimento}cm)`;
  await updateSession(phone, {
    step: "aguardando_outros_peso",
    descricao_carga: descCom,
  });
  await sendToClient({
    to: phone,
    message: `Dimensoes: ${dims.largura}x${dims.altura}x${dims.comprimento}cm ✅\n_Volume por unidade: ${volumeUnitarioM3.toFixed(3)}m³_\n\n*Peso TOTAL aproximado* da carga (kg):\n_Ex: 50_\n_Se nao souber, manda 'nao sei'_`,
  });
}

async function handleOutrosPeso(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;
  const lower = message.toLowerCase().trim();
  let pesoKg: number | null = null;
  if (lower !== "nao sei" && lower !== "não sei" && lower !== "ns") {
    const num = parseFloat(message.replace(/[^\d.,]/g, "").replace(",", "."));
    if (isNaN(num) || num < 0.1 || num > 10000) {
      await sendToClient({
        to: phone,
        message: "Hum, nao entendi o peso. Manda *so o numero em kg*. _Ex: 50_\n_Se nao souber, manda 'nao sei'_",
      });
      return;
    }
    pesoKg = num;
  }

  // Extrai qtd e dimensoes do descricao_carga (formato: "10x drywall (30x10x300cm)")
  const descAtual = session.descricao_carga || "";
  const matchQtd = descAtual.match(/^(\d+)x /);
  const matchDims = descAtual.match(/\((\d+)x(\d+)x(\d+)cm\)$/);
  const qtd = matchQtd ? parseInt(matchQtd[1], 10) : 1;
  const volumeM3 = matchDims
    ? calcularVolumeM3(parseInt(matchDims[1]), parseInt(matchDims[2]), parseInt(matchDims[3])) * qtd
    : 0;

  // Se cliente nao soube peso, estima via volume (densidade media 200kg/m3 — chute conservador
  // pra nao sub-estimar veiculo. Materiais densos (aco) precisam peso real ou vai pra HR/caminhao).
  const pesoEstimado = pesoKg ?? Math.max(volumeM3 * 200, 10);
  const veiculo = sugerirVeiculoPorVolumePeso(volumeM3, pesoEstimado);

  const veiculoNome: Record<string, string> = {
    utilitario: "Utilitario (Strada/Saveiro)",
    hr: "HR",
    caminhao_bau: "Caminhao Bau (Iveco Daily)",
  };

  // Resumo final em descricao_carga
  const descFinal = pesoKg
    ? `${descAtual} - ${pesoKg}kg total`
    : `${descAtual} - peso nao informado (estimado ${pesoEstimado.toFixed(0)}kg)`;

  // Carga acima do que Pegue tem (>12m³ ou >2500kg) → escala humano
  if (veiculo === "carga_excedida") {
    await updateSession(phone, {
      step: "atendimento_humano",
      descricao_carga: descFinal,
    });
    await notificarAdmins(
      `📦 *CARGA GRANDE - ESPECIALISTA*`,
      phone,
      `Cliente tem carga acima do nosso maior veiculo (Iveco Daily 2500kg/12m³).\n\nDescricao: ${descFinal}\nVolume total: ${volumeM3.toFixed(2)}m³\nPeso estimado: ${pesoEstimado.toFixed(0)}kg\n\nPrecisa cotar manual ou indicar parceiro com caminhao maior.`
    );
    await sendToClient({
      to: phone,
      message: `Sua carga eh GRANDE! 📦\n\n📐 Volume: ${volumeM3.toFixed(2)}m³\n⚖️ Peso: ${pesoEstimado.toFixed(0)}kg\n\nEsse porte passa do nosso maior caminhao. Um *especialista* ja foi notificado e vai te chamar pra cotar manualmente. Aguarda 1 momento 🙏`,
    });
    return;
  }

  await updateSession(phone, {
    step: "aguardando_destino",
    descricao_carga: descFinal,
    veiculo_sugerido: veiculo,
  });

  await sendToClient({
    to: phone,
    message: `Beleza! Resumo:\n\n📦 ${descFinal}\n📐 Volume total: ${volumeM3.toFixed(2)}m³\n🚚 Veiculo sugerido: *${veiculoNome[veiculo]}*\n\nE pra onde a gente leva? Me manda o endereco ou CEP do destino 🏠`,
  });
}

// Handler do step confirmando_origem
async function handleConfirmandoOrigem(phone: string, message: string) {
  const lower = message.toLowerCase().trim();
  const session = await getSession(phone);
  if (!session) return;

  const confirmou = lower === "1" || lower.startsWith("sim") || lower === "confirmar" || lower === "confirmo" || lower === "correto" || lower === "ok";
  const corrigiu = lower === "2" || lower === "nao" || lower === "não" || lower === "corrigir" || lower.includes("outro");

  if (confirmou) {
    await updateSession(phone, { step: "aguardando_foto" });
    await sendToClient({
      to: phone,
      message: `Anotado! ✅\n\n📸 Agora manda *Foto do Objeto*\n✏️ Ou *digita* (ex: geladeira, sofa, 3 caixas)\n📋 Ou digite *3* para selecionar os itens que quer enviar`,
    });
    return;
  }

  if (corrigiu) {
    await updateSession(phone, {
      step: "aguardando_localizacao",
      origem_endereco: null,
      origem_lat: null,
      origem_lng: null,
    });
    await sendToClient({
      to: phone,
      message: "Sem problema! Me manda o *endereço de retirada correto* 📍\n\nToca no *icone de anexo* (canto inferior direito) > *Localizacao* (mais preciso)\n\nOu digita rua + bairro + cidade.",
    });
    return;
  }

  await sendToClient({
    to: phone,
    message: "Responde:\n\n1️⃣ *CONFIRMAR*\n2️⃣ *CORRIGIR*",
  });
}

// Handler do step confirmando_destino
async function handleConfirmandoDestino(phone: string, message: string) {
  const lower = message.toLowerCase().trim();
  const session = await getSession(phone);
  if (!session) return;

  const confirmou = lower === "1" || lower.startsWith("sim") || lower === "confirmar" || lower === "confirmo" || lower === "correto" || lower === "ok";
  const corrigiu = lower === "2" || lower === "nao" || lower === "não" || lower === "corrigir" || lower.includes("outro");

  if (confirmou) {
    await updateSession(phone, { step: "aguardando_tipo_local" });
    const cidadeDestino = (session.destino_endereco || "").split(",").pop()?.trim() || session.destino_endereco || "";
    await sendToClient({ to: phone, message: MSG.destinoRecebido(cidadeDestino) });
    return;
  }

  if (corrigiu) {
    await updateSession(phone, {
      step: "aguardando_destino",
      destino_endereco: null,
      destino_lat: null,
      destino_lng: null,
    });
    await sendToClient({
      to: phone,
      message: "Sem problema! Me manda o endereço correto 🏠\n\n*Rua, número e bairro*\nOu o CEP",
    });
    return;
  }

  await sendToClient({
    to: phone,
    message: "Responde:\n\n1️⃣ *CONFIRMAR*\n2️⃣ *CORRIGIR*",
  });
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
    await sendToClient({
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
    // Aviso critico: cliente precisa verificar se itens cabem no elevador.
    // Se no dia da coleta nao couber, vira escada = custo adicional na hora.
    await sendToClient({
      to: phone,
      message: `🛗 Local com elevador, anotado! ✅\n\n⚠️ *Importante:* confirme se *TODOS os itens cabem no elevador*.\n\nSe algum item não couber e precisar descer/subir pela escada, será cobrada *taxa adicional no dia* (ajudante extra e tempo).\n\nSe tiver dúvida (móveis grandes como sofá retrátil, armário, cama king), melhor escolher *3 - escada* pra evitar surpresa.`,
    });
    await sendToClient({
      to: phone,
      message: MSG.precisaAjudante("Vamos seguir?"),
    });
    return;
  }

  if (lower === "3" || lower.includes("escada") || lower.includes("sem elevador")) {
    await updateSession(phone, { step: "aguardando_andar", tem_escada: true });
    await sendToClient({ to: phone, message: MSG.qualAndar });
    return;
  }

  await sendToClient({
    to: phone,
    message: "Escolhe uma opcao, por favor! 😊\n\n1️⃣ *Local Terreo*\n2️⃣ *Local com elevador*\n3️⃣ *Local com escada*",
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
    await sendToClient({
      to: phone,
      message: MSG.precisaAjudante(`${andar}o andar por escada, anotado! ✅`),
    });
    return;
  }

  await sendToClient({
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
    await sendToClient({
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
  let totalAntes = precos.padrao.total + ajudanteExtra;

  // Aplica regras de ajuste manual (criadas pelo admin via WhatsApp ou painel)
  // Nao mexe na formula base - soma depois como excecao
  const { aplicarAjustes } = await import("@/lib/ajustes-precos");
  const qtdItensTotal = (session.descricao_carga || "").split(",").length;
  const { precoFinal } = await aplicarAjustes(totalAntes, {
    veiculo,
    zona: precos.zona,
    km: distanciaKm,
    qtdItens: qtdItensTotal,
    comAjudante: qtdAjudantes > 0,
  });

  // CAMADA 1 + 2: Sanidade de preco (limite absoluto + comparacao historica)
  // Se preco anomalo, cotacao fica em "revisao_admin" e cliente espera aprovacao manual
  const { validarPrecoFinal } = await import("@/lib/sanidade-preco");
  const sanidade = await validarPrecoFinal(precoFinal, {
    veiculo,
    km: distanciaKm,
    qtdItens: qtdItensTotal,
    temAjudante: qtdAjudantes > 0,
  });

  let precoValidado: number;
  let emRevisao = false;

  if (!sanidade.ok) {
    // Preco anomalo detectado - nao envia pro cliente, notifica admin
    emRevisao = true;
    precoValidado = sanidade.precoOriginal;

    await updateSession(phone, {
      step: "aguardando_revisao_admin",
      distancia_km: distanciaKm,
      valor_estimado: precoValidado,
    });

    // Mensagem calma pro cliente
    await sendToClient({ to: phone, message: MSG.precoEmRevisao });

    // Notifica admin com TUDO pra decidir
    await notificarAdmin(
      `🚨 *PRECO EM REVISAO (${sanidade.tipo === "acima_max" ? "acima do limite" : "anomalia historica"})*`,
      phone,
      `${sanidade.motivo}

📦 *Pedido:*
Veiculo: ${veiculo}
Origem: ${session.origem_endereco || "-"}
Destino: ${session.destino_endereco || "-"}
Distancia: ${distanciaKm}km
Itens: ${session.descricao_carga || "-"}
Ajudante: ${qtdAjudantes > 0 ? "Sim" : "Nao"}

💰 *Preco calculado: R$ ${precoValidado}*

O cliente recebeu mensagem de espera. Acesse o admin pra aprovar ou ajustar.`
    );
    return; // Para aqui, nao continua o fluxo normal
  }

  // Preco ok (ou ajustado pra minimo pela camada 1)
  precoValidado = sanidade.preco;

  const p = {
    ...precos.padrao,
    total: precoValidado,
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

  await sendToClient({
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
      await sendToClient({
        to: phone,
        message: `📅 *${dataExtraida}* - Anotado!\n\nAgora informe o *horario*:\n\n1️⃣ *Manha* (08:00 - 12:00)\n2️⃣ *Tarde* (13:00 - 17:00)\n\nOu digite o horario direto (ex: *14h*, *15:30*, *9 horas*)`,
      });
      return;
    } else if (!dataExtraida && horarioExtraido) {
      // So tem horario, pede data
      await sendToClient({
        to: phone,
        message: `⏰ *${horarioExtraido}* - Anotado!\n\nAgora informe o *dia*:\n\nExemplo: *25/04*, *amanha*, *segunda*`,
      });
      // Salva horario temporariamente no periodo
      await updateSession(phone, { periodo: horarioExtraido });
      return;
    } else {
      // Nao entendeu nada
      await sendToClient({
        to: phone,
        message: `📅 *Pra agendar, preciso do dia e horario* 😊\n\nEssas informacoes sao essenciais pra garantir o melhor atendimento!\n\nVoce pode enviar tudo junto ou um de cada vez:\n\n*Exemplos:*\n• *25/04 as 15h*\n• *amanha 14:30*\n• *segunda 9h*\n• *25/04* (depois pergunto o horario)\n• *15h* (depois pergunto o dia)\n\nOu digite *AGORA* se for urgente`,
      });
      return;
    }
  }

  // Re-le sessao pra pegar data_agendada atualizado
  const sessaoAtualizada = await getSession(phone);
  const dataFinal = sessaoAtualizada?.data_agendada || message;

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

  // Se tem credito de corrida anterior pendente, mostra a conta pro cliente
  const { data: logCreditoPend } = await supabase
    .from("bot_logs")
    .select("payload")
    .filter("payload->>tipo", "eq", "credito_corrida_anterior")
    .filter("payload->>phone", "eq", phone)
    .order("criado_em", { ascending: false })
    .limit(1);
  if (logCreditoPend?.[0]) {
    const creditoAnt = Number((logCreditoPend[0].payload as any)?.credito_anterior || 0);
    if (creditoAnt > 0) {
      const valorBruto = Number(session.valor_estimado || 0);
      const diff = Math.max(0, valorBruto - creditoAnt);
      detalhes += `\n💳 Valor da nova cotacao: R$ ${valorBruto.toFixed(2)}\n💰 Ja pago (frete anterior): -R$ ${creditoAnt.toFixed(2)}\n✨ Voce paga apenas: *R$ ${diff.toFixed(2)}*\n`;
    }
  }

  await sendToClient({
    to: phone,
    message: MSG.resumoFrete(
      session.origem_endereco || "Origem",
      session.destino_endereco || "Destino",
      session.descricao_carga || "Material",
      dataFinal,
      veiculoNome[veiculo] || "Utilitario",
      (session.valor_estimado || 0).toString(),
      detalhes
    ),
  });
}

// STEP 7: Confirmacao
async function handleConfirmacao(phone: string, message: string, instance: 1 | 2 = 1) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  if (lower === "1" || lower.startsWith("sim") || lower === "s" || lower === "confirmar" || lower === "confirmo" || lower === "correto") {
    const corridaId = await salvarCorrida(session);

    if (corridaId) {
      await updateSession(phone, { step: "aguardando_fretista", corrida_id: corridaId });

      // Informa que esta reservando a agenda
      await sendToClient({ to: phone, message: MSG.freteRecebido });

      // Dispara para fretistas e aguarda resposta
      await dispararParaFretistas(corridaId, session, phone);
    } else {
      await sendToClient({ to: phone, message: MSG.erroInterno });
    }
  } else if (lower === "2" || lower === "alterar" || lower.includes("corrigir") || lower.includes("mudar") || lower.startsWith("nao") || lower === "n" || lower === "não") {
    // NAO reseta sessao - mostra menu de edicao preservando dados ja informados.
    // Cliente escolhe o que quer corrigir e volta pro step especifico.
    await updateSession(phone, { step: "editando_escolha" });
    await sendToClient({
      to: phone,
      message: `✏️ *O que você quer corrigir?*\n\n1️⃣ *Origem* (onde buscar)\n2️⃣ *Destino* (onde entregar)\n3️⃣ *Itens / material*\n4️⃣ *Data / horário*\n5️⃣ *Cancelar tudo* e começar do zero`,
    });
  } else {
    await sendToClient({
      to: phone,
      message: "1️⃣ ✅ *SIM* - Tudo certo, confirmar!\n2️⃣ ✏️ *ALTERAR* - Quero corrigir algo",
    });
  }
}

// Handler do menu de edicao - volta pro step especifico SEM perder dados.
// So a opcao 5 (cancelar tudo) realmente reseta a sessao.
async function handleEditandoEscolha(phone: string, message: string, instance: 1 | 2 = 1) {
  const lower = message.toLowerCase().trim();
  const session = await getSession(phone);
  if (!session) {
    await sendToClient({ to: phone, message: "Sua sessão expirou. Manda *oi* pra começar um novo atendimento 😊" });
    return;
  }

  // 1 - Origem
  if (lower === "1" || lower.includes("origem") || lower.includes("buscar") || lower.includes("retirada")) {
    await updateSession(phone, {
      step: "aguardando_localizacao",
      origem_endereco: null,
      origem_lat: null,
      origem_lng: null,
      distancia_km: null,
      valor_estimado: null, // preco vai recalcular
    });
    await sendToClient({
      to: phone,
      message: "Sem problema! Me manda a nova *localização de retirada* 📍\n\nToca no *icone de anexo* (canto inferior direito) > Localização\nOu digite o *CEP* ou *endereço completo com rua e bairro*",
    });
    return;
  }

  // 2 - Destino
  if (lower === "2" || lower.includes("destino") || lower.includes("entregar") || lower.includes("entrega")) {
    await updateSession(phone, {
      step: "aguardando_destino",
      destino_endereco: null,
      destino_lat: null,
      destino_lng: null,
      distancia_km: null,
      valor_estimado: null,
    });
    await sendToClient({
      to: phone,
      message: "Tranquilo! Me manda o novo *endereço de destino* 🏠\n\n*Rua, número e bairro* (obrigatório)\nOu o CEP do local",
    });
    return;
  }

  // 3 - Itens/material
  if (lower === "3" || lower.includes("itens") || lower.includes("item") || lower.includes("material") || lower.includes("carga")) {
    await updateSession(phone, {
      step: "aguardando_foto",
      descricao_carga: null,
      foto_url: null,
      veiculo_sugerido: null,
      valor_estimado: null,
    });
    await sendToClient({
      to: phone,
      message: "Sem problema! Como você prefere me passar os itens?\n\n1️⃣ *Foto* (manda foto do material)\n2️⃣ *Lista rápida* (números dos itens)\n3️⃣ *Texto* (descreve)",
    });
    return;
  }

  // 4 - Data/horario
  if (lower === "4" || lower.includes("data") || lower.includes("hora") || lower.includes("horario") || lower.includes("horário")) {
    await updateSession(phone, {
      step: "aguardando_data",
      data_agendada: null,
      periodo: null,
    });
    await sendToClient({
      to: phone,
      message: "Sem problema! Quando você quer o frete?\n\nMe manda:\n• *AGORA* se for urgente\n• *25/04 15h* pra agendar em uma data/horário específico",
    });
    return;
  }

  // 5 - Cancelar tudo (UNICA opcao que reseta)
  if (lower === "5" || lower.includes("cancelar") || lower.includes("zerar") || lower.includes("reiniciar") || lower.includes("comecar") || lower.includes("começar")) {
    await createSession(phone, instance);
    await updateSession(phone, { step: "aguardando_servico" });
    await sendToClient({
      to: phone,
      message: "Tudo bem, vamos começar do zero 😊\n\nO que você precisa?\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudança completa*\n3️⃣ *Guincho* (carro ou moto)\n4️⃣ *Dúvidas frequentes*",
    });
    return;
  }

  // Nao entendeu - repete o menu
  await sendToClient({
    to: phone,
    message: `Escolhe uma opção:\n\n1️⃣ *Origem*\n2️⃣ *Destino*\n3️⃣ *Itens*\n4️⃣ *Data/horário*\n5️⃣ *Cancelar tudo*`,
  });
}

// ===================================================================
// ADICIONAR ITENS a corrida ja contratada
// - Pequeno: adiciona na descricao sem cobrar (fretista e avisado)
// - Grande: cliente refaz cotacao. Sistema desconta valor ja pago.
//   Dispatch da nova corrida prioriza o fretista da corrida anterior.
// ===================================================================

async function buscarCorridaAtivaDoCliente(phone: string) {
  const { data } = await supabase
    .from("corridas")
    .select("id, codigo, status, prestador_id, descricao_carga, valor_estimado, valor_final, prestadores(telefone, nome)")
    .eq("status", "aceita")
    .order("criado_em", { ascending: false });

  if (!data) return null;

  // Filtra as corridas do cliente (join com clientes por telefone)
  const { data: clienteRow } = await supabase
    .from("clientes")
    .select("id")
    .eq("telefone", phone)
    .maybeSingle();

  if (!clienteRow) return null;

  const { data: corridaDoCliente } = await supabase
    .from("corridas")
    .select("id, codigo, status, prestador_id, descricao_carga, valor_estimado, valor_final, prestadores(telefone, nome)")
    .eq("cliente_id", clienteRow.id)
    .in("status", ["aceita", "paga"])
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  return corridaDoCliente || null;
}

// ============================================================
// FRETISTA reporta PROBLEMA no local (divergencia do combinado)
// Fluxo: tipo -> foto -> descricao -> notifica admin + timer 15min
// ============================================================

const TIPOS_DIVERGENCIA: Record<string, { label: string; emoji: string }> = {
  "1": { label: "cliente_ausente", emoji: "🚪" },
  "2": { label: "divergencia_horario", emoji: "⏰" },
  "3": { label: "itens_extras", emoji: "📦" },
  "4": { label: "local_diferente", emoji: "📍" },
  "5": { label: "objeto_diferente", emoji: "⚠️" },
  "6": { label: "outro", emoji: "❓" },
};

async function handleFretistaProblemaIniciar(phone: string) {
  // Verifica se fretista tem corrida ativa (aceita ou paga) pra reportar problema em cima dela
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id, nome")
    .eq("telefone", phone)
    .maybeSingle();

  if (!prestador) {
    await sendToClient({
      to: phone,
      message: "Esse comando é só pra fretistas cadastrados. Se você é cliente, digite *oi* pra iniciar uma cotação.",
    });
    return;
  }

  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, codigo, status")
    .eq("prestador_id", prestador.id)
    .in("status", ["aceita", "paga"])
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!corrida) {
    await sendToClient({
      to: phone,
      message: "Você não tem nenhum frete ativo no momento. Se for outro tipo de problema, fala com a Pegue: contato@chamepegue.com.br",
    });
    return;
  }

  await updateSession(phone, {
    step: "fretista_divergencia_tipo",
    corrida_id: corrida.id,
  });

  await sendToClient({
    to: phone,
    message: `🚨 *Registrar ocorrência — Frete ${corrida.codigo}*\n\nO que está acontecendo?\n\n1️⃣ 🚪 *Cliente ausente* (não atende / não responde)\n2️⃣ ⏰ *Divergência de horário* (cliente pediu pra adiar)\n3️⃣ 📦 *Itens a mais* do que foi cotado\n4️⃣ 📍 *Local diferente* (elevador quebrado, item não cabe, endereço errado)\n5️⃣ ⚠️ *Objeto em estado diferente* (já quebrado, sujo, etc)\n6️⃣ ❓ *Outro*\n\n⚠️ *Não saia do local antes de registrar.* Vamos resolver juntos.`,
  });
}

async function handleFretistaDivergenciaTipo(phone: string, message: string) {
  const lower = message.toLowerCase().trim();
  const session = await getSession(phone);
  if (!session || !session.corrida_id) return;

  const tipoConfig = TIPOS_DIVERGENCIA[lower];
  if (!tipoConfig) {
    await sendToClient({
      to: phone,
      message: "Responde com *1*, *2*, *3*, *4*, *5* ou *6* (tipo da ocorrência).",
    });
    return;
  }

  // Cria ocorrencia com tipo (sem foto nem descricao ainda)
  const { data: prestador } = await supabase.from("prestadores").select("id").eq("telefone", phone).single();
  const { data: corrida } = await supabase.from("corridas").select("cliente_id").eq("id", session.corrida_id).single();

  const { data: ocorrencia } = await supabase
    .from("ocorrencias")
    .insert({
      corrida_id: session.corrida_id,
      prestador_id: prestador?.id || null,
      cliente_id: corrida?.cliente_id || null,
      tipo: tipoConfig.label,
      status: "aberta",
    })
    .select("id")
    .single();

  await updateSession(phone, {
    step: "fretista_divergencia_foto",
    descricao_carga: ocorrencia?.id || null, // reaproveita campo pra passar ID da ocorrencia
  });

  await sendToClient({
    to: phone,
    message: `${tipoConfig.emoji} Registrado: *${tipoConfig.label.replace(/_/g, " ")}*\n\n📸 Agora manda uma *foto* que mostre a situação.\n\nExemplos:\n• Fachada do imóvel (com horário visível no celular)\n• Print de tentativa de contato\n• Foto do item/local divergente\n\nFoto é *obrigatória* pra registrar a ocorrência.`,
  });
}

async function handleFretistaDivergenciaFoto(phone: string, message: string, hasMedia: boolean, imageUrl: string | null) {
  const session = await getSession(phone);
  if (!session) return;

  const ocorrenciaId = session.descricao_carga; // reusamos o campo pra passar o ID

  if (!hasMedia || !imageUrl) {
    await sendToClient({
      to: phone,
      message: "Preciso de uma *foto* da situação. Manda pelo *icone de anexo* (canto inferior direito do WhatsApp) → Câmera.\n\nSem foto, não consigo registrar a ocorrência.",
    });
    return;
  }

  // Salva foto_url na ocorrencia
  if (ocorrenciaId) {
    await supabase
      .from("ocorrencias")
      .update({ foto_url: imageUrl })
      .eq("id", ocorrenciaId);
  }

  await updateSession(phone, { step: "fretista_divergencia_descricao" });

  await sendToClient({
    to: phone,
    message: "✅ Foto recebida!\n\nAgora me conta *por texto* o que aconteceu — seja detalhista, isso vai ser usado pra resolver a situação.\n\nEx: _\"Toquei interfone 5x, ninguém atendeu. Carro estacionado desde 14h30.\"_",
  });
}

async function handleFretistaDivergenciaDescricao(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const ocorrenciaId = session.descricao_carga;
  const descricao = message.trim().slice(0, 1000);

  if (descricao.length < 10) {
    await sendToClient({
      to: phone,
      message: "Me conta com mais detalhes, por favor (pelo menos 10 caracteres).",
    });
    return;
  }

  // Atualiza ocorrencia com descricao
  if (ocorrenciaId) {
    await supabase
      .from("ocorrencias")
      .update({ descricao })
      .eq("id", ocorrenciaId);
  }

  // Busca dados completos pra notificar admin
  const { data: ocorrencia } = await supabase
    .from("ocorrencias")
    .select("id, tipo, foto_url, descricao, corrida:corrida_id(id, codigo, valor_final, valor_estimado, origem_endereco, destino_endereco, descricao_carga, clientes(nome, telefone), prestadores(nome, telefone))")
    .eq("id", ocorrenciaId || "")
    .maybeSingle();

  const corrida = (ocorrencia?.corrida as any);
  const cliente = (corrida?.clientes as any) || {};
  const prestador = (corrida?.prestadores as any) || {};
  const valor = corrida?.valor_final || corrida?.valor_estimado || 0;

  const tipoLabel = (ocorrencia?.tipo || "").replace(/_/g, " ").toUpperCase();

  const detalhesAdmin = [
    `🏷️ *Código:* ${corrida?.codigo || "-"}`,
    `🆔 Ocorrência: ${ocorrencia?.id || "-"}`,
    `📋 *Tipo:* ${tipoLabel}`,
    ``,
    `👤 *CLIENTE*`,
    `Nome: ${cliente.nome || "-"}`,
    `Tel: ${cliente.telefone ? formatarTelefoneExibicao(cliente.telefone) : "-"}`,
    `📱 wa.me/${cliente.telefone || ""}`,
    ``,
    `🚚 *FRETISTA (reportou)*`,
    `Nome: ${prestador.nome || "-"}`,
    `Tel: ${prestador.telefone ? formatarTelefoneExibicao(prestador.telefone) : "-"}`,
    `📱 wa.me/${prestador.telefone || ""}`,
    ``,
    `💰 *Valor do frete:* R$ ${valor}`,
    `📍 *Origem:* ${corrida?.origem_endereco || "-"}`,
    `🏠 *Destino:* ${corrida?.destino_endereco || "-"}`,
    ``,
    `📝 *Relato do fretista:*`,
    descricao,
    ``,
    `📸 Foto: ${ocorrencia?.foto_url || "sem foto"}`,
    ``,
    `⏰ Fretista aguardando no local. Se em 15min não houver resolução, ele será liberado e taxa de 50% será processada.`,
    ``,
    `👉 Ligar pro cliente AGORA no número acima.`,
  ].join("\n");

  await notificarAdmins(
    `🚨 *OCORRÊNCIA NO FRETE — ${tipoLabel}*`,
    cliente.telefone || phone,
    detalhesAdmin
  );

  // Agenda timer: se em 15 min admin nao resolver, notifica pra liberar fretista
  await agendarTarefa("ocorrencia_timeout_admin", ocorrenciaId || "", 15 * 60 * 1000, {
    fretista_phone: phone,
    corrida_id: session.corrida_id,
  });

  // Reseta step do fretista (volta pro fluxo normal)
  await updateSession(phone, {
    step: "inicio",
    corrida_id: session.corrida_id,
    descricao_carga: null,
  });

  await sendToClient({
    to: phone,
    message: `✅ *Ocorrência registrada!*\n\nA Pegue vai entrar em contato com o cliente agora pra resolver.\n\n⏰ *Aguarde no local por até 15 minutos.*\n\nSe não houver solução nesse tempo, você será liberado e a taxa de *50%* do valor do frete (R$ ${valor ? Math.round(Number(valor) * 0.5) : "-"}) será processada pra você.\n\nQualquer dúvida, a equipe vai te chamar aqui.`,
  });
}

async function handleAdicionarIniciar(phone: string) {
  const corrida = await buscarCorridaAtivaDoCliente(phone);
  if (!corrida) {
    await sendToClient({
      to: phone,
      message: "Não encontrei nenhum frete ativo no seu nome 🤔\n\nPra adicionar itens, você precisa ter um frete já contratado e em andamento.\n\nSe quiser fazer uma nova cotação, me manda *oi* 😊",
    });
    return;
  }

  await updateSession(phone, {
    step: "adicionar_pequeno_grande",
    corrida_id: corrida.id,
  });

  await sendToClient({
    to: phone,
    message: `📦 Encontrei seu frete em andamento (código *${corrida.codigo}*)\n\nO item que você quer adicionar é:\n\n1️⃣ *Pequeno* (cabe na mão, tipo caixa pequena, sacola, utensílio) — adiciono sem custo extra\n\n2️⃣ *Grande* (móvel, eletrodoméstico, caixa grande) — precisa refazer cotação, mas só cobramos a *diferença* do que você já pagou\n\n3️⃣ *Cancelar* — não quero mais adicionar`,
  });
}

async function handleAdicionarPequenoGrande(phone: string, message: string) {
  const lower = message.toLowerCase().trim();
  const session = await getSession(phone);
  if (!session) return;

  // 1 - Pequeno
  if (lower === "1" || lower.includes("pequeno") || lower.includes("pequena")) {
    await updateSession(phone, { step: "adicionar_item_descricao" });
    await sendToClient({
      to: phone,
      message: `Beleza! Me manda:\n\n📸 Foto do item\n*OU*\n✍️ Descrição em texto (ex: "1 caixa de sapatos, 1 mochila")\n\nLembrando: só itens *pequenos* que cabem junto com o que já está no frete 😊`,
    });
    return;
  }

  // 2 - Grande - refazer cotacao
  if (lower === "2" || lower.includes("grande") || lower.includes("medio") || lower.includes("médio")) {
    if (!session.corrida_id) {
      await sendToClient({ to: phone, message: "Não consegui identificar seu frete atual. Manda *oi* pra recomeçar." });
      return;
    }

    // Busca valor ja pago na corrida anterior
    const { data: corridaAnt } = await supabase
      .from("corridas")
      .select("id, valor_final, valor_estimado")
      .eq("id", session.corrida_id)
      .single();

    const valorJaPago = Number(corridaAnt?.valor_final || corridaAnt?.valor_estimado || 0);
    const corridaAnteriorId = corridaAnt?.id;

    // Reseta sessao mas guarda referencia da corrida anterior
    await createSession(phone, session.instance_chatpro as 1 | 2 | undefined);
    await updateSession(phone, {
      step: "aguardando_servico",
      // Usamos os campos da session pra propagar pra proxima corrida via salvarCorrida
      // corrida_id fica null (nova cotacao). A referencia ao frete anterior vai em bot_logs
      // pra ser aplicada quando a nova corrida for salva.
    });

    // Salva referencia em bot_logs pra aplicar quando salvar nova corrida
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "credito_corrida_anterior",
        phone,
        corrida_anterior_id: corridaAnteriorId,
        credito_anterior: valorJaPago,
        criado_em: new Date().toISOString(),
      },
    });

    await sendToClient({
      to: phone,
      message: `Ok! Vamos refazer a cotação. 📝\n\nVocê já pagou *R$ ${valorJaPago.toFixed(2)}* na primeira cotação. Esse valor vai ser descontado do novo total.\n\nSe sobrar diferença, você paga só o que falta. Se ficar menor ou igual, não precisa pagar mais nada.\n\nE vamos priorizar o mesmo fretista que já está com seu frete. Combinado? 🚚\n\nMe manda a *localização de retirada* (ou digite o endereço):`,
    });

    await updateSession(phone, { step: "aguardando_localizacao" });
    return;
  }

  // 3 - Cancelar
  if (lower === "3" || lower.includes("cancelar")) {
    await updateSession(phone, { step: "aguardando_pagamento" }); // volta pro state que estava
    await sendToClient({
      to: phone,
      message: "Tudo bem, não vou adicionar nada. Seu frete continua como estava 😊",
    });
    return;
  }

  // Nao entendeu
  await sendToClient({
    to: phone,
    message: "Responde uma opção:\n\n1️⃣ *Pequeno*\n2️⃣ *Grande* (refazer cotação)\n3️⃣ *Cancelar*",
  });
}

async function handleAdicionarItemDescricao(phone: string, message: string, hasMedia: boolean = false, imageUrl: string | null = null) {
  const session = await getSession(phone);
  if (!session || !session.corrida_id) {
    await sendToClient({ to: phone, message: "Não achei seu frete 😕 Manda *oi* pra recomeçar." });
    return;
  }

  let descricaoNovaItem = "";

  if (hasMedia && imageUrl) {
    const analise = await analisarFotoIA(imageUrl);
    if (analise && Array.isArray(analise.itens)) {
      descricaoNovaItem = analise.itens.join(", ");
    } else {
      descricaoNovaItem = "Item adicional (foto enviada)";
    }
  } else if (message && message.trim().length > 2) {
    descricaoNovaItem = message.trim();
  } else {
    await sendToClient({
      to: phone,
      message: "Me descreve o item ou manda uma foto 😊",
    });
    return;
  }

  // Busca descricao atual da corrida
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, descricao_carga, prestadores(telefone, nome)")
    .eq("id", session.corrida_id)
    .single();

  const descricaoAtual = corrida?.descricao_carga || "";
  const novaDescricao = descricaoAtual
    ? `${descricaoAtual} + (adicional: ${descricaoNovaItem})`
    : `(adicional: ${descricaoNovaItem})`;

  await supabase
    .from("corridas")
    .update({ descricao_carga: novaDescricao })
    .eq("id", session.corrida_id);

  // Notifica fretista
  const prestador = (corrida?.prestadores as any);
  if (prestador?.telefone) {
    await sendToClient({
      to: prestador.telefone,
      message: `📦 *Atualização: cliente adicionou item ao frete ${(corrida as any)?.codigo || session.corrida_id}*\n\n➕ Novo item: ${descricaoNovaItem}\n\nLista atualizada: ${novaDescricao}\n\nSegue tudo normal — esse item vem junto com o resto.`,
    });
  }

  // Volta sessao pro state anterior
  await updateSession(phone, { step: "aguardando_pagamento" });

  await sendToClient({
    to: phone,
    message: `✅ Item adicionado ao seu frete!\n\n📦 ${descricaoNovaItem}\n\nO fretista já foi avisado. Sem custo adicional 😊`,
  });

  // Alerta admin pra caso de duvida
  await notificarAdmins(
    `➕ *CLIENTE ADICIONOU ITEM*`,
    phone,
    `Corrida: ${session.corrida_id}\nNovo item: ${descricaoNovaItem}\nLista atual: ${novaDescricao}`
  );
}

// Handler do step confirmar_contexto_inicial - cliente confirma o que IA entendeu
// da primeira mensagem e pulamos etapas ja resolvidas.
async function handleConfirmarContextoInicial(phone: string, message: string) {
  const lower = message.toLowerCase().trim();
  const session = await getSession(phone);
  if (!session) return;

  const confirmou = lower === "1" || lower.startsWith("sim") || lower === "s" || lower === "ok" || lower === "confirmar";
  const recusou = lower === "2" || lower.startsWith("nao") || lower.startsWith("não") || lower === "n";

  if (confirmou) {
    // Busca contexto extraido no bot_logs mais recente
    const { data: logCtx } = await supabase
      .from("bot_logs")
      .select("payload")
      .filter("payload->>tipo", "eq", "contexto_extraido_inicial")
      .filter("payload->>phone", "eq", phone)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    const contexto = (logCtx?.payload as any)?.contexto as ContextoExtraido | undefined;

    // Decide proximo step baseado no que ja tem na sessao
    if (contexto?.servico === "guincho") {
      await updateSession(phone, { step: "guincho_categoria" });
      await sendToClient({
        to: phone,
        message: `🚗 Certo! Guincho.\n\nPrecisa agora ou vai agendar?\n\n1️⃣ *Guincho Imediato* (preciso AGORA)\n2️⃣ *Guincho Agendado* (escolher dia e horario)`,
      });
      return;
    }

    // Frete ou mudanca: pode pular foto se ja detectou item
    if (session.descricao_carga) {
      // Item ja identificado, pula direto pra localizacao
      await updateSession(phone, { step: "aguardando_localizacao" });
      await sendToClient({
        to: phone,
        message: `Perfeito! Pulei a parte de identificar o material ✅\n\nAgora me manda a *localização de retirada* 📍\n\nToca no *icone de anexo* (canto inferior direito) > Localização\nOu digite o *endereço completo com rua e bairro*`,
      });
      return;
    }

    // Nao tem item, vai pro fluxo normal de escolha de servico
    await updateSession(phone, { step: "aguardando_servico" });
    if (contexto?.servico === "mudanca") {
      await handleEscolhaServico(phone, "2");
      return;
    }
    if (contexto?.servico === "frete") {
      await handleEscolhaServico(phone, "1");
      return;
    }

    await sendToClient({
      to: phone,
      message: `Vamos la! 🚚\n\nO que voce precisa?\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudanca completa*\n3️⃣ *Guincho*\n4️⃣ *Duvidas frequentes*`,
    });
    return;
  }

  if (recusou) {
    // Cliente prefere preencher do zero - limpa o que foi detectado e manda menu
    await updateSession(phone, {
      step: "aguardando_servico",
      descricao_carga: null,
      veiculo_sugerido: null,
    });
    await sendToClient({
      to: phone,
      message: `Sem problema! 😊 Vamos do inicio.\n\nO que voce precisa?\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudanca completa*\n3️⃣ *Guincho*\n4️⃣ *Duvidas frequentes*`,
    });
    return;
  }

  // Nao entendeu - repete opcoes
  await sendToClient({
    to: phone,
    message: `Por favor responda:\n\n1️⃣ ✅ *SIM* - vamos continuar\n2️⃣ ❌ *NÃO* - prefiro preencher tudo do zero`,
  });
}

// Handler do step confirmar_itens_foto - cliente confirma lista que IA identificou
async function handleConfirmarItensFoto(phone: string, message: string) {
  const lower = message.toLowerCase().trim();
  const session = await getSession(phone);
  if (!session) return;

  // 1 - SIM, seguir
  if (lower === "1" || lower.startsWith("sim") || lower === "s" || lower === "confirmar" || lower === "ok" || lower === "seguir" || lower === "correto") {
    await updateSession(phone, { step: "aguardando_localizacao" });
    await sendToClient({
      to: phone,
      message: `Anotado! ✅\n\nAgora me manda a *localização de retirada* 📍\n\nToca no *icone de anexo* (canto inferior direito) > Localização\nOu digite o *CEP* ou *endereço completo com rua e bairro*`,
    });
    return;
  }

  // 2 - ADICIONAR mais itens (manda outra foto)
  if (lower === "2" || lower.includes("adicionar") || lower.includes("mais")) {
    await updateSession(phone, { step: "aguardando_mais_fotos" });
    await sendToClient({
      to: phone,
      message: `Beleza! Manda a próxima foto 📸\n\n(Quando terminar, manda "pronto" pra seguir)`,
    });
    return;
  }

  // 3 - CORRIGIR (digita o que realmente é)
  if (lower === "3" || lower.includes("corrigir") || lower.includes("errado") || lower.includes("errou")) {
    await updateSession(phone, {
      step: "aguardando_foto",
      descricao_carga: null,
      veiculo_sugerido: null,
    });
    await sendToClient({
      to: phone,
      message: `Sem problema! Me descreve por texto o que precisa transportar 😊\n\nEx: *rack com TV em cima, sofá 2 lugares*\n\nOu manda nova foto mostrando tudo de uma vez.`,
    });
    return;
  }

  // Detecta se cliente digitou descricao direta (em vez dos numeros do menu)
  // Se mensagem tem mais de 10 chars e nao parece comando, trata como correção
  if (message.length > 10) {
    let veiculo = "utilitario";
    const itensDigitados = message.split(/[,;]/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (itensDigitados.length >= 8) veiculo = "caminhao_bau";
    else if (itensDigitados.length >= 3) veiculo = "hr";

    await updateSession(phone, {
      step: "aguardando_localizacao",
      descricao_carga: message.trim(),
      veiculo_sugerido: veiculo,
    });
    await sendToClient({
      to: phone,
      message: `Anotado! ✅ *${message.trim()}*\n\nAgora me manda a *localização de retirada* 📍`,
    });
    return;
  }

  // Nao entendeu
  await sendToClient({
    to: phone,
    message: `Responde uma das opções:\n\n1️⃣ *SIM*\n2️⃣ *ADICIONAR* mais itens\n3️⃣ *CORRIGIR*`,
  });
}

// Handler do step confirmando_destino

// === NUMERO E COMPLEMENTO DA COLETA (apos pagamento) ===
async function handleNumeroColeta(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session || !session.corrida_id) {
    await sendToClient({ to: phone, message: "Poxa, nao achei seu pedido ativo 😕 Manda *oi* pra recomecar." });
    return;
  }

  const detalhe = message.trim();
  // Valida minimamente: precisa ter pelo menos 1 digito (numero da casa/predio)
  if (detalhe.length < 1 || !/\d/.test(detalhe)) {
    await sendToClient({
      to: phone,
      message: "Preciso do *numero* do endereco de retirada pro fretista nao errar 😊\n\nExemplo:\n• *450*\n• *230, Casa 2*\n• *1500, Apto 12B*",
    });
    return;
  }

  // Concatena o detalhe no origem_endereco (mantem o original e anexa numero/complemento)
  const origemAtual = session.origem_endereco || "";
  const origemCompleta = origemAtual
    ? `${origemAtual} - Nº ${detalhe}`
    : `Nº ${detalhe}`;

  await supabase
    .from("corridas")
    .update({ origem_endereco: origemCompleta })
    .eq("id", session.corrida_id);

  // Passa pro proximo step: pede numero do DESTINO (fretista precisa pra entrega)
  await updateSession(phone, {
    origem_endereco: origemCompleta,
    step: "aguardando_numero_destino",
  });

  await sendToClient({
    to: phone,
    message: `✅ Retirada:\n*${origemCompleta}*\n\nAgora me manda o *número e complemento do endereço de entrega* 🏠\n\nExemplo:\n• *450, Apto 12B*\n• *230, Casa 2*\n• *1500, Bloco 3 Apto 45*\n\nSe for só número, manda só o número 👍`,
  });
}

// Apos receber numero do destino, finaliza o fluxo: notifica fretista com dados
// completos, manda orientacoes pro cliente e aciona pagamento (ou admin se OFF).
async function handleNumeroDestino(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session || !session.corrida_id) {
    await sendToClient({ to: phone, message: "Poxa, nao achei seu pedido ativo 😕 Manda *oi* pra recomecar." });
    return;
  }

  const detalhe = message.trim();
  if (detalhe.length < 1 || !/\d/.test(detalhe)) {
    await sendToClient({
      to: phone,
      message: "Preciso do *número* do endereço de entrega pro fretista entregar certinho 😊\n\nExemplo:\n• *450*\n• *230, Casa 2*\n• *1500, Apto 12B*",
    });
    return;
  }

  const destinoAtual = session.destino_endereco || "";
  const destinoCompleto = destinoAtual
    ? `${destinoAtual} - Nº ${detalhe}`
    : `Nº ${detalhe}`;

  await supabase
    .from("corridas")
    .update({ destino_endereco: destinoCompleto })
    .eq("id", session.corrida_id);

  await updateSession(phone, {
    destino_endereco: destinoCompleto,
    step: "aguardando_pagamento",
  });

  // Busca a corrida completa pra avisar fretista com tudo atualizado
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, origem_endereco, destino_endereco, descricao_carga, periodo, data_agendada, qtd_ajudantes, valor_final, prestadores(telefone, nome), clientes(nome, telefone)")
    .eq("id", session.corrida_id)
    .single();

  const prestador = (corrida?.prestadores as any);
  const origemCompleta = (corrida as any)?.origem_endereco || session.origem_endereco || "";

  // Verifica se pagamento estava habilitado: se estava, fretista ja recebeu detalhes
  // completos via pagamento/webhook (MP). Aqui so mandamos atualizacao de endereco.
  // Se pagamento estava OFF, e a primeira vez que fretista recebe detalhes completos.
  const { data: configPagto } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", "pagamento_automatico_fretista")
    .single();
  const pagamentoHabilitado = configPagto?.valor === "habilitado";

  if (prestador?.telefone) {
    if (pagamentoHabilitado) {
      await sendToClient({
        to: prestador.telefone,
        message: `📍 *Atualizacao do endereco de coleta:*\n\n${origemCompleta}\n\nO cliente complementou com o numero e detalhes. Boa coleta! 🚚`,
      });
    } else {
      // Sem pagamento: fretista recebe agora os detalhes completos do servico
      const cliente = (corrida?.clientes as any);
      const clienteNome = cliente?.nome || formatarTelefoneExibicao(cliente?.telefone || phone);
      const clienteTel = cliente?.telefone || phone;
      const qtdAjudantes = corrida?.qtd_ajudantes || 0;
      const ajudanteInfo = qtdAjudantes > 0
        ? `Com ${qtdAjudantes} ajudante${qtdAjudantes > 1 ? "s" : ""}`
        : "Sem ajudante";
      const isGuincho = (corrida?.descricao_carga || "").toLowerCase().includes("guincho");
      const dataFrete = corrida?.periodo || corrida?.data_agendada || "A combinar";

      await sendToClient({
        to: prestador.telefone,
        message: isGuincho
          ? `✅ *Servico de guincho confirmado!*\n\n👤 *Cliente:* ${clienteNome}\n📱 *Contato:* ${formatarTelefoneExibicao(clienteTel)}\n\n━━━━━━━━━━━━━━━━\n\n📍 *Coleta:* ${origemCompleta}\n🏠 *Destino:* ${corrida?.destino_endereco || "-"}\n🚗 *Servico:* ${corrida?.descricao_carga || "-"}\n📅 *Data:* ${dataFrete}\n\n━━━━━━━━━━━━━━━━\n\n⚠️ *PROTOCOLO OBRIGATORIO:*\n📸 Fotografe o veiculo *ANTES* de carregar (frontal, traseira, laterais)\n📸 Fotografe o veiculo *APOS* descarregar\n📸 Fotografe danos pre-existentes\n🚫 Sem fotos = pagamento *BLOQUEADO*\n\n━━━━━━━━━━━━━━━━\n\n⏳ *APOS A ENTREGA:*\nAguarde no local ate o cliente confirmar que esta tudo certo.\n\nBom trabalho! 🚗✨`
          : `✅ *Servico confirmado!*\n\n👤 *Cliente:* ${clienteNome}\n📱 *Contato:* ${formatarTelefoneExibicao(clienteTel)}\n\n━━━━━━━━━━━━━━━━\n\n📍 *Retirada:* ${origemCompleta}\n🏠 *Entrega:* ${corrida?.destino_endereco || "-"}\n📦 *Material:* ${corrida?.descricao_carga || "-"}\n📅 *Data:* ${dataFrete}\n🙋 *${ajudanteInfo}*\n\n━━━━━━━━━━━━━━━━\n\n⚠️ *PROTOCOLO OBRIGATORIO:*\n📸 Fotografe TODOS os itens na *COLETA*\n📸 Fotografe TODOS os itens na *ENTREGA*\n🚫 Sem fotos = pagamento *BLOQUEADO*\n\n━━━━━━━━━━━━━━━━\n\n⏳ *APOS A ENTREGA:*\nAguarde no local ate o cliente confirmar que esta tudo certo.\n\nBom trabalho! 🚚✨`,
      });
    }
  }

  // Confirma pro cliente e manda orientacoes finais
  await sendToClient({
    to: phone,
    message: `✅ Endereços confirmados:\n📍 Retirada: *${origemCompleta}*\n🏠 Entrega: *${destinoCompleto}*\n\nJá avisei o fretista pra ir direitinho nos endereços certos! 🚚`,
  });

  await sendToClient({
    to: phone,
    message: MSG.orientacoesCliente,
  });

  // Se pagamento automatico esta OFF, avisa que equipe enviara link manualmente
  // e notifica admin pra tomar acao
  if (!pagamentoHabilitado) {
    await sendToClient({
      to: phone,
      message: MSG.aguardarLinkPagamentoAvulso,
    });

    // Busca dados completos pra notificacao admin rica (evita campos "-" vazios)
    const { data: corridaCompleta } = await supabase
      .from("corridas")
      .select("codigo, valor_estimado, valor_final, valor_prestador, descricao_carga, periodo, data_agendada, qtd_ajudantes, prestadores(nome, telefone), clientes(nome, telefone)")
      .eq("id", session.corrida_id!)
      .single();

    const cliente = (corridaCompleta?.clientes as any) || {};
    const prestadorInfo = (corridaCompleta?.prestadores as any) || {};
    const valorCliente = corridaCompleta?.valor_final || corridaCompleta?.valor_estimado || 0;
    const valorFretista = corridaCompleta?.valor_prestador || Math.round(Number(valorCliente) * 0.88);
    const dataFrete = corridaCompleta?.periodo || corridaCompleta?.data_agendada || "A combinar";
    const ajudanteInfo = (corridaCompleta?.qtd_ajudantes || 0) > 0
      ? `Sim (${corridaCompleta?.qtd_ajudantes})`
      : "Nao";

    const detalhesRicos = [
      `🏷️ *Codigo:* ${corridaCompleta?.codigo || "-"}`,
      `🆔 ${session.corrida_id}`,
      ``,
      `👤 *CLIENTE*`,
      `Nome: ${cliente.nome || "-"}`,
      `Tel: ${formatarTelefoneExibicao(cliente.telefone || phone)}`,
      `📱 wa.me/${cliente.telefone || phone}`,
      ``,
      `🚚 *FRETISTA que aceitou*`,
      `Nome: ${prestadorInfo.nome || "-"}`,
      `Tel: ${prestadorInfo.telefone ? formatarTelefoneExibicao(prestadorInfo.telefone) : "-"}`,
      `📱 ${prestadorInfo.telefone ? `wa.me/${prestadorInfo.telefone}` : "-"}`,
      ``,
      `💰 *VALORES*`,
      `Cliente paga: *R$ ${valorCliente}*`,
      `Fretista recebe: R$ ${valorFretista}`,
      `Pegue recebe: R$ ${Number(valorCliente) - Number(valorFretista)}`,
      ``,
      `📦 *SERVICO*`,
      `Carga: ${corridaCompleta?.descricao_carga || "-"}`,
      `Ajudante: ${ajudanteInfo}`,
      `Data: ${dataFrete}`,
      `Origem: ${origemCompleta}`,
      `Destino: ${destinoCompleto}`,
      ``,
      `👉 Gera o link de pagamento no MP (R$ ${valorCliente}) e envia pro cliente via WhatsApp.`,
    ].join("\n");

    await notificarAdmin(
      `💳 *ENVIAR LINK DE PAGAMENTO*`,
      phone,
      detalhesRicos
    );
  }
}

// === CONTRAOFERTA DE DATA (cliente responde proposta do fretista) ===
// === AVALIACAO DE PRECOS PELOS FRETISTAS ===

// Estado temporario guardado em bot_logs (tipo = "avaliacao_estado_fretista")
async function getEstadoAvaliacao(phone: string): Promise<{
  veiculos: string[];
  simAtual: SimulacaoAvaliacao | null;
  total: number;
} | null> {
  const { data } = await supabase
    .from("bot_logs")
    .select("payload")
    .filter("payload->>tipo", "eq", "avaliacao_estado_fretista")
    .filter("payload->>phone", "eq", phone)
    .order("criado_em", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return null;
  const p = data[0].payload as any;
  return {
    veiculos: p.veiculos || [],
    simAtual: p.simAtual || null,
    total: p.total || 0,
  };
}

async function salvarEstadoAvaliacao(phone: string, estado: {
  veiculos: string[];
  simAtual: SimulacaoAvaliacao | null;
  total: number;
}) {
  await supabase.from("bot_logs").insert({
    payload: { tipo: "avaliacao_estado_fretista", phone, ...estado },
  });
}

async function handleAvaliarIniciar(phone: string) {
  await updateSession(phone, { step: "avaliar_escolher_veiculos" });
  await sendToClient({ to: phone, message: MSG.avaliarIntro });
}

async function handleAvaliarEscolherVeiculos(phone: string, message: string) {
  const lower = message.toLowerCase().trim();

  if (lower === "parar" || lower === "sair" || lower === "cancelar") {
    await updateSession(phone, { step: "inicio" });
    await sendToClient({ to: phone, message: "Ok, sem problema! Qualquer hora digite *AVALIAR* pra recomecar. 🚚" });
    return;
  }

  // Parseia numeros da mensagem (aceita "2", "2 3", "2,3", "2, 3")
  const numeros = message.match(/[1-4]/g);
  if (!numeros || numeros.length === 0) {
    await sendToClient({ to: phone, message: MSG.avaliarOpcaoInvalida });
    return;
  }

  const mapaVeiculos: Record<string, string> = {
    "1": "carro_comum",
    "2": "utilitario",
    "3": "hr",
    "4": "caminhao_bau",
  };
  const veiculos = [...new Set(numeros.map(n => mapaVeiculos[n]).filter(Boolean))];

  if (veiculos.length === 0) {
    await sendToClient({ to: phone, message: MSG.avaliarOpcaoInvalida });
    return;
  }

  const nomes = veiculos.map(nomeVeiculoAval).join(", ");
  await sendToClient({ to: phone, message: MSG.avaliarIniciando(nomes) });

  // Gera primeira simulacao
  const sim = gerarSimulacao(veiculos);
  await salvarEstadoAvaliacao(phone, { veiculos, simAtual: sim, total: 0 });
  await updateSession(phone, { step: "avaliar_aguardando_preco" });

  await new Promise(r => setTimeout(r, 1000));
  await sendToClient({ to: phone, message: formatarMensagemSimulacao(sim, 1) });
}

async function handleAvaliarAguardandoPreco(phone: string, message: string) {
  const lower = message.toLowerCase().trim();
  const estado = await getEstadoAvaliacao(phone);

  if (!estado || !estado.simAtual) {
    await updateSession(phone, { step: "inicio" });
    await sendToClient({ to: phone, message: "Ops, perdi o contexto da avaliacao. Digite *AVALIAR* pra comecar de novo." });
    return;
  }

  // PARAR finaliza
  if (lower === "parar" || lower === "sair" || lower === "cancelar" || lower === "fim" || lower === "chega") {
    await updateSession(phone, { step: "inicio" });
    await sendToClient({ to: phone, message: MSG.avaliarFinalizado(estado.total) });
    return;
  }

  // PROXIMO pula sem avaliar
  if (lower === "proximo" || lower === "próximo" || lower === "pular" || lower === "skip") {
    const sim = gerarSimulacao(estado.veiculos);
    await salvarEstadoAvaliacao(phone, { ...estado, simAtual: sim });
    await sendToClient({ to: phone, message: "⏭️ Pulado. Proximo frete:" });
    await new Promise(r => setTimeout(r, 500));
    await sendToClient({ to: phone, message: formatarMensagemSimulacao(sim, estado.total + 1) });
    return;
  }

  // Tenta extrair numero (aceita "R$ 450", "450", "450,00", "450.00", "R$ 450,00")
  const numMatch = message.replace(/[^\d]/g, "");
  const preco = parseInt(numMatch);
  if (!preco || preco < 50 || preco > 10000) {
    await sendToClient({ to: phone, message: MSG.avaliarPrecoInvalido });
    return;
  }

  const sim = estado.simAtual;
  const gap = ((preco - sim.precoPegue) / sim.precoPegue) * 100;

  // Busca nome do fretista se cadastrado
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("nome")
    .eq("telefone", phone)
    .maybeSingle();

  // Salva feedback (prefixo "👑 Admin" se for admin)
  const nomeFretista = isAdminPhone(phone)
    ? `👑 Admin ${prestador?.nome || ""}`.trim()
    : (prestador?.nome || null);
  await supabase.from("feedback_precos").insert({
    fretista_phone: phone,
    fretista_nome: nomeFretista,
    veiculo: sim.veiculo,
    rota_id: sim.rota.id,
    origem: sim.rota.origem,
    destino: sim.rota.destino,
    distancia_km: sim.rota.km,
    zona: sim.rota.zonaDestino,
    itens: sim.itens.join(" + "),
    qtd_itens: sim.qtdItens,
    tem_ajudante: sim.temAjudante,
    preco_pegue: sim.precoPegue,
    preco_sugerido: preco,
    gap_percentual: Math.round(gap * 100) / 100,
  });

  const novoTotal = estado.total + 1;
  await sendToClient({ to: phone, message: MSG.avaliarRespostaSalva(sim.precoPegue, preco) });

  // ADMIN ONLY: se for admin e o gap for significativo (>= 5% ou <= -5%),
  // pergunta se quer JA aplicar como regra de ajuste.
  // Essa funcionalidade SO funciona pros admins (env ADMIN_PHONES), outros numeros ignoram.
  const adminSignificativo = isAdminPhone(phone) && Math.abs(gap) >= 5;
  if (adminSignificativo) {
    const criterios = criteriosMediaDaSimulacao(sim);
    // Guarda criterios + ajuste a aplicar no estado pra handler confirmar depois
    const pendingAjuste = {
      criterios,
      fatorMultiplicador: preco / sim.precoPegue,
      gapPct: Math.round(gap * 100) / 100,
    };
    await salvarEstadoAvaliacao(phone, { ...estado, simAtual: estado.simAtual, total: novoTotal, pendingAjuste } as any);
    await updateSession(phone, { step: "admin_confirmar_ajuste" });

    // Calcula impacto historico: busca corridas similares dos ultimos 30 dias
    const trintaDias = new Date();
    trintaDias.setDate(trintaDias.getDate() - 30);
    const { data: historicas } = await supabase
      .from("corridas")
      .select("valor_estimado, valor_final")
      .eq("tipo_veiculo", sim.veiculo)
      .gte("distancia_km", criterios.km_min)
      .lte("distancia_km", criterios.km_max)
      .gte("criado_em", trintaDias.toISOString())
      .in("status", ["aceita", "paga", "concluida"]);

    const valoresHist = (historicas || []).map(c => c.valor_final || c.valor_estimado || 0).filter(v => v > 0);
    const fatAntes = valoresHist.reduce((a, b) => a + b, 0);
    const fatDepois = fatAntes * (preco / sim.precoPegue);
    const impactoHist = {
      qtdSimilares: valoresHist.length,
      faturamentoAntes: fatAntes,
      faturamentoDepois: fatDepois,
    };

    await new Promise(r => setTimeout(r, 800));
    await sendToClient({
      to: phone,
      message: MSG.adminPerguntaAjuste(
        nomeVeiculoAval(sim.veiculo),
        sim.rota.zonaDestino,
        criterios.km_min,
        criterios.km_max,
        criterios.qtd_itens_min,
        criterios.qtd_itens_max,
        sim.temAjudante,
        Math.round(gap * 100) / 100,
        impactoHist,
      ),
    });
    return;
  }

  // Fluxo normal: gera proxima simulacao direto
  const proxima = gerarSimulacao(estado.veiculos);
  await salvarEstadoAvaliacao(phone, { ...estado, simAtual: proxima, total: novoTotal });

  await new Promise(r => setTimeout(r, 800));
  await sendToClient({ to: phone, message: formatarMensagemSimulacao(proxima, novoTotal + 1) });
}

// Handler do step admin_confirmar_ajuste (SOMENTE admins)
async function handleAdminConfirmarAjuste(phone: string, message: string) {
  // Proteção: se qualquer número que NÃO seja admin chegar aqui, ignora
  // (isso não deveria acontecer, mas é uma defesa em profundidade)
  if (!isAdminPhone(phone)) {
    await updateSession(phone, { step: "inicio" });
    await sendToClient({ to: phone, message: "Comando nao reconhecido. Digite *oi* pra comecar." });
    return;
  }

  const lower = message.toLowerCase().trim();
  const estado = await getEstadoAvaliacao(phone);
  if (!estado) {
    await updateSession(phone, { step: "inicio" });
    return;
  }
  const pendingAjuste = (estado as any).pendingAjuste;

  const confirmou = lower === "1" || lower === "sim" || lower === "aplicar";
  const cancelou = lower === "2" || lower === "nao" || lower === "não";

  if (confirmou && pendingAjuste) {
    // Cria regra em ajustes_precos
    const { criterios, fatorMultiplicador, gapPct } = pendingAjuste;
    await supabase.from("ajustes_precos").insert({
      veiculo: criterios.veiculo,
      zona: criterios.zona,
      km_min: criterios.km_min,
      km_max: criterios.km_max,
      qtd_itens_min: criterios.qtd_itens_min,
      qtd_itens_max: criterios.qtd_itens_max,
      com_ajudante: criterios.com_ajudante,
      fator_multiplicador: Math.round(fatorMultiplicador * 1000) / 1000,
      valor_fixo: 0,
      descricao: `Ajuste via WhatsApp (${gapPct > 0 ? "+" : ""}${gapPct}%)`,
      ativo: true,
    });
    invalidarCacheAjustes(); // forca recarga das regras no cache

    await sendToClient({ to: phone, message: MSG.adminAjusteAplicado });
  } else if (cancelou) {
    await sendToClient({ to: phone, message: MSG.adminAjusteNaoAplicado });
  } else {
    await sendToClient({ to: phone, message: "Responda *1* pra aplicar ou *2* pra so guardar o feedback" });
    return;
  }

  // Retoma o loop de avaliacao com proxima simulacao
  const proxima = gerarSimulacao(estado.veiculos);
  await salvarEstadoAvaliacao(phone, { veiculos: estado.veiculos, simAtual: proxima, total: estado.total });
  await updateSession(phone, { step: "avaliar_aguardando_preco" });

  await new Promise(r => setTimeout(r, 800));
  await sendToClient({ to: phone, message: formatarMensagemSimulacao(proxima, estado.total + 1) });
}

async function handleContraofertaData(phone: string, message: string) {
  const lower = message.toLowerCase().trim();
  const session = await getSession(phone);

  if (!session?.corrida_id) {
    await sendToClient({ to: phone, message: "Poxa, nao achei seu pedido 😕 Manda *oi* pra recomecar." });
    return;
  }

  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, periodo, contraoferta_prestador_id, contraoferta_data, contraoferta_prestador:contraoferta_prestador_id(id, nome, telefone)")
    .eq("id", session.corrida_id)
    .single();

  if (!corrida?.contraoferta_prestador_id || !corrida.contraoferta_data) {
    await sendToClient({ to: phone, message: "Essa proposta ja expirou 😕 Manda *oi* pra recomecar." });
    await updateSession(phone, { step: "concluido" });
    return;
  }

  const prestador = (corrida as any).contraoferta_prestador;
  const fretistaNome = prestador?.nome || "O fretista";
  const fretistaTel = prestador?.telefone;

  const aceitou = lower === "1" || lower === "sim" || lower === "aceito" || lower === "aceitar";
  const recusou = lower === "2" || lower === "nao" || lower === "não" || lower === "recusar";

  if (aceitou) {
    // Cliente aceitou: atualiza corrida com novo prestador e nova data, pula pagamento
    await supabase
      .from("corridas")
      .update({
        prestador_id: corrida.contraoferta_prestador_id,
        periodo: corrida.contraoferta_data,
        status: "aceita",
        contraoferta_prestador_id: null,
        contraoferta_data: null,
        contraoferta_criada_em: null,
      })
      .eq("id", corrida.id);

    await updateSession(phone, { step: "aguardando_pagamento" });

    await sendToClient({
      to: phone,
      message: `✅ Fechado! Frete confirmado com *${fretistaNome}* pra *${corrida.contraoferta_data}*.\n\nVou enviar o link de pagamento em instantes! 💰`,
    });

    if (fretistaTel) {
      await sendToClient({
        to: fretistaTel,
        message: `✅ *Cliente aceitou sua sugestao!*\n\nFrete confirmado pra *${corrida.contraoferta_data}*.\n\nAssim que o pagamento for confirmado, voce recebe os detalhes completos pra coleta. 🚚`,
      });
    }

    // Notifica admin
    await notificarAdmin(
      `✅ *Contraoferta aceita*`,
      phone,
      `Fretista: ${fretistaNome}\nData nova: ${corrida.contraoferta_data}\nCorrida: ${corrida.id}`
    );
    return;
  }

  if (recusou) {
    // Cliente recusou: limpa contraoferta, re-dispatch pros demais na data original
    await supabase
      .from("corridas")
      .update({
        contraoferta_prestador_id: null,
        contraoferta_data: null,
        contraoferta_criada_em: null,
      })
      .eq("id", corrida.id);

    if (fretistaTel) {
      await sendToClient({
        to: fretistaTel,
        message: `ℹ️ Cliente preferiu manter a data original. Obrigado pela disposicao! 🚚`,
      });
    }

    await sendToClient({
      to: phone,
      message: `✅ Entendido! Vou buscar outros parceiros pra data original *${corrida.periodo || ""}*. Te aviso em instantes!`,
    });

    // Tenta re-dispatch urgente excluindo quem ja sugeriu
    await reDispatchUrgente(corrida.id, session, phone, fretistaTel || undefined);
    return;
  }

  // Resposta nao entendida
  await sendToClient({
    to: phone,
    message: `Escolhe uma opcao:\n\n1️⃣ *SIM* - Aceito ${corrida.contraoferta_data} com ${fretistaNome}\n2️⃣ *NAO* - Prefiro manter ${corrida.periodo || "data original"}`,
  });
}

// === ATENDIMENTO HUMANO ===

async function handleAtendente(phone: string) {
  await updateSession(phone, { step: "atendimento_humano" });

  if (isHorarioAtendimentoHumano()) {
    await sendToClient({ to: phone, message: MSG.transferenciaHumano });
  } else {
    await sendToClient({ to: phone, message: MSG.foraHorarioHumano });
  }

  // IMPORTANTE: NAO mais notificar no WhatsApp - isso causou loop com bot externo
  // e gerou 48 notificacoes em minutos. Agora so registra no dashboard via bot_logs.
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "atendimento_solicitado",
      phone,
      dentro_horario: isHorarioAtendimentoHumano(),
      momento: new Date().toISOString(),
    },
  });
}

// === NOTIFICACAO ADMIN ===
// Wrapper fino sobre notificarAdmins (plural). Admin(s) configurado(s) via
// env var ADMIN_PHONES. Mantido como funcao local pra nao quebrar 10+ call sites.
async function notificarAdmin(titulo: string, clientePhone: string, detalhes: string) {
  const detalhesFormatados = `👤 Cliente: ${formatarTelefoneExibicao(clientePhone)}\n📱 wa.me/${clientePhone}\n${detalhes}\n\n⏰ ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  await notificarAdmins(titulo, clientePhone, detalhesFormatados);
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
      await sendToClient({ to: clientePhone, message: MSG.nenhumFretista });
      await notificarAdmin(
        isGuincho ? `⚠️ *NENHUM GUINCHEIRO DISPONIVEL*` : `⚠️ *NENHUM FRETISTA DISPONIVEL*`,
        clientePhone,
        `Corrida: ${corridaId}\nTipo: ${isGuincho ? "GUINCHO" : "FRETE"}\n📅 Data/Horario: ${session.data_agendada || "A combinar"}\nOrigem: ${session.origem_endereco}\nDestino: ${session.destino_endereco}\nValor: R$ ${session.valor_estimado}`
      );
      return;
    }

    let telefones = prestadores.map((p) => p.telefone);
    const valorPrestador = Math.round((session.valor_estimado || 0) * 0.88);

    // Se esta corrida tem corrida_anterior_id (fluxo refazer), prioriza o fretista
    // que pegou a corrida anterior: ele vai em primeiro lugar na lista de dispatch.
    // Os outros continuam tambem pra garantir que alguem pegue caso o anterior recuse.
    const { data: corridaInfoPriori } = await supabase
      .from("corridas")
      .select("corrida_anterior_id, corridas:corrida_anterior_id(prestador_id, prestadores(telefone))")
      .eq("id", corridaId)
      .single();

    const fretistaAnterior = ((corridaInfoPriori?.corridas as any)?.prestadores as any)?.telefone;
    if (fretistaAnterior && telefones.includes(fretistaAnterior)) {
      telefones = [fretistaAnterior, ...telefones.filter((t) => t !== fretistaAnterior)];
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "dispatch_priorizou_fretista_anterior",
          corrida_id: corridaId,
          fretista_prioritario: fretistaAnterior.replace(/\d(?=\d{4})/g, "*"),
        },
      });
    }

    await createDispatch(corridaId, telefones);

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

    // Disparo duplo - 2 mensagens pra chamar mais atencao (celular toca 2x)
    const alertaSom = isGuincho
      ? `🚨🚨🚨 *GUINCHO DISPONIVEL* 🚨🚨🚨\n\n⚡ Responda rapido! Primeiro que aceitar, leva!`
      : `🚨🚨🚨 *NOVO FRETE DISPONIVEL* 🚨🚨🚨\n\n⚡ Responda rapido! Primeiro que aceitar, leva!`;

    await sendToClients(telefones, alertaSom);
    await new Promise(r => setTimeout(r, 1500));
    await sendToClients(telefones, mensagem);

    // Timeouts agora sao tarefas agendadas no banco, executadas pelo cron
    // /api/cron/tarefas-agendadas. Sobrevivem a cold start e multiplas instancias.
    // - 31s: checa contraoferta. Se tiver, manda proposta pro cliente.
    // - 10min: se nada aconteceu, libera cliente e notifica admin.
    await agendarTarefa("dispatch_timeout_inicial", corridaId, 31_000, {
      isGuincho,
    });
    await agendarTarefa("dispatch_timeout_estendido", corridaId, 600_000, {
      isGuincho,
    });
  } catch (error: any) {
    console.error("Erro dispatch:", error?.message);
    await sendToClient({ to: clientePhone, message: MSG.nenhumFretista });
    const detalhesCompletos = await montarResumoCompletoOcorrencia(corridaId);
    await notificarAdmin(
      `🚨 *ERRO NO DISPATCH*`,
      clientePhone,
      `Erro: ${error?.message}\nCliente avisado que equipe vai resolver.\n\n${detalhesCompletos}`
    );
  }
}

// Monta um resumo com TUDO que o cliente informou na cotacao, pra admin dar continuidade
// sem precisar fazer novas perguntas. Usado em ocorrencias (timeout, erros, etc).
async function montarResumoCompletoOcorrencia(corridaId: string): Promise<string> {
  try {
    const { data: corrida } = await supabase
      .from("corridas")
      .select(`
        codigo, tipo_servico, tipo_veiculo, descricao_carga,
        origem_endereco, origem_lat, origem_lng,
        destino_endereco, destino_lat, destino_lng,
        distancia_km, periodo, data_agendada,
        qtd_ajudantes, escada_origem, andares_origem,
        valor_estimado, valor_prestador, valor_final,
        status, criado_em,
        clientes(nome, telefone, email)
      `)
      .eq("id", corridaId)
      .single();

    if (!corrida) return `Corrida: ${corridaId} (dados nao encontrados)`;

    const cliente = (corrida.clientes as any) || {};
    const nomeCliente = cliente.nome || "Sem nome";
    const telCliente = cliente.telefone ? formatarTelefoneExibicao(cliente.telefone) : "-";
    const emailCliente = cliente.email || "-";

    const veiculoNome: Record<string, string> = {
      utilitario: "Utilitario (Strada/Saveiro)",
      hr: "HR",
      caminhao_bau: "Caminhao Bau",
      guincho: "Guincho",
      moto_guincho: "Guincho de Moto",
      carro_comum: "Carro Comum",
    };

    const qtdAjudantes = corrida.qtd_ajudantes || 0;
    const ajudanteInfo = qtdAjudantes > 0
      ? `Sim, ${qtdAjudantes} ajudante${qtdAjudantes > 1 ? "s" : ""}`
      : "Nao";

    let tipoLocal = "Terreo/nao informado";
    if (corrida.escada_origem && corrida.andares_origem && corrida.andares_origem > 0) {
      tipoLocal = `Escada, ${corrida.andares_origem}o andar`;
    } else if (corrida.escada_origem) {
      tipoLocal = "Escada";
    }

    const dataFrete = corrida.periodo || corrida.data_agendada || "A combinar";

    return [
      `📋 *DADOS COMPLETOS DA COTACAO*`,
      ``,
      `🔖 Codigo: ${corrida.codigo}`,
      `🆔 Corrida: ${corridaId}`,
      `📅 Status: ${corrida.status}`,
      `🕒 Criada em: ${new Date(corrida.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      ``,
      `👤 *Cliente*`,
      `Nome: ${nomeCliente}`,
      `Telefone: ${telCliente}`,
      `Email: ${emailCliente}`,
      `📱 wa.me/${cliente.telefone || ""}`,
      ``,
      `📦 *Servico*`,
      `Tipo: ${corrida.tipo_servico || "frete"}`,
      `Veiculo: ${veiculoNome[corrida.tipo_veiculo || ""] || corrida.tipo_veiculo || "-"}`,
      `Carga: ${corrida.descricao_carga || "-"}`,
      ``,
      `📍 *Retirada*`,
      `${corrida.origem_endereco || "-"}`,
      `Local: ${tipoLocal}`,
      `Ajudante: ${ajudanteInfo}`,
      ``,
      `🏠 *Entrega*`,
      `${corrida.destino_endereco || "-"}`,
      ``,
      `📅 *Data/Horario:* ${dataFrete}`,
      `📏 *Distancia:* ${corrida.distancia_km || "-"} km`,
      ``,
      `💰 *Valores*`,
      `Cliente paga: R$ ${corrida.valor_final || corrida.valor_estimado || "-"}`,
      `Fretista recebe: R$ ${corrida.valor_prestador || "-"}`,
    ].join("\n");
  } catch (e: any) {
    return `Corrida: ${corridaId} (erro ao buscar detalhes: ${e?.message})`;
  }
}

// === CADASTRO PRESTADOR ===

async function handleCadastroNome(phone: string, message: string) {
  if (message.length < 3) {
    await sendToClient({ to: phone, message: "Me passa seu nome completo, por favor 😊" });
    return;
  }
  // Salva nome temporariamente no campo origem_endereco
  await updateSession(phone, { step: "cadastro_cpf", origem_endereco: message });
  await sendToClient({ to: phone, message: MSG.cadastroCpf });
}

async function handleCadastroCpf(phone: string, message: string) {
  const cpf = message.replace(/\D/g, "");
  if (cpf.length !== 11) {
    await sendToClient({ to: phone, message: "CPF precisa ter 11 dígitos. Tenta de novo 😊" });
    return;
  }
  await updateSession(phone, { step: "cadastro_email", destino_endereco: cpf });
  await sendToClient({ to: phone, message: MSG.cadastroEmail });
}

async function handleCadastroEmail(phone: string, message: string) {
  const email = message.trim().toLowerCase();
  if (!email.includes("@") || !email.includes(".")) {
    await sendToClient({ to: phone, message: "Email inválido. Tenta de novo 😊\nExemplo: *seunome@email.com*" });
    return;
  }
  // Salva email no campo plano_escolhido (campo temporário)
  await updateSession(phone, { step: "cadastro_selfie", plano_escolhido: email });
  await sendToClient({ to: phone, message: MSG.cadastroSelfie });
}

async function handleCadastroPlaca(phone: string, message: string) {
  if (message.length < 5) {
    await sendToClient({ to: phone, message: "Me passa a placa do veiculo, por favor 😊" });
    return;
  }
  await updateSession(phone, { step: "cadastro_chave_pix", periodo: message.toUpperCase() });
  await sendToClient({ to: phone, message: MSG.cadastroChavePix });
}

async function handleCadastroChavePix(phone: string, message: string) {
  if (message.length < 5) {
    await sendToClient({ to: phone, message: "Me passa sua chave Pix (CPF, email, telefone ou chave aleatoria) 😊" });
    return;
  }
  // Salva chave Pix no bot_logs (sera usada no pagamento)
  await supabase.from("bot_logs").insert({
    payload: { tipo: "chave_pix_prestador", phone, chave_pix: message.trim() },
  });
  await updateSession(phone, { step: "cadastro_tipo_veiculo" });
  await sendToClient({ to: phone, message: MSG.cadastroTipoVeiculo });
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
    await sendToClient({ to: phone, message: "Escolhe o tipo do veiculo:\n\n1️⃣ Carro comum\n2️⃣ Utilitario\n3️⃣ HR / Bongo\n4️⃣ Caminhao Bau\n5️⃣ Guincho / Plataforma" });
    return;
  }

  // Salva tipo veiculo temporariamente e envia termos
  await updateSession(phone, { step: "cadastro_termos", veiculo_sugerido: tipoVeiculo });
  await sendToClient({ to: phone, message: MSG.cadastroTermos });
}

async function handleCadastroTermos(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  if (lower !== "eu concordo") {
    await sendToClient({
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
  const email = session.plano_escolhido || "";
  const tipoVeiculo = session.veiculo_sugerido || "utilitario";

  // Busca URLs das fotos uploaded (placa e veiculo) no bot_logs
  async function buscarFotoUpload(tipo: string): Promise<string> {
    const { data } = await supabase
      .from("bot_logs")
      .select("payload")
      .filter("payload->>tipo", "eq", tipo)
      .filter("payload->>phone", "eq", phone)
      .order("criado_em", { ascending: false })
      .limit(1);
    return data?.[0]?.payload?.url || "";
  }
  const fotoPlacaUrl = await buscarFotoUpload("foto_cadastro_placa");
  const fotoVeiculoUrl = await buscarFotoUpload("foto_cadastro_veiculo");

  // Busca chave Pix do bot_logs (salvo em handleCadastroChavePix)
  const { data: pixLog } = await supabase
    .from("bot_logs")
    .select("payload")
    .filter("payload->>tipo", "eq", "chave_pix_prestador")
    .filter("payload->>phone", "eq", phone)
    .order("criado_em", { ascending: false })
    .limit(1);
  const chavePix = pixLog?.[0]?.payload?.chave_pix || "";

  const { error } = await supabase.from("prestadores").insert({
    telefone: phone,
    nome,
    cpf,
    email,
    chave_pix: chavePix,
    selfie_url: selfieUrl,
    foto_placa_url: fotoPlacaUrl,
    foto_veiculo_url: fotoVeiculoUrl,
    status: "pendente",
    score: 5.0,
    total_corridas: 0,
    total_reclamacoes: 0,
    disponivel: false,
    termos_aceitos: true,
    termos_aceitos_em: new Date().toISOString(),
    termos_aceitos_ip: "whatsapp",
  });

  if (error && error.code === "23505") {
    await sendToClient({ to: phone, message: "Voce ja tem cadastro na Pegue! 😊 Em breve recebera indicacoes!" });
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

    // Arquiva cadastro por email (cria backup juridico com fotos anexadas)
    try {
      const { enviarEmailCadastroPrestador } = await import("@/lib/email");
      await enviarEmailCadastroPrestador({
        nome, telefone: phone, cpf, email,
        chavePix: chavePix,
        tipoVeiculo, placa,
        selfieUrl: selfieUrl || null,
        fotoPlacaUrl: fotoPlacaUrl || null,
        fotoVeiculoUrl: fotoVeiculoUrl || null,
        dataAceite: dataHoraAceite,
        origem: "whatsapp",
      });
    } catch (e: any) {
      console.error("Erro email cadastro:", e?.message);
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

      await sendToClient({
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
      await sendToClient({ to: phone, message: MSG.cadastroConcluido });

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
    await sendToClient({
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

  await sendToClient({
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
    await sendToClient({ to: phone, message: "Voce nao tem cadastro de parceiro na Pegue. Para se cadastrar, envie *Parcerias Pegue*" });
    return;
  }

  if (!prestador.disponivel) {
    await sendToClient({ to: phone, message: "Voce ja esta pausado! 😊\n\nPra voltar a receber indicacoes, digite *voltei*" });
    return;
  }

  await supabase
    .from("prestadores")
    .update({ disponivel: false })
    .eq("id", prestador.id);

  await sendToClient({
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
    await sendToClient({ to: phone, message: "Voce nao tem cadastro de parceiro na Pegue. Para se cadastrar, envie *Parcerias Pegue*" });
    return;
  }

  if (prestador.status !== "aprovado") {
    await sendToClient({ to: phone, message: "Seu cadastro ainda esta em analise. Aguarde a aprovacao! 😊" });
    return;
  }

  if (prestador.disponivel) {
    await sendToClient({ to: phone, message: "Voce ja esta ativo! 😊 Fique atento as indicacoes de frete!" });
    return;
  }

  await supabase
    .from("prestadores")
    .update({ disponivel: true })
    .eq("id", prestador.id);

  await sendToClient({
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
    await sendToClient({
      to: phone,
      message: `Para registrar uma despesa, use o formato:\n\n*despesa [valor] [descricao]*\n\nExemplos:\n- despesa 50 combustivel\n- despesa 12.90 almoco\n- despesa 6.20 gasolina`,
    });
    return;
  }

  const valor = parseFloat(match[1].replace(",", "."));
  const descricao = match[2] || "Despesa geral";

  if (isNaN(valor) || valor <= 0) {
    await sendToClient({ to: phone, message: "Valor invalido. Use: *despesa 50 combustivel*" });
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

  await sendToClient({
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

  await sendToClient({ to: phone, message: msg });
}

// === DASHBOARD CLIENTE ===

async function handleDashboardCliente(phone: string) {
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome, nivel, total_corridas")
    .eq("telefone", phone)
    .single();

  if (!cliente) {
    await sendToClient({
      to: phone,
      message: "Voce ainda nao tem historico na Pegue 😊\n\nPra solicitar um frete, envie: *Oi*\n\n📱 Painel completo: chamepegue.com.br/minha-conta",
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

  await sendToClient({
    to: phone,
    message: `📊 *Sua Conta - Pegue*

👤 *${cliente.nome || "Cliente"}*
🏷 Nivel: *${cliente.nivel || "Bronze"}*
🚚 Servicos contratados: *${concluidas.length}*
💰 Total investido: *R$ ${totalGasto.toFixed(0)}*
${historico}
📱 Painel completo: chamepegue.com.br/minha-conta

Pra ver novamente, digite *minha conta* 😊`,
  });
}

// === AVALIAÇÃO DO CLIENTE ===

async function handleAvaliacao(phone: string, message: string, tipo: "atendimento" | "praticidade" | "fretista") {
  const nota = parseInt(message.trim());

  if (isNaN(nota) || nota < 1 || nota > 5) {
    await sendToClient({
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
    await sendToClient({ to: phone, message: MSG.clientePedirNotaPraticidade });
  } else if (tipo === "praticidade") {
    await updateSession(phone, { step: "avaliacao_fretista" });
    await sendToClient({ to: phone, message: MSG.clientePedirNotaFretista });
  } else if (tipo === "fretista") {
    await updateSession(phone, { step: "avaliacao_sugestao" });
    await sendToClient({ to: phone, message: MSG.clientePedirSugestao });
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
  await sendToClient({ to: phone, message: MSG.clienteAvaliacaoConcluida });
}

// === CONFIRMAÇÃO DE ENTREGA PELO CLIENTE ===

async function handleConfirmacaoEntrega(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session || !session.corrida_id) return;

  const lower = message.toLowerCase().trim();

  if (lower === "1" || lower.startsWith("sim") || lower === "s") {
    await updateSession(phone, { step: "avaliacao_atendimento" });
    await sendToClient({ to: phone, message: MSG.clienteConfirmouEntrega });

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
        await sendToClient({ to: phone, message: MSG.primeiroFreteCliente });
        await sendToClient({ to: phone, message: MSG.ferramentasCliente });
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
      await sendToClient({
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
    await sendToClient({ to: phone, message: MSG.clienteReclamouEntrega });

    const { data: corrida } = await supabase
      .from("corridas")
      .select("prestador_id, prestadores(telefone)")
      .eq("id", session.corrida_id)
      .single();

    if (corrida?.prestadores) {
      const fretistaTel = (corrida.prestadores as any).telefone;
      await sendToClient({ to: fretistaTel, message: MSG.fretistaProblemaNaEntrega });
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
    await sendToClient({
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
      await sendToClient({ to: phone, message: MSG.fretistaColetaConfirmada });

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
          const baseUrl = "https://chamepegue.com.br";
          const nomePrestador = (corridaRastreio.prestadores as any)?.nome || "Fretista";

          // Link pro fretista (GPS sender)
          const linkFretista = `${baseUrl}/rastrear/motorista/${rastreioToken}`;
          await sendToClient({
            to: phone,
            message: MSG.rastreioLinkFretista(linkFretista),
          });

          // Link pro cliente (mapa tempo real)
          const clienteTel = (corridaRastreio.clientes as any)?.telefone;
          if (clienteTel) {
            const linkCliente = `${baseUrl}/rastrear/${codigoCorrida}?t=${rastreioToken}`;
            await sendToClient({
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
      await sendToClient({ to: phone, message: MSG.fretistaAguardarConfirmacao });

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
          await sendToClient({
            to: clienteTel,
            message: isGuincho
              ? MSG.guinchoClienteConfirmarEntrega(corrida.descricao_carga || "Servico de guincho")
              : MSG.clienteConfirmarEntrega(corrida.descricao_carga || "seus materiais"),
          });

          // Tarefas agendadas (substituem setTimeouts que nao funcionam em serverless).
          // Cron /api/cron/tarefas-agendadas dispara nos prazos:
          // - 10 min: lembra cliente de confirmar entrega
          // - 20 min: libera fretista do local, notifica admin, manda ultima mensagem pro cliente
          if (session?.corrida_id) {
            await agendarTarefa(
              "rastreio_lembrete_confirmacao",
              session.corrida_id,
              10 * 60 * 1000
            );
            await agendarTarefa(
              "rastreio_libera_fretista",
              session.corrida_id,
              20 * 60 * 1000
            );
          }
        }
      }
    }
    return;
  }

  await sendToClient({
    to: phone,
    message: `Manda as fotos ou digite *PRONTO* quando terminar 📸`,
  });
}

// === DISPATCH ===

async function handlePrestadorResponse(prestadorPhone: string, message: string, corridaId: string) {
  const lower = message.toLowerCase().trim();

  // Se prestador ja esta em step de confirmacao de alteracao de data, trata separado
  const sessionPrestador = await getSession(prestadorPhone);
  if (sessionPrestador?.step === "fretista_confirmar_alteracao_data") {
    await handleFretistaConfirmarAlteracao(prestadorPhone, message, corridaId);
    return;
  }

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

  // Comando DATA / SUGERIR / PROPOR - fretista pede pra mudar a data
  // Ex: "DATA 03/05", "data 3", "sugerir 03", "propor amanha", "nova data 04/05"
  const comandoAlterarData = /^\s*(nova\s+data|data|sugerir|propor)\s+(.+)/i.exec(message);
  if (comandoAlterarData) {
    const dataPropostaBruta = comandoAlterarData[2].trim();
    const dataNormalizada = extrairData(dataPropostaBruta) || dataPropostaBruta;

    // Salva proposta temporariamente na session do prestador (campo data_agendada reutilizado)
    await updateSession(prestadorPhone, {
      step: "fretista_confirmar_alteracao_data",
      data_agendada: dataNormalizada,
      corrida_id: corridaId,
    });

    // Busca data original da corrida pra mostrar
    const { data: corrida } = await supabase
      .from("corridas")
      .select("periodo")
      .eq("id", corridaId)
      .single();
    const dataOriginal = corrida?.periodo || "a data original";

    await sendToClient({
      to: prestadorPhone,
      message: `📅 Tem certeza que nao consegue atender no *${dataOriginal}*?\n\nVou tentar achar outro parceiro pra essa data primeiro. Se ninguem aceitar, sua sugestao de *${dataNormalizada}* vai pro cliente decidir.\n\n1️⃣ *SIM* - Confirmar sugestao de ${dataNormalizada}\n2️⃣ *VOLTAR* - Esqueci, ainda posso atender no ${dataOriginal}`,
    });
    return;
  }

  // Resposta "em atendimento" / "2" - prestador ocupado
  if (lower === "2" || lower === "em atendimento" || lower.includes("atendimento") || lower.includes("ocupado")) {
    await sendToClient({
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
    await sendToClient({
      to: prestadorPhone,
      message: "Pra aceitar, responda:\n\n1️⃣ ✅ *PEGAR*\n2️⃣ 🙏 *EM ATENDIMENTO*\n\n⚠️ Respostas automaticas nao sao aceitas.",
    });
    return;
  }

  // Busca prestador pra ter id e fazer UPDATE atomico
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id")
    .eq("telefone", prestadorPhone)
    .single();

  if (!prestador) {
    await sendToClient({
      to: prestadorPhone,
      message: "⚠️ Nao consegui identificar seu cadastro. Fale com a equipe Pegue.",
    });
    return;
  }

  // UPDATE ATOMICO no Supabase: so um fretista vence, garantido pelo Postgres.
  // Se outro ja pegou, resultado.sucesso = false.
  const resultado = await tryAceitarDispatch(corridaId, prestador.id, prestadorPhone);

  if (resultado.sucesso) {
    // Vitoria! Avisa todo mundo e segue fluxo
    await notificarResultadoDispatch(
      corridaId,
      prestadorPhone,
      resultado.clientePhone,
      resultado.outrosPrestadores
    );
    // Cancela tarefas de timeout que nao sao mais necessarias
    await cancelarTarefas("dispatch_timeout_inicial", corridaId);
    await cancelarTarefas("dispatch_timeout_estendido", corridaId);
  } else if (resultado.jaFoiAceito) {
    // Outro fretista ja pegou antes dele
    await sendToClient({ to: prestadorPhone, message: MSG.freteJaPego });
  } else {
    // Dispatch nao ativo (timeout expirou ou foi cancelado)
    await sendToClient({
      to: prestadorPhone,
      message: "⚠️ Esse frete nao esta mais disponivel. Aguarde o proximo!",
    });
  }
}

// Fretista confirmou que quer propor data alternativa
async function handleFretistaConfirmarAlteracao(prestadorPhone: string, message: string, corridaId: string) {
  const lower = message.toLowerCase().trim();
  const sessionPrestador = await getSession(prestadorPhone);
  const dataProposta = sessionPrestador?.data_agendada || "";

  const confirmou = lower === "1" || lower === "sim" || lower === "confirmar" || lower === "confirmo";
  const voltou = lower === "2" || lower === "voltar" || lower === "nao" || lower === "não";

  if (voltou) {
    // Fretista volta pro fluxo normal, pode ainda PEGAR data original
    await updateSession(prestadorPhone, { step: "inicio", data_agendada: null });
    await sendToClient({
      to: prestadorPhone,
      message: `✅ Ok! Voce continua na disputa pela data original.\n\nSe quiser aceitar, responda *PEGAR*.`,
    });
    return;
  }

  if (!confirmou) {
    await sendToClient({
      to: prestadorPhone,
      message: `Escolhe uma opcao:\n\n1️⃣ *SIM* - Confirmar sugestao de ${dataProposta}\n2️⃣ *VOLTAR* - Cancelar e continuar na data original`,
    });
    return;
  }

  // Busca prestador pra salvar id na corrida
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id, nome")
    .eq("telefone", prestadorPhone)
    .single();

  if (!prestador) {
    await sendToClient({
      to: prestadorPhone,
      message: `⚠️ Nao consegui registrar sua sugestao. Tente novamente ou responda *PEGAR* pra atender na data original.`,
    });
    await updateSession(prestadorPhone, { step: "inicio" });
    return;
  }

  // Salva contraoferta na corrida (sobrescreve se ja tinha de outro fretista - primeiro ganha)
  const { data: corridaAtual } = await supabase
    .from("corridas")
    .select("contraoferta_prestador_id")
    .eq("id", corridaId)
    .single();

  if (corridaAtual?.contraoferta_prestador_id && corridaAtual.contraoferta_prestador_id !== prestador.id) {
    // Ja existe proposta de outro fretista, prevalece a primeira
    await sendToClient({
      to: prestadorPhone,
      message: `⚠️ Outro parceiro ja sugeriu data alternativa pra esse frete. Voce continua podendo atender na data original - responda *PEGAR* se quiser.`,
    });
    await updateSession(prestadorPhone, { step: "inicio", data_agendada: null });
    return;
  }

  await supabase
    .from("corridas")
    .update({
      contraoferta_prestador_id: prestador.id,
      contraoferta_data: dataProposta,
      contraoferta_criada_em: new Date().toISOString(),
    })
    .eq("id", corridaId);

  await updateSession(prestadorPhone, { step: "inicio", data_agendada: null });

  await sendToClient({
    to: prestadorPhone,
    message: `✅ Sua sugestao de *${dataProposta}* foi registrada.\n\nVou tentar achar outro parceiro pra data original primeiro. Se ninguem aceitar, vou enviar sua proposta pro cliente. Te aviso o resultado! 🚚`,
  });
}

// Chamada apos tryAceitarDispatch com sucesso. A corrida JA foi atualizada
// atomicamente com prestador_id e status='aceita' pelo tryAceitarDispatch.
// Aqui a responsabilidade eh apenas notificar (vencedor, perdedores, cliente).
async function notificarResultadoDispatch(
  corridaId: string,
  vencedorPhone: string,
  clientePhone: string,
  outrosPrestadores: string[]
) {
  // Avisa fretista vencedor
  await sendToClient({ to: vencedorPhone, message: MSG.freteAceito });

  // Avisa os outros que perderam
  for (const phone of outrosPrestadores) {
    await sendToClient({ to: phone, message: MSG.freteJaPego });
  }

  // Busca dados do prestador vencedor (nome) e da corrida (data) pra montar mensagem
  try {
    const { data: prestador } = await supabase
      .from("prestadores")
      .select("id, nome, telefone")
      .eq("telefone", vencedorPhone)
      .single();

    if (!prestador) {
      console.error("Prestador nao encontrado apos aceite:", vencedorPhone);
      return;
    }

    const { data: corridaData } = await supabase
      .from("corridas")
      .select("periodo, data_agendada")
      .eq("id", corridaId)
      .single();

    const dataFrete = corridaData?.periodo || corridaData?.data_agendada || "a data combinada";

    const { data: configPagto } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "pagamento_automatico_fretista")
      .single();

    const pagamentoHabilitado = configPagto?.valor === "habilitado";

    // Primeiro nome do fretista (sem sobrenome - mais acolhedor)
    const primeiroNomeFretista = (prestador.nome || "").split(" ")[0] || "seu fretista";

    if (pagamentoHabilitado) {
      // TODO: Gerar link Mercado Pago real via /api/pagamento/criar
      const linkPagamento = "https://chamepegue.com.br/simular";
      await sendToClient({
        to: clientePhone,
        message: MSG.freteConfirmadoEnviaPagamento(linkPagamento, dataFrete, primeiroNomeFretista),
      });
      await updateSession(clientePhone, { step: "aguardando_pagamento" });
    } else {
      // Pagamento automatico OFF: libera NOME (acolhedor) mas NAO telefone (evita negociacao direta)
      await sendToClient({
        to: clientePhone,
        message: MSG.freteConfirmadoSemPagamento(dataFrete, primeiroNomeFretista),
      });
      await updateSession(clientePhone, { step: "aguardando_numero_coleta" });
      await sendToClient({
        to: clientePhone,
        message: `📍 *Pra agilizar a coleta:*\n\nMe manda o *numero* e *complemento* do endereco de retirada 😊\n\nExemplo:\n• *450, Apto 12B*\n• *230, Casa 2*\n• *1500, Bloco 3 Apto 45*\n\nSe for so numero, manda so o numero 👍`,
      });
    }
  } catch (error: any) {
    console.error("Erro na notificacao pos-aceite:", error?.message);
    await notificarAdmin(
      `🚨 *ERRO APOS ACEITE DO FRETE*`,
      clientePhone,
      `Erro: ${error?.message}\nCorrida: ${corridaId}\nFretista: ${vencedorPhone}`
    );
  }
}

// === SALVAR CORRIDA ===

async function salvarCorrida(session: BotSession): Promise<string | null> {
  const contextoErro = `📍 ${session.origem_endereco || "-"}\n🏠 ${session.destino_endereco || "-"}\n📦 ${session.descricao_carga || "-"}\n💰 R$ ${session.valor_estimado || "-"}`;

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
        await notificarAdmin(`🚨 *ERRO AO SALVAR CORRIDA (cliente novo)*`, session.phone, `Erro: ${errCliente.message}\n${contextoErro}`);
        return null;
      }
      clienteId = novoCliente?.id || null;
    }

    if (!clienteId) {
      await supabase.from("bot_logs").insert({ payload: { debug: "cliente_id_null", phone: session.phone } });
      await notificarAdmin(`🚨 *ERRO AO SALVAR CORRIDA (cliente_id null)*`, session.phone, `${contextoErro}`);
      return null;
    }

    const codigo = `PG${Date.now().toString(36).toUpperCase()}`;

    // Verifica se existe credito pendente de corrida anterior (fluxo adicionar itens grandes)
    let creditoAnterior = 0;
    let corridaAnteriorId: string | null = null;
    const { data: logCredito } = await supabase
      .from("bot_logs")
      .select("id, payload")
      .filter("payload->>tipo", "eq", "credito_corrida_anterior")
      .filter("payload->>phone", "eq", session.phone)
      .order("criado_em", { ascending: false })
      .limit(1);
    if (logCredito?.[0]) {
      const p = logCredito[0].payload as any;
      creditoAnterior = Number(p?.credito_anterior || 0);
      corridaAnteriorId = p?.corrida_anterior_id || null;
      // Marca o log como aplicado (muda tipo pra nao reutilizar)
      await supabase
        .from("bot_logs")
        .update({ payload: { ...p, tipo: "credito_corrida_anterior_aplicado", aplicado_em: new Date().toISOString() } })
        .eq("id", logCredito[0].id);
    }

    const valorBruto = Number(session.valor_estimado || 0);
    const valorComDesconto = Math.max(0, valorBruto - creditoAnterior);

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
        // Fallback defensivo: se veiculo_sugerido estiver null por algum caminho (bug conhecido
        // em opcao de texto livre antes do fix), usa "utilitario" como default seguro.
        // Sem isso, tipo_veiculo fica NULL e quebra dispatch por tipo.
        tipo_veiculo: session.veiculo_sugerido || "utilitario",
        descricao_carga: session.descricao_carga,
        escada_origem: session.tem_escada,
        andares_origem: session.andar,
        qtd_ajudantes: await (async () => {
          const { data: qtdLog } = await supabase.from("bot_logs").select("payload").filter("payload->>tipo","eq","qtd_ajudantes").filter("payload->>phone","eq",session.phone).order("criado_em",{ascending:false}).limit(1);
          return qtdLog?.[0] ? (qtdLog[0].payload as any).qtd : 0;
        })(),
        plano: "padrao",
        valor_estimado: valorBruto,
        valor_final: valorComDesconto,
        valor_prestador: Math.round(valorBruto * 0.88),
        valor_pegue: Math.round(valorBruto * 0.12),
        credito_anterior: creditoAnterior,
        corrida_anterior_id: corridaAnteriorId,
        // data_agendada salva como texto no campo periodo (data_agendada e tipo date no banco)
        periodo: session.data_agendada,
        status: "pendente",
        canal_origem: "whatsapp",
      })
      .select("id")
      .single();

    if (errCorrida) {
      await supabase.from("bot_logs").insert({ payload: { debug: "erro_criar_corrida", error: errCorrida.message, code: errCorrida.code } });
      await notificarAdmin(`🚨 *ERRO AO SALVAR CORRIDA (insert)*`, session.phone, `Erro: ${errCorrida.message}\nCodigo: ${errCorrida.code}\n${contextoErro}`);
      return null;
    }

    return corrida?.id || null;
  } catch (error: any) {
    await supabase.from("bot_logs").insert({ payload: { debug: "erro_salvar_catch", error: error?.message } });
    await notificarAdmin(`🚨 *ERRO AO SALVAR CORRIDA (exception)*`, session.phone, `Erro: ${error?.message}\n${contextoErro}`);
    return null;
  }
}

// === OPENAI VISION ===

// Analisa foto de veiculo pra guincho (Cotacao Express)
async function analisarFotoGuincho(imageUrl: string): Promise<string | null> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Voce e um assistente que identifica veiculos por foto.
Analise a foto e retorne APENAS o texto: "Marca Modelo Ano"
Exemplos: "Fiat Uno 2018", "Honda CG 160 2022", "Toyota Hilux 2020"
Se nao conseguir identificar o ano, estime.
Se nao conseguir identificar o veiculo, retorne "Veiculo nao identificado".
Responda SOMENTE o texto, sem explicacao.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Identifique este veiculo:" },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 50,
    });

    const resultado = response.choices[0]?.message?.content?.trim() || null;
    if (resultado && !resultado.toLowerCase().includes("nao identificado")) {
      return resultado;
    }
    return null;
  } catch (error: any) {
    console.error("Erro analisar foto guincho:", error?.message);
    return null;
  }
}

async function analisarFotoIA(imageUrl: string): Promise<{
  item: string;
  itens: string[];
  quantidade?: string;
  quantidade_total?: number;
  tamanho?: string;
  tamanho_geral?: string;
  veiculo_sugerido: string;
  observacao: string;
} | null> {
  // Log inicial: confirma que funcao foi chamada
  const tStart = Date.now();
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "vision_inicio",
      url_dominio: (() => { try { return new URL(imageUrl).hostname; } catch { return "url_invalida"; } })(),
      api_key_setada: !!process.env.OPENAI_API_KEY,
      api_key_tamanho: (process.env.OPENAI_API_KEY || "").length,
    },
  });

  try {
    // PASSO 1: Baixar imagem do ChatPro pro NOSSO servidor.
    // Motivo: URLs do ChatPro tem token/expiram. Se passar URL direta pra OpenAI,
    // ela tenta baixar e recebe 403/404. Confirmado em producao 25/Abr (12+ fotos
    // viraram "Material (foto)" porque OpenAI nao conseguiu baixar).
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "vision_download_falhou",
          status: imageResponse.status,
          url_dominio: (() => { try { return new URL(imageUrl).hostname; } catch { return "url_invalida"; } })(),
        },
      });
      return null;
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString("base64");
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    const dataUrl = `data:${contentType};base64,${imageBase64}`;

    // Log: download OK
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "vision_download_ok",
        bytes: imageBuffer.byteLength,
        content_type: contentType,
        ms: Date.now() - tStart,
      },
    });

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Voce e um assistente de uma empresa de fretes chamada Pegue.
Analise a foto e IDENTIFIQUE TODOS os itens visiveis (nao so o principal).
Se houver 2+ itens na foto (ex: rack com TV em cima = 2 itens), LISTE TODOS.

Para cada item, INFIRA o tamanho quando relevante e INCLUA no nome:
- Guarda-roupa: "solteiro" (2 portas), "casal" (3 portas), "king" (4+ portas)
- Cama: "solteiro", "casal", "queen", "king"
- Mesa: "4 lugares", "6 lugares", "8+ lugares"
- Sofa: "2 lugares", "3 lugares", "retratil"
Se NAO tiver certeza, coloque "(?)": "Guarda-roupa (tamanho?)".

Retorne APENAS um JSON:
{
  "itens": ["Item 1 com tamanho", "Item 2 com tamanho", ...],
  "quantidade_total": <numero de itens>,
  "tamanho_geral": "pequeno, medio ou grande",
  "veiculo_sugerido": "utilitario, hr ou caminhao_bau",
  "observacao": "frase curta (max 15 palavras)"
}

REGRAS RIGIDAS para veiculo_sugerido (siga nesta ordem, a primeira que bater vence):
1. Se for APENAS 1 item (mesmo sendo grande como geladeira, maquina de lavar, fogao, sofa 2 lugares, cama box solteiro, guarda-roupa 2 portas) => SEMPRE "utilitario".
2. Se forem 2 itens pequenos/medios (ex: fogao+microondas, 2 caixas, bicicleta+mesa pequena) => "utilitario".
3. Se forem 2-3 itens grandes juntos (ex: geladeira+fogao+maquina, ou sofa 3 lugares+cama casal) => "hr".
4. Se for mudanca quase completa (4+ itens grandes, ou geladeira+sofa+cama+guarda-roupa+mais) => "caminhao_bau".
5. Na duvida entre utilitario e hr => SEMPRE "utilitario" (cabe mais coisa do que se imagina na Strada/Saveiro, que tem cacamba 1.2m x 1.5m x 0.5m).

Veiculos disponiveis:
- utilitario: Strada/Saveiro - padrao pra 1 item avulso ou 2 pequenos/medios
- hr: Hyundai HR - so quando tem 2-3 itens grandes juntos
- caminhao_bau: so pra mudanca completa (4+ itens grandes)

Responda SOMENTE o JSON.`,
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            { type: "text", text: "O que e esse material? Qual veiculo ideal?" },
          ],
        },
      ],
      max_tokens: 200,
      temperature: 0.1,
    });

    const texto = response.choices[0]?.message?.content || "";

    // Log: OpenAI respondeu. Se texto vazio ou nao parseavel, ja vou saber.
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "vision_openai_resposta",
        texto_amostra: texto.slice(0, 300),
        finish_reason: response.choices[0]?.finish_reason || null,
        usage: response.usage || null,
        ms_total: Date.now() - tStart,
      },
    });

    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      await supabase.from("bot_logs").insert({
        payload: { tipo: "vision_sem_json", texto_completo: texto.slice(0, 500) },
      });
      return null;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e: any) {
      await supabase.from("bot_logs").insert({
        payload: { tipo: "vision_json_invalido", erro: e?.message, texto: jsonMatch[0].slice(0, 500) },
      });
      return null;
    }

    // Normaliza: garante que "itens" sempre existe como array
    if (!Array.isArray(parsed.itens)) {
      if (typeof parsed.item === "string") {
        parsed.itens = [parsed.item];
      } else {
        parsed.itens = ["Material"];
      }
    }

    // Compatibilidade com callers antigos: "item" recebe lista formatada
    parsed.item = parsed.itens.join(", ");
    parsed.veiculo_sugerido = parsed.veiculo_sugerido || "utilitario";
    parsed.observacao = parsed.observacao || "";

    // Log de sucesso final
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "vision_sucesso",
        itens: parsed.itens,
        veiculo: parsed.veiculo_sugerido,
        ms_total: Date.now() - tStart,
      },
    });

    return parsed;
  } catch (error: any) {
    // Log detalhado em bot_logs pra diagnosticar (console.error nao sobrevive em serverless)
    const detalhe = {
      tipo: "vision_falhou",
      erro_msg: error?.message?.slice(0, 500) || "sem mensagem",
      erro_status: error?.status || error?.response?.status || null,
      erro_code: error?.code || error?.response?.data?.error?.code || null,
      erro_type: error?.response?.data?.error?.type || error?.constructor?.name || null,
      url_amostra: imageUrl?.slice(0, 120) || "sem url",
      url_dominio: (() => { try { return new URL(imageUrl).hostname; } catch { return "url_invalida"; } })(),
      api_key_setada: !!process.env.OPENAI_API_KEY,
      api_key_tamanho: (process.env.OPENAI_API_KEY || "").length,
    };
    console.error("Erro OpenAI Vision:", detalhe);
    try {
      await supabase.from("bot_logs").insert({ payload: detalhe });
    } catch {}
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
    await sendToClient({
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

  await sendToClient({
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
    await sendToClient({ to: phone, message: "Voce nao tem cadastro de prestador na Pegue." });
    return;
  }

  const { data: corridas } = await supabase
    .from("corridas")
    .select("id, origem_endereco, destino_endereco, periodo, valor_prestador, status")
    .eq("prestador_id", prestador.id)
    .in("status", ["aceita", "paga", "em_andamento"])
    .order("criado_em", { ascending: true });

  if (!corridas || corridas.length === 0) {
    await sendToClient({ to: phone, message: "Voce nao tem fretes ativos pra cancelar. 😊" });
    return;
  }

  if (corridas.length === 1) {
    // So tem 1 frete - pergunta direto
    const c = corridas[0];
    await updateSession(phone, { step: "fretista_cancelar_confirma" as any, corrida_id: c.id });
    await sendToClient({
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

  await sendToClient({ to: phone, message: lista });
}

async function handleCancelarQual(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session?.plano_escolhido) return;

  const ids: string[] = JSON.parse(session.plano_escolhido);
  const num = parseInt(message.trim());

  if (isNaN(num) || num < 1 || num > ids.length) {
    await sendToClient({ to: phone, message: `Manda um numero de 1 a ${ids.length}` });
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
  await sendToClient({
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
    await sendToClient({ to: phone, message: "Cancelamento anulado! ✅ Bom trabalho no frete! 🚚" });
    return;
  }

  if (!lower.startsWith("sim") && lower !== "s") {
    await sendToClient({ to: phone, message: "Responda *SIM* pra confirmar ou *NAO* pra manter o frete." });
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
      await sendToClient({
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

  await sendToClient({ to: phone, message: "Frete cancelado. ⚠️ Seu score foi penalizado (-2 pontos)." });

  // Avisa o cliente
  const clienteTel = (corrida?.clientes as any)?.telefone;
  if (clienteTel) {
    await sendToClient({
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
    await sendToClient({ to: phone, message: "Voce nao tem cadastro de prestador na Pegue." });
    return;
  }

  const { data: corridas } = await supabase
    .from("corridas")
    .select("id, origem_endereco, destino_endereco, periodo, valor_prestador")
    .eq("prestador_id", prestador.id)
    .in("status", ["aceita", "paga"])
    .order("criado_em", { ascending: true });

  if (!corridas || corridas.length === 0) {
    await sendToClient({ to: phone, message: "Voce nao tem fretes ativos pra indicar. 😊" });
    return;
  }

  if (corridas.length === 1) {
    await updateSession(phone, { step: "fretista_indicar_telefone" as any, corrida_id: corridas[0].id });
    const c = corridas[0];
    await sendToClient({
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

  await sendToClient({ to: phone, message: lista });
}

async function handleIndicarQual(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session?.plano_escolhido) return;

  const ids: string[] = JSON.parse(session.plano_escolhido);
  const num = parseInt(message.trim());

  if (isNaN(num) || num < 1 || num > ids.length) {
    await sendToClient({ to: phone, message: `Manda um numero de 1 a ${ids.length}` });
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
  await sendToClient({
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
    await sendToClient({ to: phone, message: "Numero invalido. Manda com DDD (ex: 11 95555-1234)" });
    return;
  }

  // Verifica se o amigo tem cadastro aprovado
  const { data: amigo } = await supabase
    .from("prestadores")
    .select("id, nome, telefone, status")
    .eq("telefone", telFormatado)
    .single();

  if (!amigo) {
    await sendToClient({
      to: phone,
      message: `Esse numero nao esta cadastrado na Pegue. 😔\n\nPede pro seu amigo se cadastrar mandando *Parcerias Pegue* pro nosso WhatsApp!`,
    });
    await updateSession(phone, { step: "aguardando_servico" as any });
    return;
  }

  if (amigo.status !== "aprovado") {
    await sendToClient({ to: phone, message: "Esse parceiro ainda nao foi aprovado no sistema. Assim que for aprovado, podera receber indicacoes." });
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
  await sendToClient({
    to: amigo.telefone,
    message: `🤝 *Indicacao de parceiro!*\n\nUm parceiro Pegue esta te indicando pra um frete:\n\n📍 ${corrida.origem_endereco} → ${corrida.destino_endereco}\n📦 ${corrida.descricao_carga || "Material"}\n📅 ${corrida.periodo}\n💰 Voce recebe: R$ ${corrida.valor_prestador}\n\nQuer *PEGAR* esse frete? Responda *PEGAR*`,
  });

  // Transfere o frete pro amigo (o antigo fretista sai)
  await supabase
    .from("corridas")
    .update({ prestador_id: amigo.id })
    .eq("id", session.corrida_id);

  await sendToClient({
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
      await sendToClient({ to: clientePhone, message: MSG.nenhumFretista });
      await notificarAdmin(
        `🚨 *URGENTE: NENHUM FRETISTA PRA RE-DISPATCH*`,
        clientePhone,
        `Corrida: ${corridaId}\n📅 Data/Horario: ${session.data_agendada || "A combinar"}\nOrigem: ${session.origem_endereco}\nDestino: ${session.destino_endereco}\nValor: R$ ${session.valor_estimado}`
      );
      return;
    }

    // Exclui o fretista que cancelou/sumiu
    const telefones = prestadores
      .map(p => p.telefone)
      .filter(t => t !== excluirPhone);

    if (telefones.length === 0) {
      await sendToClient({ to: clientePhone, message: MSG.nenhumFretista });
      await notificarAdmin(`🚨 *SEM FRETISTAS DISPONIVEIS PRA RE-DISPATCH*`, clientePhone, `Corrida: ${corridaId}`);
      return;
    }

    await createDispatch(corridaId, telefones, 2); // rodada=2 = urgente

    const valorPrestador = Math.round((session.valor_estimado || 0) * 0.88);

    const mensagem = `🚨 *PRIORIDADE IMEDIATA*\n⚡ Servico URGENTE!\n\n📍 Origem: ${session.origem_endereco || "SP"}\n🏠 Destino: ${session.destino_endereco || "Destino"}\n📦 ${session.descricao_carga || "Material"}\n📅 ${session.data_agendada || "AGORA"}\n💰 Voce recebe: R$ ${valorPrestador}\n\n━━━━━━━━━━━━━━━━\n1️⃣ ✅ *PEGAR* - Posso ir AGORA!\n2️⃣ 🙏 *EM ATENDIMENTO* - Estou ocupado`;

    // Disparo triplo pra urgencia maxima (3 toques)
    await sendToClients(telefones, `🚨🚨🚨 *URGENTE URGENTE URGENTE* 🚨🚨🚨`);
    await new Promise(r => setTimeout(r, 1000));
    await sendToClients(telefones, `⚡ *SERVICO URGENTE - PRECISA SAIR AGORA!*`);
    await new Promise(r => setTimeout(r, 1000));
    await sendToClients(telefones, mensagem);

    // Timeout via cron: se ninguem aceitar em 5min, admin recebe alerta
    await agendarTarefa("dispatch_timeout_estendido", corridaId, 300_000, {
      urgente: true,
    });
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
    await sendToClient({
      to: phone,
      message: "Escolha uma opcao! 😊\n\n1️⃣ *Guincho Imediato* (preciso AGORA)\n2️⃣ *Guincho Agendado* (escolher data e horario)",
    });
    return;
  }

  const session = await getSession(phone);
  const jaTemVeiculo = session?.descricao_carga?.includes("|");

  if (jaTemVeiculo) {
    // Cotacao Express - ja tem marca/modelo, pula pra localizacao
    const descAtual = session?.descricao_carga || "";
    await updateSession(phone, {
      step: "guincho_localizacao" as any,
      descricao_carga: descAtual.replace("Guincho -", `Guincho: ${categoria} -`),
      plano_escolhido: lower,
    });
    await sendToClient({
      to: phone,
      message: `Onde esta o veiculo? 📍\n\nToca no *icone de anexo* (canto inferior direito) > *Localizacao*\nOu digite o *endereco com rua, bairro e numero*`,
    });
  } else {
    // Fluxo normal - pede marca/modelo
    await updateSession(phone, {
      step: "guincho_marca_modelo" as any,
      descricao_carga: `Guincho: ${categoria}`,
      plano_escolhido: lower,
    });
    await sendToClient({
      to: phone,
      message: `Qual a *marca, modelo e ano* do seu veiculo? 🚗\n\nExemplo: *Fiat Uno 2018*, *Honda CG 160 2022*, *Hilux 2020*`,
    });
  }
}

async function handleGuinchoTipoVeiculo(phone: string, message: string) {
  const lower = message.trim();
  const tipoVeiculo = TIPO_VEICULO_GUINCHO[lower];

  if (!tipoVeiculo) {
    await sendToClient({
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

  await sendToClient({
    to: phone,
    message: `Qual a *marca, modelo e ano* do veiculo?\n\nExemplo: *Fiat Uno 2018* ou *Honda CG 160 2022*`,
  });
}

// Detecta categoria do veiculo pelo nome
function detectarCategoriaVeiculo(texto: string): { tipo: string; nome: string } {
  const lower = texto.toLowerCase();

  // Motos
  const motos = ["cg", "fan", "titan", "biz", "pop", "cb", "xre", "fazer", "factor", "crosser", "lander", "tenere", "ninja", "z400", "mt", "duke", "burgman", "pcx", "nmax", "sahara", "moto", "scooter", "honda cg", "yamaha", "suzuki", "triumph", "bmw gs", "harley", "kawasaki"];
  if (motos.some(m => lower.includes(m))) {
    return { tipo: "moto", nome: "Moto" };
  }

  // Vans e caminhoes
  const grandes = ["sprinter", "master", "ducato", "daily", "iveco", "caminhao", "caminhão", "toco", "truck", "vuc", "furgao", "furgão", "van", "boxer", "transit"];
  if (grandes.some(g => lower.includes(g))) {
    return { tipo: "veiculo_grande", nome: "Van/Caminhao" };
  }

  // SUVs e caminhonetes
  const suvs = ["hilux", "s10", "s-10", "ranger", "amarok", "frontier", "triton", "l200", "toro", "maverick", "ram", "silverado", "f250", "tracker", "creta", "renegade", "compass", "commander", "taos", "tcross", "t-cross", "kicks", "hr", "bongo", "kia", "hyundai hr", "tucson", "sw4", "fortuner", "pajero", "trailblazer", "equinox", "territory", "bronco", "defender", "wrangler", "jimny", "duster", "captur", "sportage", "sorento", "tiggo", "suv", "caminhonete", "picape", "pickup"];
  if (suvs.some(s => lower.includes(s))) {
    return { tipo: "caminhonete_suv", nome: "SUV/Caminhonete" };
  }

  // Utilitarios pequenos (na mesma categoria de carro comum)
  const utilitarios = ["strada", "saveiro", "montana", "fiorino", "courier", "kangoo", "partner", "doblo", "berlingo", "pampa"];
  if (utilitarios.some(u => lower.includes(u))) {
    return { tipo: "carro_comum", nome: "Hatch/Sedan" };
  }

  // Carro comum (default)
  return { tipo: "carro_comum", nome: "Hatch/Sedan" };
}

async function handleGuinchoMarcaModelo(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const texto = message.trim();

  if (texto.length < 3) {
    await sendToClient({
      to: phone,
      message: "Informe a *marca, modelo e ano* do veiculo 😊\n\nExemplo: *Fiat Uno 2018* ou *Honda CG 160 2022*",
    });
    return;
  }

  // Detecta categoria automaticamente
  const categoria = detectarCategoriaVeiculo(texto);

  const descAtual = session.descricao_carga || "Guincho";
  await updateSession(phone, {
    step: "guincho_localizacao" as any,
    descricao_carga: `${descAtual} - ${categoria.nome} | ${texto}`,
    veiculo_sugerido: categoria.tipo === "moto" ? "moto_guincho" : "guincho",
  });

  await sendToClient({
    to: phone,
    message: `*${texto}* - Anotado! ✅\n\n${MSG.guinchoPedirLocalizacao(texto)}`,
  });
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
    await sendToClient({
      to: phone,
      message: "Nao consegui achar esse endereco 😅\n\nManda sua *localizacao pelo icone de anexo* (canto inferior direito do WhatsApp) ou digite o *CEP* ou *endereco completo* (rua + bairro)",
    });
    return;
  }

  await updateSession(phone, {
    step: "guincho_destino" as any,
    origem_endereco: endereco,
    origem_lat: latitude,
    origem_lng: longitude,
  });

  await sendToClient({ to: phone, message: MSG.guinchoPedirDestino });
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

  // Taxas adicionais (noturno/feriado/fim de semana) so aplicam pra guincho IMEDIATO,
  // porque a data/hora de execucao e agora. Pra guincho AGENDADO, o cliente ainda
  // vai escolher data e horario - recalculamos depois com essa info.
  let taxaExtra = "";
  if (categoriaNum === "1") {
    const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hora = agora.getHours();
    const diaSemana = agora.getDay(); // 0=domingo, 6=sabado
    const isNoturno = hora >= 22 || hora < 6;
    const isFimDeSemana = diaSemana === 0 || diaSemana === 6;

    // Feriados nacionais fixos (mes-dia)
    const feriados = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];
    const mesdia = `${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
    const isFeriado = feriados.includes(mesdia);

    if (isNoturno) {
      valorTotal = Math.round(valorTotal * 1.3);
      taxaExtra = "noturno";
    }
    if (isFeriado) {
      valorTotal = Math.round(valorTotal * (isNoturno ? 1 : 1.3)); // nao acumula
      taxaExtra = taxaExtra ? "noturno + feriado" : "feriado";
    }
    if (isFimDeSemana && !isFeriado && !isNoturno) {
      valorTotal = Math.round(valorTotal * 1.2); // fim de semana: +20%
      taxaExtra = "fim de semana";
    }
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

    await sendToClient({
      to: phone,
      message: `📋 *Resumo do seu pedido:*

🚨 *GUINCHO IMEDIATO*
📍 *Coleta:* ${session.origem_endereco || ""}
🏠 *Destino:* ${destino}
🚗 *Veiculo:* ${nomeVeic}
🔧 *Servico:* ${session.descricao_carga || "Guincho"}
📅 *AGORA - Saida imediata*
${taxaExtra ? `🌙 *Taxa ${taxaExtra} aplicada*\n` : ""}
✅ *Total: R$ ${valorTotal}*

━━━━━━━━━━━━━━━━

⚠️ *Confirma que todas as informacoes estao corretas?*

1️⃣ ✅ *SIM* - Tudo certo, confirmar!
2️⃣ ✏️ *ALTERAR* - Quero corrigir algo`,
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

    await sendToClient({
      to: phone,
      message: MSG.guinchoOrcamento(categoria, session.origem_endereco || "", destino, valorTotal.toString(), taxaExtra),
    });
  }
}

// === EXTRAIR DATA E HORARIO ===

// extrairHorario e extrairData movidos pra @/lib/bot-utils em 25/Abr
// pra serem testaveis via Vitest. Importadas no topo do arquivo.

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
