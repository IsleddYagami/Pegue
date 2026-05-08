import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey, isValidCronKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// AUTO-ROLLBACK via Vercel API.
// Quando smoke pos-deploy falha (GitHub Action detecta), esse endpoint:
//   1) Identifica deployment production atual (ruim) via API Vercel
//   2) Identifica deployment production READY anterior (verde)
//   3) Promove o anterior pra production (rollback)
//   4) Notifica admins via WhatsApp + loga em bot_logs
//
// Custo: zero (Vercel API free).
// Tempo: deploy reverte em <30s (alias swap, sem rebuild).
//
// Uso (POST ou GET): ?key=ADMIN_KEY_OR_CRON_SECRET
// Pre-req: env vars VERCEL_TOKEN + VERCEL_PROJECT_ID configuradas no Vercel.

const VERCEL_API = "https://api.vercel.com";

interface VercelDeployment {
  uid: string;
  readyState: string;
  target: string | null;
  created: number;
  meta?: { githubCommitSha?: string; githubCommitMessage?: string };
}

interface VercelProject {
  targets?: {
    production?: { id: string; meta?: { githubCommitSha?: string } };
  };
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidAdminKey(key) && !isValidCronKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  // Dry run: identifica current/anterior MAS NAO promove. Pra validar
  // VERCEL_TOKEN/PROJECT_ID + acesso API sem afetar prod.
  const dryRun = req.nextUrl.searchParams.get("dry_run") === "1";

  const vercelToken = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID || "prj_7OKSUmZRyQJxJi5lFotlvOhBTBWc";

  if (!vercelToken) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "VERCEL_TOKEN nao configurado nas env vars do Vercel — sem ele nao da pra rollback",
      },
      { status: 500 },
    );
  }

  const headers = {
    Authorization: `Bearer ${vercelToken}`,
    "Content-Type": "application/json",
  };

  try {
    // 1) Identifica deployment production current
    const projResp = await fetch(`${VERCEL_API}/v9/projects/${projectId}`, { headers });
    if (!projResp.ok) {
      const txt = await projResp.text();
      return NextResponse.json(
        { ok: false, motivo: `falha ao buscar projeto: ${projResp.status} ${txt.slice(0, 200)}` },
        { status: 500 },
      );
    }
    const proj: VercelProject = await projResp.json();
    const currentId = proj.targets?.production?.id;
    const currentSha = proj.targets?.production?.meta?.githubCommitSha;
    if (!currentId) {
      return NextResponse.json(
        { ok: false, motivo: "nao encontrei deployment production current" },
        { status: 500 },
      );
    }

    // 2) Lista deployments production READY (ordenados por created desc)
    const listResp = await fetch(
      `${VERCEL_API}/v6/deployments?projectId=${projectId}&state=READY&target=production&limit=10`,
      { headers },
    );
    if (!listResp.ok) {
      return NextResponse.json(
        { ok: false, motivo: `falha ao listar deployments: ${listResp.status}` },
        { status: 500 },
      );
    }
    const listData = (await listResp.json()) as { deployments: VercelDeployment[] };
    const candidatos = listData.deployments
      .filter((d) => d.uid !== currentId)
      .sort((a, b) => b.created - a.created);

    if (candidatos.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          motivo: "nao ha deployment production anterior pra rollback",
          current_id: currentId,
        },
        { status: 500 },
      );
    }

    const anterior = candidatos[0];

    // Dry run: para aqui, antes de promover. Permite validar token + dados.
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        modo: "dry_run",
        current: {
          id: currentId,
          sha: currentSha,
        },
        candidato_rollback: {
          id: anterior.uid,
          sha: anterior.meta?.githubCommitSha,
          commit_msg: (anterior.meta?.githubCommitMessage || "").slice(0, 100),
          created: anterior.created,
        },
        msg: "rollback NAO foi executado — modo dry_run. Remova ?dry_run=1 pra executar.",
      });
    }

    // 3) Promove o anterior (rollback)
    const promoteResp = await fetch(
      `${VERCEL_API}/v10/projects/${projectId}/promote/${anterior.uid}`,
      {
        method: "POST",
        headers,
      },
    );
    if (!promoteResp.ok) {
      const txt = await promoteResp.text();
      return NextResponse.json(
        {
          ok: false,
          motivo: `falha ao promover anterior: ${promoteResp.status}`,
          detalhe: txt.slice(0, 300),
        },
        { status: 500 },
      );
    }

    // 4) Loga + notifica admins
    const detalhes = {
      current_ruim: { id: currentId, sha: currentSha },
      promovido: {
        id: anterior.uid,
        sha: anterior.meta?.githubCommitSha,
        commit_msg: (anterior.meta?.githubCommitMessage || "").slice(0, 100),
      },
    };

    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "imuni_rollback_executado",
        ...detalhes,
      },
    });

    try {
      await notificarAdmins(
        "🦠 *IMUNI: ROLLBACK AUTOMATICO EXECUTADO*",
        "rollback",
        `Deploy ruim revertido pra deploy anterior verde.\n\n*Deploy revertido:* ${currentSha?.slice(0, 8) || currentId}\n*Deploy ativo agora:* ${anterior.meta?.githubCommitSha?.slice(0, 8) || anterior.uid}\n*Mensagem do commit ativo:* ${(anterior.meta?.githubCommitMessage || "").slice(0, 100)}\n\nCliente real volta a ver versao funcional em ~30s. Investigar o commit ${currentSha?.slice(0, 8)} apos o evento — o que quebrou?`,
      );
    } catch (e) {
      console.error("notificar admins falhou no rollback:", e);
    }

    return NextResponse.json({
      ok: true,
      acao: "rollback_executado",
      detalhes,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "exception",
        erro: e instanceof Error ? e.message : "erro desconhecido",
      },
      { status: 500 },
    );
  }
}
