"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface PegueRunnerProps {
  onClose: () => void;
}

// Constantes do jogo
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const GROUND_HEIGHT = 0.75; // 75% da tela
const TRUCK_SIZE = 40;
const INITIAL_SPEED = 4;
const SPEED_INCREMENT = 0.002;
const SPAWN_INTERVAL_MIN = 60;
const SPAWN_INTERVAL_MAX = 120;

interface Obstacle {
  x: number;
  width: number;
  height: number;
  type: "barreira" | "buraco" | "cone";
}

interface Item {
  x: number;
  y: number;
  type: "pacote" | "estrela" | "moeda";
  collected: boolean;
  scale: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Cloud {
  x: number;
  y: number;
  width: number;
  speed: number;
}

export default function PegueRunner({ onClose }: PegueRunnerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<{
    running: boolean;
    score: number;
    highScore: number;
    speed: number;
    truckY: number;
    truckVY: number;
    isJumping: boolean;
    obstacles: Obstacle[];
    items: Item[];
    particles: Particle[];
    clouds: Cloud[];
    buildings: { x: number; width: number; height: number; color: string }[];
    groundOffset: number;
    frameCount: number;
    nextSpawn: number;
    nextItemSpawn: number;
    gameOver: boolean;
    started: boolean;
    distance: number;
    combo: number;
    comboTimer: number;
    flashTimer: number;
    truckFrame: number;
    nightMode: boolean;
  }>({
    running: false,
    score: 0,
    highScore: 0,
    speed: INITIAL_SPEED,
    truckY: 0,
    truckVY: 0,
    isJumping: false,
    obstacles: [],
    items: [],
    particles: [],
    clouds: [],
    buildings: [],
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
    truckFrame: 0,
    nightMode: false,
  });

  const [gameState, setGameState] = useState<"menu" | "playing" | "gameover">("menu");
  const [displayScore, setDisplayScore] = useState(0);
  const [displayHighScore, setDisplayHighScore] = useState(0);
  const animFrameRef = useRef<number>(0);

  // Carrega high score
  useEffect(() => {
    const saved = localStorage.getItem("pegue_runner_highscore");
    if (saved) {
      gameRef.current.highScore = parseInt(saved);
      setDisplayHighScore(parseInt(saved));
    }
  }, []);

  // Desenha o caminhao Pegue
  function drawTruck(ctx: CanvasRenderingContext2D, x: number, y: number, bouncing: boolean) {
    const g = gameRef.current;
    const bounce = bouncing ? Math.sin(g.frameCount * 0.3) * 2 : 0;
    const ty = y + bounce;

    // Sombra
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(x + 20, ty + TRUCK_SIZE + 4, 22, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Carroceria (bau)
    ctx.fillStyle = "#C9A84C";
    ctx.fillRect(x + 8, ty, 32, 24);
    ctx.strokeStyle = "#8B7530";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 8, ty, 32, 24);

    // Texto PEGUE na carroceria
    ctx.fillStyle = "#000";
    ctx.font = "bold 7px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PEGUE", x + 24, ty + 14);

    // Cabine
    ctx.fillStyle = "#222";
    ctx.fillRect(x, ty + 6, 12, 18);

    // Janela da cabine
    ctx.fillStyle = "#87CEEB";
    ctx.fillRect(x + 2, ty + 8, 8, 8);

    // Chassi
    ctx.fillStyle = "#333";
    ctx.fillRect(x - 2, ty + 24, 44, 6);

    // Rodas traseiras
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(x + 32, ty + 32, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#444";
    ctx.beginPath();
    ctx.arc(x + 32, ty + 32, 4, 0, Math.PI * 2);
    ctx.fill();
    // Rotacao da roda
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;
    const angle = g.frameCount * 0.2;
    ctx.beginPath();
    ctx.moveTo(x + 32 + Math.cos(angle) * 3, ty + 32 + Math.sin(angle) * 3);
    ctx.lineTo(x + 32 - Math.cos(angle) * 3, ty + 32 - Math.sin(angle) * 3);
    ctx.stroke();

    // Rodas dianteiras
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(x + 6, ty + 32, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#444";
    ctx.beginPath();
    ctx.arc(x + 6, ty + 32, 3, 0, Math.PI * 2);
    ctx.fill();

    // Farol
    if (g.nightMode) {
      ctx.fillStyle = "#FFD700";
      ctx.beginPath();
      ctx.arc(x - 1, ty + 18, 3, 0, Math.PI * 2);
      ctx.fill();
      // Feixe de luz
      ctx.fillStyle = "rgba(255,215,0,0.05)";
      ctx.beginPath();
      ctx.moveTo(x - 1, ty + 15);
      ctx.lineTo(x - 80, ty - 20);
      ctx.lineTo(x - 80, ty + 50);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "#FFF";
      ctx.beginPath();
      ctx.arc(x - 1, ty + 18, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Desenha obstaculo
  function drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle, groundY: number) {
    if (obs.type === "barreira") {
      // Barreira laranja/branca
      const stripes = 4;
      const stripeH = obs.height / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#FF6B00" : "#FFF";
        ctx.fillRect(obs.x, groundY - obs.height + i * stripeH, obs.width, stripeH);
      }
      // Postes
      ctx.fillStyle = "#666";
      ctx.fillRect(obs.x - 2, groundY - obs.height - 5, 4, obs.height + 5);
      ctx.fillRect(obs.x + obs.width - 2, groundY - obs.height - 5, 4, obs.height + 5);
    } else if (obs.type === "cone") {
      // Cone de transito
      ctx.fillStyle = "#FF6600";
      ctx.beginPath();
      ctx.moveTo(obs.x + obs.width / 2, groundY - obs.height);
      ctx.lineTo(obs.x + obs.width, groundY);
      ctx.lineTo(obs.x, groundY);
      ctx.closePath();
      ctx.fill();
      // Faixas brancas
      ctx.fillStyle = "#FFF";
      ctx.fillRect(obs.x + 4, groundY - obs.height * 0.6, obs.width - 8, 3);
      ctx.fillRect(obs.x + 2, groundY - obs.height * 0.3, obs.width - 4, 3);
    } else {
      // Buraco
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(obs.x, groundY - 4, obs.width, 8);
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width / 2, groundY, obs.width / 2, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width / 2, groundY + 1, obs.width / 2 - 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Desenha item coletavel
  function drawItem(ctx: CanvasRenderingContext2D, item: Item) {
    if (item.collected) return;
    const bob = Math.sin(gameRef.current.frameCount * 0.05 + item.x * 0.01) * 4;
    const y = item.y + bob;
    const s = item.scale;

    if (item.type === "pacote") {
      // Caixa marrom
      ctx.fillStyle = "#8B4513";
      ctx.fillRect(item.x - 10 * s, y - 10 * s, 20 * s, 20 * s);
      ctx.fillStyle = "#A0522D";
      ctx.fillRect(item.x - 8 * s, y - 8 * s, 16 * s, 16 * s);
      // Fita
      ctx.fillStyle = "#DAA520";
      ctx.fillRect(item.x - 1, y - 10 * s, 2, 20 * s);
      ctx.fillRect(item.x - 10 * s, y - 1, 20 * s, 2);
      // Brilho
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(item.x - 8 * s, y - 8 * s, 6 * s, 6 * s);
    } else if (item.type === "estrela") {
      // Estrela dourada
      ctx.fillStyle = "#FFD700";
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const r = i === 0 ? 12 * s : 12 * s;
        const method = i === 0 ? "moveTo" : "lineTo";
        ctx[method](item.x + Math.cos(angle) * r, y + Math.sin(angle) * r);
        const innerAngle = angle + (2 * Math.PI) / 10;
        ctx.lineTo(item.x + Math.cos(innerAngle) * 5 * s, y + Math.sin(innerAngle) * 5 * s);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#B8860B";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Brilho
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(item.x - 3, y - 3, 3 * s, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Moeda
      ctx.fillStyle = "#C9A84C";
      ctx.beginPath();
      ctx.arc(item.x, y, 8 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.font = `bold ${10 * s}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", item.x, y);
    }
  }

  // Cria particulas
  function spawnParticles(x: number, y: number, color: string, count: number) {
    const g = gameRef.current;
    for (let i = 0; i < count; i++) {
      g.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 1) * 5,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  }

  // Inicializa o jogo
  const startGame = useCallback(() => {
    const g = gameRef.current;
    g.score = 0;
    g.speed = INITIAL_SPEED;
    g.truckY = 0;
    g.truckVY = 0;
    g.isJumping = false;
    g.obstacles = [];
    g.items = [];
    g.particles = [];
    g.groundOffset = 0;
    g.frameCount = 0;
    g.nextSpawn = 80;
    g.nextItemSpawn = 50;
    g.gameOver = false;
    g.started = true;
    g.running = true;
    g.distance = 0;
    g.combo = 0;
    g.comboTimer = 0;
    g.flashTimer = 0;
    g.nightMode = false;

    // Gera nuvens
    g.clouds = [];
    for (let i = 0; i < 5; i++) {
      g.clouds.push({
        x: Math.random() * 800,
        y: 20 + Math.random() * 80,
        width: 40 + Math.random() * 60,
        speed: 0.3 + Math.random() * 0.5,
      });
    }

    // Gera predios do fundo
    g.buildings = [];
    for (let i = 0; i < 15; i++) {
      g.buildings.push({
        x: i * 60 + Math.random() * 20,
        width: 30 + Math.random() * 25,
        height: 40 + Math.random() * 80,
        color: `hsl(${30 + Math.random() * 20}, 10%, ${15 + Math.random() * 15}%)`,
      });
    }

    setGameState("playing");
    setDisplayScore(0);
  }, []);

  // Pulo
  const jump = useCallback(() => {
    const g = gameRef.current;
    if (g.gameOver) {
      startGame();
      return;
    }
    if (!g.started) {
      startGame();
      return;
    }
    if (!g.isJumping) {
      g.truckVY = JUMP_FORCE;
      g.isJumping = true;
    }
  }, [startGame]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resizeCanvas() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    function gameLoop() {
      if (!canvas || !ctx) return;
      const g = gameRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const groundY = H * GROUND_HEIGHT;

      // Modo noturno apos 500m
      if (g.distance > 500 && !g.nightMode) g.nightMode = true;
      if (g.distance > 1000 && g.nightMode && g.distance % 500 < 5) g.nightMode = !g.nightMode;

      // === FUNDO ===
      // Ceu
      if (g.nightMode) {
        const grad = ctx.createLinearGradient(0, 0, 0, groundY);
        grad.addColorStop(0, "#0a0a2e");
        grad.addColorStop(1, "#1a1a3e");
        ctx.fillStyle = grad;
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, groundY);
        grad.addColorStop(0, "#87CEEB");
        grad.addColorStop(1, "#B0E0E6");
        ctx.fillStyle = grad;
      }
      ctx.fillRect(0, 0, W, groundY);

      // Estrelas (noite)
      if (g.nightMode) {
        ctx.fillStyle = "#FFF";
        for (let i = 0; i < 30; i++) {
          const sx = (i * 137 + g.frameCount * 0.02) % W;
          const sy = (i * 97) % (groundY * 0.6);
          const twinkle = Math.sin(g.frameCount * 0.05 + i) > 0.5 ? 2 : 1;
          ctx.beginPath();
          ctx.arc(sx, sy, twinkle, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Nuvens
      ctx.fillStyle = g.nightMode ? "rgba(50,50,70,0.5)" : "rgba(255,255,255,0.8)";
      g.clouds.forEach((cloud) => {
        ctx.beginPath();
        ctx.arc(cloud.x, cloud.y, cloud.width / 3, 0, Math.PI * 2);
        ctx.arc(cloud.x + cloud.width / 4, cloud.y - 8, cloud.width / 4, 0, Math.PI * 2);
        ctx.arc(cloud.x + cloud.width / 2, cloud.y, cloud.width / 3.5, 0, Math.PI * 2);
        ctx.fill();
        if (g.running) cloud.x -= cloud.speed;
        if (cloud.x + cloud.width < 0) cloud.x = W + 50;
      });

      // Predios no fundo
      g.buildings.forEach((b) => {
        const bx = ((b.x - g.groundOffset * 0.3) % (W + 100) + W + 100) % (W + 100) - 50;
        ctx.fillStyle = g.nightMode ? b.color : `hsl(30, 10%, ${25 + Math.random() * 0}%)`;
        ctx.fillRect(bx, groundY - b.height, b.width, b.height);
        // Janelas
        const janelaCor = g.nightMode ? "rgba(255,200,50,0.6)" : "rgba(200,220,255,0.5)";
        ctx.fillStyle = janelaCor;
        for (let jy = 0; jy < b.height - 15; jy += 12) {
          for (let jx = 0; jx < b.width - 10; jx += 10) {
            if (Math.random() > 0.3 || !g.nightMode) {
              ctx.fillRect(bx + 5 + jx, groundY - b.height + 5 + jy, 5, 7);
            }
          }
        }
      });

      // === ESTRADA ===
      // Asfalto
      ctx.fillStyle = "#333";
      ctx.fillRect(0, groundY - 5, W, H - groundY + 10);

      // Meio-fio
      ctx.fillStyle = "#555";
      ctx.fillRect(0, groundY - 5, W, 4);

      // Faixa tracejada
      ctx.fillStyle = "#FFF";
      const dashWidth = 40;
      const dashGap = 25;
      const offset = g.groundOffset % (dashWidth + dashGap);
      for (let x = -offset; x < W + dashWidth; x += dashWidth + dashGap) {
        ctx.fillRect(x, groundY + (H - groundY) * 0.4, dashWidth, 3);
      }

      // Faixa lateral
      ctx.fillStyle = "#C9A84C";
      ctx.fillRect(0, groundY + (H - groundY) * 0.85, W, 3);

      // Calcadinha na parte de baixo
      ctx.fillStyle = "#2a2a2a";
      ctx.fillRect(0, groundY + (H - groundY) * 0.9, W, H);

      if (g.running && !g.gameOver) {
        // === UPDATE ===
        g.frameCount++;
        g.speed += SPEED_INCREMENT;
        g.groundOffset += g.speed;
        g.distance += g.speed * 0.1;
        g.comboTimer = Math.max(0, g.comboTimer - 1);
        if (g.comboTimer === 0) g.combo = 0;
        g.flashTimer = Math.max(0, g.flashTimer - 1);

        // Gravidade
        g.truckVY += GRAVITY;
        g.truckY += g.truckVY;
        if (g.truckY >= 0) {
          g.truckY = 0;
          g.truckVY = 0;
          g.isJumping = false;
        }

        // Spawn obstaculos
        g.nextSpawn--;
        if (g.nextSpawn <= 0) {
          const types: Obstacle["type"][] = ["barreira", "cone", "buraco"];
          const type = types[Math.floor(Math.random() * types.length)];
          const obs: Obstacle = {
            x: W + 20,
            width: type === "buraco" ? 50 + Math.random() * 30 : type === "barreira" ? 30 : 20,
            height: type === "buraco" ? 8 : type === "barreira" ? 35 + Math.random() * 20 : 25,
            type,
          };
          g.obstacles.push(obs);
          g.nextSpawn = SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
          // Diminui intervalo com o tempo
          if (g.speed > 6) g.nextSpawn *= 0.8;
          if (g.speed > 8) g.nextSpawn *= 0.7;
        }

        // Spawn itens
        g.nextItemSpawn--;
        if (g.nextItemSpawn <= 0) {
          const types: Item["type"][] = ["pacote", "pacote", "pacote", "moeda", "moeda", "estrela"];
          const type = types[Math.floor(Math.random() * types.length)];
          g.items.push({
            x: W + 20,
            y: groundY - 50 - Math.random() * 60,
            type,
            collected: false,
            scale: 1,
          });
          g.nextItemSpawn = 40 + Math.random() * 60;
        }

        // Move obstaculos
        g.obstacles = g.obstacles.filter((obs) => {
          obs.x -= g.speed;
          return obs.x + obs.width > -50;
        });

        // Move itens
        g.items = g.items.filter((item) => {
          item.x -= g.speed;
          return item.x > -50 && !item.collected;
        });

        // Update particulas
        g.particles = g.particles.filter((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.1;
          p.life--;
          return p.life > 0;
        });

        // Colisao com obstaculos
        const truckX = 60;
        const truckTop = groundY - TRUCK_SIZE + g.truckY;
        const truckBottom = groundY + g.truckY;
        const truckLeft = truckX;
        const truckRight = truckX + 40;

        for (const obs of g.obstacles) {
          let hit = false;
          if (obs.type === "buraco") {
            // Buraco: so se esta no chao
            if (!g.isJumping && truckRight > obs.x + 5 && truckLeft < obs.x + obs.width - 5) {
              hit = true;
            }
          } else {
            // Barreira/cone
            const obsTop = groundY - obs.height;
            if (truckRight > obs.x + 3 && truckLeft < obs.x + obs.width - 3 && truckBottom > obsTop + 5 && truckTop < groundY) {
              hit = true;
            }
          }

          if (hit) {
            g.gameOver = true;
            g.running = false;
            spawnParticles(truckX + 20, groundY - 20 + g.truckY, "#C9A84C", 20);
            spawnParticles(truckX + 20, groundY - 20 + g.truckY, "#FF6600", 15);
            if (g.score > g.highScore) {
              g.highScore = g.score;
              localStorage.setItem("pegue_runner_highscore", g.score.toString());
              setDisplayHighScore(g.score);
            }
            setGameState("gameover");
          }
        }

        // Colisao com itens
        for (const item of g.items) {
          if (item.collected) continue;
          const dx = (truckX + 20) - item.x;
          const dy = (truckTop + TRUCK_SIZE / 2) - item.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 30) {
            item.collected = true;
            const points = item.type === "estrela" ? 50 : item.type === "moeda" ? 25 : 10;
            g.combo++;
            g.comboTimer = 120;
            const multiplier = Math.min(g.combo, 5);
            g.score += points * multiplier;
            g.flashTimer = 10;
            setDisplayScore(g.score);

            const color = item.type === "estrela" ? "#FFD700" : item.type === "moeda" ? "#C9A84C" : "#8B4513";
            spawnParticles(item.x, item.y, color, 10);
            spawnParticles(item.x, item.y, "#FFF", 5);
          }
        }

        // Score por distancia
        if (g.frameCount % 10 === 0) {
          g.score++;
          setDisplayScore(g.score);
        }
      }

      // === DRAW OBSTACLES ===
      g.obstacles.forEach((obs) => drawObstacle(ctx, obs, groundY));

      // === DRAW ITEMS ===
      g.items.forEach((item) => drawItem(ctx, item));

      // === DRAW TRUCK ===
      drawTruck(ctx, 60, groundY - TRUCK_SIZE + g.truckY, g.running && !g.isJumping && !g.gameOver);

      // === DRAW PARTICLES ===
      g.particles.forEach((p) => {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // === HUD ===
      // Fundo do HUD
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, 0, W, 56);
      ctx.fillStyle = "#C9A84C";
      ctx.fillRect(0, 56, W, 2);

      // Score
      ctx.fillStyle = g.flashTimer > 0 ? "#FFD700" : "#FFF";
      ctx.font = "bold 20px Arial";
      ctx.textAlign = "left";
      ctx.fillText(`${g.score}`, 15, 25);

      // Distancia
      ctx.fillStyle = "#888";
      ctx.font = "12px Arial";
      ctx.fillText(`${Math.floor(g.distance)}m`, 15, 44);

      // Combo
      if (g.combo > 1) {
        ctx.fillStyle = "#C9A84C";
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(`x${Math.min(g.combo, 5)} COMBO!`, W / 2, 25);
      }

      // High score
      ctx.fillStyle = "#C9A84C";
      ctx.font = "12px Arial";
      ctx.textAlign = "right";
      ctx.fillText(`Recorde: ${g.highScore}`, W - 15, 25);

      // Velocidade
      ctx.fillStyle = "#666";
      ctx.font = "10px Arial";
      ctx.fillText(`${(g.speed * 10).toFixed(0)} km/h`, W - 15, 44);

      // === TELA DE MENU ===
      if (!g.started && !g.gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#C9A84C";
        ctx.font = "bold 28px Arial";
        ctx.textAlign = "center";
        ctx.fillText("🚚 PEGUE RUNNER", W / 2, H * 0.3);

        ctx.fillStyle = "#FFF";
        ctx.font = "16px Arial";
        ctx.fillText("Desvie dos obstaculos!", W / 2, H * 0.38);
        ctx.fillText("Colete pacotes e estrelas!", W / 2, H * 0.43);

        ctx.fillStyle = "#C9A84C";
        ctx.font = "bold 14px Arial";
        ctx.fillText("📦 Pacote = 10 pts", W / 2 - 70, H * 0.52);
        ctx.fillText("💰 Moeda = 25 pts", W / 2 + 70, H * 0.52);
        ctx.fillText("⭐ Estrela = 50 pts", W / 2, H * 0.57);

        // Botao
        const btnY = H * 0.67;
        ctx.fillStyle = "#C9A84C";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 90, btnY - 22, 180, 44, 12);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.font = "bold 18px Arial";
        ctx.fillText("TOQUE PRA JOGAR", W / 2, btnY + 6);

        ctx.fillStyle = "#666";
        ctx.font = "12px Arial";
        ctx.fillText("Toque na tela = Pular", W / 2, H * 0.8);
      }

      // === TELA DE GAME OVER ===
      if (g.gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#FF4444";
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "center";
        ctx.fillText("BATEU! 💥", W / 2, H * 0.25);

        ctx.fillStyle = "#FFF";
        ctx.font = "bold 40px Arial";
        ctx.fillText(`${g.score}`, W / 2, H * 0.38);
        ctx.font = "14px Arial";
        ctx.fillStyle = "#888";
        ctx.fillText("pontos", W / 2, H * 0.43);

        ctx.fillStyle = "#C9A84C";
        ctx.font = "14px Arial";
        ctx.fillText(`📏 ${Math.floor(g.distance)}m percorridos`, W / 2, H * 0.50);

        if (g.score >= g.highScore && g.score > 0) {
          ctx.fillStyle = "#FFD700";
          ctx.font = "bold 16px Arial";
          ctx.fillText("🏆 NOVO RECORDE!", W / 2, H * 0.56);
        } else {
          ctx.fillStyle = "#888";
          ctx.font = "14px Arial";
          ctx.fillText(`Recorde: ${g.highScore}`, W / 2, H * 0.56);
        }

        // Botao jogar de novo
        const btnY1 = H * 0.67;
        ctx.fillStyle = "#C9A84C";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 90, btnY1 - 22, 180, 44, 12);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.font = "bold 16px Arial";
        ctx.fillText("JOGAR DE NOVO", W / 2, btnY1 + 6);

        // Botao voltar
        const btnY2 = H * 0.78;
        ctx.strokeStyle = "#C9A84C";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(W / 2 - 90, btnY2 - 22, 180, 44, 12);
        ctx.stroke();
        ctx.fillStyle = "#C9A84C";
        ctx.font = "bold 14px Arial";
        ctx.fillText("VOLTAR PRO MAPA", W / 2, btnY2 + 6);
      }

      animFrameRef.current = requestAnimationFrame(gameLoop);
    }

    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  // Touch/Click handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleInteraction(e: TouchEvent | MouseEvent) {
      e.preventDefault();
      const g = gameRef.current;
      const H = canvas!.height;

      if (g.gameOver) {
        // Checa se clicou em "Voltar pro mapa"
        const clientY = "touches" in e ? e.touches[0]?.clientY || (e as any).changedTouches?.[0]?.clientY : (e as MouseEvent).clientY;
        if (clientY && clientY > H * 0.75) {
          onClose();
          return;
        }
        startGame();
        return;
      }

      if (!g.started) {
        startGame();
        return;
      }

      jump();
    }

    canvas.addEventListener("touchstart", handleInteraction, { passive: false });
    canvas.addEventListener("mousedown", handleInteraction);

    // Teclado (pra testar no desktop)
    function handleKey(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
      if (e.code === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);

    return () => {
      canvas.removeEventListener("touchstart", handleInteraction);
      canvas.removeEventListener("mousedown", handleInteraction);
      window.removeEventListener("keydown", handleKey);
    };
  }, [jump, startGame, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <canvas ref={canvasRef} className="h-full w-full" />
      {/* Botao fechar no topo */}
      <button
        onClick={onClose}
        className="absolute right-3 top-3 z-50 rounded-full bg-black/50 p-2 text-white backdrop-blur"
      >
        ✕
      </button>
    </div>
  );
}
