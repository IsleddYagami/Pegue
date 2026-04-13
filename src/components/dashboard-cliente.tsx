"use client";

import { useState } from "react";
import {
  Search, Package, DollarSign, Loader2, Users, Clock,
  CheckCircle, Star, Truck, AlertCircle, Heart,
} from "lucide-react";

interface ClienteDashboard {
  nome: string;
  nivel: string;
  totalServicos: number;
  totalGasto: number;
  fretistasFrequentes: { nome: string; telefone: string; qtd: number }[];
  historico: {
    origem: string;
    destino: string;
    carga: string;
    valor: number;
    data: string;
    status: string;
    fretista: string | null;
  }[];
  freteAtivo: {
    destino: string;
    carga: string;
    status: string;
    valor: number;
  } | null;
}

export function DashboardCliente() {
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [data, setData] = useState<ClienteDashboard | null>(null);

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setData(null);

    const tel = telefone.replace(/\D/g, "");
    if (tel.length < 10) {
      setErro("Informe um telefone valido");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard-cliente?phone=55${tel}`);
      const result = await res.json();
      if (res.ok && result.nome) {
        setData(result);
      } else {
        setErro(result.error || "Cliente nao encontrado.");
      }
    } catch {
      setErro("Erro de conexao.");
    }
    setLoading(false);
  };

  const nivelConfig: Record<string, { cor: string; label: string }> = {
    bronze: { cor: "text-orange-400 bg-orange-400/10", label: "Bronze" },
    prata: { cor: "text-gray-300 bg-gray-300/10", label: "Prata" },
    ouro: { cor: "text-[#C9A84C] bg-[#C9A84C]/10", label: "Ouro" },
  };

  const statusLabel: Record<string, { texto: string; cor: string }> = {
    pendente: { texto: "Aguardando", cor: "text-yellow-400" },
    aceita: { texto: "Fretista confirmado", cor: "text-blue-400" },
    paga: { texto: "Pago", cor: "text-green-400" },
    concluida: { texto: "Concluido", cor: "text-green-400" },
    problema: { texto: "Em resolucao", cor: "text-red-400" },
  };

  if (!data) {
    return (
      <form onSubmit={handleBuscar} className="mx-auto max-w-md space-y-4">
        <p className="text-center text-gray-400">
          Digite seu telefone pra ver seu historico
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))}
            className="flex-1 rounded-lg border border-[#C9A84C]/30 bg-[#0A0A0A] px-4 py-3 text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
            placeholder="11999999999"
          />
          <button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-[#C9A84C] px-6 py-3 font-bold text-[#000000] transition-all hover:scale-[1.02] disabled:opacity-50">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
          </button>
        </div>
        {erro && <p className="text-center text-sm text-red-400">{erro}</p>}
      </form>
    );
  }

  const nivel = nivelConfig[data.nivel] || nivelConfig.bronze;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Cabecalho */}
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 md:flex-row md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A84C]/10">
            <Users className="h-7 w-7 text-[#C9A84C]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">{data.nome}</h3>
            <p className="text-sm text-gray-500">Cliente Pegue</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${nivel.cor}`}>
          <Star className="h-4 w-4" /> {nivel.label}
        </span>
      </div>

      {/* Frete ativo */}
      {data.freteAtivo && (
        <div className="rounded-2xl border-2 border-[#C9A84C]/40 bg-[#C9A84C]/5 p-6">
          <div className="mb-2 flex items-center gap-2">
            <Truck className="h-5 w-5 text-[#C9A84C]" />
            <h4 className="font-bold text-[#C9A84C]">Frete em andamento</h4>
          </div>
          <p className="text-sm">{data.freteAtivo.carga} → {data.freteAtivo.destino}</p>
          <div className="mt-2 flex items-center gap-4">
            <span className="text-lg font-bold">R$ {data.freteAtivo.valor?.toFixed(0) || "---"}</span>
            <span className={`text-sm ${statusLabel[data.freteAtivo.status]?.cor || "text-gray-400"}`}>
              {statusLabel[data.freteAtivo.status]?.texto || data.freteAtivo.status}
            </span>
          </div>
        </div>
      )}

      {/* Cards resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 text-center">
          <Package className="mx-auto mb-2 h-8 w-8 text-[#C9A84C]" />
          <p className="text-3xl font-bold">{data.totalServicos}</p>
          <p className="text-sm text-gray-400">Servicos contratados</p>
        </div>
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 text-center">
          <DollarSign className="mx-auto mb-2 h-8 w-8 text-[#C9A84C]" />
          <p className="text-3xl font-bold text-[#C9A84C]">R$ {data.totalGasto.toFixed(0)}</p>
          <p className="text-sm text-gray-400">Total investido</p>
        </div>
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 text-center">
          <Heart className="mx-auto mb-2 h-8 w-8 text-[#C9A84C]" />
          <p className="text-3xl font-bold">{data.fretistasFrequentes.length}</p>
          <p className="text-sm text-gray-400">Fretistas que te atenderam</p>
        </div>
      </div>

      {/* Fretistas frequentes */}
      {data.fretistasFrequentes.length > 0 && (
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
          <div className="mb-4 flex items-center gap-2">
            <Star className="h-5 w-5 text-[#C9A84C]" />
            <h4 className="font-bold">Seus fretistas</h4>
          </div>
          <div className="space-y-3">
            {data.fretistasFrequentes.map((f, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-[#C9A84C]/10 bg-[#000000] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C9A84C]/10">
                    <Truck className="h-5 w-5 text-[#C9A84C]" />
                  </div>
                  <div>
                    <p className="font-medium">{f.nome}</p>
                    <p className="text-xs text-gray-500">{f.qtd} {f.qtd === 1 ? "frete" : "fretes"} realizados</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historico */}
      <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-[#C9A84C]" />
          <h4 className="font-bold">Historico de servicos</h4>
        </div>
        {data.historico.length > 0 ? (
          <div className="space-y-3">
            {data.historico.map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-[#C9A84C]/10 bg-[#000000] p-4">
                <div className="flex-1">
                  <p className="text-sm font-medium">{h.carga}</p>
                  <p className="text-xs text-gray-500">{h.origem.substring(0, 25)} → {h.destino.substring(0, 25)}</p>
                  <p className="text-xs text-gray-500">{h.data} {h.fretista ? `- ${h.fretista}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#C9A84C]">R$ {h.valor.toFixed(0)}</p>
                  <span className={`text-xs ${statusLabel[h.status]?.cor || "text-gray-400"}`}>
                    {statusLabel[h.status]?.texto || h.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nenhum servico contratado ainda.</p>
        )}
      </div>

      {/* Instagram + indicacao */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-6 text-center">
          <p className="mb-2 text-lg font-bold">Siga @chamepegue 📱</p>
          <p className="text-sm text-gray-400">Cupons exclusivos nos stories toda semana!</p>
        </div>
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-6 text-center">
          <p className="mb-2 text-lg font-bold">Indique um amigo 🎁</p>
          <p className="text-sm text-gray-400">Em breve: indique e ganhe desconto no proximo frete!</p>
        </div>
      </div>

      {/* Voltar */}
      <button
        onClick={() => { setData(null); setTelefone(""); }}
        className="w-full rounded-lg border border-[#C9A84C]/20 py-3 text-sm text-gray-400 transition-all hover:border-[#C9A84C] hover:text-white"
      >
        Consultar outro numero
      </button>
    </div>
  );
}
