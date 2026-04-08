"use client";

import { useEffect, useState } from "react";
import { DollarSign, CheckCircle, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";

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

export default function FinanceiroPage() {
  const [pagamentos, setPagamentos] = useState<PagamentoComCorrida[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("pagamentos")
        .select("*, corrida:corridas(codigo, valor_pegue, valor_prestador, prestador:prestadores(nome))")
        .order("criado_em", { ascending: false })
        .limit(20);
      if (data) setPagamentos(data as unknown as PagamentoComCorrida[]);
      setLoading(false);
    }
    load();
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
    await supabase
      .from("pagamentos")
      .update({ repasse_status: "pago", repasse_pago_em: new Date().toISOString() })
      .eq("id", id);
    setPagamentos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, repasse_status: "pago" } : p))
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#00C896] border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-[#1a1a1a]">Financeiro</h1>
      <p className="text-sm text-gray-400">Pagamentos, comissoes e repasses</p>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Faturamento Total</p>
          <p className="mt-2 text-2xl font-extrabold text-[#00C896]">R$ {totalFaturamento.toFixed(0)}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Comissao Pegue</p>
          <p className="mt-2 text-2xl font-extrabold text-[#00C896]">R$ {totalComissao.toFixed(0)}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">Repasses Pendentes</p>
          <p className="mt-2 text-2xl font-extrabold text-orange-500">{repassesPendentes.length}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-[#1a1a1a]">Pagamentos</h2>
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
                      className="rounded-lg bg-[#00C896] px-4 py-2 text-xs font-bold text-white"
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
