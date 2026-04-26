import { describe, it, expect } from "vitest";
import {
  isPalavraReservadaEndereco,
  inputContemRua,
} from "./bot-utils";

// Esses testes garantem que os fixes dos bugs do teste de 25/Abr nao
// regridem em deploys futuros. Cada teste mapeia a um bug real reportado
// pelo Fabio em producao.

describe("isPalavraReservadaEndereco", () => {
  // Bug 6 do teste de 25/Abr: cliente digitou "PRONTO" pra fechar fotos e
  // sistema geocodificou como destino. Cotacao R$780 saiu com destino="Pronto".
  describe("bloqueia palavras reservadas isoladas", () => {
    it.each([
      ["pronto"],
      ["PRONTO"],
      ["Pronto"],
      ["sim"],
      ["nao"],
      ["não"],
      ["ok"],
      ["agora"],
      ["confirma"],
      ["corrigir"],
      ["cancelar"],
      ["avaliar"],
      ["pegar"],
      ["frete"],
      ["carreto"],
      ["guincho"],
      ["mudanca"],
      ["mudança"],
      ["jogar"],
      ["esqueci"],
    ])("rejeita '%s' como endereco", (palavra) => {
      expect(isPalavraReservadaEndereco(palavra)).toBe(true);
    });

    it.each([
      ["pronto."],
      ["sim!"],
      ["NAO?"],
      ["  ok  "],
    ])("rejeita '%s' (com pontuacao/espacos)", (palavra) => {
      expect(isPalavraReservadaEndereco(palavra)).toBe(true);
    });
  });

  describe("bloqueia numeros isolados (1-22 = opcoes do menu)", () => {
    it.each(["1", "2", "3", "4", "5", "10", "15", "22"])(
      "rejeita numero '%s' como endereco",
      (n) => {
        expect(isPalavraReservadaEndereco(n)).toBe(true);
      }
    );
  });

  describe("aceita textos que parecem enderecos", () => {
    it.each([
      ["Rua Augusta, Consolacao, Sao Paulo"],
      ["Av Paulista 1000"],
      ["pronto socorro municipal"], // "pronto" + outras palavras = nao bloqueia
      ["sim mais que isso"],
      ["Rua Sim, Bela Vista"],
      ["Agua Branca"],
      ["Centro de Osasco"],
      ["Vila Yara"],
    ])("aceita '%s'", (texto) => {
      expect(isPalavraReservadaEndereco(texto)).toBe(false);
    });
  });

  describe("rejeita strings vazias/vagas", () => {
    it("rejeita string vazia", () => {
      expect(isPalavraReservadaEndereco("")).toBe(true);
    });
    it("rejeita so espacos", () => {
      expect(isPalavraReservadaEndereco("   ")).toBe(true);
    });
  });
});

describe("inputContemRua", () => {
  // Bug 25/Abr: cliente digitou "Agua Branca" (so bairro), sistema fez
  // reverseGeocode e retornou "Rua X, Agua Branca". Cliente pensou que
  // sistema inventou rua. Fix: detectar se input mencionou rua/avenida/etc
  // e usar formato sem rua quando nao mencionou.

  describe("detecta input com indicador de rua", () => {
    it.each([
      ["Rua Augusta"],
      ["rua das flores 100"],
      ["Av Paulista"],
      ["avenida brasil"],
      ["AV. NOVE DE JULHO"],
      ["Alameda Santos"],
      ["estrada velha"],
      ["Rodovia Anhanguera"],
      ["Travessa do Comercio"],
      ["Praca da Republica"],
      ["Praça da Sé"],
      ["Viela do Rosario"],
      ["Largo do Arouche"],
      ["Rua Brasil, Centro, Osasco"],
      ["Centro, Rua Brasil, Osasco"],
    ])("detecta rua em '%s'", (texto) => {
      expect(inputContemRua(texto)).toBe(true);
    });
  });

  describe("nao detecta rua quando so tem bairro/regiao", () => {
    it.each([
      ["Agua Branca"],
      ["Bela Vista"],
      ["Centro de Osasco"],
      ["Vila Yara"],
      ["Pinheiros"],
      ["Bairro Centro"],
      ["Osasco"],
      ["Sao Paulo"],
    ])("nao detecta rua em '%s'", (texto) => {
      expect(inputContemRua(texto)).toBe(false);
    });
  });

  it("nao detecta em string vazia", () => {
    expect(inputContemRua("")).toBe(false);
  });
});
