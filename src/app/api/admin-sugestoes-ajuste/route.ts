import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { invalidarCacheAjustes } from "@/lib/ajustes-precos";
import { analisarClusters, type FeedbackBruto } from "@/lib/analisar-clusters-feedback";

export const dynamic = "force-dynamic";

// GET: analisa avaliacoes existentes, retorna clusters/sugestoes ranqueados.
// Parametros opcionais:
//   minAvaliacoes (default 3)
//   minGapAbsoluto (default 5)
//   minConcordancia (default 70)
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const minAvaliacoes = Number(req.nextUrl.searchParams.get("minAvaliacoes")) || 3;
  const minGapAbsoluto = Number(req.nextUrl.searchParams.get("minGapAbsoluto")) || 5;
  const minConcordancia = Number(req.nextUrl.searchParams.get("minConcordancia")) || 70;

  const { data: feedbacks, error } = await supabase
    .from("feedback_precos")
    .select("id,veiculo,zona,distancia_km,qtd_itens,tem_ajudante,preco_pegue,preco_sugerido,gap_percentual,fretista_phone,fretista_nome,criado_em")
    .order("criado_em", { ascending: false })
    .limit(2000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sugestoes = analisarClusters((feedbacks || []) as FeedbackBruto[], {
    minAvaliacoes,
    minGapAbsoluto,
    minConcordancia,
  });

  return NextResponse.json({
    total_feedbacks_analisados: (feedbacks || []).length,
    parametros: { minAvaliacoes, minGapAbsoluto, minConcordancia },
    sugestoes,
  });
}

// POST: aplica uma sugestao como regra em ajustes_precos.
// Body: {
//   veiculo, zona, km_min, km_max, qtd_itens_min, qtd_itens_max, com_ajudante,
//   fator_multiplicador, descricao_extra?
// }
export async function POST(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const obrigatorios = ["veiculo", "zona", "km_min", "km_max", "qtd_itens_min", "qtd_itens_max", "com_ajudante", "fator_multiplicador"];
  for (const k of obrigatorios) {
    if (body[k] === undefined || body[k] === null) {
      return NextResponse.json({ error: `parametro obrigatorio: ${k}` }, { status: 400 });
    }
  }

  if (typeof body.fator_multiplicador !== "number" || body.fator_multiplicador <= 0 || body.fator_multiplicador > 5) {
    return NextResponse.json({ error: "fator_multiplicador fora do intervalo razoavel (0-5)" }, { status: 400 });
  }

  const descricao = body.descricao_extra || `Sugestao automatica baseada em cluster de avaliacoes`;

  const { error } = await supabase.from("ajustes_precos").insert({
    veiculo: body.veiculo,
    zona: body.zona,
    km_min: body.km_min,
    km_max: body.km_max,
    qtd_itens_min: body.qtd_itens_min,
    qtd_itens_max: body.qtd_itens_max,
    com_ajudante: !!body.com_ajudante,
    fator_multiplicador: body.fator_multiplicador,
    valor_fixo: 0,
    descricao,
    ativo: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidarCacheAjustes();
  return NextResponse.json({ status: "ok" });
}
