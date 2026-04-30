import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { enviarEmailCadastroPrestador } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Dispara o email de arquivamento de um prestador JA cadastrado.
// Usa fotos reais do Supabase Storage. Util pra testar o envio ou
// pra re-arquivar caso o email original nao tenha chegado (ex: mudanca de FROM)
export async function POST(req: NextRequest) {
  try {
    const { key, phone } = await req.json();

    const auth = await requireAdminAuth(req, key);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!phone) {
      return NextResponse.json({ error: "phone obrigatorio" }, { status: 400 });
    }

    // Busca prestador + veiculo
    const { data: prestador, error: errFetch } = await supabase
      .from("prestadores")
      .select("nome, telefone, cpf, email, chave_pix, selfie_url, foto_placa_url, foto_veiculo_url, termos_aceitos_em, prestador_veiculos(tipo, placa)")
      .eq("telefone", phone)
      .maybeSingle();

    if (errFetch || !prestador) {
      return NextResponse.json({ error: "Prestador nao encontrado" }, { status: 404 });
    }

    const veic = (prestador as any).prestador_veiculos?.[0] || {};
    const dataAceite = prestador.termos_aceitos_em
      ? new Date(prestador.termos_aceitos_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const ok = await enviarEmailCadastroPrestador({
      nome: prestador.nome,
      telefone: prestador.telefone,
      cpf: prestador.cpf || "",
      email: prestador.email || "",
      chavePix: prestador.chave_pix || "",
      tipoVeiculo: veic.tipo || "-",
      placa: veic.placa || "-",
      selfieUrl: prestador.selfie_url,
      fotoPlacaUrl: prestador.foto_placa_url,
      fotoVeiculoUrl: prestador.foto_veiculo_url,
      dataAceite,
      origem: "admin_manual", // reenvio pelo admin
    });

    if (ok) {
      return NextResponse.json({
        status: "ok",
        mensagem: `Email de arquivamento disparado pra ${prestador.nome}. Confere fretesresgatespg@gmail.com e ioriiorivendas@gmail.com (pode levar alguns segundos, inclusive spam/promoções).`,
      });
    } else {
      return NextResponse.json({
        status: "falhou",
        error: "Envio retornou false. Verifica logs do Vercel ou dashboard do Resend.",
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
