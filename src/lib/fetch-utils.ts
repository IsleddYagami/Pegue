// Helper de fetch com timeout. IMUNI Camada 1B (regra
// no-fetch-without-timeout) exige todo fetch externo ter abort signal —
// sem isso, servico remoto lento trava webhook ate maxDuration=60s
// Vercel default e ChatPro retentava mensagens duplicadas.
//
// Uso:
//   import { fetchComTimeout } from "@/lib/fetch-utils";
//   const r = await fetchComTimeout(url, { method: "POST", body: ... });
//   // timeout default 15s. Pode customizar:
//   await fetchComTimeout(url, init, 30000); // 30s

export const FETCH_TIMEOUT_DEFAULT_MS = 15000;

export async function fetchComTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_DEFAULT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
