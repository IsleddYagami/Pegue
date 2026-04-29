// PIN de confirmacao de entrega — token de 4 digitos.
//
// Por que: sistema antigo nao tinha PIN. Fretista marcava entregue e bot
// confiava 100% no fretista. Auditoria E2E 29/Abr identificou risco:
// fretista poderia marcar "entregue" sem ter entregado, e ser repassado
// via Asaas PIX antes de cliente reclamar.
//
// Fluxo PIN:
// 1. Cliente paga → Pegue gera PIN 4 digitos aleatorio + salva em
//    corridas.pin_entrega + envia PRIVADO pro cliente
// 2. Fretista vai ate destino, manda fotos da entrega
// 3. Bot pede PIN ao fretista. Fretista pede ao cliente fisicamente
//    (cliente fala oralmente).
// 4. Fretista digita PIN no bot.
// 5. Bot valida pin_entrega: se bater, libera repasse. Senao, +1
//    tentativa (max 3 antes de escala humano).
//
// Vantagem: cliente FISICO precisa estar presente na entrega pra fornecer
// PIN. Sem cliente presente = sem PIN = sem repasse. Anti-fraude basico.

const TOTAL_TENTATIVAS = 3;

// Gera PIN 4 digitos aleatorio (0001-9999, evita 0000).
// Usa crypto.randomInt pra entropia adequada (nao Math.random previsivel).
export function gerarPinEntrega(): string {
  // crypto.randomInt(min, max) -> [min, max-1], range 1..10000 = 1..9999 + zeropad
  const num = require("node:crypto").randomInt(1, 10000);
  return String(num).padStart(4, "0");
}

// Valida PIN digitado pelo fretista contra o salvo na corrida.
// Normaliza: remove espacos e chars nao-digitos, compara strings.
export function validarPinEntrega(
  digitado: string | null | undefined,
  esperado: string | null | undefined,
): boolean {
  if (!digitado || !esperado) return false;
  const normalDigitado = digitado.replace(/\D/g, "").slice(0, 4);
  const normalEsperado = esperado.replace(/\D/g, "").slice(0, 4);
  if (normalDigitado.length !== 4 || normalEsperado.length !== 4) return false;
  return normalDigitado === normalEsperado;
}

export const PIN_TENTATIVAS_MAX = TOTAL_TENTATIVAS;

// Mensagem padronizada pro cliente quando recebe o PIN.
// Cliente ja tem todo contexto (paid + fretista a caminho), entao foco
// na ACAO: guardar PIN, fornecer ao fretista APENAS na entrega.
export function montarMensagemPinCliente(pin: string, nomeFretista: string): string {
  return `🔒 *PIN de entrega: ${pin}*

Guarde esse codigo. *So fornecaa ao ${nomeFretista}* quando ele chegar com seu pedido.

Esse PIN garante que o fretista so libera o pagamento *DEPOIS* que voce receber tudo certinho. ✅

⚠️ *Nao compartilhe antes da entrega* — sem PIN, fretista nao pode encerrar.`;
}

// Mensagem pro fretista pedindo PIN.
export function montarMensagemPinFretista(): string {
  return `🔒 *Pra finalizar a entrega:*

Pede ao cliente o *PIN de 4 digitos* que ele recebeu por aqui.

Digita os 4 numeros pra liberar seu repasse. ✅

_Sem PIN, repasse nao eh liberado._`;
}

// Mensagem de erro quando PIN nao bate
export function montarMensagemPinIncorreto(tentativasRestantes: number): string {
  if (tentativasRestantes <= 0) {
    return `❌ PIN incorreto demais. Vou chamar um atendente pra resolver — aguarda. 🤝`;
  }
  return `❌ PIN incorreto. Confere com o cliente e tenta de novo (${tentativasRestantes} tentativa${tentativasRestantes === 1 ? "" : "s"} restante${tentativasRestantes === 1 ? "" : "s"}).`;
}
