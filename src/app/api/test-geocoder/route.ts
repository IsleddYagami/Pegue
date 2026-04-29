// Smoke test geocoder. Roda enderecos conhecidos (incluindo o que falhou
// em prod com cliente Vila Atlantico) e mostra qual fonte resolveu.
//
// Uso: GET /api/test-geocoder
//      GET /api/test-geocoder?endereco=texto+livre
//
// Endereco custom permite testar individualmente. Sem param, roda bateria
// completa. Resultado mostra fonte (google/nominatim) + coords + tempo.

import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/bot-utils";
import { googleGeocode, googleGeocodeAtivo } from "@/lib/geocoder-google";
import { interpretarEnderecoComIA } from "@/lib/geocoder-ia";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BATERIA_PADRAO = [
  // Casos faceis (Nominatim ja resolve)
  { nome: "Av Paulista numero certo", endereco: "Av Paulista 1000, Bela Vista, Sao Paulo" },
  { nome: "Rua Augusta", endereco: "Rua Augusta 500, Consolacao, Sao Paulo" },
  // Periferia SP — Nominatim historicamente falha
  { nome: "Capao Redondo", endereco: "Estrada do Campo Limpo 5000, Capao Redondo, Sao Paulo" },
  { nome: "Cidade Tiradentes", endereco: "Avenida dos Metalurgicos 100, Cidade Tiradentes, Sao Paulo" },
  // Caso real cliente 28/Abr — Vila Atlantico (BA, NAO em SP)
  { nome: "Vila Atlantico texto cru cliente real", endereco: "Rua gasparino de quadros n 52 uma travessa da rua Coronel José Venâncio dias perto do céu Vila Atlântico" },
  { nome: "Vila Atlantico limpo", endereco: "Rua Gasparino de Quadros 52, Vila Atlantico, Lauro de Freitas, BA" },
  // Bairro vago (sem rua)
  { nome: "So bairro", endereco: "Brooklin, Sao Paulo" },
  // Endereco com erro de digitacao
  { nome: "Erro de digitacao", endereco: "av paulsta 1000 SP" },
];

async function testarUm(nome: string, endereco: string) {
  const inicio = Date.now();
  const resultado: any = { nome, endereco_input: endereco };

  // 1. Forward geocode (Google se ativo + Nominatim fallback)
  const coords = await geocodeAddress(endereco);
  resultado.coords = coords;
  resultado.duracao_ms = Date.now() - inicio;

  // 2. Tambem testa Google direto (mostra precisao + partial real)
  let googlePartial = false;
  if (googleGeocodeAtivo()) {
    const g = await googleGeocode(endereco);
    resultado.google = g
      ? {
          precisao: g.precisao,
          partial: g.partial,
          enderecoFormatado: g.enderecoFormatado,
        }
      : null;
    googlePartial = !!g?.partial;
  }

  // Critério de sucesso REAL: tem coords E nao foi adivinhado.
  // Se geocodeAddress retornou null OU Google chutou (partial=true), conta como falha.
  resultado.sucesso = !!coords && !googlePartial;
  if (coords && googlePartial) {
    resultado.alerta = "Google partial=true — adivinhou. Caindo pro Nominatim, mas pode dar coords de fallback questionaveis.";
  }

  // 3. Se falhou ou tem alerta, mostra o que IA extrairia (debug)
  if (!resultado.sucesso) {
    const ia = await interpretarEnderecoComIA(endereco);
    resultado.ia_extraiu = ia;
  }

  return resultado;
}

export async function GET(req: NextRequest) {
  const enderecoCustom = req.nextUrl.searchParams.get("endereco");

  const config = {
    google_ativo: googleGeocodeAtivo(),
    google_key_presente: !!process.env.GOOGLE_MAPS_API_KEY,
    openai_ativo: !!process.env.OPENAI_API_KEY,
  };

  if (enderecoCustom) {
    const r = await testarUm("custom", enderecoCustom);
    return NextResponse.json({ config, resultado: r });
  }

  const resultados: any[] = [];
  for (const caso of BATERIA_PADRAO) {
    const r = await testarUm(caso.nome, caso.endereco);
    resultados.push(r);
  }

  const total = resultados.length;
  const sucessos = resultados.filter((r) => r.sucesso).length;

  return NextResponse.json({
    config,
    resumo: {
      total,
      sucessos,
      falhas: total - sucessos,
      taxa: `${Math.round((sucessos / total) * 100)}%`,
    },
    resultados,
  });
}
