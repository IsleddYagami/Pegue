// Validacao de chave de admin. A senha fica na env var ADMIN_KEY (Vercel),
// nunca no codigo. Fail-secure: se a env var nao estiver configurada,
// TODAS as rotas protegidas retornam acesso negado.

export function isValidAdminKey(key: string | null | undefined): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return false;
  if (!key) return false;
  return key === expected;
}
