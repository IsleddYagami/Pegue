"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Power } from "lucide-react";

type Veiculo = {
  id: string;
  tipo: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  placa: string;
  capacidade_kg: number | null;
  ativo: boolean;
  criado_em: string;
};

const TIPOS_DISPONIVEIS = [
  { value: "carro_comum", label: "Carro comum" },
  { value: "utilitario", label: "Utilitário (Strada/Saveiro)" },
  { value: "hr", label: "HR (Hyundai/Bongo)" },
  { value: "caminhao_bau", label: "Caminhão baú" },
  { value: "guincho", label: "Guincho (plataforma)" },
  { value: "moto_guincho", label: "Guincho de moto" },
];

function VeiculosContent() {
  const searchParams = useSearchParams();
  const prestadorId = searchParams.get("prestador_id");
  const prestadorNome = searchParams.get("nome") || "Prestador";

  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminKey, setAdminKey] = useState<string>("");
  const [erro, setErro] = useState("");

  const [novoTipo, setNovoTipo] = useState("utilitario");
  const [novaPlaca, setNovaPlaca] = useState("");
  const [novaMarca, setNovaMarca] = useState("");
  const [novoModelo, setNovoModelo] = useState("");
  const [novoAno, setNovoAno] = useState<string>("");
  const [salvando, setSalvando] = useState(false);

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
  }, [prestadorId]);

  async function carregar(key: string) {
    if (!prestadorId) {
      setErro("prestador_id nao informado na URL");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro("");
    try {
      const r = await fetch(`/api/admin-prestador-veiculo?prestador_id=${prestadorId}&key=${encodeURIComponent(key)}`);
      if (!r.ok) {
        setErro(`Erro: ${r.status}`);
        setLoading(false);
        return;
      }
      const j = await r.json();
      setVeiculos(j.veiculos || []);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar");
    }
    setLoading(false);
  }

  async function adicionarVeiculo() {
    if (!novaPlaca.trim()) {
      alert("Informe a placa");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch("/api/admin-prestador-veiculo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: adminKey,
          prestador_id: prestadorId,
          tipo: novoTipo,
          placa: novaPlaca.trim(),
          marca: novaMarca.trim() || undefined,
          modelo: novoModelo.trim() || undefined,
          ano: novoAno ? parseInt(novoAno, 10) : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(`Erro: ${j.error || r.status}`);
        setSalvando(false);
        return;
      }
      // Limpa form e recarrega
      setNovaPlaca("");
      setNovaMarca("");
      setNovoModelo("");
      setNovoAno("");
      await carregar(adminKey);
    } catch (e: any) {
      alert(`Erro: ${e?.message}`);
    }
    setSalvando(false);
  }

  async function toggleVeiculo(id: string, ativoAtual: boolean) {
    const acao = ativoAtual ? "desativar" : "reativar";
    if (!confirm(`${acao[0].toUpperCase() + acao.slice(1)} esse veículo?`)) return;
    const r = await fetch("/api/admin-prestador-veiculo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: adminKey, veiculo_id: id, ativo: !ativoAtual }),
    });
    if (!r.ok) {
      const j = await r.json();
      alert(`Erro: ${j.error || r.status}`);
      return;
    }
    carregar(adminKey);
  }

  async function deletarVeiculo(id: string) {
    if (!confirm("Deletar permanentemente esse veículo? Esta ação não pode ser desfeita.")) return;
    const r = await fetch(`/api/admin-prestador-veiculo?veiculo_id=${id}&key=${encodeURIComponent(adminKey)}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      const j = await r.json();
      alert(`Erro: ${j.error || r.status}`);
      return;
    }
    carregar(adminKey);
  }

  if (loading) {
    return <div className="p-8 text-white">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/admin/prestadores" className="flex items-center gap-2 text-[#C9A84C] mb-4 hover:underline">
          <ArrowLeft size={20} /> Voltar para prestadores
        </Link>

        <h1 className="text-2xl md:text-3xl font-bold mb-2">Veículos de {prestadorNome}</h1>
        <p className="text-gray-400 mb-8">
          Gerencie os veículos que este prestador pode usar pra receber fretes.
        </p>

        {erro && (
          <div className="bg-red-900/40 border border-red-500/40 text-red-200 p-4 rounded mb-6">
            {erro}
          </div>
        )}

        {/* Form adicionar */}
        <div className="bg-neutral-900 border border-[#C9A84C]/20 rounded-lg p-5 mb-8">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Plus size={20} className="text-[#C9A84C]" />
            Adicionar novo veículo
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Tipo *</label>
              <select
                value={novoTipo}
                onChange={(e) => setNovoTipo(e.target.value)}
                className="w-full bg-black border border-neutral-700 rounded px-3 py-2"
              >
                {TIPOS_DISPONIVEIS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Placa *</label>
              <input
                value={novaPlaca}
                onChange={(e) => setNovaPlaca(e.target.value.toUpperCase())}
                placeholder="ABC1234 ou ABC1D23"
                className="w-full bg-black border border-neutral-700 rounded px-3 py-2"
                maxLength={10}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Marca</label>
              <input
                value={novaMarca}
                onChange={(e) => setNovaMarca(e.target.value)}
                placeholder="Ex: Fiat, Hyundai"
                className="w-full bg-black border border-neutral-700 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Modelo</label>
              <input
                value={novoModelo}
                onChange={(e) => setNovoModelo(e.target.value)}
                placeholder="Ex: Strada, HR"
                className="w-full bg-black border border-neutral-700 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Ano</label>
              <input
                type="number"
                value={novoAno}
                onChange={(e) => setNovoAno(e.target.value)}
                placeholder="Ex: 2020"
                className="w-full bg-black border border-neutral-700 rounded px-3 py-2"
                min={1990}
                max={new Date().getFullYear() + 1}
              />
            </div>
          </div>
          <button
            onClick={adicionarVeiculo}
            disabled={salvando}
            className="mt-4 flex items-center gap-2 bg-[#C9A84C] text-black px-5 py-2 rounded font-bold hover:scale-105 transition-all disabled:opacity-50"
          >
            <Plus size={18} />
            {salvando ? "Salvando..." : "Adicionar veículo"}
          </button>
        </div>

        {/* Lista */}
        <h2 className="text-lg font-bold mb-4">
          Veículos cadastrados ({veiculos.length})
        </h2>
        {veiculos.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhum veículo cadastrado ainda.</p>
        ) : (
          <div className="space-y-3">
            {veiculos.map((v) => (
              <div
                key={v.id}
                className={`border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${
                  v.ativo ? "bg-neutral-900 border-[#C9A84C]/20" : "bg-neutral-900/50 border-neutral-800 opacity-60"
                }`}
              >
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-bold text-[#C9A84C]">
                      {TIPOS_DISPONIVEIS.find((t) => t.value === v.tipo)?.label || v.tipo}
                    </span>
                    <span className="text-sm font-mono bg-black/50 px-2 py-0.5 rounded">
                      {v.placa}
                    </span>
                    {!v.ativo && (
                      <span className="text-xs bg-red-900/40 text-red-300 px-2 py-0.5 rounded">
                        Inativo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {[v.marca, v.modelo, v.ano ? `(${v.ano})` : ""].filter(Boolean).join(" ") || "Sem detalhes"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleVeiculo(v.id, v.ativo)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold ${
                      v.ativo
                        ? "bg-yellow-700 hover:bg-yellow-600"
                        : "bg-green-700 hover:bg-green-600"
                    }`}
                  >
                    <Power size={14} />
                    {v.ativo ? "Desativar" : "Reativar"}
                  </button>
                  <button
                    onClick={() => deletarVeiculo(v.id)}
                    className="flex items-center gap-1 bg-red-800 hover:bg-red-700 px-3 py-1.5 rounded text-xs font-semibold"
                  >
                    <Trash2 size={14} /> Apagar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VeiculosPage() {
  return (
    <Suspense fallback={<div className="p-8 text-white">Carregando...</div>}>
      <VeiculosContent />
    </Suspense>
  );
}
