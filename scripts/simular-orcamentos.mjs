// Simulador Pegue - NOVAS ROTAS (sem repetir as anteriores)
// Somente base, sem ajudante/elevador/escada

function calcularPrecoBaseUtilitario(km) {
  if (km <= 2) return 150;
  return Math.round(30 * Math.sqrt(km) + 148);
}

const MULT_VEICULO = { utilitario: 1.0, hr: 1.7, caminhao_bau: 2.2 };
const MIN_VEICULO = { utilitario: 150, hr: 220, caminhao_bau: 500 };

function calcularPrecoBase(km, veiculo) {
  const baseUtil = calcularPrecoBaseUtilitario(km);
  const mult = MULT_VEICULO[veiculo] || 1.0;
  const minimo = MIN_VEICULO[veiculo] || 150;
  return Math.max(Math.round(baseUtil * mult), minimo);
}

// ============ SOMENTE ROTAS NOVAS (nenhuma repetida) ============

const ROTAS = [
  // Grande Osasco / vizinhos proximos
  { origem: "Osasco", destino: "Carapicuiba", km: 7 },
  { origem: "Osasco", destino: "Jandira", km: 9 },
  { origem: "Osasco", destino: "Itapevi", km: 13 },
  { origem: "Osasco", destino: "Tabao da Serra", km: 11 },
  { origem: "Osasco", destino: "Embu das Artes", km: 17 },
  { origem: "Carapicuiba", destino: "Barueri", km: 5 },
  { origem: "Barueri", destino: "Cotia", km: 15 },

  // Zona Oeste / Centro SP
  { origem: "Osasco", destino: "Perdizes", km: 11 },
  { origem: "Osasco", destino: "Vila Sonia", km: 10 },
  { origem: "Osasco", destino: "Campo Limpo", km: 16 },
  { origem: "Osasco", destino: "Capao Redondo", km: 19 },

  // Zona Leste SP
  { origem: "Osasco", destino: "Mooca", km: 20 },
  { origem: "Osasco", destino: "Penha", km: 26 },
  { origem: "Osasco", destino: "Sao Mateus", km: 36 },
  { origem: "Osasco", destino: "Cidade Tiradentes", km: 48 },

  // Zona Sul SP
  { origem: "Osasco", destino: "Interlagos", km: 30 },
  { origem: "Osasco", destino: "Grajau", km: 33 },
  { origem: "Osasco", destino: "Jardim Angela", km: 28 },

  // ABC expandido
  { origem: "Osasco", destino: "Sao Caetano", km: 32 },
  { origem: "Osasco", destino: "Diadema", km: 38 },
  { origem: "Osasco", destino: "Ribeirao Pires", km: 52 },

  // Norte SP
  { origem: "Osasco", destino: "Tucuruvi", km: 22 },
  { origem: "Osasco", destino: "Franco da Rocha", km: 33 },
  { origem: "Osasco", destino: "Caieiras", km: 28 },
  { origem: "Osasco", destino: "Mairipora", km: 40 },

  // Distancias novas nao testadas
  { origem: "Osasco", destino: "Ferraz de Vasconcelos", km: 50 },
  { origem: "Osasco", destino: "Aruja", km: 58 },
  { origem: "Osasco", destino: "Atibaia", km: 75 },
  { origem: "Osasco", destino: "Itu", km: 90 },
  { origem: "Osasco", destino: "Praia Grande", km: 95 },
  { origem: "Osasco", destino: "Sao Vicente", km: 88 },
  { origem: "Osasco", destino: "Bertioga", km: 120 },
  { origem: "Osasco", destino: "Registro", km: 180 },
  { origem: "Osasco", destino: "Piracicaba", km: 160 },
  { origem: "Osasco", destino: "Ubatuba", km: 230 },
];

const VEICULOS = ["utilitario", "hr", "caminhao_bau"];

const simulacoes = [];
let id = 1;

for (const rota of ROTAS) {
  for (const veiculo of VEICULOS) {
    const base = calcularPrecoBase(rota.km, veiculo);
    const totalCartao = Math.round(base * 1.0498);
    const comissao = Math.round(base * 0.12);
    const prestador = base - comissao;
    const rsPorKm = rota.km > 0 ? (base / rota.km).toFixed(2) : "-";

    simulacoes.push({ id: id++, origem: rota.origem, destino: rota.destino, km: rota.km, veiculo, base, total_pix: base, total_cartao: totalCartao, comissao_pegue: comissao, valor_prestador: prestador, rs_por_km: rsPorKm });
  }
}

const csvHeader = "id,origem,destino,km,veiculo,base,total_pix,total_cartao,comissao_pegue,valor_prestador,rs_por_km";
const csvRows = simulacoes.map(s =>
  [s.id, s.origem, s.destino, s.km, s.veiculo, s.base, s.total_pix, s.total_cartao, s.comissao_pegue, s.valor_prestador, s.rs_por_km].join(",")
);

import { writeFileSync } from "fs";
writeFileSync("simulacao-orcamentos-novos.csv", [csvHeader, ...csvRows].join("\n"));

console.log(`\n✅ ${simulacoes.length} orcamentos NOVOS (rotas ineditas)`);
console.log(`Arquivo: simulacao-orcamentos-novos.csv`);
const totais = simulacoes.map(s => s.base);
console.log(`📊 Menor: R$${Math.min(...totais)} | Maior: R$${Math.max(...totais)} | Medio: R$${Math.round(totais.reduce((a,b)=>a+b,0)/totais.length)}`);
