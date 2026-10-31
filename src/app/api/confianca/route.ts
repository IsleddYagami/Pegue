import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Numeros reais pro bloco de confianca do site. Agregado puro: contagem e media.
// NAO devolve nome, telefone, placa, foto nem nada que identifique fretista —
// as fotos do cadastro (selfie, documento, placa, veiculo) sao documento de
// verificacao, ficam em bucket privado e nao viram material de marketing.
//
// REGRA: desconhecido nunca e zero. Se a consulta falhar, o campo volta null e a
// tela mostra "—". Zero inventado e pior que campo vazio.

type Numero = number | null;

export async function GET() {
  const [fretistas, fretes, notas] = await Promise.all([
    supabase
      .from("prestadores")
      .select("id", { count: "exact", head: true })
      .eq("status", "aprovado"),
    supabase
      .from("corridas")
      .select("id", { count: "exact", head: true })
      .eq("status", "concluida"),
    supabase.from("avaliacoes").select("nota"),
  ]);

  const fretistasVerificados: Numero = fretistas.error ? null : fretistas.count ?? null;
  const fretesConcluidos: Numero = fretes.error ? null : fretes.count ?? null;

  let notaMedia: Numero = null;
  let totalAvaliacoes: Numero = null;
  if (!notas.error && notas.data) {
    const validas = notas.data
      .map((a) => a.nota)
      .filter((n): n is number => typeof n === "number" && n > 0);
    totalAvaliacoes = validas.length;
    if (validas.length > 0) {
      notaMedia = Math.round((validas.reduce((s, n) => s + n, 0) / validas.length) * 10) / 10;
    }
  }

  return NextResponse.json({
    fretistasVerificados,
    fretesConcluidos,
    notaMedia,
    totalAvaliacoes,
    // O que a Pegue confere em todo fretista antes de liberar, hoje, no cadastro
    // (migrations/2026-05-01_prestadores_foto_documento.sql).
    verificacoes: ["Documento com foto", "Selfie com o documento", "Placa do veículo", "Foto do veículo"],
  });
}
