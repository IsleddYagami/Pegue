"use client";

import { useState } from "react";
import { Volume2, Check } from "lucide-react";

const sons = [
  { id: 1, nome: "Acorde Alegre", desc: "Do-Mi-Sol-Do (atual)", arquivo: "/som-1-acorde.wav" },
  { id: 2, nome: "Sirene Suave", desc: "Sobe e desce suavemente", arquivo: "/som-2-sirene.wav" },
  { id: 3, nome: "Campainha", desc: "Ding dong ding", arquivo: "/som-3-campainha.wav" },
  { id: 4, nome: "Alerta Urgente", desc: "Beep beep rapido", arquivo: "/som-4-alerta.wav" },
];

export default function TesteSomPage() {
  const [tocando, setTocando] = useState<number | null>(null);
  const [escolhido, setEscolhido] = useState<number | null>(null);

  function tocar(id: number, arquivo: string) {
    setTocando(id);
    const audio = new Audio(arquivo);
    audio.volume = 1.0;
    audio.play();
    audio.onended = () => setTocando(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
        <div className="text-center">
          <Volume2 className="mx-auto mb-2 h-10 w-10 text-[#C9A84C]" />
          <h1 className="text-xl font-bold text-white">
            Escolha o <span className="text-[#C9A84C]">Som</span> de Notificacao
          </h1>
          <p className="mt-1 text-sm text-gray-400">Toca quando o fretista chega no destino</p>
        </div>

        {sons.map((som) => (
          <div
            key={som.id}
            className={`flex items-center justify-between rounded-xl border p-4 transition-all ${
              escolhido === som.id
                ? "border-[#C9A84C] bg-[#C9A84C]/10"
                : "border-gray-800 bg-[#111]"
            }`}
          >
            <div>
              <p className="font-bold text-white">{som.nome}</p>
              <p className="text-xs text-gray-400">{som.desc}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => tocar(som.id, som.arquivo)}
                className={`rounded-lg px-4 py-2 text-sm font-bold ${
                  tocando === som.id
                    ? "bg-[#C9A84C] text-[#000]"
                    : "bg-gray-800 text-white hover:bg-gray-700"
                }`}
              >
                {tocando === som.id ? "🔊 ..." : "▶ Ouvir"}
              </button>
              <button
                onClick={() => setEscolhido(som.id)}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${
                  escolhido === som.id
                    ? "bg-[#C9A84C] text-[#000]"
                    : "border border-gray-700 text-gray-400 hover:border-[#C9A84C] hover:text-[#C9A84C]"
                }`}
              >
                {escolhido === som.id ? <Check className="h-4 w-4" /> : "Usar"}
              </button>
            </div>
          </div>
        ))}

        {escolhido && (
          <p className="text-center text-sm text-[#C9A84C]">
            ✅ Som {escolhido} selecionado! Me avisa qual escolheu.
          </p>
        )}
      </div>
    </div>
  );
}
