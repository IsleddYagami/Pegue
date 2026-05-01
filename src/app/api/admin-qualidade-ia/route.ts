import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// GET /api/admin-qualidade-ia
//   Retorna stats agregados pra dashboard:
//     - taxa_global: media taxa_acerto dos ultimos 30d
//     - por_campo: % acerto por cada campo (origem, destino, veiculo, etc)
//     - top_divergencias: top 10 padroes de erro (input -> IA -> real)
//     - serie_30d: array com taxa diaria pros ultimos 30 dias (sparkline)
//     - amostras: ultimas 20 medicoes individuais
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const desde = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

  const { data: medicoes, error } = await supabase
    .from("qualidade_extracao_ia")
    .select("id, corrida_id, mensagem_original, extracao_ia, valores_finais, campos_corretos, campos_incorretos, taxa_acerto, custo_usd, criado_em")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Medicao = NonNullable<typeof medicoes>[number];
  const linhas = (medicoes || []) as Medicao[];

  if (linhas.length === 0) {
    return NextResponse.json({
      total_medicoes: 0,
      taxa_global: null,
      por_campo: {},
      top_divergencias: [],
      serie_30d: [],
      amostras: [],
      motivo: "sem dados ainda — cron medir-qualidade-ia roda 1x/dia",
    });
  }

  // === Taxa global (media de taxa_acerto) ===
  const taxaGlobal = linhas.reduce((s, l) => s + Number(l.taxa_acerto || 0), 0) / linhas.length;

  // === Acerto por campo: pra cada campo, conta acertos vs total avaliado ===
  const camposEstatisticas: Record<string, { acertos: number; total: number }> = {};
  for (const l of linhas) {
    for (const c of (l.campos_corretos || []) as string[]) {
      if (!camposEstatisticas[c]) camposEstatisticas[c] = { acertos: 0, total: 0 };
      camposEstatisticas[c].acertos++;
      camposEstatisticas[c].total++;
    }
    for (const c of (l.campos_incorretos || []) as string[]) {
      if (!camposEstatisticas[c]) camposEstatisticas[c] = { acertos: 0, total: 0 };
      camposEstatisticas[c].total++;
    }
  }
  const porCampo: Record<string, { acertos: number; total: number; taxa: number }> = {};
  for (const [campo, st] of Object.entries(camposEstatisticas)) {
    porCampo[campo] = {
      ...st,
      taxa: st.total > 0 ? Math.round((st.acertos / st.total) * 1000) / 1000 : 0,
    };
  }

  // === Top divergencias: agrupa erros por (campo + valor IA + valor real) ===
  // Diferente do simples "top campos errados" — mostra PADROES recorrentes
  // tipo "IA disse 'utilitario' mas real era 'carro_comum'" repetiu 5x.
  const divergencias: Map<string, { campo: string; ia: any; real: any; qtd: number; exemplos: string[] }> = new Map();

  for (const l of linhas) {
    const ia = (l.extracao_ia || {}) as any;
    const real = (l.valores_finais || {}) as any;
    for (const campo of (l.campos_incorretos || []) as string[]) {
      // Mapeia campo -> qual valor olhar em ia/real
      const valIA = pegarValorIA(campo, ia);
      const valReal = pegarValorReal(campo, real);
      const chave = `${campo}|${JSON.stringify(valIA)}|${JSON.stringify(valReal)}`;
      if (!divergencias.has(chave)) {
        divergencias.set(chave, { campo, ia: valIA, real: valReal, qtd: 0, exemplos: [] });
      }
      const d = divergencias.get(chave)!;
      d.qtd++;
      if (d.exemplos.length < 3 && l.mensagem_original) {
        d.exemplos.push(String(l.mensagem_original).slice(0, 150));
      }
    }
  }
  const topDivergencias = [...divergencias.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 15);

  // === Serie 30d (taxa media por dia) ===
  const porDia: Map<string, { soma: number; qtd: number }> = new Map();
  for (const l of linhas) {
    const dia = String(l.criado_em).slice(0, 10);
    if (!porDia.has(dia)) porDia.set(dia, { soma: 0, qtd: 0 });
    const d = porDia.get(dia)!;
    d.soma += Number(l.taxa_acerto || 0);
    d.qtd++;
  }
  const serie30d = [...porDia.entries()]
    .map(([dia, st]) => ({ dia, taxa: st.qtd > 0 ? st.soma / st.qtd : 0, qtd: st.qtd }))
    .sort((a, b) => a.dia.localeCompare(b.dia));

  // === Amostras: ultimas 20 medicoes pra inspecao ===
  const amostras = linhas.slice(0, 20).map((l) => ({
    id: l.id,
    corrida_id: l.corrida_id,
    mensagem_original: l.mensagem_original,
    taxa_acerto: l.taxa_acerto,
    campos_corretos: l.campos_corretos,
    campos_incorretos: l.campos_incorretos,
    extracao_ia: l.extracao_ia,
    valores_finais: l.valores_finais,
    criado_em: l.criado_em,
  }));

  return NextResponse.json({
    total_medicoes: linhas.length,
    taxa_global: Math.round(taxaGlobal * 1000) / 1000,
    por_campo: porCampo,
    top_divergencias: topDivergencias,
    serie_30d: serie30d,
    amostras,
  });
}

function pegarValorIA(campo: string, ia: any): any {
  switch (campo) {
    case "servico": return ia.servico;
    case "origem": return ia.origem_texto;
    case "destino": return ia.destino_texto;
    case "veiculo": return ia.veiculo_sugerido;
    case "ajudante": return ia.precisa_ajudante;
    case "andar": return ia.andar_origem;
    case "escada": return ia.tem_escada_origem;
    case "elevador": return ia.tem_elevador_destino;
    case "itens": return ia.itens;
    case "veiculo_marca": return ia.veiculo_marca_modelo;
    case "periodo": return ia.periodo;
    default: return null;
  }
}

function pegarValorReal(campo: string, real: any): any {
  switch (campo) {
    case "servico": return real.tipo_servico;
    case "origem": return real.origem_endereco;
    case "destino": return real.destino_endereco;
    case "veiculo": return real.tipo_veiculo;
    case "ajudante": return (real.qtd_ajudantes || 0) > 0;
    case "andar": return real.andares_origem;
    case "escada": return !!real.escada_origem;
    case "elevador": return !!real.elevador_destino;
    case "itens": return real.descricao_carga;
    case "veiculo_marca": return real.descricao_carga;
    case "periodo": return real.periodo;
    default: return null;
  }
}
