import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey, isValidCronKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Endpoint pra ver conversa de QUALQUER cliente em tempo real, junto com
// estado da sessao e ultimos bot_logs. Pra Fabio acompanhar atendimento
// ao vivo de cliente real (8/Mai/2026).
//
// GET ?key=KEY&phone=556191175422&limit=50

export async function GET(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidAdminKey(key) && !isValidCronKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const phoneRaw = req.nextUrl.searchParams.get("phone") || "";
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  const limit = Number(req.nextUrl.searchParams.get("limit") || "50");

  if (!phoneDigits) {
    return NextResponse.json({ error: "phone parametro obrigatorio" }, { status: 400 });
  }

  // Variantes do phone (com/sem DDI 55)
  const variantes = [phoneDigits];
  if (phoneDigits.length === 11) variantes.push("55" + phoneDigits);
  if (phoneDigits.length === 10) variantes.push("55" + phoneDigits);
  if (phoneDigits.length >= 12 && phoneDigits.startsWith("55")) {
    variantes.push(phoneDigits.slice(2));
  }

  // Sessao
  const { data: sessao } = await supabase
    .from("bot_sessions")
    .select("phone, step, origem_endereco, origem_lat, origem_lng, destino_endereco, destino_lat, destino_lng, descricao_carga, veiculo_sugerido, distancia_km, valor_estimado, data_agendada, corrida_id, atualizado_em, criado_em, msgs_contador")
    .in("phone", variantes)
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Cliente
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome, telefone, criado_em, total_corridas")
    .in("telefone", variantes)
    .maybeSingle();

  // Conversas ordenadas
  const { data: conversas } = await supabase
    .from("conversas_whatsapp")
    .select("conteudo, direcao, tipo, criado_em")
    .in("telefone", variantes)
    .order("criado_em", { ascending: false })
    .limit(limit);

  // Bot logs do phone — 1 query por variante (operador in com payload->>X
  // tem sintaxe quirky no PostgREST, melhor query separada)
  const phoneMasked = phoneDigits.replace(/\d(?=\d{4})/g, "*");
  const logsFull: { payload: unknown; criado_em: string }[] = [];
  for (const v of variantes) {
    const { data } = await supabase
      .from("bot_logs")
      .select("payload, criado_em")
      .filter("payload->>phone", "eq", v)
      .order("criado_em", { ascending: false })
      .limit(20);
    if (data) logsFull.push(...data);
  }
  const { data: logsMasked } = await supabase
    .from("bot_logs")
    .select("payload, criado_em")
    .filter("payload->>phone_masked", "eq", phoneMasked)
    .order("criado_em", { ascending: false })
    .limit(20);
  const todosLogs = [...logsFull, ...(logsMasked || [])];
  const dedupMap = new Map<string, { payload: unknown; criado_em: string }>();
  for (const l of todosLogs) dedupMap.set(l.criado_em, l);
  const logs = Array.from(dedupMap.values())
    .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))
    .slice(0, 30);

  return NextResponse.json({
    phone_buscado: phoneDigits,
    variantes,
    sessao: sessao || null,
    cliente: cliente || null,
    conversas: (conversas || []).reverse(), // ordem cronologica
    logs: logs.map((l) => ({
      ts: l.criado_em,
      tipo: (l.payload as Record<string, unknown>)?.tipo,
      payload: l.payload,
    })),
  });
}
