// ENTULHO E DESCARTE — o que muda no preco quando nao e' mudanca.
//
// ORDEM DO FABIO, 15/Nov/2026, palavra por palavra:
// "remocao de entulho, mas esse deve ser cobrado muito caro pois e' muito
//  trabalhoso precisa de no minimo 3 pessoas e ainda tem o descarte, servico
//  de descarte tb pode oferecer mas tb precisa ter um valor pelo menos 30%
//  maior que um frete comum, dinamico"
//
// COMO ISSO VIRA CONTA
// O preco continua saindo do MESMO motor do frete (bot-utils.calcularPrecos):
// distancia, veiculo, zona, feriado, acesso e ajudantes. Nao existe tabela
// paralela. O que este arquivo faz e' so' duas coisas, as duas ditas por ele:
//   1. ENTULHO entra com 3 ajudantes no minimo, mesmo que o cliente peca 0;
//   2. o total do frete e' multiplicado pelo premio do servico.
// Por isso e' DINAMICO: muda com a distancia, com o veiculo, com a zona, com
// o feriado e com a quantidade de coisa (que empurra pro veiculo maior).
//
// O QUE ESTE ARQUIVO NAO FAZ
// Nao inventa taxa por metro cubico, nao inventa preco de cacamba e nao
// inventa valor de ecoponto. Enquanto o Fabio nao passar esses numeros, o
// premio abaixo e' o unico lugar onde o custo do descarte esta embutido.

import type { PrecoDetalhado } from "./bot-utils";
import type { ServicoCarga } from "./itens-carga";

/**
 * NUMEROS QUE SAO DECISAO DO FABIO — mexer aqui muda o preco no site.
 *
 * `descarte: 1.30` e ordem dele, literal: "pelo menos 30% maior que um frete
 * comum". E o piso, nao o teto.
 *
 * `entulho: 1.80` NAO foi numero dele: ele disse "muito caro". Botei 1.8 como
 * ponto de partida (o trabalho e' manual, sujo, pesado, ja entra com 3
 * ajudantes pagos por fora e ainda termina em descarte pago) e marquei aqui
 * pra ele trocar com uma palavra.
 */
export const PREMIO_SERVICO: Record<ServicoCarga, number> = {
  frete: 1.0,
  descarte: 1.3,
  entulho: 1.8,
};

/**
 * Ajudantes que o servico exige, independente do que o cliente escolheu.
 * "precisa de no minimo 3 pessoas" — ordem do Fabio pro entulho.
 * Descarte nao tem minimo: ele nao pediu, entao eu nao invento.
 */
export const AJUDANTES_MINIMOS: Record<ServicoCarga, number> = {
  frete: 0,
  descarte: 0,
  entulho: 3,
};

/** Quantos ajudantes a cotacao vai usar de verdade neste servico. */
export function ajudantesDoServico(servico: ServicoCarga, pedidos: number): number {
  return Math.max(pedidos, AJUDANTES_MINIMOS[servico]);
}

/**
 * Aplica o premio do servico em cima do preco pronto do frete.
 *
 * O premio incide no TOTAL (base + ajudantes + acesso + feriado) porque o
 * trabalho extra e' do servico inteiro, nao so' do deslocamento. `base` guarda
 * o valor ja' premiado pra que a soma das partes continue batendo com o total
 * — se nao, a tela mostraria um detalhamento que nao fecha.
 */
export function aplicarPremio(preco: PrecoDetalhado, servico: ServicoCarga): PrecoDetalhado {
  const premio = PREMIO_SERVICO[servico] ?? 1;
  if (premio === 1) return preco;

  const total = Math.round(preco.total * premio);
  const resto = preco.ajudante + preco.elevador + preco.escada + preco.feriado;
  return { ...preco, base: total - resto, total };
}

/** Texto curto do servico, pra tela e pro WhatsApp. */
export const NOME_SERVICO: Record<ServicoCarga, string> = {
  frete: "Frete / mudança",
  descarte: "Retirada para descarte",
  entulho: "Remoção de entulho",
};

/**
 * O que o cliente leva nesse preco. Isso e' o "valor agregado" na tela:
 * ninguem acha caro quando entende o que esta pagando.
 */
export const INCLUI_SERVICO: Record<ServicoCarga, readonly string[]> = {
  frete: [],
  descarte: [
    "A gente tira de dentro e leva embora",
    "Descarte no destino certo, não na calçada",
    "Você não precisa carregar nada",
  ],
  entulho: [
    "Equipe de 3 pessoas, já no preço",
    "Carga na mão, saco por saco",
    "Descarte no destino certo, com o material fora da sua obra",
    "Você não precisa carregar nada",
  ],
};
