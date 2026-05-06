#!/usr/bin/env node
// Envia mensagem manual via ChatPro pra um phone especifico.
// Uso: node scripts/enviar-mensagem.mjs <phone> <instance> "<mensagem>"
// Ex:  node scripts/enviar-mensagem.mjs 5519983355000 1 "Oi, agradecemos!"

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}

const phoneArg = process.argv[2];
const instanceArg = parseInt(process.argv[3] || "1");
const messageArg = process.argv[4];

if (!phoneArg || !messageArg) {
  console.error("Uso: node scripts/enviar-mensagem.mjs <phone> <instance> \"<mensagem>\"");
  process.exit(1);
}

const digits = phoneArg.replace(/\D/g, "");
const phone = digits.length === 11 ? "55" + digits : digits;

const instance = instanceArg === 2 ? 2 : 1;
// Instance 1 usa CHATPRO_ENDPOINT (URL completa) + CHATPRO_TOKEN
// Instance 2 usa CHATPRO_INSTANCE_2 (so o ID, montamos URL) + CHATPRO_TOKEN_2
let endpoint;
let token;
if (instance === 2) {
  const inst2 = process.env.CHATPRO_INSTANCE_2;
  token = process.env.CHATPRO_TOKEN_2;
  if (!inst2 || !token) {
    console.error("Pegue 2 nao configurado (CHATPRO_INSTANCE_2 / CHATPRO_TOKEN_2)");
    process.exit(1);
  }
  endpoint = `https://v5.chatpro.com.br/${inst2}`;
} else {
  endpoint = process.env.CHATPRO_ENDPOINT;
  token = process.env.CHATPRO_TOKEN;
  if (!endpoint || !token) {
    console.error("Pegue 1 nao configurado (CHATPRO_ENDPOINT / CHATPRO_TOKEN)");
    process.exit(1);
  }
}

console.log(`\n→ Enviando pra ${phone} via Pegue ${instance}`);
console.log(`  Mensagem (${messageArg.length} chars):`);
console.log(`  ${messageArg.split("\n").map((l) => "  " + l).join("\n")}`);
console.log("");

const r = await fetch(`${endpoint}/api/v1/send_message`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: token },
  body: JSON.stringify({ number: phone, message: messageArg }),
});

const text = await r.text();
console.log(`  Status: ${r.status}`);
console.log(`  Resposta: ${text.slice(0, 500)}`);

if (!r.ok) {
  console.error("\n❌ Falhou.");
  process.exit(1);
}

console.log("\n✅ Enviado.");
