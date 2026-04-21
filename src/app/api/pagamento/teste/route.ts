import { NextRequest, NextResponse } from "next/server";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { isValidAdminKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Endpoint de teste - gera link de pagamento de R$ 1
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");

  if (!isValidAdminKey(key)) {
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
        payment_methods: {
          excluded_payment_types: [],
          default_payment_method_id: "pix",
        },
        external_reference: "teste-pegue-001",
        notification_url: "https://chamepegue.com.br/api/pagamento/webhook",
        back_urls: {
          success: "https://chamepegue.com.br/teste-pagamento?status=ok",
          failure: "https://chamepegue.com.br/teste-pagamento?status=erro",
          pending: "https://chamepegue.com.br/teste-pagamento?status=pendente",
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
