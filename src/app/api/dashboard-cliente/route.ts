import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");

  if (!phone) {
    return NextResponse.json({ error: "Informe o telefone" }, { status: 400 });
  }

  // Busca cliente
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome, telefone, nivel, total_corridas, nota_media")
    .eq("telefone", phone)
    .single();

  if (!cliente) {
    return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
  }

  // Busca corridas do cliente
  const { data: corridas } = await supabase
    .from("corridas")
    .select("id, origem_endereco, destino_endereco, descricao_carga, valor_final, status, periodo, criado_em, prestador_id, prestadores(nome, telefone)")
    .eq("cliente_id", cliente.id)
    .order("criado_em", { ascending: false });

  const todasCorridas = corridas || [];
  const corridasConcluidas = todasCorridas.filter(c => c.status === "concluida");

  // Total gasto
  const totalGasto = corridasConcluidas.reduce((sum, c) => sum + (c.valor_final || 0), 0);

  // Fretistas que ja atenderam (favoritos)
  const fretistasMap: Record<string, { nome: string; telefone: string; qtd: number }> = {};
  corridasConcluidas.forEach(c => {
    const prest = c.prestadores as any;
    if (prest?.nome) {
      const key = prest.telefone || prest.nome;
      if (!fretistasMap[key]) {
        fretistasMap[key] = { nome: prest.nome, telefone: prest.telefone, qtd: 0 };
      }
      fretistasMap[key].qtd++;
    }
  });
  const fretistasFrequentes = Object.values(fretistasMap)
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 5);

  // Historico
  const historico = todasCorridas.slice(0, 10).map(c => {
    const prest = c.prestadores as any;
    return {
      origem: c.origem_endereco || "---",
      destino: c.destino_endereco || "---",
      carga: c.descricao_carga || "---",
      valor: c.valor_final || 0,
      data: c.periodo || new Date(c.criado_em).toLocaleDateString("pt-BR"),
      status: c.status,
      fretista: prest?.nome || null,
    };
  });

  // Frete em andamento
  const freteAtivo = todasCorridas.find(c =>
    ["pendente", "aceita", "paga"].includes(c.status)
  );

  return NextResponse.json({
    nome: cliente.nome || "Cliente",
    nivel: cliente.nivel || "bronze",
    totalServicos: corridasConcluidas.length,
    totalGasto,
    fretistasFrequentes,
    historico,
    freteAtivo: freteAtivo ? {
      destino: freteAtivo.destino_endereco,
      carga: freteAtivo.descricao_carga,
      status: freteAtivo.status,
      valor: freteAtivo.valor_final,
    } : null,
  });
}
