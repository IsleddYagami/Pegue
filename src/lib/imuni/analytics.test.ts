// Testes da fórmula de score da IMUNI.
//
// Origem (2/Mai/2026): bug visivel em /admin/imuni — score CRITICO 48
// com TODOS os 16 sentinelas saudaveis ao vivo. Causa: score lia
// historico do bot_logs em vez de estado ao vivo, e amplificava 1
// falso positivo em historico raso (1 amostra em 30d virava 30% do peso).
//
// Esses testes blindam contra regressoes da fórmula.

import { describe, it, expect } from "vitest";
import { calcularScore, type ExecucaoHistorica, type SumarioAoVivo } from "./analytics";

const sentinela = (ok: boolean, severidade: "alta" | "media" | "baixa" = "alta") => ({
  nome: "INV-X",
  severidade,
  ok,
  count: ok ? 0 : 1,
});

const exec = (data: string, oks: boolean[], severs: ("alta" | "media" | "baixa")[] = []): ExecucaoHistorica => ({
  criado_em: data,
  payload: {
    total: oks.length,
    violacoes: oks.filter((x) => !x).length,
    sumario: oks.map((ok, i) => sentinela(ok, severs[i] || "alta")),
  },
});

const aovivo = (oks: boolean[], severs: ("alta" | "media" | "baixa")[] = []): SumarioAoVivo => ({
  sumario: oks.map((ok, i) => ({
    nome: `INV-${i}`,
    severidade: severs[i] || "alta",
    ok,
  })),
});

const HOJE = new Date().toISOString();
const ONTEM = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const SEMANA_ATRAS = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

describe("calcularScore — versao 2 (ao vivo + historico ponderado)", () => {
  it("sem historico nem ao vivo: 50 (neutro)", () => {
    expect(calcularScore([])).toBe(50);
  });

  it("ao vivo 100% limpo, sem historico: 100 (nao pune por falta de dados)", () => {
    const score = calcularScore([], aovivo([true, true, true, true, true]));
    expect(score).toBe(100);
  });

  it("CASO REAL DO BUG: ao vivo 16/16 limpo + 1 execucao historica com falha = score alto", () => {
    // Cenario que produzia 48 na versao antiga.
    // Ao vivo: 16/16 saudaveis. Historico: 1 execucao com 1 falha (provavel falso positivo).
    // Versao nova: deve dar score >= 90, nao 48.
    const historicoRaso = [exec(ONTEM, [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, false])];
    const aoVivoLimpo = aovivo(Array(16).fill(true));
    const score = calcularScore(historicoRaso, aoVivoLimpo);
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it("ao vivo com 1 violacao ALTA: aplica penalidade de -10", () => {
    // 15/16 ok + 1 violacao alta. pctAtual = 93.75%.
    // Sem historico, peso ao vivo = 100%. Score base = 93.75. Com penalidade = 83.75 -> 84.
    const oks = Array(16).fill(true);
    oks[0] = false;
    const score = calcularScore([], aovivo(oks));
    expect(score).toBeGreaterThanOrEqual(80);
    expect(score).toBeLessThanOrEqual(85);
  });

  it("ao vivo com tudo critico: score baixo mas nao fica negativo", () => {
    const oks = Array(16).fill(false);
    const score = calcularScore([], aovivo(oks));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(20);
  });

  it("historico solido limpo + ao vivo limpo: bonus +5 (chega em 100 com cap)", () => {
    const historicoSolido = [
      exec(HOJE, Array(16).fill(true)),
      exec(ONTEM, Array(16).fill(true)),
      exec(SEMANA_ATRAS, Array(16).fill(true)),
      exec(SEMANA_ATRAS, Array(16).fill(true)),
      exec(SEMANA_ATRAS, Array(16).fill(true)),
    ];
    const score = calcularScore(historicoSolido, aovivo(Array(16).fill(true)));
    expect(score).toBe(100);
  });

  it("historico ESCASSO (1 amostra): peso 7d/30d zerado, ao vivo domina", () => {
    // Antes da correcao: 1 amostra ruim em 30d = -30 pontos. Errado.
    // Agora: peso da janela so aplica se >=3 (7d) ou >=5 (30d).
    const historicoRuim = [exec(ONTEM, Array(16).fill(false))];
    const aoVivoLimpo = aovivo(Array(16).fill(true));
    const score = calcularScore(historicoRuim, aoVivoLimpo);
    // Sem peso histórico: 100% ao vivo = score 100.
    expect(score).toBe(100);
  });

  it("historico moderado (3+ exec) com falhas: peso 7d entra em jogo", () => {
    const ts = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
    const historico = [
      exec(ts(2), Array(16).fill(true)),       // limpa
      exec(ts(24), Array(16).fill(false)),     // toda quebrada
      exec(ts(48), Array(16).fill(false)),     // toda quebrada
      exec(ts(72), Array(16).fill(true)),      // limpa
    ];
    const score = calcularScore(historico, aovivo(Array(16).fill(true)));
    // Ao vivo limpo (peso 80%) + 7d 50% sem alta (peso 15%) = 80 + 7.5 = 87.5
    expect(score).toBeGreaterThanOrEqual(85);
    expect(score).toBeLessThanOrEqual(95);
  });

  it("compatibilidade: chamada sem ao vivo cai pra ultima do bot_logs", () => {
    const exclusivamenteHistorico = [exec(HOJE, Array(16).fill(true))];
    const score = calcularScore(exclusivamenteHistorico);
    expect(score).toBe(100);
  });

  it("score nunca passa de 100 nem fica abaixo de 0", () => {
    expect(calcularScore([], aovivo([true]))).toBeLessThanOrEqual(100);
    expect(calcularScore([], aovivo([false]))).toBeGreaterThanOrEqual(0);
  });

  it("score sempre inteiro arredondado", () => {
    const oks = [true, true, false, true, true, true, true]; // 6/7 = 85.7%
    const score = calcularScore([], aovivo(oks));
    expect(Number.isInteger(score)).toBe(true);
  });
});
