// Lib para enviar mensagens via ChatPro WhatsApp API

const CHATPRO_ENDPOINT = process.env.CHATPRO_ENDPOINT || "";
const CHATPRO_TOKEN = process.env.CHATPRO_TOKEN || "";

interface SendMessageOptions {
  to: string; // numero com DDI, ex: "5511970363713"
  message: string;
}

interface SendImageOptions {
  to: string;
  url: string;
  caption?: string;
}

export async function sendMessage({ to, message }: SendMessageOptions) {
  const response = await fetch(`${CHATPRO_ENDPOINT}/api/v1/send_message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: CHATPRO_TOKEN,
    },
    body: JSON.stringify({
      number: to,
      message,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Erro ao enviar mensagem ChatPro:", error);
    throw new Error(`ChatPro error: ${response.status}`);
  }

  return response.json();
}

export async function sendImage({ to, url, caption }: SendImageOptions) {
  const response = await fetch(`${CHATPRO_ENDPOINT}/api/v1/send_image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: CHATPRO_TOKEN,
    },
    body: JSON.stringify({
      number: to,
      url,
      caption: caption || "",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Erro ao enviar imagem ChatPro:", error);
    throw new Error(`ChatPro image error: ${response.status}`);
  }

  return response.json();
}

// Formata numero para padrao ChatPro (apenas digitos com DDI)
export function formatPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
