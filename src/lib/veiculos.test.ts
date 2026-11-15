// TRAVA DA FROTA — 15/Nov/2026.
//
// Por que existe: o site chegou a oferecer "Fiorino, Kangoo", que nao e' a
// frota da Pegue. Eu inventei. A frota de verdade ja estava escrita no projeto
// desde o inicio (lib/bot-utils.ts, calibrada em 26/Abr/2026 com o Fabio) e na
// pagina do parceiro.
//
// O que estes testes impedem de voltar:
//   · nome de veiculo que nao e' da frota;
//   · o limite escrito em lib/veiculos.ts desencontrar do motor que sugere o
//     veiculo — se um mudar sem o outro, isto aqui quebra.

import { describe, it, expect } from "vitest";
import { VEICULOS, VEICULOS_CHAVES, NOME_VEICULO } from "./veiculos";
import { sugerirVeiculoPorVolumePeso } from "./bot-utils";

const TEXTO = VEICULOS.map((v) => `${v.nome} ${v.cabe}`).join(" | ");

describe("a frota que aparece na tela e' a frota de verdade", () => {
  it("sao os 3 veiculos, na ordem do menor pro maior", () => {
    expect(VEICULOS.map((v) => v.chave)).toEqual([...VEICULOS_CHAVES]);
    expect(VEICULOS[0].limite.pesoKg).toBeLessThan(VEICULOS[1].limite.pesoKg);
    expect(VEICULOS[1].limite.pesoKg).toBeLessThan(VEICULOS[2].limite.pesoKg);
  });

  it("cada veiculo diz o modelo de verdade", () => {
    const u = VEICULOS[0];
    expect(u.nome).toMatch(/Strada|Saveiro/);
    expect(u.cabe).toMatch(/Strada/);
    expect(u.cabe).toMatch(/Saveiro/);
    expect(u.cabe).toMatch(/Courier/);
    expect(VEICULOS[1].cabe).toMatch(/HR/);
    expect(VEICULOS[1].cabe).toMatch(/Bongo/);
    expect(VEICULOS[2].nome).toMatch(/Iveco/);
  });

  it("nao volta o modelo inventado", () => {
    expect(TEXTO).not.toMatch(/Kangoo/i);
  });

  it("o nome curto nunca fica vazio", () => {
    for (const chave of VEICULOS_CHAVES) {
      expect(NOME_VEICULO[chave].length).toBeGreaterThan(1);
    }
  });
});

describe("o limite escrito aqui e' o mesmo que o motor usa", () => {
  it("no limite de peso ainda e' o veiculo; um quilo acima ja e' o maior", () => {
    expect(sugerirVeiculoPorVolumePeso(0.5, VEICULOS[0].limite.pesoKg)).toBe("utilitario");
    expect(sugerirVeiculoPorVolumePeso(0.5, VEICULOS[0].limite.pesoKg + 1)).toBe("hr");

    expect(sugerirVeiculoPorVolumePeso(2, VEICULOS[1].limite.pesoKg)).toBe("hr");
    expect(sugerirVeiculoPorVolumePeso(2, VEICULOS[1].limite.pesoKg + 1)).toBe("caminhao_bau");

    expect(sugerirVeiculoPorVolumePeso(10, VEICULOS[2].limite.pesoKg)).toBe("caminhao_bau");
    expect(sugerirVeiculoPorVolumePeso(10, VEICULOS[2].limite.pesoKg + 1)).toBe("carga_excedida");
  });

  it("no limite de volume vale a mesma coisa", () => {
    expect(sugerirVeiculoPorVolumePeso(VEICULOS[0].limite.volumeM3, 100)).toBe("utilitario");
    expect(sugerirVeiculoPorVolumePeso(VEICULOS[1].limite.volumeM3, 100)).toBe("hr");
    expect(sugerirVeiculoPorVolumePeso(VEICULOS[2].limite.volumeM3, 100)).toBe("caminhao_bau");
    expect(sugerirVeiculoPorVolumePeso(VEICULOS[2].limite.volumeM3 + 0.1, 100)).toBe("carga_excedida");
  });
});
