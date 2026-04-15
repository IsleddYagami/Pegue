"use client";

import dynamic from "next/dynamic";

// Leaflet nao funciona com SSR - importa dinamicamente
const MapInner = dynamic(() => import("./tracking-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-gray-900 rounded-xl">
      <div className="text-center">
        <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-4 border-[#C9A84C] border-t-transparent" />
        <p className="text-sm text-gray-400">Carregando mapa...</p>
      </div>
    </div>
  ),
});

interface TrackingMapProps {
  fretista?: { lat: number; lng: number } | null;
  origem?: { lat: number; lng: number } | null;
  destino?: { lat: number; lng: number } | null;
  className?: string;
}

export default function TrackingMap(props: TrackingMapProps) {
  return <MapInner {...props} />;
}
