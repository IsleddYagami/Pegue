// Analise estatistica de feedback_precos pra detectar PADROES e gerar
// SUGESTOES automaticas de regras de ajuste de preco.
//
// Cumpre regra mestra APRENDIZADO CONSTANTE INEGOCIAVEL: sistema se
// auto-analisa, detecta padroes, e propoe ajustes pro admin aprovar.
//
// Logica:
//   1) Agrupa avaliacoes em "buckets" (veiculo + zona + faixa_km + faixa_itens + ajudante)
//   2) Pra cada bucket com N >= 3 avaliacoes:
//      - Calcula gap medio, mediano, desvio padrao
//      - Calcula concordancia (% das avaliacoes na mesma direcao do gap)
//   3) Filtra clusters com:
//      - |gap medio| >= 5%
//      - concordancia >= 70%
//   4) Ordena por "confianca" (qtd_avaliacoes * |gap|)

export interface FeedbackBruto {
  id: string;
  veiculo: string;
  zona: string;
  distancia_km: number;
  qtd_itens: number;
  tem_ajudante: boolean;
  preco_pegue: number;
  preco_sugerido: number;
  gap_percentual: number | null;
  fretista_phone: string;
  fretista_nome: string | null;
  criado_em: string;
}

export interface ClusterSugestao {
  // Identificacao do bucket
  veiculo: string;
  zona: string;
  faixa_km_label: string;
  km_min: number;
  km_max: number;
  faixa_itens_label: string;
  qtd_itens_min: number;
  qtd_itens_max: number;
  com_ajudante: boolean;

  // Estatisticas
  qtd_avaliacoes: number;
  qtd_avaliadores_unicos: number;
  gap_medio: number;        // %
  gap_mediano: number;      // %
  gap_desvio_padrao: number;
  concordancia_pct: number; // % na mesma direcao

  // Precos medios e fator sugerido
  preco_pegue_medio: number;
  preco_sugerido_medio: number;
  fator_multiplicador: number;

  // Ajuda decisao
  confianca_score: number; // qtd_avaliacoes * |gap| — pra ranquear
  ids_feedbacks: string[];

  // Avaliadores envolvidos
  avaliadores: { nome: string; qtd: number }[];
}

const KM_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "0-5km", min: 0, max: 5 },
  { label: "5-10km", min: 5, max: 10 },
  { label: "10-15km", min: 10, max: 15 },
  { label: "15-20km", min: 15, max: 20 },
  { label: "20-30km", min: 20, max: 30 },
  { label: "30-50km", min: 30, max: 50 },
  { label: "50km+", min: 50, max: 9999 },
];

const ITENS_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "1 item", min: 1, max: 1 },
  { label: "2-3 itens", min: 2, max: 3 },
  { label: "4-5 itens", min: 4, max: 5 },
  { label: "6-8 itens", min: 6, max: 8 },
  { label: "9-12 itens", min: 9, max: 12 },
  { label: "13+ itens", min: 13, max: 999 },
];

function mediana(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
}

function desvioPadrao(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = nums.reduce((a, b) => a + b, 0) / nums.length;
  const v = nums.reduce((s, x) => s + (x - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
}

export interface OpcoesAnalise {
  minAvaliacoes?: number;       // default 3
  minGapAbsoluto?: number;       // default 5 (%)
  minConcordancia?: number;      // default 70 (%)
}

export function analisarClusters(
  feedbacks: FeedbackBruto[],
  opcoes: OpcoesAnalise = {},
): ClusterSugestao[] {
  const minAvaliacoes = opcoes.minAvaliacoes ?? 3;
  const minGapAbsoluto = opcoes.minGapAbsoluto ?? 5;
  const minConcordancia = opcoes.minConcordancia ?? 70;

  const grupos = new Map<string, FeedbackBruto[]>();

  for (const f of feedbacks) {
    const km = KM_BUCKETS.find(b => f.distancia_km >= b.min && f.distancia_km <= b.max);
    const it = ITENS_BUCKETS.find(b => f.qtd_itens >= b.min && f.qtd_itens <= b.max);
    if (!km || !it) continue;
    const chave = `${f.veiculo}|${f.zona}|${km.label}|${it.label}|${f.tem_ajudante ? "1" : "0"}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(f);
  }

  const sugestoes: ClusterSugestao[] = [];

  for (const fs of grupos.values()) {
    if (fs.length < minAvaliacoes) continue;

    const f0 = fs[0];
    const km = KM_BUCKETS.find(b => f0.distancia_km >= b.min && f0.distancia_km <= b.max)!;
    const it = ITENS_BUCKETS.find(b => f0.qtd_itens >= b.min && f0.qtd_itens <= b.max)!;

    const gaps = fs.map(f => f.gap_percentual ?? 0);
    const gapMedio = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    if (Math.abs(gapMedio) < minGapAbsoluto) continue;

    // Concordancia: % das avaliacoes que estao na mesma direcao do gap medio
    // (gap pequeno < 2% conta como "neutro" — nao desconta concordancia)
    const direcao = gapMedio > 0 ? 1 : -1;
    const concordando = gaps.filter(g => Math.sign(g) === direcao || Math.abs(g) < 2).length;
    const concordancia = (concordando / gaps.length) * 100;

    if (concordancia < minConcordancia) continue;

    const precoPegueMedio = fs.reduce((a, f) => a + (f.preco_pegue || 0), 0) / fs.length;
    const precoSugeridoMedio = fs.reduce((a, f) => a + (f.preco_sugerido || 0), 0) / fs.length;
    const fator = precoPegueMedio > 0 ? precoSugeridoMedio / precoPegueMedio : 1;

    const phonesUnicos = new Set(fs.map(f => f.fretista_phone)).size;

    // Avaliadores envolvidos (agrupado)
    const porAvaliador = new Map<string, number>();
    for (const f of fs) {
      const nome = f.fretista_nome || `Telefone ${f.fretista_phone.slice(-4)}`;
      porAvaliador.set(nome, (porAvaliador.get(nome) || 0) + 1);
    }
    const avaliadores = [...porAvaliador.entries()].map(([nome, qtd]) => ({ nome, qtd }));

    sugestoes.push({
      veiculo: f0.veiculo,
      zona: f0.zona,
      faixa_km_label: km.label,
      km_min: km.min,
      km_max: km.max,
      faixa_itens_label: it.label,
      qtd_itens_min: it.min,
      qtd_itens_max: it.max,
      com_ajudante: !!f0.tem_ajudante,
      qtd_avaliacoes: fs.length,
      qtd_avaliadores_unicos: phonesUnicos,
      gap_medio: Math.round(gapMedio * 100) / 100,
      gap_mediano: Math.round(mediana(gaps) * 100) / 100,
      gap_desvio_padrao: Math.round(desvioPadrao(gaps) * 100) / 100,
      concordancia_pct: Math.round(concordancia * 100) / 100,
      preco_pegue_medio: Math.round(precoPegueMedio),
      preco_sugerido_medio: Math.round(precoSugeridoMedio),
      fator_multiplicador: Math.round(fator * 10000) / 10000,
      confianca_score: Math.round(fs.length * Math.abs(gapMedio) * 100) / 100,
      ids_feedbacks: fs.map(f => f.id),
      avaliadores: avaliadores.sort((a, b) => b.qtd - a.qtd),
    });
  }

  return sugestoes.sort((a, b) => b.confianca_score - a.confianca_score);
}
