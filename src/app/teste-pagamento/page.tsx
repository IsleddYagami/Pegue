"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, QrCode, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";

export default function TestePagamentoPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#000]"><Loader2 className="h-8 w-8 animate-spin text-[#C9A84C]" /></div>}>
      <TestePagamentoInner />
    </Suspense>
  );
}

function TestePagamentoInner() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const [link, setLink] = useState("");
  const [sandboxLink, setSandboxLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [senha, setSenha] = useState("");

  async function gerarLink() {
    if (!senha) {
      setErro("Digite a senha de admin primeiro");
      return;
    }
    setLoading(true);
    setErro("");
    try {
      const r = await fetch(`/api/pagamento/teste?key=${encodeURIComponent(senha)}`);
      const data = await r.json();
      if (data.link) {
        setLink(data.link);
        setSandboxLink(data.sandbox_link || "");
      } else {
        setErro(data.error || "Erro ao gerar link");
      }
    } catch {
      setErro("Erro de conexao");
    }
    setLoading(false);
  }

  if (status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
        <div className="w-full max-w-md rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-8 text-center">
          {status === "ok" && (
            <>
              <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-400" />
              <h1 className="mb-2 text-2xl font-bold text-white">Pagamento Aprovado!</h1>
              <p className="text-gray-400">O webhook do Mercado Pago deve ter recebido a notificacao. Verifique o <code className="text-[#C9A84C]">bot_logs</code> no Supabase.</p>
            </>
          )}
          {status === "erro" && (
            <>
              <XCircle className="mx-auto mb-4 h-16 w-16 text-red-400" />
              <h1 className="mb-2 text-2xl font-bold text-white">Pagamento Falhou</h1>
              <p className="text-gray-400">Tente novamente ou use outro metodo de pagamento.</p>
            </>
          )}
          {status === "pendente" && (
            <>
              <Clock className="mx-auto mb-4 h-16 w-16 text-yellow-400" />
              <h1 className="mb-2 text-2xl font-bold text-white">Pagamento Pendente</h1>
              <p className="text-gray-400">Aguardando confirmacao. Pode levar alguns minutos para o Pix ser processado.</p>
            </>
          )}
          <button
            onClick={() => window.location.href = "/teste-pagamento"}
            className="mt-6 rounded-lg bg-[#C9A84C] px-6 py-3 font-bold text-[#000] hover:bg-[#b8963f]"
          >
            Testar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-8">
        <div className="text-center">
          <QrCode className="mx-auto mb-3 h-12 w-12 text-[#C9A84C]" />
          <h1 className="text-2xl font-bold text-white">
            Teste de <span className="text-[#C9A84C]">Pagamento</span>
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Gera um link de R$ 1,00 para testar a integracao com Mercado Pago
          </p>
        </div>

        {!link ? (
          <div className="space-y-3">
            <input
              type="password"
              placeholder="Senha de admin"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-xl border border-[#C9A84C]/20 bg-[#000] px-4 py-3 text-white placeholder:text-gray-600 focus:border-[#C9A84C] focus:outline-none"
            />
            <button
              onClick={gerarLink}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9A84C] py-4 text-lg font-bold text-[#000] hover:bg-[#b8963f] disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <CreditCard className="h-5 w-5" />
                  Gerar Link de Teste (R$ 1,00)
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
              <p className="mb-3 text-center text-sm font-bold text-green-400">Link gerado com sucesso!</p>

              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#009EE3] py-3 text-lg font-bold text-white hover:bg-[#007eb5]"
              >
                <QrCode className="h-5 w-5" />
                Pagar R$ 1,00 (Producao)
              </a>

              {sandboxLink && (
                <a
                  href={sandboxLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-600 py-3 text-sm font-bold text-gray-300 hover:bg-gray-800"
                >
                  Pagar no Sandbox (Gratis)
                </a>
              )}
            </div>

            <div className="rounded-lg border border-[#C9A84C]/20 bg-[#C9A84C]/5 p-3">
              <p className="text-xs text-gray-400">
                <strong className="text-[#C9A84C]">Pix:</strong> Se nao aparecer a opcao Pix, voce precisa cadastrar uma chave Pix na sua conta Mercado Pago em: Seu negocio → Configuracoes → Meios de pagamento → Pix.
              </p>
            </div>

            <button
              onClick={() => { setLink(""); setSandboxLink(""); }}
              className="w-full rounded-lg border border-gray-700 py-2 text-sm text-gray-400 hover:bg-gray-800"
            >
              Gerar Novo Link
            </button>
          </div>
        )}

        {erro && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-center text-sm text-red-400">
            {erro}
          </div>
        )}
      </div>
    </div>
  );
}
