import { describe, it, expect } from "vitest";
import {
  isPlacaValida,
  normalizarPlaca,
  validarChavePix,
  isChavePixValida,
  isCpfValido,
  normalizarCpf,
} from "./validators-cadastro";

// Audit 1/Mai/2026: regressao pros bugs encontrados na auditoria silenciosa
// pre-cadastro real de parceiros. Antes "12345" passava como placa valida e
// "1234567890" passava como CPF de PIX. Cadastros quebrados aprovados auto.

describe("isPlacaValida — formato brasileiro", () => {
  it("aceita placa antiga ABC1234", () => {
    expect(isPlacaValida("ABC1234")).toBe(true);
    expect(isPlacaValida("xyz9876")).toBe(true); // case insensitive
  });

  it("aceita placa Mercosul ABC1D23", () => {
    expect(isPlacaValida("ABC1D23")).toBe(true);
    expect(isPlacaValida("brh4r99")).toBe(true);
  });

  it("aceita placa com espaco/hifen/ponto", () => {
    expect(isPlacaValida("ABC-1234")).toBe(true);
    expect(isPlacaValida("ABC 1234")).toBe(true);
    expect(isPlacaValida("abc.1d23")).toBe(true);
  });

  it("rejeita placa muito curta", () => {
    expect(isPlacaValida("12345")).toBe(false);
    expect(isPlacaValida("ABC123")).toBe(false);
  });

  it("rejeita placa muito longa", () => {
    expect(isPlacaValida("ABC12345")).toBe(false);
    expect(isPlacaValida("ABCD1234")).toBe(false);
  });

  it("rejeita placa com caracteres especiais", () => {
    expect(isPlacaValida("ABC@123")).toBe(false);
    expect(isPlacaValida("###1234")).toBe(false);
  });

  it("rejeita strings vazias e null-like", () => {
    expect(isPlacaValida("")).toBe(false);
    expect(isPlacaValida(" ")).toBe(false);
  });

  it("rejeita formato hibrido invalido", () => {
    // 4 letras + 3 digitos
    expect(isPlacaValida("ABCD123")).toBe(false);
    // 2 letras + 5 digitos
    expect(isPlacaValida("AB12345")).toBe(false);
    // Mercosul fake: letra na posicao errada
    expect(isPlacaValida("ABC12D3")).toBe(false);
  });
});

describe("normalizarPlaca", () => {
  it("uppercase e remove separadores", () => {
    expect(normalizarPlaca("abc-1234")).toBe("ABC1234");
    expect(normalizarPlaca("brh.4r99")).toBe("BRH4R99");
    expect(normalizarPlaca(" abc 1234 ")).toBe("ABC1234");
  });
});

describe("validarChavePix — formatos do Banco Central", () => {
  it("aceita CPF (11 digitos)", () => {
    const r = validarChavePix("12345678901");
    expect(r).not.toBeNull();
    expect(r?.tipo).toBe("cpf");
    expect(r?.valor).toBe("12345678901");
  });

  it("aceita CPF formatado", () => {
    const r = validarChavePix("123.456.789-01");
    expect(r?.tipo).toBe("cpf");
    expect(r?.valor).toBe("12345678901");
  });

  it("aceita CNPJ (14 digitos)", () => {
    const r = validarChavePix("12345678000190");
    expect(r?.tipo).toBe("cnpj");
    expect(r?.valor).toBe("12345678000190");
  });

  it("aceita CNPJ formatado", () => {
    const r = validarChavePix("12.345.678/0001-90");
    expect(r?.tipo).toBe("cnpj");
    expect(r?.valor).toBe("12345678000190");
  });

  it("aceita email", () => {
    const r = validarChavePix("fulano@email.com");
    expect(r?.tipo).toBe("email");
    expect(r?.valor).toBe("fulano@email.com");
  });

  it("normaliza email pra lowercase", () => {
    const r = validarChavePix("Fulano@Email.COM");
    expect(r?.tipo).toBe("email");
    expect(r?.valor).toBe("fulano@email.com");
  });

  it("aceita celular com DDI 55", () => {
    const r = validarChavePix("+5511999998888");
    expect(r?.tipo).toBe("telefone");
    expect(r?.valor).toBe("+5511999998888");
  });

  it("aceita celular formatado com DDI", () => {
    const r = validarChavePix("+55 (11) 99999-8888");
    expect(r?.tipo).toBe("telefone");
    expect(r?.valor).toBe("+5511999998888");
  });

  it("aceita UUID v4", () => {
    const r = validarChavePix("123e4567-e89b-12d3-a456-426614174000");
    expect(r?.tipo).toBe("aleatoria");
    expect(r?.valor).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("rejeita string aleatoria", () => {
    expect(validarChavePix("1234")).toBeNull();
    expect(validarChavePix("xyz")).toBeNull();
    expect(validarChavePix("123abc")).toBeNull();
  });

  it("rejeita email malformado", () => {
    expect(validarChavePix("@email.com")).toBeNull();
    expect(validarChavePix("nome@")).toBeNull();
    expect(validarChavePix("nome@dominio")).toBeNull();
  });

  it("rejeita string vazia", () => {
    expect(validarChavePix("")).toBeNull();
    expect(validarChavePix("   ")).toBeNull();
  });

  it("rejeita celular sem DDI (11 digitos = trata como CPF)", () => {
    // Heuristica documentada: 11 digitos = CPF, nao celular sem DDI.
    // Usuario precisa por +55 explicito.
    const r = validarChavePix("11999998888");
    expect(r?.tipo).toBe("cpf"); // ambiguo mas determinista
  });

  it("rejeita celular com DDI mas sem 9 inicial (regra BC pos-2017)", () => {
    expect(validarChavePix("+551133334444")).toBeNull(); // fixo
  });

  it("rejeita digitos com tamanho errado", () => {
    expect(validarChavePix("123")).toBeNull(); // muito curto
    expect(validarChavePix("12345678901234567")).toBeNull(); // muito longo
  });
});

describe("isChavePixValida — wrapper boolean", () => {
  it("delega a validarChavePix corretamente", () => {
    expect(isChavePixValida("12345678901")).toBe(true);
    expect(isChavePixValida("invalido")).toBe(false);
  });
});

describe("isCpfValido — algoritmo oficial Receita Federal", () => {
  // Audit 2/Mai/2026: cadastro aceitava qualquer string com 11 digitos
  // como CPF. Risco anti-fraude. Esses CPFs validos sao gerados via
  // algoritmo de digito verificador — todos passam na Receita.
  it("aceita CPFs validos conhecidos", () => {
    expect(isCpfValido("11144477735")).toBe(true);
    expect(isCpfValido("52998224725")).toBe(true);
    expect(isCpfValido("39053344705")).toBe(true);
  });

  it("aceita CPF com mascara (pontuacao normalizada)", () => {
    expect(isCpfValido("111.444.777-35")).toBe(true);
    expect(isCpfValido("529.982.247-25")).toBe(true);
  });

  it("rejeita CPF com todos digitos iguais (000... a 999...)", () => {
    expect(isCpfValido("00000000000")).toBe(false);
    expect(isCpfValido("11111111111")).toBe(false);
    expect(isCpfValido("22222222222")).toBe(false);
    expect(isCpfValido("99999999999")).toBe(false);
  });

  it("rejeita CPF com tamanho errado", () => {
    expect(isCpfValido("123456789")).toBe(false);    // 9 digitos
    expect(isCpfValido("123456789012")).toBe(false); // 12 digitos
    expect(isCpfValido("")).toBe(false);
    expect(isCpfValido("abc")).toBe(false);
  });

  it("rejeita CPF com 1o digito verificador errado", () => {
    // 11144477735 eh valido. Trocar o 3 do penultimo lugar quebra checksum:
    expect(isCpfValido("11144477745")).toBe(false);
  });

  it("rejeita CPF com 2o digito verificador errado", () => {
    // Mudar so o ultimo digito quebra o segundo dv:
    expect(isCpfValido("11144477736")).toBe(false);
  });

  it("rejeita strings que parecem CPF mas falham no checksum", () => {
    expect(isCpfValido("12345678901")).toBe(false); // sequencial, dv2 errado
    expect(isCpfValido("11223344556")).toBe(false); // sequencias dobradas
    expect(isCpfValido("99988877700")).toBe(false); // termina em 00 mas dv errado
  });

  it("normalizarCpf remove pontuacao e mantem digitos", () => {
    expect(normalizarCpf("111.444.777-35")).toBe("11144477735");
    expect(normalizarCpf("529 982 247 25")).toBe("52998224725");
    expect(normalizarCpf("abc")).toBe("");
  });

  it("rejeita null/undefined sem quebrar", () => {
    // @ts-expect-error — testando robustez contra input invalido
    expect(isCpfValido(null)).toBe(false);
    // @ts-expect-error — testando robustez contra input invalido
    expect(isCpfValido(undefined)).toBe(false);
  });
});
