// Testes regressivos das sentinelas de FLUXO DE ATENDIMENTO (INV-28 a 31).
//
// Origem: bugs reais 5/Mai/2026 com clientes 5511953731463 e 5519983355000.
// Filosofia (regra inegociavel feedback_aprendizado_constante.md): cada bug
// visto vira teste regressivo permanente. Cada bug fixo vira invariante
// quando aplicavel — e CADA invariante recebe teste de cenario aqui.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do supabase-admin com state controlavel por tabela.
// Cada teste define mockResultadosPorTabela antes de chamar a invariante.
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
  invConversasWhatsappVazia,
  invClientePresoEmColeta,
  invOrigemNaoIdentificadaSemEscalation,
} from "./atendimento-checks";

beforeEach(() => {
  mockResultadosPorTabela = {};
});

describe("INV-29: conversas_whatsapp vazia (perda silenciosa de historico)", () => {
  it("OK quando todos com >5 msgs tem conversas_whatsapp populada", async () => {
    mockResultadosPorTabela = {
      bot_sessions: {
        data: [{ phone: "5511970000001", msgs_contador: 10, atualizado_em: new Date().toISOString() }],
        error: null,
      },
      conversas_whatsapp: { data: [], error: null, count: 47 }, // tem registros
    };
    const r = await invConversasWhatsappVazia();
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
  });

  it("DETECTA quando sessao tem >5 msgs e ZERO conversas (caso real 5511953731463)", async () => {
    mockResultadosPorTabela = {
      bot_sessions: {
        data: [
          // Caso real do dia 5/Mai
          { phone: "5511953731463", msgs_contador: 50, atualizado_em: new Date().toISOString() },
          { phone: "5519983355000", msgs_contador: 8, atualizado_em: new Date().toISOString() },
        ],
        error: null,
      },
      conversas_whatsapp: { data: [], error: null, count: 0 }, // VAZIA — bug
    };
    const r = await invConversasWhatsappVazia();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(2);
    expect(r.severidade).toBe("alta");
    expect(r.amostra[0].phone_masked).toMatch(/^\*+\d{4}$/);
    expect(r.amostra[0].conversas_whatsapp_count).toBe(0);
  });

  it("ignora sessoes com <5 msgs (volume insuficiente pra acusar)", async () => {
    mockResultadosPorTabela = {
      bot_sessions: { data: [], error: null }, // filtro msgs_contador>=5 ja filtrou
      conversas_whatsapp: { data: [], error: null, count: 0 },
    };
    const r = await invConversasWhatsappVazia();
    expect(r.ok).toBe(true);
  });

  it("retorna ok=false em erro de query (nao mascara falha)", async () => {
    mockResultadosPorTabela = {
      bot_sessions: { data: null, error: { message: "RLS bloqueou" } },
    };
    const r = await invConversasWhatsappVazia();
    expect(r.ok).toBe(false);
    expect(r.erro).toBeDefined();
  });
});

describe("INV-30: cliente preso em coleta de dados >30min", () => {
  it("OK quando ninguem em step de coleta", async () => {
    mockResultadosPorTabela = {
      bot_sessions: { data: [], error: null },
    };
    const r = await invClientePresoEmColeta();
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
  });

  it("DETECTA cliente em aguardando_localizacao ha 45min (preso)", async () => {
    const ha45min = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      bot_sessions: {
        data: [
          { phone: "5511991234567", step: "aguardando_localizacao", atualizado_em: ha45min },
          { phone: "5511991234568", step: "confirmar_destino", atualizado_em: ha45min },
        ],
        error: null,
      },
    };
    const r = await invClientePresoEmColeta();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(2);
    expect(r.severidade).toBe("media");
    expect(r.amostra[0].minutos_preso).toBeGreaterThanOrEqual(44);
    expect(r.amostra[0].step).toBe("aguardando_localizacao");
  });

  it("inclui steps de guincho (paridade frete<->guincho)", async () => {
    const ha60min = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    mockResultadosPorTabela = {
      bot_sessions: {
        data: [
          { phone: "5511991234569", step: "guincho_localizacao", atualizado_em: ha60min },
          { phone: "5511991234570", step: "guincho_categoria", atualizado_em: ha60min },
        ],
        error: null,
      },
    };
    const r = await invClientePresoEmColeta();
    expect(r.count).toBe(2);
  });
});

describe("INV-31: origem_nao_identificada >=2x sem escalar humano", () => {
  it("OK quando ninguem teve falhas repetidas", async () => {
    mockResultadosPorTabela = {
      bot_logs: { data: [], error: null },
      bot_sessions: { data: [], error: null },
    };
    const r = await invOrigemNaoIdentificadaSemEscalation();
    expect(r.ok).toBe(true);
  });

  it("OK quando cliente ja foi escalado pra atendimento_humano", async () => {
    mockResultadosPorTabela = {
      bot_logs: {
        data: [
          { payload: { tipo: "origem_nao_identificada", phone_masked: "*********0001" }, criado_em: new Date().toISOString() },
          { payload: { tipo: "origem_nao_identificada", phone_masked: "*********0001" }, criado_em: new Date().toISOString() },
        ],
        error: null,
      },
      bot_sessions: {
        data: [{ phone: "5511991230001", step: "atendimento_humano" }], // mascara bate -> esta escalado
        error: null,
      },
    };
    const r = await invOrigemNaoIdentificadaSemEscalation();
    expect(r.ok).toBe(true);
  });

  it("DETECTA cliente com 3 falhas em 24h ainda em fluxo de bot (caso 5511953731463)", async () => {
    mockResultadosPorTabela = {
      bot_logs: {
        data: [
          { payload: { tipo: "origem_nao_identificada", phone_masked: "*********1463" }, criado_em: new Date().toISOString() },
          { payload: { tipo: "origem_nao_identificada", phone_masked: "*********1463" }, criado_em: new Date().toISOString() },
          { payload: { tipo: "origem_nao_identificada", phone_masked: "*********1463" }, criado_em: new Date().toISOString() },
        ],
        error: null,
      },
      bot_sessions: {
        data: [{ phone: "5511953731463", step: "aguardando_localizacao" }], // ainda em fluxo!
        error: null,
      },
    };
    const r = await invOrigemNaoIdentificadaSemEscalation();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("alta");
    expect(r.amostra[0].falhas_24h).toBe(3);
    expect(r.amostra[0].step_atual).toBe("aguardando_localizacao");
  });

  it("nao acusa quando phone teve falha mas eh isolada (1x)", async () => {
    mockResultadosPorTabela = {
      bot_logs: {
        data: [
          { payload: { tipo: "origem_nao_identificada", phone_masked: "*********1463" }, criado_em: new Date().toISOString() },
        ],
        error: null,
      },
      bot_sessions: { data: [], error: null },
    };
    const r = await invOrigemNaoIdentificadaSemEscalation();
    expect(r.ok).toBe(true);
  });
});
