// Integracao Mercado Pago - Checkout Pro
// DESABILITADO por padrao - ativar via configuracoes

import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

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
      notification_url: "https://pegue-eta.vercel.app/api/pagamento/webhook",
      back_urls: {
        success: "https://pegue-eta.vercel.app/pagamento-sucesso",
        failure: "https://pegue-eta.vercel.app/pagamento-erro",
        pending: "https://pegue-eta.vercel.app/pagamento-pendente",
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
