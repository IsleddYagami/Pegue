import type { Metadata } from "next";

// O painel de atendimento e' instalavel no celular: sem o manifest aqui, o
// celular nao oferece "adicionar a tela de inicio" — e no iPhone sem isso
// nao existe aviso nenhum.
export const metadata: Metadata = {
  manifest: "/manifest.json",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#000000]">
      {children}
    </div>
  );
}
