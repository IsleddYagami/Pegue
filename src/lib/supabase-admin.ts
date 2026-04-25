import { createClient } from "@supabase/supabase-js";

// Cliente server-side com service_role key.
// Bypassa RLS. SO pode ser usado em route handlers, API routes e libs server.
// NUNCA importar em componentes com "use client" nem em pages.tsx.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL ausente no ambiente. " +
    "Configure as env vars antes de subir o servidor."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
