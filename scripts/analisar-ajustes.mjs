// Analisa os ajustes do Fabio pra descobrir novos parametros da formula
import { readFileSync } from "fs";

// Le arquivo ajustado (lista 2 - novos)
const csv2 = readFileSync("public/simulacao-orcamentos - simulacao-orcamentos.csv.csv", "utf-8");
const linhas2 = csv2.trim().split("\n").slice(1).map(l => {
  const c = l.split(",");
  return { id: +c[0], base_fabio: +c[1], origem: c[2], destino: c[3], km: +c[4], veiculo: c[5] };
});

// Le arquivo ajustado anterior (lista 1)
const csv1 = readFileSync("public/simulacao-orcamentos.csv", "utf-8");
const linhas1raw = csv1.trim().split("\n").slice(1);
// Formato lista 1 (separado por ;): id;origem;destino;km;veiculo;ajudante;andares;elevador;cenario;base;...
const linhas1 = linhas1raw.map(l => {
  const c = l.split(";");
  if (c.length < 10) return null;
  return { origem: c[1], destino: c[2], km: +c[3], veiculo: c[4], ajudante: c[5], cenario: c[8], base_fabio: +c[9] };
}).filter(x => x && x.ajudante === "nao" && x.cenario === "base" && x.veiculo !== "carro_comum");

// Formula original
function formulaOriginal(km) {
  if (km <= 2) return 150;
  return Math.round(30 * Math.sqrt(km) + 148);
}

const MULT_ORIG = { utilitario: 1.0, hr: 1.7, caminhao_bau: 2.2 };
const MIN_ORIG = { utilitario: 150, hr: 220, caminhao_bau: 500 };

// Combina as duas listas
const todos = [];
for (const l of linhas1) {
  todos.push({ km: l.km, veiculo: l.veiculo, base_fabio: l.base_fabio, rota: `${l.origem}-${l.destino}` });
}
for (const l of linhas2) {
  todos.push({ km: l.km, veiculo: l.veiculo, base_fabio: l.base_fabio, rota: `${l.origem}-${l.destino}` });
}

// Analisa por veiculo
for (const veiculo of ["utilitario", "hr", "caminhao_bau"]) {
  const items = todos.filter(t => t.veiculo === veiculo);
  console.log(`\n=== ${veiculo.toUpperCase()} (${items.length} amostras) ===`);

  // Para cada, calcula o multiplicador implicito
  const mults = [];
  for (const item of items) {
    const baseUtil = formulaOriginal(item.km);
    const multImplicito = item.base_fabio / baseUtil;
    const valorFormula = Math.max(Math.round(baseUtil * MULT_ORIG[veiculo]), MIN_ORIG[veiculo]);
    const diff = item.base_fabio - valorFormula;
    const diffPct = ((diff / valorFormula) * 100).toFixed(1);
    mults.push(multImplicito);

    if (Math.abs(diff) > 10) {
      console.log(`  ${item.km}km ${item.rota}: Fabio=R$${item.base_fabio} | Formula=R$${valorFormula} | Diff=${diff > 0 ? '+' : ''}${diff} (${diffPct}%)`);
    }
  }

  // Calcula multiplicador medio
  const avgMult = mults.reduce((a,b) => a+b, 0) / mults.length;
  console.log(`  Mult medio: ${avgMult.toFixed(3)} (original: ${MULT_ORIG[veiculo]})`);
}
