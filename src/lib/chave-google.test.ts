import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { avisoChaveGoogle, chaveGoogle, origemChaveGoogle } from "./chave-google";

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
