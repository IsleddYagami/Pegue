import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Verifica logs de webhook do Mercado Pago
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data } = await supabase
    .from("bot_logs")
    .select("*")
    .contains("payload", { tipo: "webhook_mercadopago" })
    .order("criado_em", { ascending: false })
    .limit(10);

  return NextResponse.json({
    total: data?.length || 0,
    logs: data || [],
  });
}
