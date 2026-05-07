// Lib para enviar mensagens via ChatPro WhatsApp API
// Suporta 2 instancias (2 numeros)
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

const CHATPRO_ENDPOINT = process.env.CHATPRO_ENDPOINT || "";
const CHATPRO_TOKEN = process.env.CHATPRO_TOKEN || "";

// Phones reservados pra IMUNI Smoke E2E. Esses phones SAO PROPOSITALMENTE
// inexistentes ("5500000000001"). ChatPro retorna 400 e quebra o fluxo do
// smoke. Fix: detectar esses phones na entrada do sendMessage/sendImage e
// retornar mock sem chamar ChatPro. Loga em bot_logs pra rastreio.
//
// Convencao: phone smoke = comeca com 55000 (DDI BR + DDD impossivel 00).
// Cliente real nunca usa esse formato (DDD valido vai 11-99).
function isSmokePhone(to: string): boolean {
  return /^55000\d+$/.test(to);
}

// Dedupe de outbound (7/Mai/2026): cliente Igor real recebeu mesma msg
// "Anotei, tô localizando..." 9x e "Não tô conseguindo identificar..." 7x
// porque mandou 9 msgs em ~3s e cada webhook concorrente respondeu igual.
// Solucao: cache em memoria (phone, hash da msg, ts). Se proxima envio
// for IGUAL ao ultimo dentro de 30s, SKIP. Cache expira sozinho (Map size
// limit 500). Se serverless reiniciar, cache zera — comportamento aceitavel.
const outboundDedupCache = new Map<string, { hash: string; expiresAt: number }>();
const OUTBOUND_DEDUP_WINDOW_MS = 30_000;
function hashSimples(s: string): string {
  // Hash simples baseado em primeiros 200 chars + length (suficiente pra
  // mensagens do bot que tem padrao consistente).
  return `${s.slice(0, 200)}|${s.length}`;
}
function devevDedupar(phone: string, message: string): boolean {
  const agora = Date.now();
  // Limpa entradas expiradas (cap memoria) — itera so se Map ficar grande
  if (outboundDedupCache.size > 500) {
    for (const [k, v] of outboundDedupCache) {
      if (v.expiresAt < agora) outboundDedupCache.delete(k);
    }
  }
  const cached = outboundDedupCache.get(phone);
  const hash = hashSimples(message);
  if (cached && cached.hash === hash && cached.expiresAt > agora) {
    return true; // dedup
  }
  outboundDedupCache.set(phone, {
    hash,
    expiresAt: agora + OUTBOUND_DEDUP_WINDOW_MS,
  });
  return false;
}

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

// Helper: fetch com timeout (15s). Audit re-pass 1/Mai/2026.
// Sem timeout, ChatPro lento trava webhook ate 60s -> retry duplica mensagens.
async function fetchComTimeout(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendMessage({ to, message, instance }: SendMessageOptions) {
  // Dedupe outbound: msg igual ao mesmo phone em <30s = skip (cliente real
  // 7/Mai/2026 Igor recebeu mesma msg 9x em 3s por race). Loga pra rastreio.
  if (devevDedupar(to, message)) {
    try {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "chatpro_dedup_skip",
          phone_masked: to.replace(/\d(?=\d{4})/g, "*"),
          message_preview: message.slice(0, 80),
          instance: instance || 1,
        },
      });
    } catch {
      // Best-effort
    }
    return { dedup: true, skip: true };
  }
  // Phones do smoke E2E: nao chama ChatPro (retornaria 400 sempre — phone
  // inexistente). Loga em bot_logs pra observabilidade do smoke.
  if (isSmokePhone(to)) {
    try {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "chatpro_smoke_mock",
          phone: to,
          message_preview: (message || "").slice(0, 80),
          instance: instance || 1,
        },
      });
    } catch {
      // Silencio — log auxiliar.
    }
    return { mocked: true, smoke: true };
  }

  const { endpoint, token } = getConfig(instance);

  const response = await fetchComTimeout(`${endpoint}/api/v1/send_message`, {
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
  // Mesma logica de sendMessage: phones smoke nao chamam ChatPro.
  if (isSmokePhone(to)) {
    try {
      await supabase.from("bot_logs").insert({
        payload: {
          tipo: "chatpro_smoke_mock_image",
          phone: to,
          url_preview: (url || "").slice(0, 80),
          caption_preview: (caption || "").slice(0, 80),
          instance: instance || 1,
        },
      });
    } catch {
      // Silencio.
    }
    return { mocked: true, smoke: true };
  }

  const { endpoint, token } = getConfig(instance);

  // Endpoint correto descoberto em 25/Abr: ChatPro usa send_message_file_from_url
  // pra qualquer media (imagem, video, doc). Antes estavamos usando /api/v1/send_image
  // que retorna 404. Doc: https://chatpro.readme.io/reference/send_message_file_from_url
  const response = await fetchComTimeout(`${endpoint}/api/v1/send_message_file_from_url`, {
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
    } catch (e: any) {
      console.warn("chatpro_send_image_falhou log falhou:", e?.message);
    }
    throw new Error(`ChatPro image error: ${response.status}`);
  }

  return response.json();
}

// Re-exporta de phone-utils (movido em 30/Abr/2026 pra ficar testavel
// isoladamente sem precisar mockar Supabase). Callers existentes
// continuam funcionando.
export { formatPhone, isValidBrPhone } from "@/lib/phone-utils";

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
  const result = await sendMessage({ to: opts.to, message: opts.message, instance });
  // BUG #C (5/Mai/2026): registra mensagem enviada em conversas_whatsapp
  // pra historico canonico. Best-effort — nao trava resposta se falhar.
  void registrarConversaSafe(opts.to, "out", opts.message, "text", null, instance);
  return result;
}

export async function sendImageToClient(opts: { to: string; url: string; caption?: string; fallbackInstance?: 1 | 2 }) {
  const instance = await resolveInstanceByPhone(opts.to, opts.fallbackInstance ?? 1);
  const result = await sendImage({ to: opts.to, url: opts.url, caption: opts.caption, instance });
  void registrarConversaSafe(opts.to, "out", opts.caption || "[image]", "image", opts.url, instance);
  return result;
}

// Helper local pra evitar dependencia ciclica em registrar-conversa.
// Best-effort: nunca trava o fluxo de envio.
async function registrarConversaSafe(
  telefone: string,
  direcao: "in" | "out",
  conteudo: string,
  tipo: "text" | "image" | "audio" | "video" | "document" | "location",
  midia_url: string | null,
  instance: 1 | 2,
): Promise<void> {
  try {
    const { registrarConversa } = await import("@/lib/registrar-conversa");
    await registrarConversa({
      telefone,
      direcao,
      conteudo,
      tipo,
      midia_url,
      metadata: { instance },
    });
  } catch {
    // Silencio absoluto. Falha de log nao bloqueia envio de msg.
  }
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

