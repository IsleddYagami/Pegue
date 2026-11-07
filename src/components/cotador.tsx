"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Copy,
  Loader2,
  MessageCircle,
  Truck,
} from "lucide-react";
import { fetchComTimeout } from "@/lib/fetch-utils";
import { SeletorLocal, type Local } from "@/components/seletor-local";
import { SeletorItens } from "@/components/seletor-itens";
import {
  cabeNoVeiculo,
  descricaoCarga,
  resumirCarga,
  type ItemEscolhido,
} from "@/lib/itens-carga";

// COTACAO NA TELA, PASSO A PASSO.
//
// Fluxo desenhado pelo Fabio em 7/Nov/2026, palavra por palavra: "bairro cidade
// de saida e bairro cidade de entrega. quantos itens a pessoa seleciona,
// descreva ou selecione os itens, em cada opcao ela pode colocar se quiser as
// medidas isso pode ser opcional, e por ultimo ela pode escolher o veiculo que
// quer contratar, utilitario, hr carroceria, caminhao bau, dia que precisa do
// servico, apartamento ou terreo isso e importante pois muda orcamento,
// quantos ajudantes (...) apos isso o valor".
//
// E a regra de forma, dele tambem: "precisa ser bonito, extremamente intuitivo
// ate um analfabeto deve conseguir preencher isso, visual intuitivo dinamico,
// facil, rapido, sem dificuldades, selecao rapida".
//
// POR QUE NAO PEDE ENDERECO NEM CEP
// "as pessoas nao vao ficar digitando cep, o povo e preguicoso (...) as pessoas
// sabem o bairro de retira e entrega, e para termos certeza do bairro que ele
// esta citando por isso eu falei p colocar cidade assim nao tem erro, depois
// caso ele feche e aceite contratar o servico ai simele inclui o endereco
// completo". Entao a cotacao vai com bairro + cidade, e o endereco com numero
// e' combinado depois, quando ele fecha — que tambem e' o que o projeto ja
// decidiu antes, por privacidade.
//
// LEI QUE NAO MUDOU: jamais cotar sem certeza. Quem decide se sai preco e'
// lib/cotacao.ts no servidor, com os dois pontos confirmados pelo geocoder.
// Bairro que o geocoder nao confirma NAO vira preco — vira caminho pro humano.

const WHATSAPP = "5511970363713";

type PrecoDetalhado = {
  base: number;
  ajudante: number;
  elevador: number;
  escada: number;
  feriado: number;
  total: number;
  feriadoNome?: string;
};

type TabelaPrecos = {
  utilitario: PrecoDetalhado;
  hr: PrecoDetalhado;
  caminhao_bau: PrecoDetalhado;
};

type Chave = keyof TabelaPrecos;

type Resposta =
  | {
      ok: true;
      km: number;
      zona: string;
      cidadeOrigem: string | null;
      cidadeDestino: string | null;
      precos: TabelaPrecos;
    }
  | { ok: false; motivo: string; mensagem?: string; precisaHumano?: boolean };

type Confianca = {
  fretistasVerificados: number | null;
  fretesConcluidos: number | null;
  notaMedia: number | null;
  totalAvaliacoes: number | null;
  verificacoes: string[];
};

const VEICULOS: Array<{ chave: Chave; nome: string; emoji: string; cabe: string }> = [
  {
    chave: "utilitario",
    nome: "Utilitário",
    emoji: "🚐",
    cabe: "Fiorino, Kangoo. Até uns 10 volumes ou 1 móvel grande",
  },
  {
    chave: "hr",
    nome: "HR Carroceria",
    emoji: "🛻",
    cabe: "Mudança de 1 quarto, geladeira, sofá de 3 lugares",
  },
  {
    chave: "caminhao_bau",
    nome: "Caminhão baú",
    emoji: "🚚",
    cabe: "Mudança inteira, carga alta ou comprida",
  },
];

const JANELAS = [
  { chave: "manhã", nome: "Manhã", detalhe: "8h às 12h" },
  { chave: "tarde", nome: "Tarde", detalhe: "12h às 18h" },
  { chave: "tanto faz", nome: "Tanto faz", detalhe: "o dia todo" },
] as const;

const PASSOS = [
  "De onde sai",
  "Pra onde vai",
  "O que vai",
  "Veículo",
  "Quando",
  "Acesso",
  "Ajudantes",
] as const;

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

function hojeISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function dataPorExtenso(iso: string): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export function Cotador() {
  // --- o que a pessoa escolheu, na ordem do fluxo ---
  const [passo, setPasso] = useState(0);
  const [localOrigem, setLocalOrigem] = useState<Local>({ bairro: "", cidade: "" });
  const [localDestino, setLocalDestino] = useState<Local>({ bairro: "", cidade: "" });
  const [itens, setItens] = useState<ItemEscolhido[]>([]);
  const [veiculo, setVeiculo] = useState<Chave | null>(null);
  const [data, setData] = useState("");
  const [janela, setJanela] = useState<string>("tanto faz");
  const [acesso, setAcesso] = useState<"terreo" | "elevador" | "escada">("terreo");
  const [andares, setAndares] = useState(1);
  const [ajudantes, setAjudantes] = useState(0);

  // --- resultado ---
  const [carregando, setCarregando] = useState(false);
  const [resp, setResp] = useState<Resposta | null>(null);
  const [erroRede, setErroRede] = useState<string | null>(null);
  const [conf, setConf] = useState<Confianca | null>(null);

  // --- fechamento ---
  const [nomeCliente, setNomeCliente] = useState("");
  const [telCliente, setTelCliente] = useState("");
  const [fechando, setFechando] = useState(false);
  const [erroPedido, setErroPedido] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pedido, setPedido] = useState<{
    codigo: string;
    valor: number;
    avisoCliente: boolean;
    adminsAvisados: number;
  } | null>(null);

  const resumo = useMemo(() => resumirCarga(itens), [itens]);
  const enderecoDe = (l: Local) =>
    l.bairro.trim() && l.cidade ? `${l.bairro.trim()}, ${l.cidade}, SP` : "";
  const origem = enderecoDe(localOrigem);
  const destino = enderecoDe(localDestino);

  // Cada passo e menor que o anterior: sem isto, ao avancar a pagina encolhe
  // e a pessoa fica olhando pro rodape em vez da proxima pergunta. Visto na
  // conferencia de 7/Nov, no navegador.
  const cartao = useRef<HTMLDivElement | null>(null);
  const primeiroRender = useRef(true);
  useEffect(() => {
    if (primeiroRender.current) {
      primeiroRender.current = false;
      return;
    }
    cartao.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [passo]);

  useEffect(() => {
    fetchComTimeout("/api/confianca", {}, 10000)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setConf(d))
      .catch(() => setConf(null));
  }, []);

  const podeAvancar = [
    !!origem,
    !!destino,
    true, // a carga pode ficar em branco: quem sabe o veiculo cota direto
    !!veiculo,
    !!data,
    acesso !== "escada" || andares >= 1,
    true,
  ][passo];

  async function cotar() {
    setCarregando(true);
    setResp(null);
    setErroRede(null);
    setPedido(null);
    try {
      const r = await fetchComTimeout(
        "/api/cotar",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origem,
            destino,
            ajudantes,
            elevador: acesso === "elevador",
            andares: acesso === "escada" ? andares : 0,
            dataAgendada: data || null,
          }),
        },
        25000,
      );
      setResp(await r.json());
    } catch {
      setErroRede("Deu problema na conexão. Tenta de novo ou fala com a gente no WhatsApp.");
    } finally {
      setCarregando(false);
    }
  }

  async function fecharPedido(e: React.FormEvent) {
    e.preventDefault();
    if (!veiculo) return;
    setErroPedido(null);
    setFechando(true);
    try {
      const r = await fetchComTimeout(
        "/api/pedido",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origem,
            destino,
            ajudantes,
            elevador: acesso === "elevador",
            andares: acesso === "escada" ? andares : 0,
            dataAgendada: data || null,
            janela,
            itens,
            veiculo,
            nome: nomeCliente,
            telefone: telCliente,
          }),
        },
        25000,
      );
      const d = await r.json();
      if (d?.ok) {
        setPedido({
          codigo: d.codigo,
          valor: d.valor,
          avisoCliente: d.avisoCliente !== false,
          adminsAvisados: Number(d.adminsAvisados ?? 0),
        });
      } else {
        setErroPedido(d?.mensagem || "Não consegui abrir o pedido. Tenta de novo ou fala no WhatsApp.");
      }
    } catch {
      setErroPedido("Deu problema na conexão. Tenta de novo ou fala no WhatsApp.");
    } finally {
      setFechando(false);
    }
  }

  const linkWhats = (extra: string) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(extra)}`;

  function textoDaCotacao(): string {
    const v = VEICULOS.find((x) => x.chave === veiculo);
    const linhas = ["Oi! Cotei no site da Pegue:", "", `De: ${origem || "—"}`, `Para: ${destino || "—"}`];
    if (resp?.ok === true) linhas.push(`Distância: ${resp.km} km`);
    const carga = descricaoCarga(itens);
    if (carga) linhas.push(`Carga: ${carga}`);
    if (v) linhas.push(`Veículo: ${v.nome}`);
    if (data) linhas.push(`Quando: ${dataPorExtenso(data)} — ${janela}`);
    linhas.push(
      `Acesso: ${acesso === "escada" ? `${andares} andar(es) de escada` : acesso === "elevador" ? "elevador" : "térreo"}`,
    );
    linhas.push(`Ajudantes: ${ajudantes}`);
    if (resp?.ok === true && veiculo) {
      linhas.push("", `Valor na tela: ${reais(resp.precos[veiculo].total)}`);
    }
    return linhas.join("\n");
  }

  async function copiarCotacao() {
    try {
      await navigator.clipboard.writeText(textoDaCotacao());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErroPedido("Seu navegador bloqueou a cópia. Toca em 'Abrir nosso WhatsApp' que o texto já vai pronto.");
    }
  }

  const encaixe = veiculo ? cabeNoVeiculo(resumo, veiculo) : null;
  const noPreco = resp !== null || carregando;

  return (
    <section
      id="cotar"
      // O cabecalho e fixo: sem margem de rolagem, o link #cotar para com o
      // titulo escondido atras dele (visto no celular, 7/Nov).
      className="scroll-mt-20 border-t border-[#C9A84C]/10 py-16 md:py-24"
      style={{ background: "#000" }}
    >
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="mb-3 text-center text-3xl font-extrabold md:text-4xl">
          Seu preço <span className="text-[#C9A84C]">agora</span>, nesta tela
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-center text-gray-400">
          Sete toques. Sem endereço, sem CEP, sem cadastro.
        </p>

        {!noPreco && (
          <div
            ref={cartao}
            className="scroll-mt-24 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5 md:p-8"
          >
            {/* Trilha: a pessoa ve onde esta e quanto falta. */}
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-[#C9A84C]">
                  {passo + 1} de {PASSOS.length} · {PASSOS[passo]}
                </span>
                {passo > 0 && (
                  <button
                    type="button"
                    onClick={() => setPasso((p) => Math.max(0, p - 1))}
                    className="flex items-center gap-1 text-gray-400 hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> voltar
                  </button>
                )}
              </div>
              <div className="flex gap-1.5">
                {PASSOS.map((p, i) => (
                  <span
                    key={p}
                    className={`h-1.5 flex-1 rounded-full ${i <= passo ? "bg-[#C9A84C]" : "bg-gray-800"}`}
                  />
                ))}
              </div>
            </div>

            {/* 1 — DE ONDE SAI. Um campo so: escreve o bairro, toca na
                linha "Bairro · Cidade". Ordem do Fabio, 7/Nov: "igual o waze". */}
            {passo === 0 && (
              <SeletorLocal
                valor={localOrigem}
                onMudar={setLocalOrigem}
                rotulo="De que bairro sai"
                exemplo="Ex: Centro, Presidente Altino, Butantã"
              />
            )}

            {/* 2 — PRA ONDE VAI */}
            {passo === 1 && (
              <SeletorLocal
                valor={localDestino}
                onMudar={setLocalDestino}
                rotulo="Pra que bairro vai"
                exemplo="Ex: Jardim das Flores, Vila Mariana"
              />
            )}

            {/* 3 — O QUE VAI */}
            {passo === 2 && (
              <div>
                <p className="mb-4 text-sm text-gray-400">
                  Toca no que vai. Dá pra somar quantidade e, se quiser, pôr a medida — mas é
                  opcional.
                </p>
                <SeletorItens escolhidos={itens} onMudar={setItens} resumo={resumo} />
                {resumo.totalItens > 0 && (
                  <p className="mt-4 rounded-xl border border-gray-800 bg-black px-4 py-3 text-sm text-gray-300">
                    <strong className="text-white">{resumo.totalItens}</strong>{" "}
                    {resumo.totalItens === 1 ? "item" : "itens"} ·{" "}
                    <strong className="text-white">{resumo.volumeM3} m³</strong> ·{" "}
                    <strong className="text-white">{resumo.pesoKg} kg</strong>
                  </p>
                )}
              </div>
            )}

            {/* 4 — VEICULO */}
            {passo === 3 && (
              <div>
                <p className="mb-4 text-sm text-gray-400">
                  Escolhe o veículo que você quer contratar.
                </p>
                <div className="grid gap-3">
                  {VEICULOS.map((v) => {
                    const checagem = cabeNoVeiculo(resumo, v.chave);
                    const escolhido = veiculo === v.chave;
                    return (
                      <button
                        key={v.chave}
                        type="button"
                        onClick={() => setVeiculo(v.chave)}
                        // O nome esta em spans aninhados ao lado de um emoji
                        // aria-hidden: sem rotulo, o botao chega sem nome em
                        // leitor de tela (visto na conferencia de 7/Nov).
                        aria-label={`Escolher ${v.nome}`}
                        aria-pressed={escolhido}
                        className={`flex items-start gap-4 rounded-2xl border p-4 text-left transition-colors ${
                          escolhido
                            ? "border-[#C9A84C] bg-[#C9A84C]/10"
                            : "border-gray-800 bg-[#0A0A0A] hover:border-gray-600"
                        }`}
                      >
                        <span className="text-3xl leading-none" aria-hidden="true">
                          {v.emoji}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-white">{v.nome}</span>
                          <span className="block text-xs leading-relaxed text-gray-500">{v.cabe}</span>
                          {resumo.totalItens > 0 && checagem.motivo === "aperta" && (
                            <span className="mt-1.5 block text-xs text-yellow-300">
                              Pelo que você marcou, a carga não cabe neste. Dá pra seguir assim,
                              mas a gente confirma antes de sair.
                            </span>
                          )}
                          {resumo.totalItens > 0 && checagem.motivo === "ok" && (
                            <span className="mt-1.5 block text-xs text-green-400">
                              Cabe no que você marcou.
                            </span>
                          )}
                          {checagem.motivo === "excede_frota" && (
                            <span className="mt-1.5 block text-xs text-yellow-300">
                              Essa carga passa do nosso maior veículo — melhor falar com a gente.
                            </span>
                          )}
                        </span>
                        {escolhido && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#C9A84C]" />}
                      </button>
                    );
                  })}
                </div>
                {resumo.totalItens === 0 && (
                  <p className="mt-3 text-xs text-gray-600">
                    Você não marcou a carga — então aqui vale o que você sabe que precisa.
                  </p>
                )}
              </div>
            )}

            {/* 5 — QUANDO */}
            {passo === 4 && (
              <div className="grid gap-5">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-gray-300">
                    Dia que você precisa
                  </span>
                  <input
                    type="date"
                    aria-label="Dia que você precisa do frete"
                    value={data}
                    min={hojeISO()}
                    onChange={(e) => setData(e.target.value)}
                    className="w-full rounded-xl border border-gray-700 bg-[#111] px-4 py-3.5 text-lg text-white outline-none focus:border-[#C9A84C]"
                  />
                  {data && <span className="mt-1.5 block text-xs text-[#C9A84C]">{dataPorExtenso(data)}</span>}
                </label>
                <div>
                  <span className="mb-1.5 block text-sm font-semibold text-gray-300">Hora</span>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {JANELAS.map((j) => (
                      <button
                        key={j.chave}
                        type="button"
                        onClick={() => setJanela(j.chave)}
                        aria-label={`${j.nome}, ${j.detalhe}`}
                        aria-pressed={janela === j.chave}
                        className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                          janela === j.chave
                            ? "border-[#C9A84C] bg-[#C9A84C]/15"
                            : "border-gray-700 bg-[#111] hover:border-gray-500"
                        }`}
                      >
                        <span
                          className={`block text-sm font-bold ${janela === j.chave ? "text-[#C9A84C]" : "text-gray-300"}`}
                        >
                          {j.nome}
                        </span>
                        <span className="block text-xs text-gray-500">{j.detalhe}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 6 — ACESSO */}
            {passo === 5 && (
              <div>
                <p className="mb-4 text-sm text-gray-400">
                  Isso muda o orçamento: carregar no térreo não é a mesma coisa que subir escada.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["terreo", "Térreo", "🏠", "casa ou loja na rua"],
                      ["elevador", "Apartamento com elevador", "🛗", "elevador que leva os móveis"],
                      ["escada", "Apartamento sem elevador", "🪜", "tem que subir escada"],
                    ] as const
                  ).map(([v, label, emoji, detalhe]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAcesso(v)}
                      aria-label={label}
                      aria-pressed={acesso === v}
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        acesso === v
                          ? "border-[#C9A84C] bg-[#C9A84C]/15"
                          : "border-gray-800 bg-[#0A0A0A] hover:border-gray-600"
                      }`}
                    >
                      <span className="mb-1.5 block text-2xl" aria-hidden="true">
                        {emoji}
                      </span>
                      <span
                        className={`block text-sm font-bold leading-tight ${acesso === v ? "text-[#C9A84C]" : "text-white"}`}
                      >
                        {label}
                      </span>
                      <span className="block text-xs text-gray-500">{detalhe}</span>
                    </button>
                  ))}
                </div>
                {acesso === "escada" && (
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-gray-800 bg-black p-4">
                    <span className="text-sm text-gray-300">Quantos andares de escada</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={30}
                      value={andares}
                      onChange={(e) => setAndares(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                      className="w-20 rounded-lg border border-gray-700 bg-[#111] px-3 py-2 text-center text-white outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                )}
              </div>
            )}

            {/* 7 — AJUDANTES */}
            {passo === 6 && (
              <div>
                <p className="mb-4 text-sm text-gray-400">
                  Quantos ajudantes você quer, além do motorista?
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[0, 1, 2].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAjudantes(n)}
                      aria-label={n === 0 ? "Nenhum ajudante, só o motorista" : n === 1 ? "Um ajudante" : "Dois ajudantes"}
                      aria-pressed={ajudantes === n}
                      className={`rounded-2xl border p-4 text-center transition-colors ${
                        ajudantes === n
                          ? "border-[#C9A84C] bg-[#C9A84C]/15"
                          : "border-gray-800 bg-[#0A0A0A] hover:border-gray-600"
                      }`}
                    >
                      <span
                        className={`block text-2xl font-extrabold ${ajudantes === n ? "text-[#C9A84C]" : "text-white"}`}
                      >
                        {n}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {n === 0 ? "só o motorista" : n === 1 ? "um ajudante" : "dois ajudantes"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* AVANCAR / COTAR */}
            <button
              type="button"
              disabled={!podeAvancar}
              onClick={() => {
                if (passo < PASSOS.length - 1) setPasso((p) => p + 1);
                else void cotar();
              }}
              className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-black transition-transform enabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {passo < PASSOS.length - 1 ? (
                <>
                  Continuar <ArrowRight className="h-5 w-5" />
                </>
              ) : (
                <>
                  Ver meu preço <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
            {!podeAvancar && passo <= 1 && (
              <p className="mt-2.5 text-center text-xs text-gray-600">
                Escreve o bairro e toca no que aparecer embaixo.
              </p>
            )}
          </div>
        )}

        {carregando && (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-10 text-gray-300">
            <Loader2 className="h-5 w-5 animate-spin text-[#C9A84C]" /> Conferindo a distância…
          </div>
        )}

        {erroRede && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <p className="text-sm text-gray-300">{erroRede}</p>
          </div>
        )}

        {resp && resp.ok === false && (
          <div className="rounded-2xl border border-[#C9A84C]/30 bg-[#C9A84C]/5 p-5 md:p-7">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#C9A84C]" />
              <div>
                <p className="font-semibold text-white">
                  {resp.motivo === "area_indisponivel"
                    ? "Essa região a gente combina antes"
                    : "Preciso confirmar o bairro antes de dar preço"}
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  {resp.mensagem || "Confere o bairro e a cidade e tenta de novo."}
                </p>
                <p className="mt-3 text-xs text-gray-500">
                  A gente não chuta preço. Se o bairro não bate com a cidade, quem fala com você
                  é uma pessoa.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setResp(null);
                      setPasso(0);
                    }}
                    className="rounded-full border border-gray-600 px-6 py-3 text-sm font-bold text-gray-300"
                  >
                    Corrigir o bairro
                  </button>
                  <a
                    href={linkWhats(textoDaCotacao())}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-[#C9A84C] px-6 py-3 text-sm font-bold text-[#C9A84C] transition-colors hover:bg-[#C9A84C]/10"
                  >
                    <MessageCircle className="h-4 w-4" /> Falar com a gente
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {resp && resp.ok === true && veiculo && (
          <div>
            <div className="mb-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-400">
              <span>
                Distância: <strong className="text-white">{resp.km} km</strong>
              </span>
              {(resp.cidadeOrigem || resp.cidadeDestino) && (
                <span>
                  <strong className="text-white">{resp.cidadeOrigem ?? "—"}</strong> para{" "}
                  <strong className="text-white">{resp.cidadeDestino ?? "—"}</strong>
                </span>
              )}
              {resp.zona !== "normal" && (
                <span className="rounded-full border border-[#C9A84C]/30 px-3 py-1 text-xs text-[#C9A84C]">
                  {resp.zona === "fundao" ? "Região distante — acréscimo aplicado" : "Acesso difícil — acréscimo aplicado"}
                </span>
              )}
            </div>

            {/* O VALOR do veiculo que ele escolheu, grande. */}
            <div className="rounded-2xl border border-[#C9A84C] bg-[#C9A84C]/5 p-6 text-center md:p-8">
              <p className="text-sm text-gray-400">
                {VEICULOS.find((v) => v.chave === veiculo)?.nome}
                {data ? ` · ${dataPorExtenso(data)} — ${janela}` : ""}
              </p>
              <p className="mt-2 text-5xl font-extrabold text-white md:text-6xl">
                {reais(resp.precos[veiculo].total)}
              </p>
              <ul className="mx-auto mt-5 max-w-xs space-y-1 border-t border-[#C9A84C]/20 pt-4 text-left text-xs text-gray-400">
                <li className="flex justify-between">
                  <span>Frete</span>
                  <span>{reais(resp.precos[veiculo].base)}</span>
                </li>
                {resp.precos[veiculo].ajudante > 0 && (
                  <li className="flex justify-between">
                    <span>
                      {ajudantes} {ajudantes === 1 ? "ajudante" : "ajudantes"}
                    </span>
                    <span>{reais(resp.precos[veiculo].ajudante)}</span>
                  </li>
                )}
                {resp.precos[veiculo].elevador > 0 && (
                  <li className="flex justify-between">
                    <span>Elevador</span>
                    <span>{reais(resp.precos[veiculo].elevador)}</span>
                  </li>
                )}
                {resp.precos[veiculo].escada > 0 && (
                  <li className="flex justify-between">
                    <span>Escada ({andares})</span>
                    <span>{reais(resp.precos[veiculo].escada)}</span>
                  </li>
                )}
                {resp.precos[veiculo].feriado > 0 && (
                  <li className="flex justify-between">
                    <span>{resp.precos[veiculo].feriadoNome || "Feriado"}</span>
                    <span>{reais(resp.precos[veiculo].feriado)}</span>
                  </li>
                )}
              </ul>
              {encaixe?.motivo === "aperta" && (
                <p className="mt-4 text-xs text-yellow-300">
                  Pelo que você marcou, a carga pode não caber neste veículo. A gente confirma
                  antes de sair.
                </p>
              )}
            </div>

            {/* Os outros dois, pra trocar sem refazer nada. */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {VEICULOS.filter((v) => v.chave !== veiculo).map((v) => (
                <button
                  key={v.chave}
                  type="button"
                  onClick={() => setVeiculo(v.chave)}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-800 bg-[#0A0A0A] px-4 py-3 text-left hover:border-gray-600"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true">{v.emoji}</span>
                    <span className="truncate text-sm text-gray-300">{v.nome}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-white">
                    {reais(resp.precos[v.chave].total)}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs">
              <button
                type="button"
                onClick={() => {
                  setResp(null);
                  setPedido(null);
                  setPasso(0);
                }}
                className="text-gray-400 underline hover:text-white"
              >
                mudar alguma coisa
              </button>
              <Truck className="h-3.5 w-3.5 text-gray-700" aria-hidden="true" />
              <span className="text-gray-600">
                O endereço com número a gente combina quando você fechar.
              </span>
            </div>

            {pedido ? (
              <div className="mt-7 rounded-2xl border border-green-500/30 bg-green-500/5 p-6 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-green-400" />
                <p className="text-lg font-bold text-white">
                  Pedido <span className="text-[#C9A84C]">{pedido.codigo}</span> aberto
                </p>
                <p className="mt-2 text-sm text-gray-300">
                  {pedido.avisoCliente
                    ? "Mandei a confirmação no seu WhatsApp, com a carga que você marcou. O endereço completo a gente combina por lá."
                    : pedido.adminsAvisados > 0
                      ? "O pedido está registrado e a equipe já foi avisada. Não consegui te mandar no WhatsApp agora — chama a gente por lá com esse código."
                      : "O pedido está registrado com esse código. Nosso WhatsApp está fora do ar neste momento, então chama a gente por lá quando voltar — ou liga. Não deixa de falar com a gente."}
                </p>
                <a
                  href={linkWhats(`Oi! Fechei o pedido ${pedido.codigo} no site.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#C9A84C] px-8 py-3 text-sm font-bold text-black"
                >
                  <MessageCircle className="h-4 w-4" /> Abrir a conversa
                </a>
              </div>
            ) : (
              <div className="mt-7 grid gap-4 md:grid-cols-2">
                {/* CAMINHO 1 — o cliente manda. Nao depende de API nenhuma. */}
                <div className="flex flex-col rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
                  <p className="text-base font-bold text-white">Eu mesmo mando</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    Copia a cotação inteira — bairros, carga, veículo, dia e valor — e manda no
                    nosso WhatsApp de atendimento.
                  </p>
                  <div className="mt-auto flex flex-col gap-3 pt-5">
                    <button
                      type="button"
                      onClick={() => void copiarCotacao()}
                      className="flex items-center justify-center gap-2 rounded-full border border-[#C9A84C]/40 px-6 py-3 text-sm font-bold text-[#C9A84C] transition-colors hover:bg-[#C9A84C]/10"
                    >
                      {copiado ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" /> Copiar a cotação
                        </>
                      )}
                    </button>
                    <a
                      href={linkWhats(textoDaCotacao())}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-full bg-[#1f1a0e] px-6 py-3 text-sm font-bold text-[#C9A84C]"
                    >
                      <MessageCircle className="h-4 w-4" /> Abrir nosso WhatsApp
                    </a>
                  </div>
                </div>

                {/* CAMINHO 2 — o site fecha. */}
                <form
                  onSubmit={fecharPedido}
                  className="flex flex-col rounded-2xl border border-[#C9A84C]/30 bg-[#0A0A0A] p-6"
                >
                  <p className="text-base font-bold text-white">Vocês cuidam</p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    Fechando: {VEICULOS.find((v) => v.chave === veiculo)?.nome} por{" "}
                    {reais(resp.precos[veiculo].total)}. Só o nome e o WhatsApp — sem cadastro,
                    sem senha.
                  </p>

                  <div className="mt-5 grid gap-4">
                    <div>
                      <label htmlFor="pedido-nome" className="mb-2 block text-sm text-gray-400">
                        Seu nome
                      </label>
                      <input
                        id="pedido-nome"
                        value={nomeCliente}
                        onChange={(e) => setNomeCliente(e.target.value)}
                        required
                        minLength={2}
                        placeholder="Como posso te chamar"
                        className="w-full rounded-xl border border-gray-800 bg-black px-4 py-3 text-white outline-none focus:border-[#C9A84C]"
                      />
                    </div>
                    <div>
                      <label htmlFor="pedido-tel" className="mb-2 block text-sm text-gray-400">
                        Seu WhatsApp
                      </label>
                      <input
                        id="pedido-tel"
                        value={telCliente}
                        onChange={(e) => setTelCliente(e.target.value)}
                        required
                        inputMode="tel"
                        placeholder="DDD + número"
                        className="w-full rounded-xl border border-gray-800 bg-black px-4 py-3 text-white outline-none focus:border-[#C9A84C]"
                      />
                    </div>
                  </div>

                  {erroPedido && (
                    <p className="mt-4 flex items-start gap-2 text-sm text-red-400">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {erroPedido}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={fechando}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#C9A84C] px-10 py-4 text-lg font-bold text-black transition-transform hover:scale-[1.02] disabled:opacity-60"
                  >
                    {fechando ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" /> Abrindo o pedido...
                      </>
                    ) : (
                      <>
                        Confirmar pedido <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* Confianca: numero real, agregado, sem dado de ninguem */}
        <div className="mt-12 rounded-2xl border border-gray-800 bg-[#060606] p-6 md:p-8">
          <div className="mb-5 inline-flex items-center gap-2 text-[#C9A84C]">
            <BadgeCheck className="h-5 w-5" />
            <h3 className="font-bold">Quem vai fazer o seu frete</h3>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            {[
              { n: conf?.fretistasVerificados, label: "fretistas verificados" },
              { n: conf?.fretesConcluidos, label: "fretes concluídos" },
              {
                n: conf?.notaMedia,
                label: conf?.totalAvaliacoes
                  ? `nota média (${conf.totalAvaliacoes} avaliações)`
                  : "nota média",
              },
            ].map((item, i) => (
              <div key={i} className="rounded-xl border border-gray-800 bg-[#0A0A0A] p-4 text-center">
                <p className="text-2xl font-extrabold text-white">
                  {item.n === null || item.n === undefined ? "—" : item.n}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">{item.label}</p>
              </div>
            ))}
          </div>

          <p className="mb-3 text-sm text-gray-400">
            Nenhum fretista entra sem passar por conferência de:
          </p>
          <ul className="grid gap-2 text-sm text-gray-300 sm:grid-cols-2">
            {(conf?.verificacoes ?? [
              "Documento com foto",
              "Selfie com o documento",
              "Placa do veículo",
              "Foto do veículo",
            ]).map((v) => (
              <li key={v} className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 shrink-0 text-[#C9A84C]" />
                {v}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-gray-500">
            Quando um fretista aceitar o seu frete, você recebe o nome dele, o veículo e a placa
            antes de ele sair. Os documentos do cadastro ficam guardados com a gente e não são
            publicados.
          </p>
        </div>
      </div>
    </section>
  );
}
