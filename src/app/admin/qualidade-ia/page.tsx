"use client";

import { useEffect, useState } from "react";
import { Brain, TrendingUp, AlertTriangle, FileText } from "lucide-react";

type Resposta = {
  total_medicoes: number;
  taxa_global: number | null;
  por_campo: Record<string, { acertos: number; total: number; taxa: number }>;
  top_divergencias: Array<{ campo: string; ia: any; real: any; qtd: number; exemplos: string[] }>;
  serie_30d: Array<{ dia: string; taxa: number; qtd: number }>;
  amostras: Array<{
    id: string;
    corrida_id: string;
    mensagem_original: string | null;
    taxa_acerto: number;
    campos_corretos: string[];
    campos_incorretos: string[];
    extracao_ia: any;
    valores_finais: any;
    criado_em: string;
  }>;
  motivo?: string;
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

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n * 1000) / 10}%`;
}

function corPorTaxa(taxa: number): string {
  if (taxa >= 0.9) return "text-green-600";
  if (taxa >= 0.75) return "text-yellow-600";
  if (taxa >= 0.5) return "text-orange-600";
  return "text-red-600";
}

const NOMES_CAMPOS: Record<string, string> = {
  servico: "Serviço (frete/guincho)",
  origem: "Origem",
  destino: "Destino",
  veiculo: "Veículo sugerido",
  ajudante: "Precisa ajudante",
  andar: "Andar origem",
  escada: "Tem escada",
  elevador: "Tem elevador",
  itens: "Itens listados",
  veiculo_marca: "Marca/modelo (guincho)",
  periodo: "Período",
};

export default function QualidadeIAPage() {
  const [data, setData] = useState<Resposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [amostraExpandida, setAmostraExpandida] = useState<string | null>(null);

  async function carregar() {
    const senha = getAdminKey();
    if (!senha) { setErro("Senha de admin obrigatoria"); setLoading(false); return; }
    try {
      const res = await fetch(`/api/admin-qualidade-ia?key=${encodeURIComponent(senha)}`);
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
      setData(await res.json());
    } catch {
      setErro("Erro de conexao");
    }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  if (loading) return <div className="p-6">Carregando...</div>;
  if (erro) return <div className="p-6 text-red-600">{erro}</div>;
  if (!data) return <div className="p-6">Sem dados</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <Brain className="w-6 h-6" /> Qualidade da IA
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Mede acerto da IA de extração de contexto (1ª mensagem do cliente). Compara o que a IA entendeu vs o que realmente foi usado na corrida.
      </p>

      {data.motivo && data.total_medicoes === 0 ? (
        <div className="rounded-2xl bg-blue-50 p-8 text-center">
          <p className="font-semibold text-blue-900">{data.motivo}</p>
          <p className="text-sm text-blue-700 mt-2">
            Cron <code className="bg-blue-100 px-1 rounded">medir-qualidade-ia</code> roda 1x/dia. Conforme corridas concluem, dados aparecem aqui.
          </p>
        </div>
      ) : (
        <>
          {/* Stats topo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card titulo="Taxa global de acerto" valor={fmtPct(data.taxa_global)} cor={corPorTaxa(data.taxa_global || 0)} />
            <Card titulo="Total medições (30d)" valor={String(data.total_medicoes)} cor="text-gray-800" />
            <Card titulo="Campos avaliados" valor={String(Object.keys(data.por_campo).length)} cor="text-gray-800" />
          </div>

          {/* Acerto por campo */}
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> Acerto por campo
          </h2>
          <div className="bg-white rounded-lg border p-4 mb-8">
            {Object.entries(data.por_campo)
              .sort((a, b) => a[1].taxa - b[1].taxa) // pior primeiro (foco de melhoria)
              .map(([campo, st]) => (
                <div key={campo} className="mb-3 last:mb-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">{NOMES_CAMPOS[campo] || campo}</span>
                    <span className={`text-sm font-bold ${corPorTaxa(st.taxa)}`}>
                      {fmtPct(st.taxa)} ({st.acertos}/{st.total})
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded overflow-hidden">
                    <div
                      className={`h-full ${st.taxa >= 0.9 ? "bg-green-500" : st.taxa >= 0.75 ? "bg-yellow-500" : st.taxa >= 0.5 ? "bg-orange-500" : "bg-red-500"}`}
                      style={{ width: `${st.taxa * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>

          {/* Top divergências */}
          {data.top_divergencias.length > 0 && (
            <>
              <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Top divergências (padrões recorrentes)
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                Onde a IA mais erra. Cada padrão repetido = oportunidade de melhorar o prompt.
              </p>
              <div className="space-y-2 mb-8">
                {data.top_divergencias.map((d, i) => (
                  <div key={i} className="bg-white rounded-lg border border-orange-200 p-3 text-sm">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1">
                        <div className="font-medium">
                          <span className="text-gray-500 text-xs uppercase mr-2">{NOMES_CAMPOS[d.campo] || d.campo}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                          <div>
                            <span className="text-gray-500">IA disse:</span>{" "}
                            <code className="bg-red-50 text-red-700 px-1 rounded">
                              {JSON.stringify(d.ia) || "—"}
                            </code>
                          </div>
                          <div>
                            <span className="text-gray-500">Real era:</span>{" "}
                            <code className="bg-green-50 text-green-700 px-1 rounded">
                              {JSON.stringify(d.real) || "—"}
                            </code>
                          </div>
                        </div>
                        {d.exemplos.length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-gray-500 cursor-pointer">
                              Ver {d.exemplos.length} exemplos de mensagens
                            </summary>
                            <ul className="mt-1 text-xs text-gray-600 space-y-1 pl-4">
                              {d.exemplos.map((ex, j) => (
                                <li key={j} className="italic">"{ex}"</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                      <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded font-bold text-xs">
                        {d.qtd}x
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Amostras */}
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <FileText className="w-5 h-5" /> Últimas medições
          </h2>
          <div className="space-y-2">
            {data.amostras.map((a) => (
              <div key={a.id} className="bg-white rounded-lg border p-3 text-sm">
                <div className="flex justify-between items-start mb-1">
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">
                      {new Date(a.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </div>
                    <div className="text-sm mt-1">"{a.mensagem_original?.slice(0, 200) || "—"}"</div>
                  </div>
                  <div className="text-right ml-3">
                    <span className={`font-bold ${corPorTaxa(a.taxa_acerto)}`}>{fmtPct(a.taxa_acerto)}</span>
                    <div className="text-xs text-gray-500">
                      {a.campos_corretos.length}/{a.campos_corretos.length + a.campos_incorretos.length}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {a.campos_corretos.map((c) => (
                    <span key={c} className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded">✓ {c}</span>
                  ))}
                  {a.campos_incorretos.map((c) => (
                    <span key={c} className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded">✗ {c}</span>
                  ))}
                </div>
                <button
                  onClick={() => setAmostraExpandida(amostraExpandida === a.id ? null : a.id)}
                  className="text-xs text-blue-600 hover:underline mt-2"
                >
                  {amostraExpandida === a.id ? "Esconder" : "Ver"} extração detalhada
                </button>
                {amostraExpandida === a.id && (
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="font-semibold mb-1">IA extraiu:</div>
                      <pre className="text-[10px] overflow-auto max-h-40">{JSON.stringify(a.extracao_ia, null, 2)}</pre>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="font-semibold mb-1">Real (corrida):</div>
                      <pre className="text-[10px] overflow-auto max-h-40">{JSON.stringify(a.valores_finais, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Card({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-600">{titulo}</div>
      <div className={`text-3xl font-bold mt-1 ${cor}`}>{valor}</div>
    </div>
  );
}
