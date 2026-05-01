// IMUNI plugin Pegue — checks de INFRA (headers HTTP, env vars, configs).
//
// Categoria de bugs detectada (audit 1/Mai/2026):
//   BUG #BATCH7-1: Permissions-Policy geolocation=() bloqueava GPS do
//   motorista — feature core do rastreio quebrada por header de seguranca.
//   Linter nao pega; teste unitario nao pega; cron de banco nao pega.
//   Solucao: invariante que faz HEAD HTTP na propria origem e verifica
//   que header esta correto.
//
// Esses checks rodam junto com as 11 invariantes de banco no cron diario.
// Entram como invariantes regulares (mesma assinatura InvarianteFn).

import type { ResultadoInvariante } from "@/lib/imuni/types";

const BASE_URL = "https://www.chamepegue.com.br";

async function fetchComTimeout(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * INV-12 (ALTA): Permissions-Policy permite geolocation pra origem propria.
 * Sintoma se falhar: rastreio do motorista (/rastrear/motorista/[token])
 * nao consegue chamar navigator.geolocation. Bug latente do BUG #BATCH7-1.
 */
export async function invHeaderGeolocationPermitido(): Promise<ResultadoInvariante> {
  try {
    const r = await fetchComTimeout(`${BASE_URL}/`, { method: "HEAD" });
    const policy = r.headers.get("permissions-policy") || "";
    // Aceita: geolocation=(self), geolocation=*, ou geolocation=("..."). Nao aceita: geolocation=()
    const bloqueado = /geolocation\s*=\s*\(\s*\)/.test(policy);
    return {
      nome: "INV-12",
      descricao: "Header Permissions-Policy permite geolocation pra origem propria (rastreio motorista depende disso)",
      severidade: "alta",
      count: bloqueado ? 1 : 0,
      amostra: bloqueado ? [{ permissions_policy: policy }] : [],
      ok: !bloqueado,
      comoAgir: "Em next.config.ts, garantir Permissions-Policy contem `geolocation=(self)` (nao `geolocation=()`). BUG #BATCH7-1 era exatamente isso.",
    };
  } catch (e: any) {
    return { nome: "INV-12", descricao: "header_permissions_policy", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Site fora do ar?" };
  }
}

/**
 * INV-13 (ALTA): Header HSTS presente. Sem HSTS browser pode aceitar
 * downgrade pra HTTP em primeira visita — risco de MITM em redes hostis.
 */
export async function invHeaderHsts(): Promise<ResultadoInvariante> {
  try {
    const r = await fetchComTimeout(`${BASE_URL}/`, { method: "HEAD" });
    const hsts = r.headers.get("strict-transport-security") || "";
    const ok = hsts.includes("max-age=") && parseInt(hsts.match(/max-age=(\d+)/)?.[1] || "0") >= 31536000;
    return {
      nome: "INV-13",
      descricao: "Header Strict-Transport-Security (HSTS) com max-age >= 1 ano",
      severidade: "alta",
      count: ok ? 0 : 1,
      amostra: ok ? [] : [{ strict_transport_security: hsts || "(ausente)" }],
      ok,
      comoAgir: "next.config.ts deve ter HSTS com max-age=31536000 (1 ano). Sem isso, primeira visita pode cair em HTTP.",
    };
  } catch (e: any) {
    return { nome: "INV-13", descricao: "header_hsts", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Site fora do ar?" };
  }
}

/**
 * INV-14 (ALTA): CSP whitelist contem dominios criticos pra producao.
 * Asaas precisa estar em connect-src + frame-src; ChatPro em connect-src;
 * OpenAI em connect-src. Sem isso, requests sao bloqueados pelo browser.
 */
export async function invHeaderCspProducao(): Promise<ResultadoInvariante> {
  try {
    const r = await fetchComTimeout(`${BASE_URL}/`, { method: "HEAD" });
    const csp = r.headers.get("content-security-policy") || "";
    const faltando: string[] = [];
    if (!csp.includes("asaas.com")) faltando.push("asaas.com");
    if (!csp.includes("chatpro.com.br")) faltando.push("chatpro.com.br");
    if (!csp.includes("api.openai.com")) faltando.push("api.openai.com");
    if (!csp.includes("supabase.co")) faltando.push("supabase.co");
    return {
      nome: "INV-14",
      descricao: "Content-Security-Policy whitelist contem dominios externos criticos (Asaas, ChatPro, OpenAI, Supabase)",
      severidade: "alta",
      count: faltando.length,
      amostra: faltando.length > 0 ? [{ dominios_faltando: faltando, csp_atual_amostra: csp.slice(0, 200) }] : [],
      ok: faltando.length === 0,
      comoAgir: "Em next.config.ts, adicionar dominios faltando em connect-src do CSP. Sem CSP correta, pagamentos/bot/IA sao bloqueados pelo browser.",
    };
  } catch (e: any) {
    return { nome: "INV-14", descricao: "header_csp", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Site fora do ar?" };
  }
}

/**
 * INV-15 (ALTA): Env vars criticas presentes em runtime.
 * Detecta config drift: alguem mexeu na Vercel e apagou variavel sem perceber.
 */
export async function invEnvVarsCriticas(): Promise<ResultadoInvariante> {
  const requeridas = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CRON_SECRET",
    "ADMIN_KEY",
    "ADMIN_PHONES",
    "WEBHOOK_WHATSAPP_SECRET",
    "CHATPRO_ENDPOINT",
    "CHATPRO_TOKEN",
    "ASAAS_API_KEY",
    "ASAAS_BASE_URL",
    "ASAAS_WALLET_ID",
    "ASAAS_WEBHOOK_TOKEN",
    "OPENAI_API_KEY",
    "RESEND_API_KEY",
  ];
  const ausentes = requeridas.filter((k) => !process.env[k]);
  return {
    nome: "INV-15",
    descricao: "Variaveis de ambiente criticas configuradas (Vercel + .env)",
    severidade: "alta",
    count: ausentes.length,
    amostra: ausentes.length > 0 ? [{ ausentes }] : [],
    ok: ausentes.length === 0,
    comoAgir: "Checar painel Vercel > Settings > Environment Variables. Variaveis que sumiram precisam ser adicionadas. Em vars criticas (CRON_SECRET, ADMIN_KEY) sumir = sistema parado.",
  };
}

/**
 * INV-16 (MEDIA): Asaas em PRODUCAO (nao sandbox).
 * Sintoma se falhar: cobrancas reais do cliente caem em sandbox e nao
 * sao processadas — perda de receita silenciosa.
 */
export async function invAsaasEmProducao(): Promise<ResultadoInvariante> {
  const apiKey = process.env.ASAAS_API_KEY || "";
  const baseUrl = process.env.ASAAS_BASE_URL || "";
  const ehSandbox = apiKey.startsWith("$aact_hmlg_") || baseUrl.includes("sandbox");
  return {
    nome: "INV-16",
    descricao: "Asaas configurado em PRODUCAO (nao sandbox)",
    severidade: "media",
    count: ehSandbox ? 1 : 0,
    amostra: ehSandbox
      ? [{ tipo_chave: apiKey.startsWith("$aact_hmlg_") ? "sandbox" : "prod", base_url_contem_sandbox: baseUrl.includes("sandbox") }]
      : [],
    ok: !ehSandbox,
    comoAgir: "ASAAS_API_KEY deve comecar com $aact_prod_ e ASAAS_BASE_URL deve ser https://api.asaas.com/v3 (sem 'sandbox'). Sandbox aceita pagamentos fake mas nao processa real.",
  };
}
