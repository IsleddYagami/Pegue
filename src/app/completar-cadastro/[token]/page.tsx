"use client";
import { fetchComTimeout } from "@/lib/fetch-utils";

import { useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Camera, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function CompletarCadastroPage() {
  const params = useParams();
  const token = params?.token as string;

  const [selfie, setSelfie] = useState<File | null>(null);
  const [fotoPlaca, setFotoPlaca] = useState<File | null>(null);
  const [fotoVeiculo, setFotoVeiculo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    if (!selfie || !fotoPlaca || !fotoVeiculo) {
      setErro("Envie as 3 fotos pra continuar");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("token", token);
    formData.append("selfie", selfie);
    formData.append("fotoPlaca", fotoPlaca);
    formData.append("fotoVeiculo", fotoVeiculo);

    try {
      const res = await fetchComTimeout("/api/completar-cadastro", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error || "Erro ao enviar");
      } else {
        setSucesso(data.mensagem || "Cadastro finalizado!");
      }
    } catch {
      setErro("Erro de conexao. Verifique sua internet e tenta de novo.");
    }
    setLoading(false);
  }

  if (sucesso) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
        <div className="w-full max-w-md rounded-2xl border border-[#C9A84C]/30 bg-[#0A0A0A] p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-400" />
          <h1 className="mb-2 text-2xl font-bold text-white">Tudo certo!</h1>
          <p className="whitespace-pre-line text-gray-300">{sucesso}</p>
          <p className="mt-6 text-sm text-[#C9A84C]">Relaxa. A gente leva. 🚚✨</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000] px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <Image
            src="/logo-pegue-novo.png" alt="Pegue"
            width={100} height={100}
            className="mx-auto h-20 w-auto"
          />
          <h1 className="mt-4 text-2xl font-bold text-white">Finalize seu cadastro</h1>
          <p className="mt-2 text-sm text-gray-400">
            A Pegue ja recebeu seus dados basicos. Falta so enviar 3 fotos pra gente aprovar voce!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-5">
          <FotoInput
            label="1. Selfie com RG ou CNH aberto"
            subtitle="Segure o documento proximo ao rosto, bem legivel"
            file={selfie}
            onChange={setSelfie}
          />
          <FotoInput
            label="2. Foto da placa do veiculo"
            subtitle="Chegue bem perto pra placa ficar nitida"
            file={fotoPlaca}
            onChange={setFotoPlaca}
          />
          <FotoInput
            label="3. Foto do veiculo inteiro"
            subtitle="De preferencia mostrando de lado"
            file={fotoVeiculo}
            onChange={setFotoVeiculo}
          />

          {erro && (
            <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-900/20 p-3 text-sm text-red-300">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <button
            type="submit" disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9A84C] py-4 text-lg font-bold text-[#000] hover:bg-[#b8963f] disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Enviando...
              </>
            ) : (
              "Finalizar cadastro"
            )}
          </button>

          <p className="text-center text-xs text-gray-500">
            Ao enviar, voce concorda com os termos de participacao da Pegue.
          </p>
        </form>
      </div>
    </div>
  );
}

function FotoInput({ label, subtitle, file, onChange }: {
  label: string;
  subtitle: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <label className="block cursor-pointer">
      <p className="mb-1 text-sm font-semibold text-white">{label}</p>
      <p className="mb-2 text-xs text-gray-500">{subtitle}</p>
      <div className={`flex items-center justify-center rounded-xl border-2 border-dashed p-6 transition ${
        file ? "border-green-500/50 bg-green-900/10" : "border-gray-700 bg-black/30"
      }`}>
        {file ? (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 size={18} />
            <span className="truncate">{file.name}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-400">
            <Camera size={28} />
            <span className="text-sm">Tirar / Escolher foto</span>
          </div>
        )}
      </div>
      <input
        type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
    </label>
  );
}
