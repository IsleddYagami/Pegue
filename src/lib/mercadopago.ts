// Integracao Mercado Pago - Checkout Pro
// DESABILITADO por padrao - ativar via configuracoes

import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import crypto from "crypto";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || "",
});

const preference = new Preference(client);
const payment = new Payment(client);

// Taxa estimada cobrada pelo MP em cartao de credito (percentual sobre o valor).
// Usada pra repassar a taxa pro cliente (Pegue nao absorve - margem ja eh apertada).
// Valor padrao 4.98% (taxa MP cartao 1 parcela). Pra outras parcelas/taxas reais,
// usar a calculadora do MP ou taxa real cobrada na conta.
export const TAXA_CARTAO_PCT = 4.98;

export function calcularTaxaCartao(valor: number): { taxa: number; total: number } {
  const taxa = Math.round(valor * (TAXA_CARTAO_PCT / 100) * 100) / 100;
  const total = Math.round((valor + taxa) * 100) / 100;
  return { taxa, total };
}

// Cria link de pagamento (Checkout Pro). Repassa taxa do cartao pro cliente:
// valor cobrado = valor original + taxa MP. Cliente ve o total final no checkout.
// PIX direto NAO tem essa taxa (gera-se separado em criarPagamentoPixDireto).
export async function criarLinkPagamento(params: {
  corridaId: string;
  descricao: string;
  valor: number;
  clienteNome: string;
  clienteEmail?: string;
}) {
  const { taxa, total } = calcularTaxaCartao(params.valor);

  const result = await preference.create({
    body: {
      items: [
        {
          id: params.corridaId,
          title: `Frete Pegue - ${params.descricao}`,
          description: `Servico de frete/mudanca (inclui taxa MP ${TAXA_CARTAO_PCT}%)`,
          quantity: 1,
          unit_price: total, // valor com taxa repassada ao cliente
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
    valorOriginal: params.valor,
    taxaCartao: taxa,
    valorTotalCartao: total,
  };
}

// Cria pagamento PIX DIRETO via Payment API (NAO usa Checkout Pro).
// Vantagens sobre Checkout Pro:
// - NAO exige login na conta MP do cliente (cliente leigo paga sem cadastro)
// - Retorna QR code + copia/cola (cliente paga em qualquer banco)
// - Validade default 24h (Checkout Pro era 20min, expirava facil)
// - Mensagens de erro mais claras (Checkout Pro retornava CPT01 generico)
// - Contorna restricao de auto-pagamento que afetava Checkout Pro
//
// Retorna:
//   paymentId: ID do pagamento (salvar pra rastreabilidade)
//   qrCodeBase64: imagem PNG do QR (mandar via sendImageToClient)
//   qrCodeTexto: codigo copia/cola (cliente cola no app do banco)
//   ticketUrl: URL alternativa (caso queira abrir no navegador)
export async function criarPagamentoPixDireto(params: {
  corridaId: string;
  descricao: string;
  valor: number;
  clienteNome: string;
  clienteTelefone: string;
  clienteEmail?: string;
}) {
  // MP exige email do payer. Se nao tiver email cadastrado, gera um placeholder
  // baseado no telefone (formato comum aceito pelo MP).
  const email = params.clienteEmail || `${params.clienteTelefone}@cliente.chamepegue.com.br`;

  // Quebra nome em first/last (MP tem campos separados).
  const partesNome = (params.clienteNome || "Cliente").trim().split(/\s+/);
  const firstName = partesNome[0] || "Cliente";
  const lastName = partesNome.slice(1).join(" ") || "Pegue";

  const result = await payment.create({
    body: {
      transaction_amount: params.valor,
      description: params.descricao,
      payment_method_id: "pix",
      payer: {
        email,
        first_name: firstName,
        last_name: lastName,
      },
      external_reference: params.corridaId,
      notification_url: "https://chamepegue.com.br/api/pagamento/webhook",
      // PIX expira em 24h (vs 20min do Checkout Pro - menos atrito).
      date_of_expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    } as any,
  });

  const txData = (result as any).point_of_interaction?.transaction_data;

  return {
    paymentId: String(result.id || ""),
    qrCodeBase64: txData?.qr_code_base64 || "",
    qrCodeTexto: txData?.qr_code || "",
    ticketUrl: txData?.ticket_url || "",
    status: result.status || "pending",
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
