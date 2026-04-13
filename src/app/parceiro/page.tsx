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
  TrendingUp,
  Users,
  Zap,
  Award,
  ArrowRight,
} from "lucide-react";

export default function ParceiroPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <Header />

      {/* HERO - Grande e impactante */}
      <section className="relative overflow-hidden bg-[#000000] pb-20 pt-16 md:pb-32 md:pt-24">
        {/* Background sutil */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-[#C9A84C] blur-[150px]" />
          <div className="absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full bg-[#C9A84C] blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4">
          <div className="grid items-center gap-12 md:grid-cols-2">
            {/* Texto */}
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-2">
                <Zap className="h-4 w-4 text-[#C9A84C]" />
                <span className="text-sm font-medium text-[#C9A84C]">Vagas abertas para parceiros</span>
              </div>

              <h1 className="mb-6 text-4xl font-extrabold leading-[1.1] md:text-6xl">
                Ganhe dinheiro com seu{" "}
                <span className="text-[#C9A84C]">veiculo</span>
              </h1>

              <p className="mb-8 text-lg text-gray-400 md:text-xl">
                Cadastre-se na Pegue e receba indicacoes de fretes e mudancas na Grande SP. Voce decide quando trabalhar.
              </p>

              <div className="mb-8 space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-[#C9A84C]" />
                  <span>Voce recebe <strong className="text-[#C9A84C]">88% do frete</strong></span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-[#C9A84C]" />
                  <span>Pagamento <strong className="text-[#C9A84C]">rapido</strong> apos entrega</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-[#C9A84C]" />
                  <span>Sem taxas de adesao, <strong className="text-[#C9A84C]">100% gratuito</strong></span>
                </div>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <a
                  href="https://wa.me/5511970363713?text=Parcerias%20Pegue"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-[#000000] shadow-lg shadow-[#C9A84C]/20 transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#C9A84C]/30"
                >
                  <MessageCircle className="h-5 w-5" />
                  Cadastrar pelo WhatsApp
                </a>
                <a
                  href="#cadastro-site"
                  className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-[#C9A84C]/50 px-8 py-4 text-lg font-bold text-[#C9A84C] transition-all hover:bg-[#C9A84C]/10"
                >
                  Cadastrar pelo site
                  <ArrowRight className="h-5 w-5" />
                </a>
              </div>
            </div>

            {/* Estatisticas */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 text-center">
                <DollarSign className="mx-auto mb-2 h-8 w-8 text-[#C9A84C]" />
                <p className="text-3xl font-extrabold text-[#C9A84C]">88%</p>
                <p className="mt-1 text-sm text-gray-400">do frete pra voce</p>
              </div>
              <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 text-center">
                <Truck className="mx-auto mb-2 h-8 w-8 text-[#C9A84C]" />
                <p className="text-3xl font-extrabold text-white">4</p>
                <p className="mt-1 text-sm text-gray-400">tipos de veiculo</p>
              </div>
              <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 text-center">
                <Clock className="mx-auto mb-2 h-8 w-8 text-[#C9A84C]" />
                <p className="text-3xl font-extrabold text-white">24h</p>
                <p className="mt-1 text-sm text-gray-400">receba indicacoes</p>
              </div>
              <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 text-center">
                <Shield className="mx-auto mb-2 h-8 w-8 text-[#C9A84C]" />
                <p className="text-3xl font-extrabold text-white">0</p>
                <p className="mt-1 text-sm text-gray-400">taxas de adesao</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VEICULOS ACEITOS */}
      <section className="border-t border-[#C9A84C]/10 bg-[#0A0A0A] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-extrabold md:text-5xl">
              Veiculos <span className="text-[#C9A84C]">aceitos</span>
            </h2>
            <p className="text-lg text-gray-400">Tem um desses? Voce ja pode comecar!</p>
          </div>

          <div className="grid gap-6 md:grid-cols-4">
            {[
              { icon: <Car className="h-12 w-12" />, title: "Carro Comum", desc: "Kicks, Livina, Renegade, Nivus, HRV e similares. Ideal para pequenos pacotes." },
              { icon: <Truck className="h-12 w-12" />, title: "Utilitario", desc: "Fiat Strada, Saveiro, Ford Courier. Cacamba 1,2m x 1,5m. O mais procurado." },
              { icon: <Truck className="h-12 w-12" />, title: "HR", desc: "Hyundai HR e similares. 1,7m x 2,8m. Perfeito para mudancas pequenas e medias." },
              { icon: <Truck className="h-12 w-12" />, title: "Caminhao Bau", desc: "2,5m x 3,5m. Para mudancas completas e grandes volumes." },
            ].map((v, i) => (
              <div key={i} className="group rounded-2xl border border-[#C9A84C]/20 bg-[#000000] p-8 text-center transition-all duration-300 hover:border-[#C9A84C]/60 hover:shadow-lg hover:shadow-[#C9A84C]/5">
                <div className="mx-auto mb-4 text-[#C9A84C] transition-transform duration-300 group-hover:scale-110">{v.icon}</div>
                <h3 className="mb-2 text-xl font-bold">{v.title}</h3>
                <p className="text-sm text-gray-400">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA - 4 passos */}
      <section className="border-t border-[#C9A84C]/10 bg-[#000000] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-extrabold md:text-5xl">
              Como <span className="text-[#C9A84C]">funciona</span>
            </h2>
            <p className="text-lg text-gray-400">Cadastro rapido e simples</p>
          </div>

          <div className="grid gap-8 md:grid-cols-4">
            {[
              { step: "1", icon: <Smartphone className="h-10 w-10" />, title: "Cadastre-se", desc: "Pelo WhatsApp ou pelo site. Envie seus dados e fotos do veiculo." },
              { step: "2", icon: <Camera className="h-10 w-10" />, title: "Envie documentos", desc: "Selfie com documento, foto do veiculo e placa. Tudo pelo WhatsApp." },
              { step: "3", icon: <CheckCircle className="h-10 w-10" />, title: "Aprovacao", desc: "Nosso time analisa. Aprovado, voce comeca a receber indicacoes!" },
              { step: "4", icon: <DollarSign className="h-10 w-10" />, title: "Comece a ganhar", desc: "Receba fretes no WhatsApp. Primeiro a aceitar, leva!" },
            ].map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#C9A84C]/10 text-[#C9A84C]">
                  {item.icon}
                </div>
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-[#C9A84C] px-3 py-1 text-xs font-bold text-[#000000]">
                  {item.step}
                </div>
                <h3 className="mb-2 text-xl font-bold">{item.title}</h3>
                <p className="text-sm text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DIFERENCIAIS - 6 cards */}
      <section className="border-t border-[#C9A84C]/10 bg-[#0A0A0A] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-extrabold md:text-5xl">
              Por que ser parceiro da <span className="text-[#C9A84C]">Pegue</span>?
            </h2>
            <p className="text-lg text-gray-400">Valorizamos quem trabalha bem</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: <DollarSign className="h-8 w-8" />, title: "Voce recebe 88%", desc: "A maior parte do valor vai direto pra voce. Sem surpresas." },
              { icon: <Clock className="h-8 w-8" />, title: "Voce decide seu horario", desc: "Trabalhe quando quiser. Sem obrigacao de horario." },
              { icon: <TrendingUp className="h-8 w-8" />, title: "Mais fretes, mais indicacoes", desc: "Bom desempenho aumenta suas indicacoes. Score alto = mais trabalho!" },
              { icon: <Shield className="h-8 w-8" />, title: "Pagamento garantido", desc: "O cliente paga antes. Voce recebe apos confirmacao de entrega." },
              { icon: <Camera className="h-8 w-8" />, title: "Seguranca total", desc: "Fotos na coleta e entrega protegem voce e o cliente." },
              { icon: <Award className="h-8 w-8" />, title: "Sistema de ranking", desc: "Quanto melhor seu desempenho, mais destaque voce ganha na plataforma." },
            ].map((item, i) => (
              <div key={i} className="group rounded-2xl border border-[#C9A84C]/20 bg-[#000000] p-8 transition-all duration-300 hover:border-[#C9A84C]/60">
                <div className="mb-4 inline-flex rounded-xl bg-[#C9A84C]/10 p-3 text-[#C9A84C] transition-transform duration-300 group-hover:scale-110">
                  {item.icon}
                </div>
                <h3 className="mb-3 text-xl font-bold">{item.title}</h3>
                <p className="text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CADASTRO */}
      <section id="cadastro-site" className="border-t border-[#C9A84C]/10 bg-[#000000] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-extrabold md:text-5xl">
              Cadastre-se <span className="text-[#C9A84C]">agora</span>
            </h2>
            <p className="text-lg text-gray-400">Escolha como prefere se cadastrar</p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* WhatsApp */}
            <div className="flex flex-col justify-between rounded-2xl border-2 border-[#C9A84C]/40 bg-[#0A0A0A] p-10">
              <div>
                <div className="mb-2 inline-flex rounded-full bg-[#C9A84C]/10 px-3 py-1 text-xs font-bold text-[#C9A84C]">
                  RECOMENDADO
                </div>
                <div className="mb-4 flex items-center gap-3">
                  <MessageCircle className="h-10 w-10 text-[#C9A84C]" />
                  <h3 className="text-2xl font-bold">Pelo WhatsApp</h3>
                </div>
                <p className="mb-8 text-gray-400">
                  Cadastro completo em 2 minutos. Envie fotos, documentos e finalize tudo em uma conversa.
                </p>
              </div>
              <div>
                <a
                  href="https://wa.me/5511970363713?text=Parcerias%20Pegue"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#C9A84C] px-6 py-4 text-lg font-bold text-[#000000] transition-all hover:scale-[1.02]"
                >
                  <MessageCircle className="h-5 w-5" />
                  Enviar &quot;Parcerias Pegue&quot;
                </a>
              </div>
            </div>

            {/* Site */}
            <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-10">
              <div className="mb-4 flex items-center gap-3">
                <Smartphone className="h-10 w-10 text-[#C9A84C]" />
                <h3 className="text-2xl font-bold">Pelo site</h3>
              </div>
              <p className="mb-8 text-gray-400">
                Preencha o pre-cadastro e depois envie as fotos pelo WhatsApp.
              </p>
              <FormularioParceiro />
            </div>
          </div>
        </div>
      </section>

      {/* DASHBOARD */}
      <section id="dashboard" className="border-t border-[#C9A84C]/10 bg-[#0A0A0A] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-16 text-center">
            <BarChart3 className="mx-auto mb-4 h-12 w-12 text-[#C9A84C]" />
            <h2 className="mb-4 text-3xl font-extrabold md:text-5xl">
              Seu <span className="text-[#C9A84C]">painel</span>
            </h2>
            <p className="text-lg text-gray-400">Ja e parceiro? Acompanhe seu desempenho</p>
          </div>
          <DashboardParceiro />
        </div>
      </section>

      {/* REGRAS */}
      <section className="border-t border-[#C9A84C]/10 bg-[#000000] py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-4">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-extrabold md:text-5xl">
              Regras <span className="text-[#C9A84C]">importantes</span>
            </h2>
            <p className="text-lg text-gray-400">Leia com atencao antes de se cadastrar</p>
          </div>

          <div className="space-y-4">
            {[
              "Fotos dos materiais na coleta e na entrega sao OBRIGATORIAS. Sem fotos, o pagamento fica bloqueado.",
              "Cancelamentos afetam sua posicao na plataforma. Cancele apenas em casos extremos.",
              "Danos em materiais sao responsabilidade do prestador. Trabalhe com cuidado!",
              "Mal atendimento ou reclamacoes de clientes reduzem suas indicacoes.",
              "Quanto melhor seu desempenho, mais fretes voce recebe. Score alto = mais indicacoes!",
              "O pagamento e liberado somente apos o cliente confirmar o recebimento.",
              "Mantenha seu veiculo em boas condicoes e documentacao em dia.",
              "Veiculo com no maximo 15 anos de uso. Maior de 18 anos.",
            ].map((regra, i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-xl border border-[#C9A84C]/10 bg-[#0A0A0A] p-5 transition-all hover:border-[#C9A84C]/30"
              >
                <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#C9A84C]" />
                <p className="text-gray-300">{regra}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="border-t border-[#C9A84C]/10 bg-[#0A0A0A] py-20 md:py-28">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="mb-6 text-3xl font-extrabold md:text-5xl">
            Comece <span className="text-[#C9A84C]">hoje</span>
          </h2>
          <p className="mb-10 text-lg text-gray-400">
            Junte-se aos parceiros que ja estao ganhando com a Pegue
          </p>
          <a
            href="https://wa.me/5511970363713?text=Parcerias%20Pegue"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 rounded-full bg-[#C9A84C] px-10 py-5 text-xl font-bold text-[#000000] shadow-lg shadow-[#C9A84C]/20 transition-all hover:scale-105 hover:shadow-xl hover:shadow-[#C9A84C]/30"
          >
            <MessageCircle className="h-6 w-6" />
            Quero ser parceiro
          </a>
          <p className="mt-6 text-sm text-gray-500">
            Envie <strong className="text-[#C9A84C]">&quot;Parcerias Pegue&quot;</strong> no WhatsApp e comece agora
          </p>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-10">
            <div className="flex items-center gap-2 text-gray-400">
              <Shield className="h-5 w-5 text-[#C9A84C]" />
              <span className="text-sm">Cadastro seguro</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Clock className="h-5 w-5 text-[#C9A84C]" />
              <span className="text-sm">2 minutos</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <DollarSign className="h-5 w-5 text-[#C9A84C]" />
              <span className="text-sm">100% gratuito</span>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
