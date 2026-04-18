import { Metadata } from "next";
import Link from "next/link";
import { WHATSAPP_LINK } from "@/lib/constants";
import { Phone, Clock, MapPin, Shield, Truck, Zap, Star, CheckCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Guincho 24 Horas Osasco | Guincho Rapido Zona Oeste SP | Pegue",
  description: "Guincho 24 horas em Osasco e Zona Oeste de SP. Atendimento imediato via WhatsApp. Pneu furado, pane mecanica, acidente, guincho de moto. Preco justo e rapido.",
  keywords: "guincho 24 horas osasco, guincho osasco, guincho zona oeste, guincho rapido sp, guincho perto de mim, reboque osasco, auto socorro osasco, guincho moto osasco",
  openGraph: {
    title: "Guincho 24 Horas Osasco | Pegue",
    description: "Guincho rapido em Osasco e Zona Oeste. Atendimento imediato via WhatsApp.",
    type: "website",
  },
};

const SERVICOS = [
  { icon: "flat-tire", titulo: "Pneu Furado", desc: "Sem estepe? A gente leva seu veiculo pro borracheiro mais proximo.", preco: "A partir de R$ 180" },
  { icon: "battery", titulo: "Bateria Descarregada", desc: "Carro nao liga? Guincho rapido ate a eletrica ou sua casa.", preco: "A partir de R$ 150" },
  { icon: "engine", titulo: "Pane Mecanica", desc: "Motor parou? Levamos seu veiculo pra oficina com seguranca.", preco: "A partir de R$ 250" },
  { icon: "accident", titulo: "Acidente", desc: "Bateu? Nao se preocupe. Guincho plataforma pra retirada segura.", preco: "A partir de R$ 350" },
  { icon: "workshop", titulo: "Guincho p/ Oficina", desc: "Precisa levar o carro pra manutencao? A gente busca e leva.", preco: "A partir de R$ 200" },
  { icon: "moto", titulo: "Guincho de Moto", desc: "Moto quebrou? Guincho especializado pra motos de qualquer porte.", preco: "A partir de R$ 180" },
];

const DIFERENCIAIS = [
  { icon: Clock, titulo: "24 Horas", desc: "Atendimento a qualquer hora, dia ou noite" },
  { icon: Zap, titulo: "Resposta Imediata", desc: "Orcamento em minutos pelo WhatsApp" },
  { icon: MapPin, titulo: "Osasco e Regiao", desc: "Cobrimos toda Zona Oeste e Grande SP" },
  { icon: Shield, titulo: "Seguro", desc: "Motoristas verificados e veiculos rastreados" },
];

const REGIOES = [
  "Osasco", "Barueri", "Carapicuiba", "Cotia", "Itapevi", "Jandira",
  "Santana de Parnaiba", "Alphaville", "Taboao da Serra", "Embu das Artes",
  "Zona Oeste SP", "Butanta", "Pinheiros", "Lapa", "Perdizes",
];

export default function GuinchoPage() {
  return (
    <div className="min-h-screen bg-[#000] text-white">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#C9A84C]/10 px-4 py-16 text-center md:py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-[#C9A84C]/5 to-transparent" />
        <div className="relative mx-auto max-w-4xl">
          <div className="mb-4 inline-block rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-1 text-sm text-[#C9A84C]">
            Atendimento 24 horas
          </div>
          <h1 className="mb-6 text-4xl font-extrabold md:text-6xl">
            Guincho <span className="text-[#C9A84C]">24 Horas</span> em Osasco
          </h1>
          <p className="mb-8 text-lg text-gray-400 md:text-xl">
            Seu carro parou? Pneu furou? Bateu? Calma. A Pegue resolve em minutos.
            Orcamento instantaneo pelo WhatsApp.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href={WHATSAPP_LINK}
              target="_blank"
              className="flex items-center gap-2 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-black transition-transform hover:scale-105"
            >
              <Phone className="h-5 w-5" />
              Chamar Guincho Agora
            </Link>
            <p className="text-sm text-gray-500">Resposta em menos de 2 minutos</p>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SERVICOS.map((s) => (
              <div key={s.titulo} className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 transition-transform hover:scale-[1.02]">
                <Truck className="mb-3 h-8 w-8 text-[#C9A84C]" />
                <h3 className="mb-1 text-lg font-bold">{s.titulo}</h3>
                <p className="mb-3 text-sm text-gray-400">{s.desc}</p>
                <p className="text-sm font-bold text-[#C9A84C]">{s.preco}</p>
              </div>
            ))}
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
              { num: "1", titulo: "Chama no WhatsApp", desc: "Clica no botao e diz que precisa de guincho. O bot te atende na hora." },
              { num: "2", titulo: "Envia sua localizacao", desc: "Compartilha o GPS ou digita o endereco. A gente acha voce." },
              { num: "3", titulo: "Guincho a caminho", desc: "Recebe o orcamento, confirma, e o guincho sai imediatamente." },
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
          <p className="mb-8 text-center text-gray-400">Guincho em toda Zona Oeste e Grande SP</p>
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
              { nome: "Carlos M.", texto: "Carro parou na Raposo Tavares as 23h. Em 20 minutos o guincho chegou. Servico excelente!", estrelas: 5 },
              { nome: "Patricia S.", texto: "Pneu furou em Osasco e nao tinha estepe. Chamei pelo WhatsApp e foi super rapido.", estrelas: 5 },
              { nome: "Roberto L.", texto: "Precisei levar o carro pra oficina em Alphaville. Preco justo e motorista educado.", estrelas: 5 },
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
            Precisa de <span className="text-[#C9A84C]">Guincho Agora</span>?
          </h2>
          <p className="mb-8 text-gray-400">
            Nao perca tempo. Chama a Pegue no WhatsApp e resolve em minutos.
          </p>
          <Link
            href={WHATSAPP_LINK}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-full bg-[#C9A84C] px-10 py-4 text-lg font-bold text-black transition-transform hover:scale-105"
          >
            <Phone className="h-5 w-5" />
            Chamar Guincho pelo WhatsApp
          </Link>
          <p className="mt-4 text-xs text-gray-600">Atendimento 24h | Osasco e Zona Oeste SP</p>
        </div>
      </section>
    </div>
  );
}
