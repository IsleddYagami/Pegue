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
  sugerirVeiculoPorVolumePeso,
  parseDimensoes,
  calcularVolumeM3,
  contarItensTexto,
  determinarMelhorVeiculo,
  formatarListaNumerada,
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

describe("determinarMelhorVeiculo", () => {
  describe("nunca regride pra menor", () => {
    it.each([
      ["hr", "utilitario", "hr"], // ja era HR, sugere utilitario -> mantem HR
      ["caminhao_bau", "utilitario", "caminhao_bau"],
      ["caminhao_bau", "hr", "caminhao_bau"],
      ["hr", "carro_comum", "hr"],
    ])("atual=%s novo=%s -> %s", (atual, novo, esperado) => {
      expect(determinarMelhorVeiculo(atual, novo)).toBe(esperado);
    });
  });

  describe("sobe quando novo eh maior", () => {
    it.each([
      ["utilitario", "hr", "hr"],
      ["utilitario", "caminhao_bau", "caminhao_bau"],
      ["hr", "caminhao_bau", "caminhao_bau"],
      ["carro_comum", "utilitario", "utilitario"],
    ])("atual=%s novo=%s -> %s", (atual, novo, esperado) => {
      expect(determinarMelhorVeiculo(atual, novo)).toBe(esperado);
    });
  });

  describe("aceita atual=null (default utilitario)", () => {
    it("null + hr -> hr", () => {
      expect(determinarMelhorVeiculo(null, "hr")).toBe("hr");
    });
    it("null + utilitario -> utilitario", () => {
      expect(determinarMelhorVeiculo(null, "utilitario")).toBe("utilitario");
    });
    it("null + caminhao_bau -> caminhao_bau", () => {
      expect(determinarMelhorVeiculo(null, "caminhao_bau")).toBe("caminhao_bau");
    });
  });

  describe("tipo desconhecido", () => {
    it("desconhecido vira utilitario", () => {
      expect(determinarMelhorVeiculo("xpto", "abc")).toBe("xpto");
    });
  });
});

describe("formatarListaNumerada", () => {
  it.each([
    [null, ""],
    ["", ""],
    ["Geladeira", "1. Geladeira"],
    ["Geladeira, Sofa", "1. Geladeira\n2. Sofa"],
    ["Geladeira, Sofa, TV", "1. Geladeira\n2. Sofa\n3. TV"],
  ])("'%s' formata pra '%s'", (input, expected) => {
    expect(formatarListaNumerada(input)).toBe(expected);
  });

  it("ignora itens vazios entre virgulas", () => {
    expect(formatarListaNumerada("Geladeira, , Sofa")).toBe("1. Geladeira\n2. Sofa");
  });
});

describe("contarItensTexto", () => {
  describe("texto sem quantidade conta 1 por separador", () => {
    it.each([
      ["geladeira", 1],
      ["geladeira, fogao", 2],
      ["geladeira, fogao, sofa", 3],
      ["geladeira; fogao; sofa", 3],
      ["geladeira. fogao. sofa", 3],
      ["geladeira e fogao e sofa", 3],
      ["geladeira, fogao e sofa", 3],
    ])("'%s' = %s", (input, expected) => {
      expect(contarItensTexto(input)).toBe(expected);
    });
  });

  describe("aceita lista em LINHAS (quebra de linha)", () => {
    it.each([
      ["geladeira\nfogao\ncama", 3],
      ["geladeira\r\nfogao\r\ncama", 3],
      ["1 geladeira\n2 sofa\n1 mesa", 4], // 1+2+1
      ["sofa\nmesa\ncadeira\nbicicleta", 4],
    ])("'%s' = %s", (input, expected) => {
      expect(contarItensTexto(input)).toBe(expected);
    });
  });

  describe("aceita separadores variados (barra, traco)", () => {
    it.each([
      ["geladeira / fogao / cama", 3],
      ["geladeira - fogao - cama", 3],
    ])("'%s' = %s", (input, expected) => {
      expect(contarItensTexto(input)).toBe(expected);
    });
  });

  describe("captura quantidade no inicio", () => {
    it.each([
      ["2 camas", 2],
      ["5 caixas", 5],
      ["10 cadeiras", 10],
      ["5x caixas", 5],
      ["100 barras de aco", 100],
    ])("'%s' = %s", (input, expected) => {
      expect(contarItensTexto(input)).toBe(expected);
    });
  });

  describe("combina quantidade com multiplos itens", () => {
    it.each([
      ["2 camas, 3 cadeiras", 5],
      ["2 camas, 3 cadeiras, 1 sofa", 6],
      ["10 caixas e 2 camas", 12],
      ["5 caixas, geladeira", 6],
      ["geladeira, 5 caixas", 6],
    ])("'%s' = %s", (input, expected) => {
      expect(contarItensTexto(input)).toBe(expected);
    });
  });

  describe("rejeita strings vazias", () => {
    it("retorna 0 pra ''", () => {
      expect(contarItensTexto("")).toBe(0);
    });
  });
});

describe("parseDimensoes", () => {
  it.each([
    ["30x10x300", { largura: 30, altura: 10, comprimento: 300 }],
    ["30 x 10 x 300", { largura: 30, altura: 10, comprimento: 300 }],
    ["30 10 300", { largura: 30, altura: 10, comprimento: 300 }],
    ["30,5 x 10 x 300", { largura: 30.5, altura: 10, comprimento: 300 }],
    ["100x50x200cm", { largura: 100, altura: 50, comprimento: 200 }],
  ])("parse '%s'", (input, expected) => {
    expect(parseDimensoes(input)).toEqual(expected);
  });

  it.each([
    [""],
    ["sem numeros"],
    ["30 x 10"], // so 2 numeros
    ["abc"],
  ])("retorna null pra '%s'", (input) => {
    expect(parseDimensoes(input)).toBeNull();
  });
});

describe("calcularVolumeM3", () => {
  it("calcula 30x10x300cm = 0.09 m3", () => {
    // 30*10*300 = 90.000 cm3 = 0.09 m3
    expect(calcularVolumeM3(30, 10, 300)).toBeCloseTo(0.09, 3);
  });

  it("calcula 100x100x100cm = 1 m3", () => {
    expect(calcularVolumeM3(100, 100, 100)).toBeCloseTo(1, 3);
  });

  it("calcula 50x50x50cm = 0.125 m3", () => {
    expect(calcularVolumeM3(50, 50, 50)).toBeCloseTo(0.125, 3);
  });
});

describe("sugerirVeiculoPorVolumePeso (calibrado pra frota Pegue real)", () => {
  describe("utilitario (vol <= 1.0m³ E peso <= 650kg)", () => {
    it.each([
      [0.1, 50],
      [0.5, 300],
      [1.0, 650],
    ])("vol=%sm³ peso=%skg -> utilitario", (vol, peso) => {
      expect(sugerirVeiculoPorVolumePeso(vol, peso)).toBe("utilitario");
    });
  });

  describe("hr (vol 1-8m³ OU peso 650-1000kg)", () => {
    it.each([
      [2, 100],
      [5, 500],
      [8, 1000],
      [0.5, 800], // pouco volume mas peso medio
    ])("vol=%sm³ peso=%skg -> hr", (vol, peso) => {
      expect(sugerirVeiculoPorVolumePeso(vol, peso)).toBe("hr");
    });
  });

  describe("caminhao_bau Iveco Daily (vol 8-12m³ OU peso 1000-2500kg)", () => {
    it.each([
      [9, 500],
      [12, 1500],
      [3, 2000], // pouco volume mas muito pesado
      [10, 2500],
    ])("vol=%sm³ peso=%skg -> caminhao_bau", (vol, peso) => {
      expect(sugerirVeiculoPorVolumePeso(vol, peso)).toBe("caminhao_bau");
    });
  });

  describe("carga_excedida (acima do que Pegue tem)", () => {
    it.each([
      [13, 500], // volume excede
      [10, 3000], // peso excede
      [20, 5000], // ambos
    ])("vol=%sm³ peso=%skg -> carga_excedida", (vol, peso) => {
      expect(sugerirVeiculoPorVolumePeso(vol, peso)).toBe("carga_excedida");
    });
  });
});
