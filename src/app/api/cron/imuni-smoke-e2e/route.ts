import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron `/api/cron/imuni-smoke-e2e` — ESTAGIO 3 da IMUNI (executor de
// testes em producao).
//
// Filosofia (Fabio 5/Mai/2026): "imuni nao é para ficar sendo só
// tabelas... mas principalmente mal comportamento do sistema da pegue
// em qq parte do fluxo... fluxo precisa estar perfeito".
//
// O que essa rota faz: simula um CLIENTE FICTICIO percorrendo o fluxo
// inicial do bot Pegue de "oi" ate cotacao. Cada step do fluxo eh
// chamado via POST no proprio /api/whatsapp/webhook (igualzinho a
// uma mensagem real do ChatPro). Apos cada chamada, le bot_sessions
// pra verificar que o step avancou como esperado.
//
// Se algum step falha = alerta WhatsApp+Telegram pros admins (regressao
// detectada ANTES de cliente real ver).
//
// Phone smoke: 5500000000001 (TODO em zero, claramente fake). Precisa
// estar em TEST_PHONES no env Vercel pra evitar dispatch real e
// cadastro no CRM.
//
// Frequencia recomendada cron-job.org: 4x/dia (6h, 12h, 18h, 0h BRT).
// URL: https://www.chamepegue.com.br/api/cron/imuni-smoke-e2e?key=CRON_SECRET

const SMOKE_PHONE = "5500000000001";
const SMOKE_PUSHNAME = "IMUNI Smoke E2E";

// Coordenadas Osasco SP (Pegue cobre): centro de Osasco
const SMOKE_LAT_ORIGEM = -23.5329;
const SMOKE_LNG_ORIGEM = -46.7916;

interface StepResult {
  step: string;
  ok: boolean;
  esperado?: string;
  obtido?: string;
  duracao_ms: number;
  erro?: string;
}

async function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function limparPhoneSmoke(): Promise<void> {
  // Cleanup completo: sessao + logs + cliente + conversas
  await supabase.from("bot_sessions").delete().eq("phone", SMOKE_PHONE);
  await supabase.from("clientes").delete().eq("telefone", SMOKE_PHONE);
  await supabase.from("conversas_whatsapp").delete().eq("telefone", SMOKE_PHONE);
  // Limpa bot_logs do phone (filtra payload->>phone)
  await supabase
    .from("bot_logs")
    .delete()
    .filter("payload->>phone", "eq", SMOKE_PHONE);
}

async function chamarWebhook(
  baseUrl: string,
  payload: unknown,
): Promise<{ status: number; body: unknown }> {
  // Timeout obrigatorio (regra eslint custom imuni/no-fetch-without-timeout):
  // sem isso, webhook lento trava cron ate maxDuration. 12s da margem
  // razoavel pra processamento normal mas trava cedo se houver bug.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "fetch falhou";
    return { status: 0, body: { erro: msg } };
  } finally {
    clearTimeout(timeoutId);
  }
}

function payloadMensagemTexto(text: string, instance = 1): Record<string, unknown> {
  return {
    EventType: "receveid_message",
    Body: {
      Info: {
        RemoteJid: `${SMOKE_PHONE}@s.whatsapp.net`,
        FromMe: false,
        PushName: SMOKE_PUSHNAME,
        Source: { message: {} },
      },
      Text: text,
    },
    instance,
  };
}

function payloadLocalizacao(lat: number, lng: number, instance = 1): Record<string, unknown> {
  return {
    EventType: "receveid_location",
    Body: {
      Info: {
        RemoteJid: `${SMOKE_PHONE}@s.whatsapp.net`,
        FromMe: false,
        PushName: SMOKE_PUSHNAME,
        Source: {
          message: { lat, lng },
        },
      },
      Text: "",
    },
    instance,
  };
}

async function getStepAtual(): Promise<string | null> {
  const { data } = await supabase
    .from("bot_sessions")
    .select("step")
    .eq("phone", SMOKE_PHONE)
    .maybeSingle();
  return (data?.step as string) || null;
}

export async function GET(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  // Monta base URL pra fazer chamadas internas.
  // Em prod: https://www.chamepegue.com.br
  // Em dev: localhost mas o smoke roda em prod via cron externo.
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host") || "www.chamepegue.com.br";
  const baseUrl = `${proto}://${host}`;

  const inicio = Date.now();
  const steps: StepResult[] = [];

  // Cleanup ANTES (se rodada anterior deixou lixo)
  await limparPhoneSmoke();

  // Loga inicio (rastreabilidade — INV-23 vigia esse log)
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "imuni_smoke_e2e_iniciado",
      timestamp: new Date().toISOString(),
      base_url: baseUrl,
    },
  });

  // ========== STEP 1: Cliente manda "oi" ==========
  const t1 = Date.now();
  const r1 = await chamarWebhook(baseUrl, payloadMensagemTexto("oi"));
  await dormir(1500); // dar tempo do webhook processar
  const step1Atual = await getStepAtual();
  steps.push({
    step: "1_oi",
    ok: step1Atual === "aguardando_servico",
    esperado: "aguardando_servico",
    obtido: step1Atual || "(sessao nao criada)",
    duracao_ms: Date.now() - t1,
    erro: r1.status !== 200 ? `webhook retornou ${r1.status}` : undefined,
  });

  // Se falhou no step 1, nao adianta continuar
  if (!steps[0].ok) {
    return await finalizar(steps, inicio, "step_1_falhou");
  }

  // ========== STEP 2: Cliente escolhe "1" (frete) ==========
  const t2 = Date.now();
  const r2 = await chamarWebhook(baseUrl, payloadMensagemTexto("1"));
  await dormir(1500);
  const step2Atual = await getStepAtual();
  steps.push({
    step: "2_escolha_frete",
    ok: step2Atual === "aguardando_localizacao",
    esperado: "aguardando_localizacao",
    obtido: step2Atual || "(sem step)",
    duracao_ms: Date.now() - t2,
    erro: r2.status !== 200 ? `webhook retornou ${r2.status}` : undefined,
  });

  if (!steps[1].ok) {
    return await finalizar(steps, inicio, "step_2_falhou");
  }

  // ========== STEP 3: Cliente manda localizacao GPS ==========
  const t3 = Date.now();
  const r3 = await chamarWebhook(
    baseUrl,
    payloadLocalizacao(SMOKE_LAT_ORIGEM, SMOKE_LNG_ORIGEM),
  );
  await dormir(2500); // geocoder pode demorar
  const step3Atual = await getStepAtual();
  // Apos lat/lng valido, espera-se que step avance pra confirmar_origem ou aguardando_destino
  const esperadoStep3 = ["confirmar_origem", "aguardando_destino"];
  steps.push({
    step: "3_origem_gps",
    ok: esperadoStep3.includes(step3Atual || ""),
    esperado: esperadoStep3.join(" OU "),
    obtido: step3Atual || "(sem step)",
    duracao_ms: Date.now() - t3,
    erro: r3.status !== 200 ? `webhook retornou ${r3.status}` : undefined,
  });

  // Verifica que origem_lat/lng foram salvos
  const { data: sessaoAposGps } = await supabase
    .from("bot_sessions")
    .select("origem_lat, origem_lng, origem_endereco")
    .eq("phone", SMOKE_PHONE)
    .maybeSingle();

  if (!sessaoAposGps?.origem_lat || !sessaoAposGps?.origem_lng) {
    steps.push({
      step: "3b_origem_persistida",
      ok: false,
      esperado: "origem_lat e origem_lng nao-nulos na bot_sessions",
      obtido: `lat=${sessaoAposGps?.origem_lat}, lng=${sessaoAposGps?.origem_lng}`,
      duracao_ms: 0,
      erro: "GPS chegou mas nao foi persistido — bug em handleLocalizacao",
    });
  } else {
    steps.push({
      step: "3b_origem_persistida",
      ok: true,
      esperado: "origem_lat e origem_lng nao-nulos",
      obtido: `lat=${sessaoAposGps.origem_lat}, lng=${sessaoAposGps.origem_lng}`,
      duracao_ms: 0,
    });
  }

  // STEP 4: Valida BUG D fix — cliente foi registrado em `clientes` no 1o contato
  const t4 = Date.now();
  const { data: clienteSmoke } = await supabase
    .from("clientes")
    .select("id, telefone, nome, ativo")
    .eq("telefone", SMOKE_PHONE)
    .maybeSingle();
  steps.push({
    step: "4_cliente_registrado",
    ok: !!clienteSmoke?.id,
    esperado: "cliente registrado em `clientes` apos saudacao (BUG D fix)",
    obtido: clienteSmoke ? `id=${clienteSmoke.id.slice(0, 8)}, ativo=${clienteSmoke.ativo}` : "(nao encontrado)",
    duracao_ms: Date.now() - t4,
    erro: !clienteSmoke ? "cliente nao foi inserido em `clientes` — BUG D regrediu" : undefined,
  });

  // STEP 5: Valida BUG C fix — mensagens registradas em conversas_whatsapp
  const t5 = Date.now();
  const { count: msgsConversas } = await supabase
    .from("conversas_whatsapp")
    .select("id", { count: "exact", head: true })
    .eq("telefone", SMOKE_PHONE);
  // Esperado >=3 (3 msgs in: oi, 1, lat/lng) + algumas msgs out (resposta do bot)
  // Conservador: >=3 garante que pelo menos as msgs IN foram registradas.
  const minEsperado = 3;
  steps.push({
    step: "5_conversas_whatsapp_populada",
    ok: (msgsConversas || 0) >= minEsperado,
    esperado: `>=${minEsperado} msgs em conversas_whatsapp (BUG C fix)`,
    obtido: `${msgsConversas || 0} msgs encontradas`,
    duracao_ms: Date.now() - t5,
    erro: (msgsConversas || 0) < minEsperado
      ? "conversas_whatsapp nao populada apos 3 msgs do cliente — BUG C regrediu"
      : undefined,
  });

  // Cleanup pos-teste (independente de sucesso/falha)
  await limparPhoneSmoke();

  return await finalizar(steps, inicio, null);
}

async function finalizar(
  steps: StepResult[],
  inicio: number,
  motivoFalha: string | null,
): Promise<NextResponse> {
  await limparPhoneSmoke(); // cleanup final

  const duracaoTotal = Date.now() - inicio;
  const todosOk = steps.every((s) => s.ok);
  const stepsFalhos = steps.filter((s) => !s.ok);

  // Loga resultado (INV futura pode vigiar esse log pra detectar smoke parado)
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: todosOk ? "imuni_smoke_e2e_ok" : "imuni_smoke_e2e_falhou",
      duracao_ms: duracaoTotal,
      total_steps: steps.length,
      steps_ok: steps.filter((s) => s.ok).length,
      steps_falhos: stepsFalhos.length,
      detalhes: steps,
      motivo: motivoFalha,
    },
  });

  // Se falhou, alerta admins (estagio 3 IMUNI: avisa ANTES de cliente real ver)
  if (!todosOk) {
    const resumo = stepsFalhos
      .map((s, i) => `${i + 1}. *${s.step}*\n   esperado: ${s.esperado}\n   obtido: ${s.obtido}${s.erro ? `\n   erro: ${s.erro}` : ""}`)
      .join("\n\n");

    await notificarAdmins(
      "🚨 *IMUNI SMOKE E2E FALHOU*",
      "fluxo de cotacao quebrado",
      `O smoke sintetico detectou regressao no fluxo do bot ANTES de cliente real ver.\n\n*Steps que falharam:*\n${resumo}\n\n*Acao*: olhar deploy mais recente. Algo quebrou o fluxo "oi → 1 → localizacao".\n\nDuracao total: ${duracaoTotal}ms`,
    );
  }

  return NextResponse.json({
    ok: todosOk,
    duracao_ms: duracaoTotal,
    steps,
    motivo: motivoFalha,
  });
}
