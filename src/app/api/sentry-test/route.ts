import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Rota de teste do Sentry. Acessar GET /api/sentry-test?key=ping dispara
// erro proposital pra validar que Sentry esta capturando server-side.
// REMOVER apos validar.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (key !== "ping") {
    return NextResponse.json({
      hint: "use ?key=ping pra disparar erro de teste",
    });
  }

  // Erro proposital - Sentry captura
  throw new Error("Sentry test error - " + new Date().toISOString());
}
