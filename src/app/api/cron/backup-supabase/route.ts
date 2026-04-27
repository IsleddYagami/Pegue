import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron /api/cron/backup-supabase — roda 1x/dia.
// Exporta TODAS as tabelas criticas em JSON e salva em bucket Supabase
// Storage 'backups'. Mantém apenas ultimos 7 backups (cleanup).
//
// Por que: Supabase plano FREE NAO tem backup automatico (apenas Pro $25/mes).
// Sem isso, se DB cair ou alguem apagar tabela = perde tudo.
// Solucao gratuita: backup manual em JSON, periodico, persistido em
// Storage do mesmo Supabase (mas separado do banco).
//
// URL: https://www.chamepegue.com.br/api/cron/backup-supabase?key=CRON_SECRET
// Schedule: 0 5 * * * (05:00 UTC = 02:00 BRT)
//
// IMPORTANTE: pra resiliencia maxima, baixar backups periodicamente pra HD
// externo (Fabio pode acessar /admin pra baixar OU usar Supabase Studio).

const TABELAS = [
  "clientes",
  "prestadores",
  "prestador_veiculos",
  "prestador_documentos",
  "corridas",
  "pagamentos",
  "avaliacoes",
  "ocorrencias",
  "configuracoes",
  "tabela_precos",
  "ajustes_precos",
  "feedback_precos",
  "phones_bloqueados",
  "tarefas_agendadas",
  "webhooks_mp_processados",
  "provas_digitais",
  "rastreio_localizacoes",
  "enderecos_favoritos",
  "ranking_pegue_runner",
  "admin_usuarios",
];

const BUCKET = "backups";
const RETENCAO_BACKUPS = 7;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!isValidCronKey(key)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tStart = Date.now();
  const backup: Record<string, any[]> = {};
  const stats: Record<string, number> = {};

  // 1) Dump cada tabela
  for (const tabela of TABELAS) {
    try {
      const { data, error } = await supabase.from(tabela).select("*");
      if (error) {
        // Tabela pode nao existir, registra mas nao falha
        stats[tabela] = -1;
        continue;
      }
      backup[tabela] = data || [];
      stats[tabela] = (data || []).length;
    } catch (e) {
      stats[tabela] = -1;
    }
  }

  // 2) Serializa pra JSON
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup-${timestamp}.json`;
  const jsonStr = JSON.stringify({
    metadata: {
      gerado_em: new Date().toISOString(),
      tabelas_count: Object.keys(stats).length,
      total_linhas: Object.values(stats).filter((v) => v > 0).reduce((a, b) => a + b, 0),
      stats,
      versao_schema: "v1",
    },
    dados: backup,
  });

  // 3) Upload pro bucket
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filename, jsonStr, {
      contentType: "application/json",
      upsert: false,
    });

  if (uploadError) {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "backup_supabase_falhou",
        erro: uploadError.message,
        bucket_existe: !uploadError.message.includes("not found"),
      },
    });
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // 4) Cleanup: mantem apenas ultimos RETENCAO_BACKUPS
  const { data: arquivos } = await supabase.storage.from(BUCKET).list("", {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });

  let removidos = 0;
  if (arquivos && arquivos.length > RETENCAO_BACKUPS) {
    const aRemover = arquivos.slice(RETENCAO_BACKUPS).map((f) => f.name);
    if (aRemover.length > 0) {
      const { error: delError } = await supabase.storage.from(BUCKET).remove(aRemover);
      if (!delError) removidos = aRemover.length;
    }
  }

  const ms = Date.now() - tStart;
  const tamanhoKB = Math.round(jsonStr.length / 1024);

  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "backup_supabase_ok",
      filename,
      tamanho_kb: tamanhoKB,
      ms,
      stats,
      backups_removidos: removidos,
    },
  });

  return NextResponse.json({
    status: "ok",
    filename,
    tamanho_kb: tamanhoKB,
    ms,
    stats,
    backups_removidos: removidos,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
