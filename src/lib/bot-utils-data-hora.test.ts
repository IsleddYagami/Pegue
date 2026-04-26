import { describe, it, expect } from "vitest";
import { extrairHorario, extrairData } from "./bot-utils";

describe("extrairHorario", () => {
  describe("formatos com hora e minuto", () => {
    it.each([
      ["14:30", "14:30"],
      ["14h30", "14:30"],
      ["8:00", "08:00"],
      ["09:15", "09:15"],
      ["preciso as 14:30 amanha", "14:30"],
    ])("extrai '%s' -> '%s'", (input, expected) => {
      expect(extrairHorario(input)).toBe(expected);
    });
  });

  describe("formatos so hora", () => {
    it.each([
      ["15h", "15:00"],
      ["15hs", "15:00"],
      ["15 horas", "15:00"],
      ["15 hs", "15:00"],
      ["15hora", "15:00"],
      ["8h", "08:00"],
      ["pode ser 18h", "18:00"],
    ])("extrai '%s' -> '%s'", (input, expected) => {
      expect(extrairHorario(input)).toBe(expected);
    });
  });

  describe("formato com 'as/às'", () => {
    it.each([
      ["as 15", "15:00"],
      ["às 14", "14:00"],
      ["pode ser as 9", "09:00"],
    ])("extrai '%s' -> '%s'", (input, expected) => {
      expect(extrairHorario(input)).toBe(expected);
    });
  });

  describe("palavras manha/tarde", () => {
    it("manha vira faixa", () => {
      expect(extrairHorario("de manha")).toBe("Manha (08:00 - 12:00)");
    });
    it("manhã (com til) vira faixa", () => {
      expect(extrairHorario("manhã cedo")).toBe("Manha (08:00 - 12:00)");
    });
    it("tarde vira faixa", () => {
      expect(extrairHorario("a tarde")).toBe("Tarde (13:00 - 17:00)");
    });
  });

  describe("numero solto", () => {
    it("'15' sozinho vira 15:00", () => {
      expect(extrairHorario("15")).toBe("15:00");
    });
    it("'9' sozinho vira 09:00", () => {
      expect(extrairHorario("9")).toBe("09:00");
    });
    it("numero solto NAO vira hora se tem data junto", () => {
      // "15" + "amanha" = nao confunde com 15:00 (15 pode ser dia)
      expect(extrairHorario("15 amanha")).toBeNull();
    });
    it("numero <6 sozinho retorna null (provavelmente nao eh horario)", () => {
      expect(extrairHorario("3")).toBeNull();
    });
  });

  describe("retorna null pra textos sem horario", () => {
    it.each([
      [""],
      ["preciso de frete"],
      ["sim"],
    ])("retorna null pra '%s'", (input) => {
      expect(extrairHorario(input)).toBeNull();
    });
  });

  describe("rejeita horarios invalidos", () => {
    it("hora > 23 retorna null", () => {
      expect(extrairHorario("25h")).toBeNull();
    });
    it("minuto > 59 retorna null", () => {
      expect(extrairHorario("14:99")).toBeNull();
    });
  });
});

describe("extrairData", () => {
  describe("formato com barra/traco/ponto", () => {
    it.each([
      ["25/04", "25/04"],
      ["25/4", "25/04"],
      ["02/05", "02/05"],
      ["25-04", "25/04"],
      ["02.05", "02/05"],
      ["preciso pra 25/04", "25/04"],
      ["amanha 25/04 as 15h", "25/04"],
    ])("extrai '%s' -> '%s'", (input, expected) => {
      expect(extrairData(input)).toBe(expected);
    });
  });

  describe("formato com nome do mes", () => {
    it.each([
      ["02 de maio", "02/05"],
      ["2 de maio", "02/05"],
      ["dia 02 de maio", "02/05"],
      ["15 de janeiro", "15/01"],
      ["28 de fevereiro", "28/02"],
      ["10 de junho", "10/06"],
      ["25 jul", "25/07"], // abreviado
      ["3 set", "03/09"],
    ])("extrai '%s' -> '%s'", (input, expected) => {
      expect(extrairData(input)).toBe(expected);
    });
  });

  describe("formato 'dia X' (assume mes atual)", () => {
    it("extrai 'dia 25' como dia 25 do mes atual", () => {
      const r = extrairData("dia 25");
      expect(r).toMatch(/^25\/\d{2}$/);
    });
  });

  describe("palavras hoje/amanha", () => {
    it("'hoje' retorna data de hoje em formato DD/MM", () => {
      const r = extrairData("hoje");
      expect(r).toMatch(/^\d{2}\/\d{2}$/);
    });

    it("'amanha' retorna data de amanha", () => {
      const r = extrairData("amanha");
      expect(r).toMatch(/^\d{2}\/\d{2}$/);
    });

    it("'amanhã' (com til) tambem", () => {
      const r = extrairData("amanhã as 14h");
      expect(r).toMatch(/^\d{2}\/\d{2}$/);
    });
  });

  describe("dias da semana", () => {
    it.each([
      ["segunda"],
      ["terca"],
      ["terça"],
      ["quarta"],
      ["quinta"],
      ["sexta"],
      ["sabado"],
      ["sábado"],
      ["domingo"],
    ])("'%s' retorna data DD/MM", (texto) => {
      const r = extrairData(texto);
      expect(r).toMatch(/^\d{2}\/\d{2}$/);
    });
  });

  describe("retorna null pra textos sem data", () => {
    it.each([
      [""],
      ["preciso de frete"],
      ["sim"],
      ["15h"],
    ])("retorna null pra '%s'", (input) => {
      expect(extrairData(input)).toBeNull();
    });
  });

  describe("nao confunde horario com data", () => {
    it("'15h' nao vira data", () => {
      expect(extrairData("15h")).toBeNull();
    });
  });
});
