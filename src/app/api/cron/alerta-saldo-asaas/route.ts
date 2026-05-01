import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";
import { consultarSaldoAsaas, asaasStatus } from "@/lib/asaas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cron `/api/cron/alerta-saldo-asaas` — recomendado rodar a cada 6h.
// Alerta admin quando saldo Asaas esta baixo E HA repasses pendentes
// pra fretistas. Sem isso, fretista nao recebe e Pegue perde reputacao.
//
// Logica:
//   - Consulta saldo via API Asaas (totalBalance)
//   - Conta corridas concluidas com pagamentos.repasse_status='pendente'
//     que SOMADAS excedem o saldo atual
//   - Se exceder threshold de seguranca (R$50 default), alerta admin
//   - Dedupe 6h pra nao spammar

const SALDO_MINIMO_SEGURANCA_REAIS = 50;
const DEDUPE_HORAS = 6;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  // 1) Verifica se Asaas configurado (em sandbox ou prod)
  const status = asaasStatus();
  if (!status.configured) {
    return NextResponse.json({
      status: "ok",
      saldo: null,
      motivo: "Asaas nao configurado (env vars ausentes)",
    });
  }

  // 2) Consulta saldo
  const r = await consultarSaldoAsaas();
  if (!r.ok) {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "alerta_saldo_asaas_consulta_falhou",
        erro: r.erro,
      },
    });
    return NextResponse.json({ status: "erro_consulta", erro: r.erro }, { status: 500 });
  }

  const saldo = r.saldo || 0;

  // 3) Conta repasses pendentes (corridas concluidas que aguardam PIX out)
  const { data: pendentes, count: qtdPendentes } = await supabase
    .from("pagamentos")
    .select("valor", { count: "exact" })
    .eq("repasse_status", "pendente")
    .order("criado_em", { ascending: true })
    .limit(100);

  const totalDevedor = (pendentes || []).reduce((sum, p: any) => sum + (Number(p.valor) || 0), 0);

  // 4) Decide alertar
  const saldoSuficiente = saldo >= totalDevedor + SALDO_MINIMO_SEGURANCA_REAIS;
  if (saldoSuficiente) {
    return NextResponse.json({
      status: "ok",
      saldo,
      total_devedor: totalDevedor,
      qtd_pendentes: qtdPendentes || 0,
      motivo: "saldo suficiente",
    });
  }

  // 5) Dedupe 6h
  const dedupeInicio = new Date(Date.now() - DEDUPE_HORAS * 3600_000).toISOString();
  const { count: alertasRecentes } = await supabase
    .from("bot_logs")
    .select("*", { count: "exact", head: true })
    .filter("payload->>tipo", "eq", "alerta_saldo_asaas_baixo_enviado")
    .gte("criado_em", dedupeInicio);

  if ((alertasRecentes || 0) > 0) {
    return NextResponse.json({
      status: "ok",
      saldo,
      total_devedor: totalDevedor,
      qtd_pendentes: qtdPendentes || 0,
      alertou: false,
      motivo: `dedupe ${DEDUPE_HORAS}h`,
    });
  }

  // 6) Alerta admin
  const faltam = totalDevedor + SALDO_MINIMO_SEGURANCA_REAIS - saldo;
  await notificarAdmins(
    `💰 *SALDO ASAAS BAIXO — RISCO DE REPASSE*`,
    "Sistema",
    `Saldo atual: R$ ${saldo.toFixed(2)}\nRepasses pendentes: ${qtdPendentes || 0} (R$ ${totalDevedor.toFixed(2)})\nReserva minima: R$ ${SALDO_MINIMO_SEGURANCA_REAIS}\n\n👉 Faltam R$ ${faltam.toFixed(2)} pra cobrir repasses pendentes + reserva.\n\nAcoes:\n  1) Aguardar pagamentos PENDENTE virarem RECEIVED\n  2) Ajustar fluxo se cobrancas nao estao confirmando\n  3) Em emergencia: deposito manual no Asaas`,
  );

  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "alerta_saldo_asaas_baixo_enviado",
      saldo,
      total_devedor: totalDevedor,
      qtd_pendentes: qtdPendentes || 0,
    },
  });

  return NextResponse.json({
    status: "ok",
    saldo,
    total_devedor: totalDevedor,
    qtd_pendentes: qtdPendentes || 0,
    alertou: true,
  });
}
