// Catalogo de itens da carga — o que o cliente TOCA na tela, com volume e peso
// de tabela.
//
// POR QUE EXISTE (ordem do Fabio, 6 e 7/Nov/2026)
// A foto saiu da frente: "OS SISTEMAS FALHAM MTO P IDENTIFICAR". E o texto
// livre tem o mesmo vicio por outro caminho — quem transforma "sofa, geladeira
// e umas caixas" em metro cubico hoje e uma IA (classificador-itens.ts,
// gpt-4o-mini), que ESTIMA. Quando a pessoa toca o item numa lista, cada item
// ja tem volume fixo: viram conta, nao chute.
//
// DE ONDE VEM OS NUMEROS
// Nao inventei nenhum. Os marcados `origem: "tabela"` sao exatamente os que ja
// estavam no projeto, dentro do prompt do classificador ("ESTIMATIVAS DE VOLUME
// (m3) E PESO (kg) — referencias de mercado SP"). Trazer pra ca os tira de
// dentro de um texto de prompt e poe num lugar que da pra testar e corrigir.
// Os marcados `origem: "derivado"` nao existiam na tabela: cada um diz, no
// campo `base`, de qual item da tabela foi derivado e por que. Assim qualquer
// numero errado se corrige num lugar so, e da pra ver qual era o raciocinio.
//
// O QUE ESTE ARQUIVO NAO FAZ
// Nao mexe em preco. Preco e' distancia x veiculo x zona x adicionais
// (bot-utils.calcularPrecos). O volume daqui serve pra UMA coisa: dizer se a
// carga cabe no veiculo que a pessoa escolheu — conselho na tela, nunca
// cobranca. Se a tabela errar um item, ninguem paga errado.

import { sugerirVeiculoPorVolumePeso, calcularVolumeM3 } from "./bot-utils";

export type Ambiente = "sala" | "quarto" | "cozinha" | "escritorio" | "outros" | "descarte";

/**
 * Servico que o item puxa junto. Ordem do Fabio, 15/Nov/2026:
 * "remocao de entulho, mas esse deve ser cobrado muito caro pois e' muito
 * trabalhoso precisa de no minimo 3 pessoas e ainda tem o descarte, servico
 * de descarte tb pode oferecer mas tb precisa ter um valor pelo menos 30%
 * maior que um frete comum, dinamico".
 *
 * Quem transforma isso em preco e' lib/servicos-especiais.ts. Aqui so' se
 * marca o que o item E': entulho de obra, coisa que vai pro descarte, ou
 * mudanca normal (sem marca).
 */
export type ServicoItem = "descarte" | "entulho";

export interface ItemCatalogo {
  id: string;
  nome: string;
  /** Emoji do botao. Tela tem que funcionar pra quem le pouco. */
  emoji: string;
  ambiente: Ambiente;
  volumeM3: number;
  pesoKg: number;
  origem: "tabela" | "derivado";
  /** So em `derivado`: de qual item da tabela saiu, e por que. */
  base?: string;
  /**
   * Aparece na aba "Mais pedidos", antes de qualquer comodo. Fabio, 15/Nov,
   * olhando a tela so' com a sala aberta: "nao colocou os principais? fogao,
   * geladeira, armario, microondas, guarda roupa desmontado, mesa de cozinha,
   * cama, tv x polegadas, caixas, sacolas".
   * Eles ESTAVAM no catalogo — escondidos atras das abas. Agora a primeira
   * coisa que a pessoa ve e' esta lista.
   */
  destaque?: boolean;
  /** Entulho ou descarte: muda o servico e o preco. Sem isso, e' frete. */
  servico?: ServicoItem;
}

export const CATALOGO: readonly ItemCatalogo[] = [
  // ---------- SALA ----------
  { id: "sofa_2", nome: "Sofá 2 lugares", emoji: "🛋️", ambiente: "sala", volumeM3: 1.2, pesoKg: 50, origem: "tabela" },
  { id: "sofa_3", nome: "Sofá 3 lugares", emoji: "🛋️", ambiente: "sala", volumeM3: 1.8, pesoKg: 70, origem: "tabela", destaque: true },
  { id: "sofa_conjunto", nome: "Sofá conjunto (2+3)", emoji: "🛋️", ambiente: "sala", volumeM3: 3.0, pesoKg: 120, origem: "tabela" },
  { id: "poltrona", nome: "Poltrona", emoji: "🪑", ambiente: "sala", volumeM3: 0.6, pesoKg: 25, origem: "derivado", base: "metade do sofá 2 lugares (1.2m³/50kg)" },
  { id: "rack_tv", nome: "Rack de TV", emoji: "📺", ambiente: "sala", volumeM3: 0.4, pesoKg: 25, origem: "tabela" },
  // TV POR POLEGADA (ordem do Fabio, 15/Nov: "tv x polegadas"). O item de
  // tabela era um "TV" so', com 0.1m³/25kg. Ele virou a faixa do meio, que e'
  // a mais comum; as outras duas saem dele, pra cima e pra baixo. Botao por
  // tamanho em vez de campo de digitar: a pessoa sabe a polegada da TV dela e
  // escolhe num toque.
  { id: "tv_ate_43", nome: 'TV até 43"', emoji: "📺", ambiente: "sala", volumeM3: 0.07, pesoKg: 12, origem: "derivado", base: 'TV de tabela (0.1m³/25kg) e a de 50-55"; a de até 43" e mais estreita e bem mais leve' },
  { id: "tv", nome: 'TV 50" a 55"', emoji: "📺", ambiente: "sala", volumeM3: 0.1, pesoKg: 25, origem: "tabela", destaque: true },
  { id: "tv_65", nome: 'TV 65" ou maior', emoji: "📺", ambiente: "sala", volumeM3: 0.15, pesoKg: 35, origem: "derivado", base: 'uma vez e meia a TV de 50-55" (0.1m³/25kg), que e a de tabela' },
  { id: "estante", nome: "Estante", emoji: "🗄️", ambiente: "sala", volumeM3: 0.6, pesoKg: 30, origem: "tabela" },
  { id: "mesa_centro", nome: "Mesa de centro", emoji: "🪵", ambiente: "sala", volumeM3: 0.3, pesoKg: 15, origem: "derivado", base: "menor que o rack de TV (0.4m³/25kg)" },

  // ---------- QUARTO ----------
  { id: "cama_solteiro", nome: "Cama de solteiro", emoji: "🛏️", ambiente: "quarto", volumeM3: 1.0, pesoKg: 40, origem: "tabela" },
  { id: "cama_casal", nome: "Cama de casal", emoji: "🛏️", ambiente: "quarto", volumeM3: 1.6, pesoKg: 60, origem: "tabela" },
  { id: "cama_box", nome: "Cama box casal", emoji: "🛏️", ambiente: "quarto", volumeM3: 1.8, pesoKg: 80, origem: "tabela", destaque: true },
  { id: "beliche", nome: "Beliche", emoji: "🛏️", ambiente: "quarto", volumeM3: 1.4, pesoKg: 55, origem: "tabela" },
  { id: "colchao", nome: "Colchão (só o colchão)", emoji: "🛌", ambiente: "quarto", volumeM3: 0.6, pesoKg: 25, origem: "derivado", base: "a parte de cima da cama de casal (1.6m³/60kg), sem a base" },
  { id: "berco", nome: "Berço", emoji: "👶", ambiente: "quarto", volumeM3: 0.6, pesoKg: 30, origem: "derivado", base: "pouco mais da metade da cama de solteiro (1.0m³/40kg)" },
  { id: "guarda_roupa_2", nome: "Guarda-roupa 2 portas", emoji: "🚪", ambiente: "quarto", volumeM3: 1.0, pesoKg: 55, origem: "derivado", base: "dois terços do armário 3 portas (1.5m³/80kg)" },
  { id: "armario_3", nome: "Armário 3 portas", emoji: "🚪", ambiente: "quarto", volumeM3: 1.5, pesoKg: 80, origem: "tabela", destaque: true },
  { id: "armario_6", nome: "Guarda-roupa grande (6 portas)", emoji: "🚪", ambiente: "quarto", volumeM3: 3.0, pesoKg: 150, origem: "tabela" },
  // DESMONTADO ocupa um terco e pesa o mesmo: vira pilha de tabuas. Faltava no
  // catalogo e e' o caso mais comum de mudanca — Fabio pediu em 15/Nov.
  { id: "guarda_roupa_desmontado", nome: "Guarda-roupa desmontado", emoji: "🪵", ambiente: "quarto", volumeM3: 0.5, pesoKg: 80, origem: "derivado", base: "armário 3 portas (1.5m³/80kg) desmontado: pilha de tábuas ocupa ~1/3 do espaço, e o peso da madeira não muda", destaque: true },
  { id: "comoda", nome: "Cômoda", emoji: "🗄️", ambiente: "quarto", volumeM3: 0.5, pesoKg: 35, origem: "derivado", base: "um terço do armário 3 portas (1.5m³/80kg)" },
  { id: "sapateira", nome: "Sapateira", emoji: "👟", ambiente: "quarto", volumeM3: 0.3, pesoKg: 15, origem: "derivado", base: "metade da estante simples (0.6m³/30kg)" },

  // ---------- COZINHA ----------
  { id: "geladeira_duplex", nome: "Geladeira duplex", emoji: "🧊", ambiente: "cozinha", volumeM3: 0.5, pesoKg: 90, origem: "tabela", destaque: true },
  { id: "geladeira_simples", nome: "Geladeira simples", emoji: "🧊", ambiente: "cozinha", volumeM3: 0.35, pesoKg: 60, origem: "tabela" },
  { id: "freezer", nome: "Freezer", emoji: "🧊", ambiente: "cozinha", volumeM3: 0.5, pesoKg: 70, origem: "derivado", base: "mesmo volume da geladeira duplex (0.5m³), peso da máquina de lavar (70kg)" },
  { id: "fogao_4", nome: "Fogão 4 bocas", emoji: "🔥", ambiente: "cozinha", volumeM3: 0.2, pesoKg: 35, origem: "tabela", destaque: true },
  { id: "fogao_6", nome: "Fogão 6 bocas", emoji: "🔥", ambiente: "cozinha", volumeM3: 0.3, pesoKg: 55, origem: "tabela" },
  { id: "maquina_lavar", nome: "Máquina de lavar", emoji: "🌀", ambiente: "cozinha", volumeM3: 0.4, pesoKg: 70, origem: "tabela", destaque: true },
  { id: "maquina_secar", nome: "Secadora", emoji: "🌀", ambiente: "cozinha", volumeM3: 0.4, pesoKg: 60, origem: "derivado", base: "mesmo tamanho da máquina de lavar (0.4m³), um pouco mais leve" },
  { id: "microondas", nome: "Micro-ondas", emoji: "🍲", ambiente: "cozinha", volumeM3: 0.06, pesoKg: 15, origem: "tabela", destaque: true },
  { id: "mesa_4", nome: "Mesa de cozinha com 4 cadeiras", emoji: "🍽️", ambiente: "cozinha", volumeM3: 1.0, pesoKg: 40, origem: "tabela", destaque: true },
  { id: "mesa_6", nome: "Mesa de cozinha com 6 cadeiras", emoji: "🍽️", ambiente: "cozinha", volumeM3: 1.6, pesoKg: 60, origem: "derivado", base: "mesa de 4 (1.0m³/40kg) + 2 cadeiras (0.15m³/6kg cada), arredondado" },
  { id: "armario_cozinha", nome: "Armário de cozinha", emoji: "🗄️", ambiente: "cozinha", volumeM3: 1.0, pesoKg: 55, origem: "derivado", base: "mesmo do guarda-roupa 2 portas (1.0m³/55kg)" },

  // ---------- ESCRITORIO ----------
  { id: "escrivaninha", nome: "Escrivaninha / mesa de PC", emoji: "💻", ambiente: "escritorio", volumeM3: 0.5, pesoKg: 30, origem: "derivado", base: "entre o rack de TV (0.4m³) e a estante (0.6m³)" },
  { id: "cadeira", nome: "Cadeira", emoji: "🪑", ambiente: "escritorio", volumeM3: 0.15, pesoKg: 6, origem: "derivado", base: "mesa de 4 cadeiras (1.0m³/40kg) menos o tampo, dividido por 4" },
  { id: "armario_arquivo", nome: "Armário de arquivo", emoji: "🗃️", ambiente: "escritorio", volumeM3: 0.6, pesoKg: 40, origem: "derivado", base: "estante simples (0.6m³) com peso de móvel fechado" },

  // ---------- OUTROS ----------
  { id: "caixa_media", nome: "Caixa média", emoji: "📦", ambiente: "outros", volumeM3: 0.05, pesoKg: 8, origem: "tabela" },
  { id: "caixa_grande", nome: "Caixa grande", emoji: "📦", ambiente: "outros", volumeM3: 0.1, pesoKg: 15, origem: "tabela", destaque: true },
  { id: "mala", nome: "Mala", emoji: "🧳", ambiente: "outros", volumeM3: 0.08, pesoKg: 12, origem: "derivado", base: "entre a caixa média (0.05m³) e a grande (0.1m³)" },
  // Sacola saiu de dentro do item "Mala ou sacola": sao duas coisas, e o
  // Fabio pediu as duas separadas em 15/Nov. Sacola cheia e menor e mais leve
  // que mala e que caixa media.
  { id: "sacola", nome: "Sacola", emoji: "🛍️", ambiente: "outros", volumeM3: 0.04, pesoKg: 6, origem: "derivado", base: "um pouco menor e mais leve que a caixa média (0.05m³/8kg)", destaque: true },
  { id: "bicicleta", nome: "Bicicleta", emoji: "🚲", ambiente: "outros", volumeM3: 0.3, pesoKg: 15, origem: "derivado", base: "ocupa como uma mesa de centro (0.3m³), mas comprida" },
  { id: "ar_condicionado", nome: "Ar-condicionado", emoji: "❄️", ambiente: "outros", volumeM3: 0.15, pesoKg: 35, origem: "derivado", base: "pouco mais que o micro-ondas em volume (0.06m³), peso de fogão 4 bocas (35kg)" },
  { id: "espelho_quadro", nome: "Espelho ou quadro grande", emoji: "🖼️", ambiente: "outros", volumeM3: 0.1, pesoKg: 12, origem: "derivado", base: "mesmo da TV em volume (0.1m³), mais leve" },
  { id: "ventilador", nome: "Ventilador", emoji: "💨", ambiente: "outros", volumeM3: 0.1, pesoKg: 8, origem: "derivado", base: "caixa grande (0.1m³) com peso de caixa média" },
  { id: "varal", nome: "Varal", emoji: "🧺", ambiente: "outros", volumeM3: 0.15, pesoKg: 8, origem: "derivado", base: "dobrado, ocupa como uma cadeira (0.15m³)" },

  // ---------- ENTULHO E DESCARTE ----------
  // Servico novo, pedido pelo Fabio em 15/Nov/2026. Nao e' frete: a equipe
  // carrega na mao, sobe e desce escada com peso sujo, e no fim ainda paga
  // pra deixar o material em algum lugar legal. Por isso cada item daqui
  // carrega a marca `servico`, e quem ve a marca cobra diferente
  // (lib/servicos-especiais.ts).
  { id: "entulho_saco", nome: "Saco de entulho de obra", emoji: "🧱", ambiente: "descarte", volumeM3: 0.02, pesoKg: 30, origem: "derivado", base: "saco de ráfia de 20 litros (0.02m³); entulho de obra pesa cerca de 1,5 t/m³, então ~30kg por saco", servico: "entulho" },
  { id: "entulho_madeira", nome: "Madeira e tábuas velhas", emoji: "🪵", ambiente: "descarte", volumeM3: 0.5, pesoKg: 150, origem: "derivado", base: "pilha do tamanho do guarda-roupa desmontado (0.5m³), mas jogada solta e com peso de madeira molhada", servico: "entulho" },
  { id: "descarte_movel", nome: "Móvel velho pra jogar fora", emoji: "🪑", ambiente: "descarte", volumeM3: 1.0, pesoKg: 55, origem: "derivado", base: "mesmo do armário de cozinha (1.0m³/55kg)", servico: "descarte" },
  { id: "descarte_sofa", nome: "Sofá velho pra jogar fora", emoji: "🛋️", ambiente: "descarte", volumeM3: 1.8, pesoKg: 70, origem: "derivado", base: "mesmo do sofá 3 lugares (1.8m³/70kg)", servico: "descarte" },
  { id: "descarte_colchao", nome: "Colchão velho pra jogar fora", emoji: "🛌", ambiente: "descarte", volumeM3: 0.6, pesoKg: 25, origem: "derivado", base: "mesmo do colchão (0.6m³/25kg)", servico: "descarte" },
  { id: "descarte_eletro", nome: "Eletrodoméstico velho pra jogar fora", emoji: "🧊", ambiente: "descarte", volumeM3: 0.4, pesoKg: 70, origem: "derivado", base: "mesmo da máquina de lavar (0.4m³/70kg)", servico: "descarte" },
];

export const AMBIENTES: ReadonlyArray<{ chave: Ambiente; nome: string; emoji: string }> = [
  { chave: "sala", nome: "Sala", emoji: "🛋️" },
  { chave: "quarto", nome: "Quarto", emoji: "🛏️" },
  { chave: "cozinha", nome: "Cozinha", emoji: "🍽️" },
  { chave: "escritorio", nome: "Escritório", emoji: "💻" },
  { chave: "outros", nome: "Outros", emoji: "📦" },
  { chave: "descarte", nome: "Entulho e descarte", emoji: "🧱" },
];

/** O que a aba "Mais pedidos" mostra, na ordem do catalogo. */
export const DESTAQUES: readonly ItemCatalogo[] = CATALOGO.filter((i) => i.destaque);

const POR_ID = new Map(CATALOGO.map((i) => [i.id, i]));

export function itemPorId(id: string): ItemCatalogo | undefined {
  return POR_ID.get(id);
}

/**
 * Medida que o cliente digitou pra um item, em CENTIMETROS. Opcional —
 * ordem do Fabio: "em cada opcao ela pode colocar se quiser as medidas isso
 * pode ser opcional". Quando vem, manda nela: a medida do dono do movel vale
 * mais que a media de mercado.
 */
export interface MedidaItem {
  larguraCm: number;
  alturaCm: number;
  comprimentoCm: number;
}

export interface ItemEscolhido {
  id: string;
  qtd: number;
  /** Nome livre, so' pra item fora do catalogo (id === ITEM_OUTRO). */
  nomeLivre?: string;
  medida?: MedidaItem;
}

/** Id reservado pro que a pessoa escreve e nao esta na lista. */
export const ITEM_OUTRO = "outro";

/** Volume/peso de 1 unidade: medida do cliente ganha da tabela. */
function unidade(e: ItemEscolhido): { volumeM3: number; pesoKg: number } {
  const cat = POR_ID.get(e.id);
  if (e.medida) {
    const v = calcularVolumeM3(e.medida.larguraCm, e.medida.alturaCm, e.medida.comprimentoCm);
    // Medida diz o espaco, nao diz o peso. Peso fica o da tabela quando ha
    // item de tabela; item livre entra com peso 0 e quem decide e' o volume.
    return { volumeM3: v, pesoKg: cat?.pesoKg ?? 0 };
  }
  if (cat) return { volumeM3: cat.volumeM3, pesoKg: cat.pesoKg };
  // Item livre sem medida: nao da pra estimar. Soma zero de proposito, e
  // `temItemSemMedida` avisa a tela — melhor dizer "nao sei" do que chutar.
  return { volumeM3: 0, pesoKg: 0 };
}

export interface ResumoCarga {
  volumeM3: number;
  pesoKg: number;
  totalItens: number;
  veiculoSugerido: ReturnType<typeof sugerirVeiculoPorVolumePeso> | null;
  /** Item escrito a mao e sem medida: a conta nao enxerga ele. */
  temItemSemMedida: boolean;
}

export function resumirCarga(escolhidos: readonly ItemEscolhido[]): ResumoCarga {
  let volumeM3 = 0;
  let pesoKg = 0;
  let totalItens = 0;
  let temItemSemMedida = false;

  for (const e of escolhidos) {
    const qtd = Math.max(0, Math.trunc(e.qtd));
    if (qtd === 0) continue;
    const u = unidade(e);
    if (!POR_ID.has(e.id) && !e.medida) temItemSemMedida = true;
    volumeM3 += u.volumeM3 * qtd;
    pesoKg += u.pesoKg * qtd;
    totalItens += qtd;
  }

  return {
    volumeM3: Math.round(volumeM3 * 1000) / 1000,
    pesoKg: Math.round(pesoKg),
    totalItens,
    veiculoSugerido: totalItens === 0 ? null : sugerirVeiculoPorVolumePeso(volumeM3, pesoKg),
    temItemSemMedida,
  };
}

/** O servico que a carga pede. "frete" e' o normal. */
export type ServicoCarga = "frete" | "descarte" | "entulho";

export interface ServicoDaCarga {
  servico: ServicoCarga;
  /** m³ do que vai ser descartado (entulho + descarte juntos). */
  volumeDescarteM3: number;
}

/**
 * Olha a carga e diz que servico e'. Entulho ganha de descarte, descarte ganha
 * de frete: quem manda e' o item mais trabalhoso da lista.
 *
 * Isso roda NO SERVIDOR tambem (lib/cotacao), sobre a lista ja' normalizada —
 * entao ninguem forja "entulho virou frete" mexendo no navegador.
 */
export function servicoDaCarga(escolhidos: readonly ItemEscolhido[]): ServicoDaCarga {
  let temEntulho = false;
  let temDescarte = false;
  let volumeDescarteM3 = 0;

  for (const e of escolhidos) {
    const qtd = Math.max(0, Math.trunc(e.qtd));
    if (qtd === 0) continue;
    const cat = POR_ID.get(e.id);
    if (!cat?.servico) continue;
    if (cat.servico === "entulho") temEntulho = true;
    else temDescarte = true;
    volumeDescarteM3 += unidade(e).volumeM3 * qtd;
  }

  return {
    servico: temEntulho ? "entulho" : temDescarte ? "descarte" : "frete",
    volumeDescarteM3: Math.round(volumeDescarteM3 * 1000) / 1000,
  };
}

const ORDEM_VEICULO = ["utilitario", "hr", "caminhao_bau"] as const;
export type VeiculoCarga = (typeof ORDEM_VEICULO)[number];

/**
 * O veiculo que a pessoa escolheu da conta pra essa carga?
 *
 * Isso e' CONSELHO, nao trava. Ordem do Fabio: "as pessoas normalmente sabem o
 * tamanho do veiculo que precisam, raramente elas erram". Entao a tela avisa e
 * deixa seguir — quem decide e' o cliente.
 */
export function cabeNoVeiculo(
  resumo: ResumoCarga,
  escolhido: VeiculoCarga,
): { cabe: boolean; motivo: "ok" | "sem_itens" | "aperta" | "excede_frota" | "nao_sei" } {
  if (resumo.totalItens === 0) return { cabe: true, motivo: "sem_itens" };
  if (resumo.temItemSemMedida) return { cabe: true, motivo: "nao_sei" };
  if (resumo.veiculoSugerido === "carga_excedida") return { cabe: false, motivo: "excede_frota" };
  const precisa = ORDEM_VEICULO.indexOf(resumo.veiculoSugerido as VeiculoCarga);
  const tem = ORDEM_VEICULO.indexOf(escolhido);
  if (precisa > tem) return { cabe: false, motivo: "aperta" };
  return { cabe: true, motivo: "ok" };
}

/** Tetos do que o navegador pode mandar. Corpo forjado nao vira carga absurda. */
export const MAX_LINHAS_ITENS = 40;
export const MAX_QTD_POR_ITEM = 99;
const MAX_CM = 1000;

/**
 * Normaliza a lista de itens que chegou do navegador. Descarta o que nao
 * reconhece em vez de confiar: item fora do catalogo so passa como
 * `ITEM_OUTRO` com nome livre, e medida so passa se os tres numeros fazem
 * sentido em centimetros.
 */
export function normalizarItensRecebidos(bruto: unknown): ItemEscolhido[] {
  if (!Array.isArray(bruto)) return [];
  const saida: ItemEscolhido[] = [];

  for (const cru of bruto.slice(0, MAX_LINHAS_ITENS)) {
    if (!cru || typeof cru !== "object") continue;
    const o = cru as Record<string, unknown>;

    const idBruto = String(o.id ?? "").trim();
    const conhecido = POR_ID.has(idBruto);
    const id = conhecido ? idBruto : ITEM_OUTRO;

    const qtdNum = typeof o.qtd === "number" && Number.isFinite(o.qtd) ? Math.trunc(o.qtd) : 0;
    const qtd = Math.min(Math.max(qtdNum, 0), MAX_QTD_POR_ITEM);
    if (qtd === 0) continue;

    const nomeLivre = String(o.nomeLivre ?? "").trim().slice(0, 80);
    if (!conhecido && !nomeLivre) continue;

    const item: ItemEscolhido = conhecido ? { id, qtd } : { id, qtd, nomeLivre };

    const m = o.medida as Record<string, unknown> | undefined;
    if (m && typeof m === "object") {
      const n = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
      const l = n(m.larguraCm);
      const a = n(m.alturaCm);
      const c = n(m.comprimentoCm);
      const dentro = [l, a, c].every((x) => x > 0 && x <= MAX_CM);
      if (dentro) item.medida = { larguraCm: l, alturaCm: a, comprimentoCm: c };
    }

    saida.push(item);
  }

  return saida;
}

/**
 * Texto da carga que vai pro pedido e pro WhatsApp do atendimento.
 *
 * Isso resolve um buraco real: ate 7/Nov o pedido fechado no site nascia com
 * `descricao_carga: "Pedido fechado no site — carga ainda nao informada"` e a
 * Iris tinha que perguntar tudo de novo. Agora a carga sai da tela pronta.
 */
export function descricaoCarga(escolhidos: readonly ItemEscolhido[]): string {
  const partes: string[] = [];
  for (const e of escolhidos) {
    const qtd = Math.max(0, Math.trunc(e.qtd));
    if (qtd === 0) continue;
    const cat = POR_ID.get(e.id);
    const nome = cat?.nome ?? (e.nomeLivre || "item").trim();
    const med = e.medida
      ? ` (${e.medida.larguraCm}x${e.medida.alturaCm}x${e.medida.comprimentoCm}cm)`
      : "";
    partes.push(qtd > 1 ? `${qtd}x ${nome}${med}` : `${nome}${med}`);
  }
  return partes.join(", ");
}
