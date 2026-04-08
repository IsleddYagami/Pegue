"use client";

import { useState, useEffect } from "react";
import { CheckCircle } from "lucide-react";

const entregas = [
  { rua: "Rua das Flores, 142", cidade: "Osasco", tempo: "12 min" },
  { rua: "Av. Brasil, 87", cidade: "Carapicuiba", tempo: "8 min" },
  { rua: "Rua Marechal, 301", cidade: "Barueri", tempo: "23 min" },
  { rua: "Al. Santos, 55", cidade: "Sao Paulo", tempo: "15 min" },
  { rua: "Rua XV de Novembro", cidade: "Cotia", tempo: "31 min" },
  { rua: "Av. Atlantica, 200", cidade: "Santos", tempo: "45 min" },
];

export function FloatingNotification() {
  const [show, setShow] = useState(false);
  const [entrega, setEntrega] = useState(entregas[0]);

  useEffect(() => {
    const random = entregas[Math.floor(Math.random() * entregas.length)];
    setEntrega(random);

    const timer = setTimeout(() => setShow(true), 6000);
    const hide = setTimeout(() => setShow(false), 12000);

    return () => {
      clearTimeout(timer);
      clearTimeout(hide);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 z-40 animate-in slide-in-from-left duration-500 md:bottom-6 md:left-6">
      <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-[#111111] px-4 py-3 shadow-xl">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#C9A84C]/20">
          <CheckCircle size={16} className="text-[#C9A84C]" />
        </div>
        <div>
          <p className="text-xs font-semibold text-white">Entrega confirmada</p>
          <p className="text-[10px] text-gray-500">
            {entrega.rua} - {entrega.cidade}
          </p>
          <p className="text-[10px] text-gray-600">ha {entrega.tempo}</p>
        </div>
      </div>
    </div>
  );
}
