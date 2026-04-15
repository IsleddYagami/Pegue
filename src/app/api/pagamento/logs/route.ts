import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Verifica logs de webhook do Mercado Pago
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== "P3gu32026@@") {
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
