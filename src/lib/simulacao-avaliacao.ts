// Gera simulacoes aleatorias pro fluxo "AVALIAR" no WhatsApp
// Fretista/admin escolhe quais veiculos quer avaliar, sistema sorteia o resto.
// Suporta tanto FRETES (carro_comum/utilitario/hr/caminhao_bau) quanto GUINCHOS
// (guincho/moto_guincho) — paridade com fluxo principal do Pegue.

import { calcularPrecos } from "@/lib/bot-utils";
import { ROTAS, type Rota, enderecoPorZona } from "@/lib/rotas-simulacao";

// Tabela de precos do guincho (espelha GUINCHO_PRECOS_VEICULO em webhook/route.ts).
// Mantida aqui pra simulacao funcionar sem importar do webhook (evita ciclo).
const GUINCHO_PRECO_AVAL = { base: 200, porKm: 5 };

// Pool de veiculos REAIS que cliente pediria guincho. Marca/modelo/ano realista.
// Inclui hatch/sedan/SUV/caminhonete — Pegue nao guincha moto, entao excluido.
const VEICULOS_GUINCHO_CARRO = [
  "Honda Civic 2018", "Toyota Corolla 2020", "Hyundai HB20 2019",
  "Fiat Argo 2021", "Volkswagen Gol 2017", "Chevrolet Onix 2020",
  "Renault Sandero 2018", "Ford Ka 2019", "Peugeot 208 2021",
  "Toyota Yaris 2020", "Nissan Versa 2019", "Hyundai Creta 2021",
  "Jeep Renegade 2020", "Volkswagen T-Cross 2022", "Honda HR-V 2019",
  "Toyota Hilux 2018", "Chevrolet S10 2020", "Ford Ranger 2019",
  "Fiat Toro 2021", "Mitsubishi L200 2018",
];

// Itens por tamanho. Pool ampliado em 30/Abr/2026 apos feedback do Fabio
// que as simulacoes estavam muito repetitivas.
const ITENS_PEQUENOS = [
  "Microondas", "TV 32\"", "Ventilador", "Tanquinho",
  "Mesa de centro", "Bicicleta", "Maquina de costura",
  "Ar condicionado", "Aquario", "10 caixas",
  "Bicicleta infantil", "Patinete", "Cadeira de escritorio",
  "Banco de academia", "Quadro grande", "Estante pequena",
  "Berco desmontado", "Pufe grande", "Espelho grande",
  "5 caixas", "8 sacolas",
];
const ITENS_MEDIOS = [
  "Geladeira pequena", "Fogao 4 bocas", "Maquina de lavar",
  "Cama solteiro", "Colchao solteiro", "Escrivaninha",
  "Rack de TV", "Poltrona", "Comoda",
  "Mesa 4 lugares", "Sofa 2 lugares", "TV 55\"",
  "Cama de beliche", "Estante media", "Mesa de jantar redonda",
  "Buffet", "Comoda 4 gavetas", "Aparador",
  "20 caixas", "15 sacolas", "Mesa de escritorio",
];
const ITENS_GRANDES = [
  "Geladeira duplex", "Fogao 5 bocas", "Cama casal",
  "Guarda-roupa 3 portas", "Guarda-roupa 6 portas", "Sofa 3 lugares",
  "Mesa 6 lugares", "Estante grande", "Armario cozinha",
  "Cama queen", "Cama king", "Sofa retratil 3 lugares",
  "Sofa de canto", "Frigobar", "Freezer horizontal",
  "Maquina de lavar e secar", "Guarda-roupa 8 portas",
  "Estante completa de cozinha", "Modulado completo de quarto",
  "Mesa 8 lugares", "Adega",
];

const TODOS_ITENS = [...ITENS_PEQUENOS, ...ITENS_MEDIOS, ...ITENS_GRANDES];

function sortear<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Sorteia um indice baseado em pesos relativos. Ex: pesos=[0.5,0.3,0.2] -> 50/30/20.
function sortearComPeso(pesos: number[]): number {
  const total = pesos.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pesos.length; i++) {
    r -= pesos[i];
    if (r < 0) return i;
  }
  return pesos.length - 1;
}

function sortearCombinacao(qtd: number, pool: string[]): string[] {
  const sel: string[] = [];
  let tentativas = 0;
  while (sel.length < qtd && tentativas < 50) {
    const item = sortear(pool);
    if (!sel.includes(item)) sel.push(item);
    tentativas++;
  }
  return sel;
}

// Sorteia qtd de ajudantes (0/1/2) com pesos diferentes por veiculo.
// Carro_comum quase nunca tem 2; caminhao quase sempre tem 1+.
function sortearQtdAjudantes(veiculo: string): number {
  const pesos: Record<string, number[]> = {
    carro_comum:  [0.70, 0.25, 0.05], // [0,1,2]
    utilitario:   [0.40, 0.50, 0.10],
    hr:           [0.25, 0.50, 0.25],
    caminhao_bau: [0.10, 0.40, 0.50],
  };
  return sortearComPeso(pesos[veiculo] || [0.5, 0.4, 0.1]);
}

// Sorteia andares (0=terreo, 1-5). Maioria dos servicos eh terreo OU 1-2 andares.
function sortearAndaresOrigem(): number {
  const pesos = [0.50, 0.25, 0.13, 0.07, 0.03, 0.02]; // [0,1,2,3,4,5]
  return sortearComPeso(pesos);
}

// Sorteia se tem elevador GIVEN que andares > 0. Maioria predio tem elevador.
function sortearTemElevador(): boolean {
  return Math.random() < 0.6; // 60% elevador, 40% so escada
}

// Decide pool de itens baseado no veiculo (frete). Guincho desvia antes em
// gerarSimulacao usando pool proprio de veiculos guinchados.
function poolPorVeiculo(veiculo: string): string[] {
  if (veiculo === "carro_comum") return ITENS_PEQUENOS;
  if (veiculo === "caminhao_bau") return [...ITENS_MEDIOS, ...ITENS_GRANDES];
  return TODOS_ITENS; // utilitario + hr: tudo
}

// Decide qtd de itens razoavel pro veiculo. Faixas ampliadas em 30/Abr/2026
// pra dar mais variacao (Fabio: "esta muito igual a quantidade").
function qtdItensPorVeiculo(veiculo: string): number {
  if (veiculo === "carro_comum") return 1 + Math.floor(Math.random() * 3); // 1-3
  if (veiculo === "utilitario") {
    // 1-5 com peso (1=20%, 2=30%, 3=25%, 4=15%, 5=10%)
    const idx = sortearComPeso([0.20, 0.30, 0.25, 0.15, 0.10]);
    return idx + 1;
  }
  if (veiculo === "hr") {
    // 2-7 com peso (2=15%, 3=25%, 4=25%, 5=20%, 6=10%, 7=5%)
    const idx = sortearComPeso([0.15, 0.25, 0.25, 0.20, 0.10, 0.05]);
    return idx + 2;
  }
  if (veiculo === "caminhao_bau") {
    // 5-12 com peso (mais comum 7-9 itens em mudanca grande)
    const idx = sortearComPeso([0.10, 0.15, 0.20, 0.20, 0.15, 0.10, 0.07, 0.03]);
    return idx + 5;
  }
  return 1;
}

export type SimulacaoAvaliacao = {
  veiculo: string;
  rota: Rota;
  itens: string[];
  qtdItens: number;
  qtdAjudantes: number;     // 0, 1 ou 2 (substitui temAjudante boolean)
  andaresOrigem: number;    // 0=terreo, 1-5 = andar do predio
  temElevador: boolean;     // so faz sentido se andaresOrigem > 0
  temEscada: boolean;       // derivado: andares > 0 && !elevador
  precoPegue: number;
  // Mantido pra retrocompat com codigo que ainda le boolean
  temAjudante: boolean;
};

// Calcula preco do guincho pra simulacao (espelha logica de cotarGuinchoEFinalizar).
// Sem taxas noturnas/feriado pra simulacao (queremos comparar PRECO BASE).
function calcularPrecoGuinchoSim(km: number): number {
  const kmExtra = Math.max(0, km - 5);
  return Math.round(GUINCHO_PRECO_AVAL.base + kmExtra * GUINCHO_PRECO_AVAL.porKm);
}

// Gera 1 simulacao aleatoria pra um dos veiculos escolhidos pelo fretista.
// Detecta automaticamente se eh guincho e usa pool de carros + preco apropriado.
// Frete usa calcularPrecos, guincho usa calcularPrecoGuinchoSim.
//
// Variacao COMPLETA (refactor 30/Abr/2026 apos feedback do Fabio):
//   - 0/1/2 ajudantes (peso varia por veiculo)
//   - 0-5 andares (50% terreo)
//   - Elevador OU escada (60% elevador quando ha andar)
//   - Pool de itens ampliado (60+ itens)
export function gerarSimulacao(veiculosEscolhidos: string[]): SimulacaoAvaliacao {
  const veiculo = sortear(veiculosEscolhidos);
  const rota = sortear(ROTAS);
  const ehGuincho = veiculo === "guincho";

  if (ehGuincho) {
    const veiculoGuinchado = sortear(VEICULOS_GUINCHO_CARRO); // ex: "Honda Civic 2018"
    const precoPegue = calcularPrecoGuinchoSim(rota.km);
    return {
      veiculo,
      rota,
      itens: [veiculoGuinchado],
      qtdItens: 1,
      qtdAjudantes: 0,
      andaresOrigem: 0,
      temElevador: false,
      temEscada: false,
      temAjudante: false,
      precoPegue,
    };
  }

  // Frete: sorteia variaveis
  const qtd = qtdItensPorVeiculo(veiculo);
  const itens = sortearCombinacao(qtd, poolPorVeiculo(veiculo));
  const qtdAjudantes = sortearQtdAjudantes(veiculo);
  const andaresOrigem = sortearAndaresOrigem();
  const temElevador = andaresOrigem > 0 ? sortearTemElevador() : false;
  const temEscada = andaresOrigem > 0 && !temElevador;

  // calcularPrecos so aceita boolean pra ajudante. Pra 2 ajudantes,
  // adicionamos manualmente o extra (mesmo padrao em webhook/route.ts:3049).
  const precos = calcularPrecos(
    rota.km,
    veiculo,
    qtdAjudantes > 0,
    andaresOrigem,
    temElevador,
    enderecoPorZona(rota.zonaDestino)
  );
  const ajudanteExtra = qtdAjudantes === 2 ? (rota.km <= 10 ? 80 : 100) : 0;
  const precoPegue = precos.padrao.total + ajudanteExtra;

  return {
    veiculo,
    rota,
    itens,
    qtdItens: itens.length,
    qtdAjudantes,
    andaresOrigem,
    temElevador,
    temEscada,
    temAjudante: qtdAjudantes > 0,
    precoPegue,
  };
}

export function nomeVeiculo(v: string): string {
  const map: Record<string, string> = {
    carro_comum: "Carro comum",
    utilitario: "Utilitario (Strada/Saveiro)",
    hr: "HR",
    caminhao_bau: "Caminhao Bau",
    guincho: "Guincho",
  };
  return map[v] || v;
}

export function nomeZona(z: string): string {
  if (z === "fundao") return "Zona de risco";
  if (z === "dificil") return "Zona dificil";
  return "Normal";
}

// Formata descricao de ajudantes pra exibicao
function descAjudantes(qtd: number): string {
  if (qtd === 0) return "Sem ajudante";
  if (qtd === 1) return "Com 1 ajudante";
  return "Com 2 ajudantes";
}

// Formata descricao de andar/elevador/escada pra exibicao
function descLocal(sim: SimulacaoAvaliacao): string {
  if (sim.andaresOrigem === 0) return "Coleta no terreo";
  const andar = sim.andaresOrigem === 1 ? "1º andar" : `${sim.andaresOrigem}º andar`;
  if (sim.temElevador) return `${andar} (com elevador)`;
  return `${andar} (so escada)`;
}

// Formata simulacao como mensagem pro WhatsApp.
// Frete: mostra itens, ajudantes (0/1/2), andar, elevador/escada.
// Guincho: mostra veiculo guinchado e rota.
export function formatarMensagemSimulacao(sim: SimulacaoAvaliacao, numero: number): string {
  const ehGuincho = sim.veiculo === "guincho";

  if (ehGuincho) {
    return `📊 *Avaliacao #${numero}*

🚛 *${nomeVeiculo(sim.veiculo)}*
🚗 *Veiculo:* ${sim.itens[0]}
📍 *De:* ${sim.rota.origem}
🏁 *Para:* ${sim.rota.destino}
📏 ${sim.rota.km}km · ${nomeZona(sim.rota.zonaDestino)}

━━━━━━━━━━━━━━━━
💰 *Pegue cobraria: R$ ${sim.precoPegue}*
━━━━━━━━━━━━━━━━

Quanto *VOCE* cobraria nesse guincho?

Me responda *so o valor* (exemplo: *280*)

Ou digite *PARAR* pra finalizar`;
  }

  return `📊 *Avaliacao #${numero}*

🚚 *${nomeVeiculo(sim.veiculo)}*
📍 *De:* ${sim.rota.origem}
🏁 *Para:* ${sim.rota.destino}
📏 ${sim.rota.km}km · ${nomeZona(sim.rota.zonaDestino)}
📦 ${sim.itens.join(" + ")}
🏢 ${descLocal(sim)}
🙋 ${descAjudantes(sim.qtdAjudantes)}

━━━━━━━━━━━━━━━━
💰 *Pegue cobraria: R$ ${sim.precoPegue}*
━━━━━━━━━━━━━━━━

Quanto *VOCE* cobraria nesse frete?

Me responda *so o valor* (exemplo: *450*)

Ou digite *PARAR* pra finalizar`;
}
