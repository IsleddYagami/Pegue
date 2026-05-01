import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// GET - busca top 20
export async function GET() {
  let { data, error } = await supabase
    .from("ranking_pegue_runner")
    .select("nome, score, distancia, entregas, criado_em")
    .order("distancia", { ascending: false })
    .limit(20);

  // Se falhar por coluna entregas nao existir, tenta sem
  if (error) {
    const retry = await supabase
      .from("ranking_pegue_runner")
      .select("nome, score, distancia, criado_em")
      .order("distancia", { ascending: false })
      .limit(20);
    data = retry.data as typeof data;
  }

  return NextResponse.json(data || []);
}

// POST - salva novo score
export async function POST(req: NextRequest) {
  try {
    const { nome, score, distancia, entregas } = await req.json();

    if (!nome || score === undefined || score === null) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    const nomeLimpo = nome.trim().substring(0, 20).replace(/[<>]/g, "");

    // Tenta salvar com entregas, se falhar tenta sem (coluna pode nao existir)
    const insertData: Record<string, unknown> = {
      nome: nomeLimpo,
      score: Math.floor(score),
      distancia: Math.floor(distancia || 0),
    };
    if (entregas !== undefined) insertData.entregas = Math.floor(entregas);

    // Cast intencional: insertData eh montado com campo opcional (entregas)
    // que pode ou nao existir no schema. Logica abaixo trata erro de
    // coluna inexistente.
    const { error: insertError } = await supabase.from("ranking_pegue_runner").insert(insertData as any);

    // Se falhar por causa da coluna entregas, tenta sem ela
    if (insertError && insertError.message?.includes("entregas")) {
      const { error: retryError } = await supabase.from("ranking_pegue_runner").insert({
        nome: nomeLimpo,
        score: Math.floor(score),
        distancia: Math.floor(distancia || 0),
      });
      if (retryError) throw retryError;
    } else if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
