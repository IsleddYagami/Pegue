"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Feedback = {
  id: string;
  veiculo: string;
  itens: string;
  qtd_itens: number;
  distancia_km: number;
  tem_ajudante: boolean;
  zona: string;
  preco_calculado: number;
  opiniao: "barato" | "justo" | "caro";
  fretista_nome: string | null;
  fretista_telefone: string | null;
  comentario: string | null;
  criado_em: string;
};

export default function FeedbackPrecosPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroOpiniao, setFiltroOpiniao] = useState<string>("todos");
  const [filtroVeiculo, setFiltroVeiculo] = useState<string>("todos");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("feedback_precos")
        .select("*")
        .order("criado_em", { ascending: false });
      if (data) setFeedbacks(data as Feedback[]);
      setLoading(false);
    }
    load();
  }, []);

  const filtrados = feedbacks.filter(f => {
    if (filtroOpiniao !== "todos" && f.opiniao !== filtroOpiniao) return false;
    if (filtroVeiculo !== "todos" && f.veiculo !== filtroVeiculo) return false;
    return true;
  });

  const totais = {
    caro: feedbacks.filter(f => f.opiniao === "caro").length,
    justo: feedbacks.filter(f => f.opiniao === "justo").length,
    barato: feedbacks.filter(f => f.opiniao === "barato").length,
  };
  const total = feedbacks.length;
  const pctCaro = total > 0 ? Math.round((totais.caro / total) * 100) : 0;
  const pctJusto = total > 0 ? Math.round((totais.justo / total) * 100) : 0;
  const pctBarato = total > 0 ? Math.round((totais.barato / total) * 100) : 0;

  const opiniaoCor: Record<string, string> = {
    caro: "bg-red-100 text-red-700",
    justo: "bg-green-100 text-green-700",
    barato: "bg-yellow-100 text-yellow-700",
  };

  return (
    <div>
      <Link href="/admin" className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#C9A84C]">
        <ArrowLeft size={16} /> Voltar
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0A0A0A]">Feedback de Preços</h1>
          <p className="text-sm text-gray-400">
            O que os fretistas acham dos precos. Link publico: <code className="text-xs bg-gray-100 px-2 py-1 rounded">chamepegue.com.br/precos</code>
          </p>
        </div>
      </div>

      {/* Resumo estatistico */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat titulo="Total de avaliacoes" valor={String(total)} />
        <Stat titulo="😡 Tá caro" valor={`${totais.caro} (${pctCaro}%)`} cor="text-red-600" />
        <Stat titulo="🙂 Tá justo" valor={`${totais.justo} (${pctJusto}%)`} cor="text-green-600" />
        <Stat titulo="😐 Tá barato" valor={`${totais.barato} (${pctBarato}%)`} cor="text-yellow-600" />
      </div>

      {/* Filtros */}
      <div className="mt-6 flex flex-wrap gap-3">
        <select value={filtroOpiniao} onChange={e => setFiltroOpiniao(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="todos">Todas as opinioes</option>
          <option value="caro">Só "Tá caro"</option>
          <option value="justo">Só "Tá justo"</option>
          <option value="barato">Só "Tá barato"</option>
        </select>
        <select value={filtroVeiculo} onChange={e => setFiltroVeiculo(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
          <option value="todos">Todos os veiculos</option>
          <option value="utilitario">Utilitario</option>
          <option value="hr">HR</option>
        </select>
      </div>

      {loading ? (
        <div className="mt-8 text-center text-gray-400">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white p-12 text-center shadow-sm">
          <p className="text-gray-500">Nenhuma avaliacao ainda</p>
          <p className="mt-2 text-xs text-gray-400">Compartilhe o link <code>chamepegue.com.br/precos</code> com os fretistas pra eles avaliarem</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {filtrados.map(f => (
            <div key={f.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${opiniaoCor[f.opiniao]}`}>
                      {f.opiniao === "caro" ? "😡 CARO" : f.opiniao === "justo" ? "🙂 JUSTO" : "😐 BARATO"}
                    </span>
                    <span className="text-xs font-bold text-[#C9A84C]">{f.veiculo === "hr" ? "HR" : "Utilitario"}</span>
                    <span className="text-xs text-gray-500">R$ {f.preco_calculado}</span>
                    {f.tem_ajudante && <span className="text-xs text-blue-600">com ajudante</span>}
                  </div>
                  <p className="mt-2 text-sm text-gray-700">{f.itens}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {f.distancia_km} km · Zona {f.zona} · {new Date(f.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                  {(f.fretista_nome || f.fretista_telefone) && (
                    <p className="mt-1 text-xs text-gray-600">
                      👤 {f.fretista_nome || "-"} {f.fretista_telefone && `· ${f.fretista_telefone}`}
                    </p>
                  )}
                  {f.comentario && (
                    <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs italic text-gray-600">
                      "{f.comentario}"
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
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
