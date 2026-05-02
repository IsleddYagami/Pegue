"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchComTimeout } from "@/lib/fetch-utils";
import {
  Shield, AlertCircle, CheckCircle, Activity, Clock,
  ArrowLeft, RefreshCw, Loader2, TrendingUp, TrendingDown,
  Eye, Database, Server, Zap, Calendar,
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

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function formatarTempoLimpo(horas: number | null): string {
  if (horas === null) return "Nunca teve";
  if (horas < 1) return "Menos de 1h";
  if (horas < 24) return `${horas}h limpo`;
  const dias = Math.floor(horas / 24);
  return `${dias} dia${dias > 1 ? "s" : ""} limpo`;
}

function corPorScore(score: number): { bg: string; text: string; border: string; label: string } {
  if (score >= 90) return { bg: "bg-green-900/20", text: "text-green-300", border: "border-green-700/40", label: "EXCELENTE" };
  if (score >= 70) return { bg: "bg-yellow-900/20", text: "text-yellow-300", border: "border-yellow-700/40", label: "ATENCAO" };
  return { bg: "bg-red-900/20", text: "text-red-300", border: "border-red-700/40", label: "CRITICO" };
}

export default function ImuniDashboard() {
  const [data, setData] = useState<ImuniData | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");

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
      <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
        <form onSubmit={handleLogin} className="w-full max-w-md space-y-4 rounded-2xl border border-[#C9A84C]/30 bg-[#0A0A0A] p-8">
          <Shield className="mx-auto h-12 w-12 text-[#C9A84C]" />
          <h1 className="text-center text-2xl font-bold text-white">IMUNI Dashboard</h1>
          <p className="text-center text-sm text-gray-400">Saude do meta-sistema</p>
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
        <Loader2 className="h-8 w-8 animate-spin text-[#C9A84C]" />
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

  const violacoesAlta = data.aovivo.detalhes.filter((i) => !i.ok && i.severidade === "alta");
  const violacoesMedia = data.aovivo.detalhes.filter((i) => !i.ok && i.severidade === "media");
  const cor = corPorScore(data.score);
  const maxHeatmapDia = Math.max(...data.heatmap.dia_semana, 1);
  const maxHeatmapHora = Math.max(...data.heatmap.hora, 1);

  return (
    <div className="min-h-screen bg-[#000] text-white">
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Voltar admin
          </Link>
          <button
            onClick={() => adminKey && carregar(adminKey)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-[#C9A84C]/20 px-4 py-2 text-sm font-bold text-[#C9A84C] hover:bg-[#C9A84C]/30 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-executar invariantes
          </button>
        </div>

        <div className="mb-8 flex items-center gap-3">
          <Shield className="h-8 w-8 text-[#C9A84C]" />
          <div>
            <h1 className="text-3xl font-extrabold">IMUNI</h1>
            <p className="text-sm text-gray-500">Sistema imuno-corretivo · plugin: {data.plugin}</p>
          </div>
        </div>

        {/* === SCORE PRINCIPAL === */}
        <div className={`mb-8 rounded-3xl border-2 ${cor.border} ${cor.bg} p-8`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Score de saude</p>
              <p className={`text-7xl font-extrabold ${cor.text}`}>{data.score}</p>
              <p className={`text-sm font-bold ${cor.text}`}>{cor.label}</p>
            </div>
            <div className="text-right">
              <div className="mb-2">
                <p className="text-xs text-gray-500">Sem violacao ALTA</p>
                <p className="text-xl font-bold text-green-300">
                  {formatarTempoLimpo(data.tempo_desde_ult_incidente.alta?.horas ?? null)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Sem violacao MEDIA</p>
                <p className="text-lg font-semibold text-yellow-300">
                  {formatarTempoLimpo(data.tempo_desde_ult_incidente.media?.horas ?? null)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* === CARDS === */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-green-700/30 bg-green-900/10 p-5">
            <CheckCircle className="mb-2 h-6 w-6 text-green-400" />
            <p className="text-3xl font-extrabold text-green-300">{data.aovivo.saudaveis}</p>
            <p className="text-xs text-gray-400">de {data.aovivo.total} saudaveis</p>
          </div>
          <div className={`rounded-2xl border p-5 ${data.aovivo.violacoes_alta > 0 ? "border-red-700/40 bg-red-900/15" : "border-gray-700/30 bg-gray-900/10"}`}>
            <AlertCircle className={`mb-2 h-6 w-6 ${data.aovivo.violacoes_alta > 0 ? "text-red-400" : "text-gray-500"}`} />
            <p className={`text-3xl font-extrabold ${data.aovivo.violacoes_alta > 0 ? "text-red-300" : "text-gray-400"}`}>
              {data.aovivo.violacoes_alta}
            </p>
            <p className="text-xs text-gray-400">Violacoes ALTAS</p>
          </div>
          <div className="rounded-2xl border border-yellow-700/30 bg-yellow-900/10 p-5">
            <AlertCircle className="mb-2 h-6 w-6 text-yellow-400" />
            <p className="text-3xl font-extrabold text-yellow-300">{data.aovivo.violacoes_media}</p>
            <p className="text-xs text-gray-400">Medias</p>
          </div>
          <div className="rounded-2xl border border-blue-700/30 bg-blue-900/10 p-5">
            <Activity className="mb-2 h-6 w-6 text-blue-400" />
            <p className="text-3xl font-extrabold text-blue-300">{data.metricas.execucoes_ultimos_30d}</p>
            <p className="text-xs text-gray-400">Execucoes 30d</p>
          </div>
        </div>

        {/* === SAUDE POR CATEGORIA === */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-5 w-5 text-[#C9A84C]" />
              <h3 className="font-bold">Banco de dados</h3>
              <span className="ml-auto text-2xl font-extrabold">
                <span className={data.saude_por_categoria.banco.pct === 100 ? "text-green-300" : "text-yellow-300"}>
                  {data.saude_por_categoria.banco.pct}%
                </span>
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {data.saude_por_categoria.banco.saudaveis}/{data.saude_por_categoria.banco.total} invariantes saudaveis
            </p>
            <p className="mt-2 text-xs text-gray-600">
              Estado de corridas, pagamentos, repasse, dispatch, prestadores.
            </p>
          </div>
          <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
            <div className="mb-3 flex items-center gap-2">
              <Server className="h-5 w-5 text-[#C9A84C]" />
              <h3 className="font-bold">Infraestrutura</h3>
              <span className="ml-auto text-2xl font-extrabold">
                <span className={data.saude_por_categoria.infra.pct === 100 ? "text-green-300" : "text-yellow-300"}>
                  {data.saude_por_categoria.infra.pct}%
                </span>
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {data.saude_por_categoria.infra.saudaveis}/{data.saude_por_categoria.infra.total} invariantes saudaveis
            </p>
            <p className="mt-2 text-xs text-gray-600">
              Headers HTTP, env vars, Asaas em producao, CSP, geolocation.
            </p>
          </div>
        </div>

        {/* === TENDENCIA === */}
        <div className="mb-8 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
          <div className="mb-3 flex items-center gap-2">
            {data.tendencia_semanal.rumo === "melhor" ? (
              <TrendingDown className="h-5 w-5 text-green-400" />
            ) : data.tendencia_semanal.rumo === "pior" ? (
              <TrendingUp className="h-5 w-5 text-red-400" />
            ) : (
              <Activity className="h-5 w-5 text-gray-400" />
            )}
            <h3 className="font-bold">Tendencia semanal</h3>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500">Semana passada</p>
              <p className="text-3xl font-extrabold text-gray-400">{data.tendencia_semanal.semanaAnterior}</p>
              <p className="text-xs text-gray-600">violacoes</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Esta semana</p>
              <p className={`text-3xl font-extrabold ${
                data.tendencia_semanal.rumo === "melhor" ? "text-green-300" :
                data.tendencia_semanal.rumo === "pior" ? "text-red-300" : "text-gray-400"
              }`}>{data.tendencia_semanal.semanaAtual}</p>
              <p className="text-xs text-gray-600">violacoes</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Delta</p>
              <p className={`text-3xl font-extrabold ${
                data.tendencia_semanal.rumo === "melhor" ? "text-green-300" :
                data.tendencia_semanal.rumo === "pior" ? "text-red-300" : "text-gray-400"
              }`}>
                {data.tendencia_semanal.delta_pct > 0 ? "+" : ""}{data.tendencia_semanal.delta_pct}%
              </p>
              <p className="text-xs text-gray-600">{
                data.tendencia_semanal.rumo === "melhor" ? "↓ melhorando" :
                data.tendencia_semanal.rumo === "pior" ? "↑ piorando" : "estavel"
              }</p>
            </div>
          </div>
        </div>

        {/* === TOP 5 RECORRENTES === */}
        {data.top_5_invariantes_violantes_30d.length > 0 && (
          <div className="mb-8 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-[#C9A84C]" />
              <h3 className="font-bold">Top 5 invariantes que mais violaram (ult 30d)</h3>
            </div>
            <div className="space-y-2">
              {data.top_5_invariantes_violantes_30d.map((inv, i) => {
                const max = data.top_5_invariantes_violantes_30d[0].ocorrencias;
                const pct = max > 0 ? (inv.ocorrencias / max) * 100 : 0;
                return (
                  <div key={inv.nome} className="flex items-center gap-3">
                    <span className="w-6 text-center font-mono text-xs text-gray-500">#{i + 1}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-bold ${
                      inv.severidade === "alta" ? "bg-red-700/30 text-red-300" : "bg-yellow-700/30 text-yellow-300"
                    }`}>{inv.nome}</span>
                    <div className="relative h-6 flex-1 rounded bg-black/40">
                      <div className={`absolute left-0 top-0 h-full rounded ${
                        inv.severidade === "alta" ? "bg-red-700/50" : "bg-yellow-700/50"
                      }`} style={{ width: `${pct}%` }} />
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs">
                        {inv.ocorrencias} ocorrencia{inv.ocorrencias > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* === HEATMAP DIA DA SEMANA === */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#C9A84C]" />
              <h3 className="font-bold">Violacoes por dia da semana</h3>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {data.heatmap.dia_semana.map((v, i) => {
                const intensidade = maxHeatmapDia > 0 ? v / maxHeatmapDia : 0;
                return (
                  <div key={i} className="text-center">
                    <div
                      className="mb-1 h-12 rounded"
                      style={{ backgroundColor: `rgba(239, 68, 68, ${0.15 + intensidade * 0.7})` }}
                      title={`${v} violacoes`}
                    />
                    <p className="text-xs text-gray-500">{DIAS_SEMANA[i]}</p>
                    <p className="text-xs font-bold">{v}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
            <div className="mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#C9A84C]" />
              <h3 className="font-bold">Violacoes por hora do dia</h3>
            </div>
            <div className="grid grid-cols-12 gap-0.5">
              {data.heatmap.hora.map((v, i) => {
                const intensidade = maxHeatmapHora > 0 ? v / maxHeatmapHora : 0;
                return (
                  <div
                    key={i}
                    className="h-8 rounded"
                    style={{ backgroundColor: `rgba(239, 68, 68, ${0.15 + intensidade * 0.7})` }}
                    title={`${i}h: ${v} violacoes`}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
            </div>
          </div>
        </div>

        {/* === VIOLACOES ATIVAS === */}
        {violacoesAlta.length > 0 && (
          <div className="mb-8 rounded-2xl border-2 border-red-700/40 bg-red-900/10 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-red-300">
              <AlertCircle className="h-5 w-5" /> Violacoes ALTAS — acao necessaria
            </h2>
            <div className="space-y-4">
              {violacoesAlta.map((inv) => (
                <div key={inv.nome} className="rounded-xl bg-black/40 p-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-red-700/30 px-2 py-0.5 text-xs font-bold text-red-300">{inv.nome}</span>
                    <span className="font-semibold">{inv.count} caso(s)</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-300">{inv.descricao}</p>
                  <p className="mt-2 text-xs text-gray-500">👉 {inv.comoAgir}</p>
                  {inv.amostra.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300">
                        Ver amostra ({inv.amostra.length})
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
          <div className="mb-8 rounded-2xl border border-yellow-700/30 bg-yellow-900/10 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-yellow-300">
              <AlertCircle className="h-5 w-5" /> Violacoes medias
            </h2>
            <div className="space-y-2">
              {violacoesMedia.map((inv) => (
                <div key={inv.nome} className="flex items-center gap-3 rounded-lg bg-black/40 p-3">
                  <span className="rounded bg-yellow-700/30 px-2 py-0.5 text-xs font-bold text-yellow-300">{inv.nome}</span>
                  <span className="text-sm font-semibold">{inv.count}</span>
                  <span className="flex-1 text-sm text-gray-400">{inv.descricao}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === CAMADAS === */}
        <div className="mb-8 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
          <h2 className="mb-4 text-lg font-bold">Camadas de defesa em profundidade</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {data.camadas.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg bg-black/40 p-3">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span className="text-xs text-gray-400">Camada {c.id}</span>
                <span className="text-sm font-semibold">{c.nome}</span>
              </div>
            ))}
          </div>
        </div>

        {/* === LISTA TODAS INVARIANTES === */}
        <div className="mb-8 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Eye className="h-5 w-5" /> Todas as {data.aovivo.total} invariantes ativas
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

        {/* === HISTORICO === */}
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Clock className="h-5 w-5" /> Historico ({data.historico.length} ultimas execucoes)
          </h2>
          <div className="space-y-1">
            {data.historico.length === 0 && (
              <p className="text-sm text-gray-500">Sem execucoes registradas. O cron roda 1x/dia.</p>
            )}
            {data.historico.map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded p-2 text-sm hover:bg-black/40">
                <span className="text-gray-400">{new Date(h.criado_em).toLocaleString("pt-BR")}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{h.duracao_ms}ms</span>
                  {h.violacoes === 0 ? (
                    <span className="rounded bg-green-700/30 px-2 py-0.5 text-xs text-green-300">✓ {h.total}/{h.total} OK</span>
                  ) : (
                    <span className="rounded bg-red-700/30 px-2 py-0.5 text-xs text-red-300">{h.violacoes} violacoes</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-600">
          Ultima atualizacao: {new Date(data.timestamp).toLocaleString("pt-BR")} · IMUNI v0.2.0 · {data.metricas.execucoes_ultimos_90d} execucoes em 90d
        </p>
      </div>
    </div>
  );
}
