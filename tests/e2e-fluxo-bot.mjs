// Bateria de testes E2E do fluxo do bot Pegue.
// Chama o webhook em PRODUÇÃO com payloads simulando cliente real.
// Phone fake 5511900000099 (não existe — Fabio não recebe nada).
// Cada step valida o ESTADO da bot_session no banco — fonte da verdade.
//
// Como rodar:
//   cd site && node tests/e2e-fluxo-bot.mjs

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_WHATSAPP_SECRET || "";
const BASE_URL = "https://www.chamepegue.com.br";
const PHONE_TESTE = "5511900000099";

const c = createClient(SUPABASE_URL, SERVICE_ROLE);

const resultados = [];
function log(passo, ok, detalhe) {
  const icone = ok ? "✅" : "❌";
  console.log(`${icone} ${passo}${detalhe ? " — " + detalhe : ""}`);
  resultados.push({ passo, ok, detalhe });
}

async function chamarWebhook(payload) {
  const url = WEBHOOK_SECRET
    ? `${BASE_URL}/api/whatsapp/webhook?secret=${encodeURIComponent(WEBHOOK_SECRET)}`
    : `${BASE_URL}/api/whatsapp/webhook`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

function payloadMensagem(text, instance = 1) {
  return {
    Type: "received_message",
    instance,
    Body: {
      Text: text,
      Info: {
        RemoteJid: `${PHONE_TESTE}@s.whatsapp.net`,
        FromMe: false,
        PushName: "Cliente Teste E2E",
      },
    },
  };
}

async function getSession() {
  const { data } = await c
    .from("bot_sessions")
    .select("*")
    .eq("phone", PHONE_TESTE)
    .maybeSingle();
  return data;
}

async function limparSessao() {
  await c.from("bot_sessions").delete().eq("phone", PHONE_TESTE);
  // Limpa cliente teste se existir
  await c.from("clientes").delete().eq("telefone", PHONE_TESTE);
}

async function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rodar() {
  console.log("================================================");
  console.log("BATERIA E2E — FLUXO BOT PEGUE");
  console.log(`Phone teste: ${PHONE_TESTE}`);
  console.log("================================================\n");

  // Setup: limpa qualquer estado anterior
  await limparSessao();

  // ==========================================
  // FLUXO 1: oi -> menu de servicos
  // ==========================================
  console.log("\n--- FLUXO 1: cliente envia 'oi' ---");
  const r1 = await chamarWebhook(payloadMensagem("oi"));
  log("1.1 webhook respondeu 200", r1.status === 200, `status ${r1.status}`);
  await aguardar(1000);
  const s1 = await getSession();
  log("1.2 sessao criada no banco", !!s1, s1 ? `step=${s1.step}` : "sem sessao");
  log("1.3 step inicial correto", s1?.step === "aguardando_servico" || s1?.step === "inicio", `step=${s1?.step}`);

  // ==========================================
  // FLUXO 2: cliente escolhe '1' (frete pequeno)
  // ==========================================
  console.log("\n--- FLUXO 2: cliente escolhe '1' (frete) ---");
  const r2 = await chamarWebhook(payloadMensagem("1"));
  log("2.1 webhook respondeu", r2.status === 200, `status ${r2.status}`);
  await aguardar(1000);
  const s2 = await getSession();
  log("2.2 step avancou pra aguardando_localizacao",
    s2?.step === "aguardando_localizacao",
    `step=${s2?.step}`);

  // ==========================================
  // FLUXO 3: cliente envia endereco SP capital (geocoder testa)
  // ==========================================
  console.log("\n--- FLUXO 3: endereco SP capital (Av Paulista 1000) ---");
  const r3 = await chamarWebhook(payloadMensagem("Av Paulista 1000, Bela Vista, Sao Paulo"));
  log("3.1 webhook respondeu", r3.status === 200, `status ${r3.status}`);
  await aguardar(2500); // geocoder Nominatim demora
  const s3 = await getSession();
  log("3.2 origem identificada (step confirmando_origem)",
    s3?.step === "confirmando_origem",
    `step=${s3?.step}`);
  log("3.3 origem_endereco preenchido",
    !!s3?.origem_endereco,
    s3?.origem_endereco?.slice(0, 60));
  log("3.4 origem_lat preenchido",
    typeof s3?.origem_lat === "number",
    `lat=${s3?.origem_lat}`);

  // ==========================================
  // FLUXO 4: cliente confirma origem com '1'
  // ==========================================
  console.log("\n--- FLUXO 4: confirma origem ---");
  const r4 = await chamarWebhook(payloadMensagem("1"));
  log("4.1 webhook respondeu", r4.status === 200, `status ${r4.status}`);
  await aguardar(1000);
  const s4 = await getSession();
  log("4.2 step avancou pra aguardando_destino OU foto",
    ["aguardando_destino", "aguardando_foto"].includes(s4?.step || ""),
    `step=${s4?.step}`);

  // ==========================================
  // FLUXO 5: foto/lista pulada — cliente manda texto direto
  // ==========================================
  console.log("\n--- FLUXO 5: cliente descreve carga por texto ---");
  if (s4?.step === "aguardando_foto") {
    const r5a = await chamarWebhook(payloadMensagem("3")); // tentando opcao texto
    log("5.0 escolheu texto (opcao 3)", r5a.status === 200);
    await aguardar(800);
  }
  // Manda texto
  const r5 = await chamarWebhook(payloadMensagem("1 caixa pequena, 5kg"));
  log("5.1 webhook respondeu", r5.status === 200, `status ${r5.status}`);
  await aguardar(1500);
  const s5 = await getSession();
  log("5.2 sessao avancou (descricao_carga preenchido OU step novo)",
    !!s5?.descricao_carga || (s5?.step !== s4?.step),
    `step=${s5?.step} | carga=${s5?.descricao_carga?.slice(0, 40)}`);

  // ==========================================
  // FLUXO 6: destino
  // ==========================================
  console.log("\n--- FLUXO 6: destino ---");
  if (s5?.step === "aguardando_destino" || s5?.step === "confirmar_itens_foto" || s5?.step === "confirmar_contexto_inicial") {
    // Se for confirmar_*, manda 1 pra confirmar
    if (s5.step !== "aguardando_destino") {
      await chamarWebhook(payloadMensagem("1"));
      await aguardar(1000);
    }
    const r6 = await chamarWebhook(payloadMensagem("Av Paulista 1500, Bela Vista, Sao Paulo"));
    log("6.1 webhook respondeu", r6.status === 200, `status ${r6.status}`);
    await aguardar(2500);
    const s6 = await getSession();
    log("6.2 destino preenchido",
      !!s6?.destino_endereco,
      s6?.destino_endereco?.slice(0, 60));
  } else {
    log("6.0 SKIP: nao chegou em aguardando_destino", false, `step=${s5?.step}`);
  }

  // Estado final
  console.log("\n--- ESTADO FINAL ---");
  const sFinal = await getSession();
  console.log("Step final:", sFinal?.step);
  console.log("Origem:", sFinal?.origem_endereco?.slice(0, 60));
  console.log("Destino:", sFinal?.destino_endereco?.slice(0, 60));
  console.log("Carga:", sFinal?.descricao_carga?.slice(0, 40));
  console.log("Veiculo sugerido:", sFinal?.veiculo_sugerido);

  // Cleanup
  await limparSessao();

  // Resumo
  const total = resultados.length;
  const passou = resultados.filter((r) => r.ok).length;
  const falhou = total - passou;

  console.log("\n================================================");
  console.log("RESUMO");
  console.log("================================================");
  console.log(`Total: ${total} | ✅ Passou: ${passou} | ❌ Falhou: ${falhou}`);
  console.log(`Taxa: ${Math.round((passou / total) * 100)}%`);

  if (falhou > 0) {
    console.log("\nFALHAS:");
    resultados.filter((r) => !r.ok).forEach((r) => {
      console.log(`  ❌ ${r.passo} — ${r.detalhe}`);
    });
  }

  return falhou === 0 ? 0 : 1;
}

rodar().then((code) => process.exit(code)).catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(2);
});
