import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// GET: lista incidentes (filtra por status). Default: pendentes.
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const status = req.nextUrl.searchParams.get("status") || "pendente";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 200);

  const { data, error } = await supabase
    .from("incidentes_atendimento")
    .select("*")
    .eq("status", status)
    .order("criado_em", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST: aprovar/rejeitar/aplicar incidente (com observacao opcional).
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, acao, observacao } = await req.json();
  if (!id || !["aprovar", "rejeitar", "aplicar"].includes(acao)) {
    return NextResponse.json({ error: "parametros invalidos" }, { status: 400 });
  }

  const novoStatus = acao === "aprovar" ? "aprovado" : acao === "rejeitar" ? "rejeitado" : "aplicado";
  const { error } = await supabase
    .from("incidentes_atendimento")
    .update({
      status: novoStatus,
      aprovado_em: new Date().toISOString(),
      observacao_admin: observacao ? String(observacao).slice(0, 1000) : null,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok", novo_status: novoStatus });
}
