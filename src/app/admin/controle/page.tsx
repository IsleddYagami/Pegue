"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Shield, ArrowLeft, Loader2, RefreshCw, Power,
  DollarSign, Users, Truck, MessageCircle, Gift,
  Wrench, AlertTriangle, CheckCircle, XCircle,
} from "lucide-react";

interface Config {
  chave: string;
  valor: string;
  atualizado_em: string;
}

const CONFIG_INFO: Record<string, { label: string; descricao: string; icon: any; cor: string; perigo?: boolean }> = {
  pagamento_automatico_fretista: {
    label: "Pagamento Automatico",
    descricao: "Mercado Pago gera link e processa pagamentos automaticamente",
    icon: DollarSign,
    cor: "text-green-400",
  },
  sistema_afiliados: {
    label: "Sistema de Afiliados",
    descricao: "Programa de indicacao com codigos e comissoes",
    icon: Gift,
    cor: "text-purple-400",
  },
  sistema_guincho: {
    label: "Servico de Guincho",
    descricao: "Aceitar solicitacoes de guincho (carro e moto)",
    icon: Truck,
    cor: "text-blue-400",
  },
  aceitar_novos_prestadores: {
    label: "Aceitar Novos Prestadores",
    descricao: "Permitir novos cadastros de fretistas/guincheiros",
    icon: Users,
    cor: "text-[#C9A84C]",
  },
  aceitar_novos_clientes: {
    label: "Aceitar Novos Clientes",
    descricao: "Permitir novos atendimentos de clientes",
    icon: Users,
    cor: "text-[#C9A84C]",
  },
  notificacoes_whatsapp: {
    label: "Notificacoes WhatsApp",
    descricao: "Enviar notificacoes pro Santos via WhatsApp",
    icon: MessageCircle,
    cor: "text-green-400",
  },
  modo_manutencao: {
    label: "Modo Manutencao",
    descricao: "Desativa todo o sistema temporariamente",
    icon: Wrench,
    cor: "text-red-400",
    perigo: true,
  },
};

export default function ControlePage() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [senha, setSenha] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [alterando, setAlterando] = useState<string | null>(null);

  async function carregarConfigs(key?: string) {
    const chave = key || senha;
    setLoading(true);
    try {
      const r = await fetch("/api/admin-config?key=" + encodeURIComponent(chave));
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        setConfigs(data);
        setAutenticado(true);
      } else {
        alert("Senha incorreta");
      }
    } catch (e) {
      alert("Erro de conexao");
    }
    setLoading(false);
  }

  async function toggleConfig(chave: string, valorAtual: string) {
    setAlterando(chave);
    const novoValor = valorAtual === "habilitado" ? "desabilitado" : "habilitado";
    try {
      await fetch("/api/admin-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: senha, chave, valor: novoValor }),
      });
      setConfigs(prev => prev.map(c => c.chave === chave ? { ...c, valor: novoValor } : c));
    } catch {}
    setAlterando(null);
  }

  if (!autenticado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000]">
        <form onSubmit={(e) => { e.preventDefault(); carregarConfigs(); }} className="w-full max-w-sm space-y-4 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-8">
          <div className="text-center">
            <Shield className="mx-auto mb-3 h-12 w-12 text-[#C9A84C]" />
            <h2 className="text-xl font-bold">Painel de <span className="text-[#C9A84C]">Controle</span></h2>
            <p className="mt-1 text-sm text-gray-500">Acesso restrito</p>
          </div>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Senha" className="w-full rounded-lg border border-[#C9A84C]/30 bg-[#000] px-4 py-3 text-center text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none" autoFocus />
          <button type="submit" disabled={loading || !senha} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#C9A84C] py-3 font-bold text-[#000] disabled:opacity-50">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Acessar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000] px-3 py-4 text-white md:p-6 overflow-x-hidden">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-1 text-sm text-gray-400 hover:text-[#C9A84C]">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <div>
            <h1 className="text-xl font-extrabold">Painel de <span className="text-[#C9A84C]">Controle</span></h1>
            <p className="text-xs text-gray-500">Habilitar e desabilitar funcoes do sistema</p>
          </div>
        </div>
        <button onClick={() => carregarConfigs()} className="flex items-center gap-2 rounded-lg bg-[#C9A84C]/10 px-4 py-2 text-sm text-[#C9A84C] hover:bg-[#C9A84C]/20">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      {/* Alerta */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-4">
        <AlertTriangle className="h-5 w-5 text-[#C9A84C] shrink-0 mt-0.5" />
        <p className="text-sm text-gray-300">
          Cuidado ao alterar estas configuracoes. Mudancas afetam o sistema em tempo real.
          Funcoes desabilitadas ficam inativas imediatamente.
        </p>
      </div>

      {/* Configs */}
      <div className="space-y-3">
        {configs.map((config) => {
          const info = CONFIG_INFO[config.chave] || {
            label: config.chave,
            descricao: "",
            icon: Power,
            cor: "text-gray-400",
          };
          const Icon = info.icon;
          const habilitado = config.valor === "habilitado";

          return (
            <div
              key={config.chave}
              className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between transition-all ${
                info.perigo
                  ? habilitado
                    ? "border-red-500/40 bg-red-500/10"
                    : "border-gray-800 bg-[#0A0A0A]"
                  : habilitado
                  ? "border-green-500/20 bg-[#0A0A0A]"
                  : "border-gray-800 bg-[#0A0A0A] opacity-60"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${info.cor}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold">{info.label}</p>
                  <p className="text-xs text-gray-500">{info.descricao}</p>
                  <p className="mt-1 text-[10px] text-gray-600">
                    Atualizado: {new Date(config.atualizado_em).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>

              <button
                onClick={() => toggleConfig(config.chave, config.valor)}
                disabled={alterando === config.chave}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all shrink-0 ${
                  habilitado
                    ? info.perigo
                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                    : "bg-gray-700/30 text-gray-400 hover:bg-gray-700/50"
                } disabled:opacity-50`}
              >
                {alterando === config.chave ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : habilitado ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {habilitado ? "HABILITADO" : "DESABILITADO"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
