"use client";

import Image from "next/image";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import {
  MessageCircle,
  Camera,
  MapPin,
  CheckCircle,
  Clock,
  Zap,
  ArrowRight,
} from "lucide-react";

const WHATSAPP_LINK = "https://wa.me/5511970363713?text=Oi";

export default function SimularPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden py-20 md:py-28" style={{ background: "#000" }}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Image
            src="/logo-pegue-novo.png"
            alt=""
            width={1000}
            height={1000}
            className="w-[100vw] max-w-none opacity-[0.02]"
            style={{ filter: "brightness(0.3) saturate(0)" }}
            aria-hidden="true"
          />
        </div>

        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-2">
            <Zap className="h-4 w-4 text-[#C9A84C]" />
            <span className="text-sm font-medium text-[#C9A84C]">Resposta em minutos</span>
          </div>

          <h1 className="mb-6 text-4xl font-extrabold leading-tight md:text-6xl">
            Receba já sua{" "}
            <span className="text-[#C9A84C]">cotação instantânea</span>
          </h1>

          <p className="mb-10 text-lg text-gray-400 md:text-xl">
            Mande a foto do material pelo WhatsApp e receba o valor na hora.
            <br />
            <span className="text-[#C9A84C]">Simples assim.</span>
          </p>

          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-full bg-[#C9A84C] px-10 py-5 text-xl font-bold text-[#000000] shadow-lg shadow-[#C9A84C]/20 transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#C9A84C]/30"
          >
            <MessageCircle className="h-6 w-6" />
            Cotação pelo WhatsApp
            <ArrowRight className="h-5 w-5" />
          </a>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-6 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#C9A84C]"></span>
            <span className="text-base font-semibold text-[#C9A84C]">Cotação Imediata</span>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="border-t border-[#C9A84C]/10 py-20 md:py-28" style={{ background: "#000" }}>
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-16 text-center text-3xl font-extrabold md:text-4xl">
            Como funciona?{" "}
            <span className="text-[#C9A84C]">3 passos.</span>
          </h2>

          <div className="grid gap-10 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#C9A84C]/10">
                <Camera className="h-10 w-10 text-[#C9A84C]" />
              </div>
              <div className="mb-2 text-xs font-bold text-[#C9A84C]">PASSO 1</div>
              <h3 className="mb-2 text-xl font-bold">Mande a foto</h3>
              <p className="text-gray-400">Tire a foto do material que precisa levar e envie pelo WhatsApp.</p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#C9A84C]/10">
                <MapPin className="h-10 w-10 text-[#C9A84C]" />
              </div>
              <div className="mb-2 text-xs font-bold text-[#C9A84C]">PASSO 2</div>
              <h3 className="mb-2 text-xl font-bold">Informe o destino</h3>
              <p className="text-gray-400">Mande sua localização ou digite o endereço de coleta e entrega.</p>
            </div>

            <div className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#C9A84C]/10">
                <CheckCircle className="h-10 w-10 text-[#C9A84C]" />
              </div>
              <div className="mb-2 text-xs font-bold text-[#C9A84C]">PASSO 3</div>
              <h3 className="mb-2 text-xl font-bold">Receba o valor</h3>
              <p className="text-gray-400">Nossa IA analisa a foto e calcula o preço na hora. Sem espera!</p>
            </div>
          </div>
        </div>
      </section>

      {/* DIFERENCIAIS */}
      <section className="border-t border-[#C9A84C]/10 py-20 md:py-28" style={{ background: "#000" }}>
        <div className="mx-auto max-w-4xl px-4">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-8">
              <Zap className="mb-4 h-8 w-8 text-[#C9A84C]" />
              <h3 className="mb-2 text-xl font-bold">Inteligência Artificial</h3>
              <p className="text-gray-400">Nossa IA identifica o material pela foto e sugere o melhor veículo automaticamente.</p>
            </div>
            <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-8">
              <Clock className="mb-4 h-8 w-8 text-[#C9A84C]" />
              <h3 className="mb-2 text-xl font-bold">Valor em minutos</h3>
              <p className="text-gray-400">Sem formulários complicados. Manda a foto, informa o destino, recebe o preço.</p>
            </div>
            <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-8">
              <Camera className="mb-4 h-8 w-8 text-[#C9A84C]" />
              <h3 className="mb-2 text-xl font-bold">Múltiplos itens</h3>
              <p className="text-gray-400">Pode mandar várias fotos, uma por uma. A gente calcula tudo junto.</p>
            </div>
            <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-8">
              <MessageCircle className="mb-4 h-8 w-8 text-[#C9A84C]" />
              <h3 className="mb-2 text-xl font-bold">Tudo pelo WhatsApp</h3>
              <p className="text-gray-400">Sem baixar app. Sem cadastro. Tudo na conversa do WhatsApp que você já usa.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="border-t border-[#C9A84C]/10 py-20 md:py-28" style={{ background: "#000" }}>
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="mb-6 text-3xl font-extrabold md:text-4xl">
            Não carregue esse peso.{" "}
            <span className="text-[#C9A84C]">Deixa com a PEGUE.</span>
          </h2>
          <p className="mb-10 text-lg text-gray-400">
            Fretes na Pegue é simples assim!
          </p>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-full bg-[#C9A84C] px-10 py-5 text-xl font-bold text-[#000000] shadow-lg shadow-[#C9A84C]/20 transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#C9A84C]/30"
          >
            <MessageCircle className="h-6 w-6" />
            Quero minha cotação
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
