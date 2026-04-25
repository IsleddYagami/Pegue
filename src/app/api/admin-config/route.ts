import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// GET - busca todas configuracoes
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data } = await supabase
    .from("configuracoes")
    .select("*")
    .order("chave");

  return NextResponse.json(data || []);
}

// POST - altera uma configuracao
export async function POST(req: NextRequest) {
  try {
    // Rate limit + key via auth helper (usa query ?key=X ou header Authorization)
    const auth = await requireAdminAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { chave, valor } = await req.json();

    await supabase
      .from("configuracoes")
      .update({ valor, atualizado_em: new Date().toISOString() })
      .eq("chave", chave);

    return NextResponse.json({ status: "ok", chave, valor });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
