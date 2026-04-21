import { NextRequest, NextResponse } from "next/server";
import { isValidAdminKey } from "@/lib/admin-auth";
import { enviarEmailCadastroPrestador } from "@/lib/email";

export const dynamic = "force-dynamic";

// Endpoint de TESTE: dispara um email de cadastro fake pra validar que a
// integracao com Resend + dominio chamepegue.com.br esta funcionando.
// Uso: /api/admin-testar-email?key=SENHA_ADMIN
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");

  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
  }

  try {
    const ok = await enviarEmailCadastroPrestador({
      nome: "TESTE - Prestador Fake",
      telefone: "5511900000000",
      cpf: "00000000000",
      email: "teste@exemplo.com",
      chavePix: "teste@exemplo.com",
      tipoVeiculo: "utilitario",
      placa: "TST1234",
      selfieUrl: null,
      fotoPlacaUrl: null,
      fotoVeiculoUrl: null,
      dataAceite: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      origem: "admin_manual",
    });

    if (ok) {
      return NextResponse.json({
        status: "ok",
        mensagem: "Email de teste disparado! Confere as caixas de entrada de fretesresgatespg@gmail.com e ioriiorivendas@gmail.com (inclusive spam/promoções).",
      });
    } else {
      return NextResponse.json({
        status: "falhou",
        mensagem: "enviarEmailCadastroPrestador retornou false - provavelmente erro do Resend. Verifica logs do Vercel ou dashboard do Resend.",
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({
      error: error?.message,
      stack: error?.stack,
    }, { status: 500 });
  }
}
