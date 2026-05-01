import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import { isValidCronKey, isValidAdminKey } from "@/lib/admin-auth";
import { compararExtracao, type ContextoIA, type ValoresFinaisCorrida } from "@/lib/comparar-extracao";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Cron `/api/cron/medir-qualidade-ia` — recomendado rodar 1x/dia (~7h da manha).
//
// Pra cada corrida concluida nas ultimas 48h sem entrada em qualidade_extracao_ia:
//   1) Busca log do extrair-contexto-inicial (1a IA do atendimento)
//   2) Compara extracao_ia vs valores finais usados na corrida
//   3) Calcula taxa de acerto por campo
//   4) Insere em qualidade_extracao_ia (UNIQUE em corrida_id evita duplicar)
//
// Janela 48h em vez de 24h pra cobrir corridas que iniciam num dia e
// concluem no dia seguinte (timing de cron).

const JANELA_HORAS = 48;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (!isValidCronKey(key) && !isValidAdminKey(key)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 401 });
  }

  const inicio = new Date(Date.now() - JANELA_HORAS * 3600_000).toISOString();

  // 1) Busca corridas CONCLUIDAS na janela
  const { data: corridas, error: errCorridas } = await supabase
    .from("corridas")
    .select(`
      id, cliente_id, codigo,
      tipo_servico, tipo_veiculo, descricao_carga,
      origem_endereco, destino_endereco,
      andares_origem, escada_origem, elevador_destino,
      qtd_ajudantes, periodo,
      criado_em,
      clientes!inner(telefone)
    `)
    .eq("status", "concluida")
    .gte("criado_em", inicio)
    .limit(200);

  if (errCorridas) {
    return NextResponse.json({ error: errCorridas.message }, { status: 500 });
  }

  if (!corridas || corridas.length === 0) {
    return NextResponse.json({ status: "ok", corridas_avaliadas: 0, motivo: "sem corridas concluidas na janela" });
  }

  let novas = 0;
  let puladas = 0;
  const erros: { corrida_id: string; motivo: string }[] = [];

  for (const c of corridas) {
    try {
      // 2) Idempotencia: ja medida?
      const { count: ja } = await supabase
        .from("qualidade_extracao_ia")
        .select("*", { count: "exact", head: true })
        .eq("corrida_id", c.id);
      if ((ja || 0) > 0) {
        puladas++;
        continue;
      }

      // 3) Busca log de extrair-contexto-inicial mais antigo do phone do cliente
      //    NA JANELA da corrida (entre criado_em - 24h e criado_em).
      const phone = (c.clientes as any)?.telefone;
      if (!phone) {
        erros.push({ corrida_id: c.id, motivo: "sem telefone do cliente" });
        continue;
      }

      const inicioJanela = new Date(new Date(c.criado_em).getTime() - 24 * 3600_000).toISOString();
      const { data: logCtx } = await supabase
        .from("bot_logs")
        .select("payload, criado_em")
        .filter("payload->>tipo", "eq", "contexto_extraido_inicial")
        .filter("payload->>phone", "eq", phone)
        .gte("criado_em", inicioJanela)
        .lte("criado_em", c.criado_em)
        .order("criado_em", { ascending: false })
        .limit(1);

      if (!logCtx || logCtx.length === 0) {
        // Sem extracao IA pra essa corrida — cliente entrou via fluxo manual
        // OU o log expirou. Skip silencioso.
        puladas++;
        continue;
      }

      const payload = logCtx[0].payload as any;
      const extracao: ContextoIA = payload?.contexto || {};
      const mensagem: string = payload?.mensagem_original || "";

      const valoresFinais: ValoresFinaisCorrida = {
        tipo_servico: c.tipo_servico,
        tipo_veiculo: c.tipo_veiculo,
        descricao_carga: c.descricao_carga,
        origem_endereco: c.origem_endereco,
        destino_endereco: c.destino_endereco,
        andares_origem: c.andares_origem,
        escada_origem: c.escada_origem,
        elevador_destino: c.elevador_destino,
        qtd_ajudantes: c.qtd_ajudantes,
        periodo: c.periodo,
      };

      // 4) Compara
      const resultado = compararExtracao(extracao, valoresFinais);

      // 5) Insere
      const { error: errInsert } = await supabase.from("qualidade_extracao_ia").insert({
        corrida_id: c.id,
        mensagem_original: mensagem.slice(0, 4000),
        extracao_ia: extracao,
        valores_finais: valoresFinais,
        campos_corretos: resultado.campos_corretos,
        campos_incorretos: resultado.campos_incorretos,
        taxa_acerto: resultado.taxa_acerto,
        modelo_ia: "gpt-4o-mini",
        custo_usd: 0.001,
      });

      if (errInsert) {
        // 23505 = corrida ja medida (concorrencia). Outros sao erros reais.
        if (errInsert.code !== "23505") {
          erros.push({ corrida_id: c.id, motivo: errInsert.message });
        }
        continue;
      }

      novas++;
    } catch (e: any) {
      erros.push({ corrida_id: c.id, motivo: e?.message?.slice(0, 200) || "erro desconhecido" });
    }
  }

  return NextResponse.json({
    status: "ok",
    janela_horas: JANELA_HORAS,
    corridas_avaliadas: corridas.length,
    novas,
    puladas,
    erros,
  });
}
