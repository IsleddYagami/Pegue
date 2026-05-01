"use client";
import { fetchComTimeout } from "@/lib/fetch-utils";

import { useState } from "react";
import { MessageCircle, CheckCircle, Loader2 } from "lucide-react";

export function FormularioParceiro() {
  const [form, setForm] = useState({
    nome: "",
    cpf: "",
    email: "",
    telefone: "",
    tipoVeiculo: "",
    placa: "",
  });
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");

    if (!form.nome || !form.cpf || !form.email || !form.telefone || !form.tipoVeiculo || !form.placa) {
      setErro("Preencha todos os campos");
      return;
    }

    if (form.cpf.replace(/\D/g, "").length !== 11) {
      setErro("CPF precisa ter 11 digitos");
      return;
    }

    if (!form.email.includes("@")) {
      setErro("Email invalido");
      return;
    }

    setLoading(true);

    try {
      const res = await fetchComTimeout("/api/cadastro-parceiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setEnviado(true);
      } else {
        const data = await res.json();
        setErro(data.error || "Erro ao cadastrar. Tente novamente.");
      }
    } catch {
      setErro("Erro de conexao. Tente novamente.");
    }

    setLoading(false);
  };

  if (enviado) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <CheckCircle className="mx-auto mb-4 h-16 w-16 text-[#C9A84C]" />
        <h3 className="mb-4 text-2xl font-bold">Pre-cadastro recebido!</h3>
        <p className="mb-6 text-gray-400">
          Para completar seu cadastro, envie suas fotos (selfie com documento, placa e veiculo) pelo WhatsApp:
        </p>
        <a
          href={`https://wa.me/5511970363713?text=Parcerias%20Pegue%20-%20Meu%20nome%20e%20${encodeURIComponent(form.nome)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 rounded-full bg-[#C9A84C] px-8 py-4 text-lg font-bold text-[#0A0A0A] transition-all hover:scale-105"
        >
          <MessageCircle className="h-6 w-6" />
          Enviar fotos pelo WhatsApp
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-lg space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Nome completo</label>
        <input
          type="text"
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
          className="w-full rounded-lg border border-gray-700 bg-[#1a1a1a] px-4 py-3 text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
          placeholder="Seu nome completo"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">CPF</label>
        <input
          type="text"
          value={form.cpf}
          onChange={(e) => setForm({ ...form, cpf: e.target.value.replace(/\D/g, "").slice(0, 11) })}
          className="w-full rounded-lg border border-gray-700 bg-[#1a1a1a] px-4 py-3 text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
          placeholder="Somente numeros"
          maxLength={11}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full rounded-lg border border-gray-700 bg-[#1a1a1a] px-4 py-3 text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
          placeholder="seunome@email.com"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Telefone (WhatsApp)</label>
        <input
          type="text"
          value={form.telefone}
          onChange={(e) => setForm({ ...form, telefone: e.target.value.replace(/\D/g, "").slice(0, 11) })}
          className="w-full rounded-lg border border-gray-700 bg-[#1a1a1a] px-4 py-3 text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
          placeholder="11999999999"
          maxLength={11}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Tipo do veiculo</label>
        <select
          value={form.tipoVeiculo}
          onChange={(e) => setForm({ ...form, tipoVeiculo: e.target.value })}
          className="w-full rounded-lg border border-gray-700 bg-[#1a1a1a] px-4 py-3 text-white focus:border-[#C9A84C] focus:outline-none"
        >
          <option value="">Selecione...</option>
          <option value="carro_comum">Carro Comum (Kicks, Livina, Renegade, etc)</option>
          <option value="utilitario">Utilitario (Strada, Saveiro, Courier)</option>
          <option value="hr">HR (Hyundai HR)</option>
          <option value="caminhao_bau">Caminhao Bau</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Placa do veiculo</label>
        <input
          type="text"
          value={form.placa}
          onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
          className="w-full rounded-lg border border-gray-700 bg-[#1a1a1a] px-4 py-3 text-white placeholder-gray-500 focus:border-[#C9A84C] focus:outline-none"
          placeholder="ABC1D23"
          maxLength={7}
        />
      </div>

      {erro && (
        <p className="text-sm text-red-400">{erro}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#C9A84C] px-6 py-4 text-lg font-bold text-[#0A0A0A] transition-all hover:scale-[1.02] disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {loading ? "Enviando..." : "Enviar pre-cadastro"}
      </button>

      <p className="text-center text-xs text-gray-500">
        Apos o pre-cadastro, voce precisara enviar fotos pelo WhatsApp pra completar.
      </p>
    </form>
  );
}
