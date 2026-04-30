// Helper pra enviar notificacao pros admins via WhatsApp + Telegram em paralelo.
// WhatsApp: ADMIN_PHONES (lista separada por virgula).
// Telegram: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_IDS (alarme alta prioridade).
import { sendMessage } from "@/lib/chatpro";
import { getAdminPhones } from "@/lib/admin-auth";
import { sendTelegram } from "@/lib/telegram";

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
