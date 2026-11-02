import type { Metadata } from "next";

// Sem metadata propria, /jogo herdava titulo e canonical da home: o Google via
// duas paginas iguais e a home perdia. O jogo tem assunto proprio, entao tem
// titulo proprio — e canonical proprio.
export const metadata: Metadata = {
  title: "Pegue Runner - O Jogo da Pegue",
  description: "Joguinho da Pegue: pegue as cargas, desvie dos obstaculos e bata seu recorde.",
  alternates: { canonical: "/jogo" },
};

export default function JogoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
