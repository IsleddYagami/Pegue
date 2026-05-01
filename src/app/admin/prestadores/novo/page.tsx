"use client";
import { fetchComTimeout } from "@/lib/fetch-utils";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload, Copy, CheckCircle2, AlertCircle } from "lucide-react";

export default function NovoPrestadorPage() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [modo, setModo] = useState<"completo" | "convite">("completo");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{ mensagem: string; linkConvite?: string | null } | null>(null);
  const [erro, setErro] = useState("");
  const [linkCopiado, setLinkCopiado] = useState(false);

  // Campos do formulario
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [chavePix, setChavePix] = useState("");
  const [tipoVeiculo, setTipoVeiculo] = useState("utilitario");
  const [placa, setPlaca] = useState("");

  // Fotos (so modo completo)
  const [selfie, setSelfie] = useState<File | null>(null);
  const [fotoPlaca, setFotoPlaca] = useState<File | null>(null);
  const [fotoVeiculo, setFotoVeiculo] = useState<File | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setResultado(null);

    if (!senha) {
      setErro("Digite a senha de admin");
      return;
    }

    if (modo === "completo" && (!selfie || !fotoPlaca || !fotoVeiculo)) {
      setErro("No modo completo, as 3 fotos sao obrigatorias");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("key", senha);
    formData.append("nome", nome);
    formData.append("telefone", telefone);
    formData.append("cpf", cpf);
    formData.append("email", email);
    formData.append("chavePix", chavePix);
    formData.append("tipoVeiculo", tipoVeiculo);
    formData.append("placa", placa);
    formData.append("modo", modo);

    if (modo === "completo" && selfie && fotoPlaca && fotoVeiculo) {
      formData.append("selfie", selfie);
      formData.append("fotoPlaca", fotoPlaca);
      formData.append("fotoVeiculo", fotoVeiculo);
    }

    try {
      const res = await fetchComTimeout("/api/admin-cadastrar-prestador", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setErro(data.error || "Erro ao cadastrar");
      } else {
        setResultado({ mensagem: data.mensagem, linkConvite: data.linkConvite });
        // Limpa form se foi sucesso
        setNome(""); setTelefone(""); setCpf(""); setEmail(""); setChavePix("");
        setPlaca(""); setSelfie(null); setFotoPlaca(null); setFotoVeiculo(null);
      }
    } catch {
      setErro("Erro de conexao");
    }
    setLoading(false);
  }

  function copiarLink() {
    if (resultado?.linkConvite) {
      navigator.clipboard.writeText(resultado.linkConvite);
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2000);
    }
  }

  return (
    <div>
      <button
        onClick={() => router.push("/admin/prestadores")}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#C9A84C]"
      >
        <ArrowLeft size={16} /> Voltar pra lista
      </button>

      <div className="mt-4">
        <h1 className="text-2xl font-extrabold text-[#0A0A0A]">Cadastrar Prestador</h1>
        <p className="text-sm text-gray-400">Cadastro manual pelo admin, sem passar pelo fluxo do WhatsApp</p>
      </div>

      {/* Seletor de modo */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setModo("completo")}
          className={`rounded-2xl border-2 p-4 text-left transition ${
            modo === "completo" ? "border-[#C9A84C] bg-[#C9A84C]/5" : "border-gray-200 bg-white"
          }`}
        >
          <p className="font-bold">Cadastro completo</p>
          <p className="mt-1 text-xs text-gray-500">
            Voce preenche tudo (inclusive fotos) e aprova na hora
          </p>
        </button>
        <button
          type="button"
          onClick={() => setModo("convite")}
          className={`rounded-2xl border-2 p-4 text-left transition ${
            modo === "convite" ? "border-[#C9A84C] bg-[#C9A84C]/5" : "border-gray-200 bg-white"
          }`}
        >
          <p className="font-bold">Enviar link pro prestador</p>
          <p className="mt-1 text-xs text-gray-500">
            Voce preenche os dados basicos, prestador tira as fotos pelo celular
          </p>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        {/* Senha admin */}
        <div>
          <label className="text-sm font-semibold text-gray-700">Senha de admin</label>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Sua senha"
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C9A84C] focus:outline-none"
            required
          />
        </div>

        <hr className="border-gray-100" />

        {/* Dados pessoais */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-gray-700">Nome completo</label>
            <input
              type="text" value={nome} onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C9A84C] focus:outline-none" required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Telefone (DDD + numero)</label>
            <input
              type="text" value={telefone} onChange={(e) => setTelefone(e.target.value)}
              placeholder="11987654321"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C9A84C] focus:outline-none" required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">CPF</label>
            <input
              type="text" value={cpf} onChange={(e) => setCpf(e.target.value)}
              placeholder="00000000000"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C9A84C] focus:outline-none" required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C9A84C] focus:outline-none" required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Chave Pix</label>
            <input
              type="text" value={chavePix} onChange={(e) => setChavePix(e.target.value)}
              placeholder="CPF, email, telefone ou aleatoria"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C9A84C] focus:outline-none" required
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">Placa</label>
            <input
              type="text" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())}
              placeholder="ABC1D23"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C9A84C] focus:outline-none" required
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-gray-700">Tipo de veiculo</label>
          <select
            value={tipoVeiculo} onChange={(e) => setTipoVeiculo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#C9A84C] focus:outline-none" required
          >
            <option value="carro_comum">Carro comum (Kicks, Livina, Renegade)</option>
            <option value="utilitario">Utilitario (Strada, Saveiro)</option>
            <option value="hr">HR / Bongo</option>
            <option value="caminhao_bau">Caminhao Bau</option>
            <option value="guincho">Guincho / Plataforma</option>
            <option value="moto_guincho">Guincho de Moto</option>
          </select>
        </div>

        {/* Fotos (so modo completo) */}
        {modo === "completo" && (
          <>
            <hr className="border-gray-100" />
            <p className="text-sm font-semibold text-gray-700">Fotos (obrigatorio no modo completo)</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <FileUpload label="Selfie com RG/CNH" file={selfie} onChange={setSelfie} />
              <FileUpload label="Foto da placa" file={fotoPlaca} onChange={setFotoPlaca} />
              <FileUpload label="Foto do veiculo" file={fotoVeiculo} onChange={setFotoVeiculo} />
            </div>
          </>
        )}

        {/* Erro */}
        {erro && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {/* Resultado */}
        {resultado && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2 text-sm text-green-700">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>{resultado.mensagem}</span>
            </div>
            {resultado.linkConvite && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-600">Envia este link pro prestador:</p>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
                  <code className="flex-1 truncate text-xs">{resultado.linkConvite}</code>
                  <button
                    type="button" onClick={copiarLink}
                    className="flex items-center gap-1 rounded bg-[#C9A84C] px-2 py-1 text-xs font-semibold text-white"
                  >
                    <Copy size={12} /> {linkCopiado ? "Copiado!" : "Copiar"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">O link expira em 7 dias.</p>
              </div>
            )}
          </div>
        )}

        <button
          type="submit" disabled={loading}
          className="w-full rounded-xl bg-[#C9A84C] py-3 font-bold text-white hover:bg-[#b8963f] disabled:opacity-50"
        >
          {loading
            ? "Cadastrando..."
            : modo === "completo"
              ? "Cadastrar e aprovar"
              : "Cadastrar e gerar link de convite"}
        </button>
      </form>
    </div>
  );
}

function FileUpload({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center transition hover:border-[#C9A84C]">
      <Upload size={24} className="text-gray-400" />
      <p className="mt-2 text-xs font-semibold text-gray-600">{label}</p>
      {file ? (
        <p className="mt-1 truncate text-xs text-green-600">{file.name}</p>
      ) : (
        <p className="mt-1 text-xs text-gray-400">Clique pra escolher</p>
      )}
      <input
        type="file" accept="image/*" className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
    </label>
  );
}
