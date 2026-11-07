import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { geocodeAddress } from "@/lib/bot-utils";
import { isValidBrPhone, sendToClient } from "@/lib/chatpro";
import { notificarAdmins } from "@/lib/admin-notify";
import {
  areaIndisponivel,
  decidirCotacao,
  MENSAGEM_RECUSA,
  normalizarPedido,
} from "@/lib/cotacao";
import {
  cabeNoVeiculo,
  descricaoCarga,
  normalizarItensRecebidos,
  resumirCarga,
} from "@/lib/itens-carga";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// FECHAR O PEDIDO PELO SITE.
//
// Antes desta rota, o botao "Fechar esse frete" do cotador nao fechava nada:
// era um link pro WhatsApp. O cliente via o preco, clicava, e se nao mandasse
// a mensagem NAO ACONTECIA NADA — nenhum registro, nenhum aviso pra empresa,
// nenhuma confirmacao pro cliente. O nome do botao mentia.
//
// Agora o fechamento cria corrida de verdade, avisa os admins e manda
// confirmacao pro cliente no WhatsApp.
//
// LEI "jamais cotar sem certeza": o preco NAO vem do navegador. A rota
// recalcula do zero com o mesmo motor da /api/cotar (decidirCotacao). Se o
// endereco nao confirma ou esta fora da area, nao nasce pedido.

const VEICULOS = ["utilitario", "hr", "caminhao_bau"] as const;
type Veiculo = (typeof VEICULOS)[number];

const NOME_VEICULO: Record<Veiculo, string> = {
  utilitario: "Utilitário",
  hr: "HR Carroceria",
  caminhao_bau: "Caminhão baú",
};

// tipo_servico segue a mesma heuristica do bot (webhook salvarCorrida):
// veiculo maior = mudanca. Sem isso o dispatch filtra errado.
const SERVICO_POR_VEICULO: Record<Veiculo, "frete" | "mudanca"> = {
  utilitario: "frete",
  hr: "mudanca",
  caminhao_bau: "mudanca",
};

// "11 97142-9605" -> "5511971429605". Sem DDI o isValidBrPhone recusa.
function normalizarTelefone(bruto: unknown): string | null {
  const so = String(bruto ?? "").replace(/\D/g, "");
  if (!so) return null;
  const comDdi = so.startsWith("55") ? so : `55${so}`;
  return isValidBrPhone(comDdi) ? comDdi : null;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // Mais apertado que a cotacao (20/min): fechar pedido grava no banco e
  // dispara WhatsApp. 5 por minuto por IP ja cobre uso legitimo.
  const rl = await checkRateLimit({ chave: `pedido_site:${ip}`, max: 5 });
  if (!rl.permitido) {
    return NextResponse.json(
      { ok: false, motivo: "muitas_tentativas", mensagem: "Muitos pedidos seguidos. Aguarde 1 minuto." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, motivo: "json_invalido" }, { status: 400 });
  }

  const nome = String(body.nome ?? "").trim();
  if (nome.length < 2) {
    return NextResponse.json(
      { ok: false, motivo: "faltou_nome", mensagem: "Preciso do seu nome pra abrir o pedido." },
      { status: 400 },
    );
  }

  const telefone = normalizarTelefone(body.telefone);
  if (!telefone) {
    return NextResponse.json(
      { ok: false, motivo: "telefone_invalido", mensagem: "Confere o WhatsApp: precisa ser DDD + número." },
      { status: 400 },
    );
  }

  const veiculo = String(body.veiculo ?? "") as Veiculo;
  if (!VEICULOS.includes(veiculo)) {
    return NextResponse.json(
      { ok: false, motivo: "veiculo_invalido", mensagem: "Escolhe um dos veículos da cotação." },
      { status: 400 },
    );
  }

  const pedido = normalizarPedido(body);
  if (!pedido) {
    return NextResponse.json(
      { ok: false, motivo: "faltou_endereco", mensagem: MENSAGEM_RECUSA.faltou_endereco },
      { status: 400 },
    );
  }

  if (areaIndisponivel(pedido)) {
    return NextResponse.json({
      ok: false,
      motivo: "area_indisponivel",
      precisaHumano: true,
      mensagem: MENSAGEM_RECUSA.area_indisponivel,
    });
  }

  const [geoOrigem, geoDestino] = await Promise.all([
    geocodeAddress(pedido.origem),
    geocodeAddress(pedido.destino),
  ]);

  // Mesmo motor, mesma regra, mesmo numero da tela. Preco do navegador e'
  // ignorado de proposito — se o cliente mexer no JS, nao muda nada aqui.
  const cotacao = decidirCotacao(pedido, geoOrigem, geoDestino);
  if (!cotacao.ok) {
    return NextResponse.json({ ...cotacao, mensagem: MENSAGEM_RECUSA[cotacao.motivo] });
  }

  // A CARGA vem da tela, mas o texto NAO vem do navegador: a rota remonta a
  // descricao a partir do catalogo (itens-carga), pelos ids. Assim ninguem
  // injeta texto no pedido e no WhatsApp do atendimento, e o volume e sempre
  // o da tabela. Ate 7/Nov o pedido do site nascia sem carga nenhuma.
  const itens = normalizarItensRecebidos(body.itens);
  const resumo = resumirCarga(itens);
  const carga = descricaoCarga(itens);
  const encaixe = cabeNoVeiculo(resumo, veiculo);
  const janela = String(body.janela ?? "").trim().slice(0, 40);

  const valor = Number(cotacao.precos[veiculo]?.total ?? 0);
  // Mesma guarda do bot: pedido com valor zero nao nasce. Melhor nenhum
  // pedido do que um pedido gratis por bug de calculo.
  if (!(valor > 0)) {
    await notificarAdmins(
      "🚨 *PEDIDO DO SITE COM VALOR INVÁLIDO*",
      telefone,
      `Veículo ${veiculo}, de ${pedido.origem} para ${pedido.destino}. Valor calculado R$ ${valor}. Pedido NÃO foi criado — investigar o motor de preço.`,
    );
    return NextResponse.json(
      { ok: false, motivo: "valor_invalido", mensagem: "Não consegui fechar o preço agora. Chama a gente no WhatsApp." },
      { status: 500 },
    );
  }

  // Cliente: mesma tabela e mesma chave (telefone) que o bot usa, pra o
  // atendimento no WhatsApp cair na MESMA pessoa, nao criar um duplicado.
  //
  // NAO usar upsert com `nome`: o upsert SOBRESCREVE o nome de quem ja' e'
  // cliente. Alguem que ja' esta' no cadastro como "Maria Silva" e digita
  // "maria" no site viraria "maria" no banco. O nome digitado no site so'
  // entra quando o cliente e' novo, ou quando o cadastro esta' sem nome.
  const { data: achados } = await supabase
    .from("clientes")
    .select("id, nome")
    .eq("telefone", telefone)
    .limit(1);

  const existente = achados?.[0];
  let cliente: { id: string } | null = existente ? { id: existente.id } : null;
  let errCliente: { message: string } | null = null;

  if (existente) {
    if (!existente.nome) {
      await supabase.from("clientes").update({ nome, ativo: true }).eq("id", existente.id);
    }
  } else {
    const novo = await supabase
      .from("clientes")
      .insert({ telefone, nome, ativo: true })
      .select("id")
      .single();
    cliente = novo.data;
    errCliente = novo.error;
  }

  if (errCliente || !cliente) {
    await notificarAdmins(
      "🚨 *PEDIDO DO SITE: ERRO AO SALVAR CLIENTE*",
      telefone,
      `Erro: ${errCliente?.message ?? "sem retorno"}. O cliente ficou sem pedido — ligar pra ele.`,
    );
    return NextResponse.json(
      { ok: false, motivo: "erro_cliente", mensagem: "Deu problema ao abrir o pedido. Chama a gente no WhatsApp." },
      { status: 500 },
    );
  }

  // Duplo clique / voltar e reenviar nao pode virar dois pedidos. Se ja existe
  // pedido pendente do site, do mesmo cliente, pro mesmo trajeto, devolve o
  // mesmo codigo em vez de criar outro.
  const { data: jaExiste } = await supabase
    .from("corridas")
    .select("codigo")
    .eq("cliente_id", cliente.id)
    .eq("canal_origem", "site")
    .eq("status", "pendente")
    .eq("origem_endereco", pedido.origem)
    .eq("destino_endereco", pedido.destino)
    .limit(1);

  if (jaExiste?.[0]?.codigo) {
    return NextResponse.json({ ok: true, codigo: jaExiste[0].codigo, repetido: true, valor });
  }

  const codigo = `PG${Date.now().toString(36).toUpperCase()}`;

  const { error: errCorrida } = await supabase.from("corridas").insert({
    codigo,
    cliente_id: cliente.id,
    origem_endereco: pedido.origem,
    origem_lat: geoOrigem?.lat ?? null,
    origem_lng: geoOrigem?.lng ?? null,
    destino_endereco: pedido.destino,
    destino_lat: geoDestino?.lat ?? null,
    destino_lng: geoDestino?.lng ?? null,
    distancia_km: cotacao.km,
    tipo_servico: SERVICO_POR_VEICULO[veiculo],
    tipo_veiculo: veiculo,
    // Carga que a pessoa marcou na tela. Quando ela nao marca nada (pode: a
    // tela deixa cotar so pelo trajeto), fica explicito que falta confirmar —
    // nao fica um texto fingindo que a carga e conhecida.
    descricao_carga: carga || "Pedido fechado no site — carga não informada na tela",
    escada_origem: pedido.andares > 0,
    andares_origem: pedido.andares,
    elevador_origem: pedido.elevador,
    qtd_ajudantes: pedido.ajudantes,
    plano: "padrao",
    valor_estimado: valor,
    valor_final: valor,
    valor_prestador: Math.round(valor * 0.88 * 100) / 100,
    valor_pegue: Math.round(valor * 0.12 * 100) / 100,
    // `periodo` e texto livre no banco (o bot guarda a data do jeito que o
    // cliente falou). A janela de hora entra junto, no mesmo campo, pra nao
    // ficar guardada em lugar nenhum.
    periodo: pedido.dataAgendada
      ? janela
        ? `${pedido.dataAgendada} — ${janela}`
        : pedido.dataAgendada
      : null,
    status: "pendente",
    canal_origem: "site",
  });

  if (errCorrida) {
    await notificarAdmins(
      "🚨 *PEDIDO DO SITE: ERRO AO SALVAR CORRIDA*",
      telefone,
      `Erro: ${errCorrida.message}\nCliente ${nome} (${telefone}) tentou fechar ${NOME_VEICULO[veiculo]} de ${pedido.origem} para ${pedido.destino} por R$ ${valor}. LIGAR PRA ELE.`,
    );
    return NextResponse.json(
      { ok: false, motivo: "erro_corrida", mensagem: "Deu problema ao abrir o pedido. Chama a gente no WhatsApp." },
      { status: 500 },
    );
  }

  // A EMPRESA FICA SABENDO. Era isto que nao existia: pedido fechado no site
  // e ninguem avisado.
  //
  // notificarAdmins devolve QUANTOS admins receberam no WhatsApp. A tela so'
  // pode dizer "a equipe foi avisada" se esse numero for maior que zero —
  // senao ela estaria mentindo. (3/Nov: o primeiro pedido de teste caiu
  // exatamente nisso: o ChatPro recusou o envio e a tela afirmou que a
  // equipe sabia.)
  const adminsAvisados = await notificarAdmins(
    "🆕 *PEDIDO FECHADO NO SITE*",
    telefone,
    [
      `Código: *${codigo}*`,
      `Cliente: ${nome} — ${telefone}`,
      `Veículo: ${NOME_VEICULO[veiculo]}`,
      `De: ${pedido.origem}`,
      `Para: ${pedido.destino}`,
      `Distância: ${cotacao.km} km`,
      carga ? `Carga: ${carga}` : "Carga: NÃO informada na tela",
      resumo.totalItens > 0
        ? `Volume estimado: ${resumo.volumeM3} m³ / ${resumo.pesoKg} kg (tabela)`
        : null,
      pedido.ajudantes > 0 ? `Ajudantes: ${pedido.ajudantes}` : "Sem ajudante",
      pedido.andares > 0 ? `${pedido.andares} andar(es) de escada` : pedido.elevador ? "Com elevador" : "Térreo",
      pedido.dataAgendada ? `Quando: ${pedido.dataAgendada}${janela ? ` — ${janela}` : ""}` : null,
      `Valor: R$ ${valor}`,
      "",
      !carga
        ? "Veio do site sem a carga marcada. Confirmar a carga antes de despachar."
        : encaixe.motivo === "aperta"
          ? `⚠️ O cliente escolheu ${NOME_VEICULO[veiculo]}, mas a tabela aponta ${resumo.veiculoSugerido}. Conferir antes de despachar.`
          : encaixe.motivo === "excede_frota"
            ? "⚠️ A carga marcada passa do maior veículo da frota. Falar com o cliente."
            : encaixe.motivo === "nao_sei"
              ? "O cliente escreveu um item fora da lista e sem medida: o volume não foi calculado. Conferir."
              : "Carga marcada na tela e compatível com o veículo escolhido.",
    ]
      .filter((l): l is string => l !== null)
      .join("\n"),
  );

  // O CLIENTE RECEBE CONFIRMACAO. Tambem nao existia. E a mensagem abre a
  // conversa no WhatsApp, entao o atendimento continua no fluxo de sempre.
  let avisoCliente = true;
  try {
    await sendToClient({
      to: telefone,
      message:
        `Oi ${nome.split(" ")[0]}! Aqui é a *Íris* da Pegue 😊\n\n` +
        `Seu pedido *${codigo}* foi aberto:\n` +
        `• ${NOME_VEICULO[veiculo]}\n` +
        `• De ${pedido.origem}\n` +
        `• Para ${pedido.destino}\n` +
        (carga ? `• ${carga}\n` : "") +
        (pedido.dataAgendada ? `• ${pedido.dataAgendada}${janela ? ` — ${janela}` : ""}\n` : "") +
        `• R$ ${valor}\n\n` +
        // Quando a carga veio da tela, NAO perguntar de novo o que ja foi
        // respondido. Ordem do Fabio: "o cliente nao vai copiar nada ele so
        // quer contratar o servico".
        (carga
          ? `Confere se está certo. Se faltou alguma coisa, me diz aqui que eu ajusto — ` +
            `e o endereço completo a gente combina aqui na hora de fechar.`
          : `Falta só me dizer *o que vai* — pode escrever aqui mesmo. ` +
            `Ex: geladeira, fogão, sofá, 3 caixas.`),
    });
  } catch {
    // WhatsApp fora do ar nao pode derrubar o pedido: ele ja esta salvo e o
    // admin ja foi avisado. A tela conta a verdade pro cliente.
    avisoCliente = false;
  }

  // RASTRO. Se ninguem foi avisado, o pedido NAO pode sumir no silencio: fica
  // registrado que ele nasceu orfao, pra aparecer na auditoria depois.
  try {
    await supabase.from("bot_logs").insert({
      payload: {
        tipo: "pedido_fechado_no_site",
        codigo,
        valor,
        veiculo,
        admins_avisados: adminsAvisados,
        cliente_avisado: avisoCliente,
        orfao: adminsAvisados === 0,
        telefone_masked: telefone.replace(/\d(?=\d{4})/g, "*"),
      },
    });
  } catch {
    // Log auxiliar: nao derruba o pedido.
  }

  return NextResponse.json({ ok: true, codigo, valor, avisoCliente, adminsAvisados });
}
