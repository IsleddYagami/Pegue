// Decisao da cotacao do site, separada do I/O pra poder ser testada.
// A rota /api/cotar faz rate limit e geocode; TODA a regra de "pode cotar ou nao"
// mora aqui.
//
// LEI: jamais cotar sem certeza. Esta camada so devolve preco quando os dois
// enderecos foram confirmados pelo geocoder, caem dentro do estado de Sao Paulo
// e a area e atendida. Em qualquer outro caso devolve recusa com motivo —
// nunca um numero aproximado.

import { calcularDistanciaKm, calcularPrecosCompleto, detectarZona } from "./bot-utils";

export const MAX_ENDERECO = 200;
export const MAX_ANDARES = 30;

export type MotivoRecusa =
  | "faltou_endereco"
  | "area_indisponivel"
  | "origem_nao_validada"
  | "destino_nao_validado"
  | "origem_fora_do_estado"
  | "destino_fora_do_estado"
  | "mesma_origem_e_destino";

export interface PedidoCotacao {
  origem: string;
  destino: string;
  ajudante: boolean;
  elevador: boolean;
  andares: number;
  dataAgendada: string | null;
}

export type Ponto = { lat: number; lng: number; uf?: string | null; cidade?: string | null };

/**
 * A Pegue atende o estado de Sao Paulo: capital, litoral paulista e interior
 * paulista. Fora disso nao sai preco na tela — vai pro atendimento.
 */
export const UF_ATENDIDA = "SP";

/**
 * Caixa do estado de Sao Paulo, usada SO quando o geocoder nao disse a UF.
 * E rede de seguranca, nao fronteira: generosa nas bordas de proposito, mas
 * corta de longe qualquer coisa fora do estado (Manaus, Bahia, Sul do Parana).
 */
const CAIXA_SP = { latMin: -25.4, latMax: -19.7, lngMin: -53.2, lngMax: -44.1 };

/** Ponto que a Pegue nao atende: outra UF, ou fora da caixa quando a UF e desconhecida. */
export function foraDoEstado(p: Ponto): boolean {
  const uf = typeof p.uf === "string" ? p.uf.trim().toUpperCase() : "";
  if (uf) return uf !== UF_ATENDIDA;
  return (
    p.lat < CAIXA_SP.latMin ||
    p.lat > CAIXA_SP.latMax ||
    p.lng < CAIXA_SP.lngMin ||
    p.lng > CAIXA_SP.lngMax
  );
}

export type Recusa = { ok: false; motivo: MotivoRecusa; precisaHumano: boolean };

export type Cotacao = {
  ok: true;
  km: number;
  // Cidade que o geocoder confirmou pra cada ponta. Vai pra tela: e assim que
  // o cliente percebe que "Pompeia" virou a cidade do interior e nao o bairro.
  cidadeOrigem: string | null;
  cidadeDestino: string | null;
  zona: ReturnType<typeof detectarZona>;
  precos: ReturnType<typeof calcularPrecosCompleto>;
};

function textoEndereco(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length < 3 || t.length > MAX_ENDERECO) return null;
  return t;
}

/** Normaliza o corpo cru do request. Devolve null quando falta endereco valido. */
export function normalizarPedido(body: unknown): PedidoCotacao | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const origem = textoEndereco(b.origem);
  const destino = textoEndereco(b.destino);
  if (!origem || !destino) return null;

  const andaresRaw = typeof b.andares === "number" && Number.isFinite(b.andares) ? b.andares : 0;
  const elevador = b.elevador === true;

  return {
    origem,
    destino,
    ajudante: b.ajudante === true,
    elevador,
    // Escada e elevador nao somam: se tem elevador, o numero de andares nao cobra.
    andares: Math.min(Math.max(Math.trunc(andaresRaw), 0), MAX_ANDARES),
    dataAgendada:
      typeof b.dataAgendada === "string" && b.dataAgendada.trim() ? b.dataAgendada.trim() : null,
  };
}

/**
 * Area indisponivel se checa antes do geocode: e recusa de atendimento, nao
 * problema de endereco. Vale pra origem e pra destino.
 */
export function areaIndisponivel(pedido: PedidoCotacao): boolean {
  return (
    detectarZona(pedido.destino) === "indisponivel" ||
    detectarZona(pedido.origem) === "indisponivel"
  );
}

/**
 * Decide a cotacao depois do geocode. `geoOrigem`/`geoDestino` null significam
 * endereco NAO confirmado — e ai nao sai preco.
 */
export function decidirCotacao(
  pedido: PedidoCotacao,
  geoOrigem: Ponto | null,
  geoDestino: Ponto | null,
): Cotacao | Recusa {
  if (areaIndisponivel(pedido)) {
    return { ok: false, motivo: "area_indisponivel", precisaHumano: true };
  }
  if (!geoOrigem) {
    return { ok: false, motivo: "origem_nao_validada", precisaHumano: true };
  }
  if (!geoDestino) {
    return { ok: false, motivo: "destino_nao_validado", precisaHumano: true };
  }

  // Fora do estado de Sao Paulo nao sai preco. A lista de zonas so conhece
  // bairros da Grande SP: sem esta trava, Manaus caia em "normal" e a formula
  // de distancia, que nao tem teto, cuspia um numero na tela.
  if (foraDoEstado(geoOrigem)) {
    return { ok: false, motivo: "origem_fora_do_estado", precisaHumano: true };
  }
  if (foraDoEstado(geoDestino)) {
    return { ok: false, motivo: "destino_fora_do_estado", precisaHumano: true };
  }

  const km = calcularDistanciaKm(geoOrigem.lat, geoOrigem.lng, geoDestino.lat, geoDestino.lng);

  // Os dois enderecos cairam no mesmo ponto: nao e frete, e erro de digitacao.
  // Nao inventa o minimo da tabela pra ter um numero pra mostrar.
  if (km <= 0) {
    return { ok: false, motivo: "mesma_origem_e_destino", precisaHumano: false };
  }

  return {
    ok: true,
    km,
    cidadeOrigem: geoOrigem.cidade ?? null,
    cidadeDestino: geoDestino.cidade ?? null,
    zona: detectarZona(pedido.destino),
    precos: calcularPrecosCompleto(
      km,
      pedido.ajudante,
      pedido.andares,
      pedido.elevador,
      pedido.destino,
      pedido.dataAgendada,
    ),
  };
}

/** Texto que o cliente le. Fica aqui pra recusa e mensagem nunca se separarem. */
export const MENSAGEM_RECUSA: Record<MotivoRecusa, string> = {
  faltou_endereco: "Informe de onde sai e para onde vai.",
  area_indisponivel:
    "Esse endereço fica numa área que a gente não atende sem combinar antes. Fala com a gente no WhatsApp que a gente vê o que dá pra fazer.",
  origem_nao_validada:
    "Não consegui confirmar o endereço de saída. Põe a rua com número e o bairro, ou fala com a gente no WhatsApp.",
  destino_nao_validado:
    "Não consegui confirmar o endereço de entrega. Põe a rua com número e o bairro, ou fala com a gente no WhatsApp.",
  origem_fora_do_estado:
    "A Pegue atende São Paulo: a capital, o litoral e o interior paulista. O endereço de saída caiu fora do estado. Se eu entendi errado, fala com a gente no WhatsApp.",
  destino_fora_do_estado:
    "A Pegue atende São Paulo: a capital, o litoral e o interior paulista. O endereço de entrega caiu fora do estado. Se eu entendi errado, fala com a gente no WhatsApp.",
  mesma_origem_e_destino: "A saída e a entrega caíram no mesmo lugar. Confere os dois endereços.",
};
