"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
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
} from "lucide-react";
import { WHATSAPP_LINK } from "@/lib/constants";
import { Package, Truck as TruckIcon } from "lucide-react";

type AnaliseIA = {
  item: string;
  quantidade: string;
  tamanho: string;
  veiculo_sugerido: string;
  observacao: string;
} | null;

// Geocodificar via Nominatim (OpenStreetMap) - gratuito
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
        return await geocodificarNominatim(
          q,
          `${data.bairro || data.localidade}, ${data.localidade}`
        );
      }
    } catch {}
  }
  return await geocodificarNominatim(
    endereco + ", Sao Paulo, Brasil",
    endereco
  );
}

async function geocodificarNominatim(
  query: string,
  nomeExibicao: string
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

// Geocodificacao reversa (lat/lng -> endereco)
async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "pt-BR" } }
    );
    const data = await r.json();
    if (data && data.address) {
      const a = data.address;
      const parts = [
        a.road,
        a.suburb || a.neighbourhood,
        a.city || a.town || a.municipality,
      ].filter(Boolean);
      return parts.join(", ");
    }
  } catch {}
  return null;
}

function calcularDistancia(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 1.35 * 10) / 10;
}

function calcularPrecos(distanciaKm: number) {
  const PRECO_KM = 8;
  const KM_MINIMO = 5;
  const VALOR_MINIMO = 80;
  const ADICIONAL_AJUDANTE = 80;

  const kmCobrado = Math.max(distanciaKm, KM_MINIMO);
  const precoBase = kmCobrado * PRECO_KM;

  return {
    economica: Math.max(Math.round(precoBase * 1.0), VALOR_MINIMO),
    padrao: Math.max(
      Math.round(precoBase * 1.6 + ADICIONAL_AJUDANTE),
      VALOR_MINIMO + 80
    ),
    premium: Math.max(
      Math.round(precoBase * 2.0 + ADICIONAL_AJUDANTE * 2),
      VALOR_MINIMO + 160
    ),
  };
}

export default function SimularPage() {
  const [foto, setFoto] = useState<string | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [destino, setDestino] = useState("");
  const [calculado, setCalculado] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState("");
  const [distancia, setDistancia] = useState(0);
  const [origemNome, setOrigemNome] = useState("");
  const [destinoNome, setDestinoNome] = useState("");
  const [precos, setPrecos] = useState({ economica: 0, padrao: 0, premium: 0 });
  const [analiseIA, setAnaliseIA] = useState<AnaliseIA>(null);
  const [analisando, setAnalisando] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<
    "idle" | "loading" | "ok" | "denied"
  >("idle");
  const [origemLat, setOrigemLat] = useState<number | null>(null);
  const [origemLng, setOrigemLng] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Detectar GPS automaticamente ao entrar na pagina
  useEffect(() => {
    detectarLocalizacao();
  }, []);

  function detectarLocalizacao() {
    if (!navigator.geolocation) {
      setGpsStatus("denied");
      return;
    }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setOrigemLat(lat);
        setOrigemLng(lng);
        const nome = await reverseGeocode(lat, lng);
        setOrigemNome(nome || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        setGpsStatus("ok");
      },
      () => {
        setGpsStatus("denied");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setFotoFile(file);
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        setFoto(base64);
        setCalculado(false);

        // Enviar para IA analisar
        setAnalisando(true);
        setAnaliseIA(null);
        try {
          const res = await fetch("/api/analisar-foto", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64 }),
          });
          const data = await res.json();
          setAnaliseIA(data);
        } catch {
          setAnaliseIA(null);
        }
        setAnalisando(false);
      };
      reader.readAsDataURL(file);
    }
  }

  function removerFoto() {
    setFoto(null);
    setFotoFile(null);
    setCalculado(false);
  }

  async function handleSimular(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCalculando(true);
    setCalculado(false);

    try {
      // Verificar origem
      if (gpsStatus !== "ok" || !origemLat || !origemLng) {
        setErro(
          "Nao conseguimos detectar sua localizacao. Permita o acesso ao GPS ou tente novamente."
        );
        setCalculando(false);
        return;
      }

      // Geocodificar destino
      const localDestino = await geocodificar(destino);
      if (!localDestino) {
        setErro(
          "Nao encontramos o destino. Verifique o nome da cidade, bairro ou CEP."
        );
        setCalculando(false);
        return;
      }

      const dist = calcularDistancia(
        origemLat,
        origemLng,
        localDestino.lat,
        localDestino.lng
      );
      const p = calcularPrecos(dist);

      setDistancia(dist);
      setDestinoNome(localDestino.nome);
      setPrecos(p);
      setCalculado(true);
    } catch {
      setErro("Erro ao calcular. Tente novamente.");
    }
    setCalculando(false);
  }

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
            A gente detecta sua localizacao. Voce so diz para onde vai.
          </p>

          <form
            onSubmit={handleSimular}
            className="mt-8 space-y-5"
          >
            {/* FOTO */}
            <div>
              {!foto ? (
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#C9A84C]/40 bg-[#C9A84C]/5 py-10 text-[#C9A84C] transition-all hover:border-[#C9A84C] hover:bg-[#C9A84C]/10"
                  >
                    <Camera size={28} />
                    <span className="text-base font-semibold">
                      Tirar foto do material
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-700 py-3 text-sm text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-300"
                  >
                    <Upload size={16} />
                    Ou enviar foto da galeria
                  </button>

                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFoto}
                    className="hidden"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFoto}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="relative">
                  <div className="overflow-hidden rounded-2xl border border-[#C9A84C]/30">
                    <img
                      src={foto}
                      alt="Material para frete"
                      className="h-56 w-full object-cover"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={removerFoto}
                    className="absolute right-2 top-2 rounded-full bg-[#0A0A0A]/80 p-1.5 text-white transition-colors hover:bg-red-500"
                  >
                    <X size={16} />
                  </button>
                  {/* Resultado da IA */}
                  {analisando && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-400">
                      <Loader2 size={14} className="animate-spin" />
                      Analisando material...
                    </div>
                  )}
                  {analiseIA && !analisando && (
                    <div className="mt-3 rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-3">
                      <div className="flex items-center gap-2">
                        <Package size={16} className="text-[#C9A84C]" />
                        <span className="text-sm font-semibold text-white">
                          {analiseIA.item}
                        </span>
                        <span className="rounded bg-[#C9A84C]/20 px-1.5 py-0.5 text-[10px] text-[#C9A84C]">
                          {analiseIA.tamanho}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <TruckIcon size={14} className="text-gray-500" />
                        <span className="text-xs text-gray-400">
                          Veiculo sugerido: {analiseIA.veiculo_sugerido === "caminhao_bau" ? "Caminhao bau" : analiseIA.veiculo_sugerido === "van" ? "Van" : "Utilitario"}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {analiseIA.observacao}
                      </p>
                    </div>
                  )}
                  {!analiseIA && !analisando && (
                    <p className="mt-2 text-center text-xs text-[#C9A84C]">
                      Foto recebida
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ORIGEM - GPS automatico */}
            <div className="rounded-xl border border-gray-800 bg-[#111111] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Navigation size={16} className="text-[#C9A84C]" />
                  <span className="text-xs font-semibold uppercase text-gray-500">
                    Sua localizacao
                  </span>
                </div>
                {gpsStatus === "denied" && (
                  <button
                    type="button"
                    onClick={detectarLocalizacao}
                    className="text-xs text-[#C9A84C] hover:underline"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>

              {gpsStatus === "loading" && (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin" />
                  Detectando localizacao...
                </div>
              )}
              {gpsStatus === "ok" && (
                <p className="mt-2 text-sm text-white">{origemNome}</p>
              )}
              {gpsStatus === "denied" && (
                <p className="mt-2 text-xs text-red-400">
                  GPS nao permitido. Habilite a localizacao no navegador.
                </p>
              )}
              {gpsStatus === "idle" && (
                <p className="mt-2 text-xs text-gray-500">Aguardando GPS...</p>
              )}
            </div>

            {/* DESTINO */}
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-gray-500">
                <MapPin size={14} className="text-red-400" />
                Para onde vai?
              </label>
              <input
                type="text"
                value={destino}
                onChange={(e) => {
                  setDestino(e.target.value);
                  setCalculado(false);
                  setErro("");
                }}
                placeholder="Bairro, cidade ou CEP. Ex: Agua Branca, Sao Paulo"
                className="w-full rounded-xl border border-gray-700 bg-[#111111] px-4 py-3 text-base text-white placeholder-gray-600 transition-colors focus:border-[#C9A84C] focus:outline-none"
              />
            </div>

            {/* BOTAO */}
            <button
              type="submit"
              disabled={!destino.trim() || gpsStatus !== "ok" || calculando}
              className="w-full rounded-xl bg-[#C9A84C] py-4 text-lg font-bold text-[#0A0A0A] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {calculando ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={20} className="animate-spin" />
                  Calculando...
                </span>
              ) : (
                "Ver valor"
              )}
            </button>

            {/* ERRO */}
            {erro && (
              <div className="flex items-start gap-2 rounded-xl border border-red-800 bg-red-900/20 p-4 text-sm text-red-400">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                {erro}
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

                {/* Foto thumbnail */}
                {foto && (
                  <div className="mb-4 flex items-center gap-3 rounded-lg bg-[#0A0A0A] p-2">
                    <img
                      src={foto}
                      alt="Material"
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {analiseIA ? analiseIA.item : "Foto recebida"}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {analiseIA
                          ? `${analiseIA.veiculo_sugerido === "caminhao_bau" ? "Caminhao bau" : analiseIA.veiculo_sugerido === "van" ? "Van" : "Utilitario"} recomendado`
                          : "O veiculo sera confirmado no WhatsApp"}
                      </p>
                    </div>
                  </div>
                )}

                {/* 3 opcoes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-gray-800 p-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Economica
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Utilitario, sem ajudante
                      </p>
                    </div>
                    <p className="text-xl font-extrabold text-[#C9A84C]">
                      R$ {precos.economica}
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border-2 border-[#C9A84C]/50 bg-[#C9A84C]/5 p-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Padrao{" "}
                        <span className="ml-1 rounded bg-[#C9A84C] px-1.5 py-0.5 text-[10px] font-bold text-[#0A0A0A]">
                          Recomendado
                        </span>
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Caminhao bau, 1 ajudante
                      </p>
                    </div>
                    <p className="text-xl font-extrabold text-[#C9A84C]">
                      R$ {precos.padrao}
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-gray-800 p-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Premium
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Caminhao bau, 2 ajudantes
                      </p>
                    </div>
                    <p className="text-xl font-extrabold text-[#C9A84C]">
                      R$ {precos.premium}
                    </p>
                  </div>
                </div>

                {/* CTA WhatsApp */}
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9A84C] py-4 text-base font-bold text-[#0A0A0A] transition-transform hover:scale-[1.02]"
                >
                  Fechar pelo WhatsApp
                  <ArrowRight size={18} />
                </a>

                <p className="mt-2 text-center text-[10px] text-gray-600">
                  Valor final confirmado no WhatsApp com base na foto do
                  material.
                </p>
              </div>
            )}
          </form>

          {/* Micro-copy */}
          <p className="mt-6 text-center text-xs text-gray-700">
            Sua localizacao e usada apenas para calcular a distancia. Nao
            armazenamos dados de GPS.
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}
