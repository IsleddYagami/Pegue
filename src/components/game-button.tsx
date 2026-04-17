"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const PegueRunner = dynamic(() => import("./pegue-runner"), { ssr: false });

export function GameButton() {
  const [jogoAberto, setJogoAberto] = useState(false);

  return (
    <>
      {/* Botao flutuante do jogo - canto inferior esquerdo */}
      <button
        onClick={() => setJogoAberto(true)}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-2 rounded-full bg-[#C9A84C] px-4 py-3 text-sm font-bold text-black shadow-lg transition-transform hover:scale-110 active:scale-95"
        aria-label="Jogar Pegue Runner"
      >
        <span className="text-lg">🎮</span>
        <span className="hidden sm:inline">Jogar</span>
      </button>

      {/* Jogo fullscreen */}
      {jogoAberto && <PegueRunner onClose={() => setJogoAberto(false)} />}
    </>
  );
}
