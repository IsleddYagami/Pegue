"use client";

import { useState } from "react";
import { Search, Truck, Star, DollarSign, CheckCircle, AlertCircle, Clock, Loader2 } from "lucide-react";

interface DashboardData {
  nome: string;
  score: number;
  totalFretes: number;
  faturamento: number;
  status: string;
  disponivel: boolean;
  veiculo?: {
    tipo: string;
    placa: string;
  };
}

export function DashboardParceiro() {
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);

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
      const res = await fetch(`/api/dashboard-parceiro?phone=55${tel}`);
      const result = await res.json();

      if (res.ok && result.nome) {
        setData(result);
      } else {
        setErro(result.error || "Parceiro nao encontrado. Verifique o numero.");
      }
    } catch {
      setErro("Erro de conexao. Tente novamente.");
    }

    setLoading(false);
  };

  const veiculoNomes: Record<string, string> = {
    carro_comum: "Carro Comum",
    utilitario: "Utilitario",
    hr: "HR",
    caminhao_bau: "Caminhao Bau",
  };

  const getStatusIcon = (status: string, disponivel: boolean) => {
    if (status === "aprovado" && disponivel) return <CheckCircle className="h-5 w-5 text-green-400" />;
    if (status === "aprovado" && !disponivel) return <Clock className="h-5 w-5 text-yellow-400" />;
    if (status === "pendente") return <Clock className="h-5 w-5 text-blue-400" />;
    return <AlertCircle className="h-5 w-5 text-red-400" />;
  };

  const getStatusTexto = (status: string, disponivel: boolean) => {
    if (status === "aprovado" && disponivel) return "Ativo";
    if (status === "aprovado" && !disponivel) return "Pausado";
    if (status === "pendente") return "Em analise";
    return "Inativo";
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-green-400";
    if (score >= 5) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreMsg = (score: number) => {
    if (score >= 8) return "Excelente! Voce esta entre os melhores parceiros!";
    if (score >= 5) return "Bom trabalho! Continue assim pra subir no ranking!";
    return "Atencao! Melhore seu atendimento pra receber mais indicacoes.";
  };

  return (
    <div className="mx-auto max-w-lg">
      {!data ? (
        <form onSubmit={handleBuscar} className="space-y-4">
          <p className="mb-4 text-center text-gray-400">
            Digite seu telefone pra acessar seu painel
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))}
              className="flex-1 rounded-lg border border-gray-700 bg-[#1a1a1a] px-4 py-3 text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
              placeholder="11999999999"
              maxLength={11}
            />
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-[#C9A84C] px-6 py-3 font-bold text-[#0A0A0A] transition-all hover:scale-[1.02] disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
              {loading ? "" : "Buscar"}
            </button>
          </div>
          {erro && <p className="text-center text-sm text-red-400">{erro}</p>}
        </form>
      ) : (
        <div className="space-y-4">
          {/* Cabecalho */}
          <div className="rounded-2xl border border-gray-800 bg-[#111111] p-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#C9A84C]/10">
              <Truck className="h-8 w-8 text-[#C9A84C]" />
            </div>
            <h3 className="text-xl font-bold">{data.nome}</h3>
            <div className="mt-2 flex items-center justify-center gap-2">
              {getStatusIcon(data.status, data.disponivel)}
              <span className="text-sm text-gray-400">{getStatusTexto(data.status, data.disponivel)}</span>
            </div>
            {data.veiculo && (
              <p className="mt-1 text-sm text-gray-500">
                {veiculoNomes[data.veiculo.tipo] || data.veiculo.tipo} - {data.veiculo.placa}
              </p>
            )}
          </div>

          {/* Metricas */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-800 bg-[#111111] p-4 text-center">
              <Star className={`mx-auto mb-2 h-6 w-6 ${getScoreColor(data.score)}`} />
              <p className={`text-2xl font-bold ${getScoreColor(data.score)}`}>{data.score.toFixed(1)}</p>
              <p className="text-xs text-gray-500">Score</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-[#111111] p-4 text-center">
              <Truck className="mx-auto mb-2 h-6 w-6 text-[#C9A84C]" />
              <p className="text-2xl font-bold text-white">{data.totalFretes}</p>
              <p className="text-xs text-gray-500">Fretes</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-[#111111] p-4 text-center">
              <DollarSign className="mx-auto mb-2 h-6 w-6 text-green-400" />
              <p className="text-2xl font-bold text-green-400">R$ {data.faturamento.toFixed(0)}</p>
              <p className="text-xs text-gray-500">Faturado</p>
            </div>
          </div>

          {/* Mensagem motivacional */}
          <div className="rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-4 text-center">
            <p className="text-sm text-[#C9A84C]">
              {data.score >= 8 ? "🏆" : data.score >= 5 ? "👍" : "⚠️"} {getScoreMsg(data.score)}
            </p>
          </div>

          {/* Voltar */}
          <button
            onClick={() => { setData(null); setTelefone(""); }}
            className="w-full rounded-lg border border-gray-700 py-3 text-sm text-gray-400 transition-all hover:border-[#C9A84C] hover:text-white"
          >
            Consultar outro numero
          </button>
        </div>
      )}
    </div>
  );
}
