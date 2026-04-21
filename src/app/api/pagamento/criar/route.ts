import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { criarLinkPagamento } from "@/lib/mercadopago";
import { isValidAdminKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Cria link de pagamento para uma corrida
export async function POST(req: NextRequest) {
  try {
    const { corridaId, key } = await req.json();

    if (!isValidAdminKey(key)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
    }

    // Verifica se pagamento automatico esta habilitado
    const { data: config } = await supabase
      .from("configuracoes")
      .select("valor")
      .eq("chave", "pagamento_automatico_fretista")
      .single();

    if (!config || config.valor !== "habilitado") {
      return NextResponse.json({ error: "Pagamento automatico desabilitado" }, { status: 400 });
    }

    // Busca dados da corrida
    const { data: corrida } = await supabase
      .from("corridas")
      .select("*, clientes(nome, telefone, email)")
      .eq("id", corridaId)
      .single();

    if (!corrida) {
      return NextResponse.json({ error: "Corrida nao encontrada" }, { status: 404 });
    }

    const clienteNome = (corrida.clientes as any)?.nome || "Cliente";

    const { linkPagamento, preferenceId } = await criarLinkPagamento({
      corridaId,
      descricao: corrida.descricao_carga || "Frete",
      valor: corrida.valor_final || 0,
      clienteNome,
    });

    // Salva preferenceId na corrida
    await supabase
      .from("corridas")
      .update({ pin_entrega: preferenceId }) // Reutiliza campo pra guardar preferenceId
      .eq("id", corridaId);

    return NextResponse.json({ linkPagamento, preferenceId });
  } catch (error: any) {
    console.error("Erro criar pagamento:", error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
