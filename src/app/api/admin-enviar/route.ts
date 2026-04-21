import { NextRequest, NextResponse } from "next/server";
import { sendToClient } from "@/lib/chatpro";
import { MSG } from "@/lib/bot-messages";
import { isValidAdminKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  const tipo = req.nextUrl.searchParams.get("tipo");
  const key = req.nextUrl.searchParams.get("key");

  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
  }

  if (!phone) {
    return NextResponse.json({ error: "phone obrigatorio" }, { status: 400 });
  }

  if (tipo === "pegou_chegou") {
    await sendToClient({
      to: phone,
      message: MSG.clienteConfirmarEntrega("Geladeira, Maquina de lavar, Cama casal, Guarda-roupa, Sofa, Rack/Estante, TV, 5x Caixas"),
    });
  }

  return NextResponse.json({ status: "ok" });
}
