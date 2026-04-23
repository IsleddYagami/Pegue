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
  prestadores: {
    total: number; ativos: number; pendentes: number; scoreMedio: number;
    pendentesDetalhados: { id: string; nome: string; telefone: string; cpf: string; veiculo: { tipo: string; placa: string } | null; dataAceite: string | null; email: string | null }[];
    lista: { nome: string; telefone: string; status: string; score: number; disponivel: boolean; fretes: number }[];
  };
  ultimasCorridas: { id: string; status: string; valor: number | null; comissao: number | null; carga: string | null; origem: string | null; destino: string | null; data: string; prestador: string | null }[];
  avaliacoes: { notaMedia: number; total: number; sugestoes: string[] };
  graficos: {
    contatosPorHora: number[];
    contatosPorDia: { dia: string; qtd: number }[];
    topRegioes: { nome: string; qtd: number }[];
    genero: { masculino: number; feminino: number; indefinido: number };
    ticketsPorFaixa: { label: string; qtd: number }[];
  };
}

export default function AdminPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [enviandoLembrete, setEnviandoLembrete] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [autenticado, setAutenticado] = useState(false);

  async function carregarDados(key?: string) {
    const chave = key || senha;
    setLoading(true);
    setErro("");
    try {
      const r = await fetch(`/api/admin-dashboard?key=${chave}`);
      const result = await r.json();
      if (r.ok) {
        setData(result);
        setAutenticado(true);
      } else {
        setErro("Senha incorreta");
        setAutenticado(false);
      }
    } catch { setErro("Erro de conexao"); }
    setLoading(false);
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    carregarDados();
  }

  async function acaoPrestador(id: string, acao: "aprovar" | "rejeitar") {
    try {
      await fetch("/api/admin-prestador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: senha, prestadorId: id, acao }),
      });
      carregarDados();
    } catch {}
  }

  async function enviarLembrete(phone: string) {
    setEnviandoLembrete(phone);
    try {
      await fetch("/api/enviar-lembrete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, key: senha }),
      });
    } catch {}
    setEnviandoLembrete(null);
  }

  function formatarTel(phone: string): string {
    const d = phone.replace(/\D/g, "");
    if (d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    return phone;
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

  if (!autenticado) return (
    <div className="flex min-h-screen items-center justify-center bg-[#000]">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-8">
        <div className="text-center">
          <Shield className="mx-auto mb-3 h-12 w-12 text-[#C9A84C]" />
          <h2 className="text-xl font-bold">Painel <span className="text-[#C9A84C]">Pegue</span></h2>
          <p className="mt-1 text-sm text-gray-500">Acesso restrito</p>
        </div>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="Digite a senha"
          className="w-full rounded-lg border border-[#C9A84C]/30 bg-[#000] px-4 py-3 text-center text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
          autoFocus
        />
        {erro && <p className="text-center text-sm text-red-400">{erro}</p>}
        <button
          type="submit"
          disabled={loading || !senha}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#C9A84C] py-3 font-bold text-[#000] transition-all hover:scale-[1.02] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Acessar"}
        </button>
      </form>
    </div>
  );

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#000]">
      <Loader2 className="h-10 w-10 animate-spin text-[#C9A84C]" />
    </div>
  );

  if (!data) return null;
  const funilMax = Math.max(data.funil.iniciaramConversa, 1);

  return (
    <div className="min-h-screen bg-[#000] px-3 py-4 text-white md:p-6 overflow-x-hidden">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-[#C9A84C]" />
          <div>
            <h1 className="text-2xl font-extrabold">Painel <span className="text-[#C9A84C]">Pegue</span></h1>
            <p className="text-xs text-gray-500">Dashboard administrativo</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/admin/revisao-precos" className="flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2 text-sm font-bold text-orange-400 hover:bg-orange-500/20 transition-all">
            <AlertTriangle className="h-4 w-4" /> Revisao Precos
          </a>
          <a href="/admin/operacao" className="flex items-center gap-2 rounded-lg bg-[#C9A84C] px-4 py-2 text-sm font-bold text-[#000] hover:scale-[1.02] transition-all">
            <DollarSign className="h-4 w-4" /> Operacao
          </a>
          <a href="/admin/controle" className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-400 hover:bg-red-500/20 transition-all">
            <Shield className="h-4 w-4" /> Controle
          </a>
          <button onClick={() => carregarDados()} className="flex items-center gap-2 rounded-lg bg-[#C9A84C]/10 px-4 py-2 text-sm text-[#C9A84C] hover:bg-[#C9A84C]/20">
            <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { icon: <MessageCircle className="h-5 w-5" />, label: "Contatos hoje", valor: data.resumo.contatosHoje, cor: "text-blue-400" },
          { icon: <Truck className="h-5 w-5" />, label: "Fretes fechados", valor: data.corridas.total, cor: "text-[#C9A84C]" },
          { icon: <DollarSign className="h-5 w-5" />, label: "Faturamento mes", valor: `R$ ${data.financeiro.faturamentoMes}`, cor: "text-green-400" },
          { icon: <DollarSign className="h-5 w-5" />, label: "Comissao Pegue", valor: `R$ ${data.financeiro.comissaoMes}`, cor: "text-[#C9A84C]" },
          { icon: <TrendingUp className="h-5 w-5" />, label: "Taxa conversao", valor: `${data.funil.taxaConversao}%`, cor: "text-green-400" },
        ].map((card, i) => (
          <div key={i} className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-4">
            <div className={`mb-2 ${card.cor}`}>{card.icon}</div>
            <p className="text-xl font-extrabold md:text-2xl">{card.valor}</p>
            <p className="text-[10px] text-gray-500 md:text-xs">{card.label}</p>
          </div>
        ))}
      </div>

      {/* PRESTADORES PENDENTES - Aguardando aprovacao */}
      {data.prestadores.pendentesDetalhados.length > 0 && (
        <div className="mb-6 rounded-xl border-2 border-[#C9A84C]/40 bg-[#C9A84C]/5 p-4 md:p-5">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-[#C9A84C]">
            <Shield className="h-6 w-6" />
            Prestadores aguardando aprovacao ({data.prestadores.pendentesDetalhados.length})
          </h3>
          <div className="space-y-3">
            {data.prestadores.pendentesDetalhados.map((p) => {
              const veiculoNomes: Record<string, string> = {
                carro_comum: "Carro Comum", utilitario: "Utilitario", hr: "HR", caminhao_bau: "Caminhao Bau",
              };
              return (
                <div key={p.id} className="rounded-xl border border-[#C9A84C]/20 bg-[#000] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 space-y-1">
                      <p className="text-lg font-bold">{p.nome}</p>
                      <p className="text-sm text-gray-400">📱 {formatarTel(p.telefone)}</p>
                      {p.cpf && <p className="text-sm text-gray-400">📋 CPF: {p.cpf.substring(0,3)}.***.***-{p.cpf.substring(9)}</p>}
                      {p.email && <p className="text-sm text-gray-400">📧 {p.email}</p>}
                      {p.veiculo && (
                        <p className="text-sm text-gray-400">
                          🚗 {veiculoNomes[p.veiculo.tipo] || p.veiculo.tipo} · Placa: {p.veiculo.placa}
                        </p>
                      )}
                      {p.dataAceite && <p className="text-xs text-gray-500">Aceite termos: {p.dataAceite}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => acaoPrestador(p.id, "aprovar")}
                        className="flex items-center gap-1 rounded-lg bg-green-500/20 px-4 py-2 text-sm font-bold text-green-400 hover:bg-green-500/30 transition-all"
                      >
                        <CheckCircle className="h-4 w-4" /> Aprovar
                      </button>
                      <button
                        onClick={() => acaoPrestador(p.id, "rejeitar")}
                        className="flex items-center gap-1 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-bold text-red-400 hover:bg-red-500/30 transition-all"
                      >
                        <XCircle className="h-4 w-4" /> Rejeitar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* RECUPERAR CLIENTES - Carrinho abandonado */}
      <div className="mb-6 rounded-xl border-2 border-[#C9A84C]/30 bg-[#0A0A0A] p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <AlertTriangle className="h-6 w-6 text-[#C9A84C]" />
            Recuperar clientes ({data.abandonos.length})
          </h3>
          {data.abandonos.length > 0 && (
            <button
              onClick={async () => {
                for (const a of data.abandonos) {
                  await enviarLembrete(a.phone);
                }
              }}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#C9A84C] px-4 py-2 text-sm font-bold text-[#000] transition-all hover:scale-[1.02]"
            >
              <Send className="h-4 w-4" /> Enviar lembrete pra todos
            </button>
          )}
        </div>
        {data.abandonos.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.abandonos.map((a, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-[#C9A84C]/10 bg-[#000] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{formatarTel(a.phone)}</p>
                  <p className="text-xs text-gray-500 truncate">
                    Parou em: {stepNome[a.step] || a.step}
                    {a.carga ? ` · ${a.carga}` : ""}
                    {a.valor ? ` · R$ ${a.valor}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => enviarLembrete(a.phone)}
                  disabled={enviandoLembrete === a.phone}
                  className="flex items-center justify-center gap-1 rounded-lg bg-[#C9A84C]/10 px-3 py-2 text-xs font-medium text-[#C9A84C] hover:bg-[#C9A84C]/20 disabled:opacity-50 shrink-0"
                >
                  {enviandoLembrete === a.phone ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Recuperar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nenhum cliente abandonou a cotacao. Otimo! 🎉</p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
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

      {/* GRAFICOS */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Horarios mais movimentados */}
        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <h3 className="mb-4 flex items-center gap-2 font-bold"><Clock className="h-5 w-5 text-[#C9A84C]" /> Horarios mais movimentados</h3>
          <div className="flex items-end gap-[2px] md:gap-1" style={{ height: "100px" }}>
            {data.graficos.contatosPorHora.map((qtd, hora) => {
              const max = Math.max(...data.graficos.contatosPorHora, 1);
              const altura = (qtd / max) * 100;
              return (
                <div key={hora} className="group relative flex-1" title={`${hora}h: ${qtd} contatos`}>
                  <div
                    className="w-full rounded-t bg-[#C9A84C] transition-all hover:bg-[#e8c55a]"
                    style={{ height: `${Math.max(altura, 2)}%` }}
                  />
                  {hora % 3 === 0 && <p className="mt-1 text-center text-[8px] text-gray-500">{hora}h</p>}
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block rounded bg-[#C9A84C] px-1.5 py-0.5 text-[9px] font-bold text-[#000]">{qtd}</div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[10px] text-gray-500">Horario de SP (UTC-3)</p>
        </div>

        {/* Dias da semana */}
        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <h3 className="mb-4 flex items-center gap-2 font-bold"><BarChart3 className="h-5 w-5 text-[#C9A84C]" /> Dias da semana</h3>
          <div className="space-y-2">
            {data.graficos.contatosPorDia.map((d, i) => {
              const max = Math.max(...data.graficos.contatosPorDia.map(x => x.qtd), 1);
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-8 text-xs text-gray-400">{d.dia}</span>
                  <div className="flex-1 h-4 rounded-full bg-[#1a1a1a]">
                    <div className="h-full rounded-full bg-[#C9A84C] transition-all" style={{ width: `${(d.qtd / max) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right text-xs font-bold">{d.qtd}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Regioes */}
        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <h3 className="mb-4 flex items-center gap-2 font-bold"><TrendingUp className="h-5 w-5 text-[#C9A84C]" /> Regioes mais atendidas</h3>
          {data.graficos.topRegioes.length > 0 ? (
            <div className="space-y-2">
              {data.graficos.topRegioes.map((r, i) => {
                const max = Math.max(...data.graficos.topRegioes.map(x => x.qtd), 1);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#C9A84C]/10 text-[9px] font-bold text-[#C9A84C]">{i + 1}</span>
                    <span className="flex-1 text-sm truncate">{r.nome}</span>
                    <div className="w-24 h-3 rounded-full bg-[#1a1a1a]">
                      <div className="h-full rounded-full bg-[#C9A84C]" style={{ width: `${(r.qtd / max) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right text-xs font-bold">{r.qtd}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Sem dados ainda</p>
          )}
        </div>

        {/* Ticket medio por faixa */}
        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <h3 className="mb-4 flex items-center gap-2 font-bold"><DollarSign className="h-5 w-5 text-[#C9A84C]" /> Ticket medio por faixa</h3>
          <div className="space-y-2">
            {data.graficos.ticketsPorFaixa.map((t, i) => {
              const max = Math.max(...data.graficos.ticketsPorFaixa.map(x => x.qtd), 1);
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-20 text-xs text-gray-400 shrink-0">{t.label}</span>
                  <div className="flex-1 h-4 rounded-full bg-[#1a1a1a]">
                    <div className="h-full rounded-full bg-[#C9A84C] transition-all" style={{ width: `${(t.qtd / max) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right text-xs font-bold">{t.qtd}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Genero */}
        <div className="rounded-xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <h3 className="mb-4 flex items-center gap-2 font-bold"><Users className="h-5 w-5 text-[#C9A84C]" /> Perfil dos clientes</h3>
          {(() => {
            const total = data.graficos.genero.masculino + data.graficos.genero.feminino + data.graficos.genero.indefinido;
            if (total === 0) return <p className="text-sm text-gray-500">Sem dados ainda</p>;
            const pctM = Math.round((data.graficos.genero.masculino / total) * 100);
            const pctF = Math.round((data.graficos.genero.feminino / total) * 100);
            const pctI = 100 - pctM - pctF;
            return (
              <div className="space-y-4">
                <div className="flex h-6 overflow-hidden rounded-full">
                  {pctM > 0 && <div className="bg-blue-500 flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${pctM}%` }}>{pctM}%</div>}
                  {pctF > 0 && <div className="bg-pink-500 flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${pctF}%` }}>{pctF}%</div>}
                  {pctI > 0 && <div className="bg-gray-600 flex items-center justify-center text-[9px] font-bold text-white" style={{ width: `${pctI}%` }}>{pctI}%</div>}
                </div>
                <div className="flex flex-wrap justify-center gap-3 text-xs md:gap-6 md:text-sm">
                  <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-blue-500" /><span>Masculino ({data.graficos.genero.masculino})</span></div>
                  <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-pink-500" /><span>Feminino ({data.graficos.genero.feminino})</span></div>
                  <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full bg-gray-600" /><span>N/D ({data.graficos.genero.indefinido})</span></div>
                </div>
                <p className="text-center text-[10px] text-gray-500">*Estimativa baseada nos nomes dos clientes</p>
              </div>
            );
          })()}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
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


      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
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
