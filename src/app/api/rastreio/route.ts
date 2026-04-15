import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { distanciaRetaKm } from "@/lib/bot-utils";
import { sendMessage } from "@/lib/chatpro";
import { MSG } from "@/lib/bot-messages";
import { updateSession } from "@/lib/bot-sessions";

export const dynamic = "force-dynamic";

const RAIO_CHEGADA_KM = 0.2; // 200 metros

// POST - fretista envia GPS
export async function POST(req: NextRequest) {
  try {
    const { token, lat, lng, accuracy } = await req.json();

    if (!token || !lat || !lng) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    // Busca corrida pelo token
    const { data: corrida } = await supabase
      .from("corridas")
      .select("id, destino_lat, destino_lng, destino_endereco, chegou_destino, rastreio_ativo, cliente_id, descricao_carga, clientes(telefone)")
      .eq("rastreio_token", token)
      .single();

    if (!corrida) {
      return NextResponse.json({ error: "Token invalido" }, { status: 403 });
    }

    if (!corrida.rastreio_ativo) {
      return NextResponse.json({ error: "Rastreio inativo", finalizado: true }, { status: 200 });
    }

    // Rate limit simples - ignora se ultimo update < 10s
    const { data: ultimo } = await supabase
      .from("rastreio_localizacoes")
      .select("criado_em")
      .eq("corrida_id", corrida.id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .single();

    if (ultimo) {
      const diff = Date.now() - new Date(ultimo.criado_em).getTime();
      if (diff < 10000) {
        return NextResponse.json({ ok: true, ignorado: true });
      }
    }

    // Salva localizacao
    await supabase.from("rastreio_localizacoes").insert({
      corrida_id: corrida.id,
      lat,
      lng,
      accuracy: accuracy || null,
    });

    // Checa proximidade do destino
    let distancia_km = null;
    let chegou = false;

    if (corrida.destino_lat && corrida.destino_lng) {
      distancia_km = distanciaRetaKm(lat, lng, corrida.destino_lat, corrida.destino_lng);

      // Se esta a menos de 200m e ainda nao marcou como chegou
      if (distancia_km < RAIO_CHEGADA_KM && !corrida.chegou_destino) {
        chegou = true;

        // Marca como chegou
        await supabase
          .from("corridas")
          .update({ chegou_destino: true })
          .eq("id", corrida.id);

        // Dispara confirmacao pro cliente via WhatsApp
        const clienteTel = (corrida.clientes as any)?.telefone;
        if (clienteTel) {
          await updateSession(clienteTel, {
            step: "aguardando_confirmacao_entrega",
            corrida_id: corrida.id,
          });

          await sendMessage({
            to: clienteTel,
            message: MSG.fretistaChegouDestino,
          });

          // Lembrete apos 10 min
          setTimeout(async () => {
            try {
              const { data: sessao } = await supabase
                .from("bot_sessions")
                .select("step")
                .eq("phone", clienteTel)
                .single();
              if (sessao?.step === "aguardando_confirmacao_entrega") {
                await sendMessage({ to: clienteTel, message: MSG.lembreteConfirmacao });
              }
            } catch {}
          }, 10 * 60 * 1000);

          // Apos 20 min: libera fretista
          setTimeout(async () => {
            try {
              const { data: sessao } = await supabase
                .from("bot_sessions")
                .select("step")
                .eq("phone", clienteTel)
                .single();
              if (sessao?.step === "aguardando_confirmacao_entrega") {
                // Notifica Santos
                await sendMessage({
                  to: "5511970363713",
                  message: `⚠️ *Cliente nao confirmou entrega ha 20 min!*\n\nCliente: ${clienteTel}\nCorrida: ${corrida.id}\n\nVerifique e resolva!`,
                });
              }
            } catch {}
          }, 20 * 60 * 1000);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      distancia_km: distancia_km ? Math.round(distancia_km * 100) / 100 : null,
      chegou,
    });
  } catch (error: any) {
    console.error("Erro rastreio POST:", error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

// GET - busca dados da corrida e ultima localizacao
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token obrigatorio" }, { status: 400 });
  }

  // Busca corrida
  const { data: corrida } = await supabase
    .from("corridas")
    .select("id, codigo, status, origem_endereco, origem_lat, origem_lng, destino_endereco, destino_lat, destino_lng, distancia_km, rastreio_ativo, chegou_destino, descricao_carga, tipo_veiculo, prestador_id, prestadores(nome, telefone)")
    .eq("rastreio_token", token)
    .single();

  if (!corrida) {
    return NextResponse.json({ error: "Token invalido" }, { status: 403 });
  }

  // Busca ultima localizacao
  const { data: ultimaLoc } = await supabase
    .from("rastreio_localizacoes")
    .select("lat, lng, criado_em")
    .eq("corrida_id", corrida.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .single();

  // Calcula distancia restante
  let distancia_restante = null;
  if (ultimaLoc && corrida.destino_lat && corrida.destino_lng) {
    distancia_restante = Math.round(
      distanciaRetaKm(ultimaLoc.lat, ultimaLoc.lng, corrida.destino_lat, corrida.destino_lng) * 10
    ) / 10;
  }

  return NextResponse.json({
    corrida_id: corrida.id,
    codigo: corrida.codigo,
    status: corrida.status,
    rastreio_ativo: corrida.rastreio_ativo,
    chegou_destino: corrida.chegou_destino,
    origem: {
      endereco: corrida.origem_endereco,
      lat: corrida.origem_lat,
      lng: corrida.origem_lng,
    },
    destino: {
      endereco: corrida.destino_endereco,
      lat: corrida.destino_lat,
      lng: corrida.destino_lng,
    },
    distancia_total_km: corrida.distancia_km,
    distancia_restante_km: distancia_restante,
    carga: corrida.descricao_carga,
    veiculo: corrida.tipo_veiculo,
    prestador: corrida.prestadores
      ? { nome: (corrida.prestadores as any).nome }
      : null,
    ultima_localizacao: ultimaLoc
      ? { lat: ultimaLoc.lat, lng: ultimaLoc.lng, atualizado_em: ultimaLoc.criado_em }
      : null,
  });
}
