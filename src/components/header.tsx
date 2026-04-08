"use client";

import Link from "next/link";
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
    <header className="sticky top-0 z-40 bg-[#1a1a1a] text-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          <span className="text-[#00C896]">Pegue</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-300 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[#00C896] px-5 py-2 text-sm font-bold text-[#1a1a1a] transition-transform hover:scale-105"
          >
            Pedir Frete
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
        <nav className="flex flex-col gap-4 border-t border-gray-700 px-4 pb-4 pt-4 md:hidden">
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
            className="rounded-full bg-[#00C896] px-5 py-3 text-center text-sm font-bold text-[#1a1a1a]"
          >
            Pedir Frete
          </a>
        </nav>
      )}
    </header>
  );
}
