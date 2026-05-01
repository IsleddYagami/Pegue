"use client";
import { fetchComTimeout } from "@/lib/fetch-utils";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, XCircle, Edit3 } from "lucide-react";

type Sessao = {
  phone: string;
  step: string;
  atualizado_em: string;
  origem_endereco: string | null;
  destino_endereco: string | null;
  descricao_carga: string | null;
  veiculo_sugerido: string | null;
  valor_estimado: number | null;
  distancia_km: number | null;
  data_agendada: string | null;
  periodo: string | null;
};

export default function RevisaoPrecosPage() {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminKey, setAdminKey] = useState<string>("");
  const [erro, setErro] = useState<string>("");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? sessionStorage.getItem("pegue_admin_key") : null;
    if (saved) {
      setAdminKey(saved);
      carregar(saved);
    } else {
      const k = prompt("Chave admin:");
      if (k) {
        sessionStorage.setItem("pegue_admin_key", k);
        setAdminKey(k);
        carregar(k);
      } else {
        setLoading(false);
        setErro("Acesso negado");
      }
    }
  }, []);

  async function carregar(key: string) {
    setLoading(true);
    setErro("");
    try {
      const r = await fetchComTimeout(`/api/admin-revisao-precos?key=${encodeURIComponent(key)}`);
      if (!r.ok) {
        setErro(`Erro: ${r.status} - verifique a chave admin`);
        setLoading(false);
        return;
      }
      const j = await r.json();
      setSessoes(j.sessoes || []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar");
    }
    setLoading(false);
  }

  async function aprovar(phone: string) {
    if (!confirm(`Aprovar cotação do cliente ${phone}? Cliente recebe o resumo pra confirmar.`)) return;
    const r = await fetchComTimeout("/api/admin-revisao-precos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, acao: "aprovar", key: adminKey }),
    });
    const j = await r.json();
    if (!r.ok) {
      alert(`Erro: ${j.error || r.status}`);
      return;
    }
    alert("Aprovada! Cliente recebeu o resumo.");
    carregar(adminKey);
  }

  async function ajustar(phone: string, valorAtual: number | null) {
    const entrada = prompt(
      `Novo valor para a cotação (R$):\n\nValor atual calculado: R$ ${valorAtual || 0}\n\nDigite só o número, ex: 250`,
      valorAtual ? String(valorAtual) : ""
    );
    if (!entrada) return;
    const valor = Number(entrada.replace(",", "."));
    if (isNaN(valor) || valor <= 0) {
      alert("Valor inválido");
      return;
    }
    const r = await fetchComTimeout("/api/admin-revisao-precos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, acao: "ajustar", valor_novo: valor }),
    });
    const j = await r.json();
    if (!r.ok) {
      alert(`Erro: ${j.error || r.status}`);
      return;
    }
    alert(`Ajustado pra R$ ${valor.toFixed(2)}. Cliente recebeu o novo resumo.`);
    carregar(adminKey);
  }

  async function rejeitar(phone: string) {
    const motivo = prompt(
      "Motivo do rejeite (opcional) — será enviado ao cliente:",
      "Infelizmente não conseguimos atender esse frete neste momento."
    );
    if (motivo === null) return; // cancelou
    if (!confirm(`Rejeitar cotação do cliente ${phone}?`)) return;
    const r = await fetchComTimeout("/api/admin-revisao-precos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, acao: "rejeitar", motivo }),
    });
    const j = await r.json();
    if (!r.ok) {
      alert(`Erro: ${j.error || r.status}`);
      return;
    }
    alert("Rejeitada. Cliente foi notificado.");
    carregar(adminKey);
  }

  function fmtTempo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "agora";
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    return `${h}h ${min % 60}min`;
  }

  if (loading) {
    return <div className="p-8 text-white">Carregando...</div>;
  }

  if (erro) {
    return (
      <div className="p-8 text-white min-h-screen bg-black">
        <Link href="/admin" className="flex items-center gap-2 text-[#C9A84C] mb-4">
          <ArrowLeft size={20} /> Voltar ao admin
        </Link>
        <div className="bg-red-900/40 border border-red-500/40 text-red-200 p-4 rounded">{erro}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <Link href="/admin" className="flex items-center gap-2 text-[#C9A84C] mb-4 hover:underline">
          <ArrowLeft size={20} /> Voltar ao admin
        </Link>

        <h1 className="text-2xl md:text-3xl font-bold mb-2">Revisão de Preços</h1>
        <p className="text-gray-400 mb-8">
          Cotações que foram bloqueadas pelo sistema anti-erro e precisam da sua decisão manual.
        </p>

        {sessoes.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-8 text-center text-gray-400">
            ✅ Nenhuma cotação em revisão no momento.
          </div>
        ) : (
          <div className="space-y-4">
            {sessoes.map((s) => (
              <div key={s.phone} className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-4">
                  <div>
                    <div className="text-xs text-gray-500">Cliente</div>
                    <div className="text-base font-semibold">
                      <a
                        href={`https://wa.me/${s.phone}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#C9A84C] hover:underline"
                      >
                        {s.phone}
                      </a>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Em revisão há {fmtTempo(s.atualizado_em)}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">📍 Retirada</div>
                    <div>{s.origem_endereco || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">🏠 Entrega</div>
                    <div>{s.destino_endereco || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">📦 Material</div>
                    <div>{s.descricao_carga || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">🚚 Veículo</div>
                    <div>{s.veiculo_sugerido || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">📏 Distância</div>
                    <div>{s.distancia_km ? `${s.distancia_km} km` : "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">📅 Data/Horário</div>
                    <div>{s.data_agendada || s.periodo || "A combinar"}</div>
                  </div>
                </div>

                <div className="bg-neutral-800 rounded p-3 mb-4 flex items-center justify-between">
                  <div className="text-xs text-gray-500">Valor calculado (bloqueado)</div>
                  <div className="text-xl font-bold text-[#C9A84C]">
                    R$ {(s.valor_estimado || 0).toFixed(2).replace(".", ",")}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => aprovar(s.phone)}
                    className="flex items-center gap-2 bg-green-700 hover:bg-green-600 px-4 py-2 rounded font-semibold text-sm"
                  >
                    <CheckCircle size={16} /> Aprovar (enviar resumo)
                  </button>
                  <button
                    onClick={() => ajustar(s.phone, s.valor_estimado)}
                    className="flex items-center gap-2 bg-yellow-700 hover:bg-yellow-600 px-4 py-2 rounded font-semibold text-sm"
                  >
                    <Edit3 size={16} /> Ajustar valor
                  </button>
                  <button
                    onClick={() => rejeitar(s.phone)}
                    className="flex items-center gap-2 bg-red-800 hover:bg-red-700 px-4 py-2 rounded font-semibold text-sm"
                  >
                    <XCircle size={16} /> Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <button
            onClick={() => carregar(adminKey)}
            className="text-[#C9A84C] hover:underline text-sm"
          >
            🔄 Atualizar lista
          </button>
        </div>
      </div>
    </div>
  );
}
