import Link from "next/link";
import {
  Zap,
  MapPin,
  Camera,
  Mic,
  ShieldCheck,
  Star,
  ArrowRight,
  CheckCircle,
} from "lucide-react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { WHATSAPP_LINK } from "@/lib/constants";

const features = [
  {
    icon: Zap,
    title: "Cotacao Instantanea",
    description:
      "Informe origem e destino. Preco na hora, sem enrolacao. Em menos de 2 minutos.",
  },
  {
    icon: MapPin,
    title: "Rastreio Completo",
    description:
      "Acompanhe cada etapa do seu frete: da coleta ate a entrega, tudo com atualizacoes.",
  },
  {
    icon: Camera,
    title: "Prova Digital",
    description:
      "Fotos geolocalizadas de coleta e entrega. PIN de confirmacao. Seguranca total.",
  },
  {
    icon: Mic,
    title: "Voice-First",
    description:
      "Mande audio no WhatsApp. Sem formularios, sem complicacao. A gente entende voce.",
  },
  {
    icon: ShieldCheck,
    title: "Pagamento Seguro",
    description:
      "Pague por Pix ou cartao. So liberamos o valor ao prestador apos a entrega.",
  },
  {
    icon: Star,
    title: "Prestadores Avaliados",
    description:
      "Motoristas verificados com score de qualidade. Transparencia total.",
  },
];

const steps = [
  {
    num: "1",
    title: "Diga o que precisa",
    description: "Mande audio ou texto no WhatsApp com origem, destino e o que transportar.",
  },
  {
    num: "2",
    title: "Receba opcoes na hora",
    description: "Escolha entre Economica, Padrao ou Premium. Precos claros, sem surpresa.",
  },
  {
    num: "3",
    title: "Pague e acompanhe",
    description: "Pague por Pix ou cartao. Acompanhe a coleta e entrega com prova digital.",
  },
];

export default function Home() {
  return (
    <>
      <Header />

      {/* Hero */}
      <section className="bg-gradient-to-br from-[#1a1a1a] to-[#2d2d2d] text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-20 text-center md:py-28">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
            Seu frete em{" "}
            <span className="text-[#00C896]">menos de 2 minutos</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-gray-300 md:text-xl">
            Frete e mudanca com cotacao instantanea pelo WhatsApp. Rastreio,
            prova digital e pagamento seguro.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-full bg-[#00C896] px-8 py-4 text-lg font-bold text-[#1a1a1a] transition-transform hover:scale-105"
            >
              Pedir Frete pelo WhatsApp
              <ArrowRight size={20} />
            </a>
            <Link
              href="/simular"
              className="flex items-center justify-center rounded-full border-2 border-white px-8 py-4 text-lg font-semibold transition-colors hover:bg-white hover:text-[#1a1a1a]"
            >
              Simular Agora
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-400">
            Osasco, Carapicuiba, Barueri, Cotia e regiao
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-[#1a1a1a] md:text-4xl">
            Como funciona
          </h2>
          <p className="mt-2 text-center text-gray-500">
            3 passos simples. Sem burocracia.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <div
                key={step.num}
                className="flex flex-col items-center text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#00C896] text-2xl font-extrabold text-white">
                  {step.num}
                </div>
                <h3 className="mt-4 text-xl font-bold text-[#1a1a1a]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold text-[#1a1a1a] md:text-4xl">
            Por que a Pegue?
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <feature.icon className="h-8 w-8 text-[#00C896]" />
                <h3 className="mt-4 text-lg font-bold text-[#1a1a1a]">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#00C896] py-16">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 text-center">
          <h2 className="text-3xl font-extrabold text-[#1a1a1a] md:text-4xl">
            Pronto para pegar?
          </h2>
          <p className="mt-3 text-lg text-[#1a1a1a]/80">
            Fale com a gente pelo WhatsApp e receba sua cotacao em segundos.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-full bg-[#1a1a1a] px-8 py-4 text-lg font-bold text-white transition-transform hover:scale-105"
            >
              Pedir Frete Agora
              <ArrowRight size={20} />
            </a>
            <Link
              href="/simular"
              className="flex items-center justify-center rounded-full border-2 border-[#1a1a1a] px-8 py-4 text-lg font-semibold text-[#1a1a1a] transition-colors hover:bg-[#1a1a1a] hover:text-white"
            >
              Simular Primeiro
            </Link>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="bg-white py-12">
        <div className="mx-auto max-w-4xl px-4">
          <div className="flex flex-wrap items-center justify-center gap-8 text-gray-400">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-[#00C896]" />
              <span className="text-sm font-medium text-gray-600">
                Prestadores verificados
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-[#00C896]" />
              <span className="text-sm font-medium text-gray-600">
                Pagamento seguro
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-[#00C896]" />
              <span className="text-sm font-medium text-gray-600">
                Prova digital de entrega
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-[#00C896]" />
              <span className="text-sm font-medium text-gray-600">
                Rastreio em tempo real
              </span>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
