import Image from "next/image";
import Link from "next/link";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { FormularioParceiro } from "@/components/formulario-parceiro";
import { DashboardParceiro } from "@/components/dashboard-parceiro";
import {
  Truck,
  Camera,
  Shield,
  Star,
  DollarSign,
  Clock,
  CheckCircle,
  Smartphone,
  Car,
  MessageCircle,
  BarChart3,
} from "lucide-react";
import { WHATSAPP_LINK } from "@/lib/constants";

export default function ParceiroPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#0A0A0A] to-[#111111] py-20 md:py-28">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <div className="mb-6 inline-block rounded-full bg-[#C9A84C]/10 px-4 py-2 text-sm font-medium text-[#C9A84C]">
            Oportunidade para voce
          </div>
          <h1 className="mb-6 text-4xl font-extrabold leading-tight md:text-6xl">
            Faca parte da{" "}
            <span className="text-[#C9A84C]">Pegue</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-gray-400 md:text-xl">
            Cadastre seu veiculo e comece a receber indicacoes de fretes,
            mudancas e servicos na Grande SP. Voce decide quando e quanto
            trabalhar.
          </p>
          <a
            href="https://wa.me/5511970363713?text=Parcerias%20Pegue"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-[#0A0A0A] shadow-lg shadow-[#C9A84C]/20 transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#C9A84C]/30"
          >
            <MessageCircle className="h-6 w-6" />
            Quero me cadastrar via WhatsApp
          </a>
          <p className="mt-4 text-sm text-gray-500">
            Envie <strong className="text-[#C9A84C]">&quot;Parcerias Pegue&quot;</strong> no WhatsApp e
            comece agora
          </p>
        </div>
      </section>

      {/* Veiculos aceitos */}
      <section className="border-t border-gray-800 bg-[#111111] py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-4 text-center text-3xl font-bold md:text-4xl">
            Veiculos <span className="text-[#C9A84C]">aceitos</span>
          </h2>
          <p className="mb-12 text-center text-gray-400">
            Tem um desses? Voce ja pode comecar!
          </p>

          <div className="grid gap-6 md:grid-cols-4">
            <div className="rounded-2xl border border-gray-800 bg-[#0A0A0A] p-6 text-center transition-all hover:border-[#C9A84C]/30">
              <Car className="mx-auto mb-4 h-12 w-12 text-[#C9A84C]" />
              <h3 className="mb-2 text-lg font-bold">Carro Comum</h3>
              <p className="text-sm text-gray-400">
                Kicks, Livina, Renegade, Nivus, HRV e similares. Ideal para
                pequenos pacotes e itens que cabem no porta-malas.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-[#0A0A0A] p-6 text-center transition-all hover:border-[#C9A84C]/30">
              <Truck className="mx-auto mb-4 h-12 w-12 text-[#C9A84C]" />
              <h3 className="mb-2 text-lg font-bold">Utilitario</h3>
              <p className="text-sm text-gray-400">
                Fiat Strada, Saveiro, Ford Courier. Cacamba 1,2m x 1,5m. O
                mais procurado para pequenos fretes.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-[#0A0A0A] p-6 text-center transition-all hover:border-[#C9A84C]/30">
              <Truck className="mx-auto mb-4 h-12 w-12 text-[#C9A84C]" />
              <h3 className="mb-2 text-lg font-bold">HR</h3>
              <p className="text-sm text-gray-400">
                Hyundai HR e similares. Capacidade 1,7m x 2,8m. Perfeito
                para mudancas pequenas e medias.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-[#0A0A0A] p-6 text-center transition-all hover:border-[#C9A84C]/30">
              <Truck className="mx-auto mb-4 h-12 w-12 text-[#C9A84C]" />
              <h3 className="mb-2 text-lg font-bold">Caminhao Bau</h3>
              <p className="text-sm text-gray-400">
                Capacidade 2,5m x 3,5m. Para mudancas completas e grandes
                volumes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="border-t border-gray-800 bg-[#0A0A0A] py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-4 text-center text-3xl font-bold md:text-4xl">
            Como <span className="text-[#C9A84C]">funciona</span>
          </h2>
          <p className="mb-12 text-center text-gray-400">
            Cadastro rapido e simples pelo WhatsApp
          </p>

          <div className="grid gap-8 md:grid-cols-4">
            {[
              {
                step: "1",
                icon: <Smartphone className="h-8 w-8" />,
                title: "Envie no WhatsApp",
                desc: 'Mande "Parcerias Pegue" no nosso WhatsApp e o cadastro comeca automaticamente.',
              },
              {
                step: "2",
                icon: <Camera className="h-8 w-8" />,
                title: "Envie seus dados",
                desc: "Nome, CPF, selfie com documento, foto do veiculo e placa. Tudo pelo WhatsApp.",
              },
              {
                step: "3",
                icon: <CheckCircle className="h-8 w-8" />,
                title: "Aprovacao",
                desc: "Nosso time analisa seu cadastro. Assim que aprovado, voce ja comeca a receber indicacoes!",
              },
              {
                step: "4",
                icon: <DollarSign className="h-8 w-8" />,
                title: "Comece a ganhar",
                desc: "Receba indicacoes de frete no WhatsApp. Primeiro a aceitar, leva o servico!",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#C9A84C]/10 text-[#C9A84C]">
                  {item.icon}
                </div>
                <div className="mb-2 text-xs font-bold text-[#C9A84C]">
                  PASSO {item.step}
                </div>
                <h3 className="mb-2 text-lg font-bold">{item.title}</h3>
                <p className="text-sm text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="border-t border-gray-800 bg-[#111111] py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-4 text-center text-3xl font-bold md:text-4xl">
            Por que ser parceiro da{" "}
            <span className="text-[#C9A84C]">Pegue</span>?
          </h2>
          <p className="mb-12 text-center text-gray-400">
            Valorizamos quem trabalha bem
          </p>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: <DollarSign className="h-8 w-8" />,
                title: "Voce recebe 88%",
                desc: "A maior parte do valor do frete vai direto pra voce. Sem surpresas, sem taxas escondidas.",
              },
              {
                icon: <Clock className="h-8 w-8" />,
                title: "Voce decide seu horario",
                desc: "Trabalhe quando quiser. Recebeu uma indicacao e nao pode? Sem problema, passe pra frente.",
              },
              {
                icon: <Star className="h-8 w-8" />,
                title: "Quanto mais fretes, mais indicacoes",
                desc: "Seu desempenho conta! Bom atendimento e entregas sem problemas aumentam suas indicacoes.",
              },
              {
                icon: <Shield className="h-8 w-8" />,
                title: "Pagamento garantido",
                desc: "O cliente paga antes. Seu pagamento e liberado apos a confirmacao da entrega.",
              },
              {
                icon: <Camera className="h-8 w-8" />,
                title: "Protocolo de seguranca",
                desc: "Fotos na coleta e na entrega protegem voce e o cliente. Transparencia total.",
              },
              {
                icon: <Truck className="h-8 w-8" />,
                title: "Diversos tipos de servico",
                desc: "Fretes, mudancas, guinchos e mais. Quanto mais versatil, mais oportunidades.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-800 bg-[#0A0A0A] p-6 transition-all hover:border-[#C9A84C]/30"
              >
                <div className="mb-4 text-[#C9A84C]">{item.icon}</div>
                <h3 className="mb-2 text-lg font-bold">{item.title}</h3>
                <p className="text-sm text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Regras importantes */}
      <section className="border-t border-gray-800 bg-[#0A0A0A] py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="mb-4 text-center text-3xl font-bold md:text-4xl">
            Regras <span className="text-[#C9A84C]">importantes</span>
          </h2>
          <p className="mb-12 text-center text-gray-400">
            Leia com atencao antes de se cadastrar
          </p>

          <div className="space-y-4">
            {[
              "Fotos dos materiais na coleta e na entrega sao OBRIGATORIAS. Sem fotos, o pagamento fica bloqueado.",
              "Cancelamentos afetam sua posicao na plataforma. Cancele apenas em casos extremos.",
              "Danos em materiais sao responsabilidade do prestador. Trabalhe com cuidado!",
              "Mal atendimento ou reclamacoes de clientes reduzem suas indicacoes.",
              "Quanto melhor seu desempenho, mais fretes voce recebe. Score alto = mais indicacoes!",
              "O pagamento e liberado somente apos a confirmacao de entrega com fotos.",
              "Mantenha seu veiculo em boas condicoes e documentacao em dia.",
            ].map((regra, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl border border-gray-800 bg-[#111111] p-4"
              >
                <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#C9A84C]" />
                <p className="text-sm text-gray-300">{regra}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cadastre-se */}
      <section id="cadastro" className="border-t border-gray-800 bg-[#111111] py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-4 text-center text-3xl font-bold md:text-4xl">
            Cadastre-se <span className="text-[#C9A84C]">agora</span>
          </h2>
          <p className="mb-12 text-center text-gray-400">
            Escolha como prefere se cadastrar
          </p>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Opcao 1: WhatsApp */}
            <div className="rounded-2xl border border-gray-800 bg-[#0A0A0A] p-8">
              <div className="mb-4 flex items-center gap-3">
                <MessageCircle className="h-8 w-8 text-[#C9A84C]" />
                <h3 className="text-xl font-bold">Pelo WhatsApp</h3>
              </div>
              <p className="mb-6 text-sm text-gray-400">
                Cadastro completo pelo WhatsApp. Envie fotos, documentos e finalize tudo em uma conversa.
              </p>
              <a
                href="https://wa.me/5511970363713?text=Parcerias%20Pegue"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[#C9A84C] px-6 py-3 font-bold text-[#0A0A0A] transition-all hover:scale-105"
              >
                <MessageCircle className="h-5 w-5" />
                Enviar &quot;Parcerias Pegue&quot;
              </a>
              <p className="mt-3 text-xs text-gray-500">Recomendado - cadastro completo em 2 minutos</p>
            </div>

            {/* Opcao 2: Formulario */}
            <div className="rounded-2xl border border-gray-800 bg-[#0A0A0A] p-8">
              <div className="mb-4 flex items-center gap-3">
                <Smartphone className="h-8 w-8 text-[#C9A84C]" />
                <h3 className="text-xl font-bold">Pelo site</h3>
              </div>
              <p className="mb-6 text-sm text-gray-400">
                Preencha o pre-cadastro aqui e depois envie as fotos pelo WhatsApp.
              </p>
              <FormularioParceiro />
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard */}
      <section id="dashboard" className="border-t border-gray-800 bg-[#0A0A0A] py-16 md:py-24">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-4 text-center text-3xl font-bold md:text-4xl">
            <BarChart3 className="mx-auto mb-2 h-10 w-10 text-[#C9A84C]" />
            Seu <span className="text-[#C9A84C]">painel</span>
          </h2>
          <p className="mb-12 text-center text-gray-400">
            Ja e parceiro? Acompanhe seu desempenho
          </p>

          <DashboardParceiro />
        </div>
      </section>

      <Footer />
    </div>
  );
}
