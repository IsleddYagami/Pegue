"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Search, CheckCircle, Circle, Truck, MapPin, User } from "lucide-react";

type StatusStep = {
  label: string;
  time: string;
  detail?: string;
  done: boolean;
  current: boolean;
};

export default function RastrearPage() {
  const [codigo, setCodigo] = useState("");
  const [buscou, setBuscou] = useState(false);
  const [encontrado, setEncontrado] = useState(false);

  // Mock de dados - no futuro busca do Supabase
  const mockSteps: StatusStep[] = [
    { label: "Pedido confirmado", time: "06/04 - 14:37", done: true, current: false },
    {
      label: "Motorista confirmado",
      time: "07/04 - 07:30",
      detail: "Carlos Souza - Placa ABC-1234",
      done: true,
      current: false,
    },
    {
      label: "Coleta realizada",
      time: "07/04 - 08:20",
      detail: "Carga conferida e carregada",
      done: true,
      current: false,
    },
    {
      label: "Em transito",
      time: "07/04 - 08:45",
      detail: "Previsao de chegada: 09:30",
      done: false,
      current: true,
    },
    { label: "Entrega finalizada", time: "-", done: false, current: false },
  ];

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    setBuscou(true);
    // Mock: qualquer codigo que comece com PEG retorna resultado
    setEncontrado(codigo.toUpperCase().startsWith("PEG"));
  }

  return (
    <>
      <Header />

      <main className="flex-1 bg-gray-50 py-12">
        <div className="mx-auto max-w-xl px-4">
          <h1 className="text-center text-3xl font-extrabold text-[#0A0A0A] md:text-4xl">
            Rastrear Pedido
          </h1>
          <p className="mt-2 text-center text-gray-500">
            Acompanhe o status do seu frete em tempo real
          </p>

          {/* Search */}
          <form
            onSubmit={handleBuscar}
            className="mt-8 flex gap-2"
          >
            <input
              type="text"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                setBuscou(false);
              }}
              placeholder="Ex: PEG-2024-0847"
              className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-3 text-base transition-colors focus:border-[#C9A84C] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!codigo.trim()}
              className="rounded-xl bg-[#C9A84C] px-6 py-3 font-bold text-[#0A0A0A] transition-transform hover:scale-105 disabled:opacity-40"
            >
              <Search size={20} />
            </button>
          </form>

          {/* Not found */}
          {buscou && !encontrado && (
            <div className="mt-6 rounded-xl bg-white p-6 text-center shadow-sm">
              <p className="text-gray-500">
                Nenhum pedido encontrado com o codigo{" "}
                <strong>{codigo}</strong>.
              </p>
              <p className="mt-2 text-sm text-gray-400">
                Verifique o codigo e tente novamente.
              </p>
            </div>
          )}

          {/* Found - Timeline */}
          {buscou && encontrado && (
            <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm md:p-8">
              {/* Header */}
              <div className="text-center">
                <p className="text-sm text-gray-400">Codigo do pedido</p>
                <p className="text-2xl font-extrabold text-[#C9A84C]">
                  {codigo.toUpperCase()}
                </p>
                <p className="mt-1 text-sm text-gray-400">
                  Osasco Centro &rarr; Carapicuiba
                </p>
              </div>

              {/* Timeline */}
              <div className="mt-8 space-y-0">
                {mockSteps.map((step, i) => (
                  <div key={step.label} className="flex gap-4">
                    {/* Line + Dot */}
                    <div className="flex flex-col items-center">
                      {step.done ? (
                        <CheckCircle className="h-6 w-6 shrink-0 text-[#C9A84C]" />
                      ) : step.current ? (
                        <div className="h-6 w-6 shrink-0 rounded-full border-4 border-orange-400 bg-white" />
                      ) : (
                        <Circle className="h-6 w-6 shrink-0 text-gray-300" />
                      )}
                      {i < mockSteps.length - 1 && (
                        <div
                          className={`h-full w-0.5 ${
                            step.done ? "bg-[#C9A84C]" : "bg-gray-200"
                          }`}
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="pb-6">
                      <p
                        className={`font-semibold ${
                          step.current
                            ? "text-orange-500"
                            : step.done
                              ? "text-[#0A0A0A]"
                              : "text-gray-400"
                        }`}
                      >
                        {step.label}
                      </p>
                      <p className="text-xs text-gray-400">{step.time}</p>
                      {step.detail && (
                        <p className="mt-1 text-sm text-gray-500">
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Driver Card */}
              <div className="mt-4 flex items-center gap-4 rounded-xl bg-gray-50 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C9A84C] text-lg font-bold text-white">
                  CS
                </div>
                <div>
                  <p className="font-semibold text-[#0A0A0A]">Carlos Souza</p>
                  <p className="text-sm text-gray-500">
                    Caminhao bau branco | ABC-1234
                  </p>
                  <p className="text-sm text-[#C9A84C]">
                    &#11088; 4.8 (127 corridas)
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}
