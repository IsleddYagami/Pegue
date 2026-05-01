import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { sendToClient } from "@/lib/chatpro";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// BUG #BATCH5-1 (re-audit 1/Mai/2026): antes esse endpoint expunha dados
// pessoais (endereco origem/destino, telefones de fretistas, total gasto)
// pra QUALQUER pessoa que digitasse um phone valido — vazamento massivo
// de privacidade + violacao LGPD. Brute force trivial.
//
// Agora: 2 etapas (OTP via WhatsApp).
//   POST { action: "solicitar_otp", phone } -> gera codigo 6 dig + manda
//        pra WhatsApp do cliente. Codigo TTL 10min, max 3 tentativas.
//   GET ?phone=X&otp=YYYYYY -> valida OTP em bot_logs e retorna dados.
//
// Rate limit por IP em ambas:
//   - solicitar_otp: 3/min (impede flood de mensagens)
//   - validar (GET): 10/min (cliente legitimo erra digitacao algumas vezes)

const OTP_TTL_MS = 10 * 60 * 1000;

function gerarOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST: cliente solicita OTP. So manda pra phones que existem na base.
// Nao vaza se phone existe (resposta uniforme) pra evitar enumeracao.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit({ chave: `dashcli_otp:${ip}`, max: 3 });
  if (!rl.permitido) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 1 minuto." },
      { status: 429 },
    );
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body invalido" }, { status: 400 });
  }

  const phoneRaw = (body?.phone || "").toString().replace(/\D/g, "");
  if (phoneRaw.length < 12 || phoneRaw.length > 13) {
    return NextResponse.json({ error: "telefone invalido" }, { status: 400 });
  }

  // Busca cliente. Se nao existe, retorna sucesso falso (anti-enumeracao).
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, telefone")
    .eq("telefone", phoneRaw)
    .maybeSingle();

  if (cliente?.telefone) {
    const otp = gerarOtp();
    const expiraEm = new Date(Date.now() + OTP_TTL_MS).toISOString();

    // Salva OTP em bot_logs (TTL via campo expiraEm checado no GET)
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "dashboard_cliente_otp",
        phone: phoneRaw,
        otp,
        expira_em: expiraEm,
        tentativas: 0,
        ip_solicitante: ip.replace(/\d+$/, "x"),
      },
    });

    await sendToClient({
      to: phoneRaw,
      message: `🔐 *Codigo de acesso ao seu painel:*\n\n*${otp}*\n\nVale por 10 minutos. Se nao foi voce, ignore essa mensagem.`,
    });
  }

  // Resposta uniforme: nao revela se phone existe.
  return NextResponse.json({
    status: "ok",
    mensagem: "Se esse telefone tiver cadastro, um codigo foi enviado pelo WhatsApp.",
  });
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit({ chave: `dashcli_get:${ip}`, max: 10 });
  if (!rl.permitido) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 1 minuto." },
      { status: 429 },
    );
  }

  const phone = req.nextUrl.searchParams.get("phone")?.replace(/\D/g, "") || "";
  const otp = req.nextUrl.searchParams.get("otp")?.replace(/\D/g, "") || "";

  if (!phone || !otp || otp.length !== 6) {
    return NextResponse.json({ error: "phone e otp obrigatorios" }, { status: 400 });
  }

  // Busca OTP mais recente pra esse phone
  const { data: logsOtp } = await supabase
    .from("bot_logs")
    .select("id, payload, criado_em")
    .filter("payload->>tipo", "eq", "dashboard_cliente_otp")
    .filter("payload->>phone", "eq", phone)
    .order("criado_em", { ascending: false })
    .limit(1);

  if (!logsOtp || logsOtp.length === 0) {
    return NextResponse.json({ error: "codigo invalido ou expirado" }, { status: 401 });
  }

  const logRow = logsOtp[0];
  const payload = logRow.payload as any;

  // Expirou?
  if (payload.expira_em && new Date(payload.expira_em) < new Date()) {
    return NextResponse.json({ error: "codigo expirado" }, { status: 401 });
  }

  // Marcado como consumido?
  if (payload.consumido_em) {
    return NextResponse.json({ error: "codigo ja foi usado" }, { status: 401 });
  }

  // Tentativas excessivas?
  const tentativas = Number(payload.tentativas || 0);
  if (tentativas >= 3) {
    return NextResponse.json({ error: "muitas tentativas erradas" }, { status: 401 });
  }

  // Compara OTP
  if (payload.otp !== otp) {
    // Incrementa tentativas
    await supabase
      .from("bot_logs")
      .update({ payload: { ...payload, tentativas: tentativas + 1 } })
      .eq("id", logRow.id);
    return NextResponse.json({ error: "codigo incorreto" }, { status: 401 });
  }

  // OTP OK — marca como consumido (single-use)
  await supabase
    .from("bot_logs")
    .update({
      payload: {
        ...payload,
        consumido_em: new Date().toISOString(),
        consumido_ip: ip.replace(/\d+$/, "x"),
      },
    })
    .eq("id", logRow.id);

  // Busca cliente e retorna dados (cleanup do codigo OK)
  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome, telefone, nivel, total_corridas, nota_media")
    .eq("telefone", phone)
    .single();

  if (!cliente) {
    return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
  }

  const { data: corridas } = await supabase
    .from("corridas")
    .select("id, origem_endereco, destino_endereco, descricao_carga, valor_final, status, periodo, criado_em, prestador_id, prestadores(nome, telefone)")
    .eq("cliente_id", cliente.id)
    .order("criado_em", { ascending: false });

  const todasCorridas = corridas || [];
  const corridasConcluidas = todasCorridas.filter(c => c.status === "concluida");

  const totalGasto = corridasConcluidas.reduce((sum, c) => sum + (c.valor_final || 0), 0);

  const fretistasMap: Record<string, { nome: string; telefone: string; qtd: number }> = {};
  corridasConcluidas.forEach(c => {
    const prest = c.prestadores as any;
    if (prest?.nome) {
      const key = prest.telefone || prest.nome;
      if (!fretistasMap[key]) {
        fretistasMap[key] = { nome: prest.nome, telefone: prest.telefone, qtd: 0 };
      }
      fretistasMap[key].qtd++;
    }
  });
  const fretistasFrequentes = Object.values(fretistasMap)
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 5);

  const historico = todasCorridas.slice(0, 10).map(c => {
    const prest = c.prestadores as any;
    return {
      origem: c.origem_endereco || "---",
      destino: c.destino_endereco || "---",
      carga: c.descricao_carga || "---",
      valor: c.valor_final || 0,
      data: c.periodo || new Date(c.criado_em).toLocaleDateString("pt-BR"),
      status: c.status,
      fretista: prest?.nome || null,
    };
  });

  const freteAtivo = todasCorridas.find(c =>
    ["pendente", "aceita", "paga"].includes(c.status)
  );

  return NextResponse.json({
    nome: cliente.nome || "Cliente",
    nivel: cliente.nivel || "bronze",
    totalServicos: corridasConcluidas.length,
    totalGasto,
    fretistasFrequentes,
    historico,
    freteAtivo: freteAtivo ? {
      destino: freteAtivo.destino_endereco,
      carga: freteAtivo.descricao_carga,
      status: freteAtivo.status,
      valor: freteAtivo.valor_final,
    } : null,
  });
}
