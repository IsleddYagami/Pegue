"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, RefreshCw, MapPin, User, Truck, DollarSign, Camera,
  CheckCircle, XCircle, Clock, AlertCircle, Star,
} from "lucide-react";

interface Corrida {
  id: string;
  codigo: string;
  status: string;
  criado_em: string;
  pago_em: string | null;
  entrega_em: string | null;
  cliente: { nome: string; telefone: string };
  fretista: { nome: string; telefone: string } | null;
  rota: { origem: string; destino: string; km: number };
  carga: { descricao: string; veiculo: string; ajudantes: number };
  data_servico: string;
  valores: { cliente: number; fretista: number; pegue: number };
  fotos: { coleta: string[]; entrega: string[] };
  pagamento: { metodo: string; status: string; repasse: string; pago_em: string | null } | null;
  avaliacao: { nota: number; comentario: string } | null;
  rastreio_ativo: boolean;
  motivo_cancelamento: string | null;
}

interface Stats {
  total_periodo: number;
  hoje: number;
  ativas: number;
  concluidas: number;
  canceladas: number;
  receita_periodo_brl: number;
  comissao_pegue_brl: number;
  repasse_fretistas_brl: number;
  repasses_pendentes: number;
  avaliacao_media: number | null;
}

const STATUS_LABELS: Record<string, { label: string; cor: string; emoji: string }> = {
  pendente: { label: "Pendente", cor: "bg-yellow-500/20 text-yellow-300", emoji: "⏳" },
  aceita: { label: "Aceita (aguardando pagamento)", cor: "bg-orange-500/20 text-orange-300", emoji: "💳" },
  paga: { label: "Paga (em coleta/entrega)", cor: "bg-blue-500/20 text-blue-300", emoji: "🚚" },
  concluida: { label: "Concluída ✅", cor: "bg-green-500/20 text-green-300", emoji: "✅" },
  cancelada: { label: "Cancelada", cor: "bg-red-500/20 text-red-300", emoji: "❌" },
  cancelada_teste: { label: "Cancelada (teste)", cor: "bg-gray-500/20 text-gray-400", emoji: "🧪" },
  problema: { label: "Problema", cor: "bg-pink-500/20 text-pink-300", emoji: "🚨" },
};

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatTel(t?: string) {
  if (!t) return "—";
  const d = t.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return t;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function OperacaoRealPage() {
  const [adminKey, setAdminKey] = useState("");
  const [logado, setLogado] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [corridas, setCorridas] = useState<Corrida[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoUpdate, setUltimoUpdate] = useState<Date | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [dias, setDias] = useState<number>(7);
  const [corridaExpandida, setCorridaExpandida] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const carregar = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch(`/api/admin-operacao?key=${encodeURIComponent(adminKey)}&dias=${dias}`);
      const data = await r.json();
      if (!r.ok) {
        setErro(data.error || "erro desconhecido");
        if (r.status === 401) setLogado(false);
        return;
      }
      setStats(data.stats);
      setCorridas(data.corridas);
      setUltimoUpdate(new Date());
      setLogado(true);
    } catch (e: any) {
      setErro("erro de rede: " + e?.message);
    } finally {
      setLoading(false);
    }
  }, [adminKey, dias]);

  useEffect(() => {
    if (logado && autoRefresh) {
      const i = setInterval(carregar, 30000); // refresh 30s
      return () => clearInterval(i);
    }
  }, [logado, autoRefresh, carregar]);

  async function executarAcao(acao: string, corrida_id: string, motivo?: string) {
    const r = await fetch("/api/admin-operacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: adminKey, acao, corrida_id, motivo }),
    });
    const data = await r.json();
    if (!r.ok) {
      alert("Erro: " + (data.error || "desconhecido"));
      return;
    }
    await carregar();
  }

  if (!logado) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold">Operação Pegue <span className="text-[#C9A84C]">— ao vivo</span></h1>
            <p className="text-sm text-gray-400 mt-2">Insira a ADMIN_KEY pra acessar</p>
          </div>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="ADMIN_KEY"
            className="w-full rounded-lg bg-[#0A0A0A] border border-[#C9A84C]/30 px-4 py-3 text-white"
            onKeyDown={(e) => e.key === "Enter" && carregar()}
          />
          <button
            onClick={carregar}
            disabled={loading}
            className="w-full rounded-lg bg-[#C9A84C] text-black font-bold py-3 hover:bg-[#C9A84C]/90 disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Entrar"}
          </button>
          {erro && <p className="text-red-400 text-sm text-center">{erro}</p>}
          <Link href="/admin" className="block text-center text-sm text-gray-400 hover:text-[#C9A84C]">
            ← Voltar pro Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const corridasFiltradas =
    filtroStatus === "todos" ? corridas : corridas.filter((c) => c.status === filtroStatus);

  return (
    <div className="min-h-screen bg-black text-white p-3 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-1 text-sm text-gray-400 hover:text-[#C9A84C]">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <div>
            <h1 className="text-xl font-bold">
              Operação <span className="text-[#C9A84C]">ao vivo</span>
            </h1>
            <p className="text-xs text-gray-500">
              {ultimoUpdate ? `Atualizado às ${ultimoUpdate.toLocaleTimeString("pt-BR")}` : ""}
              {autoRefresh && " (refresh a cada 30s)"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="bg-[#0A0A0A] border border-[#C9A84C]/30 rounded px-2 py-1 text-sm"
          >
            <option value={1}>Hoje</option>
            <option value={3}>3 dias</option>
            <option value={7}>7 dias</option>
            <option value={15}>15 dias</option>
            <option value={30}>30 dias</option>
          </select>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`text-xs px-2 py-1 rounded ${autoRefresh ? "bg-green-500/20 text-green-300" : "bg-gray-500/20 text-gray-400"}`}
          >
            Auto-refresh: {autoRefresh ? "ON" : "OFF"}
          </button>
          <button
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-1 text-xs px-3 py-1 rounded bg-[#C9A84C] text-black font-bold hover:bg-[#C9A84C]/90 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
      </div>

      {erro && (
        <div className="mb-4 rounded bg-red-500/20 text-red-300 px-3 py-2 text-sm">⚠️ {erro}</div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="mb-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          <Card label="Hoje" valor={stats.hoje} sub={`${stats.total_periodo} no periodo`} />
          <Card label="Ativas" valor={stats.ativas} sub="em andamento" cor="text-blue-300" />
          <Card label="Concluídas" valor={stats.concluidas} sub={formatBRL(stats.receita_periodo_brl)} cor="text-green-300" />
          <Card
            label="Repasses pendentes"
            valor={stats.repasses_pendentes}
            sub={formatBRL(stats.repasse_fretistas_brl)}
            cor="text-yellow-300"
          />
          <Card
            label="Avaliação média"
            valor={stats.avaliacao_media !== null ? `⭐ ${stats.avaliacao_media}` : "—"}
            sub={`${stats.canceladas} canceladas`}
            cor="text-purple-300"
          />
        </div>
      )}

      {/* Filtros */}
      <div className="mb-3 flex flex-wrap gap-1">
        {["todos", "pendente", "aceita", "paga", "concluida", "cancelada"].map((s) => (
          <button
            key={s}
            onClick={() => setFiltroStatus(s)}
            className={`text-xs px-2 py-1 rounded ${
              filtroStatus === s
                ? "bg-[#C9A84C] text-black font-bold"
                : "bg-[#0A0A0A] text-gray-400 border border-[#C9A84C]/20"
            }`}
          >
            {s === "todos" ? "Todos" : STATUS_LABELS[s]?.label || s} (
            {s === "todos" ? corridas.length : corridas.filter((c) => c.status === s).length})
          </button>
        ))}
      </div>

      {/* Corridas */}
      <div className="space-y-2">
        {corridasFiltradas.length === 0 && (
          <div className="text-center text-gray-500 py-8 text-sm">Nenhuma corrida nesse filtro/período</div>
        )}
        {corridasFiltradas.map((c) => {
          const st = STATUS_LABELS[c.status] || { label: c.status, cor: "bg-gray-500/20 text-gray-300", emoji: "?" };
          const expandida = corridaExpandida === c.id;
          return (
            <div key={c.id} className="rounded-lg bg-[#0A0A0A] border border-[#C9A84C]/10 overflow-hidden">
              <button
                onClick={() => setCorridaExpandida(expandida ? null : c.id)}
                className="w-full p-3 text-left hover:bg-[#C9A84C]/5"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${st.cor}`}>
                        {st.emoji} {st.label}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">{c.codigo}</span>
                      <span className="text-xs text-gray-500">{formatDate(c.criado_em)}</span>
                    </div>
                    <div className="text-sm flex items-center gap-2">
                      <User className="h-3 w-3 text-gray-400" />
                      <span className="text-gray-300">{c.cliente.nome}</span>
                      <span className="text-gray-600">•</span>
                      <span className="text-gray-400 text-xs">{formatTel(c.cliente.telefone)}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 truncate">
                      <MapPin className="inline h-3 w-3 mr-1" />
                      {c.rota.origem} → {c.rota.destino}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="text-right">
                      <div className="text-[#C9A84C] font-bold">{formatBRL(c.valores.cliente)}</div>
                      <div className="text-xs text-gray-500">
                        Pegue: {formatBRL(c.valores.pegue)}
                      </div>
                    </div>
                    {c.fretista && (
                      <div className="hidden md:flex items-center gap-1 text-xs text-gray-400">
                        <Truck className="h-3 w-3" />
                        {c.fretista.nome.split(" ")[0]}
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {expandida && (
                <div className="border-t border-[#C9A84C]/10 p-3 space-y-3 text-sm">
                  {/* Detalhes */}
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <h4 className="text-xs text-gray-500 mb-1">Cliente</h4>
                      <p>{c.cliente.nome}</p>
                      <p className="text-xs text-gray-400">{formatTel(c.cliente.telefone)}</p>
                    </div>
                    <div>
                      <h4 className="text-xs text-gray-500 mb-1">Fretista</h4>
                      {c.fretista ? (
                        <>
                          <p>{c.fretista.nome}</p>
                          <p className="text-xs text-gray-400">{formatTel(c.fretista.telefone)}</p>
                        </>
                      ) : (
                        <p className="text-gray-500 italic">— ainda não pegou</p>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs text-gray-500 mb-1">Rota</h4>
                      <p className="text-xs">📍 {c.rota.origem}</p>
                      <p className="text-xs">🏠 {c.rota.destino}</p>
                      <p className="text-xs text-gray-500">{c.rota.km} km · {c.carga.veiculo}</p>
                    </div>
                    <div>
                      <h4 className="text-xs text-gray-500 mb-1">Carga</h4>
                      <p className="text-xs">{c.carga.descricao}</p>
                      <p className="text-xs text-gray-500">
                        {c.carga.ajudantes > 0 ? `${c.carga.ajudantes} ajudante(s)` : "Sem ajudante"}
                      </p>
                    </div>
                  </div>

                  {/* Valores */}
                  <div>
                    <h4 className="text-xs text-gray-500 mb-1">Valores</h4>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-blue-500/10 rounded p-2">
                        <div className="text-gray-400">Cliente</div>
                        <div className="font-bold text-blue-300">{formatBRL(c.valores.cliente)}</div>
                      </div>
                      <div className="bg-green-500/10 rounded p-2">
                        <div className="text-gray-400">Fretista (88%)</div>
                        <div className="font-bold text-green-300">{formatBRL(c.valores.fretista)}</div>
                      </div>
                      <div className="bg-[#C9A84C]/10 rounded p-2">
                        <div className="text-gray-400">Pegue (12%)</div>
                        <div className="font-bold text-[#C9A84C]">{formatBRL(c.valores.pegue)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Pagamento */}
                  {c.pagamento && (
                    <div>
                      <h4 className="text-xs text-gray-500 mb-1">Pagamento</h4>
                      <div className="text-xs space-x-2">
                        <span className="bg-gray-700 rounded px-2 py-0.5">{c.pagamento.metodo}</span>
                        <span className={c.pagamento.status === "aprovado" ? "text-green-300" : "text-yellow-300"}>
                          {c.pagamento.status}
                        </span>
                        <span className="text-gray-500">
                          Repasse fretista:{" "}
                          <span className={c.pagamento.repasse === "pago" ? "text-green-300" : "text-yellow-300"}>
                            {c.pagamento.repasse}
                          </span>
                        </span>
                        {c.pagamento.pago_em && (
                          <span className="text-gray-500">pago {formatDate(c.pagamento.pago_em)}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Fotos coleta + entrega */}
                  {(c.fotos.coleta.length > 0 || c.fotos.entrega.length > 0) && (
                    <div>
                      <h4 className="text-xs text-gray-500 mb-1">
                        <Camera className="inline h-3 w-3 mr-1" />
                        Fotos · Coleta {c.fotos.coleta.length} · Entrega {c.fotos.entrega.length}
                      </h4>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {c.fotos.coleta.map((url, i) => (
                          <a key={`c${i}`} href={url} target="_blank" rel="noreferrer" className="shrink-0">
                            <img
                              src={url}
                              alt="coleta"
                              className="h-20 w-20 object-cover rounded border-2 border-blue-500/40"
                            />
                          </a>
                        ))}
                        {c.fotos.entrega.map((url, i) => (
                          <a key={`e${i}`} href={url} target="_blank" rel="noreferrer" className="shrink-0">
                            <img
                              src={url}
                              alt="entrega"
                              className="h-20 w-20 object-cover rounded border-2 border-green-500/40"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Avaliação */}
                  {c.avaliacao && (
                    <div>
                      <h4 className="text-xs text-gray-500 mb-1">
                        <Star className="inline h-3 w-3 mr-1" /> Avaliação cliente
                      </h4>
                      <p className="text-yellow-300 font-bold">⭐ {c.avaliacao.nota}/5</p>
                      {c.avaliacao.comentario && (
                        <p className="text-xs text-gray-400 mt-1 italic">"{c.avaliacao.comentario}"</p>
                      )}
                    </div>
                  )}

                  {c.motivo_cancelamento && (
                    <div className="bg-red-500/10 rounded p-2 text-xs">
                      <span className="text-red-300 font-bold">Motivo:</span> {c.motivo_cancelamento}
                    </div>
                  )}

                  {/* Ações admin */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[#C9A84C]/10">
                    {c.pagamento?.repasse === "pendente" && (
                      <button
                        onClick={() => {
                          if (confirm(`Marcar repasse de ${formatBRL(c.valores.fretista)} como PAGO ao fretista?`)) {
                            executarAcao("marcar_repasse_pago", c.id);
                          }
                        }}
                        className="text-xs px-3 py-1 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30"
                      >
                        ✓ Marcar repasse PAGO
                      </button>
                    )}
                    {["pendente", "aceita", "paga"].includes(c.status) && (
                      <button
                        onClick={() => {
                          const motivo = prompt("Motivo do cancelamento:");
                          if (motivo) executarAcao("cancelar_corrida", c.id, motivo);
                        }}
                        className="text-xs px-3 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                      >
                        ✗ Cancelar corrida
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        if (!confirm(`ASSUMIR conversa com ${c.cliente.nome}?\n\nBot vai ficar CALADO. Você responde manualmente pelo WhatsApp da Pegue.\n\nTelefone do cliente: ${c.cliente.telefone}`)) return;
                        const r = await fetch("/api/admin-operacao", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ key: adminKey, acao: "assumir_conversa", corrida_id: c.id, phone: c.cliente.telefone }),
                        });
                        const data = await r.json();
                        if (!r.ok) { alert("Erro: " + (data.error || "?")); return; }
                        alert("✅ Bot calado. Pode falar com o cliente pelo WhatsApp da Pegue.");
                        await carregar();
                      }}
                      className="text-xs px-3 py-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                    >
                      🎙️ Assumir conversa (bot cala)
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Devolver conversa pro BOT?\n\nCliente vai precisar mandar OI pra recomecar o fluxo.`)) return;
                        const r = await fetch("/api/admin-operacao", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ key: adminKey, acao: "devolver_bot", corrida_id: c.id, phone: c.cliente.telefone }),
                        });
                        const data = await r.json();
                        if (!r.ok) { alert("Erro: " + (data.error || "?")); return; }
                        alert("✅ Bot reativado pra esse cliente. Quando ele mandar OI vai retomar o fluxo.");
                        await carregar();
                      }}
                      className="text-xs px-3 py-1 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                    >
                      🤖 Devolver pro bot
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({
  label, valor, sub, cor,
}: {
  label: string;
  valor: number | string;
  sub?: string;
  cor?: string;
}) {
  return (
    <div className="rounded-lg bg-[#0A0A0A] border border-[#C9A84C]/10 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${cor || "text-white"}`}>{valor}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}
