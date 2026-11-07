import { describe, it, expect } from "vitest";
import {
  CATALOGO,
  ITEM_OUTRO,
  MAX_LINHAS_ITENS,
  MAX_QTD_POR_ITEM,
  cabeNoVeiculo,
  descricaoCarga,
  itemPorId,
  normalizarItensRecebidos,
  resumirCarga,
} from "./itens-carga";

// O catalogo substitui a foto (tirada da frente em 6/Nov) e a estimativa por IA
// na tela. Se ele errar, o cliente escolhe veiculo errado — por isso tem teste.

describe("CATALOGO — integridade da tabela", () => {
  it("nao tem id repetido", () => {
    const ids = CATALOGO.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("nao usa o id reservado de item livre", () => {
    expect(CATALOGO.some((i) => i.id === ITEM_OUTRO)).toBe(false);
  });

  it("todo item tem volume e peso positivos", () => {
    for (const i of CATALOGO) {
      expect(i.volumeM3, i.id).toBeGreaterThan(0);
      expect(i.pesoKg, i.id).toBeGreaterThan(0);
    }
  });

  it("todo numero derivado diz de onde saiu", () => {
    for (const i of CATALOGO.filter((x) => x.origem === "derivado")) {
      expect(i.base, `${i.id} precisa dizer a base`).toBeTruthy();
    }
  });

  it("os valores de tabela batem com os que ja estavam no projeto", () => {
    // Conferidos contra o prompt do classificador-itens.ts, que era onde esses
    // numeros moravam antes. Se alguem mudar um aqui, este teste cai.
    expect(itemPorId("geladeira_duplex")).toMatchObject({ volumeM3: 0.5, pesoKg: 90 });
    expect(itemPorId("sofa_3")).toMatchObject({ volumeM3: 1.8, pesoKg: 70 });
    expect(itemPorId("armario_6")).toMatchObject({ volumeM3: 3.0, pesoKg: 150 });
    expect(itemPorId("caixa_media")).toMatchObject({ volumeM3: 0.05, pesoKg: 8 });
    expect(itemPorId("microondas")).toMatchObject({ volumeM3: 0.06, pesoKg: 15 });
  });
});

describe("resumirCarga", () => {
  it("carga vazia nao sugere veiculo nenhum", () => {
    const r = resumirCarga([]);
    expect(r.totalItens).toBe(0);
    expect(r.veiculoSugerido).toBeNull();
  });

  it("soma quantidade: 10 caixas medias = 0.5 m3 e 80 kg", () => {
    const r = resumirCarga([{ id: "caixa_media", qtd: 10 }]);
    expect(r.volumeM3).toBeCloseTo(0.5, 3);
    expect(r.pesoKg).toBe(80);
    expect(r.veiculoSugerido).toBe("utilitario");
  });

  it("mudanca de 1 quarto cai no HR, nao no utilitario", () => {
    const r = resumirCarga([
      { id: "cama_box", qtd: 1 },
      { id: "armario_3", qtd: 1 },
      { id: "comoda", qtd: 1 },
      { id: "caixa_grande", qtd: 5 },
    ]);
    // 1.8 + 1.5 + 0.5 + 0.5 = 4.3 m3
    expect(r.volumeM3).toBeCloseTo(4.3, 3);
    expect(r.veiculoSugerido).toBe("hr");
  });

  it("medida do cliente manda no volume, nao a tabela", () => {
    const semMedida = resumirCarga([{ id: "sofa_3", qtd: 1 }]);
    const comMedida = resumirCarga([
      { id: "sofa_3", qtd: 1, medida: { larguraCm: 100, alturaCm: 100, comprimentoCm: 100 } },
    ]);
    expect(semMedida.volumeM3).toBeCloseTo(1.8, 3);
    expect(comMedida.volumeM3).toBeCloseTo(1.0, 3);
    // Peso continua o da tabela: medida diz espaco, nao diz peso.
    expect(comMedida.pesoKg).toBe(70);
  });

  it("qtd zero ou negativa nao entra na conta", () => {
    const r = resumirCarga([
      { id: "sofa_3", qtd: 0 },
      { id: "caixa_media", qtd: -5 },
    ]);
    expect(r.totalItens).toBe(0);
    expect(r.volumeM3).toBe(0);
  });

  it("item escrito a mao e sem medida avisa que a conta nao enxerga ele", () => {
    const r = resumirCarga([{ id: ITEM_OUTRO, qtd: 1, nomeLivre: "piano" }]);
    expect(r.temItemSemMedida).toBe(true);
    expect(r.volumeM3).toBe(0);
  });

  it("item escrito a mao COM medida entra na conta e nao avisa", () => {
    const r = resumirCarga([
      {
        id: ITEM_OUTRO,
        qtd: 1,
        nomeLivre: "piano",
        medida: { larguraCm: 150, alturaCm: 120, comprimentoCm: 60 },
      },
    ]);
    expect(r.temItemSemMedida).toBe(false);
    expect(r.volumeM3).toBeCloseTo(1.08, 3);
  });
});

describe("cabeNoVeiculo — conselho, nunca trava", () => {
  it("sem itens, nao reclama de veiculo nenhum", () => {
    const r = resumirCarga([]);
    expect(cabeNoVeiculo(r, "utilitario")).toEqual({ cabe: true, motivo: "sem_itens" });
  });

  it("carga de HR escolhida como utilitario avisa que aperta", () => {
    const r = resumirCarga([{ id: "sofa_conjunto", qtd: 1 }]);
    expect(cabeNoVeiculo(r, "utilitario").motivo).toBe("aperta");
    expect(cabeNoVeiculo(r, "utilitario").cabe).toBe(false);
  });

  it("veiculo maior que o necessario cabe", () => {
    const r = resumirCarga([{ id: "caixa_media", qtd: 4 }]);
    expect(cabeNoVeiculo(r, "caminhao_bau")).toEqual({ cabe: true, motivo: "ok" });
  });

  it("carga acima da frota diz que excede", () => {
    const r = resumirCarga([{ id: "armario_6", qtd: 6 }]); // 18 m3
    expect(cabeNoVeiculo(r, "caminhao_bau").motivo).toBe("excede_frota");
  });

  it("com item escrito a mao sem medida, nao finge que sabe", () => {
    const r = resumirCarga([{ id: ITEM_OUTRO, qtd: 1, nomeLivre: "cofre" }]);
    expect(cabeNoVeiculo(r, "utilitario")).toEqual({ cabe: true, motivo: "nao_sei" });
  });
});

describe("descricaoCarga", () => {
  it("monta o texto que vai pro pedido", () => {
    expect(
      descricaoCarga([
        { id: "geladeira_duplex", qtd: 1 },
        { id: "caixa_media", qtd: 5 },
      ]),
    ).toBe("Geladeira duplex, 5x Caixa média");
  });

  it("inclui a medida quando o cliente deu", () => {
    expect(
      descricaoCarga([
        { id: "sofa_3", qtd: 1, medida: { larguraCm: 90, alturaCm: 80, comprimentoCm: 200 } },
      ]),
    ).toBe("Sofá 3 lugares (90x80x200cm)");
  });

  it("usa o nome livre do item fora da lista", () => {
    expect(descricaoCarga([{ id: ITEM_OUTRO, qtd: 2, nomeLivre: "aquário" }])).toBe("2x aquário");
  });

  it("carga vazia vira texto vazio, nao texto inventado", () => {
    expect(descricaoCarga([])).toBe("");
  });
});

describe("normalizarItensRecebidos — o navegador nao e de confianca", () => {
  it("ignora corpo que nao e lista", () => {
    expect(normalizarItensRecebidos(null)).toEqual([]);
    expect(normalizarItensRecebidos("sofa")).toEqual([]);
    expect(normalizarItensRecebidos({ id: "sofa_3" })).toEqual([]);
  });

  it("aceita item do catalogo", () => {
    expect(normalizarItensRecebidos([{ id: "sofa_3", qtd: 2 }])).toEqual([
      { id: "sofa_3", qtd: 2 },
    ]);
  });

  it("id desconhecido com nome vira item livre, nao item de catalogo", () => {
    expect(normalizarItensRecebidos([{ id: "nave_espacial", qtd: 1, nomeLivre: "nave" }])).toEqual([
      { id: ITEM_OUTRO, qtd: 1, nomeLivre: "nave" },
    ]);
  });

  it("id desconhecido SEM nome e descartado", () => {
    expect(normalizarItensRecebidos([{ id: "nave_espacial", qtd: 1 }])).toEqual([]);
  });

  it("corta quantidade no teto", () => {
    const r = normalizarItensRecebidos([{ id: "caixa_media", qtd: 99999 }]);
    expect(r[0].qtd).toBe(MAX_QTD_POR_ITEM);
  });

  it("corta a lista no teto de linhas", () => {
    const muitas = Array.from({ length: 500 }, () => ({ id: "caixa_media", qtd: 1 }));
    expect(normalizarItensRecebidos(muitas)).toHaveLength(MAX_LINHAS_ITENS);
  });

  it("recusa medida fora do mundo real", () => {
    const r = normalizarItensRecebidos([
      { id: "sofa_3", qtd: 1, medida: { larguraCm: 999999, alturaCm: 10, comprimentoCm: 10 } },
    ]);
    expect(r[0].medida).toBeUndefined();
  });

  it("recusa medida negativa ou zerada", () => {
    const r = normalizarItensRecebidos([
      { id: "sofa_3", qtd: 1, medida: { larguraCm: 0, alturaCm: -5, comprimentoCm: 10 } },
    ]);
    expect(r[0].medida).toBeUndefined();
  });

  it("aceita medida valida", () => {
    const r = normalizarItensRecebidos([
      { id: "sofa_3", qtd: 1, medida: { larguraCm: 90, alturaCm: 80, comprimentoCm: 200 } },
    ]);
    expect(r[0].medida).toEqual({ larguraCm: 90, alturaCm: 80, comprimentoCm: 200 });
  });

  it("nao deixa nome livre gigante entrar inteiro", () => {
    const r = normalizarItensRecebidos([
      { id: "x", qtd: 1, nomeLivre: "a".repeat(5000) },
    ]);
    expect(r[0].nomeLivre?.length).toBe(80);
  });
});
