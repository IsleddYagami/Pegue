// Testes regressivos das sentinelas de FLUXO DE EXECUCAO (INV-32 a 35).
//
// Onda 4a — 5/Mai/2026. Cobrem progressao do cliente cotacao → entrega.
// Cada teste eh cenario CONCRETO que falsifica a sentinela em laboratorio.

import { describe, it, expect, vi, beforeEach } from "vitest";

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
          if (prop === "then") return (resolve: any) => resolve(r);
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
  invCorridaValorAbsurdo,
  invCorridaPendenteSemPagamento,
  invPagaSemDispatchAceito,
  invAceitaSemConclusao,
} from "./fluxo-execucao-checks";

beforeEach(() => {
  mockResultadosPorTabela = {};
});

describe("INV-32: corrida com valor_estimado fora da faixa razoavel", () => {
  it("OK quando todas corridas com valor entre R$ 5 e R$ 5000", async () => {
    mockResultadosPorTabela = {
      corridas: {
        data: [
          { id: "1", codigo: "PG1", valor_estimado: 80, valor_final: 80, status: "concluida", criado_em: new Date().toISOString() },
          { id: "2", codigo: "PG2", valor_estimado: 1500, valor_final: 1500, status: "paga", criado_em: new Date().toISOString() },
        ],
        error: null,
      },
    };
    const r = await invCorridaValorAbsurdo();
    expect(r.ok).toBe(true);
  });

  it("DETECTA valor zerado (bug de calculo)", async () => {
    mockResultadosPorTabela = {
      corridas: {
        data: [
          { id: "1", codigo: "PG1", valor_estimado: 0, valor_final: 0, status: "pendente", criado_em: new Date().toISOString() },
        ],
        error: null,
      },
    };
    const r = await invCorridaValorAbsurdo();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("alta");
  });

  it("DETECTA valor absurdamente alto (R$ 12000 - bug distancia em metros)", async () => {
    mockResultadosPorTabela = {
      corridas: {
        data: [
          { id: "1", codigo: "PG1", valor_estimado: 12000, valor_final: 12000, status: "pendente", criado_em: new Date().toISOString() },
        ],
        error: null,
      },
    };
    const r = await invCorridaValorAbsurdo();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
  });

  it("aceita R$ 5000 (limite superior — frete longa distancia legitimo)", async () => {
    mockResultadosPorTabela = {
      corridas: {
        data: [
          { id: "1", codigo: "PG1", valor_estimado: 5000, valor_final: 5000, status: "pendente", criado_em: new Date().toISOString() },
        ],
        error: null,
      },
    };
    const r = await invCorridaValorAbsurdo();
    expect(r.ok).toBe(true);
  });
});

describe("INV-33: cobranca Asaas gerada >24h sem pagamento", () => {
  it("OK quando nenhuma corrida pendente >24h com cobranca", async () => {
    mockResultadosPorTabela = { corridas: { data: [], error: null } };
    const r = await invCorridaPendenteSemPagamento();
    expect(r.ok).toBe(true);
  });

  it("DETECTA corrida pendente ha 36h com asaas_payment_id", async () => {
    const ha36h = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      corridas: {
        data: [
          { id: "1", codigo: "PG1", asaas_payment_id: "pay_xyz", status: "pendente", criado_em: ha36h, valor_estimado: 80 },
        ],
        error: null,
      },
    };
    const r = await invCorridaPendenteSemPagamento();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.amostra[0].horas_pendente).toBeGreaterThanOrEqual(35);
  });
});

describe("INV-34: corrida paga sem fretista aceito >5min", () => {
  it("OK quando todas as pagas tem prestador", async () => {
    mockResultadosPorTabela = { corridas: { data: [], error: null } };
    const r = await invPagaSemDispatchAceito();
    expect(r.ok).toBe(true);
  });

  it("DETECTA cliente que pagou ha 10min e ninguem foi", async () => {
    const ha10min = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      corridas: {
        data: [
          { id: "1", codigo: "PG1", status: "paga", prestador_id: null, criado_em: ha10min, atualizado_em: ha10min, valor_final: 100, dispatch_ativo: true },
        ],
        error: null,
      },
    };
    const r = await invPagaSemDispatchAceito();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("alta");
    expect(r.amostra[0].minutos_aguardando).toBeGreaterThanOrEqual(9);
  });
});

describe("INV-35: corrida aceita >2h sem conclusao", () => {
  it("OK quando todas as aceitas evoluem em <2h", async () => {
    mockResultadosPorTabela = { corridas: { data: [], error: null } };
    const r = await invAceitaSemConclusao();
    expect(r.ok).toBe(true);
  });

  it("DETECTA frete eterno (3h em status=aceita, dist 12km)", async () => {
    const ha3h = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      corridas: {
        data: [
          { id: "1", codigo: "PG1", status: "aceita", atualizado_em: ha3h, distancia_km: 12, periodo: null },
        ],
        error: null,
      },
    };
    const r = await invAceitaSemConclusao();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("media");
  });

  it("ignora frete >100km (legitimo levar muito tempo)", async () => {
    const ha3h = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      corridas: {
        data: [
          { id: "1", codigo: "PG1", status: "aceita", atualizado_em: ha3h, distancia_km: 150, periodo: null },
        ],
        error: null,
      },
    };
    const r = await invAceitaSemConclusao();
    expect(r.ok).toBe(true); // ignora — 150km legitimo
  });
});
