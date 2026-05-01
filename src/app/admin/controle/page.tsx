"use client";
import { fetchComTimeout } from "@/lib/fetch-utils";

import { useState } from "react";
import Link from "next/link";
import { Shield, ArrowLeft, Loader2, RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export default function ControlePage() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [senha, setSenha] = useState("");
  const [logado, setLogado] = useState(false);
  const [erro, setErro] = useState("");

  async function login() {
    setLoading(true);
    setErro("");
    const url = "/api/admin-config?key=" + encodeURIComponent(senha);
    const r = await fetchComTimeout(url);
    const text = await r.text();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        setConfigs(data);
        setLogado(true);
      } else {
        setErro("Senha incorreta");
      }
    } catch {
      setErro("Erro: " + text.substring(0, 100));
    }
    setLoading(false);
  }

  async function toggle(chave: string, valorAtual: string) {
    const novo = valorAtual === "habilitado" ? "desabilitado" : "habilitado";
    await fetchComTimeout("/api/admin-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: senha, chave, valor: novo }),
    });
    setConfigs(prev => prev.map(c => c.chave === chave ? { ...c, valor: novo } : c));
  }

  const labels: Record<string, string> = {
    pagamento_automatico_fretista: "Pagamento Automatico (Mercado Pago)",
    sistema_afiliados: "Sistema de Afiliados",
    sistema_guincho: "Servico de Guincho",
    aceitar_novos_prestadores: "Aceitar Novos Prestadores",
    aceitar_novos_clientes: "Aceitar Novos Clientes",
    notificacoes_whatsapp: "Notificacoes WhatsApp",
    modo_manutencao: "Modo Manutencao (DESATIVA TUDO)",
  };

  if (!logado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000]">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-8">
          <div className="text-center">
            <Shield className="mx-auto mb-3 h-12 w-12 text-[#C9A84C]" />
            <h2 className="text-xl font-bold text-white">Painel de <span className="text-[#C9A84C]">Controle</span></h2>
          </div>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="Senha"
            className="w-full rounded-lg border border-[#C9A84C]/30 bg-[#000] px-4 py-3 text-center text-white focus:border-[#C9A84C] focus:outline-none"
          />
          {erro && <p className="text-center text-sm text-red-400">{erro}</p>}
          <button onClick={login} disabled={loading || !senha} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#C9A84C] py-3 font-bold text-[#000] disabled:opacity-50">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Acessar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000] p-4 text-white">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-gray-400 hover:text-[#C9A84C]"><ArrowLeft className="h-4 w-4 inline" /> Dashboard</Link>
          <h1 className="text-xl font-bold">Painel de <span className="text-[#C9A84C]">Controle</span></h1>
        </div>
        <button onClick={login} className="flex items-center gap-1 text-sm text-[#C9A84C]"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <div className="mb-4 rounded-lg border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-3">
        <p className="text-sm text-gray-300"><AlertTriangle className="h-4 w-4 inline text-[#C9A84C] mr-1" /> Mudancas afetam o sistema em tempo real.</p>
      </div>

      <div className="space-y-3">
        {configs.map((c) => (
          <div key={c.chave} className={`flex items-center justify-between rounded-xl border p-4 ${c.valor === "habilitado" ? "border-green-500/20 bg-[#0A0A0A]" : "border-gray-800 bg-[#0A0A0A] opacity-70"}`}>
            <div>
              <p className="font-bold text-sm">{labels[c.chave] || c.chave}</p>
            </div>
            <button onClick={() => toggle(c.chave, c.valor)} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${c.valor === "habilitado" ? "bg-green-500/20 text-green-400" : "bg-gray-700/30 text-gray-400"}`}>
              {c.valor === "habilitado" ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {c.valor === "habilitado" ? "ON" : "OFF"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
