"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Truck, Package, MapPin, UserPlus, CheckCircle2, Loader2 } from "lucide-react";

// Itens simples e familiares pros fretistas
const ITENS_DISPONIVEIS = [
  "Geladeira", "Fogao", "Maquina de lavar", "Microondas",
  "Cama casal", "Cama solteiro", "Colchao", "Guarda-roupa",
  "Sofa 2 lugares", "Sofa 3 lugares", "Mesa 4 lugares", "Mesa 6 lugares",
  "Rack de TV", "TV grande", "Armario cozinha", "Estante",
  "Escrivaninha", "Poltrona", "Comoda", "Bicicleta",
  "Ar condicionado", "Caixas (varias)",
];

const DISTANCIAS_PRONTAS = [3, 5, 10, 15, 20, 30, 50];
const ZONAS = [
  { value: "normal", label: "Zona normal" },
  { value: "dificil", label: "Zona dificil" },
  { value: "fundao", label: "Fundao (periferia)" },
];

export default function PrecosPage() {
  const [veiculo, setVeiculo] = useState<"utilitario" | "hr" | null>(null);
  const [itens, setItens] = useState<string[]>([]);
  const [distancia, setDistancia] = useState<number | null>(null);
  const [ajudante, setAjudante] = useState<boolean | null>(null);
  const [zona, setZona] = useState("normal");

  const [preco, setPreco] = useState<number | null>(null);
  const [calculando, setCalculando] = useState(false);

  const [opiniao, setOpiniao] = useState<"barato" | "justo" | "caro" | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [comentario, setComentario] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");

  // Calcula o preco automaticamente quando muda veiculo/distancia/ajudante/zona
  useEffect(() => {
    if (!veiculo || distancia === null) { setPreco(null); return; }
    setCalculando(true);
    const params = new URLSearchParams({
      veiculo,
      distancia: String(distancia),
      ajudante: String(ajudante === true),
      zona,
    });
    fetch(`/api/feedback-preco?${params}`)
      .then(r => r.json())
      .then(d => { setPreco(d.preco || null); setCalculando(false); })
      .catch(() => { setPreco(null); setCalculando(false); });
  }, [veiculo, distancia, ajudante, zona]);

  function toggleItem(item: string) {
    setItens(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
  }

  function resetar() {
    setVeiculo(null);
    setItens([]);
    setDistancia(null);
    setAjudante(null);
    setZona("normal");
    setPreco(null);
    setOpiniao(null);
    setNome("");
    setTelefone("");
    setComentario("");
    setEnviado(false);
    setErro("");
    window.scrollTo(0, 0);
  }

  async function enviarOpiniao(op: "barato" | "justo" | "caro") {
    if (!veiculo || distancia === null || !preco) {
      setErro("Complete todas as opcoes antes de enviar");
      return;
    }
    if (itens.length === 0) {
      setErro("Marque pelo menos 1 item que vai carregar");
      return;
    }
    setOpiniao(op);
    setEnviando(true);
    setErro("");

    try {
      const res = await fetch("/api/feedback-preco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          veiculo,
          itens: itens.join(" + "),
          qtdItens: itens.length,
          distanciaKm: distancia,
          temAjudante: ajudante === true,
          zona,
          precoCalculado: preco,
          opiniao: op,
          fretistaNome: nome.trim(),
          fretistaTelefone: telefone.replace(/\D/g, ""),
          comentario: comentario.trim(),
        }),
      });

      if (res.ok) {
        setEnviado(true);
      } else {
        const data = await res.json();
        setErro(data.error || "Erro ao enviar");
      }
    } catch {
      setErro("Erro de conexao. Tenta de novo.");
    }
    setEnviando(false);
  }

  // Tela de sucesso
  if (enviado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
        <div className="w-full max-w-md rounded-3xl border border-[#C9A84C]/30 bg-[#0A0A0A] p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-20 w-20 text-green-400" />
          <h1 className="text-2xl font-bold text-white">Obrigado!</h1>
          <p className="mt-3 text-gray-400">
            Sua opiniao foi registrada. Isso ajuda a Pegue a manter precos justos pra voce e pros clientes! 🚚
          </p>

          <button
            onClick={resetar}
            className="mt-8 w-full rounded-2xl bg-[#C9A84C] py-4 text-lg font-bold text-black hover:bg-[#b8963f]"
          >
            Avaliar outro frete
          </button>

          <p className="mt-6 text-xs text-gray-500">Relaxa. A gente leva. 🚚✨</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000] pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[#C9A84C]/20 bg-[#000]/95 backdrop-blur">
        <div className="mx-auto max-w-xl px-4 py-4 flex items-center gap-3">
          <Image src="/logo-pegue-novo.png" alt="Pegue" width={40} height={40} className="h-10 w-auto" />
          <div>
            <p className="font-bold text-white">Avalie nossos preços</p>
            <p className="text-[11px] text-gray-400">Sua opinião ajuda a manter precos justos</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 py-6 space-y-5">

        {/* Passo 1: Veiculo */}
        <Card titulo="1. Qual veículo?" icone={<Truck className="h-5 w-5" />}>
          <div className="grid grid-cols-2 gap-3">
            <BotaoGrande
              ativo={veiculo === "utilitario"}
              onClick={() => setVeiculo("utilitario")}
              titulo="Utilitário"
              subtitulo="Strada, Saveiro"
            />
            <BotaoGrande
              ativo={veiculo === "hr"}
              onClick={() => setVeiculo("hr")}
              titulo="HR"
              subtitulo="Hyundai HR, Bongo"
            />
          </div>
        </Card>

        {/* Passo 2: Itens */}
        <Card titulo={`2. O que vai carregar? ${itens.length > 0 ? `(${itens.length} marcados)` : ""}`} icone={<Package className="h-5 w-5" />}>
          <div className="grid grid-cols-2 gap-2">
            {ITENS_DISPONIVEIS.map(item => (
              <button
                key={item}
                onClick={() => toggleItem(item)}
                className={`rounded-xl border-2 p-3 text-left text-sm transition ${
                  itens.includes(item)
                    ? "border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C] font-bold"
                    : "border-gray-800 bg-[#0A0A0A] text-gray-300"
                }`}
              >
                {itens.includes(item) ? "✓ " : ""}{item}
              </button>
            ))}
          </div>
        </Card>

        {/* Passo 3: Distancia */}
        <Card titulo="3. Distância" icone={<MapPin className="h-5 w-5" />}>
          <div className="grid grid-cols-3 gap-2">
            {DISTANCIAS_PRONTAS.map(km => (
              <button
                key={km}
                onClick={() => setDistancia(km)}
                className={`rounded-xl border-2 py-4 text-lg font-bold transition ${
                  distancia === km
                    ? "border-[#C9A84C] bg-[#C9A84C] text-black"
                    : "border-gray-800 bg-[#0A0A0A] text-gray-300"
                }`}
              >
                {km} km
              </button>
            ))}
          </div>
          <div className="mt-3">
            <p className="mb-1 text-xs text-gray-500">Ou digite outra distância:</p>
            <input
              type="number"
              min={1} max={150}
              value={distancia || ""}
              onChange={e => setDistancia(parseInt(e.target.value) || null)}
              placeholder="Ex: 25"
              className="w-full rounded-xl border-2 border-gray-800 bg-[#0A0A0A] px-4 py-3 text-center text-lg font-bold text-white focus:border-[#C9A84C] focus:outline-none"
            />
          </div>

          {/* Zona (avancado, mas simples) */}
          <div className="mt-4">
            <p className="mb-2 text-xs text-gray-500">Tipo de região:</p>
            <div className="grid grid-cols-3 gap-2">
              {ZONAS.map(z => (
                <button
                  key={z.value}
                  onClick={() => setZona(z.value)}
                  className={`rounded-lg border-2 py-2 text-xs font-semibold transition ${
                    zona === z.value
                      ? "border-[#C9A84C] bg-[#C9A84C]/10 text-[#C9A84C]"
                      : "border-gray-800 bg-[#0A0A0A] text-gray-400"
                  }`}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Passo 4: Ajudante */}
        <Card titulo="4. Precisa de ajudante?" icone={<UserPlus className="h-5 w-5" />}>
          <div className="grid grid-cols-2 gap-3">
            <BotaoGrande
              ativo={ajudante === false}
              onClick={() => setAjudante(false)}
              titulo="NÃO"
              subtitulo="Eu sozinho dou conta"
            />
            <BotaoGrande
              ativo={ajudante === true}
              onClick={() => setAjudante(true)}
              titulo="SIM"
              subtitulo="Preciso de ajudante"
            />
          </div>
        </Card>

        {/* RESULTADO */}
        {veiculo && distancia && preco !== null && (
          <div className="rounded-3xl border-2 border-[#C9A84C] bg-gradient-to-b from-[#C9A84C]/10 to-[#0A0A0A] p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C9A84C]">
              💰 Valor cobrado pela Pegue
            </p>
            <p className="mt-2 text-5xl font-extrabold text-white">
              {calculando ? <Loader2 className="mx-auto h-12 w-12 animate-spin" /> : `R$ ${preco}`}
            </p>
            <p className="mt-3 text-sm text-gray-400">
              Você receberia <strong className="text-white">R$ {Math.round(preco * 0.88)}</strong> (88%)
            </p>
          </div>
        )}

        {/* OPINIAO */}
        {veiculo && distancia && preco !== null && itens.length > 0 && !enviando && (
          <Card titulo="5. Na sua opinião, esse preço tá..." icone={null}>
            <div className="space-y-3">
              <button
                onClick={() => enviarOpiniao("caro")}
                className="w-full rounded-2xl bg-red-900/30 border-2 border-red-500/50 p-4 text-left hover:bg-red-900/50"
              >
                <p className="text-xl font-bold text-red-300">😡 Tá caro demais</p>
                <p className="mt-1 text-xs text-red-400/70">Cobraria menos que isso</p>
              </button>

              <button
                onClick={() => enviarOpiniao("justo")}
                className="w-full rounded-2xl bg-green-900/30 border-2 border-green-500/50 p-4 text-left hover:bg-green-900/50"
              >
                <p className="text-xl font-bold text-green-300">🙂 Tá justo</p>
                <p className="mt-1 text-xs text-green-400/70">Preço bom, cobraria esse valor</p>
              </button>

              <button
                onClick={() => enviarOpiniao("barato")}
                className="w-full rounded-2xl bg-yellow-900/30 border-2 border-yellow-500/50 p-4 text-left hover:bg-yellow-900/50"
              >
                <p className="text-xl font-bold text-yellow-300">😐 Tá barato</p>
                <p className="mt-1 text-xs text-yellow-400/70">Cobraria mais que isso</p>
              </button>
            </div>
          </Card>
        )}

        {/* Dados opcionais */}
        {veiculo && distancia && preco !== null && (
          <Card titulo="Seus dados (opcional)" icone={null}>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Seu nome (opcional)"
              className="mb-2 w-full rounded-xl border-2 border-gray-800 bg-[#0A0A0A] px-4 py-3 text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
            />
            <input
              type="tel"
              value={telefone}
              onChange={e => setTelefone(e.target.value)}
              placeholder="WhatsApp (opcional) — pra Pegue te conhecer"
              className="mb-2 w-full rounded-xl border-2 border-gray-800 bg-[#0A0A0A] px-4 py-3 text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
            />
            <textarea
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              placeholder="Comentário (opcional) — alguma observação sobre o preço?"
              rows={2}
              className="w-full rounded-xl border-2 border-gray-800 bg-[#0A0A0A] px-4 py-3 text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none resize-none"
            />
          </Card>
        )}

        {enviando && (
          <div className="rounded-2xl bg-[#C9A84C]/10 border-2 border-[#C9A84C]/30 p-4 text-center text-[#C9A84C]">
            <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
            Enviando sua opinião...
          </div>
        )}

        {erro && (
          <div className="rounded-2xl bg-red-900/30 border-2 border-red-500/50 p-4 text-center text-red-300">
            ⚠️ {erro}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-gray-600">
          🔒 Dados anônimos por padrão · Pegue - Relaxa. A gente leva.
        </p>
      </div>
    </div>
  );
}

function Card({ titulo, icone, children }: { titulo: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
      <div className="mb-3 flex items-center gap-2">
        {icone && <div className="text-[#C9A84C]">{icone}</div>}
        <h2 className="font-bold text-white">{titulo}</h2>
      </div>
      {children}
    </div>
  );
}

function BotaoGrande({ ativo, onClick, titulo, subtitulo }: {
  ativo: boolean; onClick: () => void; titulo: string; subtitulo: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 p-4 text-left transition ${
        ativo
          ? "border-[#C9A84C] bg-[#C9A84C] text-black"
          : "border-gray-800 bg-[#0A0A0A] text-gray-300"
      }`}
    >
      <p className="text-lg font-bold">{titulo}</p>
      <p className={`mt-0.5 text-xs ${ativo ? "text-black/70" : "text-gray-500"}`}>{subtitulo}</p>
    </button>
  );
}
