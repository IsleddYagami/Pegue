// Helper pra salvar fotos de PROVAS DIGITAIS (coleta/entrega) de corridas
// no Supabase Storage. Bucket separado de prestadores-docs porque tem
// politicas/lifecycle diferentes (proof retention legal eh longa).
//
// Bucket: provas-digitais (criar manualmente no Supabase Dashboard ou via
// migration). Public bucket — URLs sao dificeis de adivinhar (UUID corrida).

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

const BUCKET = "provas-digitais";

export type TipoProva = "coleta" | "entrega";

// Baixa foto do ChatPro e salva no Storage. Retorna URL publica permanente.
// Tambem registra na tabela provas_digitais (FK pra corrida).
export async function salvarProvaDigital(
  chatproUrl: string,
  corridaId: string,
  tipo: TipoProva,
  ordem: number = 1
): Promise<{ url: string | null; provaId: string | null }> {
  try {
    // 1. Baixa do ChatPro
    const response = await fetch(chatproUrl);
    if (!response.ok) {
      console.error(`Erro baixando prova ${tipo} da ChatPro:`, response.status);
      return { url: null, provaId: null };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "image/jpeg";
    let ext = "jpg";
    if (contentType.includes("png")) ext = "png";
    else if (contentType.includes("webp")) ext = "webp";

    // 2. Upload pro Storage. Path: provas-digitais/{corridaId}/{tipo}-{ordem}-{timestamp}.jpg
    const path = `${corridaId}/${tipo}-${ordem}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });

    if (uploadError) {
      console.error(`Erro upload prova ${tipo}:`, uploadError.message);
      return { url: null, provaId: null };
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = urlData?.publicUrl || null;

    // 3. Registra na tabela provas_digitais (schema migration-001)
    const { data: prova, error: insertError } = await supabase
      .from("provas_digitais")
      .insert({
        corrida_id: corridaId,
        tipo,
        foto_url: url,
        metadata: { ordem, content_type: contentType, bytes: buffer.length },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error(`Erro inserir prova_digital ${tipo}:`, insertError.message);
      return { url, provaId: null };
    }

    return { url, provaId: prova?.id || null };
  } catch (e: any) {
    console.error(`Excecao salvar prova ${tipo}:`, e?.message);
    return { url: null, provaId: null };
  }
}

// Conta provas ja salvas pra essa corrida + tipo (pra calcular ordem da proxima).
export async function contarProvas(corridaId: string, tipo: TipoProva): Promise<number> {
  const { count } = await supabase
    .from("provas_digitais")
    .select("id", { count: "exact", head: true })
    .eq("corrida_id", corridaId)
    .eq("tipo", tipo);
  return count ?? 0;
}
