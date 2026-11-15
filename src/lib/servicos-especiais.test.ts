// Testes do servico de ENTULHO e DESCARTE.
//
// O que estes testes defendem, que sao ordens do Fabio de 15/Nov/2026:
//   · entulho sai com 3 pessoas NO MINIMO, mesmo que a tela mande 0;
//   · descarte custa pelo menos 30% mais que o frete comum;
//   · entulho custa mais que descarte;
//   · o servico sai dos ITENS, no servidor — corpo forjado nao escolhe servico;
//   · o detalhamento que aparece na tela SOMA exatamente o total (se nao, a
//     pessoa ve uma conta que nao fecha).

import { describe, it, expect } from "vitest";
import { decidirCotacao, normalizarPedido } from "./cotacao";
import { servicoDaCarga } from "./itens-carga";
import { aplicarPremio, ajudantesDoServico, PREMIO_SERVICO } from "./servicos-especiais";

const SP_CENTRO = { lat: -23.5505, lng: -46.6333, uf: "SP", cidade: "Sao Paulo" };
const OSASCO = { lat: -23.5329, lng: -46.7916, uf: "SP", cidade: "Osasco" };

const ENDERECOS = {
  origem: "Rua Augusta, 100, Consolacao, Sao Paulo",
  destino: "Rua Antonio Agu, 50, Centro, Osasco",
};

function cotar(itens: unknown, ajudantes = 0) {
  const pedido = normalizarPedido({ ...ENDERECOS, ajudantes, itens });
  if (!pedido) throw new Error("pedido nao normalizou");
  const r = decidirCotacao(pedido, SP_CENTRO, OSASCO);
  if (!r.ok) throw new Error(`recusou: ${r.motivo}`);
  return r;
}

describe("servicoDaCarga — o item diz o que e' o servico", () => {
  it("carga normal e' frete", () => {
    const r = servicoDaCarga([{ id: "sofa_3", qtd: 1 }]);
    expect(r.servico).toBe("frete");
    expect(r.volumeDescarteM3).toBe(0);
  });

  it("movel velho pra jogar fora vira descarte, e conta o m3", () => {
    const r = servicoDaCarga([{ id: "descarte_movel", qtd: 2 }]);
    expect(r.servico).toBe("descarte");
    expect(r.volumeDescarteM3).toBe(2);
  });

  it("saco de entulho vira entulho", () => {
    const r = servicoDaCarga([{ id: "entulho_saco", qtd: 10 }]);
    expect(r.servico).toBe("entulho");
    expect(r.volumeDescarteM3).toBeCloseTo(0.2, 3);
  });

  it("entulho ganha de descarte na mesma lista", () => {
    expect(
      servicoDaCarga([
        { id: "descarte_colchao", qtd: 1 },
        { id: "entulho_saco", qtd: 1 },
        { id: "sofa_3", qtd: 1 },
      ]).servico,
    ).toBe("entulho");
  });

  it("item com qtd 0 nao puxa servico nenhum", () => {
    expect(servicoDaCarga([{ id: "entulho_saco", qtd: 0 }]).servico).toBe("frete");
  });
});

describe("ajudantes minimos — ordem do Fabio: entulho tem 3 pessoas", () => {
  it("entulho sobe de 0 pra 3", () => {
    expect(ajudantesDoServico("entulho", 0)).toBe(3);
  });

  it("nao derruba quem ja pediu mais", () => {
    expect(ajudantesDoServico("entulho", 3)).toBe(3);
    expect(ajudantesDoServico("frete", 2)).toBe(2);
  });

  it("descarte nao tem minimo inventado", () => {
    expect(ajudantesDoServico("descarte", 0)).toBe(0);
  });

  it("normalizarPedido ja devolve o pedido com os 3 ajudantes do entulho", () => {
    const p = normalizarPedido({ ...ENDERECOS, ajudantes: 0, itens: [{ id: "entulho_saco", qtd: 4 }] });
    expect(p?.servico).toBe("entulho");
    expect(p?.ajudantes).toBe(3);
    expect(p?.ajudante).toBe(true);
  });
});

describe("premio do servico", () => {
  it("descarte e pelo menos 30% acima do frete — ordem literal do Fabio", () => {
    expect(PREMIO_SERVICO.descarte).toBeGreaterThanOrEqual(1.3);
  });

  it("entulho custa mais que descarte", () => {
    expect(PREMIO_SERVICO.entulho).toBeGreaterThan(PREMIO_SERVICO.descarte);
  });

  it("frete comum nao leva premio nenhum", () => {
    const p = { base: 200, ajudante: 80, elevador: 0, escada: 0, feriado: 0, total: 280 };
    expect(aplicarPremio(p, "frete")).toEqual(p);
  });

  it("o detalhamento continua somando o total depois do premio", () => {
    const p = { base: 200, ajudante: 80, elevador: 50, escada: 0, feriado: 20, total: 350 };
    const d = aplicarPremio(p, "descarte");
    expect(d.total).toBe(Math.round(350 * 1.3));
    expect(d.base + d.ajudante + d.elevador + d.escada + d.feriado).toBe(d.total);
  });
});

describe("cotacao ponta a ponta — o preco do servico chega na tela", () => {
  it("descarte sai no minimo 30% acima do mesmo trajeto como frete", () => {
    const frete = cotar([{ id: "sofa_3", qtd: 1 }]).precos.hr.total;
    const descarte = cotar([{ id: "descarte_sofa", qtd: 1 }]).precos.hr.total;
    expect(descarte).toBeGreaterThanOrEqual(Math.round(frete * 1.3));
  });

  it("entulho sai bem acima do frete: 3 ajudantes dentro, e ainda o premio", () => {
    const frete = cotar([{ id: "sofa_3", qtd: 1 }], 0);
    const entulho = cotar([{ id: "entulho_saco", qtd: 8 }], 0);
    expect(entulho.servico).toBe("entulho");
    expect(entulho.ajudantes).toBe(3);
    expect(entulho.precos.hr.ajudante).toBeGreaterThan(0);
    expect(entulho.precos.hr.total).toBeGreaterThan(frete.precos.hr.total * 1.8);
  });

  it("entulho custa mais que descarte no mesmo trajeto", () => {
    const descarte = cotar([{ id: "descarte_movel", qtd: 1 }]).precos.hr.total;
    const entulho = cotar([{ id: "entulho_saco", qtd: 1 }]).precos.hr.total;
    expect(entulho).toBeGreaterThan(descarte);
  });

  it("o servico vem dos itens: corpo que manda servico na mao e ignorado", () => {
    const p = normalizarPedido({
      ...ENDERECOS,
      servico: "frete",
      itens: [{ id: "entulho_saco", qtd: 1 }],
    });
    expect(p?.servico).toBe("entulho");
  });

  it("sem itens continua sendo frete — nada de servico surpresa", () => {
    const r = cotar(undefined);
    expect(r.servico).toBe("frete");
    expect(r.volumeDescarteM3).toBe(0);
  });
});
