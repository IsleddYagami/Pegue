import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidAdminKey } from "@/lib/admin-auth";
import { isValidBrPhone, sendToClient } from "@/lib/chatpro";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// RESPONDER O CLIENTE PELO PAINEL.
//
// Ate 3/Nov/2026 so' dava pra um humano responder de um jeito: pegando o
// celular e digitando no app do WhatsApp da Pegue. O webhook via a mensagem
// como `FromMe` e calava a Iris sozinho. A tela /admin/conversa so' LIA a
// conversa, nao enviava nada.
//
// Essa rota faz pelo painel exatamente o que o celular fazia:
//   1. manda a mensagem pro cliente, pelo mesmo numero da Pegue;
//   2. cala a Iris (step = atendimento_humano), senao os dois respondem
//      junto e o cliente recebe atendimento humano e robo embaralhados;
//   3. aceita "VOLTA IRIS" pra devolver o atendimento pro bot, igual ao
//      comando que ja funciona pelo celular.
//
// Pro cliente nao muda nada: chega no WhatsApp dele, do mesmo numero, na
// mesma conversa. Ele nao distingue isto da Iris nem do celular.

// "11 97142-9605" -> "5511971429605"
function normalizarTelefone(bruto: unknown): string | null {
  const so = String(bruto ?? "").replace(/\D/g, "");
  if (!so) return null;
  const comDdi = so.startsWith("55") ? so : `55${so}`;
  return isValidBrPhone(comDdi) ? comDdi : null;
}

// Mesmos comandos que o webhook aceita vindos do celular, pra nao criar
// uma segunda gramatica que so' funciona no painel.
function ehVoltaIris(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return (
    t === "volta iris" ||
    t === "/volta iris" ||
    t.startsWith("volta iris ") ||
    t === "volta bot" ||
    t === "/volta bot" ||
    t.startsWith("volta bot ")
  );
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, motivo: "json_invalido" }, { status: 400 });
  }

  const key =
    String(body.key ?? "") || req.headers.get("authorization")?.replace("Bearer ", "") || "";
  if (!isValidAdminKey(key)) {
    return NextResponse.json({ ok: false, motivo: "acesso_negado" }, { status: 401 });
  }

  const telefone = normalizarTelefone(body.phone);
  if (!telefone) {
    return NextResponse.json(
      { ok: false, motivo: "telefone_invalido", mensagem: "Telefone inválido: precisa ser DDD + número." },
      { status: 400 },
    );
  }

  const texto = String(body.mensagem ?? "").trim();
  if (!texto) {
    return NextResponse.json(
      { ok: false, motivo: "mensagem_vazia", mensagem: "Escreve a mensagem antes de enviar." },
      { status: 400 },
    );
  }
  if (texto.length > 4000) {
    return NextResponse.json(
      { ok: false, motivo: "mensagem_longa", mensagem: "Mensagem longa demais (máximo 4000 caracteres)." },
      { status: 400 },
    );
  }

  const devolverPraIris = ehVoltaIris(texto);

  // ENVIA PRIMEIRO. Se o WhatsApp recusar, nao faz sentido mexer na sessao:
  // o cliente nao recebeu nada e a Iris nao pode ficar calada por engano.
  try {
    await sendToClient({ to: telefone, message: texto });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "erro desconhecido";
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "admin_responder_falhou",
        phone_masked: telefone.replace(/\d(?=\d{4})/g, "*"),
        erro: motivo,
      },
    });
    return NextResponse.json(
      {
        ok: false,
        motivo: "envio_falhou",
        mensagem: `O WhatsApp recusou o envio (${motivo}). O cliente NÃO recebeu — não considere respondido.`,
      },
      { status: 502 },
    );
  }

  // Agora sim mexe no estado: calar a Iris, ou devolver pra ela.
  const novoStep = devolverPraIris ? "inicio" : "atendimento_humano";
  const agora = new Date().toISOString();

  const { data: sessao } = await supabase
    .from("bot_sessions")
    .select("phone")
    .eq("phone", telefone)
    .maybeSingle();

  if (sessao) {
    await supabase
      .from("bot_sessions")
      .update({ step: novoStep, atualizado_em: agora })
      .eq("phone", telefone);
  } else {
    // Admin escreveu primeiro, cliente ainda sem sessao. Sem criar aqui, a
    // proxima mensagem dele cairia no fluxo padrao e a Iris atropelaria o
    // atendimento humano que acabou de comecar.
    await supabase
      .from("bot_sessions")
      .insert({ phone: telefone, step: novoStep, criado_em: agora, atualizado_em: agora });
  }

  await supabase.from("bot_logs").insert({
    payload: {
      tipo: devolverPraIris ? "admin_devolveu_pra_iris" : "admin_respondeu_pelo_painel",
      phone_masked: telefone.replace(/\d(?=\d{4})/g, "*"),
      tamanho: texto.length,
    },
  });

  return NextResponse.json({ ok: true, step: novoStep, devolvidoPraIris: devolverPraIris });
}
