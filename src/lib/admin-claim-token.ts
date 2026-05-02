// Geracao de codigo de claim de admin — modulo puro (sem deps externas).
//
// Extraido de admin-notify.ts (audit 2/Mai/2026) pra permitir teste
// regressivo isolado sem precisar de env Supabase carregado.
//
// SEGURANCA: codigo eh gerado com crypto.randomBytes (CSPRNG do Node).
// Versao antiga (Math.random + 4 chars) era previsivel e brute-forceavel
// — ~923k combinacoes. Versao nova: 6 chars no alfabeto de 31 = 887M
// combinacoes, distribuicao uniforme via rejection sampling.

import { randomBytes } from "node:crypto";

// Alfabeto sem 0/O/1/I/L (chars que confundem leitura humana).
export const ALPHABET_CLAIM = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CLAIM_LENGTH = 6;

/**
 * Gera codigo de claim criptograficamente seguro.
 *
 * Rejection sampling: descarta bytes >= floor(256 / N) * N pra evitar
 * o bias do modulo (sem isso, primeiros chars do alfabeto seriam levemente
 * mais provaveis que os ultimos).
 */
export function gerarCodigoClaim(): string {
  const N = ALPHABET_CLAIM.length;
  const cap = Math.floor(256 / N) * N;
  const out: string[] = [];
  while (out.length < CLAIM_LENGTH) {
    const buf = randomBytes(CLAIM_LENGTH * 2);
    for (let i = 0; i < buf.length && out.length < CLAIM_LENGTH; i++) {
      const b = buf[i];
      if (b < cap) out.push(ALPHABET_CLAIM[b % N]);
    }
  }
  return out.join("");
}
