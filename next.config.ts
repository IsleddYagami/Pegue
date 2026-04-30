import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Headers de seguranca padrao OWASP. Aplicam em TODAS as rotas pra
// reduzir superficie de ataque (XSS, clickjacking, MITM, info leak).
// CSP omitido pra nao quebrar Stripe/Asaas/ChatPro (tunneling) — adicionar
// depois em quando whitelist completa for conhecida.
const securityHeaders = [
  // Forca HTTPS em todos os subdominios por 1 ano (HSTS)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // Bloqueia clickjacking (framing por outros sites)
  { key: "X-Frame-Options", value: "DENY" },
  // Browser nao "adivinha" content-type (previne XSS via mime confusion)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrer minimo entre origens
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Bloqueia features sensiveis por padrao
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "pegue",
  project: "javascript-nextjs",

  silent: !process.env.CI,

  widenClientFileUpload: true,

  tunnelRoute: "/monitoring",

  automaticVercelMonitors: false,
});
