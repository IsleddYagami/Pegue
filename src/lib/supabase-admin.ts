import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Cliente server-side com service_role key.
// Bypassa RLS. SO pode ser usado em route handlers, API routes e libs server.
// NUNCA importar em componentes com "use client" nem em pages.tsx.
//
// CAMADA 1 da defesa em profundidade (1/Mai/2026):
// Tipo generico <Database> faz TypeScript falhar em compile-time se alguem
// tentar acessar tabela ou coluna que nao existe no schema real do banco.
// Resolve a categoria #1 dos 40 bugs encontrados em auditoria (4 bugs de
// nome de coluna errado, ex: repasse_pago_em vs pago_em).
// Tipos auto-gerados em src/lib/database.types.ts a partir do OpenAPI
// real do Supabase. Re-rodar `node scripts/gerar-types-supabase.mjs`
// apos qualquer mudanca de schema.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL ausente no ambiente. " +
    "Configure as env vars antes de subir o servidor."
  );
}

export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
