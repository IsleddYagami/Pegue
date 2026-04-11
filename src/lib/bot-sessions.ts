// Gerenciamento de sessoes do bot WhatsApp
// Cada cliente tem uma sessao ativa com o estado da conversa

export type BotStep =
  | "inicio"
  | "aguardando_localizacao"
  | "aguardando_foto"
  | "aguardando_destino"
  | "aguardando_detalhes"
  | "aguardando_data"
  | "aguardando_confirmacao"
  | "aguardando_pagamento"
  | "dispatch_fretistas"
  | "concluido"
  | "atendimento_humano";

export interface BotSession {
  phone: string;
  step: BotStep;
  // Dados coletados
  origemEndereco: string | null;
  origemLat: number | null;
  origemLng: number | null;
  destinoEndereco: string | null;
  destinoLat: number | null;
  destinoLng: number | null;
  distanciaKm: number | null;
  descricaoCarga: string | null;
  veiculoSugerido: string | null;
  fotoUrl: string | null;
  dataAgendada: string | null;
  periodo: string | null;
  planoEscolhido: string | null;
  valorEstimado: number | null;
  temEscada: boolean;
  andar: number;
  precisaAjudante: boolean;
  // Controle
  corridaId: string | null;
  criadoEm: number;
  atualizadoEm: number;
}

// Sessoes em memoria (para MVP - depois migrar pro Supabase)
const sessions = new Map<string, BotSession>();

export function getSession(phone: string): BotSession | null {
  const session = sessions.get(phone);
  if (!session) return null;

  // Expira sessao apos 2 horas de inatividade
  const duasHoras = 2 * 60 * 60 * 1000;
  if (Date.now() - session.atualizadoEm > duasHoras) {
    sessions.delete(phone);
    return null;
  }

  return session;
}

export function createSession(phone: string): BotSession {
  const session: BotSession = {
    phone,
    step: "inicio",
    origemEndereco: null,
    origemLat: null,
    origemLng: null,
    destinoEndereco: null,
    destinoLat: null,
    destinoLng: null,
    distanciaKm: null,
    descricaoCarga: null,
    veiculoSugerido: null,
    fotoUrl: null,
    dataAgendada: null,
    periodo: null,
    planoEscolhido: null,
    valorEstimado: null,
    temEscada: false,
    andar: 0,
    precisaAjudante: false,
    corridaId: null,
    criadoEm: Date.now(),
    atualizadoEm: Date.now(),
  };

  sessions.set(phone, session);
  return session;
}

export function updateSession(
  phone: string,
  updates: Partial<BotSession>
): BotSession {
  const session = sessions.get(phone);
  if (!session) return createSession(phone);

  Object.assign(session, updates, { atualizadoEm: Date.now() });
  sessions.set(phone, session);
  return session;
}

export function deleteSession(phone: string): void {
  sessions.delete(phone);
}

// Dispatch: controle de leilao de fretistas
export interface DispatchEntry {
  corridaId: string;
  clientePhone: string;
  prestadores: string[]; // telefones dos prestadores
  respostas: Map<
    string,
    { valor: number; timestamp: number }
  >;
  iniciadoEm: number;
  janelaMs: number; // 30 segundos
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
    janelaMs: 30 * 1000, // 30 segundos
    finalizado: false,
    vencedorPhone: null,
  };

  dispatches.set(corridaId, dispatch);
  return dispatch;
}

export function getDispatchByCorridaId(
  corridaId: string
): DispatchEntry | null {
  return dispatches.get(corridaId) || null;
}

// Encontra dispatch ativo para um prestador
export function getDispatchForPrestador(
  prestadorPhone: string
): DispatchEntry | null {
  for (const dispatch of dispatches.values()) {
    if (
      !dispatch.finalizado &&
      dispatch.prestadores.includes(prestadorPhone)
    ) {
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

  dispatch.respostas.set(prestadorPhone, {
    valor,
    timestamp: Date.now(),
  });
}

// Resolve o dispatch: retorna o telefone do vencedor
export function resolveDispatch(corridaId: string): string | null {
  const dispatch = dispatches.get(corridaId);
  if (!dispatch || dispatch.finalizado) return null;

  const agora = Date.now();
  const dentroJanela = agora - dispatch.iniciadoEm <= dispatch.janelaMs;

  if (dispatch.respostas.size === 0) return null;

  if (dentroJanela && dispatch.respostas.size > 1) {
    // Multiplas respostas dentro da janela: menor preco ganha
    let menorValor = Infinity;
    let vencedor = "";

    for (const [phone, resp] of dispatch.respostas) {
      if (resp.valor < menorValor) {
        menorValor = resp.valor;
        vencedor = phone;
      }
    }

    dispatch.vencedorPhone = vencedor;
    dispatch.finalizado = true;
    return vencedor;
  }

  if (!dentroJanela) {
    // Fora da janela: primeiro que respondeu ganha
    let primeiroTimestamp = Infinity;
    let vencedor = "";

    for (const [phone, resp] of dispatch.respostas) {
      if (resp.timestamp < primeiroTimestamp) {
        primeiroTimestamp = resp.timestamp;
        vencedor = phone;
      }
    }

    dispatch.vencedorPhone = vencedor;
    dispatch.finalizado = true;
    return vencedor;
  }

  return null; // Ainda na janela com apenas 1 resposta, espera mais
}

export function finalizeDispatch(corridaId: string): void {
  const dispatch = dispatches.get(corridaId);
  if (dispatch) {
    dispatch.finalizado = true;
  }
}
