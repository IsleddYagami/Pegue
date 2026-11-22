// TRAVA DA CIDADE — 21/Nov/2026.
//
// O defeito que isto impede de voltar, MEDIDO no site no ar:
//   "Centro, Sao Paulo, SP"  -> o Google devolveu DIADEMA, 29,2 km
//   "Centro, Diadema, SP"    -> o mesmo ponto, 29,2 km
//   "Se, Sao Paulo, SP"      -> Sao Paulo de verdade, 18,6 km
// A capital nao tem bairro "Centro" oficial, entao o Google escolhe o Centro de
// outra cidade — e NAO marca partial, que era a unica trava que existia aqui.
// Resultado: preco de Diadema pra quem disse Sao Paulo.
//
// Regra: o mapa tem que confirmar A MESMA cidade que a pessoa escolheu na tela.
// Nao confirmou, nao sai preco — vai pro humano (LEI: jamais cotar sem certeza).

import { describe, it, expect } from "vitest";
import {
  decidirCotacao,
  normalizarPedido,
  cidadeConfere,
  nomeComparavel,
  pontoDaCidadeEscolhida,
  TOLERANCIA_BORDA_KM,
} from "./cotacao";

const OSASCO = { lat: -23.5329, lng: -46.7916, uf: "SP", cidade: "Osasco" };
const SAO_PAULO = { lat: -23.5505, lng: -46.6333, uf: "SP", cidade: "São Paulo" };
const DIADEMA = { lat: -23.6861, lng: -46.6228, uf: "SP", cidade: "Diadema" };

function pedir(extra: Record<string, unknown> = {}) {
  const p = normalizarPedido({
    origem: "Presidente Altino, Osasco, SP",
    destino: "Centro, São Paulo, SP",
    cidadeOrigem: "Osasco",
    cidadeDestino: "São Paulo",
    ...extra,
  });
  if (!p) throw new Error("pedido nao normalizou");
  return p;
}

describe("nomeComparavel", () => {
  it("ignora acento, caixa e espaco sobrando", () => {
    expect(nomeComparavel("São Paulo")).toBe(nomeComparavel("sao  paulo "));
    expect(nomeComparavel("Taboão da Serra")).toBe(nomeComparavel("TABOAO DA SERRA"));
  });

  it("cidade diferente continua diferente", () => {
    expect(nomeComparavel("São Paulo")).not.toBe(nomeComparavel("Diadema"));
  });
});

describe("cidadeConfere", () => {
  it("mesma cidade, escrita de outro jeito, confere", () => {
    expect(cidadeConfere("São Paulo", "Sao Paulo")).toBe(true);
  });

  it("cidade diferente nao confere", () => {
    expect(cidadeConfere("São Paulo", "Diadema")).toBe(false);
  });

  it("sem cidade escolhida nao reprova — e o caso do bot, que manda texto livre", () => {
    expect(cidadeConfere(null, "Diadema")).toBe(true);
    expect(cidadeConfere("São Paulo", null)).toBe(true);
  });
});

describe("a cotacao recusa quando o mapa entendeu outra cidade", () => {
  it("o caso real: pessoa disse Sao Paulo e o mapa devolveu Diadema", () => {
    const r = decidirCotacao(pedir(), OSASCO, DIADEMA);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("cidade_nao_confere");
      expect(r.precisaHumano).toBe(true);
    }
  });

  it("mapa confirmando a mesma cidade: sai preco normal", () => {
    const r = decidirCotacao(pedir(), OSASCO, SAO_PAULO);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.km).toBeGreaterThan(0);
  });

  it("a origem tambem e' conferida", () => {
    const r = decidirCotacao(pedir({ cidadeOrigem: "Barueri" }), OSASCO, SAO_PAULO);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("cidade_nao_confere");
  });

  it("sem cidade escolhida (bot do WhatsApp) nada muda: continua cotando", () => {
    const p = normalizarPedido({
      origem: "Presidente Altino, Osasco, SP",
      destino: "Centro, São Paulo, SP",
    });
    expect(p?.cidadeOrigem).toBeNull();
    expect(p?.cidadeDestino).toBeNull();
    const r = decidirCotacao(p!, OSASCO, DIADEMA);
    expect(r.ok).toBe(true);
  });

  it("acento e caixa nao reprovam quem esta certo", () => {
    const r = decidirCotacao(pedir({ cidadeDestino: "sao paulo" }), OSASCO, SAO_PAULO);
    expect(r.ok).toBe(true);
  });
});

describe("bairro de divisa — aprova quando o preco nao muda", () => {
  // Medido no ar em 21/Nov/2026, com a cotacao de regua:
  //   Alphaville (mapa diz Santana de Parnaiba) -> 4,2 km do centro de Barueri,
  //     e a cotacao da' 15,0 km contra 15,1 km do centro. Mesmo preco.
  //   "Centro, Sao Paulo" (mapa diz Diadema) -> 18,6 km do centro de Sao Paulo.
  const BARUERI = { lat: -23.5107, lng: -46.8761, uf: "SP", cidade: "Barueri" };
  const ALPHAVILLE = { lat: -23.4967, lng: -46.8528, uf: "SP", cidade: "Santana de Parnaíba" };

  function pedirAlphaville() {
    const p = normalizarPedido({
      origem: "Presidente Altino, Osasco, SP",
      destino: "Alphaville, Barueri, SP",
      cidadeOrigem: "Osasco",
      cidadeDestino: "Barueri",
    });
    if (!p) throw new Error("pedido nao normalizou");
    return p;
  }

  it("sem o centro em maos, divergencia e' recusa — nao se chuta", () => {
    const r = decidirCotacao(pedirAlphaville(), OSASCO, ALPHAVILLE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("cidade_nao_confere");
  });

  it("com o centro de Barueri, o bairro de divisa passa", () => {
    const r = decidirCotacao(pedirAlphaville(), OSASCO, ALPHAVILLE, { destino: BARUERI });
    expect(r.ok).toBe(true);
  });

  it("o centro NAO salva lugar errado: Diadema continua recusado", () => {
    const r = decidirCotacao(pedir(), OSASCO, DIADEMA, { destino: SAO_PAULO });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("cidade_nao_confere");
  });

  it("a tolerancia e' de 8 km, e separa os dois casos medidos", () => {
    expect(TOLERANCIA_BORDA_KM).toBe(8);
    // 4,2 km (divisa de verdade) passa; 18,6 km (outra cidade) nao.
    expect(pontoDaCidadeEscolhida("Barueri", ALPHAVILLE, BARUERI)).toBe(true);
    expect(pontoDaCidadeEscolhida("São Paulo", DIADEMA, SAO_PAULO)).toBe(false);
  });
});
