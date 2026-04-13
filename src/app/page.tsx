import Link from "next/link";
import Image from "next/image";
import { MessageCircle, Camera, CheckCircle, ArrowRight } from "lucide-react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { FloatingNotification } from "@/components/floating-notification";
import { WHATSAPP_LINK, INSTAGRAM_LINK, INSTAGRAM_HANDLE } from "@/lib/constants";

export default function HomePage() {
  return (
    <>
      <Header />
      <FloatingNotification />

      {/* HERO - Negro absoluto com logo sombra gigante + efeito vidro */}
      <section className="relative overflow-hidden text-white" style={{ background: "#000" }}>
        {/* Logo GIGANTE como marca d'agua - ultra transparente */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: "-10%" }}>
          <Image
            src="/logo-pegue-novo.png"
            alt=""
            width={1400}
            height={1400}
            className="w-[120vw] max-w-none opacity-[0.025]"
            style={{ filter: "brightness(0.3) saturate(0)" }}
            aria-hidden="true"
          />
        </div>

        {/* Efeito reflexo prismatico diagonal - feixe de luz */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `
            linear-gradient(
              125deg,
              transparent 0%,
              transparent 35%,
              rgba(201,168,76,0.03) 38%,
              rgba(255,255,255,0.04) 40%,
              rgba(201,168,76,0.02) 42%,
              transparent 45%,
              transparent 55%,
              rgba(255,255,255,0.015) 58%,
              rgba(201,168,76,0.01) 60%,
              transparent 63%,
              transparent 100%
            )
          `
        }} />

        {/* Textura vitrificada - linhas horizontais sutis */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.008) 2px, rgba(255,255,255,0.008) 3px)",
          backgroundSize: "100% 3px"
        }} />

        {/* Brilho no canto superior */}
        <div className="absolute pointer-events-none" style={{
          top: "-20%",
          right: "10%",
          width: "50%",
          height: "50%",
          background: "radial-gradient(ellipse, rgba(201,168,76,0.04) 0%, transparent 60%)",
        }} />

        {/* Linha dourada topo */}
        <div className="absolute top-0 left-0 right-0 h-px pointer-events-none" style={{
          background: "linear-gradient(90deg, transparent 10%, rgba(201,168,76,0.3) 50%, transparent 90%)"
        }} />

        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-20 text-center md:py-32">
          <Image
            src="/logo-pegue-novo.png"
            alt="Pegue"
            width={280}
            height={280}
            className="mb-10 h-36 w-auto md:h-48"
            priority
          />

          <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-6xl lg:text-7xl">
            Relaxa.{" "}
            <span className="text-[#C9A84C]">A gente leva.</span>
          </h1>

          <p className="mt-6 text-lg text-gray-400 md:text-xl">
            Fretes na Pegue e simples assim! <span className="text-[#C9A84C] font-semibold">Com a PEGUE, ficou facil levar.</span>
          </p>

          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-10 flex items-center gap-2 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-[#0A0A0A] transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(201,168,76,0.3)]"
          >
            Chamar no WhatsApp
            <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
          </a>

          <p className="mt-3 text-sm text-gray-600">
            Sem compromisso. Resposta em minutos.
          </p>
        </div>
      </section>

      {/* NUMEROS - Social proof sutil */}
      <section className="border-y border-gray-800 bg-[#000000]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 px-4 py-6 md:gap-16 md:py-8">
          {[
            { numero: "847", label: "fretes realizados" },
            { numero: "4.9", label: "avaliacao no WhatsApp" },
            { numero: "23 min", label: "tempo medio de resposta" },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <p className="text-2xl font-extrabold text-[#C9A84C] md:text-3xl">
                {item.numero}
              </p>
              <p className="text-xs text-gray-500">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BANNER - Frota Pegue */}
      <section className="bg-[#000000] py-8 md:py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="relative overflow-hidden rounded-2xl border border-[#C9A84C]/20">
            <Image
              src="/banner-pegue-1.png"
              alt="Com a PEGUE, ficou facil levar"
              width={1400}
              height={600}
              className="w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* SERVICOS */}
      <section className="bg-[#000000] py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4">
          <p className="mb-10 text-center text-lg text-gray-400">O dificil ficou facil.</p>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                titulo: "Pequenos Fretes",
                sub: "Movel, eletro, caixas. Levar ficou simples de verdade.",
                destaque: true,
              },
              {
                titulo: "Mudanca",
                sub: "De um quarto a casa inteira. A forma facil de levar o que voce precisa.",
                destaque: false,
              },
              {
                titulo: "Guincho",
                sub: "Carro ou moto. Quando parece dificil, a PEGUE facilita.",
                destaque: false,
              },
            ].map((srv) => (
              <a
                key={srv.titulo}
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className={`group glass-card rounded-2xl p-8 text-center transition-all ${srv.destaque ? "border-2 border-[#C9A84C]/30" : ""}`}
              >
                <h3 className="text-xl font-bold text-white">{srv.titulo}</h3>
                <p className="mt-3 text-sm text-gray-400">{srv.sub}</p>
                <span className="mt-4 inline-block text-sm font-medium text-[#C9A84C]">Solicitar →</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* BANNER 2 - Veiculos */}
      <section className="bg-[#000000] py-8 md:py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="relative overflow-hidden rounded-2xl border border-[#C9A84C]/20">
            <Image
              src="/banner-pegue-2.png"
              alt="PEGUE - Solucoes em Transportes e Fretes"
              width={1400}
              height={600}
              className="w-full object-cover"
            />
          </div>
          <p className="mt-4 text-center text-sm text-gray-500">O jeito facil de ter algo dificil.</p>
        </div>
      </section>

      {/* COMO FUNCIONA - 3 passos, minimo texto */}
      <section className="bg-[#000000] py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4">
          <p className="text-center text-lg text-gray-400">Fretes na Pegue e simples assim: voce chama, a gente leva!</p>

          <div className="mt-10 flex flex-col items-center gap-8 md:flex-row md:gap-4">
            {[
              { icon: MessageCircle, texto: "Manda um oi no WhatsApp" },
              { icon: Camera, texto: "Envia a foto do material" },
              { icon: CheckCircle, texto: "Recebe o valor na hora" },
            ].map((step, i) => (
              <div key={step.texto} className="flex flex-1 flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10">
                  <step.icon size={24} className="text-[#C9A84C]" />
                </div>
                {i < 2 && (
                  <div className="my-2 hidden h-px w-full bg-gradient-to-r from-transparent via-[#C9A84C]/20 to-transparent md:block" />
                )}
                <p className="mt-3 text-sm font-medium text-gray-300">
                  {step.texto}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INSTAGRAM - Sutil, vantagem clara */}
      <section className="border-y border-gray-800 bg-[#000000] py-10">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 text-center">
          <p className="text-sm text-gray-500">
            Quando parece dificil, a PEGUE facilita.{" "}
            <span className="text-[#C9A84C]">Siga no Instagram</span>{" "}
            pra cupons exclusivos e novidades.
          </p>
          <a
            href={INSTAGRAM_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 rounded-full border border-[#C9A84C]/30 px-6 py-2.5 text-sm font-medium text-[#C9A84C] transition-all hover:bg-[#C9A84C]/10"
          >
            Seguir {INSTAGRAM_HANDLE}
          </a>
        </div>
      </section>

      {/* CTA FINAL - Caloroso, sem pressao */}
      <section className="bg-[#000000] py-20 md:py-28">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 text-center">
          <h2 className="text-3xl font-extrabold text-white md:text-4xl">
            Nao carregue esse peso.{" "}
            <span className="text-[#C9A84C]">Deixa com a PEGUE.</span>
          </h2>

          <p className="mt-4 text-base text-gray-500">
            A forma facil de levar o que voce precisa. Resposta em minutos.
          </p>

          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-8 flex items-center gap-2 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-[#0A0A0A] transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(201,168,76,0.3)]"
          >
            Chamar no WhatsApp
            <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
          </a>

          <p className="mt-3 text-xs text-gray-600">
            Atendimento de seg a sab, 7h as 20h.
          </p>
        </div>
      </section>

      <Footer />
    </>
  );
}
