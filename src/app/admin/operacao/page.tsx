"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DollarSign, Truck, Users, CheckCircle, Clock, XCircle, Package,
  Shield, ArrowLeft, Gift, Eye, TrendingUp, AlertTriangle,
} from "lucide-react";

// Dados ficticios pra visualizacao
const VENDAS_FICTICIO = [
  { id: "#001", data: "14/04", origem: "Osasco", destino: "Perdizes", valor: 280, cliente: "Maria Silva", clienteTel: "(11) 97845-3321", fretista: "Fabio Santos", fretistaTel: "(11) 95393-8849", indicador: "Iori Souza", indicadorTel: "(11) 99432-1122", codigoIndicacao: "PEGUE-7X9K", comissaoPegue: 33.60, valorFretista: 246.40, valorAfiliado: 20, status: "concluido", pgtoFretista: "pago", pgtoAfiliado: "pendente" },
  { id: "#002", data: "14/04", origem: "Osasco", destino: "Barra Funda", valor: 350, cliente: "Ana Costa", clienteTel: "(11) 98765-4321", fretista: "Jackeline Rodrigues", fretistaTel: "(11) 2831-7810", indicador: null, indicadorTel: null, codigoIndicacao: null, comissaoPegue: 42, valorFretista: 308, valorAfiliado: 0, status: "concluido", pgtoFretista: "pago", pgtoAfiliado: null },
  { id: "#003", data: "13/04", origem: "Alphaville", destino: "Brooklin", valor: 420, cliente: "Carlos Mendes", clienteTel: "(11) 96543-2109", fretista: "Fabio Santos", fretistaTel: "(11) 95393-8849", indicador: "Maria Silva", indicadorTel: "(11) 97845-3321", codigoIndicacao: "PEGUE-M4R1", comissaoPegue: 50.40, valorFretista: 369.60, valorAfiliado: 20, status: "concluido", pgtoFretista: "pendente", pgtoAfiliado: "pendente" },
  { id: "#004", data: "13/04", origem: "Osasco", destino: "Santos", valor: 680, cliente: "Fernanda Lima", clienteTel: "(11) 94321-8765", fretista: "Jackeline Rodrigues", fretistaTel: "(11) 2831-7810", indicador: "Iori Souza", indicadorTel: "(11) 99432-1122", codigoIndicacao: "PEGUE-7X9K", comissaoPegue: 81.60, valorFretista: 598.40, valorAfiliado: 20, status: "concluido", pgtoFretista: "pendente", pgtoAfiliado: "pendente" },
  { id: "#005", data: "12/04", origem: "Osasco", destino: "Agua Branca", valor: 220, cliente: "Rafael Souza", clienteTel: "(11) 93210-7654", fretista: "Fabio Santos", fretistaTel: "(11) 95393-8849", indicador: null, indicadorTel: null, codigoIndicacao: null, comissaoPegue: 26.40, valorFretista: 193.60, valorAfiliado: 0, status: "concluido", pgtoFretista: "pago", pgtoAfiliado: null },
  { id: "#006", data: "12/04", origem: "Carapicuiba", destino: "Pinheiros", valor: 310, cliente: "Juliana Alves", clienteTel: "(11) 92109-6543", fretista: "Jackeline Rodrigues", fretistaTel: "(11) 2831-7810", indicador: "Carlos Mendes", indicadorTel: "(11) 96543-2109", codigoIndicacao: "PEGUE-C4RL", comissaoPegue: 37.20, valorFretista: 272.80, valorAfiliado: 20, status: "concluido", pgtoFretista: "pago", pgtoAfiliado: "pendente" },
  { id: "#007", data: "11/04", origem: "Osasco", destino: "SBC", valor: 550, cliente: "Marcos Oliveira", clienteTel: "(11) 91098-5432", fretista: "Fabio Santos", fretistaTel: "(11) 95393-8849", indicador: "Maria Silva", indicadorTel: "(11) 97845-3321", codigoIndicacao: "PEGUE-M4R1", comissaoPegue: 66, valorFretista: 484, valorAfiliado: 20, status: "em andamento", pgtoFretista: "pendente", pgtoAfiliado: "pendente" },
  { id: "#008", data: "11/04", origem: "Osasco", destino: "Casa Verde", valor: 240, cliente: "Patrica Santos", clienteTel: "(11) 90987-4321", fretista: "Jackeline Rodrigues", fretistaTel: "(11) 2831-7810", indicador: null, indicadorTel: null, codigoIndicacao: null, comissaoPegue: 28.80, valorFretista: 211.20, valorAfiliado: 0, status: "concluido", pgtoFretista: "pago", pgtoAfiliado: null },
];

const AFILIADOS_FICTICIO = [
  { nome: "Iori Souza", tel: "(11) 99432-1122", codigo: "PEGUE-7X9K", indicacoes: 4, fecharam: 3, credito: 60, sacado: 0, statusSaque: "disponivel" },
  { nome: "Maria Silva", tel: "(11) 97845-3321", codigo: "PEGUE-M4R1", indicacoes: 5, fecharam: 3, credito: 60, sacado: 0, statusSaque: "disponivel" },
  { nome: "Carlos Mendes", tel: "(11) 96543-2109", codigo: "PEGUE-C4RL", indicacoes: 2, fecharam: 1, credito: 20, sacado: 0, statusSaque: "acumulando" },
];

export default function OperacaoPage() {
  const [tab, setTab] = useState<"vendas" | "pagamentos" | "indicacoes" | "resumo">("vendas");
  const [vendas, setVendas] = useState(VENDAS_FICTICIO);
  const [afiliados] = useState(AFILIADOS_FICTICIO);

  function marcarPago(id: string, tipo: "fretista" | "afiliado") {
    setVendas(prev => prev.map(v => v.id === id ? { ...v, [tipo === "fretista" ? "pgtoFretista" : "pgtoAfiliado"]: "pago" } : v));
  }

  // Calculos
  const totalReceita = vendas.reduce((s, v) => s + v.valor, 0);
  const totalComissao = vendas.reduce((s, v) => s + v.comissaoPegue, 0);
  const totalFretistas = vendas.reduce((s, v) => s + v.valorFretista, 0);
  const totalAfiliados = vendas.reduce((s, v) => s + v.valorAfiliado, 0);
  const pgtoFretistaPendente = vendas.filter(v => v.pgtoFretista === "pendente").reduce((s, v) => s + v.valorFretista, 0);
  const pgtoAfiliadoPendente = vendas.filter(v => v.pgtoAfiliado === "pendente").reduce((s, v) => s + v.valorAfiliado, 0);
  const lucroLiquido = totalComissao - totalAfiliados - 190;

  return (
    <div className="min-h-screen bg-[#000] px-3 py-4 text-white md:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-1 text-sm text-gray-400 hover:text-[#C9A84C]">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <div>
            <h1 className="text-xl font-extrabold">Operacao <span className="text-[#C9A84C]">Pegue</span></h1>
            <p className="text-xs text-gray-500">Vendas, pagamentos e indicacoes</p>
          </div>
        </div>
        <p className="text-xs text-yellow-400 bg-yellow-400/10 px-3 py-1 rounded-full">DADOS FICTICIOS - VISUALIZACAO</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto">
        {[
          { id: "vendas", label: "Vendas", icon: <Package className="h-4 w-4" /> },
          { id: "pagamentos", label: "Pagamentos", icon: <DollarSign className="h-4 w-4" /> },
          { id: "indicacoes", label: "Indicacoes", icon: <Gift className="h-4 w-4" /> },
          { id: "resumo", label: "Resumo", icon: <TrendingUp className="h-4 w-4" /> },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-all ${tab === t.id ? "bg-[#C9A84C] text-[#000]" : "bg-[#0A0A0A] text-gray-400 border border-[#C9A84C]/20 hover:text-white"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* TAB: VENDAS */}
      {tab === "vendas" && (
        <div className="space-y-3">
          {vendas.map((v) => (
            <div key={v.id} className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{v.id}</span>
                    <span className="text-xs text-gray-500">{v.data}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${v.status === "concluido" ? "bg-green-400/10 text-green-400" : "bg-yellow-400/10 text-yellow-400"}`}>{v.status}</span>
                  </div>
                  <p className="text-base font-bold">{v.origem} → {v.destino}</p>
                  <p className="text-sm text-gray-400">👤 {v.cliente} · {v.clienteTel}</p>
                  <p className="text-sm text-gray-400">🚚 {v.fretista} · {v.fretistaTel}</p>
                  {v.indicador && <p className="text-sm text-[#C9A84C]">🎁 Indicado por: {v.indicador} ({v.codigoIndicacao})</p>}
                </div>

                <div className="space-y-1 text-right shrink-0">
                  <p className="text-xl font-extrabold text-white">R$ {v.valor}</p>
                  <p className="text-xs text-[#C9A84C]">Pegue: R$ {v.comissaoPegue.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">Fretista: R$ {v.valorFretista.toFixed(2)}</p>
                  {v.valorAfiliado > 0 && <p className="text-xs text-purple-400">Afiliado: R$ {v.valorAfiliado}</p>}
                </div>
              </div>

              {/* Status pagamentos */}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-800 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Fretista:</span>
                  {v.pgtoFretista === "pago" ? (
                    <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle className="h-3 w-3" /> Pago</span>
                  ) : (
                    <button onClick={() => marcarPago(v.id, "fretista")} className="flex items-center gap-1 rounded bg-[#C9A84C]/10 px-2 py-1 text-xs text-[#C9A84C] hover:bg-[#C9A84C]/20">
                      <DollarSign className="h-3 w-3" /> Marcar Pago
                    </button>
                  )}
                </div>
                {v.indicador && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Afiliado:</span>
                    {v.pgtoAfiliado === "pago" ? (
                      <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle className="h-3 w-3" /> Pago</span>
                    ) : (
                      <button onClick={() => marcarPago(v.id, "afiliado")} className="flex items-center gap-1 rounded bg-purple-500/10 px-2 py-1 text-xs text-purple-400 hover:bg-purple-500/20">
                        <Gift className="h-3 w-3" /> Pagar Afiliado
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB: PAGAMENTOS */}
      {tab === "pagamentos" && (
        <div className="space-y-6">
          {/* Fretistas pendentes */}
          <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
            <h3 className="mb-4 flex items-center gap-2 font-bold"><Truck className="h-5 w-5 text-[#C9A84C]" /> Pagar Fretistas</h3>
            {(() => {
              const fretistas: Record<string, { nome: string; tel: string; valor: number; fretes: number }> = {};
              vendas.filter(v => v.pgtoFretista === "pendente").forEach(v => {
                if (!fretistas[v.fretistaTel]) fretistas[v.fretistaTel] = { nome: v.fretista, tel: v.fretistaTel, valor: 0, fretes: 0 };
                fretistas[v.fretistaTel].valor += v.valorFretista;
                fretistas[v.fretistaTel].fretes++;
              });
              const lista = Object.values(fretistas);
              if (lista.length === 0) return <p className="text-sm text-gray-500">Todos pagos! ✅</p>;
              return (
                <div className="space-y-2">
                  {lista.map((f, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-[#C9A84C]/10 bg-[#000] p-3">
                      <div>
                        <p className="font-medium">🚚 {f.nome}</p>
                        <p className="text-xs text-gray-500">{f.tel} · {f.fretes} fretes</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-lg font-bold text-[#C9A84C]">R$ {f.valor.toFixed(2)}</p>
                        <button className="rounded-lg bg-[#C9A84C] px-3 py-2 text-xs font-bold text-[#000] hover:scale-105 transition-all">Marcar Pago</button>
                      </div>
                    </div>
                  ))}
                  <p className="text-right text-sm text-gray-400">Total pendente: <strong className="text-[#C9A84C]">R$ {pgtoFretistaPendente.toFixed(2)}</strong></p>
                </div>
              );
            })()}
          </div>

          {/* Afiliados pendentes */}
          <div className="rounded-xl border border-purple-500/20 bg-[#0A0A0A] p-5">
            <h3 className="mb-4 flex items-center gap-2 font-bold"><Gift className="h-5 w-5 text-purple-400" /> Saques Afiliados</h3>
            <div className="space-y-2">
              {afiliados.filter(a => a.credito >= 60).map((a, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-purple-500/10 bg-[#000] p-3">
                  <div>
                    <p className="font-medium">🎁 {a.nome}</p>
                    <p className="text-xs text-gray-500">{a.tel} · {a.fecharam} indicacoes fecharam · Codigo: {a.codigo}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-bold text-purple-400">R$ {a.credito}</p>
                    <button className="rounded-lg bg-purple-500/20 px-3 py-2 text-xs font-bold text-purple-400 hover:bg-purple-500/30 transition-all">Aprovar Pix</button>
                  </div>
                </div>
              ))}
              {afiliados.filter(a => a.credito < 60).map((a, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-gray-800 bg-[#000] p-3 opacity-60">
                  <div>
                    <p className="font-medium">🎁 {a.nome}</p>
                    <p className="text-xs text-gray-500">{a.tel} · {a.fecharam} fecharam · Faltam {3 - a.fecharam} pra sacar</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-400">R$ {a.credito}</p>
                    <p className="text-[10px] text-gray-500">Minimo R$ 60 (3 indicacoes)</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: INDICACOES */}
      {tab === "indicacoes" && (
        <div className="space-y-6">
          {/* Metricas */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-4 text-center">
              <p className="text-2xl font-extrabold text-[#C9A84C]">{afiliados.length}</p>
              <p className="text-xs text-gray-500">Afiliados ativos</p>
            </div>
            <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-4 text-center">
              <p className="text-2xl font-extrabold">{afiliados.reduce((s, a) => s + a.indicacoes, 0)}</p>
              <p className="text-xs text-gray-500">Total indicacoes</p>
            </div>
            <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-4 text-center">
              <p className="text-2xl font-extrabold text-green-400">{afiliados.reduce((s, a) => s + a.fecharam, 0)}</p>
              <p className="text-xs text-gray-500">Que fecharam</p>
            </div>
            <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-4 text-center">
              <p className="text-2xl font-extrabold text-purple-400">R$ {afiliados.reduce((s, a) => s + a.credito, 0)}</p>
              <p className="text-xs text-gray-500">Total creditos</p>
            </div>
          </div>

          {/* Lista afiliados */}
          <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
            <h3 className="mb-4 font-bold">Afiliados</h3>
            <div className="space-y-2">
              {afiliados.map((a, i) => (
                <div key={i} className="rounded-lg border border-[#C9A84C]/10 bg-[#000] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">{a.nome}</p>
                      <p className="text-xs text-gray-500">{a.tel} · Codigo: <span className="text-[#C9A84C]">{a.codigo}</span></p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-purple-400">R$ {a.credito}</p>
                      <p className="text-[10px] text-gray-500">{a.statusSaque === "disponivel" ? "Disponivel pra saque" : "Acumulando (min 3)"}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-gray-400">
                    <span>Indicou: <strong>{a.indicacoes}</strong></span>
                    <span>Fecharam: <strong className="text-green-400">{a.fecharam}</strong></span>
                    <span>Conversao: <strong className="text-[#C9A84C]">{a.indicacoes > 0 ? Math.round((a.fecharam / a.indicacoes) * 100) : 0}%</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: RESUMO */}
      {tab === "resumo" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
              <p className="text-xs text-gray-400">Entrou (clientes)</p>
              <p className="text-2xl font-extrabold text-green-400">R$ {totalReceita.toFixed(0)}</p>
            </div>
            <div className="rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-4 text-center">
              <p className="text-xs text-gray-400">Comissao Pegue (12%)</p>
              <p className="text-2xl font-extrabold text-[#C9A84C]">R$ {totalComissao.toFixed(0)}</p>
            </div>
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
              <p className="text-xs text-gray-400">Pagar fretistas</p>
              <p className="text-2xl font-extrabold text-red-400">R$ {totalFretistas.toFixed(0)}</p>
            </div>
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 text-center">
              <p className="text-xs text-gray-400">Pagar afiliados</p>
              <p className="text-2xl font-extrabold text-purple-400">R$ {totalAfiliados.toFixed(0)}</p>
            </div>
          </div>

          <div className="rounded-xl border-2 border-[#C9A84C]/30 bg-[#C9A84C]/5 p-6 text-center">
            <p className="text-sm text-gray-400">Seu lucro liquido (comissao - afiliados - custos fixos)</p>
            <p className="text-4xl font-extrabold text-[#C9A84C]">R$ {lucroLiquido.toFixed(2)}</p>
            <p className="mt-1 text-xs text-gray-500">Custos fixos: R$ 190/mes (ChatPro + OpenAI)</p>
          </div>

          <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
            <h3 className="mb-4 font-bold">Detalhamento</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-gray-800 pb-2"><span className="text-gray-400">Receita bruta (clientes pagaram)</span><span className="font-bold text-green-400">R$ {totalReceita.toFixed(2)}</span></div>
              <div className="flex justify-between border-b border-gray-800 pb-2"><span className="text-gray-400">(-) Pagar fretistas (88%)</span><span className="text-red-400">- R$ {totalFretistas.toFixed(2)}</span></div>
              <div className="flex justify-between border-b border-gray-800 pb-2"><span className="text-gray-400">(=) Comissao Pegue (12%)</span><span className="font-bold text-[#C9A84C]">R$ {totalComissao.toFixed(2)}</span></div>
              <div className="flex justify-between border-b border-gray-800 pb-2"><span className="text-gray-400">(-) Pagar afiliados</span><span className="text-purple-400">- R$ {totalAfiliados.toFixed(2)}</span></div>
              <div className="flex justify-between border-b border-gray-800 pb-2"><span className="text-gray-400">(-) Custos fixos</span><span className="text-red-400">- R$ 190.00</span></div>
              <div className="flex justify-between pt-2"><span className="font-bold">Lucro liquido</span><span className="text-xl font-extrabold text-[#C9A84C]">R$ {lucroLiquido.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
