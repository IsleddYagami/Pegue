import Link from "next/link";
import { WHATSAPP_LINK, INSTAGRAM_LINK, INSTAGRAM_HANDLE } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="bg-[#0A0A0A] text-gray-400">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand */}
          <div>
            <p className="text-2xl font-extrabold text-[#C9A84C]">PEGUE</p>
            <p className="mt-3 text-sm leading-relaxed">
              Frete e mudanca com experiencia premium.
              Cotacao instantanea, rastreio completo e prova digital.
            </p>
            <p className="mt-2 text-sm text-[#C9A84C]/70">
              Osasco e regiao - Zona Oeste SP
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

        <div className="mt-8 border-t border-[#C9A84C]/10 pt-6 text-center text-xs text-gray-600">
          &copy; {new Date().getFullYear()} Pegue. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
