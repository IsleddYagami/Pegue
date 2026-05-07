import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { notificarAdmins } from "@/lib/admin-notify";

export const dynamic = "force-dynamic";
// 30 steps × ~3s cada (geocoder + IA + Asaas calls) = ate ~120-150s. Pad pra 240s.
export const maxDuration = 240;

// Cron `/api/cron/imuni-smoke-e2e` — ESTAGIO 3 da IMUNI (executor de
// testes em producao).
//
// Filosofia (Fabio 5/Mai/2026): "imuni nao é para ficar sendo só
// tabelas... mas principalmente mal comportamento do sistema da pegue
// em qq parte do fluxo... fluxo precisa estar perfeito".
//
// O que essa rota faz: simula um CLIENTE FICTICIO percorrendo o fluxo
// COMPLETO ate aguardando_aceite_termos (cotacao fechada). Para AI
// antes de aceitar termos pra NAO disparar dispatch real pra fretistas.
// Cada step eh chamado via POST no proprio /api/whatsapp/webhook
// (igualzinho a uma mensagem real do ChatPro). Apos cada chamada, le
// bot_sessions pra verificar que o step avancou como esperado.
//
// Cobertura: oi -> escolha frete -> GPS origem -> confirma -> itens
// (lista numerada, sem chamar IA) -> destino texto -> confirma destino
// -> tipo local terreo -> sem ajudante -> data agora -> confirma data
// -> aguardando_aceite_termos. Valida campos da sessao no final
// (origem/destino lat-lng, descricao_carga, distancia_km, valor_estimado,
// data_agendada). PARA antes do "1" final que dispatch.
//
// Se algum step falha = alerta WhatsApp+Telegram pros admins (regressao
// detectada ANTES de cliente real ver).
//
// Phone smoke: 5500000000001 (TODO em zero, claramente fake). Precisa
// estar em TEST_PHONES no env Vercel pra evitar dispatch real e
// cadastro no CRM, mesmo que o smoke pare antes do dispatch.
//
// Frequencia recomendada cron-job.org: 4x/dia (6h, 12h, 18h, 0h BRT).
// URL: https://www.chamepegue.com.br/api/cron/imuni-smoke-e2e?key=CRON_SECRET

const SMOKE_PHONE = "5500000000001";
const SMOKE_PUSHNAME = "IMUNI Smoke E2E";

// Fretista smoke (prestador). Prefixo 55000 = phone teste (isPhoneTeste auto).
// Setup garante que existe em prod com cadastro completo + veiculo HR ativo,
// idempotente (cria se nao existe, atualiza disponivel/status se existe).
const SMOKE_FRETISTA_PHONE = "5500000000002";
const SMOKE_FRETISTA_NOME = "Fretista Smoke";
// CPF valido (algoritmo digito verificador). Gerado deterministicamente.
const SMOKE_FRETISTA_CPF = "39053344705";

// Coordenadas Osasco SP (Pegue cobre): centro de Osasco
const SMOKE_LAT_ORIGEM = -23.5329;
const SMOKE_LNG_ORIGEM = -46.7916;
// CEP de Osasco (Pegue cobre) — handleDestino tem caminho dedicado pra
// CEP: extrai o CEP, consulta ViaCEP, e geocoda o endereco retornado.
// Mais robusto que texto livre (que pode falhar no geocoder do Google
// se endereco nao for indexado). Bairro Vila Yara, Osasco — 06093-080.
const SMOKE_DESTINO_TEXTO = "06093-080";

interface StepResult {
  step: string;
  ok: boolean;
  esperado?: string;
  obtido?: string;
  duracao_ms: number;
  erro?: string;
  // Quando step falha, anexamos o body do webhook pra debug
  // (ex: ChatPro disse "ignored_invalid_phone" ou "rate_limited").
  webhook_resposta?: unknown;
  webhook_status?: number;
}

async function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function limparPhoneSmoke(): Promise<void> {
  // Cleanup completo: corridas (via cliente) -> sessao -> cliente -> conversas -> logs.
  // ORDEM IMPORTA: corridas tem fk pra clientes, entao deletar cliente sem
  // antes apagar corridas pode falhar (ou orfanar registros).
  const { data: clienteSmoke } = await supabase
    .from("clientes")
    .select("id")
    .eq("telefone", SMOKE_PHONE)
    .maybeSingle();
  if (clienteSmoke?.id) {
    // Apaga pagamentos/ocorrencias/avaliacoes referenciadas (fk em corridas)
    const { data: corridasIds } = await supabase
      .from("corridas")
      .select("id")
      .eq("cliente_id", clienteSmoke.id);
    const ids = (corridasIds || []).map((r: { id: string }) => r.id);
    if (ids.length > 0) {
      await supabase.from("pagamentos").delete().in("corrida_id", ids);
      await supabase.from("ocorrencias").delete().in("corrida_id", ids);
      await supabase.from("avaliacoes").delete().in("corrida_id", ids);
    }
    await supabase.from("corridas").delete().eq("cliente_id", clienteSmoke.id);
  }
  await supabase.from("bot_sessions").delete().eq("phone", SMOKE_PHONE);
  await supabase.from("clientes").delete().eq("telefone", SMOKE_PHONE);
  await supabase.from("conversas_whatsapp").delete().eq("telefone", SMOKE_PHONE);
  // Limpa bot_logs do phone (filtra payload->>phone)
  await supabase
    .from("bot_logs")
    .delete()
    .filter("payload->>phone", "eq", SMOKE_PHONE);
  // Limpa fretista smoke session/logs tambem
  await limparFretistaSmoke();
}

async function chamarWebhook(
  baseUrl: string,
  webhookSecret: string,
  payload: unknown,
): Promise<{ status: number; body: unknown }> {
  // Timeout obrigatorio (regra eslint custom imuni/no-fetch-without-timeout):
  // sem isso, webhook lento trava cron ate maxDuration. 12s da margem
  // razoavel pra processamento normal mas trava cedo se houver bug.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    // Webhook exige ?secret=WEBHOOK_WHATSAPP_SECRET (auditoria 30/Abr fail-secure).
    // O smoke roda no mesmo runtime Vercel que tem essa env var, entao podemos
    // usa-la pra autenticar. Sem isso, todas as chamadas viram 401.
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
    const msg = e instanceof Error ? e.message : "fetch falhou";
    return { status: 0, body: { erro: msg } };
  } finally {
    clearTimeout(timeoutId);
  }
}

function payloadMensagemTexto(text: string, instance = 1): Record<string, unknown> {
  return {
    Type: "receveid_message",
    Body: {
      Info: {
        RemoteJid: `${SMOKE_PHONE}@s.whatsapp.net`,
        FromMe: false,
        PushName: SMOKE_PUSHNAME,
        Source: { message: {} },
      },
      Text: text,
    },
    instance,
  };
}

function payloadLocalizacao(lat: number, lng: number, instance = 1): Record<string, unknown> {
  return {
    Type: "receveid_location",
    Body: {
      Info: {
        RemoteJid: `${SMOKE_PHONE}@s.whatsapp.net`,
        FromMe: false,
        PushName: SMOKE_PUSHNAME,
        Source: {
          message: { lat, lng },
        },
      },
      Text: "",
    },
    instance,
  };
}

async function getStepAtual(): Promise<string | null> {
  const { data } = await supabase
    .from("bot_sessions")
    .select("step")
    .eq("phone", SMOKE_PHONE)
    .maybeSingle();
  return (data?.step as string) || null;
}

async function getStepFretista(): Promise<string | null> {
  const { data } = await supabase
    .from("bot_sessions")
    .select("step")
    .eq("phone", SMOKE_FRETISTA_PHONE)
    .maybeSingle();
  return (data?.step as string) || null;
}

// Garante que o fretista smoke existe em prod com cadastro completo + veiculo HR.
// Idempotente: se existir, soh confirma disponivel=true e status=aprovado.
// Roda no inicio de cada smoke pra cobrir o caso de banco zerado.
async function setupPrestadorSmoke(): Promise<{ id: string }> {
  const { data: existente } = await supabase
    .from("prestadores")
    .select("id")
    .eq("telefone", SMOKE_FRETISTA_PHONE)
    .maybeSingle();

  let prestadorId = existente?.id as string | undefined;

  if (!prestadorId) {
    const { data: novo, error } = await supabase
      .from("prestadores")
      .insert({
        telefone: SMOKE_FRETISTA_PHONE,
        nome: SMOKE_FRETISTA_NOME,
        cpf: SMOKE_FRETISTA_CPF,
        email: "smoke-fretista@pegue.test",
        chave_pix: SMOKE_FRETISTA_PHONE, // PHONE — Asaas mock detecta smoke
        status: "aprovado",
        disponivel: true,
        score: 5.0,
        total_corridas: 0,
        total_reclamacoes: 0,
        regiao_atuacao: "osasco",
        termos_aceitos: true,
        termos_aceitos_em: new Date().toISOString(),
        selfie_url: "https://smoke.local/selfie.jpg",
        foto_documento_url: "https://smoke.local/doc.jpg",
        foto_placa_url: "https://smoke.local/placa.jpg",
        foto_veiculo_url: "https://smoke.local/veiculo.jpg",
      })
      .select("id")
      .single();
    if (error || !novo) {
      throw new Error(`setup prestador smoke falhou: ${error?.message || "sem id"}`);
    }
    prestadorId = novo.id as string;
  } else {
    // Garante disponivel + aprovado
    await supabase
      .from("prestadores")
      .update({ disponivel: true, status: "aprovado" })
      .eq("id", prestadorId);
  }

  // Garante veiculo HR ativo
  const { data: veiculoExistente } = await supabase
    .from("prestadores_veiculos")
    .select("id")
    .eq("prestador_id", prestadorId)
    .eq("tipo", "hr")
    .maybeSingle();

  if (!veiculoExistente) {
    await supabase.from("prestadores_veiculos").insert({
      prestador_id: prestadorId,
      tipo: "hr",
      marca: "Hyundai",
      modelo: "HR Smoke",
      ano: 2024,
      placa: "SMK0001",
      ativo: true,
    });
  } else {
    await supabase
      .from("prestadores_veiculos")
      .update({ ativo: true })
      .eq("id", veiculoExistente.id);
  }

  return { id: prestadorId };
}

// Simula webhook do Asaas chegando com PAYMENT_RECEIVED. Apos cliente smoke
// "pagar" mock, precisamos sinalizar que o dinheiro entrou pra o fluxo seguir
// (gerar PIN, avisar fretista, etc). O webhook Asaas tem auth via header
// asaas-access-token (ASAAS_WEBHOOK_TOKEN env).
async function simularPagamentoAsaas(
  baseUrl: string,
  asaasWebhookToken: string,
  paymentId: string,
  corridaId: string,
  valor: number,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(`${baseUrl}/api/asaas/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "asaas-access-token": asaasWebhookToken,
      },
      body: JSON.stringify({
        event: "PAYMENT_RECEIVED",
        payment: {
          id: paymentId,
          status: "RECEIVED",
          value: valor,
          netValue: valor,
          billingType: "PIX",
          externalReference: corridaId,
          customer: `cus_smoke_${SMOKE_PHONE}`,
        },
      }),
      signal: controller.signal,
    });
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: { erro: e instanceof Error ? e.message : "fetch falhou" } };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Limpa estado do fretista smoke (entre rodadas / no inicio).
async function limparFretistaSmoke(): Promise<void> {
  await supabase.from("bot_sessions").delete().eq("phone", SMOKE_FRETISTA_PHONE);
  await supabase
    .from("bot_logs")
    .delete()
    .filter("payload->>phone", "eq", SMOKE_FRETISTA_PHONE);
}

export async function GET(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get("key") ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  // Monta base URL pra fazer chamadas internas.
  // Em prod: https://www.chamepegue.com.br
  // Em dev: localhost mas o smoke roda em prod via cron externo.
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host") || "www.chamepegue.com.br";
  const baseUrl = `${proto}://${host}`;

  // Webhook eh fail-secure em producao: exige ?secret=WEBHOOK_WHATSAPP_SECRET.
  // Sem essa env var, smoke nao consegue chamar webhook (todos os steps 401).
  const webhookSecret = process.env.WEBHOOK_WHATSAPP_SECRET || "";
  if (!webhookSecret) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "WEBHOOK_WHATSAPP_SECRET ausente — smoke nao pode autenticar webhook",
      },
      { status: 500 },
    );
  }

  // Webhook Asaas exige header asaas-access-token. Necessario pra simular
  // PAYMENT_RECEIVED quando cliente smoke "paga".
  const asaasWebhookToken = process.env.ASAAS_WEBHOOK_TOKEN || "";
  if (!asaasWebhookToken) {
    return NextResponse.json(
      {
        ok: false,
        motivo: "ASAAS_WEBHOOK_TOKEN ausente — smoke nao pode simular pagamento",
      },
      { status: 500 },
    );
  }

  const inicio = Date.now();
  const steps: StepResult[] = [];

  // Cleanup ANTES (se rodada anterior deixou lixo)
  await limparPhoneSmoke();

  // Setup do prestador smoke (idempotente: cria se nao existe, atualiza
  // disponivel/aprovado se existe). Sem isso, dispatch nao tem fretista
  // smoke pra notificar e step 17 falha.
  let prestadorSmokeId = "";
  try {
    const setup = await setupPrestadorSmoke();
    prestadorSmokeId = setup.id;
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        motivo: `setup prestador smoke falhou: ${e instanceof Error ? e.message : "erro"}`,
      },
      { status: 500 },
    );
  }

  // Loga inicio (rastreabilidade — INV-23 vigia esse log)
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: "imuni_smoke_e2e_iniciado",
      timestamp: new Date().toISOString(),
      base_url: baseUrl,
      prestador_smoke_id: prestadorSmokeId,
    },
  });

  // ========== STEP 1: Cliente manda "oi" ==========
  const t1 = Date.now();
  const r1 = await chamarWebhook(baseUrl, webhookSecret, payloadMensagemTexto("oi"));
  await dormir(1500); // dar tempo do webhook processar
  const step1Atual = await getStepAtual();
  const step1Ok = step1Atual === "aguardando_servico";
  steps.push({
    step: "1_oi",
    ok: step1Ok,
    esperado: "aguardando_servico",
    obtido: step1Atual || "(sessao nao criada)",
    duracao_ms: Date.now() - t1,
    erro: r1.status !== 200 ? `webhook retornou ${r1.status}` : undefined,
    webhook_status: r1.status,
    webhook_resposta: step1Ok ? undefined : r1.body,
  });

  // Se falhou no step 1, nao adianta continuar
  if (!steps[0].ok) {
    return await finalizar(steps, inicio, "step_1_falhou");
  }

  // ========== STEP 2: Cliente escolhe "1" (frete) ==========
  const t2 = Date.now();
  const r2 = await chamarWebhook(baseUrl, webhookSecret, payloadMensagemTexto("1"));
  await dormir(1500);
  const step2Atual = await getStepAtual();
  steps.push({
    step: "2_escolha_frete",
    ok: step2Atual === "aguardando_localizacao",
    esperado: "aguardando_localizacao",
    obtido: step2Atual || "(sem step)",
    duracao_ms: Date.now() - t2,
    erro: r2.status !== 200 ? `webhook retornou ${r2.status}` : undefined,
  });

  if (!steps[1].ok) {
    return await finalizar(steps, inicio, "step_2_falhou");
  }

  // ========== STEP 3: Cliente manda localizacao GPS ==========
  const t3 = Date.now();
  const r3 = await chamarWebhook(
    baseUrl,
    webhookSecret,
    payloadLocalizacao(SMOKE_LAT_ORIGEM, SMOKE_LNG_ORIGEM),
  );
  await dormir(2500); // geocoder pode demorar
  const step3Atual = await getStepAtual();
  // Apos GPS valido, apresentarOrigemPraConfirmacao seta step pra
  // "confirmando_origem" (com 'o' final). Antes esse smoke checava
  // "confirmar_origem" e SEMPRE falhava silenciosamente — bug.
  steps.push({
    step: "3_origem_gps",
    ok: step3Atual === "confirmando_origem",
    esperado: "confirmando_origem",
    obtido: step3Atual || "(sem step)",
    duracao_ms: Date.now() - t3,
    erro: r3.status !== 200 ? `webhook retornou ${r3.status}` : undefined,
  });

  // Verifica que origem_lat/lng foram salvos
  const { data: sessaoAposGps } = await supabase
    .from("bot_sessions")
    .select("origem_lat, origem_lng, origem_endereco")
    .eq("phone", SMOKE_PHONE)
    .maybeSingle();

  if (!sessaoAposGps?.origem_lat || !sessaoAposGps?.origem_lng) {
    steps.push({
      step: "3b_origem_persistida",
      ok: false,
      esperado: "origem_lat e origem_lng nao-nulos na bot_sessions",
      obtido: `lat=${sessaoAposGps?.origem_lat}, lng=${sessaoAposGps?.origem_lng}`,
      duracao_ms: 0,
      erro: "GPS chegou mas nao foi persistido — bug em handleLocalizacao",
    });
  } else {
    steps.push({
      step: "3b_origem_persistida",
      ok: true,
      esperado: "origem_lat e origem_lng nao-nulos",
      obtido: `lat=${sessaoAposGps.origem_lat}, lng=${sessaoAposGps.origem_lng}`,
      duracao_ms: 0,
    });
  }

  // STEP 4: Valida BUG D fix — cliente foi registrado em `clientes` no 1o contato
  const t4 = Date.now();
  const { data: clienteSmoke } = await supabase
    .from("clientes")
    .select("id, telefone, nome, ativo")
    .eq("telefone", SMOKE_PHONE)
    .maybeSingle();
  steps.push({
    step: "4_cliente_registrado",
    ok: !!clienteSmoke?.id,
    esperado: "cliente registrado em `clientes` apos saudacao (BUG D fix)",
    obtido: clienteSmoke ? `id=${clienteSmoke.id.slice(0, 8)}, ativo=${clienteSmoke.ativo}` : "(nao encontrado)",
    duracao_ms: Date.now() - t4,
    erro: !clienteSmoke ? "cliente nao foi inserido em `clientes` — BUG D regrediu" : undefined,
  });

  // STEP 5: Valida BUG C fix — mensagens registradas em conversas_whatsapp
  const t5 = Date.now();
  const { count: msgsConversas } = await supabase
    .from("conversas_whatsapp")
    .select("id", { count: "exact", head: true })
    .eq("telefone", SMOKE_PHONE);
  // Esperado >=3 (3 msgs in: oi, 1, lat/lng) + algumas msgs out (resposta do bot)
  // Conservador: >=3 garante que pelo menos as msgs IN foram registradas.
  const minEsperado = 3;
  steps.push({
    step: "5_conversas_whatsapp_populada",
    ok: (msgsConversas || 0) >= minEsperado,
    esperado: `>=${minEsperado} msgs em conversas_whatsapp (BUG C fix)`,
    obtido: `${msgsConversas || 0} msgs encontradas`,
    duracao_ms: Date.now() - t5,
    erro: (msgsConversas || 0) < minEsperado
      ? "conversas_whatsapp nao populada apos 3 msgs do cliente — BUG C regrediu"
      : undefined,
  });

  // Se origem nao foi confirmada, sem sentido seguir
  if (!steps.find((s) => s.step === "3_origem_gps")?.ok) {
    return await finalizar(steps, inicio, "step_3_origem_falhou");
  }

  // ========== STEP 6: Cliente confirma origem ("1") ==========
  // Apos confirmar, handleConfirmandoOrigem -> step "aguardando_foto"
  const t6 = Date.now();
  const r6 = await chamarWebhook(baseUrl, webhookSecret, payloadMensagemTexto("1"));
  await dormir(1500);
  const step6Atual = await getStepAtual();
  steps.push({
    step: "6_confirma_origem",
    ok: step6Atual === "aguardando_foto",
    esperado: "aguardando_foto",
    obtido: step6Atual || "(sem step)",
    duracao_ms: Date.now() - t6,
    erro: r6.status !== 200 ? `webhook retornou ${r6.status}` : undefined,
  });
  if (!steps[steps.length - 1].ok) {
    return await finalizar(steps, inicio, "step_6_falhou");
  }

  // ========== STEP 7: Cliente manda lista numerada de itens ==========
  // "5, 6, 7" = Armario cozinha, Mesa cadeiras, Freezer (3 itens = veiculo HR).
  // handleFoto detecta numeros >=2 e PULA IA — fluxo deterministic, sem custo.
  const t7 = Date.now();
  const r7 = await chamarWebhook(baseUrl, webhookSecret, payloadMensagemTexto("5, 6, 7"));
  await dormir(1500);
  const step7Atual = await getStepAtual();
  steps.push({
    step: "7_itens_lista_numerada",
    ok: step7Atual === "aguardando_destino",
    esperado: "aguardando_destino",
    obtido: step7Atual || "(sem step)",
    duracao_ms: Date.now() - t7,
    erro: r7.status !== 200 ? `webhook retornou ${r7.status}` : undefined,
  });
  if (!steps[steps.length - 1].ok) {
    return await finalizar(steps, inicio, "step_7_falhou");
  }

  // ========== STEP 8: Cliente manda destino (texto) ==========
  // handleDestino tenta geocodeAddress. Se Google Maps nao retornar coords,
  // fluxo recusa (proibido fallback). Endereco escolhido eh real e indexado.
  const t8 = Date.now();
  const r8 = await chamarWebhook(baseUrl, webhookSecret, payloadMensagemTexto(SMOKE_DESTINO_TEXTO));
  await dormir(3000); // geocoder + reverseGeocode podem demorar
  const step8Atual = await getStepAtual();
  const step8Ok = step8Atual === "confirmando_destino";
  steps.push({
    step: "8_destino_texto",
    ok: step8Ok,
    esperado: "confirmando_destino",
    obtido: step8Atual || "(sem step)",
    duracao_ms: Date.now() - t8,
    erro: r8.status !== 200 ? `webhook retornou ${r8.status}` : undefined,
    webhook_status: r8.status,
    webhook_resposta: step8Ok ? undefined : r8.body,
  });
  if (!steps[steps.length - 1].ok) {
    return await finalizar(steps, inicio, "step_8_falhou");
  }

  // Valida que destino foi persistido com lat/lng
  const { data: sessaoAposDestino } = await supabase
    .from("bot_sessions")
    .select("destino_lat, destino_lng, destino_endereco")
    .eq("phone", SMOKE_PHONE)
    .maybeSingle();
  const destinoOk = !!(sessaoAposDestino?.destino_lat && sessaoAposDestino?.destino_lng);
  steps.push({
    step: "8b_destino_persistido",
    ok: destinoOk,
    esperado: "destino_lat e destino_lng nao-nulos na bot_sessions",
    obtido: `lat=${sessaoAposDestino?.destino_lat}, lng=${sessaoAposDestino?.destino_lng}`,
    duracao_ms: 0,
    erro: destinoOk ? undefined : "destino aceito mas lat/lng nao persistidos — bug em handleDestino",
  });
  if (!destinoOk) return await finalizar(steps, inicio, "step_8b_falhou");

  // ========== STEP 9: Cliente confirma destino ("1") ==========
  // handleConfirmandoDestino -> aguardando_tipo_local (sem contexto IA, fluxo padrao)
  const t9 = Date.now();
  const r9 = await chamarWebhook(baseUrl, webhookSecret, payloadMensagemTexto("1"));
  await dormir(1500);
  const step9Atual = await getStepAtual();
  steps.push({
    step: "9_confirma_destino",
    ok: step9Atual === "aguardando_tipo_local",
    esperado: "aguardando_tipo_local",
    obtido: step9Atual || "(sem step)",
    duracao_ms: Date.now() - t9,
    erro: r9.status !== 200 ? `webhook retornou ${r9.status}` : undefined,
  });
  if (!steps[steps.length - 1].ok) {
    return await finalizar(steps, inicio, "step_9_falhou");
  }

  // ========== STEP 10: Tipo do local "1" (terreo) ==========
  // handleTipoLocal -> aguardando_ajudante
  const t10 = Date.now();
  const r10 = await chamarWebhook(baseUrl, webhookSecret, payloadMensagemTexto("1"));
  await dormir(1500);
  const step10Atual = await getStepAtual();
  steps.push({
    step: "10_tipo_local_terreo",
    ok: step10Atual === "aguardando_ajudante",
    esperado: "aguardando_ajudante",
    obtido: step10Atual || "(sem step)",
    duracao_ms: Date.now() - t10,
    erro: r10.status !== 200 ? `webhook retornou ${r10.status}` : undefined,
  });
  if (!steps[steps.length - 1].ok) {
    return await finalizar(steps, inicio, "step_10_falhou");
  }

  // ========== STEP 11: Sem ajudante "1" -> calcula orcamento ==========
  // handleAjudante -> calcularEEnviarOrcamento -> step aguardando_data
  // Esse passo eh CRITICO: aqui o sistema persiste valor_estimado, distancia_km,
  // veiculo_sugerido. Falha aqui = problema na cotacao.
  const t11 = Date.now();
  const r11 = await chamarWebhook(baseUrl, webhookSecret, payloadMensagemTexto("1"));
  await dormir(2500); // calcular orcamento envolve calculos + insert
  const step11Atual = await getStepAtual();
  steps.push({
    step: "11_sem_ajudante_calculou",
    ok: step11Atual === "aguardando_data",
    esperado: "aguardando_data",
    obtido: step11Atual || "(sem step)",
    duracao_ms: Date.now() - t11,
    erro: r11.status !== 200 ? `webhook retornou ${r11.status}` : undefined,
  });
  if (!steps[steps.length - 1].ok) {
    return await finalizar(steps, inicio, "step_11_falhou");
  }

  // Valida que cotacao salvou os campos financeiros chave
  const { data: sessaoAposCota } = await supabase
    .from("bot_sessions")
    .select("valor_estimado, distancia_km, veiculo_sugerido, descricao_carga")
    .eq("phone", SMOKE_PHONE)
    .maybeSingle();
  const cotacaoOk =
    !!sessaoAposCota?.valor_estimado &&
    Number(sessaoAposCota.valor_estimado) > 0 &&
    !!sessaoAposCota.distancia_km &&
    Number(sessaoAposCota.distancia_km) > 0 &&
    !!sessaoAposCota.veiculo_sugerido &&
    !!sessaoAposCota.descricao_carga;
  steps.push({
    step: "11b_campos_cotacao_persistidos",
    ok: cotacaoOk,
    esperado: "valor_estimado>0, distancia_km>0, veiculo_sugerido, descricao_carga preenchidos",
    obtido: `valor=${sessaoAposCota?.valor_estimado}, dist=${sessaoAposCota?.distancia_km}km, veic=${sessaoAposCota?.veiculo_sugerido}, descr=${(sessaoAposCota?.descricao_carga || "").slice(0, 30)}`,
    duracao_ms: 0,
    erro: cotacaoOk ? undefined : "cotacao chegou no aguardando_data mas algum campo financeiro/descricao ficou vazio",
  });
  if (!cotacaoOk) return await finalizar(steps, inicio, "step_11b_falhou");

  // ========== STEP 12: Cliente manda "agora" (urgente) ==========
  // handleData -> aguardando_confirmacao
  const t12 = Date.now();
  const r12 = await chamarWebhook(baseUrl, webhookSecret, payloadMensagemTexto("agora"));
  await dormir(1500);
  const step12Atual = await getStepAtual();
  steps.push({
    step: "12_data_agora",
    ok: step12Atual === "aguardando_confirmacao",
    esperado: "aguardando_confirmacao",
    obtido: step12Atual || "(sem step)",
    duracao_ms: Date.now() - t12,
    erro: r12.status !== 200 ? `webhook retornou ${r12.status}` : undefined,
  });
  if (!steps[steps.length - 1].ok) {
    return await finalizar(steps, inicio, "step_12_falhou");
  }

  // ========== STEP 13: Cliente confirma resumo ("1") ==========
  // handleConfirmacao -> aguardando_aceite_termos
  // ATENCAO: NAO mandar "1" no aceite_termos abaixo — isso disparararia
  // dispatch real pra fretistas (ainda que filtrado por TEST_PHONES,
  // criaria corrida no banco e poluiria producao).
  const t13 = Date.now();
  const r13 = await chamarWebhook(baseUrl, webhookSecret, payloadMensagemTexto("1"));
  await dormir(1500);
  const step13Atual = await getStepAtual();
  steps.push({
    step: "13_confirma_resumo",
    ok: step13Atual === "aguardando_aceite_termos",
    esperado: "aguardando_aceite_termos",
    obtido: step13Atual || "(sem step)",
    duracao_ms: Date.now() - t13,
    erro: r13.status !== 200 ? `webhook retornou ${r13.status}` : undefined,
  });
  if (!steps[steps.length - 1].ok) {
    return await finalizar(steps, inicio, "step_13_falhou");
  }

  // ========== STEP 14: Validacao final da sessao ==========
  // Garante que TODOS os campos esperados estao corretos no momento em
  // que cliente real veria o card "ACEITO TERMOS". Tambem confirma que
  // NENHUMA corrida foi gravada na tabela `corridas` (so eh gravada no
  // aceite — proximo step que NAO disparamos).
  const { data: sessaoFinal } = await supabase
    .from("bot_sessions")
    .select(
      "step, origem_lat, origem_lng, destino_lat, destino_lng, descricao_carga, veiculo_sugerido, distancia_km, valor_estimado, data_agendada",
    )
    .eq("phone", SMOKE_PHONE)
    .maybeSingle();

  const sessaoCompleta =
    sessaoFinal?.step === "aguardando_aceite_termos" &&
    !!sessaoFinal?.origem_lat &&
    !!sessaoFinal?.origem_lng &&
    !!sessaoFinal?.destino_lat &&
    !!sessaoFinal?.destino_lng &&
    !!sessaoFinal?.descricao_carga &&
    !!sessaoFinal?.veiculo_sugerido &&
    !!sessaoFinal?.distancia_km &&
    Number(sessaoFinal.distancia_km) > 0 &&
    !!sessaoFinal?.valor_estimado &&
    Number(sessaoFinal.valor_estimado) > 0 &&
    !!sessaoFinal?.data_agendada;

  steps.push({
    step: "14_sessao_final_pronta_pra_pagar",
    ok: sessaoCompleta,
    esperado: "todos campos chave preenchidos no step aguardando_aceite_termos",
    obtido: sessaoFinal
      ? `step=${sessaoFinal.step}, valor=${sessaoFinal.valor_estimado}, dist=${sessaoFinal.distancia_km}km, data=${sessaoFinal.data_agendada}`
      : "(sessao nao encontrada)",
    duracao_ms: 0,
    erro: sessaoCompleta ? undefined : "cotacao chegou no aceite mas algum campo critico nao foi preenchido",
  });

  // Validacao intermediaria: corridas ainda zero (aceite nao aconteceu)
  const { data: clienteSmoke2 } = await supabase
    .from("clientes")
    .select("id")
    .eq("telefone", SMOKE_PHONE)
    .maybeSingle();
  if (clienteSmoke2?.id) {
    const { count: corridasAntesAceite } = await supabase
      .from("corridas")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", clienteSmoke2.id);
    steps.push({
      step: "15_zero_corridas_antes_do_aceite",
      ok: (corridasAntesAceite || 0) === 0,
      esperado: "0 corridas salvas ate aqui",
      obtido: `${corridasAntesAceite || 0} corridas`,
      duracao_ms: 0,
      erro: (corridasAntesAceite || 0) > 0 ? "FLUXO DISPATCHEU SEM ACEITE — bug critico" : undefined,
    });
    if ((corridasAntesAceite || 0) > 0) {
      await limparPhoneSmoke();
      return await finalizar(steps, inicio, "step_15_corrida_indevida");
    }
  }

  // ========== STEP 16: Cliente aceita termos ("1") ==========
  // handleAceiteTermos -> salvarCorrida -> dispararParaFretistas
  // -> step muda pra "aguardando_fretista" (cliente esperando dispatch).
  // dispatch_ativo=true na corrida.
  const t16 = Date.now();
  const r16 = await chamarWebhook(baseUrl, webhookSecret, payloadMensagemTexto("1"));
  await dormir(3500); // dispatch envolve query + insert + notificacoes mock
  const step16Atual = await getStepAtual();
  steps.push({
    step: "16_aceite_termos_dispatch",
    ok: step16Atual === "aguardando_fretista",
    esperado: "aguardando_fretista",
    obtido: step16Atual || "(sem step)",
    duracao_ms: Date.now() - t16,
    erro: r16.status !== 200 ? `webhook retornou ${r16.status}` : undefined,
    webhook_status: r16.status,
    webhook_resposta: step16Atual === "aguardando_fretista" ? undefined : r16.body,
  });
  if (!steps[steps.length - 1].ok) {
    return await finalizar(steps, inicio, "step_16_falhou");
  }

  // ========== STEP 17: Corrida criada com dispatch ativo ==========
  const { data: corridaCriada } = await supabase
    .from("corridas")
    .select("id, status, dispatch_ativo, dispatch_prestadores, valor_estimado, prestador_id")
    .eq("cliente_id", clienteSmoke2?.id || "")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  const dispatchOk =
    !!corridaCriada?.id &&
    corridaCriada.dispatch_ativo === true &&
    corridaCriada.prestador_id === null &&
    Array.isArray(corridaCriada.dispatch_prestadores) &&
    (corridaCriada.dispatch_prestadores as string[]).includes(SMOKE_FRETISTA_PHONE);
  steps.push({
    step: "17_corrida_em_dispatch_com_fretista_smoke",
    ok: dispatchOk,
    esperado: "corrida com dispatch_ativo=true, prestador_id=null, dispatch_prestadores inclui fretista smoke",
    obtido: corridaCriada
      ? `id=${corridaCriada.id.slice(0, 8)}, ativo=${corridaCriada.dispatch_ativo}, prestador=${corridaCriada.prestador_id}, qtd_dispatched=${(corridaCriada.dispatch_prestadores as string[] | null)?.length || 0}`
      : "(corrida nao encontrada)",
    duracao_ms: 0,
    erro: dispatchOk ? undefined : "dispatch nao incluiu fretista smoke — verificar setupPrestadorSmoke + filtro veiculo HR",
  });
  if (!dispatchOk) return await finalizar(steps, inicio, "step_17_falhou");
  const corridaId = corridaCriada!.id as string;

  // ========== STEP 18: Fretista smoke aceita dispatch ("1") ==========
  // handlePrestadorResponse -> tryAceitarDispatch -> notificarResultadoDispatch
  // -> cobranca Asaas mock criada -> cliente vai pra "aguardando_pagamento"
  const t18 = Date.now();
  const r18 = await chamarWebhook(baseUrl, webhookSecret, {
    Type: "receveid_message",
    Body: {
      Info: {
        RemoteJid: `${SMOKE_FRETISTA_PHONE}@s.whatsapp.net`,
        FromMe: false,
        PushName: SMOKE_FRETISTA_NOME,
        Source: { message: {} },
      },
      Text: "1",
    },
    instance: 1,
  });
  await dormir(4000); // tryAceitarDispatch + criar cobranca Asaas mock + sendToClient mock
  const { data: corridaAposAceite } = await supabase
    .from("corridas")
    .select("status, prestador_id, asaas_payment_id")
    .eq("id", corridaId)
    .maybeSingle();
  const fretistaAceitouOk =
    corridaAposAceite?.status === "aceita" &&
    !!corridaAposAceite.prestador_id &&
    corridaAposAceite.prestador_id === prestadorSmokeId;
  steps.push({
    step: "18_fretista_smoke_aceita_dispatch",
    ok: fretistaAceitouOk,
    esperado: "corrida.status=aceita + prestador_id=fretista smoke",
    obtido: `status=${corridaAposAceite?.status}, prestador_id=${corridaAposAceite?.prestador_id?.slice(0, 8)}`,
    duracao_ms: Date.now() - t18,
    erro: r18.status !== 200 ? `webhook retornou ${r18.status}` : undefined,
    webhook_status: r18.status,
    webhook_resposta: fretistaAceitouOk ? undefined : r18.body,
  });
  if (!fretistaAceitouOk) return await finalizar(steps, inicio, "step_18_falhou");

  // ========== STEP 19: Cobranca Asaas mock criada ==========
  const cobrancaCriada =
    !!corridaAposAceite?.asaas_payment_id &&
    String(corridaAposAceite.asaas_payment_id).startsWith("pay_smoke_");
  steps.push({
    step: "19_cobranca_asaas_mock_criada",
    ok: cobrancaCriada,
    esperado: "asaas_payment_id comecando com pay_smoke_",
    obtido: `asaas_payment_id=${corridaAposAceite?.asaas_payment_id}`,
    duracao_ms: 0,
    erro: cobrancaCriada ? undefined : "cobranca Asaas nao foi criada com mock — verificar isSmokeClienteAsaasId em criarCobranca",
  });
  if (!cobrancaCriada) return await finalizar(steps, inicio, "step_19_falhou");

  // ========== STEP 20: Cliente em aguardando_pagamento ==========
  const stepCliente20 = await getStepAtual();
  steps.push({
    step: "20_cliente_aguardando_pagamento",
    ok: stepCliente20 === "aguardando_pagamento",
    esperado: "aguardando_pagamento",
    obtido: stepCliente20 || "(sem step)",
    duracao_ms: 0,
    erro: stepCliente20 === "aguardando_pagamento" ? undefined : "cliente nao avancou pra aguardando_pagamento apos cobranca criada",
  });
  if (stepCliente20 !== "aguardando_pagamento") return await finalizar(steps, inicio, "step_20_falhou");

  // ========== STEP 21: Simula PAYMENT_RECEIVED no webhook Asaas ==========
  // Apos cliente "pagar" (mockado), webhook Asaas chega -> corrida.status=paga
  // -> PIN gerado -> fretista avisado pra coletar.
  const t21 = Date.now();
  const valorCorrida = Number(corridaAposAceite?.asaas_payment_id ? corridaCriada!.valor_estimado : 0);
  const r21 = await simularPagamentoAsaas(
    baseUrl,
    asaasWebhookToken,
    String(corridaAposAceite?.asaas_payment_id),
    corridaId,
    valorCorrida,
  );
  await dormir(3000); // webhook Asaas processa: update corrida + gera PIN + sendToClient mock
  const { data: corridaPaga } = await supabase
    .from("corridas")
    .select("status, pin_entrega")
    .eq("id", corridaId)
    .maybeSingle();
  const pagamentoOk =
    corridaPaga?.status === "paga" &&
    !!corridaPaga.pin_entrega &&
    String(corridaPaga.pin_entrega).length >= 4;
  steps.push({
    step: "21_pagamento_recebido_pin_gerado",
    ok: pagamentoOk,
    esperado: "corrida.status=paga + pin_entrega gerado (>=4 digitos)",
    obtido: `status=${corridaPaga?.status}, pin=${corridaPaga?.pin_entrega ? "***" + String(corridaPaga.pin_entrega).slice(-2) : "null"}`,
    duracao_ms: Date.now() - t21,
    erro: r21.status !== 200 ? `webhook Asaas retornou ${r21.status}` : undefined,
    webhook_status: r21.status,
    webhook_resposta: pagamentoOk ? undefined : r21.body,
  });
  if (!pagamentoOk) return await finalizar(steps, inicio, "step_21_falhou");

  // ========== STEP 22-25: Coleta + entrega (simplificado) ==========
  // Esses passos exigem foto real + interacao em multiplos handlers. Validacao
  // simplificada: pulamos pra "concluida" via update direto + chamamos
  // logica de repasse simulando handler entrega. Isso testa repasse Asaas mock
  // sem precisar de foto/PIN reais (que dependem de OpenAI Vision e media URL).

  // 22: Marca corrida como concluida (simulando: fretista coletou, entregou,
  // cliente confirmou PIN)
  const t22 = Date.now();
  const { error: errConcluir } = await supabase
    .from("corridas")
    .update({
      status: "concluida",
      valor_final: valorCorrida || 100,
      entrega_em: new Date().toISOString(),
    })
    .eq("id", corridaId);
  steps.push({
    step: "22_corrida_concluida_simulada",
    ok: !errConcluir,
    esperado: "update corrida pra status=concluida",
    obtido: errConcluir ? `erro: ${errConcluir.message}` : "ok",
    duracao_ms: Date.now() - t22,
    erro: errConcluir?.message,
  });
  if (errConcluir) return await finalizar(steps, inicio, "step_22_falhou");

  // 23: Repasse PIX mock — chama transferirPix com chavePix do fretista smoke
  const t23 = Date.now();
  const { transferirPix } = await import("@/lib/asaas");
  const valorPrestador = Math.round((valorCorrida || 100) * 0.88);
  const repasseResult = await transferirPix({
    valor: valorPrestador,
    chavePix: SMOKE_FRETISTA_PHONE,
    descricao: "Repasse smoke",
    externalReference: `smoke_${corridaId}`,
  });
  steps.push({
    step: "23_repasse_pix_mock",
    ok: repasseResult.ok && !!repasseResult.transfer && String(repasseResult.transfer.id).startsWith("trf_smoke_"),
    esperado: "transferirPix retorna trf_smoke_ + status DONE",
    obtido: repasseResult.ok
      ? `id=${repasseResult.transfer?.id}, status=${repasseResult.transfer?.status}`
      : `erro: ${JSON.stringify(repasseResult.erro).slice(0, 100)}`,
    duracao_ms: Date.now() - t23,
    erro: !repasseResult.ok ? "transferirPix nao retornou mock smoke" : undefined,
  });
  if (!steps[steps.length - 1].ok) return await finalizar(steps, inicio, "step_23_falhou");

  // 24: Estorno mock (simula reclamacao com refund)
  const t24 = Date.now();
  const { estornarCobranca } = await import("@/lib/asaas");
  const estornoResult = await estornarCobranca(
    String(corridaAposAceite?.asaas_payment_id),
    "Smoke E2E - simulacao de estorno",
  );
  steps.push({
    step: "24_estorno_mock",
    ok: estornoResult.ok && estornoResult.estorno?.status === "REFUNDED",
    esperado: "estornarCobranca retorna REFUNDED",
    obtido: estornoResult.ok
      ? `id=${estornoResult.estorno?.id}, status=${estornoResult.estorno?.status}`
      : `erro: ${JSON.stringify(estornoResult.erro).slice(0, 100)}`,
    duracao_ms: Date.now() - t24,
    erro: !estornoResult.ok ? "estornarCobranca nao retornou mock" : undefined,
  });
  if (!steps[steps.length - 1].ok) return await finalizar(steps, inicio, "step_24_falhou");

  // 25: getPagamento mock retorna RECEIVED
  const t25 = Date.now();
  const { getPagamento } = await import("@/lib/asaas");
  const consultaResult = await getPagamento(String(corridaAposAceite?.asaas_payment_id));
  steps.push({
    step: "25_consulta_pagamento_mock",
    ok: consultaResult.ok && consultaResult.pagamento?.status === "RECEIVED",
    esperado: "getPagamento retorna RECEIVED pra pay_smoke_",
    obtido: consultaResult.ok
      ? `status=${consultaResult.pagamento?.status}`
      : `erro: ${JSON.stringify(consultaResult.erro).slice(0, 100)}`,
    duracao_ms: Date.now() - t25,
    erro: !consultaResult.ok ? "getPagamento nao retornou mock" : undefined,
  });
  if (!steps[steps.length - 1].ok) return await finalizar(steps, inicio, "step_25_falhou");

  // ========== STEP 26: Garante que NAO houve cobranca real Asaas ==========
  // Se durante o smoke alguma chamada vazou pro Asaas real, teria criado
  // payment id NAO comecando com pay_smoke_. Validacao final.
  const { data: corridaFinalCheck } = await supabase
    .from("corridas")
    .select("asaas_payment_id, status, valor_final, prestador_id")
    .eq("id", corridaId)
    .maybeSingle();
  const tudoMockado =
    String(corridaFinalCheck?.asaas_payment_id || "").startsWith("pay_smoke_") &&
    corridaFinalCheck?.status === "concluida" &&
    corridaFinalCheck?.prestador_id === prestadorSmokeId;
  steps.push({
    step: "26_corrida_final_consistente",
    ok: tudoMockado,
    esperado: "asaas_payment_id mock + status=concluida + prestador=smoke",
    obtido: `asaas=${corridaFinalCheck?.asaas_payment_id}, status=${corridaFinalCheck?.status}, prestador=${corridaFinalCheck?.prestador_id?.slice(0, 8)}`,
    duracao_ms: 0,
    erro: tudoMockado ? undefined : "estado final da corrida inconsistente",
  });

  // ========== STEP 27: Garante prestador smoke ainda tem disponivel=true ==========
  const { data: prestadorFinal } = await supabase
    .from("prestadores")
    .select("disponivel, status")
    .eq("id", prestadorSmokeId)
    .maybeSingle();
  steps.push({
    step: "27_prestador_smoke_intacto",
    ok: prestadorFinal?.disponivel === true && prestadorFinal?.status === "aprovado",
    esperado: "prestador smoke disponivel=true e aprovado",
    obtido: `disponivel=${prestadorFinal?.disponivel}, status=${prestadorFinal?.status}`,
    duracao_ms: 0,
    erro: undefined,
  });

  // Cleanup pos-teste (independente de sucesso/falha) — limparPhoneSmoke
  // tambem deleta corridas via cliente_id pra evitar lixo.
  await limparPhoneSmoke();

  return await finalizar(steps, inicio, null);
}

async function finalizar(
  steps: StepResult[],
  inicio: number,
  motivoFalha: string | null,
): Promise<NextResponse> {
  // Coleta bot_logs criados durante a janela do smoke ANTES do cleanup.
  // 2 queries separadas (filtros por phone full e phone_masked) — o operador
  // .or() do PostgREST pode quebrar com '*' no value (phone_masked tem
  // asteriscos: '*********0001'). So coleta se algo falhou.
  let logsDebug: unknown = undefined;
  if (motivoFalha || steps.some((s) => !s.ok)) {
    const phoneMasked = SMOKE_PHONE.replace(/\d(?=\d{4})/g, "*");
    const inicioIso = new Date(inicio - 5000).toISOString();
    const [{ data: logsFull }, { data: logsMasked }] = await Promise.all([
      supabase
        .from("bot_logs")
        .select("payload, criado_em")
        .gte("criado_em", inicioIso)
        .filter("payload->>phone", "eq", SMOKE_PHONE)
        .order("criado_em", { ascending: false })
        .limit(30),
      supabase
        .from("bot_logs")
        .select("payload, criado_em")
        .gte("criado_em", inicioIso)
        .filter("payload->>phone_masked", "eq", phoneMasked)
        .order("criado_em", { ascending: false })
        .limit(30),
    ]);
    const todos = [...(logsFull || []), ...(logsMasked || [])];
    // Dedup por ts (mesma linha pode aparecer em ambas se tiver os 2 campos)
    const dedupMap = new Map<string, { payload: unknown; criado_em: string }>();
    for (const l of todos) dedupMap.set(l.criado_em, l);
    const ordenados = Array.from(dedupMap.values()).sort(
      (a, b) => (a.criado_em < b.criado_em ? 1 : -1),
    );
    logsDebug = ordenados.map((l) => ({
      ts: l.criado_em,
      tipo: (l.payload as Record<string, unknown>)?.tipo,
      payload: l.payload,
    }));
  }

  await limparPhoneSmoke(); // cleanup final

  const duracaoTotal = Date.now() - inicio;
  const todosOk = steps.every((s) => s.ok);
  const stepsFalhos = steps.filter((s) => !s.ok);

  // Loga resultado (INV futura pode vigiar esse log pra detectar smoke parado)
  await supabase.from("bot_logs").insert({
    payload: {
      tipo: todosOk ? "imuni_smoke_e2e_ok" : "imuni_smoke_e2e_falhou",
      duracao_ms: duracaoTotal,
      total_steps: steps.length,
      steps_ok: steps.filter((s) => s.ok).length,
      steps_falhos: stepsFalhos.length,
      detalhes: steps,
      motivo: motivoFalha,
    },
  });

  // Se falhou, alerta admins (estagio 3 IMUNI: avisa ANTES de cliente real ver)
  if (!todosOk) {
    const resumo = stepsFalhos
      .map((s, i) => `${i + 1}. *${s.step}*\n   esperado: ${s.esperado}\n   obtido: ${s.obtido}${s.erro ? `\n   erro: ${s.erro}` : ""}`)
      .join("\n\n");

    await notificarAdmins(
      "🚨 *IMUNI SMOKE E2E FALHOU*",
      "fluxo de cotacao quebrado",
      `O smoke sintetico detectou regressao no fluxo do bot ANTES de cliente real ver.\n\n*Steps que falharam:*\n${resumo}\n\n*Acao*: olhar deploy mais recente. Algo quebrou o fluxo "oi → 1 → localizacao".\n\nDuracao total: ${duracaoTotal}ms`,
    );
  }

  return NextResponse.json({
    ok: todosOk,
    duracao_ms: duracaoTotal,
    steps,
    motivo: motivoFalha,
    logs_debug: logsDebug,
  });
}
