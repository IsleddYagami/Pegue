import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET - busca todas configuracoes
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== "P3gu32026@@") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
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
    const { key, chave, valor } = await req.json();

    if (key !== "P3gu32026@@") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
    }

    await supabase
      .from("configuracoes")
      .update({ valor, atualizado_em: new Date().toISOString() })
      .eq("chave", chave);

    return NextResponse.json({ status: "ok", chave, valor });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
