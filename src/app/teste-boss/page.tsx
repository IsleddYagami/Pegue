"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const PegueRunner = dynamic(() => import("@/components/pegue-runner"), { ssr: false });

export default function TesteBoss() {
  const [jogoAberto, setJogoAberto] = useState(false);

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <h1 className="mb-6 text-3xl font-bold text-[#C9A84C]">Teste de Bosses - Pegue Runner®</h1>
      <p className="mb-8 text-gray-400">Clique no botão abaixo pra abrir o jogo. Use as teclas numéricas durante o jogo pra pular pro boss:</p>

      <div className="mb-8 space-y-3">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-sm text-gray-300">
            <span className="font-bold text-[#C9A84C]">Atalhos durante o jogo:</span>
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-400">
            <li><span className="font-mono text-white">1</span> = Pular pra Fase 1 (Boss: Guincho CET)</li>
            <li><span className="font-mono text-white">2</span> = Pular pra Fase 2 (Boss: Policia PRF)</li>
            <li><span className="font-mono text-white">3</span> = Pular pra Fase 3 (Boss: Cegonha)</li>
            <li><span className="font-mono text-white">4</span> = Pular pra Fase 4 (Boss: Bruto do Porto / Santos)</li>
            <li><span className="font-mono text-white">5</span> = Pular pra Fase 5 (Boss: O Coletor)</li>
          </ul>
        </div>
      </div>

      <button
        onClick={() => setJogoAberto(true)}
        className="rounded-xl bg-[#C9A84C] px-8 py-4 text-lg font-bold text-black"
      >
        🎮 Abrir Jogo
      </button>

      {jogoAberto && <PegueRunner onClose={() => setJogoAberto(false)} />}
    </div>
  );
}
