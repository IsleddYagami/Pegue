"use client";

import { useId, useMemo, useState } from "react";
import { Check, MapPin, X } from "lucide-react";
import { buscarCidades, cidadeValida, CIDADES_FREQUENTES } from "@/lib/cidades-sp";

// Escolher a CIDADE sem digitar endereco.
//
// Ordem do Fabio (7/Nov/2026): "as pessoas nao vao ficar digitando cep, o povo
// e preguicoso e nao estuda e fora que o proprio cep as vezes e confuso, as
// pessoas sabem o bairro de retira e entrega, e para termos certeza do bairro
// que ele esta citando por isso eu falei p colocar cidade assim nao tem erro".
//
// Entao: as cidades que a Pegue ve todo dia ficam a um toque, em botao grande.
// Quem mora nas outras 619 cidades do estado digita duas ou tres letras e toca
// no nome. Ninguem digita endereco, ninguem digita CEP, e a cidade escolhida
// e' o que faz o bairro deixar de ser ambiguo.

export function SeletorCidade({
  valor,
  onEscolher,
  rotulo,
}: {
  valor: string;
  onEscolher: (cidade: string) => void;
  rotulo: string;
}) {
  const [busca, setBusca] = useState("");
  const idBusca = useId();
  const resultados = useMemo(() => buscarCidades(busca, 8), [busca]);

  if (valor) {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-gray-300">{rotulo}</span>
        <button
          type="button"
          onClick={() => {
            onEscolher("");
            setBusca("");
          }}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#C9A84C] bg-[#C9A84C]/10 px-4 py-3.5 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-[#C9A84C]" />
            <strong className="truncate text-white">{valor}</strong>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
            trocar <X className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-gray-300">{rotulo}</span>

      {/* Atalho: as cidades do dia a dia, um toque e pronto. */}
      <div className="mb-3 flex flex-wrap gap-2">
        {CIDADES_FREQUENTES.slice(0, 8).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onEscolher(c)}
            className="rounded-full border border-gray-700 bg-[#111] px-3.5 py-2 text-sm text-gray-300 transition-colors hover:border-[#C9A84C] hover:text-[#C9A84C]"
          >
            {c}
          </button>
        ))}
      </div>

      <label htmlFor={idBusca} className="sr-only">
        Procurar {rotulo.toLowerCase()}
      </label>
      <input
        id={idBusca}
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Outra cidade? digite as primeiras letras"
        maxLength={60}
        autoComplete="off"
        className="w-full rounded-xl border border-gray-700 bg-[#111] px-4 py-3 text-white placeholder-gray-600 outline-none focus:border-[#C9A84C]"
      />

      {busca.trim().length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-gray-800">
          {resultados.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">
              Não achei essa cidade em São Paulo. A Pegue atende o estado de SP.
            </p>
          ) : (
            resultados.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onEscolher(c)}
                className="flex w-full items-center justify-between border-b border-gray-800 px-4 py-3 text-left text-sm text-gray-200 last:border-b-0 hover:bg-[#C9A84C]/10 hover:text-[#C9A84C]"
              >
                {c}
                <Check className="h-4 w-4 opacity-0" aria-hidden="true" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export { cidadeValida };
