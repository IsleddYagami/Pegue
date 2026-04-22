// Gera simulacoes aleatorias pro fluxo "AVALIAR" no WhatsApp
// Fretista so escolhe quais veiculos quer avaliar, sistema sorteia o resto

import { calcularPrecos } from "@/lib/bot-utils";
import { ROTAS, type Rota, enderecoPorZona } from "@/lib/rotas-simulacao";

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

// Decide pool de itens baseado no veiculo (evita geladeira em moto guincho, etc)
function poolPorVeiculo(veiculo: string): string[] {
  if (veiculo === "carro_comum") return ITENS_PEQUENOS;
  if (veiculo === "caminhao_bau") return [...ITENS_MEDIOS, ...ITENS_GRANDES];
  if (veiculo === "guincho" || veiculo === "moto_guincho") return ["Veiculo avariado"]; // stub
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

// Gera 1 simulacao aleatoria pra um dos veiculos escolhidos pelo fretista
export function gerarSimulacao(veiculosEscolhidos: string[]): SimulacaoAvaliacao {
  const veiculo = sortear(veiculosEscolhidos);
  const rota = sortear(ROTAS);
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
    moto_guincho: "Guincho moto",
  };
  return map[v] || v;
}

export function nomeZona(z: string): string {
  if (z === "fundao") return "Zona de risco";
  if (z === "dificil") return "Zona dificil";
  return "Normal";
}

// Formata simulacao como mensagem pro WhatsApp
export function formatarMensagemSimulacao(sim: SimulacaoAvaliacao, numero: number): string {
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
