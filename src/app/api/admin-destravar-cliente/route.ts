import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey, isValidCronKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Endpoint admin pra destravar cliente que ficou preso em atendimento_humano,
// silenciado, ou step zumbi. Reseta sessao pro inicio + libera silenciado_ate.
//
// Uso (POST ou GET): ?key=ADMIN_KEY_OR_CRON_SECRET&phone=556191175422
//
// Operacao idempotente: se ja estava destravado, nao faz nada de mal.
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

  const phoneRaw = req.nextUrl.searchParams.get("phone") || "";
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  if (!/^55\d{10,11}$/.test(phoneDigits)) {
    return NextResponse.json(
      { error: "phone invalido — esperado formato 55+DDD+numero" },
      { status: 400 },
    );
  }

  const variantes = [phoneDigits];
  if (phoneDigits.length > 12) variantes.push(phoneDigits.slice(0, 12)); // sem 9 do meio

  // Antes de destravar, registra estado atual
  const { data: sessaoAntes } = await supabase
    .from("bot_sessions")
    .select("phone, step, silenciado_ate, atualizado_em")
    .in("phone", variantes)
    .maybeSingle();

  // Update: step=inicio + zera silenciado_ate + libera lock se houver
  const { data: atualizada } = await supabase
    .from("bot_sessions")
    .update({
      step: "inicio",
      silenciado_ate: null,
      atualizado_em: new Date().toISOString(),
    })
    .in("phone", variantes)
    .select("phone, step");

  // Tambem libera processing_lock se ainda existir
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabaseAny: any = supabase;
  await supabaseAny.from("processing_locks").delete().in("phone", variantes);

  // Loga
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "cliente_destravado_admin",
      phone: phoneDigits,
      sessao_antes: sessaoAntes
        ? {
            step: sessaoAntes.step,
            silenciado_ate: sessaoAntes.silenciado_ate,
          }
        : null,
      destravado_em: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    ok: true,
    phone: phoneDigits,
    sessao_antes: sessaoAntes,
    sessao_depois: atualizada?.[0] || null,
    msg: "Cliente destravado. Proxima msg cai no fluxo normal (saudacao + menu).",
  });
}
