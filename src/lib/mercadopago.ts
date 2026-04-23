// Integracao Mercado Pago - Checkout Pro
// DESABILITADO por padrao - ativar via configuracoes

import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import crypto from "crypto";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || "",
});

const preference = new Preference(client);
const payment = new Payment(client);

// Cria link de pagamento (Checkout Pro)
export async function criarLinkPagamento(params: {
  corridaId: string;
  descricao: string;
  valor: number;
  clienteNome: string;
  clienteEmail?: string;
}) {
  const taxaCartao = Math.round(params.valor * 0.0498 * 100) / 100;
  const valorComTaxa = Math.round((params.valor + taxaCartao) * 100) / 100;

  const result = await preference.create({
    body: {
      items: [
        {
          id: params.corridaId,
          title: `Frete Pegue - ${params.descricao}`,
          description: `Servico de frete/mudanca`,
          quantity: 1,
          unit_price: params.valor,
          currency_id: "BRL",
        },
      ],
      payer: {
        name: params.clienteNome,
        email: params.clienteEmail || undefined,
      },
      external_reference: params.corridaId,
      notification_url: "https://chamepegue.com.br/api/pagamento/webhook",
      back_urls: {
        success: "https://chamepegue.com.br/pagamento-sucesso",
        failure: "https://chamepegue.com.br/pagamento-erro",
        pending: "https://chamepegue.com.br/pagamento-pendente",
      },
      auto_return: "approved",
      payment_methods: {
        excluded_payment_types: [
          { id: "ticket" }, // Exclui boleto
        ],
      },
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 20 * 60 * 1000).toISOString(), // 20 minutos
    },
  });

  return {
    linkPagamento: result.init_point || "",
    preferenceId: result.id || "",
  };
}

// Busca detalhes de um pagamento
export async function buscarPagamento(paymentId: string) {
  const result = await payment.get({ id: paymentId });
  return {
    status: result.status, // approved, pending, rejected
    valor: result.transaction_amount,
    metodo: result.payment_type_id, // credit_card, debit_card, pix, etc
    referencia: result.external_reference,
    pagadorEmail: result.payer?.email,
  };
}

// Valida a assinatura do webhook do Mercado Pago.
// MP manda header "x-signature" no formato: ts=<timestamp>,v1=<hmac_hex>
// O manifest a assinar eh:  id:<dataId>;request-id:<reqId>;ts:<ts>;
// HMAC-SHA256(manifest, MP_WEBHOOK_SECRET) == v1
// Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
//
// Retorna true se a assinatura eh valida. Fail-secure: se MP_WEBHOOK_SECRET
// nao estiver configurado, retorna false (recusa todos webhooks).
export function validarAssinaturaWebhookMP(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("MP_WEBHOOK_SECRET nao configurado - webhook MP rejeitado");
    return false;
  }

  if (!params.xSignature || !params.dataId) return false;

  // Parse "ts=X,v1=Y"
  const parts = params.xSignature.split(",").reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  // Rejeita timestamps muito antigos (replay attack) - 5 min de tolerancia
  const tsNum = parseInt(ts, 10);
  if (isNaN(tsNum)) return false;
  const ageMs = Math.abs(Date.now() - tsNum);
  if (ageMs > 5 * 60 * 1000) return false;

  // Monta manifest conforme spec do MP
  const manifest = `id:${params.dataId};request-id:${params.xRequestId || ""};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  // timingSafeEqual evita timing attacks
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(v1, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
