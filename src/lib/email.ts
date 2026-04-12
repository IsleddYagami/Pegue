// Envio de emails via Resend

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "");

export async function enviarEmailTermosAceitos(
  email: string,
  nome: string,
  cpf: string,
  dataHora: string
) {
  try {
    await resend.emails.send({
      from: "Pegue <noreply@pegue-eta.vercel.app>",
      to: email,
      subject: "Termos de Participação - Pegue",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0A0A0A; color: #ffffff; padding: 40px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #C9A84C; margin: 0;">PEGUE</h1>
            <p style="color: #888; margin: 5px 0;">Relaxa. A gente leva. 🚚</p>
          </div>

          <div style="background: #111111; border-radius: 12px; padding: 30px; margin-bottom: 20px;">
            <h2 style="color: #C9A84C; margin-top: 0;">Confirmação de Aceite dos Termos</h2>

            <p>Olá <strong>${nome}</strong>,</p>

            <p>Confirmamos que você aceitou os <strong>Termos de Participação da Pegue</strong>.</p>

            <div style="background: #1a1a1a; border-left: 4px solid #C9A84C; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 5px 0;"><strong>Nome:</strong> ${nome}</p>
              <p style="margin: 5px 0;"><strong>CPF:</strong> ${cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.***.***-$4")}</p>
              <p style="margin: 5px 0;"><strong>Data/Hora:</strong> ${dataHora}</p>
              <p style="margin: 5px 0;"><strong>Aceite:</strong> "eu concordo"</p>
            </div>
          </div>

          <div style="background: #111111; border-radius: 12px; padding: 30px; margin-bottom: 20px;">
            <h3 style="color: #C9A84C; margin-top: 0;">Termos de Participação</h3>

            <p><strong>1. SOBRE A PEGUE</strong><br>
            A Pegue é uma plataforma de intermediação de serviços de frete e transporte. Não somos uma empresa de transporte. Conectamos clientes a prestadores de serviço independentes.</p>

            <p><strong>2. VOCÊ COMO PRESTADOR</strong><br>
            • Você é um prestador independente, não funcionário da Pegue<br>
            • Você decide quais serviços aceitar e quando trabalhar<br>
            • É sua responsabilidade manter veículo e documentação em dia</p>

            <p><strong>3. PROTOCOLO DE FOTOS (OBRIGATÓRIO)</strong><br>
            • Fotografar TODOS os materiais na coleta antes de carregar<br>
            • Fotografar TODOS os materiais na entrega após descarregar<br>
            • Sem fotos = pagamento BLOQUEADO<br>
            • As fotos servem como prova para proteger você e o cliente</p>

            <p><strong>4. RESPONSABILIDADE POR DANOS</strong><br>
            • O prestador é responsável por qualquer dano, avaria ou extravio de materiais durante o transporte<br>
            • Em caso de dano comprovado, o valor será descontado dos seus recebíveis<br>
            • Transporte com cuidado! Proteja os materiais adequadamente</p>

            <p><strong>5. PAGAMENTO</strong><br>
            • Você recebe 88% do valor do frete<br>
            • O pagamento é liberado após o cliente confirmar o recebimento dos materiais<br>
            • Quanto mais rápido a entrega for confirmada, mais rápido você recebe</p>

            <p><strong>6. CANCELAMENTOS</strong><br>
            • Cancelar um serviço já aceito afeta seu score na plataforma<br>
            • Cancelamentos recorrentes podem levar à desativação da conta<br>
            • Cancele apenas em casos de real impossibilidade</p>

            <p><strong>7. CONDUTA E ATENDIMENTO</strong><br>
            • Trate todos os clientes com respeito e educação<br>
            • Seja pontual nos horários combinados<br>
            • Reclamações de clientes reduzem seu score e suas indicações<br>
            • Comportamento inadequado resulta em desativação imediata</p>

            <p><strong>8. SISTEMA DE SCORE</strong><br>
            • Bom desempenho = mais indicações de frete<br>
            • Cancelamentos, reclamações e danos = menos indicações<br>
            • Score muito baixo = desativação da plataforma</p>

            <p><strong>9. DESATIVAÇÃO</strong><br>
            A Pegue pode desativar sua conta a qualquer momento em caso de:<br>
            • Danos recorrentes a materiais de clientes<br>
            • Reclamações graves ou reincidentes<br>
            • Cancelamentos excessivos<br>
            • Comportamento inadequado<br>
            • Documentação vencida ou irregular</p>

            <p><strong>10. DADOS E PRIVACIDADE</strong><br>
            • Seus dados pessoais são usados apenas para o cadastro e operação da plataforma<br>
            • Dados dos clientes são confidenciais e não devem ser compartilhados</p>
          </div>

          <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px;">
            <p>Este email é um comprovante do seu aceite dos Termos de Participação.</p>
            <p>Guarde-o para seus registros.</p>
            <p style="color: #C9A84C;">Pegue - Relaxa. A gente leva. 🚚✨</p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (error: any) {
    console.error("Erro ao enviar email:", error?.message);
    return false;
  }
}
