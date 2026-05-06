import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/admin-imuni-funil?key=ADMIN_KEY
//
// Retorna estado AO VIVO do funil de atendimento — quantos clientes
// estao em cada step, ha quanto tempo, e onde estao os gargalos.
//
// Onda 7 IMUNI (6/Mai/2026) — dashboard de saude do fluxo.
// Razao Fabio 5/Mai: "ai nesta parte as pessoas travam, mata a empresa".
// Esse endpoint expoe ONDE as pessoas estao travando AGORA, em vez de
// IMUNI so dizer "tudo ok" sem mostrar onde estao os clientes.

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // 1) Sessoes ativas (atualizadas nas ultimas 24h) agrupadas por step
  const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: sessoesAtivas, error: errS } = await supabase
    .from("bot_sessions")
    .select("phone, step, criado_em, atualizado_em, msgs_contador")
    .gte("atualizado_em", desde24h);

  if (errS) {
    return NextResponse.json({ error: errS.message }, { status: 500 });
  }

  // 2) Agrupa por step
  type StepInfo = {
    step: string;
    qtd_clientes: number;
    tempo_medio_min: number;
    tempo_max_min: number;
    msgs_medio: number;
    presos_30min: number; // quantos estao parados >30min
  };

  const porStep = new Map<string, {
    count: number;
    tempos: number[];
    msgs: number[];
    presos30: number;
  }>();

  const agora = Date.now();
  for (const s of sessoesAtivas || []) {
    const step = (s.step as string) || "(sem step)";
    const tempoMin = (agora - new Date(s.atualizado_em as string).getTime()) / 60000;
    const msgs = Number(s.msgs_contador || 0);

    if (!porStep.has(step)) {
      porStep.set(step, { count: 0, tempos: [], msgs: [], presos30: 0 });
    }
    const info = porStep.get(step)!;
    info.count++;
    info.tempos.push(tempoMin);
    info.msgs.push(msgs);
    if (tempoMin > 30) info.presos30++;
  }

  const steps: StepInfo[] = Array.from(porStep.entries())
    .map(([step, info]) => ({
      step,
      qtd_clientes: info.count,
      tempo_medio_min: Math.round(info.tempos.reduce((a, b) => a + b, 0) / info.tempos.length),
      tempo_max_min: Math.round(Math.max(...info.tempos)),
      msgs_medio: Math.round(info.msgs.reduce((a, b) => a + b, 0) / info.msgs.length),
      presos_30min: info.presos30,
    }))
    .sort((a, b) => b.qtd_clientes - a.qtd_clientes);

  // 3) Funil agregado por estagio macro (ordem natural do fluxo)
  // Mapeia steps tecnicos pra estagios visuais
  const ESTAGIOS_FLUXO = [
    { id: "entrada", nome: "1. Entrada", steps: ["inicio", "aguardando_servico"] },
    { id: "coleta_dados", nome: "2. Coleta de dados", steps: ["aguardando_localizacao", "aguardando_destino", "confirmar_origem", "confirmar_destino", "confirmar_contexto_inicial"] },
    { id: "guincho", nome: "2b. Guincho", steps: ["guincho_categoria", "guincho_localizacao", "guincho_destino"] },
    { id: "cotacao", nome: "3. Cotacao", steps: ["confirmar_cotacao", "aguardando_data"] },
    { id: "pagamento", nome: "4. Pagamento", steps: ["aguardando_pagamento"] },
    { id: "execucao", nome: "5. Em execucao", steps: ["aguardando_fretista", "fretista_a_caminho", "fretista_coleta_fotos", "fretista_entrega_fotos"] },
    { id: "atendimento_humano", nome: "6. Atendimento humano", steps: ["atendimento_humano"] },
    { id: "concluido", nome: "7. Concluido", steps: ["concluido"] },
    { id: "cadastro_prestador", nome: "🚚 Cadastro prestador", steps: ["cadastro_nome", "cadastro_cpf", "cadastro_selfie", "cadastro_cnh", "cadastro_placa", "cadastro_veiculo_foto", "cadastro_pix", "cadastro_termos"] },
  ];

  const funilAgregado = ESTAGIOS_FLUXO.map((estagio) => {
    const stepsDoEstagio = steps.filter((s) => estagio.steps.includes(s.step));
    const total = stepsDoEstagio.reduce((sum, s) => sum + s.qtd_clientes, 0);
    const presos = stepsDoEstagio.reduce((sum, s) => sum + s.presos_30min, 0);
    return {
      id: estagio.id,
      nome: estagio.nome,
      qtd_clientes: total,
      presos_30min: presos,
      breakdown: stepsDoEstagio,
    };
  });

  // 4) Sessoes em outros steps (nao mapeados nos estagios acima)
  const stepsConhecidos = new Set(ESTAGIOS_FLUXO.flatMap((e) => e.steps));
  const outros = steps.filter((s) => !stepsConhecidos.has(s.step));

  // 5) Saude geral
  const totalClientesAtivos = (sessoesAtivas || []).length;
  const totalPresos = steps.reduce((sum, s) => sum + s.presos_30min, 0);
  const taxaPresos = totalClientesAtivos > 0 ? (totalPresos / totalClientesAtivos) * 100 : 0;

  // 6) Smoke E2E mais recente
  const { data: smokeLog } = await supabase
    .from("bot_logs")
    .select("criado_em, payload")
    .or("payload->>tipo.eq.imuni_smoke_e2e_ok,payload->>tipo.eq.imuni_smoke_e2e_falhou")
    .order("criado_em", { ascending: false })
    .limit(1);

  const ultimoSmoke = smokeLog?.[0]
    ? {
        em: smokeLog[0].criado_em,
        ok: (smokeLog[0].payload as Record<string, unknown>)?.tipo === "imuni_smoke_e2e_ok",
        ha_horas: Math.round((Date.now() - new Date(smokeLog[0].criado_em as string).getTime()) / 3600000),
      }
    : null;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    saude: {
      total_clientes_ativos: totalClientesAtivos,
      total_presos_30min: totalPresos,
      taxa_presos_pct: Math.round(taxaPresos * 10) / 10,
      ultimo_smoke_e2e: ultimoSmoke,
    },
    funil: funilAgregado,
    outros_steps: outros,
    todos_steps: steps,
  });
}
