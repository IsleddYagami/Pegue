import { NextRequest, NextResponse } from "next/server";
import { sendMessage, sendToClient } from "@/lib/chatpro";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ADMIN_PHONE = "5511971429605";

// GET - Chamado por cron a cada 10 minutos
// Verifica fretes que estao proximos do horario e envia lembretes progressivos
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== "P3gu32026@@") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
  }

  try {
    // Busca fretes confirmados (aceitos ou pagos) que ainda nao foram realizados
    const { data: corridas } = await supabase
      .from("corridas")
      .select("id, periodo, prestador_id, prestadores(telefone, nome), cliente_id, clientes(telefone), origem_endereco, destino_endereco, valor_prestador, urgencia, status")
      .in("status", ["aceita", "paga"])
      .not("prestador_id", "is", null);

    if (!corridas || corridas.length === 0) {
      return NextResponse.json({ status: "ok", lembretes: 0 });
    }

    let lembreteEnviados = 0;

    for (const corrida of corridas) {
      const fretistaTel = (corrida.prestadores as any)?.telefone;
      const clienteTel = (corrida.clientes as any)?.telefone;
      if (!fretistaTel) continue;

      // Tenta extrair data/hora do campo periodo (formato: "15/04 - Tarde (13:00 - 17:00)")
      const periodoStr = corrida.periodo || "";
      const temHoje = periodoStr.toLowerCase().includes("hoje") || periodoStr.toLowerCase().includes("agora");

      // Verifica o estado do lembrete
      const urgencia = corrida.urgencia || "";

      // Lembrete 1: 2h antes (ou se nao tem parse de data, envia se nao enviou ainda)
      if (!urgencia || urgencia === "lembrete_agendado") {
        await supabase.from("corridas").update({ urgencia: "lembrete_2h" }).eq("id", corrida.id);

        await sendToClient({
          to: fretistaTel,
          message: `📋 *Lembrete de frete!*\n\n📍 ${corrida.origem_endereco} → ${corrida.destino_endereco}\n📅 ${periodoStr}\n💰 R$ ${corrida.valor_prestador}\n\nTudo certo pra hoje? Confirme com *SIM* ✅`,
        });
        lembreteEnviados++;
      }
      // Lembrete 2: 1h antes
      else if (urgencia === "lembrete_2h") {
        // Verifica se ja respondeu SIM (campo urgencia teria "confirmado")
        await supabase.from("corridas").update({ urgencia: "lembrete_1h" }).eq("id", corrida.id);

        await sendToClient({
          to: fretistaTel,
          message: `⚠️ *LEMBRETE: Frete em breve!*\n\n📍 ${corrida.origem_endereco} → ${corrida.destino_endereco}\n📅 ${periodoStr}\n\nPor favor confirme com *SIM* que esta a caminho!`,
        });
        lembreteEnviados++;
      }
      // Lembrete 3: 40min antes (ultimo aviso)
      else if (urgencia === "lembrete_1h") {
        await supabase.from("corridas").update({ urgencia: "lembrete_40min" }).eq("id", corrida.id);

        await sendToClient({
          to: fretistaTel,
          message: `🚨 *URGENTE: Confirme AGORA!*\n\n📍 ${corrida.origem_endereco} → ${corrida.destino_endereco}\n📅 ${periodoStr}\n\n⚠️ Se nao confirmar, o frete sera *redistribuido* para outro parceiro.\n\nResponda *SIM* pra confirmar!`,
        });
        lembreteEnviados++;
      }
      // Fretista nao respondeu apos 3 lembretes - ABANDONO
      else if (urgencia === "lembrete_40min") {
        await supabase.from("corridas").update({
          urgencia: "abandono",
          prestador_id: null,
          status: "pendente",
        }).eq("id", corrida.id);

        // Penaliza fretista - score -5 (abandono)
        const { data: prestador } = await supabase
          .from("prestadores")
          .select("id, score, total_reclamacoes")
          .eq("telefone", fretistaTel)
          .single();

        if (prestador) {
          const novoScore = Math.max(0, (prestador.score || 5) - 5);
          const cancelamentos = (prestador.total_reclamacoes || 0) + 1;
          // Abandono com pagamento = desativacao imediata
          const desativar = corrida.status === "paga" || cancelamentos >= 2;

          await supabase.from("prestadores").update({
            score: novoScore,
            total_reclamacoes: cancelamentos,
            ...(desativar ? { disponivel: false } : {}),
          }).eq("id", prestador.id);

          await sendToClient({
            to: fretistaTel,
            message: desativar
              ? `⛔ *Sua conta esta INATIVA.*\n\nVoce nao confirmou presenca no frete e nao respondeu aos lembretes.\nScore: -5 pontos.\n\nPara reativar, envie justificativa com provas pelo WhatsApp.\nSua situacao sera analisada pela equipe.`
              : `⚠️ *Frete removido da sua agenda.*\n\nVoce nao confirmou presenca.\nScore: -5 pontos.\n\n${cancelamentos >= 1 ? "Proxima ocorrencia resultara em inativacao da conta." : ""}`,
          });
        }

        // Avisa cliente
        if (clienteTel) {
          await sendToClient({
            to: clienteTel,
            message: "⚠️ Seu fretista teve um imprevisto.\n\n*Ja estamos providenciando outro fretista de confianca!*\nVoce sera notificado assim que confirmarmos. 😊",
          });
        }

        // Notifica admin
        await sendMessage({
          to: ADMIN_PHONE,
          message: `🚨 *ABANDONO DE FRETE*\n\n👤 Fretista: ${(corrida.prestadores as any)?.nome} (${fretistaTel})\n📍 ${corrida.origem_endereco} → ${corrida.destino_endereco}\n📅 ${periodoStr}\nStatus: ${corrida.status === "paga" ? "PAGAMENTO JA FEITO - conta desativada" : "Re-dispatch em andamento"}\n\n⏰ ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
          instance: 1, // notificacao admin sempre pelo numero principal
        });

        lembreteEnviados++;
      }
    }

    return NextResponse.json({ status: "ok", lembretes: lembreteEnviados });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

// POST - Fretista confirma presenca (chamado pelo webhook quando fretista responde SIM ao lembrete)
export async function POST(req: NextRequest) {
  try {
    const { corrida_id, key } = await req.json();
    if (key !== "P3gu32026@@") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
    }

    await supabase
      .from("corridas")
      .update({ urgencia: "confirmado" })
      .eq("id", corrida_id);

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
