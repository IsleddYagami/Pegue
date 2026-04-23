import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// GET /api/admin-prestador-veiculo?prestador_id=X&key=Y
// Lista veiculos do prestador
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const prestadorId = req.nextUrl.searchParams.get("prestador_id");
  if (!prestadorId) {
    return NextResponse.json({ error: "prestador_id obrigatorio" }, { status: 400 });
  }

  const { data } = await supabase
    .from("prestadores_veiculos")
    .select("id, tipo, marca, modelo, ano, placa, capacidade_kg, ativo, criado_em")
    .eq("prestador_id", prestadorId)
    .order("criado_em", { ascending: true });

  return NextResponse.json({ veiculos: data || [] });
}

// POST /api/admin-prestador-veiculo
// Body: { key, prestador_id, tipo, placa, marca?, modelo?, ano? }
// Cria novo veiculo pro prestador
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { prestador_id, tipo, placa, marca, modelo, ano } = body as {
      prestador_id: string;
      tipo: string;
      placa: string;
      marca?: string;
      modelo?: string;
      ano?: number;
    };

    if (!prestador_id || !tipo || !placa) {
      return NextResponse.json(
        { error: "prestador_id, tipo e placa sao obrigatorios" },
        { status: 400 }
      );
    }

    const tiposValidos = ["carro_comum", "utilitario", "hr", "caminhao_bau", "guincho", "moto_guincho"];
    if (!tiposValidos.includes(tipo)) {
      return NextResponse.json(
        { error: `tipo invalido. Use: ${tiposValidos.join(", ")}` },
        { status: 400 }
      );
    }

    // Verifica se placa ja existe em qualquer veiculo (pra evitar duplicata)
    const placaNormalizada = placa.toUpperCase().replace(/\s/g, "");
    const { data: jaExiste } = await supabase
      .from("prestadores_veiculos")
      .select("id, prestador_id, ativo")
      .eq("placa", placaNormalizada)
      .maybeSingle();

    if (jaExiste && jaExiste.ativo) {
      return NextResponse.json(
        { error: `Placa ${placaNormalizada} ja esta cadastrada em outro veiculo ativo` },
        { status: 409 }
      );
    }

    const { data: veiculo, error } = await supabase
      .from("prestadores_veiculos")
      .insert({
        prestador_id,
        tipo,
        placa: placaNormalizada,
        marca: marca || null,
        modelo: modelo || null,
        ano: ano || null,
        ativo: true,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: "ok", veiculo_id: veiculo?.id });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

// PATCH /api/admin-prestador-veiculo
// Body: { key, veiculo_id, ativo }
// Ativa/desativa veiculo
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { veiculo_id, ativo } = body as { veiculo_id: string; ativo: boolean };

    if (!veiculo_id) {
      return NextResponse.json({ error: "veiculo_id obrigatorio" }, { status: 400 });
    }

    await supabase
      .from("prestadores_veiculos")
      .update({ ativo: !!ativo })
      .eq("id", veiculo_id);

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

// DELETE /api/admin-prestador-veiculo?veiculo_id=X&key=Y
export async function DELETE(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const veiculoId = req.nextUrl.searchParams.get("veiculo_id");
  if (!veiculoId) {
    return NextResponse.json({ error: "veiculo_id obrigatorio" }, { status: 400 });
  }

  await supabase.from("prestadores_veiculos").delete().eq("id", veiculoId);

  return NextResponse.json({ status: "ok" });
}
