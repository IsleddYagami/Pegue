import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const agora = new Date();
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const umaSemana = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
    const umMes = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);

    // === SESSOES (contatos WhatsApp) ===
    const { data: sessoes } = await supabase
      .from("bot_sessions")
      .select("phone, step, criado_em, atualizado_em, valor_estimado, descricao_carga, origem_endereco, destino_endereco");

    // Filtra grupos e numeros invalidos (so aceita formato BR valido)
    const { isValidBrPhone } = await import("@/lib/phone-utils");
    const todasSessoes = (sessoes || []).filter(s => isValidBrPhone(s.phone));
    const sessoesHoje = todasSessoes.filter(s => new Date(s.criado_em) >= hoje);
    const sessoesSemana = todasSessoes.filter(s => new Date(s.criado_em) >= umaSemana);
    const sessoesMes = todasSessoes.filter(s => new Date(s.criado_em) >= umMes);

    // === CORRIDAS ===
    const { data: corridas } = await supabase
      .from("corridas")
      .select("id, status, valor_final, valor_pegue, valor_prestador, descricao_carga, origem_endereco, destino_endereco, canal_origem, criado_em, periodo, prestador_id, prestadores(nome)")
      .order("criado_em", { ascending: false });

    const todasCorridas = corridas || [];
    const corridasHoje = todasCorridas.filter(c => new Date(c.criado_em) >= hoje);
    const corridasSemana = todasCorridas.filter(c => new Date(c.criado_em) >= umaSemana);
    const corridasMes = todasCorridas.filter(c => new Date(c.criado_em) >= umMes);
    const corridasConcluidas = todasCorridas.filter(c => c.status === "concluida");
    const corridasPendentes = todasCorridas.filter(c => c.status === "pendente");
    const corridasAceitas = todasCorridas.filter(c => c.status === "aceita");
    const corridasPagas = todasCorridas.filter(c => c.status === "paga");

    // === FINANCEIRO ===
    const faturamentoTotal = corridasConcluidas.reduce((s, c) => s + (c.valor_final || 0), 0);
    const comissaoPegue = corridasConcluidas.reduce((s, c) => s + (c.valor_pegue || 0), 0);
    const faturamentoMes = corridasMes.filter(c => c.status === "concluida").reduce((s, c) => s + (c.valor_final || 0), 0);
    const comissaoMes = corridasMes.filter(c => c.status === "concluida").reduce((s, c) => s + (c.valor_pegue || 0), 0);
    const ticketMedio = corridasConcluidas.length > 0 ? faturamentoTotal / corridasConcluidas.length : 0;

    // === FUNIL ===
    const iniciaramConversa = todasSessoes.length;
    const enviaramFoto = todasSessoes.filter(s =>
      s.descricao_carga && s.descricao_carga !== "" &&
      !["inicio", "aguardando_servico", "aguardando_localizacao", "aguardando_foto"].includes(s.step)
    ).length;
    const receberamOrcamento = todasSessoes.filter(s =>
      s.valor_estimado && s.valor_estimado > 0
    ).length;
    const fecharam = todasCorridas.length;
    const taxaConversao = iniciaramConversa > 0 ? Math.round((fecharam / iniciaramConversa) * 100) : 0;

    // === ABANDONOS (nao finalizaram) ===
    const abandonos = todasSessoes.filter(s =>
      s.step !== "concluido" &&
      s.step !== "cadastro_aguardando_aprovacao" &&
      s.step !== "aguardando_pagamento" &&
      s.step !== "aguardando_fretista" &&
      new Date(s.atualizado_em) < new Date(agora.getTime() - 30 * 60 * 1000) // mais de 30min sem atividade
    ).map(s => ({
      phone: s.phone,
      step: s.step,
      ultimaAtividade: s.atualizado_em,
      origem: s.origem_endereco,
      destino: s.destino_endereco,
      carga: s.descricao_carga,
      valor: s.valor_estimado,
    }));

    // === CLIENTES ===
    const { data: clientes } = await supabase
      .from("clientes")
      .select("id, telefone, nome, total_corridas, criado_em");

    const totalClientes = clientes?.length || 0;
    const clientesNovos = clientes?.filter(c => new Date(c.criado_em) >= umMes).length || 0;

    // === PRESTADORES ===
    const { data: prestadores } = await supabase
      .from("prestadores")
      .select("id, nome, telefone, status, score, disponivel, total_corridas");

    const totalPrestadores = prestadores?.length || 0;
    const prestadoresAtivos = prestadores?.filter(p => p.status === "aprovado" && p.disponivel).length || 0;
    const prestadoresPendentes = prestadores?.filter(p => p.status === "pendente").length || 0;

    // Busca detalhes dos pendentes com veiculos
    const pendentesDetalhados = [];
    const pendentesRaw = prestadores?.filter(p => p.status === "pendente") || [];
    for (const p of pendentesRaw) {
      const { data: veiculos } = await supabase
        .from("prestadores_veiculos")
        .select("tipo, placa")
        .eq("prestador_id", p.id)
        .limit(1);

      // Busca aceite dos termos
      const { data: aceite } = await supabase
        .from("bot_logs")
        .select("payload")
        .filter("payload->>tipo", "eq", "aceite_termos")
        .filter("payload->>phone", "eq", p.telefone)
        .limit(1);

      // Busca fotos do cadastro nos logs
      const { data: fotosLog } = await supabase
        .from("bot_logs")
        .select("payload")
        .filter("payload->>tipo", "eq", "pre_cadastro_site")
        .filter("payload->>telefone", "eq", p.telefone)
        .limit(1);

      pendentesDetalhados.push({
        id: p.id,
        nome: p.nome,
        telefone: p.telefone,
        cpf: (p as any).cpf || "",
        veiculo: veiculos?.[0] || null,
        dataAceite: aceite?.[0] ? (aceite[0].payload as any)?.data_hora_sp || (aceite[0].payload as any)?.data_hora : null,
        email: aceite?.[0] ? (aceite[0].payload as any)?.email : null,
      });
    }
    const scoreMedio = prestadores && prestadores.length > 0
      ? prestadores.reduce((s, p) => s + (p.score || 0), 0) / prestadores.length
      : 0;

    // === ULTIMAS CORRIDAS ===
    const ultimasCorridas = todasCorridas.slice(0, 15).map(c => ({
      id: c.id,
      status: c.status,
      valor: c.valor_final,
      comissao: c.valor_pegue,
      carga: c.descricao_carga,
      origem: c.origem_endereco,
      destino: c.destino_endereco,
      data: c.periodo || new Date(c.criado_em).toLocaleDateString("pt-BR"),
      prestador: (c.prestadores as any)?.nome || null,
    }));

    // === AVALIACOES ===
    const { data: avaliacoes } = await supabase
      .from("bot_logs")
      .select("payload")
      .filter("payload->>tipo", "eq", "avaliacao");

    let notaMedia = 0;
    let totalAvaliacoes = 0;
    const sugestoes: string[] = [];
    if (avaliacoes) {
      const notas = avaliacoes
        .filter(a => (a.payload as any)?.nota)
        .map(a => (a.payload as any).nota);
      if (notas.length > 0) {
        notaMedia = notas.reduce((s: number, n: number) => s + n, 0) / notas.length;
        totalAvaliacoes = notas.length;
      }
      avaliacoes
        .filter(a => (a.payload as any)?.categoria === "sugestao" && (a.payload as any)?.texto)
        .forEach(a => sugestoes.push((a.payload as any).texto));
    }

    // === GRAFICOS ===

    // Contatos por hora do dia
    const contatosPorHora: number[] = Array(24).fill(0);
    todasSessoes.forEach(s => {
      const hora = new Date(s.criado_em).getHours();
      contatosPorHora[hora]++;
    });
    // Ajusta pro horario de SP (UTC-3)
    const contatosPorHoraSP: number[] = Array(24).fill(0);
    todasSessoes.forEach(s => {
      const utcHour = new Date(s.criado_em).getUTCHours();
      const spHour = (utcHour - 3 + 24) % 24;
      contatosPorHoraSP[spHour]++;
    });

    // Contatos por dia da semana
    const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
    const contatosPorDia: number[] = Array(7).fill(0);
    todasSessoes.forEach(s => {
      const dia = new Date(s.criado_em).getDay();
      contatosPorDia[dia]++;
    });

    // Regioes mais atendidas
    const regioes: Record<string, number> = {};
    todasCorridas.forEach(c => {
      if (c.destino_endereco) {
        const partes = c.destino_endereco.split(",");
        const regiao = partes.length > 1 ? partes[partes.length - 2]?.trim() : partes[0]?.trim();
        if (regiao) regioes[regiao] = (regioes[regiao] || 0) + 1;
      }
    });
    const topRegioes = Object.entries(regioes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nome, qtd]) => ({ nome, qtd }));

    // Genero estimado pelo nome (PushName dos logs)
    const { data: logsNomes } = await supabase
      .from("bot_logs")
      .select("payload")
      .filter("payload->>debug", "eq", "handleClienteMessage")
      .limit(200);

    let masculino = 0;
    let feminino = 0;
    let indefinido = 0;
    const nomesFemsComuns = ["maria", "ana", "julia", "fernanda", "patricia", "camila", "amanda", "bruna", "larissa", "leticia", "mariana", "gabriela", "carolina", "jessica", "aline", "vanessa", "tatiana", "priscila", "rafaela", "natalia", "daniela", "renata", "adriana", "luciana", "sandra", "monica", "simone", "carla", "claudia", "cristina"];
    const nomesMascComuns = ["joao", "jose", "carlos", "paulo", "pedro", "lucas", "marcos", "rafael", "daniel", "gabriel", "andre", "rodrigo", "fernando", "ricardo", "eduardo", "bruno", "gustavo", "diego", "thiago", "felipe", "leonardo", "marcelo", "roberto", "antonio", "francisco", "fabio", "mauricio", "jorge", "sergio", "henrique"];

    const nomesContados = new Set<string>();
    if (logsNomes) {
      logsNomes.forEach(l => {
        const phone = (l.payload as any)?.phone;
        if (phone && !nomesContados.has(phone)) {
          nomesContados.add(phone);
          // Nao temos nome no log, conta como indefinido
          indefinido++;
        }
      });
    }

    // Tenta pelo nome dos clientes
    if (clientes) {
      clientes.forEach(c => {
        if (c.nome) {
          const primeiro = c.nome.toLowerCase().split(" ")[0];
          if (nomesFemsComuns.includes(primeiro)) feminino++;
          else if (nomesMascComuns.includes(primeiro)) masculino++;
          else indefinido++;
        }
      });
    }

    return NextResponse.json({
      resumo: {
        contatosHoje: sessoesHoje.length,
        contatosSemana: sessoesSemana.length,
        contatosMes: sessoesMes.length,
        contatosTotal: todasSessoes.length,
      },
      corridas: {
        total: todasCorridas.length,
        hoje: corridasHoje.length,
        semana: corridasSemana.length,
        mes: corridasMes.length,
        concluidas: corridasConcluidas.length,
        pendentes: corridasPendentes.length,
        aceitas: corridasAceitas.length,
        pagas: corridasPagas.length,
      },
      financeiro: {
        faturamentoTotal,
        comissaoPegue,
        faturamentoMes,
        comissaoMes,
        ticketMedio: Math.round(ticketMedio),
      },
      funil: {
        iniciaramConversa,
        enviaramFoto,
        receberamOrcamento,
        fecharam,
        taxaConversao,
      },
      abandonos,
      clientes: {
        total: totalClientes,
        novosMes: clientesNovos,
      },
      prestadores: {
        total: totalPrestadores,
        ativos: prestadoresAtivos,
        pendentes: prestadoresPendentes,
        scoreMedio: Math.round(scoreMedio * 10) / 10,
        pendentesDetalhados,
        lista: prestadores?.map(p => ({
          nome: p.nome,
          telefone: p.telefone,
          status: p.status,
          score: p.score,
          disponivel: p.disponivel,
          fretes: p.total_corridas,
        })) || [],
      },
      ultimasCorridas,
      avaliacoes: {
        notaMedia: Math.round(notaMedia * 10) / 10,
        total: totalAvaliacoes,
        sugestoes: sugestoes.slice(-10),
      },
      graficos: {
        contatosPorHora: contatosPorHoraSP,
        contatosPorDia: contatosPorDia.map((qtd, i) => ({ dia: diasSemana[i], qtd })),
        topRegioes,
        genero: { masculino, feminino, indefinido },
        ticketsPorFaixa: (() => {
          const faixas = [
            { label: "Ate R$200", min: 0, max: 200, qtd: 0 },
            { label: "R$200-350", min: 200, max: 350, qtd: 0 },
            { label: "R$350-500", min: 350, max: 500, qtd: 0 },
            { label: "R$500-800", min: 500, max: 800, qtd: 0 },
            { label: "R$800+", min: 800, max: 99999, qtd: 0 },
          ];
          todasCorridas.forEach(c => {
            const v = c.valor_final || 0;
            const f = faixas.find(f => v >= f.min && v < f.max);
            if (f) f.qtd++;
          });
          return faixas.map(f => ({ label: f.label, qtd: f.qtd }));
        })(),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
