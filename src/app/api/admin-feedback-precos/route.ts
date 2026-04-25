import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { invalidarCacheAjustes } from "@/lib/ajustes-precos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [{ data: feedbacks }, { data: regras }] = await Promise.all([
    supabase
      .from("feedback_precos")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(500),
    supabase
      .from("ajustes_precos")
      .select("*")
      .order("criado_em", { ascending: false }),
  ]);

  return NextResponse.json({
    feedbacks: feedbacks || [],
    regras: regras || [],
  });
}

// POST: { acao: "toggle" | "deletar", id: string }
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { acao, id, ativo } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  }

  if (acao === "toggle") {
    const { error } = await supabase
      .from("ajustes_precos")
      .update({ ativo: !ativo, atualizado_em: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invalidarCacheAjustes();
    return NextResponse.json({ status: "ok" });
  }

  if (acao === "deletar") {
    const { error } = await supabase
      .from("ajustes_precos")
      .delete()
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invalidarCacheAjustes();
    return NextResponse.json({ status: "ok" });
  }

  return NextResponse.json({ error: "acao invalida" }, { status: 400 });
}
