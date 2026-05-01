import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { uploadFotoPrestadorBuffer } from "@/lib/storage-prestadores";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Endpoint publico: recebe as 3 fotos do prestador que foi convidado via link
// Valida: token existe, nao expirou, e aplica o cadastro completando prestador
export async function POST(req: NextRequest) {
  try {
    // Rate limit: max 5 tentativas/minuto por IP (pra prevenir brute force de tokens)
    const ip = getClientIp(req);
    const rl = await checkRateLimit({ chave: `completar_cadastro:${ip}`, max: 5 });
    if (!rl.permitido) {
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde 1 minuto." },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const token = formData.get("token")?.toString().trim();

    if (!token) {
      return NextResponse.json({ error: "Token nao informado" }, { status: 400 });
    }

    // Busca prestador pelo token
    const { data: prestador, error: errFetch } = await supabase
      .from("prestadores")
      .select("id, telefone, nome, convite_expira_em, status, selfie_url, foto_placa_url, foto_veiculo_url")
      .eq("convite_token", token)
      .maybeSingle();

    if (errFetch || !prestador) {
      return NextResponse.json({ error: "Link de convite invalido" }, { status: 404 });
    }

    if (prestador.convite_expira_em && new Date(prestador.convite_expira_em) < new Date()) {
      return NextResponse.json({
        error: "Link de convite expirado. Entre em contato com a Pegue pra receber um novo.",
      }, { status: 410 });
    }

    if (prestador.status === "aprovado" && prestador.selfie_url) {
      return NextResponse.json({
        error: "Cadastro ja foi finalizado anteriormente.",
      }, { status: 409 });
    }

    const selfie = formData.get("selfie") as File | null;
    const fotoPlaca = formData.get("fotoPlaca") as File | null;
    const fotoVeiculo = formData.get("fotoVeiculo") as File | null;

    if (!selfie || !fotoPlaca || !fotoVeiculo) {
      return NextResponse.json({
        error: "As 3 fotos sao obrigatorias (selfie com RG/CNH, placa, veiculo inteiro)",
      }, { status: 400 });
    }

    // Upload das 3 fotos
    const selfieUrl = await uploadFile(selfie, prestador.telefone, "selfie");
    const fotoPlacaUrl = await uploadFile(fotoPlaca, prestador.telefone, "placa");
    const fotoVeiculoUrl = await uploadFile(fotoVeiculo, prestador.telefone, "veiculo");

    if (!selfieUrl || !fotoPlacaUrl || !fotoVeiculoUrl) {
      return NextResponse.json({
        error: "Falha ao fazer upload de uma ou mais fotos. Tenta de novo.",
      }, { status: 500 });
    }

    // Aprova prestador e invalida token
    const agora = new Date().toISOString();
    const { error: errUpdate } = await supabase
      .from("prestadores")
      .update({
        selfie_url: selfieUrl,
        foto_placa_url: fotoPlacaUrl,
        foto_veiculo_url: fotoVeiculoUrl,
        status: "aprovado",
        disponivel: true,
        termos_aceitos: true,
        termos_aceitos_em: agora,
        termos_aceitos_ip: "link_convite",
        convite_token: null, // invalida o link apos uso
        convite_expira_em: null,
      })
      .eq("id", prestador.id);

    if (errUpdate) {
      return NextResponse.json({ error: `Erro ao atualizar prestador: ${errUpdate.message}` }, { status: 500 });
    }

    // Busca dados completos pra email de arquivamento.
    // Audit 1/Mai/2026: corrigido typo "prestador_veiculos" -> "prestadores_veiculos"
    // (estava puxando undefined silenciosamente, email saia sem tipo/placa).
    try {
      const { data: completo } = await supabase
        .from("prestadores")
        .select("nome, telefone, cpf, email, chave_pix, prestadores_veiculos(tipo, placa)")
        .eq("id", prestador.id)
        .single();
      if (completo) {
        const veic = (completo as any).prestadores_veiculos?.[0] || {};
        const { enviarEmailCadastroPrestador } = await import("@/lib/email");
        await enviarEmailCadastroPrestador({
          nome: completo.nome,
          telefone: completo.telefone,
          cpf: completo.cpf,
          email: completo.email || "",
          chavePix: (completo as any).chave_pix || "",
          tipoVeiculo: veic.tipo || "",
          placa: veic.placa || "",
          selfieUrl, fotoPlacaUrl, fotoVeiculoUrl,
          dataAceite: agora,
          origem: "link_convite",
        });
      }
    } catch (e: any) {
      console.error("Erro email cadastro convite:", e?.message);
    }

    return NextResponse.json({
      status: "ok",
      mensagem: `Cadastro finalizado com sucesso, ${prestador.nome}! 🎉\n\nVoce ja esta aprovado e vai receber indicacoes de frete no WhatsApp.`,
      nome: prestador.nome,
    });
  } catch (error: any) {
    console.error("Erro completar-cadastro:", error?.message);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

// Audit 1/Mai/2026: refatorado pra usar uploadFotoPrestadorBuffer (centraliza logica)
// e retornar PATH em vez de getPublicUrl (bucket esta privado — URL publica nao funciona).
// Quem precisar exibir/anexar deve chamar getFotoPrestadorSignedUrl(path).
async function uploadFile(file: File, phone: string, tipo: "selfie" | "placa" | "veiculo"): Promise<string | null> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = file.type || "image/jpeg";
  return uploadFotoPrestadorBuffer(buffer, contentType, phone, tipo);
}
