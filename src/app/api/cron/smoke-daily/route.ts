import { NextRequest, NextResponse } from "next/server";
import { isValidCronKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cron /api/cron/smoke-daily — roda 1x/dia (cron-job.org).
// Faz mini smoke test contra o proprio webhook, valida que rotas criticas
// respondem corretamente, e ALERTA admin se algo quebrar.
//
// URL: https://www.chamepegue.com.br/api/cron/smoke-daily?key=CRON_SECRET
// Frequencia recomendada: 1x/dia (ex: 06:00 UTC = 03:00 BRT).

const BASE_URL = "https://www.chamepegue.com.br";

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

async function check(name: string, fn: () => Promise<boolean | { ok: boolean; detail?: string }>): Promise<CheckResult> {
  try {
    const r = await fn();
    if (typeof r === "boolean") return { name, ok: r };
    return { name, ...r };
  } catch (e: any) {
    return { name, ok: false, detail: e?.message?.slice(0, 200) || "exception" };
  }
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!isValidCronKey(key)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const secret = process.env.WEBHOOK_WHATSAPP_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "WEBHOOK_WHATSAPP_SECRET nao configurado" }, { status: 500 });
  }

  const webhookUrl = `${BASE_URL}/api/whatsapp/webhook?secret=${encodeURIComponent(secret)}`;
  const headers = { "Content-Type": "application/json", "X-Smoke-Mode": "true" };

  const results: CheckResult[] = [];

  // 1. Webhook responde 200 com payload valido
  results.push(await check("webhook_200_payload_valido", async () => {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        Type: "received_message",
        Body: { Text: "oi", Info: { RemoteJid: "5511999999999@s.whatsapp.net", FromMe: false } },
      }),
    });
    return { ok: r.status === 200, detail: r.status !== 200 ? `status=${r.status}` : undefined };
  }));

  // 2. Webhook rejeita secret invalido (401)
  results.push(await check("webhook_401_secret_invalido", async () => {
    const r = await fetch(`${BASE_URL}/api/whatsapp/webhook?secret=invalido`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Type: "received_message" }),
    });
    return { ok: r.status === 401, detail: r.status !== 401 ? `status=${r.status}` : undefined };
  }));

  // 3. Webhook ignora payload mal-formado (200, nao 500)
  results.push(await check("webhook_payload_malformado_200", async () => {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ foo: "bar" }),
    });
    return { ok: r.status === 200, detail: r.status !== 200 ? `status=${r.status}` : undefined };
  }));

  // 4. Webhook ignora SQL injection sem quebrar
  results.push(await check("webhook_sql_injection_safe", async () => {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        Type: "received_message",
        Body: {
          Text: "'; DROP TABLE bot_sessions; --",
          Info: { RemoteJid: "5511999999999@s.whatsapp.net", FromMe: false },
        },
      }),
    });
    return { ok: r.status === 200, detail: r.status !== 200 ? `status=${r.status}` : undefined };
  }));

  // 5. Imagem tutorial localizacao acessivel (CDN ok)
  results.push(await check("cdn_tutorial_mp4_acessivel", async () => {
    const r = await fetch(`${BASE_URL}/tutorial-localizacao.mp4`, { method: "HEAD" });
    return { ok: r.status === 200, detail: r.status !== 200 ? `status=${r.status}` : undefined };
  }));

  // 6. Sentry endpoint configurado (Sentry tunnel route)
  results.push(await check("site_pagina_principal_carrega", async () => {
    const r = await fetch(`${BASE_URL}/`, { method: "HEAD" });
    return { ok: r.status === 200 || r.status === 301 || r.status === 308, detail: r.status > 308 ? `status=${r.status}` : undefined };
  }));

  // Resumo
  const total = results.length;
  const passou = results.filter((r) => r.ok).length;
  const falhou = total - passou;

  // Se TUDO OK, retorna sucesso silencioso. Se algo quebrou, alerta admin.
  if (falhou > 0) {
    const detalhesFalhas = results
      .filter((r) => !r.ok)
      .map((r) => `❌ ${r.name}${r.detail ? ` - ${r.detail}` : ""}`)
      .join("\n");

    await notificarAdmins(
      `🚨 *SMOKE DIARIO FALHOU* (${falhou}/${total})`,
      "sistema",
      `O cron diario detectou que algumas rotas criticas nao estao respondendo certo.\n\n${detalhesFalhas}\n\n🎯 *Como agir:*\nVerifique deploy Vercel + tente acessar admin pra confirmar. Se nao for transitorio, abra issue.`,
    );
  }

  return NextResponse.json({
    status: falhou === 0 ? "ok" : "falhas_detectadas",
    total,
    passou,
    falhou,
    detalhes: results,
    timestamp: new Date().toISOString(),
  });
}
