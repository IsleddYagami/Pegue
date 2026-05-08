"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Loader2, Search, MessageCircle, AlertCircle } from "lucide-react";

interface ConversaMsg {
  conteudo: string;
  direcao: string;
  tipo: string;
  criado_em: string;
}
interface Sessao {
  phone: string;
  step: string;
  origem_endereco: string | null;
  destino_endereco: string | null;
  descricao_carga: string | null;
  veiculo_sugerido: string | null;
  distancia_km: number | null;
  valor_estimado: number | null;
  data_agendada: string | null;
  atualizado_em: string;
  msgs_contador: number;
}
interface Cliente {
  id: string;
  nome: string | null;
  telefone: string;
  total_corridas: number | null;
}
interface LogEvento {
  ts: string;
  tipo: string;
  payload: Record<string, unknown>;
}
interface DadosCliente {
  phone_buscado: string;
  sessao: Sessao | null;
  cliente: Cliente | null;
  conversas: ConversaMsg[];
  logs: LogEvento[];
}

export default function ConversaClienteAoVivo() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneAtivo, setPhoneAtivo] = useState<string | null>(null);
  const [dados, setDados] = useState<DadosCliente | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const carregar = useCallback(async (key: string, phone: string) => {
    if (!phone) return;
    setLoading(true);
    setErro("");
    try {
      const res = await fetch(
        `/api/admin-conversa-cliente?key=${encodeURIComponent(key)}&phone=${encodeURIComponent(phone)}`,
      );
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
      const j = await res.json();
      setDados(j);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("admin_key");
    if (stored) setAdminKey(stored);
  }, []);

  // Auto refresh a cada 5s quando phone ativo
  useEffect(() => {
    if (!autoRefresh || !adminKey || !phoneAtivo) return;
    const id = setInterval(() => {
      carregar(adminKey, phoneAtivo);
    }, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, adminKey, phoneAtivo, carregar]);

  const handleLogin = () => {
    if (!keyInput) return;
    sessionStorage.setItem("admin_key", keyInput);
    setAdminKey(keyInput);
  };

  const handleBuscar = () => {
    if (!phoneInput || !adminKey) return;
    setPhoneAtivo(phoneInput);
    carregar(adminKey, phoneInput);
  };

  if (!adminKey) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900 rounded-xl p-8 border border-gray-800">
          <h1 className="text-2xl font-bold mb-4">Conversa do Cliente Ao Vivo</h1>
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

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin" className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Conversa do Cliente Ao Vivo</h1>
            <p className="text-gray-400 text-sm">
              Veja em tempo real o que o bot tá respondendo pra qualquer cliente
            </p>
          </div>
        </div>

        {/* BUSCA */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
          <div className="flex flex-col md:flex-row gap-2">
            <input
              type="text"
              placeholder="Telefone do cliente (ex: 11994207932 ou 5511994207932)"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:border-orange-500"
            />
            <button
              onClick={handleBuscar}
              disabled={loading || !phoneInput}
              className="bg-orange-500 hover:bg-orange-600 rounded-lg px-6 py-3 font-medium flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </button>
          </div>
          {phoneAtivo && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <div className="text-gray-400">
                Acompanhando: <span className="text-white font-mono">{phoneAtivo}</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                <span className="text-gray-400">Atualizar a cada 5s</span>
              </label>
            </div>
          )}
        </div>

        {erro && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4 text-red-200 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {erro}
          </div>
        )}

        {dados && (
          <>
            {/* SESSAO */}
            {dados.sessao && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 text-sm">
                <h2 className="font-bold mb-2 text-orange-400">Estado da sessão</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 font-mono text-xs">
                  <Field label="step" value={dados.sessao.step} />
                  <Field label="msgs_contador" value={String(dados.sessao.msgs_contador || 0)} />
                  <Field label="atualizado" value={new Date(dados.sessao.atualizado_em).toLocaleString("pt-BR")} />
                  <Field label="origem" value={dados.sessao.origem_endereco || "—"} grande />
                  <Field label="destino" value={dados.sessao.destino_endereco || "—"} grande />
                  <Field label="descricao_carga" value={dados.sessao.descricao_carga || "—"} grande />
                  <Field label="veiculo" value={dados.sessao.veiculo_sugerido || "—"} />
                  <Field label="valor_estimado" value={dados.sessao.valor_estimado ? `R$ ${dados.sessao.valor_estimado}` : "—"} />
                  <Field label="data_agendada" value={dados.sessao.data_agendada || "—"} />
                </div>
              </div>
            )}

            {/* CLIENTE */}
            {dados.cliente && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 text-sm">
                <h2 className="font-bold mb-2 text-orange-400">Cliente</h2>
                <div className="text-xs">
                  <span className="text-gray-400">Nome:</span> {dados.cliente.nome || "—"} ·{" "}
                  <span className="text-gray-400">Total corridas:</span> {dados.cliente.total_corridas || 0}
                </div>
              </div>
            )}

            {!dados.sessao && !dados.cliente && (
              <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 mb-4 text-yellow-200 text-sm">
                Nenhuma sessão/cliente encontrado pra esse telefone. Confere o número.
              </div>
            )}

            {/* CONVERSA */}
            {dados.conversas.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
                <h2 className="font-bold mb-3 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-orange-400" />
                  Conversa ({dados.conversas.length} msgs)
                </h2>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {dados.conversas.map((m, i) => (
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
                          {m.direcao === "in" ? "Cliente →" : "← Bot"} •{" "}
                          {new Date(m.criado_em).toLocaleString("pt-BR")} • {m.tipo}
                        </div>
                        <div className="text-sm whitespace-pre-wrap">{m.conteudo}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LOGS RELEVANTES */}
            {dados.logs.length > 0 && (
              <details className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <summary className="font-bold cursor-pointer text-orange-400">
                  Logs internos ({dados.logs.length})
                </summary>
                <div className="mt-3 space-y-1 max-h-[400px] overflow-y-auto text-xs font-mono">
                  {dados.logs.map((l, i) => (
                    <div key={i} className="border-b border-gray-800 pb-1">
                      <div className="text-gray-500">{new Date(l.ts).toLocaleString("pt-BR")}</div>
                      <div className="text-yellow-400">{l.tipo}</div>
                      <div className="text-gray-400 break-all">
                        {JSON.stringify(l.payload).slice(0, 200)}
                      </div>
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

function Field({ label, value, grande }: { label: string; value: string; grande?: boolean }) {
  return (
    <div className={`bg-gray-950 rounded p-2 ${grande ? "md:col-span-2" : ""}`}>
      <div className="text-gray-500">{label}</div>
      <div className={grande ? "" : "truncate"}>{value}</div>
    </div>
  );
}
