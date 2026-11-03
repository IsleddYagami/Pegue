import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { WHATSAPP_LINK } from "@/lib/constants";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.chamepegue.com.br"),
  title: {
    default: "Carreto, Mudança, Frete e Guincho em São Paulo | Pegue",
    template: "%s | Pegue",
  },
  description:
    "Carreto, mudança, frete e guincho em São Paulo: capital, litoral e interior. Manda a foto e o destino no WhatsApp e recebe o preço na hora. A partir de R$ 150.",
  keywords: [
    "carreto sao paulo",
    "frete sao paulo",
    "mudanca sao paulo",
    "guincho sao paulo",
    "carreto litoral paulista",
    "frete interior de sao paulo",
    "mudanca interior sp",
    "guincho 24 horas sp",
    "carreto perto de mim",
    "frete pelo whatsapp",
    "mudanca residencial",
    "carreto osasco",
  ],
  authors: [{ name: "Pegue" }],
  creator: "Pegue",
  publisher: "Pegue",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Carreto, Mudança, Frete e Guincho em São Paulo | Pegue",
    description: "Carreto e mudança a partir de R$ 150. Capital, litoral e interior. Manda a foto no WhatsApp e recebe o preço na hora.",
    url: "https://www.chamepegue.com.br",
    siteName: "Pegue",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Pegue - Soluções em Transportes e Fretes" }],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Carreto, Mudança e Guincho em São Paulo | Pegue",
    description: "Carreto e mudança a partir de R$ 150. Preço na hora pelo WhatsApp.",
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
  "@id": "https://www.chamepegue.com.br/#business",
  name: "Pegue",
  alternateName: "Chame Pegue",
  description:
    "Plataforma de fretes, mudanças e guinchos via WhatsApp com IA. Intermediamos entre clientes e prestadores na Grande SP.",
  url: "https://www.chamepegue.com.br",
  telephone: "+5511970363713",
  image: "https://www.chamepegue.com.br/logo-pegue-novo.png",
  logo: "https://www.chamepegue.com.br/logo-pegue-novo.png",
  priceRange: "R$",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Osasco",
    addressRegion: "SP",
    addressCountry: "BR",
  },
  areaServed: [
    { "@type": "State", name: "São Paulo" },
    { "@type": "AdministrativeArea", name: "Grande São Paulo" },
    { "@type": "AdministrativeArea", name: "Litoral Paulista" },
    { "@type": "AdministrativeArea", name: "Interior de São Paulo" },
    { "@type": "City", name: "São Paulo" },
    { "@type": "City", name: "Osasco" },
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
  url: "https://www.chamepegue.com.br",
  logo: "https://www.chamepegue.com.br/logo-pegue-novo.png",
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+5511970363713",
    contactType: "Customer Service",
    areaServed: "BR",
    availableLanguage: "Portuguese",
  },
  sameAs: ["https://www.instagram.com/chamepegue"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${bricolage.variable} h-full antialiased`}>
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
