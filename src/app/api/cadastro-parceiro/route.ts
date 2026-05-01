import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { formatarTelefoneExibicao } from "@/lib/bot-utils";
import { notificarAdmins } from "@/lib/admin-notify";
import { isPlacaValida, normalizarPlaca } from "@/lib/validators-cadastro";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// BUG #BATCH5-4 (re-audit 1/Mai/2026): endpoint publico sem rate limit ou
// validacao real. Atacante podia spammar prestadores com placa "X", CPF
// "123", email "lixo" — infinitamente, sujando a base. Agora:
// - Rate limit 5 req/min/IP
// - Validacao formato real (placa Mercosul/antigo, CPF 11 dig, email regex)
// - Notifica admin SO se valido (impede spam de notificacoes)
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit({ chave: `cad_parceiro_pub:${ip}`, max: 5 });
  if (!rl.permitido) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 1 minuto." },
      { status: 429 },
    );
  }

  try {
    const body = await req.json();
    const { nome, cpf, email, telefone, tipoVeiculo, placa } = body;

    if (!nome || !cpf || !email || !telefone || !tipoVeiculo || !placa) {
      return NextResponse.json({ error: "Preencha todos os campos" }, { status: 400 });
    }

    // Validacao real (paridade com admin-cadastrar-prestador e bot WhatsApp).
    if (typeof nome !== "string" || nome.trim().length < 3 || nome.length > 120) {
      return NextResponse.json({ error: "Nome invalido (3-120 caracteres)" }, { status: 400 });
    }
    const cpfLimpo = String(cpf).replace(/\D/g, "");
    if (cpfLimpo.length !== 11) {
      return NextResponse.json({ error: "CPF precisa ter 11 digitos" }, { status: 400 });
    }
    const emailLimpo = String(email).trim().toLowerCase();
    if (!REGEX_EMAIL.test(emailLimpo)) {
      return NextResponse.json({ error: "Email invalido" }, { status: 400 });
    }
    if (!isPlacaValida(placa)) {
      return NextResponse.json({
        error: "Placa invalida. Use formato ABC1234 (antigo) ou ABC1D23 (Mercosul).",
      }, { status: 400 });
    }
    const tiposValidos = ["carro_comum", "utilitario", "hr", "caminhao_bau", "guincho", "moto_guincho"];
    if (!tiposValidos.includes(tipoVeiculo)) {
      return NextResponse.json({ error: "Tipo de veiculo invalido" }, { status: 400 });
    }

    const telLimpo = String(telefone).replace(/\D/g, "");
    if (telLimpo.length < 10 || telLimpo.length > 13) {
      return NextResponse.json({ error: "Telefone invalido" }, { status: 400 });
    }
    const telCompleto = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
    const placaNormalizada = normalizarPlaca(placa);

    // Verifica se ja existe
    const { data: existe } = await supabase
      .from("prestadores")
      .select("id")
      .eq("telefone", telCompleto)
      .single();

    if (existe) {
      return NextResponse.json({ error: "Este telefone ja possui cadastro" }, { status: 400 });
    }

    // Salva prestador (com valores normalizados)
    const nomeLimpo = nome.trim();
    const { error: errPrestador } = await supabase.from("prestadores").insert({
      telefone: telCompleto,
      nome: nomeLimpo,
      cpf: cpfLimpo,
      email: emailLimpo,
      status: "pendente",
      score: 5.0,
      total_corridas: 0,
      total_reclamacoes: 0,
      disponivel: false,
      termos_aceitos: false,
    });

    if (errPrestador) {
      return NextResponse.json({ error: "Erro ao cadastrar" }, { status: 500 });
    }

    // Salva veiculo
    const { data: prestador } = await supabase
      .from("prestadores")
      .select("id")
      .eq("telefone", telCompleto)
      .single();

    if (prestador) {
      await supabase.from("prestadores_veiculos").insert({
        prestador_id: prestador.id,
        tipo: tipoVeiculo,
        placa: placaNormalizada,
        ativo: true,
      });
    }

    // Registra pre-cadastro
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "pre_cadastro_site",
        nome: nomeLimpo,
        email: emailLimpo,
        telefone: telCompleto,
        tipoVeiculo,
        placa: placaNormalizada,
        data_hora: new Date().toISOString(),
      },
    });

    // Notifica admins configurados em ADMIN_PHONES
    // NOTA: pre-cadastros foram classificados como "dashboard apenas" (Fabio preferiu
    // nao receber tudo no WhatsApp). Mantem o envio pra nao silenciar algo importante,
    // mas com titulo curto. Se spammar, trocar por log so no dashboard.
    try {
      await notificarAdmins(
        `🆕 *Novo pre-cadastro pelo site*`,
        telCompleto,
        `👤 ${nomeLimpo}\n📱 ${formatarTelefoneExibicao(telCompleto)}\n📧 ${emailLimpo}\n🚗 ${tipoVeiculo}\n🪪 Placa: ${placaNormalizada}\n\n⚠️ Faltam fotos - aguarde envio pelo WhatsApp`
      );
    } catch (e: any) {
      console.error("Falha notificar admin sobre pre-cadastro:", e?.message);
    }

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
