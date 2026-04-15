import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET - busca top 20
export async function GET() {
  const { data } = await supabase
    .from("ranking_pegue_runner")
    .select("nome, score, distancia, entregas, criado_em")
    .order("score", { ascending: false })
    .limit(20);

  return NextResponse.json(data || []);
}

// POST - salva novo score
export async function POST(req: NextRequest) {
  try {
    const { nome, score, distancia, entregas } = await req.json();

    if (!nome || !score) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    const nomeLimpo = nome.trim().substring(0, 20).replace(/[<>]/g, "");

    const insertData: Record<string, unknown> = {
      nome: nomeLimpo,
      score: Math.floor(score),
      distancia: Math.floor(distancia),
    };
    if (entregas !== undefined) insertData.entregas = Math.floor(entregas);

    await supabase.from("ranking_pegue_runner").insert(insertData);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
