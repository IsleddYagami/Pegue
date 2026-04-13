import Link from "next/link";
import Image from "next/image";
import { WHATSAPP_LINK, INSTAGRAM_LINK, INSTAGRAM_HANDLE } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="bg-[#000000] text-gray-400">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand */}
          <div>
            <Image
              src="/logo-pegue-novo.png"
              alt="Pegue"
              width={180}
              height={50}
              className="h-12 w-auto"
            />
            <p className="mt-3 text-sm leading-relaxed">
              Frete e mudanca sem dor de cabeca.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Grande SP &middot; Litoral &middot; Interior
            </p>
          </div>

          {/* Links */}
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#C9A84C]">
              Links
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <Link href="/simular" className="transition-colors hover:text-[#C9A84C]">
                Simular Frete
              </Link>
              <Link href="/rastrear" className="transition-colors hover:text-[#C9A84C]">
                Rastrear Pedido
              </Link>
              <Link href="/faq" className="transition-colors hover:text-[#C9A84C]">
                Perguntas Frequentes
              </Link>
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#C9A84C]">
              Contato
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-[#C9A84C]"
              >
                WhatsApp
              </a>
              <a
                href={INSTAGRAM_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-[#C9A84C]"
              >
                {INSTAGRAM_HANDLE}
              </a>
              <a
                href="mailto:contato@pegue.com.br"
                className="transition-colors hover:text-[#C9A84C]"
              >
                contato@pegue.com.br
              </a>
            </div>
          </div>
        </div>

        {/* Trust micro-text */}
        <div className="mt-8 border-t border-[#C9A84C]/10 pt-6 text-center">
          <p className="text-[11px] text-gray-600">
            Motoristas verificados &middot; Pagamento protegido &middot; Prova digital de entrega
          </p>
          <p className="mt-2 text-xs text-gray-700">
            &copy; {new Date().getFullYear()} Pegue. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
