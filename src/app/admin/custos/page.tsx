"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, Cpu, Activity } from "lucide-react";

type Janela = {
  total: number;
  chamadas: number;
  porServico: Record<string, { custo: number; chamadas: number }>;
  porModelo: Record<string, { custo: number; chamadas: number }>;
};

type Resposta = {
  "24h": Janela;
  "7d": Janela;
  "30d": Janela;
  atualizado_em: string;
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

function fmtUsd(v: number): string {
  return `$${v.toFixed(4)}`;
}

function fmtBrl(usd: number): string {
  // Conversao aproximada (atualizar se cambio mexer significativamente)
  return `R$ ${(usd * 5.2).toFixed(2)}`;
}

export default function CustosPage() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const senha = getAdminKey();
    if (!senha) {
      setErro("Senha de admin obrigatoria");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin-custos?key=${encodeURIComponent(senha)}`);
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
      setDados(data as Resposta);
    } catch {
      setErro("Erro de conexao");
    }
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  if (loading) return <div className="p-6">Carregando...</div>;
  if (erro) return <div className="p-6 text-red-600">{erro}</div>;
  if (!dados) return <div className="p-6">Sem dados</div>;

  // Projecao mensal: extrapola 7d * (30/7)
  const projecaoMensalUsd = dados["7d"].total * (30 / 7);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <DollarSign className="w-6 h-6" /> Custos de IA
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Estimativa em USD baseada em logs `custo_estimado_ia`. Atualizado em{" "}
        {new Date(dados.atualizado_em).toLocaleString("pt-BR")}.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card titulo="Ultimas 24h" usd={dados["24h"].total} chamadas={dados["24h"].chamadas} />
        <Card titulo="Ultimos 7d" usd={dados["7d"].total} chamadas={dados["7d"].chamadas} />
        <Card titulo="Ultimos 30d" usd={dados["30d"].total} chamadas={dados["30d"].chamadas} />
        <Card titulo="Projecao 30d" usd={projecaoMensalUsd} chamadas={null} destaque />
      </div>

      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <Activity className="w-5 h-5" /> Por servico (ultimos 7d)
      </h2>
      <Tabela dados={dados["7d"].porServico} />

      <h2 className="text-lg font-semibold mt-6 mb-2 flex items-center gap-2">
        <Cpu className="w-5 h-5" /> Por modelo (ultimos 7d)
      </h2>
      <Tabela dados={dados["7d"].porModelo} />
    </div>
  );
}

function Card({
  titulo,
  usd,
  chamadas,
  destaque,
}: {
  titulo: string;
  usd: number;
  chamadas: number | null;
  destaque?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        destaque ? "border-blue-500 bg-blue-50" : "border-gray-200"
      }`}
    >
      <div className="text-sm text-gray-600">{titulo}</div>
      <div className="text-2xl font-bold mt-1 flex items-center gap-2">
        {fmtUsd(usd)}
        {destaque && <TrendingUp className="w-5 h-5 text-blue-600" />}
      </div>
      <div className="text-sm text-gray-500">{fmtBrl(usd)} (cambio ~R$5,20)</div>
      {chamadas !== null && (
        <div className="text-xs text-gray-400 mt-1">{chamadas} chamadas</div>
      )}
    </div>
  );
}

function Tabela({ dados }: { dados: Record<string, { custo: number; chamadas: number }> }) {
  const linhas = Object.entries(dados).sort((a, b) => b[1].custo - a[1].custo);
  if (linhas.length === 0) {
    return <div className="text-sm text-gray-500">Sem chamadas no periodo.</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="text-left p-2">Item</th>
          <th className="text-right p-2">Chamadas</th>
          <th className="text-right p-2">Custo USD</th>
          <th className="text-right p-2">Custo BRL</th>
          <th className="text-right p-2">Media/chamada</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map(([nome, v]) => (
          <tr key={nome} className="border-t">
            <td className="p-2 font-mono text-xs">{nome}</td>
            <td className="p-2 text-right">{v.chamadas}</td>
            <td className="p-2 text-right">{fmtUsd(v.custo)}</td>
            <td className="p-2 text-right">{fmtBrl(v.custo)}</td>
            <td className="p-2 text-right text-gray-500">
              {fmtUsd(v.chamadas > 0 ? v.custo / v.chamadas : 0)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
