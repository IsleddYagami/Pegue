"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Star, CheckCircle, XCircle, Plus, UserPlus, Send, Mail, BarChart3, MessageSquare } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Prestador } from "@/lib/types";

// Gera 300 cotacoes simuladas e envia por email pro Fabio
async function gerarSimulacao() {
  if (!confirm("Gerar 300 cotacoes simuladas e enviar por email pra fabiosantoscrispim@gmail.com?")) return;
  let senha = sessionStorage.getItem("admin_key") || "";
  if (!senha) {
    senha = prompt("Digite a senha de admin:") || "";
    if (!senha) return;
    sessionStorage.setItem("admin_key", senha);
  }
  try {
    const res = await fetch(`/api/admin-gerar-simulacao?key=${encodeURIComponent(senha)}`);
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.mensagem}\n\nUtilitario: ${data.resumo.utilitario} · HR: ${data.resumo.hr}\nPreco medio Util: R$ ${data.resumo.precoMedioUtil}\nPreco medio HR: R$ ${data.resumo.precoMedioHR}`);
    } else {
      if (res.status === 401) sessionStorage.removeItem("admin_key");
      alert(`❌ Erro: ${data.error || "desconhecido"}`);
    }
  } catch {
    alert("❌ Erro de conexao.");
  }
}

// Dispara email de teste pra validar integracao Resend + dominio chamepegue
async function testarEmail() {
  let senha = sessionStorage.getItem("admin_key") || "";
  if (!senha) {
    senha = prompt("Digite a senha de admin:") || "";
    if (!senha) return;
    sessionStorage.setItem("admin_key", senha);
  }
  try {
    const res = await fetch(`/api/admin-testar-email?key=${encodeURIComponent(senha)}`);
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.mensagem}`);
    } else {
      if (res.status === 401) sessionStorage.removeItem("admin_key");
      alert(`❌ Erro: ${data.mensagem || data.error || "desconhecido"}`);
    }
  } catch {
    alert("❌ Erro de conexao.");
  }
}

// Dispara email de arquivamento com dados e fotos reais do prestador ja cadastrado.
// Util pra validar que fotos estao chegando no email sem precisar refazer cadastro.
async function reenviarEmailCadastro(phone: string, nome: string) {
  if (!confirm(`Disparar email de arquivamento de ${nome} pros inboxes configurados?\n\nO email inclui dados reais + 3 fotos anexadas (selfie, placa, veiculo).`)) return;
  let senha = sessionStorage.getItem("admin_key") || "";
  if (!senha) {
    senha = prompt("Digite a senha de admin:") || "";
    if (!senha) return;
    sessionStorage.setItem("admin_key", senha);
  }
  try {
    const res = await fetch("/api/admin-reenviar-email-cadastro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: senha, phone }),
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.mensagem}`);
    } else {
      if (res.status === 401) sessionStorage.removeItem("admin_key");
      alert(`❌ Erro: ${data.error || "desconhecido"}`);
    }
  } catch {
    alert("❌ Erro de conexao.");
  }
}

// Reenvia termos atualizados pro prestador via WhatsApp. Pede a senha de admin uma vez
// por sessao (sessionStorage) - nao salva em lugar nenhum no servidor.
async function reenviarTermosAtualizados(phone: string, nome: string) {
  if (!confirm(`Reenviar termos atualizados pra ${nome} (${phone}) via WhatsApp?\n\nEle vai receber 3 mensagens em sequencia explicando as mudancas.`)) return;
  let senha = sessionStorage.getItem("admin_key") || "";
  if (!senha) {
    senha = prompt("Digite a senha de admin (a mesma que usa pra entrar no painel):") || "";
    if (!senha) return;
    sessionStorage.setItem("admin_key", senha);
  }
  const url = `/api/admin-enviar?key=${encodeURIComponent(senha)}&phone=${encodeURIComponent(phone)}&tipo=termos_atualizados`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (res.ok) {
      alert(`✅ Termos atualizados enviados pra ${nome}!\n\nO prestador recebera em instantes no WhatsApp.`);
    } else {
      sessionStorage.removeItem("admin_key");
      alert(`❌ Erro: ${data.error || "desconhecido"}.\n\nSe foi senha errada, clica em "Reenviar termos" de novo e digita a senha correta.`);
    }
  } catch {
    alert("❌ Erro de conexao. Tenta de novo em alguns segundos.");
  }
}

export default function PrestadoresPage() {
  const [prestadores, setPrestadores] = useState<Prestador[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("prestadores")
        .select("*, prestador_veiculos(tipo, placa)")
        .order("criado_em", { ascending: false });
      if (data) setPrestadores(data as unknown as Prestador[]);
      setLoading(false);
    }
    load();
  }, []);

  const filtrados = prestadores.filter(
    (p) =>
      !busca ||
      p.nome.toLowerCase().includes(busca.toLowerCase()) ||
      p.telefone.includes(busca)
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#C9A84C] border-t-transparent" />
      </div>
    );
  }

  const statusColorMap: Record<string, string> = {
    pendente: "bg-yellow-100 text-yellow-600",
    aprovado: "bg-green-100 text-green-600",
    bloqueado: "bg-red-100 text-red-600",
    suspenso: "bg-orange-100 text-orange-600",
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0A0A0A]">Prestadores</h1>
          <p className="text-sm text-gray-400">Gerencie os motoristas e prestadores</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/simulador"
            className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-[#C9A84C] hover:text-[#C9A84C]"
          >
            <BarChart3 size={14} /> Simulador
          </Link>
          <Link
            href="/admin/feedback-precos"
            className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-[#C9A84C] hover:text-[#C9A84C]"
          >
            <MessageSquare size={14} /> Feedback precos
          </Link>
          <button
            onClick={testarEmail}
            className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-[#C9A84C] hover:text-[#C9A84C]"
          >
            <Mail size={14} /> Testar email
          </button>
          <Link
            href="/admin/prestadores/novo"
            className="flex items-center gap-2 rounded-xl bg-[#C9A84C] px-4 py-2 font-semibold text-white hover:bg-[#b8963f]"
          >
            <UserPlus size={16} /> Cadastrar novo
          </Link>
        </div>
      </div>

      <div className="relative mt-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-sm focus:border-[#C9A84C] focus:outline-none sm:max-w-md"
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white p-12 text-center shadow-sm">
          <Plus className="mx-auto h-12 w-12 text-gray-200" />
          <p className="mt-2 font-medium text-gray-500">Nenhum prestador cadastrado</p>
          <p className="mt-1 text-sm text-gray-400">
            Os prestadores serao cadastrados via WhatsApp ou manualmente
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((p) => {
            const veiculos = (p as any).prestador_veiculos || [];
            return (
              <div key={p.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C9A84C] text-lg font-bold text-white">
                      {p.nome.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-bold text-[#0A0A0A]">{p.nome}</p>
                      <p className="text-xs text-gray-400">{p.telefone}</p>
                    </div>
                  </div>
                  <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${statusColorMap[p.status] || "bg-gray-100 text-gray-600"}`}>
                    {p.status}
                  </span>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  {veiculos.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Veiculo</span>
                      <span className="font-medium">{veiculos[0].tipo} · {veiculos[0].placa}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Score</span>
                    <span className="flex items-center gap-1 font-medium">
                      <Star size={14} className="fill-yellow-400 text-yellow-400" />
                      {p.score}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Corridas</span>
                    <span className="font-medium">{p.total_corridas}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Regiao</span>
                    <span className="text-xs font-medium text-gray-500">{p.regiao_atuacao || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Disponivel</span>
                    {p.disponivel ? (
                      <span className="flex items-center gap-1 text-green-500"><CheckCircle size={14} /> Sim</span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-400"><XCircle size={14} /> Nao</span>
                    )}
                  </div>
                </div>
                {p.status === "pendente" && (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={async () => {
                        await supabase.from("prestadores").update({ status: "aprovado" }).eq("id", p.id);
                        setPrestadores((prev) => prev.map((x) => x.id === p.id ? { ...x, status: "aprovado" } : x));
                      }}
                      className="flex-1 rounded-lg bg-[#C9A84C] py-2 text-xs font-bold text-white"
                    >
                      Aprovar
                    </button>
                    <button
                      onClick={async () => {
                        await supabase.from("prestadores").update({ status: "bloqueado" }).eq("id", p.id);
                        setPrestadores((prev) => prev.map((x) => x.id === p.id ? { ...x, status: "bloqueado" } : x));
                      }}
                      className="flex-1 rounded-lg bg-red-100 py-2 text-xs font-bold text-red-600"
                    >
                      Bloquear
                    </button>
                  </div>
                )}

                {/* Botoes de acao admin - reenviar termos (WhatsApp) e email de arquivamento */}
                {p.status !== "bloqueado" && (
                  <div className="mt-3 grid gap-2">
                    <button
                      onClick={() => reenviarTermosAtualizados(p.telefone, p.nome)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-600 transition hover:border-[#C9A84C] hover:bg-[#C9A84C]/5 hover:text-[#C9A84C]"
                    >
                      <Send size={12} /> Reenviar termos atualizados
                    </button>
                    <button
                      onClick={() => reenviarEmailCadastro(p.telefone, p.nome)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-600 transition hover:border-[#C9A84C] hover:bg-[#C9A84C]/5 hover:text-[#C9A84C]"
                    >
                      <Mail size={12} /> Enviar email de arquivamento
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
