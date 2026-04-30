import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { calcularPrecos } from "@/lib/bot-utils";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const resend = new Resend(process.env.RESEND_API_KEY || "");

// Itens classificados por tamanho pra decidir utilitario vs HR
const ITENS_PEQUENOS = [
  "Microondas", "TV 32\"", "Ventilador de coluna", "Tanquinho",
  "Mesa de centro", "Bicicleta", "Maquina de costura",
  "Ar condicionado", "Impressora grande", "Berco desmontado",
  "Mala grande", "Cadeira gamer", "Aquario medio",
];

const ITENS_MEDIOS = [
  "Geladeira pequena", "Fogao 4 bocas", "Maquina de lavar 8kg",
  "Cama solteiro", "Colchao solteiro", "Escrivaninha",
  "Rack de TV", "Poltrona", "Comoda 4 gavetas",
  "Freezer horizontal pequeno", "Armario de cozinha pequeno",
  "Mesa de jantar 4 lugares", "Cadeiras (4 un)",
  "Sofa 2 lugares", "TV 55\"",
];

const ITENS_GRANDES = [
  "Geladeira duplex", "Fogao 5 bocas", "Maquina de lavar 12kg",
  "Cama casal box", "Colchao casal", "Guarda-roupa 3 portas",
  "Guarda-roupa 6 portas", "Sofa 3 lugares", "Sofa retratil",
  "Mesa de jantar 6 lugares", "Estante grande",
  "Armario de cozinha modulado", "Freezer vertical",
  "Home theater completo",
];

const TODOS_ITENS = [...ITENS_PEQUENOS, ...ITENS_MEDIOS, ...ITENS_GRANDES];

// Distancias tipicas em SP/Grande SP
const DISTANCIAS = [3, 5, 8, 10, 12, 15, 18, 20, 25, 30, 35, 40, 45, 50];

// Decide veiculo baseado nos itens (mesma regra do prompt da IA)
function decidirVeiculo(itens: string[]): "utilitario" | "hr" {
  // 1 item = sempre utilitario (nossa regra)
  if (itens.length === 1) return "utilitario";

  // Conta grandes
  const grandes = itens.filter(i => ITENS_GRANDES.includes(i)).length;
  const medios = itens.filter(i => ITENS_MEDIOS.includes(i)).length;

  // 2+ itens grandes = HR
  if (grandes >= 2) return "hr";

  // 1 grande + >=2 medios = HR
  if (grandes === 1 && medios >= 2) return "hr";

  // 4 itens todos medios = borderline HR, mas vamos manter utilitario (cabe na Strada/Saveiro)
  return "utilitario";
}

function escolhaAleatoria<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function gerarCombinacaoUnica(qtdItens: number): string[] {
  const selecionados: string[] = [];
  while (selecionados.length < qtdItens) {
    const item = escolhaAleatoria(TODOS_ITENS);
    if (!selecionados.includes(item)) selecionados.push(item);
  }
  return selecionados;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    // Gera 300 cotacoes: 100 com 1 item, 90 com 2, 60 com 3, 50 com 4
    const cotacoes: Array<{
      id: number;
      qtdItens: number;
      itens: string;
      veiculo: string;
      distanciaKm: number;
      precoSemAjudante: number;
      precoComAjudante: number;
    }> = [];

    const distribuicao = [
      { qtd: 1, total: 100 },
      { qtd: 2, total: 90 },
      { qtd: 3, total: 60 },
      { qtd: 4, total: 50 },
    ];

    let id = 1;
    for (const { qtd, total } of distribuicao) {
      for (let i = 0; i < total; i++) {
        const itens = gerarCombinacaoUnica(qtd);
        const veiculo = decidirVeiculo(itens);
        const distancia = escolhaAleatoria(DISTANCIAS);

        const semAjud = calcularPrecos(distancia, veiculo, false, 0, false, "");
        const comAjud = calcularPrecos(distancia, veiculo, true, 0, false, "");

        cotacoes.push({
          id: id++,
          qtdItens: qtd,
          itens: itens.join(" + "),
          veiculo: veiculo === "hr" ? "HR" : "Utilitario",
          distanciaKm: distancia,
          precoSemAjudante: semAjud.padrao.total,
          precoComAjudante: comAjud.padrao.total,
        });
      }
    }

    // Resumo estatistico
    const utilCount = cotacoes.filter(c => c.veiculo === "Utilitario").length;
    const hrCount = cotacoes.filter(c => c.veiculo === "HR").length;
    const precoMedioUtil = Math.round(
      cotacoes.filter(c => c.veiculo === "Utilitario").reduce((s, c) => s + c.precoSemAjudante, 0) / (utilCount || 1)
    );
    const precoMedioHR = Math.round(
      cotacoes.filter(c => c.veiculo === "HR").reduce((s, c) => s + c.precoSemAjudante, 0) / (hrCount || 1)
    );

    // Gera HTML da tabela
    const linhas = cotacoes.map(c => `
<tr style="border-bottom:1px solid #eee;">
  <td style="padding:6px 8px;color:#888;font-size:11px;">${c.id}</td>
  <td style="padding:6px 8px;text-align:center;font-size:11px;"><strong>${c.qtdItens}</strong></td>
  <td style="padding:6px 8px;font-size:12px;">${c.itens}</td>
  <td style="padding:6px 8px;text-align:center;font-size:11px;${c.veiculo === 'HR' ? 'color:#c60;font-weight:bold;' : 'color:#2a7;'}">${c.veiculo}</td>
  <td style="padding:6px 8px;text-align:center;font-size:11px;">${c.distanciaKm} km</td>
  <td style="padding:6px 8px;text-align:right;font-size:11px;"><strong>R$ ${c.precoSemAjudante}</strong></td>
  <td style="padding:6px 8px;text-align:right;font-size:11px;color:#666;">R$ ${c.precoComAjudante}</td>
</tr>`).join("");

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:900px;margin:0 auto;background:#fff;padding:30px;">
  <div style="border-bottom:3px solid #C9A84C;padding-bottom:15px;margin-bottom:20px;">
    <h1 style="color:#C9A84C;margin:0;font-size:24px;">PEGUE - Simulacao de 300 Cotacoes</h1>
    <p style="color:#666;margin:5px 0 0;font-size:13px;">Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
  </div>

  <div style="background:#fffbe6;border-left:4px solid #C9A84C;padding:12px;margin-bottom:20px;font-size:13px;color:#444;">
    <strong>Resumo estatistico:</strong><br>
    Utilitario: <strong>${utilCount}</strong> cotacoes · preco medio R$ ${precoMedioUtil} (sem ajudante)<br>
    HR: <strong>${hrCount}</strong> cotacoes · preco medio R$ ${precoMedioHR} (sem ajudante)<br>
    <br>
    <strong>Regra de veiculo usada:</strong><br>
    • 1 item = sempre Utilitario<br>
    • 2+ itens grandes = HR<br>
    • 1 grande + 2+ medios = HR<br>
    • Caso contrario = Utilitario<br>
    <br>
    <strong>Formula de preco (calibrada Abr/2026 com 200+ amostras):</strong><br>
    Base = 30 × √km + 148 · Mult Utilitario = 1.0 (≤20km), 1.05 (≤50km) · Mult HR = 1.5 · Ajudante = +R$ 80 (≤10km) ou +R$ 100 (>10km)
  </div>

  <table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead>
      <tr style="background:#0A0A0A;color:#C9A84C;">
        <th style="padding:8px;text-align:left;">#</th>
        <th style="padding:8px;text-align:center;">Qtd</th>
        <th style="padding:8px;text-align:left;">Itens</th>
        <th style="padding:8px;text-align:center;">Veiculo</th>
        <th style="padding:8px;text-align:center;">Dist.</th>
        <th style="padding:8px;text-align:right;">Sem ajud.</th>
        <th style="padding:8px;text-align:right;">Com ajud.</th>
      </tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>

  <p style="color:#999;font-size:10px;text-align:center;margin-top:20px;padding-top:15px;border-top:1px solid #eee;">
    Simulacao automatica Pegue - use pra validar valores do sistema
  </p>
</div></body></html>`;

    await resend.emails.send({
      from: "Pegue <no-reply@chamepegue.com.br>",
      to: "fabiosantoscrispim@gmail.com",
      subject: `[Pegue] Simulacao 300 Cotacoes (Utilitario + HR) - ${new Date().toLocaleDateString("pt-BR")}`,
      html,
    });

    return NextResponse.json({
      status: "ok",
      mensagem: `300 cotacoes geradas e enviadas pra fabiosantoscrispim@gmail.com`,
      resumo: {
        total: 300,
        utilitario: utilCount,
        hr: hrCount,
        precoMedioUtil,
        precoMedioHR,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
