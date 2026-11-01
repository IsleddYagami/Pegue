import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { geocodeAddress } from "@/lib/bot-utils";
import {
  areaIndisponivel,
  decidirCotacao,
  MENSAGEM_RECUSA,
  normalizarPedido,
} from "@/lib/cotacao";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cotacao publica pro site. Mesmo motor que o bot usa, mesma distancia (com o
// fator de rota 1.3), mesma zona: o numero da tela e o numero do WhatsApp.
//
// A rota faz so I/O — rate limit, geocode, resposta. A regra de "pode cotar ou
// nao" mora em lib/cotacao.ts, que tem teste. LEI: jamais cotar sem certeza.

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit({ chave: `cotar_pub:${ip}`, max: 20 });
  if (!rl.permitido) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "muitas_tentativas",
        mensagem: "Muitas cotações seguidas. Aguarde 1 minuto.",
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, motivo: "json_invalido" }, { status: 400 });
  }

  const pedido = normalizarPedido(body);
  if (!pedido) {
    return NextResponse.json(
      { ok: false, motivo: "faltou_endereco", mensagem: MENSAGEM_RECUSA.faltou_endereco },
      { status: 400 },
    );
  }

  // Area nao atendida se recusa antes de gastar chamada de geocode.
  if (areaIndisponivel(pedido)) {
    return NextResponse.json({
      ok: false,
      motivo: "area_indisponivel",
      precisaHumano: true,
      mensagem: MENSAGEM_RECUSA.area_indisponivel,
    });
  }

  // geocodeAddress rejeita partial=true do Google (Google adivinhando pedaco do
  // endereco). null aqui = endereco NAO confirmado = nao sai preco.
  const [geoOrigem, geoDestino] = await Promise.all([
    geocodeAddress(pedido.origem),
    geocodeAddress(pedido.destino),
  ]);

  const r = decidirCotacao(pedido, geoOrigem, geoDestino);

  if (!r.ok) {
    return NextResponse.json({ ...r, mensagem: MENSAGEM_RECUSA[r.motivo] });
  }

  return NextResponse.json({
    ok: true,
    km: r.km,
    zona: r.zona,
    cidadeOrigem: r.cidadeOrigem,
    cidadeDestino: r.cidadeDestino,
    adicionais: {
      ajudante: pedido.ajudante,
      andares: pedido.andares,
      elevador: pedido.elevador,
      dataAgendada: pedido.dataAgendada,
    },
    precos: r.precos,
  });
}
