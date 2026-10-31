// Testes da decisao da cotacao do site.
//
// O que estes testes defendem: a LEI de jamais cotar sem certeza. Se o endereco
// nao foi confirmado, se a area nao e atendida, ou se os dois pontos cairam no
// mesmo lugar, NAO pode sair numero nenhum na tela. Qualquer alteracao futura
// que faca a cotacao "chutar um minimo pra nao ficar vazio" quebra aqui.

import { describe, it, expect } from "vitest";
import {
  areaIndisponivel,
  decidirCotacao,
  MAX_ANDARES,
  MAX_ENDERECO,
  MENSAGEM_RECUSA,
  normalizarPedido,
  type PedidoCotacao,
} from "./cotacao";
import { calcularPrecosCompleto } from "./bot-utils";

const SP_CENTRO = { lat: -23.5505, lng: -46.6333 };
const OSASCO = { lat: -23.5329, lng: -46.7916 };

function pedido(over: Partial<PedidoCotacao> = {}): PedidoCotacao {
  return {
    origem: "Rua Augusta, 100, Consolacao, Sao Paulo",
    destino: "Rua Antonio Agu, 50, Centro, Osasco",
    ajudante: false,
    elevador: false,
    andares: 0,
    dataAgendada: null,
    ...over,
  };
}

describe("normalizarPedido", () => {
  it("aceita o pedido minimo e assume os adicionais como false/0", () => {
    const p = normalizarPedido({ origem: "Rua A, Sao Paulo", destino: "Rua B, Osasco" });
    expect(p).not.toBeNull();
    expect(p!.ajudante).toBe(false);
    expect(p!.elevador).toBe(false);
    expect(p!.andares).toBe(0);
    expect(p!.dataAgendada).toBeNull();
  });

  it("recusa quando falta origem ou destino", () => {
    expect(normalizarPedido({ destino: "Rua B, Osasco" })).toBeNull();
    expect(normalizarPedido({ origem: "Rua A, Sao Paulo" })).toBeNull();
    expect(normalizarPedido({})).toBeNull();
  });

  it("recusa corpo que nao e objeto", () => {
    expect(normalizarPedido(null)).toBeNull();
    expect(normalizarPedido("origem=x")).toBeNull();
    expect(normalizarPedido(42)).toBeNull();
  });

  it("recusa endereco curto demais pra ser endereco", () => {
    expect(normalizarPedido({ origem: "ab", destino: "Rua B, Osasco" })).toBeNull();
    expect(normalizarPedido({ origem: "   ", destino: "Rua B, Osasco" })).toBeNull();
  });

  it("recusa endereco acima do limite, em vez de truncar e cotar errado", () => {
    const gigante = "a".repeat(MAX_ENDERECO + 1);
    expect(normalizarPedido({ origem: gigante, destino: "Rua B, Osasco" })).toBeNull();
  });

  it("aceita endereco exatamente no limite", () => {
    const limite = "a".repeat(MAX_ENDERECO);
    expect(normalizarPedido({ origem: limite, destino: "Rua B, Osasco" })).not.toBeNull();
  });

  it("tira o espaco em branco das pontas", () => {
    const p = normalizarPedido({ origem: "  Rua A, Sao Paulo  ", destino: " Rua B, Osasco " });
    expect(p!.origem).toBe("Rua A, Sao Paulo");
    expect(p!.destino).toBe("Rua B, Osasco");
  });

  it("limita andares ao teto e nao aceita negativo", () => {
    expect(normalizarPedido({ origem: "Rua A, SP", destino: "Rua B, SP", andares: 999 })!.andares)
      .toBe(MAX_ANDARES);
    expect(normalizarPedido({ origem: "Rua A, SP", destino: "Rua B, SP", andares: -5 })!.andares)
      .toBe(0);
  });

  it("ignora andares que nao sao numero finito", () => {
    for (const v of ["3", NaN, Infinity, null, {}]) {
      expect(normalizarPedido({ origem: "Rua A, SP", destino: "Rua B, SP", andares: v })!.andares)
        .toBe(0);
    }
  });

  it("trunca andar fracionado em vez de cobrar meio andar", () => {
    expect(normalizarPedido({ origem: "Rua A, SP", destino: "Rua B, SP", andares: 3.9 })!.andares)
      .toBe(3);
  });

  it("so aceita true como true nos booleanos (nao 'on', nao 1)", () => {
    const p = normalizarPedido({
      origem: "Rua A, SP",
      destino: "Rua B, SP",
      ajudante: "on",
      elevador: 1,
    });
    expect(p!.ajudante).toBe(false);
    expect(p!.elevador).toBe(false);
  });

  it("normaliza dataAgendada vazia pra null", () => {
    expect(normalizarPedido({ origem: "Rua A, SP", destino: "Rua B, SP", dataAgendada: "   " })!
      .dataAgendada).toBeNull();
    expect(normalizarPedido({ origem: "Rua A, SP", destino: "Rua B, SP", dataAgendada: 20260101 })!
      .dataAgendada).toBeNull();
  });
});

describe("areaIndisponivel", () => {
  it("pega area indisponivel no destino", () => {
    expect(areaIndisponivel(pedido({ destino: "Paraisopolis, Sao Paulo" }))).toBe(true);
  });

  it("pega area indisponivel tambem na ORIGEM — a coleta tambem expoe o fretista", () => {
    expect(areaIndisponivel(pedido({ origem: "Heliopolis, Sao Paulo" }))).toBe(true);
  });

  it("pega com acento e sem acento", () => {
    expect(areaIndisponivel(pedido({ destino: "Heliópolis" }))).toBe(true);
    expect(areaIndisponivel(pedido({ destino: "Heliopolis" }))).toBe(true);
  });

  it("deixa passar endereco normal", () => {
    expect(areaIndisponivel(pedido())).toBe(false);
  });
});

describe("decidirCotacao — recusa sem certeza", () => {
  it("nao cota quando a origem nao foi confirmada", () => {
    const r = decidirCotacao(pedido(), null, OSASCO);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("origem_nao_validada");
      expect(r.precisaHumano).toBe(true);
    }
    expect(r).not.toHaveProperty("precos");
  });

  it("nao cota quando o destino nao foi confirmado", () => {
    const r = decidirCotacao(pedido(), SP_CENTRO, null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("destino_nao_validado");
    expect(r).not.toHaveProperty("precos");
  });

  it("nao cota quando nenhum dos dois foi confirmado", () => {
    const r = decidirCotacao(pedido(), null, null);
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("precos");
  });

  it("area indisponivel vence o geocode: nao cota nem com os dois pontos na mao", () => {
    const r = decidirCotacao(pedido({ destino: "Paraisopolis" }), SP_CENTRO, OSASCO);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("area_indisponivel");
      expect(r.precisaHumano).toBe(true);
    }
    expect(r).not.toHaveProperty("precos");
  });

  it("mesmo ponto nos dois lados nao vira preco minimo", () => {
    const r = decidirCotacao(pedido(), SP_CENTRO, { ...SP_CENTRO });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("mesma_origem_e_destino");
    expect(r).not.toHaveProperty("precos");
  });

  it("toda recusa tem mensagem escrita pro cliente", () => {
    const motivos = [
      decidirCotacao(pedido(), null, OSASCO),
      decidirCotacao(pedido(), SP_CENTRO, null),
      decidirCotacao(pedido({ destino: "Paraisopolis" }), SP_CENTRO, OSASCO),
      decidirCotacao(pedido(), SP_CENTRO, { ...SP_CENTRO }),
    ];
    for (const r of motivos) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(MENSAGEM_RECUSA[r.motivo]).toBeTruthy();
    }
  });
});

describe("decidirCotacao — cotacao valida", () => {
  it("devolve km, zona e os tres veiculos", () => {
    const r = decidirCotacao(pedido(), SP_CENTRO, OSASCO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.km).toBeGreaterThan(0);
    expect(r.precos.utilitario.total).toBeGreaterThan(0);
    expect(r.precos.hr.total).toBeGreaterThan(0);
    expect(r.precos.caminhao_bau.total).toBeGreaterThan(0);
  });

  it("o preco da tela e EXATAMENTE o que o motor do bot calcula", () => {
    const p = pedido({ ajudante: true, andares: 3 });
    const r = decidirCotacao(p, SP_CENTRO, OSASCO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const direto = calcularPrecosCompleto(r.km, true, 3, false, p.destino, null);
    expect(r.precos).toEqual(direto);
  });

  it("mantem a hierarquia de preco entre os veiculos", () => {
    const r = decidirCotacao(pedido(), SP_CENTRO, OSASCO);
    if (!r.ok) throw new Error("deveria cotar");
    expect(r.precos.hr.total).toBeGreaterThan(r.precos.utilitario.total);
    expect(r.precos.caminhao_bau.total).toBeGreaterThan(r.precos.hr.total);
  });

  it("ajudante aparece na quebra e soma no total", () => {
    const semA = decidirCotacao(pedido(), SP_CENTRO, OSASCO);
    const comA = decidirCotacao(pedido({ ajudante: true }), SP_CENTRO, OSASCO);
    if (!semA.ok || !comA.ok) throw new Error("deveria cotar");
    expect(semA.precos.utilitario.ajudante).toBe(0);
    expect(comA.precos.utilitario.ajudante).toBeGreaterThan(0);
    expect(comA.precos.utilitario.total).toBeGreaterThan(semA.precos.utilitario.total);
  });

  it("escada cobra por andar; elevador cobra uma vez e zera a escada", () => {
    const escada = decidirCotacao(pedido({ andares: 4 }), SP_CENTRO, OSASCO);
    const elevador = decidirCotacao(
      pedido({ andares: 4, elevador: true }),
      SP_CENTRO,
      OSASCO,
    );
    if (!escada.ok || !elevador.ok) throw new Error("deveria cotar");
    expect(escada.precos.utilitario.escada).toBeGreaterThan(0);
    expect(elevador.precos.utilitario.escada).toBe(0);
    expect(elevador.precos.utilitario.elevador).toBeGreaterThan(0);
  });

  it("zona fundao sai marcada e cobra mais que zona normal", () => {
    const normal = decidirCotacao(pedido({ destino: "Rua Augusta, Consolacao" }), SP_CENTRO, OSASCO);
    const fundao = decidirCotacao(pedido({ destino: "Cidade Tiradentes, Sao Paulo" }), SP_CENTRO, OSASCO);
    if (!normal.ok || !fundao.ok) throw new Error("deveria cotar");
    expect(normal.zona).toBe("normal");
    expect(fundao.zona).toBe("fundao");
    expect(fundao.precos.utilitario.base).toBeGreaterThan(normal.precos.utilitario.base);
  });

  it("a zona vem do DESTINO, nao da origem", () => {
    const r = decidirCotacao(
      pedido({ origem: "Cidade Tiradentes, Sao Paulo", destino: "Rua Augusta, Consolacao" }),
      SP_CENTRO,
      OSASCO,
    );
    if (!r.ok) throw new Error("deveria cotar");
    expect(r.zona).toBe("normal");
  });
});
