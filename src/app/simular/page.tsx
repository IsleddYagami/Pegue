"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { MapPin, ArrowRight, Truck, Users, Building, Loader2, AlertCircle } from "lucide-react";
import { WHATSAPP_LINK } from "@/lib/constants";

// Coordenadas de cidades/bairros da regiao (lat, lng)
const LOCAIS_CONHECIDOS: Record<string, { lat: number; lng: number; nome: string }> = {
  // Osasco
  "osasco": { lat: -23.5325, lng: -46.7917, nome: "Osasco" },
  "centro osasco": { lat: -23.5325, lng: -46.7917, nome: "Centro, Osasco" },
  "presidente altino": { lat: -23.5200, lng: -46.7750, nome: "Presidente Altino, Osasco" },
  "bela vista osasco": { lat: -23.5400, lng: -46.7800, nome: "Bela Vista, Osasco" },
  "km 18": { lat: -23.5150, lng: -46.8100, nome: "Km 18, Osasco" },
  "vila yara": { lat: -23.5450, lng: -46.7750, nome: "Vila Yara, Osasco" },
  "jd das flores": { lat: -23.5280, lng: -46.8050, nome: "Jd das Flores, Osasco" },
  "helena maria": { lat: -23.5100, lng: -46.8200, nome: "Helena Maria, Osasco" },
  "piratininga": { lat: -23.5050, lng: -46.7950, nome: "Piratininga, Osasco" },
  "quitauna": { lat: -23.5180, lng: -46.7850, nome: "Quitauna, Osasco" },
  "rochdale": { lat: -23.5350, lng: -46.8100, nome: "Rochdale, Osasco" },
  "conceicao": { lat: -23.5400, lng: -46.8000, nome: "Conceicao, Osasco" },
  // Carapicuiba
  "carapicuiba": { lat: -23.5225, lng: -46.8358, nome: "Carapicuiba" },
  "centro carapicuiba": { lat: -23.5225, lng: -46.8358, nome: "Centro, Carapicuiba" },
  // Barueri
  "barueri": { lat: -23.5114, lng: -46.8761, nome: "Barueri" },
  "alphaville": { lat: -23.4850, lng: -46.8500, nome: "Alphaville, Barueri" },
  "aldeia": { lat: -23.5000, lng: -46.8600, nome: "Aldeia, Barueri" },
  "centro barueri": { lat: -23.5114, lng: -46.8761, nome: "Centro, Barueri" },
  // Cotia
  "cotia": { lat: -23.6037, lng: -46.9192, nome: "Cotia" },
  "granja viana": { lat: -23.5900, lng: -46.8700, nome: "Granja Viana, Cotia" },
  // Jandira
  "jandira": { lat: -23.5275, lng: -46.9025, nome: "Jandira" },
  // Itapevi
  "itapevi": { lat: -23.5489, lng: -46.9344, nome: "Itapevi" },
  // Sao Paulo regioes proximas
  "butanta": { lat: -23.5700, lng: -46.7300, nome: "Butanta, SP" },
  "pinheiros": { lat: -23.5630, lng: -46.6930, nome: "Pinheiros, SP" },
  "lapa": { lat: -23.5200, lng: -46.7200, nome: "Lapa, SP" },
  "vila leopoldina": { lat: -23.5250, lng: -46.7400, nome: "Vila Leopoldina, SP" },
  "jaguare": { lat: -23.5450, lng: -46.7450, nome: "Jaguare, SP" },
  "sao paulo": { lat: -23.5505, lng: -46.6333, nome: "Sao Paulo (centro)" },
  "centro sp": { lat: -23.5505, lng: -46.6333, nome: "Centro, SP" },
  "santo amaro": { lat: -23.6500, lng: -46.7100, nome: "Santo Amaro, SP" },
  "taboao da serra": { lat: -23.6200, lng: -46.7800, nome: "Taboao da Serra" },
  "embu das artes": { lat: -23.6500, lng: -46.8500, nome: "Embu das Artes" },
  "santana de parnaiba": { lat: -23.4440, lng: -46.9180, nome: "Santana de Parnaiba" },
  "sao caetano": { lat: -23.6200, lng: -46.5500, nome: "Sao Caetano do Sul" },
  "guarulhos": { lat: -23.4630, lng: -46.5330, nome: "Guarulhos" },
  "santo andre": { lat: -23.6737, lng: -46.5432, nome: "Santo Andre" },
};

// CEPs conhecidos da regiao (prefixos)
const CEP_REGIOES: Record<string, string> = {
  "060": "osasco",
  "061": "osasco",
  "062": "osasco",
  "063": "carapicuiba",
  "064": "barueri",
  "065": "jandira",
  "066": "itapevi",
  "067": "cotia",
  "068": "embu das artes",
  "069": "taboao da serra",
  "010": "centro sp",
  "011": "centro sp",
  "012": "centro sp",
  "013": "centro sp",
  "014": "centro sp",
  "015": "centro sp",
  "054": "butanta",
  "055": "butanta",
  "056": "pinheiros",
  "050": "lapa",
  "093": "guarulhos",
  "091": "santo andre",
  "095": "sao caetano",
};

function buscarLocal(input: string): { lat: number; lng: number; nome: string } | null {
  const clean = input.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

  // Tentar por CEP (remover hifen e espacos)
  const cepClean = input.replace(/\D/g, "");
  if (cepClean.length >= 5) {
    const prefix = cepClean.substring(0, 3);
    const regiao = CEP_REGIOES[prefix];
    if (regiao && LOCAIS_CONHECIDOS[regiao]) {
      return LOCAIS_CONHECIDOS[regiao];
    }
  }

  // Tentar match direto
  if (LOCAIS_CONHECIDOS[clean]) {
    return LOCAIS_CONHECIDOS[clean];
  }

  // Tentar match parcial
  for (const [key, val] of Object.entries(LOCAIS_CONHECIDOS)) {
    if (clean.includes(key) || key.includes(clean)) {
      return val;
    }
  }

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
  // Multiplicar por 1.4 para estimar distancia real de estrada
  return Math.round(distanciaReta * 1.4 * 10) / 10;
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

  function handleSimular(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCalculando(true);

    const localOrigem = buscarLocal(origem);
    const localDestino = buscarLocal(destino);

    if (!localOrigem) {
      setErro("Nao encontramos a origem. Tente um CEP, bairro ou cidade da regiao (ex: Osasco, Carapicuiba, Barueri).");
      setCalculando(false);
      return;
    }

    if (!localDestino) {
      setErro("Nao encontramos o destino. Tente um CEP, bairro ou cidade da regiao (ex: Osasco, Carapicuiba, Barueri).");
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
                  placeholder="CEP, bairro ou cidade. Ex: 06010-000 ou Centro, Osasco"
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base transition-colors focus:border-[#C9A84C] focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-400">Aceita CEP, bairro ou cidade</p>
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
                  placeholder="CEP, bairro ou cidade. Ex: 06321-000 ou Carapicuiba"
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base transition-colors focus:border-[#C9A84C] focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-400">Aceita CEP, bairro ou cidade</p>
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
                <div className="mb-3 flex items-center justify-between text-sm text-gray-400">
                  <span>{origemNome} → {destinoNome}</span>
                  <span>~{distancia} km</span>
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
                    <span>Escada ou elevador? Refine no WhatsApp para valor exato</span>
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
            <p>Valores estimados baseados na distancia. O preco final pode variar.</p>
            <p className="mt-1">
              No WhatsApp voce refina com detalhes de escada, elevador e tipo de carga.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
