"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Trash2, Power, Wand2, Sparkles, Users } from "lucide-react";

type Feedback = {
  id: string;
  fretista_phone: string;
  fretista_nome: string | null;
  veiculo: string;
  origem: string;
  destino: string;
  distancia_km: number;
  zona: string;
  itens: string;
  qtd_itens: number;
  tem_ajudante: boolean;
  preco_pegue: number;
  preco_sugerido: number;
  gap_percentual: number | null;
  criado_em: string;
};

type Regra = {
  id: string;
  veiculo: string | null;
  zona: string | null;
  km_min: number | null;
  km_max: number | null;
  qtd_itens_min: number | null;
  qtd_itens_max: number | null;
  com_ajudante: boolean | null;
  fator_multiplicador: number;
  valor_fixo: number;
  descricao: string | null;
  ativo: boolean;
  criado_em: string;
};

type Sugestao = {
  veiculo: string;
  zona: string;
  faixa_km_label: string;
  km_min: number;
  km_max: number;
  faixa_itens_label: string;
  qtd_itens_min: number;
  qtd_itens_max: number;
  com_ajudante: boolean;
  qtd_avaliacoes: number;
  qtd_avaliadores_unicos: number;
  gap_medio: number;
  gap_mediano: number;
  gap_desvio_padrao: number;
  concordancia_pct: number;
  preco_pegue_medio: number;
  preco_sugerido_medio: number;
  fator_multiplicador: number;
  confianca_score: number;
  ids_feedbacks: string[];
  avaliadores: { nome: string; qtd: number }[];
};

function getAdminKey(): string | null {
  if (typeof window === "undefined") return null;
  let senha = sessionStorage.getItem("admin_key") || "";
  if (!senha) {
    senha = prompt("Digite a senha de admin:") || "";
    if (!senha) return null;
    sessionStorage.setItem("admin_key", senha);
  }
  return senha;
}

export default function FeedbackPrecosPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"feedbacks" | "sugestoes" | "regras">("feedbacks");
  const [minAval, setMinAval] = useState(3);

  // Filtros da aba "Feedbacks"
  const [filtroVeiculo, setFiltroVeiculo] = useState<string>("todos");
  const [filtroGap, setFiltroGap] = useState<"todos" | "alto" | "baixo" | "ok">("todos");
  const [filtroBusca, setFiltroBusca] = useState<string>("");

  async function loadData() {
    const senha = getAdminKey();
    if (!senha) {
      setErro("Senha de admin obrigatoria");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin-feedback-precos?key=${encodeURIComponent(senha)}`);
      if (res.status === 401) {
        sessionStorage.removeItem("admin_key");
        setErro("Senha incorreta. Recarregue a pagina.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setErro("Erro ao carregar dados");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setFeedbacks((data.feedbacks as Feedback[]) || []);
      setRegras((data.regras as Regra[]) || []);
    } catch {
      setErro("Erro de conexao");
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function carregarSugestoes(min: number = minAval) {
    setLoadingSugestoes(true);
    const senha = sessionStorage.getItem("admin_key") || getAdminKey();
    if (!senha) { setLoadingSugestoes(false); return; }
    try {
      const res = await fetch(`/api/admin-sugestoes-ajuste?key=${encodeURIComponent(senha)}&minAvaliacoes=${min}`);
      if (res.ok) {
        const data = await res.json();
        setSugestoes((data.sugestoes as Sugestao[]) || []);
      } else {
        alert("Erro ao analisar avaliacoes");
      }
    } catch {
      alert("Erro de conexao");
    }
    setLoadingSugestoes(false);
  }

  useEffect(() => {
    if (aba === "sugestoes") carregarSugestoes(minAval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba]);

  async function aplicarSugestao(s: Sugestao) {
    const fatorPct = Math.round((s.fator_multiplicador - 1) * 10000) / 100;
    const direcao = fatorPct < 0 ? "REDUZIR" : "AUMENTAR";
    const msg =
      `Aplicar sugestao automatica como regra?\n\n` +
      `${s.qtd_avaliacoes} avaliacoes (${s.qtd_avaliadores_unicos} avaliador${s.qtd_avaliadores_unicos > 1 ? "es" : ""}) indicam ${direcao} ${Math.abs(fatorPct)}%\n\n` +
      `Veiculo: ${s.veiculo}\n` +
      `Zona: ${s.zona}\n` +
      `Faixa km: ${s.km_min}-${s.km_max}\n` +
      `Faixa itens: ${s.qtd_itens_min}-${s.qtd_itens_max}\n` +
      `Ajudante: ${s.com_ajudante ? "com" : "sem"}\n\n` +
      `Pegue medio: R$${s.preco_pegue_medio} -> Sugerido medio: R$${s.preco_sugerido_medio}\n` +
      `Concordancia: ${s.concordancia_pct}% | Desvio: ${s.gap_desvio_padrao}%\n\n` +
      `Vai afetar TODAS as cotacoes futuras compativeis com esses criterios.`;
    if (!confirm(msg)) return;
    const senha = sessionStorage.getItem("admin_key") || "";
    if (!senha) return;
    try {
      const res = await fetch(`/api/admin-sugestoes-ajuste?key=${encodeURIComponent(senha)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          veiculo: s.veiculo,
          zona: s.zona,
          km_min: s.km_min,
          km_max: s.km_max,
          qtd_itens_min: s.qtd_itens_min,
          qtd_itens_max: s.qtd_itens_max,
          com_ajudante: s.com_ajudante,
          fator_multiplicador: s.fator_multiplicador,
          descricao_extra: `Cluster ${s.qtd_avaliacoes} avaliacoes · concord ${s.concordancia_pct}% · gap medio ${s.gap_medio}%`,
        }),
      });
      if (res.ok) {
        loadData();
        setAba("regras");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Erro: ${err.error || res.status}`);
      }
    } catch {
      alert("Erro de conexao");
    }
  }

  async function toggleRegra(id: string, ativo: boolean) {
    const senha = sessionStorage.getItem("admin_key") || "";
    if (!senha) return;
    try {
      const res = await fetch(`/api/admin-feedback-precos?key=${encodeURIComponent(senha)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "toggle", id, ativo }),
      });
      if (res.ok) loadData();
      else alert("Erro ao alterar regra");
    } catch {
      alert("Erro de conexao");
    }
  }

  async function aplicarComoRegra(fb: Feedback) {
    const gap = fb.gap_percentual || 0;
    const fator = fb.preco_pegue > 0 ? fb.preco_sugerido / fb.preco_pegue : 1;
    const fatorPct = Math.round((fator - 1) * 10000) / 100;
    const msg =
      `Criar regra de ajuste a partir desse feedback?\n\n` +
      `Veiculo: ${fb.veiculo}\n` +
      `Rota: ${fb.origem} → ${fb.destino} (${fb.distancia_km}km, zona ${fb.zona})\n` +
      `Itens: ${fb.qtd_itens} · ${fb.tem_ajudante ? "com" : "sem"} ajudante\n\n` +
      `Pegue: R$${fb.preco_pegue} · Voce sugeriu: R$${fb.preco_sugerido}\n` +
      `Gap: ${gap > 0 ? "+" : ""}${gap}%\n` +
      `Fator multiplicador: ${fatorPct > 0 ? "+" : ""}${fatorPct}%\n\n` +
      `Vai afetar cotacoes futuras compativeis com esses criterios.`;
    if (!confirm(msg)) return;
    const senha = sessionStorage.getItem("admin_key") || "";
    if (!senha) return;
    try {
      const res = await fetch(`/api/admin-feedback-precos?key=${encodeURIComponent(senha)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "criar_regra_de_feedback", id: fb.id }),
      });
      if (res.ok) {
        loadData();
        setAba("regras");
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Erro ao criar regra: ${err.error || res.status}`);
      }
    } catch {
      alert("Erro de conexao");
    }
  }

  async function deletarRegra(id: string) {
    if (!confirm("Deletar essa regra de ajuste? Essa acao nao pode ser desfeita.")) return;
    const senha = sessionStorage.getItem("admin_key") || "";
    if (!senha) return;
    try {
      const res = await fetch(`/api/admin-feedback-precos?key=${encodeURIComponent(senha)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "deletar", id }),
      });
      if (res.ok) loadData();
      else alert("Erro ao deletar regra");
    } catch {
      alert("Erro de conexao");
    }
  }

  // Stats
  const total = feedbacks.length;
  const gaps = feedbacks.map(f => f.gap_percentual || 0);
  const gapMedio = total > 0 ? Math.round((gaps.reduce((a, b) => a + b, 0) / total) * 100) / 100 : 0;
  const fretistas = new Set(feedbacks.map(f => f.fretista_phone)).size;
  const regrasAtivas = regras.filter(r => r.ativo).length;

  const veiculoLabel: Record<string, string> = {
    utilitario: "Utilitário", hr: "HR", caminhao_bau: "Caminhão Baú", carro_comum: "Carro comum",
    guincho: "Guincho", moto_guincho: "Guincho moto",
  };
  const zonaLabel: Record<string, string> = {
    normal: "Normal", dificil: "Difícil", fundao: "Fundão",
  };

  if (erro) {
    return (
      <div className="mt-8 rounded-2xl bg-red-50 p-8 text-center">
        <p className="font-semibold text-red-600">{erro}</p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/admin" className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#C9A84C]">
        <ArrowLeft size={16} /> Voltar
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-extrabold text-[#0A0A0A]">Feedback de Preços</h1>
        <p className="text-sm text-gray-400">
          Fretistas avaliam os preços da Pegue via comando <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">AVALIAR</code> no WhatsApp
        </p>
      </div>

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat titulo="Total de avaliações" valor={String(total)} />
        <Stat titulo="Fretistas participantes" valor={String(fretistas)} />
        <Stat titulo="Gap médio" valor={`${gapMedio > 0 ? "+" : ""}${gapMedio}%`} cor={gapMedio > 5 ? "text-orange-600" : gapMedio < -5 ? "text-blue-600" : "text-green-600"} />
        <Stat titulo="Regras ativas" valor={`${regrasAtivas} / ${regras.length}`} cor="text-[#C9A84C]" />
      </div>

      {/* Abas */}
      <div className="mt-8 border-b border-gray-200">
        <div className="flex gap-4">
          <button
            onClick={() => setAba("feedbacks")}
            className={`pb-3 px-1 text-sm font-semibold border-b-2 ${aba === "feedbacks" ? "border-[#C9A84C] text-[#C9A84C]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            Feedbacks ({feedbacks.length})
          </button>
          <button
            onClick={() => setAba("sugestoes")}
            className={`pb-3 px-1 text-sm font-semibold border-b-2 flex items-center gap-1 ${aba === "sugestoes" ? "border-[#C9A84C] text-[#C9A84C]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            <Sparkles size={14} /> Sugestoes automaticas
          </button>
          <button
            onClick={() => setAba("regras")}
            className={`pb-3 px-1 text-sm font-semibold border-b-2 ${aba === "regras" ? "border-[#C9A84C] text-[#C9A84C]" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            Regras de ajuste ({regras.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 text-center text-gray-400">Carregando...</div>
      ) : aba === "feedbacks" ? (
        feedbacks.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-white p-12 text-center shadow-sm">
            <p className="text-gray-500">Nenhuma avaliação ainda</p>
            <p className="mt-2 text-xs text-gray-400">
              Peça aos fretistas pra digitarem <code className="bg-gray-100 px-1.5 py-0.5 rounded">AVALIAR</code> no WhatsApp da Pegue
            </p>
          </div>
        ) : (
          <>
            {/* Filtros */}
            <div className="mt-4 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
              <input
                type="text"
                placeholder="Buscar por avaliador, rota, item..."
                value={filtroBusca}
                onChange={(e) => setFiltroBusca(e.target.value)}
                className="flex-1 min-w-[200px] rounded border border-gray-200 px-3 py-1.5 text-sm"
              />
              <select
                value={filtroVeiculo}
                onChange={(e) => setFiltroVeiculo(e.target.value)}
                className="rounded border border-gray-200 px-2 py-1.5 text-sm"
              >
                <option value="todos">Todos veiculos</option>
                <option value="carro_comum">Carro comum</option>
                <option value="utilitario">Utilitario</option>
                <option value="hr">HR</option>
                <option value="caminhao_bau">Caminhao Bau</option>
                <option value="guincho">Guincho</option>
              </select>
              <select
                value={filtroGap}
                onChange={(e) => setFiltroGap(e.target.value as any)}
                className="rounded border border-gray-200 px-2 py-1.5 text-sm"
              >
                <option value="todos">Todos gaps</option>
                <option value="alto">Pegue cobra MENOS (gap +5%)</option>
                <option value="baixo">Pegue cobra MAIS (gap -5%)</option>
                <option value="ok">Gap ok (+/- 5%)</option>
              </select>
              {(filtroBusca || filtroVeiculo !== "todos" || filtroGap !== "todos") && (
                <button
                  onClick={() => { setFiltroBusca(""); setFiltroVeiculo("todos"); setFiltroGap("todos"); }}
                  className="text-xs text-gray-500 hover:text-[#C9A84C]"
                >
                  Limpar filtros
                </button>
              )}
            </div>
            <div className="space-y-3">
            {feedbacks
              .filter((f) => {
                // Filtro veiculo
                if (filtroVeiculo !== "todos" && f.veiculo !== filtroVeiculo) return false;
                // Filtro gap
                const gap = f.gap_percentual || 0;
                if (filtroGap === "alto" && gap < 5) return false;
                if (filtroGap === "baixo" && gap > -5) return false;
                if (filtroGap === "ok" && Math.abs(gap) >= 5) return false;
                // Filtro busca (nome avaliador, origem, destino, itens)
                if (filtroBusca.trim()) {
                  const q = filtroBusca.toLowerCase();
                  const hay = [
                    f.fretista_nome || "",
                    f.fretista_phone || "",
                    f.origem || "",
                    f.destino || "",
                    f.itens || "",
                  ].join(" ").toLowerCase();
                  if (!hay.includes(q)) return false;
                }
                return true;
              })
              .map(f => {
              const gap = f.gap_percentual || 0;
              const corGap = gap > 10 ? "text-orange-600" : gap < -10 ? "text-blue-600" : "text-green-600";
              const IconeGap = gap > 5 ? TrendingUp : gap < -5 ? TrendingDown : Minus;
              return (
                <div key={f.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-[#C9A84C]">{veiculoLabel[f.veiculo] || f.veiculo}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-700">{f.origem} → {f.destino}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500">{f.distancia_km}km · {zonaLabel[f.zona] || f.zona}</span>
                        {f.tem_ajudante && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">com ajudante</span>}
                      </div>
                      <p className="mt-1 text-sm text-gray-700">{f.itens}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        👤 {f.fretista_nome || f.fretista_phone} · {new Date(f.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <p className="text-xs text-gray-500">Pegue: <strong className="text-gray-700">R$ {f.preco_pegue}</strong></p>
                      <p className="text-xs text-gray-500">Sugerido: <strong className="text-[#C9A84C]">R$ {f.preco_sugerido}</strong></p>
                      <p className={`flex items-center justify-end gap-1 text-sm font-bold ${corGap}`}>
                        <IconeGap size={14} />
                        {gap > 0 ? "+" : ""}{gap}%
                      </p>
                      {Math.abs(gap) >= 5 && (
                        <button
                          onClick={() => aplicarComoRegra(f)}
                          className="mt-1 inline-flex items-center gap-1 rounded-lg border border-[#C9A84C] bg-[#C9A84C]/10 px-2 py-1 text-xs font-semibold text-[#C9A84C] hover:bg-[#C9A84C] hover:text-white transition"
                          title="Criar regra de ajuste de preco a partir desse feedback"
                        >
                          <Wand2 size={12} /> Aplicar como regra
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </>
        )
      ) : aba === "sugestoes" ? (
        <div>
          <div className="mt-4 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
            <Sparkles size={16} className="text-[#C9A84C]" />
            <span className="text-xs text-gray-600">
              Sistema agrupa avaliacoes por veiculo + zona + faixa km + faixa itens + ajudante. So sugere clusters com gap medio &gt;= 5% e concordancia &gt;= 70%.
            </span>
            <div className="ml-auto flex items-center gap-2 text-xs">
              <label>Min avaliacoes por cluster:</label>
              <select
                value={minAval}
                onChange={(e) => { const v = Number(e.target.value); setMinAval(v); carregarSugestoes(v); }}
                className="rounded border border-gray-200 px-2 py-1"
              >
                <option value={2}>2</option>
                <option value={3}>3 (recomendado)</option>
                <option value={4}>4</option>
                <option value={5}>5</option>
              </select>
              <button
                onClick={() => carregarSugestoes(minAval)}
                disabled={loadingSugestoes}
                className="rounded bg-[#C9A84C] px-3 py-1 text-white font-semibold disabled:opacity-50"
              >
                {loadingSugestoes ? "Analisando..." : "Reanalisar"}
              </button>
            </div>
          </div>

          {loadingSugestoes ? (
            <div className="mt-8 text-center text-gray-400">Analisando avaliacoes...</div>
          ) : sugestoes.length === 0 ? (
            <div className="mt-8 rounded-2xl bg-white p-12 text-center shadow-sm">
              <p className="text-gray-500">Nenhum cluster de sugestao encontrado.</p>
              <p className="mt-2 text-xs text-gray-400">
                Continue avaliando — a partir de {minAval}+ avaliacoes em condicoes similares com concordancia &gt;= 70%, sugestoes aparecerao aqui.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {sugestoes.map((s, idx) => {
                const fatorPct = Math.round((s.fator_multiplicador - 1) * 10000) / 100;
                const corFator = fatorPct < -10 ? "text-blue-700" : fatorPct < 0 ? "text-blue-500" : fatorPct > 10 ? "text-orange-700" : "text-orange-500";
                const direcao = fatorPct < 0 ? "REDUZIR" : "AUMENTAR";
                return (
                  <div key={idx} className="rounded-xl border-2 border-[#C9A84C]/30 bg-gradient-to-br from-[#C9A84C]/5 to-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="rounded-full bg-[#C9A84C] px-3 py-1 text-xs font-bold text-white">
                            {direcao} {Math.abs(fatorPct)}%
                          </span>
                          <span className="text-sm font-bold text-gray-800">
                            {veiculoLabel[s.veiculo] || s.veiculo} · {zonaLabel[s.zona] || s.zona}
                          </span>
                          <span className="text-xs text-gray-500">
                            {s.faixa_km_label} · {s.faixa_itens_label} · {s.com_ajudante ? "com ajud" : "sem ajud"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div>
                            <p className="text-gray-500">Avaliacoes</p>
                            <p className="font-bold text-gray-800">{s.qtd_avaliacoes}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Concordancia</p>
                            <p className="font-bold text-gray-800">{s.concordancia_pct}%</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Gap medio</p>
                            <p className={`font-bold ${corFator}`}>{s.gap_medio > 0 ? "+" : ""}{s.gap_medio}%</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Desvio</p>
                            <p className="font-bold text-gray-800">±{s.gap_desvio_padrao}%</p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
                          <span>Pegue medio: <strong>R${s.preco_pegue_medio}</strong></span>
                          <span>→</span>
                          <span>Sugerido medio: <strong className="text-[#C9A84C]">R${s.preco_sugerido_medio}</strong></span>
                        </div>
                        {s.avaliadores.length > 0 && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                            <Users size={12} />
                            <span>
                              {s.avaliadores.map((a) => `${a.nome} (${a.qtd})`).join(", ")}
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => aplicarSugestao(s)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#C9A84C] px-3 py-2 text-sm font-bold text-white hover:opacity-90"
                      >
                        <Wand2 size={14} /> Aplicar como regra
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        regras.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-white p-12 text-center shadow-sm">
            <p className="text-gray-500">Nenhuma regra de ajuste criada ainda</p>
            <p className="mt-2 text-xs text-gray-400">
              Use o comando <code className="bg-gray-100 px-1.5 py-0.5 rounded">AVALIAR</code> no WhatsApp (só você tem permissão) e aceite aplicar quando uma simulação estiver fora do mercado.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {regras.map(r => {
              const fatorPct = Math.round((r.fator_multiplicador - 1) * 10000) / 100;
              return (
                <div key={r.id} className={`rounded-xl border p-4 shadow-sm ${r.ativo ? "border-green-200 bg-white" : "border-gray-200 bg-gray-50 opacity-60"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-bold ${r.ativo ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                          {r.ativo ? "ATIVA" : "PAUSADA"}
                        </span>
                        <span className="font-bold text-[#C9A84C]">
                          {fatorPct > 0 ? "+" : ""}{fatorPct}% {r.valor_fixo !== 0 ? `(+R$ ${r.valor_fixo} fixo)` : ""}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-gray-700">
                        {r.veiculo && <span>🚚 <strong>{veiculoLabel[r.veiculo] || r.veiculo}</strong> · </span>}
                        {r.zona && <span>Zona <strong>{zonaLabel[r.zona] || r.zona}</strong> · </span>}
                        {(r.km_min !== null || r.km_max !== null) && (
                          <span>📏 <strong>{r.km_min ?? 0}-{r.km_max ?? "∞"}km</strong> · </span>
                        )}
                        {(r.qtd_itens_min !== null || r.qtd_itens_max !== null) && (
                          <span>📦 <strong>{r.qtd_itens_min ?? 0}-{r.qtd_itens_max ?? "∞"} itens</strong> · </span>
                        )}
                        {r.com_ajudante !== null && <span>🙋 <strong>{r.com_ajudante ? "Com" : "Sem"}</strong> ajudante</span>}
                      </div>
                      {r.descricao && <p className="mt-1 text-xs italic text-gray-500">{r.descricao}</p>}
                      <p className="mt-1 text-xs text-gray-400">Criada em {new Date(r.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleRegra(r.id, r.ativo)}
                        className="rounded-lg border border-gray-200 p-2 hover:border-[#C9A84C] hover:text-[#C9A84C]"
                        title={r.ativo ? "Pausar regra" : "Reativar regra"}
                      >
                        <Power size={14} />
                      </button>
                      <button
                        onClick={() => deletarRegra(r.id)}
                        className="rounded-lg border border-red-100 p-2 text-red-500 hover:bg-red-50"
                        title="Deletar regra"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function Stat({ titulo, valor, cor = "text-gray-900" }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-extrabold ${cor}`}>{valor}</p>
    </div>
  );
}
