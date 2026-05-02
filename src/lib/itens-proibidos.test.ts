// Testes do filtro de itens proibidos.
//
// Cobre: detecção positiva (pega o que deve), negativa (não dá falso
// positivo em palavras parecidas), case insensitive, acentos.

import { describe, it, expect } from "vitest";
import { detectarItensProibidos, mensagemRecusaPorItemProibido } from "./itens-proibidos";

describe("detectarItensProibidos — pega proibidos", () => {
  it("animais vivos", () => {
    const r = detectarItensProibidos({ textoLivre: "preciso transportar 2 cachorros pra Campinas" });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].categoria).toBe("animais_vivos");
  });

  it("drogas obvias", () => {
    const r = detectarItensProibidos({ textoLivre: "tenho 50kg de maconha pra entregar" });
    expect(r.some((a) => a.categoria === "drogas")).toBe(true);
  });

  it("armas/municao", () => {
    const r = detectarItensProibidos({ textoLivre: "transportar uma pistola e municao" });
    const cats = r.map((a) => a.categoria);
    expect(cats).toContain("armas");
  });

  it("bebe e crianca", () => {
    const r = detectarItensProibidos({ textoLivre: "minha bebê e o cachorro" });
    const cats = r.map((a) => a.categoria);
    expect(cats).toContain("pessoas");
    expect(cats).toContain("animais_vivos");
  });

  it("explosivos diretos", () => {
    const r = detectarItensProibidos({ textoLivre: "umas dinamites velhas" });
    expect(r.some((a) => a.categoria === "explosivos")).toBe(true);
  });

  it("material biologico", () => {
    const r = detectarItensProibidos({ textoLivre: "preciso levar bolsa de sangue urgente" });
    expect(r.some((a) => a.categoria === "material_biologico")).toBe(true);
  });

  it("detecta dentro do array de itens", () => {
    const r = detectarItensProibidos({ itens: ["sofa", "estante", "cachorro"] });
    expect(r.some((a) => a.categoria === "animais_vivos")).toBe(true);
  });

  it("case-insensitive e com acentos", () => {
    expect(detectarItensProibidos({ textoLivre: "MACONHA" }).length).toBeGreaterThan(0);
    expect(detectarItensProibidos({ textoLivre: "cachôrro" }).length).toBeGreaterThan(0);
    expect(detectarItensProibidos({ textoLivre: "Cães" }).length).toBeGreaterThan(0);
  });
});

describe("detectarItensProibidos — NAO da falso positivo", () => {
  // Esses casos sao crucias. "arma" dentro de "armario" nao pode bloquear.
  it("nao confunde armario com arma", () => {
    const r = detectarItensProibidos({ textoLivre: "preciso mudar 1 armário grande" });
    expect(r.length).toBe(0);
  });

  it("nao confunde 'aveia' com 'ave'", () => {
    const r = detectarItensProibidos({ textoLivre: "1 caixa de aveia" });
    expect(r.length).toBe(0);
  });

  it("nao confunde 'avental' com 'ave'", () => {
    const r = detectarItensProibidos({ itens: ["avental", "panela", "fogao"] });
    expect(r.length).toBe(0);
  });

  it("nao bloqueia 'gato hidraulico' (peca)", () => {
    // FALSO NEGATIVO ACEITAVEL: "gato" sem qualificador eh pego, mesmo que
    // possa ser peça mecanica. Decisao de produto: melhor recusar e
    // pedir esclarecimento que aceitar transporte de animal vivo.
    // Esse teste documenta o comportamento.
    const r = detectarItensProibidos({ textoLivre: "preciso de gato hidraulico" });
    expect(r.length).toBeGreaterThan(0);
  });

  it("frete de mudanca normal: limpo", () => {
    const r = detectarItensProibidos({
      textoLivre: "geladeira, fogão, sofa de 3 lugares e 5 caixas de roupa",
    });
    expect(r.length).toBe(0);
  });

  it("entrada vazia: limpo", () => {
    expect(detectarItensProibidos({}).length).toBe(0);
    expect(detectarItensProibidos({ textoLivre: "" }).length).toBe(0);
    expect(detectarItensProibidos({ itens: [] }).length).toBe(0);
  });
});

describe("mensagemRecusaPorItemProibido", () => {
  it("retorna vazio sem achados", () => {
    expect(mensagemRecusaPorItemProibido([])).toBe("");
  });

  it("cita categoria detectada", () => {
    const m = mensagemRecusaPorItemProibido([{ categoria: "animais_vivos", termo: "cachorro" }]);
    expect(m).toContain("animais vivos");
  });

  it("nao acusa o cliente — tom neutro/educado", () => {
    const m = mensagemRecusaPorItemProibido([{ categoria: "drogas", termo: "maconha" }]);
    // Nao deve ter palavras agressivas
    expect(m.toLowerCase()).not.toContain("ilegal");
    expect(m.toLowerCase()).not.toContain("crime");
  });
});
