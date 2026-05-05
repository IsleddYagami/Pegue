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
const CHATPRO_INSTANCE = instance === 2
  ? process.env.CHATPRO_INSTANCE_2
  : process.env.CHATPRO_INSTANCE;
const CHATPRO_TOKEN = instance === 2
  ? process.env.CHATPRO_TOKEN_2
  : process.env.CHATPRO_TOKEN;

if (!CHATPRO_INSTANCE || !CHATPRO_TOKEN) {
  console.error(`ChatPro instance=${instance} nao configurada (env vars CHATPRO_INSTANCE${instance === 2 ? "_2" : ""} / CHATPRO_TOKEN${instance === 2 ? "_2" : ""})`);
  process.exit(1);
}

const endpoint = `https://v5.chatpro.com.br/${CHATPRO_INSTANCE}`;

console.log(`\n→ Enviando pra ${phone} via Pegue ${instance}`);
console.log(`  Mensagem (${messageArg.length} chars):`);
console.log(`  ${messageArg.split("\n").map((l) => "  " + l).join("\n")}`);
console.log("");

const r = await fetch(`${endpoint}/api/v1/send_message`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: CHATPRO_TOKEN },
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
