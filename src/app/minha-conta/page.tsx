import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { DashboardCliente } from "@/components/dashboard-cliente";
import { Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Minha Conta - Seus Fretes e Mudanças",
  description: "Acesse sua conta Pegue e veja o histórico de fretes, mudanças e pontos do programa de indicação.",
  alternates: { canonical: "/minha-conta" },
  robots: { index: false, follow: true },
};

export default function MinhaContaPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <Header />

      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <Users className="mx-auto mb-4 h-12 w-12 text-[#C9A84C]" />
            <h1 className="mb-4 text-3xl font-extrabold md:text-5xl">
              Minha <span className="text-[#C9A84C]">conta</span>
            </h1>
            <p className="text-lg text-gray-400">
              Acompanhe seus fretes e historico de servicos
            </p>
          </div>

          <DashboardCliente />
        </div>
      </section>

      <Footer />
    </div>
  );
}
