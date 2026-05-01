#!/usr/bin/env node
// Gera tipos TypeScript a partir do schema real do Supabase usando o endpoint
// OpenAPI nativo do PostgREST. Sem precisar SUPABASE_ACCESS_TOKEN nem CLI
// extra — usa apenas SUPABASE_SERVICE_ROLE_KEY que ja temos no .env.local.
//
// Saida: src/lib/database.types.ts
//
// Como funciona:
//   GET /rest/v1/?apikey=... retorna OpenAPI 2.0 spec do banco
//   Pra cada tabela, lista colunas + tipos PG.
//   Mapeia tipos PG -> TS.
//
// Rodar: node scripts/gerar-types-supabase.mjs
//
// Depois disso, supabase-admin.ts usa createClient<Database>(...) e
// qualquer .from("tabela_errada") ou .select("coluna_errada") falha em
// compile-time. Resolve a categoria #1 dos 40 bugs (4 bugs latentes
// como repasse_pago_em -> pago_em).

import { readFileSync, existsSync, writeFileSync } from "node:fs";
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltam env vars NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

console.log("Buscando schema OpenAPI de", url);
const res = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
});
if (!res.ok) {
  console.error("Erro:", res.status, await res.text());
  process.exit(1);
}
const spec = await res.json();

// Mapa de tipos PostgREST -> TS
function pgToTs(prop) {
  const t = prop.type;
  const fmt = prop.format;
  if (t === "string") {
    if (fmt === "uuid") return "string";
    if (fmt === "timestamp with time zone" || fmt === "timestamp without time zone" || fmt === "timestamptz" || fmt === "date") return "string";
    if (fmt === "jsonb" || fmt === "json") return "any";
    return "string";
  }
  if (t === "integer" || t === "number") return "number";
  if (t === "boolean") return "boolean";
  if (t === "array") {
    const items = prop.items ? pgToTs(prop.items) : "any";
    return `${items}[]`;
  }
  return "any";
}

const definitions = spec.definitions || {};
const tabelas = Object.keys(definitions).sort();

console.log(`Encontradas ${tabelas.length} tabelas/views.`);

let out = `// AUTO-GERADO por scripts/gerar-types-supabase.mjs
// NAO EDITAR MANUALMENTE — re-rodar o script apos mudanca de schema.
//
// Esse arquivo eh a Camada 1 da defesa em profundidade contra bugs de
// schema. Permite createClient<Database>(...) — qualquer coluna ou tabela
// errada falha em compile time. Resolve categoria #1 dos 40 bugs do
// audit 1/Mai/2026 (repasse_pago_em vs pago_em, prestador_veiculos vs
// prestadores_veiculos, etc).
//
// Gerado a partir de ${url}
// Em ${new Date().toISOString()}

export interface Database {
  public: {
    Tables: {
`;

// PRAGMATISMO 1/Mai/2026: o objetivo dessa Camada 1 eh PEGAR NOMES DE
// TABELA E COLUNA ERRADOS (categoria 1 dos 40 bugs) em compile-time —
// nao validar nullability. Forcar nullability geraria 200+ erros em
// codigo legado que assume non-null com fallback. Isso seria trabalho
// de outra rodada.
//
// Solucao: gerar Row com tudo non-null (TS aceita atribuir null pra
// non-null em destructuring com fallback, e queremos focar em deteccao
// de schema). Insert/Update opcionais. Joins (clientes(...) etc) ficam
// como any porque Relationships=[].
for (const tabela of tabelas) {
  const def = definitions[tabela];
  const props = def.properties || {};
  out += `      ${tabela}: {\n`;
  out += `        Row: {\n`;
  for (const [col, prop] of Object.entries(props)) {
    const tsType = pgToTs(prop);
    out += `          ${col}: ${tsType};\n`;
  }
  out += `        };\n`;
  // Insert: todas opcionais
  out += `        Insert: {\n`;
  for (const [col, prop] of Object.entries(props)) {
    const tsType = pgToTs(prop);
    out += `          ${col}?: ${tsType} | null;\n`;
  }
  out += `        };\n`;
  // Update: todas opcionais
  out += `        Update: {\n`;
  for (const [col, prop] of Object.entries(props)) {
    const tsType = pgToTs(prop);
    out += `          ${col}?: ${tsType} | null;\n`;
  }
  out += `        };\n`;
  // Relationships exigido pelo supabase-js. Vazio = joins ficam any.
  out += `        Relationships: [];\n`;
  out += `      };\n`;
}

out += `    };\n`;
out += `    Views: {};\n`;
out += `    Functions: {};\n`;
out += `    Enums: {};\n`;
out += `  };\n`;
out += `}\n`;

const outPath = join(__dirname, "..", "src", "lib", "database.types.ts");
writeFileSync(outPath, out, "utf-8");
console.log(`OK — escrito em ${outPath}`);
console.log(`Total tabelas: ${tabelas.length}`);
console.log(`Tabelas: ${tabelas.join(", ")}`);
