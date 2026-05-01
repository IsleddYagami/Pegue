"use client";
import { fetchComTimeout } from "@/lib/fetch-utils";

import { useEffect, useState } from "react";
import { Save, DollarSign, Truck, Users, Clock, Loader2 } from "lucide-react";
import type { TabelaPrecos } from "@/lib/types";

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

export default function ConfigPage() {
  const [precos, setPrecos] = useState<TabelaPrecos | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const senha = getAdminKey();
      if (!senha) {
        setErro("Senha de admin obrigatoria");
        setLoading(false);
        return;
      }
      try {
        const res = await fetchComTimeout(`/api/admin-tabela-precos?key=${encodeURIComponent(senha)}`);
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
        setPrecos(data as TabelaPrecos);
      } catch {
        setErro("Erro de conexao");
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    if (!precos) return;
    const senha = sessionStorage.getItem("admin_key") || "";
    if (!senha) return;
    setSalvando(true);
    try {
      const res = await fetchComTimeout(`/api/admin-tabela-precos?key=${encodeURIComponent(senha)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: precos.id,
          preco_base_km: precos.preco_base_km,
          km_minimo: precos.km_minimo,
          valor_minimo: precos.valor_minimo,
          mult_utilitario: precos.mult_utilitario,
          mult_van: precos.mult_van,
          mult_caminhao_bau: precos.mult_caminhao_bau,
          mult_caminhao_grande: precos.mult_caminhao_grande,
          adicional_ajudante: precos.adicional_ajudante,
          adicional_andar_escada: precos.adicional_andar_escada,
          mult_urgente: precos.mult_urgente,
          mult_economica: precos.mult_economica,
          mult_padrao: precos.mult_padrao,
          mult_premium: precos.mult_premium,
          comissao_percentual: precos.comissao_percentual,
        }),
      });
      if (!res.ok) {
        alert("Erro ao salvar");
        setSalvando(false);
        return;
      }
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
    } catch {
      alert("Erro de conexao");
    }
    setSalvando(false);
  }

  function updateField(field: keyof TabelaPrecos, value: number) {
    if (!precos) return;
    setPrecos({ ...precos, [field]: value });
  }

  // BUG legado caçado pelo lint react-compiler em 1/Mai/2026: InputField
  // estava declarado DENTRO do componente AdminConfigPage. Cada render do
  // pai criava nova instancia do componente filho — perda de estado em
  // cada digitacao. Renomeado pra renderInputField (helper de render, nao
  // componente), eliminando o problema sem refator estrutural.
  const renderInputField = (label: string, field: keyof TabelaPrecos, opts?: { prefix?: string; suffix?: string }) => (
    <div key={field}>
      <label className="mb-1 block text-sm font-medium text-gray-600">{label}</label>
      <div className="flex items-center gap-1">
        {opts?.prefix && <span className="text-sm text-gray-400">{opts.prefix}</span>}
        <input
          type="number"
          step="0.01"
          value={precos ? (precos[field] as number) : 0}
          onChange={(e) => updateField(field, parseFloat(e.target.value) || 0)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C9A84C] focus:outline-none"
        />
        {opts?.suffix && <span className="text-sm text-gray-400">{opts.suffix}</span>}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#C9A84C] border-t-transparent" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="mt-8 rounded-2xl bg-red-50 p-8 text-center">
        <p className="font-semibold text-red-600">{erro}</p>
      </div>
    );
  }

  if (!precos) {
    return <div className="p-8 text-center text-gray-400">Tabela de precos nao encontrada</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0A0A0A]">Configuracoes</h1>
          <p className="text-sm text-gray-400">Tabela de precos: {precos.nome}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={salvando}
          className="flex items-center gap-2 rounded-xl bg-[#C9A84C] px-5 py-3 text-sm font-bold text-[#0A0A0A] transition-transform hover:scale-105 disabled:opacity-50"
        >
          {salvando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {salvo ? "Salvo!" : salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="flex items-center gap-2 text-base font-bold text-[#0A0A0A]">
            <DollarSign size={18} className="text-[#C9A84C]" /> Preco Base
          </h3>
          <div className="mt-4 space-y-3">
            {renderInputField("Preco por km", "preco_base_km", { prefix: "R$" })}
            {renderInputField("Km minimo cobrado", "km_minimo", { suffix: "km" })}
            {renderInputField("Valor minimo da corrida", "valor_minimo", { prefix: "R$" })}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="flex items-center gap-2 text-base font-bold text-[#0A0A0A]">
            <Truck size={18} className="text-[#C9A84C]" /> Multiplicadores de Veiculo
          </h3>
          <div className="mt-4 space-y-3">
            {renderInputField("Utilitario", "mult_utilitario", { suffix: "x" })}
            {renderInputField("Van", "mult_van", { suffix: "x" })}
            {renderInputField("Caminhao Bau", "mult_caminhao_bau", { suffix: "x" })}
            {renderInputField("Caminhao Grande", "mult_caminhao_grande", { suffix: "x" })}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="flex items-center gap-2 text-base font-bold text-[#0A0A0A]">
            <Users size={18} className="text-[#C9A84C]" /> Adicionais
          </h3>
          <div className="mt-4 space-y-3">
            {renderInputField("Adicional por ajudante", "adicional_ajudante", { prefix: "R$" })}
            {renderInputField("Adicional por andar (escada)", "adicional_andar_escada", { prefix: "R$" })}
            {renderInputField("Multiplicador urgente", "mult_urgente", { suffix: "x" })}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="flex items-center gap-2 text-base font-bold text-[#0A0A0A]">
            <Clock size={18} className="text-[#C9A84C]" /> Planos e Comissao
          </h3>
          <div className="mt-4 space-y-3">
            {renderInputField("Multiplicador Economica", "mult_economica", { suffix: "x" })}
            {renderInputField("Multiplicador Padrao", "mult_padrao", { suffix: "x" })}
            {renderInputField("Multiplicador Premium", "mult_premium", { suffix: "x" })}
            {renderInputField("Comissao Pegue", "comissao_percentual", { suffix: "%" })}
          </div>
        </div>
      </div>
    </div>
  );
}
