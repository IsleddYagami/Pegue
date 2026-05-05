#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PHONE_INPUT = process.argv[2] || "11953731463";
// normaliza: tira tudo nao-digito
const digits = PHONE_INPUT.replace(/\D/g, "");
const variants = new Set();
variants.add(digits);
if (digits.length === 11) variants.add("55" + digits);
if (digits.length === 13 && digits.startsWith("55")) variants.add(digits.slice(2));
const phones = Array.from(variants);
console.log(`\n=== INVESTIGANDO CLIENTE: ${PHONE_INPUT} ===`);
console.log(`Variantes testadas: ${phones.join(", ")}\n`);

// 1. SESSÃO ATUAL
console.log("─── 1. BOT_SESSIONS ───");
for (const p of phones) {
  const { data, error } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("phone", p)
    .maybeSingle();
  if (error) { console.log(`  [${p}] erro: ${error.message}`); continue; }
  if (data) {
    console.log(`  [${p}] ENCONTRADA:`);
    console.log(`    step: ${data.step}`);
    console.log(`    instance: ${data.instance_chatpro || "?"}`);
    console.log(`    silenciado_ate: ${data.silenciado_ate || "(não)"}`);
    console.log(`    criado_em: ${data.criado_em || "?"}`);
    console.log(`    atualizado_em: ${data.atualizado_em || "?"}`);
    if (data.contexto_ia) console.log(`    contexto_ia: ${JSON.stringify(data.contexto_ia).slice(0, 400)}`);
    if (data.dados_temp) console.log(`    dados_temp: ${JSON.stringify(data.dados_temp).slice(0, 400)}`);
    Object.keys(data).forEach((k) => {
      if (["phone","step","instance_chatpro","silenciado_ate","criado_em","atualizado_em","contexto_ia","dados_temp"].includes(k)) return;
      const v = data[k];
      if (v === null || v === undefined || v === "" || v === false) return;
      const display = typeof v === "object" ? JSON.stringify(v).slice(0, 200) : String(v).slice(0, 200);
      console.log(`    ${k}: ${display}`);
    });
  }
}

// 2. CLIENTE
console.log("\n─── 2. CLIENTES ───");
for (const p of phones) {
  const { data } = await supabase.from("clientes").select("*").eq("telefone", p).maybeSingle();
  if (data) {
    console.log(`  [${p}] ${data.nome || "(sem nome)"} | nivel=${data.nivel} | corridas=${data.total_corridas} | criado=${data.criado_em}`);
  }
}

// 3. CORRIDAS recentes
console.log("\n─── 3. CORRIDAS (últimas 10) ───");
for (const p of phones) {
  const { data: cliente } = await supabase.from("clientes").select("id").eq("telefone", p).maybeSingle();
  if (!cliente) continue;
  const { data, error } = await supabase
    .from("corridas")
    .select("id, codigo, status, valor_final, origem_endereco, destino_endereco, criado_em, atualizado_em")
    .eq("cliente_id", cliente.id)
    .order("criado_em", { ascending: false })
    .limit(10);
  if (error) { console.log(`  erro: ${error.message}`); continue; }
  if (!data || data.length === 0) { console.log(`  [${p}] nenhuma corrida`); continue; }
  for (const c of data) {
    console.log(`  ${c.codigo || c.id.slice(0,8)} | ${c.status} | R$${c.valor_final||"-"} | ${c.origem_endereco?.slice(0,40) || "?"} → ${c.destino_endereco?.slice(0,40) || "?"} | ${c.criado_em}`);
  }
}

// 4. BOT_LOGS recentes (últimas 24h)
console.log("\n─── 4. BOT_LOGS (últimas 24h, filtro telefone) ───");
const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const orFilter = phones.map((p) => `payload->>phone.eq.${p}`).concat(phones.map((p) => `payload->>telefone.eq.${p}`)).concat(phones.map((p) => `payload->>destinatario.eq.${p}`)).join(",");
const { data: logs, error: logErr } = await supabase
  .from("bot_logs")
  .select("id, criado_em, payload")
  .gte("criado_em", desde)
  .or(orFilter)
  .order("id", { ascending: false })
  .limit(80);
if (logErr) console.log(`  erro: ${logErr.message}`);
else {
  console.log(`  ${logs.length} logs encontrados`);
  for (const log of logs.reverse()) {
    const p = log.payload || {};
    const partes = [`[${log.criado_em}]`, `tipo=${p.tipo || "?"}`];
    if (p.step) partes.push(`step=${p.step}`);
    if (p.from_step) partes.push(`from=${p.from_step}`);
    if (p.to_step) partes.push(`to=${p.to_step}`);
    if (p.message) partes.push(`msg="${String(p.message).slice(0,60)}"`);
    if (p.text) partes.push(`text="${String(p.text).slice(0,60)}"`);
    if (p.erro) partes.push(`erro=${String(p.erro).slice(0,80)}`);
    if (p.error) partes.push(`error=${String(p.error).slice(0,80)}`);
    console.log("  " + partes.join(" | "));
  }
}

// 5. CONVERSAS_WHATSAPP (coluna correta = telefone)
console.log("\n─── 5. CONVERSAS_WHATSAPP (últimas 50, filtro telefone) ───");
const orPhones = phones.map((p) => `telefone.eq.${p}`).join(",");
const { data: conv, error: convErr } = await supabase
  .from("conversas_whatsapp")
  .select("id, telefone, direcao, tipo, conteudo, midia_url, criado_em")
  .or(orPhones)
  .order("criado_em", { ascending: false })
  .limit(50);
if (convErr) console.log(`  erro: ${convErr.message}`);
else if (!conv || conv.length === 0) console.log("  nenhuma");
else {
  console.log(`  ${conv.length} mensagens`);
  for (const c of conv.reverse()) {
    const dir = c.direcao === "in" ? "→bot " : c.direcao === "out" ? "→cli " : `[${c.direcao}] `;
    const corpo = c.tipo === "image" ? `[IMG ${c.midia_url?.slice(-30)}]` : (c.conteudo || "").replace(/\n/g," ").slice(0, 120);
    console.log(`  [${c.criado_em}] ${dir}${corpo}`);
  }
}

// 5b. BOT_LOGS amplo: pega TODOS os logs entre 12h e 14h30 e filtra texto/mascara do tel
console.log("\n─── 5b. BOT_LOGS busca textual + mask (12h-14h30 UTC hoje) ───");
const inicioJanela = new Date();
inicioJanela.setUTCHours(12, 0, 0, 0);
const fimJanela = new Date();
fimJanela.setUTCHours(14, 30, 0, 0);
const last4 = digits.slice(-4);
const masked = digits.replace(/\d(?=\d{4})/g, "*");
const { data: logsAmplo } = await supabase
  .from("bot_logs")
  .select("id, criado_em, payload")
  .gte("criado_em", inicioJanela.toISOString())
  .lte("criado_em", fimJanela.toISOString())
  .order("id", { ascending: true })
  .limit(5000);
if (logsAmplo) {
  const filtrados = logsAmplo.filter((l) => {
    const txt = JSON.stringify(l.payload || {});
    return phones.some((p) => txt.includes(p)) || txt.includes(masked) || (last4 && txt.includes(last4));
  });
  console.log(`  ${filtrados.length} logs (de ${logsAmplo.length} na janela) mencionam o telefone (raw OU mask)`);
  for (const log of filtrados) {
    const p = log.payload || {};
    const partes = [`[${log.criado_em}]`, `id=${log.id}`, `tipo=${p.tipo || "?"}`];
    for (const [k, v] of Object.entries(p)) {
      if (k === "tipo") continue;
      const display = typeof v === "string" ? v.slice(0, 100) : (v && typeof v === "object") ? JSON.stringify(v).slice(0,200) : String(v);
      partes.push(`${k}=${display}`);
    }
    console.log("  " + partes.join(" | "));
  }
}

// 6. INCIDENTES_ATENDIMENTO
console.log("\n─── 6. INCIDENTES_ATENDIMENTO (últimos 10) ───");
const { data: inc, error: incErr } = await supabase
  .from("incidentes_atendimento")
  .select("*")
  .or(orPhones)
  .order("criado_em", { ascending: false })
  .limit(10);
if (incErr) console.log(`  erro: ${incErr.message}`);
else if (!inc || inc.length === 0) console.log("  nenhum");
else for (const i of inc) console.log(`  [${i.criado_em}] tipo=${i.tipo} step=${i.step} status=${i.status} ${(i.descricao||"").slice(0,80)}`);

// 7. SENTRY: erros 24h pra contexto
console.log("\n─── 7. BOT_LOGS de ERRO (qualquer cliente, últimas 6h) ───");
const desde6h = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
const { data: erros } = await supabase
  .from("bot_logs")
  .select("id, criado_em, payload")
  .gte("criado_em", desde6h)
  .like("payload->>tipo", "%erro%")
  .order("id", { ascending: false })
  .limit(20);
if (erros && erros.length) {
  for (const e of erros) {
    const ph = e.payload?.phone || e.payload?.telefone || e.payload?.destinatario || "?";
    console.log(`  [${e.criado_em}] phone=${ph} tipo=${e.payload?.tipo} ${(e.payload?.erro || e.payload?.error || "").slice(0,100)}`);
  }
} else console.log("  nenhum");

console.log("\n=== FIM ===\n");
