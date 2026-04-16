import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Perguntas Frequentes - Dúvidas Sobre Frete e Mudança",
  description:
    "Tire suas dúvidas sobre frete, mudança, guincho, preços, cobertura e formas de pagamento da Pegue. A Pegue Resolve.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "FAQ - Dúvidas Sobre Frete e Mudança | Pegue",
    description: "Perguntas frequentes sobre frete, mudança, guincho, preços e pagamento.",
    url: "/faq",
  },
};

export default function FaqLayout({ children }: { children: React.ReactNode }) {
  return children;
}
