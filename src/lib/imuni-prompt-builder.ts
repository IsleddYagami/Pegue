// Gerador de prompts prontos pra Claude Code corrigir bugs detectados pelo IMUNI.
//
// Filosofia: a IMUNI nao soh DETECTA erros — ela DESCREVE o erro de forma que
// um humano (Fabio) possa copiar e colar direto pro Claude e o Claude tenha
// CONTEXTO COMPLETO pra corrigir sem precisar de back-and-forth.
//
// Cada prompt deve ter:
// 1. Sintoma observavel (o que quebrou)
// 2. Estado esperado vs obtido
// 3. Logs/evidencias relevantes
// 4. Hipotese de causa raiz (arquivo:linha provavel)
// 5. Acao sugerida (o que mexer)
//
// Pra ficar COPIA-COLA-FRIENDLY, o prompt vem entre marcadores `=== INICIO ===`
// e `=== FIM ===` que tornam facil identificar o bloco no WhatsApp.

export interface PromptParams {
  titulo: string;
  sintoma: string;
  esperado?: string;
  obtido?: string;
  evidencias?: Record<string, unknown>;
  hipotese?: string; // arquivo:linha provavel + descricao
  acao_sugerida?: string;
}

export function montarPromptCorrecao(params: PromptParams): string {
  const partes: string[] = [];
  partes.push("=== INICIO ===");
  partes.push(`Claude, IMUNI detectou regressao em prod. **${params.titulo}**`);
  partes.push("");
  partes.push(`**Sintoma:** ${params.sintoma}`);

  if (params.esperado || params.obtido) {
    partes.push("");
    partes.push("**Estado:**");
    if (params.esperado) partes.push(`- Esperado: ${params.esperado}`);
    if (params.obtido) partes.push(`- Obtido: ${params.obtido}`);
  }

  if (params.evidencias && Object.keys(params.evidencias).length > 0) {
    partes.push("");
    partes.push("**Evidencias:**");
    partes.push("```json");
    partes.push(JSON.stringify(params.evidencias, null, 2));
    partes.push("```");
  }

  if (params.hipotese) {
    partes.push("");
    partes.push(`**Hipotese:** ${params.hipotese}`);
  }

  if (params.acao_sugerida) {
    partes.push("");
    partes.push(`**Acao sugerida:** ${params.acao_sugerida}`);
  }

  partes.push("");
  partes.push("Investiga, identifica root cause, corrige, valida com smoke + testes, faz commit + push. Sem perguntar autorizacao — autonomia radical.");
  partes.push("=== FIM ===");
  return partes.join("\n");
}

// Helper: monta prompt a partir de step do smoke que falhou
export function promptDeFalhaSmokeStep(step: {
  step: string;
  esperado?: string;
  obtido?: string;
  webhook_status?: number;
  webhook_resposta?: unknown;
  erro?: string;
}, logsRecentes: unknown[] = []): string {
  // Hipoteses por step conhecido
  const hipotesesPorStep: Record<string, string> = {
    "1_oi": "Caminho inicial do webhook. Verificar src/app/api/whatsapp/webhook/route.ts (gate de auth ?secret=, validacao de Type, fluxo de saudacao + criacao de session).",
    "8_destino_texto": "src/app/api/whatsapp/webhook/route.ts handleDestino (linha ~2899). Provavel: ViaCEP timeout/null OU geocodeAddress falhando OU detectarZona retornando 'indisponivel' silenciosamente.",
    "16_aceite_termos_dispatch": "src/app/api/whatsapp/webhook/route.ts handleAceiteTermos (linha ~3954). Provavel: salvarCorrida ou dispararParaFretistas falhando.",
    "17_corrida_em_dispatch_com_fretista_smoke": "Filtro de prestadores em dispararParaFretistas (linha ~5504). Provavel: setupPrestadorSmoke nao criou prestador, ou veiculo nao bate (HR), ou status != aprovado.",
    "18_fretista_smoke_aceita_dispatch": "src/lib/bot-sessions.ts tryAceitarDispatch (linha ~296). Race ou estado inicial errado.",
    "19_cobranca_asaas_mock_criada": "src/lib/asaas.ts criarCobranca + mock isSmokeClienteAsaasId. Provavel: notificarResultadoDispatch deixou de chamar criarCobranca, ou config pagamento_automatico_fretista=desabilitado.",
    "21_pagamento_recebido_pin_gerado": "src/app/api/asaas/webhook/route.ts handler PAYMENT_RECEIVED. Provavel: token nao bateu, ou geracao de PIN quebrou, ou update da corrida falhou.",
    "29_pin_validado_corrida_concluida": "src/app/api/whatsapp/webhook/route.ts handleFretistaPinEntrega (linha ~6763). Provavel: validarPinEntrega falhando, ou handleConfirmacaoEntrega nao concluindo.",
  };
  const hipotese = hipotesesPorStep[step.step]
    || "Buscar handler correspondente em src/app/api/whatsapp/webhook/route.ts ou src/lib/. Cross-reference o step name com handlers (case 'X' no switch).";

  const evidencias: Record<string, unknown> = {
    step: step.step,
    webhook_status: step.webhook_status,
    erro: step.erro,
  };
  if (step.webhook_resposta) evidencias.webhook_resposta = step.webhook_resposta;
  if (logsRecentes.length > 0) evidencias.bot_logs_relevantes = logsRecentes.slice(0, 5);

  return montarPromptCorrecao({
    titulo: `Smoke E2E v6 falhou no step \`${step.step}\``,
    sintoma: `Smoke automatico (4x/dia em prod) detectou regressao no fluxo cliente real.`,
    esperado: step.esperado,
    obtido: step.obtido,
    evidencias,
    hipotese,
    acao_sugerida: `Rodar curl manual pro smoke: \`curl https://www.chamepegue.com.br/api/cron/imuni-smoke-e2e?key=CRON_SECRET\` pra reproduzir. Investigar bot_logs do phone smoke 5500000000001. Corrigir handler em hipotese acima.`,
  });
}

// Helper: prompt pra cliente real travado em step zumbi
export function promptDeClienteTravado(params: {
  phone: string;
  step: string;
  ultima_atividade_iso: string;
  horas_parado: number;
  amostra_conversas?: string[];
}): string {
  return montarPromptCorrecao({
    titulo: `Cliente real ${params.phone} travado em \`${params.step}\` ha ${params.horas_parado.toFixed(1)}h`,
    sintoma: `Cliente real iniciou atendimento mas ficou parado em step zumbi sem progredir. Pode ser bug recorrente que afeta outros clientes silenciosamente.`,
    esperado: "Cliente avanca pelo fluxo (step muda dentro de minutos)",
    obtido: `Step parado em ${params.step} desde ${params.ultima_atividade_iso}`,
    evidencias: {
      phone: params.phone,
      step_atual: params.step,
      ultima_atividade: params.ultima_atividade_iso,
      amostra_msgs: params.amostra_conversas?.slice(0, 5),
    },
    hipotese: `Investigar via curl /api/admin-debug-cliente?key=KEY&phone=${params.phone} pra ver as msgs do cliente + bot_logs. Identificar PADRAO comum entre clientes travados.`,
    acao_sugerida: `Apos identificar root cause: corrigir handler responsavel + adicionar variante ao smoke pra detectar regressao no futuro + destravar este cliente via /api/admin-destravar-cliente?key=KEY&phone=${params.phone}.`,
  });
}

// Helper: prompt pra cluster de webhook_handler_error
export function promptDeHandlerError(params: {
  qtd_ocorrencias: number;
  janela_horas: number;
  amostras: { erro: string; mensagem?: string; stack?: string; phone_masked?: string; ts: string }[];
}): string {
  return montarPromptCorrecao({
    titulo: `${params.qtd_ocorrencias}x \`webhook_handler_error\` nas ultimas ${params.janela_horas}h`,
    sintoma: `Exception sendo lancada em handleClienteMessage no webhook. Cliente real impactado (step trava silenciosamente).`,
    evidencias: {
      qtd: params.qtd_ocorrencias,
      janela_horas: params.janela_horas,
      amostras: params.amostras.slice(0, 3),
    },
    hipotese: "Olhar stack trace nas amostras pra identificar arquivo:linha. Erro mais comum: import dinamico falhando, query Supabase com coluna inexistente, OpenAI/Asaas/ChatPro timeout.",
    acao_sugerida: "Reproduzir o erro localmente (vitest com mock do payload similar). Corrigir o handler especifico. Cobrir com sentinela IMUNI ou variante de smoke pra evitar recorrencia.",
  });
}
