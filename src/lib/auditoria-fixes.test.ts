import { describe, it, expect } from "vitest";
import { isValidBrPhone } from "./phone-utils";
import { analisarClusters, type FeedbackBruto } from "./analisar-clusters-feedback";

// Testes regressivos: garantem que os fixes da auditoria de 30/Abr/2026
// nao regridem em deploys futuros. Cada bloco mapeia a um achado da
// auditoria multi-agente (commit c258ccc + sessao continuacao).

describe("isValidBrPhone (fix #3 webhook filter)", () => {
  it.each([
    ["5511971429605"], // 13 digitos - DDD 11, 9 digitos celular
    ["551134567890"],  // 12 digitos - fixo (8 digitos)
    ["5547999010385"], // cliente real fora SP
    ["5511953938849"], // Jackeline
  ])("aceita BR valido: %s", (phone) => {
    expect(isValidBrPhone(phone)).toBe(true);
  });

  it.each([
    [""],
    [null],
    [undefined],
    ["123"],                 // muito curto
    ["abc11971429605"],      // letras
    ["19293210000"],         // EUA (sem 55)
    ["5511971429605@lid"],   // JID com sufixo
    ["55119714296050"],      // 14 digitos - longo demais
    ["120363042000000000"],  // ID de grupo whatsapp
    ["55"],                  // so DDI
    ["5511"],                // so DDI + DDD
  ])("rejeita invalido: %s", (phone) => {
    expect(isValidBrPhone(phone as any)).toBe(false);
  });
});

describe("analisarClusters (sugestoes automaticas pra Fabio)", () => {
  // Helper: gera feedback sintetico
  function fb(opts: Partial<FeedbackBruto> & {
    veiculo: string;
    distancia_km: number;
    qtd_itens: number;
    tem_ajudante: boolean;
    gap_percentual: number;
    preco_pegue: number;
  }): FeedbackBruto {
    const sugerido = Math.round(opts.preco_pegue * (1 + opts.gap_percentual / 100));
    return {
      id: opts.id || Math.random().toString(36).slice(2),
      veiculo: opts.veiculo,
      zona: opts.zona || "normal",
      distancia_km: opts.distancia_km,
      qtd_itens: opts.qtd_itens,
      tem_ajudante: opts.tem_ajudante,
      preco_pegue: opts.preco_pegue,
      preco_sugerido: opts.preco_sugerido || sugerido,
      gap_percentual: opts.gap_percentual,
      fretista_phone: opts.fretista_phone || "5511999999999",
      fretista_nome: opts.fretista_nome || null,
      criado_em: opts.criado_em || new Date().toISOString(),
    };
  }

  it("retorna [] quando ha menos de 3 avaliacoes no mesmo bucket", () => {
    const feedbacks = [
      fb({ veiculo: "hr", distancia_km: 12, qtd_itens: 4, tem_ajudante: true, preco_pegue: 500, gap_percentual: -20 }),
      fb({ veiculo: "hr", distancia_km: 13, qtd_itens: 4, tem_ajudante: true, preco_pegue: 510, gap_percentual: -25 }),
    ];
    expect(analisarClusters(feedbacks)).toEqual([]);
  });

  it("ignora cluster com gap medio < 5%", () => {
    const feedbacks = [
      fb({ veiculo: "hr", distancia_km: 12, qtd_itens: 4, tem_ajudante: true, preco_pegue: 500, gap_percentual: -3 }),
      fb({ veiculo: "hr", distancia_km: 13, qtd_itens: 4, tem_ajudante: true, preco_pegue: 510, gap_percentual: -2 }),
      fb({ veiculo: "hr", distancia_km: 12, qtd_itens: 5, tem_ajudante: true, preco_pegue: 520, gap_percentual: 1 }),
    ];
    expect(analisarClusters(feedbacks)).toEqual([]);
  });

  it("detecta cluster com 3+ avaliacoes consistentes (gap medio -25%)", () => {
    const feedbacks = [
      fb({ veiculo: "hr", distancia_km: 12, qtd_itens: 4, tem_ajudante: true, preco_pegue: 500, gap_percentual: -25 }),
      fb({ veiculo: "hr", distancia_km: 13, qtd_itens: 4, tem_ajudante: true, preco_pegue: 510, gap_percentual: -27 }),
      fb({ veiculo: "hr", distancia_km: 11, qtd_itens: 5, tem_ajudante: true, preco_pegue: 490, gap_percentual: -23 }),
    ];
    const clusters = analisarClusters(feedbacks);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].veiculo).toBe("hr");
    expect(clusters[0].qtd_avaliacoes).toBe(3);
    expect(clusters[0].gap_medio).toBeLessThan(-20);
    expect(clusters[0].concordancia_pct).toBe(100);
  });

  it("rejeita cluster com baixa concordancia (avaliacoes divergentes)", () => {
    const feedbacks = [
      fb({ veiculo: "hr", distancia_km: 12, qtd_itens: 4, tem_ajudante: true, preco_pegue: 500, gap_percentual: -25 }),
      fb({ veiculo: "hr", distancia_km: 13, qtd_itens: 4, tem_ajudante: true, preco_pegue: 510, gap_percentual: +30 }),
      fb({ veiculo: "hr", distancia_km: 11, qtd_itens: 5, tem_ajudante: true, preco_pegue: 490, gap_percentual: -10 }),
    ];
    // gap medio fica em -1.7% (abaixo do threshold de 5%) — deve filtrar
    expect(analisarClusters(feedbacks)).toEqual([]);
  });

  it("ranqueia clusters por confianca (qtd * |gap|)", () => {
    const feedbacks = [
      // Cluster A: 3 avaliacoes, gap -10% -> score 30
      fb({ veiculo: "utilitario", distancia_km: 12, qtd_itens: 3, tem_ajudante: false, preco_pegue: 300, gap_percentual: -10 }),
      fb({ veiculo: "utilitario", distancia_km: 13, qtd_itens: 3, tem_ajudante: false, preco_pegue: 310, gap_percentual: -10 }),
      fb({ veiculo: "utilitario", distancia_km: 14, qtd_itens: 3, tem_ajudante: false, preco_pegue: 320, gap_percentual: -10 }),
      // Cluster B: 4 avaliacoes, gap -15% -> score 60 (deve vir primeiro)
      fb({ veiculo: "hr", distancia_km: 22, qtd_itens: 5, tem_ajudante: true, preco_pegue: 600, gap_percentual: -15 }),
      fb({ veiculo: "hr", distancia_km: 24, qtd_itens: 5, tem_ajudante: true, preco_pegue: 620, gap_percentual: -15 }),
      fb({ veiculo: "hr", distancia_km: 23, qtd_itens: 5, tem_ajudante: true, preco_pegue: 610, gap_percentual: -15 }),
      fb({ veiculo: "hr", distancia_km: 22, qtd_itens: 6, tem_ajudante: true, preco_pegue: 640, gap_percentual: -16 }),
    ];
    const clusters = analisarClusters(feedbacks);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].veiculo).toBe("hr");           // maior score
    expect(clusters[0].confianca_score).toBeGreaterThan(clusters[1].confianca_score);
  });

  it("agrupa avaliadores unicos por phone", () => {
    const feedbacks = [
      fb({ veiculo: "hr", distancia_km: 12, qtd_itens: 4, tem_ajudante: true, preco_pegue: 500, gap_percentual: -20, fretista_phone: "5511971429605", fretista_nome: "Fabio" }),
      fb({ veiculo: "hr", distancia_km: 12, qtd_itens: 4, tem_ajudante: true, preco_pegue: 500, gap_percentual: -20, fretista_phone: "5511971429605", fretista_nome: "Fabio" }),
      fb({ veiculo: "hr", distancia_km: 13, qtd_itens: 4, tem_ajudante: true, preco_pegue: 510, gap_percentual: -22, fretista_phone: "5511953938849", fretista_nome: "Jackeline" }),
    ];
    const clusters = analisarClusters(feedbacks);
    expect(clusters[0].qtd_avaliadores_unicos).toBe(2); // Fabio + Jackeline
    expect(clusters[0].avaliadores).toHaveLength(2);
  });

  it("respeita parametro minAvaliacoes ajustavel", () => {
    const feedbacks = [
      fb({ veiculo: "hr", distancia_km: 12, qtd_itens: 4, tem_ajudante: true, preco_pegue: 500, gap_percentual: -20 }),
      fb({ veiculo: "hr", distancia_km: 13, qtd_itens: 4, tem_ajudante: true, preco_pegue: 510, gap_percentual: -22 }),
    ];
    expect(analisarClusters(feedbacks, { minAvaliacoes: 3 })).toEqual([]);
    expect(analisarClusters(feedbacks, { minAvaliacoes: 2 })).toHaveLength(1);
  });
});
