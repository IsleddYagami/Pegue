"use client";
import { fetchComTimeout } from "@/lib/fetch-utils";

import { useState } from "react";
import {
  Search, Truck, Star, DollarSign, CheckCircle, AlertCircle,
  Clock, Loader2, TrendingUp, TrendingDown, Fuel, MapPin,
  BarChart3, Target, Award, Package,
} from "lucide-react";

interface DashboardData {
  nome: string;
  score: number;
  totalFretes: number;
  status: string;
  disponivel: boolean;
  veiculo?: { tipo: string; placa: string };
  financeiro: {
    faturamentoTotal: number;
    faturamentoMes: number;
    faturamentoSemana: number;
    faturamentoMesAnterior: number;
    variacao: number;
    combustivelEstimado: number;
    lucroReal: number;
    kmTotal: number;
  };
  topRegioes: { nome: string; qtd: number }[];
  historico: {
    destino: string;
    origem: string;
    valor: number;
    carga: string;
    data: string;
    status: string;
  }[];
  avaliacao: { media: number; total: number };
  meta: { fretesMes: number; metaMensal: number; progressoMeta: number };
  controlefinanceiro: {
    totalGastosMes: number;
    ganhosMes: number;
    lucroLiquido: number;
    categorias: { nome: string; valor: number; pct: number }[];
    ultimasDespesas: { descricao: string; valor: number; data: string }[];
  };
}

export function DashboardParceiro() {
  const [telefone, setTelefone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpEnviado, setOtpEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);

  // Audit 1/Mai/2026: agora exige OTP via WhatsApp pra acessar dados
  // pessoais (faturamento, despesas, fretes). Antes endpoint expunha sem auth.
  const handleSolicitarOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");

    const tel = telefone.replace(/\D/g, "");
    if (tel.length < 10) {
      setErro("Informe um telefone valido");
      return;
    }

    setLoading(true);
    try {
      const res = await fetchComTimeout(`/api/dashboard-parceiro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `55${tel}` }),
      });
      if (res.status === 429) {
        setErro("Muitas tentativas. Aguarde 1 minuto.");
      } else if (res.ok) {
        setOtpEnviado(true);
      } else {
        setErro("Telefone invalido.");
      }
    } catch {
      setErro("Erro de conexao.");
    }
    setLoading(false);
  };

  const handleValidarOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setData(null);

    const tel = telefone.replace(/\D/g, "");
    const codigo = otp.replace(/\D/g, "");
    if (codigo.length !== 6) {
      setErro("Codigo deve ter 6 digitos");
      return;
    }

    setLoading(true);
    try {
      const res = await fetchComTimeout(`/api/dashboard-parceiro?phone=55${tel}&otp=${codigo}`);
      const result = await res.json();
      if (res.ok && result.nome) {
        setData(result);
      } else {
        setErro(result.error || "Codigo incorreto");
      }
    } catch {
      setErro("Erro de conexao.");
    }
    setLoading(false);
  };

  const veiculoNomes: Record<string, string> = {
    carro_comum: "Carro Comum",
    utilitario: "Utilitario",
    hr: "HR",
    caminhao_bau: "Caminhao Bau",
  };

  const statusConfig = (status: string, disponivel: boolean) => {
    if (status === "aprovado" && disponivel) return { icon: <CheckCircle className="h-4 w-4" />, texto: "Ativo", cor: "text-green-400 bg-green-400/10" };
    if (status === "aprovado") return { icon: <Clock className="h-4 w-4" />, texto: "Pausado", cor: "text-yellow-400 bg-yellow-400/10" };
    if (status === "pendente") return { icon: <Clock className="h-4 w-4" />, texto: "Em analise", cor: "text-blue-400 bg-blue-400/10" };
    return { icon: <AlertCircle className="h-4 w-4" />, texto: "Inativo", cor: "text-red-400 bg-red-400/10" };
  };

  const statusInfo = data ? statusConfig(data.status, data.disponivel) : null;

  if (!data) {
    if (!otpEnviado) {
      return (
        <form onSubmit={handleSolicitarOtp} className="mx-auto max-w-md space-y-4">
          <p className="text-center text-gray-400">
            Digite seu telefone — vamos te enviar um codigo no WhatsApp pra liberar seu painel.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value.replace(/\D/g, "").slice(0, 11))}
              className="flex-1 rounded-lg border border-[#C9A84C]/30 bg-[#0A0A0A] px-4 py-3 text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
              placeholder="11999999999"
            />
            <button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-[#C9A84C] px-6 py-3 font-bold text-[#000000] transition-all hover:scale-[1.02] disabled:opacity-50">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            </button>
          </div>
          {erro && <p className="text-center text-sm text-red-400">{erro}</p>}
        </form>
      );
    }

    return (
      <form onSubmit={handleValidarOtp} className="mx-auto max-w-md space-y-4">
        <p className="text-center text-gray-400">
          Mandamos um codigo de 6 digitos pro seu WhatsApp. Cola aqui pra acessar.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="flex-1 rounded-lg border border-[#C9A84C]/30 bg-[#0A0A0A] px-4 py-3 text-center text-2xl tracking-widest text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
            placeholder="000000"
            inputMode="numeric"
            autoFocus
          />
          <button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-[#C9A84C] px-6 py-3 font-bold text-[#000000] transition-all hover:scale-[1.02] disabled:opacity-50">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => { setOtpEnviado(false); setOtp(""); setErro(""); }}
          className="w-full text-center text-sm text-gray-500 underline hover:text-gray-300"
        >
          Trocar telefone
        </button>
        {erro && <p className="text-center text-sm text-red-400">{erro}</p>}
      </form>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Cabecalho */}
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6 md:flex-row md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A84C]/10">
            <Truck className="h-7 w-7 text-[#C9A84C]" />
          </div>
          <div>
            <h3 className="text-xl font-bold">{data.nome}</h3>
            {data.veiculo && (
              <p className="text-sm text-gray-500">{veiculoNomes[data.veiculo.tipo] || data.veiculo.tipo} - {data.veiculo.placa}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {statusInfo && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${statusInfo.cor}`}>
              {statusInfo.icon} {statusInfo.texto}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-[#C9A84C]/10 px-3 py-1 text-sm font-medium text-[#C9A84C]">
            <Star className="h-4 w-4" /> {data.score.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Meta mensal */}
      <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-[#C9A84C]" />
            <span className="font-bold">Meta mensal</span>
          </div>
          <span className="text-sm text-gray-400">{data.meta.fretesMes} de {data.meta.metaMensal} fretes</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-[#1a1a1a]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#C9A84C] to-[#e8c55a] transition-all duration-500"
            style={{ width: `${data.meta.progressoMeta}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {data.meta.progressoMeta >= 100
            ? "🏆 Meta batida! Voce e demais!"
            : `Faltam ${data.meta.metaMensal - data.meta.fretesMes} fretes pra bater a meta!`}
        </p>
      </div>

      {/* Cards financeiros */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-400">
            <DollarSign className="h-4 w-4 text-[#C9A84C]" /> Este mes
          </div>
          <p className="text-2xl font-bold text-[#C9A84C]">R$ {data.financeiro.faturamentoMes.toFixed(0)}</p>
          {data.financeiro.variacao !== 0 && (
            <p className={`mt-1 flex items-center gap-1 text-xs ${data.financeiro.variacao > 0 ? "text-green-400" : "text-red-400"}`}>
              {data.financeiro.variacao > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {data.financeiro.variacao > 0 ? "+" : ""}{data.financeiro.variacao}% vs mes anterior
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-400">
            <DollarSign className="h-4 w-4 text-green-400" /> Semana
          </div>
          <p className="text-2xl font-bold text-white">R$ {data.financeiro.faturamentoSemana.toFixed(0)}</p>
        </div>

        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-400">
            <Fuel className="h-4 w-4 text-orange-400" /> Combustivel est.
          </div>
          <p className="text-2xl font-bold text-orange-400">R$ {data.financeiro.combustivelEstimado}</p>
          <p className="mt-1 text-xs text-gray-500">{data.financeiro.kmTotal} km rodados</p>
        </div>

        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-400">
            <TrendingUp className="h-4 w-4 text-green-400" /> Lucro real
          </div>
          <p className="text-2xl font-bold text-green-400">R$ {data.financeiro.lucroReal.toFixed(0)}</p>
          <p className="mt-1 text-xs text-gray-500">Faturamento - combustivel</p>
        </div>
      </div>

      {/* Metricas extras */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5 text-center">
          <Truck className="mx-auto mb-2 h-8 w-8 text-[#C9A84C]" />
          <p className="text-3xl font-bold">{data.totalFretes}</p>
          <p className="text-sm text-gray-400">Fretes realizados</p>
        </div>
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5 text-center">
          <DollarSign className="mx-auto mb-2 h-8 w-8 text-[#C9A84C]" />
          <p className="text-3xl font-bold text-[#C9A84C]">R$ {data.financeiro.faturamentoTotal.toFixed(0)}</p>
          <p className="text-sm text-gray-400">Faturamento total</p>
        </div>
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5 text-center">
          <TrendingUp className="mx-auto mb-2 h-8 w-8 text-[#C9A84C]" />
          <p className="text-3xl font-bold text-white">R$ {data.totalFretes > 0 ? Math.round(data.financeiro.faturamentoTotal / data.totalFretes) : 0}</p>
          <p className="text-sm text-gray-400">Ticket medio</p>
        </div>
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5 text-center">
          <Award className="mx-auto mb-2 h-8 w-8 text-[#C9A84C]" />
          <p className="text-3xl font-bold">{data.avaliacao.media > 0 ? data.avaliacao.media.toFixed(1) : "---"}</p>
          <p className="text-sm text-gray-400">Nota media ({data.avaliacao.total} avaliacoes)</p>
        </div>
      </div>

      {/* CONTROLE FINANCEIRO */}
      <div className="rounded-2xl border-2 border-[#C9A84C]/30 bg-[#C9A84C]/5 p-6">
        <h4 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <DollarSign className="h-6 w-6 text-[#C9A84C]" /> Controle Financeiro Pessoal
        </h4>

        {/* Ganhos vs Gastos vs Lucro */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-[#0A0A0A] p-4 text-center">
            <p className="text-xs text-gray-400">Ganhos (mes)</p>
            <p className="text-xl font-bold text-green-400">R$ {data.controlefinanceiro.ganhosMes.toFixed(0)}</p>
          </div>
          <div className="rounded-xl bg-[#0A0A0A] p-4 text-center">
            <p className="text-xs text-gray-400">Gastos (mes)</p>
            <p className="text-xl font-bold text-red-400">R$ {data.controlefinanceiro.totalGastosMes.toFixed(0)}</p>
          </div>
          <div className="rounded-xl bg-[#0A0A0A] p-4 text-center">
            <p className="text-xs text-gray-400">Lucro liquido</p>
            <p className={`text-xl font-bold ${data.controlefinanceiro.lucroLiquido >= 0 ? "text-green-400" : "text-red-400"}`}>
              R$ {data.controlefinanceiro.lucroLiquido.toFixed(0)}
            </p>
          </div>
        </div>

        {/* Grafico de categorias */}
        {data.controlefinanceiro.categorias.length > 0 ? (
          <div className="mb-4">
            <p className="mb-3 text-sm font-medium text-gray-300">Com o que voce mais gasta:</p>

            {/* Barra empilhada colorida */}
            <div className="mb-3 flex h-8 overflow-hidden rounded-full">
              {data.controlefinanceiro.categorias.map((c, i) => {
                const cores = ["bg-[#C9A84C]", "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-cyan-500"];
                return (
                  <div
                    key={i}
                    className={`${cores[i % cores.length]} flex items-center justify-center text-[8px] font-bold text-white`}
                    style={{ width: `${Math.max(c.pct, 5)}%` }}
                    title={`${c.nome}: R$ ${c.valor.toFixed(2)} (${c.pct}%)`}
                  >
                    {c.pct >= 10 ? `${c.pct}%` : ""}
                  </div>
                );
              })}
            </div>

            {/* Legenda */}
            <div className="flex flex-wrap gap-3">
              {data.controlefinanceiro.categorias.map((c, i) => {
                const cores = ["bg-[#C9A84C]", "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-cyan-500"];
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className={`h-3 w-3 rounded-full ${cores[i % cores.length]}`} />
                    <span className="text-xs text-gray-400">{c.nome}: R$ {c.valor.toFixed(0)} ({c.pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="mb-4 text-sm text-gray-500">Nenhuma despesa registrada. No WhatsApp, envie: <strong className="text-[#C9A84C]">despesa 50 combustivel</strong></p>
        )}

        {/* Ultimas despesas */}
        {data.controlefinanceiro.ultimasDespesas.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-300">Ultimas despesas:</p>
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {data.controlefinanceiro.ultimasDespesas.map((d, i) => (
                <div key={i} className="flex items-center justify-between rounded bg-[#0A0A0A] px-3 py-1.5 text-xs">
                  <span className="text-gray-400">{d.descricao}</span>
                  <span className="font-bold text-red-400">- R$ {d.valor.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Regioes + Historico */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Regioes mais atendidas */}
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
          <div className="mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#C9A84C]" />
            <h4 className="font-bold">Regioes mais atendidas</h4>
          </div>
          {data.topRegioes.length > 0 ? (
            <div className="space-y-3">
              {data.topRegioes.map((r, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#C9A84C]/10 text-xs font-bold text-[#C9A84C]">{i + 1}</span>
                    <span className="text-sm">{r.nome}</span>
                  </div>
                  <span className="text-sm text-gray-400">{r.qtd} fretes</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Nenhum frete concluido ainda</p>
          )}
        </div>

        {/* Dicas da Pegue */}
        <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#C9A84C]" />
            <h4 className="font-bold">Dicas da Pegue</h4>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg bg-[#C9A84C]/5 p-3">
              <p className="text-sm text-[#C9A84C]">💡 Regiao com mais demanda essa semana: <strong>Osasco e Zona Oeste SP</strong></p>
            </div>
            <div className="rounded-lg bg-[#C9A84C]/5 p-3">
              <p className="text-sm text-[#C9A84C]">📸 Sempre tire fotos antes e depois - protege voce!</p>
            </div>
            <div className="rounded-lg bg-[#C9A84C]/5 p-3">
              <p className="text-sm text-[#C9A84C]">⭐ Score alto = mais indicacoes. Capriche no atendimento!</p>
            </div>
          </div>
        </div>
      </div>

      {/* Historico de fretes */}
      <div className="rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
        <div className="mb-4 flex items-center gap-2">
          <Package className="h-5 w-5 text-[#C9A84C]" />
          <h4 className="font-bold">Historico de fretes</h4>
        </div>
        {data.historico.length > 0 ? (
          <div className="space-y-3">
            {data.historico.map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-[#C9A84C]/10 bg-[#000000] p-4">
                <div className="flex-1">
                  <p className="text-sm font-medium">{h.carga}</p>
                  <p className="text-xs text-gray-500">{h.origem.substring(0, 30)} → {h.destino.substring(0, 30)}</p>
                  <p className="text-xs text-gray-500">{h.data}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#C9A84C]">R$ {h.valor.toFixed(0)}</p>
                  <span className={`text-xs ${h.status === "concluida" ? "text-green-400" : h.status === "pendente" ? "text-yellow-400" : "text-gray-400"}`}>
                    {h.status === "concluida" ? "Concluido" : h.status === "aceita" ? "Aceito" : h.status === "paga" ? "Pago" : h.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Nenhum frete registrado ainda. Comece a aceitar indicacoes!</p>
        )}
      </div>

      {/* Motivacional */}
      <div className="rounded-2xl border border-[#C9A84C]/30 bg-gradient-to-r from-[#C9A84C]/10 to-transparent p-6 text-center">
        <p className="text-lg">
          {data.score >= 8
            ? "🏆 Excelente! Voce esta entre os melhores parceiros da Pegue!"
            : data.score >= 5
            ? "👍 Bom trabalho! Continue assim pra subir no ranking!"
            : "⚠️ Melhore seu atendimento pra receber mais indicacoes!"}
        </p>
        <p className="mt-2 text-sm text-gray-400">Siga @chamepegue no Instagram pra vagas e novidades!</p>
      </div>

      {/* Voltar */}
      <button
        onClick={() => { setData(null); setTelefone(""); }}
        className="w-full rounded-lg border border-[#C9A84C]/20 py-3 text-sm text-gray-400 transition-all hover:border-[#C9A84C] hover:text-white"
      >
        Consultar outro numero
      </button>
    </div>
  );
}
