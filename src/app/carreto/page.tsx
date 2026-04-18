import { Metadata } from "next";
import Link from "next/link";
import { WHATSAPP_LINK } from "@/lib/constants";
import { Phone, Clock, MapPin, Shield, Truck, Zap, Star, Package, Home, Building2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Carreto Osasco | Frete e Mudanca Zona Oeste SP | Pegue",
  description: "Carreto e mudanca em Osasco e Zona Oeste de SP. Pequenos fretes, mudanca completa, transporte de moveis. Orcamento pelo WhatsApp em minutos. A partir de R$ 150.",
  keywords: "carreto osasco, frete osasco, mudanca osasco, carreto zona oeste, carreto barato osasco, pequenos fretes osasco, mudanca residencial osasco, carreto perto de mim, frete barato osasco",
  openGraph: {
    title: "Carreto e Mudanca Osasco | Pegue",
    description: "Carreto e frete em Osasco e Zona Oeste. Orcamento instantaneo pelo WhatsApp.",
    type: "website",
  },
};

const SERVICOS = [
  { icon: Package, titulo: "Pequenos Fretes", desc: "Sofa, geladeira, maquina de lavar, caixas. Transporte rapido e seguro.", preco: "A partir de R$ 150" },
  { icon: Home, titulo: "Mudanca Residencial", desc: "Mudanca completa de casa ou apartamento. Desmontagem e montagem.", preco: "A partir de R$ 300" },
  { icon: Building2, titulo: "Mudanca Comercial", desc: "Escritorio, loja, consultorio. Transportamos com cuidado e agilidade.", preco: "Sob consulta" },
  { icon: Truck, titulo: "Carreto de Moveis", desc: "Comprou movel novo? A gente busca na loja e entrega na sua casa.", preco: "A partir de R$ 150" },
];

const ITENS_POPULARES = [
  "Geladeira", "Sofa", "Maquina de lavar", "Cama casal", "Guarda-roupa",
  "Mesa", "TV", "Colchao", "Fogao", "Ar condicionado", "Bicicleta",
  "Caixas de mudanca", "Estante", "Poltrona", "Micro-ondas",
];

const DIFERENCIAIS = [
  { icon: Zap, titulo: "Orcamento em 2 min", desc: "Manda foto dos itens e recebe o preco na hora" },
  { icon: Shield, titulo: "Fretista Verificado", desc: "Todos os motoristas passam por cadastro e avaliacao" },
  { icon: Clock, titulo: "Voce escolhe o horario", desc: "Agende pra manha, tarde ou horario especifico" },
  { icon: MapPin, titulo: "Rastreio em tempo real", desc: "Acompanhe seu frete no mapa pelo celular" },
];

const REGIOES = [
  "Osasco", "Barueri", "Carapicuiba", "Cotia", "Itapevi", "Jandira",
  "Santana de Parnaiba", "Alphaville", "Taboao da Serra", "Embu das Artes",
  "Zona Oeste SP", "Butanta", "Pinheiros", "Lapa", "Perdizes", "Vila Leopoldina",
];

const PRECOS = [
  { veiculo: "Utilitario", desc: "Strada, Saveiro, Fiorino", preco: "A partir de R$ 150", capacidade: "Ate 800kg" },
  { veiculo: "HR", desc: "Hyundai HR, Kia Bongo", preco: "A partir de R$ 220", capacidade: "Ate 1.500kg" },
  { veiculo: "Caminhao Bau", desc: "3/4 ou Toco", preco: "A partir de R$ 500", capacidade: "Ate 6.000kg" },
];

export default function CarretoPage() {
  return (
    <div className="min-h-screen bg-[#000] text-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#C9A84C]/10 px-4 py-16 text-center md:py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-[#C9A84C]/5 to-transparent" />
        <div className="relative mx-auto max-w-4xl">
          <div className="mb-4 inline-block rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-1 text-sm text-[#C9A84C]">
            Orcamento em 2 minutos pelo WhatsApp
          </div>
          <h1 className="mb-6 text-4xl font-extrabold md:text-6xl">
            Carreto e <span className="text-[#C9A84C]">Mudanca</span> em Osasco
          </h1>
          <p className="mb-4 text-lg text-gray-400 md:text-xl">
            Precisa transportar moveis? Vai mudar de casa? Manda foto dos itens pelo WhatsApp e recebe o orcamento na hora.
          </p>
          <p className="mb-8 text-2xl font-bold text-[#C9A84C]">A partir de R$ 150</p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={WHATSAPP_LINK}
              target="_blank"
              className="flex items-center gap-2 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-black transition-transform hover:scale-105"
            >
              <Phone className="h-5 w-5" />
              Pedir Orcamento Gratis
            </Link>
            <p className="text-sm text-gray-500">Sem compromisso. Resposta imediata.</p>
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="border-b border-[#C9A84C]/10 px-4 py-12">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 md:grid-cols-4">
          {DIFERENCIAIS.map((d) => (
            <div key={d.titulo} className="text-center">
              <d.icon className="mx-auto mb-2 h-8 w-8 text-[#C9A84C]" />
              <h3 className="font-bold">{d.titulo}</h3>
              <p className="text-xs text-gray-400">{d.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Servicos */}
      <section className="border-b border-[#C9A84C]/10 px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center text-3xl font-extrabold">
            Nossos <span className="text-[#C9A84C]">Servicos</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {SERVICOS.map((s) => (
              <div key={s.titulo} className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 transition-transform hover:scale-[1.02]">
                <s.icon className="mb-3 h-8 w-8 text-[#C9A84C]" />
                <h3 className="mb-1 text-lg font-bold">{s.titulo}</h3>
                <p className="mb-3 text-sm text-gray-400">{s.desc}</p>
                <p className="text-sm font-bold text-[#C9A84C]">{s.preco}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tabela de precos */}
      <section className="border-b border-[#C9A84C]/10 px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center text-3xl font-extrabold">
            Tabela de <span className="text-[#C9A84C]">Precos</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {PRECOS.map((p) => (
              <div key={p.veiculo} className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 text-center">
                <Truck className="mx-auto mb-3 h-10 w-10 text-[#C9A84C]" />
                <h3 className="text-lg font-bold">{p.veiculo}</h3>
                <p className="text-xs text-gray-500">{p.desc}</p>
                <p className="my-3 text-2xl font-extrabold text-[#C9A84C]">{p.preco}</p>
                <p className="text-xs text-gray-400">{p.capacidade}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-gray-500">
            Valores para ate 10km. Acima disso, acrescimo por km rodado. Ajudante: +R$ 80.
          </p>
        </div>
      </section>

      {/* O que transportamos */}
      <section className="border-b border-[#C9A84C]/10 px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-3xl font-extrabold">
            O que <span className="text-[#C9A84C]">Transportamos</span>
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {ITENS_POPULARES.map((item) => (
              <span key={item} className="rounded-full border border-[#C9A84C]/20 bg-[#0A0A0A] px-4 py-2 text-sm">
                {item}
              </span>
            ))}
            <span className="rounded-full border border-[#C9A84C]/40 bg-[#C9A84C]/10 px-4 py-2 text-sm text-[#C9A84C]">
              E muito mais...
            </span>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-b border-[#C9A84C]/10 px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center text-3xl font-extrabold">
            Como <span className="text-[#C9A84C]">Funciona</span>
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              { num: "1", titulo: "Manda foto dos itens", desc: "Abre o WhatsApp, manda foto do que precisa transportar. A IA calcula tudo." },
              { num: "2", titulo: "Recebe o orcamento", desc: "Em menos de 2 minutos voce tem o preco. Sem surpresas, sem taxa escondida." },
              { num: "3", titulo: "Fretista a caminho", desc: "Confirma, paga pelo app e acompanha seu frete em tempo real no mapa." },
            ].map((p) => (
              <div key={p.num} className="text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A84C] text-2xl font-extrabold text-black">
                  {p.num}
                </div>
                <h3 className="mb-2 text-lg font-bold">{p.titulo}</h3>
                <p className="text-sm text-gray-400">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Regioes */}
      <section className="border-b border-[#C9A84C]/10 px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-center text-3xl font-extrabold">
            Onde <span className="text-[#C9A84C]">Atendemos</span>
          </h2>
          <p className="mb-8 text-center text-gray-400">Carreto e mudanca em toda Zona Oeste e Grande SP</p>
          <div className="flex flex-wrap justify-center gap-2">
            {REGIOES.map((r) => (
              <span key={r} className="rounded-full border border-[#C9A84C]/20 bg-[#0A0A0A] px-4 py-2 text-sm">
                {r}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Avaliacoes */}
      <section className="border-b border-[#C9A84C]/10 px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center text-3xl font-extrabold">
            Quem <span className="text-[#C9A84C]">Ja Usou</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { nome: "Maria S.", texto: "Mudei de apartamento em Osasco. O fretista chegou no horario, cuidou de tudo. Recomendo demais!", estrelas: 5 },
              { nome: "Joao P.", texto: "Comprei um sofa na OLX e precisava de carreto. Mandei foto pelo WhatsApp e em 2 min tinha o preco.", estrelas: 5 },
              { nome: "Ana R.", texto: "Fiz mudanca de Osasco pra Alphaville. Preco justo, nenhum item danificado. Nota 10!", estrelas: 5 },
            ].map((a) => (
              <div key={a.nome} className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
                <div className="mb-2 flex gap-1">
                  {Array.from({ length: a.estrelas }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-[#C9A84C] text-[#C9A84C]" />
                  ))}
                </div>
                <p className="mb-3 text-sm text-gray-300">&ldquo;{a.texto}&rdquo;</p>
                <p className="text-xs font-bold text-[#C9A84C]">{a.nome}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="px-4 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-4 text-3xl font-extrabold">
            Precisa de <span className="text-[#C9A84C]">Carreto</span>?
          </h2>
          <p className="mb-8 text-gray-400">
            Manda foto dos itens pelo WhatsApp e recebe o orcamento na hora. Sem compromisso.
          </p>
          <Link
            href={WHATSAPP_LINK}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full bg-[#C9A84C] px-10 py-4 text-lg font-bold text-black transition-transform hover:scale-105"
          >
            <Phone className="h-5 w-5" />
            Pedir Orcamento Gratis
          </Link>
          <p className="mt-4 text-xs text-gray-600">A partir de R$ 150 | Osasco e Zona Oeste SP</p>
        </div>
      </section>
    </div>
  );
}
