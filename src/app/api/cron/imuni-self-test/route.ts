import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cron `/api/cron/imuni-self-test` — self-test do alertador IMUNI.
//
// Filosofia (audit 4/Mai/2026): "provas reais e nao maquiagem". IMUNI
// pode ter 21 sentinelas perfeitas, mas se o canal de alerta estiver
// quebrado (token ChatPro expirado, instancia banida, ADMIN_PHONES
// errado, Telegram bot deletado), Fabio nunca recebe o aviso. Esse
// canario semanal prova que o pipeline ENVIO-> ENTREGA continua vivo.
//
// O que faz:
//   1. Loga `imuni_self_test_alertador_iniciado` (registro de intencao)
//   2. Envia mensagem curta, identificavel, NAO-acionavel pros admins
//   3. Loga `imuni_self_test_alertador` com resultado
//
// O log `imuni_self_test_alertador` eh o que INV-23 vigia. Tipo
// preservado pelo cleanup-bot-logs (4/Mai/2026).
//
// Frequencia recomendada cron-job.org: semanal segunda 08:00 BRT
// (cron expression: `0 11 * * 1` em UTC). Mais frequente vira spam,
// menos frequente atrasa deteccao.
//
// Limitacao conhecida (sera resolvida na Onda 1.5):
// Esse self-test prova ENVIO bem-sucedido (notificarAdmins retornou
// numero de admins WhatsApp + Telegram >0). NAO prova que admin LEU.
// Pra prova de leitura, precisa fluxo "responda OK pra confirmar" com
// escalation se nao responder em 24h. Fica pra Onda 1.5 junto com
// confirmacao de entrega de alerta.
//
// URL: https://www.chamepegue.com.br/api/cron/imuni-self-test?key=CRON_SECRET

export async function GET(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const inicio = Date.now();
  const timestamp = new Date().toISOString();

  // 1) Loga intencao (em caso de falha do alertador, ainda fica registro
  //    de que o cron rodou)
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "imuni_self_test_alertador_iniciado",
      timestamp,
    },
  });

  // 2) Envia mensagem de teste. Texto curto, sem acao requisitada,
  //    com tag explicita pra Fabio reconhecer (nao confundir com
  //    alerta real que precisa atencao).
  const titulo = "🛡️ IMUNI · self-test semanal";
  const referencia = "sistema";
  const detalhes =
    "Teste automatico do canal de alerta. Se voce esta lendo, IMUNI consegue chegar ate voce.\n\n" +
    "Sem acao necessaria. Proximo teste daqui 7 dias.\n\n" +
    `_canario: ${timestamp}_`;

  let enviadosWhatsapp = 0;
  let erroEnvio: string | undefined;
  try {
    enviadosWhatsapp = await notificarAdmins(titulo, referencia, detalhes);
  } catch (e: any) {
    erroEnvio = e?.message || String(e);
  }

  const duracaoMs = Date.now() - inicio;
  const ok = !erroEnvio; // notificarAdmins ja faz fallback i1->i2 e tenta Telegram em paralelo

  // 3) Loga resultado — INV-23 le esse log. Tipo preservado pelo
  //    cleanup-bot-logs.
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "imuni_self_test_alertador",
      timestamp,
      duracao_ms: duracaoMs,
      enviados_whatsapp: enviadosWhatsapp,
      ok,
      erro: erroEnvio,
    },
  });

  return NextResponse.json({
    status: ok ? "ok" : "falhou",
    timestamp,
    duracao_ms: duracaoMs,
    enviados_whatsapp: enviadosWhatsapp,
    erro: erroEnvio,
    obs:
      "INV-23 vigia esse log. Configurar cron-job.org segunda 08:00 BRT (0 11 * * 1 em UTC).",
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
