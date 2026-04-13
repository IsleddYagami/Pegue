import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");

  if (!phone) {
    return NextResponse.json({ error: "Informe o telefone" }, { status: 400 });
  }

  // Busca prestador
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id, nome, score, total_corridas, status, disponivel")
    .eq("telefone", phone)
    .single();

  if (!prestador) {
    return NextResponse.json({ error: "Parceiro nao encontrado" }, { status: 404 });
  }

  // Busca veiculo
  const { data: veiculos } = await supabase
    .from("prestadores_veiculos")
    .select("tipo, placa")
    .eq("prestador_id", prestador.id)
    .eq("ativo", true)
    .limit(1);

  // Busca faturamento
  const { data: corridas } = await supabase
    .from("corridas")
    .select("valor_prestador")
    .eq("prestador_id", prestador.id)
    .eq("status", "concluida");

  const faturamento = corridas
    ? corridas.reduce((sum, c) => sum + (c.valor_prestador || 0), 0)
    : 0;

  return NextResponse.json({
    nome: prestador.nome,
    score: prestador.score || 5.0,
    totalFretes: prestador.total_corridas || 0,
    faturamento,
    status: prestador.status,
    disponivel: prestador.disponivel,
    veiculo: veiculos && veiculos.length > 0 ? veiculos[0] : null,
  });
}
