// Testes regressivos das sentinelas de FLUXO DO PRESTADOR (INV-41 a 45).
// Onda 5 — 6/Mai/2026.

import { describe, it, expect, vi, beforeEach } from "vitest";

let mockResultadosPorTabela: Record<string, { data: any[] | null; error: any; count?: number }> = {};
let proximaTabelaConsultada = "";

vi.mock("@/lib/supabase-admin", () => {
  const chain: any = new Proxy(
    {},
    {
      get(_target: any, prop: string) {
        if (prop === "data" || prop === "error" || prop === "count" || prop === "then") {
          const r = mockResultadosPorTabela[proximaTabelaConsultada] || { data: [], error: null, count: 0 };
          if (prop === "data") return r.data;
          if (prop === "error") return r.error;
          if (prop === "count") return r.count ?? 0;
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
  invPrestadorAprovacaoTravada,
  invPrestadorScoreBaixoAtivo,
  invPrestadorAltaTaxaReclamacao,
  invPrestadorCancelamentosRepetidos,
} from "./prestador-checks";

beforeEach(() => {
  mockResultadosPorTabela = {};
});

describe("INV-41: aprovacao de prestador travada >5d", () => {
  it("OK quando ningu1em pendente >5d", async () => {
    mockResultadosPorTabela = { prestadores: { data: [], error: null } };
    const r = await invPrestadorAprovacaoTravada();
    expect(r.ok).toBe(true);
  });

  it("DETECTA prestador pendente ha 10d", async () => {
    const ha10d = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      prestadores: {
        data: [
          { id: "p1", telefone: "5511999990001", nome: "Joao Silva", status: "pendente", criado_em: ha10d },
        ],
        error: null,
      },
    };
    const r = await invPrestadorAprovacaoTravada();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("alta");
    expect(r.amostra[0].dias_pendente).toBeGreaterThanOrEqual(9);
  });
});

describe("INV-43: score baixo (<3.5) ainda ativo", () => {
  it("OK quando todos com score >=3.5", async () => {
    mockResultadosPorTabela = { prestadores: { data: [], error: null } };
    const r = await invPrestadorScoreBaixoAtivo();
    expect(r.ok).toBe(true);
  });

  it("DETECTA prestador score 2.8 com 10 corridas (qualidade ruim consistente)", async () => {
    mockResultadosPorTabela = {
      prestadores: {
        data: [
          { id: "p1", telefone: "5511999990001", nome: "Joao", score: 2.8, total_corridas: 10, total_reclamacoes: 4 },
        ],
        error: null,
      },
    };
    const r = await invPrestadorScoreBaixoAtivo();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.amostra[0].score).toBe(2.8);
  });
});

describe("INV-44: taxa de reclamacao >=20%", () => {
  it("OK quando taxa <20% pra todos", async () => {
    mockResultadosPorTabela = {
      prestadores: {
        data: [
          { id: "p1", telefone: "5511999990001", nome: "Joao", total_corridas: 100, total_reclamacoes: 5, status: "aprovado" }, // 5%
        ],
        error: null,
      },
    };
    const r = await invPrestadorAltaTaxaReclamacao();
    expect(r.ok).toBe(true);
  });

  it("DETECTA prestador com 25% de reclamacao (5 em 20)", async () => {
    mockResultadosPorTabela = {
      prestadores: {
        data: [
          { id: "p1", telefone: "5511999990001", nome: "Joao", total_corridas: 20, total_reclamacoes: 5, status: "aprovado" },
        ],
        error: null,
      },
    };
    const r = await invPrestadorAltaTaxaReclamacao();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("alta");
    expect(r.amostra[0].taxa).toBe("25%");
  });

  it("ignora prestador com poucas corridas (<5)", async () => {
    mockResultadosPorTabela = {
      prestadores: {
        data: [
          { id: "p1", telefone: "5511999990001", nome: "Novato", total_corridas: 3, total_reclamacoes: 2, status: "aprovado" },
        ],
        error: null,
      },
    };
    const r = await invPrestadorAltaTaxaReclamacao();
    expect(r.ok).toBe(true);
  });
});

describe("INV-45: cancelamentos repetidos pos-aceite", () => {
  it("OK quando ningu1em cancelou", async () => {
    mockResultadosPorTabela = { corridas: { data: [], error: null } };
    const r = await invPrestadorCancelamentosRepetidos();
    expect(r.ok).toBe(true);
  });

  it("DETECTA prestador com 3 cancelamentos na semana", async () => {
    const agora = new Date().toISOString();
    mockResultadosPorTabela = {
      corridas: {
        data: [
          { prestador_id: "p1", codigo: "PG1", status: "cancelada", atualizado_em: agora },
          { prestador_id: "p1", codigo: "PG2", status: "cancelada", atualizado_em: agora },
          { prestador_id: "p1", codigo: "PG3", status: "cancelada", atualizado_em: agora },
        ],
        error: null,
      },
      prestadores: {
        data: [{ id: "p1", telefone: "5511999990001", nome: "Joao Cancelador" }],
        error: null,
      },
    };
    const r = await invPrestadorCancelamentosRepetidos();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("alta");
    expect(r.amostra[0].cancelamentos_7d).toBe(3);
  });

  it("ignora 2 cancelamentos (abaixo do threshold)", async () => {
    const agora = new Date().toISOString();
    mockResultadosPorTabela = {
      corridas: {
        data: [
          { prestador_id: "p1", codigo: "PG1", status: "cancelada", atualizado_em: agora },
          { prestador_id: "p1", codigo: "PG2", status: "cancelada", atualizado_em: agora },
        ],
        error: null,
      },
    };
    const r = await invPrestadorCancelamentosRepetidos();
    expect(r.ok).toBe(true);
  });
});
