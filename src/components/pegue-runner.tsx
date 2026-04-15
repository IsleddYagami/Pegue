"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface PegueRunnerProps {
  onClose: () => void;
}

const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const GROUND_HEIGHT = 0.75;
const TRUCK_SIZE = 44;
const INITIAL_SPEED = 4;
const SPEED_INCREMENT = 0.002;

interface Obstacle {
  x: number;
  width: number;
  height: number;
  type: "barreira" | "buraco" | "cone";
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
  type: "pontilhao" | "ponte_estaiada" | "ponte_metalica" | "copan" | "masp" | "fabrica" | "neo_quimica";
  width: number;
  height: number;
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
    groundOffset: 0,
    frameCount: 0,
    nextSpawn: 80,
    nextItemSpawn: 50,
    gameOver: false,
    started: false,
    distance: 0,
    combo: 0,
    comboTimer: 0,
    flashTimer: 0,
    nightMode: false,
    wheelAngle: 0,
  });

  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover">("menu");
  const [displayScore, setDisplayScore] = useState(0);
  const [displayHighScore, setDisplayHighScore] = useState(0);
  const [showRanking, setShowRanking] = useState(false);
  const [ranking, setRanking] = useState<{ nome: string; score: number; distancia: number }[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [scoreSaved, setScoreSaved] = useState(false);
  const animRef = useRef<number>(0);

  // Carrega sons e highscore
  useEffect(() => {
    const saved = localStorage.getItem("pegue_runner_highscore");
    if (saved) {
      gameRef.current.highScore = parseInt(saved);
      setDisplayHighScore(parseInt(saved));
    }
    // Precarrega sons
    const files = ["game-jump", "game-collect", "game-star", "game-over", "game-combo"];
    files.forEach((f) => {
      const a = new Audio(`/${f}.wav`);
      a.preload = "auto";
      a.volume = 0.6;
      soundsRef.current[f] = a;
    });
  }, []);

  // Carrega ranking
  async function fetchRanking() {
    try {
      const r = await fetch("/api/ranking");
      const data = await r.json();
      setRanking(data);
    } catch {}
  }

  // Salva score
  async function saveScore() {
    if (!playerName.trim() || scoreSaved) return;
    const g = gameRef.current;
    try {
      await fetch("/api/ranking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: playerName.trim(),
          score: g.score,
          distancia: Math.floor(g.distance),
        }),
      });
      setScoreSaved(true);
      localStorage.setItem("pegue_runner_name", playerName.trim());
      fetchRanking();
    } catch {}
  }

  // Carrega nome salvo e ranking inicial
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

  // === DESENHO DO CAMINHAO ===
  function drawTruck(ctx: CanvasRenderingContext2D, x: number, y: number, running: boolean) {
    const g = gameRef.current;
    const bounce = running && !g.isJumping ? Math.sin(g.frameCount * 0.3) * 1.5 : 0;
    const ty = y + bounce;
    g.wheelAngle += g.speed * 0.15;

    ctx.save();

    // Sombra
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(x + 24, ty + TRUCK_SIZE + 5, 26, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Chassi inferior
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(x - 4, ty + 30, 52, 8);

    // Carroceria bau (corpo principal)
    const grad = ctx.createLinearGradient(x + 12, ty, x + 12, ty + 28);
    grad.addColorStop(0, "#D4AF37");
    grad.addColorStop(0.5, "#C9A84C");
    grad.addColorStop(1, "#B8963F");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x + 10, ty + 2, 36, 28, 3);
    ctx.fill();

    // Borda da carroceria
    ctx.strokeStyle = "#8B7530";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x + 10, ty + 2, 36, 28, 3);
    ctx.stroke();

    // Texto PEGUE
    ctx.fillStyle = "#000";
    ctx.font = "bold 8px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PEGUE", x + 28, ty + 18);

    // Linha decorativa na carroceria
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + 13, ty + 24);
    ctx.lineTo(x + 43, ty + 24);
    ctx.stroke();

    // Cabine
    const cabGrad = ctx.createLinearGradient(x, ty + 6, x + 14, ty + 6);
    cabGrad.addColorStop(0, "#2a2a2a");
    cabGrad.addColorStop(1, "#3a3a3a");
    ctx.fillStyle = cabGrad;
    ctx.beginPath();
    ctx.roundRect(x - 2, ty + 6, 16, 24, [4, 0, 0, 2]);
    ctx.fill();

    // Janela
    const winGrad = ctx.createLinearGradient(x + 1, ty + 8, x + 1, ty + 18);
    winGrad.addColorStop(0, "#5BC0DE");
    winGrad.addColorStop(1, "#87CEEB");
    ctx.fillStyle = winGrad;
    ctx.beginPath();
    ctx.roundRect(x + 1, ty + 8, 10, 10, 2);
    ctx.fill();
    // Reflexo na janela
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(x + 2, ty + 9, 3, 5);

    // Para-choque dianteiro
    ctx.fillStyle = "#C9A84C";
    ctx.fillRect(x - 4, ty + 26, 6, 4);

    // Farol
    ctx.fillStyle = g.nightMode ? "#FFD700" : "#FFF";
    ctx.beginPath();
    ctx.arc(x - 3, ty + 22, 3, 0, Math.PI * 2);
    ctx.fill();
    if (g.nightMode) {
      ctx.fillStyle = "rgba(255,215,0,0.04)";
      ctx.beginPath();
      ctx.moveTo(x - 3, ty + 18);
      ctx.lineTo(x - 100, ty - 30);
      ctx.lineTo(x - 100, ty + 60);
      ctx.closePath();
      ctx.fill();
    }

    // Lanterna traseira
    ctx.fillStyle = "#FF3333";
    ctx.beginPath();
    ctx.arc(x + 46, ty + 22, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Rodas traseiras (duplas)
    for (const wx of [x + 36, x + 40]) {
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(wx, ty + 38, 7.5, 0, Math.PI * 2);
      ctx.fill();
      // Pneu
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wx, ty + 38, 6, 0, Math.PI * 2);
      ctx.stroke();
      // Calota
      ctx.fillStyle = "#555";
      ctx.beginPath();
      ctx.arc(wx, ty + 38, 3, 0, Math.PI * 2);
      ctx.fill();
      // Raios girando
      ctx.strokeStyle = "#777";
      ctx.lineWidth = 1;
      for (let r = 0; r < 3; r++) {
        const a = g.wheelAngle + (r * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(wx, ty + 38);
        ctx.lineTo(wx + Math.cos(a) * 5, ty + 38 + Math.sin(a) * 5);
        ctx.stroke();
      }
    }

    // Roda dianteira
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(x + 4, ty + 38, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 4, ty + 38, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(x + 4, ty + 38, 2.5, 0, Math.PI * 2);
    ctx.fill();
    for (let r = 0; r < 3; r++) {
      const a = g.wheelAngle + (r * Math.PI * 2) / 3;
      ctx.strokeStyle = "#777";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, ty + 38);
      ctx.lineTo(x + 4 + Math.cos(a) * 4, ty + 38 + Math.sin(a) * 4);
      ctx.stroke();
    }

    // Fumaca do escapamento
    if (running) {
      ctx.fillStyle = "rgba(150,150,150,0.3)";
      for (let i = 0; i < 3; i++) {
        const sx = x + 48 + i * 8 + Math.sin(g.frameCount * 0.1 + i) * 3;
        const sy = ty + 26 - i * 4 + Math.cos(g.frameCount * 0.15 + i) * 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 3 + i * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // === PONTOS TURISTICOS ===
  function drawLandmark(ctx: CanvasRenderingContext2D, lm: Landmark, groundY: number) {
    const baseY = groundY;

    if (lm.type === "pontilhao") {
      // Pontilhao de Osasco - viaduto grande
      ctx.fillStyle = "#4a4a4a";
      // Pilares
      ctx.fillRect(lm.x + 10, baseY - 100, 12, 100);
      ctx.fillRect(lm.x + lm.width - 22, baseY - 100, 12, 100);
      ctx.fillRect(lm.x + lm.width / 2 - 6, baseY - 100, 12, 100);
      // Tabuleiro
      ctx.fillStyle = "#5a5a5a";
      ctx.fillRect(lm.x, baseY - 110, lm.width, 15);
      // Grade lateral
      ctx.strokeStyle = "#666";
      ctx.lineWidth = 1;
      for (let i = 0; i < lm.width; i += 8) {
        ctx.beginPath();
        ctx.moveTo(lm.x + i, baseY - 110);
        ctx.lineTo(lm.x + i, baseY - 120);
        ctx.stroke();
      }
      ctx.fillRect(lm.x, baseY - 122, lm.width, 3);
      // Placa
      ctx.fillStyle = "#2E5A2E";
      ctx.fillRect(lm.x + lm.width / 2 - 30, baseY - 140, 60, 18);
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 7px Arial";
      ctx.textAlign = "center";
      ctx.fillText("PONTILHAO", lm.x + lm.width / 2, baseY - 128);
      ctx.fillText("OSASCO", lm.x + lm.width / 2, baseY - 120);
    }

    else if (lm.type === "ponte_estaiada") {
      // Ponte Estaiada de SP
      ctx.fillStyle = "#DDD";
      // Mastro principal
      const mx = lm.x + lm.width / 2;
      ctx.fillRect(mx - 4, baseY - 160, 8, 160);
      // Cabos (estais)
      ctx.strokeStyle = "#BBB";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const angle = (i / 7) * 0.8 + 0.1;
        ctx.beginPath();
        ctx.moveTo(mx, baseY - 155 + i * 8);
        ctx.lineTo(mx - 80 * angle, baseY - 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mx, baseY - 155 + i * 8);
        ctx.lineTo(mx + 80 * angle, baseY - 10);
        ctx.stroke();
      }
      // Tabuleiro
      ctx.fillStyle = "#999";
      ctx.fillRect(lm.x, baseY - 15, lm.width, 8);
      // Arco superior
      ctx.strokeStyle = "#DDD";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(mx, baseY - 140, 25, Math.PI, 0);
      ctx.stroke();
    }

    else if (lm.type === "ponte_metalica") {
      // Ponte Metalica historica
      ctx.fillStyle = "#8B4513";
      // Estrutura treliça
      const h = 80;
      ctx.strokeStyle = "#A0522D";
      ctx.lineWidth = 3;
      // Vigas horizontais
      ctx.beginPath();
      ctx.moveTo(lm.x, baseY - h);
      ctx.lineTo(lm.x + lm.width, baseY - h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(lm.x, baseY - h + 30);
      ctx.lineTo(lm.x + lm.width, baseY - h + 30);
      ctx.stroke();
      // Diagonais
      for (let i = 0; i < lm.width; i += 20) {
        ctx.beginPath();
        ctx.moveTo(lm.x + i, baseY - h);
        ctx.lineTo(lm.x + i + 20, baseY - h + 30);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(lm.x + i + 20, baseY - h);
        ctx.lineTo(lm.x + i, baseY - h + 30);
        ctx.stroke();
      }
      // Pilares
      ctx.fillStyle = "#6B3410";
      ctx.fillRect(lm.x + 5, baseY - h + 30, 10, h - 30);
      ctx.fillRect(lm.x + lm.width - 15, baseY - h + 30, 10, h - 30);
      // Placa
      ctx.fillStyle = "#333";
      ctx.fillRect(lm.x + lm.width / 2 - 25, baseY - h - 15, 50, 12);
      ctx.fillStyle = "#C9A84C";
      ctx.font = "bold 6px Arial";
      ctx.textAlign = "center";
      ctx.fillText("PONTE METALICA", lm.x + lm.width / 2, baseY - h - 6);
    }

    else if (lm.type === "copan") {
      // Edificio Copan
      ctx.fillStyle = "#CCC";
      // Corpo curvo
      ctx.beginPath();
      ctx.moveTo(lm.x, baseY);
      ctx.lineTo(lm.x, baseY - 140);
      ctx.quadraticCurveTo(lm.x + lm.width / 2, baseY - 150, lm.x + lm.width, baseY - 130);
      ctx.lineTo(lm.x + lm.width, baseY);
      ctx.closePath();
      ctx.fill();
      // Brises horizontais
      ctx.strokeStyle = "#AAA";
      ctx.lineWidth = 1;
      for (let y = baseY - 135; y < baseY; y += 6) {
        ctx.beginPath();
        ctx.moveTo(lm.x + 2, y);
        ctx.lineTo(lm.x + lm.width - 2, y);
        ctx.stroke();
      }
    }

    else if (lm.type === "masp") {
      // MASP
      ctx.fillStyle = "#CC0000";
      // Vao livre
      const pillarH = 50;
      ctx.fillRect(lm.x + 5, baseY - pillarH, 8, pillarH);
      ctx.fillRect(lm.x + lm.width - 13, baseY - pillarH, 8, pillarH);
      // Caixa suspensa
      ctx.fillStyle = "#333";
      ctx.fillRect(lm.x, baseY - pillarH - 35, lm.width, 35);
      // Janelas
      ctx.fillStyle = "#87CEEB55";
      ctx.fillRect(lm.x + 3, baseY - pillarH - 32, lm.width - 6, 29);
      // MASP text
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 10px Arial";
      ctx.textAlign = "center";
      ctx.fillText("MASP", lm.x + lm.width / 2, baseY - pillarH - 14);
    }

    else if (lm.type === "fabrica") {
      // Fabrica Otimizi
      ctx.fillStyle = "#444";
      ctx.fillRect(lm.x, baseY - 70, lm.width, 70);
      // Telhado
      ctx.fillStyle = "#555";
      ctx.beginPath();
      ctx.moveTo(lm.x - 5, baseY - 70);
      ctx.lineTo(lm.x + lm.width / 2, baseY - 90);
      ctx.lineTo(lm.x + lm.width + 5, baseY - 70);
      ctx.closePath();
      ctx.fill();
      // Chamine
      ctx.fillStyle = "#666";
      ctx.fillRect(lm.x + lm.width - 20, baseY - 110, 10, 40);
      // Janelas
      ctx.fillStyle = "#C9A84C55";
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          ctx.fillRect(lm.x + 8 + c * 22, baseY - 60 + r * 25, 14, 18);
        }
      }
      // Placa
      ctx.fillStyle = "#C9A84C";
      ctx.fillRect(lm.x + 10, baseY - 75, lm.width - 20, 12);
      ctx.fillStyle = "#000";
      ctx.font = "bold 7px Arial";
      ctx.textAlign = "center";
      ctx.fillText("OTIMIZI", lm.x + lm.width / 2, baseY - 66);
    }

    else if (lm.type === "neo_quimica") {
      // Neo Quimica Arena - Corinthians
      const cx = lm.x + lm.width / 2;

      // Estrutura principal - formato de arena oval
      ctx.fillStyle = "#E8E8E8";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 50, lm.width / 2, 70, 0, Math.PI, 0);
      ctx.lineTo(lm.x + lm.width, baseY);
      ctx.lineTo(lm.x, baseY);
      ctx.closePath();
      ctx.fill();

      // Fachada - paineis brancos
      ctx.fillStyle = "#F5F5F5";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 50, lm.width / 2 - 5, 65, 0, Math.PI, 0);
      ctx.lineTo(lm.x + lm.width - 5, baseY - 5);
      ctx.lineTo(lm.x + 5, baseY - 5);
      ctx.closePath();
      ctx.fill();

      // Linhas verticais da fachada
      ctx.strokeStyle = "#CCC";
      ctx.lineWidth = 1;
      for (let i = 0; i < lm.width; i += 15) {
        const fx = lm.x + i;
        const fy = baseY - 50 - Math.sqrt(Math.max(0, 1 - Math.pow((fx - cx) / (lm.width / 2), 2))) * 65;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx, baseY - 5);
        ctx.stroke();
      }

      // Teto - borda superior escura
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 50, lm.width / 2, 70, 0, Math.PI, 0);
      ctx.stroke();

      // Abertura superior (teto aberto do estadio)
      ctx.fillStyle = "#4a7a4a";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 55, lm.width / 4, 25, 0, Math.PI, 0);
      ctx.fill();

      // Painel lateral LED (faixa preta)
      ctx.fillStyle = "#111";
      ctx.fillRect(lm.x + 15, baseY - 35, lm.width - 30, 16);

      // Texto NEO QUIMICA ARENA
      ctx.fillStyle = "#00AAFF";
      ctx.font = "bold 7px Arial";
      ctx.textAlign = "center";
      ctx.fillText("NEO QUIMICA ARENA", cx, baseY - 24);

      // Escudo Corinthians simplificado (circulo preto/branco)
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(cx, baseY - 80, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFF";
      ctx.beginPath();
      ctx.arc(cx, baseY - 80, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.font = "bold 8px Arial";
      ctx.fillText("C", cx, baseY - 77);

      // Torres de iluminacao
      for (const tx of [lm.x + 10, lm.x + lm.width - 10]) {
        ctx.fillStyle = "#888";
        ctx.fillRect(tx - 2, baseY - 130, 4, 80);
        // Refletores
        ctx.fillStyle = gameRef.current.nightMode ? "#FFD700" : "#DDD";
        ctx.fillRect(tx - 6, baseY - 135, 12, 6);
      }
    }
  }

  // === DRAW ITEM ===
  function drawItem(ctx: CanvasRenderingContext2D, item: Item) {
    if (item.collected) return;
    const g = gameRef.current;
    const bob = Math.sin(g.frameCount * 0.06 + item.x * 0.01) * 4;
    const y = item.y + bob;
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
      // Logo Pegue dourado - hexagono com P
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
      // P centralizado
      ctx.fillStyle = "#000";
      ctx.font = `bold ${16 * s}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", item.x, y);
      ctx.textBaseline = "alphabetic";
      // Brilho
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.beginPath();
      ctx.arc(item.x - 4 * s, y - 5 * s, 4 * s, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Moeda
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

  // === DRAW OBSTACLE ===
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
    } else if (obs.type === "cone") {
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
    } else {
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width / 2, groundY, obs.width / 2, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width / 2, groundY + 1, obs.width / 2 - 4, 4, 0, 0, Math.PI * 2);
      ctx.fill();
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
      groundOffset: 0, frameCount: 0, nextSpawn: 80, nextItemSpawn: 50,
      gameOver: false, started: true, running: true, distance: 0,
      combo: 0, comboTimer: 0, flashTimer: 0, nightMode: false,
    });
    // Nuvens
    g.clouds = Array.from({ length: 5 }, () => ({
      x: Math.random() * 800, y: 20 + Math.random() * 80,
      w: 40 + Math.random() * 60, speed: 0.3 + Math.random() * 0.5,
    }));
    // Landmarks
    g.landmarks = [
      { x: 600, type: "pontilhao", width: 160, height: 120 },
      { x: 1400, type: "fabrica", width: 80, height: 90 },
      { x: 2200, type: "ponte_metalica", width: 120, height: 80 },
      { x: 3200, type: "copan", width: 50, height: 150 },
      { x: 4000, type: "masp", width: 70, height: 85 },
      { x: 5000, type: "ponte_estaiada", width: 180, height: 160 },
      { x: 6000, type: "neo_quimica", width: 200, height: 140 },
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
      const groundY = H * GROUND_HEIGHT;

      if (g.distance > 500) g.nightMode = true;

      // === FUNDO ===
      if (g.nightMode) {
        const grad = ctx.createLinearGradient(0, 0, 0, groundY);
        grad.addColorStop(0, "#0a0a2e");
        grad.addColorStop(1, "#1a1a3e");
        ctx.fillStyle = grad;
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, groundY);
        grad.addColorStop(0, "#87CEEB");
        grad.addColorStop(0.7, "#B0E0E6");
        grad.addColorStop(1, "#E8D5B7");
        ctx.fillStyle = grad;
      }
      ctx.fillRect(0, 0, W, groundY);

      // Estrelas noturnas
      if (g.nightMode) {
        ctx.fillStyle = "#FFF";
        for (let i = 0; i < 40; i++) {
          const sx = (i * 137 + g.frameCount * 0.02) % W;
          const sy = (i * 97) % (groundY * 0.5);
          const tw = Math.sin(g.frameCount * 0.05 + i) > 0.5 ? 1.5 : 0.8;
          ctx.beginPath();
          ctx.arc(sx, sy, tw, 0, Math.PI * 2);
          ctx.fill();
        }
      }

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
        // Recicla quando sai da tela
        const totalWidth = 7000;
        const adjustedX = ((lx % totalWidth) + totalWidth) % totalWidth - 200;
        const drawLm = { ...lm, x: adjustedX };
        if (adjustedX > -200 && adjustedX < W + 200) {
          drawLandmark(ctx, drawLm, groundY);
        }
      });

      // === ESTRADA ===
      ctx.fillStyle = "#333";
      ctx.fillRect(0, groundY - 5, W, H - groundY + 10);
      ctx.fillStyle = "#555";
      ctx.fillRect(0, groundY - 5, W, 4);
      // Faixa tracejada
      ctx.fillStyle = "#FFF";
      const dashW = 40, dashG = 25;
      const off = g.groundOffset % (dashW + dashG);
      for (let x = -off; x < W + dashW; x += dashW + dashG) {
        ctx.fillRect(x, groundY + (H - groundY) * 0.4, dashW, 3);
      }
      ctx.fillStyle = "#C9A84C";
      ctx.fillRect(0, groundY + (H - groundY) * 0.85, W, 3);
      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(0, groundY + (H - groundY) * 0.9, W, H);

      // === UPDATE ===
      if (g.running && !g.gameOver) {
        g.frameCount++;
        g.speed += SPEED_INCREMENT;
        g.groundOffset += g.speed;
        g.distance += g.speed * 0.1;
        g.comboTimer = Math.max(0, g.comboTimer - 1);
        if (g.comboTimer === 0) g.combo = 0;
        g.flashTimer = Math.max(0, g.flashTimer - 1);

        g.truckVY += GRAVITY;
        g.truckY += g.truckVY;
        if (g.truckY >= 0) { g.truckY = 0; g.truckVY = 0; g.isJumping = false; }

        // Spawn obstaculos
        g.nextSpawn--;
        if (g.nextSpawn <= 0) {
          const types: Obstacle["type"][] = ["barreira", "cone", "buraco"];
          g.obstacles.push({
            x: W + 20,
            width: Math.random() > 0.5 ? 50 : 25,
            height: 25 + Math.random() * 25,
            type: types[Math.floor(Math.random() * types.length)],
          });
          g.nextSpawn = 60 + Math.random() * 60;
          if (g.speed > 6) g.nextSpawn *= 0.8;
        }

        // Spawn itens
        g.nextItemSpawn--;
        if (g.nextItemSpawn <= 0) {
          const types: Item["type"][] = ["pacote", "pacote", "pacote", "moeda", "moeda", "pegue_logo"];
          g.items.push({
            x: W + 20,
            y: groundY - 50 - Math.random() * 60,
            type: types[Math.floor(Math.random() * types.length)],
            collected: false, scale: 1,
          });
          g.nextItemSpawn = 40 + Math.random() * 60;
        }

        g.obstacles = g.obstacles.filter((o) => { o.x -= g.speed; return o.x + o.width > -50; });
        g.items = g.items.filter((i) => { i.x -= g.speed; return i.x > -50 && !i.collected; });
        g.particles = g.particles.filter((p) => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
          return p.life > 0;
        });

        // Colisoes
        const tX = 60, tTop = groundY - TRUCK_SIZE + g.truckY, tBot = groundY + g.truckY;
        const tL = tX, tR = tX + 44;

        for (const obs of g.obstacles) {
          let hit = false;
          if (obs.type === "buraco") {
            if (!g.isJumping && tR > obs.x + 5 && tL < obs.x + obs.width - 5) hit = true;
          } else {
            if (tR > obs.x + 3 && tL < obs.x + obs.width - 3 && tBot > groundY - obs.height + 5 && tTop < groundY) hit = true;
          }
          if (hit) {
            g.gameOver = true;
            g.running = false;
            playSound("game-over");
            spawnParticles(tX + 20, groundY - 20 + g.truckY, "#C9A84C", 20);
            spawnParticles(tX + 20, groundY - 20 + g.truckY, "#FF6600", 15);
            if (g.score > g.highScore) {
              g.highScore = g.score;
              localStorage.setItem("pegue_runner_highscore", g.score.toString());
              setDisplayHighScore(g.score);
            }
            setGameState("gameover");
          }
        }

        for (const item of g.items) {
          if (item.collected) continue;
          const dx = (tX + 22) - item.x, dy = (tTop + TRUCK_SIZE / 2) - item.y;
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
            spawnParticles(item.x, item.y, item.type === "pegue_logo" ? "#C9A84C" : "#FFD700", 12);
          }
        }

        if (g.frameCount % 10 === 0) { g.score++; setDisplayScore(g.score); }
      }

      // === DRAW ===
      g.obstacles.forEach((o) => drawObstacle(ctx, o, groundY));
      g.items.forEach((i) => drawItem(ctx, i));
      drawTruck(ctx, 60, groundY - TRUCK_SIZE + g.truckY, g.running && !g.gameOver);

      // Particulas
      g.particles.forEach((p) => {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

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
        ctx.fillText("PEGUE RUNNER", W / 2, H * 0.28);

        ctx.font = "18px Arial";
        ctx.fillText("🚚", W / 2, H * 0.22);

        ctx.fillStyle = "#FFF";
        ctx.font = "14px Arial";
        ctx.fillText("Desvie dos obstaculos e colete pacotes!", W / 2, H * 0.36);

        ctx.fillStyle = "#C9A84C";
        ctx.font = "12px Arial";
        ctx.fillText("📦 Pacote = 10 pts", W / 2, H * 0.44);
        ctx.fillText("💰 Moeda = 25 pts", W / 2, H * 0.49);
        ctx.fillText("🏆 Logo Pegue = 50 pts", W / 2, H * 0.54);

        ctx.fillStyle = "#C9A84C";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 100, H * 0.63 - 24, 200, 48, 14);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.font = "bold 18px Arial";
        ctx.fillText("TOQUE PRA JOGAR", W / 2, H * 0.63 + 6);

        ctx.fillStyle = "#555";
        ctx.font = "11px Arial";
        ctx.fillText("Toque na tela = Pular", W / 2, H * 0.75);
        ctx.fillText("Pontos turisticos de SP e Osasco!", W / 2, H * 0.80);
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

      {/* Botao ranking no menu */}
      {gameState === "menu" && (
        <button
          onClick={(e) => { e.stopPropagation(); fetchRanking(); setShowRanking(true); }}
          className="absolute bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-[#C9A84C]/50 bg-black/80 px-6 py-3 text-sm font-bold text-[#C9A84C] backdrop-blur"
        >
          🏆 Ver Ranking
        </button>
      )}

      {/* Overlay de Game Over com input de nome */}
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

      {/* Modal de Ranking */}
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
                      i === 0 ? "text-[#FFD700]" :
                      i === 1 ? "text-[#C0C0C0]" :
                      i === 2 ? "text-[#CD7F32]" :
                      "text-gray-500"
                    }`}>
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">{r.nome}</p>
                      <p className="text-xs text-gray-500">{r.distancia}m</p>
                    </div>
                  </div>
                  <p className={`text-sm font-bold ${i === 0 ? "text-[#C9A84C]" : "text-white"}`}>
                    {r.score}
                  </p>
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
