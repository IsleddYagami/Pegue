"use client";

import Image from "next/image";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import {
  MessageCircle,
  ArrowRight,
  ArrowDown,
  Zap,
  MapPin,
  Camera,
  DollarSign,
  Clock,
  CheckCircle,
  Smartphone,
} from "lucide-react";

const WHATSAPP_LINK = "https://wa.me/5511970363713?text=Oi";

export default function SimularPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <Header />

      {/* BANNER TUTORIAL - Grande no topo */}
      <section style={{ background: "#000" }}>
        <div className="mx-auto max-w-7xl">
          <Image
            src="/banner-passos-claro.png"
            alt="Localização, tire a foto, diga o destino e pronto. Simples assim!"
            width={1920}
            height={800}
            className="w-full"
            priority
          />
        </div>
      </section>

      {/* CTA rapido */}
      <section className="py-10 md:py-14" style={{ background: "#000" }}>
        <div className="mx-auto max-w-3xl px-4 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#C9A84C]"></span>
            <span className="text-sm font-semibold text-[#C9A84C]">Cotação Imediata</span>
          </div>

          <h1 className="mb-4 text-3xl font-extrabold leading-tight md:text-5xl">
            Preço na hora.{" "}
            <span className="text-[#C9A84C]">Sem espera.</span>
          </h1>

          <p className="mb-6 text-lg text-gray-400">
            3 passos. 2 minutos. Tudo pelo WhatsApp.
          </p>

          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-full bg-[#C9A84C] px-10 py-5 text-xl font-bold text-[#000000] shadow-lg shadow-[#C9A84C]/20 transition-all hover:scale-105"
          >
            <MessageCircle className="h-6 w-6" />
            Quero meu preço agora
            <ArrowRight className="h-5 w-5" />
          </a>

          <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-8 py-3">
            <Zap className="h-5 w-5 text-[#C9A84C]" />
            <span className="text-base font-bold text-[#C9A84C]">Tempo total: menos de 2 minutos</span>
          </div>
        </div>
      </section>

      {/* EXEMPLO VISUAL */}
      <section className="border-t border-[#C9A84C]/10 py-16 md:py-24" style={{ background: "#000" }}>
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-12 text-center text-3xl font-extrabold md:text-4xl">
            Veja como é <span className="text-[#C9A84C]">rápido</span>
          </h2>

          {/* Simulacao de conversa WhatsApp */}
          <div className="mx-auto max-w-md rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
            <div className="mb-4 flex items-center gap-3 border-b border-gray-800 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C9A84C]/20">
                <Image src="/logo-pegue-novo.png" alt="Pegue" width={30} height={30} className="h-6 w-auto" />
              </div>
              <div>
                <p className="text-sm font-bold">PEGUE</p>
                <p className="text-xs text-green-400">online</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Mensagem do cliente */}
              <div className="flex justify-end">
                <div className="rounded-xl rounded-br-sm bg-[#C9A84C]/20 px-4 py-2">
                  <p className="text-sm">Oi</p>
                </div>
              </div>

              {/* Resposta bot */}
              <div className="flex justify-start">
                <div className="rounded-xl rounded-bl-sm bg-[#111] px-4 py-2">
                  <p className="text-sm">Oii! 😊 Que bom ter você aqui!</p>
                  <p className="text-sm">Mande sua localização 📍</p>
                </div>
              </div>

              {/* Cliente manda localizacao */}
              <div className="flex justify-end">
                <div className="rounded-xl rounded-br-sm bg-[#C9A84C]/20 px-4 py-2">
                  <p className="text-sm">📍 Localização enviada</p>
                </div>
              </div>

              {/* Bot pede foto */}
              <div className="flex justify-start">
                <div className="rounded-xl rounded-bl-sm bg-[#111] px-4 py-2">
                  <p className="text-sm">Manda foto do material 📸</p>
                </div>
              </div>

              {/* Cliente manda foto */}
              <div className="flex justify-end">
                <div className="rounded-xl rounded-br-sm bg-[#C9A84C]/20 px-4 py-2">
                  <p className="text-sm">📸 Foto enviada</p>
                </div>
              </div>

              {/* Bot analisa */}
              <div className="flex justify-start">
                <div className="rounded-xl rounded-bl-sm bg-[#111] px-4 py-2">
                  <p className="text-sm">Vi que é um <strong>Sofá</strong> 🛋️</p>
                  <p className="text-sm">Pra onde leva?</p>
                </div>
              </div>

              {/* Cliente manda destino */}
              <div className="flex justify-end">
                <div className="rounded-xl rounded-br-sm bg-[#C9A84C]/20 px-4 py-2">
                  <p className="text-sm">Barra Funda</p>
                </div>
              </div>

              {/* Bot manda preco */}
              <div className="flex justify-start">
                <div className="rounded-xl rounded-bl-sm border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-3">
                  <p className="text-sm font-bold text-[#C9A84C]">✅ Total: R$ 248</p>
                  <p className="mt-1 text-xs text-gray-400">HR, sem ajudante</p>
                </div>
              </div>
            </div>

            <div className="mt-4 text-center">
              <p className="text-xs text-gray-500">Tempo dessa conversa: <strong className="text-[#C9A84C]">1 minuto</strong></p>
            </div>
          </div>
        </div>
      </section>

      {/* POR QUE WHATSAPP */}
      <section className="border-t border-[#C9A84C]/10 py-16 md:py-24" style={{ background: "#000" }}>
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-12 text-center text-3xl font-extrabold md:text-4xl">
            Por que pelo <span className="text-[#C9A84C]">WhatsApp</span>?
          </h2>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { icon: <Zap className="h-6 w-6" />, titulo: "Rápido", desc: "Preço em menos de 2 minutos" },
              { icon: <Smartphone className="h-6 w-6" />, titulo: "Sem app", desc: "Usa o WhatsApp que você já tem" },
              { icon: <Camera className="h-6 w-6" />, titulo: "IA na foto", desc: "A gente identifica o material" },
              { icon: <CheckCircle className="h-6 w-6" />, titulo: "Sem cadastro", desc: "Só mandar Oi e pronto" },
            ].map((item, i) => (
              <div key={i} className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 text-center">
                <div className="mx-auto mb-3 inline-flex rounded-xl bg-[#C9A84C]/10 p-2 text-[#C9A84C]">{item.icon}</div>
                <h3 className="mb-1 font-bold">{item.titulo}</h3>
                <p className="text-xs text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="border-t border-[#C9A84C]/10 py-20 md:py-28" style={{ background: "#000" }}>
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="mb-4 text-3xl font-extrabold md:text-5xl">
            Não carregue esse peso.
          </h2>
          <h2 className="mb-8 text-3xl font-extrabold text-[#C9A84C] md:text-5xl">
            Deixa com a PEGUE.
          </h2>
          <p className="mb-10 text-lg text-gray-400">
            Fácil. Rápido. Preço na hora.
          </p>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-full bg-[#C9A84C] px-10 py-5 text-xl font-bold text-[#000000] shadow-lg shadow-[#C9A84C]/20 transition-all hover:scale-105"
          >
            <MessageCircle className="h-6 w-6" />
            Cotação agora pelo WhatsApp
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
