"use client";

import { useState, useRef, useEffect } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import {
  MapPin,
  ArrowRight,
  Camera,
  Upload,
  X,
  Loader2,
  AlertCircle,
  Navigation,
  Building,
  Plus,
} from "lucide-react";
import { WHATSAPP_LINK } from "@/lib/constants";
import { Package, Truck as TruckIcon } from "lucide-react";

type AnaliseIA = {
  item: string;
  quantidade: string;
  tamanho: string;
  veiculo_sugerido: string;
  observacao: string;
};

type ItemFoto = {
  id: string;
  foto: string;
  analise: AnaliseIA | null;
  analisando: boolean;
};

// Geocodificar via Nominatim
async function geocodificar(
  endereco: string
): Promise<{ lat: number; lng: number; nome: string } | null> {
  const cepClean = endereco.replace(/\D/g, "");
  if (cepClean.length === 8) {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
      const data = await r.json();
      if (!data.erro && data.localidade) {
        const q = `${data.logradouro || ""}, ${data.bairro || ""}, ${data.localidade}, ${data.uf}, Brasil`;
        return await geocodificarNominatim(q, `${data.bairro || data.localidade}, ${data.localidade}`);
      }
    } catch {}
  }
  return await geocodificarNominatim(endereco + ", Sao Paulo, Brasil", endereco);
}

async function geocodificarNominatim(
  query: string,
  _nomeExibicao: string
): Promise<{ lat: number; lng: number; nome: string } | null> {
  try {
    const encoded = encodeURIComponent(query);
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=br`,
      { headers: { "Accept-Language": "pt-BR" } }
    );
    const data = await r.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        nome: data[0].display_name.split(",").slice(0, 3).join(",").trim(),
      };
    }
  } catch {}
  return null;
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "pt-BR" } }
    );
    const data = await r.json();
    if (data && data.address) {
      const a = data.address;
      return [a.road, a.suburb || a.neighbourhood, a.city || a.town || a.municipality]
        .filter(Boolean)
        .join(", ");
    }
  } catch {}
  return null;
}

function calcularDistancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.35 * 10) / 10;
}

function calcularPrecos(distanciaKm: number, totalItens: number) {
  const PRECO_KM = 8;
  const KM_MINIMO = 5;
  const VALOR_MINIMO = 80;
  const ADICIONAL_AJUDANTE = 80;

  const kmCobrado = Math.max(distanciaKm, KM_MINIMO);
  const precoBase = kmCobrado * PRECO_KM;

  // Ajuste por volume: mais itens = veiculo maior
  const multVolume = totalItens <= 1 ? 1.0 : totalItens <= 3 ? 1.2 : totalItens <= 6 ? 1.5 : 1.8;

  return {
    economica: Math.max(Math.round(precoBase * multVolume), VALOR_MINIMO),
    padrao: Math.max(Math.round(precoBase * 1.6 * multVolume + ADICIONAL_AJUDANTE), VALOR_MINIMO + 80),
    premium: Math.max(Math.round(precoBase * 2.0 * multVolume + ADICIONAL_AJUDANTE * 2), VALOR_MINIMO + 160),
  };
}

function melhorVeiculo(itens: ItemFoto[]): string {
  const veiculos = itens.map((i) => i.analise?.veiculo_sugerido || "utilitario");
  if (veiculos.includes("caminhao_bau")) return "Caminhao bau";
  if (veiculos.includes("van")) return "Van";
  return "Utilitario";
}

export default function SimularPage() {
  const [itens, setItens] = useState<ItemFoto[]>([]);
  const [destino, setDestino] = useState("");
  const [calculado, setCalculado] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState("");
  const [distancia, setDistancia] = useState(0);
  const [origemNome, setOrigemNome] = useState("");
  const [destinoNome, setDestinoNome] = useState("");
  const [precos, setPrecos] = useState({ economica: 0, padrao: 0, premium: 0 });
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "ok" | "denied">("idle");
  const [origemLat, setOrigemLat] = useState<number | null>(null);
  const [origemLng, setOrigemLng] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    detectarLocalizacao();
  }, []);

  function detectarLocalizacao() {
    if (!navigator.geolocation) {
      setGpsStatus("denied");
      return;
    }
    setGpsStatus("loading");

    // Tenta com alta precisao primeiro
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setOrigemLat(pos.coords.latitude);
        setOrigemLng(pos.coords.longitude);
        const nome = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setOrigemNome(nome || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        setGpsStatus("ok");
      },
      () => {
        // Se falha com alta precisao, tenta sem
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            setOrigemLat(pos.coords.latitude);
            setOrigemLng(pos.coords.longitude);
            const nome = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
            setOrigemNome(nome || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
            setGpsStatus("ok");
          },
          () => setGpsStatus("denied"),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function analisarFoto(base64: string): Promise<AnaliseIA | null> {
    try {
      const res = await fetch("/api/analisar-foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      return await res.json();
    } catch {
      return null;
    }
  }

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (itens.length >= 10) return;

      const id = Math.random().toString(36).slice(2, 9);
      const reader = new FileReader();

      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        const novoItem: ItemFoto = { id, foto: base64, analise: null, analisando: true };

        setItens((prev) => [...prev, novoItem]);
        setCalculado(false);

        const analise = await analisarFoto(base64);
        setItens((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, analise, analisando: false } : item
          )
        );
      };
      reader.readAsDataURL(file);
    });

    // Reset input para permitir selecionar o mesmo arquivo
    e.target.value = "";
  }

  function removerItem(id: string) {
    setItens((prev) => prev.filter((i) => i.id !== id));
    setCalculado(false);
  }

  async function handleSimular(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCalculando(true);
    setCalculado(false);

    try {
      // Resolve origem
      let oLat = origemLat;
      let oLng = origemLng;

      if (!oLat || !oLng) {
        if (origemNome && origemNome.length > 2) {
          const localOrigem = await geocodificar(origemNome);
          if (localOrigem) {
            oLat = localOrigem.lat;
            oLng = localOrigem.lng;
            setOrigemLat(localOrigem.lat);
            setOrigemLng(localOrigem.lng);
            setOrigemNome(localOrigem.nome);
            setGpsStatus("ok");
          } else {
            setErro("Endereco de origem nao encontrado. Verifique e tente novamente.");
            setCalculando(false);
            return;
          }
        } else {
          setErro("Informe o endereco de origem ou ative o GPS.");
          setCalculando(false);
          return;
        }
      }

      const localDestino = await geocodificar(destino);
      if (!localDestino) {
        setErro("Destino nao encontrado. Verifique o nome da cidade, bairro ou CEP.");
        setCalculando(false);
        return;
      }

      const dist = calcularDistancia(oLat!, oLng!, localDestino.lat, localDestino.lng);
      const p = calcularPrecos(dist, itens.length);

      setDistancia(dist);
      setDestinoNome(localDestino.nome);
      setPrecos(p);
      setCalculado(true);
    } catch {
      setErro("Erro ao calcular. Tente novamente.");
    }
    setCalculando(false);
  }

  const algumAnalisando = itens.some((i) => i.analisando);

  return (
    <>
      <Header />

      <main className="flex-1 bg-[#0A0A0A] py-12">
        <div className="mx-auto max-w-lg px-4">
          <h1 className="text-center text-3xl font-extrabold text-white md:text-4xl">
            Tire a foto.{" "}
            <span className="text-[#C9A84C]">Receba o valor.</span>
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            Envie fotos dos itens. A gente detecta sua localizacao. Voce so diz para onde vai.
          </p>

          <form onSubmit={handleSimular} className="mt-8 space-y-5">

            {/* FOTOS DOS ITENS */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-gray-500">
                  Fotos dos itens ({itens.length}/10)
                </span>
                {itens.length > 0 && (
                  <span className="text-xs text-gray-600">
                    {itens.filter((i) => i.analise).length} analisado(s)
                  </span>
                )}
              </div>

              {/* Grid de fotos */}
              {itens.length > 0 && (
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {itens.map((item) => (
                    <div key={item.id} className="relative">
                      <img
                        src={item.foto}
                        alt="Item"
                        className="h-28 w-full rounded-xl border border-gray-800 object-cover"
                      />
                      {/* Overlay com analise */}
                      {item.analisando && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60">
                          <Loader2 size={20} className="animate-spin text-[#C9A84C]" />
                        </div>
                      )}
                      {item.analise && !item.analisando && (
                        <div className="absolute bottom-0 left-0 right-0 rounded-b-xl bg-black/70 px-2 py-1">
                          <p className="truncate text-[10px] font-semibold text-[#C9A84C]">
                            {item.analise.item}
                          </p>
                          <p className="text-[9px] text-gray-400">{item.analise.tamanho}</p>
                        </div>
                      )}
                      {/* Botao remover */}
                      <button
                        type="button"
                        onClick={() => removerItem(item.id)}
                        className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-red-500"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Botoes de adicionar foto */}
              {itens.length < 10 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (cameraInputRef.current) {
                        cameraInputRef.current.value = "";
                        cameraInputRef.current.click();
                      }
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-dashed ${itens.length === 0 ? "border-[#C9A84C]/40 bg-[#C9A84C]/5 py-10" : "border-gray-700 py-4"} text-[#C9A84C] transition-all hover:border-[#C9A84C]`}
                  >
                    <Camera size={itens.length === 0 ? 28 : 18} />
                    <span className={`font-semibold ${itens.length === 0 ? "text-base" : "text-sm"}`}>
                      {itens.length === 0 ? "Tirar foto do material" : "Tirar foto"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex items-center justify-center gap-2 rounded-xl border ${itens.length === 0 ? "w-full border-gray-700 py-3" : "border-gray-700 px-4 py-4"} text-sm text-gray-400 transition-colors hover:border-gray-500`}
                  >
                    <Upload size={16} />
                    {itens.length === 0 && "Ou enviar da galeria"}
                  </button>
                </div>
              )}

              {itens.length >= 10 && (
                <p className="text-center text-xs text-gray-500">Maximo de 10 fotos atingido</p>
              )}

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                onChange={handleFoto}
                className="hidden"
                key="camera-input"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFoto}
                className="hidden"
                key="file-input"
              />

              {/* Lista de itens reconhecidos */}
              {itens.some((i) => i.analise) && (
                <div className="mt-3 rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-3">
                  <p className="mb-2 text-xs font-semibold text-[#C9A84C]">
                    Itens identificados:
                  </p>
                  <div className="space-y-1">
                    {itens
                      .filter((i) => i.analise)
                      .map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Package size={12} className="text-[#C9A84C]" />
                            <span className="text-white">{item.analise!.item}</span>
                          </div>
                          <span className="text-gray-500">{item.analise!.tamanho}</span>
                        </div>
                      ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2 border-t border-[#C9A84C]/10 pt-2">
                    <TruckIcon size={12} className="text-gray-400" />
                    <span className="text-[11px] text-gray-400">
                      Veiculo sugerido: {melhorVeiculo(itens)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ORIGEM */}
            <div className="rounded-xl border border-gray-800 bg-[#111111] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Navigation size={16} className="text-[#C9A84C]" />
                  <span className="text-xs font-semibold uppercase text-gray-500">De onde sai?</span>
                </div>
                {gpsStatus === "loading" ? (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Loader2 size={12} className="animate-spin" /> Buscando...
                  </span>
                ) : (
                  <button type="button" onClick={detectarLocalizacao} className="flex items-center gap-1 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-3 py-1 text-xs font-medium text-[#C9A84C] hover:bg-[#C9A84C]/20 transition-all">
                    📍 Usar GPS
                  </button>
                )}
              </div>
              {gpsStatus === "loading" ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin" /> Detectando...
                </div>
              ) : gpsStatus === "ok" && origemLat ? (
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm text-white">{origemNome}</p>
                  <button type="button" onClick={() => { setGpsStatus("idle"); setOrigemLat(null); setOrigemLng(null); setOrigemNome(""); }} className="text-xs text-gray-500 hover:text-[#C9A84C]">Alterar</button>
                </div>
              ) : (
                <div className="mt-2">
                  <input
                    type="text"
                    value={origemNome}
                    onChange={(e) => { setOrigemNome(e.target.value); setOrigemLat(null); setOrigemLng(null); setCalculado(false); }}
                    placeholder="Digite o endereço, bairro ou CEP de origem"
                    className="w-full rounded-lg border border-gray-700 bg-[#0A0A0A] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* DESTINO */}
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-gray-500">
                <MapPin size={14} className="text-red-400" /> Para onde vai?
              </label>
              <input
                type="text"
                value={destino}
                onChange={(e) => { setDestino(e.target.value); setCalculado(false); setErro(""); }}
                placeholder="Bairro, cidade ou CEP. Ex: Agua Branca, Sao Paulo"
                className="w-full rounded-xl border border-gray-700 bg-[#111111] px-4 py-3 text-base text-white placeholder-gray-600 focus:border-[#C9A84C] focus:outline-none"
              />
            </div>

            {/* BOTAO */}
            <button
              type="submit"
              disabled={!destino.trim() || gpsStatus !== "ok" || calculando || algumAnalisando}
              className="w-full rounded-xl bg-[#C9A84C] py-4 text-lg font-bold text-[#0A0A0A] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {calculando ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={20} className="animate-spin" /> Calculando...
                </span>
              ) : algumAnalisando ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={20} className="animate-spin" /> Analisando fotos...
                </span>
              ) : (
                "Ver valor"
              )}
            </button>

            {/* ERRO */}
            {erro && (
              <div className="flex items-start gap-2 rounded-xl border border-red-800 bg-red-900/20 p-4 text-sm text-red-400">
                <AlertCircle size={18} className="mt-0.5 shrink-0" /> {erro}
              </div>
            )}

            {/* RESULTADO */}
            {calculado && (
              <div className="rounded-2xl border border-[#C9A84C]/30 bg-[#111111] p-5">
                {/* Rota */}
                <div className="mb-4 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <Navigation size={12} className="text-[#C9A84C]" />
                    <span className="text-gray-300">{origemNome}</span>
                  </div>
                  <div className="ml-1 border-l border-dashed border-gray-700 py-1 pl-4 text-xs text-gray-600">
                    ~{distancia} km
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin size={12} className="text-red-400" />
                    <span className="text-gray-300">{destinoNome}</span>
                  </div>
                </div>

                {/* Resumo dos itens */}
                {itens.length > 0 && itens.some((i) => i.analise) && (
                  <div className="mb-4 rounded-lg bg-[#0A0A0A] p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {itens.slice(0, 4).map((item) => (
                          <img
                            key={item.id}
                            src={item.foto}
                            alt=""
                            className="h-8 w-8 rounded-lg border border-gray-700 object-cover"
                          />
                        ))}
                        {itens.length > 4 && (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 bg-[#111111] text-[10px] text-gray-400">
                            +{itens.length - 4}
                          </div>
                        )}
                      </div>
                      <div className="ml-2">
                        <p className="text-xs font-semibold text-white">
                          {itens.length} {itens.length === 1 ? "item" : "itens"}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {melhorVeiculo(itens)} recomendado
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3 opcoes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-gray-800 p-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Economica</p>
                      <p className="text-[11px] text-gray-500">Utilitario, sem ajudante</p>
                    </div>
                    <p className="text-xl font-extrabold text-[#C9A84C]">R$ {precos.economica}</p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border-2 border-[#C9A84C]/50 bg-[#C9A84C]/5 p-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Padrao{" "}
                        <span className="ml-1 rounded bg-[#C9A84C] px-1.5 py-0.5 text-[10px] font-bold text-[#0A0A0A]">
                          Recomendado
                        </span>
                      </p>
                      <p className="text-[11px] text-gray-400">Caminhao bau, 1 ajudante</p>
                    </div>
                    <p className="text-xl font-extrabold text-[#C9A84C]">R$ {precos.padrao}</p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-gray-800 p-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Premium</p>
                      <p className="text-[11px] text-gray-500">Caminhao bau, 2 ajudantes</p>
                    </div>
                    <p className="text-xl font-extrabold text-[#C9A84C]">R$ {precos.premium}</p>
                  </div>
                </div>

                <p className="mt-3 text-center text-[10px] text-gray-600">
                  Valor final confirmado no WhatsApp com base nas fotos enviadas.
                </p>

                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9A84C] py-4 text-base font-bold text-[#0A0A0A] transition-transform hover:scale-[1.02]"
                >
                  Fechar pelo WhatsApp
                  <ArrowRight size={18} />
                </a>
              </div>
            )}
          </form>

          <p className="mt-6 text-center text-xs text-gray-700">
            Sua localizacao e usada apenas para calcular a distancia.
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}
