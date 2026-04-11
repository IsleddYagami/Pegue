import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/chatpro";

export const dynamic = "force-dynamic";

// Webhook recebe mensagens do ChatPro
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log("Webhook ChatPro recebido:", JSON.stringify(body, null, 2));

    // ChatPro envia diferentes tipos de evento
    // Mensagem recebida tem body.type === "ReceivedCallback"
    if (!body || body.type !== "ReceivedCallback") {
      return NextResponse.json({ status: "ignored" });
    }

    const message = body.body || "";
    const from = body.from || "";
    const isGroup = body.isGroup || false;
    const isFromMe = body.fromMe || false;

    // Ignora mensagens de grupo e proprias
    if (isGroup || isFromMe || !from || !message) {
      return NextResponse.json({ status: "ignored" });
    }

    // Remove @s.whatsapp.net do numero
    const phoneNumber = from.replace("@s.whatsapp.net", "");

    console.log(`Mensagem de ${phoneNumber}: ${message}`);

    // Bot basico - resposta automatica
    const responseMessage = generateResponse(message);

    await sendMessage({
      to: phoneNumber,
      message: responseMessage,
    });

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    console.error("Erro no webhook:", error?.message);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// GET para verificacao do webhook (healthcheck)
export async function GET() {
  return NextResponse.json({ status: "Webhook Pegue ativo" });
}

function generateResponse(message: string): string {
  const msg = message.toLowerCase().trim();

  // Saudacoes
  if (
    msg.match(/^(oi|ola|bom dia|boa tarde|boa noite|hey|eae|e ai|hello|hi)/)
  ) {
    return `Ola! Bem-vindo ao *Pegue* 🚚✨

Somos especialistas em fretes e mudancas na Grande SP!

Como posso te ajudar?

1️⃣ *Frete rapido* - Leva e traz no mesmo dia
2️⃣ *Mudanca* - Pequena ou grande
3️⃣ *Litoral/Interior* - Envios para praia ou interior de SP
4️⃣ *Simular preco* - Descubra o valor na hora

Manda o numero da opcao ou me conta o que voce precisa! 😊`;
  }

  // Opcao 1 ou frete
  if (msg === "1" || msg.match(/(frete|rapido|levar|trazer|buscar)/)) {
    return `*Frete Rapido* 🚚💨

Perfeito! Para fazer seu orcamento, preciso de:

📍 *Endereco de retirada* (ou manda a localizacao)
📍 *Endereco de entrega*
📦 *O que vai transportar?* (manda uma foto do material!)

A foto nos ajuda a sugerir o veiculo ideal e evita surpresas! 📸`;
  }

  // Opcao 2 ou mudanca
  if (msg === "2" || msg.match(/(mudanca|mudar|mudando)/)) {
    return `*Mudanca* 📦🏠

Otimo! Para montar seu orcamento de mudanca:

📍 *Endereco de origem*
📍 *Endereco de destino*
🏢 *Tem escada ou elevador?*
📸 *Manda fotos dos moveis/caixas* (assim dimensionamos o veiculo certo!)

Quanto mais fotos, melhor o orcamento! 😊`;
  }

  // Opcao 3 ou litoral
  if (msg === "3" || msg.match(/(litoral|praia|interior|guaruja|santos|bertioga)/)) {
    return `*Litoral/Interior de SP* 🏖️

Fazemos envios para todo o litoral e interior paulista!

Para seu orcamento preciso de:

📍 *Endereco de retirada*
📍 *Cidade de destino*
📦 *O que vai enviar?* (manda foto!)

Destinos mais procurados: Santos, Guaruja, Bertioga, Riviera, Campinas, Sorocaba 🗺️`;
  }

  // Opcao 4 ou simular/preco/valor/quanto
  if (msg === "4" || msg.match(/(simul|preco|valor|quanto|custa|orcamento|tabela)/)) {
    return `*Simulador de Preco* 💰

Voce pode simular agora mesmo pelo nosso site:
👉 https://pegue-eta.vercel.app/simular

La voce manda fotos, coloca origem e destino, e recebe 3 opcoes de preco na hora!

Ou se preferir, me manda aqui:
📍 Origem
📍 Destino
📸 Foto do material

E eu calculo pra voce! 😊`;
  }

  // Agradecimento
  if (msg.match(/(obrigad|valeu|thanks|brigad)/)) {
    return `Por nada! 😊

Estamos aqui sempre que precisar. *Relaxa. A gente leva.* 🚚✨

Qualquer duvida, e so chamar!`;
  }

  // Resposta padrao para qualquer outra mensagem
  return `Oi! 😊 Sou o assistente do *Pegue* 🚚

Nao entendi sua mensagem, mas posso te ajudar com:

1️⃣ *Frete rapido*
2️⃣ *Mudanca*
3️⃣ *Litoral/Interior SP*
4️⃣ *Simular preco*

Manda o numero da opcao ou descreve o que voce precisa!`;
}
