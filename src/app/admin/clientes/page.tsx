"use client";

import { useEffect, useState } from "react";
import { Search, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Cliente } from "@/lib/types";

const nivelColorMap: Record<string, string> = {
  bronze: "bg-amber-100 text-amber-700",
  prata: "bg-gray-200 text-gray-700",
  ouro: "bg-yellow-100 text-yellow-700",
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("clientes")
        .select("*")
        .order("criado_em", { ascending: false });
      if (data) setClientes(data as Cliente[]);
      setLoading(false);
    }
    load();
  }, []);

  const filtrados = clientes.filter(
    (c) =>
      !busca ||
      (c.nome || "").toLowerCase().includes(busca.toLowerCase()) ||
      c.telefone.includes(busca)
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#00C896] border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-[#1a1a1a]">Clientes</h1>
      <p className="text-sm text-gray-400">Base de clientes da Pegue</p>

      <div className="relative mt-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-sm focus:border-[#00C896] focus:outline-none sm:max-w-md"
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white p-12 text-center shadow-sm">
          <Users className="mx-auto h-12 w-12 text-gray-200" />
          <p className="mt-2 font-medium text-gray-500">Nenhum cliente ainda</p>
          <p className="mt-1 text-sm text-gray-400">
            Os clientes serao cadastrados automaticamente quando entrarem em contato pelo WhatsApp
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-white shadow-sm">
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50 text-left text-xs uppercase text-gray-400">
                  <th className="px-5 py-3 font-semibold">Cliente</th>
                  <th className="px-5 py-3 font-semibold">Telefone</th>
                  <th className="px-5 py-3 font-semibold">Corridas</th>
                  <th className="px-5 py-3 font-semibold">Nivel</th>
                  <th className="px-5 py-3 font-semibold">Desde</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.id} className="border-b border-gray-50 last:border-none">
                    <td className="px-5 py-3 text-sm font-semibold">{c.nome || "Sem nome"}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{c.telefone}</td>
                    <td className="px-5 py-3 text-sm">{c.total_corridas}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${nivelColorMap[c.nivel] || "bg-gray-100 text-gray-600"}`}>
                        {c.nivel}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-400">
                      {new Date(c.criado_em).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 md:hidden">
            {filtrados.map((c) => (
              <div key={c.id} className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{c.nome || "Sem nome"}</span>
                  <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${nivelColorMap[c.nivel] || "bg-gray-100 text-gray-600"}`}>
                    {c.nivel}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-400">{c.telefone}</p>
                <p className="mt-1 text-xs text-gray-400">{c.total_corridas} corridas</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
