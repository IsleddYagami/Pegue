"use client";
import { fetchComTimeout } from "@/lib/fetch-utils";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import TrackingMap from "@/components/tracking-map";
import { MapPin, Wifi, WifiOff, CheckCircle, AlertTriangle, Navigation } from "lucide-react";

interface CorridaData {
  corrida_id: string;
  codigo: string;
  status: string;
  rastreio_ativo: boolean;
  chegou_destino: boolean;
  origem: { endereco: string; lat: number; lng: number };
  destino: { endereco: string; lat: number; lng: number };
  distancia_total_km: number;
  carga: string;
  veiculo: string;
}

export default function MotoristaTrackingPage() {
  const params = useParams();
  const token = params.token as string;

  const [corrida, setCorrida] = useState<CorridaData | null>(null);
  const [posicao, setPosicao] = useState<{ lat: number; lng: number } | null>(null);
  const [erro, setErro] = useState("");
  const [gpsAtivo, setGpsAtivo] = useState(false);
  const [ultimoEnvio, setUltimoEnvio] = useState<string>("");
  const [distanciaRestante, setDistanciaRestante] = useState<number | null>(null);
  const [chegou, setChegou] = useState(false);
  const [finalizado, setFinalizado] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<any>(null);

  // Carrega dados da corrida
  useEffect(() => {
    if (!token) return;
    fetch(`/api/rastreio?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setErro("Link invalido ou expirado");
          return;
        }
        setCorrida(data);
        if (data.chegou_destino) setChegou(true);
        if (!data.rastreio_ativo) setFinalizado(true);
      })
      .catch(() => setErro("Erro ao carregar dados"));
  }, [token]);

  // Envia posicao para API
  const enviarPosicao = useCallback(async () => {
    if (!token || finalizado) return;

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000,
        });
      });

      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      setPosicao({ lat, lng });
      setGpsAtivo(true);

      const r = await fetchComTimeout("/api/rastreio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, lat, lng, accuracy }),
      });

      const data = await r.json();

      if (data.finalizado) {
        setFinalizado(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      if (data.distancia_km !== null) {
        setDistanciaRestante(data.distancia_km);
      }
      if (data.chegou) {
        setChegou(true);
      }

      const agora = new Date();
      setUltimoEnvio(
        agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    } catch (err: any) {
      if (err?.code === 1) {
        setErro("Permissao de localizacao negada. Ative o GPS e recarregue a pagina.");
        setGpsAtivo(false);
      }
    }
  }, [token, finalizado]);

  // Inicia GPS tracking
  useEffect(() => {
    if (!corrida || finalizado || erro) return;

    // Primeiro envio imediato
    enviarPosicao();

    // Envia a cada 30 segundos
    intervalRef.current = setInterval(enviarPosicao, 30000);

    // Wake Lock - manter tela ligada
    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        }
      } catch {}
    }
    requestWakeLock();

    // Re-adquirir wake lock quando voltar pra aba
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
        enviarPosicao();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [corrida, finalizado, erro, enviarPosicao]);

  // Tela de erro
  if (erro) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
        <div className="w-full max-w-sm rounded-2xl border border-red-500/30 bg-[#0A0A0A] p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-red-400" />
          <h1 className="text-xl font-bold text-white">Ops!</h1>
          <p className="mt-2 text-sm text-gray-400">{erro}</p>
        </div>
      </div>
    );
  }

  // Loading
  if (!corrida) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#C9A84C] border-t-transparent" />
      </div>
    );
  }

  // Tela de finalizado
  if (finalizado && !chegou) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-8 text-center">
          <CheckCircle className="mx-auto mb-3 h-12 w-12 text-[#C9A84C]" />
          <h1 className="text-xl font-bold text-white">Rastreio Encerrado</h1>
          <p className="mt-2 text-sm text-gray-400">Esta corrida ja foi finalizada.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#000]">
      {/* Header */}
      <div className="border-b border-[#C9A84C]/20 bg-[#0A0A0A] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-[#C9A84C]" />
            <h1 className="font-bold text-white">
              Pegue <span className="text-[#C9A84C]">Rastreio</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {gpsAtivo ? (
              <div className="flex items-center gap-1 text-green-400">
                <Wifi className="h-4 w-4" />
                <span className="text-xs">GPS Ativo</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-yellow-400">
                <WifiOff className="h-4 w-4" />
                <span className="text-xs">Conectando...</span>
              </div>
            )}
          </div>
        </div>
        {ultimoEnvio && (
          <p className="mt-1 text-xs text-gray-500">Ultimo envio: {ultimoEnvio}</p>
        )}
      </div>

      {/* Banner de chegada */}
      {chegou && (
        <div className="border-b border-green-500/30 bg-green-500/10 p-4 text-center">
          <CheckCircle className="mx-auto mb-1 h-8 w-8 text-green-400" />
          <p className="font-bold text-green-400">Voce chegou ao destino!</p>
          <p className="text-xs text-gray-400">Aguarde o cliente confirmar a entrega</p>
        </div>
      )}

      {/* Mapa */}
      <div className="flex-1" style={{ minHeight: "40vh" }}>
        <TrackingMap
          fretista={posicao}
          origem={{ lat: corrida.origem.lat, lng: corrida.origem.lng }}
          destino={{ lat: corrida.destino.lat, lng: corrida.destino.lng }}
        />
      </div>

      {/* Info da corrida */}
      <div className="space-y-3 border-t border-[#C9A84C]/20 bg-[#0A0A0A] p-4">
        {distanciaRestante !== null && !chegou && (
          <div className="rounded-xl bg-[#C9A84C]/10 p-3 text-center">
            <p className="text-2xl font-bold text-[#C9A84C]">
              {distanciaRestante < 1
                ? `${Math.round(distanciaRestante * 1000)}m`
                : `${distanciaRestante.toFixed(1)}km`}
            </p>
            <p className="text-xs text-gray-400">ate o destino</p>
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-gray-800 bg-[#111] p-3">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
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

        <p className="text-center text-xs text-gray-600">
          📦 {corrida.carga} • {corrida.codigo}
        </p>
      </div>
    </div>
  );
}
