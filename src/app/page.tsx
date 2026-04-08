import Link from "next/link";
import Image from "next/image";
import {
  Zap,
  MapPin,
  Camera,
  Mic,
  ShieldCheck,
  Star,
  ArrowRight,
  CheckCircle,
  Lock,
  Truck,
  Clock,
  Users,
  Phone,
  Eye,
  Award,
  Package,
  Home,
  Palmtree,
  ImageIcon,
} from "lucide-react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { WHATSAPP_LINK, INSTAGRAM_LINK, INSTAGRAM_HANDLE } from "@/lib/constants";

const diferenciais = [
  {
    icon: Star,
    title: "Melhor custo-beneficio",
    description:
      "Preco justo e transparente. Sem taxa escondida, sem surpresa no final. Voce sabe exatamente o que vai pagar antes de fechar.",
  },
  {
    icon: Clock,
    title: "Agilidade e rapidez",
    description:
      "Pequenos fretes entregues no mesmo dia. Cotacao em segundos, coleta rapida e entrega sem demora.",
  },
  {
    icon: Camera,
    title: "Envie foto do material",
    description:
      "Mande uma foto ou video do que precisa transportar. Assim garantimos o veiculo certo e evitamos surpresas.",
  },
  {
    icon: ShieldCheck,
    title: "Seguranca total",
    description:
      "Motoristas verificados, fotos de coleta e entrega com GPS, PIN de confirmacao. Sua carga protegida.",
  },
  {
    icon: Mic,
    title: "Mande um audio",
    description:
      "Sem formularios. Mande um audio no WhatsApp contando o que precisa. A gente entende voce.",
  },
  {
    icon: Lock,
    title: "Pagamento protegido",
    description:
      "Pague por Pix ou cartao. O valor so e liberado ao motorista apos a entrega confirmada.",
  },
  {
    icon: MapPin,
    title: "Rastreio completo",
    description:
      "Acompanhe cada etapa do seu frete. Voce sabe onde sua carga esta a todo momento.",
  },
];

const servicos = [
  {
    icon: Package,
    title: "Pequenos Fretes Rapidos",
    destaque: true,
    desc: "Precisa enviar um movel, eletrodomestico, caixas ou qualquer item? A Pegue busca e entrega no mesmo dia. Preco justo, rapido e sem complicacao. Melhor custo-beneficio da regiao.",
    exemplos: ["Geladeira", "Maquina de lavar", "Sofa", "Caixas", "Colchao", "Mesa", "TV", "Estante"],
    img: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&h=400&fit=crop",
  },
  {
    icon: Home,
    title: "Pequenas e Grandes Mudancas",
    destaque: false,
    desc: "De uma kitnet a uma casa inteira. Mudanca residencial ou comercial com cuidado, organizacao e motoristas preparados. Pequenas mudancas com preco justo e agilidade.",
    exemplos: ["Kitnet", "Quarto", "Apartamento", "Casa", "Escritorio", "Loja", "Republica"],
    img: "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?w=600&h=400&fit=crop",
  },
  {
    icon: Palmtree,
    title: "Litoral e Interior SP",
    destaque: false,
    desc: "Precisa enviar itens para o litoral ou interior de Sao Paulo? Moveis, eletrodomesticos, caixas. Coleta em SP, entrega no destino.",
    exemplos: ["Santos", "Guaruja", "Praia Grande", "Campinas", "Sorocaba", "Ribeirao Preto", "Sao Jose dos Campos"],
    img: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=400&fit=crop",
  },
];

const passos = [
  {
    num: "01",
    title: "Conte o que precisa",
    desc: "Mande audio, texto ou foto no WhatsApp. Diga de onde sai, para onde vai e o que vai transportar.",
    icon: Phone,
  },
  {
    num: "02",
    title: "Envie foto do material",
    desc: "Mande uma foto ou video do que sera transportado. Isso garante o veiculo certo e evita qualquer problema.",
    icon: Camera,
  },
  {
    num: "03",
    title: "Receba opcoes de preco",
    desc: "Escolha entre Economica, Padrao ou Premium. Precos claros, sem surpresa.",
    icon: Eye,
  },
  {
    num: "04",
    title: "Pague e acompanhe",
    desc: "Pague com Pix ou cartao. Acompanhe a coleta e entrega com prova digital.",
    icon: ShieldCheck,
  },
];

const dores = [
  {
    dor: "Precisa enviar um movel e nao sabe como?",
    solucao: "Na Pegue, voce manda a foto e a gente resolve.",
  },
  {
    dor: "Medo de entregar sua carga a um desconhecido?",
    solucao: "Motoristas verificados com documentos e avaliacao.",
  },
  {
    dor: "Ja teve problema de viagem perdida ou extravio?",
    solucao: "Foto obrigatoria do material antes de sair. Tudo registrado.",
  },
  {
    dor: "Pagou e o motorista sumiu?",
    solucao: "Pagamento protegido. So liberamos apos a entrega confirmada.",
  },
];

export default function HomePage() {
  return (
    <>
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden bg-[#0A0A0A] text-white">
        <div className="absolute inset-0 z-0">
          <Image
            src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1400&h=800&fit=crop&q=50"
            alt="Frete rapido"
            fill
            className="object-cover opacity-10 grayscale"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#000000]/90 via-[#000000]/80 to-[#0A0A0A]" />
        </div>

        <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-4 py-16 text-center md:py-24">
          {/* Logo */}
          <Image
            src="/logo-pegue.png"
            alt="Pegue - Solucoes em Transportes e Fretes"
            width={220}
            height={220}
            className="mb-8 h-40 w-auto md:h-52"
            priority
          />

          <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-6xl lg:text-7xl">
            Seu frete{" "}
            <span className="text-[#C9A84C]">rapido e seguro.</span>
            <br />
            <span className="text-2xl font-bold text-[#C9A84C]/80 md:text-3xl">
              Melhor custo-beneficio da regiao.
            </span>
          </h1>

          <p className="mt-4 max-w-2xl text-lg text-gray-400 md:text-xl">
            Pequenos fretes, pequenas e grandes mudancas, envios para litoral e interior de SP.
          </p>
          <p className="mt-1 max-w-2xl text-lg font-medium text-gray-300 md:text-xl">
            Preco justo, sem surpresas. Mande a foto do material e receba o valor na hora.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-center gap-2 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-[#0A0A0A] transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(201,168,76,0.3)]"
            >
              Pedir Frete Agora
              <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
            </a>
            <Link
              href="/simular"
              className="flex items-center justify-center rounded-full border-2 border-[#C9A84C]/50 px-8 py-4 text-lg font-semibold text-[#C9A84C] transition-all hover:border-[#C9A84C] hover:bg-[#C9A84C]/10"
            >
              Simular Frete
            </Link>
          </div>

          {/* 5 Pilares */}
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-5 md:gap-4">
            {[
              { icon: Star, label: "Preco justo", sub: "Melhor custo-beneficio" },
              { icon: Clock, label: "Agilidade", sub: "Entrega no mesmo dia" },
              { icon: ShieldCheck, label: "Seguranca", sub: "Motoristas verificados" },
              { icon: MapPin, label: "Rastreio", sub: "Controle total" },
              { icon: Lock, label: "Pagamento seguro", sub: "Pix e cartao protegido" },
            ].map((pilar) => (
              <div key={pilar.label} className="rounded-xl border border-gray-800 bg-[#111111]/50 p-3 text-center">
                <pilar.icon size={20} className="mx-auto text-[#C9A84C]" />
                <p className="mt-1 text-xs font-bold text-white">{pilar.label}</p>
                <p className="text-[10px] text-gray-500">{pilar.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICOS - HIERARQUIA CLARA */}
      <section className="bg-[#0A0A0A] py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-white md:text-4xl">
            O que voce <span className="text-[#C9A84C]">precisa?</span>
          </h2>
          <p className="mt-3 text-center text-gray-500">
            Do pequeno frete a mudanca completa. Atendemos toda regiao.
          </p>

          <div className="mt-12 space-y-6">
            {servicos.map((srv) => (
              <div
                key={srv.title}
                className={`group overflow-hidden rounded-2xl border ${srv.destaque ? "border-[#C9A84C]/50 bg-gradient-to-r from-[#C9A84C]/10 to-[#111111]" : "border-gray-800 bg-[#111111]"} transition-all hover:border-[#C9A84C]/30`}
              >
                <div className="flex flex-col md:flex-row">
                  {/* Imagem */}
                  <div className="relative h-56 w-full md:h-auto md:w-80 shrink-0">
                    <Image
                      src={srv.img}
                      alt={srv.title}
                      fill
                      className="object-cover"
                    />
                    {srv.destaque && (
                      <div className="absolute top-3 left-3 rounded-full bg-[#C9A84C] px-3 py-1 text-xs font-bold text-[#0A0A0A]">
                        MAIS PROCURADO
                      </div>
                    )}
                  </div>

                  {/* Conteudo */}
                  <div className="flex-1 p-6 md:p-8">
                    <div className="flex items-center gap-3">
                      <srv.icon size={24} className="text-[#C9A84C]" />
                      <h3 className={`text-xl font-bold text-white ${srv.destaque ? "md:text-2xl" : ""}`}>
                        {srv.title}
                      </h3>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-gray-400 md:text-base">
                      {srv.desc}
                    </p>

                    {/* Exemplos */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {srv.exemplos.map((ex) => (
                        <span
                          key={ex}
                          className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-400"
                        >
                          {ex}
                        </span>
                      ))}
                    </div>

                    <a
                      href={WHATSAPP_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#C9A84C] px-6 py-3 text-sm font-bold text-[#0A0A0A] transition-transform hover:scale-105"
                    >
                      Pedir orcamento
                      <ArrowRight size={16} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA - 4 PASSOS (com foto obrigatoria) */}
      <section className="bg-[#111111] py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-white md:text-4xl">
            Como funciona? <span className="text-[#C9A84C]">4 passos.</span>
          </h2>
          <p className="mt-3 text-center text-gray-500">
            Simples, rapido e sem burocracia.
          </p>

          <div className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {passos.map((step) => (
              <div key={step.num} className="relative text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#C9A84C]/30 bg-[#C9A84C]/10">
                  <step.icon size={28} className="text-[#C9A84C]" />
                </div>
                <div className="mt-1 text-xs font-bold text-[#C9A84C]/50">
                  PASSO {step.num}
                </div>
                <h3 className="mt-3 text-lg font-bold text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Destaque foto obrigatoria */}
          <div className="mt-12 rounded-2xl border border-[#C9A84C]/30 bg-[#C9A84C]/5 p-6 text-center">
            <div className="flex items-center justify-center gap-2 text-[#C9A84C]">
              <ImageIcon size={20} />
              <p className="font-bold">Por que pedimos foto do material?</p>
            </div>
            <p className="mt-2 text-sm text-gray-400">
              A foto garante que enviamos o veiculo certo para sua carga.
              Evita viagem perdida, surpresas no valor e problemas de extravio.
              Transparencia para voce e para nos.
            </p>
          </div>
        </div>
      </section>

      {/* DORES E SOLUCOES */}
      <section className="bg-[#0A0A0A] py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-white md:text-4xl">
            Voce ja <span className="text-[#C9A84C]">passou por isso?</span>
          </h2>
          <p className="mt-3 text-center text-gray-500">
            A Pegue existe para resolver cada uma dessas dores.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {dores.map((item) => (
              <div
                key={item.dor}
                className="group rounded-2xl border border-gray-800 bg-[#111111] p-6 transition-all hover:border-[#C9A84C]/30"
              >
                <p className="text-lg font-semibold text-red-400/80">
                  {item.dor}
                </p>
                <div className="mt-3 flex items-start gap-2">
                  <CheckCircle size={20} className="mt-0.5 shrink-0 text-[#C9A84C]" />
                  <p className="text-base text-gray-300">{item.solucao}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DIFERENCIAIS */}
      <section className="bg-[#111111] py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-white md:text-4xl">
            Por que a <span className="text-[#C9A84C]">Pegue?</span>
          </h2>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {diferenciais.map((feat) => (
              <div
                key={feat.title}
                className="group rounded-2xl border border-gray-800 bg-[#0A0A0A] p-6 transition-all hover:border-[#C9A84C]/30"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#C9A84C]/10">
                  <feat.icon className="h-6 w-6 text-[#C9A84C]" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">
                  {feat.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {feat.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SEGURANCA */}
      <section className="relative overflow-hidden bg-[#0A0A0A] py-20">
        <div className="absolute inset-0 bg-gradient-to-r from-[#C9A84C]/5 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-2 text-sm text-[#C9A84C]">
                <Lock size={16} />
                Seguranca e nossa prioridade
              </div>
              <h2 className="text-3xl font-extrabold text-white md:text-4xl">
                Sua carga{" "}
                <span className="text-[#C9A84C]">100% protegida</span>
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-gray-400">
                Sabemos que confiar sua carga a alguem nao e facil.
                Por isso, criamos um sistema completo de seguranca.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  "Foto obrigatoria do material antes da coleta",
                  "Motoristas com documentos verificados",
                  "Foto da carga e da placa antes da saida",
                  "Rastreio durante todo o percurso",
                  "Foto da entrega com geolocalizacao e horario",
                  "PIN de confirmacao - so quem recebe tem o codigo",
                  "Pagamento protegido - liberado somente apos entrega",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle size={20} className="mt-0.5 shrink-0 text-[#C9A84C]" />
                    <p className="text-sm text-gray-300">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-2xl border border-gray-800">
                <Image
                  src="https://images.unsplash.com/photo-1580674285054-bed31e145f59?w=600&h=500&fit=crop"
                  alt="Seguranca no transporte"
                  width={600}
                  height={500}
                  className="w-full object-cover"
                />
              </div>
              <div className="absolute -bottom-4 -left-4 rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C9A84C]/20">
                    <Camera size={20} className="text-[#C9A84C]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Foto do material recebida</p>
                    <p className="text-xs text-gray-500">Veiculo confirmado para sua carga</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* REGIOES DE ATENDIMENTO */}
      <section className="bg-[#111111] py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-white md:text-4xl">
            Onde <span className="text-[#C9A84C]">atendemos</span>
          </h2>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-[#C9A84C]/30 bg-[#C9A84C]/5 p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A84C]/20">
                <MapPin size={24} className="text-[#C9A84C]" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">Grande Sao Paulo</h3>
              <p className="mt-2 text-sm text-gray-400">
                Osasco, Carapicuiba, Barueri, Cotia, Jandira, Itapevi, Taboao, Embu e toda capital.
              </p>
              <p className="mt-2 text-xs font-semibold text-[#C9A84C]">Entrega no mesmo dia</p>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-[#0A0A0A] p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A84C]/10">
                <Truck size={24} className="text-[#C9A84C]" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">Interior de SP</h3>
              <p className="mt-2 text-sm text-gray-400">
                Campinas, Sorocaba, Ribeirao Preto, Sao Jose dos Campos, Piracicaba e mais.
              </p>
              <p className="mt-2 text-xs font-semibold text-gray-500">Envio de itens e fretes</p>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-[#0A0A0A] p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A84C]/10">
                <Palmtree size={24} className="text-[#C9A84C]" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">Litoral Paulista</h3>
              <p className="mt-2 text-sm text-gray-400">
                Santos, Guaruja, Praia Grande, Sao Vicente, Bertioga, Ubatuba, Caraguatatuba.
              </p>
              <p className="mt-2 text-xs font-semibold text-gray-500">Envio de itens e fretes</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative overflow-hidden bg-[#0A0A0A] py-20">
        <div className="absolute inset-0 bg-gradient-to-br from-[#C9A84C]/10 via-transparent to-[#C9A84C]/5" />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 text-center">
          <h2 className="text-3xl font-extrabold text-white md:text-5xl">
            Pronto para{" "}
            <span className="text-[#C9A84C]">pegar?</span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Mande a foto do que precisa transportar e receba seu orcamento em segundos.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-center gap-2 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-[#0A0A0A] transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(201,168,76,0.3)]"
            >
              Pedir Frete Agora
              <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
            </a>
            <Link
              href="/simular"
              className="flex items-center justify-center rounded-full border-2 border-[#C9A84C]/50 px-8 py-4 text-lg font-semibold text-[#C9A84C] transition-all hover:border-[#C9A84C] hover:bg-[#C9A84C]/10"
            >
              Simular Frete
            </Link>
          </div>
          <a
            href={INSTAGRAM_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 text-sm text-gray-500 transition-colors hover:text-[#C9A84C]"
          >
            Siga {INSTAGRAM_HANDLE} no Instagram
          </a>
        </div>
      </section>

      {/* TRUST BAR */}
      <section className="border-t border-gray-800 bg-[#0A0A0A] py-8">
        <div className="mx-auto max-w-4xl px-4">
          <div className="flex flex-wrap items-center justify-center gap-8">
            {[
              "Foto do material obrigatoria",
              "Motoristas verificados",
              "Pagamento protegido",
              "Prova digital de entrega",
              "Grande SP, Litoral e Interior",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[#C9A84C]" />
                <span className="text-xs font-medium text-gray-500">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
