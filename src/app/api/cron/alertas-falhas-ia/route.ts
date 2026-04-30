import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cron /api/cron/alertas-falhas-ia - roda a cada 10min (vercel.json).
// Conta ocorrencias de tipos de falha nos ultimos 30min e alerta admin
// quando passa do threshold. Cumpre regra OBSERVABILIDADE PRIORIDADE
// (camadas monitoramento + alerta proativo, nao so dashboard passivo).

const JANELA_MIN = 30;
const DEDUPE_MIN = 60; // nao re-alerta mesmo tipo por 1h apos primeiro alerta

interface RegraAlerta {
  tipo: string;
  threshold: number; // minimo ocorrencias na janela
  titulo: string;
  acao: string;
}

const REGRAS: RegraAlerta[] = [
  {
    tipo: "ia_contexto_falhou",
    threshold: 5,
    titulo: "🤖 *IA DE CONTEXTO FALHANDO*",
    acao: "Mais de 5 atendimentos em 30min com IA retornando null/baixa confianca. Verificar: chave OpenAI valida? Rate limit? Latencia OpenAI? /admin/dashboard pra ver detalhe.",
  },
  {
    tipo: "google_maps_link_falhou",
    threshold: 3,
    titulo: "🗺️ *GOOGLE MAPS LINK FALHANDO*",
    acao: "Mais de 3 clientes em 30min mandaram link Google Maps que sistema nao resolveu. Verificar resolverGoogleMapsLink/timeout/redirect.",
  },
  {
    tipo: "bairro_origem_nao_geocodou",
    threshold: 5,
    titulo: "📍 *BAIRRO ORIGEM NAO GEOCODA*",
    acao: "Mais de 5 atendimentos em 30min onde bairro+cidade da origem nao foi achado. Verificar Google Geocoder API/cota/quota.",
  },
  {
    tipo: "bairro_destino_nao_geocodou",
    threshold: 5,
    titulo: "📍 *BAIRRO DESTINO NAO GEOCODA*",
    acao: "Mais de 5 atendimentos em 30min onde bairro+cidade do destino nao foi achado.",
  },
  {
    tipo: "distancia_anomala_detectada",
    threshold: 1, // QUALQUER ocorrencia = sinal de geocoder ambiguo
    titulo: "🚨 *DISTANCIA ANOMALA DETECTADA (>100km)*",
    acao: "Geocoder pode ter pegue cidade errada (ex: Pompeia capital virou Pompeia interior). Cliente recebeu confirmacao pra editar mas vale auditar bot_logs tipo='distancia_anomala_detectada' pra ajustar prompt da IA / heuristicas.",
  },
  {
    tipo: "guincho_destino_sem_coords",
    threshold: 3,
    titulo: "🚗 *GUINCHO COM DESTINO SEM COORDS*",
    acao: "3+ guinchos em 30min cotados sem coords precisas do destino. Risco de cobrar errado por distancia. Auditar bot_logs.",
  },
  {
    tipo: "step_desconhecido",
    threshold: 1, // qualquer ocorrencia eh bug
    titulo: "🐛 *STEP DESCONHECIDO NO BOT*",
    acao: "Sessao caiu em default do switch. Bug critico. Auditar bot_logs payload->>step pra identificar qual step nao tem case.",
  },
  {
    tipo: "dispatch_zero_fretistas_compativeis",
    threshold: 3,
    titulo: "🚛 *DISPATCH ZERO FRETISTAS — frota incompativel*",
    acao: "3+ corridas em 30min cotaram veiculo sem fretista cadastrado/disponivel. Cliente recebeu 'nenhum fretista' e abandonou. Verificar /admin/prestadores: a frota cobre os tipos cotados? Considerar cadastrar fretista do tipo faltante OU revisar sugerirVeiculoPorVolumePeso.",
  },
  {
    tipo: "humano_assumiu_atendimento",
    threshold: 10,
    titulo: "👥 *MUITAS ESCALACOES HUMANAS*",
    acao: "10+ atendimentos em 30min escalaram pra humano (FromMe=true). Pode indicar IA com confianca baixa, fluxo travando, ou pico de demanda. Auditar bot_logs e considerar reforco temporario.",
  },
];

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const agora = new Date();
  const janelaInicio = new Date(agora.getTime() - JANELA_MIN * 60 * 1000);
  const dedupeInicio = new Date(agora.getTime() - DEDUPE_MIN * 60 * 1000);

  const resultados: { tipo: string; count: number; alertou: boolean; motivo?: string }[] = [];

  for (const regra of REGRAS) {
    // Conta ocorrencias do tipo na janela
    const { count, error: errCount } = await supabase
      .from("bot_logs")
      .select("*", { count: "exact", head: true })
      .filter("payload->>tipo", "eq", regra.tipo)
      .gte("criado_em", janelaInicio.toISOString());

    if (errCount) {
      resultados.push({ tipo: regra.tipo, count: 0, alertou: false, motivo: `erro_count: ${errCount.message}` });
      continue;
    }

    const ocorrencias = count || 0;
    if (ocorrencias < regra.threshold) {
      resultados.push({ tipo: regra.tipo, count: ocorrencias, alertou: false, motivo: "abaixo_threshold" });
      continue;
    }

    // Dedupe: ja alertou esse tipo na ultima 1h?
    const { count: alertasRecentes } = await supabase
      .from("bot_logs")
      .select("*", { count: "exact", head: true })
      .filter("payload->>tipo", "eq", "alerta_falha_ia_enviado")
      .filter("payload->>regra_tipo", "eq", regra.tipo)
      .gte("criado_em", dedupeInicio.toISOString());

    if ((alertasRecentes || 0) > 0) {
      resultados.push({ tipo: regra.tipo, count: ocorrencias, alertou: false, motivo: "dedupe_1h" });
      continue;
    }

    // Alerta admin
    await notificarAdmins(
      regra.titulo,
      "Sistema",
      `${ocorrencias} ocorrencias nos ultimos ${JANELA_MIN}min.\n\n${regra.acao}`
    );

    // Marca que alertou pra dedupe
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "alerta_falha_ia_enviado",
        regra_tipo: regra.tipo,
        ocorrencias,
        janela_min: JANELA_MIN,
      },
    });

    resultados.push({ tipo: regra.tipo, count: ocorrencias, alertou: true });
  }

  return NextResponse.json({
    status: "ok",
    janela_min: JANELA_MIN,
    resultados,
  });
}
