"use client";

// Pagina do jogo. Desde 14/11/2026 ela e' linkada no menu e na home, entao o
// "fechar" NAO pode ser window.close(): numa aba aberta por link o navegador
// ignora o close e a pessoa fica presa na tela preta. Fechar volta pro site.

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const PegueRunner = dynamic(() => import("@/components/pegue-runner"), { ssr: false });

export default function JogoPage() {
  const router = useRouter();
  return (
    <div className="fixed inset-0 bg-black">
      <PegueRunner onClose={() => router.push("/")} />
    </div>
  );
}
