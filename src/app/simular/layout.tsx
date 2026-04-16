import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Simular Frete - Calcule o Valor do Seu Frete em Segundos",
  description:
    "Simule seu frete, mudança ou carreto em 3 passos. Mande a foto do material pelo WhatsApp e receba o orçamento na hora. Atende Osasco e toda Grande SP.",
  alternates: { canonical: "/simular" },
  openGraph: {
    title: "Simular Frete - Calcule o Valor em Segundos | Pegue",
    description: "3 passos simples. Mande a foto do material pelo WhatsApp e receba o orçamento na hora.",
    url: "/simular",
  },
};

export default function SimularLayout({ children }: { children: React.ReactNode }) {
  return children;
}
