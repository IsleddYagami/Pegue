"use client";

import { useEffect, useState } from "react";
import { DollarSign } from "lucide-react";

type PagamentoComCorrida = {
  id: string;
  corrida_id: string;
  valor: number;
  metodo: string | null;
  status: string;
  repasse_status: string;
  pago_em: string | null;
  criado_em: string;
  corrida: {
    codigo: string;
    valor_pegue: number | null;
    valor_prestador: number | null;
    prestador: { nome: string } | null;
  } | null;
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

type AsaasInfo = {
  configured: boolean;
  ambiente: string;
  saldo: number | null;
  saldo_erro: string | null;
};

export default function FinanceiroPage() {
  const [pagamentos, setPagamentos] = useState<PagamentoComCorrida[]>([]);
  const [asaasInfo, setAsaasInfo] = useState<AsaasInfo | null>(null);
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
      const res = await fetch(`/api/admin-financeiro?key=${encodeURIComponent(senha)}`);
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
      // Compat: API antiga retornava array direto, nova retorna { pagamentos, asaas }
      if (Array.isArray(data)) {
        setPagamentos(data as PagamentoComCorrida[]);
      } else {
        setPagamentos((data.pagamentos as PagamentoComCorrida[]) || []);
        setAsaasInfo(data.asaas || null);
      }
    } catch {
      setErro("Erro de conexao");
    }
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const totalFaturamento = pagamentos
    .filter((p) => p.status === "aprovado")
    .reduce((sum, p) => sum + p.valor, 0);
  const totalComissao = pagamentos
    .filter((p) => p.status === "aprovado")
    .reduce((sum, p) => sum + (p.corrida?.valor_pegue || p.valor * 0.2), 0);
  const repassesPendentes = pagamentos.filter(
    (p) => p.status === "aprovado" && p.repasse_status === "pendente"
  );

  async function aprovarRepasse(id: string) {
    const senha = sessionStorage.getItem("admin_key") || "";
    if (!senha) return;
    try {
      const res = await fetch(`/api/admin-financeiro?key=${encodeURIComponent(senha)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao: "aprovar_repasse" }),
      });
      if (!res.ok) {
        alert("Erro ao aprovar repasse");
        return;
      }
      setPagamentos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, repasse_status: "pago" } : p))
      );
    } catch {
      alert("Erro de conexao");
    }
  }

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

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-[#0A0A0A]">Financeiro</h1>
      <p className="text-sm text-gray-400">Pagamentos, comissoes e repasses</p>

      {/* Card de saldo Asaas (destaque, com aviso se baixo) */}
      {asaasInfo && asaasInfo.configured && (
        <div className={`mt-4 rounded-2xl p-5 shadow-sm flex items-center justify-between ${
          asaasInfo.saldo !== null && asaasInfo.saldo < 50 ? "bg-red-50 border-2 border-red-300" : "bg-blue-50"
        }`}>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Saldo Asaas ({asaasInfo.ambiente})</p>
            <p className={`mt-1 text-3xl font-extrabold ${
              asaasInfo.saldo !== null && asaasInfo.saldo < 50 ? "text-red-700" : "text-blue-700"
            }`}>
              {asaasInfo.saldo !== null
                ? `R$ ${asaasInfo.saldo.toFixed(2)}`
                : asaasInfo.saldo_erro
                  ? "❓ erro consulta"
                  : "—"}
            </p>
            {asaasInfo.saldo !== null && asaasInfo.saldo < 50 && (
              <p className="mt-1 text-xs text-red-700 font-semibold">
                ⚠️ Saldo baixo! Risco de bloquear repasses.
              </p>
            )}
          </div>
          <div className="text-right text-xs text-gray-500">
            {asaasInfo.ambiente === "producao" ? "💵 Ambiente PRODUCAO" : "🧪 Ambiente SANDBOX"}
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Faturamento Total</p>
          <p className="mt-2 text-2xl font-extrabold text-[#C9A84C]">R$ {totalFaturamento.toFixed(0)}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Comissao Pegue</p>
          <p className="mt-2 text-2xl font-extrabold text-[#C9A84C]">R$ {totalComissao.toFixed(0)}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Repasses Pendentes</p>
          <p className="mt-2 text-2xl font-extrabold text-orange-500">{repassesPendentes.length}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-[#0A0A0A]">Pagamentos</h2>
        </div>

        {pagamentos.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <DollarSign className="mx-auto h-12 w-12 text-gray-200" />
            <p className="mt-2">Nenhum pagamento registrado</p>
          </div>
        ) : (
          <div className="space-y-0">
            {pagamentos.map((p) => (
              <div key={p.id} className="flex flex-col gap-3 border-b border-gray-50 p-5 last:border-none sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{p.corrida?.codigo || "-"}</span>
                    <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${p.repasse_status === "pago" ? "bg-green-100 text-green-600" : "bg-orange-100 text-orange-600"}`}>
                      Repasse: {p.repasse_status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {(p.corrida as any)?.prestador?.nome || "-"} · {p.pago_em ? new Date(p.pago_em).toLocaleDateString("pt-BR") : "-"}
                  </p>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Total</p>
                    <p className="font-semibold">R$ {p.valor.toFixed(0)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400">Repasse</p>
                    <p className="font-bold">R$ {(p.corrida?.valor_prestador || p.valor * 0.8).toFixed(0)}</p>
                  </div>
                  {p.status === "aprovado" && p.repasse_status === "pendente" && (
                    <button
                      onClick={() => aprovarRepasse(p.id)}
                      className="rounded-lg bg-[#C9A84C] px-4 py-2 text-xs font-bold text-white"
                    >
                      Aprovar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
