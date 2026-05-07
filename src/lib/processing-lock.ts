// Lock por phone pra serializar processamento de webhooks concorrentes
// do mesmo cliente. Caso real Igor 7/Mai/2026: 9 msgs em 3s viraram 9
// webhook calls paralelos, cada um tentando ser endereco -> caos.
//
// Solucao: ANTES de processar fluxo do cliente, tenta adquirir lock
// atomic na tabela processing_locks (phone PK). Se outro request tem
// lock = essa request retorna 200 sem processar (a outra vai consolidar
// nossa msg quando ler conversas_whatsapp).
//
// Graceful degradation: se tabela nao existe (migration nao aplicada
// ainda), retorna { ok: true, mock: true } e sistema processa SEM lock
// (comportamento legado). Garante que deploy nunca quebra prod.
//
// Lock TTL = 15s. Expirou? UPDATE atomico (WHERE acquired_at < now-15s)
// garante que so 1 request "rouba" o lock orfao.

import { supabaseAdmin } from "@/lib/supabase-admin";

// Tabela processing_locks foi adicionada em migration 7/Mai/2026 mas
// database.types.ts ainda nao foi regenerado. Cast pra any pra acessar
// a tabela sem erro de TS. Quando types forem regenerados, remover cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = supabaseAdmin;

const LOCK_TTL_MS = 15_000;

export async function tentarAdquirirLock(phone: string): Promise<{
  ok: boolean;
  mock?: boolean;
  motivo?: string;
}> {
  const agoraIso = new Date().toISOString();
  const expiradoIso = new Date(Date.now() - LOCK_TTL_MS).toISOString();

  // 1) Tenta INSERT (caso novo lock). Cast pra any porque tabela nova
  // ainda nao foi regenerada nos database.types.ts (migration recente).
  const { error: errInsert } = await supabase
    .from("processing_locks")
    .insert({ phone, acquired_at: agoraIso });

  // Tabela ausente = graceful degradation
  if (errInsert?.code === "42P01" || errInsert?.message?.includes("does not exist")) {
    return { ok: true, mock: true, motivo: "tabela_processing_locks_nao_existe" };
  }

  if (!errInsert) return { ok: true };

  // 2) Conflict — tenta "roubar" lock orfao (acquired_at < now - TTL)
  const { data: roubado } = await supabase
    .from("processing_locks")
    .update({ acquired_at: agoraIso })
    .eq("phone", phone)
    .lt("acquired_at", expiradoIso)
    .select("phone");

  if (roubado && roubado.length > 0) {
    return { ok: true, motivo: "rouba_lock_orfao" };
  }

  // Lock vigente em outra request
  return { ok: false, motivo: "lock_em_uso" };
}

export async function liberarLock(phone: string): Promise<void> {
  try {
    await supabase.from("processing_locks").delete().eq("phone", phone);
  } catch {
    // Tabela ausente OU erro — ignora (graceful)
  }
}

// Debounce: dorme N ms pra dar tempo de outras msgs do mesmo phone
// chegarem (cliente manda em rajada). 1200ms cobre o caso comum sem
// estourar timeout de webhook.
export async function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Le mensagens IN do phone nos ultimos N segundos, ordenadas por
// criado_em ASC, e concatena conteudos de TEXTO (ignora image/audio/etc).
// Retorna null se nao houver msgs ou se so tem nao-texto. Caller deve
// usar a msg ORIGINAL nesse caso.
export async function consolidarMsgsRecentes(
  phone: string,
  janelaSegundos: number = 5,
): Promise<{ textoConsolidado: string | null; qtdMsgs: number }> {
  const limiteTempo = new Date(Date.now() - janelaSegundos * 1000).toISOString();
  const { data: msgs } = await supabase
    .from("conversas_whatsapp")
    .select("conteudo, tipo, criado_em")
    .eq("telefone", phone)
    .eq("direcao", "in")
    .gte("criado_em", limiteTempo)
    .order("criado_em", { ascending: true });

  if (!msgs || msgs.length === 0) {
    return { textoConsolidado: null, qtdMsgs: 0 };
  }

  // Filtra so msgs de TEXTO (image/audio/location nao consolidam bem;
  // o handler especifico ja cuida delas individualmente).
  type MsgRow = { conteudo: string; tipo: string; criado_em: string };
  const textos = (msgs as MsgRow[])
    .filter((m: MsgRow) => m.tipo === "text" && m.conteudo && m.conteudo.trim().length > 0)
    .map((m: MsgRow) => m.conteudo.trim());

  if (textos.length === 0) {
    return { textoConsolidado: null, qtdMsgs: msgs.length };
  }

  // Dedupe textos identicos (cliente as vezes manda mesmo texto 2x por
  // engano). Mantem ordem de aparicao.
  const seen = new Set<string>();
  const unicos: string[] = [];
  for (const t of textos) {
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      unicos.push(t);
    }
  }

  return {
    textoConsolidado: unicos.join("\n"),
    qtdMsgs: msgs.length,
  };
}
