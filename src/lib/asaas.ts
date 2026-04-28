// Integracao Asaas (https://www.asaas.com)
//
// Substitui parcialmente o Mercado Pago (que NAO tem API de PIX out).
// Asaas oferece:
// - Receber via PIX/Cartao (cobrancas)
// - Enviar PIX automatico (transferencias) - oque MP nao faz
// - Split de marketplace (12% Pegue + 88% fretista)
//
// Env vars obrigatorias:
//   ASAAS_API_KEY   - chave API (sandbox: $aact_hmlg_..., prod: $aact_prod_...)
//   ASAAS_BASE_URL  - https://api-sandbox.asaas.com/v3 OU https://api.asaas.com/v3
//   ASAAS_WALLET_ID - UUID da carteira da conta Pegue (pra split)
//
// Documentacao: https://docs.asaas.com/

const API_KEY = process.env.ASAAS_API_KEY || "";
const BASE_URL = process.env.ASAAS_BASE_URL || "https://api-sandbox.asaas.com/v3";
const WALLET_ID = process.env.ASAAS_WALLET_ID || "";

function isConfigured(): boolean {
  return !!API_KEY && !!BASE_URL && !!WALLET_ID;
}

// Wrapper interno pra chamadas Asaas. Retorna { ok, data, status, erro }.
// Asaas usa header `access_token` (nao Authorization Bearer).
async function asaasFetch<T = any>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: any,
): Promise<{ ok: boolean; status: number; data?: T; erro?: any }> {
  if (!isConfigured()) {
    return {
      ok: false,
      status: 0,
      erro: { motivo: "ASAAS_API_KEY/BASE_URL/WALLET_ID nao configurados" },
    };
  }

  try {
    const r = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        access_token: API_KEY,
        "Content-Type": "application/json",
        "User-Agent": "PegueMarketplace/1.0",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await r.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!r.ok) {
      return { ok: false, status: r.status, erro: data };
    }

    return { ok: true, status: r.status, data };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      erro: { motivo: "excecao_fetch", mensagem: e?.message?.slice(0, 300) },
    };
  }
}

// =========================================================================
// CLIENTES (necessario pra criar cobranca - Asaas exige cliente cadastrado)
// =========================================================================

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj?: string;
  email?: string;
  phone?: string;
}

// Asaas valida mobilePhone como formato brasileiro 11 digitos (DDD + numero).
// Nosso sistema guarda telefones com DDI 55 prefix (ex: "5511971429605").
// Remove o 55 pra deixar so 11 digitos.
function formatTelefoneAsaas(telefone: string): string {
  const limpo = telefone.replace(/\D/g, "");
  if (limpo.startsWith("55") && limpo.length === 13) return limpo.slice(2);
  return limpo;
}

// Cria ou recupera cliente Asaas. Idempotente via externalReference (telefone).
export async function criarOuObterCliente(params: {
  nome: string;
  telefone: string; // ex: "5511971429605" (sera usado como externalReference)
  email?: string;
  cpf?: string;
}): Promise<{ ok: boolean; cliente?: AsaasCustomer; erro?: any }> {
  // 1) Tenta encontrar por externalReference
  const busca = await asaasFetch<{ data: AsaasCustomer[] }>(
    "GET",
    `/customers?externalReference=${encodeURIComponent(params.telefone)}`,
  );

  if (busca.ok && busca.data?.data && busca.data.data.length > 0) {
    return { ok: true, cliente: busca.data.data[0] };
  }

  // 2) Cria novo (telefone formatado pra padrao brasileiro 11 digitos)
  const criar = await asaasFetch<AsaasCustomer>("POST", "/customers", {
    name: params.nome,
    cpfCnpj: params.cpf || undefined,
    email: params.email || `${params.telefone}@cliente.chamepegue.com.br`,
    mobilePhone: formatTelefoneAsaas(params.telefone),
    externalReference: params.telefone,
    notificationDisabled: true, // nao spamma cliente com email/sms do Asaas
  });

  if (!criar.ok) return { ok: false, erro: criar.erro };
  return { ok: true, cliente: criar.data };
}

// =========================================================================
// COBRANCAS (recebimento - cliente paga PIX ou cartao)
// =========================================================================

export interface AsaasPayment {
  id: string;
  status: string; // PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, etc
  value: number;
  netValue?: number;
  billingType: "PIX" | "CREDIT_CARD" | "BOLETO" | "UNDEFINED";
  invoiceUrl?: string; // link Checkout Asaas (PIX + cartao na mesma tela)
  externalReference?: string;
  pixQrCodeBase64?: string;
  pixCopiaECola?: string;
}

// Cria cobranca PERMITINDO cliente pagar via PIX ou Cartao na mesma tela.
// Retorna invoiceUrl (link unico Checkout Asaas) + dados PIX caso queira
// mostrar QR code direto.
export async function criarCobranca(params: {
  clienteAsaasId: string;
  valor: number; // em reais (ex: 1.50)
  descricao: string;
  corridaId: string; // usado como externalReference (vincula pagamento -> corrida)
  diasVencimento?: number; // default 1 dia
}): Promise<{ ok: boolean; cobranca?: AsaasPayment; pix?: { qrCodeBase64: string; payload: string }; erro?: any }> {
  // Data de vencimento (formato YYYY-MM-DD)
  const dias = params.diasVencimento ?? 1;
  const venc = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  const dueDate = venc.toISOString().slice(0, 10);

  // 1) Cria cobranca (billingType UNDEFINED = cliente escolhe PIX ou cartao no checkout)
  const cobranca = await asaasFetch<AsaasPayment>("POST", "/payments", {
    customer: params.clienteAsaasId,
    billingType: "UNDEFINED",
    value: params.valor,
    dueDate,
    description: params.descricao,
    externalReference: params.corridaId,
  });

  if (!cobranca.ok) return { ok: false, erro: cobranca.erro };
  if (!cobranca.data) return { ok: false, erro: { motivo: "resposta_vazia" } };

  // 2) Busca QR code PIX (gerado automaticamente pra cobrancas UNDEFINED)
  // Endpoint: GET /payments/{id}/pixQrCode
  const pixData = await asaasFetch<{ encodedImage: string; payload: string; expirationDate: string }>(
    "GET",
    `/payments/${cobranca.data.id}/pixQrCode`,
  );

  return {
    ok: true,
    cobranca: cobranca.data,
    pix: pixData.ok && pixData.data
      ? { qrCodeBase64: pixData.data.encodedImage, payload: pixData.data.payload }
      : undefined,
  };
}

export async function getPagamento(paymentId: string): Promise<{ ok: boolean; pagamento?: AsaasPayment; erro?: any }> {
  const r = await asaasFetch<AsaasPayment>("GET", `/payments/${paymentId}`);
  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, pagamento: r.data };
}

// =========================================================================
// TRANSFERENCIAS (envio - Pegue paga fretista via PIX)
// =========================================================================

export interface AsaasTransfer {
  id: string;
  status: string; // PENDING, BANK_PROCESSING, DONE, FAILED, CANCELLED
  value: number;
  netValue?: number;
  effectiveDate?: string;
  description?: string;
}

// Envia PIX direto pra chave (ex: pra fretista). Asaas aceita CPF, EMAIL, PHONE, EVP.
// Detecta tipo da chave automaticamente baseado no formato.
function detectarTipoChavePix(chave: string): string {
  const limpa = chave.replace(/\D/g, "");
  if (/^\d{11}$/.test(limpa)) return "CPF";
  if (/^\d{14}$/.test(limpa)) return "CNPJ";
  if (chave.includes("@")) return "EMAIL";
  if (/^\+?\d{10,13}$/.test(limpa)) return "PHONE";
  // Default: chave aleatoria EVP (32 chars, formato UUID)
  return "EVP";
}

export async function transferirPix(params: {
  valor: number; // em reais
  chavePix: string;
  descricao?: string;
  externalReference?: string;
}): Promise<{ ok: boolean; transfer?: AsaasTransfer; erro?: any }> {
  if (!params.chavePix) {
    return { ok: false, erro: { motivo: "chave_pix_vazia" } };
  }
  if (params.valor <= 0) {
    return { ok: false, erro: { motivo: "valor_invalido", valor: params.valor } };
  }

  const tipo = detectarTipoChavePix(params.chavePix);

  const r = await asaasFetch<AsaasTransfer>("POST", "/transfers", {
    value: params.valor,
    pixAddressKey: params.chavePix,
    pixAddressKeyType: tipo,
    description: params.descricao || "Repasse Pegue Marketplace",
    externalReference: params.externalReference,
  });

  if (!r.ok) return { ok: false, erro: r.erro };
  return { ok: true, transfer: r.data };
}

// =========================================================================
// WEBHOOKS - validacao de origem
// =========================================================================

// Asaas envia webhook com header `asaas-access-token` que deve bater com
// o token configurado no painel (https://www.asaas.com/integrations -> Webhooks).
// Diferente do MP que usa HMAC, Asaas usa shared secret simples.
//
// Configurar no painel Asaas:
//   URL: https://www.chamepegue.com.br/api/asaas/webhook
//   Token: gerar UUID e adicionar como ASAAS_WEBHOOK_TOKEN na Vercel
//   Eventos: marcar PAYMENT_RECEIVED, PAYMENT_CONFIRMED, TRANSFER_DONE, TRANSFER_FAILED
export function validarWebhookAsaas(headers: Headers): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected) {
    // Fail-secure: sem token configurado, recusa todos
    return false;
  }
  const received = headers.get("asaas-access-token");
  return received === expected;
}

// Helper exposto pra debug/health-check
export function asaasStatus() {
  return {
    configured: isConfigured(),
    base_url: BASE_URL,
    api_key_set: !!API_KEY,
    api_key_tipo: API_KEY.startsWith("$aact_hmlg_") ? "sandbox" : API_KEY.startsWith("$aact_prod_") ? "producao" : "desconhecido",
    wallet_id_set: !!WALLET_ID,
    webhook_token_set: !!process.env.ASAAS_WEBHOOK_TOKEN,
  };
}
