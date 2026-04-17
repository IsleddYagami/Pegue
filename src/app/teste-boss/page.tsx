"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const PegueRunner = dynamic(() => import("@/components/pegue-runner"), { ssr: false });

const FASES = [
  { fase: 1, nome: "Osasco", boss: "Guincho CET", cenario: "Pontilhão", cor: "#C9A84C" },
  { fase: 2, nome: "Marginal Tietê", boss: "Polícia PRF", cenario: "Rio/Viadutos", cor: "#0044AA" },
  { fase: 3, nome: "Bairro SP", boss: "Cegonha", cenario: "Casas/Postes + Otimizi", cor: "#33AA33" },
  { fase: 4, nome: "Santos", boss: "Bruto do Porto", cenario: "Praia/Guindastes", cor: "#E65100" },
  { fase: 5, nome: "Aeroporto", boss: "O Coletor", cenario: "Avião/Prédios", cor: "#553300" },
  { fase: 6, nome: "Zona Leste", boss: "Guincho CET", cenario: "Conjuntos + Terra", cor: "#CC3333" },
  { fase: 7, nome: "Serra do Mar", boss: "Polícia PRF", cenario: "Vegetação/Neblina", cor: "#1B5E20" },
];

export default function TesteBoss() {
  const [jogoAberto, setJogoAberto] = useState(false);
  const [faseEscolhida, setFaseEscolhida] = useState(1);

  return (
    <div className="min-h-screen bg-black p-6 text-white">
      <h1 className="mb-2 text-2xl font-bold text-[#C9A84C]">🎮 Pegue Runner® - Seleção de Fase</h1>
      <p className="mb-6 text-sm text-gray-400">Escolha a fase pra jogar direto</p>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FASES.map((f) => (
          <button
            key={f.fase}
            onClick={() => { setFaseEscolhida(f.fase); setJogoAberto(true); }}
            className="rounded-xl border-2 p-4 text-left transition-transform hover:scale-105 active:scale-95"
            style={{ borderColor: f.cor, background: `${f.cor}15` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold" style={{ color: f.cor }}>Fase {f.fase}</span>
              <span className="text-xs text-gray-500">▶</span>
            </div>
            <p className="mt-1 text-sm font-bold text-white">{f.nome}</p>
            <p className="text-xs text-gray-400">Boss: {f.boss}</p>
            <p className="text-xs text-gray-500">{f.cenario}</p>
          </button>
        ))}
      </div>

      <button
        onClick={() => { setFaseEscolhida(1); setJogoAberto(true); }}
        className="w-full rounded-xl bg-[#C9A84C] py-4 text-lg font-bold text-black sm:w-auto sm:px-12"
      >
        🎮 Jogar do Início (Fase 1)
      </button>

      {jogoAberto && <PegueRunner startPhase={faseEscolhida} onClose={() => setJogoAberto(false)} />}
    </div>
  );
}
