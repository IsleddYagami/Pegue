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
            Fretes sem dor de cabeça.
          </p>
          <p className="mt-2 text-xl font-semibold text-[#C9A84C] md:text-2xl">
            Com a PEGUE, ficou fácil levar.
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

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-6 py-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#C9A84C]"></span>
            <span className="text-base font-semibold text-[#C9A84C]">Cotação Imediata</span>
          </div>
        </div>
      </section>

      {/* NUMEROS - Social proof sutil */}
      <section className="border-y border-gray-800 bg-[#000000]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 px-4 py-6 md:gap-16 md:py-8">
          {[
            { numero: "847", label: "fretes realizados" },
            { numero: "4.9", label: "avaliação no WhatsApp" },
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
          <p className="mb-10 text-center text-lg text-gray-400">O difícil ficou fácil.</p>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                titulo: "Pequenos Fretes",
                sub: "Móvel, eletro, caixas. Levar ficou simples de verdade.",
                destaque: true,
              },
              {
                titulo: "Mudança",
                sub: "De um quarto a casa inteira. A forma fácil de levar o que você precisa.",
                destaque: false,
              },
              {
                titulo: "Guincho",
                sub: "Carro ou moto. Quando parece difícil, a PEGUE facilita.",
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

      {/* SIMULACAO DE CONVERSA WHATSAPP */}
      <section className="bg-[#000000] py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-4 text-center text-3xl font-extrabold md:text-4xl">
            Veja como é <span className="text-[#C9A84C]">rápido</span>
          </h2>
          <p className="mb-12 text-center text-gray-400">Conversa real com nosso atendimento</p>

          <div className="grid gap-8 md:grid-cols-2 items-center">
            {/* Conversa */}
            <div className="mx-auto w-full max-w-sm rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
              <div className="mb-4 flex items-center gap-3 border-b border-gray-800 pb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#C9A84C]/20">
                  <Image src="/logo-pegue-novo.png" alt="Pegue" width={24} height={24} className="h-5 w-auto" />
                </div>
                <div>
                  <p className="text-sm font-bold">PEGUE</p>
                  <p className="text-[10px] text-green-400">online agora</p>
                </div>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex justify-end">
                  <div className="rounded-xl rounded-br-sm bg-[#C9A84C]/20 px-3 py-1.5"><p>Oi</p></div>
                </div>
                <div className="flex justify-start">
                  <div className="rounded-xl rounded-bl-sm bg-[#111] px-3 py-1.5"><p>Oii! 😊 Mande sua localização 📍</p></div>
                </div>
                <div className="flex justify-end">
                  <div className="rounded-xl rounded-br-sm bg-[#C9A84C]/20 px-3 py-1.5"><p>📍 Osasco, SP</p></div>
                </div>
                <div className="flex justify-start">
                  <div className="rounded-xl rounded-bl-sm bg-[#111] px-3 py-1.5"><p>Manda foto do material 📸</p></div>
                </div>
                <div className="flex justify-end">
                  <div className="rounded-xl rounded-br-sm bg-[#C9A84C]/20 px-3 py-1.5"><p>📸 [foto enviada]</p></div>
                </div>
                <div className="flex justify-start">
                  <div className="rounded-xl rounded-bl-sm bg-[#111] px-3 py-1.5"><p>Vi que é um <strong>Sofá</strong> 🛋️ Pra onde?</p></div>
                </div>
                <div className="flex justify-end">
                  <div className="rounded-xl rounded-br-sm bg-[#C9A84C]/20 px-3 py-1.5"><p>Barra Funda, SP</p></div>
                </div>
                <div className="flex justify-start">
                  <div className="rounded-xl rounded-bl-sm border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-3 py-2">
                    <p className="font-bold text-[#C9A84C]">✅ Total: R$ 248</p>
                    <p className="text-[10px] text-gray-400">HR, sem ajudante · 17km</p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-[10px] text-gray-500">Tempo desta conversa: <strong className="text-[#C9A84C]">1 minuto</strong></p>
            </div>

            {/* Texto ao lado */}
            <div className="text-center md:text-left">
              <h3 className="mb-4 text-2xl font-bold">Cotação em <span className="text-[#C9A84C]">1 minuto</span></h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#C9A84C] text-sm font-bold text-[#000]">1</div>
                  <div>
                    <p className="font-semibold">Localização</p>
                    <p className="text-sm text-gray-400">Envie pelo GPS ou digite o endereço</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#C9A84C] text-sm font-bold text-[#000]">2</div>
                  <div>
                    <p className="font-semibold">Tire a foto</p>
                    <p className="text-sm text-gray-400">Nossa IA identifica o material na hora</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#C9A84C] text-sm font-bold text-[#000]">3</div>
                  <div>
                    <p className="font-semibold">Diga o destino e pronto!</p>
                    <p className="text-sm text-gray-400">Receba o preço na hora</p>
                  </div>
                </div>
                <p className="mt-2 text-lg font-bold text-[#C9A84C]">Simples assim!</p>
              </div>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-[#000] transition-all hover:scale-105"
              >
                <MessageCircle className="h-5 w-5" />
                Quero meu preço agora
              </a>
            </div>
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
          <p className="mt-4 text-center text-sm text-gray-500">O jeito fácil de ter algo difícil.</p>
        </div>
      </section>

      {/* COMO FUNCIONA - 3 passos, minimo texto */}
      <section className="bg-[#000000] py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4">
          <p className="text-center text-lg text-gray-400">Fretes na Pegue é simples assim: você chama, a gente leva!</p>

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
            Quando parece difícil, a PEGUE facilita.{" "}
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
            Não carregue esse peso.{" "}
            <span className="text-[#C9A84C]">Deixa com a PEGUE.</span>
          </h2>

          <p className="mt-4 text-base text-gray-500">
            A forma fácil de levar o que você precisa. Resposta em minutos.
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
