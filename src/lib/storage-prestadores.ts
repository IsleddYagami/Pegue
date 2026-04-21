// Helper pra salvar fotos de prestadores de forma permanente no Supabase Storage
// Motivo: URLs do ChatPro expiram em ~14-30 dias. Pra ter prova juridica
// duradoura e conseguir mostrar a foto depois, baixamos e guardamos no nosso proprio
// bucket.

import { supabase } from "@/lib/supabase";

const BUCKET = "prestadores-docs";

export type TipoFotoPrestador = "selfie" | "placa" | "veiculo";

// Baixa a foto da URL do ChatPro e sobe pro Supabase Storage.
// Retorna a URL publica permanente.
// `id` pode ser o phone do prestador (durante cadastro) ou o UUID dele (depois de criado).
export async function uploadFotoPrestador(
  chatproUrl: string,
  id: string,
  tipo: TipoFotoPrestador
): Promise<string | null> {
  const prestadorId = id;
  try {
    // Baixa a foto
    const response = await fetch(chatproUrl);
    if (!response.ok) {
      console.error(`Erro baixando foto ChatPro (${tipo}):`, response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Detecta extensao pelo content-type (padrao jpg)
    const contentType = response.headers.get("content-type") || "image/jpeg";
    let ext = "jpg";
    if (contentType.includes("png")) ext = "png";
    else if (contentType.includes("webp")) ext = "webp";

    // Path organizado por prestador: prestadores-docs/{prestadorId}/{tipo}-{timestamp}.jpg
    const path = `${prestadorId}/${tipo}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error(`Erro upload storage (${tipo}):`, uploadError.message);
      return null;
    }

    // Pega URL publica permanente
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (e: any) {
    console.error(`Excecao upload foto prestador (${tipo}):`, e?.message);
    return null;
  }
}
