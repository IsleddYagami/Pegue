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
    const cpfMascarado = cpf.length === 11
      ? cpf.substring(0, 3) + ".***.***-" + cpf.substring(9)
      : cpf;

    await resend.emails.send({
      from: "Pegue <onboarding@resend.dev>",
      to: email,
      subject: "Termos de Participacao - Pegue",
      html: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0A0A0A;">
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#0A0A0A;color:#ffffff;padding:40px;">
  <div style="text-align:center;margin-bottom:30px;">
    <h1 style="color:#C9A84C;margin:0;font-size:32px;">PEGUE</h1>
    <p style="color:#888;margin:5px 0;">Relaxa. A gente leva.</p>
  </div>

  <div style="background:#111111;border-radius:12px;padding:30px;margin-bottom:20px;">
    <h2 style="color:#C9A84C;margin-top:0;">Confirmacao de Aceite dos Termos</h2>

    <p>Ola <strong>${nome}</strong>,</p>

    <p>Confirmamos que voce aceitou os <strong>Termos de Participacao da Pegue</strong>.</p>

    <div style="background:#1a1a1a;border-left:4px solid #C9A84C;padding:15px;margin:20px 0;border-radius:4px;">
      <p style="margin:5px 0;"><strong>Nome:</strong> ${nome}</p>
      <p style="margin:5px 0;"><strong>CPF:</strong> ${cpfMascarado}</p>
      <p style="margin:5px 0;"><strong>Data/Hora:</strong> ${dataHora}</p>
      <p style="margin:5px 0;"><strong>Aceite:</strong> "eu concordo"</p>
    </div>
  </div>

  <div style="background:#111111;border-radius:12px;padding:30px;margin-bottom:20px;">
    <h3 style="color:#C9A84C;margin-top:0;">Termos de Participacao</h3>

    <p><strong>1. SOBRE A PEGUE</strong><br>
    A Pegue e uma plataforma de intermediacao de servicos de frete e transporte. Nao somos uma empresa de transporte. Conectamos clientes a prestadores de servico independentes.</p>

    <p><strong>2. VOCE COMO PRESTADOR</strong><br>
    - Voce e um prestador independente, nao funcionario da Pegue<br>
    - Voce decide quais servicos aceitar e quando trabalhar<br>
    - E sua responsabilidade manter veiculo e documentacao em dia</p>

    <p><strong>3. PROTOCOLO DE FOTOS (OBRIGATORIO)</strong><br>
    - Fotografar TODOS os materiais na coleta antes de carregar<br>
    - Fotografar TODOS os materiais na entrega apos descarregar<br>
    - Sem fotos = pagamento BLOQUEADO<br>
    - As fotos servem como prova para proteger voce e o cliente</p>

    <p><strong>4. RESPONSABILIDADE POR DANOS</strong><br>
    - O prestador e responsavel por qualquer dano, avaria ou extravio de materiais durante o transporte<br>
    - Em caso de dano comprovado, o valor sera descontado dos seus recebiveis<br>
    - Transporte com cuidado! Proteja os materiais adequadamente</p>

    <p><strong>5. PAGAMENTO</strong><br>
    - Voce recebe 88% do valor do frete<br>
    - O pagamento e liberado apos o cliente confirmar o recebimento dos materiais<br>
    - Quanto mais rapido a entrega for confirmada, mais rapido voce recebe</p>

    <p><strong>6. CANCELAMENTOS</strong><br>
    - Cancelar um servico ja aceito afeta seu score na plataforma<br>
    - Cancelamentos recorrentes podem levar a desativacao da conta<br>
    - Cancele apenas em casos de real impossibilidade</p>

    <p><strong>7. CONDUTA E ATENDIMENTO</strong><br>
    - Trate todos os clientes com respeito e educacao<br>
    - Seja pontual nos horarios combinados<br>
    - Reclamacoes de clientes reduzem seu score e suas indicacoes<br>
    - Comportamento inadequado resulta em desativacao imediata</p>

    <p><strong>8. SISTEMA DE SCORE</strong><br>
    - Bom desempenho = mais indicacoes de frete<br>
    - Cancelamentos, reclamacoes e danos = menos indicacoes<br>
    - Score muito baixo = desativacao da plataforma</p>

    <p><strong>9. DESATIVACAO</strong><br>
    A Pegue pode desativar sua conta a qualquer momento em caso de:<br>
    - Danos recorrentes a materiais de clientes<br>
    - Reclamacoes graves ou reincidentes<br>
    - Cancelamentos excessivos<br>
    - Comportamento inadequado<br>
    - Documentacao vencida ou irregular</p>

    <p><strong>10. DADOS E PRIVACIDADE</strong><br>
    - Seus dados pessoais sao usados apenas para o cadastro e operacao da plataforma<br>
    - Dados dos clientes sao confidenciais e nao devem ser compartilhados</p>
  </div>

  <div style="text-align:center;color:#666;font-size:12px;margin-top:30px;">
    <p>Este email e um comprovante do seu aceite dos Termos de Participacao.</p>
    <p>Guarde-o para seus registros.</p>
    <p style="color:#C9A84C;">Pegue - Relaxa. A gente leva.</p>
  </div>
</div>
</body>
</html>`,
    });
    return true;
  } catch (error: any) {
    console.error("Erro ao enviar email:", error?.message);
    return false;
  }
}
