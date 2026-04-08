import Link from "next/link";
import { WHATSAPP_LINK } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="bg-[#1a1a1a] text-gray-400">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          {/* Brand */}
          <div>
            <p className="text-2xl font-extrabold text-white">
              <span className="text-[#00C896]">Pegue</span>
            </p>
            <p className="mt-2 text-sm">
              Frete e mudanca com cotacao instantanea, rastreio e prova digital.
            </p>
            <p className="mt-1 text-sm">Osasco e regiao - Zona Oeste SP</p>
          </div>

          {/* Links */}
          <div>
            <p className="mb-3 text-sm font-semibold uppercase text-gray-300">
              Links
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <Link href="/simular" className="hover:text-white">
                Simular Frete
              </Link>
              <Link href="/rastrear" className="hover:text-white">
                Rastrear Pedido
              </Link>
              <Link href="/faq" className="hover:text-white">
                Perguntas Frequentes
              </Link>
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="mb-3 text-sm font-semibold uppercase text-gray-300">
              Contato
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                WhatsApp
              </a>
              <a
                href="mailto:contato@pegue.com.br"
                className="hover:text-white"
              >
                contato@pegue.com.br
              </a>
              <a
                href="https://instagram.com/pegue"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                @pegue no Instagram
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-gray-700 pt-6 text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Pegue. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
