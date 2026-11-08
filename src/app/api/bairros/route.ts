import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { fetchComTimeout } from "@/lib/fetch-utils";
import {
  MAX_SUGESTOES,
  MIN_LETRAS_BUSCA,
  normalizarSugestoes,
  urlNominatim,
  type SugestaoBairro,
} from "@/lib/busca-bairro";
import {
  FIELD_MASK,
  URL_AUTOCOMPLETE,
  corpoAutocomplete,
  normalizarGoogle,
} from "@/lib/busca-bairro-google";
import { consumirCotaMensal } from "@/lib/cota-mensal";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Sugestao de "Bairro · Cidade" enquanto a pessoa escreve o bairro.
//
// DUAS FONTES, NESTA ORDEM:
//  1. Google Places Autocomplete — tem os bairros que o OSM nao tem (Vila
//     Yara, em Osasco, e o caso que o Fabio pegou). So entra se a chave
//     existir E se a cota do mes permitir (lib/cota-mensal): a ordem dele foi
//     *"se esse recurso eu nao gastar nada ok"*, entao o gasto zero e trava.
//  2. Nominatim/OpenStreetMap — de graca, sem chave, sem teto. Entra quando o
//     Google esta desligado, estourou o teto, falhou, ou nao achou nada.
//
// E se as duas falharem, a tela cai no caminho manual: escolher a cidade na
// lista local dos 645 municipios. Sugestao e atalho, nunca caminho unico.
//
// Por que passa pelo nosso servidor em vez de o navegador chamar direto: a
// politica do Nominatim pede User-Agent identificado e um pedido por segundo,
// e a chave do Google nao pode ir pro navegador. O /api/geocode daqui ja foi
// fechado por esse motivo exato (BUG #BATCH5-3).

// Cache em memoria do processo, ja normalizado. Nao e banco: vive enquanto a
// instancia viver. Serve pro caso comum — muita gente digita "centro",
// "jardim", "vila" — e cada acerto dele e uma chamada paga que nao acontece.
const CACHE = new Map<string, { em: number; sugestoes: SugestaoBairro[] }>();
const VALIDADE_MS = 10 * 60 * 1000;
const MAX_CACHE = 300;

// Se o Google responder "API nao habilitada", para de tentar por 30 min em vez
// de queimar latencia em toda busca. Passados os 30 min tenta de novo sozinho:
// no dia em que a Places API for ligada no console, isto volta a funcionar sem
// precisar de deploy.
const ESQUECER_DESLIGADO_MS = 30 * 60 * 1000;
let googleDesligadoEm = 0;

function doCache(chave: string): SugestaoBairro[] | null {
  const achado = CACHE.get(chave);
  if (!achado) return null;
  if (Date.now() - achado.em > VALIDADE_MS) {
    CACHE.delete(chave);
    return null;
  }
  return achado.sugestoes;
}

function guardaNoCache(chave: string, sugestoes: SugestaoBairro[]): void {
  if (CACHE.size >= MAX_CACHE) {
    const primeira = CACHE.keys().next().value;
    if (primeira !== undefined) CACHE.delete(primeira);
  }
  CACHE.set(chave, { em: Date.now(), sugestoes });
}

/**
 * Tenta o Google. Devolve [] em qualquer tropeco — quem chama cai pro OSM.
 * Nunca lanca, nunca chama sem contar na cota.
 */
async function tentarGoogle(q: string): Promise<SugestaoBairro[]> {
  const chave = process.env.GOOGLE_MAPS_API_KEY;
  if (!chave) return [];
  if (Date.now() - googleDesligadoEm < ESQUECER_DESLIGADO_MS) return [];

  const cota = await consumirCotaMensal({ servico: "google-places-autocomplete" });
  if (!cota.permitido) {
    console.warn(
      `[bairros] teto do mes ${cota.mes} atingido (${cota.contador}/${cota.teto}) — usando OpenStreetMap`,
    );
    return [];
  }

  try {
    const r = await fetchComTimeout(
      URL_AUTOCOMPLETE,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": chave,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(corpoAutocomplete(q)),
      },
      5000,
    );

    if (!r.ok) {
      // 403 = chave sem permissao; 400 com SERVICE_DISABLED = Places nao
      // habilitada no projeto. Nos dois casos nao e erro de busca: e config.
      if (r.status === 403 || r.status === 400) {
        googleDesligadoEm = Date.now();
        console.warn(`[bairros] Google Places recusou (HTTP ${r.status}) — caindo pro OSM`);
      }
      return [];
    }

    return normalizarGoogle(await r.json(), q, MAX_SUGESTOES);
  } catch {
    return [];
  }
}

/** Nominatim: de graca, sem chave, sem teto. A rede de seguranca. */
async function tentarOsm(q: string): Promise<SugestaoBairro[]> {
  try {
    const r = await fetchComTimeout(
      urlNominatim(q),
      { headers: { "User-Agent": "Pegue-Bot/1.0 (https://www.chamepegue.com.br)" } },
      6000,
    );
    if (!r.ok) return [];
    return normalizarSugestoes(await r.json(), q, MAX_SUGESTOES);
  } catch {
    return [];
  }
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
    return NextResponse.json({ ok: true, sugestoes: emCache, cache: true });
  }

  const doGoogle = await tentarGoogle(q);
  if (doGoogle.length > 0) {
    guardaNoCache(chave, doGoogle);
    return NextResponse.json({ ok: true, sugestoes: doGoogle, fonte: "google" });
  }

  const doOsm = await tentarOsm(q);
  if (doOsm.length > 0) {
    guardaNoCache(chave, doOsm);
    return NextResponse.json({ ok: true, sugestoes: doOsm, fonte: "osm" });
  }

  // Ninguem achou. 200 com lista vazia (e nao erro): a tela abre sozinha o
  // caminho manual da cidade e a pessoa segue cotando.
  return NextResponse.json({ ok: true, sugestoes: [], fonteIndisponivel: true });
}
