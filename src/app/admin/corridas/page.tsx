"use client";

import { useState } from "react";
import { Search, Filter, Eye, MapPin, Clock } from "lucide-react";

const statusOptions = [
  "Todos",
  "Cotacao",
  "Pago",
  "Buscando prestador",
  "Em coleta",
  "Em transito",
  "Entregue",
  "Finalizado",
  "Cancelado",
];

const mockCorridas = [
  {
    codigo: "PEG-2026-0012",
    cliente: "Maria Silva",
    telefone: "(11) 99999-1111",
    origem: "Centro, Osasco",
    destino: "Carapicuiba",
    tipo: "Mudanca residencial",
    plano: "Padrao",
    valor: "R$ 420",
    status: "Em transito",
    statusColor: "bg-orange-100 text-orange-600",
    prestador: "Carlos Souza",
    data: "07/04/2026",
    hora: "08:00",
  },
  {
    codigo: "PEG-2026-0011",
    cliente: "Joao Mendes",
    telefone: "(11) 99999-2222",
    origem: "Jd. das Flores, Osasco",
    destino: "Alphaville, Barueri",
    tipo: "Frete",
    plano: "Economica",
    valor: "R$ 320",
    status: "Em coleta",
    statusColor: "bg-pink-100 text-pink-600",
    prestador: "Andre Lima",
    data: "07/04/2026",
    hora: "09:00",
  },
  {
    codigo: "PEG-2026-0010",
    cliente: "Ana Costa",
    telefone: "(11) 99999-3333",
    origem: "Vila Yara, Carapicuiba",
    destino: "Bela Vista, Osasco",
    tipo: "Frete",
    plano: "Economica",
    valor: "R$ 280",
    status: "Entregue",
    statusColor: "bg-blue-100 text-blue-600",
    prestador: "Ricardo Martins",
    data: "07/04/2026",
    hora: "07:30",
  },
  {
    codigo: "PEG-2026-0009",
    cliente: "Pedro Alves",
    telefone: "(11) 99999-4444",
    origem: "Centro, Osasco",
    destino: "Granja Viana, Cotia",
    tipo: "Mudanca residencial",
    plano: "Premium",
    valor: "R$ 580",
    status: "Pago",
    statusColor: "bg-green-100 text-green-600",
    prestador: "-",
    data: "07/04/2026",
    hora: "14:00",
  },
  {
    codigo: "PEG-2026-0008",
    cliente: "Lucia Ferreira",
    telefone: "(11) 99999-5555",
    origem: "Aldeia, Barueri",
    destino: "Km 18, Osasco",
    tipo: "Frete",
    plano: "Padrao",
    valor: "R$ 350",
    status: "Finalizado",
    statusColor: "bg-gray-100 text-gray-600",
    prestador: "Carlos Souza",
    data: "06/04/2026",
    hora: "10:00",
  },
];

export default function CorridasPage() {
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [busca, setBusca] = useState("");

  const corridasFiltradas = mockCorridas.filter((c) => {
    const matchStatus =
      filtroStatus === "Todos" || c.status === filtroStatus;
    const matchBusca =
      !busca ||
      c.codigo.toLowerCase().includes(busca.toLowerCase()) ||
      c.cliente.toLowerCase().includes(busca.toLowerCase());
    return matchStatus && matchBusca;
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-[#0A0A0A]">Corridas</h1>
      <p className="text-sm text-gray-400">
        Gerencie todas as corridas da plataforma
      </p>

      {/* Filters */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por codigo ou cliente..."
            className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-sm focus:border-[#C9A84C] focus:outline-none"
          />
        </div>
        <div className="relative">
          <Filter
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="w-full appearance-none rounded-xl border border-gray-200 py-3 pl-10 pr-8 text-sm focus:border-[#C9A84C] focus:outline-none sm:w-48"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Count */}
      <p className="mt-3 text-xs text-gray-400">
        {corridasFiltradas.length} corrida(s) encontrada(s)
      </p>

      {/* Table / Cards */}
      <div className="mt-4 space-y-3">
        {corridasFiltradas.map((c) => (
          <div
            key={c.codigo}
            className="rounded-2xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold text-[#0A0A0A]">
                    {c.codigo}
                  </span>
                  <span
                    className={`rounded-lg px-3 py-1 text-xs font-semibold ${c.statusColor}`}
                  >
                    {c.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {c.cliente} · {c.telefone}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-[#C9A84C]">{c.valor}</p>
                <p className="text-xs text-gray-400">
                  {c.plano} · {c.tipo}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <MapPin size={14} className="text-[#C9A84C]" />
                {c.origem} → {c.destino}
              </div>
              <div className="flex items-center gap-1">
                <Clock size={14} />
                {c.data} {c.hora}
              </div>
              <div>Prestador: {c.prestador}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
