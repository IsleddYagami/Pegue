"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { fetchComTimeout } from "@/lib/fetch-utils";
import { MIN_LETRAS_BUSCA, type SugestaoBairro } from "@/lib/busca-bairro";
import { SeletorCidade } from "@/components/seletor-cidade";

// ESCREVE O BAIRRO, A TELA MOSTRA EM QUE CIDADES ELE EXISTE.
//
// Ordem do Fabio (7/Nov/2026), depois de travar na primeira versao: *"ja deu
// erro estou escrevendo o a cidade e nao esta reconhecendo, o certo seria assim
// q ele colocar o birro em baixo aparecer as cidades que tem bairro com aquele
// nome igual o waze"*.
//
// O erro que isso conserta: antes a cidade era um campo separado e so valia se
// a pessoa TOCASSE no nome na lista. Quem digitava "Osasco" inteiro e seguia em
// frente ficava com o botao apagado, sem entender por que.
//
// Agora o bairro manda. E tem sempre a saida manual embaixo, porque o
// OpenStreetMap nao conhece todo bairro (ver lib/busca-bairro): sem ela, quem
// mora num bairro que o mapa nao tem ficaria preso de novo — o mesmo erro com
// outra roupa.

export interface Local {
  bairro: string;
  cidade: string;
}

interface Props {
  valor: Local;
  onMudar: (l: Local) => void;
  rotulo: string;
  exemplo: string;
}

export function SeletorLocal({ valor, onMudar, rotulo, exemplo }: Props) {
  const [texto, setTexto] = useState(valor.bairro);
  const [sugestoes, setSugestoes] = useState<SugestaoBairro[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [manual, setManual] = useState(false);
  const idCampo = useId();
  const ultimaBusca = useRef("");

  const escolhido = !!valor.cidade && !!valor.bairro;

  useEffect(() => {
    if (escolhido) return;
    const termo = texto.trim();
    // Texto curto demais: nao busca e NAO mexe em estado aqui. Quem limpa a
    // lista e o onChange do campo — a regra da casa proibe setState sincrono
    // dentro de efeito.
    if (termo.length < MIN_LETRAS_BUSCA) return;

    let vivo = true;
    const timer = setTimeout(() => {
      ultimaBusca.current = termo;
      setBuscando(true);
      fetchComTimeout(`/api/bairros?q=${encodeURIComponent(termo)}`, {}, 8000)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          // Resposta de busca antiga nao pode sobrescrever a atual.
          if (!vivo || ultimaBusca.current !== termo) return;
          setSugestoes(Array.isArray(d?.sugestoes) ? d.sugestoes : []);
          setBuscou(true);
        })
        .catch(() => {
          if (vivo) {
            setSugestoes([]);
            setBuscou(true);
          }
        })
        .finally(() => {
          if (vivo) setBuscando(false);
        });
    }, 450);

    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [texto, escolhido]);

  if (escolhido) {
    return (
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-gray-300">{rotulo}</span>
        <button
          type="button"
          onClick={() => {
            onMudar({ bairro: "", cidade: "" });
            setTexto("");
            setSugestoes([]);
            setBuscou(false);
            setManual(false);
          }}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#C9A84C] bg-[#C9A84C]/10 px-4 py-3.5 text-left"
        >
          <span className="flex min-w-0 items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-[#C9A84C]" />
            <span className="min-w-0 truncate">
              <strong className="text-white">{valor.bairro}</strong>
              <span className="text-gray-400"> · {valor.cidade}</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
            trocar <X className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>
    );
  }

  const semResultado = buscou && !buscando && sugestoes.length === 0;

  return (
    <div>
      <label htmlFor={idCampo} className="mb-1.5 block text-sm font-semibold text-gray-300">
        {rotulo}
      </label>
      <div className="relative">
        <input
          id={idCampo}
          value={texto}
          onChange={(e) => {
            const novo = e.target.value;
            setTexto(novo);
            setManual(false);
            if (novo.trim().length < MIN_LETRAS_BUSCA) {
              setSugestoes([]);
              setBuscou(false);
            }
          }}
          placeholder={exemplo}
          maxLength={80}
          autoComplete="off"
          aria-label={rotulo}
          className="w-full rounded-xl border border-gray-700 bg-[#111] px-4 py-3.5 pr-11 text-lg text-white placeholder-gray-600 outline-none focus:border-[#C9A84C]"
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-600">
          {buscando ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#C9A84C]" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </span>
      </div>

      {texto.trim().length > 0 && texto.trim().length < MIN_LETRAS_BUSCA && (
        <p className="mt-2 text-xs text-gray-600">Escreve pelo menos três letras do bairro.</p>
      )}

      {sugestoes.length > 0 && !manual && (
        <div className="mt-2 overflow-hidden rounded-xl border border-gray-800">
          {sugestoes.map((s) => (
            <button
              key={`${s.bairro}|${s.cidade}`}
              type="button"
              onClick={() => {
                onMudar({ bairro: s.bairro, cidade: s.cidade });
                setTexto(s.bairro);
              }}
              aria-label={`${s.bairro}, ${s.cidade}`}
              className="flex w-full items-center gap-3 border-b border-gray-800 px-4 py-3 text-left last:border-b-0 hover:bg-[#C9A84C]/10"
            >
              <MapPin className="h-4 w-4 shrink-0 text-gray-600" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">{s.bairro}</span>
                <span className="block truncate text-xs text-gray-500">{s.cidade}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {semResultado && !manual && (
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          Não achei esse bairro no mapa — tem muito bairro que não está lá. Escolhe a cidade
          abaixo que funciona do mesmo jeito.
        </p>
      )}

      {/* A saida manual. Aparece sozinha quando a busca nao achou nada, e fica
          sempre disponivel num toque — ninguem pode ficar preso por causa de
          um mapa incompleto. */}
      {manual || semResultado ? (
        <div className="mt-4 border-t border-gray-800 pt-4">
          <SeletorCidade
            valor=""
            rotulo="Cidade"
            onEscolher={(cidade) => {
              if (!cidade) return;
              const bairro = texto.trim();
              onMudar({ bairro: bairro || "Centro", cidade });
              if (!bairro) setTexto("Centro");
            }}
          />
        </div>
      ) : (
        texto.trim().length >= MIN_LETRAS_BUSCA && (
          <button
            type="button"
            onClick={() => setManual(true)}
            className="mt-3 text-xs text-gray-500 underline hover:text-gray-300"
          >
            não achou? escolher a cidade na lista
          </button>
        )
      )}
    </div>
  );
}
