"use client";

import { useState } from "react";
import Image from "next/image";

const TRUCKS = [
  { id: 1, nome: "HR / Bau", desc: "Hyundai HR com bau Pegue", img: "/truck-hr.png" },
  { id: 2, nome: "Fiat Strada", desc: "Pickup carregada de mudanca", img: "/truck-strada.png" },
  { id: 3, nome: "Trucado", desc: "Caminhao truck com bau grande", img: "/truck-trucado.png" },
];

export default function TesteCaminhaoPage() {
  const [escolhido, setEscolhido] = useState<number | null>(null);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white">
            Escolha o <span className="text-[#C9A84C]">Veiculo</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">Qual vai representar a Pegue no jogo?</p>
        </div>

        {TRUCKS.map((truck) => (
          <div
            key={truck.id}
            onClick={() => setEscolhido(truck.id)}
            className={`cursor-pointer rounded-xl border p-4 transition-all ${
              escolhido === truck.id
                ? "border-[#C9A84C] bg-[#C9A84C]/10"
                : "border-gray-800 bg-[#111] hover:border-gray-600"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-bold text-white">{truck.nome}</p>
                <p className="text-xs text-gray-400">{truck.desc}</p>
              </div>
              {escolhido === truck.id && (
                <span className="text-[#C9A84C] font-bold text-sm">✅ Escolhido</span>
              )}
            </div>
            <div className="flex justify-center rounded-lg bg-[#1a1a1a] p-4">
              <img
                src={truck.img}
                alt={truck.nome}
                className="h-24 w-auto object-contain"
              />
            </div>
          </div>
        ))}

        {escolhido && (
          <p className="text-center text-sm text-[#C9A84C]">
            Veiculo {escolhido} selecionado! Me avisa no chat qual escolheu.
          </p>
        )}
      </div>
    </div>
  );
}
