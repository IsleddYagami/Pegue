"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface PegueRunnerProps {
  onClose: () => void;
}

// === CONSTANTES ===
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const GROUND_HEIGHT = 0.75;
const TRUCK_SIZE = 44;
const INITIAL_SPEED = 4;
const SPEED_INCREMENT = 0.002;

// === INTERFACES ===
interface Obstacle {
  x: number;
  width: number;
  height: number;
  type: "barreira" | "buraco" | "cone" | "pedra" | "motoqueiro" | "motoboy" | "radar";
  vy?: number; // motoqueiro weaving
  flashTimer?: number; // radar flash
  multado?: boolean; // radar already triggered
}

interface Item {
  x: number;
  y: number;
  type: "pacote" | "pegue_logo" | "moeda";
  collected: boolean;
  scale: number;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

interface Landmark {
  x: number;
  type: "pontilhao" | "ponte_estaiada" | "ponte_metalica" | "copan" | "masp" | "fabrica" | "neo_quimica" | "catedral_se" | "mercadao" | "ibirapuera" | "calcadao_osasco";
  width: number;
  height: number;
}

interface TrafficLight {
  x: number;
  state: "red" | "green";
  passed: boolean;
}

interface ForegroundEvent {
  worldX: number;
  width: number;
  type: "bridge" | "tunnel";
  label: string;
}

// === TERRENO ===
function getTerrainY(worldX: number): number {
  return Math.sin(worldX * 0.0015) * 28
    + Math.sin(worldX * 0.004) * 12
    + Math.sin(worldX * 0.0007) * 38
    + Math.sin(worldX * 0.012) * 5;
}

export default function PegueRunner({ onClose }: PegueRunnerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundsRef = useRef<Record<string, HTMLAudioElement>>({});
  const gameRef = useRef({
    running: false,
    score: 0,
    highScore: 0,
    speed: INITIAL_SPEED,
    truckY: 0,
    truckVY: 0,
    isJumping: false,
    obstacles: [] as Obstacle[],
    items: [] as Item[],
    particles: [] as Particle[],
    landmarks: [] as Landmark[],
    clouds: [] as { x: number; y: number; w: number; speed: number }[],
    trafficLights: [] as TrafficLight[],
    foregroundEvents: [] as ForegroundEvent[],
    groundOffset: 0,
    frameCount: 0,
    nextSpawn: 80,
    nextItemSpawn: 50,
    nextTrafficLight: 250,
    nextForeground: 500,
    gameOver: false,
    started: false,
    distance: 0,
    combo: 0,
    comboTimer: 0,
    flashTimer: 0,
    nightMode: false,
    wheelAngle: 0,
    terrainScale: 0,
    radarFlash: 0,
    tunnelAlpha: 0,
    inTunnel: false,
    statusText: "" as string,
    statusTimer: 0,
  });

  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover">("menu");
  const [displayScore, setDisplayScore] = useState(0);
  const [displayHighScore, setDisplayHighScore] = useState(0);
  const [showRanking, setShowRanking] = useState(false);
  const [ranking, setRanking] = useState<{ nome: string; score: number; distancia: number }[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [scoreSaved, setScoreSaved] = useState(false);
  const animRef = useRef<number>(0);
  const truckImgRef = useRef<HTMLImageElement | null>(null);

  // Carrega sons e highscore
  useEffect(() => {
    const saved = localStorage.getItem("pegue_runner_highscore");
    if (saved) {
      gameRef.current.highScore = parseInt(saved);
      setDisplayHighScore(parseInt(saved));
    }
    const files = ["game-jump", "game-collect", "game-star", "game-over", "game-combo"];
    files.forEach((f) => {
      const a = new Audio(`/${f}.wav`);
      a.preload = "auto";
      a.volume = 0.6;
      soundsRef.current[f] = a;
    });
    const img = new window.Image();
    img.src = "/truck-trucado.png";
    img.onload = () => { truckImgRef.current = img; };
  }, []);

  async function fetchRanking() {
    try {
      const r = await fetch("/api/ranking");
      const data = await r.json();
      setRanking(data);
    } catch {}
  }

  async function saveScore() {
    if (!playerName.trim() || scoreSaved) return;
    const g = gameRef.current;
    try {
      await fetch("/api/ranking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: playerName.trim(), score: g.score, distancia: Math.floor(g.distance) }),
      });
      setScoreSaved(true);
      localStorage.setItem("pegue_runner_name", playerName.trim());
      fetchRanking();
    } catch {}
  }

  useEffect(() => {
    const savedName = localStorage.getItem("pegue_runner_name");
    if (savedName) setPlayerName(savedName);
    fetchRanking();
  }, []);

  function playSound(name: string) {
    try {
      const s = soundsRef.current[name];
      if (s) { s.currentTime = 0; s.play().catch(() => {}); }
    } catch {}
  }

  function showStatus(text: string, duration: number = 60) {
    const g = gameRef.current;
    g.statusText = text;
    g.statusTimer = duration;
  }

  // === DESENHO DO CAMINHAO (com inclinacao no terreno) ===
  function drawTruck(ctx: CanvasRenderingContext2D, x: number, y: number, running: boolean, slopeAngle: number) {
    const g = gameRef.current;
    const bounce = running && !g.isJumping ? Math.sin(g.frameCount * 0.3) * 1.5 : 0;
    const ty = y + bounce;

    // Sombra
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(x + 35, ty + TRUCK_SIZE + 8, 35, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x + 35, ty + TRUCK_SIZE / 2);
    ctx.rotate(slopeAngle * 0.3); // inclinacao suave nas ladeiras
    ctx.translate(-(x + 35), -(ty + TRUCK_SIZE / 2));

    if (truckImgRef.current) {
      const img = truckImgRef.current;
      const drawW = 90;
      const drawH = (img.height / img.width) * drawW;
      ctx.drawImage(img, x - 10, ty - drawH + TRUCK_SIZE + 5, drawW, drawH);
    } else {
      ctx.fillStyle = "#C9A84C";
      ctx.fillRect(x, ty, 70, TRUCK_SIZE);
      ctx.fillStyle = "#000";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText("PEGUE", x + 35, ty + 25);
    }

    // Farois do caminhao (brilham no tunel e a noite)
    if (g.inTunnel || g.nightMode) {
      ctx.fillStyle = "rgba(255,255,200,0.8)";
      ctx.beginPath();
      ctx.moveTo(x + 75, ty + 10);
      ctx.lineTo(x + 120, ty - 5);
      ctx.lineTo(x + 120, ty + 25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#FFFFAA";
      ctx.beginPath();
      ctx.arc(x + 75, ty + 12, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 75, ty + 22, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // === MONTANHAS DE FUNDO ===
  function drawMountains(ctx: CanvasRenderingContext2D, W: number, groundY: number, offset: number, nightMode: boolean) {
    // Montanhas distantes
    ctx.fillStyle = nightMode ? "#1a1a2e" : "#7BA87B";
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= W; x += 5) {
      const wx = x + offset * 0.03;
      const h = Math.sin(wx * 0.003) * 50 + Math.sin(wx * 0.001) * 30 + Math.cos(wx * 0.0025) * 20 + 75;
      ctx.lineTo(x, groundY - h);
    }
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    // Morros intermediarios
    ctx.fillStyle = nightMode ? "#151528" : "#5C8A5C";
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= W; x += 5) {
      const wx = x + offset * 0.06;
      const h = Math.sin(wx * 0.005) * 35 + Math.sin(wx * 0.002) * 20 + Math.cos(wx * 0.007) * 10 + 50;
      ctx.lineTo(x, groundY - h);
    }
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();

    // Morros proximos
    ctx.fillStyle = nightMode ? "#121222" : "#4A7A4A";
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= W; x += 4) {
      const wx = x + offset * 0.1;
      const h = Math.sin(wx * 0.008) * 22 + Math.sin(wx * 0.003) * 12 + 28;
      ctx.lineTo(x, groundY - h);
    }
    ctx.lineTo(W, groundY);
    ctx.closePath();
    ctx.fill();
  }

  // === PONTOS TURISTICOS ===
  function drawLandmark(ctx: CanvasRenderingContext2D, lm: Landmark, groundY: number) {
    const baseY = groundY;

    if (lm.type === "pontilhao") {
      ctx.fillStyle = "#4a4a4a";
      ctx.fillRect(lm.x + 10, baseY - 100, 12, 100);
      ctx.fillRect(lm.x + lm.width - 22, baseY - 100, 12, 100);
      ctx.fillRect(lm.x + lm.width / 2 - 6, baseY - 100, 12, 100);
      ctx.fillStyle = "#5a5a5a";
      ctx.fillRect(lm.x, baseY - 110, lm.width, 15);
      ctx.strokeStyle = "#666";
      ctx.lineWidth = 1;
      for (let i = 0; i < lm.width; i += 8) {
        ctx.beginPath();
        ctx.moveTo(lm.x + i, baseY - 110);
        ctx.lineTo(lm.x + i, baseY - 120);
        ctx.stroke();
      }
      ctx.fillRect(lm.x, baseY - 122, lm.width, 3);
      ctx.fillStyle = "#2E5A2E";
      ctx.fillRect(lm.x + lm.width / 2 - 30, baseY - 140, 60, 18);
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 7px Arial";
      ctx.textAlign = "center";
      ctx.fillText("PONTILHAO", lm.x + lm.width / 2, baseY - 128);
      ctx.fillText("OSASCO", lm.x + lm.width / 2, baseY - 120);
    }

    else if (lm.type === "ponte_estaiada") {
      ctx.fillStyle = "#DDD";
      const mx = lm.x + lm.width / 2;
      ctx.fillRect(mx - 4, baseY - 160, 8, 160);
      ctx.strokeStyle = "#BBB";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 7) * 0.8 + 0.1;
        ctx.beginPath(); ctx.moveTo(mx, baseY - 155 + i * 8); ctx.lineTo(mx - 80 * angle, baseY - 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx, baseY - 155 + i * 8); ctx.lineTo(mx + 80 * angle, baseY - 10); ctx.stroke();
      }
      ctx.fillStyle = "#999";
      ctx.fillRect(lm.x, baseY - 15, lm.width, 8);
      ctx.strokeStyle = "#DDD";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(mx, baseY - 140, 25, Math.PI, 0);
      ctx.stroke();
    }

    else if (lm.type === "ponte_metalica") {
      const h = 80;
      ctx.strokeStyle = "#A0522D";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(lm.x, baseY - h); ctx.lineTo(lm.x + lm.width, baseY - h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lm.x, baseY - h + 30); ctx.lineTo(lm.x + lm.width, baseY - h + 30); ctx.stroke();
      for (let i = 0; i < lm.width; i += 20) {
        ctx.beginPath(); ctx.moveTo(lm.x + i, baseY - h); ctx.lineTo(lm.x + i + 20, baseY - h + 30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(lm.x + i + 20, baseY - h); ctx.lineTo(lm.x + i, baseY - h + 30); ctx.stroke();
      }
      ctx.fillStyle = "#6B3410";
      ctx.fillRect(lm.x + 5, baseY - h + 30, 10, h - 30);
      ctx.fillRect(lm.x + lm.width - 15, baseY - h + 30, 10, h - 30);
      ctx.fillStyle = "#333";
      ctx.fillRect(lm.x + lm.width / 2 - 25, baseY - h - 15, 50, 12);
      ctx.fillStyle = "#C9A84C";
      ctx.font = "bold 6px Arial";
      ctx.textAlign = "center";
      ctx.fillText("PONTE METALICA", lm.x + lm.width / 2, baseY - h - 6);
    }

    else if (lm.type === "copan") {
      ctx.fillStyle = "#CCC";
      ctx.beginPath();
      ctx.moveTo(lm.x, baseY);
      ctx.lineTo(lm.x, baseY - 140);
      ctx.quadraticCurveTo(lm.x + lm.width / 2, baseY - 150, lm.x + lm.width, baseY - 130);
      ctx.lineTo(lm.x + lm.width, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#AAA";
      ctx.lineWidth = 1;
      for (let y = baseY - 135; y < baseY; y += 6) {
        ctx.beginPath(); ctx.moveTo(lm.x + 2, y); ctx.lineTo(lm.x + lm.width - 2, y); ctx.stroke();
      }
    }

    else if (lm.type === "masp") {
      ctx.fillStyle = "#CC0000";
      const pillarH = 50;
      ctx.fillRect(lm.x + 5, baseY - pillarH, 8, pillarH);
      ctx.fillRect(lm.x + lm.width - 13, baseY - pillarH, 8, pillarH);
      ctx.fillStyle = "#333";
      ctx.fillRect(lm.x, baseY - pillarH - 35, lm.width, 35);
      ctx.fillStyle = "#87CEEB55";
      ctx.fillRect(lm.x + 3, baseY - pillarH - 32, lm.width - 6, 29);
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText("MASP", lm.x + lm.width / 2, baseY - pillarH - 14);
    }

    else if (lm.type === "fabrica") {
      ctx.fillStyle = "#444";
      ctx.fillRect(lm.x, baseY - 70, lm.width, 70);
      ctx.fillStyle = "#555";
      ctx.beginPath();
      ctx.moveTo(lm.x - 5, baseY - 70);
      ctx.lineTo(lm.x + lm.width / 2, baseY - 90);
      ctx.lineTo(lm.x + lm.width + 5, baseY - 70);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#666";
      ctx.fillRect(lm.x + lm.width - 20, baseY - 110, 10, 40);
      ctx.fillStyle = "#C9A84C55";
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          ctx.fillRect(lm.x + 8 + c * 22, baseY - 60 + r * 25, 14, 18);
        }
      }
      ctx.fillStyle = "#C9A84C";
      ctx.fillRect(lm.x + 10, baseY - 75, lm.width - 20, 12);
      ctx.fillStyle = "#000";
      ctx.font = "bold 7px Arial";
      ctx.textAlign = "center";
      ctx.fillText("OTIMIZI", lm.x + lm.width / 2, baseY - 66);
    }

    else if (lm.type === "neo_quimica") {
      const cx = lm.x + lm.width / 2;
      ctx.fillStyle = "#E8E8E8";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 50, lm.width / 2, 70, 0, Math.PI, 0);
      ctx.lineTo(lm.x + lm.width, baseY);
      ctx.lineTo(lm.x, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#F5F5F5";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 50, lm.width / 2 - 5, 65, 0, Math.PI, 0);
      ctx.lineTo(lm.x + lm.width - 5, baseY - 5);
      ctx.lineTo(lm.x + 5, baseY - 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#CCC";
      ctx.lineWidth = 1;
      for (let i = 0; i < lm.width; i += 15) {
        const fx = lm.x + i;
        const fy = baseY - 50 - Math.sqrt(Math.max(0, 1 - Math.pow((fx - cx) / (lm.width / 2), 2))) * 65;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, baseY - 5); ctx.stroke();
      }
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 50, lm.width / 2, 70, 0, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = "#4a7a4a";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 55, lm.width / 4, 25, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.fillRect(lm.x + 15, baseY - 35, lm.width - 30, 16);
      ctx.fillStyle = "#00AAFF";
      ctx.font = "bold 7px Arial";
      ctx.textAlign = "center";
      ctx.fillText("NEO QUIMICA ARENA", cx, baseY - 24);
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.arc(cx, baseY - 80, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#FFF";
      ctx.beginPath(); ctx.arc(cx, baseY - 80, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#000";
      ctx.font = "bold 8px Arial";
      ctx.fillText("C", cx, baseY - 77);
      for (const tx of [lm.x + 10, lm.x + lm.width - 10]) {
        ctx.fillStyle = "#888";
        ctx.fillRect(tx - 2, baseY - 130, 4, 80);
        ctx.fillStyle = gameRef.current.nightMode ? "#FFD700" : "#DDD";
        ctx.fillRect(tx - 6, baseY - 135, 12, 6);
      }
    }

    // === NOVOS PONTOS TURISTICOS ===
    else if (lm.type === "catedral_se") {
      // Catedral da Se - estilo gotico
      const cx = lm.x + lm.width / 2;
      ctx.fillStyle = "#B8A88A";
      // Corpo principal
      ctx.fillRect(lm.x + 10, baseY - 100, lm.width - 20, 100);
      // Torres laterais
      ctx.fillRect(lm.x, baseY - 130, 18, 130);
      ctx.fillRect(lm.x + lm.width - 18, baseY - 130, 18, 130);
      // Pontas goticas
      ctx.fillStyle = "#8A7A6A";
      ctx.beginPath();
      ctx.moveTo(lm.x, baseY - 130);
      ctx.lineTo(lm.x + 9, baseY - 155);
      ctx.lineTo(lm.x + 18, baseY - 130);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(lm.x + lm.width - 18, baseY - 130);
      ctx.lineTo(lm.x + lm.width - 9, baseY - 155);
      ctx.lineTo(lm.x + lm.width, baseY - 130);
      ctx.fill();
      // Torre central
      ctx.beginPath();
      ctx.moveTo(cx - 8, baseY - 100);
      ctx.lineTo(cx, baseY - 145);
      ctx.lineTo(cx + 8, baseY - 100);
      ctx.fill();
      // Cruz no topo
      ctx.fillStyle = "#C9A84C";
      ctx.fillRect(cx - 1, baseY - 155, 2, 12);
      ctx.fillRect(cx - 4, baseY - 150, 8, 2);
      // Roseta (circulo decorativo)
      ctx.strokeStyle = "#C9A84C";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, baseY - 80, 10, 0, Math.PI * 2);
      ctx.stroke();
      // Janelas
      ctx.fillStyle = "#87CEEB44";
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(lm.x + 18 + i * 18, baseY - 70, 8, 20);
      }
      // Placa
      ctx.fillStyle = "#333";
      ctx.fillRect(cx - 28, baseY - 165, 56, 12);
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 6px Arial";
      ctx.textAlign = "center";
      ctx.fillText("CATEDRAL DA SE", cx, baseY - 157);
    }

    else if (lm.type === "mercadao") {
      // Mercadao de SP
      const cx = lm.x + lm.width / 2;
      ctx.fillStyle = "#D4A76A";
      ctx.fillRect(lm.x, baseY - 80, lm.width, 80);
      // Telhado abobadado
      ctx.fillStyle = "#B8862D";
      ctx.beginPath();
      ctx.arc(cx, baseY - 80, lm.width / 2, Math.PI, 0);
      ctx.fill();
      // Vitrais (arcos coloridos)
      const vitralColors = ["#CC3333", "#3333CC", "#33CC33", "#CCCC33"];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = vitralColors[i] + "66";
        const vx = lm.x + 8 + i * 20;
        ctx.beginPath();
        ctx.arc(vx + 6, baseY - 55, 7, Math.PI, 0);
        ctx.lineTo(vx + 13, baseY - 30);
        ctx.lineTo(vx - 1, baseY - 30);
        ctx.closePath();
        ctx.fill();
      }
      // Letreiro
      ctx.fillStyle = "#8B4513";
      ctx.fillRect(cx - 30, baseY - 95, 60, 14);
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 7px Arial";
      ctx.textAlign = "center";
      ctx.fillText("MERCADAO SP", cx, baseY - 85);
    }

    else if (lm.type === "ibirapuera") {
      // Obelisco do Ibirapuera
      const cx = lm.x + lm.width / 2;
      // Obelisco
      ctx.fillStyle = "#DDD";
      ctx.beginPath();
      ctx.moveTo(cx - 8, baseY);
      ctx.lineTo(cx - 3, baseY - 150);
      ctx.lineTo(cx + 3, baseY - 150);
      ctx.lineTo(cx + 8, baseY);
      ctx.closePath();
      ctx.fill();
      // Ponta
      ctx.fillStyle = "#CCC";
      ctx.beginPath();
      ctx.moveTo(cx - 3, baseY - 150);
      ctx.lineTo(cx, baseY - 165);
      ctx.lineTo(cx + 3, baseY - 150);
      ctx.fill();
      // Base
      ctx.fillStyle = "#AAA";
      ctx.fillRect(cx - 15, baseY - 10, 30, 10);
      // Arvores do parque
      ctx.fillStyle = "#2E7D32";
      ctx.beginPath(); ctx.arc(lm.x + 5, baseY - 15, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lm.x + lm.width - 5, baseY - 15, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lm.x - 5, baseY - 10, 10, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(lm.x + lm.width + 5, baseY - 10, 10, 0, Math.PI * 2); ctx.fill();
      // Troncos
      ctx.fillStyle = "#5D4037";
      ctx.fillRect(lm.x + 3, baseY - 5, 4, 5);
      ctx.fillRect(lm.x + lm.width - 7, baseY - 5, 4, 5);
      // Placa
      ctx.fillStyle = "#333";
      ctx.fillRect(cx - 22, baseY + 2, 44, 10);
      ctx.fillStyle = "#C9A84C";
      ctx.font = "bold 5px Arial";
      ctx.textAlign = "center";
      ctx.fillText("IBIRAPUERA", cx, baseY + 9);
    }

    else if (lm.type === "calcadao_osasco") {
      // Calcadao de Osasco - area de comercio
      // Predios comerciais
      ctx.fillStyle = "#B0A090";
      ctx.fillRect(lm.x, baseY - 60, 25, 60);
      ctx.fillStyle = "#A09080";
      ctx.fillRect(lm.x + 30, baseY - 75, 25, 75);
      ctx.fillStyle = "#C0B0A0";
      ctx.fillRect(lm.x + 60, baseY - 55, 25, 55);
      // Toldos coloridos (lojas)
      const toldoColors = ["#CC3333", "#3333CC", "#33AA33"];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = toldoColors[i];
        ctx.beginPath();
        const tx = lm.x + i * 30 + 2;
        ctx.moveTo(tx, baseY - 25);
        ctx.lineTo(tx + 21, baseY - 25);
        ctx.lineTo(tx + 24, baseY - 18);
        ctx.lineTo(tx - 3, baseY - 18);
        ctx.closePath();
        ctx.fill();
      }
      // Piso do calcadao (padroes)
      ctx.fillStyle = "#E8DDD0";
      ctx.fillRect(lm.x - 5, baseY - 3, lm.width + 10, 6);
      ctx.strokeStyle = "#CCC";
      ctx.lineWidth = 0.5;
      for (let i = 0; i < lm.width + 10; i += 6) {
        ctx.beginPath();
        ctx.moveTo(lm.x - 5 + i, baseY - 3);
        ctx.lineTo(lm.x - 5 + i, baseY + 3);
        ctx.stroke();
      }
      // Placa
      ctx.fillStyle = "#2E5A2E";
      ctx.fillRect(lm.x + lm.width / 2 - 28, baseY - 85, 56, 12);
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 5px Arial";
      ctx.textAlign = "center";
      ctx.fillText("CALCADAO OSASCO", lm.x + lm.width / 2, baseY - 77);
    }
  }

  // === DRAW ITEM ===
  function drawItem(ctx: CanvasRenderingContext2D, item: Item, terrainYOffset: number) {
    if (item.collected) return;
    const g = gameRef.current;
    const bob = Math.sin(g.frameCount * 0.06 + item.x * 0.01) * 4;
    const y = item.y + bob - terrainYOffset;
    const s = item.scale;

    if (item.type === "pacote") {
      ctx.fillStyle = "#8B4513";
      ctx.fillRect(item.x - 10 * s, y - 10 * s, 20 * s, 20 * s);
      ctx.fillStyle = "#A0522D";
      ctx.fillRect(item.x - 8 * s, y - 8 * s, 16 * s, 16 * s);
      ctx.fillStyle = "#DAA520";
      ctx.fillRect(item.x - 1, y - 10 * s, 2, 20 * s);
      ctx.fillRect(item.x - 10 * s, y - 1, 20 * s, 2);
    } else if (item.type === "pegue_logo") {
      const r = 14 * s;
      ctx.fillStyle = "#C9A84C";
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6 - Math.PI / 2;
        const method = i === 0 ? "moveTo" : "lineTo";
        ctx[method](item.x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#8B7530";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.font = `bold ${16 * s}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", item.x, y);
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.arc(item.x - 4 * s, y - 5 * s, 4 * s, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#C9A84C";
      ctx.beginPath();
      ctx.arc(item.x, y, 9 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#8B7530";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(item.x, y, 9 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.font = `bold ${11 * s}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", item.x, y);
      ctx.textBaseline = "alphabetic";
    }
  }

  // === DRAW OBSTACLE (expandido) ===
  function drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle, groundY: number) {
    if (obs.type === "barreira") {
      const stripes = 4;
      const stripeH = obs.height / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#FF6B00" : "#FFF";
        ctx.fillRect(obs.x, groundY - obs.height + i * stripeH, obs.width, stripeH);
      }
      ctx.fillStyle = "#666";
      ctx.fillRect(obs.x - 2, groundY - obs.height - 5, 4, obs.height + 5);
      ctx.fillRect(obs.x + obs.width - 2, groundY - obs.height - 5, 4, obs.height + 5);
    }
    else if (obs.type === "cone") {
      ctx.fillStyle = "#FF6600";
      ctx.beginPath();
      ctx.moveTo(obs.x + obs.width / 2, groundY - obs.height);
      ctx.lineTo(obs.x + obs.width, groundY);
      ctx.lineTo(obs.x, groundY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#FFF";
      ctx.fillRect(obs.x + 4, groundY - obs.height * 0.6, obs.width - 8, 3);
      ctx.fillRect(obs.x + 2, groundY - obs.height * 0.3, obs.width - 4, 3);
    }
    else if (obs.type === "buraco") {
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width / 2, groundY, obs.width / 2, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width / 2, groundY + 1, obs.width / 2 - 4, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    else if (obs.type === "pedra") {
      // Pedra/rocha na pista
      ctx.fillStyle = "#888";
      ctx.beginPath();
      ctx.moveTo(obs.x, groundY);
      ctx.lineTo(obs.x + 4, groundY - obs.height * 0.6);
      ctx.lineTo(obs.x + obs.width * 0.3, groundY - obs.height);
      ctx.lineTo(obs.x + obs.width * 0.6, groundY - obs.height * 0.9);
      ctx.lineTo(obs.x + obs.width * 0.85, groundY - obs.height * 0.5);
      ctx.lineTo(obs.x + obs.width, groundY);
      ctx.closePath();
      ctx.fill();
      // Sombra e detalhe
      ctx.fillStyle = "#666";
      ctx.beginPath();
      ctx.moveTo(obs.x + obs.width * 0.3, groundY - obs.height);
      ctx.lineTo(obs.x + obs.width * 0.5, groundY - obs.height * 0.7);
      ctx.lineTo(obs.x + obs.width * 0.6, groundY - obs.height * 0.9);
      ctx.closePath();
      ctx.fill();
      // Brilho
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(obs.x + obs.width * 0.35, groundY - obs.height * 0.7, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    else if (obs.type === "motoqueiro") {
      // Motoqueiro cortando o transito - cultura SP
      const mx = obs.x;
      const my = groundY;
      // Roda traseira
      ctx.fillStyle = "#222";
      ctx.beginPath(); ctx.arc(mx + 5, my - 5, 7, 0, Math.PI * 2); ctx.fill();
      // Roda dianteira
      ctx.beginPath(); ctx.arc(mx + 35, my - 5, 7, 0, Math.PI * 2); ctx.fill();
      // Aro
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx + 5, my - 5, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx + 35, my - 5, 5, 0, Math.PI * 2); ctx.stroke();
      // Corpo da moto
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.moveTo(mx + 5, my - 12);
      ctx.lineTo(mx + 15, my - 20);
      ctx.lineTo(mx + 30, my - 18);
      ctx.lineTo(mx + 38, my - 12);
      ctx.lineTo(mx + 35, my - 8);
      ctx.lineTo(mx + 5, my - 8);
      ctx.closePath();
      ctx.fill();
      // Tanque
      ctx.fillStyle = "#CC0000";
      ctx.beginPath();
      ctx.ellipse(mx + 20, my - 16, 8, 4, -0.1, 0, Math.PI * 2);
      ctx.fill();
      // Piloto - capacete
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(mx + 18, my - 28, 7, 0, Math.PI * 2);
      ctx.fill();
      // Viseira
      ctx.fillStyle = "#333";
      ctx.fillRect(mx + 20, my - 30, 6, 5);
      // Corpo do piloto
      ctx.fillStyle = "#222";
      ctx.fillRect(mx + 14, my - 22, 8, 8);
      // Guidao
      ctx.strokeStyle = "#666";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx + 30, my - 20);
      ctx.lineTo(mx + 34, my - 26);
      ctx.stroke();
      // Escapamento fumaca
      if (gameRef.current.frameCount % 4 < 2) {
        ctx.fillStyle = "rgba(150,150,150,0.3)";
        ctx.beginPath();
        ctx.arc(mx - 5, my - 8, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mx - 12, my - 10, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    else if (obs.type === "motoboy") {
      // Motoboy de delivery - muito SP!
      const mx = obs.x;
      const my = groundY;
      // Rodas
      ctx.fillStyle = "#222";
      ctx.beginPath(); ctx.arc(mx + 5, my - 5, 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(mx + 35, my - 5, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx + 5, my - 5, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(mx + 35, my - 5, 5, 0, Math.PI * 2); ctx.stroke();
      // Corpo moto
      ctx.fillStyle = "#444";
      ctx.beginPath();
      ctx.moveTo(mx + 5, my - 12);
      ctx.lineTo(mx + 15, my - 18);
      ctx.lineTo(mx + 30, my - 16);
      ctx.lineTo(mx + 38, my - 12);
      ctx.lineTo(mx + 35, my - 8);
      ctx.lineTo(mx + 5, my - 8);
      ctx.closePath();
      ctx.fill();
      // BAU DE DELIVERY (laranja/vermelho - iFood style)
      ctx.fillStyle = "#E84C3D";
      ctx.fillRect(mx + 2, my - 36, 18, 16);
      ctx.fillStyle = "#C0392B";
      ctx.fillRect(mx + 2, my - 36, 18, 3);
      // Logo no bau
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 5px Arial";
      ctx.textAlign = "center";
      ctx.fillText("FOME", mx + 11, my - 25);
      // Piloto com capacete
      ctx.fillStyle = "#E84C3D"; // capacete vermelho do app
      ctx.beginPath();
      ctx.arc(mx + 20, my - 26, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.fillRect(mx + 22, my - 28, 5, 4);
      // Corpo
      ctx.fillStyle = "#333";
      ctx.fillRect(mx + 16, my - 21, 8, 7);
      // Mochila termica nas costas
      ctx.fillStyle = "#E84C3D";
      ctx.fillRect(mx + 8, my - 28, 8, 10);
    }
    else if (obs.type === "radar") {
      // Radar / Lombada eletronica - classico de SP
      const rx = obs.x + obs.width / 2;
      // Poste
      ctx.fillStyle = "#777";
      ctx.fillRect(rx - 2, groundY - 65, 4, 65);
      // Caixa do radar
      ctx.fillStyle = "#333";
      ctx.fillRect(rx - 10, groundY - 72, 20, 14);
      // Lente da camera
      const g = gameRef.current;
      const flashing = obs.flashTimer && obs.flashTimer > 0;
      ctx.fillStyle = flashing ? "#FF0000" : "#880000";
      ctx.beginPath();
      ctx.arc(rx, groundY - 65, 4, 0, Math.PI * 2);
      ctx.fill();
      // Flash
      if (flashing) {
        ctx.fillStyle = "rgba(255,0,0,0.3)";
        ctx.beginPath();
        ctx.arc(rx, groundY - 65, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      // Placa "VELOCIDADE"
      ctx.fillStyle = "#FFF";
      ctx.fillRect(rx - 14, groundY - 88, 28, 14);
      ctx.strokeStyle = "#CC0000";
      ctx.lineWidth = 2;
      ctx.strokeRect(rx - 14, groundY - 88, 28, 14);
      ctx.fillStyle = "#000";
      ctx.font = "bold 5px Arial";
      ctx.textAlign = "center";
      ctx.fillText("REDUZA", rx, groundY - 80);
      ctx.fillText("VELOCIDADE", rx, groundY - 75);
      // Faixa lombada no chao
      ctx.fillStyle = "#FFD700";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(obs.x - 10 + i * 12, groundY - 2, 8, 4);
      }
    }
  }

  // === DRAW TRAFFIC LIGHT ===
  function drawTrafficLight(ctx: CanvasRenderingContext2D, tl: TrafficLight, groundY: number) {
    const tx = tl.x;
    // Poste
    ctx.fillStyle = "#555";
    ctx.fillRect(tx + 7, groundY - 75, 5, 75);
    // Braco horizontal
    ctx.fillRect(tx - 5, groundY - 75, 30, 4);
    // Caixa do semaforo
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.roundRect(tx - 2, groundY - 100, 22, 50, 4);
    ctx.fill();
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tx - 2, groundY - 100, 22, 50, 4);
    ctx.stroke();
    // Luz vermelha
    ctx.fillStyle = tl.state === "red" ? "#FF0000" : "#330000";
    ctx.beginPath();
    ctx.arc(tx + 9, groundY - 90, 6, 0, Math.PI * 2);
    ctx.fill();
    if (tl.state === "red") {
      ctx.fillStyle = "rgba(255,0,0,0.2)";
      ctx.beginPath();
      ctx.arc(tx + 9, groundY - 90, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    // Luz amarela
    ctx.fillStyle = "#332200";
    ctx.beginPath();
    ctx.arc(tx + 9, groundY - 76, 6, 0, Math.PI * 2);
    ctx.fill();
    // Luz verde
    ctx.fillStyle = tl.state === "green" ? "#00FF00" : "#003300";
    ctx.beginPath();
    ctx.arc(tx + 9, groundY - 62, 6, 0, Math.PI * 2);
    ctx.fill();
    if (tl.state === "green") {
      ctx.fillStyle = "rgba(0,255,0,0.2)";
      ctx.beginPath();
      ctx.arc(tx + 9, groundY - 62, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // === DRAW BRIDGE (foreground - caminhao passa por baixo) ===
  function drawBridge(ctx: CanvasRenderingContext2D, screenX: number, width: number, groundY: number, label: string) {
    // Pilares
    ctx.fillStyle = "#666";
    ctx.fillRect(screenX, groundY - 85, 15, 85);
    ctx.fillRect(screenX + width - 15, groundY - 85, 15, 85);
    // Deck
    ctx.fillStyle = "#555";
    ctx.fillRect(screenX - 10, groundY - 95, width + 20, 15);
    // Superficie do deck
    ctx.fillStyle = "#4a4a4a";
    ctx.fillRect(screenX - 10, groundY - 95, width + 20, 4);
    // Grade lateral
    ctx.strokeStyle = "#777";
    ctx.lineWidth = 1;
    for (let i = 0; i < width + 20; i += 10) {
      ctx.beginPath();
      ctx.moveTo(screenX - 10 + i, groundY - 95);
      ctx.lineTo(screenX - 10 + i, groundY - 105);
      ctx.stroke();
    }
    ctx.fillStyle = "#777";
    ctx.fillRect(screenX - 10, groundY - 107, width + 20, 3);
    // Placa
    ctx.fillStyle = "#2E5A2E";
    const cx = screenX + width / 2;
    ctx.fillRect(cx - 30, groundY - 120, 60, 14);
    ctx.fillStyle = "#FFF";
    ctx.font = "bold 6px Arial";
    ctx.textAlign = "center";
    ctx.fillText(label, cx, groundY - 110);
  }

  // === DRAW TUNNEL ===
  function drawTunnelOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, alpha: number) {
    if (alpha <= 0) return;
    // Escurecimento
    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.75})`;
    ctx.fillRect(0, 0, W, H);
    // Luzes do tunel (pontos amarelos nas laterais)
    if (alpha > 0.3) {
      const g = gameRef.current;
      ctx.fillStyle = `rgba(255,200,50,${alpha * 0.8})`;
      for (let i = 0; i < 6; i++) {
        const lx = ((i * 130 - g.groundOffset * 0.5) % (W + 100)) + 50;
        if (lx > 0 && lx < W) {
          ctx.beginPath();
          ctx.arc(lx, H * GROUND_HEIGHT - 40, 3, 0, Math.PI * 2);
          ctx.fill();
          // Halo
          ctx.fillStyle = `rgba(255,200,50,${alpha * 0.15})`;
          ctx.beginPath();
          ctx.arc(lx, H * GROUND_HEIGHT - 40, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(255,200,50,${alpha * 0.8})`;
        }
      }
      // Texto do tunel
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.4})`;
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText("TUNEL", W / 2, 80);
    }
  }

  function spawnParticles(x: number, y: number, color: string, count: number) {
    const g = gameRef.current;
    for (let i = 0; i < count; i++) {
      g.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 1) * 5,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  }

  const startGame = useCallback(() => {
    const g = gameRef.current;
    Object.assign(g, {
      score: 0, speed: INITIAL_SPEED, truckY: 0, truckVY: 0,
      isJumping: false, obstacles: [], items: [], particles: [],
      trafficLights: [], foregroundEvents: [],
      groundOffset: 0, frameCount: 0, nextSpawn: 80, nextItemSpawn: 50,
      nextTrafficLight: 250, nextForeground: 500,
      gameOver: false, started: true, running: true, distance: 0,
      combo: 0, comboTimer: 0, flashTimer: 0, nightMode: false,
      terrainScale: 0, radarFlash: 0, tunnelAlpha: 0, inTunnel: false,
      statusText: "", statusTimer: 0,
    });
    g.clouds = Array.from({ length: 5 }, () => ({
      x: Math.random() * 800, y: 20 + Math.random() * 80,
      w: 40 + Math.random() * 60, speed: 0.3 + Math.random() * 0.5,
    }));
    g.landmarks = [
      { x: 600, type: "pontilhao", width: 160, height: 120 },
      { x: 1200, type: "calcadao_osasco", width: 90, height: 85 },
      { x: 2000, type: "fabrica", width: 80, height: 90 },
      { x: 2800, type: "ponte_metalica", width: 120, height: 80 },
      { x: 3600, type: "catedral_se", width: 80, height: 155 },
      { x: 4400, type: "copan", width: 50, height: 150 },
      { x: 5200, type: "mercadao", width: 90, height: 95 },
      { x: 6000, type: "masp", width: 70, height: 85 },
      { x: 6800, type: "ibirapuera", width: 60, height: 165 },
      { x: 7800, type: "ponte_estaiada", width: 180, height: 160 },
      { x: 8800, type: "neo_quimica", width: 200, height: 140 },
    ];
    g.foregroundEvents = [
      { worldX: 1800, width: 200, type: "bridge", label: "VIADUTO DO CHA" },
      { worldX: 4000, width: 300, type: "tunnel", label: "TUNEL AYRTON SENNA" },
      { worldX: 6400, width: 180, type: "bridge", label: "PONTE DO PIQUERI" },
      { worldX: 8200, width: 350, type: "tunnel", label: "TUNEL JAGUARE" },
      { worldX: 10000, width: 200, type: "bridge", label: "VIADUTO PAULISTA" },
      { worldX: 12000, width: 280, type: "tunnel", label: "TUNEL 9 DE JULHO" },
    ];
    setGameState("playing");
    setDisplayScore(0);
    setScoreSaved(false);
    setShowRanking(false);
  }, []);

  const jump = useCallback(() => {
    const g = gameRef.current;
    if (g.gameOver) { startGame(); return; }
    if (!g.started) { startGame(); return; }
    if (!g.isJumping) {
      g.truckVY = JUMP_FORCE;
      g.isJumping = true;
      playSound("game-jump");
    }
  }, [startGame]);

  // === GAME LOOP ===
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() { if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; } }
    resize();
    window.addEventListener("resize", resize);

    function loop() {
      if (!canvas || !ctx) return;
      const g = gameRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const baseGroundY = H * GROUND_HEIGHT;

      // Terreno escala progressivamente
      g.terrainScale = Math.min(1, g.distance / 200);

      // Calcula altura do terreno na posicao do caminhao
      const truckTerrainOffset = getTerrainY(60 + g.groundOffset) * g.terrainScale;
      const truckGroundY = baseGroundY - truckTerrainOffset;

      // Slope angle para inclinar o caminhao
      const slopeDelta = getTerrainY(64 + g.groundOffset) - getTerrainY(56 + g.groundOffset);
      const slopeAngle = Math.atan2(-slopeDelta * g.terrainScale, 8);

      if (g.distance > 500) g.nightMode = true;

      // === FUNDO ===
      if (g.nightMode) {
        const grad = ctx.createLinearGradient(0, 0, 0, baseGroundY);
        grad.addColorStop(0, "#0a0a2e");
        grad.addColorStop(1, "#1a1a3e");
        ctx.fillStyle = grad;
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, baseGroundY);
        grad.addColorStop(0, "#87CEEB");
        grad.addColorStop(0.7, "#B0E0E6");
        grad.addColorStop(1, "#E8D5B7");
        ctx.fillStyle = grad;
      }
      ctx.fillRect(0, 0, W, H);

      // Estrelas noturnas
      if (g.nightMode) {
        ctx.fillStyle = "#FFF";
        for (let i = 0; i < 40; i++) {
          const sx = (i * 137 + g.frameCount * 0.02) % W;
          const sy = (i * 97) % (baseGroundY * 0.4);
          const tw = Math.sin(g.frameCount * 0.05 + i) > 0.5 ? 1.5 : 0.8;
          ctx.beginPath();
          ctx.arc(sx, sy, tw, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // === MONTANHAS DE FUNDO ===
      drawMountains(ctx, W, baseGroundY, g.groundOffset, g.nightMode);

      // Nuvens
      ctx.fillStyle = g.nightMode ? "rgba(50,50,70,0.4)" : "rgba(255,255,255,0.85)";
      g.clouds.forEach((c) => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.w / 3, 0, Math.PI * 2);
        ctx.arc(c.x + c.w / 4, c.y - 8, c.w / 4, 0, Math.PI * 2);
        ctx.arc(c.x + c.w / 2, c.y, c.w / 3.5, 0, Math.PI * 2);
        ctx.fill();
        if (g.running) c.x -= c.speed;
        if (c.x + c.w < 0) c.x = W + 50;
      });

      // === LANDMARKS NO FUNDO ===
      g.landmarks.forEach((lm) => {
        const lx = lm.x - g.groundOffset * 0.15;
        const totalWidth = 11000;
        const adjustedX = ((lx % totalWidth) + totalWidth) % totalWidth - 200;
        const drawLm = { ...lm, x: adjustedX };
        if (adjustedX > -250 && adjustedX < W + 250) {
          drawLandmark(ctx, drawLm, baseGroundY);
        }
      });

      // === ESTRADA COM TERRENO ===
      // Superficie da estrada seguindo o terreno
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) {
        const ty = baseGroundY - getTerrainY(x + g.groundOffset) * g.terrainScale;
        ctx.lineTo(x, ty);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      // Borda superior da estrada
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const ty = baseGroundY - getTerrainY(x + g.groundOffset) * g.terrainScale - 2;
        if (x === 0) ctx.moveTo(x, ty); else ctx.lineTo(x, ty);
      }
      ctx.stroke();

      // Faixa tracejada central seguindo terreno
      ctx.fillStyle = "#FFF";
      const dashW = 40, dashG = 25;
      for (let x = 0; x < W; x += 3) {
        const phase = (x + g.groundOffset) % (dashW + dashG);
        if (phase < dashW) {
          const ty = baseGroundY - getTerrainY(x + g.groundOffset) * g.terrainScale;
          const roadMid = ty + (H - ty) * 0.35;
          ctx.fillRect(x, roadMid, 3, 3);
        }
      }

      // Faixa dourada inferior
      ctx.strokeStyle = "#C9A84C";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const ty = baseGroundY - getTerrainY(x + g.groundOffset) * g.terrainScale;
        const bottomLine = ty + (H - ty) * 0.85;
        if (x === 0) ctx.moveTo(x, bottomLine); else ctx.lineTo(x, bottomLine);
      }
      ctx.stroke();

      // Calcada inferior
      ctx.fillStyle = "#2a2a2a";
      ctx.beginPath();
      for (let x = 0; x <= W; x += 4) {
        const ty = baseGroundY - getTerrainY(x + g.groundOffset) * g.terrainScale;
        const bottomLine = ty + (H - ty) * 0.9;
        if (x === 0) ctx.moveTo(x, bottomLine); else ctx.lineTo(x, bottomLine);
      }
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fill();

      // === UPDATE ===
      if (g.running && !g.gameOver) {
        g.frameCount++;
        g.speed += SPEED_INCREMENT;
        g.groundOffset += g.speed;
        g.distance += g.speed * 0.1;
        g.comboTimer = Math.max(0, g.comboTimer - 1);
        if (g.comboTimer === 0) g.combo = 0;
        g.flashTimer = Math.max(0, g.flashTimer - 1);
        g.radarFlash = Math.max(0, g.radarFlash - 1);
        g.statusTimer = Math.max(0, g.statusTimer - 1);
        if (g.statusTimer === 0) g.statusText = "";

        // Tunel alpha fade
        let insideTunnel = false;
        for (const fe of g.foregroundEvents) {
          if (fe.type === "tunnel") {
            const screenStart = fe.worldX - g.groundOffset * 0.5;
            const screenEnd = screenStart + fe.width;
            if (60 > screenStart && 60 < screenEnd) {
              insideTunnel = true;
              break;
            }
          }
        }
        g.inTunnel = insideTunnel;
        g.tunnelAlpha += insideTunnel ? 0.05 : -0.05;
        g.tunnelAlpha = Math.max(0, Math.min(1, g.tunnelAlpha));

        // Fisica do caminhao
        g.truckVY += GRAVITY;
        g.truckY += g.truckVY;
        if (g.truckY >= 0) { g.truckY = 0; g.truckVY = 0; g.isJumping = false; }

        // Spawn obstaculos (variedade expandida)
        g.nextSpawn--;
        if (g.nextSpawn <= 0) {
          const allTypes: Obstacle["type"][] = ["barreira", "cone", "buraco", "pedra", "motoqueiro", "motoboy", "radar"];
          // Peso por distancia: mais variedade conforme avanca
          let pool: Obstacle["type"][];
          if (g.distance < 100) {
            pool = ["barreira", "cone", "buraco", "pedra"];
          } else if (g.distance < 300) {
            pool = ["barreira", "cone", "buraco", "pedra", "pedra", "motoqueiro", "motoboy"];
          } else {
            pool = allTypes;
          }
          const type = pool[Math.floor(Math.random() * pool.length)];
          let width = 25, height = 30;

          if (type === "barreira") { width = Math.random() > 0.5 ? 50 : 25; height = 25 + Math.random() * 25; }
          else if (type === "cone") { width = 20; height = 25; }
          else if (type === "buraco") { width = 40 + Math.random() * 20; height = 6; }
          else if (type === "pedra") { width = 25 + Math.random() * 15; height = 15 + Math.random() * 15; }
          else if (type === "motoqueiro") { width = 45; height = 35; }
          else if (type === "motoboy") { width = 45; height = 40; }
          else if (type === "radar") { width = 30; height = 72; }

          g.obstacles.push({ x: W + 20, width, height, type, vy: 0, flashTimer: 0, multado: false });
          g.nextSpawn = 60 + Math.random() * 60;
          if (g.speed > 6) g.nextSpawn *= 0.8;
          if (type === "radar") g.nextSpawn += 40; // radares mais espacados
        }

        // Spawn semaforos
        g.nextTrafficLight--;
        if (g.nextTrafficLight <= 0 && g.distance > 80) {
          g.trafficLights.push({
            x: W + 30,
            state: Math.random() > 0.4 ? "red" : "green",
            passed: false,
          });
          g.nextTrafficLight = 200 + Math.random() * 150;
        }

        // Spawn itens
        g.nextItemSpawn--;
        if (g.nextItemSpawn <= 0) {
          const types: Item["type"][] = ["pacote", "pacote", "pacote", "moeda", "moeda", "pegue_logo"];
          g.items.push({
            x: W + 20,
            y: baseGroundY - 50 - Math.random() * 60,
            type: types[Math.floor(Math.random() * types.length)],
            collected: false, scale: 1,
          });
          g.nextItemSpawn = 40 + Math.random() * 60;
        }

        // Move obstaculos
        g.obstacles = g.obstacles.filter((o) => {
          o.x -= g.speed;
          // Motoqueiro weaving
          if (o.type === "motoqueiro" && o.vy !== undefined) {
            o.vy = Math.sin(g.frameCount * 0.08 + o.x * 0.02) * 0.5;
          }
          // Radar flash timer
          if (o.flashTimer && o.flashTimer > 0) o.flashTimer--;
          return o.x + o.width > -60;
        });

        // Move semaforos
        g.trafficLights = g.trafficLights.filter((tl) => {
          tl.x -= g.speed;
          return tl.x > -40;
        });

        // Move itens
        g.items = g.items.filter((i) => { i.x -= g.speed; return i.x > -50 && !i.collected; });

        // Particulas
        g.particles = g.particles.filter((p) => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
          return p.life > 0;
        });

        // === COLISOES ===
        const tL = 60, tR = 60 + 44;
        const tTop = truckGroundY - TRUCK_SIZE + g.truckY;
        const tBot = truckGroundY + g.truckY;

        // Colisao com obstaculos
        for (const obs of g.obstacles) {
          const obsTerrainOffset = getTerrainY(obs.x + g.groundOffset) * g.terrainScale;
          const obsGY = baseGroundY - obsTerrainOffset;

          if (obs.type === "radar") {
            // Radar: nao mata, mas multa (-30pts) ou bonus (+15pts)
            if (!obs.multado && tR > obs.x && tL < obs.x + obs.width) {
              obs.multado = true;
              if (!g.isJumping) {
                // MULTADO!
                g.score = Math.max(0, g.score - 30);
                setDisplayScore(g.score);
                obs.flashTimer = 20;
                g.radarFlash = 15;
                showStatus("MULTADO! -30", 50);
                playSound("game-over");
                spawnParticles(obs.x + 15, obsGY - 50, "#FF0000", 8);
              } else {
                // ESCAPOU!
                g.score += 15;
                setDisplayScore(g.score);
                showStatus("ESCAPOU! +15", 40);
                playSound("game-star");
                spawnParticles(obs.x + 15, obsGY - 50, "#00FF00", 8);
              }
            }
            continue;
          }

          let hit = false;
          if (obs.type === "buraco") {
            if (!g.isJumping && tR > obs.x + 5 && tL < obs.x + obs.width - 5) hit = true;
          } else {
            const obsTop = obsGY - obs.height;
            if (tR > obs.x + 3 && tL < obs.x + obs.width - 3 && tBot > obsTop + 5 && tTop < obsGY) hit = true;
          }

          if (hit) {
            g.gameOver = true;
            g.running = false;
            playSound("game-over");
            spawnParticles(tL + 20, truckGroundY - 20 + g.truckY, "#C9A84C", 20);
            spawnParticles(tL + 20, truckGroundY - 20 + g.truckY, "#FF6600", 15);
            if (g.score > g.highScore) {
              g.highScore = g.score;
              localStorage.setItem("pegue_runner_highscore", g.score.toString());
              setDisplayHighScore(g.score);
            }
            setGameState("gameover");
          }
        }

        // Colisao com semaforos
        for (const tl of g.trafficLights) {
          if (tl.passed) continue;
          if (tR > tl.x && tL < tl.x + 20) {
            tl.passed = true;
            if (tl.state === "red" && !g.isJumping) {
              // Bateu no sinal vermelho!
              g.gameOver = true;
              g.running = false;
              playSound("game-over");
              showStatus("SINAL VERMELHO!", 60);
              spawnParticles(tl.x + 10, truckGroundY - 30, "#FF0000", 20);
              if (g.score > g.highScore) {
                g.highScore = g.score;
                localStorage.setItem("pegue_runner_highscore", g.score.toString());
                setDisplayHighScore(g.score);
              }
              setGameState("gameover");
            } else if (tl.state === "green") {
              // Bonus sinal verde!
              g.score += 20;
              setDisplayScore(g.score);
              showStatus("SINAL VERDE! +20", 35);
              playSound("game-collect");
              spawnParticles(tl.x + 10, truckGroundY - 50, "#00FF00", 10);
            } else if (tl.state === "red" && g.isJumping) {
              // Pulou o sinal - aviso
              showStatus("AVANCOU SINAL!", 30);
              spawnParticles(tl.x + 10, truckGroundY - 50, "#FFFF00", 6);
            }
          }
        }

        // Colisao com itens
        for (const item of g.items) {
          if (item.collected) continue;
          const itemTerrainOffset = getTerrainY(item.x + g.groundOffset) * g.terrainScale;
          const itemY = item.y + Math.sin(g.frameCount * 0.06 + item.x * 0.01) * 4 - itemTerrainOffset;
          const dx = (tL + 22) - item.x, dy = (tTop + TRUCK_SIZE / 2) - itemY;
          if (Math.sqrt(dx * dx + dy * dy) < 30) {
            item.collected = true;
            const pts = item.type === "pegue_logo" ? 50 : item.type === "moeda" ? 25 : 10;
            g.combo++;
            g.comboTimer = 120;
            g.score += pts * Math.min(g.combo, 5);
            g.flashTimer = 10;
            setDisplayScore(g.score);
            playSound(item.type === "pegue_logo" ? "game-star" : "game-collect");
            if (g.combo > 2) playSound("game-combo");
            spawnParticles(item.x, itemY, item.type === "pegue_logo" ? "#C9A84C" : "#FFD700", 12);
          }
        }

        if (g.frameCount % 10 === 0) { g.score++; setDisplayScore(g.score); }
      }

      // === DRAW ENTITIES ===
      // Semaforos
      g.trafficLights.forEach((tl) => {
        const tlTerrainOffset = getTerrainY(tl.x + g.groundOffset) * g.terrainScale;
        drawTrafficLight(ctx, tl, baseGroundY - tlTerrainOffset);
      });

      // Obstaculos
      g.obstacles.forEach((o) => {
        const obsTerrainOffset = getTerrainY(o.x + g.groundOffset) * g.terrainScale;
        drawObstacle(ctx, o, baseGroundY - obsTerrainOffset);
      });

      // Itens
      g.items.forEach((i) => {
        const itemTerrainOffset = getTerrainY(i.x + g.groundOffset) * g.terrainScale;
        drawItem(ctx, i, itemTerrainOffset);
      });

      // Caminhao
      drawTruck(ctx, 60, truckGroundY - TRUCK_SIZE + g.truckY, g.running && !g.gameOver, slopeAngle);

      // Particulas
      g.particles.forEach((p) => {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // === FOREGROUND: PONTES E TUNEIS ===
      g.foregroundEvents.forEach((fe) => {
        const feScreenX = fe.worldX - g.groundOffset * 0.5;
        const totalCycle = 14000;
        const adjustedX = ((feScreenX % totalCycle) + totalCycle) % totalCycle - 400;

        if (adjustedX > -fe.width - 100 && adjustedX < W + 100) {
          if (fe.type === "bridge") {
            drawBridge(ctx, adjustedX, fe.width, baseGroundY, fe.label);
          }
        }
      });

      // Overlay do tunel
      drawTunnelOverlay(ctx, W, H, g.tunnelAlpha);

      // === RADAR FLASH EFFECT ===
      if (g.radarFlash > 0) {
        ctx.fillStyle = `rgba(255,0,0,${g.radarFlash * 0.02})`;
        ctx.fillRect(0, 0, W, H);
      }

      // === STATUS TEXT (MULTADO, ESCAPOU, etc) ===
      if (g.statusText && g.statusTimer > 0) {
        const alpha = Math.min(1, g.statusTimer / 15);
        const yOffset = (50 - g.statusTimer) * 0.5;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.font = "bold 22px Arial";
        ctx.textAlign = "center";
        ctx.fillText(g.statusText, W / 2, H * 0.45 - yOffset);
      }

      // === HUD ===
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(0, 0, W, 56);
      ctx.fillStyle = "#C9A84C";
      ctx.fillRect(0, 56, W, 2);

      ctx.fillStyle = g.flashTimer > 0 ? "#FFD700" : "#FFF";
      ctx.font = "bold 22px Arial";
      ctx.textAlign = "left";
      ctx.fillText(`${g.score}`, 15, 26);

      ctx.fillStyle = "#888";
      ctx.font = "12px Arial";
      ctx.fillText(`${Math.floor(g.distance)}m`, 15, 44);

      // Indicador de ladeira
      if (g.terrainScale > 0.3) {
        const slope = slopeDelta * g.terrainScale;
        if (Math.abs(slope) > 3) {
          ctx.fillStyle = "#C9A84C";
          ctx.font = "10px Arial";
          ctx.textAlign = "left";
          ctx.fillText(slope > 0 ? "▼ DESCIDA" : "▲ LADEIRA", 80, 44);
        }
      }

      if (g.combo > 1) {
        ctx.fillStyle = "#C9A84C";
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`x${Math.min(g.combo, 5)} COMBO!`, W / 2, 26);
      }

      ctx.fillStyle = "#C9A84C";
      ctx.font = "12px Arial";
      ctx.textAlign = "right";
      ctx.fillText(`Recorde: ${g.highScore}`, W - 15, 26);
      ctx.fillStyle = "#666";
      ctx.font = "10px Arial";
      ctx.fillText(`${(g.speed * 10).toFixed(0)} km/h`, W - 15, 44);

      // === MENU ===
      if (!g.started && !g.gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#C9A84C";
        ctx.font = "bold 30px Arial";
        ctx.textAlign = "center";
        ctx.fillText("PEGUE RUNNER", W / 2, H * 0.22);

        ctx.font = "18px Arial";
        ctx.fillText("🚚", W / 2, H * 0.16);

        ctx.fillStyle = "#FFF";
        ctx.font = "14px Arial";
        ctx.fillText("Desvie dos obstaculos e colete pacotes!", W / 2, H * 0.29);

        ctx.fillStyle = "#C9A84C";
        ctx.font = "11px Arial";
        const items = [
          "📦 Pacote = 10 pts",
          "💰 Moeda = 25 pts",
          "🏆 Logo Pegue = 50 pts",
          "🏍️ Desvie dos motoqueiros!",
          "📷 Pule o radar!",
          "🚦 Vermelho = Pule! Verde = +20",
          "🌄 Ladeiras, pontes e tuneis!",
        ];
        items.forEach((t, i) => {
          ctx.fillStyle = i < 3 ? "#C9A84C" : "#888";
          ctx.fillText(t, W / 2, H * 0.36 + i * 22);
        });

        ctx.fillStyle = "#C9A84C";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 100, H * 0.72 - 24, 200, 48, 14);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.font = "bold 18px Arial";
        ctx.fillText("TOQUE PRA JOGAR", W / 2, H * 0.72 + 6);

        ctx.fillStyle = "#555";
        ctx.font = "11px Arial";
        ctx.fillText("Toque = Pular  |  SP e Osasco!", W / 2, H * 0.82);
      }

      // === GAME OVER ===
      if (g.gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#FF4444";
        ctx.font = "bold 26px Arial";
        ctx.textAlign = "center";
        ctx.fillText("BATEU! 💥", W / 2, H * 0.22);

        ctx.fillStyle = "#FFF";
        ctx.font = "bold 44px Arial";
        ctx.fillText(`${g.score}`, W / 2, H * 0.34);
        ctx.font = "13px Arial";
        ctx.fillStyle = "#888";
        ctx.fillText("pontos", W / 2, H * 0.39);

        ctx.fillStyle = "#C9A84C";
        ctx.font = "13px Arial";
        ctx.fillText(`📏 ${Math.floor(g.distance)}m  •  ${(g.speed * 10).toFixed(0)} km/h`, W / 2, H * 0.46);

        if (g.score >= g.highScore && g.score > 0) {
          ctx.fillStyle = "#FFD700";
          ctx.font = "bold 18px Arial";
          ctx.fillText("🏆 NOVO RECORDE!", W / 2, H * 0.53);
        } else {
          ctx.fillStyle = "#888";
          ctx.font = "13px Arial";
          ctx.fillText(`Recorde: ${g.highScore}`, W / 2, H * 0.53);
        }

        ctx.fillStyle = "#C9A84C";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 100, H * 0.61 - 22, 200, 44, 12);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.font = "bold 16px Arial";
        ctx.fillText("JOGAR DE NOVO", W / 2, H * 0.61 + 6);

        ctx.strokeStyle = "#C9A84C";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(W / 2 - 100, H * 0.73 - 22, 200, 44, 12);
        ctx.stroke();
        ctx.fillStyle = "#C9A84C";
        ctx.font = "bold 14px Arial";
        ctx.fillText("VOLTAR PRO MAPA", W / 2, H * 0.73 + 6);
      }

      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", resize); };
  }, []);

  // Input handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handle(e: TouchEvent | MouseEvent) {
      e.preventDefault();
      const g = gameRef.current;
      const H = canvas!.height;
      if (g.gameOver) {
        const cy = "touches" in e ? (e as TouchEvent).changedTouches?.[0]?.clientY : (e as MouseEvent).clientY;
        if (cy && cy > H * 0.7) { onClose(); return; }
        startGame();
        return;
      }
      if (!g.started) { startGame(); return; }
      jump();
    }

    canvas.addEventListener("touchstart", handle, { passive: false });
    canvas.addEventListener("mousedown", handle);

    function keyHandle(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
      if (e.code === "Escape") onClose();
    }
    window.addEventListener("keydown", keyHandle);

    return () => {
      canvas.removeEventListener("touchstart", handle);
      canvas.removeEventListener("mousedown", handle);
      window.removeEventListener("keydown", keyHandle);
    };
  }, [jump, startGame, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <canvas ref={canvasRef} className="h-full w-full" />
      <button onClick={onClose} className="absolute right-3 top-3 z-50 rounded-full bg-black/50 p-2 text-white backdrop-blur">✕</button>

      {gameState === "menu" && (
        <button
          onClick={(e) => { e.stopPropagation(); fetchRanking(); setShowRanking(true); }}
          className="absolute bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-[#C9A84C]/50 bg-black/80 px-6 py-3 text-sm font-bold text-[#C9A84C] backdrop-blur"
        >
          🏆 Ver Ranking
        </button>
      )}

      {gameState === "gameover" && !showRanking && (
        <div className="absolute bottom-4 left-1/2 z-50 w-[90%] max-w-sm -translate-x-1/2" onClick={(e) => e.stopPropagation()}>
          <div className="rounded-xl border border-[#C9A84C]/30 bg-black/90 p-4 backdrop-blur">
            {!scoreSaved ? (
              <div className="space-y-3">
                <p className="text-center text-xs text-gray-400">Salve sua pontuacao no ranking!</p>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Seu nome ou apelido"
                  maxLength={20}
                  className="w-full rounded-lg border border-[#C9A84C]/30 bg-[#111] px-4 py-2.5 text-center text-sm text-white focus:border-[#C9A84C] focus:outline-none"
                  onKeyDown={(e) => { if (e.key === "Enter") saveScore(); }}
                />
                <button
                  onClick={saveScore}
                  disabled={!playerName.trim()}
                  className="w-full rounded-lg bg-[#C9A84C] py-2.5 text-sm font-bold text-black disabled:opacity-40"
                >
                  Salvar no Ranking
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-sm text-green-400">✅ Pontuacao salva!</p>
                <button
                  onClick={() => { fetchRanking(); setShowRanking(true); }}
                  className="w-full rounded-lg border border-[#C9A84C]/50 py-2.5 text-sm font-bold text-[#C9A84C]"
                >
                  🏆 Ver Ranking
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showRanking && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/95 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-2xl border border-[#C9A84C]/30 bg-[#0A0A0A] p-5">
            <h2 className="mb-4 text-center text-xl font-bold text-white">
              🏆 <span className="text-[#C9A84C]">Ranking</span> Pegue Runner
            </h2>
            <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
              {ranking.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-500">Nenhum score ainda. Seja o primeiro!</p>
              )}
              {ranking.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                    i === 0 ? "bg-[#C9A84C]/20 border border-[#C9A84C]/40" :
                    i === 1 ? "bg-gray-800/50 border border-gray-700" :
                    i === 2 ? "bg-orange-900/20 border border-orange-800/30" :
                    "bg-[#111]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-6 text-center text-sm font-bold ${
                      i === 0 ? "text-[#FFD700]" : i === 1 ? "text-[#C0C0C0]" : i === 2 ? "text-[#CD7F32]" : "text-gray-500"
                    }`}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">{r.nome}</p>
                      <p className="text-xs text-gray-500">{r.distancia}m</p>
                    </div>
                  </div>
                  <p className={`text-sm font-bold ${i === 0 ? "text-[#C9A84C]" : "text-white"}`}>{r.score}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowRanking(false)}
                className="flex-1 rounded-lg bg-[#C9A84C] py-2.5 text-sm font-bold text-black"
              >
                {gameState === "gameover" ? "Jogar de Novo" : "Fechar"}
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-700 py-2.5 text-sm font-bold text-gray-400"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
