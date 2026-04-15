"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface TrackingMapInnerProps {
  fretista?: { lat: number; lng: number } | null;
  origem?: { lat: number; lng: number } | null;
  destino?: { lat: number; lng: number } | null;
  className?: string;
}

// Icones customizados
const truckIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="background:#C9A84C;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);font-size:18px;">🚚</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const origemIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="background:#22c55e;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px;">📦</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const destinoIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="background:#ef4444;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:14px;">🏠</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

export default function TrackingMapInner({
  fretista,
  origem,
  destino,
  className = "",
}: TrackingMapInnerProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fretistaMarkerRef = useRef<L.Marker | null>(null);
  const origemMarkerRef = useRef<L.Marker | null>(null);
  const destinoMarkerRef = useRef<L.Marker | null>(null);

  // Inicializa mapa
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Centro padrao: Sao Paulo
    const centro = fretista
      ? [fretista.lat, fretista.lng]
      : destino
        ? [destino.lat, destino.lng]
        : [-23.55, -46.63];

    const map = L.map(containerRef.current, {
      center: centro as [number, number],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    // Controle de zoom no canto direito
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Atribuicao discreta
    L.control
      .attribution({ position: "bottomleft", prefix: false })
      .addAttribution("OpenStreetMap")
      .addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Atualiza marcadores
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Origem
    if (origem) {
      if (origemMarkerRef.current) {
        origemMarkerRef.current.setLatLng([origem.lat, origem.lng]);
      } else {
        origemMarkerRef.current = L.marker([origem.lat, origem.lng], {
          icon: origemIcon,
        })
          .bindPopup("📦 Coleta")
          .addTo(map);
      }
    }

    // Destino
    if (destino) {
      if (destinoMarkerRef.current) {
        destinoMarkerRef.current.setLatLng([destino.lat, destino.lng]);
      } else {
        destinoMarkerRef.current = L.marker([destino.lat, destino.lng], {
          icon: destinoIcon,
        })
          .bindPopup("🏠 Entrega")
          .addTo(map);
      }
    }

    // Fretista
    if (fretista) {
      if (fretistaMarkerRef.current) {
        fretistaMarkerRef.current.setLatLng([fretista.lat, fretista.lng]);
      } else {
        fretistaMarkerRef.current = L.marker([fretista.lat, fretista.lng], {
          icon: truckIcon,
        })
          .bindPopup("🚚 Fretista")
          .addTo(map);
      }
    }

    // Ajusta bounds pra mostrar todos os pontos
    const points: [number, number][] = [];
    if (fretista) points.push([fretista.lat, fretista.lng]);
    if (origem) points.push([origem.lat, origem.lng]);
    if (destino) points.push([destino.lat, destino.lng]);

    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    }
  }, [fretista?.lat, fretista?.lng, origem?.lat, destino?.lat]);

  return (
    <div
      ref={containerRef}
      className={`h-full w-full rounded-xl ${className}`}
      style={{ minHeight: "300px" }}
    />
  );
}
