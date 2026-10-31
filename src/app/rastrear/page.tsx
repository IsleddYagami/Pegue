"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Search, MessageCircle, ShieldCheck } from "lucide-react";

// Esta pagina ERA uma maquete: qualquer codigo comecando com "PEG" exibia uma
// entrega inventada — motorista "Carlos Souza", placa "ABC-1234", horarios e
// previsao de chegada falsos. Em producao, um cliente real digitando um codigo
// via o rastreio de um frete que nao existe. Isso destroi exatamente a confianca
// que a pagina deveria construir.
//
// Agora ela nao mostra nada que nao venha do banco. O rastreio de verdade mora em
// /rastrear/[codigo]?t=<token>, e o token e o segredo que prova que o link e seu.
// Sem token nao ha o que mostrar — e dizer isso e melhor que inventar.

const WHATSAPP_LINK = "https://wa.me/5511970363713?text=Oi";

// Link que o cliente recebe no WhatsApp: .../rastrear/PEG-123?t=<token>
function extrairDoLink(entrada: string): { codigo: string; token: string } | null {
  const texto = entrada.trim();
  if (!texto) return null;

  // Aceita o link inteiro colado, com ou sem dominio
  const comToken = texto.match(/rastrear\/([^/?\s]+)\?(?:.*&)?t=([^&\s]+)/i);
  if (comToken) {
    return { codigo: decodeURIComponent(comToken[1]), token: comToken[2] };
  }

  // Aceita "CODIGO token" ou "CODIGO t=token" digitado na mao
  const solto = texto.match(/^(\S+)\s+(?:t=)?(\S{12,})$/);
  if (solto) {
    return { codigo: solto[1], token: solto[2] };
  }

  return null;
}

export default function RastrearPage() {
  const router = useRouter();
  const [entrada, setEntrada] = useState("");
  const [semToken, setSemToken] = useState(false);

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    const achou = extrairDoLink(entrada);
    if (achou) {
      setSemToken(false);
      router.push(`/rastrear/${encodeURIComponent(achou.codigo)}?t=${achou.token}`);
      return;
    }
    // So o codigo nao abre o rastreio: o codigo nao e segredo, o token e.
    setSemToken(true);
  }

  return (
    <>
      <Header />

      <main className="flex-1 bg-gray-50 py-12">
        <div className="mx-auto max-w-xl px-4">
          <h1 className="text-center text-3xl font-extrabold text-[#0A0A0A] md:text-4xl">
            Acompanhar meu frete
          </h1>
          <p className="mt-2 text-center text-gray-500">
            Cole aqui o link de acompanhamento que você recebeu no WhatsApp.
          </p>

          <form onSubmit={handleBuscar} className="mt-8 flex gap-2">
            <input
              type="text"
              value={entrada}
              onChange={(e) => {
                setEntrada(e.target.value);
                setSemToken(false);
              }}
              placeholder="Cole o link do WhatsApp aqui"
              className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-3 text-base transition-colors focus:border-[#C9A84C] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!entrada.trim()}
              aria-label="Abrir acompanhamento"
              className="rounded-xl bg-[#C9A84C] px-6 py-3 font-bold text-[#0A0A0A] transition-transform hover:scale-105 disabled:opacity-40"
            >
              <Search size={20} />
            </button>
          </form>

          {semToken && (
            <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
              <p className="font-semibold text-[#0A0A0A]">
                Esse não é o link de acompanhamento
              </p>
              <p className="mt-2 text-sm text-gray-500">
                O código do pedido sozinho não abre o rastreio — e isso é de
                propósito: se abrisse, qualquer pessoa veria para onde está indo a
                sua carga. O link completo chega no seu WhatsApp assim que um
                fretista aceita o frete.
              </p>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0A0A0A] px-5 py-3 text-sm font-bold text-white transition-transform hover:scale-105"
              >
                <MessageCircle size={18} />
                Pedir o link no WhatsApp
              </a>
            </div>
          )}

          <div className="mt-8 flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#C9A84C]" />
            <p className="text-sm leading-relaxed text-gray-500">
              No acompanhamento você vê o nome do fretista, o veículo, a placa e a
              posição dele no mapa até a entrega. Quem não tem o seu link não vê
              nada disso.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
