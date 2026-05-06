// Testes regressivos das META invariantes (INV-22 + INV-23).
//
// Fault injection real: cada teste manipula o mock do Supabase pra
// simular cenarios concretos (cron rodando ha 1h vs 30h, sem
// historico, query com erro). Prova que IMUNI DETECTA o cenario
// correspondente.
//
// Adicionado 4/Mai/2026 (Onda 1 IMUNI). Filosofia: "provas reais
// e nao maquiagem" — sentinela so vale se ja foi falsificada em
// laboratorio.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Builder do mock que aceita data/error customizados por chamada.
let mockRetornoQuery: { data: any[] | null; error: any } = { data: [], error: null };

vi.mock("@/lib/supabase-admin", () => {
  const chain: any = new Proxy(
    {},
    {
      get(_target: any, prop: string) {
        if (prop === "data") return mockRetornoQuery.data;
        if (prop === "error") return mockRetornoQuery.error;
        if (prop === "then") {
          return (resolve: any) => resolve(mockRetornoQuery);
        }
        return () => chain;
      },
    },
  );
  return {
    supabaseAdmin: {
      from: () => chain,
    },
  };
});

import { invWatchdogCronAuditoria, invSelfTestAlertadorRecente } from "./meta-checks";

beforeEach(() => {
  mockRetornoQuery = { data: [], error: null };
});

describe("INV-22 invWatchdogCronAuditoria — vigia o proprio cron", () => {
  it("sem historico (ambiente novo): nao alarma", async () => {
    mockRetornoQuery = { data: [], error: null };
    const r = await invWatchdogCronAuditoria();
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
    expect(r.nome).toBe("INV-22");
  });

  it("cron rodou ha 1h (saudavel): nao alarma", async () => {
    const umaHoraAtras = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    mockRetornoQuery = { data: [{ criado_em: umaHoraAtras }], error: null };
    const r = await invWatchdogCronAuditoria();
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
  });

  it("cron rodou ha 24h (limite, ainda saudavel): nao alarma", async () => {
    const vinteQuatroHorasAtras = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    mockRetornoQuery = { data: [{ criado_em: vinteQuatroHorasAtras }], error: null };
    const r = await invWatchdogCronAuditoria();
    expect(r.ok).toBe(true);
  });

  it("cron parou ha 30h: ALARMA (count=1, severidade alta)", async () => {
    // Cenario que essa invariante existe pra pegar: cron-job.org caiu
    // OU CRON_SECRET sumiu OU rota quebrou. Sem essa, IMUNI fica cega
    // sem ninguem perceber.
    const trintaHorasAtras = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    mockRetornoQuery = { data: [{ criado_em: trintaHorasAtras }], error: null };
    const r = await invWatchdogCronAuditoria();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.severidade).toBe("alta");
    expect(r.amostra[0].ha_horas).toBeGreaterThanOrEqual(30);
    expect(r.comoAgir).toContain("cron-job.org");
  });

  it("cron parou ha 5 dias: ALARMA fortemente", async () => {
    const cincoDiasAtras = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    mockRetornoQuery = { data: [{ criado_em: cincoDiasAtras }], error: null };
    const r = await invWatchdogCronAuditoria();
    expect(r.ok).toBe(false);
    expect(r.amostra[0].ha_horas).toBeGreaterThanOrEqual(120);
  });

  it("erro na query (RLS, tabela): captura como erro, nao throw", async () => {
    mockRetornoQuery = { data: null, error: { message: "permission denied for table bot_logs" } };
    const r = await invWatchdogCronAuditoria();
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("permission denied");
    // Importante: erro != count violacao real
  });
});

describe("INV-23 invSelfTestAlertadorRecente — vigia canario do alertador", () => {
  it("sem historico: alarma sugerindo configurar cron-job.org", async () => {
    // Diferente do INV-22: aqui sem historico significa que cron de
    // self-test ainda nao foi configurado. Severidade media (informativo).
    mockRetornoQuery = { data: [], error: null };
    const r = await invSelfTestAlertadorRecente();
    expect(r.ok).toBe(false);
    expect(r.severidade).toBe("media");
    expect(r.comoAgir).toContain("cron-job.org");
  });

  it("self-test rodou ha 2 dias: nao alarma", async () => {
    const doisDiasAtras = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mockRetornoQuery = { data: [{ criado_em: doisDiasAtras }], error: null };
    const r = await invSelfTestAlertadorRecente();
    expect(r.ok).toBe(true);
    expect(r.count).toBe(0);
  });

  it("self-test rodou ha 7 dias (limite, ainda saudavel): nao alarma", async () => {
    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    mockRetornoQuery = { data: [{ criado_em: seteDiasAtras }], error: null };
    const r = await invSelfTestAlertadorRecente();
    expect(r.ok).toBe(true);
  });

  it("self-test parou ha 10 dias: ALARMA", async () => {
    const dezDiasAtras = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    mockRetornoQuery = { data: [{ criado_em: dezDiasAtras }], error: null };
    const r = await invSelfTestAlertadorRecente();
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.amostra[0].ha_dias).toBeGreaterThanOrEqual(10);
  });
});
