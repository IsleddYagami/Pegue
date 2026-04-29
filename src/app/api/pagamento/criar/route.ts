import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
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

    // Salva preferenceId no campo dedicado asaas_payment_id (libera pin_entrega
    // pra ser PIN real de 4 digitos - migration 29/Abr).
    await supabase
      .from("corridas")
      .update({ asaas_payment_id: preferenceId })
      .eq("id", corridaId);

    return NextResponse.json({ linkPagamento, preferenceId });
  } catch (error: any) {
    console.error("Erro criar pagamento:", error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
