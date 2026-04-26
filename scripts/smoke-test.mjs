#!/usr/bin/env node
/**
 * Smoke test pro webhook WhatsApp em produção.
 *
 * Roda múltiplos cenários simulando payloads do ChatPro e valida que o
 * webhook responde corretamente. Detecta bugs estruturais (404, 500,
 * fluxos quebrados) ANTES de precisar testar manualmente no celular.
 *
 * COM SUPABASE: também valida bot_sessions/bot_logs após cada step
 * (step certo, campos preenchidos, sem erros logados).
 *
 * NÃO testa:
 *  - UX visual (como mensagem renderiza no WhatsApp do cliente)
 *  - Latência real percebida pelo cliente
 *  - Imagens reais sendo baixadas pelo OpenAI Vision
 *
 * Uso:
 *   WEBHOOK_WHATSAPP_SECRET=xxx \
 *   NEXT_PUBLIC_SUPABASE_URL=xxx \
 *   SUPABASE_SERVICE_ROLE_KEY=xxx \
 *   node scripts/smoke-test.mjs
 *
 * Sem Supabase keys: roda mas pula validacoes de DB.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Auto-carrega .env.local da raiz do projeto se existir (sem dependencia extra)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}

const BASE_URL = process.env.BASE_URL || "https://www.chamepegue.com.br";
const SECRET = process.env.WEBHOOK_WHATSAPP_SECRET || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
// Numero de teste (NAO usar numero real de cliente; usar admin pra passar pelo modo manutencao)
const PHONE = process.env.TEST_PHONE || "5511971429605";

if (!SECRET) {
  console.error("❌ Falta WEBHOOK_WHATSAPP_SECRET no env");
  process.exit(1);
}

const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const WEBHOOK_URL_1 = `${BASE_URL}/api/whatsapp/webhook?secret=${encodeURIComponent(SECRET)}`;
const WEBHOOK_URL_2 = `${BASE_URL}/api/whatsapp/webhook?instance=2&secret=${encodeURIComponent(SECRET)}`;

let pass = 0;
let fail = 0;
const failures = [];

// ============================================================
// Helpers
// ============================================================

function makePayload({ text = "", lat = null, lng = null, isImage = false, imageUrl = null }) {
  const Type = isImage ? "received_image" : (lat ? "received_location" : "received_message");
  const Source = lat
    ? { message: { lat, lng, degreesLatitude: lat, degreesLongitude: lng } }
    : (isImage ? { message: { imageMessage: { url: imageUrl } } } : {});

  return {
    Type,
    Url: imageUrl,
    Body: {
      Text: text,
      Info: {
        RemoteJid: `${PHONE}@s.whatsapp.net`,
        FromMe: false,
        PushName: "Smoke Test",
        Source,
      },
    },
  };
}

async function call(url, payload) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const ms = Date.now() - t0;
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, ms, body: text.slice(0, 300), json };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, body: String(e), json: null, err: true };
  }
}

function check(label, condition, details = "") {
  if (condition) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    failures.push(`${label} ${details}`);
    console.log(`  ❌ ${label} ${details}`);
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("phone", PHONE)
    .maybeSingle();
  return data;
}

async function deleteSession() {
  if (!supabase) return;
  await supabase.from("bot_sessions").delete().eq("phone", PHONE);
}

async function countErrosRecentes(secondsAgo = 30) {
  if (!supabase) return null;
  const since = new Date(Date.now() - secondsAgo * 1000).toISOString();
  const { count } = await supabase
    .from("bot_logs")
    .select("id", { count: "exact", head: true })
    .gte("criado_em", since)
    .or("payload->>tipo.eq.vision_falhou,payload->>tipo.eq.vision_download_falhou,payload->>tipo.eq.chatpro_send_image_falhou,payload->>tipo.eq.erro_criar_corrida");
  return count ?? 0;
}

// ============================================================
// Cenários
// ============================================================

async function testAuth() {
  console.log("\n🔐 Auth");
  const bad = await fetch(`${BASE_URL}/api/whatsapp/webhook?secret=invalido`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Type: "received_message" }),
  });
  check("Secret invalido retorna 401", bad.status === 401, `(got ${bad.status})`);

  const sem = await fetch(`${BASE_URL}/api/whatsapp/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Type: "received_message" }),
  });
  check("Sem secret retorna 401", sem.status === 401, `(got ${sem.status})`);
}

async function testEventTypeIgnorado() {
  console.log("\n🚫 Tipos ignorados");
  const r = await call(WEBHOOK_URL_1, { Type: "evento_estranho", Body: { Text: "x" } });
  check("Evento desconhecido retorna 200 ignored", r.status === 200, `(got ${r.status})`);
  check("Status JSON = 'ignored_event'", r.json?.status === "ignored_event", `(got ${r.json?.status})`);
}

async function testFluxoCompleto() {
  console.log("\n💬 Fluxo completo (admin nao bloqueado por modo manutencao)");

  // Estado inicial limpo
  await deleteSession();
  if (supabase) {
    const sessionInicial = await getSession();
    check("Sessao inicial vazia (DELETE confirmou)", sessionInicial === null);
  }

  // 1. Saudacao -> deve criar sessao em step inicial
  let r = await call(WEBHOOK_URL_1, makePayload({ text: "oi" }));
  check("'oi' retorna 200", r.status === 200, `(${r.ms}ms)`);
  await sleep(500);
  if (supabase) {
    const s = await getSession();
    check("Sessao criada apos 'oi'", s !== null);
    check("Step apos 'oi' = 'aguardando_servico' ou 'inicio'",
      s?.step === "aguardando_servico" || s?.step === "inicio" || s?.step === "confirmar_contexto_inicial",
      `(step = ${s?.step})`
    );
  }

  // 2. Escolhe Pequenos Fretes
  r = await call(WEBHOOK_URL_1, makePayload({ text: "1" }));
  check("'1' retorna 200", r.status === 200, `(${r.ms}ms)`);
  await sleep(500);
  if (supabase) {
    const s = await getSession();
    check("Step apos '1' = 'aguardando_localizacao'",
      s?.step === "aguardando_localizacao",
      `(step = ${s?.step})`
    );
  }

  // 3. Palavra reservada como endereço
  r = await call(WEBHOOK_URL_1, makePayload({ text: "PRONTO" }));
  check("'PRONTO' retorna 200 (rejeitado amigavelmente)", r.status === 200, `(${r.ms}ms)`);
  await sleep(500);
  if (supabase) {
    const s = await getSession();
    check("Step continua 'aguardando_localizacao' apos PRONTO (nao avancou)",
      s?.step === "aguardando_localizacao",
      `(step = ${s?.step})`
    );
    check("origem_endereco continua null apos PRONTO",
      s?.origem_endereco === null || s?.origem_endereco === undefined,
      `(origem = ${s?.origem_endereco})`
    );
  }

  // 4. Endereco real (com geocoder)
  r = await call(WEBHOOK_URL_1, makePayload({ text: "Av Paulista, Bela Vista, Sao Paulo" }));
  check("Endereco real retorna 200", r.status === 200, `(${r.ms}ms)`);
  check("Latencia endereco < 8s", r.ms < 8000, `(${r.ms}ms — pode ser cold start)`);
  await sleep(1500); // geocoder pode demorar
  if (supabase) {
    const s = await getSession();
    check("Step apos endereco = 'confirmando_origem'",
      s?.step === "confirmando_origem",
      `(step = ${s?.step})`
    );
    check("origem_lat preenchido", typeof s?.origem_lat === "number");
    check("origem_lng preenchido", typeof s?.origem_lng === "number");
    check("origem_endereco contem 'Sao Paulo' ou 'São Paulo'",
      (s?.origem_endereco || "").toLowerCase().includes("sao paulo") ||
      (s?.origem_endereco || "").toLowerCase().includes("são paulo"),
      `(endereco = ${s?.origem_endereco})`
    );
  }

  // 5. Confirma origem
  r = await call(WEBHOOK_URL_1, makePayload({ text: "1" }));
  check("Confirmar origem retorna 200", r.status === 200, `(${r.ms}ms)`);
  await sleep(500);
  if (supabase) {
    const s = await getSession();
    check("Step apos confirmar origem = 'aguardando_foto'",
      s?.step === "aguardando_foto",
      `(step = ${s?.step})`
    );
  }

  // 6. Pede lista (digita "2")
  r = await call(WEBHOOK_URL_1, makePayload({ text: "2" }));
  check("'2' (lista) retorna 200", r.status === 200, `(${r.ms}ms)`);
  await sleep(300);

  // 7. Manda 3 itens da lista (geladeira, cama casal, sofa = 1, 8, 15)
  r = await call(WEBHOOK_URL_1, makePayload({ text: "1 8 15" }));
  check("Lista '1 8 15' retorna 200", r.status === 200, `(${r.ms}ms)`);
  await sleep(500);
  if (supabase) {
    const s = await getSession();
    check("Step apos itens = 'aguardando_destino'",
      s?.step === "aguardando_destino",
      `(step = ${s?.step})`
    );
    check("descricao_carga preenchida com 3 itens",
      (s?.descricao_carga || "").includes("Geladeira") &&
      (s?.descricao_carga || "").includes("Cama casal") &&
      (s?.descricao_carga || "").includes("Sofa"),
      `(carga = ${s?.descricao_carga})`
    );
    check("veiculo_sugerido preenchido (HR pra 3 itens grandes)",
      s?.veiculo_sugerido === "hr" || s?.veiculo_sugerido === "utilitario",
      `(veiculo = ${s?.veiculo_sugerido})`
    );
  }

  // 8. Manda destino
  r = await call(WEBHOOK_URL_1, makePayload({ text: "Rua Brasil, Centro, Osasco" }));
  check("Destino retorna 200", r.status === 200, `(${r.ms}ms)`);
  check("Latencia destino < 8s", r.ms < 8000, `(${r.ms}ms — geocoder)`);
  await sleep(1500);
  if (supabase) {
    const s = await getSession();
    check("Step apos destino = 'confirmando_destino'",
      s?.step === "confirmando_destino",
      `(step = ${s?.step})`
    );
    check("destino_lat preenchido", typeof s?.destino_lat === "number");
    check("destino_lng preenchido", typeof s?.destino_lng === "number");
  }

  // 9. Confirma destino
  r = await call(WEBHOOK_URL_1, makePayload({ text: "1" }));
  check("Confirmar destino retorna 200", r.status === 200, `(${r.ms}ms)`);
  await sleep(500);
  if (supabase) {
    const s = await getSession();
    check("Step apos confirmar destino avancou (aguardando_tipo_local ou similar)",
      s?.step !== "confirmando_destino",
      `(step = ${s?.step})`
    );
  }

  // 10. Tipo local origem (1 = terreo)
  r = await call(WEBHOOK_URL_1, makePayload({ text: "1" }));
  check("Tipo local origem (terreo) retorna 200", r.status === 200, `(${r.ms}ms)`);
  await sleep(500);

  // 11. Tipo local destino (1 = terreo)
  r = await call(WEBHOOK_URL_1, makePayload({ text: "1" }));
  check("Tipo local destino retorna 200", r.status === 200, `(${r.ms}ms)`);
  await sleep(800); // pode chamar IA pra desmontagem

  // 12. Ajudante (2 = sem ajudante) - aqui finalmente calcula cotacao
  r = await call(WEBHOOK_URL_1, makePayload({ text: "2" }));
  check("Ajudante 'sem' retorna 200", r.status === 200, `(${r.ms}ms)`);
  await sleep(1500); // calcula precos
  if (supabase) {
    const s = await getSession();
    check("distancia_km calculada apos ajudante",
      typeof s?.distancia_km === "number" && s.distancia_km > 5 && s.distancia_km < 60,
      `(distancia = ${s?.distancia_km})`
    );
  }

  // 13. Conta erros recentes (não deve ter)
  if (supabase) {
    const erros = await countErrosRecentes(180);
    check("Sem erros criticos nos ultimos 180s do fluxo end-to-end", erros === 0, `(erros = ${erros})`);
  }
}

async function testFluxoGuincho() {
  console.log("\n🚗 Fluxo Guincho (cliente escolhe opcao 3)");

  // Estado limpo
  await deleteSession();

  // 1. Saudacao
  let r = await call(WEBHOOK_URL_1, makePayload({ text: "oi" }));
  check("'oi' (guincho fluxo) retorna 200", r.status === 200);
  await sleep(500);

  // 2. Escolhe Guincho
  r = await call(WEBHOOK_URL_1, makePayload({ text: "3" }));
  check("'3' (Guincho) retorna 200", r.status === 200);
  await sleep(500);
  if (supabase) {
    const s = await getSession();
    check("Step apos '3' = 'guincho_categoria' OU 'aguardando_localizacao' (depende do toggle)",
      s?.step === "guincho_categoria" || s?.step === "aguardando_localizacao",
      `(step = ${s?.step})`
    );
  }

  // 3. Cleanup
  await deleteSession();
}

async function testInstance2() {
  console.log("\n📞 Instancia 2");
  const r = await call(WEBHOOK_URL_2, makePayload({ text: "ping inst2" }));
  check("Instance 2 retorna 200", r.status === 200, `(got ${r.status})`);
}

async function testAntiLoop() {
  console.log("\n🔁 Anti-loop (msg de bot externo)");
  const r = await call(
    WEBHOOK_URL_1,
    makePayload({ text: "Para falar com atendente digite 1\n1 Suporte\n2 Vendas" })
  );
  check("Mensagem de bot externo eh ignorada", r.status === 200, `(got ${r.status})`);
}

async function testGroupIgnore() {
  console.log("\n👥 Grupos ignorados");
  const payload = {
    Type: "received_message",
    Body: {
      Text: "oi",
      Info: { RemoteJid: "12345@g.us", FromMe: false },
    },
  };
  const r = await call(WEBHOOK_URL_1, payload);
  check("Grupo eh ignorado", r.status === 200, `(got ${r.status})`);
  check("Status = 'ignored'", r.json?.status === "ignored", `(got ${r.json?.status})`);
}

// ============================================================
// Run
// ============================================================

async function main() {
  console.log(`🧪 Smoke test contra ${BASE_URL}`);
  console.log(`   Phone teste: ${PHONE}`);
  console.log(`   Secret: ${SECRET.slice(0, 8)}...`);
  console.log(`   Supabase: ${supabase ? "✅ vai validar bot_sessions/bot_logs" : "⚠️ pulado (sem keys)"}`);

  const tStart = Date.now();
  await testAuth();
  await testEventTypeIgnorado();
  await testGroupIgnore();
  await testAntiLoop();
  await testInstance2();
  await testFluxoCompleto();
  await testFluxoGuincho();

  // Cleanup: apaga sessao de teste
  if (supabase) {
    await deleteSession();
    console.log("\n🧹 Cleanup: sessao de teste apagada");
  }

  const totalMs = Date.now() - tStart;

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Total: ${pass} pass, ${fail} fail (${totalMs}ms)`);
  if (failures.length > 0) {
    console.log("\nFalhas:");
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(2);
});
