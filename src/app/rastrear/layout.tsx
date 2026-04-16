import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rastrear Frete em Tempo Real",
  description:
    "Rastreie seu frete ou mudança da Pegue em tempo real. Veja onde está o motorista no mapa, estimativa de chegada e status da entrega.",
  alternates: { canonical: "/rastrear" },
  robots: { index: true, follow: true },
};

export default function RastrearLayout({ children }: { children: React.ReactNode }) {
  return children;
}
