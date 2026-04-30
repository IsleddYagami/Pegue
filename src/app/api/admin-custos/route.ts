import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Agrega custos de IA dos logs `bot_logs` com payload->>tipo='custo_estimado_ia'.
// Cobertura: 24h / 7d / 30d, agrupando por servico e por modelo.
// Custo eh estimado (cada chamada loga `custo_usd_estimado`), nao real do
// dashboard OpenAI — divergencia esperada de 5-15% pra mais ou menos.
export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const agora = Date.now();
  const janelas = {
    "24h": new Date(agora - 24 * 60 * 60 * 1000).toISOString(),
    "7d": new Date(agora - 7 * 24 * 60 * 60 * 1000).toISOString(),
    "30d": new Date(agora - 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  // Busca logs dos ultimos 30d (janela maior). Em memoria filtra por janelas menores.
  const { data, error } = await supabase
    .from("bot_logs")
    .select("criado_em,payload")
    .eq("payload->>tipo", "custo_estimado_ia")
    .gte("criado_em", janelas["30d"])
    .order("criado_em", { ascending: false })
    .limit(50000); // limite alto pra agregacao precisa

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Linha = { criado_em: string; payload: any };
  const linhas = (data || []) as Linha[];

  function agregar(desde: string) {
    let total = 0;
    let chamadas = 0;
    const porServico: Record<string, { custo: number; chamadas: number }> = {};
    const porModelo: Record<string, { custo: number; chamadas: number }> = {};
    for (const l of linhas) {
      if (l.criado_em < desde) continue;
      const custo = Number(l.payload?.custo_usd_estimado || 0);
      const servico = String(l.payload?.servico || "desconhecido");
      const modelo = String(l.payload?.modelo || "desconhecido");
      total += custo;
      chamadas++;
      if (!porServico[servico]) porServico[servico] = { custo: 0, chamadas: 0 };
      porServico[servico].custo += custo;
      porServico[servico].chamadas++;
      if (!porModelo[modelo]) porModelo[modelo] = { custo: 0, chamadas: 0 };
      porModelo[modelo].custo += custo;
      porModelo[modelo].chamadas++;
    }
    return { total, chamadas, porServico, porModelo };
  }

  return NextResponse.json({
    "24h": agregar(janelas["24h"]),
    "7d": agregar(janelas["7d"]),
    "30d": agregar(janelas["30d"]),
    atualizado_em: new Date().toISOString(),
  });
}
