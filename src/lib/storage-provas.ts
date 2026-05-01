// Helper pra salvar fotos de PROVAS DIGITAIS (coleta/entrega) de corridas
// no Supabase Storage. Bucket separado de prestadores-docs porque tem
// politicas/lifecycle diferentes (proof retention legal eh longa).
//
// Bucket: provas-digitais. PRIVATIZAR no Supabase Dashboard pra evitar
// acesso direto via URL guess (atualmente URLs publicas usam UUID corrida
// como path — adivinhavel se atacante souber UUIDs).
//
// Estrategia atual:
//   - Salvar PATH (string interna) na coluna foto_url, NAO URL publica
//   - Gerar signed URL on-demand via getProvaSignedUrl quando admin precisar
//   - Signed URL tem TTL curta (1h) e nao funciona depois de expirar
//   - Mesmo se bucket for privatizado, signed URLs continuam funcionando

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

const BUCKET = "provas-digitais";
const SIGNED_URL_TTL_SEGUNDOS = 60 * 60; // 1h

export type TipoProva = "coleta" | "entrega" | "ocorrencia";

// Detecta se um valor em foto_url eh path interno (novo) ou URL completa
// (legado, gravado antes da migration de seguranca).
function ehPathInterno(s: string | null | undefined): boolean {
  if (!s) return false;
  return !s.startsWith("http");
}

// Gera signed URL pra um path interno do bucket. TTL curta (1h) por seguranca.
// Aceita tambem URL legada (http*) — retorna ela mesma sem signed (compat).
export async function getProvaSignedUrl(fotoUrlOuPath: string | null): Promise<string | null> {
  if (!fotoUrlOuPath) return null;
  if (!ehPathInterno(fotoUrlOuPath)) return fotoUrlOuPath; // legado: URL publica antiga

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(fotoUrlOuPath, SIGNED_URL_TTL_SEGUNDOS);

  if (error || !data?.signedUrl) {
    console.error("getProvaSignedUrl falhou:", error?.message);
    return null;
  }
  return data.signedUrl;
}

// Baixa foto do ChatPro e salva no Storage. Grava PATH interno (nao URL)
// em provas_digitais.foto_url. Consumidores devem chamar getProvaSignedUrl
// pra obter URL acessavel.
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

    // 2. Upload pro Storage. Path: {corridaId}/{tipo}-{ordem}-{timestamp}.{ext}
    const path = `${corridaId}/${tipo}-${ordem}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });

    if (uploadError) {
      console.error(`Erro upload prova ${tipo}:`, uploadError.message);
      return { url: null, provaId: null };
    }

    // 3. Registra PATH (nao URL) na tabela. Consumidores geram signed URL.
    const { data: prova, error: insertError } = await supabase
      .from("provas_digitais")
      .insert({
        corrida_id: corridaId,
        tipo,
        foto_url: path, // path interno (string sem "http")
        metadata: { ordem, content_type: contentType, bytes: buffer.length },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error(`Erro inserir prova_digital ${tipo}:`, insertError.message);
      return { url: path, provaId: null };
    }

    // Pro retorno imediato (callers que querem mostrar logo), gera signed URL
    const signed = await getProvaSignedUrl(path);
    return { url: signed, provaId: prova?.id || null };
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

// Helper pra salvar SO no Storage (sem registrar em provas_digitais).
// Usado pra ocorrencias - foto vai pra coluna `ocorrencias.foto_url` direto
// (a tabela ocorrencias ja tem registro proprio, nao precisa duplicar em
// provas_digitais que eh focada em coleta/entrega).
//
// Audit 1/Mai/2026: BUG #F6-1 — antes salvava URL temporaria do ChatPro
// (expira ~30d). Prova juridica das ocorrencias virava lixo apos um mes.
export async function salvarFotoOcorrencia(
  chatproUrl: string,
  ocorrenciaId: string,
): Promise<string | null> {
  try {
    const response = await fetch(chatproUrl);
    if (!response.ok) {
      console.error(`Erro baixando foto ocorrencia da ChatPro:`, response.status);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "image/jpeg";
    let ext = "jpg";
    if (contentType.includes("png")) ext = "png";
    else if (contentType.includes("webp")) ext = "webp";

    // Path organizado: ocorrencias/{ocorrenciaId}-{timestamp}.{ext}
    const path = `ocorrencias/${ocorrenciaId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (uploadError) {
      console.error(`Erro upload foto ocorrencia:`, uploadError.message);
      return null;
    }
    return path; // PATH interno — caller usa getProvaSignedUrl pra exibir
  } catch (e: any) {
    console.error(`Excecao salvar foto ocorrencia:`, e?.message);
    return null;
  }
}
