// Ranking do jogo da Pegue (Pegue Runner) — uma linha por JOGADOR.
//
// ORDEM DO FABIO (14/11/2026): *"preciso que destaque este joguinho dentro do
// site p as pessoas jogarem e deve teer acesso facil e os rankings"*.
//
// Por que nao mostrar a lista crua da API: medido no ranking de verdade em
// 14/11/2026 (gabarito em __fixtures__/ranking-pegue-runner.json), o top 20
// tinha 20 linhas e so' 8 jogadores — a Clara aparecia 7 vezes, o FSC 4, o
// Matheuzara 3. Quadro assim nao e' ranking, e' historico: quem jogou muito
// enche a tela e quem chegou perto do recorde nem aparece. Aqui cada jogador
// entra UMA vez, com a melhor corrida dele.

export interface LinhaRanking {
  nome: string;
  score: number;
  distancia: number;
  entregas?: number;
  criado_em?: string;
}

/** Mesmo jogador escrito de jeitos diferentes conta como um: "FSC" = "fsc  ". */
function chaveDoJogador(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function valida(linha: unknown): LinhaRanking | null {
  if (!linha || typeof linha !== "object") return null;
  const l = linha as Record<string, unknown>;
  const nome = typeof l.nome === "string" ? l.nome.trim() : "";
  const distancia = Number(l.distancia);
  const score = Number(l.score);
  if (!nome) return null;
  if (!Number.isFinite(distancia) || distancia < 0) return null;
  return {
    nome,
    distancia: Math.floor(distancia),
    score: Number.isFinite(score) ? Math.floor(score) : 0,
    ...(Number.isFinite(Number(l.entregas)) ? { entregas: Math.floor(Number(l.entregas)) } : {}),
    ...(typeof l.criado_em === "string" ? { criado_em: l.criado_em } : {}),
  };
}

/**
 * Uma linha por jogador, a melhor corrida dele, da maior distancia pra menor.
 * Empate na distancia decide pelo score. Linha sem nome ou com distancia
 * invalida fica fora (a tela nao mostra lixo do banco).
 */
export function melhorPorJogador(bruto: unknown, limite = 10): LinhaRanking[] {
  if (!Array.isArray(bruto)) return [];

  const melhor = new Map<string, LinhaRanking>();
  for (const cru of bruto) {
    const linha = valida(cru);
    if (!linha) continue;
    const chave = chaveDoJogador(linha.nome);
    const atual = melhor.get(chave);
    if (
      !atual ||
      linha.distancia > atual.distancia ||
      (linha.distancia === atual.distancia && linha.score > atual.score)
    ) {
      melhor.set(chave, linha);
    }
  }

  return [...melhor.values()]
    .sort((a, b) => b.distancia - a.distancia || b.score - a.score)
    .slice(0, Math.max(0, limite));
}
