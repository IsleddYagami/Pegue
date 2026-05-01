// Helper pra salvar fotos de prestadores de forma permanente no Supabase Storage.
// Motivo: URLs do ChatPro expiram em ~14-30 dias. Pra ter prova juridica
// duradoura e conseguir mostrar a foto depois, baixamos e guardamos no nosso
// proprio bucket.
//
// SEGURANCA (refactor 1/Mai/2026):
//   - Bucket DEVE ser PRIVATIZADO no Supabase Dashboard (Storage -> Settings)
//   - Salvamos PATH interno (ex: "5511...../selfie-1234.jpg") na coluna selfie_url
//   - Helper getFotoSignedUrl gera signed URL on-demand (TTL 7d — emails de
//     arquivamento podem precisar acessar dias depois pra anexar)
//   - Compat: se foto_url ja for URL publica antiga (legado pre-refactor),
//     retorna ela mesma sem signar.

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

const BUCKET = "prestadores-docs";
const SIGNED_URL_TTL_SEGUNDOS = 60 * 60 * 24 * 7; // 7 dias — pra emails

export type TipoFotoPrestador = "selfie" | "documento" | "placa" | "veiculo";

// Detecta se valor eh path interno (novo padrao) ou URL completa (legado).
function ehPathInterno(s: string | null | undefined): boolean {
  if (!s) return false;
  return !s.startsWith("http");
}

// Gera signed URL pra path interno. URLs legadas (http*) sao retornadas
// como estao (compat — vao parar de funcionar quando bucket for privatizado).
export async function getFotoPrestadorSignedUrl(fotoUrlOuPath: string | null): Promise<string | null> {
  if (!fotoUrlOuPath) return null;
  if (!ehPathInterno(fotoUrlOuPath)) return fotoUrlOuPath; // legado
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(fotoUrlOuPath, SIGNED_URL_TTL_SEGUNDOS);
  if (error || !data?.signedUrl) {
    console.error("getFotoPrestadorSignedUrl falhou:", error?.message);
    return null;
  }
  return data.signedUrl;
}

// Baixa a foto da URL do ChatPro e sobe pro Supabase Storage.
// Retorna o PATH interno (string sem http) — consumidores devem chamar
// getFotoPrestadorSignedUrl pra obter URL acessavel quando precisarem.
//
// `id` pode ser o phone do prestador (durante cadastro) ou o UUID dele
// (depois de criado).
export async function uploadFotoPrestador(
  chatproUrl: string,
  id: string,
  tipo: TipoFotoPrestador,
): Promise<string | null> {
  try {
    const response = await fetch(chatproUrl);
    if (!response.ok) {
      console.error(`Erro baixando foto ChatPro (${tipo}):`, response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const contentType = response.headers.get("content-type") || "image/jpeg";
    let ext = "jpg";
    if (contentType.includes("png")) ext = "png";
    else if (contentType.includes("webp")) ext = "webp";

    // Path organizado por prestador: {prestadorId}/{tipo}-{timestamp}.jpg
    const path = `${id}/${tipo}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });

    if (uploadError) {
      console.error(`Erro upload storage (${tipo}):`, uploadError.message);
      return null;
    }

    // Retorna PATH (nao URL publica). Quem precisar exibir/anexar deve
    // chamar getFotoPrestadorSignedUrl(path).
    return path;
  } catch (e: any) {
    console.error(`Excecao upload foto prestador (${tipo}):`, e?.message);
    return null;
  }
}

// Helper pra upload direto de Buffer (admin-cadastrar-prestador usa formData).
// Mesma logica: retorna PATH em vez de URL publica.
export async function uploadFotoPrestadorBuffer(
  buffer: Buffer,
  contentType: string,
  prestadorId: string,
  tipo: TipoFotoPrestador,
): Promise<string | null> {
  try {
    let ext = "jpg";
    if (contentType.includes("png")) ext = "png";
    else if (contentType.includes("webp")) ext = "webp";

    const path = `${prestadorId}/${tipo}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (error) {
      console.error(`Erro upload buffer ${tipo}:`, error.message);
      return null;
    }
    return path;
  } catch (e: any) {
    console.error(`Excecao upload buffer ${tipo}:`, e?.message);
    return null;
  }
}
