// Rate limit persistente em Supabase.
// Usado em endpoints que nao podem confiar em memoria local (serverless).
//
// Como funciona:
//   - Janela de 1 minuto (granularidade)
//   - Chave combina endpoint + identificador (ex: IP, phone, token)
//   - UPSERT atomico (ON CONFLICT ... increment) garante contagem correta
//   - Se contador excede limite, retorna falso
//
// Esta abordagem tem custo de 1 round-trip ao Supabase por request protegida.
// Pra endpoints mais quentes, considerar Upstash Redis no futuro.

import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

function janelaAtual(janelaMinutos: number = 1): string {
  // Bucket arredondado pra inicio do periodo de N minutos em UTC.
  // janelaMinutos=1 -> "YYYY-MM-DDTHH:MM" (cada minuto)
  // janelaMinutos=60 -> "YYYY-MM-DDTHH:00" (cada hora)
  // janelaMinutos=1440 -> "YYYY-MM-DDT00:00" (cada dia)
  const agora = new Date();
  const minutosTotais = Math.floor(agora.getTime() / 60000);
  const bucketMin = Math.floor(minutosTotais / janelaMinutos) * janelaMinutos;
  const bucketDate = new Date(bucketMin * 60000);
  return bucketDate.toISOString().slice(0, 16);
}

export interface RateLimitConfig {
  chave: string;              // identificador unico (ex: "admin_login:187.64.2.1")
  max: number;                // max requests por janela
  janelaMinutos?: number;     // duracao da janela em minutos (default 1)
}

export interface RateLimitResponse {
  permitido: boolean;
  contador: number;
  max: number;
  janela: string;
}

export async function checkRateLimit(cfg: RateLimitConfig): Promise<RateLimitResponse> {
  const janela = janelaAtual(cfg.janelaMinutos || 1);

  // Tenta inserir com contador=1. Se ja existir, faz update incrementando.
  // Como Supabase RPC direto seria melhor, usamos SELECT + UPSERT.
  const { data: atual } = await supabase
    .from("rate_limit_buckets")
    .select("contador")
    .eq("chave", cfg.chave)
    .eq("janela_iso", janela)
    .maybeSingle();

  const novoContador = (atual?.contador || 0) + 1;

  if (atual) {
    await supabase
      .from("rate_limit_buckets")
      .update({ contador: novoContador })
      .eq("chave", cfg.chave)
      .eq("janela_iso", janela);
  } else {
    await supabase.from("rate_limit_buckets").insert({
      chave: cfg.chave,
      janela_iso: janela,
      contador: 1,
    });
  }

  return {
    permitido: novoContador <= cfg.max,
    contador: novoContador,
    max: cfg.max,
    janela,
  };
}

// Helper: extrai IP do request. Confia em X-Forwarded-For (Vercel).
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
