"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Play, Download, Mail, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

type Cotacao = {
  id: number; qtd: number; itens: string; veiculo: string;
  distancia: number; ajudantes: number; tipoLocal: string; andares: number;
  zona: string; taxa: string; precoTotal: number;
  comissaoPegue: number; valorPrestador: number;
};

// Catalogo completo de itens (espelha o do backend)
const CATALOGO = {
  pequenos: [
    "Microondas", "TV 32\"", "Ventilador de coluna", "Tanquinho",
    "Mesa de centro", "Bicicleta", "Maquina de costura",
    "Ar condicionado split", "Impressora grande", "Berco desmontado",
    "Mala grande", "Cadeira gamer", "Aquario medio", "10 caixas",
  ],
  medios: [
    "Geladeira pequena", "Fogao 4 bocas", "Maquina de lavar 8kg",
    "Cama solteiro", "Colchao solteiro", "Escrivaninha",
    "Rack de TV", "Poltrona", "Comoda 4 gavetas",
    "Freezer horizontal pequeno", "Armario de cozinha pequeno",
    "Mesa de jantar 4 lugares", "Conjunto 4 cadeiras",
    "Sofa 2 lugares", "TV 55\"",
  ],
  grandes: [
    "Geladeira duplex", "Fogao 5 bocas", "Maquina de lavar 12kg",
    "Cama casal box", "Colchao casal", "Guarda-roupa 3 portas",
    "Guarda-roupa 6 portas", "Sofa 3 lugares", "Sofa retratil",
    "Mesa de jantar 6 lugares", "Estante grande",
    "Armario de cozinha modulado", "Freezer vertical",
  ],
};
const TODOS_ITENS = [...CATALOGO.pequenos, ...CATALOGO.medios, ...CATALOGO.grandes];

type Resumo = {
  total: number; precoMedio: number; precoMin: number; precoMax: number;
  porVeiculo: Record<string, { count: number; media: number }>;
};

export default function SimuladorPage() {
  const [senha, setSenha] = useState("");

  // Modo: manual (admin escolhe tudo) ou aleatorio (sistema sorteia)
  const [modoAleatorio, setModoAleatorio] = useState(false);

  // Filtros
  const [veiculos, setVeiculos] = useState<string[]>(["utilitario", "hr"]);
  const [qtdPorFrete, setQtdPorFrete] = useState(3); // modo manual (valor fixo)
  const [qtdMinAleatorio, setQtdMinAleatorio] = useState(1); // modo aleatorio (range)
  const [qtdMaxAleatorio, setQtdMaxAleatorio] = useState(4);
  const [itensSelecionados, setItensSelecionados] = useState<string[]>([]);
  const [distanciasStr, setDistanciasStr] = useState("3,5,10,15,20,30,50");
  const [ajudantes, setAjudantes] = useState<number[]>([0, 1]);
  const [tiposLocal, setTiposLocal] = useState<string[]>(["terreo"]);
  const [andaresEscada, setAndaresEscada] = useState(2);
  const [zonas, setZonas] = useState<string[]>(["normal"]);
  const [taxasTemporais, setTaxasTemporais] = useState<string[]>(["normal"]);
  const [totalCotacoes, setTotalCotacoes] = useState(300);
  const [enviarEmail, setEnviarEmail] = useState(false);
  const [destinatarioEmail, setDestinatarioEmail] = useState("fabiosantoscrispim@gmail.com");

  // Estado
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<{ cotacoes: Cotacao[]; resumo: Resumo } | null>(null);

  function toggle<T>(arr: T[], item: T, setter: (x: T[]) => void) {
    if (arr.includes(item)) setter(arr.filter(x => x !== item));
    else setter([...arr, item]);
  }

  async function handleSimular() {
    setErro("");
    setResultado(null);
    if (!senha) { setErro("Digite a senha de admin"); return; }

    if (!veiculos.length) { setErro("Escolha pelo menos 1 veiculo"); return; }

    // Monta filtros conforme o modo
    let corpo: any;
    if (modoAleatorio) {
      // Valida range
      if (qtdMinAleatorio > qtdMaxAleatorio) {
        setErro("Quantidade minima nao pode ser maior que a maxima");
        return;
      }
      // Sistema sorteia tudo exceto veiculo e range de qtd de itens
      corpo = {
        veiculos,
        qtdMin: qtdMinAleatorio, qtdMax: qtdMaxAleatorio,
        tamanhos: ["pequeno", "medio", "grande"], // todos
        distancias: [3, 5, 8, 10, 15, 20, 25, 30, 40, 50],
        ajudantes: [0, 1, 2],
        tiposLocal: ["terreo", "elevador", "escada"],
        andaresEscada: 2,
        zonas: ["normal", "dificil", "fundao"],
        taxasTemporais: ["normal", "noturno", "feriado", "fim_semana"],
        totalCotacoes, enviarEmail,
        destinatarioEmail: enviarEmail ? destinatarioEmail : undefined,
      };
    } else {
      // Modo manual: admin escolheu tudo
      const distancias = distanciasStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
      if (distancias.length === 0) { setErro("Distancias invalidas (ex: 3,5,10,20)"); return; }
      if (itensSelecionados.length === 0) { setErro("Selecione pelo menos 1 material disponivel"); return; }
      if (itensSelecionados.length < qtdPorFrete) {
        setErro(`Marque pelo menos ${qtdPorFrete} materiais (voce marcou ${itensSelecionados.length})`);
        return;
      }
      corpo = {
        veiculos,
        qtdMin: qtdPorFrete, qtdMax: qtdPorFrete,
        itensPool: itensSelecionados,
        distancias, ajudantes,
        tiposLocal, andaresEscada, zonas, taxasTemporais,
        totalCotacoes, enviarEmail,
        destinatarioEmail: enviarEmail ? destinatarioEmail : undefined,
      };
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin-simular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: senha, filtros: corpo }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error || "Erro"); }
      else { setResultado({ cotacoes: data.cotacoes, resumo: data.resumo }); }
    } catch { setErro("Erro de conexao"); }
    setLoading(false);
  }

  function exportarCSV() {
    if (!resultado) return;
    const header = ["ID", "Qtd", "Itens", "Veiculo", "Distancia (km)", "Ajudantes", "Tipo local", "Andares", "Zona", "Taxa", "Preco total", "Comissao Pegue", "Valor prestador"];
    const linhas = resultado.cotacoes.map(c => [c.id, c.qtd, `"${c.itens}"`, c.veiculo, c.distancia, c.ajudantes, c.tipoLocal, c.andares, c.zona, c.taxa, c.precoTotal, c.comissaoPegue, c.valorPrestador].join(","));
    const csv = [header.join(","), ...linhas].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `simulacao-pegue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <Link href="/admin" className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#C9A84C]">
        <ArrowLeft size={16} /> Voltar pro admin
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-extrabold text-[#0A0A0A]">Simulador de Cotacoes</h1>
        <p className="text-sm text-gray-400">Escolha os filtros e gere cotacoes simuladas pra validar precos</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* FILTROS */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-bold text-[#0A0A0A]">Filtros</h2>

          {/* Senha */}
          <Section titulo="Senha admin">
            <input
              type="password" value={senha} onChange={e => setSenha(e.target.value)}
              placeholder="Digite uma vez" className={inputStyle} />
          </Section>

          {/* Modo aleatorio */}
          <div className="mb-5 rounded-xl border-2 border-[#C9A84C]/30 bg-[#C9A84C]/5 p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={modoAleatorio}
                onChange={e => setModoAleatorio(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#C9A84C] focus:ring-[#C9A84C]"
              />
              <div>
                <p className="font-bold text-[#0A0A0A]">🎲 Modo aleatorio</p>
                <p className="mt-0.5 text-xs text-gray-600">
                  Voce escolhe apenas o veiculo e a quantidade de itens.
                  O sistema sorteia tudo: materiais, distancia, ajudantes, local, zona, taxa.
                </p>
              </div>
            </label>
          </div>

          {/* Veiculos */}
          <Section titulo="Veiculos">
            <Checkboxes
              opcoes={[
                { value: "carro_comum", label: "Carro comum" },
                { value: "utilitario", label: "Utilitario (Strada/Saveiro)" },
                { value: "hr", label: "HR" },
                { value: "caminhao_bau", label: "Caminhao Bau" },
                { value: "guincho", label: "Guincho" },
                { value: "moto_guincho", label: "Guincho moto" },
              ]}
              selecionados={veiculos}
              onToggle={v => toggle(veiculos, v, setVeiculos)}
            />
          </Section>

          {/* Quantos itens por frete */}
          <Section titulo="Quantidade de itens por frete">
            {modoAleatorio ? (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">De</span>
                  <input
                    type="number" min={1} max={10}
                    value={qtdMinAleatorio}
                    onChange={e => setQtdMinAleatorio(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    className={`${inputStyle} w-16`}
                  />
                  <span className="text-gray-500">ate</span>
                  <input
                    type="number" min={1} max={10}
                    value={qtdMaxAleatorio}
                    onChange={e => setQtdMaxAleatorio(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    className={`${inputStyle} w-16`}
                  />
                  <span className="text-gray-500 text-xs">itens</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Cada cotacao tera uma quantidade aleatoria dentro desse range.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="number" min={1} max={10}
                    value={qtdPorFrete}
                    onChange={e => setQtdPorFrete(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                    className={`${inputStyle} w-20`}
                  />
                  <span className="text-gray-500 text-xs">itens por cotacao</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Cada cotacao tera essa quantidade fixa de itens, sorteados da lista abaixo.
                </p>
              </>
            )}
          </Section>

          {/* Filtros detalhados - escondidos no modo aleatorio */}
          {!modoAleatorio && <>

          {/* Materiais disponiveis - pool pra sortear */}
          <Section titulo={`Materiais disponiveis (marque os que podem aparecer - ${itensSelecionados.length} selecionados)`}>
            {/* Filtros rapidos */}
            <div className="mb-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setItensSelecionados(TODOS_ITENS)} className={filtroBtn}>Todos</button>
              <button type="button" onClick={() => setItensSelecionados([])} className={filtroBtn}>Nenhum</button>
              <button type="button" onClick={() => setItensSelecionados(CATALOGO.pequenos)} className={filtroBtn}>So pequenos</button>
              <button type="button" onClick={() => setItensSelecionados(CATALOGO.medios)} className={filtroBtn}>So medios</button>
              <button type="button" onClick={() => setItensSelecionados(CATALOGO.grandes)} className={filtroBtn}>So grandes</button>
            </div>

            <div className="max-h-64 space-y-3 overflow-auto rounded-lg border border-gray-100 p-3">
              <GrupoItens
                titulo="Pequenos"
                itens={CATALOGO.pequenos}
                selecionados={itensSelecionados}
                onToggle={v => toggle(itensSelecionados, v, setItensSelecionados)}
              />
              <GrupoItens
                titulo="Medios"
                itens={CATALOGO.medios}
                selecionados={itensSelecionados}
                onToggle={v => toggle(itensSelecionados, v, setItensSelecionados)}
              />
              <GrupoItens
                titulo="Grandes"
                itens={CATALOGO.grandes}
                selecionados={itensSelecionados}
                onToggle={v => toggle(itensSelecionados, v, setItensSelecionados)}
              />
            </div>
            {itensSelecionados.length > 0 && itensSelecionados.length < qtdPorFrete && (
              <p className="mt-2 text-xs text-orange-600">
                ⚠️ Voce marcou {itensSelecionados.length} mas cada frete tem {qtdPorFrete} itens. Marque pelo menos {qtdPorFrete}.
              </p>
            )}
          </Section>

          {/* Distancias */}
          <Section titulo="Distancias (km, separadas por vírgula)">
            <input type="text" value={distanciasStr} onChange={e => setDistanciasStr(e.target.value)} className={inputStyle} placeholder="3,5,10,20,50" />
          </Section>

          {/* Ajudantes */}
          <Section titulo="Quantidade de ajudantes">
            <Checkboxes
              opcoes={[
                { value: "0", label: "Sem ajudante" },
                { value: "1", label: "1 ajudante (+R$ 80/100)" },
                { value: "2", label: "2 ajudantes" },
              ]}
              selecionados={ajudantes.map(String)}
              onToggle={v => toggle(ajudantes, parseInt(v), setAjudantes)}
            />
          </Section>

          {/* Tipo local */}
          <Section titulo="Tipo de local de entrega">
            <Checkboxes
              opcoes={[
                { value: "terreo", label: "Terreo (sem adicional)" },
                { value: "elevador", label: "Predio com elevador (+R$ 50)" },
                { value: "escada", label: "Escada" },
              ]}
              selecionados={tiposLocal}
              onToggle={v => toggle(tiposLocal, v, setTiposLocal)}
            />
            {tiposLocal.includes("escada") && (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className="text-gray-500">Andares:</span>
                <input type="number" min={1} max={10} value={andaresEscada} onChange={e => setAndaresEscada(parseInt(e.target.value) || 1)} className={`${inputStyle} w-16`} />
                <span className="text-gray-500 text-xs">(+R$ 30 por andar)</span>
              </div>
            )}
          </Section>

          {/* Zonas */}
          <Section titulo="Zonas de destino">
            <Checkboxes
              opcoes={[
                { value: "normal", label: "Normal" },
                { value: "dificil", label: "Zona dificil (+15%)" },
                { value: "fundao", label: "Fundao (+30%)" },
              ]}
              selecionados={zonas}
              onToggle={v => toggle(zonas, v, setZonas)}
            />
          </Section>

          {/* Taxas temporais */}
          <Section titulo="Taxas temporais (guincho imediato)">
            <Checkboxes
              opcoes={[
                { value: "normal", label: "Horario normal" },
                { value: "noturno", label: "Noturno 22h-6h (+30%)" },
                { value: "feriado", label: "Feriado (+30%)" },
                { value: "fim_semana", label: "Fim de semana (+20%)" },
              ]}
              selecionados={taxasTemporais}
              onToggle={v => toggle(taxasTemporais, v, setTaxasTemporais)}
            />
          </Section>

          </>}
          {/* Fim dos filtros detalhados (escondidos no modo aleatorio) */}

          {/* Qtd cotacoes */}
          <Section titulo="Quantas cotacoes gerar">
            <select value={totalCotacoes} onChange={e => setTotalCotacoes(parseInt(e.target.value))} className={inputStyle}>
              <option value={50}>50 cotacoes</option>
              <option value={100}>100 cotacoes</option>
              <option value={300}>300 cotacoes</option>
              <option value={500}>500 cotacoes</option>
              <option value={1000}>1000 cotacoes</option>
            </select>
          </Section>

          {/* Email */}
          <Section titulo="Enviar por email?">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={enviarEmail} onChange={e => setEnviarEmail(e.target.checked)} />
              <span>Enviar copia pro email</span>
            </label>
            {enviarEmail && (
              <input type="email" value={destinatarioEmail} onChange={e => setDestinatarioEmail(e.target.value)} className={`${inputStyle} mt-2`} />
            )}
          </Section>

          {erro && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{erro}</span>
            </div>
          )}

          <button onClick={handleSimular} disabled={loading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9A84C] py-3 font-bold text-white hover:bg-[#b8963f] disabled:opacity-50">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando...</> : <><Play size={16} /> Gerar simulacao</>}
          </button>
        </div>

        {/* RESULTADO */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          {!resultado ? (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-gray-400">
              <Play size={48} className="mb-3 opacity-30" />
              <p>Escolha os filtros e clique em "Gerar simulacao"</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-bold text-[#0A0A0A]">Resultado ({resultado.resumo.total} cotacoes)</h2>
                  <p className="text-xs text-gray-500">
                    Medio R$ {resultado.resumo.precoMedio} · Min R$ {resultado.resumo.precoMin} · Max R$ {resultado.resumo.precoMax}
                  </p>
                </div>
                <button onClick={exportarCSV}
                  className="flex items-center gap-1.5 rounded-lg bg-[#C9A84C] px-3 py-2 text-xs font-semibold text-white hover:bg-[#b8963f]">
                  <Download size={14} /> Exportar CSV
                </button>
              </div>

              {/* Resumo por veiculo */}
              <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(resultado.resumo.porVeiculo).map(([v, r]) => (
                  <div key={v} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs">
                    <p className="font-semibold text-[#C9A84C]">{v}</p>
                    <p className="text-gray-600">{r.count} cotacoes · media R$ {r.media}</p>
                  </div>
                ))}
              </div>

              {enviarEmail && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">
                  <CheckCircle2 size={14} /> Email tambem enviado pra {destinatarioEmail}
                </div>
              )}

              {/* Tabela */}
              <div className="max-h-[600px] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#0A0A0A] text-[#C9A84C]">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">Qtd</th>
                      <th className="p-2">Itens</th>
                      <th className="p-2">Veiculo</th>
                      <th className="p-2">Dist</th>
                      <th className="p-2">Ajud</th>
                      <th className="p-2">Local</th>
                      <th className="p-2">Zona</th>
                      <th className="p-2">Taxa</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.cotacoes.map(c => (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="p-2 text-gray-400">{c.id}</td>
                        <td className="p-2 text-center font-semibold">{c.qtd}</td>
                        <td className="p-2">{c.itens}</td>
                        <td className="p-2 font-semibold text-[#C9A84C]">{c.veiculo}</td>
                        <td className="p-2 text-center">{c.distancia}km</td>
                        <td className="p-2 text-center">{c.ajudantes}</td>
                        <td className="p-2 text-gray-600">{c.tipoLocal}{c.andares > 0 ? ` ${c.andares}o` : ""}</td>
                        <td className="p-2 text-gray-600">{c.zona}</td>
                        <td className="p-2 text-gray-600">{c.taxa}</td>
                        <td className="p-2 text-right font-bold">R$ {c.precoTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C9A84C] focus:outline-none";
const filtroBtn = "rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-[#C9A84C] hover:text-[#C9A84C]";

function GrupoItens({ titulo, itens, selecionados, onToggle }: {
  titulo: string; itens: string[]; selecionados: string[]; onToggle: (v: string) => void;
}) {
  const marcadosNesse = itens.filter(i => selecionados.includes(i)).length;
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        {titulo} ({marcadosNesse}/{itens.length})
      </p>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {itens.map(item => (
          <label key={item} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-gray-50">
            <input
              type="checkbox" checked={selecionados.includes(item)}
              onChange={() => onToggle(item)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-[#C9A84C] focus:ring-[#C9A84C]"
            />
            <span className="text-gray-700">{item}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs font-semibold text-gray-700">{titulo}</p>
      {children}
    </div>
  );
}

function Checkboxes({ opcoes, selecionados, onToggle }: {
  opcoes: { value: string; label: string }[];
  selecionados: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {opcoes.map(op => (
        <label key={op.value} className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox" checked={selecionados.includes(op.value)}
            onChange={() => onToggle(op.value)}
            className="h-4 w-4 rounded border-gray-300 text-[#C9A84C] focus:ring-[#C9A84C]"
          />
          <span className="text-gray-700">{op.label}</span>
        </label>
      ))}
    </div>
  );
}
