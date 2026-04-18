// Gerenciamento de sessoes do bot WhatsApp via Supabase
import { supabase } from "@/lib/supabase";

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
  | "aguardando_detalhes"
  | "aguardando_data"
  | "aguardando_fretista"
  | "cadastro_nome"
  | "cadastro_cpf"
  | "cadastro_email"
  | "cadastro_selfie"
  | "cadastro_foto_placa"
  | "cadastro_foto_veiculo"
  | "cadastro_placa"
  | "cadastro_chave_pix"
  | "cadastro_tipo_veiculo"
  | "cadastro_termos"
  | "cadastro_aguardando_aprovacao"
  | "fretista_coleta_fotos"
  | "fretista_entrega_fotos"
  | "aguardando_confirmacao_entrega"
  | "avaliacao_atendimento"
  | "avaliacao_praticidade"
  | "avaliacao_fretista"
  | "avaliacao_sugestao"
  | "aguardando_confirmacao"
  | "aguardando_pagamento"
  | "guincho_categoria"
  | "guincho_localizacao"
  | "guincho_destino"
  | "dispatch_fretistas"
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

export async function createSession(phone: string): Promise<BotSession> {
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
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };

  // Upsert - cria ou atualiza se ja existe
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

// === DISPATCH (em memoria - OK pois janela e de 30s) ===

export interface DispatchEntry {
  corridaId: string;
  clientePhone: string;
  prestadores: string[];
  respostas: Map<string, { valor: number; timestamp: number }>;
  iniciadoEm: number;
  janelaMs: number;
  finalizado: boolean;
  vencedorPhone: string | null;
}

const dispatches = new Map<string, DispatchEntry>();

export function createDispatch(
  corridaId: string,
  clientePhone: string,
  prestadores: string[]
): DispatchEntry {
  const dispatch: DispatchEntry = {
    corridaId,
    clientePhone,
    prestadores,
    respostas: new Map(),
    iniciadoEm: Date.now(),
    janelaMs: 30 * 1000,
    finalizado: false,
    vencedorPhone: null,
  };
  dispatches.set(corridaId, dispatch);
  return dispatch;
}

export function getDispatchByCorridaId(corridaId: string): DispatchEntry | null {
  return dispatches.get(corridaId) || null;
}

export function getDispatchForPrestador(prestadorPhone: string): DispatchEntry | null {
  for (const dispatch of dispatches.values()) {
    if (!dispatch.finalizado && dispatch.prestadores.includes(prestadorPhone)) {
      return dispatch;
    }
  }
  return null;
}

export function addDispatchResponse(
  corridaId: string,
  prestadorPhone: string,
  valor: number
): void {
  const dispatch = dispatches.get(corridaId);
  if (!dispatch || dispatch.finalizado) return;
  dispatch.respostas.set(prestadorPhone, { valor, timestamp: Date.now() });
}

export function resolveDispatch(corridaId: string): string | null {
  const dispatch = dispatches.get(corridaId);
  if (!dispatch || dispatch.finalizado) return null;

  if (dispatch.respostas.size === 0) return null;

  // Primeiro a aceitar, leva! Sem esperar janela
  const [phone] = dispatch.respostas.keys();
  dispatch.vencedorPhone = phone;
  dispatch.finalizado = true;
  return phone;
}

export function finalizeDispatch(corridaId: string): void {
  const dispatch = dispatches.get(corridaId);
  if (dispatch) dispatch.finalizado = true;
}
