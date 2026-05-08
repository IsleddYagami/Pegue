import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey, isValidCronKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Endpoint pra puxar as ultimas N sessoes de clientes reais com TODA conversa
// pra eu (Claude) caçar padroes de bugs proativamente.
// Nao filtra por step nem por sucesso — quero tudo, inclusive abandono.

export async function GET(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidAdminKey(key) && !isValidCronKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit") || "50");
  const dias = Number(req.nextUrl.searchParams.get("dias") || "30");
  const desde = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();

  // Pega clientes reais (filtra smoke + admin pelos prefixos conhecidos)
  const { data: sessoes } = await supabase
    .from("bot_sessions")
    .select("phone, step, origem_endereco, destino_endereco, descricao_carga, valor_estimado, criado_em, atualizado_em, msgs_contador")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(200);

  type Sessao = {
    phone: string;
    step: string;
    origem_endereco: string | null;
    destino_endereco: string | null;
    descricao_carga: string | null;
    valor_estimado: number | null;
    criado_em: string;
    atualizado_em: string;
    msgs_contador: number;
  };

  const reais = ((sessoes || []) as Sessao[])
    .filter((s) => !/^55000\d+$/.test(s.phone))
    .filter((s) => s.msgs_contador >= 2) // ignora quem nem mandou 2 msgs
    .slice(0, limit);

  // Pra cada sessao, pega conversas
  const sessoesComConvs: Array<{
    phone: string;
    step_final: string;
    origem: string | null;
    destino: string | null;
    descricao: string | null;
    valor: number | null;
    msgs_total: number;
    criado_em: string;
    atualizado_em: string;
    conversas: Array<{ direcao: string; tipo: string; conteudo: string; ts: string }>;
  }> = [];

  for (const s of reais) {
    const { data: convs } = await supabase
      .from("conversas_whatsapp")
      .select("direcao, tipo, conteudo, criado_em")
      .eq("telefone", s.phone)
      .order("criado_em", { ascending: true })
      .limit(80);
    sessoesComConvs.push({
      phone: s.phone,
      step_final: s.step,
      origem: s.origem_endereco,
      destino: s.destino_endereco,
      descricao: s.descricao_carga,
      valor: s.valor_estimado,
      msgs_total: s.msgs_contador,
      criado_em: s.criado_em,
      atualizado_em: s.atualizado_em,
      conversas: (convs || []).map((c) => ({
        direcao: c.direcao,
        tipo: c.tipo,
        conteudo: c.conteudo,
        ts: c.criado_em,
      })),
    });
  }

  return NextResponse.json({
    qtd: sessoesComConvs.length,
    periodo_dias: dias,
    sessoes: sessoesComConvs,
  });
}
