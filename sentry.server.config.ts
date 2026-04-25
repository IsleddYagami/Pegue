import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Captura 10% das transacoes server-side
  tracesSampleRate: 0.1,

  debug: false,
});
