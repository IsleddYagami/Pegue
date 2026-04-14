"use client";

import { useState, useEffect } from "react";
import {
  BarChart3, Users, Truck, DollarSign, TrendingUp, Clock,
  AlertTriangle, Star, MessageCircle, CheckCircle, XCircle,
  Send, RefreshCw, Loader2, Shield, Eye, Package,
} from "lucide-react";

interface DashboardData {
  resumo: { contatosHoje: number; contatosSemana: number; contatosMes: number; contatosTotal: number };
  corridas: { total: number; hoje: number; semana: number; mes: number; concluidas: number; pendentes: number; aceitas: number; pagas: number };
  financeiro: { faturamentoTotal: number; comissaoPegue: number; faturamentoMes: number; comissaoMes: number; ticketMedio: number };
  funil: { iniciaramConversa: number; enviaramFoto: number; receberamOrcamento: number; fecharam: number; taxaConversao: number };
  abandonos: { phone: string; step: string; ultimaAtividade: string; origem: string | null; destino: string | null; carga: string | null; valor: number | null }[];
  clientes: { total: number; novosMes: number };
  prestadores: { total: number; ativos: number; pendentes: number; scoreMedio: number; lista: { nome: string; telefone: string; status: string; score: number; disponivel: boolean; fretes: number }[] };
  ultimasCorridas: { id: string; status: string; valor: number | null; comissao: number | null; carga: string | null; origem: string | null; destino: string | null; data: string; prestador: string | null }[];
  avaliacoes: { notaMedia: number; total: number; sugestoes: string[] };
}

const ADMIN_KEY = "pegue2026";

export default function AdminPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [enviandoLembrete, setEnviandoLembrete] = useState<string | null>(null);

  async function carregarDados() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin-dashboard?key=${ADMIN_KEY}`);
      const result = await r.json();
      if (r.ok) setData(result);
      else setErro(result.error);
    } catch { setErro("Erro de conexao"); }
    setLoading(false);
  }

  useEffect(() => { carregarDados(); }, []);

  async function enviarLembrete(phone: string) {
    setEnviandoLembrete(phone);
    try {
      await fetch("/api/enviar-lembrete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, key: ADMIN_KEY }),
      });
    } catch {}
    setEnviandoLembrete(null);
  }

  const statusCor: Record<string, string> = {
    concluida: "text-green-400", aceita: "text-blue-400", paga: "text-[#C9A84C]",
    pendente: "text-yellow-400", problema: "text-red-400",
  };

  const stepNome: Record<string, string> = {
    aguardando_servico: "Escolhendo servico", aguardando_localizacao: "Informando local",
    aguardando_foto: "Enviando foto", aguardando_mais_fotos: "Mais fotos",
    aguardando_destino: "Informando destino", aguardando_tipo_local: "Tipo do local",
    aguardando_andar: "Informando andar", aguardando_ajudante: "Ajudante",
    aguardando_data: "Escolhendo data", aguardando_confirmacao: "Confirmando",
  };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#000]">
      <Loader2 className="h-10 w-10 animate-spin text-[#C9A84C]" />
    </div>
  );

  if (erro || !data) return (
    <div className="flex min-h-screen items-center justify-center bg-[#000] text-red-400">{erro}</div>
  );

  const funilMax = Math.max(data.funil.iniciaramConversa, 1);

  return (
    <div className="min-h-screen bg-[#000] p-4 text-white md:p-6">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-[#C9A84C]" />
          <div>
            <h1 className="text-2xl font-extrabold">Painel <span className="text-[#C9A84C]">Pegue</span></h1>
            <p className="text-xs text-gray-500">Dashboard administrativo</p>
          </div>
        </div>
        <button onClick={carregarDados} className="flex items-center gap-2 rounded-lg bg-[#C9A84C]/10 px-4 py-2 text-sm text-[#C9A84C] hover:bg-[#C9A84C]/20">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-5">
        {[
          { icon: <MessageCircle className="h-5 w-5" />, label: "Contatos hoje", valor: data.resumo.contatosHoje, cor: "text-blue-400" },
          { icon: <Truck className="h-5 w-5" />, label: "Fretes fechados", valor: data.corridas.total, cor: "text-[#C9A84C]" },
          { icon: <DollarSign className="h-5 w-5" />, label: "Faturamento mes", valor: `R$ ${data.financeiro.faturamentoMes}`, cor: "text-green-400" },
          { icon: <DollarSign className="h-5 w-5" />, label: "Comissao Pegue", valor: `R$ ${data.financeiro.comissaoMes}`, cor: "text-[#C9A84C]" },
          { icon: <TrendingUp className="h-5 w-5" />, label: "Taxa conversao", valor: `${data.funil.taxaConversao}%`, cor: "text-green-400" },
        ].map((card, i) => (
          <div key={i} className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-4">
            <div className={`mb-2 ${card.cor}`}>{card.icon}</div>
            <p className="text-2xl font-extrabold">{card.valor}</p>
            <p className="text-xs text-gray-500">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <h3 className="mb-4 flex items-center gap-2 font-bold"><Eye className="h-5 w-5 text-[#C9A84C]" /> Funil de conversao</h3>
          <div className="space-y-3">
            {[
              { label: "Iniciaram conversa", valor: data.funil.iniciaramConversa },
              { label: "Enviaram foto", valor: data.funil.enviaramFoto },
              { label: "Receberam orcamento", valor: data.funil.receberamOrcamento },
              { label: "Fecharam", valor: data.funil.fecharam },
            ].map((item, i) => (
              <div key={i}>
                <div className="mb-1 flex justify-between text-sm"><span className="text-gray-400">{item.label}</span><span className="font-bold">{item.valor}</span></div>
                <div className="h-2 rounded-full bg-[#1a1a1a]"><div className="h-full rounded-full bg-[#C9A84C]" style={{ width: `${(item.valor / funilMax) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <h3 className="mb-4 flex items-center gap-2 font-bold"><DollarSign className="h-5 w-5 text-[#C9A84C]" /> Financeiro</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-xs text-gray-500">Faturamento total</p><p className="text-xl font-bold text-green-400">R$ {data.financeiro.faturamentoTotal}</p></div>
            <div><p className="text-xs text-gray-500">Comissao Pegue total</p><p className="text-xl font-bold text-[#C9A84C]">R$ {data.financeiro.comissaoPegue}</p></div>
            <div><p className="text-xs text-gray-500">Ticket medio</p><p className="text-xl font-bold">R$ {data.financeiro.ticketMedio}</p></div>
            <div><p className="text-xs text-gray-500">Corridas concluidas</p><p className="text-xl font-bold">{data.corridas.concluidas}</p></div>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <h3 className="mb-3 flex items-center gap-2 font-bold"><MessageCircle className="h-5 w-5 text-[#C9A84C]" /> Contatos WhatsApp</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Hoje</span><span className="font-bold">{data.resumo.contatosHoje}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Semana</span><span className="font-bold">{data.resumo.contatosSemana}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Mes</span><span className="font-bold">{data.resumo.contatosMes}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Total</span><span className="font-bold">{data.resumo.contatosTotal}</span></div>
          </div>
        </div>
        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <h3 className="mb-3 flex items-center gap-2 font-bold"><Users className="h-5 w-5 text-[#C9A84C]" /> Clientes</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Total</span><span className="font-bold">{data.clientes.total}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Novos este mes</span><span className="font-bold text-green-400">{data.clientes.novosMes}</span></div>
          </div>
        </div>
        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <h3 className="mb-3 flex items-center gap-2 font-bold"><Truck className="h-5 w-5 text-[#C9A84C]" /> Prestadores</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Total</span><span className="font-bold">{data.prestadores.total}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Ativos</span><span className="font-bold text-green-400">{data.prestadores.ativos}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Pendentes</span><span className="font-bold text-yellow-400">{data.prestadores.pendentes}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Score medio</span><span className="font-bold">{data.prestadores.scoreMedio}</span></div>
          </div>
        </div>
      </div>

      {data.abandonos.length > 0 && (
        <div className="mb-6 rounded-xl border border-red-800/30 bg-red-900/10 p-5">
          <h3 className="mb-4 flex items-center gap-2 font-bold text-red-400"><AlertTriangle className="h-5 w-5" /> Abandonos ({data.abandonos.length})</h3>
          <div className="space-y-2">
            {data.abandonos.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-red-800/20 bg-[#0A0A0A] p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{a.phone}</p>
                  <p className="text-xs text-gray-500">Parou em: {stepNome[a.step] || a.step}{a.carga ? ` | ${a.carga}` : ""}{a.valor ? ` | R$ ${a.valor}` : ""}</p>
                </div>
                <button onClick={() => enviarLembrete(a.phone)} disabled={enviandoLembrete === a.phone} className="flex items-center gap-1 rounded-lg bg-[#C9A84C]/10 px-3 py-2 text-xs text-[#C9A84C] hover:bg-[#C9A84C]/20 disabled:opacity-50">
                  {enviandoLembrete === a.phone ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Lembrete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <h3 className="mb-4 flex items-center gap-2 font-bold"><Package className="h-5 w-5 text-[#C9A84C]" /> Ultimas corridas</h3>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {data.ultimasCorridas.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-[#C9A84C]/10 bg-[#000] p-3">
                <div className="flex-1"><p className="text-sm font-medium">{c.carga || "Frete"}</p><p className="text-xs text-gray-500">{c.data} {c.prestador ? `- ${c.prestador}` : ""}</p></div>
                <div className="text-right"><p className="font-bold text-[#C9A84C]">R$ {c.valor || 0}</p><span className={`text-xs ${statusCor[c.status] || "text-gray-400"}`}>{c.status}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <h3 className="mb-4 flex items-center gap-2 font-bold"><Star className="h-5 w-5 text-[#C9A84C]" /> Avaliacoes</h3>
          <div className="mb-4 flex items-center gap-4">
            <div className="text-center"><p className="text-3xl font-extrabold text-[#C9A84C]">{data.avaliacoes.notaMedia || "---"}</p><p className="text-xs text-gray-500">Nota media</p></div>
            <div className="text-center"><p className="text-3xl font-extrabold">{data.avaliacoes.total}</p><p className="text-xs text-gray-500">Avaliacoes</p></div>
          </div>
          {data.avaliacoes.sugestoes.length > 0 && (
            <div><p className="mb-2 text-xs font-bold text-gray-400">Sugestoes:</p><div className="max-h-48 space-y-2 overflow-y-auto">{data.avaliacoes.sugestoes.map((s, i) => (<div key={i} className="rounded-lg bg-[#000] p-2 text-xs text-gray-300">&quot;{s}&quot;</div>))}</div></div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
        <h3 className="mb-4 flex items-center gap-2 font-bold"><Truck className="h-5 w-5 text-[#C9A84C]" /> Prestadores</h3>
        <div className="space-y-2">
          {data.prestadores.lista.map((p, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-[#C9A84C]/10 bg-[#000] p-3">
              <div><p className="font-medium">{p.nome}</p><p className="text-xs text-gray-500">{p.telefone} | {p.fretes} fretes</p></div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#C9A84C]">⭐ {p.score}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${p.status === "aprovado" ? "bg-green-400/10 text-green-400" : "bg-yellow-400/10 text-yellow-400"}`}>
                  {p.status === "aprovado" ? (p.disponivel ? "Ativo" : "Pausado") : "Pendente"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
