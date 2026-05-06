// Helper pra enviar notificacao pros admins via WhatsApp + Telegram em paralelo.
// WhatsApp: ADMIN_PHONES (lista separada por virgula).
// Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_IDS (alarme alta prioridade).
import { sendMessage } from "@/lib/chatpro";
import { getAdminPhones } from "@/lib/admin-auth";
import { sendTelegram } from "@/lib/telegram";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { gerarCodigoClaim } from "@/lib/admin-claim-token";

// Re-exporta pra manter compat de quem importa de admin-notify
export { ALPHABET_CLAIM, CLAIM_LENGTH, gerarCodigoClaim } from "@/lib/admin-claim-token";

// Notifica TODOS os admins configurados — WhatsApp E Telegram (em paralelo).
// Telegram permite som customizado/alta prioridade (configurar no app).
// Retorna o numero de admins que receberam pelo WhatsApp.
export async function notificarAdmins(
  titulo: string,
  referenciaCliente: string,
  detalhes: string
): Promise<number> {
  const phones = getAdminPhones();
  if (phones.length === 0) {
    console.error("notificarAdmins: nenhum phone configurado em ADMIN_PHONES/ADMIN_PHONE");
    // Mesmo sem WhatsApp, ainda tenta Telegram
  }

  const corpo = `${titulo}\n\nCliente: ${referenciaCliente}\n\n${detalhes}`;

  // Dispara Telegram em paralelo (nao bloqueia WhatsApp)
  // sendTelegram retorna 0 silenciosamente se TELEGRAM_* nao configurado
  const telegramPromise = sendTelegram({ text: corpo });

  let enviadosWhatsapp = 0;
  for (const phone of phones) {
    // Fallback automatico: tenta instance 1, se falhar tenta 2.
    // Se as duas estiverem fora, admin perde a notificacao no WhatsApp
    // (ainda recebe pelo Telegram em paralelo).
    let entregue = false;
    let erroInstance1: string | undefined;
    try {
      await sendMessage({ to: phone, message: corpo, instance: 1 });
      entregue = true;
    } catch (e1: any) {
      erroInstance1 = e1?.message;
    }
    if (!entregue) {
      try {
        await sendMessage({ to: phone, message: corpo, instance: 2 });
        entregue = true;
        console.warn(`notificarAdmins: instancia 1 falhou (${erroInstance1}), entregue via instancia 2 pra ${phone}`);
      } catch (e2: any) {
        console.error(`Falha ao notificar admin ${phone} em ambas instancias: i1=${erroInstance1} i2=${e2?.message}`);
      }
    }
    if (entregue) enviadosWhatsapp++;
  }

  // Aguarda Telegram pra log
  const enviadosTelegram = await telegramPromise;
  if (enviadosTelegram > 0) {
    console.log(`notificarAdmins: ${enviadosWhatsapp} WhatsApp + ${enviadosTelegram} Telegram`);
  }

  return enviadosWhatsapp;
}

// Versao com claim: gera codigo curto, insere alerta na tabela
// `alertas_admin_pendentes`, e injeta CTA "Responda *OK XXXX* pra assumir."
// no fim da mensagem. Primeiro admin que responder pelo WhatsApp ganha o
// claim — os demais sao notificados que ja foi assumido.
//
// Use em alertas que CHAMAM acao (escalacao humana, dispatch falhou,
// dispute, etc), nao em alertas informativos (logs, metricas).
//
// SEGURANCA (audit 2/Mai/2026): codigo gerado por gerarCodigoClaim() em
// admin-claim-token.ts — modulo puro com crypto.randomBytes (CSPRNG).
// Versao antiga (Math.random + 4 chars) era previsivel e brute-forceavel.

export async function notificarAdminsComClaim(
  titulo: string,
  clientePhone: string,
  detalhes: string,
): Promise<{ enviados: number; codigo: string | null }> {
  // Gera codigo unico (3 tentativas no caso muito improvavel de colisao)
  let codigo: string | null = null;
  for (let i = 0; i < 3; i++) {
    const tentativa = gerarCodigoClaim();
    const { error } = await supabase.from("alertas_admin_pendentes").insert({
      codigo: tentativa,
      cliente_phone: clientePhone,
      titulo,
      detalhes,
      status: "pendente",
    });
    if (!error) {
      codigo = tentativa;
      break;
    }
    if (!error || !String(error.message).includes("duplicate")) break;
  }

  // Mesmo se claim nao deu pra gravar (tabela inexistente em dev), envia
  // alerta normal — UX nao degrada, so perde feature de claim.
  const detalhesComClaim = codigo
    ? `${detalhes}\n\n_Responda *OK ${codigo}* pra assumir o atendimento. Os outros admins serao avisados._`
    : detalhes;

  const enviados = await notificarAdmins(titulo, clientePhone, detalhesComClaim);
  return { enviados, codigo };
}

// ============================================================
// Notifica os DEMAIS admins quando um deles assume atendimento humano
// de um cliente (via FromMe pelo whatsapp da Pegue, painel /admin, ou
// claim "OK XXXX"). Evita atendimento duplicado: 2 admins falando com
// o mesmo cliente em paralelo pelos 2 numeros da Pegue.
//
// Mapeamento opcional (env vars):
//   PEGUE_INSTANCE_1_ADMIN_PHONE = phone do admin operador do Pegue 1
//   PEGUE_INSTANCE_2_ADMIN_PHONE = phone do admin operador do Pegue 2
//   PEGUE_INSTANCE_1_NAME / PEGUE_INSTANCE_2_NAME = apelido humano (ex: "Fabio")
// Se mapeado, NAO notifica o proprio operador (evita spam pra ele mesmo).
// Se nao mapeado, notifica TODOS — quem assumiu sabe que e ele mesmo.
// ============================================================
export async function notificarAssuncaoAtendimento(
  clientePhone: string,
  instance: 1 | 2,
  origem: "fromme_whatsapp" | "painel_admin" | "claim_codigo",
): Promise<number> {
  const phones = getAdminPhones();
  if (phones.length === 0) return 0;

  const operadorPhoneRaw = instance === 1
    ? (process.env.PEGUE_INSTANCE_1_ADMIN_PHONE || "").trim()
    : (process.env.PEGUE_INSTANCE_2_ADMIN_PHONE || "").trim();

  const apelido = instance === 1
    ? (process.env.PEGUE_INSTANCE_1_NAME || "Pegue 1").trim()
    : (process.env.PEGUE_INSTANCE_2_NAME || "Pegue 2").trim();

  // Comparacao ROBUSTA por digitos finais — admin pode estar configurado com
  // ou sem DDI 55. Ex: ADMIN_PHONES="5511972429605" e
  // PEGUE_INSTANCE_1_ADMIN_PHONE="11972429605" devem casar (e nao casavam
  // antes — operador recebia notificacao de si mesmo).
  const normalizar = (p: string) => p.replace(/\D/g, "").replace(/^55/, "");
  const operadorNorm = normalizar(operadorPhoneRaw);

  // Filtra: nao notifica o proprio operador (se mapeado).
  // Outros admins (incluindo nao-mapeados) recebem.
  const destinatarios = operadorNorm
    ? phones.filter((p) => normalizar(p) !== operadorNorm)
    : phones;

  if (destinatarios.length === 0) {
    // So tem o proprio operador na lista — sem ninguem pra notificar.
    return 0;
  }

  const clienteFmt = formatarParaExibicao(clientePhone);
  const fonte = origem === "fromme_whatsapp"
    ? "(escreveu pelo WhatsApp da Pegue)"
    : origem === "painel_admin"
      ? "(via painel /admin)"
      : "(via claim OK XXXX)";

  const corpo = `👤 *Atendimento humano assumido*\n\nCliente: ${clienteFmt}\nAssumido por: *${apelido}* ${fonte}\n\nO bot ja foi pausado. *NAO responda* pelo outro numero — coordene com quem assumiu.\n\nQuando terminar, envie *VOLTA IRIS* pro cliente.`;

  let enviados = 0;
  for (const phone of destinatarios) {
    let entregue = false;
    try {
      await sendMessage({ to: phone, message: corpo, instance: 1 });
      entregue = true;
    } catch {
      try {
        await sendMessage({ to: phone, message: corpo, instance: 2 });
        entregue = true;
      } catch (e: any) {
        console.error(`notificarAssuncaoAtendimento: falha ${phone}: ${e?.message}`);
      }
    }
    if (entregue) enviados++;
  }

  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "assuncao_atendimento_notificada",
      cliente_masked: clientePhone.replace(/\d(?=\d{4})/g, "*"),
      instance,
      origem,
      destinatarios_notificados: enviados,
    },
  });

  return enviados;
}

// Helper local pra exibicao limpa de phone BR. NAO importa formatarTelefoneExibicao
// de bot-utils pra evitar ciclo (bot-utils -> outras libs -> admin-notify).
function formatarParaExibicao(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}
