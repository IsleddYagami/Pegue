import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";

export const dynamic = "force-dynamic";

// Endpoint de teste - gera link de pagamento de R$ 1
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");

  if (key !== "P3gu32026@@") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
  }

  try {
    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN || "",
    });

    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            id: "teste-pegue-001",
            title: "TESTE - Frete Pegue (NAO E REAL)",
            description: "Pagamento de teste R$ 1,00",
            quantity: 1,
            unit_price: 1,
            currency_id: "BRL",
          },
        ],
        external_reference: "teste-pegue-001",
        notification_url: "https://pegue-eta.vercel.app/api/pagamento/webhook",
        back_urls: {
          success: "https://pegue-eta.vercel.app",
          failure: "https://pegue-eta.vercel.app",
          pending: "https://pegue-eta.vercel.app",
        },
        auto_return: "approved",
      },
    });

    return NextResponse.json({
      status: "ok",
      mensagem: "Link de teste gerado! Pague R$ 1,00 pra testar",
      link: result.init_point,
      sandbox_link: result.sandbox_init_point,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error?.message,
      causa: error?.cause,
    }, { status: 500 });
  }
}
