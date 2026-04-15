"use client";

import { useState } from "react";
import { MessageCircle, ArrowRight, CheckCircle, Shield, Clock, Star, Zap, Phone, Truck, Camera, MapPin } from "lucide-react";

const PALETAS = {
  atual: {
    nome: "Atual (Preto + Dourado)",
    bg: "#000000",
    bgCard: "#0A0A0A",
    accent: "#C9A84C",
    accentDark: "#A08530",
    text: "#FFFFFF",
    textMuted: "#999999",
    hero: "linear-gradient(180deg, #000 0%, #0A0A0A 100%)",
    btnText: "#000000",
    border: "rgba(201,168,76,0.2)",
  },
  azulDourado: {
    nome: "Azul Escuro + Dourado",
    bg: "#0A1628",
    bgCard: "#0F1D32",
    accent: "#C9A84C",
    accentDark: "#A08530",
    text: "#FFFFFF",
    textMuted: "#8899AA",
    hero: "linear-gradient(180deg, #0A1628 0%, #0F1D32 100%)",
    btnText: "#0A1628",
    border: "rgba(201,168,76,0.15)",
  },
};

type PaletaKey = keyof typeof PALETAS;

export default function TesteCoresPage() {
  const [paleta, setPaleta] = useState<PaletaKey>("azulDourado");
  const p = PALETAS[paleta];

  return (
    <div className="min-h-screen" style={{ background: "#000" }}>
      {/* Seletor de paleta */}
      <div className="sticky top-0 z-50 border-b border-gray-800 bg-black/90 backdrop-blur p-3">
        <div className="mx-auto flex max-w-4xl items-center justify-center gap-3">
          <p className="text-sm text-gray-400 mr-2">Comparar:</p>
          {Object.entries(PALETAS).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setPaleta(key as PaletaKey)}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
                paleta === key
                  ? "bg-[#C9A84C] text-black"
                  : "border border-gray-700 text-gray-400 hover:border-gray-500"
              }`}
            >
              {val.nome}
            </button>
          ))}
        </div>
      </div>

      {/* SIMULACAO DO SITE */}
      <div style={{ background: p.hero }}>

        {/* Header */}
        <header className="border-b" style={{ borderColor: p.border, background: p.bg }}>
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Truck style={{ color: p.accent }} className="h-6 w-6" />
              <span className="text-xl font-bold" style={{ color: p.text }}>
                Pe<span style={{ color: p.accent }}>gue</span>
              </span>
            </div>
            <div className="flex gap-4 text-sm" style={{ color: p.textMuted }}>
              <span>Inicio</span>
              <span>Cotacao</span>
              <span>Parceiro</span>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="relative overflow-hidden" style={{ background: p.hero }}>
          <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-16 text-center">
            <h1 className="text-3xl font-extrabold leading-tight md:text-5xl" style={{ color: p.text }}>
              Guincho e Frete a partir de{" "}
              <span style={{ color: p.accent }}>R$ 150</span>
            </h1>

            <p className="mt-3 text-xl font-semibold md:text-2xl" style={{ color: p.accent }}>
              Preco na hora. Pelo WhatsApp.
            </p>

            <p className="mt-3 text-base" style={{ color: p.textMuted }}>
              Sem app. Sem cadastro. Sem espera.
            </p>

            <button
              className="group mt-8 flex items-center gap-3 rounded-full px-10 py-5 text-xl font-bold shadow-lg transition-all hover:scale-105"
              style={{
                background: p.accent,
                color: p.btnText,
                boxShadow: `0 10px 30px ${p.accent}33`,
              }}
            >
              <MessageCircle className="h-6 w-6" />
              Quero meu preco agora
              <ArrowRight className="h-5 w-5" />
            </button>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm" style={{ color: p.textMuted }}>
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4" style={{ color: p.accent }} /> 4.9 avaliacao
              </span>
              <span className="flex items-center gap-1">
                <Shield className="h-4 w-4" style={{ color: p.accent }} /> Fretistas verificados
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" style={{ color: p.accent }} /> Resposta em 2 min
              </span>
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section className="py-12 px-4" style={{ background: p.bgCard }}>
          <h2 className="text-center text-2xl font-bold mb-8" style={{ color: p.text }}>
            Como <span style={{ color: p.accent }}>funciona</span>
          </h2>
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { icon: <MessageCircle className="h-8 w-8" />, title: "1. Mande mensagem", desc: "Chame no WhatsApp e diga o que precisa" },
              { icon: <Camera className="h-8 w-8" />, title: "2. Mande a foto", desc: "Fotografe os materiais e receba o preco" },
              { icon: <Truck className="h-8 w-8" />, title: "3. Pegue resolve", desc: "Fretista verificado coleta e entrega" },
            ].map((step, i) => (
              <div
                key={i}
                className="rounded-2xl border p-6 text-center"
                style={{ borderColor: p.border, background: p.bg }}
              >
                <div
                  className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: `${p.accent}15`, color: p.accent }}
                >
                  {step.icon}
                </div>
                <h3 className="font-bold" style={{ color: p.text }}>{step.title}</h3>
                <p className="mt-1 text-sm" style={{ color: p.textMuted }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Servicos */}
        <section className="py-12 px-4" style={{ background: p.bg }}>
          <h2 className="text-center text-2xl font-bold mb-8" style={{ color: p.text }}>
            Nossos <span style={{ color: p.accent }}>servicos</span>
          </h2>
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { title: "Pequenos Fretes", price: "R$ 160", desc: "Moveis, eletrodomesticos, volumes" },
              { title: "Mudancas", price: "R$ 500", desc: "Residencial e comercial completa" },
              { title: "Guincho", price: "R$ 150", desc: "Carro, moto, van, caminhao" },
            ].map((svc, i) => (
              <div
                key={i}
                className="rounded-2xl border p-6"
                style={{ borderColor: p.border, background: p.bgCard }}
              >
                <p className="text-sm font-bold" style={{ color: p.accent }}>a partir de</p>
                <p className="text-3xl font-extrabold" style={{ color: p.text }}>{svc.price}</p>
                <h3 className="mt-2 text-lg font-bold" style={{ color: p.text }}>{svc.title}</h3>
                <p className="mt-1 text-sm" style={{ color: p.textMuted }}>{svc.desc}</p>
                <button
                  className="mt-4 w-full rounded-lg py-2 text-sm font-bold"
                  style={{ background: `${p.accent}20`, color: p.accent }}
                >
                  Solicitar
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Diferenciais */}
        <section className="py-12 px-4" style={{ background: p.bgCard }}>
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { icon: <Shield className="h-6 w-6" />, label: "Seguro" },
              { icon: <Zap className="h-6 w-6" />, label: "Rapido" },
              { icon: <Star className="h-6 w-6" />, label: "Avaliado" },
              { icon: <MapPin className="h-6 w-6" />, label: "Rastreio" },
            ].map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-2 rounded-xl border p-4" style={{ borderColor: p.border, background: p.bg }}>
                <div style={{ color: p.accent }}>{d.icon}</div>
                <p className="text-sm font-bold" style={{ color: p.text }}>{d.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="py-16 px-4 text-center" style={{ background: p.bg }}>
          <h2 className="text-2xl font-bold" style={{ color: p.text }}>
            Pronto pra <span style={{ color: p.accent }}>resolver</span>?
          </h2>
          <button
            className="mt-6 rounded-full px-10 py-4 text-lg font-bold transition-all hover:scale-105"
            style={{ background: p.accent, color: p.btnText }}
          >
            <MessageCircle className="inline h-5 w-5 mr-2" />
            Chamar no WhatsApp
          </button>
        </section>

        {/* Footer */}
        <footer className="border-t py-6 px-4 text-center" style={{ borderColor: p.border, background: p.bgCard }}>
          <div className="flex items-center justify-center gap-2">
            <Truck style={{ color: p.accent }} className="h-5 w-5" />
            <span className="font-bold" style={{ color: p.text }}>
              Pe<span style={{ color: p.accent }}>gue</span>
            </span>
          </div>
          <p className="mt-2 text-xs" style={{ color: p.textMuted }}>Frete e Mudanca Rapido e Seguro</p>
        </footer>
      </div>
    </div>
  );
}
