// Envio de emails via Resend

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "");

// === EMAILS DE ARQUIVAMENTO (ocorrencias e cadastros) ===
const EMAIL_ARCHIVE_PRINCIPAL = "fretesresgatespg@gmail.com";
const EMAIL_ARCHIVE_COPIA = "ioriiorivendas@gmail.com";
const EMAIL_PESSOAL_FABIO = "fabiosantoscrispim@gmail.com";
const FROM_PEGUE = "Pegue <no-reply@chamepegue.com.br>";

// Helper: baixa um arquivo de URL e retorna como anexo do Resend
async function baixarComoAnexo(url: string | null | undefined, filename: string) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return { filename, content: buffer };
  } catch {
    return null;
  }
}

// Bloco HTML padrao para emails de arquivamento (header/footer Pegue)
function layoutEmail(titulo: string, corpo: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:640px;margin:0 auto;background:#ffffff;padding:30px;">
  <div style="border-bottom:3px solid #C9A84C;padding-bottom:15px;margin-bottom:25px;">
    <h1 style="color:#C9A84C;margin:0;font-size:24px;">PEGUE</h1>
    <p style="color:#666;margin:5px 0 0;font-size:13px;">${titulo}</p>
  </div>
  ${corpo}
  <p style="color:#999;font-size:11px;text-align:center;margin-top:30px;border-top:1px solid #eee;padding-top:15px;">
    Arquivo automatico de ocorrencia - Pegue - ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
  </p>
</div></body></html>`;
}

// Tabela chave-valor simples pra corpo dos emails
function tabela(pares: Record<string, string | number | null | undefined>) {
  const linhas = Object.entries(pares)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;width:35%;"><strong>${k}</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${v}</td></tr>`)
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">${linhas}</table>`;
}

// === 1. Cadastro de prestador concluido ===
export async function enviarEmailCadastroPrestador(dados: {
  nome: string;
  telefone: string;
  cpf: string;
  email: string;
  chavePix: string;
  tipoVeiculo: string;
  placa: string;
  selfieUrl?: string | null;
  fotoDocumentoUrl?: string | null;
  fotoPlacaUrl?: string | null;
  fotoVeiculoUrl?: string | null;
  dataAceite?: string;
  origem: "whatsapp" | "admin_manual" | "link_convite";
}) {
  try {
    // Refactor 1/Mai/2026: fotos agora sao salvas como PATH (nao URL publica)
    // pra suportar bucket privado. Antes de baixar pra anexar, gera signed URL
    // (TTL 7d). Compat: se vier URL legada (http*), getFotoPrestadorSignedUrl
    // retorna ela mesma sem tocar.
    //
    // Audit 1/Mai: foto_documento_url incluida (era coletada mas nao chegava
    // no email — prova juridica do RG/CNH ficava de fora do arquivo).
    const { getFotoPrestadorSignedUrl } = await import("@/lib/storage-prestadores");
    const [selfieSigned, documentoSigned, placaSigned, veiculoSigned] = await Promise.all([
      getFotoPrestadorSignedUrl(dados.selfieUrl || null),
      getFotoPrestadorSignedUrl(dados.fotoDocumentoUrl || null),
      getFotoPrestadorSignedUrl(dados.fotoPlacaUrl || null),
      getFotoPrestadorSignedUrl(dados.fotoVeiculoUrl || null),
    ]);

    const anexos = (await Promise.all([
      baixarComoAnexo(selfieSigned, `selfie-${dados.telefone}.jpg`),
      baixarComoAnexo(documentoSigned, `documento-${dados.telefone}.jpg`),
      baixarComoAnexo(placaSigned, `placa-${dados.telefone}.jpg`),
      baixarComoAnexo(veiculoSigned, `veiculo-${dados.telefone}.jpg`),
    ])).filter(Boolean) as Array<{ filename: string; content: Buffer }>;

    const corpo = `
<h2 style="color:#333;margin-top:0;">Cadastro de Prestador Finalizado</h2>
<p>Um novo prestador foi cadastrado na plataforma. Dados completos abaixo:</p>
${tabela({
  "Nome": dados.nome,
  "Telefone": dados.telefone,
  "CPF": dados.cpf,
  "Email": dados.email,
  "Chave Pix": dados.chavePix,
  "Tipo de veiculo": dados.tipoVeiculo,
  "Placa": dados.placa,
  "Origem do cadastro": dados.origem === "whatsapp" ? "Fluxo WhatsApp" : dados.origem === "admin_manual" ? "Cadastro manual admin" : "Link de convite",
  "Data/Hora do aceite": dados.dataAceite || new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
})}
<p style="margin-top:20px;color:#666;font-size:13px;">
As fotos (selfie com documento, documento aberto, placa, veiculo) estao anexadas neste email e tambem salvas no Supabase Storage.
</p>
${dados.selfieUrl ? `<p style="font-size:12px;color:#999;">Paths internos (use signed URL pra acessar):<br>
Selfie: ${dados.selfieUrl}<br>
Documento: ${dados.fotoDocumentoUrl || "-"}<br>
Placa: ${dados.fotoPlacaUrl || "-"}<br>
Veiculo: ${dados.fotoVeiculoUrl || "-"}</p>` : ""}
`;

    await resend.emails.send({
      from: FROM_PEGUE,
      to: [EMAIL_ARCHIVE_PRINCIPAL, EMAIL_ARCHIVE_COPIA],
      subject: `[Pegue] Cadastro Prestador - ${dados.nome} (${dados.telefone})`,
      html: layoutEmail("Cadastro de Prestador", corpo),
      attachments: anexos,
    });
    return true;
  } catch (error: any) {
    console.error("Erro email cadastro prestador:", error?.message);
    return false;
  }
}

// === 2. Reclamacao de cliente ===
export async function enviarEmailReclamacao(dados: {
  clienteNome: string;
  clienteTelefone: string;
  fretistaNome: string;
  fretistaTelefone: string;
  corridaCodigo: string;
  corridaId: string;
  origem: string;
  destino: string;
  valor: number;
  mensagemReclamacao: string;
}) {
  try {
    const corpo = `
<h2 style="color:#d00;margin-top:0;">⚠️ Reclamacao de Cliente</h2>
<p>O cliente reportou problema na entrega. Avalie e entre em contato pra resolver.</p>
${tabela({
  "Cliente": dados.clienteNome,
  "Telefone cliente": dados.clienteTelefone,
  "Fretista": dados.fretistaNome,
  "Telefone fretista": dados.fretistaTelefone,
  "Codigo corrida": dados.corridaCodigo,
  "ID corrida": dados.corridaId,
  "Origem": dados.origem,
  "Destino": dados.destino,
  "Valor": `R$ ${dados.valor}`,
})}
<div style="background:#fff5f5;border-left:4px solid #d00;padding:15px;margin:20px 0;">
  <strong>Mensagem do cliente:</strong><br>
  <em>${dados.mensagemReclamacao}</em>
</div>
`;
    await resend.emails.send({
      from: FROM_PEGUE,
      to: [EMAIL_ARCHIVE_PRINCIPAL, EMAIL_ARCHIVE_COPIA],
      subject: `[Pegue] Reclamacao - Cliente (${dados.clienteTelefone}) - Corrida ${dados.corridaCodigo}`,
      html: layoutEmail("Reclamacao de Cliente", corpo),
    });
    return true;
  } catch (error: any) {
    console.error("Erro email reclamacao:", error?.message);
    return false;
  }
}

// === 3. Corrida confirmada ===
export async function enviarEmailCorridaConfirmada(dados: {
  corridaCodigo: string;
  corridaId: string;
  clienteNome: string;
  clienteTelefone: string;
  fretistaNome: string;
  fretistaTelefone: string;
  origem: string;
  destino: string;
  descricaoCarga: string;
  tipoVeiculo: string;
  dataFrete: string;
  valorCliente: number;
  valorPrestador: number;
  comissaoPegue: number;
}) {
  try {
    const corpo = `
<h2 style="color:#2a7;margin-top:0;">✅ Corrida Confirmada</h2>
<p>Um frete foi confirmado (cliente e fretista). Arquivo fiscal.</p>
${tabela({
  "Codigo": dados.corridaCodigo,
  "ID corrida": dados.corridaId,
  "Cliente": dados.clienteNome,
  "Telefone cliente": dados.clienteTelefone,
  "Fretista": dados.fretistaNome,
  "Telefone fretista": dados.fretistaTelefone,
  "Origem": dados.origem,
  "Destino": dados.destino,
  "Material": dados.descricaoCarga,
  "Veiculo": dados.tipoVeiculo,
  "Data/Horario": dados.dataFrete,
  "Valor cliente pagou": `R$ ${dados.valorCliente}`,
  "Valor fretista recebe": `R$ ${dados.valorPrestador}`,
  "Comissao Pegue": `R$ ${dados.comissaoPegue}`,
})}
`;
    await resend.emails.send({
      from: FROM_PEGUE,
      to: [EMAIL_ARCHIVE_PRINCIPAL, EMAIL_ARCHIVE_COPIA],
      subject: `[Pegue] Corrida Confirmada - ${dados.corridaCodigo} - R$ ${dados.valorCliente}`,
      html: layoutEmail("Corrida Confirmada", corpo),
    });
    return true;
  } catch (error: any) {
    console.error("Erro email corrida confirmada:", error?.message);
    return false;
  }
}

// === 4. Abandono de fretista ===
export async function enviarEmailAbandono(dados: {
  fretistaNome: string;
  fretistaTelefone: string;
  corridaCodigo: string;
  corridaId: string;
  origem: string;
  destino: string;
  dataFrete: string;
  valor: number;
  statusCorrida: string;
}) {
  try {
    const corpo = `
<h2 style="color:#c60;margin-top:0;">🚨 Abandono de Fretista</h2>
<p>Fretista aceitou frete, nao respondeu os lembretes em 40min. Penalidade aplicada.</p>
${tabela({
  "Fretista": dados.fretistaNome,
  "Telefone": dados.fretistaTelefone,
  "Corrida": dados.corridaCodigo,
  "ID corrida": dados.corridaId,
  "Origem": dados.origem,
  "Destino": dados.destino,
  "Data/Horario do frete": dados.dataFrete,
  "Valor": `R$ ${dados.valor}`,
  "Status corrida": dados.statusCorrida,
  "Acao": "Score -5, conta desativada se ja foi pago",
})}
`;
    await resend.emails.send({
      from: FROM_PEGUE,
      to: [EMAIL_ARCHIVE_PRINCIPAL, EMAIL_ARCHIVE_COPIA],
      subject: `[Pegue] Abandono de Fretista - ${dados.fretistaNome} (${dados.fretistaTelefone})`,
      html: layoutEmail("Abandono de Fretista", corpo),
    });
    return true;
  } catch (error: any) {
    console.error("Erro email abandono:", error?.message);
    return false;
  }
}

// === 5. Resumo operacional diario (so pro email pessoal) ===
export async function enviarEmailResumoDia(dados: {
  dataStr: string;
  totalCotacoes: number;
  totalCorridasConfirmadas: number;
  totalCanceladas: number;
  totalAbandonos: number;
  faturamentoBruto: number;
  comissaoPegue: number;
  pagoPrestadores: number;
  novosPrestadores: number;
  novosClientes: number;
  topClientes: { nome: string; corridas: number }[];
  topFretistas: { nome: string; corridas: number; score: number }[];
}) {
  try {
    const topClientesHtml = dados.topClientes.length > 0
      ? dados.topClientes.map(c => `<li>${c.nome} - ${c.corridas} corridas</li>`).join("")
      : "<li><em>Nenhum</em></li>";
    const topFretistasHtml = dados.topFretistas.length > 0
      ? dados.topFretistas.map(f => `<li>${f.nome} - ${f.corridas} corridas (score ${f.score.toFixed(1)})</li>`).join("")
      : "<li><em>Nenhum</em></li>";

    const corpo = `
<h2 style="color:#333;margin-top:0;">📊 Resumo do Dia ${dados.dataStr}</h2>
<p>Panorama operacional das ultimas 24h.</p>

<h3 style="color:#C9A84C;margin-top:25px;">Operacao</h3>
${tabela({
  "Cotacoes iniciadas": dados.totalCotacoes,
  "Corridas confirmadas": dados.totalCorridasConfirmadas,
  "Canceladas": dados.totalCanceladas,
  "Abandonos": dados.totalAbandonos,
})}

<h3 style="color:#C9A84C;margin-top:25px;">Financeiro</h3>
${tabela({
  "Faturamento bruto": `R$ ${dados.faturamentoBruto.toFixed(2)}`,
  "Comissao Pegue (12%)": `R$ ${dados.comissaoPegue.toFixed(2)}`,
  "Pago a prestadores (88%)": `R$ ${dados.pagoPrestadores.toFixed(2)}`,
})}

<h3 style="color:#C9A84C;margin-top:25px;">Crescimento</h3>
${tabela({
  "Novos clientes": dados.novosClientes,
  "Novos prestadores": dados.novosPrestadores,
})}

<h3 style="color:#C9A84C;margin-top:25px;">Top 5 Clientes</h3>
<ul style="font-size:14px;color:#333;">${topClientesHtml}</ul>

<h3 style="color:#C9A84C;margin-top:25px;">Top 5 Fretistas</h3>
<ul style="font-size:14px;color:#333;">${topFretistasHtml}</ul>
`;

    await resend.emails.send({
      from: FROM_PEGUE,
      to: [EMAIL_PESSOAL_FABIO], // so pessoal, nao vai pro arquivo
      subject: `[Pegue] Resumo do Dia ${dados.dataStr}`,
      html: layoutEmail(`Resumo operacional - ${dados.dataStr}`, corpo),
    });
    return true;
  } catch (error: any) {
    console.error("Erro email resumo dia:", error?.message);
    return false;
  }
}

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
      from: FROM_PEGUE,
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

    <p><strong>4. RESPONSABILIDADE POR DANOS E PREJUIZOS</strong><br>
    - O prestador e responsavel por qualquer dano, avaria ou extravio de materiais durante o transporte<br>
    - Em caso de dano comprovado, o valor sera descontado dos seus recebiveis<br>
    - Transporte com cuidado! Proteja os materiais adequadamente</p>

    <div style="background:#2a1a0a;border:2px solid #C9A84C;border-radius:8px;padding:15px;margin:15px 0;">
      <p style="margin:0 0 8px;color:#C9A84C;font-weight:bold;font-size:14px;">⚠️ ATENCAO - COBRANCA ADICIONAL</p>
      <p style="margin:0;color:#ffffff;font-size:13px;line-height:1.6;">
        Caso o <strong>valor do frete nao seja suficiente</strong> para cobrir os danos e prejuizos causados ao cliente contratante, uma <strong>cobranca adicional sera necessaria</strong> para sanar a ocorrencia.
        <br><br>
        O pagamento desta cobranca adicional podera ser feito via <strong>Pix</strong> ou <strong>cartao de credito</strong>.
      </p>
    </div>

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
