// Testes de seguranca da geracao de codigos de claim de admin.
//
// Origem (audit 2/Mai/2026): versao antiga usava Math.random() pra gerar
// tokens de 4 chars — criptograficamente fraco e brute-forceavel
// (~923k combinacoes). Versao nova usa crypto.randomBytes (CSPRNG) com
// 6 chars (~887M combinacoes). Esses testes blindam contra regressao.

import { describe, it, expect } from "vitest";
import { gerarCodigoClaim, ALPHABET_CLAIM, CLAIM_LENGTH } from "./admin-claim-token";

describe("gerarCodigoClaim — token de claim de admin", () => {
  it("gera codigo com tamanho exato CLAIM_LENGTH (6 chars)", () => {
    expect(CLAIM_LENGTH).toBe(6);
    for (let i = 0; i < 100; i++) {
      const c = gerarCodigoClaim();
      expect(c.length).toBe(CLAIM_LENGTH);
    }
  });

  it("usa apenas chars do ALPHABET_CLAIM (sem 0/O/1/I/L)", () => {
    const proibidos = ["0", "O", "1", "I", "L"];
    for (let i = 0; i < 200; i++) {
      const c = gerarCodigoClaim();
      for (const ch of c) {
        expect(ALPHABET_CLAIM).toContain(ch);
        expect(proibidos).not.toContain(ch);
      }
    }
  });

  it("amostra grande tem distribuicao razoavelmente uniforme", () => {
    // Sanidade: 10000 codigos × 6 chars = 60000 amostras do alfabeto de 31.
    // Esperado por char: ~1935. Tolerancia: ±40% (1161-2710).
    // Detecta regressao tipo "Math.floor() bias" ou alfabeto truncado.
    const N = ALPHABET_CLAIM.length;
    const contagem: Record<string, number> = {};
    for (const ch of ALPHABET_CLAIM) contagem[ch] = 0;
    for (let i = 0; i < 10000; i++) {
      for (const ch of gerarCodigoClaim()) contagem[ch]++;
    }
    const esperado = (10000 * CLAIM_LENGTH) / N;
    const minOk = esperado * 0.6;
    const maxOk = esperado * 1.4;
    for (const ch of ALPHABET_CLAIM) {
      expect(contagem[ch]).toBeGreaterThan(minOk);
      expect(contagem[ch]).toBeLessThan(maxOk);
    }
  });

  it("nao gera codigos identicos em curta sequencia (sanidade)", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(gerarCodigoClaim());
    // Espaco: 31^6 = 887M. 1000 amostras devem ser todas distintas.
    expect(set.size).toBe(1000);
  });

  it("ALPHABET_CLAIM tem exatamente 31 chars (sem confusoes visuais)", () => {
    expect(ALPHABET_CLAIM.length).toBe(31);
    expect(ALPHABET_CLAIM).not.toContain("0");
    expect(ALPHABET_CLAIM).not.toContain("O");
    expect(ALPHABET_CLAIM).not.toContain("1");
    expect(ALPHABET_CLAIM).not.toContain("I");
    expect(ALPHABET_CLAIM).not.toContain("L");
  });
});
