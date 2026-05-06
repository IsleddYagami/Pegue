import { describe, it, expect, vi, beforeEach } from "vitest";

// Esse teste valida apenas a ESTRUTURA do modulo de invariantes.
// Nao testa contra DB real (precisaria mock pesado do supabase-js); o teste
// E2E real eh o proprio cron rodando contra prod.
//
// Mock supabase-admin pra evitar erro de env var ausente em test environment.

// Mock chain do Supabase. Cada metodo retorna `chain` (mesmo objeto)
// pra suportar qualquer ordem de chamada. Terminal sao `data`/`error`
// — funcionam como `await` quando .then eh acessado.
//
// Estendido em 4/Mai/2026 (Onda 1 IMUNI) pra cobrir `.order().limit()`
// usado em INV-22 (watchdog) e INV-23 (self-test).
vi.mock("@/lib/supabase-admin", () => {
  const empty = { data: [], error: null };
  // Make a chainable that resolves to empty
  const chain: any = new Proxy(empty, {
    get(target: any, prop: string) {
      if (prop === "data" || prop === "error" || prop === "then") {
        return target[prop];
      }
      return () => chain;
    },
  });
  return {
    supabaseAdmin: {
      from: () => chain,
    },
  };
});

describe("modulo invariantes — Camada 3 defesa em profundidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("modulo carrega sem erro de import", async () => {
    const mod = await import("./invariantes");

    expect(typeof mod.executarTodasInvariantes).toBe("function");
  });

  it("executarTodasInvariantes retorna 46 invariantes (estagio 3 IMUNI ativado)", async () => {
    // 4/Mai (Onda 2): INV-24 a 27 — fluxo de venda
    // 5/Mai (Onda 3): INV-28 a 31 — fluxo de atendimento (porta entrada)
    // 5/Mai (Onda 4a): INV-32 a 35 — fluxo de execucao parte 1 (cotacao → pagamento)
    // 6/Mai (Onda 4b): INV-36 a 40 — fluxo de execucao parte 2 (dispatch → entrega → avaliacao)
    // 6/Mai (Onda 5): INV-41 a 45 — fluxo do prestador
    // 6/Mai (Onda 6): INV-46 — meta estagio 3 (smoke E2E watchdog)
    //   + cron imuni-smoke-e2e ativando o ESTAGIO 3 da IMUNI (executor de testes)
    const mod = await import("./invariantes");

    const r = await mod.executarTodasInvariantes();
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(46);
  });

  it("plugin tem categoria META com 3 invariantes (INV-22, INV-23, INV-46)", async () => {
    // Onda 1 IMUNI (4/Mai): INV-22 (watchdog cron) + INV-23 (self-test alertador)
    // Onda 6 IMUNI (6/Mai): INV-46 (watchdog smoke E2E — Estagio 3)
    const mod = await import("./invariantes");

    const r = await mod.executarTodasInvariantes();
    const meta = r.filter((inv) =>
      mod.COBERTURA_INVARIANTES[inv.nome]?.categoria === "meta",
    );
    expect(meta.length).toBe(3);
    expect(meta.map((i) => i.nome).sort()).toEqual(["INV-22", "INV-23", "INV-46"]);
  });

  it("toda invariante registrada tem entrada em COBERTURA_INVARIANTES", async () => {
    // Cada nome usado em runtime DEVE ter metadata pro coverage map.
    // Sem isso, a categoria fica 'undefined' no scoreCategoria do dashboard.
    const mod = await import("./invariantes");

    const r = await mod.executarTodasInvariantes();
    for (const inv of r) {
      expect(
        mod.COBERTURA_INVARIANTES[inv.nome],
        `Invariante ${inv.nome} sem entrada em COBERTURA_INVARIANTES`,
      ).toBeDefined();
    }
  });

  it("tabelas criticas estao listadas (proxy pra coverage map)", async () => {
    const mod = await import("./invariantes");

    expect(mod.TABELAS_CRITICAS_PEGUE.length).toBeGreaterThanOrEqual(10);
    expect(mod.TABELAS_CRITICAS_PEGUE).toContain("corridas");
    expect(mod.TABELAS_CRITICAS_PEGUE).toContain("pagamentos");
    expect(mod.TABELAS_CRITICAS_PEGUE).toContain("bot_logs");
  });

  it("cada resultado tem campos obrigatorios bem-formados", async () => {
    const mod = await import("./invariantes");

    const r = await mod.executarTodasInvariantes();
    for (const inv of r) {
      expect(typeof inv.nome).toBe("string");
      expect(inv.nome).toMatch(/^INV-\d+$/);
      expect(typeof inv.descricao).toBe("string");
      expect(inv.descricao.length).toBeGreaterThan(0);
      expect(["alta", "media", "baixa"]).toContain(inv.severidade);
      expect(typeof inv.count).toBe("number");
      expect(Array.isArray(inv.amostra)).toBe(true);
      expect(inv.amostra.length).toBeLessThanOrEqual(5);
      expect(typeof inv.ok).toBe("boolean");
      expect(typeof inv.comoAgir).toBe("string");
    }
  });

  it("severidades distribuem entre alta e media", async () => {
    const mod = await import("./invariantes");

    const r = await mod.executarTodasInvariantes();
    const altas = r.filter((i) => i.severidade === "alta").length;
    const medias = r.filter((i) => i.severidade === "media").length;
    expect(altas).toBeGreaterThan(0);
    expect(medias).toBeGreaterThan(0);
    expect(altas + medias).toBe(r.length);
  });

  it("nomes sao unicos", async () => {
    const mod = await import("./invariantes");

    const r = await mod.executarTodasInvariantes();
    const nomes = r.map((i) => i.nome);
    const unicos = new Set(nomes);
    expect(unicos.size).toBe(nomes.length);
  });
});
