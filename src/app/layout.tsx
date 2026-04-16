import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pegue-eta.vercel.app"),
  title: {
    default: "Pegue - Frete, Mudança e Guincho Rápido pelo WhatsApp | Grande SP",
    template: "%s | Pegue",
  },
  description:
    "Frete, mudança e guincho sem dor de cabeça. Mande a foto do material e receba o valor na hora pelo WhatsApp. Atende Osasco, Grande SP, litoral e interior. A Pegue Resolve.",
  keywords: [
    "frete osasco",
    "mudança osasco",
    "frete zona oeste sp",
    "mudança barata sp",
    "frete rápido sp",
    "guincho osasco",
    "frete pelo whatsapp",
    "frete grande sp",
    "mudança residencial sp",
    "carreto osasco",
  ],
  authors: [{ name: "Pegue" }],
  creator: "Pegue",
  publisher: "Pegue",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Pegue - Frete, Mudança e Guincho Rápido pelo WhatsApp",
    description: "Mande a foto do material e receba o valor na hora pelo WhatsApp. A Pegue Resolve.",
    url: "https://pegue-eta.vercel.app",
    siteName: "Pegue",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Pegue - Soluções em Transportes e Fretes" }],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pegue - Frete e Mudança Rápido pelo WhatsApp",
    description: "Mande a foto do material e receba o valor na hora pelo WhatsApp.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": "https://pegue-eta.vercel.app/#business",
  name: "Pegue",
  alternateName: "Chame Pegue",
  description:
    "Plataforma de fretes, mudanças e guinchos via WhatsApp com IA. Intermediamos entre clientes e prestadores na Grande SP.",
  url: "https://pegue-eta.vercel.app",
  telephone: "+5511970363713",
  image: "https://pegue-eta.vercel.app/logo-pegue-novo.png",
  logo: "https://pegue-eta.vercel.app/logo-pegue-novo.png",
  priceRange: "R$",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Osasco",
    addressRegion: "SP",
    addressCountry: "BR",
  },
  areaServed: [
    { "@type": "City", name: "São Paulo" },
    { "@type": "City", name: "Osasco" },
    { "@type": "City", name: "Guarulhos" },
    { "@type": "City", name: "Santo André" },
    { "@type": "City", name: "São Bernardo do Campo" },
    { "@type": "AdministrativeArea", name: "Grande São Paulo" },
  ],
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    opens: "07:00",
    closes: "22:00",
  },
  sameAs: ["https://www.instagram.com/chamepegue"],
  serviceType: ["Frete", "Mudança", "Guincho", "Carreto"],
  slogan: "A Pegue Resolve. Pegou, Chegou!",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Pegue",
  url: "https://pegue-eta.vercel.app",
  logo: "https://pegue-eta.vercel.app/logo-pegue-novo.png",
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+5511970363713",
    contactType: "Customer Service",
    areaServed: "BR",
    availableLanguage: "Portuguese",
  },
  sameAs: ["https://www.instagram.com/chamepegue"],
};

const WHATSAPP_LINK =
  "https://wa.me/5511999999999?text=Oi%2C%20quero%20fazer%20um%20frete!";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-[#000000]">
        {children}

        {/* WhatsApp Floating Button */}
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A84C] text-[#0A0A0A] shadow-lg transition-transform hover:scale-110"
          aria-label="Falar no WhatsApp"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </a>
      </body>
    </html>
  );
}
