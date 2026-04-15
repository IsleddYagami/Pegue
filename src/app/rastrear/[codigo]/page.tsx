"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import TrackingMap from "@/components/tracking-map";
import {
  MapPin, Truck, CheckCircle, Circle, Clock, Package,
  AlertTriangle, Navigation, RefreshCw,
} from "lucide-react";

interface CorridaData {
  corrida_id: string;
  codigo: string;
  status: string;
  rastreio_ativo: boolean;
  chegou_destino: boolean;
  origem: { endereco: string; lat: number; lng: number };
  destino: { endereco: string; lat: number; lng: number };
  distancia_total_km: number;
  distancia_restante_km: number | null;
  carga: string;
  veiculo: string;
  prestador: { nome: string } | null;
  ultima_localizacao: { lat: number; lng: number; atualizado_em: string } | null;
}

// Supabase client para Realtime
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function ClienteTrackingPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#000]"><div className="h-10 w-10 animate-spin rounded-full border-4 border-[#C9A84C] border-t-transparent" /></div>}>
      <ClienteTrackingInner />
    </Suspense>
  );
}

function ClienteTrackingInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const codigo = params.codigo as string;
  const token = searchParams.get("t") || "";

  const [corrida, setCorrida] = useState<CorridaData | null>(null);
  const [fretistaPos, setFretistaPos] = useState<{ lat: number; lng: number } | null>(null);
  const [distanciaRestante, setDistanciaRestante] = useState<number | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>("");
  const [erro, setErro] = useState("");
  const [chegou, setChegou] = useState(false);
  const channelRef = useRef<any>(null);
  const alertaTocouRef = useRef(false);

  // Alerta sonoro + vibracao quando fretista chega
  function alertaChegada() {
    if (alertaTocouRef.current) return; // Toca so uma vez
    alertaTocouRef.current = true;

    // Vibra o celular (3 pulsos)
    if ("vibrate" in navigator) {
      navigator.vibrate([300, 200, 300, 200, 500]);
    }

    // Toca som de notificacao usando Web Audio API (3 vezes)
    try {
      const ctx = new AudioContext();
      const repeticoes = 3;
      const duracaoBloco = 0.8; // segundos por repeticao

      for (let r = 0; r < repeticoes; r++) {
        const offset = r * duracaoBloco;
        const notas = [523, 659, 784, 1047]; // Do-Mi-Sol-Do
        notas.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          gain.gain.value = 0.5;
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + offset + 0.3 + i * 0.15);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + offset + i * 0.15);
          osc.stop(ctx.currentTime + offset + 0.4 + i * 0.15);
        });
      }
    } catch {}

    // Notificacao do navegador (se permitido)
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("🚚 Pegue - Fretista chegou!", {
        body: "O fretista chegou no endereco de entrega. Confira seus materiais!",
        icon: "/logo-pegue-novo.png",
      });
    }
  }

  // Carrega dados iniciais
  useEffect(() => {
    if (!token) {
      setErro("Link invalido - token ausente");
      return;
    }

    // Pede permissao de notificacao
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    fetch(`/api/rastreio?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setErro("Link invalido ou expirado");
          return;
        }
        setCorrida(data);
        if (data.ultima_localizacao) {
          setFretistaPos({
            lat: data.ultima_localizacao.lat,
            lng: data.ultima_localizacao.lng,
          });
          setUltimaAtualizacao(
            new Date(data.ultima_localizacao.atualizado_em).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          );
        }
        if (data.distancia_restante_km !== null) {
          setDistanciaRestante(data.distancia_restante_km);
        }
        if (data.chegou_destino) {
          setChegou(true);
          alertaChegada();
        }

        // Inicia Realtime subscription
        if (data.corrida_id && data.rastreio_ativo) {
          iniciarRealtime(data.corrida_id, data.destino);
        }
      })
      .catch(() => setErro("Erro ao carregar dados"));

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [token]);

  function iniciarRealtime(corridaId: string, destino: { lat: number; lng: number }) {
    const channel = supabase
      .channel(`rastreio-${corridaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rastreio_localizacoes",
          filter: `corrida_id=eq.${corridaId}`,
        },
        (payload: any) => {
          const { lat, lng } = payload.new;
          setFretistaPos({ lat, lng });
          setUltimaAtualizacao(
            new Date().toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          );

          // Calcula distancia restante no client
          if (destino?.lat && destino?.lng) {
            const dist = haversine(lat, lng, destino.lat, destino.lng);
            setDistanciaRestante(Math.round(dist * 10) / 10);
            if (dist < 0.2) {
              setChegou(true);
              alertaChegada();
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
  }

  // Haversine simples pro client-side
  function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Refresh manual
  function handleRefresh() {
    if (!token) return;
    fetch(`/api/rastreio?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ultima_localizacao) {
          setFretistaPos({ lat: data.ultima_localizacao.lat, lng: data.ultima_localizacao.lng });
          setUltimaAtualizacao(
            new Date(data.ultima_localizacao.atualizado_em).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          );
        }
        if (data.distancia_restante_km !== null) setDistanciaRestante(data.distancia_restante_km);
        if (data.chegou_destino) setChegou(true);
      });
  }

  // Tela de erro
  if (erro) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
        <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-[#0A0A0A] p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-red-400" />
          <h1 className="text-xl font-bold text-white">Link invalido</h1>
          <p className="mt-2 text-sm text-gray-400">{erro}</p>
        </div>
      </div>
    );
  }

  // Loading
  if (!corrida) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-[#C9A84C] border-t-transparent" />
          <p className="text-sm text-gray-400">Carregando rastreio...</p>
        </div>
      </div>
    );
  }

  // Labels de veiculo
  const veiculoLabels: Record<string, string> = {
    carro_comum: "Carro Comum",
    utilitario: "Utilitario",
    hr: "HR / Caminhao Medio",
    caminhao_bau: "Caminhao Bau",
  };

  // Timeline steps
  const steps = [
    {
      label: "Pedido confirmado",
      done: true,
      current: false,
      icon: <CheckCircle className="h-5 w-5" />,
    },
    {
      label: "Pagamento aprovado",
      done: corrida.status !== "pendente",
      current: corrida.status === "pendente",
      icon: <CheckCircle className="h-5 w-5" />,
    },
    {
      label: "Em transito",
      done: chegou || corrida.status === "concluida",
      current: !chegou && corrida.rastreio_ativo,
      icon: <Truck className="h-5 w-5" />,
    },
    {
      label: "Fretista chegou",
      done: corrida.status === "concluida",
      current: chegou && corrida.status !== "concluida",
      icon: <MapPin className="h-5 w-5" />,
    },
    {
      label: "Entrega confirmada",
      done: corrida.status === "concluida",
      current: false,
      icon: <CheckCircle className="h-5 w-5" />,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#000]">
      {/* Header */}
      <div className="border-b border-[#C9A84C]/20 bg-[#0A0A0A] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-[#C9A84C]" />
            <div>
              <h1 className="font-bold text-white">
                Pegue <span className="text-[#C9A84C]">Rastreio</span>
              </h1>
              <p className="text-xs text-gray-500">{corrida.codigo}</p>
            </div>
          </div>
          <button onClick={handleRefresh} className="rounded-lg p-2 text-gray-400 hover:bg-gray-800">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Banner de chegada */}
      {chegou && corrida.status !== "concluida" && (
        <div className="border-b border-green-500/30 bg-green-500/10 p-4 text-center">
          <CheckCircle className="mx-auto mb-1 h-8 w-8 text-green-400" />
          <p className="font-bold text-green-400">Fretista chegou no destino!</p>
          <p className="text-xs text-gray-400">Confira seus materiais pelo WhatsApp</p>
        </div>
      )}

      {/* Mapa */}
      <div style={{ height: "45vh" }}>
        <TrackingMap
          fretista={fretistaPos}
          origem={{ lat: corrida.origem.lat, lng: corrida.origem.lng }}
          destino={{ lat: corrida.destino.lat, lng: corrida.destino.lng }}
        />
      </div>

      {/* Info section */}
      <div className="flex-1 space-y-4 border-t border-[#C9A84C]/20 bg-[#0A0A0A] p-4">
        {/* Distancia + Ultima atualizacao */}
        {fretistaPos && !chegou && (
          <div className="flex items-center justify-between rounded-xl bg-[#C9A84C]/10 p-3">
            <div>
              <p className="text-xs text-gray-400">Distancia restante</p>
              <p className="text-xl font-bold text-[#C9A84C]">
                {distanciaRestante !== null
                  ? distanciaRestante < 1
                    ? `${Math.round(distanciaRestante * 1000)}m`
                    : `${distanciaRestante.toFixed(1)}km`
                  : "Calculando..."}
              </p>
            </div>
            {ultimaAtualizacao && (
              <div className="text-right">
                <p className="text-xs text-gray-400">Atualizado</p>
                <p className="text-sm font-bold text-white">{ultimaAtualizacao}</p>
              </div>
            )}
          </div>
        )}

        {!fretistaPos && corrida.rastreio_ativo && (
          <div className="rounded-xl bg-yellow-500/10 p-3 text-center">
            <Clock className="mx-auto mb-1 h-6 w-6 text-yellow-400" />
            <p className="text-sm text-yellow-400">Aguardando fretista iniciar rastreio...</p>
          </div>
        )}

        {/* Card do fretista */}
        {corrida.prestador && (
          <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-[#111] p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C9A84C] text-lg font-bold text-white">
              {corrida.prestador.nome.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-white">{corrida.prestador.nome}</p>
              <p className="text-xs text-gray-400">
                {veiculoLabels[corrida.veiculo] || corrida.veiculo}
              </p>
            </div>
          </div>
        )}

        {/* Enderecos */}
        <div className="space-y-2 rounded-xl border border-gray-800 bg-[#111] p-3">
          <div className="flex items-start gap-2">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
            <div>
              <p className="text-xs text-gray-500">Coleta</p>
              <p className="text-sm text-white">{corrida.origem.endereco}</p>
            </div>
          </div>
          <div className="ml-2 border-l border-dashed border-gray-700 py-1" />
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div>
              <p className="text-xs text-gray-500">Entrega</p>
              <p className="text-sm text-white">{corrida.destino.endereco}</p>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="rounded-xl border border-gray-800 bg-[#111] p-4">
          <p className="mb-3 text-xs font-bold uppercase text-gray-500">Status</p>
          <div className="space-y-0">
            {steps.map((step, i) => (
              <div key={step.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`${
                      step.done
                        ? "text-[#C9A84C]"
                        : step.current
                          ? "text-orange-400"
                          : "text-gray-700"
                    }`}
                  >
                    {step.current ? (
                      <div className="h-5 w-5 rounded-full border-[3px] border-orange-400 bg-transparent" />
                    ) : (
                      step.icon
                    )}
                  </div>
                  {i < steps.length - 1 && (
                    <div
                      className={`h-6 w-0.5 ${step.done ? "bg-[#C9A84C]" : "bg-gray-800"}`}
                    />
                  )}
                </div>
                <p
                  className={`text-sm ${
                    step.current
                      ? "font-bold text-orange-400"
                      : step.done
                        ? "text-white"
                        : "text-gray-600"
                  }`}
                >
                  {step.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-600">
          📦 {corrida.carga} • {corrida.distancia_total_km}km
        </p>
      </div>
    </div>
  );
}
