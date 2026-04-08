"use client";

import { useEffect, useState } from "react";
import {
  Truck,
  Clock,
  DollarSign,
  Users,
  ArrowUpRight,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Corrida, Prestador } from "@/lib/types";

const statusColorMap: Record<string, string> = {
  cotacao: "bg-gray-100 text-gray-600",
  aguardando_pagamento: "bg-yellow-100 text-yellow-600",
  pago: "bg-green-100 text-green-600",
  buscando_prestador: "bg-purple-100 text-purple-600",
  prestador_confirmado: "bg-blue-100 text-blue-600",
  em_coleta: "bg-pink-100 text-pink-600",
  coletado: "bg-indigo-100 text-indigo-600",
  em_transito: "bg-orange-100 text-orange-600",
  em_entrega: "bg-amber-100 text-amber-600",
  entregue: "bg-teal-100 text-teal-600",
  finalizado: "bg-gray-100 text-gray-600",
  cancelado: "bg-red-100 text-red-600",
  disputa: "bg-red-100 text-red-600",
};

export default function AdminDashboard() {
  const [corridas, setCorridas] = useState<Corrida[]>([]);
  const [totalHoje, setTotalHoje] = useState(0);
  const [emAndamento, setEmAndamento] = useState(0);
  const [faturamento, setFaturamento] = useState(0);
  const [prestadoresAtivos, setPrestadoresAtivos] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const hoje = new Date().toISOString().split("T")[0];

      // Corridas recentes
      const { data: corridasData } = await supabase
        .from("corridas")
        .select("*, cliente:clientes(nome, telefone), prestador:prestadores(nome)")
        .order("criado_em", { ascending: false })
        .limit(10);

      if (corridasData) {
        setCorridas(corridasData as unknown as Corrida[]);
        const hoje_corridas = corridasData.filter(
          (c) => c.criado_em?.startsWith(hoje)
        );
        setTotalHoje(hoje_corridas.length);
        setEmAndamento(
          corridasData.filter((c) =>
            ["em_coleta", "em_transito", "em_entrega", "coletado"].includes(c.status)
          ).length
        );
        setFaturamento(
          hoje_corridas.reduce((sum, c) => sum + (c.valor_final || c.valor_estimado || 0), 0)
        );
      }

      // Prestadores ativos
      const { count } = await supabase
        .from("prestadores")
        .select("*", { count: "exact", head: true })
        .eq("status", "aprovado");
      setPrestadoresAtivos(count || 0);

      setLoading(false);
    }
    loadData();
  }, []);

  const stats = [
    { label: "Corridas Hoje", value: totalHoje.toString(), icon: Truck, color: "text-[#C9A84C]", bg: "bg-green-50" },
    { label: "Em Andamento", value: emAndamento.toString(), icon: Clock, color: "text-orange-500", bg: "bg-orange-50" },
    { label: "Faturamento Hoje", value: `R$ ${faturamento.toFixed(0)}`, icon: DollarSign, color: "text-[#C9A84C]", bg: "bg-green-50" },
    { label: "Prestadores Ativos", value: prestadoresAtivos.toString(), icon: Users, color: "text-blue-500", bg: "bg-blue-50" },
  ];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#C9A84C] border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-[#0A0A0A]">Dashboard</h1>
        <p className="text-sm text-gray-400">
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-gray-400">{stat.label}</p>
              <div className={`rounded-lg ${stat.bg} p-2`}>
                <stat.icon size={18} className={stat.color} />
              </div>
            </div>
            <p className={`mt-2 text-3xl font-extrabold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Corridas recentes */}
      <div className="mt-6 rounded-2xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-bold text-[#0A0A0A]">Corridas Recentes</h2>
          <a href="/admin/corridas" className="text-sm font-medium text-[#C9A84C] hover:underline">Ver todas</a>
        </div>

        {corridas.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Truck className="mx-auto h-12 w-12 text-gray-200" />
            <p className="mt-2 font-medium">Nenhuma corrida ainda</p>
            <p className="text-sm">As corridas aparecao aqui quando os clientes comecarem a pedir fretes</p>
          </div>
        ) : (
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50 text-left text-xs uppercase text-gray-400">
                  <th className="px-5 py-3 font-semibold">Codigo</th>
                  <th className="px-5 py-3 font-semibold">Cliente</th>
                  <th className="px-5 py-3 font-semibold">Rota</th>
                  <th className="px-5 py-3 font-semibold">Valor</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Prestador</th>
                </tr>
              </thead>
              <tbody>
                {corridas.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 last:border-none">
                    <td className="px-5 py-3 text-sm font-semibold">{c.codigo}</td>
                    <td className="px-5 py-3 text-sm">{(c as any).cliente?.nome || "-"}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {c.origem_endereco?.split(",")[0]} → {c.destino_endereco?.split(",")[0]}
                    </td>
                    <td className="px-5 py-3 text-sm font-semibold">
                      R$ {(c.valor_final || c.valor_estimado || 0).toFixed(0)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block rounded-lg px-3 py-1 text-xs font-semibold ${statusColorMap[c.status] || "bg-gray-100 text-gray-600"}`}>
                        {c.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-500">
                      {(c as any).prestador?.nome || "Buscando..."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile */}
        {corridas.length > 0 && (
          <div className="space-y-3 p-4 md:hidden">
            {corridas.map((c) => (
              <div key={c.id} className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{c.codigo}</span>
                  <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${statusColorMap[c.status] || "bg-gray-100 text-gray-600"}`}>
                    {c.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-1 text-sm">{(c as any).cliente?.nome || "-"}</p>
                <p className="text-xs text-gray-400">
                  {c.origem_endereco?.split(",")[0]} → {c.destino_endereco?.split(",")[0]}
                </p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="font-semibold">R$ {(c.valor_final || c.valor_estimado || 0).toFixed(0)}</span>
                  <span className="text-gray-400">{(c as any).prestador?.nome || "Buscando..."}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
