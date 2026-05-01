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
    .from("tabela_precos")
    .select("*")
    .eq("ativo", true)
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const { id, ...campos } = body;

  if (!id) {
    return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  }

  // Whitelist de campos editaveis
  const camposPermitidos = [
    "preco_base_km",
    "km_minimo",
    "valor_minimo",
    "mult_utilitario",
    "mult_van",
    "mult_caminhao_bau",
    "mult_caminhao_grande",
    "adicional_ajudante",
    "adicional_andar_escada",
    "mult_urgente",
    "mult_economica",
    "mult_padrao",
    "mult_premium",
    "comissao_percentual",
  ];

  const update: Record<string, any> = {};
  for (const k of camposPermitidos) {
    if (campos[k] !== undefined) update[k] = campos[k];
  }

  // Cast intencional: `update` eh montado dinamicamente via whitelist de
  // campos. Tipos do Supabase exigem shape exato; aqui o whitelist garante
  // que nao vai ter campo invalido. Cast pra any preserva validacao runtime.
  const { error } = await supabase
    .from("tabela_precos")
    .update(update as any)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
