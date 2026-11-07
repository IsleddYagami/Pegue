import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { fetchComTimeout } from "@/lib/fetch-utils";
import {
  MAX_SUGESTOES,
  MIN_LETRAS_BUSCA,
  normalizarSugestoes,
  urlNominatim,
} from "@/lib/busca-bairro";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Sugestao de "Bairro · Cidade" enquanto a pessoa escreve o bairro.
//
// Por que passa pelo nosso servidor em vez de o navegador chamar o Nominatim
// direto: a politica de uso deles pede User-Agent identificado e um pedido por
// segundo. Navegador de cliente nao obedece nada disso — e o /api/geocode daqui
// ja foi fechado por esse motivo exato (BUG #BATCH5-3).
//
// A tela NUNCA fica presa nisto: se a busca falhar, der timeout ou vier vazia,
// a pessoa escolhe a cidade na lista local dos 645 municipios. Sugestao e
// atalho, nao caminho unico.

// Cache em memoria do processo. Nao e banco: vive enquanto a instancia viver.
// Serve pro caso comum — varias pessoas digitando "centro", "jardim", "vila".
const CACHE = new Map<string, { em: number; dados: unknown }>();
const VALIDADE_MS = 10 * 60 * 1000;
const MAX_CACHE = 300;

function doCache(chave: string): unknown | null {
  const achado = CACHE.get(chave);
  if (!achado) return null;
  if (Date.now() - achado.em > VALIDADE_MS) {
    CACHE.delete(chave);
    return null;
  }
  return achado.dados;
}

function guardaNoCache(chave: string, dados: unknown): void {
  if (CACHE.size >= MAX_CACHE) {
    const primeira = CACHE.keys().next().value;
    if (primeira !== undefined) CACHE.delete(primeira);
  }
  CACHE.set(chave, { em: Date.now(), dados });
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  // Digitacao gera varias buscas: 40/min por IP cobre alguem escrevendo com
  // calma dois bairros, e corta robo.
  const rl = await checkRateLimit({ chave: `bairros:${ip}`, max: 40 });
  if (!rl.permitido) {
    return NextResponse.json(
      { ok: false, motivo: "muitas_tentativas", sugestoes: [] },
      { status: 429 },
    );
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 60);
  if (q.length < MIN_LETRAS_BUSCA) {
    return NextResponse.json({ ok: true, sugestoes: [] });
  }

  const chave = q.toLowerCase();
  const emCache = doCache(chave);
  if (emCache) {
    return NextResponse.json({
      ok: true,
      sugestoes: normalizarSugestoes(emCache, q, MAX_SUGESTOES),
      cache: true,
    });
  }

  try {
    const r = await fetchComTimeout(
      urlNominatim(q),
      { headers: { "User-Agent": "Pegue-Bot/1.0 (https://www.chamepegue.com.br)" } },
      6000,
    );
    if (!r.ok) {
      // Nominatim fora do ar nao e erro do cliente: a tela cai no caminho
      // manual e segue. Por isso 200 com lista vazia, e nao 502.
      return NextResponse.json({ ok: true, sugestoes: [], fonteIndisponivel: true });
    }
    const bruto = await r.json();
    guardaNoCache(chave, bruto);
    return NextResponse.json({ ok: true, sugestoes: normalizarSugestoes(bruto, q, MAX_SUGESTOES) });
  } catch {
    return NextResponse.json({ ok: true, sugestoes: [], fonteIndisponivel: true });
  }
}
