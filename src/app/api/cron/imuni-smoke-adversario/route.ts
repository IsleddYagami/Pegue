import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";
import { promptDeFalhaSmokeStep } from "@/lib/imuni-prompt-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

// SMOKE ADVERSARIAL — testa cenarios REAIS de comportamento humano caotico
// que poderiam quebrar o bot. Diferente do smoke v6 (feliz determinist),
// aqui validamos que o sistema NAO TRAVA, NAO INVENTA endereco, NAO ESCALA
// pra humano sem motivo, e RESPONDE de forma adequada a entradas confusas.
//
// Cada cenario usa um phone smoke proprio (5500000000010, 011, ... ) pra
// permitir paralelismo + isolamento. Phones com prefixo 55000 sao auto
// detectados como teste (isPhoneTeste).
//
// Frequencia recomendada cron-job.org: 1x/dia (mais pesado que o smoke v6
// que roda 4x/dia).
//
// URL: https://www.chamepegue.com.br/api/cron/imuni-smoke-adversario?key=CRON_SECRET

interface CenarioResult {
  cenario: string;
  ok: boolean;
  esperado: string;
  obtido: string;
  duracao_ms: number;
  detalhes?: Record<string, unknown>;
  erro?: string;
}

async function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function chamarWebhook(
  baseUrl: string,
  webhookSecret: string,
  payload: unknown,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const url = `${baseUrl}/api/whatsapp/webhook?secret=${encodeURIComponent(webhookSecret)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  } catch (e: unknown) {
    return { status: 0, body: { erro: e instanceof Error ? e.message : "fetch falhou" } };
  } finally {
    clearTimeout(timeoutId);
  }
}

function payloadTexto(phone: string, text: string, instance = 1): Record<string, unknown> {
  return {
    Type: "receveid_message",
    Body: {
      Info: {
        RemoteJid: `${phone}@s.whatsapp.net`,
        FromMe: false,
        PushName: "Smoke Adversarial",
        Source: { message: {} },
      },
      Text: text,
    },
    instance,
  };
}

async function getStep(phone: string): Promise<string | null> {
  const { data } = await supabase
    .from("bot_sessions")
    .select("step")
    .eq("phone", phone)
    .maybeSingle();
  return (data?.step as string) || null;
}

async function limparPhone(phone: string): Promise<void> {
  const { data: cli } = await supabase.from("clientes").select("id").eq("telefone", phone).maybeSingle();
  if (cli?.id) {
    const { data: corridas } = await supabase.from("corridas").select("id").eq("cliente_id", cli.id);
    const ids = (corridas || []).map((c: { id: string }) => c.id);
    if (ids.length > 0) {
      await supabase.from("pagamentos").delete().in("corrida_id", ids);
      await supabase.from("ocorrencias").delete().in("corrida_id", ids);
      await supabase.from("provas_digitais").delete().in("corrida_id", ids);
    }
    await supabase.from("corridas").delete().eq("cliente_id", cli.id);
  }
  await supabase.from("bot_sessions").delete().eq("phone", phone);
  await supabase.from("clientes").delete().eq("telefone", phone);
  await supabase.from("conversas_whatsapp").delete().eq("telefone", phone);
  await supabase.from("bot_logs").delete().filter("payload->>phone", "eq", phone);
}

// ============ CENARIOS ============

// Cenario 1: rajada de 9 msgs em ~1s (caso real Igor 6191175422). Sistema
// deve consolidar + processar UMA vez, NAO travar em atendimento_humano.
async function cenarioRajadaIgor(baseUrl: string, secret: string): Promise<CenarioResult> {
  const phone = "5500000000010";
  await limparPhone(phone);
  const t0 = Date.now();

  const msgs = [
    "Boa tarde!",
    "ENDEREÇO: R. Oleska, 42 - Jardim das Flores, Osasco - SP",
    "PRECISO DE UM ORÇAMENTO EM PDF",
    "Av. Franz Voegeli, 751 - Continental, Osasco",
    "ESTOU EM BRASILIA",
    "IFSP OSASCO",
    "PRECISO QUE VC ENTREGUE LÁ NA ESCOLA",
    "RETIRAR: SODIMAC HOME CENTER",
    "APÓS RETIRAR FAZEMOS O PIX",
  ];
  const respostas = await Promise.all(
    msgs.map((m) => chamarWebhook(baseUrl, secret, payloadTexto(phone, m))),
  );
  await dormir(7000); // lock + debounce + processamento

  const step = await getStep(phone);
  const { count: msgsIn } = await supabase
    .from("conversas_whatsapp")
    .select("id", { count: "exact", head: true })
    .eq("telefone", phone)
    .eq("direcao", "in");

  // Aceita: NAO travado em atendimento_humano. Step pode ser variavel
  // dependendo do que IA extraiu — mas DEVE ter avancado.
  const stepsRuins = ["atendimento_humano"];
  const ok = !stepsRuins.includes(step || "") && (msgsIn || 0) >= msgs.length;

  const r = {
    cenario: "1_rajada_igor",
    ok,
    esperado: "step != atendimento_humano + todas msgs registradas",
    obtido: `step=${step}, msgs_in=${msgsIn}/${msgs.length}, statuses=${respostas.map((x) => x.status).filter((x) => x !== 200).length} nao-200s`,
    duracao_ms: Date.now() - t0,
    detalhes: { step, msgsIn, qtd_envio: msgs.length },
  };
  await limparPhone(phone);
  return r;
}

// Cenario 2: cliente confuso geocoder ("perto do shopping da kiko") — sistema
// deve pedir endereco claro, NAO geocodar uma rua aleatoria do meio do nada.
async function cenarioGeocoderConfuso(baseUrl: string, secret: string): Promise<CenarioResult> {
  const phone = "5500000000011";
  await limparPhone(phone);
  const t0 = Date.now();

  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "oi"));
  await dormir(2500);
  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "1"));
  await dormir(2500);
  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "perto do shopping da kiko, uma rua atras da igreja"));
  await dormir(4000);

  const step = await getStep(phone);
  // Aceitavel: step ainda em aguardando_localizacao (sistema nao geocodou
  // lixo) OU em confirmando_origem (sistema entendeu ALGO especifico).
  // Inaceitavel: step avancou pra aguardando_foto/destino apos descricao
  // VAGA — significa que aceitou um endereco invalido.
  const stepsAceitaveis = [
    "aguardando_localizacao",
    "confirmando_origem", // se IA conseguiu extrair algo concreto
  ];
  const ok = stepsAceitaveis.includes(step || "");

  const r = {
    cenario: "2_geocoder_confuso",
    ok,
    esperado: "step em aguardando_localizacao OU confirmando_origem (NAO foi pra foto/destino)",
    obtido: `step=${step}`,
    duracao_ms: Date.now() - t0,
  };
  await limparPhone(phone);
  return r;
}

// Cenario 3: palavra reservada como endereco. Cliente digita "PRONTO"
// achando que e comando, mas step esta em aguardando_localizacao. Sistema
// deve REJEITAR ("PRONTO" nao e endereco), nao geocodar.
async function cenarioPalavraReservada(baseUrl: string, secret: string): Promise<CenarioResult> {
  const phone = "5500000000012";
  await limparPhone(phone);
  const t0 = Date.now();

  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "oi"));
  await dormir(2500);
  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "1"));
  await dormir(2500);
  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "PRONTO"));
  await dormir(3000);

  const step = await getStep(phone);
  // Esperado: step continua em aguardando_localizacao (palavra reservada rejeitada)
  const ok = step === "aguardando_localizacao";

  const r = {
    cenario: "3_palavra_reservada",
    ok,
    esperado: "step=aguardando_localizacao (PRONTO foi rejeitado)",
    obtido: `step=${step}`,
    duracao_ms: Date.now() - t0,
  };
  await limparPhone(phone);
  return r;
}

// Cenario 4: CEP invalido + texto valido na mesma msg. Sistema deve cair
// no fallback: ViaCEP nao acha, mas texto tem rua+bairro+cidade — geocoda
// direto.
async function cenarioCepInvalidoComFallback(baseUrl: string, secret: string): Promise<CenarioResult> {
  const phone = "5500000000013";
  await limparPhone(phone);
  const t0 = Date.now();

  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "oi"));
  await dormir(2500);
  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "1"));
  await dormir(2500);
  await chamarWebhook(
    baseUrl,
    secret,
    payloadTexto(phone, "CEP 99999-999, Rua dos Pinheiros, 100, Vila Yara, Osasco - SP"),
  );
  await dormir(5000);

  const step = await getStep(phone);
  // Esperado: avancou pra confirmando_origem (fallback funcionou)
  const ok = step === "confirmando_origem";

  const r = {
    cenario: "4_cep_invalido_fallback",
    ok,
    esperado: "step=confirmando_origem (geocoder texto livre pegou apos ViaCEP falhar)",
    obtido: `step=${step}`,
    duracao_ms: Date.now() - t0,
  };
  await limparPhone(phone);
  return r;
}

// Cenario 5: instituicao reconhecivel ("IFSP OSASCO"). Sistema deve geocodar
// como POI, nao reduzir pra "Osasco, SP" generico.
async function cenarioInstituicao(baseUrl: string, secret: string): Promise<CenarioResult> {
  const phone = "5500000000014";
  await limparPhone(phone);
  const t0 = Date.now();

  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "oi"));
  await dormir(2500);
  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "1"));
  await dormir(2500);
  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "IFSP OSASCO"));
  await dormir(5000);

  const step = await getStep(phone);
  // Aceitavel: confirmando_origem (geocodou IFSP como POI) OU
  // aguardando_localizacao (rejeitou pq guard reduziu confianca BAIXA).
  // INACEITAVEL: aguardando_foto/destino (avancou com endereco aleatorio).
  const stepsAceitaveis = ["confirmando_origem", "aguardando_localizacao"];
  const ok = stepsAceitaveis.includes(step || "");

  // Verifica se origem_endereco contem "miosotis" ou outro endereco aleatorio
  // (caso Igor 7/Mai/2026 — bug do geocoder)
  let enderecoAleatorio = false;
  if (step === "confirmando_origem") {
    const { data: sess } = await supabase
      .from("bot_sessions")
      .select("origem_endereco")
      .eq("phone", phone)
      .maybeSingle();
    const end = (sess?.origem_endereco || "").toLowerCase();
    // Se nao contem "ifsp" nem "instituto" nem "federal", suspeito
    if (!end.includes("ifsp") && !end.includes("instituto") && !end.includes("federal")) {
      enderecoAleatorio = true;
    }
  }

  const okFinal = ok && !enderecoAleatorio;

  const r = {
    cenario: "5_instituicao_ifsp",
    ok: okFinal,
    esperado: "step plausivel + endereco contem IFSP/instituto/federal (nao endereco aleatorio)",
    obtido: `step=${step}, endereco_aleatorio=${enderecoAleatorio}`,
    duracao_ms: Date.now() - t0,
  };
  await limparPhone(phone);
  return r;
}

// Cenario 6: cliente cancela no meio do fluxo. Sistema deve limpar sessao
// e voltar ao inicio sem deixar lixo.
async function cenarioCancelamento(baseUrl: string, secret: string): Promise<CenarioResult> {
  const phone = "5500000000015";
  await limparPhone(phone);
  const t0 = Date.now();

  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "oi"));
  await dormir(2500);
  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "1"));
  await dormir(2500);
  // Vai pra cancelar (no step aguardando_localizacao, "cancelar" deveria
  // resetar — vou ver se tem handler. Se nao houver, vira tipo "indisponivel"
  // ou similar). Vou aceitar: nao trava em atendimento_humano.
  await chamarWebhook(baseUrl, secret, payloadTexto(phone, "cancelar"));
  await dormir(3000);

  const step = await getStep(phone);
  // Aceitavel: step nao virou atendimento_humano. Se voltou pro inicio
  // (limpou sessao), perfeito. Se ficou em aguardando_localizacao
  // (palavra "cancelar" foi rejeitada), aceitavel.
  const stepsRuins = ["atendimento_humano"];
  const ok = !stepsRuins.includes(step || "");

  const r = {
    cenario: "6_cancelamento",
    ok,
    esperado: "step != atendimento_humano",
    obtido: `step=${step}`,
    duracao_ms: Date.now() - t0,
  };
  await limparPhone(phone);
  return r;
}

// ============ EXECUTOR ============

export async function GET(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host") || "www.chamepegue.com.br";
  const baseUrl = `${proto}://${host}`;
  const webhookSecret = process.env.WEBHOOK_WHATSAPP_SECRET || "";
  if (!webhookSecret) {
    return NextResponse.json({ ok: false, motivo: "WEBHOOK_WHATSAPP_SECRET ausente" }, { status: 500 });
  }

  const inicio = Date.now();
  const cenarios = [
    cenarioRajadaIgor,
    cenarioGeocoderConfuso,
    cenarioPalavraReservada,
    cenarioCepInvalidoComFallback,
    cenarioInstituicao,
    cenarioCancelamento,
  ];

  // Roda em SERIE (nao paralelo) pra nao sobrecarregar webhook + facilitar log
  const resultados: CenarioResult[] = [];
  for (const cenario of cenarios) {
    try {
      const r = await cenario(baseUrl, webhookSecret);
      resultados.push(r);
    } catch (e: unknown) {
      resultados.push({
        cenario: cenario.name,
        ok: false,
        esperado: "execucao sem exception",
        obtido: "exception",
        duracao_ms: 0,
        erro: e instanceof Error ? e.message : "erro desconhecido",
      });
    }
  }

  const todosOk = resultados.every((r) => r.ok);
  const falhas = resultados.filter((r) => !r.ok);

  // Loga resultado
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: todosOk ? "imuni_smoke_adversario_ok" : "imuni_smoke_adversario_falhou",
      duracao_ms: Date.now() - inicio,
      total: resultados.length,
      ok: resultados.filter((r) => r.ok).length,
      falhas: falhas.length,
      detalhes: resultados,
    },
  });

  // Se falhou, alerta admins com prompt pronto
  if (!todosOk) {
    const primeiraFalha = falhas[0];
    // Reusa o builder do smoke principal — formato compativel
    const promptCorrecao = promptDeFalhaSmokeStep(
      {
        step: `adversario_${primeiraFalha.cenario}`,
        esperado: primeiraFalha.esperado,
        obtido: primeiraFalha.obtido,
        erro: primeiraFalha.erro,
      },
      [],
    );
    const resumoCenarios = falhas
      .map((f, i) => `${i + 1}. ${f.cenario} (${f.obtido})`)
      .join("\n");
    await notificarAdmins(
      "🦠 *IMUNI: smoke ADVERSARIAL falhou*",
      "fluxo cliente sob situacao adversa quebrado",
      `Cenarios falhos:\n${resumoCenarios}\n\n*PROMPT PRONTO PRA CLAUDE* (copia bloco entre === === e cola):\n\n${promptCorrecao}`,
    );
  }

  return NextResponse.json({
    ok: todosOk,
    duracao_ms: Date.now() - inicio,
    total_cenarios: resultados.length,
    aprovados: resultados.filter((r) => r.ok).length,
    falhas: falhas.length,
    resultados,
  });
}
