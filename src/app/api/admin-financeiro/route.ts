import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { consultarSaldoAsaas, asaasStatus } from "@/lib/asaas";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Consulta saldo Asaas em paralelo com pagamentos pra nao bloquear.
  // Falha silenciosa: se Asaas indisponivel, retorna saldo=null.
  const [pagamentosRes, saldoRes] = await Promise.allSettled([
    supabase
      .from("pagamentos")
      .select(
        "id, corrida_id, valor, metodo, status, repasse_status, pago_em, criado_em, corrida:corridas(codigo, valor_pegue, valor_prestador, prestador:prestadores(nome))"
      )
      .order("criado_em", { ascending: false })
      .limit(20),
    consultarSaldoAsaas(),
  ]);

  if (pagamentosRes.status === "rejected" || pagamentosRes.value.error) {
    const errMsg = pagamentosRes.status === "rejected"
      ? pagamentosRes.reason?.message
      : pagamentosRes.value.error?.message;
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  const status = asaasStatus();
  const asaasInfo = {
    configured: status.configured,
    ambiente: status.api_key_tipo,
    saldo: saldoRes.status === "fulfilled" && saldoRes.value.ok ? saldoRes.value.saldo : null,
    saldo_erro: saldoRes.status === "fulfilled" && !saldoRes.value.ok ? "consulta_falhou" : null,
  };

  return NextResponse.json({
    pagamentos: pagamentosRes.value.data || [],
    asaas: asaasInfo,
  });
}

// Aprova repasse manual: marca pagamento como repasse_status="pago"
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id, acao } = await req.json();

  if (!id || acao !== "aprovar_repasse") {
    return NextResponse.json({ error: "parametros invalidos" }, { status: 400 });
  }

  // BUG #BATCH4-5 (re-audit 1/Mai/2026): coluna correta eh `pago_em`. O codigo
  // antigo escrevia em `repasse_pago_em` que nao existe no schema — Supabase
  // ignora silenciosamente, repasse_status virava "pago" mas o timestamp
  // ficava NULL. Conferido em types.ts e webhook Asaas que usam pago_em.
  const { error } = await supabase
    .from("pagamentos")
    .update({
      repasse_status: "pago",
      pago_em: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
