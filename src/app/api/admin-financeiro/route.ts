import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabase
    .from("pagamentos")
    .select(
      "id, corrida_id, valor, metodo, status, repasse_status, pago_em, criado_em, corrida:corridas(codigo, valor_pegue, valor_prestador, prestador:prestadores(nome))"
    )
    .order("criado_em", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// Aprova repasse manual: marca pagamento como repasse_status="pago"
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id, acao } = await req.json();

  if (!id || acao !== "aprovar_repasse") {
    return NextResponse.json({ error: "parametros invalidos" }, { status: 400 });
  }

  const { error } = await supabase
    .from("pagamentos")
    .update({
      repasse_status: "pago",
      repasse_pago_em: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
