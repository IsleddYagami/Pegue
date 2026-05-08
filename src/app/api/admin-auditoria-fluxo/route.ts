import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey, isValidCronKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// AUDITORIA HONESTA — quantos clientes reais nos ultimos N dias chegaram
// em cada step do fluxo. Cliente smoke (5500*) e admin sao ignorados.
//
// Pedido Fabio (8/Mai/2026) apos caso Natan: precisa saber quantitativamente
// onde clientes reais travam, sem mais smoke teatro.

export async function GET(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidAdminKey(key) && !isValidCronKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const dias = Number(req.nextUrl.searchParams.get("dias") || "7");
  const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();

  // 1) Todas as sessoes criadas no periodo (clientes nao-teste)
  const { data: sessoes } = await supabase
    .from("bot_sessions")
    .select("phone, step, criado_em, atualizado_em, msgs_contador, descricao_carga, origem_endereco, destino_endereco, valor_estimado")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false });

  type Sessao = {
    phone: string;
    step: string;
    criado_em: string;
    atualizado_em: string;
    msgs_contador: number;
    descricao_carga: string | null;
    origem_endereco: string | null;
    destino_endereco: string | null;
    valor_estimado: number | null;
  };
  const todasSessoes = (sessoes || []) as Sessao[];

  // Filtrar smoke phones (55000*) e admin
  const realSessoes = todasSessoes.filter(
    (s) => !/^55000\d+$/.test(s.phone),
  );

  const totalReais = realSessoes.length;

  // 2) Agrupa por step final
  const porStep: Record<string, { qtd: number; ultimas: Array<{ phone: string; ts: string; descricao: string | null }> }> = {};
  for (const s of realSessoes) {
    if (!porStep[s.step]) porStep[s.step] = { qtd: 0, ultimas: [] };
    porStep[s.step].qtd++;
    if (porStep[s.step].ultimas.length < 5) {
      porStep[s.step].ultimas.push({
        phone: s.phone,
        ts: s.atualizado_em,
        descricao: s.descricao_carga,
      });
    }
  }
  const porStepArr = Object.entries(porStep)
    .map(([step, info]) => ({ step, qtd: info.qtd, ultimas: info.ultimas }))
    .sort((a, b) => b.qtd - a.qtd);

  // 3) Funil — quantos chegaram em cada FASE chave
  const fases = {
    iniciaram_atendimento: realSessoes.length,
    chegaram_em_localizacao: 0,
    chegaram_em_foto: 0,
    chegaram_em_destino: 0,
    chegaram_em_cotacao: 0,
    aceitaram_termos: 0,
    pagaram: 0,
    receberam_dispatch: 0,
    fretista_aceitou: 0,
    coleta_iniciada: 0,
    entrega_iniciada: 0,
    pin_validado: 0,
    concluiram: 0,
    travaram_atendimento_humano: 0,
    abandonaram_meio_fluxo: 0,
  };
  const stepsParaFase: Record<string, keyof typeof fases | undefined> = {
    inicio: undefined,
    aguardando_servico: undefined,
    aguardando_localizacao: "chegaram_em_localizacao",
    confirmando_origem: "chegaram_em_localizacao",
    aguardando_foto: "chegaram_em_foto",
    aguardando_mais_fotos: "chegaram_em_foto",
    aguardando_destino: "chegaram_em_destino",
    confirmando_destino: "chegaram_em_destino",
    aguardando_tipo_local: "chegaram_em_cotacao",
    aguardando_andar: "chegaram_em_cotacao",
    aguardando_ajudante: "chegaram_em_cotacao",
    aguardando_data: "chegaram_em_cotacao",
    aguardando_horario: "chegaram_em_cotacao",
    aguardando_confirmacao: "chegaram_em_cotacao",
    aguardando_aceite_termos: "aceitaram_termos",
    aguardando_fretista: "receberam_dispatch",
    aguardando_pagamento: "pagaram",
    aguardando_numero_coleta: "fretista_aceitou",
    aguardando_numero_destino: "fretista_aceitou",
    fretista_coleta_fotos: "coleta_iniciada",
    aguardando_confirmacao_coleta: "coleta_iniciada",
    fretista_aguardando_cliente_ok_coleta: "coleta_iniciada",
    fretista_entrega_fotos: "entrega_iniciada",
    fretista_aguardando_pin: "entrega_iniciada",
    aguardando_confirmacao_entrega: "pin_validado",
    concluido: "concluiram",
    atendimento_humano: "travaram_atendimento_humano",
  };

  for (const s of realSessoes) {
    const fase = stepsParaFase[s.step];
    if (fase) fases[fase]++;
  }

  // Computa "abandonaram_meio_fluxo" — sessoes que entraram, deram >=2 msgs,
  // mas nao chegaram em "concluiram" nem "travaram_atendimento_humano",
  // E nao tiveram atualizacao nas ultimas 6h
  const corte6h = Date.now() - 6 * 3600 * 1000;
  for (const s of realSessoes) {
    if (
      s.msgs_contador >= 2 &&
      s.step !== "concluido" &&
      s.step !== "atendimento_humano" &&
      s.step !== "inicio" &&
      new Date(s.atualizado_em).getTime() < corte6h
    ) {
      fases.abandonaram_meio_fluxo++;
    }
  }

  // 4) Top phones travados em atendimento_humano (pra inspecionar individualmente)
  const travadosHumano = realSessoes
    .filter((s) => s.step === "atendimento_humano")
    .slice(0, 10)
    .map((s) => ({
      phone: s.phone,
      atualizado_em: s.atualizado_em,
      ja_tinha_descricao: !!s.descricao_carga,
      ja_tinha_origem: !!s.origem_endereco,
    }));

  // 5) Sessoes que chegaram a aguardando_aceite_termos mas NAO aceitaram
  // (cliente cotou e desistiu) — indica problema na cotacao
  const cotaramSemAceitar = realSessoes
    .filter(
      (s) =>
        s.step === "aguardando_aceite_termos" &&
        new Date(s.atualizado_em).getTime() < corte6h,
    )
    .slice(0, 10)
    .map((s) => ({
      phone: s.phone,
      valor_estimado: s.valor_estimado,
      descricao: s.descricao_carga,
      atualizado_em: s.atualizado_em,
    }));

  // 6) Eventos relevantes do periodo (handler errors, rollbacks, etc)
  const { data: eventosErro } = await supabase
    .from("bot_logs")
    .select("payload, criado_em")
    .filter("payload->>tipo", "eq", "webhook_handler_error")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(20);

  const eventosErroResumo = (eventosErro || []).map(
    (e: { payload: Record<string, unknown>; criado_em: string }) => ({
      ts: e.criado_em,
      mensagem_cliente: String(e.payload.mensagem || "").slice(0, 100),
      erro: String(e.payload.erro || "").slice(0, 200),
      phone_masked: String(e.payload.phone_masked || ""),
    }),
  );

  // Calcular taxas de conversao
  const taxaCotacao =
    fases.iniciaram_atendimento > 0
      ? Math.round((fases.chegaram_em_cotacao / fases.iniciaram_atendimento) * 100)
      : 0;
  const taxaPagamento =
    fases.iniciaram_atendimento > 0
      ? Math.round((fases.pagaram / fases.iniciaram_atendimento) * 100)
      : 0;
  const taxaConclusao =
    fases.iniciaram_atendimento > 0
      ? Math.round((fases.concluiram / fases.iniciaram_atendimento) * 100)
      : 0;

  return NextResponse.json({
    periodo_dias: dias,
    total_clientes_reais: totalReais,
    smoke_excluidos: todasSessoes.length - totalReais,
    fases,
    taxas_pct: {
      iniciaram: 100,
      chegaram_em_cotacao: taxaCotacao,
      pagaram: taxaPagamento,
      concluiram: taxaConclusao,
    },
    por_step_final: porStepArr,
    travados_atendimento_humano: travadosHumano,
    cotaram_sem_aceitar: cotaramSemAceitar,
    eventos_erro: eventosErroResumo,
  });
}
