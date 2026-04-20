// Lib para enviar mensagens via ChatPro WhatsApp API
// Suporta 2 instancias (2 numeros)

const CHATPRO_ENDPOINT = process.env.CHATPRO_ENDPOINT || "";
const CHATPRO_TOKEN = process.env.CHATPRO_TOKEN || "";

// Segunda instancia
const CHATPRO_INSTANCE_2 = process.env.CHATPRO_INSTANCE_2 || "";
const CHATPRO_TOKEN_2 = process.env.CHATPRO_TOKEN_2 || "";
const CHATPRO_ENDPOINT_2 = CHATPRO_INSTANCE_2
  ? `https://v5.chatpro.com.br/${CHATPRO_INSTANCE_2}`
  : "";

interface SendMessageOptions {
  to: string; // numero com DDI, ex: "5511970363713"
  message: string;
  instance?: 1 | 2; // qual instancia usar (default: 1)
}

interface SendImageOptions {
  to: string;
  url: string;
  caption?: string;
  instance?: 1 | 2;
}

function getConfig(instance: 1 | 2 = 1) {
  if (instance === 2 && CHATPRO_ENDPOINT_2 && CHATPRO_TOKEN_2) {
    return { endpoint: CHATPRO_ENDPOINT_2, token: CHATPRO_TOKEN_2 };
  }
  return { endpoint: CHATPRO_ENDPOINT, token: CHATPRO_TOKEN };
}

export async function sendMessage({ to, message, instance }: SendMessageOptions) {
  const { endpoint, token } = getConfig(instance);

  const response = await fetch(`${endpoint}/api/v1/send_message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
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

export async function sendImage({ to, url, caption, instance }: SendImageOptions) {
  const { endpoint, token } = getConfig(instance);

  const response = await fetch(`${endpoint}/api/v1/send_image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
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

// Envia mensagem para multiplos numeros (usa instancia 1 por padrao)
export async function sendMessageToMany(numbers: string[], message: string, instance?: 1 | 2) {
  const results = await Promise.allSettled(
    numbers.map((to) => sendMessage({ to, message, instance }))
  );
  return results;
}

// Envia pelos 2 numeros ao mesmo tempo (dispatch pra mais alcance)
export async function sendMessageToManyDual(numbers: string[], message: string) {
  // Divide a lista entre as 2 instancias pra distribuir carga
  // Se so tem 1 instancia, manda tudo pela 1
  if (!CHATPRO_ENDPOINT_2 || !CHATPRO_TOKEN_2) {
    return sendMessageToMany(numbers, message, 1);
  }

  const metade = Math.ceil(numbers.length / 2);
  const grupo1 = numbers.slice(0, metade);
  const grupo2 = numbers.slice(metade);

  const [r1, r2] = await Promise.all([
    sendMessageToMany(grupo1, message, 1),
    sendMessageToMany(grupo2, message, 2),
  ]);

  return [...r1, ...r2];
}
