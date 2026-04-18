// Compara formula NOVA V2 (multiplicadores dinamicos) com valores do Fabio
import { readFileSync } from "fs";

// FORMULA NOVA V2
function calcularPrecoBaseUtilitario(km) {
  if (km <= 2) return 150;
  return Math.round(30 * Math.sqrt(km) + 148);
}
function getMultiplicador(veiculo, km) {
  if (veiculo === "utilitario") { return km <= 20 ? 1.0 : km <= 50 ? 1.05 : 1.1; }
  if (veiculo === "hr") { return 1.5; }
  if (veiculo === "caminhao_bau") { return 2.2; }
  return 1.0;
}
const MIN = { utilitario: 150, hr: 220, caminhao_bau: 500 };
function novoPreco(km, veiculo) {
  return Math.max(Math.round(calcularPrecoBaseUtilitario(km) * getMultiplicador(veiculo, km)), MIN[veiculo] || 150);
}

// Le CSVs
const csv1 = readFileSync("public/simulacao-orcamentos.csv", "utf-8");
const csv2 = readFileSync("public/simulacao-orcamentos - simulacao-orcamentos.csv.csv", "utf-8");

const items = [];
csv1.trim().split("\n").slice(1).forEach(l => {
  const c = l.split(";");
  if (c.length < 10 || c[5] !== "nao" || c[8] !== "base" || c[4] === "carro_comum") return;
  items.push({ km: +c[3], veiculo: c[4], fabio: +c[9], rota: `${c[1]}→${c[2]}` });
});
csv2.trim().split("\n").slice(1).forEach(l => {
  const c = l.split(",");
  items.push({ km: +c[4], veiculo: c[5], fabio: +c[1], rota: `${c[2]}→${c[3]}` });
});

let erros = { util: [], hr: [], cam: [] };
let totalErr = 0, count = 0;

for (const item of items) {
  const novo = novoPreco(item.km, item.veiculo);
  const diff = novo - item.fabio;
  const pct = ((diff / item.fabio) * 100).toFixed(1);
  totalErr += Math.abs(+pct);
  count++;
  if (Math.abs(+pct) > 15) {
    const key = item.veiculo === "utilitario" ? "util" : item.veiculo === "hr" ? "hr" : "cam";
    erros[key].push(`${item.rota} ${item.km}km: Fabio R$${item.fabio} vs R$${novo} (${pct}%)`);
  }
}

console.log(`📊 ERRO MEDIO: ${(totalErr / count).toFixed(1)}% (${count} amostras)\n`);

for (const [key, label] of [["util","UTILITARIO"],["hr","HR"],["cam","CAMINHAO"]]) {
  if (erros[key].length > 0) {
    console.log(`⚠️ ${label} - ${erros[key].length} rotas com >15% diferença:`);
    erros[key].forEach(e => console.log(`  ${e}`));
    console.log();
  } else {
    console.log(`✅ ${label} - Todas dentro de 15%\n`);
  }
}
