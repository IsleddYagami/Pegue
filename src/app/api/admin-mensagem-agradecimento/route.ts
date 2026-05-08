import { NextRequest, NextResponse } from "next/server";
import { sendToClient } from "@/lib/chatpro";
import { isValidAdminKey, isValidCronKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Endpoint pra mandar mensagem de agradecimento pra testers do sistema.
// Pedido Fabio (8/Mai/2026) — Maria, cunhada, e outros que testaram
// merecem reconhecimento.
//
// Uso: POST ou GET ?key=KEY&phones=5511951400612,5511986768736&texto=opcional
//
// Mensagem padrao se 'texto' nao informado.

const MSG_AGRADECIMENTO = `🙏 *Obrigada por testar a Pegue!*

Sua ajuda foi essencial pra a gente identificar e corrigir falhas que afetam clientes reais. Cada mensagem sua nos ensinou algo novo sobre o sistema.

Estamos melhorando passo a passo pra entregar um atendimento de qualidade.

Conta comigo quando precisar de um frete! 💛 — *Iris*, Pegue Fretes`;

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidAdminKey(key) && !isValidCronKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const phonesParam = req.nextUrl.searchParams.get("phones") || "";
  const texto = req.nextUrl.searchParams.get("texto") || MSG_AGRADECIMENTO;

  const phones = phonesParam
    .split(",")
    .map((p) => p.trim().replace(/\D/g, ""))
    .filter((p) => p.length >= 10 && p.length <= 13);

  if (phones.length === 0) {
    return NextResponse.json(
      { error: "informe pelo menos 1 phone em ?phones=5511951400612,..." },
      { status: 400 },
    );
  }

  const resultados: Array<{ phone: string; ok: boolean; erro?: string }> = [];

  for (const phone of phones) {
    // Garante prefixo 55 se cliente passou sem
    const phoneFull =
      phone.length === 11 || phone.length === 10 ? "55" + phone : phone;
    try {
      await sendToClient({ to: phoneFull, message: texto });
      resultados.push({ phone: phoneFull, ok: true });
    } catch (e: unknown) {
      resultados.push({
        phone: phoneFull,
        ok: false,
        erro: e instanceof Error ? e.message : "erro desconhecido",
      });
    }
    // Pequeno delay pra nao floodar ChatPro
    await new Promise((r) => setTimeout(r, 1500));
  }

  return NextResponse.json({
    qtd: resultados.length,
    enviados: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok).length,
    resultados,
  });
}
