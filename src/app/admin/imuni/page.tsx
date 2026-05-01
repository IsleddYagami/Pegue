"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fetchComTimeout } from "@/lib/fetch-utils";
import {
  Shield, AlertCircle, CheckCircle, Activity, Clock,
  ArrowLeft, RefreshCw, Loader2, TrendingUp, Eye,
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
  aovivo: {
    total: number;
    saudaveis: number;
    violacoes_alta: number;
    violacoes_media: number;
    erros: number;
    detalhes: InvarianteResult[];
  };
  historico: { criado_em: string; total: number; violacoes: number; duracao_ms: number; sumario: any[] }[];
  metricas: {
    execucoes_ultimos_30d: number;
    violacoes_por_invariante_ultimos_14_runs: Record<string, number>;
  };
  camadas: { id: string; nome: string; status: string }[];
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
    // Defer setState pra fora do effect sincrono (lint react-compiler).
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
            type="password"
            placeholder="Senha admin"
            value={keyInput}
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
  const ok = data.aovivo.detalhes.filter((i) => i.ok);

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

        {/* Cards de status */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-green-700/30 bg-green-900/10 p-5">
            <CheckCircle className="mb-2 h-6 w-6 text-green-400" />
            <p className="text-3xl font-extrabold text-green-300">{data.aovivo.saudaveis}</p>
            <p className="text-xs text-gray-400">Invariantes saudaveis</p>
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
            <p className="text-xs text-gray-400">Violacoes medias</p>
          </div>
          <div className="rounded-2xl border border-blue-700/30 bg-blue-900/10 p-5">
            <Activity className="mb-2 h-6 w-6 text-blue-400" />
            <p className="text-3xl font-extrabold text-blue-300">{data.metricas.execucoes_ultimos_30d}</p>
            <p className="text-xs text-gray-400">Execucoes 30d</p>
          </div>
        </div>

        {/* Violacoes ALTAS detalhadas */}
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

        {/* Violacoes medias */}
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

        {/* Camadas IMUNI */}
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

        {/* Lista completa das invariantes */}
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

        {/* Historico */}
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Clock className="h-5 w-5" /> Historico (ultimas {data.historico.length} execucoes)
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
          Ultima atualizacao: {new Date(data.timestamp).toLocaleString("pt-BR")} · IMUNI v0.1.0
        </p>
      </div>
    </div>
  );
}
