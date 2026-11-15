import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Simular Frete - Calcule o Valor do Seu Frete em Segundos",
  description:
    "Simule seu frete, mudança ou carreto na tela: bairro e cidade de saída e de entrega, o que vai e o veículo. Sem cadastro. Atende Osasco e toda Grande SP.",
  alternates: { canonical: "/simular" },
  openGraph: {
    title: "Simular Frete - Calcule o Valor em Segundos | Pegue",
    description: "Monte o frete na tela e receba o valor na hora. Bairro e cidade de saída e de entrega, sem cadastro.",
    url: "/simular",
  },
};

export default function SimularLayout({ children }: { children: React.ReactNode }) {
  return children;
}
