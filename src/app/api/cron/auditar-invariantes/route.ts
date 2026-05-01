import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";
import { executarPlugin, classificar } from "@/lib/imuni/runner";
import { pluginPegue } from "@/lib/imuni-pegue/invariantes";
import type { ResultadoInvariante } from "@/lib/imuni/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron `/api/cron/auditar-invariantes` — Camada 3 da defesa em profundidade.
// Roda 1x/dia (manha) e checa estado do banco contra invariantes do negocio.
//
// Audit 1/Mai/2026: Fabio definiu o sistema auto-corretivo como o
// produto mais critico da Pegue. Esse cron eh a fundacao desse sistema —
// detecta inconsistencias automaticamente sem depender de Fabio ou Claude
// re-lerem codigo.
//
// Frequencia recomendada: 1x/dia (cron-job.org config: 0 7 * * *)
// URL: https://www.chamepegue.com.br/api/cron/auditar-invariantes?key=CRON_SECRET

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const inicio = Date.now();
  // Executa plugin Pegue via runner generico do core IMUNI.
  // Quando outros plugins forem adicionados (ex: imuni-otimizi), basta
  // trocar pra `executarPlugins([pluginPegue, pluginOutro])`.
  const resultados: ResultadoInvariante[] = await executarPlugin(pluginPegue);
  const duracaoMs = Date.now() - inicio;
  const stats = classificar(resultados);

  // Loga a execucao completa pra historico
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "auditoria_invariantes_executada",
      total: resultados.length,
      violacoes: resultados.filter((r) => !r.ok).length,
      duracao_ms: duracaoMs,
      sumario: resultados.map((r) => ({ nome: r.nome, count: r.count, severidade: r.severidade, ok: r.ok })),
    },
  });

  const violacoesAlta = stats.violacoes_alta;
  const violacoesMedia = stats.violacoes_media;
  const erros = stats.erros;

  // Alerta admin se houver violacoes ALTAS ou ERROS na execucao
  if (violacoesAlta.length > 0 || erros.length > 0) {
    const linhas: string[] = [];
    linhas.push(`📊 *Total de invariantes:* ${resultados.length}`);
    linhas.push(`🚨 *Violacoes ALTAS:* ${violacoesAlta.length}`);
    linhas.push(`⚠️ *Violacoes medias:* ${violacoesMedia.length}`);
    if (erros.length > 0) linhas.push(`❌ *Erros executando:* ${erros.length}`);
    linhas.push("");
    if (violacoesAlta.length > 0) {
      linhas.push(`━━━━━━━━━━━━━━━━`);
      linhas.push(`🚨 *VIOLACOES ALTAS (acao imediata):*`);
      for (const v of violacoesAlta) {
        linhas.push(``);
        linhas.push(`*${v.nome}* — ${v.count} caso(s)`);
        linhas.push(`${v.descricao}`);
        linhas.push(`👉 ${v.comoAgir}`);
        if (v.amostra.length > 0) {
          linhas.push(`Amostra: ${JSON.stringify(v.amostra[0]).slice(0, 200)}`);
        }
      }
    }
    if (erros.length > 0) {
      linhas.push(``);
      linhas.push(`━━━━━━━━━━━━━━━━`);
      linhas.push(`❌ *ERROS executando invariantes:*`);
      for (const e of erros) {
        linhas.push(`- ${e.nome}: ${e.erro}`);
      }
    }
    await notificarAdmins(
      `🛡️ *AUDITORIA DIARIA DE INVARIANTES*`,
      "sistema",
      linhas.join("\n"),
    );
  }

  return NextResponse.json({
    status: "ok",
    duracao_ms: duracaoMs,
    total: resultados.length,
    violacoes_alta: violacoesAlta.length,
    violacoes_media: violacoesMedia.length,
    erros: erros.length,
    detalhes: resultados,
  });
}

// POST = mesmo que GET (alguns crons mandam POST)
export async function POST(req: NextRequest) {
  return GET(req);
}
