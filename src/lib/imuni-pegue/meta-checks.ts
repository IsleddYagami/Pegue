// IMUNI plugin Pegue — checks META (IMUNI vigiando IMUNI).
//
// Categoria adicionada 4/Mai/2026 (Onda 1 do refino IMUNI). Razao:
// regras "banco" e "infra" cuidam do CORPO. Falta uma camada que
// cuide da PROPRIA IMUNI — quem vigia o vigia? Sem isso, se o cron
// /api/cron/auditar-invariantes parar (cron-job.org cair, env var
// CRON_SECRET sumir, deploy quebrar a rota), IMUNI fica cega e
// ninguem percebe — dashboard continua mostrando "saudavel" porque
// o calculo de score usa "AO VIVO" via /admin/imuni quando alguem
// abre, e historico continua mostrando as ultimas execucoes (que
// agora podem ser de dias atras).
//
// Filosofia (audit 4/Mai com Fabio): "provas reais e nao maquiagem"
// → IMUNI tem que provar que ESTA viva, nao so afirmar.

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import type { ResultadoInvariante } from "@/lib/imuni/types";

// Janela de tolerancia: cron normal roda 1x/dia (07:00 BRT). 25h da
// 1h de margem pra atraso de cron-job.org sem disparar falso positivo.
// Se passar 25h, eh sinal forte de cron parado — admin precisa investigar.
const TOLERANCIA_CRON_MS = 25 * 60 * 60 * 1000;

// Janela self-test alertador: cron de canario roda 1x/semana. 8 dias
// (~1 dia de margem) antes de disparar.
const TOLERANCIA_SELF_TEST_MS = 8 * 24 * 60 * 60 * 1000;

/**
 * INV-22 (ALTA): WATCHDOG do proprio cron de invariantes.
 *
 * Le bot_logs ordenando por criado_em desc, pega a execucao mais recente
 * de tipo=auditoria_invariantes_executada. Se a ultima foi ha mais de 25h,
 * o cron parou — IMUNI esta cega.
 *
 * Auto-referencia segura: essa invariante roda DENTRO do cron auditar-
 * invariantes via runner. O log da execucao em curso so eh inserido
 * DEPOIS de executarPlugin retornar (ver auditar-invariantes/route.ts
 * linha 38). Logo, quando INV-22 le bot_logs, a execucao atual ainda
 * nao esta la — vai pegar a anterior. Funciona corretamente em ambos
 * cenarios:
 *   - Cron rodando ha 24h: pega execucao de ontem (delta ~24h, ok)
 *   - Cron parou ha 3 dias: pega execucao de 3 dias atras (delta>25h, alerta)
 *   - Primeira execucao em ambiente novo: nao acha nada → ok=true
 *     (nao alarma quando ainda nao havia historico).
 *
 * IMPORTANTE: INV-22 nao acessa o log da execucao atual; depende SOMENTE
 * do que ja foi persistido. Por isso eh fundamental que cleanup-bot-logs
 * preserve o tipo `auditoria_invariantes_executada` (feito em 4/Mai/2026).
 */
export async function invWatchdogCronAuditoria(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("bot_logs")
      .select("criado_em")
      .filter("payload->>tipo", "eq", "auditoria_invariantes_executada")
      .order("criado_em", { ascending: false })
      .limit(1);
    if (error) throw error;

    // Sem historico: provavel ambiente novo. Nao alarma.
    // INV-22 protege ambientes que ja rodaram pelo menos 1 vez.
    if (!data || data.length === 0) {
      return {
        nome: "INV-22",
        descricao: "Cron auditar-invariantes rodou pelo menos 1 vez nos ultimos 25h",
        severidade: "alta",
        count: 0,
        amostra: [],
        ok: true,
        comoAgir: "",
      };
    }

    const ultimo = data[0].criado_em as string;
    const deltaMs = Date.now() - new Date(ultimo).getTime();
    const deltaHoras = Math.floor(deltaMs / (60 * 60 * 1000));
    const cegaPor = deltaMs > TOLERANCIA_CRON_MS;

    return {
      nome: "INV-22",
      descricao:
        "Watchdog do proprio cron IMUNI: cron de invariantes deve ter rodado nas ultimas 25h",
      severidade: "alta",
      count: cegaPor ? 1 : 0,
      amostra: cegaPor
        ? [{ ultima_execucao: ultimo, ha_horas: deltaHoras, tolerancia_horas: 25 }]
        : [],
      ok: !cegaPor,
      comoAgir:
        "IMUNI esta cega — o cron auditar-invariantes nao roda ha mais de 25h. Verificar 1) cron-job.org se job esta ativo e nao falhou; 2) /api/cron/auditar-invariantes em https://www.chamepegue.com.br responde 200 com CRON_SECRET; 3) ENV var CRON_SECRET configurada na Vercel. Sem cron, todos os outros sentinelas nao rodam diariamente.",
    };
  } catch (e: any) {
    return {
      nome: "INV-22",
      descricao: "watchdog_cron_auditoria",
      severidade: "alta",
      count: 0,
      amostra: [],
      ok: false,
      erro: e?.message,
      comoAgir: "Erro ao consultar bot_logs (pode ser RLS/tabela). Investigar.",
    };
  }
}

/**
 * INV-23 (MEDIA): Self-test do alertador (canario semanal).
 *
 * Le bot_logs procurando por tipo=imuni_self_test_alertador inserido
 * pelo cron `/api/cron/imuni-self-test` (criado 4/Mai/2026). Se nao
 * houve canario nas ultimas 8 dias, o cron de canario parou — pode
 * indicar problema no agendamento OU no proprio enviador.
 *
 * Diferenca pra INV-22: INV-22 vigia o cron de invariantes (corpo
 * principal); INV-23 vigia o cron de self-test (canal de alerta).
 *
 * NOTA: este invariante NAO valida se admin recebeu de fato (isso
 * exige confirmacao humana). Vai entrar na Onda 1.5 junto com
 * "confirmacao de entrega de alerta com escalation". Por enquanto,
 * INV-23 prova somente que o cron de canario continua disparando.
 */
export async function invSelfTestAlertadorRecente(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("bot_logs")
      .select("criado_em")
      .filter("payload->>tipo", "eq", "imuni_self_test_alertador")
      .order("criado_em", { ascending: false })
      .limit(1);
    if (error) throw error;

    // Sem historico: cron de canario ainda nao foi configurado em cron-job.org.
    // Severidade media (informativo, nao critico) — alerta admin pra ativar.
    if (!data || data.length === 0) {
      return {
        nome: "INV-23",
        descricao: "Self-test do alertador IMUNI executou pelo menos 1 vez",
        severidade: "media",
        count: 1,
        amostra: [{ obs: "nenhum log imuni_self_test_alertador encontrado" }],
        ok: false,
        comoAgir:
          "Configurar cron-job.org pra chamar https://www.chamepegue.com.br/api/cron/imuni-self-test?key=CRON_SECRET com schedule semanal (0 8 * * 1 = segunda 08:00 BRT). Sem isso, IMUNI nao tem prova periodica de que canal de alerta funciona.",
      };
    }

    const ultimo = data[0].criado_em as string;
    const deltaMs = Date.now() - new Date(ultimo).getTime();
    const deltaDias = Math.floor(deltaMs / (24 * 60 * 60 * 1000));
    const atrasado = deltaMs > TOLERANCIA_SELF_TEST_MS;

    return {
      nome: "INV-23",
      descricao:
        "Cron de self-test do alertador IMUNI rodou nos ultimos 8 dias (canal de notificacao funciona)",
      severidade: "media",
      count: atrasado ? 1 : 0,
      amostra: atrasado ? [{ ultimo_self_test: ultimo, ha_dias: deltaDias }] : [],
      ok: !atrasado,
      comoAgir:
        "Cron imuni-self-test parou. Verificar agendamento em cron-job.org (segunda 08:00 BRT) e que rota /api/cron/imuni-self-test responde 200. Sem self-test, perdemos a prova periodica de que alertas chegam.",
    };
  } catch (e: any) {
    return {
      nome: "INV-23",
      descricao: "self_test_alertador",
      severidade: "media",
      count: 0,
      amostra: [],
      ok: false,
      erro: e?.message,
      comoAgir: "Erro ao consultar bot_logs.",
    };
  }
}

/**
 * INV-46 (ALTA): WATCHDOG do smoke E2E sintetico (Estagio 3 IMUNI).
 *
 * Le bot_logs procurando ultima execucao do smoke. Se passou de 8h
 * sem rodar OU rodou mas falhou, Estagio 3 da IMUNI esta cego —
 * regressao no fluxo do bot pode estar acontecendo sem ninguem ver.
 *
 * Frequencia esperada: 4x/dia (cada 6h). Tolerancia: 8h da 2h de
 * margem pra atraso de cron-job.org.
 *
 * Severidade: ALTA. Smoke E2E eh a unica prova continua de que o
 * fluxo do cliente funciona ponta-a-ponta.
 */
const TOLERANCIA_SMOKE_E2E_MS = 8 * 60 * 60 * 1000;

export async function invWatchdogSmokeE2E(): Promise<ResultadoInvariante> {
  try {
    const { data, error } = await supabase
      .from("bot_logs")
      .select("criado_em, payload")
      .or("payload->>tipo.eq.imuni_smoke_e2e_ok,payload->>tipo.eq.imuni_smoke_e2e_falhou")
      .order("criado_em", { ascending: false })
      .limit(1);
    if (error) throw error;

    if (!data || data.length === 0) {
      // Sem historico: cron talvez ainda nao tenha rodado nem 1x. Nao alarma.
      return {
        nome: "INV-46",
        descricao: "watchdog_smoke_e2e",
        severidade: "alta",
        count: 0,
        amostra: [],
        ok: true,
        comoAgir: "",
      };
    }

    const ultimo = data[0];
    const ultimoMs = new Date(ultimo.criado_em as string).getTime();
    const deltaMs = Date.now() - ultimoMs;
    const tipo = (ultimo.payload as any)?.tipo;
    const ehFalha = tipo === "imuni_smoke_e2e_falhou";
    const atrasado = deltaMs > TOLERANCIA_SMOKE_E2E_MS;

    if (!atrasado && !ehFalha) {
      return {
        nome: "INV-46",
        descricao: "Smoke E2E rodando ok (ultimas 8h)",
        severidade: "alta",
        count: 0,
        amostra: [],
        ok: true,
        comoAgir: "",
      };
    }

    return {
      nome: "INV-46",
      descricao: atrasado
        ? "Smoke E2E nao rodou nas ultimas 8h (cron parado?)"
        : "Smoke E2E rodou mas FALHOU (regressao no fluxo do bot)",
      severidade: "alta",
      count: 1,
      amostra: [
        {
          ultimo_em: ultimo.criado_em,
          ha_horas: Math.round(deltaMs / 3600000),
          status: ehFalha ? "FALHOU" : "OK_mas_atrasado",
          motivo_falha: ehFalha ? (ultimo.payload as any)?.motivo : null,
          steps_falhos: ehFalha ? (ultimo.payload as any)?.steps_falhos : null,
        },
      ],
      ok: false,
      comoAgir: atrasado
        ? "Cron imuni-smoke-e2e parou. Verificar cron-job.org agendamento (4x/dia) + rota /api/cron/imuni-smoke-e2e responde 200. Sem smoke, regressao de deploy chega ao cliente real."
        : "Smoke E2E detectou regressao no fluxo do bot. Olhar payload.detalhes do log mais recente pra ver qual step falhou. Deploy recente provavelmente quebrou — ROLLBACK pode ser necessario.",
    };
  } catch (e: any) {
    return {
      nome: "INV-46",
      descricao: "watchdog_smoke_e2e",
      severidade: "alta",
      count: 0,
      amostra: [],
      ok: false,
      erro: e?.message,
      comoAgir: "Erro consultando bot_logs",
    };
  }
}
