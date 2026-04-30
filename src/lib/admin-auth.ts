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

// Lista de telefones marcados como TESTE — clientes/admin que NAO devem
// disparar dispatch real pra fretistas reais (Mauricio, Jackeline etc).
// Configurada via env var TEST_PHONES (lista separada por virgula).
// Por padrao, inclui ADMIN_PHONES (admin testando = teste).
//
// Ex: TEST_PHONES="5511971429605,5511986774273,5511977744416,5511978782418"
//     (Fabio + Mateus + Rodolfo + Jonas)
export function getTestPhones(): string[] {
  const list = process.env.TEST_PHONES;
  const test = list
    ? list.split(",").map((p) => p.trim()).filter((p) => p.length > 0)
    : [];
  // Sempre inclui admin como teste (admin testando = teste)
  const admins = getAdminPhones();
  for (const a of admins) {
    if (!test.includes(a)) test.push(a);
  }
  return test;
}

export function isPhoneTeste(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return getTestPhones().includes(phone);
}

// Helper completo de auth admin: rate limit por IP + validacao de key.
// Retorna { ok: false, ...} pra responder direto ao cliente.
// Rate limit: 10 tentativas/minuto por IP (pra /admin login).
//
// `keyOverride` permite passar a key extraida do body/formData quando ela
// nao vem na URL (ex: admin-cadastrar-prestador usa formData). Sem isso, o
// codigo caia em isValidAdminKey direto e perdia o rate limit (vuln auditoria).
export async function requireAdminAuth(
  req: Request,
  keyOverride?: string | null,
): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string }
> {
  const { checkRateLimit, getClientIp } = await import("@/lib/rate-limit");

  const ip = getClientIp(req);
  const rl = await checkRateLimit({ chave: `admin_auth:${ip}`, max: 10 });
  if (!rl.permitido) {
    return { ok: false, status: 429, error: "muitas tentativas, aguarde 1 minuto" };
  }

  // Extrai key da URL, do header Authorization, ou do override (body/form)
  const url = new URL(req.url);
  const key =
    keyOverride ||
    url.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "") ||
    null;

  if (!isValidAdminKey(key)) {
    return { ok: false, status: 401, error: "acesso negado" };
  }

  return { ok: true };
}
