import { describe, it, expect } from "vitest";
import {
  extrairCep,
  pareceEndereco,
  isSaudacao,
  isInicioServico,
  isAgradecimento,
  isAtendente,
  ehRespostaAutomatica,
  precisaDesmontar,
  formatarTelefoneExibicao,
  detectarZona,
  extrairRespostaPrestador,
} from "./bot-utils";

describe("extrairCep", () => {
  describe("aceita formatos validos", () => {
    it.each([
      ["06010000", "06010000"],
      ["06010-000", "06010000"],
      ["06010.000", "06010000"],
      ["06010 000", "06010000"],
      ["06.010-000", "06010000"],
      ["meu cep eh 06010-000 obrigado", "06010000"],
      ["CEP: 01310-100", "01310100"],
      ["01310100", "01310100"],
    ])("extrai CEP de '%s' -> '%s'", (input, expected) => {
      expect(extrairCep(input)).toBe(expected);
    });
  });

  describe("rejeita textos sem CEP valido", () => {
    it.each([
      ["sem cep aqui"],
      [""],
      ["123"],
      ["1234567"], // 7 digitos != 8
      ["abc def"],
      ["telefone 11999999999"], // numero longo demais (10 digitos seguidos != 5+3)
    ])("retorna null pra '%s'", (input) => {
      expect(extrairCep(input)).toBeNull();
    });
  });
});

describe("pareceEndereco", () => {
  describe("detecta enderecos validos", () => {
    it.each([
      ["Rua Augusta"],
      ["Av Paulista"],
      ["Avenida Brasil 100"],
      ["Alameda Santos"],
      ["Travessa do Comercio"],
      ["Praça da Sé"],
      ["Estrada Velha"],
      ["Rodovia Anhanguera"],
      ["Vila Yara"],
      ["Bairro Centro"],
      ["Jardim Paulista"],
      ["Parque do Ibirapuera"],
      ["Centro de Osasco"],
      ["Marginal Tiete"],
      ["BR-116 km 100"],
    ])("detecta '%s' como endereco", (texto) => {
      expect(pareceEndereco(texto)).toBe(true);
    });
  });
});

describe("isSaudacao", () => {
  it.each([
    ["oi"], ["Oi"], ["OI"], ["ola"], ["olá"],
    ["bom dia"], ["boa tarde"], ["boa noite"],
    ["hey"], ["eae"], ["e ai"],
    ["fala ai"], ["salve"], ["opa"], ["beleza"],
  ])("detecta '%s' como saudacao", (texto) => {
    expect(isSaudacao(texto)).toBe(true);
  });

  it.each([
    ["preciso de frete"], ["quanto custa"], ["sim"],
  ])("nao confunde '%s' com saudacao", (texto) => {
    expect(isSaudacao(texto)).toBe(false);
  });
});

describe("isInicioServico", () => {
  it.each([
    ["preciso de um frete"],
    ["quero fazer carreto"],
    ["mudanca completa"],
    ["guincho urgente"],
    ["preciso transportar uma geladeira"],
    ["quanto custa pra levar"],
    ["orcamento por favor"],
    ["fazer uma cotacao"],
  ])("detecta '%s' como inicio de servico", (texto) => {
    expect(isInicioServico(texto)).toBe(true);
  });

  it.each([
    ["oi"], ["bom dia"], ["obrigado"],
  ])("nao confunde '%s' com inicio de servico", (texto) => {
    expect(isInicioServico(texto)).toBe(false);
  });
});

describe("isAgradecimento", () => {
  it.each([
    ["obrigado"], ["obrigada"], ["valeu"], ["thanks"],
    ["brigado"], ["agradeço"], ["obrigado pela atenção"],
  ])("detecta '%s' como agradecimento", (texto) => {
    expect(isAgradecimento(texto)).toBe(true);
  });

  it.each([
    ["oi"], ["preciso de frete"],
  ])("nao confunde '%s' com agradecimento", (texto) => {
    expect(isAgradecimento(texto)).toBe(false);
  });
});

describe("isAtendente", () => {
  it.each([
    ["quero falar com atendente"],
    ["preciso de um humano"],
    ["chama uma pessoa"],
    ["tem alguem ai"],
    ["falar com alguem"],
    ["atendimento por favor"],
    ["chamar gerente"],
  ])("detecta '%s' como pedido de atendente", (texto) => {
    expect(isAtendente(texto)).toBe(true);
  });

  it.each([
    ["oi"], ["preciso de frete"], ["1"],
  ])("nao confunde '%s' com pedido de atendente", (texto) => {
    expect(isAtendente(texto)).toBe(false);
  });
});

describe("ehRespostaAutomatica", () => {
  it.each([
    ["Obrigado por entrar em contato"],
    ["Agradecemos sua mensagem"],
    ["Retornaremos em breve"],
    ["mensagem automatica"],
    ["No momento nao podemos atender"],
  ])("detecta '%s' como resposta automatica", (texto) => {
    expect(ehRespostaAutomatica(texto)).toBe(true);
  });

  it.each([
    ["oi"],
    ["preciso de frete"],
    ["Rua Augusta, Sao Paulo"],
    [""],
  ])("nao confunde '%s' com resposta automatica", (texto) => {
    expect(ehRespostaAutomatica(texto)).toBe(false);
  });
});

describe("precisaDesmontar", () => {
  describe("detecta itens que precisam desmontar", () => {
    it.each([
      ["guarda-roupa casal"],
      ["Cama solteiro"],
      ["beliche"],
      ["estante de livros"],
      ["armário grande"],
      ["rack com TV"],
      ["escrivaninha"],
      ["home theater"],
      ["berço"],
      ["mesa de jantar"],
    ])("detecta '%s' como item pra desmontar", (item) => {
      const result = precisaDesmontar(item);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("nao alerta pra itens simples", () => {
    it.each([
      ["caixa"], ["geladeira"], ["fogao"], ["sofa"],
      ["microondas"], ["bicicleta"], ["televisao"],
    ])("nao alerta '%s'", (item) => {
      expect(precisaDesmontar(item)).toEqual([]);
    });
  });

  it("aceita array de itens", () => {
    const result = precisaDesmontar(["geladeira", "guarda-roupa", "fogao"]);
    expect(result).toContain("guarda-roupa");
    expect(result).not.toContain("geladeira");
    expect(result).not.toContain("fogao");
  });

  it("nao duplica alerta", () => {
    const result = precisaDesmontar(["cama casal", "cama casal"]);
    expect(result.length).toBe(1);
  });

  it("retorna vazio pra string vazia", () => {
    expect(precisaDesmontar("")).toEqual([]);
  });
});

describe("formatarTelefoneExibicao", () => {
  it.each([
    ["5511970363713", "(11) 97036-3713"],
    ["11970363713", "(11) 97036-3713"],
    ["5511971429605", "(11) 97142-9605"],
  ])("formata '%s' -> '%s'", (input, expected) => {
    expect(formatarTelefoneExibicao(input)).toBe(expected);
  });

  it("retorna phone original se formato desconhecido", () => {
    expect(formatarTelefoneExibicao("123")).toBe("123");
  });
});

describe("detectarZona", () => {
  it("retorna 'normal' pra endereco vazio", () => {
    expect(detectarZona("")).toBe("normal");
  });

  it("retorna 'normal' pra endereco padrao", () => {
    expect(detectarZona("Rua Augusta, Consolacao, Sao Paulo")).toBe("normal");
  });

  // Zonas dificil/fundao/indisponivel dependem de listas internas;
  // aqui validamos so o caminho 'normal' que eh o default
});

describe("extrairRespostaPrestador", () => {
  it("aceita 'sim' sem valor", () => {
    const r = extrairRespostaPrestador("sim");
    expect(r.aceite).toBe(true);
    expect(r.valor).toBeNull();
  });

  it("aceita 'sim 250'", () => {
    const r = extrairRespostaPrestador("sim 250");
    expect(r.aceite).toBe(true);
    expect(r.valor).toBe(250);
  });

  it("aceita 'sim R$ 300'", () => {
    const r = extrairRespostaPrestador("sim R$ 300");
    expect(r.aceite).toBe(true);
    expect(r.valor).toBe(300);
  });

  it("rejeita texto sem 'sim'", () => {
    const r = extrairRespostaPrestador("nao quero");
    expect(r.aceite).toBe(false);
    expect(r.valor).toBeNull();
  });

  it("rejeita 'não'", () => {
    const r = extrairRespostaPrestador("não");
    expect(r.aceite).toBe(false);
  });
});
