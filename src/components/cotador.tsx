"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Truck,
} from "lucide-react";
import { fetchComTimeout } from "@/lib/fetch-utils";

// Cotacao fechada na tela, com o mesmo motor que o WhatsApp usa (/api/cotar ->
// calcularPrecosCompleto). O cliente ve o preco antes de falar com ninguem.
//
// LEI: jamais cotar sem certeza. Quando a rota nao confirma o endereco ou a area
// nao e atendida, esta tela NAO mostra preco nenhum — mostra o caminho pro humano.

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

type TabelaPrecos = {
  utilitario: PrecoDetalhado;
  hr: PrecoDetalhado;
  caminhao_bau: PrecoDetalhado;
};

type Chave = keyof TabelaPrecos;

const VEICULOS: Array<{ chave: Chave; nome: string; cabe: string }> = [
  { chave: "utilitario", nome: "Utilitário", cabe: "Fiorino, Kangoo. Até uns 10 volumes ou 1 móvel grande" },
  { chave: "hr", nome: "HR / Van", cabe: "Mudança de 1 quarto, geladeira, sofá de 3 lugares" },
  { chave: "caminhao_bau", nome: "Caminhão baú", cabe: "Mudança inteira, carga alta ou comprida" },
];

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

export function Cotador() {
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [ajudante, setAjudante] = useState(false);
  const [acesso, setAcesso] = useState<"terreo" | "elevador" | "escada">("terreo");
  const [andares, setAndares] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [resp, setResp] = useState<Resposta | null>(null);
  const [erroRede, setErroRede] = useState<string | null>(null);
  const [conf, setConf] = useState<Confianca | null>(null);

  // Fechamento do pedido NO SITE. Antes isso nao existia: o botao so abria o
  // WhatsApp e nada era registrado.
  const [veiculoEscolhido, setVeiculoEscolhido] = useState<Chave | null>(null);
  const [nomeCliente, setNomeCliente] = useState("");
  const [telCliente, setTelCliente] = useState("");
  const [fechando, setFechando] = useState(false);
  const [erroPedido, setErroPedido] = useState<string | null>(null);
  const [pedido, setPedido] = useState<{ codigo: string; valor: number; avisoCliente: boolean } | null>(null);

  async function fecharPedido(e: React.FormEvent) {
    e.preventDefault();
    if (!veiculoEscolhido) return;
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
            ajudante,
            elevador: acesso === "elevador",
            andares: acesso === "escada" ? andares : 0,
            veiculo: veiculoEscolhido,
            nome: nomeCliente,
            telefone: telCliente,
          }),
        },
        25000,
      );
      const d = await r.json();
      if (d?.ok) {
        setPedido({ codigo: d.codigo, valor: d.valor, avisoCliente: d.avisoCliente !== false });
      } else {
        setErroPedido(d?.mensagem || "Não consegui abrir o pedido. Tenta de novo ou fala no WhatsApp.");
      }
    } catch {
      setErroPedido("Deu problema na conexão. Tenta de novo ou fala no WhatsApp.");
    } finally {
      setFechando(false);
    }
  }

  useEffect(() => {
    fetchComTimeout("/api/confianca", {}, 10000)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setConf(d))
      .catch(() => setConf(null));
  }, []);

  async function cotar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setResp(null);
    setErroRede(null);
    try {
      const r = await fetchComTimeout(
        "/api/cotar",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origem,
            destino,
            ajudante,
            elevador: acesso === "elevador",
            andares: acesso === "escada" ? andares : 0,
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

  const linkWhats = (extra: string) =>
    `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(extra)}`;

  const resumoPedido = `Oi! Cotei no site: de ${origem} para ${destino}${
    ajudante ? ", com ajudante" : ""
  }${acesso === "elevador" ? ", com elevador" : ""}${
    acesso === "escada" ? `, ${andares} andar(es) de escada` : ""
  }.`;

  return (
    <section id="cotar" className="border-t border-[#C9A84C]/10 py-16 md:py-24" style={{ background: "#000" }}>
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="mb-3 text-center text-3xl font-extrabold md:text-4xl">
          Seu preço <span className="text-[#C9A84C]">agora</span>, nesta tela
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-center text-gray-400">
          Mesma tabela que o atendimento usa. Sem cadastro, sem esperar ninguém responder.
        </p>

        <form
          onSubmit={cotar}
          className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5 md:p-8"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-gray-300">De onde sai</span>
              <input
                required
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                placeholder="Rua, número e bairro — ou o CEP"
                maxLength={200}
                className="w-full rounded-xl border border-gray-700 bg-[#111] px-4 py-3 text-white placeholder-gray-600 outline-none focus:border-[#C9A84C]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-gray-300">Pra onde vai</span>
              <input
                required
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="Rua, número e bairro — ou o CEP"
                maxLength={200}
                className="w-full rounded-xl border border-gray-700 bg-[#111] px-4 py-3 text-white placeholder-gray-600 outline-none focus:border-[#C9A84C]"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-gray-300">Como é o acesso</span>
              <div className="flex flex-wrap gap-2">
                {([
                  ["terreo", "Térreo"],
                  ["elevador", "Elevador"],
                  ["escada", "Escada"],
                ] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAcesso(v)}
                    className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      acesso === v
                        ? "border-[#C9A84C] bg-[#C9A84C]/15 text-[#C9A84C]"
                        : "border-gray-700 bg-[#111] text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {acesso === "escada" && (
                <label className="mt-3 flex items-center gap-3">
                  <span className="text-sm text-gray-400">Quantos andares</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={andares}
                    onChange={(e) => setAndares(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                    className="w-20 rounded-lg border border-gray-700 bg-[#111] px-3 py-2 text-white outline-none focus:border-[#C9A84C]"
                  />
                </label>
              )}
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-semibold text-gray-300">Precisa de ajudante</span>
              <div className="flex gap-2">
                {([
                  [false, "Não, só o motorista"],
                  [true, "Sim, com ajudante"],
                ] as const).map(([v, label]) => (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setAjudante(v)}
                    className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                      ajudante === v
                        ? "border-[#C9A84C] bg-[#C9A84C]/15 text-[#C9A84C]"
                        : "border-gray-700 bg-[#111] text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-black transition-transform hover:scale-[1.02] disabled:opacity-60 md:w-auto md:px-12"
          >
            {carregando ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Conferindo os endereços…
              </>
            ) : (
              <>
                Ver meu preço <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </form>

        {erroRede && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <p className="text-sm text-gray-300">{erroRede}</p>
          </div>
        )}

        {resp && resp.ok === false && (
          <div className="mt-6 rounded-2xl border border-[#C9A84C]/30 bg-[#C9A84C]/5 p-5 md:p-7">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#C9A84C]" />
              <div>
                <p className="font-semibold text-white">
                  {resp.motivo === "area_indisponivel"
                    ? "Essa região a gente combina antes"
                    : "Preciso confirmar o endereço antes de dar preço"}
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  {resp.mensagem || "Confere os endereços e tenta de novo."}
                </p>
                <p className="mt-3 text-xs text-gray-500">
                  A gente não chuta preço. Se o endereço não bate, quem fala com você é uma pessoa.
                </p>
                <a
                  href={linkWhats(resumoPedido)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#C9A84C] px-6 py-3 text-sm font-bold text-[#C9A84C] transition-colors hover:bg-[#C9A84C]/10"
                >
                  <MessageCircle className="h-4 w-4" /> Falar com a gente
                </a>
              </div>
            </div>
          </div>
        )}

        {resp && resp.ok === true && (
          <div className="mt-8">
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

            <div className="grid gap-4 md:grid-cols-3">
              {VEICULOS.map(({ chave, nome, cabe }) => {
                const p = resp.precos[chave];
                return (
                  <div
                    key={chave}
                    className="flex flex-col rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6"
                  >
                    <div className="mb-2 inline-flex items-center gap-2 text-[#C9A84C]">
                      <Truck className="h-5 w-5" />
                      <h3 className="font-bold">{nome}</h3>
                    </div>
                    <p className="mb-4 text-xs leading-relaxed text-gray-500">{cabe}</p>
                    <p className="text-3xl font-extrabold text-white">{reais(p.total)}</p>
                    <ul className="mt-4 space-y-1 border-t border-gray-800 pt-4 text-xs text-gray-400">
                      <li className="flex justify-between">
                        <span>Frete</span>
                        <span>{reais(p.base)}</span>
                      </li>
                      {p.ajudante > 0 && (
                        <li className="flex justify-between">
                          <span>Ajudante</span>
                          <span>{reais(p.ajudante)}</span>
                        </li>
                      )}
                      {p.elevador > 0 && (
                        <li className="flex justify-between">
                          <span>Elevador</span>
                          <span>{reais(p.elevador)}</span>
                        </li>
                      )}
                      {p.escada > 0 && (
                        <li className="flex justify-between">
                          <span>Escada</span>
                          <span>{reais(p.escada)}</span>
                        </li>
                      )}
                      {p.feriado > 0 && (
                        <li className="flex justify-between">
                          <span>{p.feriadoNome || "Feriado"}</span>
                          <span>{reais(p.feriado)}</span>
                        </li>
                      )}
                    </ul>

                    <button
                      type="button"
                      onClick={() => {
                        setVeiculoEscolhido(chave);
                        setPedido(null);
                        setErroPedido(null);
                      }}
                      className={`mt-5 w-full rounded-full px-4 py-3 text-sm font-bold transition-colors ${
                        veiculoEscolhido === chave
                          ? "bg-[#C9A84C] text-black"
                          : "border border-[#C9A84C]/40 text-[#C9A84C] hover:bg-[#C9A84C]/10"
                      }`}
                    >
                      {veiculoEscolhido === chave ? "Escolhido" : "Fechar com este"}
                    </button>
                  </div>
                );
              })}
            </div>

            <p className="mt-5 text-center text-xs leading-relaxed text-gray-500">
              O veículo certo é confirmado pela foto da carga — por isso os três preços
              aparecem juntos. O que estiver na tela é o que você paga para o veículo
              escolhido; se a carga não couber nele, a gente te avisa antes de sair.
            </p>

            {pedido ? (
              <div className="mt-7 rounded-2xl border border-green-500/30 bg-green-500/5 p-6 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-green-400" />
                <p className="text-lg font-bold text-white">
                  Pedido <span className="text-[#C9A84C]">{pedido.codigo}</span> aberto
                </p>
                <p className="mt-2 text-sm text-gray-300">
                  {pedido.avisoCliente
                    ? "Mandei a confirmação no seu WhatsApp. Responde lá com uma foto da carga pra eu confirmar o veículo."
                    : "O pedido está registrado e a equipe já foi avisada. Não consegui te mandar no WhatsApp agora — chama a gente por lá com esse código."}
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
            ) : veiculoEscolhido ? (
              <form
                onSubmit={fecharPedido}
                className="mt-7 rounded-2xl border border-[#C9A84C]/30 bg-[#0A0A0A] p-6"
              >
                <p className="mb-1 text-center text-base font-bold text-white">
                  Fechando: {VEICULOS.find((v) => v.chave === veiculoEscolhido)?.nome} por{" "}
                  {reais(resp.precos[veiculoEscolhido].total)}
                </p>
                <p className="mb-5 text-center text-xs text-gray-500">
                  Só o nome e o WhatsApp. Sem cadastro, sem senha.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
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

                <p className="mt-4 text-center text-xs text-gray-500">
                  Prefere conversar antes?{" "}
                  <a
                    href={linkWhats(resumoPedido)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#C9A84C] underline"
                  >
                    fala no WhatsApp
                  </a>
                </p>
              </form>
            ) : (
              <p className="mt-7 text-center text-sm text-gray-400">
                Escolhe o veículo acima pra fechar o pedido aqui mesmo — ou{" "}
                <a
                  href={linkWhats(resumoPedido)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#C9A84C] underline"
                >
                  fala no WhatsApp
                </a>
                .
              </p>
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
            Quando um fretista aceitar o seu frete, você recebe o nome dele, o veículo e a
            placa antes de ele sair. Os documentos do cadastro ficam guardados com a gente e
            não são publicados.
          </p>
        </div>
      </div>
    </section>
  );
}
