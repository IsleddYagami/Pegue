import { describe, it, expect, vi, beforeEach } from "vitest";

// Esse teste valida apenas a ESTRUTURA do modulo de invariantes.
// Nao testa contra DB real (precisaria mock pesado do supabase-js); o teste
// E2E real eh o proprio cron rodando contra prod.
//
// Mock supabase-admin pra evitar erro de env var ausente em test environment.

vi.mock("./supabase-admin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({ data: [], error: null }),
          is: () => ({ data: [], error: null }),
          lt: () => ({ data: [], error: null }),
          or: () => ({ data: [], error: null }),
        }),
        is: () => ({
          lt: () => ({ data: [], error: null }),
        }),
        not: () => ({
          eq: () => ({ data: [], error: null }),
        }),
        filter: () => ({
          lt: () => ({ limit: () => ({ data: [], error: null }) }),
        }),
        or: () => ({ data: [], error: null }),
      }),
      insert: () => ({ data: null, error: null }),
    }),
  },
}));

describe("modulo invariantes — Camada 3 defesa em profundidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("modulo carrega sem erro de import", async () => {
    const mod = await import("./invariantes");
    expect(typeof mod.executarTodasInvariantes).toBe("function");
  });

  it("executarTodasInvariantes retorna array com 10 invariantes", async () => {
    const mod = await import("./invariantes");
    const r = await mod.executarTodasInvariantes();
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(10);
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

  it("nomes sao unicos (INV-1 a INV-10)", async () => {
    const mod = await import("./invariantes");
    const r = await mod.executarTodasInvariantes();
    const nomes = r.map((i) => i.nome);
    const unicos = new Set(nomes);
    expect(unicos.size).toBe(nomes.length);
  });
});
