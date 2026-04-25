import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Captura 10% das transacoes pra ter performance sem estourar quota
  tracesSampleRate: 0.1,

  // Reduz logs em dev
  debug: false,

  // Filtra erros conhecidos que nao devem virar issues
  beforeSend(event, hint) {
    // Ignora erros de extensao de browser (fora do nosso controle)
    const error = hint.originalException as Error | undefined;
    if (error?.message?.includes("ResizeObserver loop")) return null;
    if (error?.stack?.includes("chrome-extension://")) return null;
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
