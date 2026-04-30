"use client";

import { useEffect, useState } from "react";
import { BookOpen, Check, X, FileText } from "lucide-react";

type Incidente = {
  id: string;
  phone_masked: string;
  ultimo_step: string;
  duracao_min: number | null;
  mensagens_qtd: number | null;
  resumo_msgs: string | null;
  diagnostico_ia: string | null;
  proposta_acao: string | null;
  status: string;
  criado_em: string;
};

function getAdminKey(): string | null {
  if (typeof window === "undefined") return null;
  let senha = sessionStorage.getItem("admin_key") || "";
  if (!senha) {
    senha = prompt("Digite a senha de admin:") || "";
    if (!senha) return null;
    sessionStorage.setItem("admin_key", senha);
  }
  return senha;
}

export default function AprendizadoPage() {
  const [incidentes, setIncidentes] = useState<Incidente[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("pendente");

  async function carregar() {
    setLoading(true);
    const senha = getAdminKey();
    if (!senha) {
      setErro("Senha de admin obrigatoria");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin-aprendizado?key=${encodeURIComponent(senha)}&status=${filtroStatus}`);
      if (res.status === 401) {
        sessionStorage.removeItem("admin_key");
        setErro("Senha incorreta. Recarregue.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setErro("Erro ao carregar");
        setLoading(false);
        return;
      }
      setIncidentes(await res.json());
    } catch {
      setErro("Erro de conexao");
    }
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus]);

  async function decidir(id: string, acao: "aprovar" | "rejeitar" | "aplicar") {
    const senha = sessionStorage.getItem("admin_key") || "";
    if (!senha) return;
    const observacao = acao === "rejeitar" ? prompt("Motivo (opcional):") || undefined : undefined;
    try {
      const res = await fetch(`/api/admin-aprendizado?key=${encodeURIComponent(senha)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao, observacao }),
      });
      if (!res.ok) {
        alert("Erro ao salvar");
        return;
      }
      setIncidentes((prev) => prev.filter((i) => i.id !== id));
    } catch {
      alert("Erro de conexao");
    }
  }

  if (loading) return <div className="p-6">Carregando...</div>;
  if (erro) return <div className="p-6 text-red-600">{erro}</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <BookOpen className="w-6 h-6" /> Aprendizado Constante
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Atendimentos nao concluidos analisados por IA. Aprovar = vira backlog de
        melhoria. Aplicar = ja foi corrigido.
      </p>

      <div className="flex gap-2 mb-4">
        {["pendente", "aprovado", "rejeitado", "aplicado"].map((st) => (
          <button
            key={st}
            onClick={() => setFiltroStatus(st)}
            className={`px-3 py-1 rounded text-sm ${
              filtroStatus === st ? "bg-blue-600 text-white" : "bg-gray-100"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {incidentes.length === 0 && (
        <div className="text-gray-500">Nenhum incidente {filtroStatus}.</div>
      )}

      <div className="space-y-3">
        {incidentes.map((i) => (
          <div key={i.id} className="border rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-sm">{i.phone_masked}</div>
              <div className="text-xs text-gray-500">
                {new Date(i.criado_em).toLocaleString("pt-BR")} · step:{" "}
                <span className="font-mono">{i.ultimo_step}</span> · {i.duracao_min}min ·{" "}
                {i.mensagens_qtd} msgs
              </div>
            </div>
            {i.diagnostico_ia && (
              <div className="mb-2">
                <div className="text-xs uppercase text-gray-500 mb-0.5">Diagnostico</div>
                <div className="text-sm">{i.diagnostico_ia}</div>
              </div>
            )}
            {i.proposta_acao && (
              <div className="mb-3">
                <div className="text-xs uppercase text-gray-500 mb-0.5">Proposta</div>
                <div className="text-sm font-medium text-blue-900">{i.proposta_acao}</div>
              </div>
            )}
            {i.resumo_msgs && (
              <details className="mb-3">
                <summary className="text-xs text-gray-500 cursor-pointer flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Ver eventos brutos
                </summary>
                <pre className="text-xs bg-gray-50 p-2 rounded mt-1 whitespace-pre-wrap max-h-60 overflow-auto">
                  {i.resumo_msgs}
                </pre>
              </details>
            )}
            {i.status === "pendente" && (
              <div className="flex gap-2">
                <button
                  onClick={() => decidir(i.id, "aprovar")}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded flex items-center gap-1"
                >
                  <Check className="w-4 h-4" /> Aprovar (vira tarefa)
                </button>
                <button
                  onClick={() => decidir(i.id, "aplicar")}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded"
                >
                  Ja apliquei
                </button>
                <button
                  onClick={() => decidir(i.id, "rejeitar")}
                  className="px-3 py-1 bg-gray-300 text-sm rounded flex items-center gap-1"
                >
                  <X className="w-4 h-4" /> Rejeitar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
