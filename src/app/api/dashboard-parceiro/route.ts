import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");

  if (!phone) {
    return NextResponse.json({ error: "Informe o telefone" }, { status: 400 });
  }

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
  });
}
