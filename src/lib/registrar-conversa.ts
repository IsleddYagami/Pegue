// Helper para registrar mensagens em `conversas_whatsapp` — historico
// canonico de tudo que cliente disse e bot/admin respondeu.
//
// 6/Mai/2026: tabela existia mas NINGUEM inseria. Bot_logs registrava
// metadados (tipo, masked) mas o conteudo literal das mensagens ficava
// SO no log do ChatPro (que nao podemos consultar). Casos reais
// 5511953731463 e 5519983355000 conversaram >50 msgs cada e o sistema
// nao tinha prova canonica do que foi falado. Viola
// feedback_armazenamento_inegociavel.md (LGPD/auditoria).
//
// Filosofia: insert NUNCA bloqueia o fluxo. Se Supabase travar/falhar,
// log silencioso em bot_logs e segue. Pior cenario eh perder 1 msg do
// historico, melhor que travar atendimento.

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

export type DirecaoConversa = "in" | "out";
export type TipoConversa = "text" | "image" | "audio" | "video" | "document" | "location";

interface RegistrarConversaParams {
  telefone: string;
  direcao: DirecaoConversa;
  conteudo: string;
  tipo?: TipoConversa;
  midia_url?: string | null;
  audio_url?: string | null;
  corrida_id?: string | null;
  metadata?: Record<string, unknown>;
}

export async function registrarConversa(p: RegistrarConversaParams): Promise<void> {
  try {
    // Busca cliente_id (best-effort — se nao existir, salva sem).
    // Cliente eh criado no primeiro contato pelo webhook (BUG D fix
    // 6/Mai/2026), entao pra >99% dos casos vai existir.
    let clienteId: string | null = null;
    const { data: cli } = await supabase
      .from("clientes")
      .select("id")
      .eq("telefone", p.telefone)
      .maybeSingle();
    if (cli?.id) clienteId = cli.id;

    const insertObj = {
      telefone: p.telefone,
      direcao: p.direcao,
      tipo: p.tipo || "text",
      conteudo: p.conteudo.slice(0, 4000), // trunca pra evitar payload absurdo
      cliente_id: clienteId,
      midia_url: p.midia_url || null,
      audio_url: p.audio_url || null,
      corrida_id: p.corrida_id || null,
      metadata: p.metadata ? p.metadata : null,
    };

    const { error } = await supabase.from("conversas_whatsapp").insert(insertObj);
    if (error) {
      // Loga falha mas nao trava — try/catch silencioso
      try {
        await supabase.from("bot_logs").insert({
          payload: {
            tipo: "registrar_conversa_falhou",
            erro: error.message,
            telefone_masked: p.telefone.replace(/\d(?=\d{4})/g, "*"),
            direcao: p.direcao,
          },
        });
      } catch {
        // ignora
      }
    }
  } catch (e: unknown) {
    // Erro nao deve trava webhook. Apenas console.
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("registrarConversa fallback:", msg);
  }
}
