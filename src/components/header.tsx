"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { WHATSAPP_LINK } from "@/lib/constants";

const navLinks = [
  { label: "Inicio", href: "/" },
  { label: "Simular Frete", href: "/simular" },
  { label: "Rastrear", href: "/rastrear" },
  { label: "FAQ", href: "/faq" },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#C9A84C]/20 bg-[#0A0A0A]/95 text-white backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/logo-pegue-horizontal.png"
            alt="Pegue - Solucoes em Transportes e Fretes"
            width={160}
            height={45}
            className="h-10 w-auto"
            priority
          />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-300 transition-colors hover:text-[#C9A84C]"
            >
              {link.label}
            </Link>
          ))}
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border-2 border-[#C9A84C] bg-[#C9A84C] px-6 py-2 text-sm font-bold text-[#0A0A0A] transition-all hover:bg-transparent hover:text-[#C9A84C]"
          >
            Chamar no WhatsApp
          </a>
        </nav>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Nav */}
      {menuOpen && (
        <nav className="flex flex-col gap-4 border-t border-[#C9A84C]/20 px-4 pb-4 pt-4 md:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-300"
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[#C9A84C] px-5 py-3 text-center text-sm font-bold text-[#0A0A0A]"
          >
            Chamar no WhatsApp
          </a>
        </nav>
      )}
    </header>
  );
}
