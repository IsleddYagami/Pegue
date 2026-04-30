import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { invalidarCacheAjustes, criteriosMediaDaSimulacao } from "@/lib/ajustes-precos";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [{ data: feedbacks }, { data: regras }] = await Promise.all([
    supabase
      .from("feedback_precos")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(500),
    supabase
      .from("ajustes_precos")
      .select("*")
      .order("criado_em", { ascending: false }),
  ]);

  return NextResponse.json({
    feedbacks: feedbacks || [],
    regras: regras || [],
  });
}

// POST: { acao: "toggle" | "deletar", id: string }
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { acao, id, ativo } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  }

  if (acao === "toggle") {
    const { error } = await supabase
      .from("ajustes_precos")
      .update({ ativo: !ativo, atualizado_em: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invalidarCacheAjustes();
    return NextResponse.json({ status: "ok" });
  }

  if (acao === "deletar") {
    const { error } = await supabase
      .from("ajustes_precos")
      .delete()
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invalidarCacheAjustes();
    return NextResponse.json({ status: "ok" });
  }

  // Cria uma regra de ajuste a partir de um feedback existente.
  // Espelha a logica do "aplicar ajuste" durante o AVALIAR no WhatsApp,
  // mas dispara da pagina /admin/feedback-precos (revisao pos-fato).
  if (acao === "criar_regra_de_feedback") {
    const { data: fb, error: errBuscar } = await supabase
      .from("feedback_precos")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (errBuscar || !fb) {
      return NextResponse.json({ error: "feedback nao encontrado" }, { status: 404 });
    }
    if (!fb.preco_pegue || fb.preco_pegue <= 0) {
      return NextResponse.json({ error: "preco_pegue invalido" }, { status: 400 });
    }

    const fator = fb.preco_sugerido / fb.preco_pegue;
    const gapPct = ((fb.preco_sugerido - fb.preco_pegue) / fb.preco_pegue) * 100;

    const criterios = criteriosMediaDaSimulacao({
      veiculo: fb.veiculo,
      rota: { km: fb.distancia_km, zonaDestino: fb.zona },
      qtdItens: fb.qtd_itens,
      temAjudante: !!fb.tem_ajudante,
    });

    const descricao = `Criado de feedback ${fb.id.slice(0, 8)} (${fb.fretista_nome || fb.fretista_phone}) — gap ${gapPct.toFixed(1)}%`;

    const { error: errInsert } = await supabase.from("ajustes_precos").insert({
      veiculo: criterios.veiculo,
      zona: criterios.zona,
      km_min: criterios.km_min,
      km_max: criterios.km_max,
      qtd_itens_min: criterios.qtd_itens_min,
      qtd_itens_max: criterios.qtd_itens_max,
      com_ajudante: criterios.com_ajudante,
      fator_multiplicador: fator,
      valor_fixo: 0,
      descricao,
      ativo: true,
    });

    if (errInsert) {
      return NextResponse.json({ error: errInsert.message }, { status: 500 });
    }

    invalidarCacheAjustes();
    return NextResponse.json({ status: "ok", fator, gapPct, criterios });
  }

  return NextResponse.json({ error: "acao invalida" }, { status: 400 });
}
