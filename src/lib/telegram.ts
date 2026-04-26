// Cliente Telegram Bot API. Usado pra alertar admins/fretistas com som
// configuravel (Telegram permite notificacao alta prioridade que toca
// alarme mesmo no silencioso, diferente do WhatsApp).
//
// Setup necessario (Fabio faz):
// 1. Telegram > buscar @BotFather > /newbot > seguir instrucoes
// 2. Copia TOKEN -> Vercel env: TELEGRAM_BOT_TOKEN
// 3. Cria grupo Telegram com admins (Fabio + Jack)
// 4. Adiciona o bot ao grupo
// 5. Manda 1 mensagem qualquer no grupo
// 6. Acessa https://api.telegram.org/bot<TOKEN>/getUpdates pra ver chat_id
// 7. Cadastra na Vercel: TELEGRAM_CHAT_IDS (lista separada por virgula)
// 8. No Telegram, abre o grupo > 3 pontinhos > Notifications > Sound > escolhe
//    som forte/longo + Importance: All Messages.

const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramSendOptions {
  text: string;
  // Se true, mensagem chega SEM som (escondida). Default: false (com som).
  silent?: boolean;
  // Override pra mandar a chat_id especifico (em vez de TODOS configurados).
  chatId?: string;
}

// Envia mensagem pra TODOS os chat_ids configurados em TELEGRAM_CHAT_IDS.
// Retorna numero de chats que receberam.
export async function sendTelegram(opts: TelegramSendOptions): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // Fail-open: se nao configurado, ignora silenciosamente (compat enquanto
    // Fabio nao fez setup do bot)
    return 0;
  }

  const chatIds = opts.chatId
    ? [opts.chatId]
    : (process.env.TELEGRAM_CHAT_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  if (chatIds.length === 0) return 0;

  let enviados = 0;
  for (const chatId of chatIds) {
    try {
      const r = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: opts.text,
          parse_mode: "Markdown",
          disable_notification: opts.silent === true,
        }),
      });
      if (r.ok) enviados++;
      else {
        const errText = await r.text();
        console.error(`Telegram send falhou (${chatId}):`, r.status, errText.slice(0, 200));
      }
    } catch (e: any) {
      console.error(`Telegram send exception (${chatId}):`, e?.message);
    }
  }
  return enviados;
}
