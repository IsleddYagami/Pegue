"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, Ruler, Trash2 } from "lucide-react";
import {
  AMBIENTES,
  CATALOGO,
  ITEM_OUTRO,
  itemPorId,
  MAX_QTD_POR_ITEM,
  type Ambiente,
  type ItemEscolhido,
  type ResumoCarga,
} from "@/lib/itens-carga";

// O QUE VAI NO CAMINHAO — tocando, nao digitando.
//
// Ordem do Fabio (7/Nov/2026): "quantos itens a pessoa seleciona, descreva ou
// selecione os itens, em cada opcao ela pode colocar se quiser as medidas isso
// pode ser opcional". E a regra que manda em tudo: "precisa ser bonito,
// extremamente intuitivo ate um analfabeto deve conseguir preencher isso".
//
// Por isso cada item e' um botao grande com desenho, o numero aparece no
// proprio botao, e a medida fica escondida atras de um "tem medida?" — quem
// nao quiser, nunca ve.
//
// O volume de cada item vem da TABELA (lib/itens-carga), nao de IA. Isso aqui
// e' o substituto da foto, que o Fabio tirou da frente em 6/Nov por errar
// muito, e do classificador de texto, que estima com gpt-4o-mini.

interface Props {
  escolhidos: ItemEscolhido[];
  onMudar: (itens: ItemEscolhido[]) => void;
  resumo: ResumoCarga;
}

export function SeletorItens({ escolhidos, onMudar, resumo }: Props) {
  const [ambiente, setAmbiente] = useState<Ambiente>("sala");
  const [medindo, setMedindo] = useState<string | null>(null);
  const [nomeOutro, setNomeOutro] = useState("");

  const porId = useMemo(() => {
    const m = new Map<string, ItemEscolhido>();
    for (const e of escolhidos) if (e.id !== ITEM_OUTRO) m.set(e.id, e);
    return m;
  }, [escolhidos]);

  const livres = useMemo(() => escolhidos.filter((e) => e.id === ITEM_OUTRO), [escolhidos]);

  function somar(id: string, delta: number) {
    const atual = porId.get(id);
    const nova = Math.min(Math.max((atual?.qtd ?? 0) + delta, 0), MAX_QTD_POR_ITEM);
    if (nova === 0) {
      onMudar(escolhidos.filter((e) => !(e.id === id && e.id !== ITEM_OUTRO)));
      if (medindo === id) setMedindo(null);
      return;
    }
    if (atual) {
      onMudar(escolhidos.map((e) => (e.id === id && e.id !== ITEM_OUTRO ? { ...e, qtd: nova } : e)));
    } else {
      onMudar([...escolhidos, { id, qtd: nova }]);
    }
  }

  function definirMedida(id: string, campo: keyof NonNullable<ItemEscolhido["medida"]>, valor: number) {
    onMudar(
      escolhidos.map((e) => {
        if (e.id !== id || e.id === ITEM_OUTRO) return e;
        const base = e.medida ?? { larguraCm: 0, alturaCm: 0, comprimentoCm: 0 };
        return { ...e, medida: { ...base, [campo]: valor } };
      }),
    );
  }

  function limparMedida(id: string) {
    onMudar(
      escolhidos.map((e) =>
        e.id === id && e.id !== ITEM_OUTRO ? { id: e.id, qtd: e.qtd } : e,
      ),
    );
    setMedindo(null);
  }

  function adicionarLivre() {
    const nome = nomeOutro.trim();
    if (nome.length < 2) return;
    onMudar([...escolhidos, { id: ITEM_OUTRO, qtd: 1, nomeLivre: nome }]);
    setNomeOutro("");
  }

  /** Mexe no item livre numero `indice` (a ordem em que ele foi incluido). */
  function mexerLivre(indice: number, fn: (e: ItemEscolhido) => ItemEscolhido | null) {
    let n = -1;
    const saida: ItemEscolhido[] = [];
    for (const e of escolhidos) {
      if (e.id === ITEM_OUTRO) {
        n++;
        if (n === indice) {
          const novo = fn(e);
          if (novo) saida.push(novo);
          continue;
        }
      }
      saida.push(e);
    }
    onMudar(saida);
  }

  function mudarLivre(indice: number, delta: number) {
    mexerLivre(indice, (e) => {
      const nova = Math.min(Math.max(e.qtd + delta, 0), MAX_QTD_POR_ITEM);
      return nova > 0 ? { ...e, qtd: nova } : null;
    });
  }

  function medidaLivre(
    indice: number,
    campo: keyof NonNullable<ItemEscolhido["medida"]>,
    valor: number,
  ) {
    mexerLivre(indice, (e) => {
      const base = e.medida ?? { larguraCm: 0, alturaCm: 0, comprimentoCm: 0 };
      return { ...e, medida: { ...base, [campo]: valor } };
    });
  }

  const daVez = CATALOGO.filter((i) => i.ambiente === ambiente);

  return (
    <div>
      {/* Abas por ambiente: a pessoa pensa por lugar da casa, nao por categoria. */}
      <div className="mb-4 flex flex-wrap gap-2">
        {AMBIENTES.map((a) => {
          const marcados = escolhidos.filter(
            (e) => e.id !== ITEM_OUTRO && itemPorId(e.id)?.ambiente === a.chave,
          ).length;
          return (
            <button
              key={a.chave}
              type="button"
              onClick={() => setAmbiente(a.chave)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${
                ambiente === a.chave
                  ? "border-[#C9A84C] bg-[#C9A84C]/15 text-[#C9A84C]"
                  : "border-gray-700 bg-[#111] text-gray-400 hover:border-gray-500"
              }`}
            >
              <span aria-hidden="true">{a.emoji}</span>
              {a.nome}
              {marcados > 0 && (
                <span className="rounded-full bg-[#C9A84C] px-1.5 text-xs font-bold text-black">
                  {marcados}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {daVez.map((item) => {
          const esc = porId.get(item.id);
          const qtd = esc?.qtd ?? 0;
          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-3 transition-colors ${
                qtd > 0 ? "border-[#C9A84C] bg-[#C9A84C]/10" : "border-gray-800 bg-[#0A0A0A]"
              }`}
            >
              <button
                type="button"
                onClick={() => somar(item.id, 1)}
                // O nome do item fica em spans aninhados com o emoji marcado
                // aria-hidden; sem rotulo explicito o botao chega sem nome em
                // leitor de tela.
                aria-label={qtd > 0 ? `Somar um ${item.nome}` : `Incluir ${item.nome}`}
                className="flex w-full items-center gap-3 text-left"
              >
                <span className="text-2xl leading-none" aria-hidden="true">
                  {item.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-tight text-white">
                    {item.nome}
                  </span>
                  {qtd === 0 && (
                    <span className="text-xs text-gray-500">toque para incluir</span>
                  )}
                </span>
                {qtd === 0 && <Plus className="h-5 w-5 shrink-0 text-[#C9A84C]" />}
              </button>

              {qtd > 0 && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => somar(item.id, -1)}
                      aria-label={`Tirar um ${item.nome}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 text-gray-300"
                    >
                      {qtd === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                    </button>
                    <span className="w-6 text-center text-lg font-bold text-white">{qtd}</span>
                    <button
                      type="button"
                      onClick={() => somar(item.id, 1)}
                      aria-label={`Somar um ${item.nome}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#C9A84C]/50 text-[#C9A84C]"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMedindo(medindo === item.id ? null : item.id)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs ${
                      esc?.medida ? "text-[#C9A84C]" : "text-gray-500"
                    }`}
                  >
                    <Ruler className="h-3.5 w-3.5" />
                    {esc?.medida ? "com medida" : "tem medida?"}
                  </button>
                </div>
              )}

              {qtd > 0 && medindo === item.id && (
                <div className="mt-3 border-t border-gray-800 pt-3">
                  <p className="mb-2 text-xs text-gray-500">
                    Se souber, em centímetros. É opcional — sem isso eu uso a medida padrão
                    deste item.
                  </p>
                  <div className="flex items-center gap-2">
                    {(
                      [
                        ["larguraCm", "larg."],
                        ["alturaCm", "alt."],
                        ["comprimentoCm", "comp."],
                      ] as const
                    ).map(([campo, label]) => (
                      <label key={campo} className="min-w-0 flex-1">
                        <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-600">
                          {label}
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={1000}
                          value={esc?.medida?.[campo] || ""}
                          onChange={(e) =>
                            definirMedida(
                              item.id,
                              campo,
                              Math.max(0, Math.min(1000, Number(e.target.value) || 0)),
                            )
                          }
                          className="w-full rounded-lg border border-gray-700 bg-black px-2 py-2 text-center text-sm text-white outline-none focus:border-[#C9A84C]"
                        />
                      </label>
                    ))}
                  </div>
                  {esc?.medida && (
                    <button
                      type="button"
                      onClick={() => limparMedida(item.id)}
                      className="mt-2 text-xs text-gray-500 underline"
                    >
                      apagar a medida
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Item fora da lista: escrever e' a saida, nao a porta de entrada. */}
      <div className="mt-5 rounded-2xl border border-gray-800 bg-[#0A0A0A] p-4">
        <p className="mb-2 text-sm font-semibold text-gray-300">Não achou na lista?</p>
        <div className="flex gap-2">
          <input
            value={nomeOutro}
            onChange={(e) => setNomeOutro(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                adicionarLivre();
              }
            }}
            placeholder="Escreve o que é. Ex: piano, cofre, aquário"
            maxLength={80}
            className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-[#111] px-4 py-3 text-white placeholder-gray-600 outline-none focus:border-[#C9A84C]"
          />
          <button
            type="button"
            onClick={adicionarLivre}
            className="shrink-0 rounded-xl border border-[#C9A84C]/50 px-4 py-3 text-sm font-bold text-[#C9A84C]"
          >
            Incluir
          </button>
        </div>

        {livres.length > 0 && (
          <ul className="mt-3 space-y-2">
            {livres.map((e, i) => (
              <li key={`${e.nomeLivre}-${i}`} className="rounded-xl border border-gray-800 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-white">{e.nomeLivre}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => mudarLivre(i, -1)}
                      aria-label={`Tirar um ${e.nomeLivre}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 text-gray-300"
                    >
                      {e.qtd === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                    </button>
                    <span className="w-5 text-center font-bold text-white">{e.qtd}</span>
                    <button
                      type="button"
                      onClick={() => mudarLivre(i, 1)}
                      aria-label={`Somar um ${e.nomeLivre}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#C9A84C]/50 text-[#C9A84C]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
                {/* Item escrito a mao nao tem volume de tabela. A medida e' o
                    unico jeito de ele entrar na conta do tamanho — por isso
                    aparece aqui, aberta, em vez de escondida. */}
                <div className="mt-2 flex items-center gap-2">
                  <Ruler className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                  {(
                    [
                      ["larguraCm", "larg."],
                      ["alturaCm", "alt."],
                      ["comprimentoCm", "comp."],
                    ] as const
                  ).map(([campo, label]) => (
                    <input
                      key={campo}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1000}
                      aria-label={`${label} de ${e.nomeLivre} em centímetros`}
                      placeholder={label}
                      value={e.medida?.[campo] || ""}
                      onChange={(ev) =>
                        medidaLivre(
                          i,
                          campo,
                          Math.max(0, Math.min(1000, Number(ev.target.value) || 0)),
                        )
                      }
                      className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-black px-2 py-1.5 text-center text-xs text-white placeholder-gray-600 outline-none focus:border-[#C9A84C]"
                    />
                  ))}
                  <span className="shrink-0 text-[10px] text-gray-600">cm</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {resumo.temItemSemMedida && (
          <p className="mt-3 text-xs leading-relaxed text-yellow-300">
            Item escrito a mão entra no pedido, mas não entra na conta do tamanho. Se puder,
            põe a medida — ou escolhe o veículo que você sabe que serve.
          </p>
        )}
      </div>
    </div>
  );
}
