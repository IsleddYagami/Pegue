import { describe, it, expect } from "vitest";
import {
  MAX_SUGESTOES,
  MIN_LETRAS_BUSCA,
  normalizarSugestoes,
  urlNominatim,
} from "./busca-bairro";
import respostaCentro from "./__fixtures__/nominatim-centro.json";

// O gabarito `nominatim-centro.json` e a resposta DE VERDADE do Nominatim pra
// "Centro", capturada em 7/Nov/2026. Se o formato deles mudar, o teste nao
// percebe sozinho — mas pelo menos a nossa parte esta presa a um dado real, e
// nao a um JSON que eu inventei.

describe("normalizarSugestoes — resposta real do OpenStreetMap", () => {
  it('"Centro" vira uma linha por cidade do estado de Sao Paulo', () => {
    const r = normalizarSugestoes(respostaCentro, "Centro");
    expect(r.length).toBeGreaterThan(0);
    const cidades = r.map((x) => x.cidade);
    expect(cidades).toContain("Guarulhos");
    expect(cidades).toContain("Santos");
    expect(cidades).toContain("Santo André");
    for (const x of r) expect(x.bairro).toBe("Centro");
  });

  it("joga fora o que nao e de Sao Paulo", () => {
    // Buscar "Centro" sem o estado devolvia Feira Grande (AL) e Imbe (RS) nas
    // primeiras linhas. O filtro barra isso venha de onde vier.
    const deFora = [
      { name: "Centro", addresstype: "suburb", address: { suburb: "Centro", town: "Feira Grande", state: "Alagoas" } },
      { name: "Centro", addresstype: "suburb", address: { suburb: "Centro", town: "Imbé", state: "Rio Grande do Sul" } },
    ];
    expect(normalizarSugestoes(deFora, "Centro")).toEqual([]);
  });

  it("a busca pede o estado, senao sobra quase nada de SP", () => {
    expect(urlNominatim("Centro")).toContain("Centro%2C+S%C3%A3o+Paulo%2C+Brasil");
  });

  it("nao repete cidade", () => {
    const r = normalizarSugestoes(respostaCentro, "Centro");
    expect(new Set(r.map((x) => x.cidade)).size).toBe(r.length);
  });

  it("acha digitando sem acento e so o comeco", () => {
    expect(normalizarSugestoes(respostaCentro, "cen").length).toBeGreaterThan(0);
  });

  it("respeita o limite", () => {
    expect(normalizarSugestoes(respostaCentro, "Centro", 2)).toHaveLength(2);
    expect(normalizarSugestoes(respostaCentro, "Centro").length).toBeLessThanOrEqual(MAX_SUGESTOES);
  });
});

describe("normalizarSugestoes — o que NAO pode passar", () => {
  const linha = (over: Record<string, unknown> = {}) => ({
    name: "Centro",
    addresstype: "suburb",
    address: { suburb: "Centro", city: "Osasco", state: "São Paulo" },
    ...over,
  });

  it("corpo que nao e lista vira lista vazia", () => {
    expect(normalizarSugestoes(null, "Centro")).toEqual([]);
    expect(normalizarSugestoes({ erro: "x" }, "Centro")).toEqual([]);
    expect(normalizarSugestoes("Centro", "Centro")).toEqual([]);
  });

  it("menos de tres letras nao busca nada", () => {
    expect(MIN_LETRAS_BUSCA).toBe(3);
    expect(normalizarSugestoes([linha()], "ce")).toEqual([]);
    expect(normalizarSugestoes([linha()], "")).toEqual([]);
  });

  it("bairro que nao COMECA com o que foi digitado fica de fora", () => {
    // Caso real: digitar "Vila Yara" trazia "Vila Grao Mogol" e a pessoa achava
    // que tinha escolhido o bairro certo.
    const grao = linha({
      name: "Vila Grão Mogol",
      addresstype: "residential",
      address: { residential: "Vila Grão Mogol", city: "São Paulo", state: "São Paulo" },
    });
    expect(normalizarSugestoes([grao], "Vila Yara")).toEqual([]);
    expect(normalizarSugestoes([grao], "Vila Grão")).toHaveLength(1);
  });

  it("rua, estacao e loja nao sao bairro", () => {
    for (const tipo of ["road", "railway", "shop", "amenity", "house"]) {
      expect(normalizarSugestoes([linha({ addresstype: tipo })], "Centro"), tipo).toEqual([]);
    }
  });

  it("cidade que nao existe na lista do IBGE nao passa", () => {
    const falsa = linha({ address: { suburb: "Centro", city: "Cidade Inventada", state: "São Paulo" } });
    expect(normalizarSugestoes([falsa], "Centro")).toEqual([]);
  });

  it("resultado sem cidade nao passa", () => {
    const semCidade = linha({ address: { suburb: "Centro", state: "São Paulo" } });
    expect(normalizarSugestoes([semCidade], "Centro")).toEqual([]);
  });

  it("aceita cidade vinda de town, municipality ou village", () => {
    for (const campo of ["town", "municipality", "village"]) {
      const l = linha({ address: { suburb: "Centro", [campo]: "Santos", state: "São Paulo" } });
      expect(normalizarSugestoes([l], "Centro"), campo).toEqual([
        { bairro: "Centro", cidade: "Santos" },
      ]);
    }
  });
});

describe("urlNominatim", () => {
  it("monta a busca com pais, formato e detalhes de endereco", () => {
    const u = new URL(urlNominatim("Vila Yara"));
    expect(u.origin + u.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(u.searchParams.get("q")).toBe("Vila Yara, São Paulo, Brasil");
    expect(u.searchParams.get("countrycodes")).toBe("br");
    expect(u.searchParams.get("addressdetails")).toBe("1");
    expect(u.searchParams.get("format")).toBe("jsonv2");
  });

  it("escapa o que a pessoa digitou", () => {
    expect(urlNominatim("Jardim São João & cia")).toContain("Jardim+S%C3%A3o+Jo%C3%A3o+%26+cia");
  });
});
