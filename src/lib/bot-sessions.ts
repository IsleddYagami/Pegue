// Gerenciamento de sessoes do bot WhatsApp via Supabase
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

export type BotStep =
  | "inicio"
  | "aguardando_servico"
  | "aguardando_localizacao"
  | "aguardando_foto"
  | "aguardando_mais_fotos"
  | "aguardando_destino"
  | "aguardando_tipo_local"
  | "aguardando_andar"
  | "aguardando_ajudante"
  | "aguardando_data"
  | "aguardando_fretista"
  | "cadastro_nome"
  | "cadastro_cpf"
  | "cadastro_email"
  | "cadastro_selfie"
  | "cadastro_foto_documento"
  | "cadastro_foto_placa"
  | "cadastro_foto_veiculo"
  | "cadastro_placa"
  | "cadastro_chave_pix"
  | "cadastro_tipo_veiculo"
  | "cadastro_termos"
  | "cadastro_aguardando_aprovacao"
  | "fretista_coleta_fotos"
  | "fretista_entrega_fotos"
  | "fretista_aguardando_pin"
  | "aguardando_confirmacao_entrega"
  | "avaliacao_atendimento"
  | "avaliacao_praticidade"
  | "avaliacao_fretista"
  | "avaliacao_sugestao"
  | "aguardando_confirmacao"
  | "aguardando_aceite_termos"
  | "aguardando_clarificacao_itens"
  | "editando_escolha"
  | "confirmar_itens_foto"
  | "confirmando_origem"
  | "confirmando_destino"
  | "aguardando_outros_descricao"
  | "aguardando_outros_quantidade"
  | "aguardando_outros_dimensoes"
  | "aguardando_outros_peso"
  | "aguardando_pagamento"
  | "aguardando_numero_coleta"
  | "aguardando_numero_destino"
  | "adicionar_pequeno_grande"
  | "adicionar_item_descricao"
  | "confirmar_contexto_inicial"
  | "fretista_divergencia_tipo"
  | "fretista_divergencia_foto"
  | "fretista_divergencia_descricao"
  | "fretista_confirmar_alteracao_data"
  | "aguardando_contraoferta_data"
  | "avaliar_escolher_veiculos"
  | "avaliar_aguardando_preco"
  | "admin_confirmar_ajuste"
  | "aguardando_revisao_admin"
  | "guincho_categoria"
  | "guincho_tipo_veiculo"
  | "guincho_marca_modelo"
  | "guincho_localizacao"
  | "guincho_destino"
  | "aguardando_horario"
  | "fretista_cancelar_qual"
  | "fretista_cancelar_confirma"
  | "fretista_indicar_qual"
  | "fretista_indicar_telefone"
  | "concluido"
  | "atendimento_humano";

export interface BotSession {
  phone: string;
  step: BotStep;
  origem_endereco: string | null;
  origem_lat: number | null;
  origem_lng: number | null;
  destino_endereco: string | null;
  destino_lat: number | null;
  destino_lng: number | null;
  distancia_km: number | null;
  descricao_carga: string | null;
  veiculo_sugerido: string | null;
  foto_url: string | null;
  data_agendada: string | null;
  periodo: string | null;
  plano_escolhido: string | null;
  valor_estimado: number | null;
  tem_escada: boolean;
  andar: number;
  precisa_ajudante: boolean;
  corrida_id: string | null;
  instance_chatpro?: number | null;
  msgs_contador?: number | null;
  msgs_contador_inicio?: string | null;
}

export async function getSession(phone: string): Promise<BotSession | null> {
  const { data } = await supabase
    .from("bot_sessions")
    .select("*")
    .eq("phone", phone)
    .single();

  if (!data) return null;

  // Expira sessao apos 24 horas
  const vinteQuatroHoras = 24 * 60 * 60 * 1000;
  const atualizado = new Date(data.atualizado_em).getTime();
  if (Date.now() - atualizado > vinteQuatroHoras) {
    await deleteSession(phone);
    return null;
  }

  return data as BotSession;
}

export async function createSession(
  phone: string,
  instance?: 1 | 2
): Promise<BotSession> {
  if (!instance) {
    const { data } = await supabase
      .from("bot_sessions")
      .select("instance_chatpro")
      .eq("phone", phone)
      .maybeSingle();
    instance = data?.instance_chatpro === 2 ? 2 : 1;
  }

  const session: Record<string, any> = {
    phone,
    step: "inicio",
    origem_endereco: null,
    origem_lat: null,
    origem_lng: null,
    destino_endereco: null,
    destino_lat: null,
    destino_lng: null,
    distancia_km: null,
    descricao_carga: null,
    veiculo_sugerido: null,
    foto_url: null,
    data_agendada: null,
    periodo: null,
    plano_escolhido: null,
    valor_estimado: null,
    tem_escada: false,
    andar: 0,
    precisa_ajudante: false,
    corrida_id: null,
    instance_chatpro: instance,
    alerta_admin_enviado_em: null,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };

  await supabase.from("bot_sessions").upsert(session, { onConflict: "phone" });

  return session as unknown as BotSession;
}

export async function updateSession(
  phone: string,
  updates: Partial<BotSession>
): Promise<void> {
  await supabase
    .from("bot_sessions")
    .update({ ...updates, atualizado_em: new Date().toISOString() })
    .eq("phone", phone);
}

export async function deleteSession(phone: string): Promise<void> {
  await supabase.from("bot_sessions").delete().eq("phone", phone);
}

// ============================================================
// DISPATCH ATOMICO via Supabase (substitui Map em memoria)
// ============================================================
// Problema do modelo anterior (Map em memoria):
//   - Em Vercel serverless, cada instancia tem seu proprio Map.
//     Dois fretistas podem cair em instancias diferentes e ambos "ganhar" o frete.
//   - Cold start apaga o Map -> dispatch orfao.
//
// Solucao: estado do dispatch mora em `corridas` (colunas dispatch_*).
//   Aceite usa UPDATE com WHERE condicional -> garantia atomica pelo Postgres.
//   Se UPDATE afeta 0 linhas, outro ja pegou.
// ============================================================

export interface DispatchRow {
  corrida_id: string;
  cliente_phone: string;
  prestadores: string[];
  iniciado_em: string;
  finalizado_em: string | null;
  vencedor_phone: string | null;
  rodada: number;
}

export async function createDispatch(
  corridaId: string,
  prestadores: string[],
  rodada: number = 0
): Promise<void> {
  // Estado do dispatch fica direto na corrida (UPDATE atomico depois)
  await supabase
    .from("corridas")
    .update({
      dispatch_ativo: true,
      dispatch_prestadores: prestadores,
      dispatch_iniciado_em: new Date().toISOString(),
      dispatch_finalizado_em: null,
      dispatch_rodada: rodada,
    })
    .eq("id", corridaId);
}

export async function getDispatchByCorridaId(
  corridaId: string
): Promise<DispatchRow | null> {
  const { data } = await supabase
    .from("corridas")
    .select(
      "id, cliente_id, dispatch_prestadores, dispatch_iniciado_em, dispatch_finalizado_em, dispatch_ativo, prestador_id, dispatch_rodada, clientes!inner(telefone), prestadores(telefone)"
    )
    .eq("id", corridaId)
    .single();

  if (!data || !data.dispatch_prestadores) return null;

  const vencedorPhone =
    data.prestador_id && (data.prestadores as any)?.telefone
      ? (data.prestadores as any).telefone
      : null;

  return {
    corrida_id: data.id,
    cliente_phone: (data.clientes as any)?.telefone || "",
    prestadores: data.dispatch_prestadores || [],
    iniciado_em: data.dispatch_iniciado_em || "",
    finalizado_em: data.dispatch_finalizado_em,
    vencedor_phone: vencedorPhone,
    rodada: data.dispatch_rodada || 0,
  };
}

export async function getDispatchForPrestador(
  prestadorPhone: string
): Promise<DispatchRow | null> {
  // Busca qualquer corrida com dispatch ativo onde este prestador foi incluido
  const { data } = await supabase
    .from("corridas")
    .select(
      "id, cliente_id, dispatch_prestadores, dispatch_iniciado_em, dispatch_finalizado_em, dispatch_rodada, clientes!inner(telefone)"
    )
    .eq("dispatch_ativo", true)
    .contains("dispatch_prestadores", [prestadorPhone])
    .order("dispatch_iniciado_em", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;
  const row = data[0];
  return {
    corrida_id: row.id,
    cliente_phone: (row.clientes as any)?.telefone || "",
    prestadores: row.dispatch_prestadores || [],
    iniciado_em: row.dispatch_iniciado_em || "",
    finalizado_em: row.dispatch_finalizado_em,
    vencedor_phone: null,
    rodada: row.dispatch_rodada || 0,
  };
}

export interface AceitarDispatchResult {
  sucesso: boolean;
  outrosPrestadores: string[];
  clientePhone: string;
  jaFoiAceito: boolean;
}

/**
 * Tenta aceitar o dispatch ATOMICAMENTE via UPDATE com WHERE condicional.
 * Garante que apenas UM fretista vence, mesmo com requests concorrentes.
 * Usa o proprio Postgres como lock (sem race condition).
 */
export async function tryAceitarDispatch(
  corridaId: string,
  prestadorId: string,
  prestadorPhone: string
): Promise<AceitarDispatchResult> {
  const agora = new Date().toISOString();

  // UPDATE atomico: so vence se dispatch_ativo=true E prestador_id IS NULL
  // Se outro ja pegou, dispatch_ativo vira false -> condicao falha -> 0 linhas afetadas
  const { data, error } = await supabase
    .from("corridas")
    .update({
      prestador_id: prestadorId,
      status: "aceita",
      dispatch_ativo: false,
      dispatch_finalizado_em: agora,
    })
    .eq("id", corridaId)
    .eq("dispatch_ativo", true)
    .is("prestador_id", null)
    .select("dispatch_prestadores, clientes!inner(telefone)");

  if (error) {
    console.error("Erro no UPDATE atomico do dispatch:", error);
    return { sucesso: false, outrosPrestadores: [], clientePhone: "", jaFoiAceito: false };
  }

  if (!data || data.length === 0) {
    // Nao venceu. Pode ser porque outro ja pegou OU corrida nao estava em dispatch.
    // Buscar estado real pra saber se ja foi aceito (pra dar mensagem apropriada)
    const { data: atual } = await supabase
      .from("corridas")
      .select("prestador_id, dispatch_ativo, dispatch_finalizado_em")
      .eq("id", corridaId)
      .single();

    const jaFoiAceito = !!(atual?.prestador_id && atual?.dispatch_finalizado_em);
    return { sucesso: false, outrosPrestadores: [], clientePhone: "", jaFoiAceito };
  }

  const row = data[0];
  const outros = (row.dispatch_prestadores || []).filter(
    (p: string) => p !== prestadorPhone
  );
  return {
    sucesso: true,
    outrosPrestadores: outros,
    clientePhone: (row.clientes as any)?.telefone || "",
    jaFoiAceito: false,
  };
}

/**
 * Finaliza dispatch sem vencedor (timeout, cancelamento).
 * Marca dispatch_ativo=false pra liberar o leilao.
 */
export async function finalizeDispatch(corridaId: string): Promise<void> {
  await supabase
    .from("corridas")
    .update({
      dispatch_ativo: false,
      dispatch_finalizado_em: new Date().toISOString(),
    })
    .eq("id", corridaId)
    .eq("dispatch_ativo", true);
}

// ============================================================
// TAREFAS AGENDADAS (substitui setTimeout em serverless)
// ============================================================

export type TipoTarefa =
  | "dispatch_timeout_inicial"
  | "dispatch_timeout_estendido"
  | "rastreio_lembrete_confirmacao"
  | "rastreio_libera_fretista"
  | "ocorrencia_timeout_admin"
  | "pin_entrega_timeout"
  | "dispatch_redispatch_rodada2";

export async function agendarTarefa(
  tipo: TipoTarefa,
  referencia: string,
  atrasoMs: number,
  payload: Record<string, any> = {}
): Promise<void> {
  const executarEm = new Date(Date.now() + atrasoMs).toISOString();
  await supabase.from("tarefas_agendadas").insert({
    tipo,
    referencia,
    payload,
    executar_em: executarEm,
  });
}

export async function cancelarTarefas(
  tipo: TipoTarefa,
  referencia: string
): Promise<void> {
  await supabase
    .from("tarefas_agendadas")
    .update({ executado_em: new Date().toISOString(), erro: "cancelada" })
    .eq("tipo", tipo)
    .eq("referencia", referencia)
    .is("executado_em", null);
}

// ============================================================
// RATE LIMIT / ANTI-LOOP
// ============================================================
// Evita que outro bot (ou numero automatico) fique trocando mensagens
// em loop com o Pegue, spammando notificacoes e custos de API.
//
// Regras:
//   - Mais de MAX_MSGS em JANELA_MS => silencia o phone por SILENCIO_MS
//   - Phone na tabela phones_bloqueados => SEMPRE silenciado
//   - Numeros proprios do Pegue => SEMPRE silenciados (evita auto-loop)

// Bug 25/Abr: cliente leigo mandou 13 fotos seguidas pra cotar mudanca,
// 8 foram silenciadas pelo rate limit. Fluxo natural sendo penalizado.
// 30 msgs/60s ainda detecta loop de bot (loops fazem 100+/min facilmente)
// mas permite cliente humano normal mandar varias fotos sequenciais.
const MAX_MSGS = 30;                 // max de mensagens
const JANELA_MS = 60_000;            // na janela de 60s
const SILENCIO_MS = 30 * 60_000;     // silencia por 30min se ultrapassar

// Telefones da propria Pegue (instancias 1 e 2). Nunca responder a eles
// pra evitar loop caso uma mensagem automatica chegue.
const PEGUE_PHONES = new Set([
  "5511970363713", // instancia 1
  "5511954316547", // instancia 2
]);

export interface RateLimitResult {
  permitido: boolean;
  motivo?: string;
  silenciar?: boolean;
}

export async function verificarRateLimit(phone: string): Promise<RateLimitResult> {
  // 1) Phone do proprio Pegue?
  if (PEGUE_PHONES.has(phone)) {
    return { permitido: false, motivo: "phone_proprio_pegue" };
  }

  // 2) Phone na blocklist permanente?
  const { data: bloqueado } = await supabase
    .from("phones_bloqueados")
    .select("phone, motivo")
    .eq("phone", phone)
    .maybeSingle();
  if (bloqueado) {
    return { permitido: false, motivo: `bloqueado: ${bloqueado.motivo || "sem motivo"}` };
  }

  // 3) Rate limit baseado em bot_sessions
  const { data: sessao } = await supabase
    .from("bot_sessions")
    .select("silenciado_ate, msgs_contador, msgs_contador_inicio")
    .eq("phone", phone)
    .maybeSingle();

  const agora = Date.now();

  if (sessao?.silenciado_ate) {
    const silenciadoAte = new Date(sessao.silenciado_ate).getTime();
    if (silenciadoAte > agora) {
      return { permitido: false, motivo: "silenciado_temporariamente" };
    }
  }

  // Calcula janela atual
  const inicio = sessao?.msgs_contador_inicio
    ? new Date(sessao.msgs_contador_inicio).getTime()
    : 0;
  const contadorAtual = sessao?.msgs_contador || 0;

  let novoContador: number;
  let novoInicio: string;

  if (!sessao || agora - inicio > JANELA_MS) {
    // Janela nova
    novoContador = 1;
    novoInicio = new Date(agora).toISOString();
  } else {
    novoContador = contadorAtual + 1;
    novoInicio = sessao.msgs_contador_inicio || new Date(agora).toISOString();
  }

  // Ultrapassou o limite?
  if (novoContador > MAX_MSGS) {
    const silencioAte = new Date(agora + SILENCIO_MS).toISOString();
    // Se sessao nao existe, cria minima pra marcar silenciado
    if (!sessao) {
      await supabase.from("bot_sessions").upsert(
        {
          phone,
          step: "inicio",
          silenciado_ate: silencioAte,
          msgs_contador: novoContador,
          msgs_contador_inicio: novoInicio,
          bot_detectado: true,
          criado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "phone" }
      );
    } else {
      await supabase
        .from("bot_sessions")
        .update({
          silenciado_ate: silencioAte,
          msgs_contador: novoContador,
          msgs_contador_inicio: novoInicio,
          bot_detectado: true,
          atualizado_em: new Date().toISOString(),
        })
        .eq("phone", phone);
    }
    return {
      permitido: false,
      motivo: "rate_limit_excedido",
      silenciar: true,
    };
  }

  // Apenas atualiza contador (sem silenciar ainda)
  if (sessao) {
    await supabase
      .from("bot_sessions")
      .update({
        msgs_contador: novoContador,
        msgs_contador_inicio: novoInicio,
      })
      .eq("phone", phone);
  }

  return { permitido: true };
}

// Heuristica simples: detecta se mensagem parece ser de bot empresarial.
// Usado como sinal ADICIONAL pra silenciar. Nao age sozinho - combinado com
// frequencia (verificarRateLimit ja pega a maioria dos casos).
export function pareceMensagemDeBotExterno(texto: string): boolean {
  const lower = texto.toLowerCase();
  const padroes = [
    "bem vindo ao atendimento",
    "bem-vindo ao atendimento",
    "digite uma das opcoes",
    "digite uma das opções",
    "escolha uma opcao",
    "escolha uma opção",
    "nao encontrei a opcao",
    "não encontrei a opção",
    "opcao invalida",
    "opção inválida",
    "nao entendi a opcao",
    "não entendi a opção",
    "menu principal",
    "retornar ao menu",
    "falar com atendente",
  ];
  return padroes.some((p) => lower.includes(p));
}

