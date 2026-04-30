import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron `/api/cron/auditoria-armazenamento` — roda 1x/dia (manha).
// Cumpre regra ARMAZENAMENTO INEGOCIAVEL: detectar quando uma tabela
// critica fica vazia mesmo havendo atividade no sistema.
//
// Caso historico (28/Abr/2026): feedback_precos ficou vazia mesmo apos
// horas de uso pelo Fabio — bug silencioso. Sem auditoria proativa, so
// foi descoberto quando Fabio perguntou "ta salvando?".
//
// Logica:
//   - Para cada tabela critica, conta linhas inseridas nas ultimas 7d
//   - Se ZERO linhas E ha atividade no sistema (bot_logs > 100 entries
//     na mesma janela) -> alerta admin (provavel bug de insert silencioso).
//   - Dedupe 24h: nao re-alerta no mesmo dia.

interface RegraAuditoria {
  tabela: string;
  janela_dias: number;
  threshold_minimo: number; // se inserts < threshold E sistema ativo, alerta
  titulo: string;
  acao: string;
}

const REGRAS: RegraAuditoria[] = [
  {
    tabela: "feedback_precos",
    janela_dias: 7,
    threshold_minimo: 1, // pelo menos 1 avaliacao por semana eh esperado
    titulo: "📊 *FEEDBACK_PRECOS sem dados ha 7 dias*",
    acao: "Tabela critica vazia. Pode ser: (a) ninguem usou comando AVALIAR (UX) ou (b) bug de insert silencioso. Verificar bot_logs payload->>tipo=feedback_precos_insert_falhou. Se bug, acionar correcao.",
  },
  {
    tabela: "avaliacoes",
    janela_dias: 7,
    threshold_minimo: 1,
    titulo: "⭐ *AVALIACOES sem dados ha 7 dias*",
    acao: "Nenhuma avaliacao de cliente em 7d. Verificar fluxo pos-frete (handleAvaliacao) e provas_digitais. Pode estar travando antes do step de avaliacao.",
  },
  {
    tabela: "provas_digitais",
    janela_dias: 7,
    threshold_minimo: 1,
    titulo: "📸 *PROVAS_DIGITAIS sem dados ha 7 dias*",
    acao: "Fotos de coleta/entrega nao estao sendo salvas. Verificar handler fretista_coleta_fotos / fretista_entrega_fotos. Pode ser bug de step OU storage.",
  },
];

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const agora = Date.now();
  const dedupeInicio = new Date(agora - 24 * 3600_000).toISOString();
  const resultados: { tabela: string; count: number; alertou: boolean; motivo?: string }[] = [];

  // Verifica se sistema teve atividade na ultima semana (>100 bot_logs).
  // Se sistema dormente, faz sentido tabelas estarem vazias - nao alerta.
  const inicioJanelaMaior = new Date(agora - 7 * 24 * 3600_000).toISOString();
  const { count: atividadeLogs } = await supabase
    .from("bot_logs")
    .select("*", { count: "exact", head: true })
    .gte("criado_em", inicioJanelaMaior);

  const sistemaAtivo = (atividadeLogs || 0) >= 100;

  if (!sistemaAtivo) {
    return NextResponse.json({
      status: "ok",
      sistema_ativo: false,
      atividade_logs_7d: atividadeLogs || 0,
      motivo: "sistema dormente — auditoria nao agressiva pra evitar falsos positivos",
    });
  }

  for (const regra of REGRAS) {
    const inicio = new Date(agora - regra.janela_dias * 24 * 3600_000).toISOString();
    const { count, error: errCount } = await supabase
      .from(regra.tabela)
      .select("*", { count: "exact", head: true })
      .gte("criado_em", inicio);

    if (errCount) {
      resultados.push({ tabela: regra.tabela, count: 0, alertou: false, motivo: `erro: ${errCount.message}` });
      continue;
    }

    const total = count || 0;
    if (total >= regra.threshold_minimo) {
      resultados.push({ tabela: regra.tabela, count: total, alertou: false, motivo: "ok" });
      continue;
    }

    // Dedupe 24h
    const { count: alertasRecentes } = await supabase
      .from("bot_logs")
      .select("*", { count: "exact", head: true })
      .filter("payload->>tipo", "eq", "auditoria_armazenamento_alertou")
      .filter("payload->>tabela", "eq", regra.tabela)
      .gte("criado_em", dedupeInicio);

    if ((alertasRecentes || 0) > 0) {
      resultados.push({ tabela: regra.tabela, count: total, alertou: false, motivo: "dedupe_24h" });
      continue;
    }

    await notificarAdmins(
      regra.titulo,
      "Sistema",
      `Tabela: \`${regra.tabela}\`\nLinhas em ${regra.janela_dias}d: ${total} (esperado >= ${regra.threshold_minimo})\nAtividade do sistema (bot_logs 7d): ${atividadeLogs}\n\n${regra.acao}`,
    );

    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "auditoria_armazenamento_alertou",
        tabela: regra.tabela,
        count: total,
        atividade_sistema: atividadeLogs,
      },
    });

    resultados.push({ tabela: regra.tabela, count: total, alertou: true });
  }

  return NextResponse.json({
    status: "ok",
    atividade_logs_7d: atividadeLogs,
    resultados,
  });
}
