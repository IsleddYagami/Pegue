import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Verifica logs de webhook do Mercado Pago
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
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
