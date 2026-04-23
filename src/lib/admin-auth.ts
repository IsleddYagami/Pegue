// Validacao de chave de admin. A senha fica na env var ADMIN_KEY (Vercel),
// nunca no codigo. Fail-secure: se a env var nao estiver configurada,
// TODAS as rotas protegidas retornam acesso negado.

export function isValidAdminKey(key: string | null | undefined): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return false;
  if (!key) return false;
  return key === expected;
}

// Crons do Vercel mandam Authorization: Bearer <CRON_SECRET>
// ou query ?key=<CRON_SECRET>. Separado da ADMIN_KEY pra limitar blast radius
// caso a chave admin vaze.
export function isValidCronKey(key: string | null | undefined): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  if (!key) return false;
  return key === expected;
}

// Lista de telefones de admin, configurada via env var ADMIN_PHONES
// (lista separada por virgula). Ex: "5511971429605,5511953938849"
// Fallback pra ADMIN_PHONE (singular) mantido pra retrocompatibilidade.
export function getAdminPhones(): string[] {
  const multiple = process.env.ADMIN_PHONES;
  if (multiple) {
    return multiple
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }
  const single = process.env.ADMIN_PHONE;
  if (single) return [single.trim()];
  return [];
}

export function isAdminPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return getAdminPhones().includes(phone);
}
