"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Trash2, Power } from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"feedbacks" | "regras">("feedbacks");

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
          <div className="mt-4 space-y-3">
            {feedbacks.map(f => {
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
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Pegue: <strong className="text-gray-700">R$ {f.preco_pegue}</strong></p>
                      <p className="text-xs text-gray-500">Sugerido: <strong className="text-[#C9A84C]">R$ {f.preco_sugerido}</strong></p>
                      <p className={`mt-1 flex items-center justify-end gap-1 text-sm font-bold ${corGap}`}>
                        <IconeGap size={14} />
                        {gap > 0 ? "+" : ""}{gap}%
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
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
