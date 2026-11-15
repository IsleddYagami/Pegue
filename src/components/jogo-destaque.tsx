"use client";

// Secao do jogo na home + ranking.
//
// ORDEM DO FABIO (14/11/2026): *"preciso que destaque este joguinho dentro do
// site p as pessoas jogarem e deve teer acesso facil e os rankings"*.
//
// Antes disto o jogo existia e ninguem achava: `/jogo` nao era linkada de
// lugar nenhum e o unico caminho era um botao flutuante que so' aparecia na
// home. O ranking existia no banco (API /api/ranking, com partida de gente de
// verdade desde Abril) e so' aparecia DENTRO do jogo, na tela de game over —
// quem nunca jogou nunca via que havia um ranking.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gamepad2, Trophy } from "lucide-react";
import { melhorPorJogador, type LinhaRanking } from "@/lib/ranking-jogo";

const QUANTOS = 5;

export function JogoDestaque() {
  const [linhas, setLinhas] = useState<LinhaRanking[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch("/api/ranking")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (vivo) setLinhas(melhorPorJogador(d, QUANTOS));
      })
      // Ranking fora do ar nao pode derrubar a secao: o botao de jogar
      // continua valendo (o jogo nao depende do banco pra rodar).
      .catch(() => {})
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <section className="border-y border-[#C9A84C]/10 bg-[#0A0A0A] py-16 md:py-20">
      <div className="mx-auto max-w-5xl px-4">
        <div className="flex flex-col items-center text-center">
          <span className="flex items-center gap-2 rounded-full border border-[#C9A84C]/30 px-4 py-1 text-xs font-bold uppercase tracking-widest text-[#C9A84C]">
            <Gamepad2 className="h-4 w-4" /> Jogo da Pegue
          </span>
          <h2 className="font-display mt-4 text-3xl font-extrabold text-white md:text-4xl">
            Pegue Runner
          </h2>
          <p className="mt-3 max-w-xl text-gray-400">
            Pega a carga, desvia do trânsito e entrega. Quanto mais longe você vai,
            maior o seu km no ranking. Funciona no celular, de graça, sem instalar nada.
          </p>
          <Link
            href="/jogo"
            className="mt-7 flex items-center gap-3 rounded-full bg-[#C9A84C] px-9 py-4 text-lg font-bold text-black shadow-lg shadow-[#C9A84C]/20 transition-transform hover:scale-105"
          >
            <Gamepad2 className="h-5 w-5" /> Jogar agora
          </Link>
        </div>

        <div className="mx-auto mt-12 max-w-md rounded-2xl border border-[#C9A84C]/15 bg-black/60 p-5">
          <h3 className="flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest text-[#C9A84C]">
            <Trophy className="h-4 w-4" /> Melhores jogadores
          </h3>

          {carregando && (
            <p className="mt-4 text-center text-sm text-gray-500">Carregando o ranking...</p>
          )}

          {!carregando && linhas.length === 0 && (
            <p className="mt-4 text-center text-sm text-gray-500">
              Ninguém no ranking ainda. O primeiro km é seu.
            </p>
          )}

          {linhas.length > 0 && (
            <ol className="mt-4 flex flex-col gap-1">
              {linhas.map((l, i) => (
                <li
                  key={`${l.nome}-${i}`}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm odd:bg-white/[0.03]"
                >
                  <span
                    className={`w-6 text-center font-bold ${i === 0 ? "text-[#C9A84C]" : "text-gray-500"}`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-gray-200">{l.nome}</span>
                  <span className="font-bold tabular-nums text-[#C9A84C]">
                    {l.distancia.toLocaleString("pt-BR")} km
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
