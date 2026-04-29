// Feriados nacionais brasileiros + adicional de preco em frete.
//
// Padrao de mercado: feriado = +20% sobre preco base.
// Bug detectado em teste real Jack 29/Abr: cliente agendou 01/05 (Dia do
// Trabalho) e sistema cotou normal sem adicional. Pegue perdeu margem.
//
// Cobertura: feriados nacionais 2026 e 2027 (atualizar antes de 2028).
// Móveis (Páscoa, Carnaval, Corpus Christi) calculados a partir do Domingo
// de Páscoa (algoritmo Meeus/Jones/Butcher).

const FERIADOS_FIXOS_BR: Record<string, string> = {
  "01/01": "Confraternizacao Universal",
  "21/04": "Tiradentes",
  "01/05": "Dia do Trabalho",
  "07/09": "Independencia do Brasil",
  "12/10": "Nossa Senhora Aparecida",
  "02/11": "Finados",
  "15/11": "Proclamacao da Republica",
  "20/11": "Consciencia Negra", // nacional desde 2024
  "25/12": "Natal",
};

// Algoritmo de Meeus/Jones/Butcher pra Domingo de Pascoa
function calcularPascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function feriadosMoveis(ano: number): Record<string, string> {
  const pascoa = calcularPascoa(ano);

  const carnavalTerca = new Date(pascoa);
  carnavalTerca.setDate(pascoa.getDate() - 47); // 47 dias antes da Pascoa

  const sextaSanta = new Date(pascoa);
  sextaSanta.setDate(pascoa.getDate() - 2);

  const corpusChristi = new Date(pascoa);
  corpusChristi.setDate(pascoa.getDate() + 60); // 60 dias apos Pascoa

  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

  return {
    [fmt(carnavalTerca)]: "Carnaval (Terca)",
    [fmt(sextaSanta)]: "Sexta-feira Santa",
    [fmt(corpusChristi)]: "Corpus Christi",
  };
}

// Retorna Map "DD/MM" -> nome feriado pro ano dado
export function getFeriadosBR(ano: number): Record<string, string> {
  return { ...FERIADOS_FIXOS_BR, ...feriadosMoveis(ano) };
}

// Aceita formatos: "DD/MM", "DD/MM - HH:MM", "01/05 - 16:00", "DD/MM/AAAA"
// Retorna { ehFeriado, nome } ou { ehFeriado: false }
export function detectarFeriado(
  textoData: string | null | undefined,
  anoReferencia?: number,
): { ehFeriado: boolean; nome?: string } {
  if (!textoData) return { ehFeriado: false };

  // Normaliza pra extrair DD/MM
  const match = textoData.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (!match) return { ehFeriado: false };

  const dd = String(parseInt(match[1])).padStart(2, "0");
  const mm = String(parseInt(match[2])).padStart(2, "0");
  const chave = `${dd}/${mm}`;

  // Determina o ano (default ano atual; se ja passou, considera proximo ano)
  const hoje = new Date();
  const anoAtual = anoReferencia || hoje.getFullYear();

  // Tenta ano atual primeiro
  const feriadosAtual = getFeriadosBR(anoAtual);
  if (feriadosAtual[chave]) {
    return { ehFeriado: true, nome: feriadosAtual[chave] };
  }

  // Tenta proximo ano (cliente pode estar agendando final-de-ano que cai em janeiro)
  const feriadosProx = getFeriadosBR(anoAtual + 1);
  if (feriadosProx[chave]) {
    return { ehFeriado: true, nome: feriadosProx[chave] };
  }

  return { ehFeriado: false };
}

// Multiplicador adicional pra cobrir feriado
export const ADICIONAL_FERIADO = 1.20; // +20%

// Helper: aplica adicional se data eh feriado, retorna { multiplicador, motivo }
export function calcularAdicionalFeriado(textoData: string | null | undefined): {
  multiplicador: number;
  ehFeriado: boolean;
  nomeFeriado?: string;
} {
  const { ehFeriado, nome } = detectarFeriado(textoData);
  return {
    multiplicador: ehFeriado ? ADICIONAL_FERIADO : 1.0,
    ehFeriado,
    nomeFeriado: nome,
  };
}
