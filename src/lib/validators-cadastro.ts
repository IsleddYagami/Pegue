// Validadores do cadastro de prestador.
//
// Extracao 1/Mai/2026: bot e admin-cadastrar-prestador validavam apenas
// `length < 5` em placa e PIX. Com isso, "12345" passava como placa valida
// e "1234567890" passava como CPF de PIX (sem ser CPF). Resultado: cadastros
// com dados quebrados aprovados automaticamente.
//
// Funcoes puras, sem dependencias. Testaveis via vitest.

// === TELEFONE BRASILEIRO ===
//
// Aceita formatos:
//  - 11 digitos sem DDI:    11999998888       (DDD + 9XXXXXXXX)
//  - 12 digitos:            551133334444      (DDI + DDD + fixo 8 dig)
//  - 13 digitos com DDI:    5511999998888     (DDI + DDD + celular 9XXXXXXXX)
// Apos normalizacao, sempre retorna com DDI 55 (13 digitos pra celular,
// 12 pra fixo).

export function normalizarTelefoneBr(input: string): string | null {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length === 11) return `55${digits}`;          // ja tem DDD + 9XXX
  if (digits.length === 13 && digits.startsWith("55")) return digits;
  if (digits.length === 12 && digits.startsWith("55")) return digits; // fixo
  if (digits.length === 10) return `55${digits}`;          // fixo sem DDI
  return null;
}

export function isTelefoneBrValido(input: string): boolean {
  return normalizarTelefoneBr(input) !== null;
}

// === PLACA BRASILEIRA ===
//
// Padroes aceitos:
// - Antigo (Mercosul-pre):  3 letras + 4 digitos    Ex: ABC1234
// - Mercosul (atual):       3 letras + 1 digito + 1 letra + 2 digitos
//                                                   Ex: ABC1D23
//
// Espacos, hifens e ponto sao removidos antes de validar. Letras
// case-insensitive (retornamos uppercase).

const REGEX_PLACA_ANTIGA = /^[A-Z]{3}[0-9]{4}$/;
const REGEX_PLACA_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

export function normalizarPlaca(input: string): string {
  return (input || "").toUpperCase().replace(/[\s\-.]/g, "").trim();
}

export function isPlacaValida(input: string): boolean {
  const p = normalizarPlaca(input);
  if (p.length !== 7) return false;
  return REGEX_PLACA_ANTIGA.test(p) || REGEX_PLACA_MERCOSUL.test(p);
}

// === CHAVE PIX ===
//
// O Banco Central aceita 5 formatos:
//   1. CPF      — 11 digitos numericos
//   2. CNPJ     — 14 digitos numericos
//   3. Email    — RFC simplificado (precisa @ e dominio com .)
//   4. Telefone — celular brasileiro com DDI 55 + DDD + 9XXXXXXXX
//                 (aceitamos com e sem +55, normaliza pra +55XXXXXXXXXXX)
//   5. UUID     — chave aleatoria 36 chars (8-4-4-4-12 hex)
//
// Retorna { tipo, valor_normalizado } se valida; null se nao reconhece.

export type TipoPix = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

export interface PixValido {
  tipo: TipoPix;
  valor: string; // valor normalizado (sempre string)
}

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarChavePix(input: string): PixValido | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // UUID
  if (REGEX_UUID.test(raw)) {
    return { tipo: "aleatoria", valor: raw.toLowerCase() };
  }

  // Email (precisa ter @ antes de tentar so digitos)
  if (raw.includes("@")) {
    if (REGEX_EMAIL.test(raw.toLowerCase())) {
      return { tipo: "email", valor: raw.toLowerCase() };
    }
    return null; // tem @ mas nao bate email valido
  }

  // So digitos: pode ser CPF, CNPJ ou telefone
  const apenasDigitos = raw.replace(/\D/g, "");

  if (apenasDigitos.length === 11) {
    // Pode ser CPF (mais comum) ou celular sem DDI (11 digitos = DDD + 9XXXXXXXX).
    // Heuristica BC: PIX celular DEVE ter DDI 55 -> 13 digitos. 11 sem DDI tratamos
    // como CPF pra evitar ambiguidade.
    return { tipo: "cpf", valor: apenasDigitos };
  }
  if (apenasDigitos.length === 14) {
    return { tipo: "cnpj", valor: apenasDigitos };
  }
  if (apenasDigitos.length === 13 && apenasDigitos.startsWith("55")) {
    // Telefone com DDI: +5511999999999
    // Validar que tem 9 no inicio do numero (apos DDI+DDD)
    const aposDDI = apenasDigitos.slice(2); // tira "55"
    if (aposDDI.length === 11 && aposDDI[2] === "9") {
      return { tipo: "telefone", valor: `+${apenasDigitos}` };
    }
  }
  if (apenasDigitos.length === 12 && apenasDigitos.startsWith("55")) {
    // Telefone fixo com DDI: +551133334444 (10 digitos depois do 55)
    // Aceita-se tambem celular antigo de 8 digitos? Nao, BC exige 9 desde 2017.
    // Como BC PIX exige celular -> rejeita fixo.
    return null;
  }

  return null;
}

// Helper boolean pro caller que so quer saber se passa.
export function isChavePixValida(input: string): boolean {
  return validarChavePix(input) !== null;
}
