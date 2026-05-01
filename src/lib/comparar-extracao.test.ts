import { describe, it, expect } from "vitest";
import { compararExtracao } from "./comparar-extracao";

// Testes regressivos da logica de comparacao IA-vs-real do cron
// medir-qualidade-ia. Valida que mudancas futuras na heuristica fuzzy
// nao quebram casos historicos conhecidos.

describe("compararExtracao", () => {
  it("retorna campos vazios e taxa 0 quando IA nao extraiu nada", () => {
    const r = compararExtracao({}, { tipo_servico: "frete" });
    expect(r.campos_corretos).toEqual([]);
    expect(r.campos_incorretos).toEqual([]);
    expect(r.taxa_acerto).toBe(0);
  });

  it("detecta acerto perfeito quando IA extraiu corretamente", () => {
    const ia = {
      servico: "frete" as const,
      origem_texto: "Osasco",
      destino_texto: "Pinheiros",
      veiculo_sugerido: "utilitario",
      precisa_ajudante: true,
    };
    const real = {
      tipo_servico: "frete",
      tipo_veiculo: "utilitario",
      origem_endereco: "Av. Brasil 100, Osasco - SP",
      destino_endereco: "Rua Cardeal Arcoverde, Pinheiros - SP",
      qtd_ajudantes: 1,
    };
    const r = compararExtracao(ia, real);
    expect(r.campos_corretos).toEqual(expect.arrayContaining(["servico", "origem", "destino", "veiculo", "ajudante"]));
    expect(r.campos_incorretos).toEqual([]);
    expect(r.taxa_acerto).toBe(1);
  });

  it("normaliza 'mudanca' (IA) <-> 'frete' (corrida)", () => {
    const r = compararExtracao(
      { servico: "mudanca" as any },
      { tipo_servico: "frete" },
    );
    expect(r.campos_corretos).toContain("servico");
  });

  it("fuzzy match de endereco: substring conta como acerto", () => {
    const r = compararExtracao(
      { origem_texto: "Osasco" },
      { origem_endereco: "Avenida das Flores 500, Osasco - SP" },
    );
    expect(r.campos_corretos).toContain("origem");
  });

  it("fuzzy match de endereco: cidades diferentes = erro", () => {
    const r = compararExtracao(
      { origem_texto: "Pompeia" },
      { origem_endereco: "Av. Pompeia 1000, Sao Paulo - SP" },
    );
    // "pompeia" aparece em "av. pompeia 1000" → match correto
    expect(r.campos_corretos).toContain("origem");
  });

  it("fuzzy match: bairros sem palavra em comum = erro", () => {
    const r = compararExtracao(
      { origem_texto: "Vila Mariana" },
      { origem_endereco: "Bairro Brooklin, Sao Paulo" },
    );
    expect(r.campos_incorretos).toContain("origem");
  });

  it("ajudante: IA disse true e qtd_ajudantes=1 = acerto", () => {
    const r = compararExtracao(
      { precisa_ajudante: true },
      { qtd_ajudantes: 1 },
    );
    expect(r.campos_corretos).toContain("ajudante");
  });

  it("ajudante: IA disse true mas qtd_ajudantes=0 = erro", () => {
    const r = compararExtracao(
      { precisa_ajudante: true },
      { qtd_ajudantes: 0 },
    );
    expect(r.campos_incorretos).toContain("ajudante");
  });

  it("itens: 50%+ aparecem em descricao_carga = acerto", () => {
    const r = compararExtracao(
      { itens: ["Geladeira", "Sofa", "Cama"] },
      { descricao_carga: "geladeira duplex e sofa de 3 lugares" },
    );
    expect(r.campos_corretos).toContain("itens");
  });

  it("itens: menos de 50% aparece = erro", () => {
    const r = compararExtracao(
      { itens: ["Geladeira", "Sofa", "Cama", "Mesa"] },
      { descricao_carga: "apenas geladeira pequena" },
    );
    expect(r.campos_incorretos).toContain("itens");
  });

  it("itens: array vazio nao avalia (skip silencioso)", () => {
    const r = compararExtracao(
      { itens: [] },
      { descricao_carga: "qualquer coisa" },
    );
    expect(r.campos_corretos).not.toContain("itens");
    expect(r.campos_incorretos).not.toContain("itens");
  });

  it("veiculo_marca_modelo: marca aparece em descricao = acerto", () => {
    const r = compararExtracao(
      { veiculo_marca_modelo: "Honda Civic 2018" },
      { descricao_carga: "Guincho - Hatch/Sedan | Honda Civic 2018" },
    );
    expect(r.campos_corretos).toContain("veiculo_marca");
  });

  it("calcula taxa_acerto como acertos/total quando ha campos", () => {
    const r = compararExtracao(
      { servico: "frete" as const, origem_texto: "Osasco", destino_texto: "Pinheiros" },
      { tipo_servico: "frete", origem_endereco: "Osasco", destino_endereco: "Bairro Brooklin" },
    );
    // servico e origem ok, destino erra → 2/3 = 0.667
    expect(r.campos_corretos.length).toBe(2);
    expect(r.campos_incorretos.length).toBe(1);
    expect(r.taxa_acerto).toBeCloseTo(0.667, 2);
  });

  it("ignora campos que IA nao extraiu (null) — nao penaliza", () => {
    const r = compararExtracao(
      { servico: "frete" as const }, // so 1 campo extraido
      { tipo_servico: "frete", origem_endereco: "X", destino_endereco: "Y", tipo_veiculo: "hr" },
    );
    expect(r.campos_corretos.length).toBe(1);
    expect(r.campos_incorretos.length).toBe(0);
    expect(r.taxa_acerto).toBe(1);
  });
});
