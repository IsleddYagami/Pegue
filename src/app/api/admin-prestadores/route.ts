import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// GET: lista todos prestadores com veiculos
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await supabase
    .from("prestadores")
    .select("*, prestador_veiculos(tipo, placa)")
    .order("criado_em", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// POST: { id, acao: "aprovar" | "bloquear" }
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id, acao } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  }

  const novoStatus = acao === "aprovar" ? "aprovado" : acao === "bloquear" ? "bloqueado" : null;
  if (!novoStatus) {
    return NextResponse.json({ error: "acao invalida" }, { status: 400 });
  }

  const { error } = await supabase
    .from("prestadores")
    .update({ status: novoStatus })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", novoStatus });
}
