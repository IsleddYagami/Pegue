// IMUNI plugin Pegue — checks de FLUXO DE EXECUCAO (cotacao -> entrega).
//
// Categoria adicionada 5/Mai/2026 (Onda 4a do refino IMUNI). Cobre os
// estagios CENTRAIS do fluxo do cliente:
//   cotacao -> confirmacao -> cobranca Asaas -> pagamento -> dispatch
//   -> aceite fretista -> coleta -> transito -> entrega -> conclusao.
//
// Razao (Fabio 5/Mai/2026): "o fluxo da pegue no whatsapp é o coração
// da empresa, ele é o primordial que deve funcionar com a menor chance
// de erro possivel". Sentinelas anteriores cobriam estado financeiro
// (corridas concluidas sem pagamento etc) — essas cobrem GARGALOS
// no caminho ate a conclusao.
//
// Filosofia: cada sentinela mira UM estagio onde cliente pode ficar
// preso silenciosamente. Diferenca pra Onda 2 (fluxo de venda):
// Onda 2 olha INCONSISTENCIA (valor pago != cotado). Onda 4a olha
// PROGRESSAO (cliente avancou ou ficou parado).

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import type { ResultadoInvariante } from "@/lib/imuni/types";

function hAtras(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

function minAtras(minutos: number): string {
  return new Date(Date.now() - minutos * 60 * 1000).toISOString();
}

// Limite empirico: corrida acima disso eh outlier suspeito (frete tipico
// vai de R$ 30 a R$ 600; mudanca grande pode chegar em R$ 1500-2000;
// guincho longa distancia ate R$ 2000). Acima de R$ 5000 sugere bug
// de calculo (multiplicador errado, distancia em metros vs km).
const VALOR_MAX_RAZOAVEL = 5000;
const VALOR_MIN_RAZOAVEL = 5; // abaixo disso seguramente eh bug

/**
 * INV-32 (ALTA): Corrida criada com valor_estimado fora da faixa razoavel
 * (zerado, negativo, ou absurdamente alto). Cobranca vai ser feita com
 * esse valor errado.
 *
 * Cenario alvo: bug aritmetico no calculo (distancia em metros em vez
 * de km, multiplicador errado, dados de tabela_precos corrompidos).
 * Regressao pos-deploy de calcularPrecos.
 *
 * Severidade: ALTA. Cliente cobrado errado = reclamacao + chargeback.
 */
export async function invCorridaValorAbsurdo(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("corridas")
      .select("id, codigo, valor_estimado, valor_final, status, criado_em")
      .neq("status", "cancelada")
      .gte("criado_em", hAtras(24 * 7));
    if (error) throw error;

    const violacoes = (data || []).filter((c) => {
      const v = Number(c.valor_estimado || 0);
      return v < VALOR_MIN_RAZOAVEL || v > VALOR_MAX_RAZOAVEL;
    });

    return {
      nome: "INV-32",
      descricao: "Corridas (ult 7d, nao canceladas) com valor_estimado fora da faixa razoavel (R$ 5 a R$ 5000)",
      severidade: "alta",
      count: violacoes.length,
      amostra: violacoes.slice(0, 5).map((c) => ({
        codigo: c.codigo,
        valor_estimado: Number(c.valor_estimado),
        valor_final: Number(c.valor_final),
        status: c.status,
        criado_em: c.criado_em,
      })),
      ok: violacoes.length === 0,
      comoAgir:
        "Corrida cobrada com valor fora da realidade. Causas comuns: 1) bug aritmetico em calcularPrecos (distancia em m vs km); 2) tabela_precos com numero errado pos-edicao admin; 3) multiplicador absurdo (ex: ajudante x10). Auditar calcularPrecos com fixtures historicas. Se ja cobrou cliente: estornar e refazer cotacao.",
    };
  } catch (e: any) {
    return { nome: "INV-32", descricao: "corrida_valor_absurdo", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando corridas" };
  }
}

/**
 * INV-33 (ALTA): Corrida com asaas_payment_id (cobranca gerada) mas
 * status ainda 'pendente' apos >24h. Cliente nao pagou e ninguem
 * cancelou — corrida zumbi consumindo slot.
 *
 * Cenario alvo: cliente recebeu link, abandonou. Sistema nao expira
 * automaticamente. Sem auto-clean, banco enche de corridas mortas.
 * Tambem indica que webhook de PAYMENT_OVERDUE do Asaas nao esta
 * disparando ou nao esta tratado.
 *
 * Severidade: ALTA. UX ruim (cliente que volta vê pendencia velha) +
 * acumulo no banco.
 */
export async function invCorridaPendenteSemPagamento(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("corridas")
      .select("id, codigo, asaas_payment_id, status, criado_em, valor_estimado")
      .eq("status", "pendente")
      .not("asaas_payment_id", "is", null)
      .lt("criado_em", hAtras(24));
    if (error) throw error;

    return {
      nome: "INV-33",
      descricao: "Corridas pendentes ha >24h com cobranca Asaas gerada mas pagamento nao veio",
      severidade: "alta",
      count: data?.length || 0,
      amostra: (data || []).slice(0, 5).map((c) => ({
        codigo: c.codigo,
        asaas_payment_id: c.asaas_payment_id,
        valor: Number(c.valor_estimado),
        criado_em: c.criado_em,
        horas_pendente: Math.round((Date.now() - new Date(c.criado_em as string).getTime()) / 3600000),
      })),
      ok: !data || data.length === 0,
      comoAgir:
        "Cliente recebeu link de pagamento mas nao pagou. Acoes: 1) verificar se webhook PAYMENT_OVERDUE do Asaas esta sendo recebido (status: GET /api/asaas/webhook); 2) consultar Asaas direto se cobranca expirou; 3) implementar cron de cancelamento automatico (>48h sem pagar = expirar e liberar cliente pra refazer cotacao); 4) tentar reengajar cliente com mensagem 'seu link expira em X horas, ainda quer fechar?'",
    };
  } catch (e: any) {
    return { nome: "INV-33", descricao: "corrida_pendente_sem_pagamento", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando corridas" };
  }
}

/**
 * INV-34 (ALTA): Corrida com status='paga' ha >5min sem prestador_id
 * (dispatch nao disparou OU ninguem aceitou).
 *
 * Cenario alvo: pagamento confirmado, sistema deveria disparar dispatch
 * pra fretistas em ordem de proximidade. Se ninguem responde em 5min,
 * cliente pagou e está esperando sem ninguem indo. Critico.
 *
 * Diferenca pra INV-4 (dispatch zumbi): INV-4 olha estado interno do
 * dispatch (registro existe, ativo=true, sem aceite). Esta olha do
 * ponto de vista do CLIENTE (paguei, cade meu fretista?).
 *
 * Severidade: ALTA. Cliente pagou e esta esperando.
 */
export async function invPagaSemDispatchAceito(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("corridas")
      .select("id, codigo, status, prestador_id, criado_em, atualizado_em, valor_final, dispatch_ativo")
      .eq("status", "paga")
      .is("prestador_id", null)
      .lt("atualizado_em", minAtras(5))
      .gte("atualizado_em", hAtras(48));
    if (error) throw error;

    return {
      nome: "INV-34",
      descricao: "Corridas pagas ha >5min sem prestador aceito (cliente pagou e ninguem foi)",
      severidade: "alta",
      count: data?.length || 0,
      amostra: (data || []).slice(0, 5).map((c: any) => ({
        codigo: c.codigo,
        valor_final: Number(c.valor_final),
        atualizado_em: c.atualizado_em,
        dispatch_ativo: c.dispatch_ativo,
        minutos_aguardando: Math.round((Date.now() - new Date(c.atualizado_em).getTime()) / 60000),
      })),
      ok: !data || data.length === 0,
      comoAgir:
        "Cliente pagou e esta esperando alguem ir. Causas: 1) dispatch nao foi disparado pos-pagamento (verificar webhook Asaas + handler PAYMENT_RECEIVED); 2) zero fretistas disponiveis na regiao (ver bot_logs alerta_zero_fretistas); 3) fretistas viram a oferta e ignoraram (precos baixos? regiao indesejada?); 4) bug em createDispatch. ACAO IMEDIATA: ligar pro cliente avisando atraso + cotar manualmente um fretista pra ir.",
    };
  } catch (e: any) {
    return { nome: "INV-34", descricao: "paga_sem_dispatch_aceito", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando corridas" };
  }
}

/**
 * INV-35 (MEDIA): Corrida 'aceita' ha >2h sem virar 'concluida'.
 * Frete em andamento eterno — fretista sumiu OU coleta/entrega travou.
 *
 * Cenario alvo: fretista aceitou mas algo deu errado: cliente nao
 * estava no local, fretista perdeu sinal, alguem desistiu sem cancelar
 * formalmente. Cliente paga e nao recebe.
 *
 * Excecoes legitimas:
 *   - Frete agendado pra horas depois do aceite (campo periodo)
 *   - Frete super longo (Osasco -> interior 200km, pode levar 4h)
 *
 * Severidade: media. Maioria dos casos eh fluxo lento legitimo.
 */
export async function invAceitaSemConclusao(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("corridas")
      .select("id, codigo, status, atualizado_em, distancia_km, periodo")
      .eq("status", "aceita")
      .lt("atualizado_em", hAtras(2))
      .gte("atualizado_em", hAtras(48));
    if (error) throw error;

    // Filtra excecoes: distancia >= 100km (4h razoavel)
    const violacoes = (data || []).filter((c: any) => {
      const distancia = Number(c.distancia_km || 0);
      // Frete >100km pode legitimamente levar >4h (interior, transito SP)
      if (distancia >= 100) return false;
      return true;
    });

    return {
      nome: "INV-35",
      descricao: "Corridas aceitas ha >2h ainda nao concluidas (frete eterno, fretista sumiu?)",
      severidade: "media",
      count: violacoes.length,
      amostra: violacoes.slice(0, 5).map((c: any) => ({
        codigo: c.codigo,
        distancia_km: Number(c.distancia_km),
        atualizado_em: c.atualizado_em,
        horas_em_andamento: Math.round((Date.now() - new Date(c.atualizado_em).getTime()) / 3600000),
      })),
      ok: violacoes.length === 0,
      comoAgir:
        "Frete aceito ha muito tempo sem conclusao. Causas: 1) cliente nao estava no local (criar ocorrencia + reagendar); 2) fretista sumiu (verificar GPS em rastreio_localizacoes); 3) PIN errado bloqueou coleta (ver bot_logs); 4) fretista esqueceu de digitar ENTREGUEI. ACAO: ligar pro fretista perguntando status. Se nao atender, cancelar e re-dispatch + estornar.",
    };
  } catch (e: any) {
    return { nome: "INV-35", descricao: "aceita_sem_conclusao", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando corridas" };
  }
}
