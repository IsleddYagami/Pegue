import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey, isValidCronKey } from "@/lib/admin-auth";
import { sendToClient } from "@/lib/chatpro";

export const dynamic = "force-dynamic";

// Endpoint pra cancelar corrida de teste e devolver session do cliente
// pro inicio. Tambem avisa fretistas notificados que dispatch foi
// cancelado.
//
// Uso: GET ?key=KEY&corrida_id=UUID
// OU:  GET ?key=KEY&phone=5511986768736 (busca corrida ativa do phone)

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

  const corridaIdParam = req.nextUrl.searchParams.get("corrida_id");
  const phoneParam = req.nextUrl.searchParams.get("phone");

  let corridaId = corridaIdParam;

  // Se nao passou corrida_id, busca via phone
  if (!corridaId && phoneParam) {
    const phoneDigits = phoneParam.replace(/\D/g, "");
    const variantes = [phoneDigits];
    if (phoneDigits.length === 11) variantes.push("55" + phoneDigits);
    const { data: cli } = await supabase
      .from("clientes")
      .select("id")
      .in("telefone", variantes)
      .maybeSingle();
    if (!cli?.id) {
      return NextResponse.json(
        { error: "cliente nao encontrado pra esse phone" },
        { status: 404 },
      );
    }
    const { data: corridas } = await supabase
      .from("corridas")
      .select("id, status, dispatch_prestadores")
      .eq("cliente_id", cli.id)
      .in("status", ["pendente", "aceita", "paga"])
      .order("criado_em", { ascending: false })
      .limit(1);
    if (!corridas || corridas.length === 0) {
      return NextResponse.json(
        { error: "nenhuma corrida ativa encontrada" },
        { status: 404 },
      );
    }
    corridaId = corridas[0].id;
  }

  if (!corridaId) {
    return NextResponse.json(
      { error: "passe corrida_id ou phone" },
      { status: 400 },
    );
  }

  // Busca corrida pra avisar fretistas notificados
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, status, dispatch_prestadores, prestador_id, prestadores(telefone, nome)")
    .eq("id", corridaId)
    .single();

  if (!corrida) {
    return NextResponse.json({ error: "corrida nao encontrada" }, { status: 404 });
  }

  // Cancela
  await supabase
    .from("corridas")
    .update({
      status: "cancelada",
      dispatch_ativo: false,
      dispatch_finalizado_em: new Date().toISOString(),
    })
    .eq("id", corridaId);

  // Avisa fretistas notificados (dispatch_prestadores) que cancelou
  const prestadoresNotificados =
    (corrida.dispatch_prestadores as string[] | null) || [];
  let avisados = 0;
  for (const tel of prestadoresNotificados) {
    try {
      await sendToClient({
        to: tel,
        message: `❌ *Corrida cancelada*\n\nA corrida que te enviamos foi cancelada (era teste do sistema). Sem problema! 🚚`,
      });
      avisados++;
    } catch {
      // ok
    }
  }

  // Loga
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "corrida_cancelada_admin_teste",
      corrida_id: corridaId,
      prestadores_avisados: avisados,
    },
  });

  return NextResponse.json({
    ok: true,
    corrida_id: corridaId,
    status_anterior: corrida.status,
    fretistas_avisados: avisados,
  });
}
