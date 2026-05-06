// IMUNI plugin Pegue — checks de DETECCAO DE ANOMALIA (Onda 8).
//
// 6/Mai/2026. Diferenca pras ondas anteriores: aqui as sentinelas
// nao olham estados absolutos ("tabela X tem Y", "step Z preso") —
// elas detectam DESVIOS de padrao normal (clusters, picos, taxas
// crescentes). Sao o equivalente a "alguma coisa esta diferente do
// normal hoje" — pode ser regressao de deploy, mudanca de comportamento
// de cliente, integracao externa instavel.
//
// Filosofia: estabelecer baseline e detectar quando realidade diverge
// significativamente.

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import type { ResultadoInvariante } from "@/lib/imuni/types";

function hAtras(horas: number): string {
  return new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
}

/**
 * INV-47 (ALTA): Cluster de clientes travados no MESMO step nas ultimas 2h.
 * Detecta regressao especifica — quando um deploy quebra um step e
 * varios clientes caem nele.
 *
 * Cenario alvo: deploy mexeu em handleLocalizacao, agora todo cliente
 * travando em aguardando_localizacao. Diferente de INV-30 que detecta
 * presos em geral — esta detecta CONCENTRACAO no mesmo step (sinal de
 * bug sistematico, nao caso isolado).
 *
 * Threshold: >=3 clientes presos no MESMO step em 2h = cluster.
 */
export async function invClusterPresoMesmoStep(): Promise<ResultadoInvariante> {
  try {
    const desde2h = hAtras(2);
    const min30 = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("bot_sessions")
      .select("phone, step, atualizado_em")
      .lt("atualizado_em", min30)
      .gte("atualizado_em", desde2h);
    if (error) throw error;

    // Agrupa por step
    const porStep = new Map<string, number>();
    for (const s of data || []) {
      const step = (s.step as string) || "(sem step)";
      porStep.set(step, (porStep.get(step) || 0) + 1);
    }

    const clusters = Array.from(porStep.entries()).filter(([, count]) => count >= 3);

    return {
      nome: "INV-47",
      descricao: "Cluster: >=3 clientes travados no MESMO step nas ultimas 2h (regressao?)",
      severidade: "alta",
      count: clusters.length,
      amostra: clusters.slice(0, 5).map(([step, count]) => ({
        step,
        clientes_travados: count,
      })),
      ok: clusters.length === 0,
      comoAgir:
        "Concentracao anormal de clientes no mesmo step indica regressao sistematica — provavelmente deploy recente quebrou algo nesse handler. ACAO: 1) git log do dia pra ver o que mudou nesse step; 2) revisar logs do step pra ver a falha real; 3) se nao consegue corrigir em 15min, ROLLBACK do ultimo commit.",
    };
  } catch (e: any) {
    return { nome: "INV-47", descricao: "cluster_preso_mesmo_step", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando bot_sessions" };
  }
}

/**
 * INV-48 (ALTA): Pico de origem_nao_identificada nas ultimas 6h vs media
 * historica. Indica regressao em geocoder/parser de endereco OU
 * integracao externa (Nominatim, Google) com problema.
 *
 * Calculo:
 *   - taxaAtual = origem_nao_identificada nas ultimas 6h
 *   - taxaBaseline = media das origem_nao_identificada por janela de 6h
 *     nos ultimos 7 dias (excluindo as ultimas 6h)
 *   - se taxaAtual > 3x taxaBaseline = pico
 *
 * Threshold: tem que ter pelo menos 5 falhas nas ultimas 6h pra acionar
 * (evita falso positivo em volume baixo).
 */
export async function invPicoOrigemNaoIdentificada(): Promise<ResultadoInvariante> {
  try {
    const agora = Date.now();
    const desde6h = new Date(agora - 6 * 60 * 60 * 1000).toISOString();
    const desde7d = new Date(agora - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fim6hAtras = desde6h;

    // Falhas nas ultimas 6h
    const { count: atual } = await supabase
      .from("bot_logs")
      .select("id", { count: "exact", head: true })
      .filter("payload->>tipo", "eq", "origem_nao_identificada")
      .gte("criado_em", desde6h);

    if ((atual || 0) < 5) {
      return { nome: "INV-48", descricao: "pico_origem_nao_identificada", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    // Falhas nos 7d anteriores (excluindo ultimas 6h)
    const { count: historico7d } = await supabase
      .from("bot_logs")
      .select("id", { count: "exact", head: true })
      .filter("payload->>tipo", "eq", "origem_nao_identificada")
      .gte("criado_em", desde7d)
      .lt("criado_em", fim6hAtras);

    // Media por janela de 6h: total 7d / 28 janelas (7d * 4 janelas/dia)
    const baselineMediaPor6h = (historico7d || 0) / 28;

    if (baselineMediaPor6h < 1) {
      // Volume historico insuficiente pra estabelecer baseline confiavel
      return { nome: "INV-48", descricao: "pico_origem_nao_identificada", severidade: "alta", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    const ratio = (atual || 0) / baselineMediaPor6h;
    const ehPico = ratio >= 3;

    return {
      nome: "INV-48",
      descricao: ehPico
        ? `Pico de falhas de geocoder: ${atual} nas ult 6h vs media ${baselineMediaPor6h.toFixed(1)}/6h (${ratio.toFixed(1)}x)`
        : "geocoder ok (sem pico anormal)",
      severidade: "alta",
      count: ehPico ? 1 : 0,
      amostra: ehPico
        ? [{
            falhas_ultimas_6h: atual,
            media_baseline_7d_por_6h: Math.round(baselineMediaPor6h * 10) / 10,
            ratio: `${ratio.toFixed(1)}x`,
          }]
        : [],
      ok: !ehPico,
      comoAgir:
        "Pico anormal de geocoder falhando = Nominatim/Google instavel OU regressao em handleLocalizacao. ACAO: 1) testar geocoder manualmente (curl Nominatim); 2) checar status Google Maps; 3) ver bot_logs origem_nao_identificada pra ver se eh padrao especifico (cliente mandando link Google Maps que nao abre, etc); 4) se for integracao externa, ativar fallback geocoder secundario.",
    };
  } catch (e: any) {
    return { nome: "INV-48", descricao: "pico_origem_nao_identificada", severidade: "alta", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando bot_logs" };
  }
}

/**
 * INV-49 (MEDIA): Taxa de cotacoes "Material (foto)" generico nas
 * ultimas 6h alta. Indica IA Vision falhando — OPENAI_API_KEY
 * revogada/expirada, modelo retornando vazio, prompt regredindo.
 *
 * Bug real 25/Abr/2026: chave revogada -> 16 fotos teste viraram
 * "Material (foto)" sem alerta. Esta sentinela teria pegado.
 */
export async function invIaVisionFalhandoMuito(): Promise<ResultadoInvariante> {
  try {
    const desde6h = hAtras(6);

    // Conta vision_fallback_material_foto e vision_falhou
    const { count: falhas } = await supabase
      .from("bot_logs")
      .select("id", { count: "exact", head: true })
      .or("payload->>tipo.eq.vision_fallback_material_foto,payload->>tipo.eq.vision_falhou,payload->>tipo.eq.vision_json_invalido")
      .gte("criado_em", desde6h);

    // Conta vision_sucesso pra calcular taxa
    const { count: sucessos } = await supabase
      .from("bot_logs")
      .select("id", { count: "exact", head: true })
      .filter("payload->>tipo", "eq", "vision_sucesso")
      .gte("criado_em", desde6h);

    const total = (falhas || 0) + (sucessos || 0);
    if (total < 5) {
      // Volume baixo — nao alarma
      return { nome: "INV-49", descricao: "ia_vision_falhando", severidade: "media", count: 0, amostra: [], ok: true, comoAgir: "" };
    }

    const taxaFalha = ((falhas || 0) / total) * 100;
    const ehProblema = taxaFalha >= 30; // 30% de falhas em 6h = sistemico

    return {
      nome: "INV-49",
      descricao: ehProblema
        ? `IA Vision com taxa de falha alta: ${Math.round(taxaFalha)}% nas ultimas 6h (${falhas}/${total})`
        : "IA Vision com taxa de falha normal",
      severidade: "media",
      count: ehProblema ? 1 : 0,
      amostra: ehProblema
        ? [{
            falhas_6h: falhas,
            sucessos_6h: sucessos,
            taxa_falha_pct: Math.round(taxaFalha),
          }]
        : [],
      ok: !ehProblema,
      comoAgir:
        "IA Vision (gpt-4o-mini) com taxa de falha alta. Causas comuns: 1) OPENAI_API_KEY revogada/expirada (Vercel + .env.local) — bug 25/Abr; 2) saldo OpenAI zerado; 3) modelo retornando JSON invalido (mudanca da API); 4) prompts regrediram. ACAO: testar com curl direto pra OpenAI + verificar dashboard de uso/saldo.",
    };
  } catch (e: any) {
    return { nome: "INV-49", descricao: "ia_vision_falhando", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando bot_logs" };
  }
}

/**
 * INV-50 (MEDIA): Aumento sistematico de bot caindo em fallback
 * "default step desconhecido" nas ultimas 24h. Indica que cliente
 * mandou algo que nenhum handler reconheceu — ou parser perdeu sintaxe
 * comum, ou cliente esta tentando coisa que sistema nao prevê.
 *
 * Threshold: >=10 ocorrencias em 24h = vale revisar amostras.
 */
export async function invDefaultStepDesconhecido(): Promise<ResultadoInvariante> {
  try {
    const desde24h = hAtras(24);

    const { data, error } = await supabase
      .from("bot_logs")
      .select("payload, criado_em")
      .filter("payload->>tipo", "eq", "step_desconhecido")
      .gte("criado_em", desde24h)
      .order("criado_em", { ascending: false })
      .limit(20);
    if (error) throw error;

    const total = data?.length || 0;
    const ehProblema = total >= 10;

    // Agrupa por step pra ver onde mais caiu
    const porStep = new Map<string, number>();
    for (const log of data || []) {
      const step = (log.payload as any)?.step || "(unknown)";
      porStep.set(step, (porStep.get(step) || 0) + 1);
    }

    return {
      nome: "INV-50",
      descricao: ehProblema
        ? `${total} mensagens caem em step_desconhecido nas ultimas 24h (handler ausente?)`
        : "default fallback ok",
      severidade: "media",
      count: ehProblema ? total : 0,
      amostra: ehProblema
        ? Array.from(porStep.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([step, count]) => ({ step, ocorrencias: count }))
        : [],
      ok: !ehProblema,
      comoAgir:
        "Volume alto de mensagens caindo em handler default. Indica: 1) cliente mandando coisa nova que sistema nao prevê; 2) bug que joga sessao em step invalido; 3) cliente em step de coleta tentando comando (cancelar, ajuda) que nao tem branch nesse step. ACAO: amostrar 5 logs de step_desconhecido, ver mensagem original, decidir se vira handler ou se mensagem padrao melhor.",
    };
  } catch (e: any) {
    return { nome: "INV-50", descricao: "default_step_desconhecido", severidade: "media", count: 0, amostra: [], ok: false, erro: e?.message, comoAgir: "Erro consultando bot_logs" };
  }
}
