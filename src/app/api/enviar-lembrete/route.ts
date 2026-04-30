import { NextRequest, NextResponse } from "next/server";
import { sendToClient } from "@/lib/chatpro";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { phone, key } = await req.json();

    const auth = await requireAdminAuth(req, key);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!phone) {
      return NextResponse.json({ error: "Telefone obrigatorio" }, { status: 400 });
    }

    await sendToClient({
      to: phone,
      message: `Oi! 😊 Percebi que voce estava fazendo uma cotacao e nao finalizou.

Se ainda precisa de frete ou mudanca, estou aqui pra te ajudar!

Basta mandar *Oi* que a gente retoma de onde parou.

Relaxa. A gente leva. 🚚✨`,
    });

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
