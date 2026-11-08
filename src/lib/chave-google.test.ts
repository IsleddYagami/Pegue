import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { avisoChaveGoogle, chaveGoogle, origemChaveGoogle, probeChaveGoogle } from "./chave-google";

// O que estes testes provam: a Pegue usa a chave do PROJETO DELA quando ela
// existe, e, quando nao existe, o sistema DIZ isso em voz alta em vez de usar
// a herdada em silencio. Ordem do Fabio em 8/Nov/2026: "independente".

const PEGUE = "GOOGLE_MAPS_API_KEY_PEGUE";
const HERDADA = "GOOGLE_MAPS_API_KEY";

describe("de qual projeto do Google vem a chave", () => {
  let salvo: Record<string, string | undefined>;

  beforeEach(() => {
    salvo = { [PEGUE]: process.env[PEGUE], [HERDADA]: process.env[HERDADA] };
    delete process.env[PEGUE];
    delete process.env[HERDADA];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(salvo)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("com as duas, a do projeto da Pegue ganha — a herdada nem e usada", () => {
    process.env[PEGUE] = "chave-da-pegue";
    process.env[HERDADA] = "chave-antiga";
    expect(chaveGoogle()).toBe("chave-da-pegue");
    expect(origemChaveGoogle()).toBe("pegue");
    expect(avisoChaveGoogle()).toBeNull();
  });

  it("so a herdada: continua funcionando, MAS denuncia o projeto nao confirmado", () => {
    process.env[HERDADA] = "chave-antiga";
    expect(chaveGoogle()).toBe("chave-antiga");
    expect(origemChaveGoogle()).toBe("herdada");
    const aviso = avisoChaveGoogle();
    expect(aviso).toContain("NAO confirmado");
    expect(aviso).toContain(PEGUE);
  });

  it("sem chave nenhuma: nao quebra, avisa que cai no OpenStreetMap", () => {
    expect(chaveGoogle()).toBeNull();
    expect(origemChaveGoogle()).toBe("ausente");
    expect(avisoChaveGoogle()).toContain("OpenStreetMap");
  });

  it("variavel vazia ou com espaco nao conta como chave", () => {
    process.env[PEGUE] = "   ";
    process.env[HERDADA] = "";
    expect(chaveGoogle()).toBeNull();
    expect(origemChaveGoogle()).toBe("ausente");
  });

  it("espaco sobrando na chave e aparado (copiar/colar do console)", () => {
    process.env[PEGUE] = "  chave-da-pegue\n";
    expect(chaveGoogle()).toBe("chave-da-pegue");
  });
});

describe("o vigia diario (probe do registry de integracoes)", () => {
  let salvo: Record<string, string | undefined>;

  beforeEach(() => {
    salvo = { [PEGUE]: process.env[PEGUE], [HERDADA]: process.env[HERDADA] };
    delete process.env[PEGUE];
    delete process.env[HERDADA];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(salvo)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("chave propria: passa como ok e nao enche o painel", async () => {
    process.env[PEGUE] = "chave-da-pegue";
    const r = await probeChaveGoogle();
    expect(r.status).toBe("ok");
    expect(r.detalhe).toBeUndefined();
  });

  it("chave herdada: DEGRADADO todo dia, com o motivo escrito", async () => {
    process.env[HERDADA] = "chave-antiga";
    const r = await probeChaveGoogle();
    expect(r.status).toBe("degradado");
    expect(r.detalhe).toContain("NAO confirmado");
  });

  it("sem chave: degradado dizendo que caiu no OpenStreetMap", async () => {
    const r = await probeChaveGoogle();
    expect(r.status).toBe("degradado");
    expect(r.detalhe).toContain("OpenStreetMap");
  });

  it("o probe nao faz chamada de rede nenhuma (nao gasta)", async () => {
    process.env[HERDADA] = "chave-antiga";
    const original = globalThis.fetch;
    let chamou = false;
    globalThis.fetch = (() => { chamou = true; throw new Error("nao devia chamar"); }) as typeof fetch;
    try {
      await probeChaveGoogle();
    } finally {
      globalThis.fetch = original;
    }
    expect(chamou).toBe(false);
  });
});
