import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Headers de seguranca padrao OWASP. Aplicam em TODAS as rotas pra
// reduzir superficie de ataque (XSS, clickjacking, MITM, info leak).
//
// CSP whitelist (atualizado 30/Abr/2026 apos integracao Asaas producao):
//   - 'self' (proprio dominio)
//   - Supabase: *.supabase.co (REST + Storage + Realtime)
//   - Asaas: *.asaas.com (cobranca / checkout)
//   - Sentry: *.sentry.io + *.ingest.sentry.io (telemetria erros)
//   - ChatPro: v5.chatpro.com.br (WhatsApp send/receive)
//   - OpenAI: api.openai.com (Vision + IA contexto)
//   - Google: maps.google.com + maps.googleapis.com (geocoder)
//   - Vercel insights: *.vercel-insights.com (analytics nativo)
const cspParts = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel-insights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://images.pexels.com https://maps.googleapis.com https://maps.gstatic.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.asaas.com https://*.sentry.io https://*.ingest.sentry.io https://api.openai.com https://maps.googleapis.com https://*.vercel-insights.com https://v5.chatpro.com.br",
  "frame-src 'self' https://*.asaas.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const securityHeaders = [
  // Forca HTTPS em todos os subdominios por 1 ano (HSTS)
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // Bloqueia clickjacking (framing por outros sites)
  { key: "X-Frame-Options", value: "DENY" },
  // Browser nao "adivinha" content-type (previne XSS via mime confusion)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Referrer minimo entre origens
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Bloqueia features sensiveis por padrao.
  // BUG #BATCH7-1 (re-audit 1/Mai/2026): geolocation=() bloqueava
  // rastreio do motorista em /rastrear/motorista/[token] que usa
  // navigator.geolocation pra reportar GPS ao backend. Rastreio em
  // tempo real estava QUEBRADO. Agora geolocation=(self) permite
  // a propria origem chamar GPS (motorista no nosso site), mantendo
  // bloqueado pra terceiros embutidos (iframes, etc).
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  // Content Security Policy — whitelist explicita de origens
  { key: "Content-Security-Policy", value: cspParts.join("; ") },
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
