import Link from "next/link";
import Image from "next/image";
import { WHATSAPP_LINK, INSTAGRAM_LINK, INSTAGRAM_HANDLE } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="bg-[#000000] text-gray-400">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
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
              Frete e mudança sem dor de cabeça.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Osasco &middot; Grande SP &middot; Interior
            </p>
            <p className="mt-4 text-xs text-gray-600 leading-relaxed">
              Pegue é uma plataforma intermediadora de fretes, mudanças e
              guinchos que conecta clientes a fretistas autônomos verificados.
            </p>
          </div>

          {/* Servicos */}
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#C9A84C]">
              Serviços
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <Link href="/carreto" className="transition-colors hover:text-[#C9A84C]">
                Carreto em Osasco
              </Link>
              <Link href="/guincho" className="transition-colors hover:text-[#C9A84C]">
                Guincho 24h
              </Link>
              <Link href="/simular" className="transition-colors hover:text-[#C9A84C]">
                Simular Frete
              </Link>
              <Link href="/parceiro" className="transition-colors hover:text-[#C9A84C]">
                Seja um parceiro
              </Link>
            </div>
          </div>

          {/* Links */}
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#C9A84C]">
              Institucional
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <Link href="/faq" className="transition-colors hover:text-[#C9A84C]">
                Perguntas Frequentes
              </Link>
              <Link href="/rastrear" className="transition-colors hover:text-[#C9A84C]">
                Rastrear Pedido
              </Link>
              <Link href="/politica-privacidade" className="transition-colors hover:text-[#C9A84C]">
                Política de Privacidade
              </Link>
              <Link href="/termos-uso" className="transition-colors hover:text-[#C9A84C]">
                Termos de Uso
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
                WhatsApp: (11) 97036-3713
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
                href="mailto:fretesresgatespg@gmail.com"
                className="transition-colors hover:text-[#C9A84C]"
              >
                fretesresgatespg@gmail.com
              </a>
            </div>
          </div>
        </div>

        {/* Dados empresariais - LGPD + CDC compliance */}
        <div className="mt-8 border-t border-[#C9A84C]/10 pt-6">
          <p className="text-xs text-gray-600 leading-relaxed">
            {/*
              IMPORTANTE: preencher com dados reais antes de escalar marketing/ads.
              Exigido por CDC (art. 31) e LGPD (transparencia).
            */}
            <strong className="text-gray-500">Pegue Fretes e Mudanças</strong><br />
            CNPJ: em processo de formalização<br />
            Sede: Presidente Altino, Osasco - SP<br />
            Atendimento a domicílio em toda grande São Paulo
          </p>
        </div>

        {/* Trust micro-text */}
        <div className="mt-6 border-t border-[#C9A84C]/10 pt-6 text-center">
          <p className="text-[11px] text-gray-600">
            Fretistas verificados &middot; Pagamento protegido via Mercado Pago &middot; Rastreamento em tempo real
          </p>
          <p className="mt-2 text-xs text-gray-700">
            &copy; {new Date().getFullYear()} Pegue. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
