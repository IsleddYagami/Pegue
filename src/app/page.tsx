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
} from "lucide-react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { WHATSAPP_LINK, INSTAGRAM_LINK, INSTAGRAM_HANDLE } from "@/lib/constants";

const diferenciais = [
  {
    icon: Zap,
    title: "Cotacao em segundos",
    description:
      "Chega de esperar horas por um orcamento. Informe origem e destino e receba o preco na hora. Sem enrolacao.",
  },
  {
    icon: Mic,
    title: "Mande um audio",
    description:
      "Sem formularios, sem burocracia. Mande um audio no WhatsApp contando o que precisa. A gente entende voce.",
  },
  {
    icon: ShieldCheck,
    title: "Seguranca total",
    description:
      "Motoristas verificados, fotos de coleta e entrega com GPS, PIN de confirmacao. Sua carga protegida do inicio ao fim.",
  },
  {
    icon: MapPin,
    title: "Rastreio completo",
    description:
      "Acompanhe cada etapa: da saida do motorista ate a entrega na porta. Voce sabe onde sua carga esta a todo momento.",
  },
  {
    icon: Lock,
    title: "Pagamento protegido",
    description:
      "Pague por Pix ou cartao com total seguranca. O valor so e liberado ao motorista apos a entrega confirmada.",
  },
  {
    icon: Camera,
    title: "Prova digital",
    description:
      "Fotos com geolocalizacao na coleta e entrega. Registro completo com data, hora e local exato. Evidencia total.",
  },
];

const dores = [
  {
    dor: "Cansado de esperar dias por um orcamento?",
    solucao: "Na Pegue, voce recebe em segundos.",
  },
  {
    dor: "Medo de entregar sua carga a um desconhecido?",
    solucao: "Motoristas verificados com documentos e avaliacao.",
  },
  {
    dor: "Nao sabe se a carga chegou inteira?",
    solucao: "Fotos de coleta e entrega com GPS. Prova digital.",
  },
  {
    dor: "Pagou e o motorista sumiu?",
    solucao: "Pagamento protegido. So liberamos apos a entrega.",
  },
];

const servicos = [
  {
    title: "Frete Rapido",
    desc: "Entregas e coletas na regiao com agilidade",
    img: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&h=400&fit=crop",
  },
  {
    title: "Mudanca Residencial",
    desc: "Apartamentos e casas com cuidado e organizacao",
    img: "https://images.unsplash.com/photo-1600518464441-9154a4dea21b?w=600&h=400&fit=crop",
  },
  {
    title: "Mudanca Comercial",
    desc: "Escritorios e lojas com rapidez e seguranca",
    img: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=600&h=400&fit=crop",
  },
];

const passos = [
  {
    num: "01",
    title: "Fale com a gente",
    desc: "Mande audio ou texto no WhatsApp. Diga de onde sai, para onde vai e o que precisa transportar.",
    icon: Phone,
  },
  {
    num: "02",
    title: "Escolha sua opcao",
    desc: "Receba na hora 3 opcoes de preco: Economica, Padrao ou Premium. Transparencia total.",
    icon: Eye,
  },
  {
    num: "03",
    title: "Pague e acompanhe",
    desc: "Pague com Pix ou cartao. Acompanhe a coleta e entrega em tempo real com prova digital.",
    icon: ShieldCheck,
  },
];

export default function Home() {
  return (
    <>
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden bg-[#0A0A0A] text-white">
        {/* Background image overlay */}
        <div className="absolute inset-0 z-0">
          <Image
            src="https://images.unsplash.com/photo-1519003722824-194d4455a60c?w=1400&h=800&fit=crop"
            alt="Frete e mudanca"
            fill
            className="object-cover opacity-15"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A]/80 via-[#0A0A0A]/60 to-[#0A0A0A]" />
        </div>

        <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center md:py-32">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-2 text-sm text-[#C9A84C]">
            <Award size={16} />
            Experiencia premium em frete e mudanca
          </div>

          <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-6xl lg:text-7xl">
            Sua carga em{" "}
            <span className="text-[#C9A84C]">maos seguras.</span>
            <br />
            <span className="text-3xl font-medium text-gray-400 md:text-4xl lg:text-5xl">
              Seu frete em minutos.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-300 md:text-xl">
            Motoristas verificados. Prova digital de cada etapa.
            Pagamento protegido. Tudo pelo WhatsApp, sem complicacao.
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

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <CheckCircle size={14} className="text-[#C9A84C]" /> Motoristas verificados
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle size={14} className="text-[#C9A84C]" /> Pagamento seguro
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle size={14} className="text-[#C9A84C]" /> Prova digital
            </span>
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

      {/* COMO FUNCIONA */}
      <section className="bg-[#111111] py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-white md:text-4xl">
            Simples assim. <span className="text-[#C9A84C]">3 passos.</span>
          </h2>
          <p className="mt-3 text-center text-gray-500">
            Do pedido a entrega, sem burocracia.
          </p>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {passos.map((step) => (
              <div key={step.num} className="relative text-center">
                {/* Number */}
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-[#C9A84C]/30 bg-[#C9A84C]/10">
                  <step.icon size={32} className="text-[#C9A84C]" />
                </div>
                <div className="mt-1 text-xs font-bold text-[#C9A84C]/50">
                  PASSO {step.num}
                </div>
                <h3 className="mt-3 text-xl font-bold text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DIFERENCIAIS */}
      <section className="bg-[#0A0A0A] py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-white md:text-4xl">
            Por que a <span className="text-[#C9A84C]">Pegue?</span>
          </h2>
          <p className="mt-3 text-center text-gray-500">
            Cada detalhe pensado para voce ter tranquilidade.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {diferenciais.map((feat) => (
              <div
                key={feat.title}
                className="group rounded-2xl border border-gray-800 bg-[#111111] p-6 transition-all hover:border-[#C9A84C]/30 hover:shadow-[0_0_20px_rgba(201,168,76,0.05)]"
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

      {/* SEGURANCA - DESTAQUE ESPECIAL */}
      <section className="relative overflow-hidden bg-[#111111] py-20">
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
                Por isso, criamos um sistema completo de seguranca
                para voce ter tranquilidade em cada etapa.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  "Motoristas com documentos e antecedentes verificados",
                  "Foto da carga e da placa antes da saida",
                  "Rastreio em tempo real durante todo o percurso",
                  "Foto da entrega com geolocalizacao e horario",
                  "PIN de confirmacao - so quem recebe tem o codigo",
                  "Pagamento protegido - liberado somente apos entrega",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle
                      size={20}
                      className="mt-0.5 shrink-0 text-[#C9A84C]"
                    />
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
              {/* Floating card */}
              <div className="absolute -bottom-4 -left-4 rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-4 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C9A84C]/20">
                    <ShieldCheck size={20} className="text-[#C9A84C]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Entrega verificada</p>
                    <p className="text-xs text-gray-500">PIN 4829 confirmado</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICOS */}
      <section className="bg-[#0A0A0A] py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-white md:text-4xl">
            Nossos <span className="text-[#C9A84C]">servicos</span>
          </h2>
          <p className="mt-3 text-center text-gray-500">
            Do frete rapido a mudanca completa.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {servicos.map((srv) => (
              <div
                key={srv.title}
                className="group overflow-hidden rounded-2xl border border-gray-800 bg-[#111111] transition-all hover:border-[#C9A84C]/30"
              >
                <div className="relative h-48 overflow-hidden">
                  <Image
                    src={srv.img}
                    alt={srv.title}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#111111] to-transparent" />
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-bold text-white">{srv.title}</h3>
                  <p className="mt-1 text-sm text-gray-400">{srv.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Opcoes de veiculo */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 rounded-2xl border border-gray-800 bg-[#111111] p-6">
            {[
              { icon: Truck, label: "Utilitario" },
              { icon: Truck, label: "Van" },
              { icon: Truck, label: "Caminhao Bau" },
              { icon: Users, label: "Ajudantes disponiveis" },
            ].map((opt) => (
              <div
                key={opt.label}
                className="flex items-center gap-2 text-sm text-gray-300"
              >
                <opt.icon size={18} className="text-[#C9A84C]" />
                {opt.label}
              </div>
            ))}
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
            Fale com a gente pelo WhatsApp e receba sua cotacao em segundos.
            Sem compromisso, sem burocracia.
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
            <a
              href={INSTAGRAM_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-full border-2 border-gray-700 px-8 py-4 text-lg font-semibold text-gray-300 transition-all hover:border-[#C9A84C]/50 hover:text-[#C9A84C]"
            >
              {INSTAGRAM_HANDLE}
            </a>
          </div>

          <div className="mt-6 text-sm text-gray-600">
            Osasco | Carapicuiba | Barueri | Cotia | Jandira | Itapevi
          </div>
        </div>
      </section>

      {/* TRUST BAR */}
      <section className="border-t border-gray-800 bg-[#0A0A0A] py-8">
        <div className="mx-auto max-w-4xl px-4">
          <div className="flex flex-wrap items-center justify-center gap-8">
            {[
              "Motoristas verificados",
              "Pagamento protegido",
              "Prova digital de entrega",
              "Rastreio em tempo real",
              "Suporte pelo WhatsApp",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-[#C9A84C]" />
                <span className="text-xs font-medium text-gray-500">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
