import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isValidAdminKey } from "@/lib/admin-auth";
import { uploadFotoPrestador } from "@/lib/storage-prestadores";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // upload de 3 fotos pode demorar

// Cadastro manual de prestador pelo admin.
// Modo "completo": admin envia todos os dados + fotos -> status aprovado direto
// Modo "convite": admin envia dados basicos -> gera token e URL pra prestador finalizar via celular
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const key = formData.get("key")?.toString();

    if (!isValidAdminKey(key)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
    }

    const nome = formData.get("nome")?.toString().trim() || "";
    const telefone = (formData.get("telefone")?.toString() || "").replace(/\D/g, "");
    const cpf = (formData.get("cpf")?.toString() || "").replace(/\D/g, "");
    const email = formData.get("email")?.toString().trim().toLowerCase() || "";
    const chavePix = formData.get("chavePix")?.toString().trim() || "";
    const tipoVeiculo = formData.get("tipoVeiculo")?.toString().trim() || "";
    const placa = (formData.get("placa")?.toString() || "").toUpperCase().trim();
    const modo = formData.get("modo")?.toString() || "completo"; // "completo" ou "convite"

    // Validacoes basicas
    if (nome.length < 3) {
      return NextResponse.json({ error: "Nome invalido (minimo 3 caracteres)" }, { status: 400 });
    }
    if (telefone.length < 10 || telefone.length > 13) {
      return NextResponse.json({ error: "Telefone invalido" }, { status: 400 });
    }
    const telComDDI = telefone.startsWith("55") ? telefone : `55${telefone}`;

    if (cpf.length !== 11) {
      return NextResponse.json({ error: "CPF precisa ter 11 digitos" }, { status: 400 });
    }
    if (!email.includes("@") || !email.includes(".")) {
      return NextResponse.json({ error: "Email invalido" }, { status: 400 });
    }
    if (chavePix.length < 5) {
      return NextResponse.json({ error: "Chave Pix invalida" }, { status: 400 });
    }
    const tiposValidos = ["carro_comum", "utilitario", "hr", "caminhao_bau", "guincho", "moto_guincho"];
    if (!tiposValidos.includes(tipoVeiculo)) {
      return NextResponse.json({ error: "Tipo de veiculo invalido" }, { status: 400 });
    }
    if (placa.length < 7) {
      return NextResponse.json({ error: "Placa invalida" }, { status: 400 });
    }

    // Ja existe prestador com esse telefone?
    const { data: existe } = await supabase
      .from("prestadores")
      .select("id, status")
      .eq("telefone", telComDDI)
      .maybeSingle();

    if (existe) {
      return NextResponse.json({
        error: `Ja existe prestador cadastrado com esse telefone (status: ${existe.status})`,
      }, { status: 409 });
    }

    // Uploads das fotos (so se for modo completo)
    let selfieUrl = "";
    let fotoPlacaUrl = "";
    let fotoVeiculoUrl = "";

    if (modo === "completo") {
      const selfie = formData.get("selfie") as File | null;
      const fotoPlaca = formData.get("fotoPlaca") as File | null;
      const fotoVeiculo = formData.get("fotoVeiculo") as File | null;

      if (!selfie || !fotoPlaca || !fotoVeiculo) {
        return NextResponse.json({
          error: "No modo completo, as 3 fotos (selfie, placa, veiculo) sao obrigatorias",
        }, { status: 400 });
      }

      // Salva fotos temporariamente e faz upload
      selfieUrl = await uploadFileToStorage(selfie, telComDDI, "selfie") || "";
      fotoPlacaUrl = await uploadFileToStorage(fotoPlaca, telComDDI, "placa") || "";
      fotoVeiculoUrl = await uploadFileToStorage(fotoVeiculo, telComDDI, "veiculo") || "";

      if (!selfieUrl || !fotoPlacaUrl || !fotoVeiculoUrl) {
        return NextResponse.json({
          error: "Falha ao fazer upload de uma ou mais fotos. Tenta de novo.",
        }, { status: 500 });
      }
    }

    // Gera token de convite (se modo convite)
    let conviteToken: string | null = null;
    let conviteExpiraEm: string | null = null;
    let linkConvite: string | null = null;

    if (modo === "convite") {
      conviteToken = crypto.randomBytes(24).toString("hex");
      const expira = new Date();
      expira.setDate(expira.getDate() + 7); // 7 dias
      conviteExpiraEm = expira.toISOString();
      linkConvite = `https://www.chamepegue.com.br/completar-cadastro/${conviteToken}`;
    }

    // Insere prestador
    const agora = new Date().toISOString();
    const statusInicial = modo === "completo" ? "aprovado" : "pendente";

    const { data: novoPrestador, error: errInsert } = await supabase
      .from("prestadores")
      .insert({
        telefone: telComDDI,
        nome,
        cpf,
        email,
        chave_pix: chavePix,
        selfie_url: selfieUrl || null,
        foto_placa_url: fotoPlacaUrl || null,
        foto_veiculo_url: fotoVeiculoUrl || null,
        status: statusInicial,
        score: 5.0,
        total_corridas: 0,
        total_reclamacoes: 0,
        disponivel: modo === "completo",
        termos_aceitos: modo === "completo", // termos so sao "aceitos" quando completo
        termos_aceitos_em: modo === "completo" ? agora : null,
        termos_aceitos_ip: modo === "completo" ? "admin_cadastro_manual" : null,
        convite_token: conviteToken,
        convite_expira_em: conviteExpiraEm,
      })
      .select("id")
      .single();

    if (errInsert) {
      return NextResponse.json({
        error: `Erro ao salvar prestador: ${errInsert.message}`,
      }, { status: 500 });
    }

    // Insere veiculo
    if (novoPrestador) {
      await supabase.from("prestadores_veiculos").insert({
        prestador_id: novoPrestador.id,
        tipo: tipoVeiculo,
        placa,
        ativo: true,
      });
    }

    return NextResponse.json({
      status: "ok",
      prestadorId: novoPrestador?.id,
      modo,
      linkConvite, // so vem preenchido se modo === "convite"
      mensagem: modo === "completo"
        ? `Prestador ${nome} cadastrado e aprovado com sucesso!`
        : `Pre-cadastro de ${nome} criado. Envie o link abaixo pro prestador finalizar.`,
    });
  } catch (error: any) {
    console.error("Erro admin-cadastrar-prestador:", error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

// Upload de File (do FormData) pro Supabase Storage
async function uploadFileToStorage(file: File, phone: string, tipo: "selfie" | "placa" | "veiculo"): Promise<string | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = file.type || "image/jpeg";
    let ext = "jpg";
    if (contentType.includes("png")) ext = "png";
    else if (contentType.includes("webp")) ext = "webp";

    const path = `${phone}/${tipo}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("prestadores-docs")
      .upload(path, buffer, { contentType, upsert: false });
    if (error) {
      console.error(`Erro upload ${tipo}:`, error.message);
      return null;
    }
    const { data } = supabase.storage.from("prestadores-docs").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e: any) {
    console.error(`Excecao upload ${tipo}:`, e?.message);
    return null;
  }
}
