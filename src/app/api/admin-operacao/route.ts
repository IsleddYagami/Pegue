import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/admin-operacao?key=ADMIN_KEY&dias=7
//
// Retorna estado AO VIVO da operacao Pegue:
// - Stats agregadas (corridas hoje, total valor, % concluidas, etc)
// - Lista de corridas dos ultimos N dias (default 7)
// - Por corrida: cliente, fretista, fotos, valores, pagamento, repasse
//
// Page /admin/operacao-real consome esse endpoint com auto-refresh.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const dias = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("dias") || "7"), 1), 30);
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
  const inicioHoje = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  // 1) Lista corridas dos ultimos N dias (com cliente + prestador via joins)
  const { data: corridas, error: errCor } = await supabase
    .from("corridas")
    .select(`
      id, codigo, status, criado_em, pago_em, entrega_em, cancelado_em,
      origem_endereco, destino_endereco, descricao_carga, distancia_km,
      tipo_servico, tipo_veiculo, periodo, qtd_ajudantes,
      valor_estimado, valor_final, valor_prestador, valor_pegue,
      cliente_id, prestador_id, motivo_cancelamento, rastreio_ativo,
      clientes(nome, telefone, nivel),
      prestadores!prestador_id(nome, telefone)
    `)
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(200);

  if (errCor) {
    return NextResponse.json({ error: "falha select corridas", detalhe: errCor.message }, { status: 500 });
  }

  const corridaIds = (corridas || []).map((c) => c.id);

  // 2) Provas digitais (fotos coleta/entrega) das corridas
  const { data: provas } = corridaIds.length
    ? await supabase
        .from("provas_digitais")
        .select("corrida_id, tipo, foto_url, criado_em")
        .in("corrida_id", corridaIds)
        .order("criado_em", { ascending: true })
    : { data: [] };

  // Indexa fotos por corrida
  const fotosByCorrida: Record<string, { coleta: string[]; entrega: string[] }> = {};
  (provas || []).forEach((p: any) => {
    if (!fotosByCorrida[p.corrida_id]) fotosByCorrida[p.corrida_id] = { coleta: [], entrega: [] };
    if (p.tipo === "coleta") fotosByCorrida[p.corrida_id].coleta.push(p.foto_url);
    else if (p.tipo === "entrega") fotosByCorrida[p.corrida_id].entrega.push(p.foto_url);
  });

  // 3) Pagamentos das corridas
  const { data: pagamentos } = corridaIds.length
    ? await supabase
        .from("pagamentos")
        .select("corrida_id, valor, metodo, status, repasse_status, pago_em, criado_em")
        .in("corrida_id", corridaIds)
        .order("criado_em", { ascending: false })
    : { data: [] };

  const pagamentosByCorrida: Record<string, any> = {};
  (pagamentos || []).forEach((p: any) => {
    if (!pagamentosByCorrida[p.corrida_id]) pagamentosByCorrida[p.corrida_id] = p; // mais recente
  });

  // 4) Avaliacoes das corridas
  const { data: avaliacoes } = corridaIds.length
    ? await supabase
        .from("avaliacoes")
        .select("corrida_id, nota, comentario, criado_em")
        .in("corrida_id", corridaIds)
    : { data: [] };

  const avaliacoesByCorrida: Record<string, any> = {};
  (avaliacoes || []).forEach((a: any) => {
    avaliacoesByCorrida[a.corrida_id] = a;
  });

  // 5) Stats agregadas
  const todas = corridas || [];
  const hoje = todas.filter((c) => c.criado_em >= inicioHoje);
  const concluidas = todas.filter((c) => c.status === "concluida");
  const ativas = todas.filter((c) => ["pendente", "aceita", "paga"].includes(c.status));
  const canceladas = todas.filter((c) => c.status === "cancelada" || c.status === "cancelada_teste");

  const stats = {
    total_periodo: todas.length,
    hoje: hoje.length,
    ativas: ativas.length,
    concluidas: concluidas.length,
    canceladas: canceladas.length,
    receita_periodo_brl: concluidas.reduce((s, c) => s + (Number(c.valor_final) || 0), 0),
    comissao_pegue_brl: concluidas.reduce((s, c) => s + (Number(c.valor_pegue) || 0), 0),
    repasse_fretistas_brl: concluidas.reduce((s, c) => s + (Number(c.valor_prestador) || 0), 0),
    repasses_pendentes: (pagamentos || []).filter((p: any) => p.repasse_status === "pendente").length,
    avaliacao_media:
      avaliacoes && avaliacoes.length > 0
        ? Math.round((avaliacoes.reduce((s: number, a: any) => s + (a.nota || 0), 0) / avaliacoes.length) * 10) / 10
        : null,
  };

  // 6) Monta resposta enxuta por corrida
  const corridasResposta = todas.map((c: any) => ({
    id: c.id,
    codigo: c.codigo,
    status: c.status,
    criado_em: c.criado_em,
    pago_em: c.pago_em,
    entrega_em: c.entrega_em,
    cliente: {
      nome: c.clientes?.nome || "—",
      telefone: c.clientes?.telefone,
    },
    fretista: c.prestadores
      ? {
          nome: c.prestadores.nome,
          telefone: c.prestadores.telefone,
        }
      : null,
    rota: {
      origem: c.origem_endereco,
      destino: c.destino_endereco,
      km: c.distancia_km,
    },
    carga: {
      descricao: c.descricao_carga,
      veiculo: c.tipo_veiculo,
      ajudantes: c.qtd_ajudantes,
    },
    data_servico: c.periodo,
    valores: {
      cliente: Number(c.valor_final) || 0,
      fretista: Number(c.valor_prestador) || 0,
      pegue: Number(c.valor_pegue) || 0,
    },
    fotos: fotosByCorrida[c.id] || { coleta: [], entrega: [] },
    pagamento: pagamentosByCorrida[c.id]
      ? {
          metodo: pagamentosByCorrida[c.id].metodo,
          status: pagamentosByCorrida[c.id].status,
          repasse: pagamentosByCorrida[c.id].repasse_status,
          pago_em: pagamentosByCorrida[c.id].pago_em,
        }
      : null,
    avaliacao: avaliacoesByCorrida[c.id]
      ? {
          nota: avaliacoesByCorrida[c.id].nota,
          comentario: avaliacoesByCorrida[c.id].comentario,
        }
      : null,
    rastreio_ativo: c.rastreio_ativo,
    motivo_cancelamento: c.motivo_cancelamento,
  }));

  return NextResponse.json({
    stats,
    corridas: corridasResposta,
    periodo: { dias, desde },
    gerado_em: new Date().toISOString(),
  });
}

// POST /api/admin-operacao
// Acoes admin: cancelar corrida, marcar repasse pago, etc
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !isValidAdminKey(body.key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const { acao, corrida_id } = body as { acao: string; corrida_id: string };
  if (!corrida_id) return NextResponse.json({ error: "corrida_id obrigatorio" }, { status: 400 });

  if (acao === "cancelar_corrida") {
    const { error } = await supabase
      .from("corridas")
      .update({
        status: "cancelada",
        cancelado_em: new Date().toISOString(),
        motivo_cancelamento: body.motivo || "Cancelado pelo admin via painel",
      })
      .eq("id", corrida_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (acao === "marcar_repasse_pago") {
    const { error } = await supabase
      .from("pagamentos")
      .update({ repasse_status: "pago", repasse_pago_em: new Date().toISOString() })
      .eq("corrida_id", corrida_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "acao invalida" }, { status: 400 });
}
