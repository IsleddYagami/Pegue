// Funcoes puras de validacao/normalizacao de telefones brasileiros.
// Mantidas isoladas (sem dependencias de Supabase/ChatPro) pra serem
// testaveis sem mock e reutilizaveis em qualquer contexto.

// Formata numero pra padrao ChatPro (apenas digitos com DDI)
export function formatPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

// Valida formato de telefone brasileiro: 55 + DDD (2) + 8 ou 9 digitos.
// Total 12 ou 13 digitos. Filtra @lid (LinkedID anonimo do WhatsApp), IDs de
// grupo (120363...), e qualquer outro JID que nao seja contato BR real.
export function isValidBrPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return /^55\d{2}\d{8,9}$/.test(phone);
}
