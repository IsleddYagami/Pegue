"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { MapPin, ArrowRight, Truck, Users, Building, Loader2, AlertCircle } from "lucide-react";
import { WHATSAPP_LINK } from "@/lib/constants";

// Geocodificar endereco usando API gratuita do Nominatim (OpenStreetMap)
async function geocodificar(endereco: string): Promise<{ lat: number; lng: number; nome: string } | null> {
  // Se for CEP, buscar primeiro no ViaCEP
  const cepClean = endereco.replace(/\D/g, "");
  if (cepClean.length === 8) {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
      const data = await r.json();
      if (!data.erro && data.localidade) {
        // Usar o endereco do ViaCEP para geocodificar
        const enderecoCompleto = `${data.logradouro || ""}, ${data.bairro || ""}, ${data.localidade}, ${data.uf}, Brasil`;
        return await geocodificarNominatim(enderecoCompleto, `${data.bairro || data.localidade}, ${data.localidade}`);
      }
    } catch {}
  }

  // Geocodificar diretamente pelo Nominatim
  return await geocodificarNominatim(endereco + ", Sao Paulo, Brasil", endereco);
}

async function geocodificarNominatim(query: string, nomeExibicao: string): Promise<{ lat: number; lng: number; nome: string } | null> {
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

function calcularDistancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
  const distanciaReta = R * c;
  // Multiplicar por 1.35 para estimar distancia real de estrada
  return Math.round(distanciaReta * 1.35 * 10) / 10;
}

function calcularPrecos(distanciaKm: number) {
  const PRECO_KM = 8;
  const KM_MINIMO = 5;
  const VALOR_MINIMO = 80;
  const ADICIONAL_AJUDANTE = 80;

  const kmCobrado = Math.max(distanciaKm, KM_MINIMO);
  const precoBase = kmCobrado * PRECO_KM;

  const economica = Math.max(Math.round(precoBase * 1.0), VALOR_MINIMO);
  const padrao = Math.max(Math.round(precoBase * 1.6 + ADICIONAL_AJUDANTE), VALOR_MINIMO + 80);
  const premium = Math.max(Math.round(precoBase * 2.0 + ADICIONAL_AJUDANTE * 2), VALOR_MINIMO + 160);

  return { economica, padrao, premium };
}

export default function SimularPage() {
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [calculado, setCalculado] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState("");
  const [distancia, setDistancia] = useState(0);
  const [origemNome, setOrigemNome] = useState("");
  const [destinoNome, setDestinoNome] = useState("");
  const [precos, setPrecos] = useState({ economica: 0, padrao: 0, premium: 0 });

  async function handleSimular(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCalculando(true);
    setCalculado(false);

    try {
      // Geocodificar ambos os enderecos em paralelo
      const [localOrigem, localDestino] = await Promise.all([
        geocodificar(origem),
        geocodificar(destino),
      ]);

      if (!localOrigem) {
        setErro("Nao encontramos a origem. Verifique o CEP, bairro ou cidade e tente novamente.");
        setCalculando(false);
        return;
      }

      if (!localDestino) {
        setErro("Nao encontramos o destino. Verifique o CEP, bairro ou cidade e tente novamente.");
        setCalculando(false);
        return;
      }

      const dist = calcularDistancia(localOrigem.lat, localOrigem.lng, localDestino.lat, localDestino.lng);
      const p = calcularPrecos(dist);

      setDistancia(dist);
      setOrigemNome(localOrigem.nome);
      setDestinoNome(localDestino.nome);
      setPrecos(p);
      setCalculado(true);
    } catch {
      setErro("Erro ao calcular. Tente novamente em alguns segundos.");
    }

    setCalculando(false);
  }

  const whatsappLink = WHATSAPP_LINK;

  return (
    <>
      <Header />

      <main className="flex-1 bg-gray-50 py-12">
        <div className="mx-auto max-w-2xl px-4">
          <h1 className="text-center text-3xl font-extrabold text-[#0A0A0A] md:text-4xl">
            Simule seu frete em{" "}
            <span className="text-[#C9A84C]">segundos</span>
          </h1>
          <p className="mt-2 text-center text-gray-500">
            Informe origem e destino para uma estimativa instantanea
          </p>

          {/* Form */}
          <form
            onSubmit={handleSimular}
            className="mt-8 rounded-2xl bg-white p-6 shadow-sm md:p-8"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-600">
                  <MapPin className="mr-1 inline h-4 w-4 text-[#C9A84C]" />
                  De onde sai? (origem)
                </label>
                <input
                  type="text"
                  value={origem}
                  onChange={(e) => {
                    setOrigem(e.target.value);
                    setCalculado(false);
                    setErro("");
                  }}
                  placeholder="CEP, bairro, cidade ou endereco. Ex: Osasco, Santos, Campinas"
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base transition-colors focus:border-[#C9A84C] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-600">
                  <MapPin className="mr-1 inline h-4 w-4 text-red-500" />
                  Para onde vai? (destino)
                </label>
                <input
                  type="text"
                  value={destino}
                  onChange={(e) => {
                    setDestino(e.target.value);
                    setCalculado(false);
                    setErro("");
                  }}
                  placeholder="CEP, bairro, cidade ou endereco. Ex: Guaruja, Sorocaba, Ribeirao Preto"
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base transition-colors focus:border-[#C9A84C] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!origem.trim() || !destino.trim() || calculando}
                className="w-full rounded-xl bg-[#C9A84C] py-4 text-lg font-bold text-[#0A0A0A] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {calculando ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={20} className="animate-spin" />
                    Calculando...
                  </span>
                ) : (
                  "Calcular Estimativa"
                )}
              </button>
            </div>

            {/* Erro */}
            {erro && (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-600">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                {erro}
              </div>
            )}

            {/* Result */}
            {calculado && (
              <div className="mt-6 rounded-xl border-2 border-[#C9A84C] bg-[#0A0A0A] p-6">
                <div className="mb-3 text-sm text-gray-400">
                  <p>{origemNome}</p>
                  <p className="text-[#C9A84C]">→</p>
                  <p>{destinoNome}</p>
                  <p className="mt-1 font-semibold text-gray-300">Distancia estimada: ~{distancia} km</p>
                </div>

                {/* 3 opcoes */}
                <div className="space-y-3">
                  <div className="rounded-lg border border-gray-700 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">Economica</p>
                        <p className="text-xs text-gray-500">Utilitario, sem ajudante</p>
                      </div>
                      <p className="text-2xl font-extrabold text-[#C9A84C]">R$ {precos.economica}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border-2 border-[#C9A84C] bg-[#C9A84C]/10 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">Padrao <span className="ml-1 rounded bg-[#C9A84C] px-2 py-0.5 text-xs font-bold text-[#0A0A0A]">Recomendado</span></p>
                        <p className="text-xs text-gray-400">Caminhao bau, 1 ajudante</p>
                      </div>
                      <p className="text-2xl font-extrabold text-[#C9A84C]">R$ {precos.padrao}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-700 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">Premium</p>
                        <p className="text-xs text-gray-500">Caminhao bau, 2 ajudantes, prioridade</p>
                      </div>
                      <p className="text-2xl font-extrabold text-[#C9A84C]">R$ {precos.premium}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Building className="h-3 w-3" />
                    <span>Escada, elevador ou detalhes especificos? Refine no WhatsApp</span>
                  </div>
                </div>

                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9A84C] py-4 text-lg font-bold text-[#0A0A0A] transition-transform hover:scale-[1.02]"
                >
                  Fechar pelo WhatsApp
                  <ArrowRight size={20} />
                </a>
              </div>
            )}
          </form>

          {/* Info */}
          <div className="mt-8 text-center text-sm text-gray-400">
            <p>Valores estimados baseados na distancia. O preco final pode variar conforme detalhes.</p>
            <p className="mt-1">
              Atendemos Sao Paulo capital, Grande SP, litoral e interior.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
