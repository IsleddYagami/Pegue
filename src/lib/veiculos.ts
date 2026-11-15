// A FROTA DA PEGUE — um lugar so'.
//
// Os modelos e as medidas NAO sao invencao minha: vieram do que ja estava
// escrito no projeto desde o inicio, e so' foram reunidos aqui.
//   · modelos e limites: `sugerirVeiculoPorVolumePeso` em lib/bot-utils.ts,
//     calibrados em 26/Abr/2026 com a frota real + ajuste conservador do Fabio;
//   · medidas da cacamba / carroceria / bau: pagina do parceiro (/parceiro),
//     escrita pelo Fabio.
//
// Antes daqui, o nome do veiculo estava escrito em 2 lugares (cotador e rota do
// pedido) e o site chegou a mostrar "Fiorino, Kangoo", que NAO e' a frota —
// erro meu, corrigido em 15/Nov/2026. Quem for mexer: mexe aqui, nao no texto
// da tela.

export const VEICULOS_CHAVES = ["utilitario", "hr", "caminhao_bau"] as const;
export type VeiculoChave = (typeof VEICULOS_CHAVES)[number];

export type Veiculo = {
  chave: VeiculoChave;
  /** O nome curto que aparece na tela e no WhatsApp. */
  nome: string;
  emoji: string;
  /** Os modelos de verdade, a medida da carroceria e o que costuma caber. */
  cabe: string;
  /** Limites que o motor usa pra sugerir o veiculo (lib/bot-utils.ts). */
  limite: { pesoKg: number; volumeM3: number };
};

export const VEICULOS: Veiculo[] = [
  {
    chave: "utilitario",
    nome: "Utilitário (Strada/Saveiro)",
    emoji: "🛻",
    cabe: "Fiat Strada, Saveiro ou Ford Courier. Caçamba de 1,20m x 1,50m — uns 10 volumes ou 1 móvel grande",
    limite: { pesoKg: 650, volumeM3: 1.0 },
  },
  {
    chave: "hr",
    nome: "HR",
    emoji: "🚚",
    cabe: "Hyundai HR ou Kia Bongo. Carroceria de 1,70m x 2,80m — mudança de 1 quarto, geladeira, sofá de 3 lugares",
    limite: { pesoKg: 1000, volumeM3: 8 },
  },
  {
    chave: "caminhao_bau",
    nome: "Caminhão baú (Iveco Daily)",
    emoji: "🚛",
    cabe: "Iveco Daily e similares. Baú de 2,50m x 3,50m — mudança inteira, carga alta ou comprida",
    limite: { pesoKg: 2500, volumeM3: 12 },
  },
];

export const NOME_VEICULO: Record<VeiculoChave, string> = {
  utilitario: VEICULOS[0].nome,
  hr: VEICULOS[1].nome,
  caminhao_bau: VEICULOS[2].nome,
};
