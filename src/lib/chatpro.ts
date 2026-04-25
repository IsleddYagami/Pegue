// Lib para enviar mensagens via ChatPro WhatsApp API
// Suporta 2 instancias (2 numeros)
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

const CHATPRO_ENDPOINT = process.env.CHATPRO_ENDPOINT || "";
const CHATPRO_TOKEN = process.env.CHATPRO_TOKEN || "";

// Segunda instancia
const CHATPRO_INSTANCE_2 = process.env.CHATPRO_INSTANCE_2 || "";
const CHATPRO_TOKEN_2 = process.env.CHATPRO_TOKEN_2 || "";
const CHATPRO_ENDPOINT_2 = CHATPRO_INSTANCE_2
  ? `https://v5.chatpro.com.br/${CHATPRO_INSTANCE_2}`
  : "";

interface SendMessageOptions {
  to: string; // numero com DDI, ex: "5511970363713"
  message: string;
  instance?: 1 | 2; // qual instancia usar (default: 1)
}

interface SendImageOptions {
  to: string;
  url: string;
  caption?: string;
  instance?: 1 | 2;
}

function getConfig(instance: 1 | 2 = 1) {
  if (instance === 2 && CHATPRO_ENDPOINT_2 && CHATPRO_TOKEN_2) {
    return { endpoint: CHATPRO_ENDPOINT_2, token: CHATPRO_TOKEN_2 };
  }
  return { endpoint: CHATPRO_ENDPOINT, token: CHATPRO_TOKEN };
}

export async function sendMessage({ to, message, instance }: SendMessageOptions) {
  const { endpoint, token } = getConfig(instance);

  const response = await fetch(`${endpoint}/api/v1/send_message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({
      number: to,
      message,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Erro ao enviar mensagem ChatPro:", error);
    throw new Error(`ChatPro error: ${response.status}`);
  }

  return response.json();
}

export async function sendImage({ to, url, caption, instance }: SendImageOptions) {
  const { endpoint, token } = getConfig(instance);

  // Endpoint correto descoberto em 25/Abr: ChatPro usa send_message_file_from_url
  // pra qualquer media (imagem, video, doc). Antes estavamos usando /api/v1/send_image
  // que retorna 404. Doc: https://chatpro.readme.io/reference/send_message_file_from_url
  const response = await fetch(`${endpoint}/api/v1/send_message_file_from_url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({
      number: to,
      url,
      caption: caption || "",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Erro ao enviar imagem ChatPro:", response.status, error);
    // Log estruturado em bot_logs (serverless console nao persiste)
    try {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "chatpro_send_image_falhou",
          status: response.status,
          erro_amostra: error?.slice(0, 300) || "sem corpo",
          url_imagem: url?.slice(0, 200),
          instance,
          to_masked: to.replace(/\d(?=\d{4})/g, "*"),
        },
      });
    } catch {}
    throw new Error(`ChatPro image error: ${response.status}`);
  }

  return response.json();
}

// Formata numero para padrao ChatPro (apenas digitos com DDI)
export function formatPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

// Envia mensagem para multiplos numeros (usa instancia 1 por padrao)
export async function sendMessageToMany(numbers: string[], message: string, instance?: 1 | 2) {
  const results = await Promise.allSettled(
    numbers.map((to) => sendMessage({ to, message, instance }))
  );
  return results;
}

// === Helpers que resolvem instance via session do destinatario ===
// Cada contato (cliente, prestador) conversa por um numero ChatPro. A session
// guarda qual instancia. Assim o bot sempre responde na mesma conversa em que
// o usuario escreveu, mesmo que o codigo chamador nao saiba a instancia.

const instanceCache = new Map<string, { instance: 1 | 2; expires: number }>();

async function resolveInstanceByPhone(phone: string, fallback: 1 | 2 = 1): Promise<1 | 2> {
  // Cache leve de 30s pra evitar query por mensagem (serverless reinicia, ok)
  const cached = instanceCache.get(phone);
  if (cached && cached.expires > Date.now()) return cached.instance;

  const { data } = await supabase
    .from("bot_sessions")
    .select("instance_chatpro")
    .eq("phone", phone)
    .maybeSingle();

  const resolved: 1 | 2 = data?.instance_chatpro === 2 ? 2 : fallback;
  instanceCache.set(phone, { instance: resolved, expires: Date.now() + 30_000 });
  return resolved;
}

// Envia mensagem pra um contato e resolve a instancia automaticamente via session
// Use esta funcao em vez de sendMessage quando enviar pra cliente/prestador (nao-admin)
export async function sendToClient(opts: { to: string; message: string; fallbackInstance?: 1 | 2 }) {
  const instance = await resolveInstanceByPhone(opts.to, opts.fallbackInstance ?? 1);
  return sendMessage({ to: opts.to, message: opts.message, instance });
}

export async function sendImageToClient(opts: { to: string; url: string; caption?: string; fallbackInstance?: 1 | 2 }) {
  const instance = await resolveInstanceByPhone(opts.to, opts.fallbackInstance ?? 1);
  return sendImage({ to: opts.to, url: opts.url, caption: opts.caption, instance });
}

// Invalida o cache de instance pra um phone (usar apos mudar instance_chatpro na session)
export function invalidateInstanceCache(phone: string) {
  instanceCache.delete(phone);
}

// Pre-popula o cache com a instancia detectada pelo webhook. Garante que mesmo
// antes da session ser criada no DB, sendToClient responda pela instancia certa.
export function setInstanceCache(phone: string, instance: 1 | 2) {
  instanceCache.set(phone, { instance, expires: Date.now() + 30_000 });
}

// Versao em batch de sendToClient: cada destinatario recebe pela instancia correta
// (resolvida via session). Usado pra dispatch de fretistas, em que cada fretista pode
// estar conversando por um numero diferente.
export async function sendToClients(phones: string[], message: string) {
  const results = await Promise.allSettled(
    phones.map((to) => sendToClient({ to, message }))
  );
  return results;
}

// Envia pelos 2 numeros ao mesmo tempo (dispatch pra mais alcance)
export async function sendMessageToManyDual(numbers: string[], message: string) {
  // Divide a lista entre as 2 instancias pra distribuir carga
  // Se so tem 1 instancia, manda tudo pela 1
  if (!CHATPRO_ENDPOINT_2 || !CHATPRO_TOKEN_2) {
    return sendMessageToMany(numbers, message, 1);
  }

  const metade = Math.ceil(numbers.length / 2);
  const grupo1 = numbers.slice(0, metade);
  const grupo2 = numbers.slice(metade);

  const [r1, r2] = await Promise.all([
    sendMessageToMany(grupo1, message, 1),
    sendMessageToMany(grupo2, message, 2),
  ]);

  return [...r1, ...r2];
}
