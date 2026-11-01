import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  // Dominio de guincho → redireciona pra /guincho (so na raiz)
  if (
    (hostname.includes("guincho24horasosasco") || hostname.includes("www.guincho24horasosasco")) &&
    pathname === "/"
  ) {
    return NextResponse.rewrite(new URL("/guincho", request.url));
  }

  // Dominio de carreto → redireciona pra /carreto (so na raiz)
  if (
    (hostname.includes("carretoosasco") || hostname.includes("www.carretoosasco")) &&
    pathname === "/"
  ) {
    return NextResponse.rewrite(new URL("/carreto", request.url));
  }

  // Paginas de teste (/teste-som, /teste-cores, /teste-pagamento, /teste-boss,
  // /teste-caminhao) sao ferramenta de desenvolvimento. Em producao elas ficam
  // 404: /teste-pagamento mostrava "Pagamento Aprovado!" pra qualquer visitante.
  // Em dev continuam abrindo normal. robots.txt nao basta — so pede pro robo
  // nao indexar, qualquer pessoa com o link entrava.
  if (pathname.startsWith("/teste-") && process.env.NODE_ENV === "production") {
    return NextResponse.rewrite(new URL("/_rota-inexistente-404", request.url));
  }

  // chamepegue.com.br → home normal (nao precisa fazer nada)

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/teste-:path*"],
};
