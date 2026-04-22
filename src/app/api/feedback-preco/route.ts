import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { calcularPrecos } from "@/lib/bot-utils";

export const dynamic = "force-dynamic";

// GET - calcula preco baseado nos parametros (sem salvar nada)
// Endpoint publico, SEM senha - usado pela pagina /precos
export async function GET(req: NextRequest) {
  try {
    const veiculo = req.nextUrl.searchParams.get("veiculo") || "utilitario";
    const distancia = parseInt(req.nextUrl.searchParams.get("distancia") || "10");
    const temAjudante = req.nextUrl.searchParams.get("ajudante") === "true";
    const zona = req.nextUrl.searchParams.get("zona") || "normal";

    const enderecoZona = zona === "fundao" ? "Capao Redondo - SP" : zona === "dificil" ? "Itapevi - SP" : "Centro - SP";
    const precos = calcularPrecos(distancia, veiculo, temAjudante, 0, false, enderecoZona);

    return NextResponse.json({
      preco: precos.padrao.total,
      base: precos.padrao.base,
      ajudante: precos.padrao.ajudante,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

// POST - salva feedback do fretista
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validacao minima
    if (!body.veiculo || !body.itens || !body.opiniao) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }
    if (!["barato", "justo", "caro"].includes(body.opiniao)) {
      return NextResponse.json({ error: "Opiniao invalida" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;

    const { error } = await supabase.from("feedback_precos").insert({
      veiculo: body.veiculo,
      itens: body.itens,
      qtd_itens: body.qtdItens || 0,
      distancia_km: body.distanciaKm || 0,
      tem_ajudante: body.temAjudante || false,
      zona: body.zona || "normal",
      preco_calculado: body.precoCalculado || 0,
      opiniao: body.opiniao,
      fretista_nome: body.fretistaNome?.trim() || null,
      fretista_telefone: body.fretistaTelefone?.replace(/\D/g, "") || null,
      comentario: body.comentario?.trim() || null,
      ip,
    });

    if (error) {
      console.error("Erro salvar feedback:", error.message);
      return NextResponse.json({ error: "Erro ao salvar" }, { status: 500 });
    }

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
