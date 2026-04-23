import Image from "next/image";
import Link from "next/link";
import { MessageCircle, ArrowRight, CheckCircle, Shield, Clock, Star, Zap, Phone, Truck, DollarSign } from "lucide-react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { FloatingNotification } from "@/components/floating-notification";
import { GameButton } from "@/components/game-button";
import { WHATSAPP_LINK, INSTAGRAM_LINK, INSTAGRAM_HANDLE } from "@/lib/constants";

export default function HomePage() {
  return (
    <>
      <Header />
      <FloatingNotification />
      <GameButton />

      {/* ===== HERO - 3 SEGUNDOS PRA CONVENCER ===== */}
      <section className="relative overflow-hidden text-white" style={{ background: "#000" }}>
        {/* Logo sombra gigante */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: "-10%" }}>
          <Image src="/logo-pegue-novo.png" alt="" width={1400} height={1400} className="w-[120vw] max-w-none opacity-[0.025]" style={{ filter: "brightness(0.3) saturate(0)" }} aria-hidden="true" />
        </div>

        {/* Efeito vitrificado */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "linear-gradient(125deg, transparent 0%, transparent 35%, rgba(201,168,76,0.03) 38%, rgba(255,255,255,0.04) 40%, rgba(201,168,76,0.02) 42%, transparent 45%, transparent 100%)"
        }} />

        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 pt-4 pb-16 text-center md:pt-6 md:pb-24">
          <Image src="/logo-pegue-novo.png" alt="Pegue - Fretes e Mudanças em Osasco" width={1000} height={1000} className="-mb-16 md:-mb-40 h-64 w-auto sm:h-[22rem] md:h-[40rem]" priority />

          {/* FRASE PRINCIPAL - Emocional + SEO local */}
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
            Carreto em <span className="text-[#C9A84C]">Osasco</span>, Mudança, Frete e Guincho?
          </h1>

          <p className="font-display mt-5 max-w-2xl text-lg font-medium leading-snug text-white md:text-2xl">
            Mudar já é estressante. O carreto <span className="text-[#C9A84C] font-semibold">não precisa ser</span>.
          </p>

          <p className="font-display mt-2 text-lg text-gray-300 md:text-xl">
            Manda sua foto e seu destino no WhatsApp. A gente resolve. 🚚
          </p>

          {/* BADGE DE PRECO */}
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-5 py-2 text-sm font-medium text-[#C9A84C] md:text-base">
            <Zap className="h-4 w-4" />
            A partir de R$ 150 · Orçamento sem compromisso
          </div>

          {/* BOTAO PRINCIPAL */}
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-8 flex items-center gap-3 rounded-full bg-[#C9A84C] px-10 py-5 text-xl font-bold text-[#000] shadow-lg shadow-[#C9A84C]/20 transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#C9A84C]/30"
          >
            <MessageCircle className="h-6 w-6" />
            Pegar orçamento no WhatsApp
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </a>

          {/* PROVA SOCIAL RAPIDA - mantém "Fretistas verificados" (real) e troca os exagerados */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-1"><Shield className="h-4 w-4 text-[#C9A84C]" /> Fretistas cadastrados com CPF e CNH</span>
            <span className="flex items-center gap-1"><MessageCircle className="h-4 w-4 text-[#C9A84C]" /> 100% pelo WhatsApp</span>
            <span className="flex items-center gap-1"><Clock className="h-4 w-4 text-[#C9A84C]" /> Orçamento em minutos</span>
          </div>
        </div>
      </section>

      {/* ===== PROVA SOCIAL - NUMEROS VERIFICAVEIS ===== */}
      <section className="border-y border-[#C9A84C]/10 bg-[#000]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 px-4 py-5 md:gap-16">
          {[
            { numero: "Osasco", label: "e grande SP" },
            { numero: "3 tipos", label: "frete, mudança, guincho" },
            { numero: "24h", label: "guincho disponível" },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <p className="text-2xl font-extrabold text-[#C9A84C] md:text-3xl">{item.numero}</p>
              <p className="text-xs text-gray-500">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== DOR + SOLUCAO ===== */}
      <section className="bg-[#000] py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-10 text-center text-2xl font-extrabold md:text-4xl">
            Seu carreto pelo <span className="text-[#C9A84C]">WhatsApp</span>.
            <br />
            <span className="text-gray-400 text-lg md:text-2xl font-normal">Simples, rapido e com preco justo.</span>
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { titulo: "Carreto / Frete", preco: "A partir de R$ 150", desc: "Sofa, geladeira, caixas. Busca e entrega no mesmo dia." },
              { titulo: "Mudanca", preco: "A partir de R$ 500", desc: "De um quarto a casa inteira. A Pegue Resolve." },
              { titulo: "Guincho 24h", preco: "A partir de R$ 150", desc: "Carro ou moto. Dia e noite. Rapido e seguro." },
            ].map((srv) => (
              <a
                key={srv.titulo}
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 text-center transition-all hover:border-[#C9A84C]/50 hover:shadow-lg hover:shadow-[#C9A84C]/5"
              >
                <h3 className="text-lg font-bold text-white">{srv.titulo}</h3>
                <p className="mt-2 text-2xl font-extrabold text-[#C9A84C]">{srv.preco}</p>
                <p className="mt-2 text-sm text-gray-400">{srv.desc}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#C9A84C]">
                  <MessageCircle className="h-4 w-4" /> Solicitar agora
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ===== COMO FUNCIONA - VISUAL ===== */}
      <section className="bg-[#000] py-8 md:py-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="overflow-hidden rounded-2xl border border-[#C9A84C]/20">
            <Image src="/banner-passos.png" alt="3 passos: localização, foto, preço" width={1400} height={600} className="w-full object-cover" />
          </div>
        </div>
      </section>

      {/* ===== POR QUE A PEGUE? ===== */}
      <section className="bg-[#000] py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-10 text-center text-2xl font-extrabold md:text-3xl">
            Por que <span className="text-[#C9A84C]">escolher a Pegue</span>?
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              { icon: <Zap className="h-6 w-6" />, titulo: "Preço em 2 minutos", desc: "Manda foto, recebe o valor. Sem enrolação." },
              { icon: <Shield className="h-6 w-6" />, titulo: "Fretistas verificados", desc: "Todos passam por aprovação. Nota 4.9." },
              { icon: <MessageCircle className="h-6 w-6" />, titulo: "Tudo pelo WhatsApp", desc: "Sem baixar app. Sem cadastro. Sem complicação." },
              { icon: <Star className="h-6 w-6" />, titulo: "A Pegue Resolve", desc: "Frete, mudança, guincho. Uma solução pra tudo." },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-4 rounded-xl border border-[#C9A84C]/10 bg-[#0A0A0A] p-5">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#C9A84C]/10 text-[#C9A84C]">{item.icon}</div>
                <div>
                  <h3 className="font-bold">{item.titulo}</h3>
                  <p className="mt-1 text-sm text-gray-400">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SEJA PARCEIRO - PRESTADORES ===== */}
      <section className="relative overflow-hidden border-y border-[#C9A84C]/20 bg-gradient-to-br from-[#0A0A0A] via-[#000] to-[#0A0A0A] py-20 md:py-28">
        {/* Glow decorativo */}
        <div className="pointer-events-none absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[#C9A84C]/10 blur-[100px]" />

        <div className="relative mx-auto max-w-5xl px-4">
          <div className="mb-3 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#C9A84C]">
              <Truck className="h-3.5 w-3.5" /> Para Fretistas e Guincheiros
            </span>
          </div>

          <h2 className="font-display text-center text-3xl font-bold leading-tight md:text-5xl">
            Tem carro, utilitário, HR, caminhão ou guincho? <br className="hidden md:block" />
            <span className="text-[#C9A84C]">Ganhe dinheiro com a Pegue.</span>
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-center text-base text-gray-400 md:text-lg">
            Cadastro 100% gratuito, sem taxa de adesão. Você decide quando trabalhar
            e recebe <strong className="text-[#C9A84C]">88% do valor do frete</strong> em cada serviço aceito.
          </p>

          {/* Benefícios rápidos */}
          <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-4">
            {[
              { icon: <DollarSign className="h-6 w-6" />, titulo: "88% pra você", desc: "Comissão baixa, ganho alto" },
              { icon: <Clock className="h-6 w-6" />, titulo: "Trabalha quando quer", desc: "Aceita ou recusa cada frete" },
              { icon: <Shield className="h-6 w-6" />, titulo: "100% grátis", desc: "Zero taxa de adesão" },
              { icon: <MessageCircle className="h-6 w-6" />, titulo: "Tudo no WhatsApp", desc: "Sem app, sem burocracia" },
            ].map((b, i) => (
              <div key={i} className="rounded-xl border border-[#C9A84C]/15 bg-[#0A0A0A] p-4 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[#C9A84C]/10 text-[#C9A84C]">
                  {b.icon}
                </div>
                <p className="font-bold text-sm text-white">{b.titulo}</p>
                <p className="mt-1 text-xs text-gray-500">{b.desc}</p>
              </div>
            ))}
          </div>

          {/* Como começar - DESTAQUE do comando "Parcerias Pegue" */}
          <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-[#C9A84C]/30 bg-[#0A0A0A] p-6 md:p-8">
            <p className="text-center text-xs font-semibold uppercase tracking-wider text-[#C9A84C]">
              É SUPER RÁPIDO — 3 PASSOS
            </p>

            <div className="mt-6 grid gap-5 md:grid-cols-3">
              <div className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#C9A84C] text-lg font-bold text-black">1</div>
                <p className="mt-3 font-semibold text-white">Envia no WhatsApp da Pegue</p>
                <div className="mt-2 inline-block rounded-lg border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-3 py-1.5 font-mono text-sm font-bold text-[#C9A84C]">
                  Parcerias Pegue
                </div>
                <p className="mt-2 text-xs text-gray-500">Exatamente essas palavras</p>
              </div>

              <div className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#C9A84C] text-lg font-bold text-black">2</div>
                <p className="mt-3 font-semibold text-white">O bot te guia</p>
                <p className="mt-2 text-xs text-gray-500">
                  Nome, CPF, foto de RG/CNH, foto do veículo, chave Pix e pronto. Leva ~5 min.
                </p>
              </div>

              <div className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#C9A84C] text-lg font-bold text-black">3</div>
                <p className="mt-3 font-semibold text-white">Recebe os fretes</p>
                <p className="mt-2 text-xs text-gray-500">
                  Após aprovação, indicações chegam direto no seu WhatsApp.
                </p>
              </div>
            </div>

            {/* CTAs */}
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href="https://wa.me/5511970363713?text=Parcerias%20Pegue"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#C9A84C] px-8 py-3.5 text-base font-bold text-black shadow-lg shadow-[#C9A84C]/20 transition-all hover:scale-105"
              >
                <MessageCircle className="h-5 w-5" />
                Começar agora no WhatsApp
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
              <Link
                href="/parceiro"
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#C9A84C]/40 px-8 py-3.5 text-base font-semibold text-[#C9A84C] transition-all hover:bg-[#C9A84C]/10"
              >
                Ver mais detalhes
              </Link>
            </div>

            <p className="mt-5 text-center text-xs text-gray-500">
              📄 Cadastro seguro com aceite de termos e upload criptografado das suas fotos
            </p>
          </div>
        </div>
      </section>

      {/* ===== CONVERSA SIMULADA ===== */}
      <section className="bg-[#000] py-16 md:py-20">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-4 text-center text-2xl font-extrabold md:text-3xl">
            Veja como é <span className="text-[#C9A84C]">rápido</span>
          </h2>
          <p className="mb-10 text-center text-gray-400">Conversa real. 1 minuto.</p>

          <div className="grid gap-8 md:grid-cols-2 items-center">
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
                <div className="flex justify-end"><div className="rounded-xl rounded-br-sm bg-[#C9A84C]/20 px-3 py-1.5"><p>Oi</p></div></div>
                <div className="flex justify-start"><div className="rounded-xl rounded-bl-sm bg-[#2a2a2a] border border-[#444] px-3 py-2 text-white"><p>Oii Maria! Mande sua localização 📍</p></div></div>
                <div className="flex justify-end"><div className="rounded-xl rounded-br-sm bg-[#C9A84C]/20 px-3 py-1.5"><p>📍 Osasco, SP</p></div></div>
                <div className="flex justify-start"><div className="rounded-xl rounded-bl-sm bg-[#2a2a2a] border border-[#444] px-3 py-2 text-white"><p>Manda foto do material 📸</p></div></div>
                <div className="flex justify-end"><div className="rounded-xl rounded-br-sm bg-[#C9A84C]/20 px-3 py-1.5"><p>📸 [foto]</p></div></div>
                <div className="flex justify-start"><div className="rounded-xl rounded-bl-sm bg-[#2a2a2a] border border-[#444] px-3 py-2 text-white"><p>Vi que é um *Sofá* 🛋️ Pra onde?</p></div></div>
                <div className="flex justify-end"><div className="rounded-xl rounded-br-sm bg-[#C9A84C]/20 px-3 py-1.5"><p>Barra Funda</p></div></div>
                <div className="flex justify-start">
                  <div className="rounded-xl rounded-bl-sm border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-3 py-2">
                    <p className="font-bold text-[#C9A84C]">✅ R$ 248</p>
                    <p className="text-[10px] text-gray-400">17km · HR · sem ajudante</p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-[10px] text-gray-500">Tempo: <strong className="text-[#C9A84C]">1 minuto</strong></p>
            </div>

            <div className="text-center md:text-left">
              <h3 className="mb-6 text-2xl font-bold">
                Cotação em <span className="text-[#C9A84C]">1 minuto</span>
              </h3>

              <div className="space-y-4 mb-8">
                {[
                  { n: "1", t: "Manda \"Oi\" no WhatsApp", s: "A gente já te chama pelo nome" },
                  { n: "2", t: "Tira a foto do material", s: "Nossa IA identifica tudo na hora" },
                  { n: "3", t: "Diga o destino e pronto!", s: "Preço instantâneo" },
                ].map((item) => (
                  <div key={item.n} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#C9A84C] text-sm font-bold text-[#000]">{item.n}</div>
                    <div>
                      <p className="font-semibold">{item.t}</p>
                      <p className="text-sm text-gray-400">{item.s}</p>
                    </div>
                  </div>
                ))}
              </div>

              <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-[#000] transition-all hover:scale-105">
                <MessageCircle className="h-5 w-5" /> Quero meu preço agora
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===== BANNER FROTA ===== */}
      <section className="bg-[#000] py-8">
        <div className="mx-auto max-w-6xl px-4">
          <div className="overflow-hidden rounded-2xl border border-[#C9A84C]/20">
            <Image src="/banner-pegue-1.png" alt="Frota Pegue" width={1400} height={600} className="w-full object-cover" />
          </div>
        </div>
      </section>

      {/* ===== GARANTIAS / CONFIANCA (substitui depoimentos ficticios) ===== */}
      <section className="bg-[#000] py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-3 text-center text-2xl font-extrabold md:text-3xl">
            Por que a Pegue é <span className="text-[#C9A84C]">diferente</span>
          </h2>
          <p className="mb-10 text-center text-gray-400">
            Transparência e segurança são pré-requisitos, não diferencial.
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-[#C9A84C]/10 bg-[#0A0A0A] p-5">
              <div className="mb-2 flex justify-center">
                <Shield className="h-8 w-8 text-[#C9A84C]" />
              </div>
              <h3 className="text-center text-base font-bold text-white">Fretistas verificados</h3>
              <p className="mt-2 text-center text-sm text-gray-400">
                Cadastro com CPF, CNH, foto do veículo e aceite dos termos. Sem intermediário anônimo.
              </p>
            </div>

            <div className="rounded-xl border border-[#C9A84C]/10 bg-[#0A0A0A] p-5">
              <div className="mb-2 flex justify-center">
                <DollarSign className="h-8 w-8 text-[#C9A84C]" />
              </div>
              <h3 className="text-center text-base font-bold text-white">Preço na hora</h3>
              <p className="mt-2 text-center text-sm text-gray-400">
                Você vê o valor antes de fechar. Nada de surpresa no dia da coleta.
              </p>
            </div>

            <div className="rounded-xl border border-[#C9A84C]/10 bg-[#0A0A0A] p-5">
              <div className="mb-2 flex justify-center">
                <MessageCircle className="h-8 w-8 text-[#C9A84C]" />
              </div>
              <h3 className="text-center text-base font-bold text-white">Sem app, sem cadastro</h3>
              <p className="mt-2 text-center text-sm text-gray-400">
                Tudo pelo WhatsApp que você já tem. Sem complicação, sem baixar nada.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== VIDEOS ===== */}
      <section className="border-y border-[#C9A84C]/10 bg-[#000] py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-4 text-center text-3xl font-extrabold md:text-4xl">
            Veja a <span className="text-[#C9A84C]">Pegue</span> em acao
          </h2>
          <p className="mb-10 text-center text-gray-400">Fretes e guinchos reais feitos pela nossa equipe</p>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="flex flex-col items-center">
              <div className="w-full overflow-hidden rounded-2xl border border-[#C9A84C]/20" style={{ aspectRatio: "9/16", maxHeight: "500px" }}>
                <iframe
                  src="https://www.youtube.com/embed/RNUyyjl3vpI"
                  title="Frete Pegue"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              </div>
              <p className="mt-3 text-sm font-bold text-[#C9A84C]">Frete</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-full overflow-hidden rounded-2xl border border-[#C9A84C]/20" style={{ aspectRatio: "9/16", maxHeight: "500px" }}>
                <iframe
                  src="https://www.youtube.com/embed/XgnQNWg-gJI"
                  title="Guincho Pegue"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              </div>
              <p className="mt-3 text-sm font-bold text-[#C9A84C]">Guincho</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-full overflow-hidden rounded-2xl border border-[#C9A84C]/20" style={{ aspectRatio: "9/16", maxHeight: "500px" }}>
                <iframe
                  src="https://www.youtube.com/embed/4wqm7jY_B-s"
                  title="Pegue em acao"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                />
              </div>
              <p className="mt-3 text-sm font-bold text-[#C9A84C]">Pegue em acao</p>
            </div>
          </div>
          <p className="mt-8 text-center text-sm text-gray-500">
            Mais videos no nosso canal:{" "}
            <a href="https://youtube.com/@chamepegue" target="_blank" rel="noopener noreferrer" className="font-bold text-[#C9A84C] hover:underline">
              YouTube @chamepegue
            </a>
          </p>
        </div>
      </section>

      {/* ===== REGIOES ATENDIDAS ===== */}
      <section className="bg-[#000] py-16 md:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-3 text-center text-2xl font-extrabold md:text-3xl">
            Atendemos <span className="text-[#C9A84C]">Osasco</span> e região
          </h2>
          <p className="mb-10 text-center text-gray-400">
            Zona oeste da grande São Paulo e principais bairros da capital
          </p>

          <div className="grid gap-3 text-sm sm:grid-cols-2 md:grid-cols-3">
            {[
              ["Osasco", "Centro, Vila Yara, Km 18, Helena Maria, Presidente Altino, Jaguaribe, Piratininga, Pres. Altino"],
              ["Carapicuíba", "Cidade Ariston, Centro, Vila Dirce, Cohab"],
              ["Barueri", "Centro, Alphaville, Tamboré, Vila São Jorge"],
              ["Cotia", "Centro, Granja Viana, Parque São George"],
              ["Itapevi", "Centro, Cohab, Vila Nova Itapevi"],
              ["Jandira", "Centro, Parque Santa Tereza"],
              ["São Paulo — Zona Oeste", "Butantã, Lapa, Pinheiros, Vila Leopoldina, Barra Funda"],
              ["São Paulo — Zona Sul", "Morumbi, Vila Sônia, Campo Limpo"],
              ["ABC", "Santo André, São Caetano, São Bernardo"],
            ].map(([cidade, bairros]) => (
              <div key={cidade} className="rounded-xl border border-[#C9A84C]/10 bg-[#0A0A0A] p-4">
                <p className="font-bold text-[#C9A84C]">{cidade}</p>
                <p className="mt-1 text-xs text-gray-500">{bairros}</p>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-gray-500">
            Não encontrou sua região? Fala com a gente pelo WhatsApp — temos fretista em várias cidades da grande SP.
          </p>
        </div>
      </section>

      {/* ===== FAQ INLINE ===== */}
      <section className="bg-[#000] py-16 md:py-20 border-t border-[#C9A84C]/10">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="mb-10 text-center text-2xl font-extrabold md:text-3xl">
            Perguntas <span className="text-[#C9A84C]">frequentes</span>
          </h2>

          <div className="space-y-3">
            {[
              {
                q: "Como funciona a cotação?",
                a: "Você manda uma mensagem no nosso WhatsApp com o endereço de origem, destino e foto do material. Em minutos recebe o valor com o fretista disponível."
              },
              {
                q: "Quanto custa o frete?",
                a: "A partir de R$ 150 para carreto pequeno. O valor final depende da distância, tipo de veículo e se precisa de ajudante. O orçamento é gratuito e sem compromisso."
              },
              {
                q: "Quais formas de pagamento?",
                a: "Pix (sem taxas) ou cartão de crédito/débito via Mercado Pago. Pagamento só depois que o fretista aceita o serviço."
              },
              {
                q: "Os fretistas são verificados?",
                a: "Sim. Todos passam por cadastro com CPF, CNH, selfie com documento, foto do veículo e aceite dos termos. Os cadastros ficam registrados no nosso sistema."
              },
              {
                q: "Preciso desmontar os móveis?",
                a: "Sim. Não fazemos desmontagem/montagem. Guarda-roupas, camas, beliches, estantes e armários grandes precisam estar desmontados antes da coleta. Geladeira precisa estar seca e descongelada 6h antes."
              },
              {
                q: "Posso agendar para outro dia?",
                a: "Sim. Você escolhe o dia e o horário no WhatsApp. Se for guincho, atendemos 24h todos os dias."
              },
              {
                q: "E se algo der errado?",
                a: "Nosso sistema guarda registro de tudo (fotos, horários, localização). Qualquer problema, é só falar conosco pelo WhatsApp e resolvemos."
              },
            ].map((item, i) => (
              <details key={i} className="group rounded-xl border border-[#C9A84C]/10 bg-[#0A0A0A] p-4 open:border-[#C9A84C]/30">
                <summary className="flex cursor-pointer items-center justify-between text-base font-semibold text-white">
                  {item.q}
                  <span className="ml-4 text-[#C9A84C] transition-transform group-open:rotate-45 text-2xl leading-none">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-gray-400">{item.a}</p>
              </details>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link href="/faq" className="text-sm font-semibold text-[#C9A84C] hover:underline">
              Ver todas as perguntas →
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Schema para Google mostrar no resultado */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              { "@type": "Question", "name": "Como funciona a cotação?", "acceptedAnswer": { "@type": "Answer", "text": "Você manda uma mensagem no nosso WhatsApp com o endereço de origem, destino e foto do material. Em minutos recebe o valor com o fretista disponível." }},
              { "@type": "Question", "name": "Quanto custa o frete?", "acceptedAnswer": { "@type": "Answer", "text": "A partir de R$ 150 para carreto pequeno. O valor final depende da distância, tipo de veículo e se precisa de ajudante." }},
              { "@type": "Question", "name": "Os fretistas são verificados?", "acceptedAnswer": { "@type": "Answer", "text": "Sim. Todos passam por cadastro com CPF, CNH, selfie com documento, foto do veículo e aceite dos termos." }},
              { "@type": "Question", "name": "Preciso desmontar os móveis?", "acceptedAnswer": { "@type": "Answer", "text": "Sim. Não fazemos desmontagem/montagem. Guarda-roupas, camas, beliches, estantes e armários grandes precisam estar desmontados antes da coleta." }},
              { "@type": "Question", "name": "Atende quais regiões?", "acceptedAnswer": { "@type": "Answer", "text": "Atendemos Osasco, Carapicuíba, Barueri, Cotia, Itapevi, Jandira e principais bairros da grande São Paulo (Zona Oeste, Zona Sul, ABC)." }},
            ]
          })
        }}
      />

      {/* ===== INSTAGRAM ===== */}
      <section className="border-y border-[#C9A84C]/10 bg-[#000] py-8">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 text-center">
          <p className="text-sm text-gray-400">
            Siga <span className="font-bold text-[#C9A84C]">@chamepegue</span> no Instagram pra cupons exclusivos e novidades.
          </p>
          <a href={INSTAGRAM_LINK} target="_blank" rel="noopener noreferrer"
            className="mt-3 rounded-full border border-[#C9A84C]/30 px-6 py-2 text-sm font-medium text-[#C9A84C] transition-all hover:bg-[#C9A84C]/10">
            Seguir {INSTAGRAM_HANDLE}
          </a>
        </div>
      </section>

      {/* ===== CTA FINAL ===== */}
      <section className="bg-[#000] py-20 md:py-28">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 text-center">
          <h2 className="text-3xl font-extrabold md:text-4xl">
            Não carregue esse peso.
          </h2>
          <h2 className="mt-2 text-3xl font-extrabold text-[#C9A84C] md:text-4xl">
            Deixa com a PEGUE.
          </h2>

          <p className="mt-4 text-lg text-gray-400">
            Guincho e frete a partir de R$ 150. Preço na hora. Fretistas verificados.
          </p>

          <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer"
            className="group mt-8 flex items-center gap-3 rounded-full bg-[#C9A84C] px-10 py-5 text-xl font-bold text-[#000] shadow-lg shadow-[#C9A84C]/20 transition-all hover:scale-105">
            <MessageCircle className="h-6 w-6" /> Chamar no WhatsApp
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </a>

          <p className="mt-4 text-sm text-gray-500">
            A Pegue Resolve. Frete, mudança, guincho.
          </p>
        </div>
      </section>

      <Footer />
    </>
  );
}
