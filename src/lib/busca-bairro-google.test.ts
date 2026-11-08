import { describe, it, expect } from "vitest";
import {
  FIELD_MASK,
  RETANGULO_SP,
  URL_AUTOCOMPLETE,
  cidadeDoTexto,
  corpoAutocomplete,
  normalizarGoogle,
} from "./busca-bairro-google";
import { FRANQUIA_GOOGLE_AUTOCOMPLETE, TETO_PLACES_MES, mesAtual } from "./cota-mensal";

// ATENCAO, PRA NAO MENTIR DEPOIS: as respostas abaixo seguem o formato
// DOCUMENTADO do Autocomplete (New) — suggestions[].placePrediction com text,
// structuredFormat.mainText/secondaryText e types. NAO sao captura ao vivo: a
// Places API ainda nao esta habilitada na chave da Pegue. Entao isto prova a
// NOSSA leitura da resposta, e nao que o Google ache "Vila Yara". Essa segunda
// prova e ao vivo, com a API ligada, digitando na tela.
// Doc: developers.google.com/maps/documentation/places/web-service/place-autocomplete

const predicao = (
  mainText: string,
  secondaryText: string | undefined,
  types: string[] = ["sublocality", "sublocality_level_1"],
  textoInteiro?: string,
) => ({
  placePrediction: {
    text: { text: textoInteiro ?? `${mainText}, ${secondaryText ?? ""}` },
    structuredFormat: {
      mainText: { text: mainText },
      ...(secondaryText ? { secondaryText: { text: secondaryText } } : {}),
    },
    types,
  },
});

describe("normalizarGoogle", () => {
  it("le bairro e cidade do jeito que o Google manda", () => {
    const resposta = {
      suggestions: [
        predicao("Vila Yara", "Osasco - SP, Brasil"),
        predicao("Vila Yolanda", "Osasco - SP, Brasil"),
      ],
    };
    expect(normalizarGoogle(resposta, "Vila Y")).toEqual([
      { bairro: "Vila Yara", cidade: "Osasco" },
      { bairro: "Vila Yolanda", cidade: "Osasco" },
    ]);
  });

  it("aceita neighborhood e sublocality; recusa rua, cidade e CEP", () => {
    for (const t of ["neighborhood", "sublocality", "sublocality_level_1"]) {
      expect(normalizarGoogle({ suggestions: [predicao("Centro", "Santos - SP, Brasil", [t])] }, "Centro"), t)
        .toHaveLength(1);
    }
    for (const t of ["route", "locality", "postal_code", "administrative_area_level_2", "street_address"]) {
      expect(normalizarGoogle({ suggestions: [predicao("Centro", "Santos - SP, Brasil", [t])] }, "Centro"), t)
        .toEqual([]);
    }
  });

  it("sem secondaryText, tira a cidade da descricao inteira", () => {
    // A doc avisa que o secondaryText pode faltar. Nao pode custar a sugestao.
    const r = { suggestions: [predicao("Vila Yara", undefined, ["sublocality"], "Vila Yara, Osasco - SP, Brasil")] };
    expect(normalizarGoogle(r, "Vila Yara")).toEqual([{ bairro: "Vila Yara", cidade: "Osasco" }]);
  });

  it("cidade que nao existe na lista do IBGE nao passa", () => {
    const r = { suggestions: [predicao("Centro", "Cidade Inventada - SP, Brasil")] };
    expect(normalizarGoogle(r, "Centro")).toEqual([]);
  });

  it("bairro que nao COMECA com o digitado fica de fora", () => {
    const r = { suggestions: [predicao("Vila Grao Mogol", "Sao Paulo - SP, Brasil")] };
    expect(normalizarGoogle(r, "Vila Yara")).toEqual([]);
    expect(normalizarGoogle(r, "vila grao")).toHaveLength(1);
  });

  it("nao repete o mesmo bairro na mesma cidade", () => {
    const r = {
      suggestions: [
        predicao("Centro", "Santos - SP, Brasil"),
        predicao("Centro", "Santos - SP, Brasil", ["neighborhood"]),
        predicao("Centro", "Guarulhos - SP, Brasil"),
      ],
    };
    expect(normalizarGoogle(r, "Centro")).toEqual([
      { bairro: "Centro", cidade: "Santos" },
      { bairro: "Centro", cidade: "Guarulhos" },
    ]);
  });

  it("corpo torto ou texto curto viram lista vazia", () => {
    expect(normalizarGoogle(null, "Centro")).toEqual([]);
    expect(normalizarGoogle({ error: { code: 403 } }, "Centro")).toEqual([]);
    expect(normalizarGoogle({ suggestions: "x" }, "Centro")).toEqual([]);
    expect(normalizarGoogle({ suggestions: [predicao("Centro", "Santos - SP, Brasil")] }, "ce")).toEqual([]);
  });

  it("respeita o limite", () => {
    const r = {
      suggestions: ["Santos", "Guarulhos", "Diadema", "Osasco"].map((c) =>
        predicao("Centro", `${c} - SP, Brasil`),
      ),
    };
    expect(normalizarGoogle(r, "Centro", 2)).toHaveLength(2);
  });
});

describe("cidadeDoTexto", () => {
  it("entende os formatos que o Google usa", () => {
    expect(cidadeDoTexto("Osasco - SP, Brasil")).toBe("Osasco");
    expect(cidadeDoTexto("Santos, SP, Brasil")).toBe("Santos");
    expect(cidadeDoTexto("Centro, Santo André - SP, Brasil")).toBe("Santo André");
  });

  it("cidade vem antes do estado — mesmo quando os dois se chamam Sao Paulo", () => {
    expect(cidadeDoTexto("Jundiaí - São Paulo, Brasil")).toBe("Jundiaí");
    expect(cidadeDoTexto("São Paulo - SP, Brasil")).toBe("São Paulo");
  });

  it("estado e pais sozinhos nao sao cidade", () => {
    expect(cidadeDoTexto("SP, Brasil")).toBeNull();
    expect(cidadeDoTexto("Brasil")).toBeNull();
    expect(cidadeDoTexto(undefined)).toBeNull();
    expect(cidadeDoTexto("")).toBeNull();
  });
});

describe("o pedido que a gente manda", () => {
  it("vai pro endereco do Autocomplete (New)", () => {
    expect(URL_AUTOCOMPLETE).toBe("https://places.googleapis.com/v1/places:autocomplete");
  });

  it("pede bairro, no Brasil, dentro do retangulo de Sao Paulo, em portugues", () => {
    const c = corpoAutocomplete("Vila Yara");
    expect(c.input).toBe("Vila Yara");
    expect(c.includedPrimaryTypes).toEqual(["(regions)"]);
    expect(c.includedRegionCodes).toEqual(["br"]);
    expect(c.languageCode).toBe("pt-BR");
    expect(c.locationRestriction.rectangle).toBe(RETANGULO_SP);
  });

  it("NAO manda regionCode — com ele o secondaryText (a cidade) pode vir vazio", () => {
    expect(corpoAutocomplete("Centro")).not.toHaveProperty("regionCode");
  });

  it("o retangulo cobre o estado de ponta a ponta", () => {
    // Rosana (oeste) ~-53,0 · Ubatuba (leste) ~-45,0 · Barra do Turvo (sul)
    // ~-25,2 · divisa com Minas (norte) ~-19,8
    expect(RETANGULO_SP.low.latitude).toBeLessThan(-25.2);
    expect(RETANGULO_SP.high.latitude).toBeGreaterThan(-19.8);
    expect(RETANGULO_SP.low.longitude).toBeLessThan(-53);
    expect(RETANGULO_SP.high.longitude).toBeGreaterThan(-45);
  });

  it("o field mask nao tem espaco — o Google recusa se tiver", () => {
    expect(FIELD_MASK).not.toMatch(/\s/);
    expect(FIELD_MASK).toContain("structuredFormat");
    expect(FIELD_MASK).toContain("types");
  });
});

describe("a trava do gasto", () => {
  it("para antes da franquia gratuita acabar", () => {
    expect(FRANQUIA_GOOGLE_AUTOCOMPLETE).toBe(10_000);
    expect(TETO_PLACES_MES).toBeLessThan(FRANQUIA_GOOGLE_AUTOCOMPLETE);
    // Folga pra contagem nao atomica: pelo menos 1.000 chamadas.
    expect(FRANQUIA_GOOGLE_AUTOCOMPLETE - TETO_PLACES_MES).toBeGreaterThanOrEqual(1_000);
  });

  it("a janela da cota e o mes do calendario, igual a do Google", () => {
    expect(mesAtual(new Date("2026-11-08T23:00:00Z"))).toBe("2026-11");
    expect(mesAtual(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12");
  });
});
