import { NextRequest, NextResponse } from "next/server";
import { sendMessage, sendToClient, sendToClients, sendImageToClient, invalidateInstanceCache, setInstanceCache, isValidBrPhone } from "@/lib/chatpro";
import {
  type BotSession,
  getSession,
  createSession,
  updateSession,
  deleteSession,
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
  normalizarEmojiKeycap,
  separarOrigemDestino,
  pareceRuaSemContexto,
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
  determinarMelhorVeiculo,
  formatarListaNumerada,
} from "@/lib/bot-utils";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { uploadFotoPrestador } from "@/lib/storage-prestadores";
import { gerarSimulacao, formatarMensagemSimulacao, nomeVeiculo as nomeVeiculoAval, type SimulacaoAvaliacao } from "@/lib/simulacao-avaliacao";
import { criteriosMediaDaSimulacao, invalidarCacheAjustes } from "@/lib/ajustes-precos";
import { isAdminPhone, isPhoneTeste, getAdminPhones } from "@/lib/admin-auth";
import { notificarAdmins, notificarAdminsComClaim } from "@/lib/admin-notify";
import { extrairContextoInicial, formatarConfirmacaoContexto, type ContextoExtraido } from "@/lib/extrair-contexto";
import { detectarLinkGoogleMaps, resolverGoogleMapsLink } from "@/lib/google-maps-link";
import { checkRateLimit } from "@/lib/rate-limit";

// Limite de chamadas IA Vision por hora por telefone.
// Cliente legitimo numa cotacao normal faz <15 fotos. 30/hora cobre ate 2
// tentativas seguidas. Acima disso = sinal de dificuldade do cliente OU
// tentativa de abuso. Em ambos os casos, escala humano (NAO bloqueia).
// Janela rolante de 60min: cliente pode tentar de novo daqui a 1h sem fricao.
const VISION_MAX_HORA = 30;

// Tamanho maximo da foto pra analise IA. Cliente legitimo manda <2MB
// (foto WhatsApp comprimida). Acima de 5MB = anomalia OU ataque.
// Bloquear AQUI evita gasto desnecessario na OpenAI Vision (que mediria a
// imagem inteira pra rejeitar depois).
const VISION_MAX_BYTES = 5 * 1024 * 1024;

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

    // SMOKE MODE: smoke test passa header 'X-Smoke-Mode: true' pra simular
    // chamadas sem disparar respostas reais pro WhatsApp do admin.
    // Webhook responde 200 sem processar nada.
    const isSmoke = req.headers.get("x-smoke-mode") === "true";
    if (isSmoke) {
      // Loga pra rastreio (vai marcar com _smoke pra Fabio diferenciar de cliente real)
      try {
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "smoke_request",
            _smoke: true,
            criado_em: new Date().toISOString(),
          },
        });
      } catch {}
      return NextResponse.json({ status: "smoke_ignored" });
    }

    const rawBody = await req.json();

    // Detecta qual instancia recebeu a mensagem (via query param ?instance=2)
    const instanceParam = req.nextUrl.searchParams.get("instance");
    const instance: 1 | 2 = instanceParam === "2" ? 2 : 1;

    const eventType = rawBody.Type || rawBody.type || "";
    const rawFrom = rawBody.Body?.Info?.RemoteJid || rawBody.Info?.RemoteJid || "";
    const fromMasked = rawFrom.replace(/\d(?=\d{4})/g, "*");

    // Eventos do ChatPro que NAO precisam ser logados (so consomem DB):
    // - charge_status: status de bateria/dispositivo
    // - reaction: cliente reagiu a mensagem com emoji (ja ignoramos)
    // - group_event: alguem adicionou bot em grupo (raro, ignorado)
    // Bug detectado em auditoria 26/Abr: 287 charge_status em 24h = 105k/ano so disso.
    const eventosIgnoradosLog = new Set(["charge_status", "reaction", "group_event"]);
    if (!eventosIgnoradosLog.has(eventType)) {
      // Log minimo no Supabase (sem rawBody completo por LGPD).
      // Bug 12 (auditoria 29/Abr): logs sem `tipo` viraram 96% dos registros
      // (289/300 sem campo tipo). Padroniza tipo: "webhook_chatpro_event"
      // pra observabilidade. event_type segue como detalhe especifico.
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "webhook_chatpro_event",
          _instance: instance,
          event_type: eventType,
          from_masked: fromMasked,
          msg_length: (rawBody.Body?.Text || "").length,
        },
      });
    }

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
    // Normaliza emoji keycap (1️⃣ -> 1) ANTES de tudo. Cliente real digita o emoji
    // do menu pensando que eh o esperado, e os 50+ comparadores `lower === "1"`
    // viram travar. Normalizando na entrada, todo o codigo abaixo funciona igual.
    const message = normalizarEmojiKeycap(rawBody.Body?.Text || "");
    const from = info.RemoteJid || info.SenderJid || "";
    const isGroup = from.includes("@g.us");
    // @lid eh LinkedID (JID anonimizado pelo WhatsApp em alguns contatos novos).
    // Bot nao consegue responder pra @lid (numero mascarado), gera sessao-lixo.
    const isLid = from.includes("@lid");
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

    // ========================================================
    // ATENDIMENTO HUMANO (FromMe = true)
    // ========================================================
    // Quando admin/operador manda mensagem manual pelo WhatsApp da Pegue (Web/app
    // ou via API direta), ChatPro entrega o webhook com FromMe=true e RemoteJid =
    // destinatario. Hoje o bot ignorava silenciosamente, mas continuava respondendo
    // automaticamente do lado do cliente — atropelando o humano.
    //
    // Comportamento novo:
    //   1) Se admin escreveu "VOLTA IRIS" (ou apelido "VOLTA BOT") pro cliente -> reativa o fluxo
    //      (cliente volta pra menu inicial na proxima msg).
    //   2) Caso contrario -> marca step=atendimento_humano. Esse step ja tem case
    //      no switch que silencia o bot (so loga). NAO seta silenciado_ate aqui:
    //      isso bloquearia o cliente no rate-limit antes de chegar no switch e a
    //      proxima msg dele NAO seria registrada no historico do bot.
    if (isFromMe && !isGroup && from) {
      const destinatario = from.replace("@s.whatsapp.net", "").replace("@lid", "");
      if (isValidBrPhone(destinatario)) {
        const lowerMsg = (message || "").trim().toLowerCase();
        // Aceita VOLTA IRIS (preferido — Iris eh a persona) E VOLTA BOT
        // (apelido tecnico mantido por compatibilidade).
        const ehVoltaBot =
          lowerMsg === "volta iris" || lowerMsg === "/volta iris" || lowerMsg.startsWith("volta iris ") ||
          lowerMsg === "volta bot" || lowerMsg === "/volta bot" || lowerMsg.startsWith("volta bot ");

        // Se cliente eh novo (admin escreveu primeiro, sem session existente),
        // CRIA session com step apropriado. Se ja existe, ATUALIZA preservando
        // criado_em original. Sem isso, UPDATE puro silenciava-se em no-op
        // e a proxima msg do cliente caia no fluxo padrao (bot atropelava admin).
        const novoStep = ehVoltaBot ? "inicio" : "atendimento_humano";
        const agora = new Date().toISOString();
        const { data: sessaoExistente } = await supabase
          .from("bot_sessions")
          .select("phone")
          .eq("phone", destinatario)
          .maybeSingle();

        if (sessaoExistente) {
          await supabase
            .from("bot_sessions")
            .update({
              step: novoStep,
              ...(ehVoltaBot ? { silenciado_ate: null } : {}),
              atualizado_em: agora,
            })
            .eq("phone", destinatario);
        } else {
          await supabase.from("bot_sessions").insert({
            phone: destinatario,
            step: novoStep,
            instance_chatpro: instance,
            criado_em: agora,
            atualizado_em: agora,
          });
        }
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: ehVoltaBot ? "humano_devolveu_bot" : "humano_assumiu_atendimento",
            cliente_masked: destinatario.replace(/\d(?=\d{4})/g, "*"),
          },
        });
      }
      return NextResponse.json({ status: "fromme_handled" });
    }

    if (isGroup || isLid || !from) {
      // Loga somente @lid (grupo ja tem trafego conhecido / sem from = vazio).
      // @lid eh sinal de contato anonimizado pelo WhatsApp - vale rastrear pra
      // detectar volume e ajustar estrategia se virar comum.
      if (isLid) {
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "ignorado_jid_lid",
            from_masked: from.replace(/\d(?=\d{4})/g, "*"),
          },
        });
      }
      return NextResponse.json({ status: "ignored" });
    }

    const phoneNumber = from.replace("@s.whatsapp.net", "");

    // Valida formato BR (55 + DDD + 8/9 digitos). Filtra IDs estranhos
    // que ChatPro entrega ocasionalmente (ex: numeros internacionais sem DDI BR,
    // contatos com formato malformado). Antes desse filtro virava sessao-lixo.
    if (!isValidBrPhone(phoneNumber)) {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "ignorado_phone_invalido",
          phone_masked: phoneNumber.replace(/\d(?=\d{4})/g, "*"),
          length: phoneNumber.length,
        },
      });
      return NextResponse.json({ status: "ignored_invalid_phone" });
    }

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
    // CLAIM ENTRE ADMINS — admin responde "OK XXXX" pra assumir alerta.
    // Primeiro admin que mandar codigo valido vence (UPDATE atomico via
    // .eq('status','pendente')). Demais admins sao avisados que ja foi
    // assumido. Cliente vai pra step=atendimento_humano (bot silencia).
    // ========================================================
    if (isAdminPhone(phoneNumber)) {
      const matchOk = /^\s*ok\s+([a-z0-9]{4})\s*$/i.exec((message || "").trim());
      if (matchOk) {
        const codigo = matchOk[1].toUpperCase();
        const { data: claim } = await supabase
          .from("alertas_admin_pendentes")
          .update({
            status: "assumido",
            assumido_por: phoneNumber,
            assumido_em: new Date().toISOString(),
          })
          .eq("codigo", codigo)
          .eq("status", "pendente")
          .select("cliente_phone, titulo")
          .maybeSingle();

        if (!claim) {
          await sendToClient({
            to: phoneNumber,
            message: `❌ Codigo *${codigo}* nao encontrado, ja foi assumido ou expirou.`,
          });
          return NextResponse.json({ status: "claim_nao_encontrado" });
        }

        const clientePhone = (claim as any).cliente_phone || "";
        const titulo = (claim as any).titulo || "atendimento";
        const nomeAssumiu = formatarTelefoneExibicao(phoneNumber);

        // Confirma pro admin que assumiu
        await sendToClient({
          to: phoneNumber,
          message: `✅ Voce assumiu *${codigo}* — ${titulo}${clientePhone ? `\n\n📱 Cliente: wa.me/${clientePhone}` : ""}\n\nA Iris vai parar de responder. Quando terminar, mande *VOLTA IRIS* pro cliente.`,
        });

        // Avisa demais admins
        const outros = getAdminPhones().filter((p) => p !== phoneNumber);
        await Promise.allSettled(
          outros.map((p) =>
            sendMessage({
              to: p,
              message: `👤 *${nomeAssumiu}* assumiu o alerta *${codigo}*${clientePhone ? ` (cliente ${clientePhone})` : ""}. Voce nao precisa fazer nada.`,
              instance: 1,
            }).catch(() =>
              sendMessage({
                to: p,
                message: `👤 *${nomeAssumiu}* assumiu o alerta *${codigo}*${clientePhone ? ` (cliente ${clientePhone})` : ""}.`,
                instance: 2,
              }),
            ),
          ),
        );

        // Pausa o bot pro cliente
        if (clientePhone) {
          await supabase
            .from("bot_sessions")
            .update({
              step: "atendimento_humano",
              atualizado_em: new Date().toISOString(),
            })
            .eq("phone", clientePhone);
        }

        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "claim_admin_assumido",
            codigo,
            admin_masked: phoneNumber.replace(/\d(?=\d{4})/g, "*"),
            cliente_masked: clientePhone.replace(/\d(?=\d{4})/g, "*"),
          },
        });
        return NextResponse.json({ status: "claim_assumido", codigo });
      }
    }

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

      // Fotos coleta/entrega do fretista — agora salva no Storage como prova digital
      if (session && (session.step === "fretista_coleta_fotos" || session.step === "fretista_entrega_fotos")) {
        const tipo = session.step === "fretista_coleta_fotos" ? "coleta" : "entrega";
        // Conta fotos (usa descricao_carga como contador temporario)
        const contadorAtual = parseInt(session.descricao_carga || "0") || 0;
        const novoContador = contadorAtual + 1;
        await updateSession(phoneNumber, { descricao_carga: novoContador.toString() });

        // Salva no Storage + registra em provas_digitais (FK na corrida)
        if (session.corrida_id) {
          const { salvarProvaDigital } = await import("@/lib/storage-provas");
          const r = await salvarProvaDigital(imageUrl, session.corrida_id, tipo, novoContador);
          if (!r.url) {
            await supabase.from("bot_logs").insert({
              payload: {
                tipo: "prova_digital_falha_upload",
                corrida_id: session.corrida_id,
                tipo_prova: tipo,
                ordem: novoContador,
              },
            });
          }
        }

        await sendToClient({ to: phoneNumber, message: MSG.fretistaFotoRecebida(novoContador) });
        return NextResponse.json({ status: "ok" });
      }

      // Foto no guincho - Cotacao Express
      if (session && session.step === "guincho_categoria") {
        const guardVision = await protegerVisionLimit(phoneNumber);
        if (!guardVision.permitido) return guardVision.resposta;

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

        const guardVision = await protegerVisionLimit(phoneNumber);
        if (!guardVision.permitido) return guardVision.resposta;

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
        const itensExistentes = (session.descricao_carga || "").split(", ").filter((i) => i.trim().length > 0).length;
        const numeroFoto = itensExistentes + 1;

        // GUARD ANTI-ABUSE: limite de 15 fotos por cotacao.
        // Acima disso: escala humano. Razoes:
        // 1. Custo OpenAI Vision: 16+ fotos = R$ 0.04+ so de IA, mais que ganho
        //    da maioria das corridas pequenas
        // 2. Carga grande/complexa precisa avaliacao humana (frete >8m³ provavel)
        // 3. Anti-DDoS: limita gasto em caso de cliente malicioso/loop bot
        if (numeroFoto > 15) {
          await updateSession(phoneNumber, { step: "atendimento_humano" });
          await notificarAdminsComClaim(
            `📦 *CARGA GRANDE — ESPECIALISTA*`,
            phoneNumber,
            `Cliente mandou *${numeroFoto}+ fotos* (limite 15 atingido).\n\nProvavel mudanca grande/complexa. IA Vision parou de processar pra evitar custo desnecessario.\n\n*Itens identificados ate agora:*\n${session.descricao_carga || "-"}\n\n*Como agir:* chamar cliente no WhatsApp pra cotar manual.`
          );
          await sendToClient({
            to: phoneNumber,
            message: `📦 *Sua carga eh grande!*\n\nIdentifiquei mais de 15 itens — mudancas dessa proporcao precisam de *avaliacao personalizada* pra cotar o veiculo certo.\n\nUm *especialista* foi acionado e vai te chamar em alguns minutos pra fazer a cotacao manualmente. Aguarda 🙏`,
          });
          return NextResponse.json({ status: "carga_grande_escalada" });
        }

        const guardVision = await protegerVisionLimit(phoneNumber);
        if (!guardVision.permitido) return guardVision.resposta;

        // Feedback IMEDIATO pro cliente nao achar que travou (IA Vision demora 4-6s).
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
    //
    // BUG 30/Abr: isSaudacao retorna true pra QUALQUER mensagem que COMECA com
    // "oi"/"ola"/etc, mesmo briefings de 500+ chars que iniciam com saudacao.
    // Cliente real e teste do Fabio caiam aqui porque mandaram "Oi, tudo bem?
    // queria orcamento de mudanca..." (584 chars). Sistema pulava IA e perdia
    // tudo. Solucao: so consideramos saudacao PURA se mensagem eh curta (<30
    // chars) E comeca com saudacao. Briefings longos sempre vao pra IA.
    const ehSaudacaoPura = isSaudacao(message) && message.trim().length < 30;
    if (!ehSaudacaoPura && message.trim().length >= 10) {
      // Mostra "analisando" pra cliente nao achar que travou (IA leva 1-2s)
      await sendToClient({
        to: phone,
        message: `Olá ${nome}! 😊 Aqui é a *Íris* da Pegue Recebi sua mensagem, ja estou analisando pra agilizar o atendimento...`,
      });

      const contexto = await extrairContextoInicial(message);

      // Loga custo IA (gpt-4o-mini ~$0.001 por chamada). Cumpre regra
      // INFORMAR CUSTOS SEMPRE - admin pode somar via dashboard.
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "custo_estimado_ia",
          phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
          servico: "extrair_contexto_inicial",
          modelo: "gpt-4o-mini",
          custo_usd_estimado: 0.001,
        },
      });

      if (contexto && contexto.confianca !== "baixa") {
        // Salva TUDO que IA detectou na sessao. Ate 30/Abr salvavamos so 2 campos
        // (descricao_carga + veiculo_sugerido) e descartavamos andar, escada, ajudante,
        // data, periodo, qtd_caixas. Cliente real 29/Abr (914963096) deu briefing
        // completo e o bot pediu tudo de novo. Bug critico de UX.
        const itensComCaixas = (() => {
          const partes: string[] = [];
          if (contexto.itens.length > 0) partes.push(contexto.itens.join(", "));
          if (contexto.qtd_caixas) partes.push(`${contexto.qtd_caixas} caixa${contexto.qtd_caixas > 1 ? "s" : ""}`);
          if (contexto.qtd_sacolas) partes.push(`${contexto.qtd_sacolas} sacola${contexto.qtd_sacolas > 1 ? "s" : ""}`);
          return partes.length > 0 ? partes.join(", ") : null;
        })();
        const updatePayload: any = {
          step: "confirmar_contexto_inicial",
          descricao_carga: itensComCaixas,
          veiculo_sugerido: contexto.veiculo_sugerido,
        };
        if (contexto.andar_origem !== null && contexto.andar_origem > 0) {
          updatePayload.andar = contexto.andar_origem;
        }
        if (contexto.tem_escada_origem) updatePayload.tem_escada = true;
        if (contexto.precisa_ajudante) updatePayload.precisa_ajudante = true;
        if (contexto.data_texto) updatePayload.data_agendada = contexto.data_texto;
        if (contexto.periodo) updatePayload.periodo = contexto.periodo;
        await updateSession(phone, updatePayload);

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

      // IA falhou ou voltou confianca baixa. Antes caia silenciosamente no fluxo
      // tradicional (saudacao + menu). Cliente perdia o briefing inteiro. Agora
      // logamos o motivo pra observabilidade.
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "ia_contexto_falhou",
          phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
          motivo: !contexto ? "ia_retornou_null" : `confianca_${contexto.confianca}`,
          msg_length: message.length,
          mensagem_amostra: message.slice(0, 200),
        },
      });
    }

    // Se digitou termo de servico direto (frete, guincho, carreto, mudanca)
    if (isInicioServico(message)) {
      const saudacaoRapida = `Olá ${nome}! 😊 Sou a *Íris*, atendente virtual da Pegue\n\nVamos rapidamente fazer sua cotacao? Eu te ajudo, vamos la! 🚚\n\nO que voce precisa? *(digite o número)*\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudanca completa*\n3️⃣ *Guincho*\n4️⃣ *Duvidas frequentes*`;
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
    const saudacao = `Olá ${nome}! 😊 Sou a *Íris*, atendente virtual da Pegue\n\nVamos rapidamente fazer sua cotacao? Eu te ajudo, vamos la! 🚚\n\nO que voce precisa? *(digite o número)*\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudanca completa*\n3️⃣ *Guincho*\n4️⃣ *Duvidas frequentes*`;
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
      message: `Olá ${primeiroNome}! 😊 Que bom ter voce de volta — Íris da Pegue\n\nVamos rapidamente fazer sua cotacao? Eu te ajudo, vamos la! 🚚\n\nO que voce precisa? *(digite o número)*\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudanca completa*\n3️⃣ *Guincho*\n4️⃣ *Duvidas frequentes*`,
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

    case "aguardando_aceite_termos":
      await handleAceiteTermos(phone, message, instance);
      break;

    case "aguardando_clarificacao_itens":
      await handleClarificacaoItens(phone, message);
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

    case "aguardando_bairro_origem":
      await handleBairroOrigem(phone, message);
      break;

    case "aguardando_bairro_destino":
      await handleBairroDestino(phone, message);
      break;

    case "confirmando_enderecos_ia":
      await handleConfirmandoEnderecosIA(phone, message);
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

    case "fretista_aguardando_pin":
      await handleFretistaPinEntrega(phone, message);
      break;

    case "aguardando_confirmacao_coleta":
      await handleConfirmacaoColeta(phone, message);
      break;

    case "fretista_aguardando_cliente_ok_coleta":
      // Fretista nao deve falar nada agora - apenas aguarda o cliente.
      // Se mandar mensagem, lembra que esta aguardando.
      await sendToClient({
        to: phone,
        message: "⏳ Aguardando o cliente confirmar a coleta. Se em 10min ele nao responder, libero automatico.",
      });
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

    // === ESTADO INICIAL ===
    // Cliente em "inicio" (recem-criado, escalado de admin-operacao, ou devolvido
    // por VOLTA IRIS). Antes caia no default e gerava step_desconhecido. Agora
    // reseta pra menu inicial e segue fluxo padrao.
    //
    // Edge case prestador: prestador finaliza corrida e fica step=inicio.
    // Mostrar menu de cliente confunde. Se phone ja eh prestador cadastrado,
    // resposta neutra que nao puxa fluxo de cliente.
    case "inicio": {
      const { data: prestadorExistente } = await supabase
        .from("prestadores")
        .select("id,nome,status")
        .eq("telefone", phone)
        .maybeSingle();

      if (prestadorExistente && prestadorExistente.status === "aprovado") {
        // Prestador entre corridas — nao apresenta menu de cliente.
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "prestador_msg_step_inicio",
            phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
          },
        });
        await sendToClient({
          to: phone,
          message: `Olá ${(prestadorExistente.nome || "").split(" ")[0] || ""}! 😊 No momento não tem corrida ativa pra voce. Quando aparecer um frete, te aviso aqui.`,
        });
        break;
      }

      await updateSession(phone, { step: "aguardando_servico" });
      await sendToClient({
        to: phone,
        message: `Olá! 😊 Aqui é a Íris da Pegue. Como posso te ajudar hoje?\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudança completa*\n3️⃣ *Guincho*\n4️⃣ *Dúvidas frequentes*`,
      });
      break;
    }

    // === ATENDIMENTO HUMANO ===
    // Cliente esta sob atendimento manual do admin. Bot fica COMPLETAMENTE
    // calado: nao responde, nao notifica, nao spamma. Admin conversa pelo
    // WhatsApp da Pegue manualmente. Cliente volta pro bot quando admin
    // clicar "Devolver pro bot" em /admin/operacao-real.
    case "atendimento_humano":
      // Apenas registra que cliente mandou msg (rastreabilidade leve).
      // SEM sendToClient. SEM notificarAdmin. Silencio absoluto.
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "msg_em_atendimento_humano",
          phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
          msg_length: message.length,
        },
      });
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

// Envia o video tutorial de como mandar localizacao no WhatsApp + caption.
// Fallback: se ChatPro falhar (raro), manda so texto. Cliente leigo precisa
// do guia visual — bug 30/Abr identificou 5 pontos onde fluxo ja avancava
// pro step "aguardando_localizacao" sem o tutorial, deixando cliente perdido.
async function enviarTutorialLocalizacao(phone: string, textoFallback?: string) {
  const caption = textoFallback || MSG.pedirLocalizacao;
  try {
    await sendImageToClient({
      to: phone,
      url: MSG.TUTORIAL_LOCALIZACAO_URL,
      caption,
    });
  } catch {
    await sendToClient({ to: phone, message: caption });
  }
}

// STEP 0: Escolha do servico
async function handleEscolhaServico(phone: string, message: string) {
  const lower = message.toLowerCase().trim();

  if (lower === "1" || lower.includes("pequeno") || lower.includes("frete")) {
    await updateSession(phone, { step: "aguardando_localizacao" });
    await enviarTutorialLocalizacao(phone);
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
    await enviarTutorialLocalizacao(phone);
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

  // Caminho A1: cliente mandou origem E destino numa mensagem so (ex: "Alphaville
  // para Osasco"). Cliente real 30/Abr (958763067). Sistema antes geocodava a frase
  // inteira como UM endereco e falhava. Agora detecta padrao, separa os 2 e geocoda
  // os 2 em paralelo - depois pula direto pra resumo + cotacao se ambos sao validos.
  const origDest = separarOrigemDestino(message);
  if (origDest) {
    // Caso especial: cliente mandou SO ruas sem bairro/cidade ("rua X para rua Y").
    // Geocoder pode pegar rua errada em outra cidade. Mais seguro: pedir bairros
    // de cada uma. Pedido de Fabio 30/Abr.
    if (pareceRuaSemContexto(origDest.origem) && pareceRuaSemContexto(origDest.destino)) {
      await updateSession(phone, {
        step: "aguardando_bairro_origem",
        origem_endereco: origDest.origem, // guardado parcialmente (so a rua)
        destino_endereco: origDest.destino, // idem
      });
      await sendToClient({
        to: phone,
        message: `Anotei: *${origDest.origem}* (retirada) e *${origDest.destino}* (entrega)! 📍\n\nPra eu localizar certo, preciso saber o *bairro/cidade* de cada uma.\n\nEm qual *bairro ou cidade* fica a *${origDest.origem}*?\n\n_Ex: vila yara, osasco_`,
      });
      return;
    }

    const session = await getSession(phone);
    const [origemCoords, destinoCoords] = await Promise.all([
      geocodeAddress(origDest.origem),
      geocodeAddress(origDest.destino),
    ]);
    const origemOk = !!(origemCoords?.lat && origemCoords?.lng);
    const destinoOk = !!(destinoCoords?.lat && destinoCoords?.lng);
    if (origemOk && destinoOk && session) {
      // Mostra enderecos identificados pra cliente CONFIRMAR antes de cotar.
      // Evita geocoder pegar lugar errado (ex: bairro Pompeia SP vs cidade
      // Pompeia interior — diferenca de 500km na cotacao).
      await pedirConfirmacaoEnderecosIA(
        phone,
        origDest.origem, origemCoords!.lat, origemCoords!.lng,
        origDest.destino, destinoCoords!.lat, destinoCoords!.lng,
      );
      return;
    }
    // Nao geocodou os 2 - cai no fluxo padrao abaixo (provavelmente algum dos 2 nao foi
    // entendido pelo geocoder). Reseta a separacao pra evitar confusao.
  }

  // Caminho A2: cliente colou um link de Google Maps em vez de mandar GPS pelo clipe.
  // Cliente real 29/Abr (47-9901-0385) mandou maps.app.goo.gl shortlink achando que
  // era equivalente. Sistema rejeitava como endereco invalido. Agora resolvemos o
  // link, extraimos lat/lng e geocodificamos como se fosse GPS.
  const linkMaps = detectarLinkGoogleMaps(message);
  if (linkMaps) {
    const coords = await resolverGoogleMapsLink(linkMaps);
    if (coords) {
      const endereco = await reverseGeocode(coords.lat, coords.lng);
      await apresentarOrigemPraConfirmacao(phone, endereco, coords.lat, coords.lng);
      return;
    }
    // Falhou em resolver - logar e cair pro fluxo de erro abaixo
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "google_maps_link_falhou",
        phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
        link: linkMaps.slice(0, 200),
      },
    });
    await sendToClient({
      to: phone,
      message: `🤔 Não consegui ler esse link do Google Maps. Tenta mandar a *localização pelo ícone de anexo* (clipe 📎) > Localização. Ou digite o *endereço completo* (rua, número, bairro).`,
    });
    return;
  }

  // Caminho B: CEP
  const cep = extrairCep(message);
  if (cep) {
    const enderecoViaCep = await buscaCep(cep);
    if (enderecoViaCep) {
      const coords = await geocodeAddress(enderecoViaCep);
      if (coords?.lat && coords?.lng) {
        // NAO chama reverseGeocode aqui: o Google preenche um numero de casa
        // arbitrario na coord do meio da rua, fazendo o sistema "inventar" um
        // numero que nao eh o do cliente. O numero real eh coletado depois do
        // pagamento (handleNumeroColeta). Bug 29/Abr cliente 0774.
        await apresentarOrigemPraConfirmacao(
          phone,
          enderecoViaCep,
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
    // Heuristica: se mensagem tem ruido tipico de cliente brasileiro
    // (referencias subjetivas, mensagem longa), roda IA PRIMEIRO pra
    // limpar antes de geocodar. Custa ~R$0,003. Reduz falha em
    // periferia/casos de Vila Atlantico (28/Abr cliente real perdido).
    const lowerMsg = message.toLowerCase();
    const ruidoRegex = /perto\s+(do|da|de)|ao\s+lado|atras\s+(do|da)|embaixo|em\s+frente|proximo\s+(ao|do|da)|uma\s+(rua|travessa|esquina)\s+(da|do|de)|de?ois\s+(do|da)|antes\s+(do|da)|na\s+esquina|fundo[s]?\s+(do|da)/i;
    const enderecoConfuso =
      message.length > 60 || ruidoRegex.test(lowerMsg) || palavras.length > 8;

    if (enderecoConfuso) {
      try {
        const { interpretarEnderecoComIA } = await import("@/lib/geocoder-ia");
        const interpretado = await interpretarEnderecoComIA(message);
        if (interpretado && interpretado.confianca !== "BAIXA" && interpretado.textoLimpo) {
          const coordsIA = await geocodeAddress(interpretado.textoLimpo);
          if (coordsIA?.lat && coordsIA?.lng) {
            await supabase.from("bot_logs").insert({
              payload: {
                tipo: "geocoder_ia_primeiro_sucesso",
                texto_original: message.slice(0, 200),
                texto_limpo: interpretado.textoLimpo,
                confianca: interpretado.confianca,
                phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
              },
            });
            const enderecoFinalIA =
              (await reverseGeocode(coordsIA.lat, coordsIA.lng)) || interpretado.textoLimpo;
            await apresentarOrigemPraConfirmacao(
              phone,
              enderecoFinalIA,
              coordsIA.lat,
              coordsIA.lng,
            );
            return;
          }
        }
      } catch (e: any) {
        console.warn("geocoder-ia primeiro tent falhou:", e?.message);
        // Cai pro fluxo padrao
      }
    }

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

    // Caminho C2: Nominatim falhou. Tenta IA limpar o endereco antes
    // de desistir. Cliente brasileiro manda formato informal tipo:
    //   "Rua X 52 uma travessa da Y perto do céu Vila Z"
    // IA extrai rua + bairro + cidade, ignora ruido. Custo ~R$0.003.
    try {
      const { interpretarEnderecoComIA } = await import("@/lib/geocoder-ia");
      const interpretado = await interpretarEnderecoComIA(message);

      if (interpretado && interpretado.confianca !== "BAIXA" && interpretado.textoLimpo) {
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "geocoder_ia_tentativa",
            texto_original: message.slice(0, 200),
            texto_limpo: interpretado.textoLimpo,
            confianca: interpretado.confianca,
            phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
          },
        });

        const coordsIA = await geocodeAddress(interpretado.textoLimpo);
        if (coordsIA?.lat && coordsIA?.lng) {
          // IA salvou! Reformata e apresenta pra confirmar
          const enderecoFinal =
            (await reverseGeocode(coordsIA.lat, coordsIA.lng)) || interpretado.textoLimpo;
          await supabase.from("bot_logs").insert({
            payload: {
              tipo: "geocoder_ia_sucesso",
              texto_original: message.slice(0, 200),
              endereco_final: enderecoFinal,
              phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
            },
          });
          await apresentarOrigemPraConfirmacao(phone, enderecoFinal, coordsIA.lat, coordsIA.lng);
          return;
        }
      }
    } catch (e: any) {
      // Falha da IA nao bloqueia fluxo — segue pro escalation manual
      console.warn("geocoder-ia falhou:", e?.message);
    }
  }

  // Geocoder falhou OU texto muito vago.
  // ANTES: aceitavamos com fallback Osasco hardcoded (-23.5329, -46.7916).
  // Isso violava feedback_jamais_cotar_sem_certeza (lat/lng falsos = fretista
  // vai pro endereco errado). Agora pedimos endereco melhor.
  //
  // GUARD: contar tentativas falhadas seguidas. Apos 2 falhas, escalar pra
  // atendimento humano (cliente ficava em loop perdendo paciencia).
  // Bug detectado 28/Abr: cliente 8131 tentou 5x em 7min e desistiu.
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "origem_nao_identificada",
      phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
      texto_amostra: message.slice(0, 200),
    },
  });

  // Conta quantas vezes a sessao atual ja falhou identificar origem.
  // Janela: ult 30min. Threshold 1 = ja na 1a falha alerta admin (Fabio
  // exigiu 28/Abr - cliente nao pode ficar tentando varias vezes sem o
  // admin saber).
  const LIMITE_TENTATIVAS = 1; // 1 = alerta na primeira falha
  const desde30min = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const phoneMasked = phone.replace(/\d(?=\d{4})/g, "*");

  const { count: tentativasFalhas } = await supabase
    .from("bot_logs")
    .select("id", { count: "exact", head: true })
    .filter("payload->>tipo", "eq", "origem_nao_identificada")
    .filter("payload->>phone_masked", "eq", phoneMasked)
    .gte("criado_em", desde30min);

  if ((tentativasFalhas || 0) >= LIMITE_TENTATIVAS) {
    // ESCALA pra atendimento humano + alerta URGENTE com info completa
    await updateSession(phone, { step: "atendimento_humano" });

    // Busca todas tentativas dessa sessao pra mostrar ao admin
    const { data: tentativasLogs } = await supabase
      .from("bot_logs")
      .select("payload, criado_em")
      .filter("payload->>tipo", "eq", "origem_nao_identificada")
      .filter("payload->>phone_masked", "eq", phoneMasked)
      .gte("criado_em", desde30min)
      .order("criado_em", { ascending: true });

    // Busca dados do cliente (se tiver cadastro)
    const { data: clienteInfo } = await supabase
      .from("clientes")
      .select("nome, total_corridas")
      .eq("telefone", phone)
      .maybeSingle();

    const sessaoCli = await getSession(phone);
    const phoneClick = phone.replace(/\D/g, "");

    // Lista TODAS as tentativas (texto completo, nao amostra)
    const tentativasTexto = (tentativasLogs || [])
      .map((l, i) => {
        const txt = (l.payload as any)?.texto_amostra || "(vazio)";
        const hr = l.criado_em.slice(11, 16);
        return `${i + 1}) [${hr}] "${txt}"`;
      })
      .join("\n");

    const detalhesAdmin = [
      `🚨🚨🚨 *URGENTE — CLIENTE TRAVADO* 🚨🚨🚨`,
      ``,
      `👤 *Cliente:* ${clienteInfo?.nome || "(novo, sem cadastro)"}`,
      `📞 *Telefone:* +${phoneClick}`,
      `🔗 *Abrir conversa:* https://wa.me/${phoneClick}`,
      `📊 *Historico:* ${clienteInfo?.total_corridas || 0} corridas anteriores`,
      ``,
      `━━━━━━━━━━━━━━━━`,
      `❌ *PROBLEMA: nao consegui identificar o endereço de retirada*`,
      `Geocoder Nominatim falhou ${tentativasFalhas} vez(es).`,
      ``,
      `📝 *Tentativas do cliente:*`,
      tentativasTexto || `(ultima: "${message.slice(0, 200)}")`,
      ``,
      `📦 *Carga ja informada:* ${sessaoCli?.descricao_carga || "(nao informou ainda)"}`,
      `🏠 *Destino ja informado:* ${sessaoCli?.destino_endereco || "(nao informou ainda)"}`,
      ``,
      `━━━━━━━━━━━━━━━━`,
      `🎯 *AÇÃO IMEDIATA:*`,
      `Chama o cliente AGORA pelo WhatsApp da Pegue pra:`,
      `1) Pegar o endereço completo (rua + numero + bairro + cidade)`,
      `2) Continuar a cotacao manual`,
      ``,
      `🔇 Bot ja foi calado — voce pode responder sem conflito.`,
      `🤖 Pra reativar o bot depois: /admin/operacao-real -> Devolver pro bot`,
    ].join("\n");

    await sendToClient({
      to: phone,
      message: `Eu não tô conseguindo identificar seu endereço aqui — peço desculpa! 😔

Pra agilizar, *um especialista da nossa equipe* vai te chamar em poucos minutos pra anotar manualmente.

Pode aguardar, ele vai cuidar do seu frete com toda atenção. 🙏`,
    });

    // Claim: primeiro admin que mandar OK XXXX assume — evita 2 admins
    // contatarem o mesmo cliente travado em paralelo.
    await notificarAdminsComClaim(`📍 CLIENTE TRAVADO — ATUAR JA`, phone, detalhesAdmin);
    return;
  }

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

  // Lista rapida — aceita "2", "3" e palavra "lista".
  // A mensagem mostrada pro cliente pede pra digitar "3" pra ver lista.
  // "2" continua aceito por compat (versao antiga do menu).
  if (lower === "2" || lower === "3" || lower === "lista" || lower.includes("lista rapida")) {
    await sendToClient({ to: phone, message: MSG.listaMudanca });
    return;
  }

  // Opcao 1 - Foto (so texto, foto real e processada no topo do POST)
  if (lower === "1" || lower === "foto") {
    await sendToClient({ to: phone, message: "Manda a foto do material 📸" });
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
    // GUARD CONSERVADOR: so bloqueia se VIRTUALMENTE CERTO que eh endereco
    // (CEP completo, OU texto comeca com 'rua/av/avenida/alameda/estrada').
    // pareceEndereco() era agressivo demais (matchava 'osasco' isolado),
    // bloqueando descricoes de itens validas. Bug Jack 26/Abr.
    const lowerMsg = message.trim().toLowerCase();
    const comecaComVia = /^(rua|av|avenida|alameda|estrada|rodovia|travessa|praca|praça)\s+/i.test(lowerMsg);
    if (extrairCep(message) || comecaComVia) {
      await sendToClient({
        to: phone,
        message: `🤔 Parece que você mandou um *endereço*, mas agora preciso saber o *que* você vai transportar (não pra onde).\n\nMe manda:\n📸 Uma *foto* dos itens\nOU digite: *geladeira, sofá, cama casal*\n\nDepois pergunto o endereço de destino 😊`,
      });
      return;
    }

    // NOVO 29/Abr: classifica itens com IA OpenAI antes de aceitar.
    // Cliente brasileiro digita texto vago ("cama geladeira sofa"). IA:
    //  1. Separa cada item, estima volume_m3 + peso_kg
    //  2. Detecta itens VAGOS (sofa sem tamanho, cama sem tipo)
    //  3. Se vago, pergunta antes de cotar (regra: jamais cotar sem certeza)
    //  4. Se OK, calcula veiculo via volume+peso real
    // Custo IA: ~R$0,003/req. Bug origem: Jack 29/Abr "cama geladeira sofa"
    // virou utilitario errado (devia ser HR).
    try {
      const { classificarItensComIA, montarPerguntaClarificacao } = await import("@/lib/classificador-itens");
      const resultado = await classificarItensComIA(message);

      if (resultado) {
        const sessaoAtual = await getSession(phone);

        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "classificador_itens_resultado",
            phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
            texto: message.slice(0, 200),
            qtd_itens: resultado.itens.length,
            vagos: resultado.vagos.map(v => v.item),
            volume_total_m3: resultado.volume_total_m3,
            peso_total_kg: resultado.peso_total_kg,
            confianca: resultado.confianca,
          },
        });

        // Tem vagos -> pergunta antes de prosseguir
        if (resultado.vagos.length > 0) {
          await updateSession(phone, {
            step: "aguardando_clarificacao_itens",
            descricao_carga: message, // texto original preservado
          });
          await sendToClient({
            to: phone,
            message: montarPerguntaClarificacao(resultado.vagos),
          });
          return;
        }

        // Sem vagos -> calcula veiculo via volume+peso (preciso!)
        if (resultado.itens.length > 0) {
          const veiculoCalc = sugerirVeiculoPorVolumePeso(
            resultado.volume_total_m3,
            resultado.peso_total_kg,
          );

          if (veiculoCalc === "carga_excedida") {
            await sendToClient({
              to: phone,
              message: "📦 Carga muito grande pra nossa frota.\n\nUm atendente vai te ajudar com cotação personalizada. Aguarda alguns minutos 😊",
            });
            await updateSession(phone, {
              step: "atendimento_humano",
              descricao_carga: message,
            });
            return;
          }

          const veiculo = determinarMelhorVeiculo(
            sessaoAtual?.veiculo_sugerido || null,
            veiculoCalc,
          );
          const descricaoEstrutura = resultado.itens
            .map(i => `${i.qtd}x ${i.nome}`)
            .join(", ");

          await updateSession(phone, {
            step: "aguardando_destino",
            descricao_carga: descricaoEstrutura,
            veiculo_sugerido: veiculo,
          });
          await sendToClient({ to: phone, message: MSG.fotoRecebida(descricaoEstrutura) });
          return;
        }
      }
    } catch (e: any) {
      console.warn("classificador-itens falhou, fallback legado:", e?.message);
    }

    // FALLBACK LEGADO (se IA nao respondeu): contagem simples.
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

// formatarListaNumerada movida pra @/lib/bot-utils (importada no topo).

// STEP intermediario: cliente respondeu clarificacao de itens vagos (sofa,cama,etc)
// Combina texto original + resposta e re-classifica. Se ainda vago apos 1 tentativa,
// segue mesmo assim com estimativa conservadora (nao trava cliente em loop).
async function handleClarificacaoItens(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;

  const textoOriginal = session.descricao_carga || "";
  const textoCompleto = `${textoOriginal} - clarificacao do cliente: ${message}`;

  try {
    const { classificarItensComIA } = await import("@/lib/classificador-itens");
    const resultado = await classificarItensComIA(textoCompleto);

    if (resultado && resultado.itens.length > 0) {
      const veiculoCalc = sugerirVeiculoPorVolumePeso(
        resultado.volume_total_m3,
        resultado.peso_total_kg,
      );

      if (veiculoCalc === "carga_excedida") {
        await sendToClient({
          to: phone,
          message: "📦 Carga muito grande pra nossa frota.\n\nUm atendente vai te ajudar com cotacao personalizada 😊",
        });
        await updateSession(phone, { step: "atendimento_humano" });
        return;
      }

      const veiculo = determinarMelhorVeiculo(
        session.veiculo_sugerido || null,
        veiculoCalc,
      );
      const descricaoEstrutura = resultado.itens
        .map(i => `${i.qtd}x ${i.nome}`)
        .join(", ");

      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "classificador_itens_clarificado",
          phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
          original: textoOriginal.slice(0, 100),
          clarificacao: message.slice(0, 100),
          confianca: resultado.confianca,
          ainda_vagos: resultado.vagos.length,
          veiculo_sugerido: veiculo,
        },
      });

      await updateSession(phone, {
        step: "aguardando_destino",
        descricao_carga: descricaoEstrutura,
        veiculo_sugerido: veiculo,
      });
      await sendToClient({ to: phone, message: MSG.fotoRecebida(descricaoEstrutura) });
      return;
    }
  } catch (e: any) {
    console.warn("clarificacao itens IA falhou:", e?.message);
  }

  // Fallback: IA nao respondeu - junta texto e segue com contagem simples
  const todoTexto = `${textoOriginal} ${message}`.trim();
  let qtdItens = contarItensTexto(todoTexto) || 1;
  let veiculoSugerido = "utilitario";
  if (qtdItens >= 8) veiculoSugerido = "caminhao_bau";
  else if (qtdItens >= 3) veiculoSugerido = "hr";
  const veiculo = determinarMelhorVeiculo(session.veiculo_sugerido || null, veiculoSugerido);

  await updateSession(phone, {
    step: "aguardando_destino",
    descricao_carga: todoTexto,
    veiculo_sugerido: veiculo,
  });
  await sendToClient({ to: phone, message: MSG.fotoRecebida(todoTexto) });
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
// determinarMelhorVeiculo movida pra @/lib/bot-utils (importada no topo).

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

  // Cliente mandou link Google Maps em vez de digitar endereco do destino
  const linkMaps = detectarLinkGoogleMaps(message);
  if (linkMaps) {
    const coords = await resolverGoogleMapsLink(linkMaps);
    if (coords) {
      destinoLat = coords.lat;
      destinoLng = coords.lng;
      destinoEndereco = await reverseGeocode(coords.lat, coords.lng) || "Localizacao do Google Maps";
    } else {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "google_maps_link_destino_falhou",
          phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
          link: linkMaps.slice(0, 200),
        },
      });
      await sendToClient({
        to: phone,
        message: `🤔 Não consegui ler esse link do Google Maps. Pode digitar o *endereço completo de entrega* (rua, número, bairro)?`,
      });
      return;
    }
  }

  // Se ja resolvemos por link Maps, pula o fluxo de CEP / texto.
  let cep: string | null = null;
  if (!linkMaps) {
    cep = extrairCep(message);
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
  // Bug 29/Abr: quando vem por CEP, reverseGeocode adiciona numero arbitrario do
  // meio da rua (Google "embeleza" coords). Mantemos string crua do ViaCEP
  // (sem numero) — numero real eh coletado pos-pagamento via handleNumeroDestino.
  if (!cep && !linkMaps) {
    const enderecoFormatado = inputContemRua(message)
      ? await reverseGeocode(destinoLat, destinoLng)
      : await reverseGeocodeBairroCidade(destinoLat, destinoLng);
    if (enderecoFormatado && enderecoFormatado !== "Localizacao recebida") {
      destinoEndereco = enderecoFormatado;
    }
  }
  // Quando veio de CEP ou link Maps, destinoEndereco ja foi setado acima
  // (string ViaCEP sem numero, ou reverse do link Maps que reflete o ponto real).

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
    await notificarAdminsComClaim(
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
      message: `✅ Anotado! Como prefere enviar?\n\n📸 *Foto* — manda 1 ou várias\n\n✏️ *Digita tudo de uma vez:*\n_Ex: geladeira, fogão, sofá, 3 caixas, cama_\n\n📋 *3* — lista de móveis comuns`,
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
    await enviarTutorialLocalizacao(
      phone,
      "Sem problema! Me manda o *endereço de retirada correto* 📍\n\nToca no *icone de anexo* (canto inferior direito) > *Localizacao* (mais preciso)\n\nOu digita rua + bairro + cidade.",
    );
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
    // CAMINHO RAPIDO: se IA capturou andar/escada/ajudante na 1a msg do cliente,
    // pula tipo_local + andar + ajudante. Cliente nao eh perguntado de novo.
    // Detectado via bot_logs.contexto_extraido_inicial.
    const { data: logCtx } = await supabase
      .from("bot_logs")
      .select("payload")
      .filter("payload->>tipo", "eq", "contexto_extraido_inicial")
      .filter("payload->>phone", "eq", phone)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    const contexto = (logCtx?.payload as any)?.contexto as ContextoExtraido | undefined;

    // SO pula tipo_local se cliente falou EXPLICITAMENTE da origem (andar/escada).
    // tem_elevador_destino eh do destino, nao info de origem.
    const iaTemTipoLocalOrigem = !!(contexto && (
      (contexto.andar_origem !== null && contexto.andar_origem !== undefined && contexto.andar_origem > 0) ||
      contexto.tem_escada_origem
    ));
    // SO pula handleAjudante se cliente disse EXPLICITAMENTE que quer ajudante.
    // Default false (nao mencionou) NAO pula - mantem cliente sendo perguntado.
    const iaConfirmouAjudante = contexto?.precisa_ajudante === true;

    if (iaTemTipoLocalOrigem && iaConfirmouAjudante) {
      // Pula tipo_local + andar + ajudante - cota direto.
      await sendToClient({
        to: phone,
        message: `📊 Calculando seu orçamento...`,
      });
      await calcularEEnviarOrcamento(phone, 1);
      return;
    }

    if (iaTemTipoLocalOrigem && !iaConfirmouAjudante) {
      // Tem andar/escada mas nao confirmou ajudante - vai pra aguardando_ajudante.
      await updateSession(phone, { step: "aguardando_ajudante" });
      await sendToClient({
        to: phone,
        message: MSG.precisaAjudante(`${contexto!.andar_origem && contexto!.andar_origem > 0 ? `${contexto!.andar_origem}o andar anotado` : "Anotado"}, vamos seguir!`),
      });
      return;
    }

    // Sem info da IA - fluxo padrao
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

  await calcularEEnviarOrcamento(phone, qtdAjudantes);
}

// Calcula preco da corrida e envia orcamento ao cliente. Aplica camadas de
// sanidade + ajustes admin. Avanca step pra aguardando_data.
// Reutilizada por: handleAjudante (fluxo padrao) e handleConfirmandoDestino
// (caminho rapido quando IA ja decidiu ajudante na 1a msg).
async function calcularEEnviarOrcamento(phone: string, qtdAjudantes: number) {
  const session = await getSession(phone);
  if (!session) return;

  await updateSession(phone, { precisa_ajudante: qtdAjudantes > 0 });
  await supabase.from("bot_logs").insert({ payload: { tipo: "qtd_ajudantes", phone, qtd: qtdAjudantes } });

  let distanciaKm = 2;
  if (session.origem_lat && session.origem_lng && session.destino_lat && session.destino_lng) {
    distanciaKm = calcularDistanciaKm(
      session.origem_lat, session.origem_lng,
      session.destino_lat, session.destino_lng
    );
  }

  const veiculo = session.veiculo_sugerido || "utilitario";
  const precos = calcularPrecos(distanciaKm, veiculo, qtdAjudantes > 0, session.andar || 0, false, session.destino_endereco || "", session.data_agendada || null);

  const ajudanteExtra = qtdAjudantes === 2 ? (distanciaKm <= 10 ? 80 : 100) : 0;
  let totalAntes = precos.padrao.total + ajudanteExtra;

  const { aplicarAjustes } = await import("@/lib/ajustes-precos");
  const qtdItensTotal = (session.descricao_carga || "").split(",").length;
  const { precoFinal } = await aplicarAjustes(totalAntes, {
    veiculo,
    zona: precos.zona,
    km: distanciaKm,
    qtdItens: qtdItensTotal,
    comAjudante: qtdAjudantes > 0,
  });

  const { validarPrecoFinal } = await import("@/lib/sanidade-preco");
  const sanidade = await validarPrecoFinal(precoFinal, {
    veiculo,
    km: distanciaKm,
    qtdItens: qtdItensTotal,
    temAjudante: qtdAjudantes > 0,
  });

  if (!sanidade.ok) {
    const precoValidado = sanidade.precoOriginal;
    await updateSession(phone, {
      step: "aguardando_revisao_admin",
      distancia_km: distanciaKm,
      valor_estimado: precoValidado,
    });
    await sendToClient({ to: phone, message: MSG.precoEmRevisao });
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
    return;
  }

  const precoValidado = sanidade.preco;
  const veiculoNome: Record<string, string> = {
    utilitario: "Utilitario (Strada/Saveiro)",
    hr: "HR",
    caminhao_bau: "Caminhao Bau",
    guincho: "Guincho",
    moto_guincho: "Guincho de Moto",
  };

  // Se sessao ja tem data_agendada (IA capturou na 1a msg), pula handleData
  // e vai direto pra aguardando_confirmacao com o resumo final.
  const temData = session.data_agendada && session.data_agendada.trim().length > 0;
  await updateSession(phone, {
    step: temData ? "aguardando_confirmacao" : "aguardando_data",
    distancia_km: distanciaKm,
    valor_estimado: precoValidado,
  });

  const obsFeriado = precos.padrao.feriado > 0
    ? `Feriado ${precos.padrao.feriadoNome || ""} - adicional R$ ${precos.padrao.feriado} ja incluido`
    : undefined;

  // Se ja temos data + horario salvos (IA capturou na 1a msg), pula MSG.orcamento
  // (que pediria data) e manda direto o resumoFrete com checklist + 1 SIM / 2 ALTERAR.
  // Senao, manda orcamento que pede data, e cliente vai pra aguardando_data normal.
  if (temData) {
    const detalhes: string[] = [];
    if (qtdAjudantes > 0) detalhes.push(`🙋 Com ${qtdAjudantes === 1 ? "ajudante" : "2 ajudantes"}`);
    if (session.tem_escada && session.andar && session.andar > 0) detalhes.push(`🪜 ${session.andar}o andar (escada)`);
    await sendToClient({
      to: phone,
      message: MSG.resumoFrete(
        session.origem_endereco || "Origem",
        session.destino_endereco || "Destino",
        session.descricao_carga || "Material",
        session.data_agendada!,
        veiculoNome[veiculo] || "Utilitario",
        precoValidado.toString(),
        detalhes.join("\n") + (detalhes.length ? "\n" : ""),
      ),
    });
  } else {
    await sendToClient({
      to: phone,
      message: MSG.orcamento(
        session.origem_endereco || "Origem",
        session.destino_endereco || "Destino",
        session.descricao_carga || "Material",
        veiculoNome[veiculo] || "Utilitario",
        precoValidado.toString(),
        obsFeriado,
        qtdAjudantes,
      ),
    });
  }
}

// Mostra os enderecos identificados pra cliente CONFIRMAR antes de cotar.
// Crucial pra evitar geocoder pegar lugar errado (ex: cliente diz "Pompeia"
// referindo-se ao bairro de SP, geocoder pega Pompeia interior 500km longe).
// Cliente real 30/Abr cotou R$2k+ por engano. Regra "JAMAIS cotar sem certeza".
async function pedirConfirmacaoEnderecosIA(
  phone: string,
  origem: string,
  origemLat: number,
  origemLng: number,
  destino: string,
  destinoLat: number,
  destinoLng: number,
) {
  const distanciaKm = calcularDistanciaKm(origemLat, origemLng, destinoLat, destinoLng);
  // Pega nome formatado (cidade/UF) pra cliente conferir se geocoder pegou certo
  const [origemFmt, destinoFmt] = await Promise.all([
    reverseGeocodeBairroCidade(origemLat, origemLng).catch(() => null),
    reverseGeocodeBairroCidade(destinoLat, destinoLng).catch(() => null),
  ]);

  // Salva enderecos formatados em bot_logs pra historico/auditoria/observabilidade.
  // (regra armazenamento inegociavel: nada de info perdida silenciosamente).
  // Util pra: detectar ambiguidade (Pompeia capital vs interior), comparar input
  // vs resultado real do geocoder, alimentar aprendizado constante.
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "enderecos_formatados_ia",
      phone,
      origem_input: origem,
      origem_formatado: origemFmt || null,
      origem_lat: origemLat,
      origem_lng: origemLng,
      destino_input: destino,
      destino_formatado: destinoFmt || null,
      destino_lat: destinoLat,
      destino_lng: destinoLng,
      distancia_km: distanciaKm,
    },
  });

  // Distancia anomala (>100km na Grande SP) = sinal de geocoder pegou cidade
  // errada. Loga pra alerta proativo e auditoria. Cliente vai ver na confirmacao
  // mas isso eh sinal vermelho pro aprendizado constante.
  if (distanciaKm > 100) {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "distancia_anomala_detectada",
        phone,
        origem,
        destino,
        origem_formatado: origemFmt,
        destino_formatado: destinoFmt,
        distancia_km: distanciaKm,
      },
    });
  }

  await updateSession(phone, {
    step: "confirmando_enderecos_ia",
    origem_endereco: origem,
    origem_lat: origemLat,
    origem_lng: origemLng,
    destino_endereco: destino,
    destino_lat: destinoLat,
    destino_lng: destinoLng,
    distancia_km: distanciaKm,
  });
  await sendToClient({
    to: phone,
    message: `📍 *Confere se identifiquei os endereços certos:*

📍 *Coleta:* ${origem}${origemFmt && origemFmt !== "Localizacao recebida" ? `\n   _(${origemFmt})_` : ""}
🏠 *Entrega:* ${destino}${destinoFmt && destinoFmt !== "Localizacao recebida" ? `\n   _(${destinoFmt})_` : ""}

📏 *Distância:* ${distanciaKm.toFixed(1)} km

━━━━━━━━━━━━━━━━

1️⃣ ✅ *SIM, está certo* - calcular orçamento
2️⃣ ✏️ *EDITAR* - corrigir endereço`,
  });
}

async function handleConfirmandoEnderecosIA(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session) return;
  const lower = message.toLowerCase().trim();

  // Detecta se eh fluxo de guincho ou frete (rotas diferentes apos confirmar)
  const isGuincho = session.veiculo_sugerido === "guincho" || session.veiculo_sugerido === "moto_guincho";

  if (lower === "1" || lower.startsWith("sim") || lower === "s" || lower === "ok" || lower === "confirmar" || lower === "correto") {
    await sendToClient({ to: phone, message: `📊 Calculando seu orçamento...` });
    if (isGuincho) {
      await cotarGuinchoEFinalizar(phone);
      return;
    }
    const iaConfirmouAjudante = !!session.precisa_ajudante;
    if (iaConfirmouAjudante) {
      await calcularEEnviarOrcamento(phone, 1);
    } else {
      await updateSession(phone, { step: "aguardando_ajudante" });
      await sendToClient({ to: phone, message: MSG.precisaAjudante(`Endereços confirmados! ✅`) });
    }
    return;
  }

  if (lower === "2" || lower === "editar" || lower === "alterar" || lower.startsWith("nao") || lower === "n" || lower === "não" || lower.includes("corrigir")) {
    await updateSession(phone, { step: "editando_escolha" });
    await sendToClient({
      to: phone,
      message: `✏️ *O que você quer corrigir?*\n\n1️⃣ *Origem* (onde buscar)\n2️⃣ *Destino* (onde entregar)\n3️⃣ *Itens / material*\n4️⃣ *Data / horário*\n5️⃣ *Cancelar tudo* e começar do zero`,
    });
    return;
  }

  await sendToClient({
    to: phone,
    message: `Pra prosseguir:\n\n1️⃣ ✅ *SIM, está certo*\n2️⃣ ✏️ *EDITAR*`,
  });
}

// Cliente mandou "rua X para rua Y" sem bairro. Sistema agora pergunta os
// bairros um de cada vez (origem -> destino) e depois geocoda + cota direto.
async function handleBairroOrigem(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session || !session.origem_endereco) return;

  const bairro = message.trim();
  if (bairro.length < 2) {
    await sendToClient({
      to: phone,
      message: `Pra localizar a *${session.origem_endereco}*, me manda o *bairro ou cidade* 😊\n\n_Ex: vila yara, osasco_`,
    });
    return;
  }

  const origemFull = `${session.origem_endereco}, ${bairro}`;
  await sendToClient({ to: phone, message: `📍 Localizando *${session.origem_endereco}, ${bairro}*...` });
  const coords = await geocodeAddress(origemFull);

  if (!coords?.lat || !coords?.lng) {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "bairro_origem_nao_geocodou",
        phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
        tentativa: origemFull.slice(0, 200),
      },
    });
    await sendToClient({
      to: phone,
      message: `Não consegui achar *${origemFull}* 😅\n\nPode mandar com mais detalhes? *Bairro + cidade*\n\n_Ex: vila yara, osasco_`,
    });
    return;
  }

  await updateSession(phone, {
    step: "aguardando_bairro_destino",
    origem_endereco: origemFull,
    origem_lat: coords.lat,
    origem_lng: coords.lng,
  });
  await sendToClient({
    to: phone,
    message: `✅ Origem anotada!\n\nAgora me diz o *bairro ou cidade* da *${session.destino_endereco}* (entrega):\n\n_Ex: vila madalena, sao paulo_`,
  });
}

async function handleBairroDestino(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session || !session.destino_endereco) return;

  const bairro = message.trim();
  if (bairro.length < 2) {
    await sendToClient({
      to: phone,
      message: `Me manda o *bairro ou cidade* da *${session.destino_endereco}* 😊\n\n_Ex: vila madalena, sao paulo_`,
    });
    return;
  }

  const destinoFull = `${session.destino_endereco}, ${bairro}`;
  await sendToClient({ to: phone, message: `📍 Localizando *${session.destino_endereco}, ${bairro}*...` });
  const coords = await geocodeAddress(destinoFull);

  if (!coords?.lat || !coords?.lng) {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "bairro_destino_nao_geocodou",
        phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
        tentativa: destinoFull.slice(0, 200),
      },
    });
    await sendToClient({
      to: phone,
      message: `Não consegui achar *${destinoFull}* 😅\n\nPode mandar com mais detalhes? *Bairro + cidade*\n\n_Ex: vila madalena, sao paulo_`,
    });
    return;
  }

  // Tudo localizado - mostra confirmacao antes de cotar (regra: jamais cotar sem certeza)
  if (!session.origem_lat || !session.origem_lng) {
    // edge case: origem foi salva mas perdeu coords - escala humano
    await sendToClient({
      to: phone,
      message: `Algo deu errado ao guardar sua origem 😕 Manda *oi* pra recomecar.`,
    });
    return;
  }
  await pedirConfirmacaoEnderecosIA(
    phone,
    session.origem_endereco!, session.origem_lat, session.origem_lng,
    destinoFull, coords.lat, coords.lng,
  );
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
// Resumo agora oferece 3 opcoes claras: 1=CONFIRMAR, 2=FRETE AGORA, 3=EDITAR.
// Cliente tb pode mandar nova data/hora (atualiza) ou palavras-chave.
async function handleConfirmacao(phone: string, message: string, instance: 1 | 2 = 1) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  // Helper que avanca pra termos de pagamento.
  const avancarParaTermos = async () => {
    const valorFmt = (session.valor_estimado || 0).toFixed(2).replace(".", ",");
    await updateSession(phone, { step: "aguardando_aceite_termos" });
    await sendToClient({ to: phone, message: MSG.aceiteTermosPagamento(valorFmt) });
  };

  // Opcao 2: FRETE AGORA (urgente)
  if (lower === "2" || lower === "agora" || lower === "ja" || lower === "já" || lower === "urgente" || lower.includes("frete agora") || lower.includes("urgent")) {
    await updateSession(phone, { data_agendada: "AGORA - Urgente", periodo: null });
    await avancarParaTermos();
    return;
  }

  // Opcao 3: EDITAR
  if (lower === "3" || lower === "editar" || lower === "alterar" || lower.includes("corrigir") || lower.includes("mudar") || lower.startsWith("nao") || lower === "n" || lower === "não") {
    await updateSession(phone, { step: "editando_escolha" });
    await sendToClient({
      to: phone,
      message: `✏️ *O que você quer corrigir?*\n\n1️⃣ *Origem* (onde buscar)\n2️⃣ *Destino* (onde entregar)\n3️⃣ *Itens / material*\n4️⃣ *Data / horário*\n5️⃣ *Cancelar tudo* e começar do zero`,
    });
    return;
  }

  // Opcao 1: CONFIRMAR (mantem data atual da sessao)
  const confirmacaoSimples = lower === "1" || lower.startsWith("sim") || lower === "s" || lower === "confirmar" || lower === "confirmo" || lower === "correto" || lower === "ok";
  if (confirmacaoSimples) {
    if (session.data_agendada && session.data_agendada.trim().length > 0) {
      await avancarParaTermos();
      return;
    }
    await sendToClient({
      to: phone,
      message: `Pra confirmar, preciso do *dia e horário* 😊\n\n_Ex: 11/05 manhã, amanha 14h, segunda 9h_\n\nOu digite *2* pra *frete agora* (urgente) ou *3* pra editar.`,
    });
    return;
  }

  // Cliente mandou nova data/hora — atualiza e avanca
  const dataExtraida = extrairData(lower);
  const horarioExtraido = extrairHorario(lower);

  if (dataExtraida && horarioExtraido) {
    await updateSession(phone, {
      data_agendada: `${dataExtraida} - ${horarioExtraido}`,
      periodo: null,
    });
    await avancarParaTermos();
    return;
  }

  // So data: salva e pede horario (mantem horario salvo se existir)
  if (dataExtraida && !horarioExtraido) {
    if (session.periodo) {
      // ja tinha periodo salvo - completa e avanca
      await updateSession(phone, {
        data_agendada: `${dataExtraida} - ${session.periodo}`,
        periodo: null,
      });
      await avancarParaTermos();
      return;
    }
    await updateSession(phone, { data_agendada: dataExtraida });
    await sendToClient({
      to: phone,
      message: `📅 *${dataExtraida}* - Anotado!\n\nAgora informe o *horario*:\n\n1️⃣ *Manha* (08:00 - 12:00)\n2️⃣ *Tarde* (13:00 - 17:00)\n\nOu digite o horario direto (ex: *14h*, *15:30*, *9 horas*).`,
    });
    return;
  }

  // So horario: salva temp em periodo + pede dia (a menos que ja tenha data)
  if (!dataExtraida && horarioExtraido) {
    if (session.data_agendada && session.data_agendada.trim().length > 0) {
      // ja tem data - completa e avanca
      await updateSession(phone, {
        data_agendada: `${session.data_agendada} - ${horarioExtraido}`,
        periodo: null,
      });
      await avancarParaTermos();
      return;
    }
    await updateSession(phone, { periodo: horarioExtraido });
    await sendToClient({
      to: phone,
      message: `⏰ *${horarioExtraido}* - Anotado!\n\nAgora me informa o *dia*:\n\n_Ex: 25/04, amanha, segunda_`,
    });
    return;
  }

  // Nao entendeu - repete pergunta
  await sendToClient({
    to: phone,
    message: `Pra confirmar, me manda o *dia e horário* 😊\n\n_Ex: 25/04 as 15h, amanha 14:30, segunda 9h, AGORA_\n\nOu digite *EDITAR* pra corrigir algo.`,
  });
}

// STEP 7.5: Aceite de termos de pagamento (dispatch APOS aceite explicito).
// Garante que cliente que NAO aceita os termos nao perturba fretistas atoa.
async function handleAceiteTermos(phone: string, message: string, instance: 1 | 2 = 1) {
  const session = await getSession(phone);
  if (!session) return;

  const lower = message.toLowerCase().trim();

  // Opcao 1: CHAMAR FRETISTA
  if (lower === "1" || lower.startsWith("sim") || lower === "aceito" || lower === "s" || lower.includes("aceit") || lower.includes("chamar fretista") || lower.includes("chamar fret")) {
    const corridaId = await salvarCorrida(session);
    if (corridaId) {
      await updateSession(phone, { step: "aguardando_fretista", corrida_id: corridaId });
      await sendToClient({ to: phone, message: MSG.freteRecebido });
      await dispararParaFretistas(corridaId, session, phone);
    } else {
      await sendToClient({ to: phone, message: MSG.erroInterno });
    }
    return;
  }

  // Opcao 2: EDITAR (volta pro menu de edicao - nao reseta sessao)
  if (lower === "2" || lower === "editar" || lower === "alterar" || lower.includes("corrigir") || lower.includes("mudar")) {
    await updateSession(phone, { step: "editando_escolha" });
    await sendToClient({
      to: phone,
      message: `✏️ *O que você quer corrigir?*\n\n1️⃣ *Origem* (onde buscar)\n2️⃣ *Destino* (onde entregar)\n3️⃣ *Itens / material*\n4️⃣ *Data / horário*\n5️⃣ *Cancelar tudo* e começar do zero`,
    });
    return;
  }

  // Cancelar explicito (palavra-chave forte)
  if (lower.startsWith("nao") || lower === "n" || lower === "não" || lower === "cancelar" || lower.includes("recus") || lower.includes("desist")) {
    await deleteSession(phone);
    await sendToClient({
      to: phone,
      message: `Tudo bem! ✅\n\nSeu frete foi *cancelado* — nenhum fretista foi acionado.\n\nQuando quiser cotar de novo, manda *oi* 😊`,
    });
    return;
  }

  // Resposta nao reconhecida
  await sendToClient({
    to: phone,
    message: "Pra prosseguir, escolha:\n\n1️⃣ 🚚 *CHAMAR FRETISTA*\n2️⃣ ✏️ *EDITAR* (corrigir algo)",
  });
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
    await enviarTutorialLocalizacao(
      phone,
      "Sem problema! Me manda a nova *localização de retirada* 📍\n\nToca no *icone de anexo* (canto inferior direito) > Localização\nOu digite o *CEP* ou *endereço completo com rua e bairro*",
    );
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
      message: "Tudo bem, vamos começar do zero 😊\n\nO que você precisa? *(digite o número)*\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudança completa*\n3️⃣ *Guincho* (carro ou moto)\n4️⃣ *Dúvidas frequentes*",
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

  // safeInsert: garante que ocorrencia eh efetivamente registrada.
  // Antes silenciava erros (regra de armazenamento inegociavel violada).
  const { safeInsert } = await import("@/lib/db-helpers");
  const insertResult = await safeInsert<{ id: string }>({
    tabela: "ocorrencias",
    contexto: "fretista_divergencia",
    notificarAdminEmFalha: true, // critico: sem ocorrencia registrada, problema some
    dados: {
      corrida_id: session.corrida_id,
      prestador_id: prestador?.id || null,
      cliente_id: corrida?.cliente_id || null,
      tipo: tipoConfig.label,
      status: "aberta",
    },
  });
  const ocorrencia = insertResult.ok ? insertResult.data : null;

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
    const guardVision = await protegerVisionLimit(phone);
    if (!guardVision.permitido) return;

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

    // Guincho — paridade com fluxo de frete. Aproveita ao maximo o que IA capturou:
    //  - veiculo_marca_modelo: ja preenche descricao_carga + categoria,
    //    handleGuinchoCategoria detecta "|" em descricao_carga e pula direto
    //    pra guincho_localizacao.
    //  - origem_texto + destino_texto: vai DIRETO pra confirmacao de enderecos
    //    (igual frete). Cliente que mandou briefing completo nao re-pergunta.
    if (contexto?.servico === "guincho") {
      const temVeiculo = !!contexto.veiculo_marca_modelo;
      const cat = temVeiculo ? detectarCategoriaVeiculo(contexto.veiculo_marca_modelo!) : null;

      // Caminho rapido: tem veiculo + origem + destino -> geocoda e confirma enderecos
      if (temVeiculo && contexto.origem_texto && contexto.destino_texto) {
        await sendToClient({
          to: phone,
          message: `📍 Localizando os endereços, só um momento...`,
        });
        const [origemCoords, destinoCoords] = await Promise.all([
          geocodeAddress(contexto.origem_texto),
          geocodeAddress(contexto.destino_texto),
        ]);
        const origemOk = !!(origemCoords?.lat && origemCoords?.lng);
        const destinoOk = !!(destinoCoords?.lat && destinoCoords?.lng);
        if (origemOk && destinoOk) {
          await updateSession(phone, {
            descricao_carga: `Guincho - ${cat!.nome} | ${contexto.veiculo_marca_modelo}`,
            veiculo_sugerido: cat!.tipo === "moto" ? "moto_guincho" : "guincho",
          });
          await pedirConfirmacaoEnderecosIA(
            phone,
            contexto.origem_texto, origemCoords!.lat, origemCoords!.lng,
            contexto.destino_texto, destinoCoords!.lat, destinoCoords!.lng,
          );
          return;
        }
        // Geocode falhou — cai pra fluxo com so veiculo (pede localizacao)
      }

      // Caminho com veiculo mas sem (ou geocode falhou nos) enderecos:
      // descricao_carga ja inclui "|" entao handleGuinchoCategoria pula
      // direto pra guincho_localizacao quando cliente escolher Imediato/Agendado.
      if (temVeiculo) {
        await updateSession(phone, {
          step: "guincho_categoria",
          descricao_carga: `Guincho - ${cat!.nome} | ${contexto.veiculo_marca_modelo}`,
          veiculo_sugerido: cat!.tipo === "moto" ? "moto_guincho" : "guincho",
        });
        await sendToClient({
          to: phone,
          message: `🚗 Anotei: *${contexto.veiculo_marca_modelo}*\n\nPrecisa agora ou vai agendar?\n\n1️⃣ *Guincho Imediato* (preciso AGORA)\n2️⃣ *Guincho Agendado* (escolher dia e horário)`,
        });
        return;
      }

      // Sem info de veiculo na IA — fluxo normal de guincho
      await updateSession(phone, { step: "guincho_categoria" });
      await sendToClient({
        to: phone,
        message: `🚗 Certo! Guincho.\n\nPrecisa agora ou vai agendar?\n\n1️⃣ *Guincho Imediato* (preciso AGORA)\n2️⃣ *Guincho Agendado* (escolher dia e horario)`,
      });
      return;
    }

    // CAMINHO RAPIDO: se IA capturou origem E destino texto, tenta geocodar os dois
    // e ir direto pra cotacao. Cliente que ja deu briefing completo nao precisa
    // ser perguntado de novo. Bug 29/Abr cliente real (914963096) que abandonou
    // por causa disso.
    if (contexto?.origem_texto && contexto?.destino_texto) {
      await sendToClient({
        to: phone,
        message: `📍 Localizando os endereços, só um momento...`,
      });

      const [origemCoords, destinoCoords] = await Promise.all([
        geocodeAddress(contexto.origem_texto),
        geocodeAddress(contexto.destino_texto),
      ]);

      const origemOk = !!(origemCoords?.lat && origemCoords?.lng);
      const destinoOk = !!(destinoCoords?.lat && destinoCoords?.lng);

      if (origemOk && destinoOk) {
        // Antes de cotar, MOSTRA os enderecos identificados pra cliente
        // confirmar que geocoder pegou os lugares certos (evita Pompeia
        // capital virar Pompeia interior). Regra: jamais cotar sem certeza.
        await pedirConfirmacaoEnderecosIA(
          phone,
          contexto.origem_texto, origemCoords!.lat, origemCoords!.lng,
          contexto.destino_texto, destinoCoords!.lat, destinoCoords!.lng,
        );
        return;
      }

      // Geocode falhou em pelo menos 1 endereço - cai no fluxo padrao com info parcial
      if (origemOk && !destinoOk) {
        await updateSession(phone, {
          step: "aguardando_destino",
          origem_endereco: contexto.origem_texto,
          origem_lat: origemCoords!.lat,
          origem_lng: origemCoords!.lng,
        });
        await sendToClient({
          to: phone,
          message: `📍 Coleta confirmada em *${contexto.origem_texto}*!\n\nNão consegui localizar o destino só pelo texto. Pode mandar o *endereço completo de entrega* (rua + número + bairro)?`,
        });
        return;
      }
      // Caso só destino ok ou nenhum - pede localizacao do zero
    }

    // Fluxo padrao: tem item identificado, pula foto e pede localizacao
    if (session.descricao_carga) {
      await updateSession(phone, { step: "aguardando_localizacao" });
      await enviarTutorialLocalizacao(
        phone,
        `Perfeito! Pulei a parte de identificar o material ✅\n\nAgora me manda a *localização de retirada* 📍\n\nToca no *icone de anexo* (canto inferior direito) > Localização\nOu digite o *CEP* ou *endereço completo*`,
      );
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
      message: `Vamos la! 🚚\n\nO que voce precisa? *(digite o número)*\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudanca completa*\n3️⃣ *Guincho*\n4️⃣ *Duvidas frequentes*`,
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
      message: `Sem problema! 😊 Vamos do inicio.\n\nO que voce precisa? *(digite o número)*\n\n1️⃣ *Pequenos Fretes*\n2️⃣ *Mudanca completa*\n3️⃣ *Guincho*\n4️⃣ *Duvidas frequentes*`,
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
    await enviarTutorialLocalizacao(
      phone,
      `Anotado! ✅\n\nAgora me manda a *localização de retirada* 📍\n\nToca no *icone de anexo* (canto inferior direito) > Localização\nOu digite o *CEP* ou *endereço completo com rua e bairro*`,
    );
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
    await enviarTutorialLocalizacao(
      phone,
      `Anotado! ✅ *${message.trim()}*\n\nAgora me manda a *localização de retirada* 📍`,
    );
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
    const valorFretista = corridaCompleta?.valor_prestador || (Math.round(Number(valorCliente) * 0.88 * 100) / 100);
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

  // Parseia numeros da mensagem (aceita "2", "2 3", "2,3", "2, 3", "5 6")
  // 1-4 = frete, 5-6 = guincho. Cliente pode misturar (ex: "2 3 5").
  const numeros = message.match(/[1-6]/g);
  if (!numeros || numeros.length === 0) {
    await sendToClient({ to: phone, message: MSG.avaliarOpcaoInvalida });
    return;
  }

  const mapaVeiculos: Record<string, string> = {
    "1": "carro_comum",
    "2": "utilitario",
    "3": "hr",
    "4": "caminhao_bau",
    "5": "guincho",
    "6": "moto_guincho",
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

  // Guard: campos NOT NULL precisam estar preenchidos. Antes o insert silenciava
  // erros (bug que deixou a tabela vazia apesar de horas de uso). Agora valida +
  // loga falha + notifica admin se ocorrer.
  const dadosFeedback = {
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
  };

  const { error: errFeedback } = await supabase.from("feedback_precos").insert(dadosFeedback);

  if (errFeedback) {
    // BUG ANTIGO: este insert silenciava erros. Agora rastreia + alerta.
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "feedback_precos_insert_falhou",
        erro: errFeedback.message,
        codigo: errFeedback.code,
        dados: dadosFeedback,
      },
    });
    await notificarAdmin(
      `🚨 *FALHA AO SALVAR FEEDBACK_PRECOS*`,
      phone,
      `Erro: ${errFeedback.message}\nCodigo: ${errFeedback.code}\n\nDados: ${JSON.stringify(dadosFeedback).slice(0, 400)}\n\nFabio: avaliacoes nao estao sendo salvas!`,
    );
  } else {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "feedback_precos_salvo_ok",
        fretista_phone: phone,
        veiculo: sim.veiculo,
        gap: Math.round(gap * 100) / 100,
      },
    });
  }

  const novoTotal = estado.total + 1;
  await sendToClient({ to: phone, message: MSG.avaliarRespostaSalva(sim.precoPegue, preco) });

  // ADMIN ONLY + FRETE: se for admin e o gap for significativo (>= 5% ou <= -5%),
  // pergunta se quer JA aplicar como regra de ajuste.
  // Pula pra guincho — criterios de ajuste (qtd_itens, tem_ajudante, km range)
  // sao especificos do frete. Guincho usa preco base + km, ajuste teria
  // semantica diferente. Admin revisa em /admin/feedback-precos.
  const ehGuinchoAval = sim.veiculo === "guincho" || sim.veiculo === "moto_guincho";
  const adminSignificativo = !ehGuinchoAval && isAdminPhone(phone) && Math.abs(gap) >= 5;
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
    // Cria regra em ajustes_precos com safeInsert (admin precisa saber se falhar)
    const { criterios, fatorMultiplicador, gapPct } = pendingAjuste;
    const { safeInsert: safeInsertAjuste } = await import("@/lib/db-helpers");
    await safeInsertAjuste({
      tabela: "ajustes_precos",
      contexto: "admin_aplicar_ajuste_preco",
      notificarAdminEmFalha: true,
      dados: {
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
      },
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

// Versao com claim — primeiro admin que mandar OK XXXX assume.
// Use em alertas que CHAMAM acao (atender cliente, resolver dispatch falhou),
// nao em alertas informativos. Demais admins sao notificados que ja foi assumido.
async function notificarAdminComClaim(titulo: string, clientePhone: string, detalhes: string) {
  const detalhesFormatados = `👤 Cliente: ${formatarTelefoneExibicao(clientePhone)}\n📱 wa.me/${clientePhone}\n${detalhes}\n\n⏰ ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  await notificarAdminsComClaim(titulo, clientePhone, detalhesFormatados);
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
      // Filtragem por TIPO de veiculo compativel com a corrida.
      // Bug auditoria 29/Abr: dispatch enviava pra todos veiculos
      // (utilitario/hr/caminhao/carro), mesmo se corrida pedisse HR.
      // Fretista com carro_comum aceitava HR -> nao cabia carga -> frustracao.
      //
      // Hierarquia: fretista com veiculo MAIOR pode aceitar corridas menores.
      // - corrida carro_comum: aceita carro_comum, utilitario, hr, caminhao
      // - corrida utilitario: aceita utilitario, hr, caminhao
      // - corrida hr: aceita hr, caminhao
      // - corrida caminhao_bau: aceita SO caminhao
      const tipoCorrida = session.veiculo_sugerido || "utilitario";
      const VEICULOS_COMPATIVEIS: Record<string, string[]> = {
        carro_comum: ["carro_comum", "utilitario", "hr", "caminhao_bau"],
        utilitario: ["utilitario", "hr", "caminhao_bau"],
        hr: ["hr", "caminhao_bau"],
        caminhao_bau: ["caminhao_bau"],
      };
      const veiculosOK = VEICULOS_COMPATIVEIS[tipoCorrida] || ["utilitario", "hr", "caminhao_bau"];

      const { data } = await supabase
        .from("prestadores")
        .select("telefone, nome, id")
        .eq("disponivel", true)
        .eq("status", "aprovado");

      if (data) {
        for (const p of data) {
          const { data: veiculos } = await supabase
            .from("prestadores_veiculos")
            .select("tipo")
            .eq("prestador_id", p.id)
            .eq("ativo", true);

          const compativel = veiculos?.some(v => veiculosOK.includes(v.tipo));
          if (compativel) prestadores.push(p);
        }
      }

      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "dispatch_filtro_veiculo",
          corrida_id: corridaId,
          tipo_corrida: tipoCorrida,
          veiculos_compativeis: veiculosOK,
          fretistas_compativeis: prestadores.length,
        },
      });
    }

    if (prestadores.length === 0) {
      // Diagnostica motivo: tipo cotado nao tem fretista cadastrado, ou todos
      // ocupados/inativos. Admin precisa saber pra agir (cadastrar, requote, etc).
      let detalheFrota = "";
      if (!isGuincho) {
        const tipoCorrida = session.veiculo_sugerido || "utilitario";
        const { data: todosFretistas } = await supabase
          .from("prestadores_veiculos")
          .select("tipo, prestadores!inner(disponivel,status)")
          .eq("ativo", true);
        const tiposCadastrados = new Set<string>();
        const tiposDisponiveis = new Set<string>();
        for (const v of todosFretistas || []) {
          const p = (v as any).prestadores;
          tiposCadastrados.add((v as any).tipo);
          if (p?.disponivel && p?.status === "aprovado") tiposDisponiveis.add((v as any).tipo);
        }
        detalheFrota = `\n\n*Diagnostico:*\n  Cotado: ${tipoCorrida}\n  Tipos cadastrados: ${[...tiposCadastrados].join(", ") || "NENHUM"}\n  Tipos disponiveis agora: ${[...tiposDisponiveis].join(", ") || "NENHUM"}`;
      }
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "dispatch_zero_fretistas_compativeis",
          corrida_id: corridaId,
          tipo_corrida: session.veiculo_sugerido || (isGuincho ? "guincho" : "utilitario"),
          eh_guincho: isGuincho,
        },
      });
      await sendToClient({ to: clientePhone, message: MSG.nenhumFretista });
      await notificarAdminComClaim(
        isGuincho ? `⚠️ *NENHUM GUINCHEIRO DISPONIVEL*` : `⚠️ *NENHUM FRETISTA DISPONIVEL*`,
        clientePhone,
        `Corrida: ${corridaId}\nTipo: ${isGuincho ? "GUINCHO" : "FRETE"}\n📅 Data/Horario: ${session.data_agendada || "A combinar"}\nOrigem: ${session.origem_endereco}\nDestino: ${session.destino_endereco}\nValor: R$ ${session.valor_estimado}${detalheFrota}`
      );
      return;
    }

    // PROTECAO TESTE: se cliente eh phone de teste (Fabio, etc), filtra a
    // lista de fretistas pra incluir APENAS fretistas tambem marcados como
    // teste (ex: Jackeline). Fretistas reais (Mauricio, etc) nunca recebem
    // dispatch de cliente teste.
    //
    // Comportamentos:
    // a) Tem fretista teste disponivel -> dispara real APENAS pra ele
    //    -> permite teste E2E completo (cliente cota, fretista pega, etc)
    // b) Nenhum fretista teste disponivel -> simula (notifica admin),
    //    nao dispara pra ninguem -> evita confundir fretistas reais.
    if (isPhoneTeste(clientePhone)) {
      const prestadoresTeste = prestadores.filter((p) => isPhoneTeste(p.telefone));

      if (prestadoresTeste.length === 0) {
        const nomesFretistas = prestadores.map((p) => `${p.nome} (${p.telefone})`).join("\n");
        await notificarAdmins(
          `🧪 *[TESTE] DISPATCH SIMULADO* (cliente teste, sem fretista teste disponivel)`,
          clientePhone,
          `Corrida: ${corridaId}\nTipo: ${isGuincho ? "GUINCHO" : "FRETE"}\n📅 ${session.data_agendada || "A combinar"}\n📍 ${session.origem_endereco}\n🏠 ${session.destino_endereco}\n💰 R$ ${session.valor_estimado}\n\n*Fretistas REAIS que SERIAM chamados (${prestadores.length}):*\n${nomesFretistas}\n\n_Nenhum foi notificado pra evitar perturbacao._`
        );
        await sendToClient({
          to: clientePhone,
          message: `🧪 *MODO TESTE*\n\nNenhum fretista de teste disponivel — dispatch SIMULADO. Cadastra a Jackeline (ou outro testador) como ADMIN_PHONES pra rodar teste E2E real.`,
        });
        return;
      }

      // Filtra pra disparar SOMENTE pra fretistas teste
      prestadores = prestadoresTeste;
      const nomesTeste = prestadoresTeste.map((p) => `${p.nome} (${p.telefone})`).join(", ");
      await notificarAdmins(
        `🧪 *[TESTE] DISPATCH REAL P/ TESTERS*`,
        clientePhone,
        `Corrida: ${corridaId}\n💰 R$ ${session.valor_estimado}\n\n*Disparando real pra ${prestadoresTeste.length} fretista(s) teste:* ${nomesTeste}\n\n_Fretistas reais NAO foram notificados._`
      );
      // Continua o fluxo normal abaixo (com lista filtrada)
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

    let placaDuplicada = false;
    if (prestador) {
      // Bug 9 (auditoria 29/Abr): detectada placa FQQ3G59 cadastrada em 2 prestadores
      // diferentes (Jackeline + Fabio). Bloqueia auto-aprovacao se houver conflito
      // pra evitar fraude/duplicidade. Alerta admin pra validar manualmente.
      const placaUpper = placa.toUpperCase().replace(/\s|-/g, "");
      const { data: placaExistente } = await supabase
        .from("prestadores_veiculos")
        .select("prestador_id, prestadores!inner(nome, telefone)")
        .eq("placa", placaUpper)
        .eq("ativo", true)
        .neq("prestador_id", prestador.id)
        .maybeSingle();

      if (placaExistente) {
        placaDuplicada = true;
        const conflito: any = placaExistente.prestadores;
        await notificarAdmin(
          `🚨 *PLACA DUPLICADA NO CADASTRO*`,
          phone,
          `Novo prestador *${nome}* (${phone}) cadastrou veiculo com placa *${placaUpper}*.

Essa placa JA EXISTE no veiculo do prestador:
${conflito?.nome || "?"} (${conflito?.telefone || "?"})

Possiveis causas:
• Mesmo dono cadastrado 2x
• Erro de digitacao
• Tentativa de fraude

🎯 *Acao:* validar manualmente antes de aprovar. Auto-aprovacao desativada pra esse cadastro.`,
        );
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "placa_duplicada_detectada",
            phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
            placa: placaUpper,
            prestador_existente_id: placaExistente.prestador_id,
          },
        });
      }

      // safeInsert: se falhar, fretista nao tem veiculo cadastrado e nunca
      // recebe dispatch. Critico ter visibilidade da falha.
      const { safeInsert: safeInsertVeiculo } = await import("@/lib/db-helpers");
      await safeInsertVeiculo({
        tabela: "prestadores_veiculos",
        contexto: "cadastro_fretista_veiculo",
        notificarAdminEmFalha: true,
        dados: {
          prestador_id: prestador.id,
          tipo: tipoVeiculo,
          placa: placaUpper,
          foto_url: selfieUrl,
          ativo: !placaDuplicada, // se duplicada, fica inativa ate admin validar
        },
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

    // Auto-aprovacao bloqueada se placa duplicada (Bug 9 - auditoria 29/Abr).
    // Fica em revisao manual pra admin validar antes de liberar dispatch.
    const autoAprovar = cfgAutoAprov?.valor === "habilitado" && !placaDuplicada;
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
  const sugestao = lower !== "pular" ? message.trim() : null;

  // Log em bot_logs (rastreabilidade granular)
  if (sugestao) {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "avaliacao",
        categoria: "sugestao",
        texto: sugestao,
        phone,
        corrida_id: session?.corrida_id,
      },
    });
  }

  // CONSOLIDA em avaliacoes (tabela definitiva): busca 3 notas + sugestao,
  // calcula media, insere 1 linha. Esta logica garante que avaliacoes
  // realmente tem dados (regra de armazenamento inegociavel).
  if (session?.corrida_id) {
    const { data: logs } = await supabase
      .from("bot_logs")
      .select("payload, criado_em")
      .filter("payload->>tipo", "eq", "avaliacao")
      .filter("payload->>corrida_id", "eq", session.corrida_id)
      .order("criado_em", { ascending: true });

    const notas: Record<string, number> = {};
    let textoSugestao = "(sem sugestao)";
    logs?.forEach((l) => {
      const p = l.payload as any;
      if (p.categoria === "sugestao" && p.texto) textoSugestao = p.texto;
      else if (p.nota && p.categoria) notas[p.categoria] = Number(p.nota);
    });

    // Media das 3 categorias (atendimento, praticidade, fretista)
    const valores = Object.values(notas);
    const media = valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : null;

    // Busca cliente_id (FK obrigatorio em avaliacoes)
    const { data: cliente } = await supabase
      .from("clientes")
      .select("id")
      .eq("telefone", phone)
      .single();

    if (cliente?.id && media !== null) {
      const comentario = `Atendimento: ${notas.atendimento || "-"} / Praticidade: ${notas.praticidade || "-"} / Fretista: ${notas.fretista || "-"} / Sugestao: ${textoSugestao}`;

      const { error: errAvaliacao } = await supabase.from("avaliacoes").insert({
        corrida_id: session.corrida_id,
        cliente_id: cliente.id,
        nota: Math.round(media),
        comentario,
      });

      // Loga sucesso/falha pra auditoria
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: errAvaliacao ? "avaliacao_consolidada_falha" : "avaliacao_consolidada_ok",
          corrida_id: session.corrida_id,
          erro: errAvaliacao?.message,
          nota_media: media,
          notas_individuais: notas,
        },
      });
    } else {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "avaliacao_consolidada_skip",
          motivo: !cliente?.id ? "cliente_nao_encontrado" : "sem_notas_validas",
          corrida_id: session.corrida_id,
          phone,
        },
      });
    }
  }

  await updateSession(phone, { step: "concluido" });
  await sendToClient({ to: phone, message: MSG.clienteAvaliacaoConcluida });
}

// === CONFIRMAÇÃO DE ENTREGA PELO CLIENTE ===

// Libera fretista pra seguir do origem ao destino: muda step pra
// fretista_entrega_fotos, ativa rastreio em tempo real, manda links pro
// fretista (GPS sender) e pro cliente (mapa). Reusada em 2 lugares:
// (1) cliente confirma coleta com "1"; (2) timeout 10min auto-libera.
export async function liberarFretistaParaEntrega(fretistaPhone: string, corridaId: string) {
  await updateSession(fretistaPhone, { step: "fretista_entrega_fotos" });
  await sendToClient({ to: fretistaPhone, message: MSG.fretistaColetaConfirmada });

  // Ativa rastreio + manda links
  await supabase
    .from("corridas")
    .update({ rastreio_ativo: true })
    .eq("id", corridaId);

  const { data: corridaRastreio } = await supabase
    .from("corridas")
    .select("rastreio_token, codigo, cliente_id, prestador_id, clientes(telefone), prestadores(nome)")
    .eq("id", corridaId)
    .single();

  if (corridaRastreio?.rastreio_token) {
    const baseUrl = "https://chamepegue.com.br";
    const nomePrestador = (corridaRastreio.prestadores as any)?.nome || "Fretista";

    const linkFretista = `${baseUrl}/rastrear/motorista/${corridaRastreio.rastreio_token}`;
    await sendToClient({
      to: fretistaPhone,
      message: MSG.rastreioLinkFretista(linkFretista),
    });

    const clienteTel = (corridaRastreio.clientes as any)?.telefone;
    if (clienteTel) {
      const linkCliente = `${baseUrl}/rastrear/${corridaRastreio.codigo}?t=${corridaRastreio.rastreio_token}`;
      await sendToClient({
        to: clienteTel,
        message: MSG.rastreioLinkCliente(linkCliente, nomePrestador),
      });
    }
  }
}

// Cliente confirma coleta apos fretista PRONTO. 1 = libera fretista pra
// entrega. 2 = escala humano (cliente reportou problema). Outras respostas
// re-pedem opcao.
async function handleConfirmacaoColeta(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session?.corrida_id) return;

  const lower = message.trim().toLowerCase();

  if (lower === "1" || lower.startsWith("sim") || lower === "ok") {
    const { data: corrida } = await supabase
      .from("corridas")
      .select("prestadores!prestador_id(telefone)")
      .eq("id", session.corrida_id)
      .single();
    const fretistaTel = (corrida?.prestadores as any)?.telefone;
    if (fretistaTel) {
      await liberarFretistaParaEntrega(fretistaTel, session.corrida_id);
    }
    await sendToClient({
      to: phone,
      message: "✅ Liberado! O fretista esta a caminho do destino. Voce pode acompanhar pelo link de rastreio.",
    });
    return;
  }

  if (lower === "2" || lower.includes("problem") || lower.includes("erro")) {
    await supabase
      .from("corridas")
      .update({ status: "problema" })
      .eq("id", session.corrida_id);
    await updateSession(phone, { step: "atendimento_humano" });
    await notificarAdmin(
      "🚨 *PROBLEMA NA COLETA*",
      phone,
      `Cliente reportou problema na coleta. Corrida: ${session.corrida_id}\n\n👉 Validar com cliente e fretista. Pagamento ja foi feito.`,
    );
    await sendToClient({
      to: phone,
      message: "⚠️ Anotado. Um atendente vai te ajudar a resolver. Aguarda alguns minutos.",
    });
    return;
  }

  await sendToClient({
    to: phone,
    message: "Responde *1* (libera fretista) ou *2* (tem problema). Se nao responder em 10min, libero automatico.",
  });
}

// Fretista digita PIN de 4 digitos pra confirmar entrega.
// PIN foi gerado no webhook Asaas e enviado AO CLIENTE privadamente.
// Valida: bate com pin_entrega da corrida -> simula confirmacao do cliente
// (chama handleConfirmacaoEntrega) que dispara repasse + avaliacao.
// 3 tentativas erradas -> escala humano (admin valida manual).
async function handleFretistaPinEntrega(phone: string, message: string) {
  const session = await getSession(phone);
  if (!session || !session.corrida_id) return;

  const { validarPinEntrega, montarMensagemPinIncorreto, PIN_TENTATIVAS_MAX } =
    await import("@/lib/pin-entrega");

  // Busca corrida + PIN esperado + cliente
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, pin_entrega, status, clientes!inner(telefone, nome), prestadores!prestador_id(nome)")
    .eq("id", session.corrida_id)
    .single();

  if (!corrida) {
    await sendToClient({
      to: phone,
      message: "🤔 Nao achei a corrida. Aguarda — vou chamar um atendente.",
    });
    await notificarAdmin(
      "🚨 *PIN ENTREGA - CORRIDA NAO ACHADA*",
      phone,
      `Corrida_id na sessao: ${session.corrida_id}\nFretista: ${phone}\nPIN digitado: ${message.slice(0, 10)}`,
    );
    return;
  }

  // Idempotencia: corrida ja concluida (PIN ja foi aceito antes)
  if (corrida.status === "concluida") {
    await sendToClient({
      to: phone,
      message: "✅ Essa corrida ja foi concluida. Pagamento liberado.",
    });
    await updateSession(phone, { step: "concluido" });
    return;
  }

  const ok = validarPinEntrega(message, corrida.pin_entrega);

  if (ok) {
    // PIN correto -> simula confirmacao do cliente (libera repasse + avaliacao)
    const clienteTel = (corrida.clientes as any).telefone;

    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "pin_entrega_validado",
        corrida_id: session.corrida_id,
        fretista_phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
      },
    });

    // Garante session cliente com step certo + corrida_id antes de chamar handleConfirmacaoEntrega
    await updateSession(clienteTel, {
      step: "aguardando_confirmacao_entrega",
      corrida_id: session.corrida_id,
    });

    // Avisa fretista que PIN foi aceito antes de processar repasse
    await sendToClient({
      to: phone,
      message: `✅ *PIN confirmado!* Liberando seu repasse...`,
    });

    // Reusa toda a logica de confirmacao (repasse Asaas + avaliacao + etc)
    await handleConfirmacaoEntrega(clienteTel, "1");
    return;
  }

  // PIN errado: incrementa contador (msgs_contador) e re-pede ate max
  const tentativas = (session.msgs_contador || 0) + 1;
  await updateSession(phone, { msgs_contador: tentativas });

  if (tentativas >= PIN_TENTATIVAS_MAX) {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "pin_entrega_max_tentativas",
        corrida_id: session.corrida_id,
        fretista_phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
        tentativas,
      },
    });
    await notificarAdmin(
      "🚨 *PIN ENTREGA - 3 TENTATIVAS ERRADAS*",
      phone,
      `Fretista: ${(corrida.prestadores as any)?.nome || phone}\nCliente: ${(corrida.clientes as any).nome || "?"} (${(corrida.clientes as any).telefone})\nCorrida: ${session.corrida_id}\n\n👉 Validar manualmente. Possiveis causas:\n- Cliente nao esta no destino\n- Cliente nao recebeu o PIN (verificar bot_logs)\n- Tentativa de fraude do fretista`,
    );
    await sendToClient({
      to: phone,
      message: montarMensagemPinIncorreto(0),
    });
    await updateSession(phone, { step: "atendimento_humano" });
    return;
  }

  await sendToClient({
    to: phone,
    message: montarMensagemPinIncorreto(PIN_TENTATIVAS_MAX - tentativas),
  });
}

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

      // === REPASSE PIX PRO FRETISTA (modo manual) ===
      // MP nao tem API de envio PIX (confirmado oficialmente em 27/Abr/2026).
      // Codigo de tentativa MP /v1/transfers removido pra economizar latencia
      // e nao poluir logs com erro 404 garantido.
      //
      // Fluxo atual:
      // 1) Idempotencia: nao paga 2x mesma corrida
      // 2) Cria registro pagamentos com repasse_status=pendente
      // 3) Avisa fretista que pagamento foi liberado
      // 4) Notifica admin com chave PIX + valor pra fazer transferencia manual
      //
      // Proximo: integrar Asaas (provedor que tem API PIX out pra PF) — issue
      // separada na lista do projeto.
      const { data: pagtoExistente } = await supabase
        .from("pagamentos")
        .select("id, repasse_status")
        .eq("corrida_id", session.corrida_id)
        .eq("repasse_status", "pago")
        .maybeSingle();

      if (pagtoExistente) {
        await supabase.from("bot_logs").insert({
          payload: { tipo: "repasse_ja_feito", corrida_id: session.corrida_id },
        });
      } else {
        // === REPASSE AUTOMATICO via Asaas (PIX out) ===
        // Tenta transferir via API Asaas. Se falhar (chave invalida, saldo,
        // etc), cai no fluxo manual: cria registro pendente + notifica admin.
        const { data: prestadorPix } = await supabase
          .from("prestadores")
          .select("chave_pix")
          .eq("telefone", fretistaTel)
          .single();

        if (!prestadorPix?.chave_pix) {
          // Sem chave PIX: cria pendente + alerta admin (caminho manual obrigatorio)
          {
            const { safeInsert: si } = await import("@/lib/db-helpers");
            await si({
              tabela: "pagamentos",
              contexto: "repasse_pix_sem_chave",
              notificarAdminEmFalha: true,
              dados: {
                corrida_id: session.corrida_id,
                valor: valorPrestador,
                metodo: "pix_sem_chave",
                status: "aprovado",
                repasse_status: "pendente",
              },
            });
          }
          await sendToClient({
            to: fretistaTel,
            message: `✅ *Pagamento LIBERADO!* 🎉\n\nO cliente confirmou a entrega.\n💰 *Valor: R$ ${valorPrestador}*\n\n⚠️ Voce ainda nao cadastrou sua chave PIX no nosso sistema. Entre em contato com a Pegue pra cadastrar e receber o pagamento.\n\nObrigado pelo excelente servico! 🚚✨`,
          });
          await notificarAdmin(
            `🚨 *FRETISTA SEM CHAVE PIX - FAZER MANUAL*`,
            phone,
            `Fretista: ${nomePrestador} (${formatarTelefoneExibicao(fretistaTel)})\n💰 Valor: R$ ${valorPrestador}\nCorrida: ${session.corrida_id}\n\n👉 Pedir chave PIX e fazer transferencia manual.`,
          );
        } else {
          // Tenta repasse Asaas
          const { transferirPix } = await import("@/lib/asaas");
          const r = await transferirPix({
            valor: valorPrestador,
            chavePix: prestadorPix.chave_pix,
            descricao: `Pegue - repasse fretista corrida ${session.corrida_id.slice(0, 8)}`,
            externalReference: session.corrida_id,
          });

          if (r.ok && r.transfer) {
            // Sucesso: registra como pago + avisa fretista do PIX enviado
            {
              const { safeInsert: si } = await import("@/lib/db-helpers");
              await si({
                tabela: "pagamentos",
                contexto: "asaas_pix_repasse_ok",
                notificarAdminEmFalha: true,
                dados: {
                  corrida_id: session.corrida_id,
                  valor: valorPrestador,
                  metodo: "asaas_pix",
                  status: "aprovado",
                  repasse_status: r.transfer.status === "DONE" ? "pago" : "pendente",
                  pago_em: r.transfer.status === "DONE" ? new Date().toISOString() : null,
                },
              });
            }
            await supabase.from("bot_logs").insert({
              payload: {
                tipo: "asaas_repasse_iniciado",
                corrida_id: session.corrida_id,
                transfer_id: r.transfer.id,
                status: r.transfer.status,
                valor: valorPrestador,
              },
            });
            await sendToClient({
              to: fretistaTel,
              message: `💰 *PAGAMENTO ENVIADO via PIX!* 🎉\n\nO cliente confirmou a entrega e ja transferimos pra sua chave PIX cadastrada.\n\n💵 *Valor: R$ ${valorPrestador}*\n📱 Pix: ${prestadorPix.chave_pix}\n\nA confirmacao final chega em alguns segundos. Obrigado pelo excelente servico! 🚚✨`,
            });
          } else {
            // Falha API: cai no manual (igual antes do Asaas)
            {
              const { safeInsert: si } = await import("@/lib/db-helpers");
              await si({
                tabela: "pagamentos",
                contexto: "asaas_pix_falhou_fallback_manual",
                notificarAdminEmFalha: true,
                dados: {
                  corrida_id: session.corrida_id,
                  valor: valorPrestador,
                  metodo: "pix_pendente_manual",
                  status: "aprovado",
                  repasse_status: "pendente",
                },
              });
            }
            await supabase.from("bot_logs").insert({
              payload: {
                tipo: "asaas_repasse_falhou",
                corrida_id: session.corrida_id,
                erro: r.erro,
              },
            });
            await sendToClient({
              to: fretistaTel,
              message: `✅ *Pagamento LIBERADO!* 🎉\n\nO cliente confirmou a entrega.\n💰 *Valor: R$ ${valorPrestador}*\n\nSeu pagamento sera processado em breve via Pix.\n\nObrigado pelo excelente servico! 🚚✨`,
            });
            await notificarAdmin(
              `🚨 *ASAAS REPASSE FALHOU - FAZER PIX MANUAL*`,
              phone,
              `Fretista: ${nomePrestador} (${formatarTelefoneExibicao(fretistaTel)})\n💰 *Valor: R$ ${valorPrestador}*\nChave PIX: ${prestadorPix.chave_pix}\nCorrida: ${session.corrida_id}\n\nMotivo Asaas: ${JSON.stringify(r.erro).slice(0, 300)}\n\n👉 Fazer transferencia manual.`,
            );
          }
        }
      }

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
      // NOVO 29/Abr (auditoria E2E): apos PRONTO coleta, AGUARDA cliente
      // confirmar antes de liberar fretista. Anti-fraude. Timeout 10min
      // auto-libera caso cliente nao responder (nao trava fluxo).
      await updateSession(phone, { step: "fretista_aguardando_cliente_ok_coleta" });
      await sendToClient({
        to: phone,
        message: "📸 Fotos da coleta registradas! ✅\n\nAguardando o cliente confirmar antes de liberar o trajeto. Se em 10min ele nao responder, libero automatico.",
      });

      const sessionData = await getSession(phone);
      if (sessionData?.corrida_id) {
        const { data: corridaConfirma } = await supabase
          .from("corridas")
          .select("clientes(telefone, nome)")
          .eq("id", sessionData.corrida_id)
          .single();
        const clienteTel = (corridaConfirma?.clientes as any)?.telefone;
        if (clienteTel) {
          await updateSession(clienteTel, {
            step: "aguardando_confirmacao_coleta",
            corrida_id: sessionData.corrida_id,
          });
          await sendToClient({
            to: clienteTel,
            message: "📦 *O fretista terminou a coleta dos seus itens!*\n\nQuer conferir as fotos antes de liberar o trajeto?\n\n1️⃣ ✅ *SIM, libere o fretista* (esta tudo certo)\n2️⃣ ⚠️ *Tem algum problema* (chama atendente)\n\nSe nao responder em 10min, libero automatico.",
          });
        }
        await agendarTarefa(
          "auto_libera_apos_coleta",
          sessionData.corrida_id,
          10 * 60 * 1000,
        );
      }
    } else {
      // Fretista terminou de fotografar entrega. Pede PIN antes de concluir.
      // PIN foi gerado quando pagamento confirmou e enviado AO CLIENTE PRIVADAMENTE.
      // Fretista pede pessoalmente, cliente fala oralmente, fretista digita aqui.
      // PIN correto = confirmacao implicita da entrega + libera repasse.
      // PIN errado 3x = escala humano (admin valida).
      await updateSession(phone, { step: "fretista_aguardando_pin" });

      const session = await getSession(phone);
      const { montarMensagemPinFretista } = await import("@/lib/pin-entrega");

      if (session?.corrida_id) {
        const { data: corrida } = await supabase
          .from("corridas")
          .select("cliente_id, descricao_carga, clientes(telefone)")
          .eq("id", session.corrida_id)
          .single();

        if (corrida?.clientes) {
          const clienteTel = (corrida.clientes as any).telefone;
          await sendToClient({
            to: clienteTel,
            message: `📦 *${(corrida.clientes as any).nome || "Voce"}, o fretista chegou no destino!*\n\nQuando receber tudo certinho, *forneca o PIN de 4 digitos* que mandei mais cedo.\n\nSem PIN, o fretista nao pode encerrar — sua garantia. ✅`,
          });
          await agendarTarefa(
            "pin_entrega_timeout",
            session.corrida_id,
            30 * 60 * 1000,
          );
        }
      }

      await sendToClient({ to: phone, message: montarMensagemPinFretista() });
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
      // Asaas: cria cliente + cobranca UNDEFINED (PIX + cartao na mesma tela).
      // 1 link unico que abre checkout com as 2 opcoes - mais simples que MP.
      // Substitui Mercado Pago (que nao tinha API de PIX out pro repasse final).
      try {
        const { criarOuObterCliente, criarCobranca } = await import("@/lib/asaas");

        const { data: corridaPagto } = await supabase
          .from("corridas")
          .select("descricao_carga, valor_final, valor_estimado")
          .eq("id", corridaId)
          .single();
        const { data: clientePagto } = await supabase
          .from("clientes")
          .select("nome, email, cpf")
          .eq("telefone", clientePhone)
          .single();

        const valorPagto = Number(corridaPagto?.valor_final || corridaPagto?.valor_estimado || 0);
        const descricaoPagto = corridaPagto?.descricao_carga || "Frete Pegue";
        const nomeCliente = clientePagto?.nome || "Cliente";
        const emailCliente = clientePagto?.email || undefined;

        // 1) Cria/obtem cliente Asaas (idempotente via telefone)
        // CPF: usa do cadastro se tiver, senao placeholder valido pra teste.
        // TODO producao: coletar CPF do cliente no fluxo do bot ANTES da cobranca.
        const cpfCliente = (clientePagto as any)?.cpf || "12345678909";
        const clienteResult = await criarOuObterCliente({
          nome: nomeCliente,
          telefone: clientePhone,
          email: emailCliente,
          cpf: cpfCliente,
        });

        if (!clienteResult.ok || !clienteResult.cliente) {
          throw new Error(`Falha criar cliente Asaas: ${JSON.stringify(clienteResult.erro)}`);
        }

        // 2) Cria cobranca UNDEFINED (cliente escolhe PIX ou cartao na tela)
        const cobrancaResult = await criarCobranca({
          clienteAsaasId: clienteResult.cliente.id,
          valor: valorPagto,
          descricao: `Pegue: ${descricaoPagto}`,
          corridaId,
        });

        if (!cobrancaResult.ok || !cobrancaResult.cobranca) {
          throw new Error(`Falha criar cobranca Asaas: ${JSON.stringify(cobrancaResult.erro)}`);
        }

        // 3) Salva paymentId Asaas no campo dedicado asaas_payment_id
        // (migration 29/Abr liberou pin_entrega pra ser PIN real de 4 digitos)
        await supabase
          .from("corridas")
          .update({ asaas_payment_id: cobrancaResult.cobranca.id })
          .eq("id", corridaId);

        // 4) Envia 1 mensagem com link unico (PIX + cartao na mesma tela)
        await sendToClient({
          to: clientePhone,
          message: MSG.freteConfirmadoAsaas(
            cobrancaResult.cobranca.invoiceUrl || "",
            valorPagto,
            dataFrete,
            primeiroNomeFretista,
          ),
        });
        await updateSession(clientePhone, { step: "aguardando_pagamento" });

        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "asaas_cobranca_criada",
            corrida_id: corridaId,
            asaas_cliente_id: clienteResult.cliente.id,
            asaas_payment_id: cobrancaResult.cobranca.id,
            valor: valorPagto,
            invoice_url: cobrancaResult.cobranca.invoiceUrl,
          },
        });
      } catch (errAsaas: any) {
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "erro_gerar_cobranca_asaas",
            corrida_id: corridaId,
            erro: errAsaas?.message || "sem mensagem",
          },
        });
        await notificarAdmin(
          `🚨 *ERRO AO GERAR COBRANCA ASAAS*`,
          clientePhone,
          `Corrida: ${corridaId}\nErro: ${errAsaas?.message}\n\nFretista ja aceitou. Cliente NAO recebeu link de pagamento. Acao manual necessaria.`
        );
        await sendToClient({
          to: clientePhone,
          message: `Houve um problema gerando seu link de pagamento. Nossa equipe vai te enviar manualmente em alguns minutos. 🙏`,
        });
        await updateSession(clientePhone, { step: "aguardando_pagamento" });
      }
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
        // Precisao em centavos (Math.round inteiro zerava comissao em valores
        // baixos: R$1 -> round(0.12)=0, fretista ficava com R$1 e Pegue zero).
        valor_prestador: Math.round(valorBruto * 0.88 * 100) / 100,
        valor_pegue: Math.round(valorBruto * 0.12 * 100) / 100,
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

// GUARD anti-abuso IA Vision em DUAS camadas:
//
// CAMADA 1 — Limite de TENTATIVAS de cotacao por foto (max 2 em 24h)
//   Conta NOVAS tentativas (sessoes onde cliente comecou do zero a mandar fotos).
//   3a tentativa = escala humano SEM analisar a foto.
//   Por que: cliente confuso/com dificuldade na 3a vez precisa de gente, nao bot.
//   Cobre cenarios tipo 5+5+5 fotos OU 10+10+10.
//
// CAMADA 2 — Limite de fotos/hora por phone (max 30, anti-spam dentro de uma tentativa)
//   Protege contra ataque de spam concentrado (100 fotos em 5min).
//   Cliente legitimo numa cotacao normal: <15 fotos.
//
// Em ambos casos: escala humano (NAO bloqueia o telefone, NAO recusa atendimento).
// Retorna { permitido: true } -> call site segue.
// Helper pra montar alerta admin RICO E COMPLETO (Fabio reforcou 28/Abr:
// notificacoes precisam ter info real, telefone clicavel, contexto do
// problema, instrucao de acao). Usar SEMPRE que escalar pra atendimento humano.
async function montarAlertaAdminRico(opts: {
  motivo: string; // ex: "Cliente travou no envio de foto"
  phone: string;
  problemaDetalhado: string;
  acaoSugerida: string;
}): Promise<string> {
  const phoneClick = opts.phone.replace(/\D/g, "");

  const { data: cliente } = await supabase
    .from("clientes")
    .select("nome, total_corridas, nivel")
    .eq("telefone", opts.phone)
    .maybeSingle();

  const sessao = await getSession(opts.phone);

  return [
    `🚨🚨🚨 *URGENTE — CLIENTE PRECISA DE VOCE* 🚨🚨🚨`,
    ``,
    `👤 *Cliente:* ${cliente?.nome || "(sem cadastro)"}`,
    `📞 *Telefone:* +${phoneClick}`,
    `🔗 *Abrir conversa:* https://wa.me/${phoneClick}`,
    `📊 *Histórico:* ${cliente?.total_corridas || 0} corridas | ${cliente?.nivel || "novo"}`,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `❌ *PROBLEMA:* ${opts.motivo}`,
    ``,
    opts.problemaDetalhado,
    ``,
    `📦 *Carga já informada:* ${sessao?.descricao_carga || "(nao informou)"}`,
    `📍 *Origem:* ${sessao?.origem_endereco || "(nao informou)"}`,
    `🏠 *Destino:* ${sessao?.destino_endereco || "(nao informou)"}`,
    ``,
    `━━━━━━━━━━━━━━━━`,
    `🎯 *AÇÃO:* ${opts.acaoSugerida}`,
    ``,
    `🔇 Bot já está calado.`,
    `🤖 Pra reativar bot depois: /admin/operacao-real → Devolver pro bot`,
  ].join("\n");
}

// Retorna { permitido: false, resposta } -> call site faz `return guard.resposta`.
async function protegerVisionLimit(
  phoneNumber: string
): Promise<{ permitido: true } | { permitido: false; resposta: NextResponse }> {
  // CAMADA 1: detecta se eh inicio de NOVA tentativa (descricao_carga vazia)
  const sessao = await getSession(phoneNumber);
  const ehNovaTentativa = !sessao?.descricao_carga || sessao.descricao_carga.trim().length === 0;

  if (ehNovaTentativa) {
    const tentativas = await checkRateLimit({
      chave: `cotacao_foto_attempt:${phoneNumber}`,
      max: 2,
      janelaMinutos: 60 * 24, // 24h
    });
    if (!tentativas.permitido) {
      // 3a+ tentativa em 24h: escala humano SEM analisar foto
      await updateSession(phoneNumber, { step: "atendimento_humano" });

      const alertaRico = await montarAlertaAdminRico({
        phone: phoneNumber,
        motivo: `Cliente fez ${tentativas.contador}ª tentativa de cotar com fotos em 24h (limite 2)`,
        problemaDetalhado: `Cliente está com dificuldade — bot não está atendendo bem.\nMudanças repetidas indicam carga grande/complexa OU UX confusa.`,
        acaoSugerida: `Chama o cliente pelo WhatsApp da Pegue agora pra cotar manualmente. Pergunta lista de itens por texto e usa /admin/simulador pra gerar valor.`,
      });

      await notificarAdmins(`🚨 CLIENTE TRAVADO COM FOTOS — ATUAR JÁ`, phoneNumber, alertaRico);
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "vision_tentativa_excedida",
          phone: phoneNumber,
          tentativa: tentativas.contador,
        },
      });
      await sendToClient({
        to: phoneNumber,
        message: `📸 *Deixa que um especialista te ajuda!*\n\nVi que voce ja tentou cotar algumas vezes — pra evitar mais erro, vou *passar pra um atendente humano* agora.\n\nEle vai te chamar em alguns minutos pra fazer a cotacao certinha. Aguarda 🙏`,
      });
      return {
        permitido: false,
        resposta: NextResponse.json({ status: "vision_tentativa_escalada", tentativa: tentativas.contador }),
      };
    }
  }

  // CAMADA 2: limite de fotos/hora (anti-spam dentro de uma tentativa)
  const limite = await checkRateLimit({
    chave: `vision:${phoneNumber}`,
    max: VISION_MAX_HORA,
    janelaMinutos: 60,
  });
  if (limite.permitido) return { permitido: true };

  await updateSession(phoneNumber, { step: "atendimento_humano" });
  const alertaRicoFotos = await montarAlertaAdminRico({
    phone: phoneNumber,
    motivo: `Cliente fez ${limite.contador} análises de foto IA na última hora (limite ${VISION_MAX_HORA})`,
    problemaDetalhado: `Possível mudança grande OU cliente com dificuldade na cotacao por foto.\nIA Vision foi pausada pra evitar custo desnecessario.`,
    acaoSugerida: `Chama o cliente pelo WhatsApp da Pegue agora. Cota manualmente perguntando itens por texto.`,
  });
  await notificarAdmins(`🚨 MUITAS FOTOS — ATUAR JÁ`, phoneNumber, alertaRicoFotos);
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "vision_limite_hora_excedido",
      phone: phoneNumber,
      contador: limite.contador,
      max: VISION_MAX_HORA,
    },
  });
  await sendToClient({
    to: phoneNumber,
    message: `📸 *Vamos te atender direto!*\n\nVi que voce esta enviando varias fotos — quero garantir que sua mudanca eh cotada *certinho*.\n\nUm *especialista* foi acionado e vai te chamar em alguns minutos. Aguarda 🙏`,
  });
  return {
    permitido: false,
    resposta: NextResponse.json({ status: "vision_limite_escalado", contador: limite.contador }),
  };
}

// Analisa foto de veiculo pra guincho (Cotacao Express)
async function analisarFotoGuincho(imageUrl: string): Promise<string | null> {
  try {
    // PASSO 1: Baixa imagem do ChatPro pro nosso servidor + valida tamanho/tipo.
    // (Mesmo motivo de analisarFotoIA: URLs ChatPro tem token/expiram, OpenAI
    // recebe 403/404 se passar direto.)
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      await supabase.from("bot_logs").insert({
        payload: { tipo: "vision_guincho_download_falhou", status: imageResponse.status },
      });
      return null;
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

    if (imageBuffer.byteLength > VISION_MAX_BYTES) {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "vision_guincho_foto_grande",
          bytes: imageBuffer.byteLength,
          max_bytes: VISION_MAX_BYTES,
        },
      });
      return null;
    }
    if (!contentType.startsWith("image/")) {
      await supabase.from("bot_logs").insert({
        payload: { tipo: "vision_guincho_tipo_invalido", content_type: contentType },
      });
      return null;
    }

    const imageBase64 = Buffer.from(imageBuffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${imageBase64}`;

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
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
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
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

    // GUARD anti-abuso: rejeita imagens > VISION_MAX_BYTES (5MB).
    // Cliente WhatsApp normal manda <2MB (foto comprimida). Acima de 5MB =
    // anomalia OU tentativa de gastar tokens da OpenAI. Rejeitar AQUI evita
    // o custo (token-per-image scale com tamanho).
    if (imageBuffer.byteLength > VISION_MAX_BYTES) {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "vision_foto_grande_demais",
          bytes: imageBuffer.byteLength,
          max_bytes: VISION_MAX_BYTES,
          content_type: contentType,
        },
      });
      return null;
    }

    // GUARD: rejeita conteudo nao-imagem (atacante mandando .pdf/.zip).
    if (!contentType.startsWith("image/")) {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "vision_content_type_invalido",
          content_type: contentType,
          bytes: imageBuffer.byteLength,
        },
      });
      return null;
    }

    const imageBase64 = Buffer.from(imageBuffer).toString("base64");
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

    // PROTECAO TESTE: re-dispatch tambem nao pode chamar fretistas reais em teste
    if (isPhoneTeste(clientePhone)) {
      await notificarAdmins(
        `🧪 *[TESTE] RE-DISPATCH SIMULADO* (cliente teste, NAO chamou fretistas)`,
        clientePhone,
        `Corrida: ${corridaId}\nFretistas que SERIAM chamados: ${telefones.length}\n_Nenhum fretista real foi notificado._`
      );
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

  // Caminho A0: cliente mandou origem E destino numa mensagem so (paridade
  // com fluxo de frete - cliente real 30/Abr "Pompeia para Osasco" cotou
  // errado por geocoder pegar Pompeia interior).
  if (!lat || !lng) {
    const origDest = separarOrigemDestino(message);
    if (origDest) {
      // Se ambas pareceRuaSemContexto, pede bairro/cidade de cada
      if (pareceRuaSemContexto(origDest.origem) && pareceRuaSemContexto(origDest.destino)) {
        await updateSession(phone, {
          step: "aguardando_bairro_origem",
          origem_endereco: origDest.origem,
          destino_endereco: origDest.destino,
        });
        await sendToClient({
          to: phone,
          message: `Anotei: *${origDest.origem}* (coleta) e *${origDest.destino}* (entrega)! 📍\n\nPra eu localizar certo, preciso saber o *bairro/cidade* de cada uma.\n\nEm qual *bairro ou cidade* fica a *${origDest.origem}*?\n\n_Ex: vila yara, osasco_`,
        });
        return;
      }
      // Geocoda os dois e pede confirmacao antes de cotar
      const [oCoords, dCoords] = await Promise.all([
        geocodeAddress(origDest.origem),
        geocodeAddress(origDest.destino),
      ]);
      const oOk = !!(oCoords?.lat && oCoords?.lng);
      const dOk = !!(dCoords?.lat && dCoords?.lng);
      if (oOk && dOk) {
        await pedirConfirmacaoEnderecosIA(
          phone,
          origDest.origem, oCoords!.lat, oCoords!.lng,
          origDest.destino, dCoords!.lat, dCoords!.lng,
        );
        return;
      }
      // Algum falhou - cai no fluxo padrao abaixo (vai geocodar a frase
      // inteira como 1 endereco; se falhar, sistema pede de novo).
    }
  }

  // Tenta GPS primeiro
  if (lat && lng) {
    const geo = await reverseGeocode(lat, lng);
    endereco = geo || `${lat},${lng}`;
  } else {
    // Tenta link Google Maps (cliente cola URL em vez de mandar GPS pelo clipe)
    const linkMaps = detectarLinkGoogleMaps(message);
    if (linkMaps) {
      const coords = await resolverGoogleMapsLink(linkMaps);
      if (coords) {
        endereco = (await reverseGeocode(coords.lat, coords.lng)) || `${coords.lat},${coords.lng}`;
        latitude = coords.lat;
        longitude = coords.lng;
      }
    }
    // Tenta CEP
    if (!endereco) {
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

  // Tenta link Google Maps primeiro
  const linkMaps = detectarLinkGoogleMaps(message);
  if (linkMaps) {
    const coords = await resolverGoogleMapsLink(linkMaps);
    if (coords) {
      destLat = coords.lat;
      destLng = coords.lng;
      destino = (await reverseGeocode(coords.lat, coords.lng)) || `${coords.lat},${coords.lng}`;
    }
  }

  // Tenta CEP
  if (!destino) {
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
  // Aceita texto livre como destino, mas sem coords
  if (!destino) {
    destino = message.trim();
  }

  // Antes de cotar, MOSTRA os enderecos identificados pra cliente confirmar
  // que geocoder pegou os lugares certos (regra: jamais cotar sem certeza).
  // Cliente real cotou Pompeia interior por engano - viola a regra.
  if (destLat && destLng && session.origem_lat && session.origem_lng) {
    await pedirConfirmacaoEnderecosIA(
      phone,
      session.origem_endereco!, session.origem_lat, session.origem_lng,
      destino, destLat, destLng,
    );
    return;
  }

  // Sem coords precisas - cota com risco (mantem comportamento antigo, mas loga)
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "guincho_destino_sem_coords",
      phone_masked: phone.replace(/\d(?=\d{4})/g, "*"),
      origem: session.origem_endereco?.slice(0, 100) || null,
      destino: destino.slice(0, 100),
    },
  });

  // Salva o que tem e segue pra cotacao mesmo sem coords precisas
  await updateSession(phone, {
    destino_endereco: destino,
    destino_lat: destLat,
    destino_lng: destLng,
    distancia_km: (session.origem_lat && session.origem_lng && destLat && destLng)
      ? calcularDistanciaKm(session.origem_lat, session.origem_lng, destLat, destLng)
      : null,
  });
  await cotarGuinchoEFinalizar(phone);
}

// Cota guincho com base em session ja preenchida (origem + destino + coords +
// distancia_km + descricao_carga). Reutilizada por handleGuinchoDestino e
// handleConfirmandoEnderecosIA quando servico=guincho.
async function cotarGuinchoEFinalizar(phone: string) {
  const session = await getSession(phone);
  if (!session) return;

  const categoriaNum = session.plano_escolhido || "1";
  const distKm = session.distancia_km || 0;
  const destino = session.destino_endereco || "";

  // Detecta tipo de veiculo da descricao
  const descCarga = session.descricao_carga || "";
  let tipoVeic = "carro_comum";
  if (descCarga.includes("Moto")) tipoVeic = "moto";
  else if (descCarga.includes("Caminhonete") || descCarga.includes("SUV")) tipoVeic = "caminhonete_suv";
  else if (descCarga.includes("Veiculo grande")) tipoVeic = "veiculo_grande";

  const precoInfo = GUINCHO_PRECOS_VEICULO[tipoVeic] || { base: 200, porKm: 5 };
  const kmExtra = Math.max(0, distKm - 5);
  let valorTotal = Math.round(precoInfo.base + kmExtra * precoInfo.porKm);

  // Taxas adicionais (noturno/feriado/fim de semana) so aplicam pra guincho IMEDIATO
  let taxaExtra = "";
  if (categoriaNum === "1") {
    const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hora = agora.getHours();
    const diaSemana = agora.getDay();
    const isNoturno = hora >= 22 || hora < 6;
    const isFimDeSemana = diaSemana === 0 || diaSemana === 6;
    const feriados = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];
    const mesdia = `${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
    const isFeriado = feriados.includes(mesdia);
    if (isNoturno) { valorTotal = Math.round(valorTotal * 1.3); taxaExtra = "noturno"; }
    if (isFeriado) { valorTotal = Math.round(valorTotal * (isNoturno ? 1 : 1.3)); taxaExtra = taxaExtra ? "noturno + feriado" : "feriado"; }
    if (isFimDeSemana && !isFeriado && !isNoturno) { valorTotal = Math.round(valorTotal * 1.2); taxaExtra = "fim de semana"; }
  }

  const categoria = GUINCHO_CATEGORIAS[categoriaNum] || "Guincho";

  if (categoriaNum === "1") {
    await updateSession(phone, {
      step: "aguardando_confirmacao",
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

*Está tudo certo?*

1️⃣ 🚚 *CHAMAR GUINCHEIRO*
2️⃣ ✏️ *EDITAR* (corrigir algo)`,
    });
  } else {
    await updateSession(phone, {
      step: "aguardando_data",
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
