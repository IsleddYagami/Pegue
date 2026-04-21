"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Star, CheckCircle, XCircle, Plus, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Prestador } from "@/lib/types";

export default function PrestadoresPage() {
  const [prestadores, setPrestadores] = useState<Prestador[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("prestadores")
        .select("*, prestador_veiculos(tipo, placa)")
        .order("criado_em", { ascending: false });
      if (data) setPrestadores(data as unknown as Prestador[]);
      setLoading(false);
    }
    load();
  }, []);

  const filtrados = prestadores.filter(
    (p) =>
      !busca ||
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      p.telefone.includes(busca)
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#C9A84C] border-t-transparent" />
      </div>
    );
  }

  const statusColorMap: Record<string, string> = {
    pendente: "bg-yellow-100 text-yellow-600",
    aprovado: "bg-green-100 text-green-600",
    bloqueado: "bg-red-100 text-red-600",
    suspenso: "bg-orange-100 text-orange-600",
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0A0A0A]">Prestadores</h1>
          <p className="text-sm text-gray-400">Gerencie os motoristas e prestadores</p>
        </div>
        <Link
          href="/admin/prestadores/novo"
          className="flex items-center gap-2 rounded-xl bg-[#C9A84C] px-4 py-2 font-semibold text-white hover:bg-[#b8963f]"
        >
          <UserPlus size={16} /> Cadastrar novo
        </Link>
      </div>

      <div className="relative mt-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-sm focus:border-[#C9A84C] focus:outline-none sm:max-w-md"
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white p-12 text-center shadow-sm">
          <Plus className="mx-auto h-12 w-12 text-gray-200" />
          <p className="mt-2 font-medium text-gray-500">Nenhum prestador cadastrado</p>
          <p className="mt-1 text-sm text-gray-400">
            Os prestadores serao cadastrados via WhatsApp ou manualmente
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((p) => {
            const veiculos = (p as any).prestador_veiculos || [];
            return (
              <div key={p.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C9A84C] text-lg font-bold text-white">
                      {p.nome.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-bold text-[#0A0A0A]">{p.nome}</p>
                      <p className="text-xs text-gray-400">{p.telefone}</p>
                    </div>
                  </div>
                  <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${statusColorMap[p.status] || "bg-gray-100 text-gray-600"}`}>
                    {p.status}
                  </span>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  {veiculos.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Veiculo</span>
                      <span className="font-medium">{veiculos[0].tipo} · {veiculos[0].placa}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Score</span>
                    <span className="flex items-center gap-1 font-medium">
                      <Star size={14} className="fill-yellow-400 text-yellow-400" />
                      {p.score}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Corridas</span>
                    <span className="font-medium">{p.total_corridas}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Regiao</span>
                    <span className="text-xs font-medium text-gray-500">{p.regiao_atuacao || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Disponivel</span>
                    {p.disponivel ? (
                      <span className="flex items-center gap-1 text-green-500"><CheckCircle size={14} /> Sim</span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-400"><XCircle size={14} /> Nao</span>
                    )}
                  </div>
                </div>
                {p.status === "pendente" && (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={async () => {
                        await supabase.from("prestadores").update({ status: "aprovado" }).eq("id", p.id);
                        setPrestadores((prev) => prev.map((x) => x.id === p.id ? { ...x, status: "aprovado" } : x));
                      }}
                      className="flex-1 rounded-lg bg-[#C9A84C] py-2 text-xs font-bold text-white"
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={async () => {
                        await supabase.from("prestadores").update({ status: "bloqueado" }).eq("id", p.id);
                        setPrestadores((prev) => prev.map((x) => x.id === p.id ? { ...x, status: "bloqueado" } : x));
                      }}
                      className="flex-1 rounded-lg bg-red-100 py-2 text-xs font-bold text-red-600"
                    >
                      Bloquear
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
