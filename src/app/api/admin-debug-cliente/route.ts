import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey, isValidCronKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Endpoint admin pra debugar 1 cliente especifico em prod. Retorna:
// - sessao atual em bot_sessions
// - ultimas 50 conversas em conversas_whatsapp (in + out)
// - ultimos 50 bot_logs do phone (full e mascarado)
// - corridas associadas
//
// Uso: ?key=ADMIN_KEY_OR_CRON_SECRET&phone=5511971429605
//
// Criado 7/Mai/2026 pra investigar clientes que travam em
// aguardando_servico — apos feedback Fabio: smoke E2E nao pega esses
// casos porque smoke usa caminho deterministico ("oi" -> "1") enquanto
// cliente real chega com texto livre/briefings/perguntas.
export async function GET(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidAdminKey(key) && !isValidCronKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const phoneRaw = req.nextUrl.searchParams.get("phone") || "";
  // Aceita formatos: 6191175422, 556191175422, 5561991175422, +5561...
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  // Variantes pra busca: tenta os 3 formatos comuns
  const variantes = new Set<string>();
  variantes.add(phoneDigits);
  if (!phoneDigits.startsWith("55")) variantes.add(`55${phoneDigits}`);
  if (phoneDigits.startsWith("55") && phoneDigits.length > 10) {
    variantes.add(phoneDigits.slice(2));
  }
  // Mascarado pra busca em logs
  const phoneMaskedVariantes = Array.from(variantes).map((p) =>
    p.replace(/\d(?=\d{4})/g, "*"),
  );

  const variantesArr = Array.from(variantes);

  // 1) Sessoes (uma por phone normalmente)
  const { data: sessoes } = await supabase
    .from("bot_sessions")
    .select("*")
    .in("phone", variantesArr);

  // 2) Cliente cadastrado
  const { data: clientes } = await supabase
    .from("clientes")
    .select("*")
    .in("telefone", variantesArr);

  // 3) Conversas (in + out) — ordenadas por mais recentes primeiro
  const { data: conversas } = await supabase
    .from("conversas_whatsapp")
    .select("direcao, conteudo, tipo, criado_em, metadata")
    .in("telefone", variantesArr)
    .order("criado_em", { ascending: false })
    .limit(50);

  // 4) Bot logs por phone (full)
  const { data: logsFull } = await supabase
    .from("bot_logs")
    .select("payload, criado_em")
    .in("payload->>phone", variantesArr)
    .order("criado_em", { ascending: false })
    .limit(50);

  // 5) Bot logs mascarados
  const { data: logsMasked } = await supabase
    .from("bot_logs")
    .select("payload, criado_em")
    .in("payload->>phone_masked", phoneMaskedVariantes)
    .order("criado_em", { ascending: false })
    .limit(50);

  // 6) Corridas (via cliente_id se existir)
  let corridas: unknown[] = [];
  if (clientes && clientes.length > 0) {
    const clienteIds = clientes.map((c: { id: string }) => c.id);
    const { data } = await supabase
      .from("corridas")
      .select("id, codigo, status, valor_estimado, valor_final, prestador_id, dispatch_ativo, asaas_payment_id, criado_em, descricao_carga, origem_endereco, destino_endereco")
      .in("cliente_id", clienteIds)
      .order("criado_em", { ascending: false })
      .limit(20);
    corridas = data || [];
  }

  // Junta + ordena logs por timestamp
  const todosLogs = [...(logsFull || []), ...(logsMasked || [])];
  const dedup = new Map<string, { payload: unknown; criado_em: string }>();
  for (const l of todosLogs) dedup.set(`${l.criado_em}-${JSON.stringify(l.payload).slice(0, 50)}`, l);
  const logsOrdenados = Array.from(dedup.values())
    .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))
    .slice(0, 80);

  return NextResponse.json({
    phone_input: phoneRaw,
    phone_digits: phoneDigits,
    variantes_buscadas: variantesArr,
    sessoes: sessoes || [],
    clientes: clientes || [],
    qtd_conversas: (conversas || []).length,
    conversas: conversas || [],
    qtd_logs: logsOrdenados.length,
    logs: logsOrdenados.map((l) => ({
      ts: l.criado_em,
      tipo: (l.payload as Record<string, unknown>)?.tipo,
      payload: l.payload,
    })),
    corridas,
  });
}
