// IMUNI plugin Pegue — REGISTRY DE INTEGRACOES + probes read-only.
//
// Fonte unica de verdade sobre as ferramentas externas das quais a Pegue
// depende. Cada entrada descreve: env vars exigidas, dominios de CSP, e um
// probe read-only de saude.
//
// >>> PARA O RODRIGO (Otimizi) <<<
// Este arquivo eh o que voce EDITA/SUBSTITUI. O core (src/lib/imuni/
// integracoes.ts) fica intacto. Pra Otimizi: copie este arquivo, troque a
// lista `INTEGRACOES_PEGUE` pelas ferramentas da Otimizi e escreva os probes
// que fizerem sentido. Estes probes sao os PADRAO por enquanto (Fabio 5/Ago):
// se voce tiver probes mais eficientes/precisos, substitua a funcao `probe`
// da entrada — nada mais precisa mudar.
//
// REGRA DE OURO DOS PROBES: read-only, sem efeito colateral. Nunca enviar
// mensagem de WhatsApp/Telegram, nunca criar cobranca, nunca transferir PIX.
// So GET / consulta de status. Todos abaixo respeitam isso.

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { probeHttpReadonly, checarSaudeIntegracoes } from "@/lib/imuni/integracoes";
import type { Integracao, RegistryIntegracoes, ResultadoProbe } from "@/lib/imuni/integracoes";
import type { ResultadoInvariante } from "@/lib/imuni/types";
import { avisoChaveGoogle } from "@/lib/chave-google";

// --- Probes individuais (read-only) ---

// Supabase: um SELECT trivial prova conectividade + service role valido.
async function probeSupabase(): Promise<ResultadoProbe> {
  const inicio = performance.now();
  try {
    const { error } = await supabase.from("bot_logs").select("id").limit(1);
    const latenciaMs = Math.round(performance.now() - inicio);
    if (error) return { status: "fora_do_ar", latenciaMs, detalhe: error.message?.slice(0, 200) };
    return { status: latenciaMs > 5000 ? "degradado" : "ok", latenciaMs, detalhe: latenciaMs > 5000 ? `latencia ${latenciaMs}ms` : undefined };
  } catch (e: any) {
    return { status: "fora_do_ar", detalhe: e?.message?.slice(0, 200) };
  }
}

// OpenAI: GET /v1/models — read-only e SEM custo de token. 200 = chave ok;
// 401 = chave revogada/expirada (foi exatamente o bug de 25/Abr que fez 16
// fotos virarem "Material (foto)" sem alerta).
function probeOpenAI(): Promise<ResultadoProbe> {
  return probeHttpReadonly("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
}

// Asaas: GET /finance/balance — read-only (nao cobra, nao transfere). Header
// `access_token` (Asaas nao usa Bearer). Valida chave + servico no ar.
function probeAsaas(): Promise<ResultadoProbe> {
  const base = process.env.ASAAS_BASE_URL || "";
  return probeHttpReadonly(`${base}/finance/balance`, {
    headers: { access_token: process.env.ASAAS_API_KEY || "", "User-Agent": "PegueMarketplace/1.0" },
  });
}

// Google Maps: NAO chama o Google (toda chamada e' billable). So' confere de
// qual projeto veio a chave — ver src/lib/chave-google.ts.
function probeChaveGoogle(): Promise<ResultadoProbe> {
  const aviso = avisoChaveGoogle();
  if (!aviso) return Promise.resolve({ status: "ok", latenciaMs: 0 });
  return Promise.resolve({ status: "degradado", latenciaMs: 0, detalhe: aviso });
}

// Resend (e-mail de alerta): GET /domains — read-only. 200 = chave ok.
function probeResend(): Promise<ResultadoProbe> {
  return probeHttpReadonly("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
}

// Telegram (canal de alerta): GET /getMe — read-only, valida o bot token.
function probeTelegram(): Promise<ResultadoProbe> {
  return probeHttpReadonly(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
}

// MercadoPago (LEGADO — convive com Asaas, decisao pendente de remover):
// GET /users/me — read-only, valida token. critica=false pra nao dar alarme
// alto enquanto for legado.
function probeMercadoPago(): Promise<ResultadoProbe> {
  return probeHttpReadonly("https://api.mercadopago.com/users/me", {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
}

// ChatPro (WhatsApp — coracao da operacao): NAO tem endpoint de status
// publico documentado, e enviar mensagem teria efeito colateral. Entao o
// probe eh conservador: so REACHABILITY (GET no host, qualquer resposta HTTP
// prova que o servico esta no ar; so falha de rede/timeout = fora_do_ar).
// Nao valida o token. Rodrigo/nos podemos trocar por um endpoint de status
// real quando confirmarmos na doc do ChatPro (por isso e o padrao trocavel).
async function probeChatProReachability(): Promise<ResultadoProbe> {
  const endpoint = process.env.CHATPRO_ENDPOINT || "";
  const inicio = performance.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(endpoint, { method: "GET", signal: controller.signal, cache: "no-store" });
    const latenciaMs = Math.round(performance.now() - inicio);
    // Qualquer status < 500 => host no ar e respondendo. >=500 => degradado do lado deles.
    if (r.status >= 500) return { status: "fora_do_ar", httpStatus: r.status, latenciaMs, detalhe: `host respondeu ${r.status}` };
    return { status: latenciaMs > 5000 ? "degradado" : "ok", httpStatus: r.status, latenciaMs, detalhe: "reachability apenas (nao valida token)" };
  } catch (e: any) {
    return { status: "fora_do_ar", detalhe: e?.name === "AbortError" ? "timeout 10s" : e?.message?.slice(0, 200) };
  } finally {
    clearTimeout(t);
  }
}

// --- Registry declarativo ---

export const INTEGRACOES_PEGUE: Integracao[] = [
  {
    nome: "supabase",
    descricao: "Banco de dados + storage (nucleo — tudo depende dele)",
    critica: true,
    envVars: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    cspDominios: ["supabase.co"],
    probe: probeSupabase,
  },
  {
    nome: "chatpro",
    descricao: "Gateway WhatsApp (porta de entrada/saida do cliente)",
    critica: true,
    envVars: ["CHATPRO_ENDPOINT", "CHATPRO_TOKEN"],
    cspDominios: ["chatpro.com.br"],
    probe: probeChatProReachability,
  },
  {
    nome: "openai",
    descricao: "IA Vision (extracao de itens por foto) + parsing de contexto",
    critica: true,
    envVars: ["OPENAI_API_KEY"],
    cspDominios: ["api.openai.com"],
    probe: probeOpenAI,
  },
  {
    nome: "asaas",
    descricao: "Pagamentos (cobranca PIX/cartao + repasse PIX ao fretista)",
    critica: true,
    envVars: ["ASAAS_API_KEY", "ASAAS_BASE_URL", "ASAAS_WALLET_ID"],
    cspDominios: ["asaas.com"],
    probe: probeAsaas,
  },
  {
    nome: "resend",
    descricao: "E-mail de alerta (canal de escalonamento da IMUNI)",
    critica: false,
    envVars: ["RESEND_API_KEY"],
    probe: probeResend,
  },
  {
    nome: "telegram",
    descricao: "Canal de alerta com som forte (admins)",
    critica: false,
    envVars: ["TELEGRAM_BOT_TOKEN"],
    probe: probeTelegram,
  },
  {
    nome: "mercadopago",
    descricao: "LEGADO — pagamento antigo, convive com Asaas (avaliar remocao)",
    critica: false,
    envVars: ["MP_ACCESS_TOKEN"],
    probe: probeMercadoPago,
  },
  {
    // Sem probe ativo: Sentry nao tem GET de saude trivial. Fica so no env-check.
    nome: "sentry",
    descricao: "Observabilidade de erros em runtime",
    critica: false,
    envVars: ["NEXT_PUBLIC_SENTRY_DSN"],
  },
  {
    // Sem probe de REDE: geocoding do Google eh billable — evita custo. Ja
    // coberto passivamente por INV-48 (pico de origem_nao_identificada).
    //
    // O probe daqui nao sai da maquina: ele conta DE QUAL PROJETO veio a
    // chave. Ordem do Fabio em 8/Nov/2026 — "nada da pegue se mistura a
    // otimizi" + "independente": a chave tem que vir de um projeto do
    // Google Cloud so' da Pegue, em GOOGLE_MAPS_API_KEY_PEGUE. Enquanto for
    // a herdada, isto fica "degradado" todo dia com o motivo escrito, e
    // apaga sozinho quando a chave propria entrar.
    nome: "google_maps",
    descricao: "Geocoding de enderecos (billable — probe passivo via INV-48)",
    critica: false,
    // Vazio de proposito: se a chave propria entrasse aqui, o core marcaria
    // "nao_configurado — env vars ausentes" e ENGOLIRIA o motivo. Quem conta
    // qual chave esta valendo e' o probe abaixo, com a frase inteira.
    envVars: [],
    probe: probeChaveGoogle,
  },
];

export const registryPegue: RegistryIntegracoes = {
  dominio: "pegue",
  integracoes: INTEGRACOES_PEGUE,
};

/**
 * INV-51 (ALTA se critica cair): saude das ferramentas/integracoes externas.
 * Probe ativo read-only — detecta down, chave revogada, lentidao e deprecation
 * ANTES do cliente esbarrar. Roda no cron diario junto com as outras.
 */
export function invSaudeIntegracoes(): Promise<ResultadoInvariante> {
  return checarSaudeIntegracoes(registryPegue, { nome: "INV-51" });
}

// Derivados do registry — fonte unica pra outros checks reusarem (lapidacao:
// INV-14 CSP e INV-15 env vars podem passar a ler daqui). Exportados ja prontos.
export function envVarsDoRegistry(): string[] {
  return Array.from(new Set(INTEGRACOES_PEGUE.flatMap((i) => i.envVars)));
}
export function cspDominiosDoRegistry(): string[] {
  return Array.from(new Set(INTEGRACOES_PEGUE.flatMap((i) => i.cspDominios || [])));
}
