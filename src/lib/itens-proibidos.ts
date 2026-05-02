// Detecta itens proibidos em texto livre de cliente.
//
// Audit 2/Mai/2026: cliente podia descrever "transportar 5 cachorros vivos"
// ou "20kg de maconha em caixas" e sistema cobrava + enviava fretista
// normalmente. Isso eh:
//   - Compliance legal: transporte de animais vivos exige licenca IBAMA;
//     drogas/armas/munição em transporte por particular configura crime;
//     bebes/criancas SOZINHOS sao recusados pela maioria das transportadoras.
//   - Risco operacional: fretista parado em blitz por carga ilicita.
//   - Reputacao Pegue: noticia "Pegue transportou maconha pra cliente".
//
// Esse filtro nao eh perfeito (cliente pode disfarcar com sinonimos),
// mas pega os 90% obvios. Match case-insensitive em palavras inteiras
// pra evitar falso positivo (ex: "armario" tem "arma" dentro).

export type CategoriaProibida =
  | "animais_vivos"
  | "pessoas"
  | "drogas"
  | "armas"
  | "explosivos"
  | "material_biologico";

export interface ItemProibidoDetectado {
  categoria: CategoriaProibida;
  termo: string; // termo que matchou (pra log)
}

// Listas curtas e diretas. Cada termo eh comparado como palavra inteira
// (boundary). Sinonimos comuns + diminutivos. Acentos sao normalizados.
const BLOCKLIST: Record<CategoriaProibida, string[]> = {
  animais_vivos: [
    "cachorro", "cachorros", "cao", "caes", "cadela", "cadelas",
    "gato", "gatos", "gata", "gatas",
    "passaro", "passaros", "passarinho", "passarinhos", "ave", "aves",
    "papagaio", "papagaios",
    "animal vivo", "animais vivos", "pet", "pets",
    "cavalo", "cavalos", "egua",
    "porco", "porcos",
    "galinha", "galinhas",
    "coelho", "coelhos",
    "hamster", "hamsters",
    "iguana", "tartaruga", "cobra", "cobras",
  ],
  pessoas: [
    "bebe", "bebes", "neonato",
    "crianca", "criancas", "criancinha",
    "passageiro", "passageiros",
    "pessoa", "pessoas", "gente",
  ],
  drogas: [
    "maconha", "cocaina", "crack", "lsd", "ecstasy",
    "heroina", "skunk", "haxixe",
    "droga", "drogas", "entorpecente", "entorpecentes",
  ],
  armas: [
    "arma", "armas", "armamento",
    "pistola", "pistolas", "revolver",
    "fuzil", "fuzis",
    "rifle", "rifles", "carabina",
    "espingarda", "espingardas",
    "municao", "municoes", "bala", "balas", "cartucho", "cartuchos",
  ],
  explosivos: [
    "explosivo", "explosivos",
    "dinamite", "dinamites",
    "fogos de artificio", "rojao", "rojoes",
    "gasolina solta", "alcool em bombona",
    "polvora",
  ],
  material_biologico: [
    "orgao", "orgaos",
    "sangue", "plasma",
    "cadaver", "cadaveres",
    "agente biologico",
  ],
};

function normalizarTexto(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Procura termos proibidos no texto/itens fornecidos. Retorna array com
 * todos os matches (pode ter mais de um). Vazio = limpo.
 */
export function detectarItensProibidos(input: {
  textoLivre?: string | null;
  itens?: string[] | null;
}): ItemProibidoDetectado[] {
  const textos: string[] = [];
  if (input.textoLivre) textos.push(input.textoLivre);
  if (Array.isArray(input.itens)) textos.push(...input.itens);
  if (textos.length === 0) return [];

  const haystack = normalizarTexto(textos.join(" | "));
  const achados: ItemProibidoDetectado[] = [];

  for (const [cat, termos] of Object.entries(BLOCKLIST) as [CategoriaProibida, string[]][]) {
    for (const t of termos) {
      const tn = normalizarTexto(t);
      // Boundary: precisa ser palavra "inteira" (start/end ou nao-letra ao redor).
      // Evita "arma" matchar "armario", "ave" matchar "aveio" etc.
      const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(tn)}([^a-z0-9]|$)`);
      if (re.test(haystack)) {
        achados.push({ categoria: cat, termo: t });
      }
    }
  }

  return achados;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Mensagem amigavel pra responder cliente quando algo proibido eh detectado.
 * Nao acusa o cliente — informa restricao + escala humano.
 */
export function mensagemRecusaPorItemProibido(achados: ItemProibidoDetectado[]): string {
  if (achados.length === 0) return "";
  const cats = Array.from(new Set(achados.map((a) => a.categoria)));
  const desc = cats
    .map((c) => {
      switch (c) {
        case "animais_vivos": return "animais vivos (precisa licenca especifica)";
        case "pessoas":       return "transporte de pessoas (nao somos taxi)";
        case "drogas":        return "substancias controladas";
        case "armas":         return "armas e municao";
        case "explosivos":    return "produtos inflamaveis ou explosivos";
        case "material_biologico": return "material biologico";
      }
    })
    .filter(Boolean)
    .join(", ");
  return (
    `Desculpa, mas nosso servico nao cobre ${desc}. ` +
    `Se foi um mal-entendido na descricao, manda de novo com mais detalhes. ` +
    `Pra esses casos especificos, recomendo procurar transportadora especializada.`
  );
}
