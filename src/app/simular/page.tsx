"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { MapPin, ArrowRight, Truck, Users, Building } from "lucide-react";
import { WHATSAPP_LINK } from "@/lib/constants";

export default function SimularPage() {
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [calculado, setCalculado] = useState(false);

  // Estimativa simples baseada em valores medios da regiao
  const estimativaMin = 180;
  const estimativaMax = 580;

  function handleSimular(e: React.FormEvent) {
    e.preventDefault();
    if (origem.trim() && destino.trim()) {
      setCalculado(true);
    }
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
                  }}
                  placeholder="Ex: Rua das Flores, 123 - Osasco"
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
                  }}
                  placeholder="Ex: Av. Brasil, 456 - Carapicuiba"
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base transition-colors focus:border-[#C9A84C] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!origem.trim() || !destino.trim()}
                className="w-full rounded-xl bg-[#C9A84C] py-4 text-lg font-bold text-[#0A0A0A] transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Calcular Estimativa
              </button>
            </div>

            {/* Result */}
            {calculado && (
              <div className="mt-6 rounded-xl border-2 border-[#C9A84C] bg-[#1a1700] p-6">
                <p className="text-sm text-gray-500">
                  Estimativa para frete/mudanca:
                </p>
                <p className="mt-1 text-4xl font-extrabold text-[#C9A84C]">
                  R$ {estimativaMin} - R$ {estimativaMax}
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  Valor varia por tipo de veiculo, ajudantes e detalhes
                </p>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Truck className="h-4 w-4" />
                    <span>Inclui opcoes de utilitario a caminhao bau</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Users className="h-4 w-4" />
                    <span>Com ou sem ajudantes</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Building className="h-4 w-4" />
                    <span>Elevador ou escada? Refine no WhatsApp!</span>
                  </div>
                </div>

                <p className="mt-4 text-sm font-medium text-gray-600">
                  Quer o valor exato? Continue pelo WhatsApp!
                </p>

                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] py-4 text-lg font-bold text-white transition-transform hover:scale-[1.02]"
                >
                  Continuar no WhatsApp
                  <ArrowRight size={20} />
                </a>
              </div>
            )}
          </form>

          {/* Info */}
          <div className="mt-8 text-center text-sm text-gray-400">
            <p>Valores estimados. O preco final depende dos detalhes do frete.</p>
            <p className="mt-1">
              No WhatsApp voce pode enviar audio, fotos e localizacao para uma
              cotacao precisa.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
