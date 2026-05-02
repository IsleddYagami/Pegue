"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchComTimeout } from "@/lib/fetch-utils";
import {
  Shield, AlertCircle, CheckCircle, Activity, Clock,
  ArrowLeft, RefreshCw, Loader2, TrendingUp, TrendingDown,
  Eye, Heart, Wrench, Calendar,
} from "lucide-react";

interface InvarianteResult {
  nome: string;
  descricao: string;
  severidade: "alta" | "media" | "baixa";
  count: number;
  amostra: any[];
  ok: boolean;
  comoAgir: string;
  erro?: string;
}

interface ImuniData {
  plugin: string;
  timestamp: string;
  score: number;
  tempo_desde_ult_incidente: {
    alta: { horas: number; data: string } | null;
    media: { horas: number; data: string } | null;
  };
  aovivo: {
    total: number;
    saudaveis: number;
    violacoes_alta: number;
    violacoes_media: number;
    erros: number;
    detalhes: InvarianteResult[];
  };
  saude_por_categoria: {
    banco: { saudaveis: number; total: number; pct: number };
    infra: { saudaveis: number; total: number; pct: number };
  };
  tendencia_semanal: {
    semanaAtual: number;
    semanaAnterior: number;
    delta_pct: number;
    rumo: "melhor" | "pior" | "igual";
  };
  top_5_invariantes_violantes_30d: { nome: string; ocorrencias: number; severidade: "alta" | "media" | "baixa" }[];
  heatmap: { dia_semana: number[]; hora: number[] };
  historico: { criado_em: string; total: number; violacoes: number; duracao_ms: number; sumario: any[] }[];
  metricas: { execucoes_ultimos_30d: number; execucoes_ultimos_90d: number };
  camadas: { id: string; nome: string; status: string }[];
}

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const DIAS_LONGOS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const CAMADAS_HUMANAS = [
  { id: "1", icone: "🧬", nome: "Memória celular", desc: "Lembro o formato exato de cada estrutura do corpo. Se algo tentar deformar, detecto antes de entrar." },
  { id: "1B", icone: "🦠", nome: "Anticorpos", desc: "3 anticorpos treinados pelos bugs já caçados. Cada novo bug vira anticorpo permanente." },
  { id: "2", icone: "🧪", nome: "Exames de rotina", desc: "450 exames clínicos rodam antes de qualquer mudança no corpo." },
  { id: "3", icone: "🛡️", nome: "Patrulha diária", desc: "Toda madrugada varro o corpo procurando sintomas. 16 sentinelas em áreas críticas." },
  { id: "4", icone: "🚧", nome: "Barreira protetora", desc: "Filtro entrada de cada célula nova. Sem passar nos exames, não entra." },
  { id: "5", icone: "💓", nome: "Monitor cardíaco", desc: "Sigo cada batimento em tempo real. Se algo errado, aviso no WhatsApp." },
];

function statusVisual(score: number): { emoji: string; label: string; cor: string; bgGrad: string; mensagem: string } {
  if (score >= 90) return {
    emoji: "💚", label: "SAUDÁVEL", cor: "text-green-300",
    bgGrad: "from-green-900/30 via-green-800/10 to-transparent",
    mensagem: "Imunidade ótima. Pode dormir tranquilo."
  };
  if (score >= 70) return {
    emoji: "💛", label: "ATENÇÃO", cor: "text-yellow-300",
    bgGrad: "from-yellow-900/30 via-yellow-800/10 to-transparent",
    mensagem: "Imunidade boa, alguns sintomas pra observar."
  };
  if (score >= 50) return {
    emoji: "🧡", label: "FRAGILIZADO", cor: "text-orange-300",
    bgGrad: "from-orange-900/30 via-orange-800/10 to-transparent",
    mensagem: "Sinais de fragilidade. Investigar."
  };
  return {
    emoji: "❤️‍🩹", label: "CRÍTICO", cor: "text-red-300",
    bgGrad: "from-red-900/40 via-red-800/15 to-transparent",
    mensagem: "Estado crítico. Ajuda humana agora."
  };
}

function formatarTempoLimpo(horas: number | null): { texto: string; cor: string } {
  if (horas === null) return { texto: "Desde sempre", cor: "text-green-300" };
  if (horas < 24) return { texto: `${horas}h atrás`, cor: "text-yellow-300" };
  const dias = Math.floor(horas / 24);
  if (dias < 7) return { texto: `${dias} dias`, cor: "text-yellow-200" };
  return { texto: `${dias} dias`, cor: "text-green-300" };
}

export default function ImuniDashboard() {
  const [data, setData] = useState<ImuniData | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [modoTecnico, setModoTecnico] = useState(false);

  const carregar = useCallback(async (key: string) => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetchComTimeout(`/api/admin-imuni?key=${encodeURIComponent(key)}`);
      if (res.status === 401) {
        sessionStorage.removeItem("admin_key");
        setAdminKey(null);
        setErro("Senha incorreta");
        setLoading(false);
        return;
      }
      const j = await res.json();
      if (!res.ok) {
        setErro(j.error || "Erro ao carregar");
        setLoading(false);
        return;
      }
      setData(j);
    } catch {
      setErro("Erro de conexao");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem("admin_key");
    if (!stored) return;
    queueMicrotask(() => {
      setAdminKey(stored);
      carregar(stored);
    });
  }, [carregar]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput) return;
    sessionStorage.setItem("admin_key", keyInput);
    setAdminKey(keyInput);
    carregar(keyInput);
  };

  if (!adminKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#000] via-[#001a14] to-[#000] p-4">
        <form onSubmit={handleLogin} className="w-full max-w-md space-y-4 rounded-2xl border border-[#C9A84C]/30 bg-[#0A0A0A]/80 p-8 backdrop-blur">
          <div className="relative mx-auto h-16 w-16">
            <Shield className="h-16 w-16 text-[#C9A84C]" />
            <span className="absolute inset-0 flex animate-pulse items-center justify-center">
              <span className="text-2xl">🛡️</span>
            </span>
          </div>
          <h1 className="text-center text-3xl font-bold text-white">IMUNI</h1>
          <p className="text-center text-sm text-gray-400">Sistema imunológico do seu sistema</p>
          <input
            type="password" placeholder="Senha admin" value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-black px-4 py-3 text-white"
            autoFocus
          />
          <button type="submit" className="w-full rounded-lg bg-[#C9A84C] px-6 py-3 font-bold text-black">
            Entrar
          </button>
          {erro && <p className="text-center text-sm text-red-400">{erro}</p>}
        </form>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000]">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-[#C9A84C]" />
          <p className="mt-4 text-sm text-gray-400">Examinando o corpo...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
        <p className="text-red-400">{erro || "Sem dados"}</p>
      </div>
    );
  }

  const status = statusVisual(data.score);
  const tempoAlta = formatarTempoLimpo(data.tempo_desde_ult_incidente.alta?.horas ?? null);
  const tempoMedia = formatarTempoLimpo(data.tempo_desde_ult_incidente.media?.horas ?? null);
  const violacoesAlta = data.aovivo.detalhes.filter((i) => !i.ok && i.severidade === "alta");
  const violacoesMedia = data.aovivo.detalhes.filter((i) => !i.ok && i.severidade === "media");
  const maxHeatmapDia = Math.max(...data.heatmap.dia_semana, 1);
  const maxHeatmapHora = Math.max(...data.heatmap.hora, 1);
  const dominioCapitalizado = data.plugin.charAt(0).toUpperCase() + data.plugin.slice(1);

  return (
    <div className="min-h-screen bg-[#000] text-white">
      <div className={`bg-gradient-to-b ${status.bgGrad} pb-12`}>
        <div className="mx-auto max-w-6xl p-6">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <Link href="/admin" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Voltar admin
            </Link>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setModoTecnico((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-gray-700 bg-black/40 px-3 py-1.5 text-xs text-gray-400 hover:bg-black/60"
                title="Alterna entre boletim de saude (leigo) e detalhes tecnicos"
              >
                <Wrench className="h-3 w-3" />
                {modoTecnico ? "Modo leigo" : "Modo técnico"}
              </button>
              <button
                onClick={() => adminKey && carregar(adminKey)}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-[#C9A84C]/20 px-4 py-2 text-sm font-bold text-[#C9A84C] hover:bg-[#C9A84C]/30 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {modoTecnico ? "Re-executar invariantes" : "Examinar agora"}
              </button>
            </div>
          </div>

          {/* Identidade IMUNI */}
          <div className="mb-8 flex items-start gap-4">
            <div className="relative shrink-0">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#C9A84C]/15">
                <Shield className="h-8 w-8 text-[#C9A84C]" />
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-4 w-4 rounded-full bg-green-500" />
              </span>
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-extrabold tracking-tight">IMUNI</h1>
              <p className="text-base text-gray-300">
                Sou a guardiã do sistema <span className="font-semibold text-[#C9A84C]">{dominioCapitalizado}</span>.
                Cuido da saúde dele 24h por dia, sem dormir.
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Última verificação: {new Date(data.timestamp).toLocaleString("pt-BR")} ·
                {" "}rodei {data.metricas.execucoes_ultimos_90d} patrulhas em 90 dias
              </p>
            </div>
          </div>

          {/* === BOLETIM DE SAÚDE — bloco principal === */}
          <div className="mb-6 rounded-3xl border-2 border-[#C9A84C]/30 bg-gradient-to-br from-[#0A0A0A] to-[#000] p-8">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Score gigante */}
              <div className="md:col-span-2">
                <p className="text-xs uppercase tracking-widest text-gray-500">Boletim de saúde</p>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-7xl">{status.emoji}</span>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-7xl font-extrabold ${status.cor}`}>{data.score}</span>
                      <span className="text-2xl text-gray-500">/ 100</span>
                    </div>
                    <p className={`mt-1 text-sm font-bold tracking-wider ${status.cor}`}>{status.label}</p>
                  </div>
                </div>
                <p className="mt-4 text-base italic text-gray-300">&ldquo;{status.mensagem}&rdquo;</p>
              </div>

              {/* Sem incidentes */}
              <div className="space-y-3 border-l border-gray-800 pl-6">
                <div>
                  <p className="text-xs text-gray-500">Sem ameaça crítica</p>
                  <p className={`text-2xl font-bold ${tempoAlta.cor}`}>{tempoAlta.texto}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Sem sintoma leve</p>
                  <p className={`text-xl font-semibold ${tempoMedia.cor}`}>{tempoMedia.texto}</p>
                </div>
                <div className="pt-2">
                  <p className="text-xs text-gray-500">Próxima patrulha</p>
                  <p className="text-sm font-semibold text-[#C9A84C]">04:00 BRT (madrugada)</p>
                </div>
              </div>
            </div>
          </div>

          {/* === O QUE EU FIZ ESTA SEMANA === */}
          <div className="mb-6 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              <Heart className="h-5 w-5 text-pink-400" /> Esta semana eu...
            </h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat icone="🛡️" valor={data.metricas.execucoes_ultimos_30d} label="patrulhas (30d)" cor="text-blue-300" />
              <Stat icone="✅" valor={data.aovivo.saudaveis} label={`de ${data.aovivo.total} sentinelas saudáveis`} cor="text-green-300" />
              <Stat icone="🔴" valor={data.aovivo.violacoes_alta} label="ameaças críticas agora" cor={data.aovivo.violacoes_alta > 0 ? "text-red-300" : "text-gray-500"} />
              <Stat icone="🟡" valor={data.aovivo.violacoes_media} label="sintomas leves" cor={data.aovivo.violacoes_media > 0 ? "text-yellow-300" : "text-gray-500"} />
            </div>

            {/* Tendencia humanizada */}
            <div className="mt-6 rounded-xl bg-black/40 p-4">
              <div className="flex items-center gap-3">
                {data.tendencia_semanal.rumo === "melhor" ? (
                  <span className="text-3xl">📈</span>
                ) : data.tendencia_semanal.rumo === "pior" ? (
                  <span className="text-3xl">📉</span>
                ) : (
                  <span className="text-3xl">➡️</span>
                )}
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    {data.tendencia_semanal.rumo === "melhor" && (
                      <span className="text-green-300">O corpo está se fortalecendo</span>
                    )}
                    {data.tendencia_semanal.rumo === "pior" && (
                      <span className="text-red-300">Saúde piorou esta semana</span>
                    )}
                    {data.tendencia_semanal.rumo === "igual" && (
                      <span className="text-gray-300">Saúde estável</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    Esta semana: {data.tendencia_semanal.semanaAtual} sintomas ·
                    {" "}semana passada: {data.tendencia_semanal.semanaAnterior} ·
                    {" "}variação {data.tendencia_semanal.delta_pct > 0 ? "+" : ""}{data.tendencia_semanal.delta_pct}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* === ÁREAS DO CORPO === */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <AreaCorpo
              icone="🫀"
              nome="Sistema circulatório"
              descricao_humana="Pagamentos, repasses, fluxo financeiro, corridas, dispatch"
              descricao_tec="Banco de dados (corridas, pagamentos, prestadores)"
              pct={data.saude_por_categoria.banco.pct}
              saudaveis={data.saude_por_categoria.banco.saudaveis}
              total={data.saude_por_categoria.banco.total}
              modoTecnico={modoTecnico}
            />
            <AreaCorpo
              icone="🧠"
              nome="Sistema nervoso"
              descricao_humana="Conexões com pagamento, IA, mensagens, segurança"
              descricao_tec="Headers HTTP, env vars, Asaas em produção, CSP"
              pct={data.saude_por_categoria.infra.pct}
              saudaveis={data.saude_por_categoria.infra.saudaveis}
              total={data.saude_por_categoria.infra.total}
              modoTecnico={modoTecnico}
            />
          </div>

          {/* === MEU SISTEMA IMUNOLÓGICO === */}
          <div className="mb-6 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              🦠 Minhas defesas ativas
            </h2>
            <p className="mb-4 text-sm text-gray-400">
              Trabalho em camadas, como qualquer sistema imune. Cada camada cobre o que a outra não pega:
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {CAMADAS_HUMANAS.map((c) => (
                <div key={c.id} className="rounded-xl bg-black/40 p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-2xl">{c.icone}</span>
                    <h3 className="text-sm font-bold">{c.nome}</h3>
                    <span className="ml-auto h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                  </div>
                  <p className="text-xs text-gray-400">{c.desc}</p>
                  {modoTecnico && (
                    <p className="mt-2 text-[10px] uppercase tracking-wider text-gray-600">
                      Camada {c.id}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* === AMEAÇAS ATIVAS (se houver) === */}
          {violacoesAlta.length > 0 && (
            <div className="mb-6 rounded-2xl border-2 border-red-700/40 bg-red-900/10 p-6">
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-red-300">
                🚨 Ameaças críticas detectadas
              </h2>
              <p className="mb-4 text-sm text-gray-300">
                Achei {violacoesAlta.length} {violacoesAlta.length === 1 ? "ponto" : "pontos"} no corpo que precisa{violacoesAlta.length === 1 ? "" : "m"} de atenção humana imediata:
              </p>
              <div className="space-y-3">
                {violacoesAlta.map((inv) => (
                  <div key={inv.nome} className="rounded-xl bg-black/40 p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">🩺</span>
                      <span className="font-bold text-red-300">
                        {inv.count} {inv.count === 1 ? "caso" : "casos"} suspeito{inv.count === 1 ? "" : "s"}
                      </span>
                      {modoTecnico && (
                        <span className="ml-auto rounded bg-red-700/30 px-2 py-0.5 font-mono text-xs">{inv.nome}</span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-gray-300">{inv.descricao}</p>
                    <p className="mt-2 rounded bg-black/40 p-2 text-xs text-gray-300">
                      <span className="font-bold text-[#C9A84C]">💊 Tratamento sugerido:</span> {inv.comoAgir}
                    </p>
                    {modoTecnico && inv.amostra.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300">
                          Ver amostra técnica
                        </summary>
                        <pre className="mt-2 overflow-x-auto rounded bg-black/60 p-2 text-xs text-gray-400">
                          {JSON.stringify(inv.amostra, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {violacoesMedia.length > 0 && (
            <div className="mb-6 rounded-2xl border border-yellow-700/30 bg-yellow-900/10 p-6">
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-yellow-300">
                🤒 Sintomas leves
              </h2>
              <p className="mb-4 text-sm text-gray-400">Não é urgente, mas vale acompanhar.</p>
              <div className="space-y-2">
                {violacoesMedia.map((inv) => (
                  <div key={inv.nome} className="flex items-center gap-3 rounded-lg bg-black/40 p-3">
                    <span className="text-xl">🟡</span>
                    <span className="text-sm font-semibold text-yellow-200">{inv.count}</span>
                    <span className="flex-1 text-sm text-gray-300">{inv.descricao}</span>
                    {modoTecnico && <span className="rounded bg-yellow-700/30 px-2 py-0.5 font-mono text-xs">{inv.nome}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {violacoesAlta.length === 0 && violacoesMedia.length === 0 && (
            <div className="mb-6 rounded-2xl border-2 border-green-700/30 bg-green-900/10 p-8 text-center">
              <span className="text-6xl">🌿</span>
              <h2 className="mt-2 text-2xl font-bold text-green-300">Tudo limpo</h2>
              <p className="mt-2 text-gray-400">
                Nenhuma ameaça nem sintoma detectado agora. Sistema em equilíbrio.
              </p>
            </div>
          )}

          {/* === PADRÕES === */}
          {data.top_5_invariantes_violantes_30d.length > 0 && (
            <div className="mb-6 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                🔬 Áreas que mais adoeceram (últimos 30 dias)
              </h2>
              <div className="space-y-2">
                {data.top_5_invariantes_violantes_30d.map((inv, i) => {
                  const max = data.top_5_invariantes_violantes_30d[0].ocorrencias;
                  const pct = max > 0 ? (inv.ocorrencias / max) * 100 : 0;
                  return (
                    <div key={inv.nome} className="flex items-center gap-3">
                      <span className="w-6 text-center text-xs text-gray-500">#{i + 1}</span>
                      <span className="text-lg">{inv.severidade === "alta" ? "🔴" : "🟡"}</span>
                      {modoTecnico && (
                        <span className="rounded bg-gray-800 px-2 py-0.5 font-mono text-xs text-gray-400">{inv.nome}</span>
                      )}
                      <div className="relative h-7 flex-1 rounded bg-black/40">
                        <div
                          className={`absolute left-0 top-0 h-full rounded ${
                            inv.severidade === "alta" ? "bg-red-700/50" : "bg-yellow-700/50"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs">
                          {inv.ocorrencias} {inv.ocorrencias === 1 ? "vez" : "vezes"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* === HEATMAPS === */}
          {(data.heatmap.dia_semana.some((v) => v > 0) || data.heatmap.hora.some((v) => v > 0)) && (
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
                <h3 className="mb-3 flex items-center gap-2 text-base font-bold">
                  <Calendar className="h-4 w-4 text-[#C9A84C]" />
                  Quando o corpo mais adoece (dia da semana)
                </h3>
                <div className="grid grid-cols-7 gap-1">
                  {data.heatmap.dia_semana.map((v, i) => {
                    const intensidade = maxHeatmapDia > 0 ? v / maxHeatmapDia : 0;
                    return (
                      <div key={i} className="text-center" title={`${DIAS_LONGOS[i]}: ${v}`}>
                        <div
                          className="mb-1 h-12 rounded"
                          style={{ backgroundColor: `rgba(239, 68, 68, ${0.12 + intensidade * 0.7})` }}
                        />
                        <p className="text-xs text-gray-500">{DIAS_SEMANA[i]}</p>
                        <p className="text-xs font-bold">{v}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
                <h3 className="mb-3 flex items-center gap-2 text-base font-bold">
                  <Clock className="h-4 w-4 text-[#C9A84C]" />
                  Quando o corpo mais adoece (hora do dia)
                </h3>
                <div className="grid grid-cols-12 gap-0.5">
                  {data.heatmap.hora.map((v, i) => {
                    const intensidade = maxHeatmapHora > 0 ? v / maxHeatmapHora : 0;
                    return (
                      <div
                        key={i}
                        className="h-8 rounded"
                        style={{ backgroundColor: `rgba(239, 68, 68, ${0.12 + intensidade * 0.7})` }}
                        title={`${i}h: ${v}`}
                      />
                    );
                  })}
                </div>
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
                </div>
              </div>
            </div>
          )}

          {/* === MODO TECNICO: detalhes invariantes === */}
          {modoTecnico && (
            <div className="mb-6 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                <Eye className="h-5 w-5" /> Todas as {data.aovivo.total} sentinelas (modo técnico)
              </h2>
              <div className="space-y-1 text-sm">
                {data.aovivo.detalhes.map((inv) => (
                  <div key={inv.nome} className="flex items-start gap-2 rounded p-2 hover:bg-black/40">
                    {inv.ok ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                    ) : (
                      <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${inv.severidade === "alta" ? "text-red-400" : "text-yellow-400"}`} />
                    )}
                    <span className="font-mono text-xs text-gray-500">{inv.nome}</span>
                    <span className="flex-1 text-gray-300">{inv.descricao}</span>
                    {inv.count > 0 && <span className="text-xs font-bold text-red-400">{inv.count}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* === HISTÓRICO DE PATRULHAS === */}
          <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
              📋 Diário de patrulhas
            </h2>
            <p className="mb-4 text-xs text-gray-500">
              Registro de cada vez que examinei o corpo. Patrulhas automáticas + manuais.
            </p>
            <div className="space-y-1">
              {data.historico.length === 0 && (
                <p className="text-sm text-gray-500">
                  Nenhuma patrulha registrada ainda. Vou começar quando o cron rodar (todo dia 04:00 BRT).
                </p>
              )}
              {data.historico.map((h, i) => (
                <div key={i} className="flex items-center justify-between rounded p-2 text-sm hover:bg-black/40">
                  <span className="text-gray-400">
                    {new Date(h.criado_em).toLocaleString("pt-BR", {
                      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                  <div className="flex items-center gap-3">
                    {modoTecnico && <span className="text-xs text-gray-500">{h.duracao_ms}ms</span>}
                    {h.violacoes === 0 ? (
                      <span className="rounded bg-green-700/30 px-3 py-0.5 text-xs text-green-300">
                        ✓ Tudo limpo
                      </span>
                    ) : (
                      <span className="rounded bg-red-700/30 px-3 py-0.5 text-xs text-red-300">
                        {h.violacoes} {h.violacoes === 1 ? "ameaça" : "ameaças"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-gray-600">
            IMUNI v0.3.0 · sistema imunológico autônomo · plugin <span className="text-[#C9A84C]">{data.plugin}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ icone, valor, label, cor }: { icone: string; valor: number; label: string; cor: string }) {
  return (
    <div className="rounded-xl bg-black/40 p-4 text-center">
      <span className="mb-1 block text-3xl">{icone}</span>
      <p className={`text-3xl font-extrabold ${cor}`}>{valor}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  );
}

function AreaCorpo({
  icone, nome, descricao_humana, descricao_tec, pct, saudaveis, total, modoTecnico,
}: {
  icone: string; nome: string; descricao_humana: string; descricao_tec: string;
  pct: number; saudaveis: number; total: number; modoTecnico: boolean;
}) {
  const cor = pct === 100 ? "text-green-300" : pct >= 70 ? "text-yellow-300" : "text-red-300";
  const bg = pct === 100 ? "bg-green-700/40" : pct >= 70 ? "bg-yellow-700/40" : "bg-red-700/40";
  return (
    <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-3xl">{icone}</span>
        <div className="flex-1">
          <h3 className="font-bold">{nome}</h3>
          <p className="text-xs text-gray-500">{modoTecnico ? descricao_tec : descricao_humana}</p>
        </div>
        <span className={`text-3xl font-extrabold ${cor}`}>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/60">
        <div className={`h-full ${bg}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {saudaveis}/{total} áreas saudáveis
      </p>
    </div>
  );
}
