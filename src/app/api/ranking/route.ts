import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET - busca top 20
export async function GET() {
  const { data } = await supabase
    .from("ranking_pegue_runner")
    .select("nome, score, distancia, criado_em")
    .order("score", { ascending: false })
    .limit(20);

  return NextResponse.json(data || []);
}

// POST - salva novo score
export async function POST(req: NextRequest) {
  try {
    const { nome, score, distancia } = await req.json();

    if (!nome || !score) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    // Limita nome a 20 chars e sanitiza
    const nomeLimpo = nome.trim().substring(0, 20).replace(/[<>]/g, "");

    await supabase.from("ranking_pegue_runner").insert({
      nome: nomeLimpo,
      score: Math.floor(score),
      distancia: Math.floor(distancia),
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
