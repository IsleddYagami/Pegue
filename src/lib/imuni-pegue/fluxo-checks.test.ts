// Testes regressivos das sentinelas de FLUXO DE VENDA (INV-24 a INV-27).
//
// Filosofia (audit 4/Mai/2026 com Fabio): "se a IMUNI conseguir atacar
// isso — pedido errado e preco e pgto errado — ai realmente vira ouro".
// Cada teste eh um cenario CONCRETO de bug que a sentinela foi feita pra
// pegar — falsificacao em laboratorio.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Builder do mock que aceita data customizado por chamada.
let mockResultadosPorTabela: Record<string, { data: any[] | null; error: any }> = {};
let proximaTabelaConsultada = "";

vi.mock("@/lib/supabase-admin", () => {
  const chain: any = new Proxy(
    {},
    {
      get(_target: any, prop: string) {
        if (prop === "data" || prop === "error" || prop === "then") {
          const r = mockResultadosPorTabela[proximaTabelaConsultada] || { data: [], error: null };
          if (prop === "data") return r.data;
          if (prop === "error") return r.error;
          if (prop === "then") {
            return (resolve: any) => resolve(r);
          }
        }
        return () => chain;
      },
    },
  );
  return {
    supabaseAdmin: {
      from: (tabela: string) => {
        proximaTabelaConsultada = tabela;
        return chain;
      },
    },
  };
});

import {
  invValorPagoDivergeDaCorrida,
  invCotacaoVsValorFinalDivergente,
  invSplitValorErrado,
  invStatusAvancadoSemPagamento,
} from "./fluxo-checks";

beforeEach(() => {
  mockResultadosPorTabela = {};
});

describe("INV-24 invValorPagoDivergeDaCorrida — cobranca incorreta", () => {
  it("sem pagamentos: nao alarma", async () => {
    mockResultadosPorTabela = { pagamentos: { data: [], error: null } };
    const r = await invValorPagoDivergeDaCorrida();
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
  });

  it("valor pago igual a valor_final: nao alarma", async () => {
    mockResultadosPorTabela = {
      pagamentos: {
        data: [
          { id: "p1", corrida_id: "c1", valor: 80, status: "aprovado", criado_em: new Date().toISOString(), corridas: { id: "c1", codigo: "PEG-001", valor_final: 80, status: "concluida" } },
        ],
        error: null,
      },
    };
    const r = await invValorPagoDivergeDaCorrida();
    expect(r.ok).toBe(true);
  });

  it("valor pago R$1 a menos que valor_final: ALARMA", async () => {
    // Cenario alvo: cliente pagou R$ 79 em corrida de R$ 80. Bug ou fraude.
    mockResultadosPorTabela = {
      pagamentos: {
        data: [
          { id: "p1", corrida_id: "c1", valor: 79, status: "aprovado", criado_em: new Date().toISOString(), corridas: { id: "c1", codigo: "PEG-001", valor_final: 80, status: "concluida" } },
        ],
        error: null,
      },
    };
    const r = await invValorPagoDivergeDaCorrida();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("alta");
    expect(r.amostra[0].diferenca).toBe(-1);
  });

  it("diferenca de 1 centavo (arredondamento): nao alarma", async () => {
    // Tolerancia: calculo % gera centavo a mais/menos. Aceitavel.
    mockResultadosPorTabela = {
      pagamentos: {
        data: [
          { id: "p1", corrida_id: "c1", valor: 80.00, status: "aprovado", criado_em: new Date().toISOString(), corridas: { id: "c1", codigo: "PEG-001", valor_final: 80.005, status: "concluida" } },
        ],
        error: null,
      },
    };
    const r = await invValorPagoDivergeDaCorrida();
    expect(r.ok).toBe(true);
  });
});

describe("INV-25 invCotacaoVsValorFinalDivergente — re-calculo silencioso", () => {
  it("sem corridas: nao alarma", async () => {
    mockResultadosPorTabela = { corridas: { data: [], error: null } };
    const r = await invCotacaoVsValorFinalDivergente();
    expect(r.ok).toBe(true);
  });

  it("valor_final igual ao estimado: nao alarma", async () => {
    mockResultadosPorTabela = {
      corridas: {
        data: [{ id: "c1", codigo: "PEG-001", valor_estimado: 80, valor_final: 80, status: "concluida", criado_em: new Date().toISOString() }],
        error: null,
      },
    };
    const r = await invCotacaoVsValorFinalDivergente();
    expect(r.ok).toBe(true);
  });

  it("divergencia de 3% (dentro tolerancia): nao alarma", async () => {
    mockResultadosPorTabela = {
      corridas: {
        data: [{ id: "c1", codigo: "PEG-001", valor_estimado: 100, valor_final: 103, status: "concluida", criado_em: new Date().toISOString() }],
        error: null,
      },
    };
    const r = await invCotacaoVsValorFinalDivergente();
    expect(r.ok).toBe(true);
  });

  it("divergencia de 50% (re-calculo brutal): ALARMA", async () => {
    // Cenario alvo: IA cotou R$ 80, sistema cobrou R$ 120 sem revalidar.
    mockResultadosPorTabela = {
      corridas: {
        data: [{ id: "c1", codigo: "PEG-001", valor_estimado: 80, valor_final: 120, status: "concluida", criado_em: new Date().toISOString() }],
        error: null,
      },
    };
    const r = await invCotacaoVsValorFinalDivergente();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.amostra[0].delta_pct).toBe(50);
  });
});

describe("INV-26 invSplitValorErrado — bug aritmetico no split", () => {
  it("split exato (prestador+pegue=final): nao alarma", async () => {
    mockResultadosPorTabela = {
      corridas: {
        data: [{ id: "c1", codigo: "PEG-001", valor_final: 100, valor_prestador: 80, valor_pegue: 20, status: "concluida", criado_em: new Date().toISOString() }],
        error: null,
      },
    };
    const r = await invSplitValorErrado();
    expect(r.ok).toBe(true);
  });

  it("split errado em R$ 5: ALARMA", async () => {
    // Cenario alvo: bug calculou prestador=80, pegue=15 (deveria 20).
    // Total nao bate. Fretista vai receber a mais OU Pegue vai ficar com
    // margem errada.
    mockResultadosPorTabela = {
      corridas: {
        data: [{ id: "c1", codigo: "PEG-001", valor_final: 100, valor_prestador: 80, valor_pegue: 15, status: "concluida", criado_em: new Date().toISOString() }],
        error: null,
      },
    };
    const r = await invSplitValorErrado();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("alta");
    expect(r.amostra[0].diferenca).toBe(5);
  });

  it("diferenca de 1 centavo: nao alarma (arredondamento)", async () => {
    mockResultadosPorTabela = {
      corridas: {
        data: [{ id: "c1", codigo: "PEG-001", valor_final: 100, valor_prestador: 80, valor_pegue: 20.005, status: "concluida", criado_em: new Date().toISOString() }],
        error: null,
      },
    };
    const r = await invSplitValorErrado();
    expect(r.ok).toBe(true);
  });
});

describe("INV-27 invStatusAvancadoSemPagamento — sequencia quebrada", () => {
  it("sem corridas em status avancado: nao alarma", async () => {
    mockResultadosPorTabela = { corridas: { data: [], error: null }, pagamentos: { data: [], error: null } };
    const r = await invStatusAvancadoSemPagamento();
    expect(r.ok).toBe(true);
  });

  it("corrida em em_coleta com pagamento aprovado: nao alarma", async () => {
    mockResultadosPorTabela = {
      corridas: {
        data: [{ id: "c1", codigo: "PEG-001", status: "em_coleta", valor_final: 80, pago_em: new Date().toISOString(), asaas_payment_id: null, criado_em: new Date().toISOString() }],
        error: null,
      },
      pagamentos: {
        data: [{ corrida_id: "c1", status: "aprovado" }],
        error: null,
      },
    };
    const r = await invStatusAvancadoSemPagamento();
    expect(r.ok).toBe(true);
  });

  it("corrida em em_coleta SEM pagamento aprovado E SEM asaas_payment_id: ALARMA", async () => {
    // Cenario alvo: fretista coletou frete que nao foi pago. Risco de
    // prejuizo direto.
    mockResultadosPorTabela = {
      corridas: {
        data: [{ id: "c1", codigo: "PEG-001", status: "em_coleta", valor_final: 80, pago_em: null, asaas_payment_id: null, criado_em: new Date().toISOString() }],
        error: null,
      },
      pagamentos: {
        data: [{ corrida_id: "c1", status: "pendente" }], // pendente nao conta
        error: null,
      },
    };
    const r = await invStatusAvancadoSemPagamento();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("alta");
    expect(r.amostra[0].codigo).toBe("PEG-001");
  });

  it("corrida em entregue COM asaas_payment_id (mesmo sem pagamentos): nao alarma", async () => {
    // Asaas guarda payment_id direto na corrida; basta presenca pra contar.
    mockResultadosPorTabela = {
      corridas: {
        data: [{ id: "c1", codigo: "PEG-001", status: "entregue", valor_final: 80, pago_em: new Date().toISOString(), asaas_payment_id: "pay_xxx", criado_em: new Date().toISOString() }],
        error: null,
      },
      pagamentos: { data: [], error: null },
    };
    const r = await invStatusAvancadoSemPagamento();
    expect(r.ok).toBe(true);
  });
});
