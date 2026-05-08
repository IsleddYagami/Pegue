"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2, XCircle, ArrowLeft, RefreshCw, Loader2,
  Activity, Wrench, Bug, MessageCircle, AlertTriangle,
} from "lucide-react";

interface SmokeRun {
  ts: string;
  ok: boolean;
  duracao_ms?: number;
  qtd_total?: number;
  qtd_ok?: number;
  qtd_falhas?: number;
  motivo?: string;
  detalhes?: Array<{
    step?: string;
    cenario?: string;
    ok: boolean;
    esperado?: string;
    obtido?: string;
    erro?: string;
  }>;
}

interface SelfHealRun {
  ts: string;
  duracao_ms?: number;
  total_corrigido?: number;
  resultados?: Array<{
    acao: string;
    qtd_corrigida: number;
    detalhes?: unknown;
  }>;
}

interface EventoImuni {
  ts: string;
  tipo: string;
  payload: Record<string, unknown>;
}

interface ConversaMsg {
  conteudo: string;
  direcao: string;
  tipo: string;
  criado_em: string;
}

interface MetricaEtapa {
  label: string;
  sucesso_100: number;
  com_falhas: number;
  taxa_sucesso_pct: number;
}

interface DashboardData {
  gerado_em: string;
  metricas_etapas?: {
    total_execucoes: number;
    etapa1_cotacao: MetricaEtapa;
    etapa2_pagamento_repasse: MetricaEtapa;
  };
  metricas_adversarial?: {
    total_execucoes: number;
    sucesso_100: number;
    com_falhas: number;
    taxa_sucesso_pct: number;
  };
  smoke_feliz: { ultima_execucao: string | null; ultimas_runs: SmokeRun[] };
  smoke_adversarial: { ultima_execucao: string | null; ultimas_runs: SmokeRun[] };
  self_heal: { ultima_execucao: string | null; ultimas_runs: SelfHealRun[] };
  eventos: EventoImuni[];
  conversa_smoke: ConversaMsg[];
}

function tempoRelativo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "agora";
  const seg = Math.floor(ms / 1000);
  if (seg < 60) return `há ${seg}s`;
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function formatarDuracao(ms: number | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ImuniSmokePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [tab, setTab] = useState<"resumo" | "feliz" | "adversarial" | "self_heal" | "conversa" | "eventos">(
    "resumo",
  );

  const carregar = useCallback(async (key: string) => {
    setLoading(true);
    setErro("");
    try {
      const res = await fetch(`/api/admin-imuni-dashboard?key=${encodeURIComponent(key)}`);
      if (res.status === 401) {
        sessionStorage.removeItem("admin_key");
        setAdminKey(null);
        setErro("Senha incorreta");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setErro(`erro ${res.status}`);
        setLoading(false);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("admin_key");
    if (stored) {
      setAdminKey(stored);
      void carregar(stored);
    }
  }, [carregar]);

  const handleLogin = () => {
    if (!keyInput) return;
    sessionStorage.setItem("admin_key", keyInput);
    setAdminKey(keyInput);
    void carregar(keyInput);
  };

  if (!adminKey) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900 rounded-xl p-8 border border-gray-800">
          <h1 className="text-2xl font-bold mb-4">IMUNI Smoke Dashboard</h1>
          <p className="text-gray-400 mb-6 text-sm">Acesso restrito a admins.</p>
          <input
            type="password"
            placeholder="Senha admin"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-4 focus:outline-none focus:border-orange-500"
            autoFocus
          />
          {erro && <p className="text-red-400 text-sm mb-3">{erro}</p>}
          <button
            onClick={handleLogin}
            className="w-full bg-orange-500 hover:bg-orange-600 rounded-lg px-4 py-3 font-medium"
          >
            Entrar
          </button>
        </div>
      </div>
    );
  }

  const ultimaFeliz = data?.smoke_feliz.ultimas_runs[0];
  const ultimaAdv = data?.smoke_adversarial.ultimas_runs[0];
  const ultimaHeal = data?.self_heal.ultimas_runs[0];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">IMUNI Smoke Dashboard</h1>
              <p className="text-gray-400 text-sm">
                Sentinelas testando o fluxo do bot continuamente
              </p>
            </div>
          </div>
          <button
            onClick={() => adminKey && carregar(adminKey)}
            disabled={loading}
            className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-2 flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Atualizar
          </button>
        </div>

        {erro && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6 text-red-200">
            {erro}
          </div>
        )}

        {data && (
          <>
            {/* MÉTRICAS POR ETAPA */}
            {data.metricas_etapas && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold">Taxa de sucesso por etapa</h2>
                  <span className="text-xs text-gray-400">
                    {data.metricas_etapas.total_execucoes} execuções nos últimos 7 dias
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <CardEtapa
                    titulo="Etapa 1 — Cotação"
                    descricao="Cliente diz 'oi' até confirmar termos"
                    metrica={data.metricas_etapas.etapa1_cotacao}
                  />
                  <CardEtapa
                    titulo="Etapa 2 — Pagamento até repasse"
                    descricao="Aceite termos → paga → fretista → entrega → PIX"
                    metrica={data.metricas_etapas.etapa2_pagamento_repasse}
                  />
                </div>
                {data.metricas_adversarial && (
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <CardEtapa
                      titulo="Smoke Adversarial — Cliente caótico"
                      descricao="11 cenários de cliente real (rajada, IFSP, gírias, etc)"
                      metrica={{
                        label: "",
                        sucesso_100: data.metricas_adversarial.sucesso_100,
                        com_falhas: data.metricas_adversarial.com_falhas,
                        taxa_sucesso_pct: data.metricas_adversarial.taxa_sucesso_pct,
                      }}
                      total={data.metricas_adversarial.total_execucoes}
                    />
                  </div>
                )}
              </div>
            )}

            {/* CARDS RESUMO */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <CardSentinela
                titulo="Smoke Feliz"
                desc="Cliente '1, 1, 1' — fluxo completo cota→paga→entrega→repasse"
                icone={<CheckCircle2 className="w-5 h-5" />}
                run={ultimaFeliz}
                onClick={() => setTab("feliz")}
              />
              <CardSentinela
                titulo="Smoke Adversarial"
                desc="Cliente caótico real (rajada, IFSP, gírias, fora de ordem)"
                icone={<Bug className="w-5 h-5" />}
                run={ultimaAdv}
                onClick={() => setTab("adversarial")}
              />
              <CardSelfHeal run={ultimaHeal} onClick={() => setTab("self_heal")} />
            </div>

            {/* TABS */}
            <div className="flex gap-1 border-b border-gray-800 mb-4 overflow-x-auto">
              {[
                { id: "resumo", label: "Resumo" },
                { id: "feliz", label: "Smoke Feliz" },
                { id: "adversarial", label: "Adversarial" },
                { id: "self_heal", label: "Self-Heal" },
                { id: "conversa", label: "Conversa do bot smoke" },
                { id: "eventos", label: "Eventos" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id as never)}
                  className={`px-4 py-2 whitespace-nowrap text-sm border-b-2 ${
                    tab === t.id
                      ? "border-orange-500 text-white"
                      : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "resumo" && <Resumo data={data} />}
            {tab === "feliz" && <ListaSmoke runs={data.smoke_feliz.ultimas_runs} tipo="feliz" />}
            {tab === "adversarial" && (
              <ListaSmoke runs={data.smoke_adversarial.ultimas_runs} tipo="adversarial" />
            )}
            {tab === "self_heal" && <ListaSelfHeal runs={data.self_heal.ultimas_runs} />}
            {tab === "conversa" && <ConversaSmoke msgs={data.conversa_smoke} />}
            {tab === "eventos" && <ListaEventos eventos={data.eventos} />}
          </>
        )}
      </div>
    </div>
  );
}

function CardEtapa({
  titulo,
  descricao,
  metrica,
  total,
}: {
  titulo: string;
  descricao: string;
  metrica: MetricaEtapa;
  total?: number;
}) {
  const totalReal = total ?? metrica.sucesso_100 + metrica.com_falhas;
  const corTaxa =
    metrica.taxa_sucesso_pct >= 95
      ? "text-green-400"
      : metrica.taxa_sucesso_pct >= 80
        ? "text-yellow-400"
        : "text-red-400";
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-bold">{titulo}</h3>
          <p className="text-xs text-gray-400 mt-1">{descricao}</p>
        </div>
        <div className={`text-3xl font-bold ${corTaxa}`}>{metrica.taxa_sucesso_pct}%</div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="bg-gray-900 rounded p-2 text-center">
          <div className="text-xl font-bold">{totalReal}</div>
          <div className="text-xs text-gray-400">Tentativas</div>
        </div>
        <div className="bg-green-900/20 border border-green-900 rounded p-2 text-center">
          <div className="text-xl font-bold text-green-400">{metrica.sucesso_100}</div>
          <div className="text-xs text-gray-400">100% verde</div>
        </div>
        <div
          className={`${
            metrica.com_falhas > 0 ? "bg-red-900/20 border border-red-900" : "bg-gray-900"
          } rounded p-2 text-center`}
        >
          <div className={`text-xl font-bold ${metrica.com_falhas > 0 ? "text-red-400" : "text-gray-500"}`}>
            {metrica.com_falhas}
          </div>
          <div className="text-xs text-gray-400">Com falhas</div>
        </div>
      </div>
    </div>
  );
}

function CardSentinela({
  titulo,
  desc,
  icone,
  run,
  onClick,
}: {
  titulo: string;
  desc: string;
  icone: React.ReactNode;
  run?: SmokeRun;
  onClick: () => void;
}) {
  const verde = run?.ok;
  return (
    <button
      onClick={onClick}
      className={`text-left bg-gray-900 hover:bg-gray-800 border ${
        run ? (verde ? "border-green-700" : "border-red-700") : "border-gray-800"
      } rounded-xl p-5 transition`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icone}
          <h3 className="font-bold">{titulo}</h3>
        </div>
        {run &&
          (verde ? (
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          ) : (
            <XCircle className="w-5 h-5 text-red-400" />
          ))}
      </div>
      <p className="text-xs text-gray-400 mb-3">{desc}</p>
      {run ? (
        <>
          <div className="text-2xl font-bold mb-1">
            <span className={verde ? "text-green-400" : "text-red-400"}>
              {run.qtd_ok ?? 0}/{run.qtd_total ?? 0}
            </span>
          </div>
          <div className="text-xs text-gray-400">
            {tempoRelativo(run.ts)} • {formatarDuracao(run.duracao_ms)}
          </div>
        </>
      ) : (
        <p className="text-gray-500 text-sm">Ainda não rodou</p>
      )}
    </button>
  );
}

function CardSelfHeal({
  run,
  onClick,
}: {
  run?: SelfHealRun;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl p-5 transition"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5" />
          <h3 className="font-bold">Self-Heal</h3>
        </div>
        <Activity className="w-5 h-5 text-blue-400" />
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Auto-correção zero IA: sessões zumbi, locks órfãos, dispatch órfão
      </p>
      {run ? (
        <>
          <div className="text-2xl font-bold mb-1 text-blue-400">
            {run.total_corrigido ?? 0} corrigidos
          </div>
          <div className="text-xs text-gray-400">{tempoRelativo(run.ts)}</div>
        </>
      ) : (
        <p className="text-gray-500 text-sm">Ainda não rodou</p>
      )}
    </button>
  );
}

function Resumo({ data }: { data: DashboardData }) {
  const totalCorrigidos = data.self_heal.ultimas_runs.reduce(
    (acc, r) => acc + (r.total_corrigido || 0),
    0,
  );
  const eventosErro = data.eventos.filter(
    (e) => e.tipo === "webhook_handler_error",
  ).length;
  const eventosRollback = data.eventos.filter(
    (e) => e.tipo === "imuni_rollback_executado",
  ).length;
  const notificacoes = data.eventos.filter(
    (e) => e.tipo === "imuni_notificacao_enviada",
  ).length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h2 className="text-lg font-bold mb-4">Resumo das últimas 7 dias</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Smoke feliz runs" valor={data.smoke_feliz.ultimas_runs.length} />
        <Stat label="Adversarial runs" valor={data.smoke_adversarial.ultimas_runs.length} />
        <Stat label="Self-heal runs" valor={data.self_heal.ultimas_runs.length} />
        <Stat label="Total auto-corrigidos" valor={totalCorrigidos} cor="text-blue-400" />
        <Stat label="Erros webhook handler" valor={eventosErro} cor={eventosErro > 0 ? "text-red-400" : "text-gray-300"} />
        <Stat label="Auto-rollbacks" valor={eventosRollback} cor={eventosRollback > 0 ? "text-orange-400" : "text-gray-300"} />
        <Stat label="Notificações WhatsApp" valor={notificacoes} />
        <Stat label="Última atualização" valor={tempoRelativo(data.gerado_em)} pequeno />
      </div>
    </div>
  );
}

function Stat({
  label,
  valor,
  cor = "text-white",
  pequeno = false,
}: {
  label: string;
  valor: number | string;
  cor?: string;
  pequeno?: boolean;
}) {
  return (
    <div className="bg-gray-950 rounded-lg p-3">
      <div className={`${pequeno ? "text-base" : "text-2xl"} font-bold ${cor}`}>{valor}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
    </div>
  );
}

function ListaSmoke({ runs, tipo }: { runs: SmokeRun[]; tipo: "feliz" | "adversarial" }) {
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());

  if (runs.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-400">
        Nenhuma execução nos últimos 7 dias.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run, i) => {
        const aberto = expandidos.has(i);
        return (
          <div
            key={i}
            className={`bg-gray-900 border ${
              run.ok ? "border-green-900" : "border-red-900"
            } rounded-lg overflow-hidden`}
          >
            <button
              onClick={() => {
                const novo = new Set(expandidos);
                if (aberto) novo.delete(i);
                else novo.add(i);
                setExpandidos(novo);
              }}
              className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50"
            >
              <div className="flex items-center gap-3 text-left">
                {run.ok ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                )}
                <div>
                  <div className="font-medium">
                    {run.qtd_ok ?? 0}/{run.qtd_total ?? 0} {run.ok ? "verde" : "FALHOU"}
                    {run.motivo && (
                      <span className="text-red-400 text-sm ml-2">({run.motivo})</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(run.ts).toLocaleString("pt-BR")} • {formatarDuracao(run.duracao_ms)}
                  </div>
                </div>
              </div>
              <span className="text-gray-500 text-sm">{aberto ? "▲" : "▼"}</span>
            </button>
            {aberto && run.detalhes && (
              <div className="border-t border-gray-800 p-4 space-y-2">
                {run.detalhes.map((d, j) => (
                  <div
                    key={j}
                    className={`p-3 rounded text-sm ${
                      d.ok ? "bg-green-900/20 border border-green-900" : "bg-red-900/20 border border-red-900"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {d.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400" />
                      )}
                      <span className="font-mono text-xs">{d.step || d.cenario}</span>
                    </div>
                    {d.esperado && (
                      <div className="text-xs text-gray-400 ml-6">
                        <span className="text-gray-500">esperado:</span> {d.esperado}
                      </div>
                    )}
                    {d.obtido && (
                      <div className="text-xs text-gray-400 ml-6">
                        <span className="text-gray-500">obtido:</span>{" "}
                        <span className={d.ok ? "text-gray-300" : "text-red-300"}>{d.obtido}</span>
                      </div>
                    )}
                    {d.erro && (
                      <div className="text-xs text-red-400 ml-6 mt-1">⚠️ {d.erro}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ListaSelfHeal({ runs }: { runs: SelfHealRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-400">
        Nenhuma execução de self-heal ainda.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run, i) => (
        <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">
              <span className="text-blue-400">{run.total_corrigido ?? 0}</span> problemas corrigidos
            </div>
            <div className="text-xs text-gray-400">
              {new Date(run.ts).toLocaleString("pt-BR")} • {formatarDuracao(run.duracao_ms)}
            </div>
          </div>
          {run.resultados && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
              {run.resultados.map((r, j) => (
                <div
                  key={j}
                  className={`p-2 rounded text-xs ${
                    r.qtd_corrigida > 0 ? "bg-blue-900/20 border border-blue-900" : "bg-gray-950 border border-gray-800"
                  }`}
                >
                  <div className="font-mono">{r.acao}</div>
                  <div className={r.qtd_corrigida > 0 ? "text-blue-300" : "text-gray-500"}>
                    {r.qtd_corrigida} corrigidos
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ConversaSmoke({ msgs }: { msgs: ConversaMsg[] }) {
  if (msgs.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-400">
        <MessageCircle className="w-8 h-8 mx-auto mb-3 opacity-50" />
        Nenhuma conversa do cliente smoke registrada ainda.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-400 mb-4">
        Conversa entre o bot e o cliente fictício do smoke (5500000000001). Você vê
        exatamente o que o bot respondeu em cada teste.
      </p>
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.direcao === "in" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                m.direcao === "in"
                  ? "bg-green-700/30 border border-green-800"
                  : "bg-gray-800 border border-gray-700"
              }`}
            >
              <div className="text-xs text-gray-400 mb-1">
                {m.direcao === "in" ? "Cliente smoke →" : "← Bot"} •{" "}
                {new Date(m.criado_em).toLocaleString("pt-BR")}
              </div>
              <div className="text-sm whitespace-pre-wrap">{m.conteudo}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListaEventos({ eventos }: { eventos: EventoImuni[] }) {
  if (eventos.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-400">
        Nenhum evento IMUNI nos últimos 7 dias.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {eventos.map((e, i) => (
        <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {e.tipo === "imuni_rollback_executado" && (
                <AlertTriangle className="w-4 h-4 text-orange-400" />
              )}
              {e.tipo === "webhook_handler_error" && (
                <Bug className="w-4 h-4 text-red-400" />
              )}
              {e.tipo === "imuni_notificacao_enviada" && (
                <MessageCircle className="w-4 h-4 text-blue-400" />
              )}
              <span className="font-mono text-xs">{e.tipo}</span>
            </div>
            <div className="text-xs text-gray-400">
              {new Date(e.ts).toLocaleString("pt-BR")}
            </div>
          </div>
          <pre className="text-xs text-gray-500 overflow-x-auto">
            {JSON.stringify(e.payload, null, 2).slice(0, 500)}
          </pre>
        </div>
      ))}
    </div>
  );
}
