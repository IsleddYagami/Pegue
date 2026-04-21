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

  // Envia os termos ATUALIZADOS pro prestador (ex: apos alteracao de clausula)
  if (tipo === "termos_atualizados") {
    await sendToClient({
      to: phone,
      message: `📋 *ATUALIZACAO DOS TERMOS DE PARCERIA PEGUE*\n\nOla! Os termos de participacao da Pegue foram *atualizados*. A principal mudanca e na clausula 4 (Responsabilidade por Danos).\n\nLeia com atencao a versao atualizada abaixo:`,
    });
    // Pequena pausa pra chegar em ordem
    await new Promise(r => setTimeout(r, 1500));
    await sendToClient({
      to: phone,
      message: MSG.cadastroTermos,
    });
    await new Promise(r => setTimeout(r, 1000));
    await sendToClient({
      to: phone,
      message: `Se voce continua de acordo com os novos termos, nao precisa fazer nada. Em caso de duvida, responda essa conversa que entramos em contato! 🚚`,
    });
  }

  return NextResponse.json({ status: "ok" });
}
