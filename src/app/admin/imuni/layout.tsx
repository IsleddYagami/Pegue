import type { Metadata } from "next";

// Layout dedicado da IMUNI dentro do projeto Pegue.
// Sobrescreve favicon e metadata pra essa subarvore /admin/imuni.
//
// Quando IMUNI virar produto separado em dominio proprio (imuni.com.br),
// esse arquivo se torna o RootLayout do novo projeto Next.js — basta
// mover pra raiz e ajustar caminhos.

export const metadata: Metadata = {
  title: {
    default: "IMUNI · Sistema imunológico autônomo",
    template: "%s · IMUNI",
  },
  description:
    "IMUNI cuida da saúde do seu sistema 24h por dia, sem dormir. Detecta bugs, ameaças e vulnerabilidades antes de afetarem o usuário final.",
  icons: {
    icon: "/imuni/favicon.ico",
    apple: "/imuni/apple-touch-icon.png",
  },
  openGraph: {
    title: "IMUNI · Sistema imunológico autônomo",
    description: "Proteção inteligente para o que importa.",
    images: [
      {
        url: "/imuni-og.png",
        width: 1200,
        height: 630,
        alt: "IMUNI · Defended. Organic. Unified.",
      },
    ],
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary_large_image",
    title: "IMUNI",
    description: "Sistema imunológico autônomo para sistemas digitais.",
    images: ["/imuni-og.png"],
  },
};

export default function ImuniLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
