// Helper pra enviar notificacao pros admins via WhatsApp (instancia 1).
// Aceita multiplos phones via env var ADMIN_PHONES.
import { sendMessage } from "@/lib/chatpro";
import { getAdminPhones } from "@/lib/admin-auth";

// Notifica TODOS os admins configurados em env ADMIN_PHONES
// (lista separada por virgula).
// Retorna o numero de admins que receberam a mensagem.
export async function notificarAdmins(
  titulo: string,
  referenciaCliente: string,
  detalhes: string
): Promise<number> {
  const phones = getAdminPhones();
  if (phones.length === 0) {
    console.error("notificarAdmins: nenhum phone configurado em ADMIN_PHONES/ADMIN_PHONE");
    return 0;
  }

  const corpo = `${titulo}\n\nCliente: ${referenciaCliente}\n\n${detalhes}`;

  let enviados = 0;
  for (const phone of phones) {
    try {
      await sendMessage({
        to: phone,
        message: corpo,
        instance: 1, // notificacao admin sempre pela instancia principal
      });
      enviados++;
    } catch (error: any) {
      console.error(`Falha ao notificar admin ${phone}:`, error?.message);
    }
  }
  return enviados;
}
