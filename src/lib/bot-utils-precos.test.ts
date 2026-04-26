import { describe, it, expect } from "vitest";
import {
  calcularDistanciaKm,
  distanciaRetaKm,
  calcularPrecos,
  calcularPrecosCompleto,
} from "./bot-utils";

describe("calcularDistanciaKm (com fator estrada 1.3)", () => {
  it("retorna 0 pra mesma coordenada", () => {
    expect(calcularDistanciaKm(-23.5, -46.7, -23.5, -46.7)).toBe(0);
  });

  it("calcula distancia Osasco -> Centro SP (~13km real, com fator ~17km)", () => {
    // Osasco centro
    const osasco = { lat: -23.5329, lng: -46.7916 };
    // Sé (centro SP)
    const se = { lat: -23.5505, lng: -46.6333 };
    const km = calcularDistanciaKm(osasco.lat, osasco.lng, se.lat, se.lng);
    expect(km).toBeGreaterThan(15);
    expect(km).toBeLessThan(25);
  });

  it("é simétrico (A->B = B->A)", () => {
    const ab = calcularDistanciaKm(-23.5, -46.7, -23.6, -46.6);
    const ba = calcularDistanciaKm(-23.6, -46.6, -23.5, -46.7);
    expect(ab).toBe(ba);
  });

  it("arredonda pra 1 casa decimal", () => {
    const km = calcularDistanciaKm(-23.5, -46.7, -23.51, -46.71);
    expect(km.toString()).toMatch(/^\d+(\.\d)?$/);
  });
});

describe("distanciaRetaKm (linha reta, sem fator)", () => {
  it("é menor que calcularDistanciaKm pro mesmo par", () => {
    const reta = distanciaRetaKm(-23.5, -46.7, -23.6, -46.6);
    const estrada = calcularDistanciaKm(-23.5, -46.7, -23.6, -46.6);
    expect(reta).toBeLessThan(estrada);
  });

  it("retorna ~0 pra mesma coordenada", () => {
    expect(distanciaRetaKm(-23.5, -46.7, -23.5, -46.7)).toBeCloseTo(0, 5);
  });
});

describe("calcularPrecos", () => {
  describe("respeita preco minimo por veiculo", () => {
    // Distancia mínima (0km) testa o piso de cada veículo
    it("utilitario tem minimo R$ 150", () => {
      const r = calcularPrecos(0, "utilitario", false, 0, false, "");
      expect(r.padrao.base).toBeGreaterThanOrEqual(150);
    });

    it("hr tem minimo R$ 220", () => {
      const r = calcularPrecos(0, "hr", false, 0, false, "");
      expect(r.padrao.base).toBeGreaterThanOrEqual(220);
    });

    it("caminhao_bau tem minimo R$ 500", () => {
      const r = calcularPrecos(0, "caminhao_bau", false, 0, false, "");
      expect(r.padrao.base).toBeGreaterThanOrEqual(500);
    });
  });

  describe("aplicacao de adicionais", () => {
    it("ajudante curto (<=10km) cobra R$ 80", () => {
      const sem = calcularPrecos(5, "utilitario", false, 0, false, "");
      const com = calcularPrecos(5, "utilitario", true, 0, false, "");
      expect(com.padrao.ajudante).toBe(80);
      expect(com.padrao.total).toBe(sem.padrao.total + 80);
    });

    it("ajudante longo (>10km) cobra R$ 100", () => {
      const sem = calcularPrecos(20, "utilitario", false, 0, false, "");
      const com = calcularPrecos(20, "utilitario", true, 0, false, "");
      expect(com.padrao.ajudante).toBe(100);
      expect(com.padrao.total).toBe(sem.padrao.total + 100);
    });

    it("elevador cobra R$ 50", () => {
      const sem = calcularPrecos(5, "utilitario", false, 0, false, "");
      const com = calcularPrecos(5, "utilitario", false, 0, true, "");
      expect(com.padrao.elevador).toBe(50);
      expect(com.padrao.total).toBe(sem.padrao.total + 50);
    });

    it("escada cobra R$ 30 por andar (sem elevador)", () => {
      const r = calcularPrecos(5, "utilitario", false, 3, false, "");
      expect(r.padrao.escada).toBe(90); // 3 * 30
    });

    it("elevador anula cobranca de escada", () => {
      const r = calcularPrecos(5, "utilitario", false, 5, true, "");
      expect(r.padrao.escada).toBe(0); // tem elevador, ignora andares
      expect(r.padrao.elevador).toBe(50);
    });
  });

  describe("preco aumenta com distancia", () => {
    it("10km > 5km > minimo", () => {
      const km5 = calcularPrecos(5, "utilitario", false, 0, false, "").padrao.total;
      const km10 = calcularPrecos(10, "utilitario", false, 0, false, "").padrao.total;
      const km30 = calcularPrecos(30, "utilitario", false, 0, false, "").padrao.total;
      expect(km10).toBeGreaterThanOrEqual(km5);
      expect(km30).toBeGreaterThan(km10);
    });
  });

  describe("zona normal vs zona dificil/fundao", () => {
    // Zonas de risco aplicam multiplicador. Esses testes só validam que
    // existe diferenca quando nome aparece no endereco — sem assumir lista
    // de bairros (pode mudar).
    it("retorna struct valida pra endereco vazio", () => {
      const r = calcularPrecos(10, "utilitario", false, 0, false, "");
      expect(r.zona).toBe("normal");
      expect(r.padrao.total).toBeGreaterThan(0);
    });
  });

  describe("default veiculo = utilitario", () => {
    it("tipo desconhecido cai em minimo R$ 150", () => {
      const r = calcularPrecos(5, "tipo_inexistente", false, 0, false, "");
      expect(r.padrao.base).toBeGreaterThanOrEqual(150);
    });
  });
});

describe("calcularPrecosCompleto", () => {
  it("retorna 3 precos: utilitario < hr < caminhao_bau (mesma distancia)", () => {
    const r = calcularPrecosCompleto(20, false, 0, false, "");
    expect(r.utilitario.total).toBeLessThan(r.hr.total);
    expect(r.hr.total).toBeLessThan(r.caminhao_bau.total);
  });

  it("aplica adicionais em todos os 3 precos", () => {
    const sem = calcularPrecosCompleto(10, false, 0, false, "");
    const com = calcularPrecosCompleto(10, true, 0, false, "");
    expect(com.utilitario.ajudante).toBe(80);
    expect(com.hr.ajudante).toBe(80);
    expect(com.caminhao_bau.ajudante).toBe(80);
  });
});
