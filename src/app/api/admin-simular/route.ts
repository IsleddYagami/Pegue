import { NextRequest, NextResponse } from "next/server";
import { isValidAdminKey } from "@/lib/admin-auth";
import { calcularPrecos } from "@/lib/bot-utils";
import { Resend } from "resend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const resend = new Resend(process.env.RESEND_API_KEY || "");

// Listas de itens por tamanho
const ITENS_PEQUENOS = [
  "Microondas", "TV 32\"", "Ventilador de coluna", "Tanquinho",
  "Mesa de centro", "Bicicleta", "Maquina de costura",
  "Ar condicionado split", "Impressora grande", "Berco desmontado",
  "Mala grande", "Cadeira gamer", "Aquario medio", "10 caixas",
];

const ITENS_MEDIOS = [
  "Geladeira pequena", "Fogao 4 bocas", "Maquina de lavar 8kg",
  "Cama solteiro", "Colchao solteiro", "Escrivaninha",
  "Rack de TV", "Poltrona", "Comoda 4 gavetas",
  "Freezer horizontal pequeno", "Armario de cozinha pequeno",
  "Mesa de jantar 4 lugares", "Conjunto 4 cadeiras",
  "Sofa 2 lugares", "TV 55\"",
];

const ITENS_GRANDES = [
  "Geladeira duplex", "Fogao 5 bocas", "Maquina de lavar 12kg",
  "Cama casal box", "Colchao casal", "Guarda-roupa 3 portas",
  "Guarda-roupa 6 portas", "Sofa 3 lugares", "Sofa retratil",
  "Mesa de jantar 6 lugares", "Estante grande",
  "Armario de cozinha modulado", "Freezer vertical",
];

type Filtros = {
  veiculos: string[]; // ["utilitario", "hr", "caminhao_bau", "carro_comum"]
  qtdMin: number;
  qtdMax: number;
  tamanhos: string[]; // ["pequeno", "medio", "grande"]
  distancias: number[]; // [3, 5, 10, 20, 50]
  ajudantes: number[]; // [0, 1, 2]
  tiposLocal: Array<"terreo" | "elevador" | "escada">;
  andaresEscada?: number; // so se "escada" estiver marcado
  zonas: Array<"normal" | "dificil" | "fundao">;
  taxasTemporais: string[]; // ["normal", "noturno", "feriado", "fim_semana"]
  totalCotacoes: number; // 50, 100, 300, 500, 1000
  enviarEmail: boolean;
  destinatarioEmail?: string;
};

function escolhaAleatoria<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function poolItensFiltrado(tamanhos: string[]): string[] {
  let pool: string[] = [];
  if (tamanhos.includes("pequeno")) pool = [...pool, ...ITENS_PEQUENOS];
  if (tamanhos.includes("medio")) pool = [...pool, ...ITENS_MEDIOS];
  if (tamanhos.includes("grande")) pool = [...pool, ...ITENS_GRANDES];
  return pool;
}

function gerarCombinacao(pool: string[], qtd: number): string[] {
  const sel: string[] = [];
  let tentativas = 0;
  while (sel.length < qtd && tentativas < 100) {
    const item = escolhaAleatoria(pool);
    if (!sel.includes(item)) sel.push(item);
    tentativas++;
  }
  return sel;
}

function nomeZona(z: string): string {
  if (z === "dificil") return "Zona dificil (+15%)";
  if (z === "fundao") return "Fundao (+30%)";
  return "Normal";
}

function nomeTaxa(t: string): string {
  if (t === "noturno") return "Noturno (+30%)";
  if (t === "feriado") return "Feriado (+30%)";
  if (t === "fim_semana") return "Fim de semana (+20%)";
  return "Normal";
}

function nomeVeiculo(v: string): string {
  const map: Record<string, string> = {
    carro_comum: "Carro comum",
    utilitario: "Utilitario",
    hr: "HR",
    caminhao_bau: "Caminhao Bau",
    guincho: "Guincho",
    moto_guincho: "Guincho moto",
  };
  return map[v] || v;
}

function fakeEnderecoPorZona(z: string): string {
  if (z === "fundao") return "Capao Redondo - SP";
  if (z === "dificil") return "Itapevi - SP";
  return "Centro - SP";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!isValidAdminKey(body.key)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
    }

    const f: Filtros = body.filtros;
    if (!f) return NextResponse.json({ error: "filtros obrigatorio" }, { status: 400 });

    // Validacao basica
    if (!f.veiculos?.length) return NextResponse.json({ error: "Escolha pelo menos 1 veiculo" }, { status: 400 });
    if (!f.tamanhos?.length) return NextResponse.json({ error: "Escolha pelo menos 1 tamanho de item" }, { status: 400 });
    if (!f.distancias?.length) return NextResponse.json({ error: "Escolha pelo menos 1 distancia" }, { status: 400 });
    if (!f.ajudantes?.length) f.ajudantes = [0];
    if (!f.tiposLocal?.length) f.tiposLocal = ["terreo"];
    if (!f.zonas?.length) f.zonas = ["normal"];
    if (!f.taxasTemporais?.length) f.taxasTemporais = ["normal"];

    const pool = poolItensFiltrado(f.tamanhos);
    if (pool.length === 0) return NextResponse.json({ error: "Nenhum item disponivel pra tamanhos escolhidos" }, { status: 400 });

    const total = Math.min(f.totalCotacoes || 100, 2000);
    const cotacoes: Array<Record<string, any>> = [];

    for (let i = 1; i <= total; i++) {
      const qtd = f.qtdMin === f.qtdMax ? f.qtdMin : (f.qtdMin + Math.floor(Math.random() * (f.qtdMax - f.qtdMin + 1)));
      const itens = gerarCombinacao(pool, qtd);
      const veiculo = escolhaAleatoria(f.veiculos);
      const distancia = escolhaAleatoria(f.distancias);
      const qtdAjudantes = escolhaAleatoria(f.ajudantes);
      const tipoLocal = escolhaAleatoria(f.tiposLocal);
      const zona = escolhaAleatoria(f.zonas);
      const taxa = escolhaAleatoria(f.taxasTemporais);

      const andares = tipoLocal === "escada" ? (f.andaresEscada ?? 2) : 0;
      const temElevador = tipoLocal === "elevador";

      const endereco = fakeEnderecoPorZona(zona);
      const precos = calcularPrecos(distancia, veiculo, qtdAjudantes > 0, andares, temElevador, endereco);

      let total = precos.padrao.total;

      // Ajudante extra (2 ajudantes)
      if (qtdAjudantes === 2) {
        total += distancia <= 10 ? 80 : 100;
      }

      // Taxas temporais (aplicadas so no final)
      if (taxa === "noturno") total = Math.round(total * 1.3);
      else if (taxa === "feriado") total = Math.round(total * 1.3);
      else if (taxa === "fim_semana") total = Math.round(total * 1.2);

      cotacoes.push({
        id: i,
        qtd,
        itens: itens.join(" + "),
        veiculo: nomeVeiculo(veiculo),
        distancia,
        ajudantes: qtdAjudantes,
        tipoLocal,
        andares,
        zona: nomeZona(zona),
        taxa: nomeTaxa(taxa),
        precoBase: precos.padrao.base,
        precoAjudante: precos.padrao.ajudante,
        precoElevador: precos.padrao.elevador,
        precoEscada: precos.padrao.escada,
        precoTotal: total,
        comissaoPegue: Math.round(total * 0.12),
        valorPrestador: Math.round(total * 0.88),
      });
    }

    // Estatisticas
    const totalCount = cotacoes.length;
    const somaTotal = cotacoes.reduce((s, c) => s + c.precoTotal, 0);
    const precoMedio = Math.round(somaTotal / totalCount);
    const precoMin = Math.min(...cotacoes.map(c => c.precoTotal));
    const precoMax = Math.max(...cotacoes.map(c => c.precoTotal));

    const resumoPorVeiculo: Record<string, { count: number; media: number }> = {};
    for (const c of cotacoes) {
      if (!resumoPorVeiculo[c.veiculo]) resumoPorVeiculo[c.veiculo] = { count: 0, media: 0 };
      resumoPorVeiculo[c.veiculo].count++;
      resumoPorVeiculo[c.veiculo].media += c.precoTotal;
    }
    for (const k in resumoPorVeiculo) {
      resumoPorVeiculo[k].media = Math.round(resumoPorVeiculo[k].media / resumoPorVeiculo[k].count);
    }

    // Se pediu email, envia
    if (f.enviarEmail) {
      const destinatario = f.destinatarioEmail || "fabiosantoscrispim@gmail.com";
      try {
        const linhas = cotacoes.map(c => `
<tr style="border-bottom:1px solid #eee;">
  <td style="padding:5px 6px;font-size:10px;color:#888;">${c.id}</td>
  <td style="padding:5px 6px;text-align:center;font-size:10px;"><strong>${c.qtd}</strong></td>
  <td style="padding:5px 6px;font-size:10px;">${c.itens}</td>
  <td style="padding:5px 6px;text-align:center;font-size:10px;color:#c60;font-weight:bold;">${c.veiculo}</td>
  <td style="padding:5px 6px;text-align:center;font-size:10px;">${c.distancia}km</td>
  <td style="padding:5px 6px;text-align:center;font-size:10px;">${c.ajudantes}</td>
  <td style="padding:5px 6px;font-size:10px;color:#666;">${c.tipoLocal}${c.andares > 0 ? ` ${c.andares}o` : ""}</td>
  <td style="padding:5px 6px;font-size:10px;color:#666;">${c.zona}</td>
  <td style="padding:5px 6px;font-size:10px;color:#666;">${c.taxa}</td>
  <td style="padding:5px 6px;text-align:right;font-size:10px;"><strong>R$ ${c.precoTotal}</strong></td>
</tr>`).join("");

        const resumoHtml = Object.entries(resumoPorVeiculo).map(([v, r]) => `${v}: ${r.count} cotacoes · media R$ ${r.media}`).join(" · ");

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;font-family:Arial,sans-serif;background:#f5f5f5;">
<div style="max-width:1000px;margin:0 auto;background:#fff;padding:25px;">
  <div style="border-bottom:3px solid #C9A84C;padding-bottom:12px;margin-bottom:18px;">
    <h1 style="color:#C9A84C;margin:0;font-size:22px;">PEGUE - Simulacao Personalizada</h1>
    <p style="color:#666;margin:5px 0 0;font-size:12px;">${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
  </div>
  <div style="background:#fffbe6;border-left:4px solid #C9A84C;padding:10px;margin-bottom:15px;font-size:12px;color:#444;">
    <strong>Total gerado: ${totalCount} cotacoes</strong><br>
    Preco medio: <strong>R$ ${precoMedio}</strong> · Min: R$ ${precoMin} · Max: R$ ${precoMax}<br>
    ${resumoHtml}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    <thead><tr style="background:#0A0A0A;color:#C9A84C;">
      <th style="padding:6px;">#</th><th style="padding:6px;">Qtd</th><th style="padding:6px;text-align:left;">Itens</th>
      <th style="padding:6px;">Veic</th><th style="padding:6px;">Dist</th><th style="padding:6px;">Ajud</th>
      <th style="padding:6px;text-align:left;">Local</th><th style="padding:6px;text-align:left;">Zona</th>
      <th style="padding:6px;text-align:left;">Taxa</th><th style="padding:6px;text-align:right;">Total</th>
    </tr></thead>
    <tbody>${linhas}</tbody>
  </table>
</div></body></html>`;

        await resend.emails.send({
          from: "Pegue <no-reply@chamepegue.com.br>",
          to: destinatario,
          subject: `[Pegue] Simulacao Personalizada (${totalCount} cotacoes) - ${new Date().toLocaleDateString("pt-BR")}`,
          html,
        });
      } catch (e: any) {
        console.error("Erro email simulacao:", e?.message);
      }
    }

    return NextResponse.json({
      status: "ok",
      cotacoes,
      resumo: {
        total: totalCount,
        precoMedio,
        precoMin,
        precoMax,
        porVeiculo: resumoPorVeiculo,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
