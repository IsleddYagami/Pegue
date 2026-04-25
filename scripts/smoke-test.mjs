#!/usr/bin/env node
/**
 * Smoke test pro webhook WhatsApp em produção.
 *
 * Roda múltiplos cenários simulando payloads do ChatPro e valida que o
 * webhook responde corretamente. Detecta bugs estruturais (404, 500,
 * fluxos quebrados) ANTES de precisar testar manualmente no celular.
 *
 * NÃO testa:
 *  - UX visual (como mensagem renderiza no WhatsApp do cliente)
 *  - Latência real percebida pelo cliente
 *  - Imagens reais sendo baixadas pelo OpenAI Vision
 *
 * Uso:
 *   WEBHOOK_WHATSAPP_SECRET=xxx node scripts/smoke-test.mjs
 *   WEBHOOK_WHATSAPP_SECRET=xxx npm run smoke
 *
 * Opcional:
 *   BASE_URL=https://outra-url.com node scripts/smoke-test.mjs
 *   TEST_PHONE=5511999998888 node scripts/smoke-test.mjs  (default = numero teste)
 */

const BASE_URL = process.env.BASE_URL || "https://www.chamepegue.com.br";
const SECRET = process.env.WEBHOOK_WHATSAPP_SECRET || "";
// Numero de teste (NAO usar numero real de cliente; usar admin pra passar pelo modo manutencao)
const PHONE = process.env.TEST_PHONE || "5511971429605";

if (!SECRET) {
  console.error("❌ Falta WEBHOOK_WHATSAPP_SECRET no env");
  console.error("   Uso: WEBHOOK_WHATSAPP_SECRET=xxx node scripts/smoke-test.mjs");
  process.exit(1);
}

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

async function call(url, payload, label) {
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
  const r = await call(WEBHOOK_URL_1, { Type: "evento_estranho", Body: { Text: "x" } }, "estranho");
  check("Evento desconhecido retorna 200 ignored", r.status === 200, `(got ${r.status})`);
  check("Status JSON = 'ignored_event'", r.json?.status === "ignored_event", `(got ${r.json?.status})`);
}

async function testFluxoBasico() {
  console.log("\n💬 Fluxo basico (admin nao bloqueado por modo manutencao)");

  // 1. Saudacao
  let r = await call(WEBHOOK_URL_1, makePayload({ text: "oi" }), "oi");
  check("'oi' retorna 200", r.status === 200, `(${r.ms}ms, status ${r.status})`);

  await sleep(500);

  // 2. Escolhe Pequenos Fretes
  r = await call(WEBHOOK_URL_1, makePayload({ text: "1" }), "menu 1");
  check("'1' retorna 200", r.status === 200, `(${r.ms}ms, status ${r.status})`);

  await sleep(500);

  // 3. Tenta como endereço uma palavra reservada (deve ser bloqueado)
  r = await call(WEBHOOK_URL_1, makePayload({ text: "PRONTO" }), "palavra reservada");
  check("'PRONTO' como endereco retorna 200 (rejeitado amigavelmente)", r.status === 200, `(${r.ms}ms)`);

  await sleep(500);

  // 4. Endereco real (com geocoder)
  r = await call(WEBHOOK_URL_1, makePayload({ text: "Av Paulista, Bela Vista, Sao Paulo" }), "endereco real");
  check("Endereco real retorna 200", r.status === 200, `(${r.ms}ms)`);
  check("Latencia endereco < 8s", r.ms < 8000, `(${r.ms}ms — pode ser cold start)`);
}

async function testInstance2() {
  console.log("\n📞 Instancia 2");
  const r = await call(WEBHOOK_URL_2, makePayload({ text: "oi instance 2" }), "oi inst2");
  check("Instance 2 retorna 200", r.status === 200, `(got ${r.status})`);
}

async function testAntiLoop() {
  console.log("\n🔁 Anti-loop (msg de bot externo)");
  const r = await call(
    WEBHOOK_URL_1,
    makePayload({ text: "Para falar com atendente digite 1\n1 Suporte\n2 Vendas" }),
    "menu de bot externo"
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
  const r = await call(WEBHOOK_URL_1, payload, "grupo");
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

  const tStart = Date.now();
  await testAuth();
  await testEventTypeIgnorado();
  await testGroupIgnore();
  await testAntiLoop();
  await testInstance2();
  await testFluxoBasico();
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
