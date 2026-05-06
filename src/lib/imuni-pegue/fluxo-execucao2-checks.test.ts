// Testes regressivos das sentinelas de FLUXO DE EXECUCAO PARTE 2
// (INV-36 a INV-40). Onda 4b — 6/Mai/2026.

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
  invDispatchEncerradoSemAceite,
  invColetaSemProvaDigital,
  invEntregaSemProvaDigital,
  invConcluidaSemAvaliacao,
} from "./fluxo-execucao2-checks";

beforeEach(() => {
  mockResultadosPorTabela = {};
});

describe("INV-36: dispatch encerrado sem aceite (paga + sem prestador + dispatch_finalizado)", () => {
  it("OK quando todas as pagas tem prestador OU dispatch ainda ativo", async () => {
    mockResultadosPorTabela = { corridas: { data: [], error: null } };
    const r = await invDispatchEncerradoSemAceite();
    expect(r.ok).toBe(true);
  });

  it("DETECTA cliente pagou e dispatch terminou sem ninguem aceitar", async () => {
    const ha2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      corridas: {
        data: [
          {
            id: "1",
            codigo: "PG1",
            status: "paga",
            prestador_id: null,
            dispatch_ativo: false,
            dispatch_finalizado_em: ha2h,
            valor_final: 80,
            atualizado_em: ha2h,
          },
        ],
        error: null,
      },
    };
    const r = await invDispatchEncerradoSemAceite();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("alta");
    expect(r.amostra[0].horas_sem_fretista).toBeGreaterThanOrEqual(1);
  });
});

describe("INV-37: coleta concluida sem prova_digital", () => {
  it("OK quando toda concluida tem prova de coleta", async () => {
    const ha5h = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      corridas: {
        data: [{ id: "c1", codigo: "PG1", status: "concluida", atualizado_em: ha5h }],
        error: null,
      },
      provas_digitais: {
        data: [{ corrida_id: "c1", tipo: "coleta" }],
        error: null,
      },
    };
    const r = await invColetaSemProvaDigital();
    expect(r.ok).toBe(true);
  });

  it("DETECTA corrida concluida sem foto de coleta (caso Jackeline 2/Mai violado)", async () => {
    const ha5h = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      corridas: {
        data: [
          { id: "c1", codigo: "PG1", status: "concluida", atualizado_em: ha5h },
          { id: "c2", codigo: "PG2", status: "concluida", atualizado_em: ha5h },
        ],
        error: null,
      },
      provas_digitais: {
        data: [{ corrida_id: "c1", tipo: "coleta" }], // soh c1 tem
        error: null,
      },
    };
    const r = await invColetaSemProvaDigital();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.amostra[0].codigo).toBe("PG2");
  });
});

describe("INV-39: entrega concluida sem prova_digital", () => {
  it("OK quando toda concluida tem prova de entrega", async () => {
    const ha5h = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      corridas: {
        data: [{ id: "c1", codigo: "PG1", status: "concluida", atualizado_em: ha5h }],
        error: null,
      },
      provas_digitais: {
        data: [{ corrida_id: "c1", tipo: "entrega" }],
        error: null,
      },
    };
    const r = await invEntregaSemProvaDigital();
    expect(r.ok).toBe(true);
  });

  it("DETECTA concluida sem foto de entrega (sem prova juridica)", async () => {
    const ha5h = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      corridas: {
        data: [{ id: "c1", codigo: "PG1", status: "concluida", atualizado_em: ha5h }],
        error: null,
      },
      provas_digitais: { data: [], error: null }, // sem nenhuma prova
    };
    const r = await invEntregaSemProvaDigital();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("alta");
  });
});

describe("INV-40: concluida >24h sem avaliacao do cliente", () => {
  it("OK quando todas concluidas tem avaliacao", async () => {
    const ha2d = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      corridas: { data: [{ id: "c1", codigo: "PG1", atualizado_em: ha2d }], error: null },
      avaliacoes: { data: [{ corrida_id: "c1" }], error: null },
    };
    const r = await invConcluidaSemAvaliacao();
    expect(r.ok).toBe(true);
  });

  it("DETECTA concluida 3d sem avaliacao", async () => {
    const ha3d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      corridas: { data: [{ id: "c1", codigo: "PG1", atualizado_em: ha3d }], error: null },
      avaliacoes: { data: [], error: null },
    };
    const r = await invConcluidaSemAvaliacao();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("media");
    expect(r.amostra[0].dias_sem_avaliar).toBeGreaterThanOrEqual(3);
  });
});
