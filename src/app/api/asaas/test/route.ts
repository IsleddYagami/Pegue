import { NextRequest, NextResponse } from "next/server";
import { isValidAdminKey } from "@/lib/admin-auth";
import {
  asaasStatus,
  criarOuObterCliente,
  criarCobranca,
  transferirPix,
  getPagamento,
} from "@/lib/asaas";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Endpoint de TESTE da integracao Asaas. Roda sequencia de validacao:
// 1) Verifica env vars setadas
// 2) Cria/obtem cliente teste
// 3) Cria cobranca R$1
// 4) Consulta status da cobranca
//
// PROTEGIDO POR ADMIN_KEY — nao expor publicamente.
//
// Usar:
//   https://www.chamepegue.com.br/api/asaas/test?key=ADMIN_KEY
//
// Retorna JSON com cada passo do teste e onde falhou (se falhar).
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const passos: Array<{ passo: string; ok: boolean; detalhe?: any }> = [];

  // PASSO 1: Status da config
  const status = asaasStatus();
  passos.push({
    passo: "1_config_env_vars",
    ok: status.configured,
    detalhe: status,
  });

  if (!status.configured) {
    return NextResponse.json({
      sucesso: false,
      erro: "env vars Asaas nao configuradas - rever Vercel + redeploy",
      passos,
    });
  }

  // PASSO 2: Criar/obter cliente teste
  const cliente = await criarOuObterCliente({
    nome: "Cliente Teste Pegue",
    telefone: "5511999999999",
    email: "teste@chamepegue.com.br",
  });
  passos.push({
    passo: "2_criar_cliente",
    ok: cliente.ok,
    detalhe: cliente.ok ? { id: cliente.cliente?.id, name: cliente.cliente?.name } : cliente.erro,
  });

  if (!cliente.ok || !cliente.cliente) {
    return NextResponse.json({ sucesso: false, erro: "falha no criar cliente", passos });
  }

  // PASSO 3: Criar cobranca R$1
  const cobranca = await criarCobranca({
    clienteAsaasId: cliente.cliente.id,
    valor: 1.00,
    descricao: "Pegue - Teste integracao Asaas",
    corridaId: "teste-" + Date.now(),
  });
  passos.push({
    passo: "3_criar_cobranca",
    ok: cobranca.ok,
    detalhe: cobranca.ok
      ? {
          id: cobranca.cobranca?.id,
          valor: cobranca.cobranca?.value,
          status: cobranca.cobranca?.status,
          link_checkout: cobranca.cobranca?.invoiceUrl,
          tem_pix_qr: !!cobranca.pix?.qrCodeBase64,
          tem_pix_copia_cola: !!cobranca.pix?.payload,
        }
      : cobranca.erro,
  });

  if (!cobranca.ok || !cobranca.cobranca) {
    return NextResponse.json({ sucesso: false, erro: "falha na cobranca", passos });
  }

  // PASSO 4: Consultar status da cobranca recem-criada
  const consulta = await getPagamento(cobranca.cobranca.id);
  passos.push({
    passo: "4_consultar_pagamento",
    ok: consulta.ok,
    detalhe: consulta.ok
      ? { id: consulta.pagamento?.id, status: consulta.pagamento?.status }
      : consulta.erro,
  });

  // PASSO 5: TENTATIVA de transferencia PIX (so loga erro - nao executa em sandbox sem saldo)
  // Sandbox so tem saldo apos receber pagamento. Vai falhar com saldo insuficiente,
  // mas valida que o endpoint /transfers responde corretamente.
  const transferTeste = await transferirPix({
    valor: 0.50,
    chavePix: "teste@chamepegue.com.br",
    descricao: "TESTE - validacao endpoint transfers",
    externalReference: "teste-transfer-" + Date.now(),
  });
  passos.push({
    passo: "5_validar_endpoint_transfers",
    ok: transferTeste.ok,
    detalhe: transferTeste.ok
      ? { id: transferTeste.transfer?.id, status: transferTeste.transfer?.status }
      : { erro_esperado_se_sem_saldo: transferTeste.erro },
  });

  return NextResponse.json({
    sucesso: passos.slice(0, 3).every((p) => p.ok), // criticos sao 1-3
    asaas_funcionando: passos.slice(0, 3).every((p) => p.ok),
    link_checkout_pra_voce_testar: cobranca.cobranca?.invoiceUrl,
    pix_copia_cola_amostra: cobranca.pix?.payload?.slice(0, 80) + "...",
    passos,
    proximo_passo:
      passos.slice(0, 3).every((p) => p.ok)
        ? "Lib OK! Pode prosseguir com a integracao no fluxo do Pegue."
        : "Corrigir erros nos passos antes de continuar.",
  });
}
