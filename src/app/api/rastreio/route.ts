import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { distanciaRetaKm } from "@/lib/bot-utils";
import { sendToClient } from "@/lib/chatpro";
import { MSG } from "@/lib/bot-messages";
import { updateSession, agendarTarefa } from "@/lib/bot-sessions";

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

          await sendToClient({
            to: clienteTel,
            message: MSG.fretistaChegouDestino,
          });

          // Timeouts agora sao tarefas agendadas (cron /api/cron/tarefas-agendadas)
          // setTimeout em route handler serverless nao sobrevive ao fim da request.
          await agendarTarefa(
            "rastreio_lembrete_confirmacao",
            corrida.id,
            10 * 60 * 1000
          );
          await agendarTarefa(
            "rastreio_libera_fretista",
            corrida.id,
            20 * 60 * 1000
          );
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

  // Identidade do fretista pro cliente que contratou: nome, veiculo, placa e nota.
  // So quem tem o token (o link que foi pro WhatsApp dele) ve isso. Documento e
  // selfie do cadastro NAO entram aqui — sao prova de verificacao, nao vitrine.
  let prestadorInfo: {
    nome: string;
    placa: string | null;
    veiculo_desc: string | null;
    nota: number | null;
    total_corridas: number | null;
  } | null = null;

  if (corrida.prestador_id) {
    const [veic, aval, prest] = await Promise.all([
      supabase
        .from("prestadores_veiculos")
        .select("marca, modelo, placa")
        .eq("prestador_id", corrida.prestador_id)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle(),
      supabase.from("avaliacoes").select("nota").eq("prestador_id", corrida.prestador_id),
      supabase
        .from("prestadores")
        .select("total_corridas")
        .eq("id", corrida.prestador_id)
        .maybeSingle(),
    ]);

    const notas = (aval.data || [])
      .map((a) => a.nota)
      .filter((n): n is number => typeof n === "number" && n > 0);

    prestadorInfo = {
      nome: (corrida.prestadores as any)?.nome || "Fretista",
      placa: veic.data?.placa || null,
      veiculo_desc: veic.data
        ? [veic.data.marca, veic.data.modelo].filter(Boolean).join(" ") || null
        : null,
      nota:
        notas.length > 0
          ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10
          : null,
      total_corridas: prest.data?.total_corridas ?? null,
    };
  }

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
    prestador: prestadorInfo,
    ultima_localizacao: ultimaLoc
      ? { lat: ultimaLoc.lat, lng: ultimaLoc.lng, atualizado_em: ultimaLoc.criado_em }
      : null,
  });
}
