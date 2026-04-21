import { NextRequest, NextResponse } from "next/server";
import { sendToClient } from "@/lib/chatpro";
import { isValidAdminKey } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const tipo = req.nextUrl.searchParams.get("tipo") || "frete"; // frete ou guincho
  const phone = req.nextUrl.searchParams.get("phone") || "5511971429605";

  if (!isValidAdminKey(key)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
  }

  try {
    if (tipo === "guincho") {
      // Disparo duplo - GUINCHO
      await sendToClient({
        to: phone,
        message: `🚨🚨🚨 *GUINCHO DISPONIVEL* 🚨🚨🚨\n\n⚡ Responda rapido! Primeiro que aceitar, leva!`,
      });

      await new Promise(r => setTimeout(r, 1500));

      await sendToClient({
        to: phone,
        message: `🚗 *Guincho solicitado!*\n\n📍 Coleta: Rua Autonomia, 200 - Vila Yara, Osasco\n🏠 Destino: Oficina Auto Mecanica Silva - Rua das Flores, 45 - Presidente Altino\n🔧 Guincho: Imediato - Hatch/Sedan | Toyota Corolla 2019\n📅 AGORA - Saida imediata\n💰 Voce recebe: R$ 176\n\n━━━━━━━━━━━━━━━━\n1️⃣ ✅ *PEGAR* - Quero esse guincho!\n2️⃣ 🙏 *EM ATENDIMENTO* - Estou ocupado no momento`,
      });
    } else if (tipo === "urgente") {
      // Disparo triplo - URGENTE
      await sendToClient({
        to: phone,
        message: `🚨🚨🚨 *URGENTE URGENTE URGENTE* 🚨🚨🚨`,
      });

      await new Promise(r => setTimeout(r, 1000));

      await sendToClient({
        to: phone,
        message: `⚡ *SERVICO URGENTE - PRECISA SAIR AGORA!*`,
      });

      await new Promise(r => setTimeout(r, 1000));

      await sendToClient({
        to: phone,
        message: `🚨 *PRIORIDADE IMEDIATA*\n⚡ Servico URGENTE!\n\n📍 Origem: Av. dos Autonomistas, 1500 - Osasco\n🏠 Destino: Rua Bahia, 300 - Alphaville, Barueri\n📦 Mudanca completa - Geladeira, Sofa, Cama, 10 caixas\n📅 AGORA\n💰 Voce recebe: R$ 440\n\n━━━━━━━━━━━━━━━━\n1️⃣ ✅ *PEGAR* - Posso ir AGORA!\n2️⃣ 🙏 *EM ATENDIMENTO* - Estou ocupado`,
      });
    } else {
      // Disparo duplo - FRETE
      await sendToClient({
        to: phone,
        message: `🚨🚨🚨 *NOVO FRETE DISPONIVEL* 🚨🚨🚨\n\n⚡ Responda rapido! Primeiro que aceitar, leva!`,
      });

      await new Promise(r => setTimeout(r, 1500));

      await sendToClient({
        to: phone,
        message: `🚚 *Novo frete disponivel!*\n\n📍 Origem: Rua Antonio Agu, 100 - Centro, Osasco\n🏠 Destino: Rua Augusta, 500 - Consolacao, SP\n📦 Material: Geladeira, Maquina de lavar\n📅 25/04 - 14:00\n🙋 *Com 1 ajudante*\n💰 Voce recebe: R$ 246\n\n━━━━━━━━━━━━━━━━\n1️⃣ ✅ *PEGAR* - Quero esse frete!\n2️⃣ 🙏 *EM ATENDIMENTO* - Estou ocupado no momento`,
      });
    }

    return NextResponse.json({ status: "ok", tipo, phone });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
