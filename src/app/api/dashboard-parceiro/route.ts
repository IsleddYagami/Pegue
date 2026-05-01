import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { sendToClient } from "@/lib/chatpro";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// BUG #BATCH5-2 (re-audit 1/Mai/2026): mesma vuln do dashboard-cliente —
// expunha faturamento, despesas pessoais, regioes, historico de fretes
// pra qualquer um que tivesse o phone do fretista. Brute force trivial.
// Agora exige OTP via WhatsApp (mesmo padrao do dashboard-cliente).

const OTP_TTL_MS = 10 * 60 * 1000;

function gerarOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit({ chave: `dashpar_otp:${ip}`, max: 3 });
  if (!rl.permitido) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 1 minuto." },
      { status: 429 },
    );
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body invalido" }, { status: 400 });
  }

  const phoneRaw = (body?.phone || "").toString().replace(/\D/g, "");
  if (phoneRaw.length < 12 || phoneRaw.length > 13) {
    return NextResponse.json({ error: "telefone invalido" }, { status: 400 });
  }

  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id, telefone")
    .eq("telefone", phoneRaw)
    .maybeSingle();

  if (prestador?.telefone) {
    const otp = gerarOtp();
    const expiraEm = new Date(Date.now() + OTP_TTL_MS).toISOString();

    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "dashboard_parceiro_otp",
        phone: phoneRaw,
        otp,
        expira_em: expiraEm,
        tentativas: 0,
        ip_solicitante: ip.replace(/\d+$/, "x"),
      },
    });

    await sendToClient({
      to: phoneRaw,
      message: `🔐 *Codigo de acesso ao seu painel de parceiro:*\n\n*${otp}*\n\nVale por 10 minutos. Se nao foi voce, ignore essa mensagem.`,
    });
  }

  return NextResponse.json({
    status: "ok",
    mensagem: "Se esse telefone tiver cadastro de parceiro, um codigo foi enviado pelo WhatsApp.",
  });
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit({ chave: `dashpar_get:${ip}`, max: 10 });
  if (!rl.permitido) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 1 minuto." },
      { status: 429 },
    );
  }

  const phone = req.nextUrl.searchParams.get("phone")?.replace(/\D/g, "") || "";
  const otp = req.nextUrl.searchParams.get("otp")?.replace(/\D/g, "") || "";

  if (!phone) {
    return NextResponse.json({ error: "Informe o telefone" }, { status: 400 });
  }
  if (!otp || otp.length !== 6) {
    return NextResponse.json({ error: "codigo de acesso obrigatorio" }, { status: 401 });
  }

  // Valida OTP
  const { data: logsOtp } = await supabase
    .from("bot_logs")
    .select("id, payload, criado_em")
    .filter("payload->>tipo", "eq", "dashboard_parceiro_otp")
    .filter("payload->>phone", "eq", phone)
    .order("criado_em", { ascending: false })
    .limit(1);

  if (!logsOtp || logsOtp.length === 0) {
    return NextResponse.json({ error: "codigo invalido ou expirado" }, { status: 401 });
  }

  const logRow = logsOtp[0];
  const payload = logRow.payload as any;

  if (payload.expira_em && new Date(payload.expira_em) < new Date()) {
    return NextResponse.json({ error: "codigo expirado" }, { status: 401 });
  }
  if (payload.consumido_em) {
    return NextResponse.json({ error: "codigo ja foi usado" }, { status: 401 });
  }
  const tentativas = Number(payload.tentativas || 0);
  if (tentativas >= 3) {
    return NextResponse.json({ error: "muitas tentativas erradas" }, { status: 401 });
  }
  if (payload.otp !== otp) {
    await supabase
      .from("bot_logs")
      .update({ payload: { ...payload, tentativas: tentativas + 1 } })
      .eq("id", logRow.id);
    return NextResponse.json({ error: "codigo incorreto" }, { status: 401 });
  }
  // OTP valido — marca como consumido (single-use)
  await supabase
    .from("bot_logs")
    .update({
      payload: {
        ...payload,
        consumido_em: new Date().toISOString(),
        consumido_ip: ip.replace(/\d+$/, "x"),
      },
    })
    .eq("id", logRow.id);

  // Busca prestador
  const { data: prestador } = await supabase
    .from("prestadores")
    .select("id, nome, score, total_corridas, status, disponivel")
    .eq("telefone", phone)
    .single();

  if (!prestador) {
    return NextResponse.json({ error: "Parceiro nao encontrado" }, { status: 404 });
  }

  // Busca veiculo
  const { data: veiculos } = await supabase
    .from("prestadores_veiculos")
    .select("tipo, placa")
    .eq("prestador_id", prestador.id)
    .eq("ativo", true)
    .limit(1);

  // Busca todas as corridas concluidas
  const { data: corridas } = await supabase
    .from("corridas")
    .select("valor_prestador, destino_endereco, origem_endereco, descricao_carga, distancia_km, criado_em, status, periodo")
    .eq("prestador_id", prestador.id)
    .order("criado_em", { ascending: false });

  const corridasConcluidas = corridas?.filter(c => c.status === "concluida") || [];
  const todasCorridas = corridas || [];

  // Faturamento total
  const faturamentoTotal = corridasConcluidas.reduce((sum, c) => sum + (c.valor_prestador || 0), 0);

  // Faturamento mes atual
  const mesAtual = new Date().getMonth();
  const anoAtual = new Date().getFullYear();
  const corridasMes = corridasConcluidas.filter(c => {
    const d = new Date(c.criado_em);
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  });
  const faturamentoMes = corridasMes.reduce((sum, c) => sum + (c.valor_prestador || 0), 0);

  // Faturamento mes anterior
  const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
  const anoMesAnterior = mesAtual === 0 ? anoAtual - 1 : anoAtual;
  const corridasMesAnterior = corridasConcluidas.filter(c => {
    const d = new Date(c.criado_em);
    return d.getMonth() === mesAnterior && d.getFullYear() === anoMesAnterior;
  });
  const faturamentoMesAnterior = corridasMesAnterior.reduce((sum, c) => sum + (c.valor_prestador || 0), 0);

  // Variacao percentual
  const variacao = faturamentoMesAnterior > 0
    ? Math.round(((faturamentoMes - faturamentoMesAnterior) / faturamentoMesAnterior) * 100)
    : 0;

  // Faturamento semana
  const umaSemanaAtras = new Date();
  umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);
  const corridasSemana = corridasConcluidas.filter(c => new Date(c.criado_em) >= umaSemanaAtras);
  const faturamentoSemana = corridasSemana.reduce((sum, c) => sum + (c.valor_prestador || 0), 0);

  // Combustivel estimado (media R$5/km, consumo 10km/litro, gasolina R$6/litro)
  const kmTotal = corridasConcluidas.reduce((sum, c) => sum + (c.distancia_km || 0), 0);
  const combustivelEstimado = Math.round((kmTotal / 10) * 6);
  const lucroReal = faturamentoTotal - combustivelEstimado;

  // Regioes mais atendidas
  const regioes: Record<string, number> = {};
  corridasConcluidas.forEach(c => {
    const destino = c.destino_endereco || "Desconhecido";
    // Pega ultima parte do endereco (cidade/bairro)
    const partes = destino.split(",");
    const regiao = partes.length > 1 ? partes[partes.length - 2]?.trim() : partes[0]?.trim();
    if (regiao) {
      regioes[regiao] = (regioes[regiao] || 0) + 1;
    }
  });
  const topRegioes = Object.entries(regioes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nome, qtd]) => ({ nome, qtd }));

  // Historico ultimos 10 fretes
  const historico = todasCorridas.slice(0, 10).map(c => ({
    destino: c.destino_endereco || "---",
    origem: c.origem_endereco || "---",
    valor: c.valor_prestador || 0,
    carga: c.descricao_carga || "---",
    data: c.periodo || new Date(c.criado_em).toLocaleDateString("pt-BR"),
    status: c.status,
  }));

  // Avaliacao media (busca do bot_logs)
  const { data: avaliacoes } = await supabase
    .from("bot_logs")
    .select("payload")
    .filter("payload->>tipo", "eq", "avaliacao")
    .filter("payload->>categoria", "eq", "fretista");

  let avaliacaoMedia = 0;
  let totalAvaliacoes = 0;
  if (avaliacoes && avaliacoes.length > 0) {
    const notas = avaliacoes
      .map(a => (a.payload as any)?.nota)
      .filter(n => typeof n === "number");
    if (notas.length > 0) {
      avaliacaoMedia = notas.reduce((s, n) => s + n, 0) / notas.length;
      totalAvaliacoes = notas.length;
    }
  }

  // Meta mensal (ex: 20 fretes)
  const metaMensal = 20;
  const fretesMes = corridasMes.length;
  const progressoMeta = Math.min(Math.round((fretesMes / metaMensal) * 100), 100);

  // === CONTROLE FINANCEIRO PESSOAL ===
  const { data: despesas } = await supabase
    .from("bot_logs")
    .select("payload")
    .filter("payload->>tipo", "eq", "despesa_pessoal")
    .filter("payload->>phone", "eq", phone);

  const mesAtualNum = new Date().getMonth() + 1;
  const anoAtualNum = new Date().getFullYear();

  const despesasMes = despesas
    ? despesas.filter(d => {
        const p = d.payload as any;
        return p.mes === mesAtualNum && p.ano === anoAtualNum;
      })
    : [];

  const totalGastosPessoais = despesasMes.reduce((s, d) => s + ((d.payload as any).valor || 0), 0);

  const categoriaGastos: Record<string, number> = {};
  despesasMes.forEach(d => {
    const desc = ((d.payload as any).descricao || "Outros").toLowerCase();
    let cat = "Outros";
    if (desc.includes("combustivel") || desc.includes("gasolina") || desc.includes("etanol") || desc.includes("diesel")) cat = "Combustivel";
    else if (desc.includes("almoco") || desc.includes("janta") || desc.includes("lanche") || desc.includes("comida") || desc.includes("refeicao") || desc.includes("cafe")) cat = "Alimentacao";
    else if (desc.includes("pedagio") || desc.includes("estacionamento")) cat = "Pedagio/Estac.";
    else if (desc.includes("manutencao") || desc.includes("oficina") || desc.includes("pneu") || desc.includes("oleo")) cat = "Manutencao";
    else if (desc.includes("bebida") || desc.includes("agua") || desc.includes("suco") || desc.includes("refrigerante")) cat = "Bebidas";
    else if (desc.includes("celular") || desc.includes("internet") || desc.includes("recarga") || desc.includes("chip")) cat = "Celular/Internet";
    else if (desc.includes("carrinho") || desc.includes("palet") || desc.includes("ferramenta") || desc.includes("corda") || desc.includes("lona") || desc.includes("fita") || desc.includes("cobertor") || desc.includes("cinta") || desc.includes("roda")) cat = "Ferramentas/Materiais";
    else cat = (d.payload as any).descricao || "Outros";
    categoriaGastos[cat] = (categoriaGastos[cat] || 0) + (d.payload as any).valor;
  });

  const categoriasOrdenadas = Object.entries(categoriaGastos)
    .sort((a, b) => b[1] - a[1])
    .map(([nome, valor]) => ({ nome, valor, pct: totalGastosPessoais > 0 ? Math.round((valor / totalGastosPessoais) * 100) : 0 }));

  const ultimasDespesas = despesasMes
    .map(d => ({ descricao: (d.payload as any).descricao, valor: (d.payload as any).valor, data: (d.payload as any).data_sp || "" }))
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    .slice(0, 10);

  const lucroLiquido = faturamentoMes - totalGastosPessoais;

  return NextResponse.json({
    nome: prestador.nome,
    score: prestador.score || 5.0,
    totalFretes: prestador.total_corridas || corridasConcluidas.length,
    status: prestador.status,
    disponivel: prestador.disponivel,
    veiculo: veiculos && veiculos.length > 0 ? veiculos[0] : null,
    financeiro: {
      faturamentoTotal,
      faturamentoMes,
      faturamentoSemana,
      faturamentoMesAnterior,
      variacao,
      combustivelEstimado,
      lucroReal,
      kmTotal: Math.round(kmTotal),
    },
    topRegioes,
    historico,
    avaliacao: {
      media: Math.round(avaliacaoMedia * 10) / 10,
      total: totalAvaliacoes,
    },
    meta: {
      fretesMes,
      metaMensal,
      progressoMeta,
    },
    controlefinanceiro: {
      totalGastosMes: totalGastosPessoais,
      ganhosMes: faturamentoMes,
      lucroLiquido,
      categorias: categoriasOrdenadas,
      ultimasDespesas,
    },
  });
}
