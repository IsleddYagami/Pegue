import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// SELF-HEALING — autocorrecao zero-custo de bugs conhecidos sem precisar de IA.
// Filosofia (Fabio 7/Mai/2026): R$0,15 por bug com Claude API e caro se sistema
// entrar em loop. Maioria dos bugs em prod sao padroes repetidos com fix pre-aprovado.
// Esses fixes rodam aqui sem chamar IA nem precisar Claude.
//
// Frequencia recomendada cron-job.org: a cada 30min (mesma do relatorio).
// URL: https://www.chamepegue.com.br/api/cron/imuni-self-heal?key=CRON_SECRET
//
// Cada heal eh idempotente: rodar varias vezes nao causa problema.

interface HealResult {
  acao: string;
  qtd_corrigida: number;
  detalhes?: unknown;
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const inicio = Date.now();
  const resultados: HealResult[] = [];

  // ============ HEAL 1: Locks orfaos (processing_locks > 30s) ============
  // TTL do lock e 15s no codigo. Locks com >30s = serverless crashou no
  // meio do processamento e nao liberou. DELETE pra liberar phone.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supAny: any = supabase;
    const expirado = new Date(Date.now() - 30_000).toISOString();
    const { data: locksOrfaos } = await supAny
      .from("processing_locks")
      .delete()
      .lt("acquired_at", expirado)
      .select("phone");
    resultados.push({
      acao: "liberar_locks_orfaos",
      qtd_corrigida: locksOrfaos?.length || 0,
      detalhes: { phones: (locksOrfaos || []).map((l: { phone: string }) => l.phone).slice(0, 5) },
    });
  } catch (e) {
    resultados.push({
      acao: "liberar_locks_orfaos",
      qtd_corrigida: 0,
      detalhes: { erro: e instanceof Error ? e.message : "tabela inexistente?" },
    });
  }

  // ============ HEAL 2: Sessoes zumbi >24h em steps abandonados ============
  // Cliente comecou cotacao e abandonou. Sessao fica em aguardando_localizacao
  // ou similar pra sempre. Reseta pra step="inicio" pra liberar caso volte.
  // NAO mexer em sessions concluidas/em-andamento (status=aceita, paga, etc).
  const stepsAbandonados = [
    "aguardando_servico",
    "aguardando_localizacao",
    "aguardando_foto",
    "aguardando_mais_fotos",
    "aguardando_destino",
    "confirmando_origem",
    "confirmando_destino",
    "confirmando_enderecos_ia",
    "aguardando_clarificacao_itens",
    "aguardando_outros_descricao",
    "aguardando_outros_quantidade",
    "aguardando_outros_dimensoes",
    "aguardando_outros_peso",
    "aguardando_tipo_local",
    "aguardando_andar",
    "aguardando_ajudante",
    "aguardando_data",
    "aguardando_horario",
    "aguardando_confirmacao",
    "aguardando_aceite_termos",
    "editando_escolha",
  ];
  const corte24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: zumbis } = await supabase
    .from("bot_sessions")
    .update({
      step: "inicio",
      atualizado_em: new Date().toISOString(),
    })
    .in("step", stepsAbandonados)
    .lt("atualizado_em", corte24h)
    .select("phone");
  resultados.push({
    acao: "resetar_sessoes_zumbi_24h",
    qtd_corrigida: zumbis?.length || 0,
    detalhes: { steps_alvo: stepsAbandonados.length, exemplos: (zumbis || []).slice(0, 3) },
  });

  // ============ HEAL 3: Atendimento humano >7 dias (cliente esquecido) ============
  // Cliente em atendimento_humano que nao recebeu retorno por dias = libera
  // pra fluxo automatico. Caso real pode ser admin esqueceu de devolver.
  const corte7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: humanoEsquecido } = await supabase
    .from("bot_sessions")
    .update({ step: "inicio", silenciado_ate: null })
    .eq("step", "atendimento_humano")
    .lt("atualizado_em", corte7d)
    .select("phone");
  resultados.push({
    acao: "liberar_atendimento_humano_7dias",
    qtd_corrigida: humanoEsquecido?.length || 0,
    detalhes: { exemplos: (humanoEsquecido || []).slice(0, 3) },
  });

  // ============ HEAL 4: Cobrancas Asaas pendentes >48h sem pagamento ============
  // Corrida em status="aceita" com cobranca criada >48h sem pagamento =
  // cliente desistiu silenciosamente. Cancela corrida pra liberar fretista
  // (que ainda esta com prestador_id apontado pra essa corrida).
  const corte48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: cobrancasOrfas } = await supabase
    .from("corridas")
    .update({ status: "cancelada" })
    .eq("status", "aceita")
    .lt("criado_em", corte48h)
    .select("id, cliente_id, prestador_id");
  resultados.push({
    acao: "cancelar_corridas_aceitas_48h_sem_pagamento",
    qtd_corrigida: cobrancasOrfas?.length || 0,
    detalhes: { ids: (cobrancasOrfas || []).map((c: { id: string }) => c.id).slice(0, 5) },
  });

  // ============ HEAL 5: Dispatchs orfaos (dispatch_ativo > 30min) ============
  // Dispatch ficou ativo por >30min sem ninguem aceitar. Marca como
  // finalizado pra evitar que dispatch novo apareca duplicado.
  const corte30min = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: dispatchOrfaos } = await supabase
    .from("corridas")
    .update({
      dispatch_ativo: false,
      dispatch_finalizado_em: new Date().toISOString(),
    })
    .eq("dispatch_ativo", true)
    .is("prestador_id", null)
    .lt("dispatch_iniciado_em", corte30min)
    .select("id");
  resultados.push({
    acao: "fechar_dispatch_orfaos_30min",
    qtd_corrigida: dispatchOrfaos?.length || 0,
    detalhes: { ids: (dispatchOrfaos || []).map((c: { id: string }) => c.id).slice(0, 5) },
  });

  // ============ HEAL 6: Prestador smoke deve estar disponivel=true ============
  // Caso raro: prestador smoke ficou indisponivel por algum motivo (ex: admin
  // ou outro cron desativou). Smoke depende dele. Garantir.
  const { data: smokeFretista } = await supabase
    .from("prestadores")
    .update({ disponivel: true, status: "aprovado" })
    .eq("telefone", "5500000000002")
    .or("disponivel.eq.false,status.neq.aprovado")
    .select("id");
  resultados.push({
    acao: "garantir_prestador_smoke_ativo",
    qtd_corrigida: smokeFretista?.length || 0,
  });

  // ============ HEAL 7: Limpa lixo de smoke (corridas/clientes smoke >2h) ============
  // Smoke faz cleanup ao final, mas se crashar pode deixar lixo. Garante
  // que phones smoke 5500000000001+ nao acumulem.
  const corte2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { data: smokeClientes } = await supabase
    .from("clientes")
    .select("id, telefone")
    .like("telefone", "55000%")
    .lt("atualizado_em", corte2h);
  let smokeLimpo = 0;
  for (const cli of (smokeClientes || []) as { id: string; telefone: string }[]) {
    if (cli.telefone === "5500000000002") continue; // fretista, mantem
    const { data: corridas } = await supabase.from("corridas").select("id").eq("cliente_id", cli.id);
    const ids = (corridas || []).map((c: { id: string }) => c.id);
    if (ids.length > 0) {
      await supabase.from("pagamentos").delete().in("corrida_id", ids);
      await supabase.from("ocorrencias").delete().in("corrida_id", ids);
      await supabase.from("provas_digitais").delete().in("corrida_id", ids);
    }
    await supabase.from("corridas").delete().eq("cliente_id", cli.id);
    await supabase.from("bot_sessions").delete().eq("phone", cli.telefone);
    await supabase.from("conversas_whatsapp").delete().eq("telefone", cli.telefone);
    await supabase.from("clientes").delete().eq("id", cli.id);
    smokeLimpo++;
  }
  resultados.push({
    acao: "limpar_lixo_smoke_clients_2h",
    qtd_corrigida: smokeLimpo,
  });

  const totalCorrigido = resultados.reduce((acc, r) => acc + r.qtd_corrigida, 0);

  // Loga execucao em bot_logs
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "imuni_self_heal_executado",
      duracao_ms: Date.now() - inicio,
      total_corrigido: totalCorrigido,
      resultados,
    },
  });

  return NextResponse.json({
    ok: true,
    duracao_ms: Date.now() - inicio,
    total_corrigido: totalCorrigido,
    resultados,
  });
}
