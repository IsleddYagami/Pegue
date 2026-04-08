"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ChevronDown } from "lucide-react";
import { WHATSAPP_LINK } from "@/lib/constants";

const faqs = [
  {
    q: "Como funciona a cotacao?",
    a: "Basta enviar uma mensagem no nosso WhatsApp com o endereco de origem, destino e o que precisa transportar. Voce pode mandar por audio ou texto. Em segundos, recebe opcoes de preco.",
  },
  {
    q: "Quais formas de pagamento?",
    a: "Aceitamos Pix (pagamento instantaneo) e cartao de credito/debito pelo Mercado Pago.",
  },
  {
    q: "Como acompanho meu frete?",
    a: "Apos o pagamento, voce recebe um codigo de rastreio. Pode acompanhar pelo nosso site ou pelas notificacoes automaticas no WhatsApp.",
  },
  {
    q: "O que e a prova digital?",
    a: "Nossos prestadores registram fotos geolocalizadas na coleta e na entrega, alem de um PIN de confirmacao. Voce tem evidencia completa de que tudo foi feito corretamente.",
  },
  {
    q: "Os motoristas sao verificados?",
    a: "Sim! Todos os prestadores passam por um processo de cadastro com verificacao de documentos, veiculo e selfie. Alem disso, cada corrida gera uma avaliacao.",
  },
  {
    q: "Quanto custa o frete?",
    a: "O preco depende da distancia, tipo de veiculo, necessidade de ajudantes e outros detalhes. Use nosso simulador ou fale no WhatsApp para uma cotacao precisa.",
  },
  {
    q: "Atende quais regioes?",
    a: "Atualmente atendemos Osasco, Carapicuiba, Barueri, Cotia, Jandira, Itapevi e cidades proximas na zona oeste de Sao Paulo.",
  },
  {
    q: "Posso agendar um frete para outro dia?",
    a: "Sim! Voce pode agendar para o dia e periodo que preferir (manha, tarde ou noite).",
  },
  {
    q: "E se algo der errado?",
    a: "Temos um processo de resolucao de disputas. As provas digitais (fotos, GPS, horarios) ajudam a resolver qualquer situacao. Basta falar conosco pelo WhatsApp.",
  },
  {
    q: "Posso repetir um frete anterior?",
    a: "Sim! Basta dizer no WhatsApp que quer repetir e a gente pega seus dados anteriores automaticamente.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left"
      >
        <span className="text-base font-semibold text-[#1a1a1a] pr-4">{q}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <p className="pb-5 text-sm leading-relaxed text-gray-500">{a}</p>
      )}
    </div>
  );
}

export default function FaqPage() {
  return (
    <>
      <Header />

      <main className="flex-1 bg-white py-12">
        <div className="mx-auto max-w-2xl px-4">
          <h1 className="text-center text-3xl font-extrabold text-[#1a1a1a] md:text-4xl">
            Perguntas Frequentes
          </h1>
          <p className="mt-2 text-center text-gray-500">
            Tire suas duvidas sobre a Pegue
          </p>

          <div className="mt-8">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>

          {/* CTA */}
          <div className="mt-12 rounded-2xl bg-gray-50 p-8 text-center">
            <p className="text-lg font-bold text-[#1a1a1a]">
              Nao encontrou sua resposta?
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Fale com a gente pelo WhatsApp. Estamos prontos para ajudar!
            </p>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#00C896] px-8 py-3 font-bold text-[#1a1a1a] transition-transform hover:scale-105"
            >
              Falar no WhatsApp
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
