// Helpers de DB pra cumprir REGRA INEGOCIAVEL de armazenamento:
// "Toda informacao precisa ser SALVA. Sem perda silenciosa."
//
// Inserts comuns silenciam erros (await supabase.from().insert(...) sem
// destructuring de error). Esse helper detecta erro + loga + retorna
// resultado claro pra caller decidir se notifica admin.

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

interface SafeInsertOptions {
  tabela: string;
  dados: Record<string, any>;
  contexto?: string; // descreve onde no fluxo (ex: "criar_ocorrencia_cliente")
  notificarAdminEmFalha?: boolean; // default false (loga apenas)
}

interface SafeInsertResult<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  codigo?: string;
}

// Insert com error handling automatico. Sempre retorna {ok}. Se erro:
// - Loga em bot_logs com tipo "{tabela}_insert_falhou"
// - Opcionalmente notifica admin (pra inserts criticos como pagamentos)
//
// Use sempre que houver insert que NAO PODE silenciar erro
// (financeiros, dados de clientes, fotos, avaliacoes, ocorrencias).
export async function safeInsert<T = any>(
  options: SafeInsertOptions,
): Promise<SafeInsertResult<T>> {
  const { tabela, dados, contexto, notificarAdminEmFalha } = options;

  // Cast intencional: helper generico — recebe nome de tabela em string.
  // Validacao de schema fica por conta do error.code retornado em runtime.
  const { data, error } = await supabase
    .from(tabela as any)
    .insert(dados as any)
    .select()
    .single();

  if (error) {
    // Loga em bot_logs com payload detalhado pra auditoria
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: `${tabela}_insert_falhou`,
        contexto: contexto || "sem_contexto",
        erro: error.message,
        codigo: error.code,
        dados_amostra: JSON.stringify(dados).slice(0, 500),
      },
    });

    // Notifica admin se for tabela critica
    if (notificarAdminEmFalha) {
      try {
        const { notificarAdmin } = await import("@/lib/admin-notify").then((m) => ({
          notificarAdmin: m.notificarAdmins,
        }));
        await notificarAdmin(
          `🚨 *DB INSERT FALHOU*`,
          contexto || "sistema",
          `Tabela: ${tabela}\nErro: ${error.message}\nCodigo: ${error.code}\n\nDados: ${JSON.stringify(dados).slice(0, 400)}`,
        );
      } catch {}
    }

    return {
      ok: false,
      error: error.message,
      codigo: error.code,
    };
  }

  return { ok: true, data: data as T };
}

// Variante pra UPDATE (mesma logica, sem retornar single).
export async function safeUpdate(options: {
  tabela: string;
  match: Record<string, any>; // ex: { id: "abc" } ou { phone: "5511..." }
  dados: Record<string, any>;
  contexto?: string;
}): Promise<{ ok: boolean; error?: string; affected?: number }> {
  const { tabela, match, dados, contexto } = options;

  // Cast intencional (helper generico) — mesma justificativa de safeInsert.
  let query: any = supabase.from(tabela as any).update(dados as any);
  for (const [k, v] of Object.entries(match)) {
    query = query.eq(k, v);
  }
  const { data, error, count } = await query.select();

  if (error) {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: `${tabela}_update_falhou`,
        contexto: contexto || "sem_contexto",
        erro: error.message,
        codigo: error.code,
        match,
      },
    });
    return { ok: false, error: error.message };
  }

  return { ok: true, affected: data?.length ?? count ?? 0 };
}
