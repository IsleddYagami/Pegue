"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, AlertCircle, CheckCircle, Clock, Users, Activity } from "lucide-react";

interface StepBreakdown {
  step: string;
  qtd_clientes: number;
  tempo_medio_min: number;
  tempo_max_min: number;
  msgs_medio: number;
  presos_30min: number;
}

interface EstagioFunil {
  id: string;
  nome: string;
  qtd_clientes: number;
  presos_30min: number;
  breakdown: StepBreakdown[];
}

interface FunilData {
  timestamp: string;
  saude: {
    total_clientes_ativos: number;
    total_presos_30min: number;
    taxa_presos_pct: number;
    ultimo_smoke_e2e: { em: string; ok: boolean; ha_horas: number } | null;
  };
  funil: EstagioFunil[];
  outros_steps: StepBreakdown[];
  todos_steps: StepBreakdown[];
}

export default function FunilImuniPage() {
  const [data, setData] = useState<FunilData | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Lazy init: le sessionStorage 1x na inicializacao (evita setState dentro
  // de useEffect — eslint custom react-hooks/set-state-in-effect).
  const [adminKey, setAdminKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("admin_key") || "";
  });
  const [keyConfirmada, setKeyConfirmada] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !!sessionStorage.getItem("admin_key");
  });

  const carregar = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch(`/api/admin-imuni-funil?key=${encodeURIComponent(adminKey)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErro(j.error || `HTTP ${r.status}`);
        setLoading(false);
        return;
      }
      const j = (await r.json()) as FunilData;
      setData(j);
      setLoading(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    if (!keyConfirmada) return;
    // Microtask defer pra evitar setState sincrono dentro do effect
    // (regra eslint react-hooks/set-state-in-effect).
    const t0 = setTimeout(() => { void carregar(); }, 0);
    const interval = setInterval(() => { void carregar(); }, 30000);
    return () => {
      clearTimeout(t0);
      clearInterval(interval);
    };
  }, [keyConfirmada, carregar]);

  if (!keyConfirmada) {
    return (
      <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
        <div className="max-w-md w-full">
          <h1 className="text-2xl font-bold mb-4">Funil IMUNI</h1>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Senha admin"
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded mb-3"
            autoFocus
          />
          <button
            onClick={() => {
              sessionStorage.setItem("admin_key", adminKey);
              setKeyConfirmada(true);
            }}
            className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-500 rounded font-medium"
          >
            Entrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/admin/imuni" className="text-zinc-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Funil IMUNI — gargalos do fluxo</h1>
              <p className="text-sm text-zinc-400">
                Onde clientes estao AGORA. Atualizado {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString("pt-BR") : "—"}.
              </p>
            </div>
          </div>
          <button
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {erro && (
          <div className="bg-red-950 border border-red-800 rounded p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-red-300">Erro ao carregar</div>
              <div className="text-sm text-red-400 mt-1">{erro}</div>
            </div>
          </div>
        )}

        {data && (
          <>
            {/* Saude geral */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-zinc-900 rounded p-4">
                <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                  <Users className="w-4 h-4" /> Clientes ativos (24h)
                </div>
                <div className="text-3xl font-bold">{data.saude.total_clientes_ativos}</div>
              </div>
              <div className="bg-zinc-900 rounded p-4">
                <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                  <Clock className="w-4 h-4" /> Presos &gt;30min
                </div>
                <div className={`text-3xl font-bold ${data.saude.total_presos_30min > 0 ? "text-amber-400" : "text-green-400"}`}>
                  {data.saude.total_presos_30min}
                </div>
              </div>
              <div className="bg-zinc-900 rounded p-4">
                <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                  <Activity className="w-4 h-4" /> Taxa de presos
                </div>
                <div className={`text-3xl font-bold ${data.saude.taxa_presos_pct > 10 ? "text-red-400" : data.saude.taxa_presos_pct > 5 ? "text-amber-400" : "text-green-400"}`}>
                  {data.saude.taxa_presos_pct}%
                </div>
              </div>
              <div className="bg-zinc-900 rounded p-4">
                <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                  Smoke E2E
                </div>
                {data.saude.ultimo_smoke_e2e ? (
                  <div className="flex items-center gap-2">
                    {data.saude.ultimo_smoke_e2e.ok ? (
                      <CheckCircle className="w-6 h-6 text-green-400" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-red-400" />
                    )}
                    <div>
                      <div className="text-sm font-medium">{data.saude.ultimo_smoke_e2e.ok ? "OK" : "FALHOU"}</div>
                      <div className="text-xs text-zinc-400">ha {data.saude.ultimo_smoke_e2e.ha_horas}h</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-zinc-500 text-sm">nunca rodou</div>
                )}
              </div>
            </div>

            {/* Funil agregado */}
            <h2 className="text-lg font-bold mb-3">Funil de atendimento</h2>
            <div className="space-y-3 mb-6">
              {data.funil.map((estagio) => {
                const max = Math.max(...data.funil.map((e) => e.qtd_clientes), 1);
                const pct = (estagio.qtd_clientes / max) * 100;
                return (
                  <div key={estagio.id} className="bg-zinc-900 rounded p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">{estagio.nome}</div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-zinc-400">{estagio.qtd_clientes} cliente{estagio.qtd_clientes !== 1 ? "s" : ""}</span>
                        {estagio.presos_30min > 0 && (
                          <span className="text-amber-400">⚠ {estagio.presos_30min} preso{estagio.presos_30min !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                    </div>
                    <div className="bg-zinc-800 rounded h-3 overflow-hidden">
                      <div
                        className={`h-full transition-all ${estagio.presos_30min > 0 ? "bg-amber-500" : "bg-amber-700"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {estagio.breakdown.length > 0 && (
                      <details className="mt-3">
                        <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">
                          {estagio.breakdown.length} step{estagio.breakdown.length !== 1 ? "s" : ""} interno{estagio.breakdown.length !== 1 ? "s" : ""}
                        </summary>
                        <div className="mt-2 space-y-1 text-xs">
                          {estagio.breakdown.map((s) => (
                            <div key={s.step} className="flex justify-between text-zinc-400">
                              <span className="font-mono">{s.step}</span>
                              <span>
                                {s.qtd_clientes} cli · medio {s.tempo_medio_min}min · max {s.tempo_max_min}min
                                {s.presos_30min > 0 ? ` · ⚠${s.presos_30min} presos` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Outros steps */}
            {data.outros_steps.length > 0 && (
              <details className="bg-zinc-900 rounded p-4 mb-4">
                <summary className="cursor-pointer font-medium">Outros steps ({data.outros_steps.length})</summary>
                <div className="mt-3 space-y-1 text-xs text-zinc-400">
                  {data.outros_steps.map((s) => (
                    <div key={s.step} className="flex justify-between">
                      <span className="font-mono">{s.step}</span>
                      <span>{s.qtd_clientes} cli · medio {s.tempo_medio_min}min</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
