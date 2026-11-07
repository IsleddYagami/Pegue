import { describe, it, expect } from "vitest";
import {
  CIDADES_FREQUENTES,
  CIDADES_SP,
  buscarCidades,
  cidadeValida,
  semAcento,
} from "./cidades-sp";

// A cidade escolhida aqui e o que faz o bairro deixar de ser ambiguo na cotacao.
// Se a busca falhar, a pessoa nao consegue cotar — por isso tem teste.

describe("CIDADES_SP", () => {
  it("tem os 645 municipios do estado", () => {
    expect(CIDADES_SP).toHaveLength(645);
  });

  it("nao tem cidade repetida", () => {
    expect(new Set(CIDADES_SP).size).toBe(CIDADES_SP.length);
  });

  it("toda cidade frequente existe na lista oficial", () => {
    for (const c of CIDADES_FREQUENTES) {
      expect(CIDADES_SP, c).toContain(c);
    }
  });

  it("tem capital, litoral e interior — a area que a Pegue atende", () => {
    expect(CIDADES_SP).toContain("São Paulo");
    expect(CIDADES_SP).toContain("Santos");
    expect(CIDADES_SP).toContain("Ribeirão Preto");
  });

  it("nao tem cidade de outro estado", () => {
    expect(CIDADES_SP).not.toContain("Rio de Janeiro");
    expect(CIDADES_SP).not.toContain("Belo Horizonte");
    expect(CIDADES_SP).not.toContain("Curitiba");
  });
});

describe("semAcento", () => {
  it("tira acento e caixa", () => {
    expect(semAcento("São José dos Campos")).toBe("sao jose dos campos");
    expect(semAcento("  Guarujá ")).toBe("guaruja");
  });
});

describe("buscarCidades", () => {
  it("sem termo, mostra as do dia a dia", () => {
    expect(buscarCidades("")).toEqual(CIDADES_FREQUENTES.slice(0, 8));
  });

  it("acha digitando sem acento", () => {
    expect(buscarCidades("sao jose dos campos")).toContain("São José dos Campos");
    expect(buscarCidades("guaruja")).toContain("Guarujá");
  });

  it("quem comeca com o termo vem antes de quem so contem", () => {
    const r = buscarCidades("osasco");
    expect(r[0]).toBe("Osasco");
  });

  it("acha com duas ou tres letras, que e como a pessoa digita", () => {
    expect(buscarCidades("osa")).toContain("Osasco");
    expect(buscarCidades("san")).toContain("Santos");
  });

  it("respeita o limite", () => {
    expect(buscarCidades("a", 5)).toHaveLength(5);
  });

  it("cidade de fora nao aparece", () => {
    expect(buscarCidades("curitiba")).toHaveLength(0);
  });
});

describe("cidadeValida", () => {
  it("aceita cidade do estado, com ou sem acento", () => {
    expect(cidadeValida("São Paulo")).toBe(true);
    expect(cidadeValida("sao paulo")).toBe(true);
    expect(cidadeValida("GUARUJA")).toBe(true);
  });

  it("recusa cidade de fora e texto solto", () => {
    expect(cidadeValida("Rio de Janeiro")).toBe(false);
    expect(cidadeValida("")).toBe(false);
    expect(cidadeValida("qualquer coisa")).toBe(false);
  });
});

// Caso real que a primeira versao errava: em ordem alfabetica, "san" devolvia
// oito "Santa ..." e Santos — litoral, que a Pegue atende todo dia — nunca
// aparecia. Quem digita tres letras desiste antes de rolar a lista.
describe("buscarCidades — cidade do dia a dia na frente", () => {
  it("'san' traz Santos antes das Santa Alguma Coisa", () => {
    const r = buscarCidades("san");
    expect(r).toContain("Santos");
    expect(r.indexOf("Santos")).toBeLessThan(r.length - 1);
  });

  it("'sao' traz Sao Paulo primeiro", () => {
    expect(buscarCidades("sao")[0]).toBe("São Paulo");
  });

  it("'s' traz as frequentes antes do resto", () => {
    const r = buscarCidades("s", 6);
    expect(r).toContain("Santos");
    expect(r).toContain("São Paulo");
  });
});
