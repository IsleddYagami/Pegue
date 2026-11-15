import { describe, it, expect } from "vitest";
import { melhorPorJogador } from "./ranking-jogo";
import rankingReal from "./__fixtures__/ranking-pegue-runner.json";

// O gabarito `ranking-pegue-runner.json` e a resposta DE VERDADE de
// https://www.chamepegue.com.br/api/ranking, capturada em 14/11/2026: 20
// linhas, 8 jogadores, a Clara repetida 7 vezes. E' esse quadro que o site
// mostrava se a lista fosse direto pra tela.

describe("melhorPorJogador — ranking de verdade do site", () => {
  it("20 linhas do banco viram 8 jogadores, sem repetir ninguem", () => {
    const r = melhorPorJogador(rankingReal, 20);
    expect(r).toHaveLength(8);
    expect(new Set(r.map((x) => x.nome.toLowerCase())).size).toBe(8);
  });

  it("fica a MELHOR corrida de cada um", () => {
    const r = melhorPorJogador(rankingReal, 20);
    const clara = r.find((x) => x.nome === "Clara");
    const todasDaClara = (rankingReal as { nome: string; distancia: number }[])
      .filter((x) => x.nome === "Clara")
      .map((x) => x.distancia);
    expect(clara?.distancia).toBe(Math.max(...todasDaClara));
  });

  it("vem da maior distancia pra menor", () => {
    const r = melhorPorJogador(rankingReal, 20);
    const d = r.map((x) => x.distancia);
    expect([...d].sort((a, b) => b - a)).toEqual(d);
  });

  it("o limite corta o fim, nao o comeco", () => {
    const todos = melhorPorJogador(rankingReal, 20);
    const cinco = melhorPorJogador(rankingReal, 5);
    expect(cinco).toHaveLength(5);
    expect(cinco).toEqual(todos.slice(0, 5));
  });
});

describe("melhorPorJogador — o que NAO pode passar", () => {
  it("corpo que nao e lista vira lista vazia", () => {
    expect(melhorPorJogador(null)).toEqual([]);
    expect(melhorPorJogador({ erro: "x" })).toEqual([]);
    expect(melhorPorJogador("Clara")).toEqual([]);
  });

  it("linha sem nome ou com distancia invalida fica fora", () => {
    const lixo = [
      { nome: "", score: 10, distancia: 100 },
      { nome: "   ", score: 10, distancia: 100 },
      { nome: "Ok", score: 10, distancia: "muito longe" },
      { nome: "Ok2", score: 10, distancia: -5 },
      { nome: "Boa", score: 10, distancia: 50 },
    ];
    expect(melhorPorJogador(lixo)).toEqual([{ nome: "Boa", distancia: 50, score: 10 }]);
  });

  it("mesmo nome com acento, caixa ou espaco sobrando conta como um jogador", () => {
    const l = [
      { nome: "Iuri", score: 1, distancia: 10 },
      { nome: "  iuri ", score: 9, distancia: 90 },
      { nome: "Íuri", score: 5, distancia: 50 },
    ];
    const r = melhorPorJogador(l);
    expect(r).toHaveLength(1);
    expect(r[0].distancia).toBe(90);
  });

  it("empate na distancia decide pelo score", () => {
    const l = [
      { nome: "A", score: 10, distancia: 100 },
      { nome: "B", score: 80, distancia: 100 },
    ];
    expect(melhorPorJogador(l).map((x) => x.nome)).toEqual(["B", "A"]);
  });

  it("score baguncado nao derruba a lista (entra como zero)", () => {
    const r = melhorPorJogador([{ nome: "C", score: null, distancia: 7 }]);
    expect(r).toEqual([{ nome: "C", distancia: 7, score: 0 }]);
  });

  it("limite zero ou negativo devolve lista vazia", () => {
    expect(melhorPorJogador(rankingReal, 0)).toEqual([]);
    expect(melhorPorJogador(rankingReal, -3)).toEqual([]);
  });
});
