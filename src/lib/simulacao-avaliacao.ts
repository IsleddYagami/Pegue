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

// Itens por tamanho (espelha o simulador do admin)
const ITENS_PEQUENOS = [
  "Microondas", "TV 32\"", "Ventilador", "Tanquinho",
  "Mesa de centro", "Bicicleta", "Maquina de costura",
  "Ar condicionado", "Aquario", "10 caixas",
];
const ITENS_MEDIOS = [
  "Geladeira pequena", "Fogao 4 bocas", "Maquina de lavar",
  "Cama solteiro", "Colchao solteiro", "Escrivaninha",
  "Rack de TV", "Poltrona", "Comoda",
  "Mesa 4 lugares", "Sofa 2 lugares", "TV 55\"",
];
const ITENS_GRANDES = [
  "Geladeira duplex", "Fogao 5 bocas", "Cama casal",
  "Guarda-roupa 3 portas", "Guarda-roupa 6 portas", "Sofa 3 lugares",
  "Mesa 6 lugares", "Estante grande", "Armario cozinha",
];

const TODOS_ITENS = [...ITENS_PEQUENOS, ...ITENS_MEDIOS, ...ITENS_GRANDES];

function sortear<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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

// Decide pool de itens baseado no veiculo (frete). Guincho desvia antes em
// gerarSimulacao usando pool proprio de veiculos guinchados.
function poolPorVeiculo(veiculo: string): string[] {
  if (veiculo === "carro_comum") return ITENS_PEQUENOS;
  if (veiculo === "caminhao_bau") return [...ITENS_MEDIOS, ...ITENS_GRANDES];
  return TODOS_ITENS; // utilitario + hr: tudo
}

// Decide qtd de itens razoavel pro veiculo
function qtdItensPorVeiculo(veiculo: string): number {
  if (veiculo === "carro_comum") return 1 + Math.floor(Math.random() * 2); // 1-2
  if (veiculo === "utilitario") return 1 + Math.floor(Math.random() * 3); // 1-3
  if (veiculo === "hr") return 2 + Math.floor(Math.random() * 3); // 2-4
  if (veiculo === "caminhao_bau") return 4 + Math.floor(Math.random() * 4); // 4-7
  return 1;
}

export type SimulacaoAvaliacao = {
  veiculo: string;
  rota: Rota;
  itens: string[];
  qtdItens: number;
  temAjudante: boolean;
  precoPegue: number;
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
      itens: [veiculoGuinchado], // pra guincho, "itens" eh o veiculo guinchado
      qtdItens: 1,
      temAjudante: false, // guincho nao tem ajudante
      precoPegue,
    };
  }

  const qtd = qtdItensPorVeiculo(veiculo);
  const itens = sortearCombinacao(qtd, poolPorVeiculo(veiculo));
  const temAjudante = Math.random() > 0.5;

  const precos = calcularPrecos(
    rota.km,
    veiculo,
    temAjudante,
    0, // andares
    false, // tem elevador
    enderecoPorZona(rota.zonaDestino)
  );

  return {
    veiculo,
    rota,
    itens,
    qtdItens: itens.length,
    temAjudante,
    precoPegue: precos.padrao.total,
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

// Formata simulacao como mensagem pro WhatsApp.
// Frete: mostra "itens" e "ajudante". Guincho: mostra "veiculo guinchado".
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
🙋 ${sim.temAjudante ? "Com ajudante" : "Sem ajudante"}

━━━━━━━━━━━━━━━━
💰 *Pegue cobraria: R$ ${sim.precoPegue}*
━━━━━━━━━━━━━━━━

Quanto *VOCE* cobraria nesse frete?

Me responda *so o valor* (exemplo: *450*)

Ou digite *PARAR* pra finalizar`;
}
