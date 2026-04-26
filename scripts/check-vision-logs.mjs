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

const { data, error } = await supabase
  .from("bot_logs")
  .select("id, criado_em, payload")
  .gte("criado_em", new Date(Date.now() - 10 * 60 * 1000).toISOString())
  .or("payload->>tipo.eq.vision_inicio,payload->>tipo.eq.vision_download_ok,payload->>tipo.eq.vision_download_falhou,payload->>tipo.eq.vision_openai_resposta,payload->>tipo.eq.vision_sem_json,payload->>tipo.eq.vision_json_invalido,payload->>tipo.eq.vision_sucesso,payload->>tipo.eq.vision_falhou,payload->>tipo.eq.vision_fallback_material_foto")
  .order("id", { ascending: false })
  .limit(30);

if (error) {
  console.error("Erro:", error);
  process.exit(1);
}

console.log(`\n${data.length} logs de Vision nos ultimos 10 min:\n`);
for (const log of data) {
  const p = log.payload;
  console.log(`[${log.id}] ${log.criado_em}`);
  console.log(`  tipo: ${p.tipo}`);
  for (const [k, v] of Object.entries(p)) {
    if (k === "tipo") continue;
    const display = typeof v === "string" && v.length > 200 ? v.slice(0, 200) + "..." : JSON.stringify(v);
    console.log(`  ${k}: ${display}`);
  }
  console.log("");
}
