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
const INITIAL_SPEED = 4.2; // velocidade confortavel pra fase 1
const SPEED_INCREMENT = 0.0012; // sobe gradualmente dentro da fase

// === INTERFACES ===
interface Obstacle {
  x: number;
  width: number;
  height: number;
  type: "barreira" | "buraco" | "cone" | "pedra" | "motoqueiro" | "motoboy" | "radar" | "boss"
    | "bueiro" | "ambulante" | "catador" | "onibus_parado" | "cachorro"
    | "caixa_madeira" | "saco_lixo" | "cavalete" | "container" | "veiculo_cegonha"; // obstaculos com imagem
  vy?: number;
  flashTimer?: number;
  multado?: boolean;
  bossHP?: number;
  bossHits?: number;
}

interface Item {
  x: number;
  y: number;
  type: "pacote" | "pegue_logo" | "moeda"
    | "pao_chapa" | "pastel" | "mortadela" | "coxinha" | "guarana" | "bilhete_unico"
    | "sobrevida"; // cruz brilhante - absorve 1 batida
  collected: boolean;
  scale: number;
}

// Eventos climaticos SP
type EventoClimatico = "normal" | "enchente" | "nevoeiro" | "granizo" | "apagao";

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
}

interface Landmark {
  x: number;
  type: "pontilhao" | "ponte_estaiada" | "ponte_metalica" | "copan" | "masp" | "fabrica" | "neo_quimica" | "catedral_se" | "mercadao" | "ibirapuera" | "calcadao_osasco" | "allianz_park" | "morumbi" | "portuguesa" | "vila_belmiro";
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

// === MUSICA DO BOSS (Web Audio API - sem arquivo externo) ===
class BossMusic {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private playing = false;

  start() {
    if (this.playing) return;
    try {
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = 0.15;
      this.gainNode.connect(this.ctx.destination);
      this.playing = true;

      // Beat tenso: notas graves alternando rapido (estilo alarme/perigo)
      const bpm = 160;
      const beatTime = 60 / bpm;
      let beatIndex = 0;

      // Sequencia de notas (frequencias em Hz) - riff tenso
      const melody = [
        110, 110, 130.8, 110, 146.8, 130.8, 110, 98,
        110, 110, 130.8, 110, 164.8, 146.8, 130.8, 110,
      ];

      const playBeat = () => {
        if (!this.ctx || !this.gainNode || !this.playing) return;
        const now = this.ctx.currentTime;

        // Nota principal (onda quadrada = som 8bit tenso)
        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();
        osc.type = "square";
        osc.frequency.value = melody[beatIndex % melody.length];
        noteGain.gain.setValueAtTime(0.3, now);
        noteGain.gain.exponentialRampToValueAtTime(0.01, now + beatTime * 0.8);
        osc.connect(noteGain);
        noteGain.connect(this.gainNode!);
        osc.start(now);
        osc.stop(now + beatTime * 0.9);

        // Bumbo (kick) a cada 2 beats
        if (beatIndex % 2 === 0) {
          const kick = this.ctx.createOscillator();
          const kickGain = this.ctx.createGain();
          kick.type = "sine";
          kick.frequency.setValueAtTime(150, now);
          kick.frequency.exponentialRampToValueAtTime(30, now + 0.1);
          kickGain.gain.setValueAtTime(0.5, now);
          kickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
          kick.connect(kickGain);
          kickGain.connect(this.gainNode!);
          kick.start(now);
          kick.stop(now + 0.2);
        }

        // Hi-hat a cada beat
        const noise = this.ctx.createOscillator();
        const noiseGain = this.ctx.createGain();
        noise.type = "sawtooth";
        noise.frequency.value = 3000 + Math.random() * 2000;
        noiseGain.gain.setValueAtTime(0.08, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        noise.connect(noiseGain);
        noiseGain.connect(this.gainNode!);
        noise.start(now);
        noise.stop(now + 0.06);

        beatIndex++;
      };

      playBeat();
      this.intervalId = setInterval(playBeat, beatTime * 1000);
    } catch {}
  }

  stop() {
    this.playing = false;
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    if (this.gainNode) {
      try { this.gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + 0.3); } catch {}
    }
    setTimeout(() => {
      if (this.ctx) { try { this.ctx.close(); } catch {} this.ctx = null; }
      this.gainNode = null;
    }, 500);
  }
}

export default function PegueRunner({ onClose }: PegueRunnerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const soundsRef = useRef<Record<string, HTMLAudioElement>>({});
  const bossMusicRef = useRef<BossMusic>(new BossMusic());
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
    // Rodovia (zona de descanso)
    restActive: false,
    restTimer: 0,
    nextRestFrame: 2400,
    // Sistema de fases
    phase: 1,
    phaseState: "desafio" as "desafio" | "rodovia" | "boss" | "boss_derrota" | "entrega",
    phaseTimer: 0,
    deliveries: 0,
    bossActive: false,
    bossDefeated: false,
    // Boss nova mecanica: boss joga obstaculos, sobreviva 10s
    bossTimer: 0,
    bossSpawnTimer: 0,
    bossDerrotaTimer: 0,
    bossType: "guincho" as "guincho" | "guarda" | "cegonha" | "bruto" | "coletor",
    // Boss 2 - Guarda Rodoviario: 3 multas = eliminado
    guardaMultas: 0,
    // Boss 3 - Cegonha
    cegonhaCarrosPulados: 0,
    cegonhaCarrosJogados: 0,
    // Eventos climaticos SP
    eventoClimatico: "normal" as EventoClimatico,
    eventoTimer: 0,
    granizoDrops: [] as { x: number; y: number; speed: number }[],
    // Pombos voando (fase 4+) - pular neles = game over
    pombos: [] as { x: number; y: number; wingPhase: number; speed: number }[],
    nextPomboSpawn: 300,
    // Invencibilidade (bilhete unico)
    invencivel: false,
    invencivelTimer: 0,
    // Sobrevida (cruz brilhante) - absorve 1 batida
    temSobrevida: false,
    sobreviveuHit: false, // true quando usou a sobrevida (proximo hit mata)
    // Boost velocidade (guarana)
    boosted: false,
    boostTimer: 0,
    // Notas de dollar voando na entrega
    dollarNotes: [] as { x: number; y: number; speed: number; angle: number }[],
    // Clima
    raining: false,
    raindrops: [] as { x: number; y: number; speed: number; len: number }[],
  });

  const [gameState, setGameState] = useState<"menu" | "tutorial" | "playing" | "gameover">("menu");
  const [tutorialStep, setTutorialStep] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayHighScore, setDisplayHighScore] = useState(0);
  const [displayPhase, setDisplayPhase] = useState(1);
  const [displayDeliveries, setDisplayDeliveries] = useState(0);
  const [showRanking, setShowRanking] = useState(false);
  const [ranking, setRanking] = useState<{ nome: string; score: number; distancia: number; entregas?: number }[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [scoreSaved, setScoreSaved] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const animRef = useRef<number>(0);
  const truckImgRef = useRef<HTMLImageElement | null>(null);
  const motoboyImgRef = useRef<HTMLImageElement | null>(null);
  const guinchoImgRef = useRef<HTMLImageElement | null>(null);
  const policiaImgRef = useRef<HTMLImageElement | null>(null);
  const cegonhaImgRef = useRef<HTMLImageElement | null>(null);
  const brutoImgRef = useRef<HTMLImageElement | null>(null);
  const coletorImgRef = useRef<HTMLImageElement | null>(null);
  const sacoLixoImgRef = useRef<HTMLImageElement | null>(null);
  const caixasImgRef = useRef<HTMLImageElement[]>([]);
  const containersImgRef = useRef<HTMLImageElement[]>([]);
  const veiculosCegonhaImgRef = useRef<HTMLImageElement[]>([]);
  const cavaletesImgRef = useRef<HTMLImageElement[]>([]);
  const coneImgRef = useRef<HTMLImageElement | null>(null);
  const otimiziImgRef = useRef<HTMLImageElement | null>(null);

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
    img.src = "/truck-strada.png";
    img.onload = () => { truckImgRef.current = img; };
    const motoImg = new window.Image();
    motoImg.src = "/MOTOBOY.png";
    motoImg.onload = () => { motoboyImgRef.current = motoImg; };
    const guinchoImg = new window.Image();
    guinchoImg.src = "/GUNCHO CET.png";
    guinchoImg.onload = () => { guinchoImgRef.current = guinchoImg; };
    const policiaImg = new window.Image();
    policiaImg.src = "/POLICIA RODOVIARIA.png";
    policiaImg.onload = () => { policiaImgRef.current = policiaImg; };
    const cegonhaImg = new window.Image();
    cegonhaImg.src = "/CAMINHAO CEGONHA.png";
    cegonhaImg.onload = () => { cegonhaImgRef.current = cegonhaImg; };
    const brutoImg = new window.Image();
    brutoImg.src = "/O Bruto do Porto.png";
    brutoImg.onload = () => { brutoImgRef.current = brutoImg; };
    const coletorImg = new window.Image();
    coletorImg.src = "/O Coletor.png";
    coletorImg.onload = () => { coletorImgRef.current = coletorImg; };
    const sacoImg = new window.Image();
    sacoImg.src = "/sacos de lixo.png";
    sacoImg.onload = () => { sacoLixoImgRef.current = sacoImg; };
    // 2 variações de cavaletes
    const coneImg = new window.Image();
    coneImg.src = "/CONE.png";
    coneImg.onload = () => { coneImgRef.current = coneImg; };
    const otimiziImg = new window.Image();
    otimiziImg.src = "/otimizi industria.png";
    otimiziImg.onload = () => { otimiziImgRef.current = otimiziImg; };
    ["/cavaletes.png", "/cavalete 2.png", "/cavalete 3.png"].forEach((src) => {
      const cv = new window.Image();
      cv.src = src;
      cv.onload = () => { cavaletesImgRef.current.push(cv); };
    });
    // 4 veiculos pra cegonha derrubar
    ["/veiculo 1.png", "/veiculo 2.png", "/veiculo 3.png", "/veiculo 4.png"].forEach((src) => {
      const vi = new window.Image();
      vi.src = src;
      vi.onload = () => { veiculosCegonhaImgRef.current.push(vi); };
    });
    ["/CONTAINER BOSS PORTO.png", "/CONTAINER BOSS PORTO 2.png"].forEach((src) => {
      const ct = new window.Image();
      ct.src = src;
      ct.onload = () => { containersImgRef.current.push(ct); };
    });
    // 3 variações de caixas de madeira
    const caixaSrcs = ["/caixa grande de madeira.png", "/caixa grande de madeira 2.png", "/caixa grande de madeira 3.png"];
    caixaSrcs.forEach((src) => {
      const ci = new window.Image();
      ci.src = src;
      ci.onload = () => { caixasImgRef.current.push(ci); };
    });
  }, []);

  async function fetchRanking() {
    try {
      const r = await fetch("/api/ranking");
      const data = await r.json();
      setRanking(data);
    } catch {}
  }

  async function saveScore() {
    if (!playerName.trim() || scoreSaved || savingScore) return;
    setSavingScore(true);
    const g = gameRef.current;
    try {
      const res = await fetch("/api/ranking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: playerName.trim(), score: g.score, distancia: Math.floor(g.distance), entregas: g.deliveries }),
      });
      if (res.ok) {
        setScoreSaved(true);
        localStorage.setItem("pegue_runner_name", playerName.trim());
        fetchRanking();
      } else {
        // Se falhar, salva local e marca como salvo pra nao travar
        setScoreSaved(true);
      }
    } catch {
      // Erro de rede: marca como salvo pra nao travar
      setScoreSaved(true);
    }
    setSavingScore(false);
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
      const drawW = 160;
      const drawH = (img.height / img.width) * drawW;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, x - 25, ty - drawH + TRUCK_SIZE + 15, drawW, drawH);
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
      // Industria Otimizi - imagem PNG real
      if (otimiziImgRef.current) {
        const oImg = otimiziImgRef.current;
        const drawW = 180;
        const drawH = (oImg.height / oImg.width) * drawW;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(oImg, lm.x - 50, baseY - drawH + 5, drawW, drawH);
      } else {
        // Fallback canvas
        ctx.fillStyle = "#444";
        ctx.fillRect(lm.x, baseY - 70, lm.width, 70);
        ctx.fillStyle = "#C9A84C";
        ctx.fillRect(lm.x + 10, baseY - 75, lm.width - 20, 12);
        ctx.fillStyle = "#000";
        ctx.font = "bold 7px Arial";
        ctx.textAlign = "center";
        ctx.fillText("OTIMIZI", lm.x + lm.width / 2, baseY - 66);
      }
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

    // === ESTADIOS DE SP ===
    else if (lm.type === "allianz_park") {
      // Allianz Parque - Palmeiras (verde)
      const cx = lm.x + lm.width / 2;
      ctx.fillStyle = "#1B5E20";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 40, lm.width / 2, 60, 0, Math.PI, 0);
      ctx.lineTo(lm.x + lm.width, baseY);
      ctx.lineTo(lm.x, baseY);
      ctx.closePath();
      ctx.fill();
      // Fachada
      ctx.fillStyle = "#2E7D32";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 40, lm.width / 2 - 5, 55, 0, Math.PI, 0);
      ctx.lineTo(lm.x + lm.width - 5, baseY - 5);
      ctx.lineTo(lm.x + 5, baseY - 5);
      ctx.closePath();
      ctx.fill();
      // Linhas verticais
      ctx.strokeStyle = "#1B5E20";
      ctx.lineWidth = 1;
      for (let i = 0; i < lm.width; i += 12) {
        const fx = lm.x + i;
        const fy = baseY - 40 - Math.sqrt(Math.max(0, 1 - Math.pow((fx - cx) / (lm.width / 2), 2))) * 55;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, baseY - 5); ctx.stroke();
      }
      // Campo verde
      ctx.fillStyle = "#4CAF50";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 45, lm.width / 4, 20, 0, Math.PI, 0);
      ctx.fill();
      // Painel
      ctx.fillStyle = "#111";
      ctx.fillRect(lm.x + 20, baseY - 30, lm.width - 40, 14);
      ctx.fillStyle = "#4CAF50";
      ctx.font = "bold 7px Arial";
      ctx.textAlign = "center";
      ctx.fillText("ALLIANZ PARQUE", cx, baseY - 20);
      // Torres
      for (const tx of [lm.x + 8, lm.x + lm.width - 8]) {
        ctx.fillStyle = "#888";
        ctx.fillRect(tx - 2, baseY - 110, 4, 70);
        ctx.fillStyle = "#FFF";
        ctx.fillRect(tx - 5, baseY - 115, 10, 6);
      }
    }

    else if (lm.type === "morumbi") {
      // Estadio do Morumbi - São Paulo FC (vermelho/branco/preto)
      const cx = lm.x + lm.width / 2;
      ctx.fillStyle = "#CC0000";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 40, lm.width / 2, 60, 0, Math.PI, 0);
      ctx.lineTo(lm.x + lm.width, baseY);
      ctx.lineTo(lm.x, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#EE2222";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 40, lm.width / 2 - 5, 55, 0, Math.PI, 0);
      ctx.lineTo(lm.x + lm.width - 5, baseY - 5);
      ctx.lineTo(lm.x + 5, baseY - 5);
      ctx.closePath();
      ctx.fill();
      // Faixa branca
      ctx.fillStyle = "#FFF";
      ctx.fillRect(lm.x + 10, baseY - 25, lm.width - 20, 6);
      // Faixa preta
      ctx.fillStyle = "#111";
      ctx.fillRect(lm.x + 10, baseY - 18, lm.width - 20, 4);
      // Campo
      ctx.fillStyle = "#4CAF50";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 45, lm.width / 4, 20, 0, Math.PI, 0);
      ctx.fill();
      // Painel
      ctx.fillStyle = "#111";
      ctx.fillRect(lm.x + 25, baseY - 35, lm.width - 50, 12);
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 6px Arial";
      ctx.textAlign = "center";
      ctx.fillText("MORUMBI", cx, baseY - 27);
      // Escudo SPFC
      ctx.fillStyle = "#FFF";
      ctx.beginPath(); ctx.arc(cx, baseY - 70, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#CC0000";
      ctx.fillRect(cx - 7, baseY - 77, 14, 5);
      ctx.fillStyle = "#000";
      ctx.fillRect(cx - 7, baseY - 72, 14, 3);
    }

    else if (lm.type === "portuguesa") {
      // Estadio da Portuguesa - Caninde (verde e vermelho)
      const cx = lm.x + lm.width / 2;
      // Estrutura mais baixa (estadio menor)
      ctx.fillStyle = "#1B5E20";
      ctx.fillRect(lm.x, baseY - 60, lm.width, 60);
      // Faixa vermelha
      ctx.fillStyle = "#CC0000";
      ctx.fillRect(lm.x, baseY - 40, lm.width, 15);
      // Faixa verde
      ctx.fillStyle = "#2E7D32";
      ctx.fillRect(lm.x, baseY - 25, lm.width, 10);
      // Topo arredondado
      ctx.fillStyle = "#1B5E20";
      ctx.beginPath();
      ctx.arc(cx, baseY - 60, lm.width / 2, Math.PI, 0);
      ctx.fill();
      // Arquibancada
      ctx.fillStyle = "#CC000044";
      ctx.fillRect(lm.x + 10, baseY - 55, lm.width - 20, 8);
      // Painel
      ctx.fillStyle = "#111";
      ctx.fillRect(lm.x + 15, baseY - 48, lm.width - 30, 10);
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 5px Arial";
      ctx.textAlign = "center";
      ctx.fillText("CANINDE", cx, baseY - 41);
      ctx.fillText("PORTUGUESA", cx, baseY - 35);
      // Torres
      ctx.fillStyle = "#888";
      ctx.fillRect(lm.x + 5, baseY - 85, 3, 25);
      ctx.fillRect(lm.x + lm.width - 8, baseY - 85, 3, 25);
      ctx.fillStyle = "#CC0000";
      ctx.fillRect(lm.x + 2, baseY - 88, 9, 4);
      ctx.fillRect(lm.x + lm.width - 11, baseY - 88, 9, 4);
    }

    else if (lm.type === "vila_belmiro") {
      // Vila Belmiro - Santos FC (todo branco)
      const cx = lm.x + lm.width / 2;
      ctx.fillStyle = "#F5F5F5";
      ctx.fillRect(lm.x, baseY - 55, lm.width, 55);
      // Topo
      ctx.fillStyle = "#EEE";
      ctx.beginPath();
      ctx.arc(cx, baseY - 55, lm.width / 2, Math.PI, 0);
      ctx.fill();
      // Borda preta sutil
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, baseY - 55, lm.width / 2, Math.PI, 0);
      ctx.stroke();
      ctx.strokeRect(lm.x, baseY - 55, lm.width, 55);
      // Janelas/aberturas
      for (let ji = 0; ji < 5; ji++) {
        ctx.fillStyle = "#DDD";
        ctx.fillRect(lm.x + 10 + ji * 27, baseY - 45, 15, 20);
      }
      // Campo
      ctx.fillStyle = "#4CAF50";
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 50, lm.width / 4, 15, 0, Math.PI, 0);
      ctx.fill();
      // Painel
      ctx.fillStyle = "#111";
      ctx.fillRect(lm.x + 20, baseY - 65, lm.width - 40, 12);
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 6px Arial";
      ctx.textAlign = "center";
      ctx.fillText("VILA BELMIRO", cx, baseY - 57);
      // Escudo Santos (circulo preto/branco)
      ctx.fillStyle = "#FFF";
      ctx.beginPath(); ctx.arc(cx, baseY - 78, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, baseY - 78, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.font = "bold 7px Arial";
      ctx.fillText("SFC", cx, baseY - 75);
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
    } else if (item.type === "pao_chapa" || item.type === "pastel" || item.type === "mortadela" || item.type === "coxinha") {
      // Itens de comida SP - emoji style
      const emojis: Record<string, string> = {
        pao_chapa: "🍞", pastel: "🥟", mortadela: "🥩", coxinha: "🍗",
      };
      ctx.font = `${18 * s}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emojis[item.type] || "🍽️", item.x, y);
      ctx.textBaseline = "alphabetic";
    } else if (item.type === "guarana") {
      // Guaraná = boost velocidade
      ctx.fillStyle = "#00AA00";
      ctx.beginPath();
      ctx.roundRect(item.x - 6 * s, y - 10 * s, 12 * s, 20 * s, 3);
      ctx.fill();
      ctx.fillStyle = "#FFF";
      ctx.font = `bold ${7 * s}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("G", item.x, y);
      ctx.textBaseline = "alphabetic";
      // Raio de velocidade
      ctx.fillStyle = "#FFDD00";
      ctx.font = `${10 * s}px Arial`;
      ctx.fillText("⚡", item.x + 8, y - 8);
    } else if (item.type === "sobrevida") {
      // Cruz brilhante dourada - sobrevida
      const fc = gameRef.current.frameCount;
      const glow = 0.4 + Math.sin(fc * 0.08) * 0.3;
      const pulse = 1 + Math.sin(fc * 0.1) * 0.15;
      // Halo de brilho
      ctx.fillStyle = `rgba(255,215,0,${glow * 0.3})`;
      ctx.beginPath();
      ctx.arc(item.x, y, 22 * s * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,200,${glow * 0.2})`;
      ctx.beginPath();
      ctx.arc(item.x, y, 28 * s * pulse, 0, Math.PI * 2);
      ctx.fill();
      // Cruz dourada
      const cw = 5 * s, ch = 16 * s;
      ctx.fillStyle = "#FFD700";
      ctx.fillRect(item.x - cw / 2, y - ch / 2, cw, ch);
      ctx.fillRect(item.x - ch / 2 * 0.7, y - cw / 2 * 0.8, ch * 0.7, cw * 0.8);
      // Contorno
      ctx.strokeStyle = "#B8860B";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(item.x - cw / 2, y - ch / 2, cw, ch);
      ctx.strokeRect(item.x - ch / 2 * 0.7, y - cw / 2 * 0.8, ch * 0.7, cw * 0.8);
      // Brilho central
      ctx.fillStyle = "#FFF";
      ctx.beginPath();
      ctx.arc(item.x, y, 3 * s, 0, Math.PI * 2);
      ctx.fill();
      // Raios de luz girando
      ctx.strokeStyle = `rgba(255,215,0,${glow})`;
      ctx.lineWidth = 1;
      for (let r = 0; r < 8; r++) {
        const angle = (r / 8) * Math.PI * 2 + fc * 0.02;
        ctx.beginPath();
        ctx.moveTo(item.x + Math.cos(angle) * 12 * s, y + Math.sin(angle) * 12 * s);
        ctx.lineTo(item.x + Math.cos(angle) * 18 * s * pulse, y + Math.sin(angle) * 18 * s * pulse);
        ctx.stroke();
      }
    } else if (item.type === "bilhete_unico") {
      // Bilhete Unico = invencibilidade
      ctx.fillStyle = "#0066CC";
      ctx.beginPath();
      ctx.roundRect(item.x - 10 * s, y - 7 * s, 20 * s, 14 * s, 2);
      ctx.fill();
      ctx.fillStyle = "#FFF";
      ctx.font = `bold ${6 * s}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("BU", item.x, y);
      ctx.textBaseline = "alphabetic";
      // Brilho pulsante
      const pulse = Math.sin(gameRef.current.frameCount * 0.1) * 0.3 + 0.3;
      ctx.fillStyle = `rgba(100,180,255,${pulse})`;
      ctx.beginPath();
      ctx.arc(item.x, y, 14 * s, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Moeda padrao
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

  // === DRAW OBSTACLE (expandido + destacado) ===
  function drawObstacle(ctx: CanvasRenderingContext2D, obs: Obstacle, groundY: number) {
    // Sombra base pra todos os obstaculos (destaca do fundo)
    if (obs.type !== "boss" && obs.type !== "buraco" && obs.type !== "bueiro" && obs.type !== "cachorro") {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width / 2, groundY + 3, obs.width / 2 + 5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (obs.type === "barreira") {
      // Barreira mais brilhante com contorno
      const stripes = 4;
      const stripeH = obs.height / stripes;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#FF5500" : "#FFEE00";
        ctx.fillRect(obs.x, groundY - obs.height + i * stripeH, obs.width, stripeH);
      }
      // Contorno escuro
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 2;
      ctx.strokeRect(obs.x, groundY - obs.height, obs.width, obs.height);
      // Postes laterais
      ctx.fillStyle = "#555";
      ctx.fillRect(obs.x - 3, groundY - obs.height - 5, 5, obs.height + 5);
      ctx.fillRect(obs.x + obs.width - 2, groundY - obs.height - 5, 5, obs.height + 5);
    }
    else if (obs.type === "cone") {
      // Cone - imagem PNG
      if (coneImgRef.current) {
        const cnImg = coneImgRef.current;
        const drawW = 35;
        const drawH = (cnImg.height / cnImg.width) * drawW;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(cnImg, obs.x - 5, groundY - drawH + 3, drawW, drawH);
      } else {
        // Fallback
        ctx.fillStyle = "#FF4400";
        ctx.beginPath();
        ctx.moveTo(obs.x + obs.width / 2, groundY - obs.height);
        ctx.lineTo(obs.x + obs.width, groundY);
        ctx.lineTo(obs.x, groundY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#FFF";
        ctx.fillRect(obs.x + 3, groundY - obs.height * 0.5, obs.width - 6, 3);
      }
    }
    else if (obs.type === "buraco") {
      // Buraco realista - pedaco da pista faltando
      const cx = obs.x + obs.width / 2;
      const hw = obs.width / 2;

      // Borda do asfalto quebrado (irregular)
      ctx.fillStyle = "#444";
      ctx.beginPath();
      ctx.moveTo(obs.x - 4, groundY - 2);
      ctx.lineTo(obs.x - 2, groundY - 6);
      ctx.lineTo(obs.x + hw * 0.3, groundY - 8);
      ctx.lineTo(obs.x + hw * 0.6, groundY - 5);
      ctx.lineTo(obs.x + hw, groundY - 9);
      ctx.lineTo(obs.x + hw * 1.4, groundY - 6);
      ctx.lineTo(obs.x + hw * 1.7, groundY - 7);
      ctx.lineTo(obs.x + obs.width + 4, groundY - 2);
      ctx.lineTo(obs.x + obs.width + 4, groundY + 5);
      ctx.lineTo(obs.x - 4, groundY + 5);
      ctx.closePath();
      ctx.fill();

      // Terra/barro dentro do buraco
      ctx.fillStyle = "#6B4226";
      ctx.beginPath();
      ctx.moveTo(obs.x, groundY - 1);
      ctx.lineTo(obs.x + 2, groundY - 5);
      ctx.lineTo(obs.x + hw * 0.4, groundY - 6);
      ctx.lineTo(obs.x + hw * 0.7, groundY - 4);
      ctx.lineTo(obs.x + hw, groundY - 7);
      ctx.lineTo(obs.x + hw * 1.3, groundY - 4);
      ctx.lineTo(obs.x + hw * 1.6, groundY - 5);
      ctx.lineTo(obs.x + obs.width, groundY - 1);
      ctx.lineTo(obs.x + obs.width, groundY + 3);
      ctx.lineTo(obs.x, groundY + 3);
      ctx.closePath();
      ctx.fill();

      // Camada mais escura no fundo (profundidade)
      ctx.fillStyle = "#4A2E14";
      ctx.beginPath();
      ctx.ellipse(cx, groundY + 1, hw * 0.7, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pedrinhas/cascalho na borda
      ctx.fillStyle = "#888";
      const pedras = [[-3, -3], [hw * 0.5, -7], [hw, -8], [hw * 1.5, -5], [obs.width + 2, -3]];
      pedras.forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(obs.x + px, groundY + py, 1.5 + Math.random(), 0, Math.PI * 2);
        ctx.fill();
      });

      // Rachaduras saindo do buraco
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(obs.x - 4, groundY - 3); ctx.lineTo(obs.x - 12, groundY - 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(obs.x + obs.width + 4, groundY - 3); ctx.lineTo(obs.x + obs.width + 12, groundY - 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, groundY - 8); ctx.lineTo(cx + 3, groundY - 13); ctx.stroke();
    }
    else if (obs.type === "pedra") {
      // Pedra/rocha mais visivel com contorno e textura
      // Contorno escuro primeiro
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(obs.x - 2, groundY);
      ctx.lineTo(obs.x + 3, groundY - obs.height * 0.6);
      ctx.lineTo(obs.x + obs.width * 0.3, groundY - obs.height - 2);
      ctx.lineTo(obs.x + obs.width * 0.6, groundY - obs.height * 0.85);
      ctx.lineTo(obs.x + obs.width * 0.85, groundY - obs.height * 0.45);
      ctx.lineTo(obs.x + obs.width + 2, groundY);
      ctx.closePath();
      ctx.stroke();
      // Corpo da pedra
      ctx.fillStyle = "#999";
      ctx.beginPath();
      ctx.moveTo(obs.x, groundY);
      ctx.lineTo(obs.x + 4, groundY - obs.height * 0.6);
      ctx.lineTo(obs.x + obs.width * 0.3, groundY - obs.height);
      ctx.lineTo(obs.x + obs.width * 0.6, groundY - obs.height * 0.9);
      ctx.lineTo(obs.x + obs.width * 0.85, groundY - obs.height * 0.5);
      ctx.lineTo(obs.x + obs.width, groundY);
      ctx.closePath();
      ctx.fill();
      // Face mais escura
      ctx.fillStyle = "#777";
      ctx.beginPath();
      ctx.moveTo(obs.x + obs.width * 0.3, groundY - obs.height);
      ctx.lineTo(obs.x + obs.width * 0.5, groundY - obs.height * 0.65);
      ctx.lineTo(obs.x + obs.width * 0.6, groundY - obs.height * 0.9);
      ctx.closePath();
      ctx.fill();
      // Brilho forte
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.arc(obs.x + obs.width * 0.35, groundY - obs.height * 0.7, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    else if (obs.type === "motoqueiro" || obs.type === "motoboy") {
      // Motoqueiro/Motoboy - usa imagem PNG MOTOBOY.png
      const mx = obs.x;
      const my = groundY;
      if (motoboyImgRef.current) {
        const mImg = motoboyImgRef.current;
        const drawW = 75;
        const drawH = (mImg.height / mImg.width) * drawW;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(mImg, mx - 5, my - drawH + 5, drawW, drawH);
      } else {
        // Fallback simples
        ctx.fillStyle = "#222";
        ctx.fillRect(mx, my - 35, 50, 30);
        ctx.fillStyle = "#0A0";
        ctx.fillRect(mx + 5, my - 30, 40, 20);
      }
      // Fumaca do escapamento (animada)
      const fcm = gameRef.current.frameCount;
      ctx.fillStyle = "rgba(150,150,150,0.4)";
      ctx.beginPath(); ctx.arc(mx - 8 - (fcm % 10), my - 10, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(150,150,150,0.2)";
      ctx.beginPath(); ctx.arc(mx - 18 - (fcm % 15), my - 12, 3, 0, Math.PI * 2); ctx.fill();
    }
    else if (obs.type === "bueiro") {
      // Bueiro aberto - tampa faltando (classico SP)
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width / 2, groundY + 1, obs.width / 2, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width / 2, groundY + 2, obs.width / 2 - 5, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tampa torta ao lado
      ctx.fillStyle = "#555";
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.width + 5, groundY - 2, 8, 3, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(obs.x + obs.width + 1, groundY - 2);
      ctx.lineTo(obs.x + obs.width + 9, groundY - 2);
      ctx.stroke();
    }
    else if (obs.type === "ambulante") {
      // Vendedor ambulante com carrinho (churros/pipoca)
      const ax = obs.x, ay = groundY;
      // Rodas do carrinho
      ctx.fillStyle = "#333";
      ctx.beginPath(); ctx.arc(ax + 5, ay - 3, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ax + 35, ay - 3, 5, 0, Math.PI * 2); ctx.fill();
      // Carrinho
      ctx.fillStyle = "#CC3333";
      ctx.fillRect(ax - 2, ay - 28, 44, 22);
      // Toldo listrado
      ctx.fillStyle = "#FFCC00";
      ctx.fillRect(ax - 5, ay - 38, 50, 12);
      ctx.fillStyle = "#CC3333";
      ctx.fillRect(ax - 5, ay - 38, 10, 12);
      ctx.fillRect(ax + 15, ay - 38, 10, 12);
      ctx.fillRect(ax + 35, ay - 38, 10, 12);
      // Vendedor
      ctx.fillStyle = "#FFCC99";
      ctx.beginPath(); ctx.arc(ax + 45, ay - 35, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#FFF";
      ctx.fillRect(ax + 41, ay - 28, 8, 15);
      ctx.fillStyle = "#444";
      ctx.fillRect(ax + 41, ay - 13, 3, 13);
      ctx.fillRect(ax + 46, ay - 13, 3, 13);
    }
    else if (obs.type === "catador") {
      // Catador de reciclagem com carroça de papelão
      const cx = obs.x, cy = groundY;
      // Roda da carroça
      ctx.fillStyle = "#444";
      ctx.beginPath(); ctx.arc(cx + 20, cy - 5, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#666";
      ctx.beginPath(); ctx.arc(cx + 20, cy - 5, 4, 0, Math.PI * 2); ctx.fill();
      // Carroça
      ctx.fillStyle = "#8B6914";
      ctx.fillRect(cx, cy - 30, 40, 22);
      // Papelão empilhado
      ctx.fillStyle = "#A0884A";
      ctx.fillRect(cx + 2, cy - 42, 36, 14);
      ctx.fillStyle = "#C4A860";
      ctx.fillRect(cx + 5, cy - 50, 30, 10);
      // Catador
      ctx.fillStyle = "#8B5E3C";
      ctx.beginPath(); ctx.arc(cx + 48, cy - 32, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#336";
      ctx.fillRect(cx + 44, cy - 26, 8, 14);
      ctx.fillStyle = "#444";
      ctx.fillRect(cx + 44, cy - 12, 3, 12);
      ctx.fillRect(cx + 49, cy - 12, 3, 12);
    }
    else if (obs.type === "onibus_parado") {
      // Ônibus grande parado na faixa
      const ox = obs.x, oy = groundY;
      // Rodas
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.arc(ox + 10, oy - 5, 9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ox + 55, oy - 5, 9, 0, Math.PI * 2); ctx.fill();
      // Corpo do onibus
      ctx.fillStyle = "#1565C0";
      ctx.beginPath();
      ctx.roundRect(ox - 5, oy - 50, 70, 42, [6, 6, 0, 0]);
      ctx.fill();
      // Faixa branca
      ctx.fillStyle = "#FFF";
      ctx.fillRect(ox - 5, oy - 25, 70, 5);
      // Janelas
      ctx.fillStyle = "#87CEEB";
      for (let j = 0; j < 4; j++) {
        ctx.fillRect(ox + j * 15 + 2, oy - 46, 10, 14);
      }
      // Letreiro
      ctx.fillStyle = "#FF6600";
      ctx.fillRect(ox, oy - 52, 50, 8);
      ctx.fillStyle = "#FFF";
      ctx.font = "bold 5px Arial";
      ctx.textAlign = "center";
      ctx.fillText("SPTRANS", ox + 25, oy - 46);
    }
    else if (obs.type === "cachorro") {
      // Cachorro caramelo - patrimonio de SP! (nao mata, da bonus)
      const dx = obs.x, dy = groundY;
      // Corpo
      ctx.fillStyle = "#D4A056";
      ctx.beginPath();
      ctx.ellipse(dx + 15, dy - 12, 15, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      // Cabeca
      ctx.fillStyle = "#C49040";
      ctx.beginPath(); ctx.arc(dx + 32, dy - 18, 7, 0, Math.PI * 2); ctx.fill();
      // Orelhas
      ctx.fillStyle = "#B07830";
      ctx.beginPath(); ctx.arc(dx + 28, dy - 24, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(dx + 36, dy - 24, 4, 0, Math.PI * 2); ctx.fill();
      // Focinho
      ctx.fillStyle = "#333";
      ctx.beginPath(); ctx.arc(dx + 37, dy - 17, 2, 0, Math.PI * 2); ctx.fill();
      // Olho
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.arc(dx + 34, dy - 20, 1.5, 0, Math.PI * 2); ctx.fill();
      // Patas
      ctx.fillStyle = "#D4A056";
      ctx.fillRect(dx + 5, dy - 5, 3, 5);
      ctx.fillRect(dx + 12, dy - 5, 3, 5);
      ctx.fillRect(dx + 20, dy - 5, 3, 5);
      ctx.fillRect(dx + 27, dy - 5, 3, 5);
      // Rabo abanando
      const rabAngle = Math.sin(gameRef.current.frameCount * 0.2) * 0.4;
      ctx.save();
      ctx.translate(dx + 2, dy - 15);
      ctx.rotate(-0.5 + rabAngle);
      ctx.fillStyle = "#C49040";
      ctx.fillRect(-2, -8, 3, 10);
      ctx.restore();
      // Coracaozinho flutuando
      ctx.fillStyle = "#FF6B8A";
      ctx.font = "10px Arial";
      ctx.textAlign = "center";
      const heartY = dy - 30 + Math.sin(gameRef.current.frameCount * 0.08) * 3;
      ctx.fillText("♥", dx + 20, heartY);
    }
    else if (obs.type === "cavalete") {
      // Cavalete de obra - variações de imagem PNG
      const cvImgs = cavaletesImgRef.current;
      if (cvImgs.length > 0) {
        const cvIdx = Math.abs(Math.round(obs.x * 0.07)) % cvImgs.length;
        const cvImg = cvImgs[cvIdx];
        const drawW = 55;
        const drawH = (cvImg.height / cvImg.width) * drawW;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(cvImg, obs.x - 3, groundY - drawH + 3, drawW, drawH);
      } else {
        ctx.fillStyle = "#FF6B00";
        ctx.fillRect(obs.x, groundY - obs.height, obs.width, obs.height);
        ctx.fillStyle = "#FFF";
        ctx.fillRect(obs.x, groundY - obs.height * 0.5, obs.width, 5);
      }
    }
    else if (obs.type === "veiculo_cegonha") {
      // Veiculo derrubado pela cegonha - imagem PNG aleatoria
      const vcImgs = veiculosCegonhaImgRef.current;
      if (vcImgs.length > 0) {
        const vcIdx = Math.abs(Math.round(obs.x * 0.13)) % vcImgs.length;
        const vcImg = vcImgs[vcIdx];
        const drawW = 70;
        const drawH = (vcImg.height / vcImg.width) * drawW;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(vcImg, obs.x - 5, groundY - drawH + 5, drawW, drawH);
      } else {
        ctx.fillStyle = "#CC0000";
        ctx.fillRect(obs.x, groundY - obs.height, obs.width, obs.height);
        ctx.fillStyle = "#87CEEB";
        ctx.fillRect(obs.x + obs.width * 0.6, groundY - obs.height, obs.width * 0.3, obs.height * 0.5);
      }
    }
    else if (obs.type === "container") {
      // Container do porto - variações de imagem PNG
      const ctImgs = containersImgRef.current;
      if (ctImgs.length > 0) {
        const ctIdx = Math.abs(Math.round(obs.x * 0.09)) % ctImgs.length;
        const ctImg = ctImgs[ctIdx];
        const drawW = 65;
        const drawH = (ctImg.height / ctImg.width) * drawW;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(ctImg, obs.x - 5, groundY - drawH + 3, drawW, drawH);
      } else {
        ctx.fillStyle = "#E65100";
        ctx.fillRect(obs.x, groundY - obs.height, obs.width, obs.height);
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, groundY - obs.height, obs.width, obs.height);
      }
    }
    else if (obs.type === "caixa_madeira") {
      // Caixa de madeira do porto - usa imagem PNG aleatoria
      const caixas = caixasImgRef.current;
      if (caixas.length > 0) {
        // Escolhe caixa baseado na posicao X (deterministica pra nao piscar)
        const cIdx = Math.abs(Math.round(obs.x * 0.1)) % caixas.length;
        const cImg = caixas[cIdx];
        const drawW = 55;
        const drawH = (cImg.height / cImg.width) * drawW;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(cImg, obs.x - 5, groundY - drawH + 3, drawW, drawH);
      } else {
        // Fallback
        ctx.fillStyle = "#8B6914";
        ctx.fillRect(obs.x, groundY - obs.height, obs.width, obs.height);
        ctx.strokeStyle = "#5C4400";
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, groundY - obs.height, obs.width, obs.height);
      }
    }
    else if (obs.type === "saco_lixo") {
      // Saco de lixo - usa imagem PNG
      if (sacoLixoImgRef.current) {
        const sImg = sacoLixoImgRef.current;
        const drawW = 42;
        const drawH = (sImg.height / sImg.width) * drawW;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(sImg, obs.x - 3, groundY - drawH + 3, drawW, drawH);
      } else {
        // Fallback
        ctx.fillStyle = "#222";
        ctx.beginPath();
        ctx.ellipse(obs.x + obs.width / 2, groundY - obs.height / 2, obs.width / 2, obs.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    else if (obs.type === "boss") {
      // BOSS - Guincho CET ou Guarda Rodoviario
      const bx = obs.x;
      const by = groundY + (obs.vy || 0);
      const flashing = obs.flashTimer && obs.flashTimer > 0;
      const fc = gameRef.current.frameCount;
      const isGuarda = gameRef.current.bossType === "guarda";
      const shake = flashing ? Math.sin(fc * 0.5) * 3 : 0;

      ctx.save();
      ctx.translate(shake, 0);

      // === Sombra ===
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(bx + 60, by + 2, isGuarda ? 50 : 55, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      if (isGuarda) {
        // =============================================
        // BOSS 2: POLICIA RODOVIARIA - imagem PNG
        // =============================================
        if (policiaImgRef.current) {
          const pImg = policiaImgRef.current;
          const drawW = 140;
          const drawH = (pImg.height / pImg.width) * drawW;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(pImg, bx - 10, by - drawH + 8, drawW, drawH);
        } else {
          // Fallback
          ctx.fillStyle = "#777";
          ctx.fillRect(bx, by - 40, 110, 35);
          ctx.fillStyle = "#E8B800";
          ctx.fillRect(bx, by - 25, 110, 8);
          ctx.fillStyle = "#000";
          ctx.font = "bold 8px Arial";
          ctx.textAlign = "center";
          ctx.fillText("POLICIA RODOVIARIA", bx + 55, by - 19);
        }
        // Sirene piscante (por cima da imagem)
        const s1 = fc % 20 < 10;
        ctx.fillStyle = s1 ? "rgba(255,0,0,0.4)" : "rgba(0,68,255,0.4)";
        ctx.beginPath(); ctx.arc(bx + 55, by - 55, 15, 0, Math.PI * 2); ctx.fill();

      } else if (gameRef.current.bossType === "bruto") {
        // =============================================
        // BOSS 4: O BRUTO DO PORTO - imagem PNG
        // =============================================
        if (brutoImgRef.current) {
          const bImg = brutoImgRef.current;
          const drawW = 200;
          const drawH = (bImg.height / bImg.width) * drawW;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(bImg, bx - 20, by - drawH + 12, drawW, drawH);
        } else {
          ctx.fillStyle = "#E65100";
          ctx.fillRect(bx, by - 45, 130, 40);
          ctx.fillStyle = "#FFF";
          ctx.font = "bold 8px Arial";
          ctx.textAlign = "center";
          ctx.fillText("O BRUTO DO PORTO", bx + 65, by - 22);
        }
        // Fumaca preta do escapamento
        const fcb = fc;
        ctx.fillStyle = "rgba(50,50,50,0.4)";
        ctx.beginPath(); ctx.arc(bx - 10 - (fcb % 12), by - 30, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(50,50,50,0.2)";
        ctx.beginPath(); ctx.arc(bx - 25 - (fcb % 18), by - 35, 4, 0, Math.PI * 2); ctx.fill();

      } else if (gameRef.current.bossType === "coletor") {
        // =============================================
        // BOSS 5: O COLETOR - imagem PNG
        // =============================================
        if (coletorImgRef.current) {
          const cImg = coletorImgRef.current;
          const drawW = 190;
          const drawH = (cImg.height / cImg.width) * drawW;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(cImg, bx - 15, by - drawH + 12, drawW, drawH);
        } else {
          ctx.fillStyle = "#E65100";
          ctx.fillRect(bx, by - 45, 130, 40);
          ctx.fillStyle = "#FFF";
          ctx.font = "bold 8px Arial";
          ctx.textAlign = "center";
          ctx.fillText("O COLETOR", bx + 65, by - 22);
        }

      } else if (!isGuarda && gameRef.current.bossType === "cegonha") {
        // =============================================
        // BOSS 3: CARRETA CEGONHA - imagem PNG
        // =============================================
        if (cegonhaImgRef.current) {
          const cImg = cegonhaImgRef.current;
          const drawW = 180;
          const drawH = (cImg.height / cImg.width) * drawW;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(cImg, bx - 20, by - drawH + 10, drawW, drawH);
        } else {
          // Fallback
          ctx.fillStyle = "#888";
          ctx.fillRect(bx, by - 50, 130, 45);
          ctx.fillStyle = "#2E7D32";
          ctx.fillRect(bx + 100, by - 40, 30, 35);
          ctx.fillStyle = "#FFF";
          ctx.font = "bold 8px Arial";
          ctx.textAlign = "center";
          ctx.fillText("CEGONHA", bx + 65, by - 25);
        }

      } else {
        // =============================================
        // BOSS 1: GUINCHO CET - imagem PNG
        // =============================================
        if (guinchoImgRef.current) {
          const gImg = guinchoImgRef.current;
          const drawW = 210;
          const drawH = (gImg.height / gImg.width) * drawW;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(gImg, bx - 25, by - drawH + 15, drawW, drawH);
        } else {
          // Fallback
          ctx.fillStyle = "#E8A800";
          ctx.fillRect(bx, by - 45, 120, 40);
          ctx.fillStyle = "#000";
          ctx.font = "bold 12px Arial";
          ctx.textAlign = "center";
          ctx.fillText("CET", bx + 60, by - 22);
        }
        // Sirene piscante (por cima da imagem)
        const s1 = fc % 24 < 12;
        ctx.fillStyle = s1 ? "rgba(255,0,0,0.35)" : "rgba(255,165,0,0.35)";
        ctx.beginPath(); ctx.arc(bx + 80, by - 60, 12, 0, Math.PI * 2); ctx.fill();
      }

      ctx.restore();

      // === Barra de tempo (10s countdown) ===
      if (obs.bossHP && obs.bossHP > 0) {
        const g2 = gameRef.current;
        const timePercent = Math.max(0, g2.bossTimer / 600);
        const secondsLeft = Math.ceil(g2.bossTimer / 60);
        const barW = 100;
        const barX = bx + 10;
        const barY = by - 80;
        // Fundo
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.beginPath();
        ctx.roundRect(barX - 5, barY - 18, barW + 10, 28, 6);
        ctx.fill();
        // Label
        ctx.fillStyle = "#FFF";
        ctx.font = "bold 9px Arial";
        ctx.textAlign = "center";
        if (g2.phaseState === "boss_derrota") {
          const derrotaMsgs: Record<string, string> = { guincho: "PNEU FURADO!", guarda: "FOI EMBORA!", cegonha: "CET PRENDEU!", bruto: "CARGA CAIU!" };
          const derrotaMsg = derrotaMsgs[g2.bossType] || "DERROTADO!";
          ctx.fillText(derrotaMsg, barX + barW / 2, barY - 6);
        } else if (g2.bossType === "guarda") {
          ctx.fillText(`MULTAS: ${g2.guardaMultas}/3  |  ${secondsLeft}s`, barX + barW / 2, barY - 6);
        } else if (g2.bossType === "cegonha") {
          ctx.fillText(`CARROS: ${g2.cegonhaCarrosPulados}/${4}  |  PULE!`, barX + barW / 2, barY - 6);
        } else if (g2.bossType === "bruto") {
          ctx.fillText(`CONTAINERS: ${g2.cegonhaCarrosJogados}/6  |  PULE!`, barX + barW / 2, barY - 6);
        } else if (g2.bossType === "coletor") {
          ctx.fillText(`SACOS: ${g2.cegonhaCarrosJogados}/10  |  DESVIE!`, barX + barW / 2, barY - 6);
        } else {
          ctx.fillText(`DESVIE! ${secondsLeft}s`, barX + barW / 2, barY - 6);
        }
        // Barra (diminui com o tempo - verde pra vermelho)
        ctx.fillStyle = "#333";
        ctx.beginPath(); ctx.roundRect(barX, barY, barW, 8, 3); ctx.fill();
        const barColor = timePercent > 0.5 ? "#00CC00" : timePercent > 0.25 ? "#CCCC00" : "#CC0000";
        ctx.fillStyle = barColor;
        ctx.beginPath(); ctx.roundRect(barX, barY, barW * timePercent, 8, 3); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(barX, barY, barW, 8, 3); ctx.stroke();
      }

      // === Instrucao quando boss chega ===
      if (obs.x < (ctx.canvas.width * 0.6) && gameRef.current.phaseState === "boss") {
        const blink = fc % 30 < 20;
        if (blink) {
          ctx.fillStyle = "rgba(255,50,50,0.9)";
          ctx.beginPath();
          ctx.roundRect(bx + 20, by - 105, 80, 22, 6);
          ctx.fill();
          ctx.fillStyle = "#FFF";
          ctx.font = "bold 12px Arial";
          ctx.textAlign = "center";
          ctx.fillText("DESVIE!", bx + 60, by - 89);
        }
      }
    }
    else if (obs.type === "radar") {
      // Radar / Lombada eletronica - mais visivel
      const rx = obs.x + obs.width / 2;
      // Poste grosso
      ctx.fillStyle = "#888";
      ctx.fillRect(rx - 3, groundY - 70, 6, 70);
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 1;
      ctx.strokeRect(rx - 3, groundY - 70, 6, 70);
      // Caixa do radar maior
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.roundRect(rx - 12, groundY - 78, 24, 16, 3);
      ctx.fill();
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Lente da camera
      const g = gameRef.current;
      const flashing = obs.flashTimer && obs.flashTimer > 0;
      ctx.fillStyle = flashing ? "#FF0000" : "#CC0000";
      ctx.beginPath();
      ctx.arc(rx, groundY - 70, 5, 0, Math.PI * 2);
      ctx.fill();
      // Flash grande
      if (flashing) {
        ctx.fillStyle = "rgba(255,0,0,0.4)";
        ctx.beginPath();
        ctx.arc(rx, groundY - 70, 18, 0, Math.PI * 2);
        ctx.fill();
      }
      // Placa "REDUZA" maior e mais visivel
      ctx.fillStyle = "#FFF";
      ctx.beginPath();
      ctx.roundRect(rx - 18, groundY - 98, 36, 18, 3);
      ctx.fill();
      ctx.strokeStyle = "#CC0000";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(rx - 18, groundY - 98, 36, 18, 3);
      ctx.stroke();
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
    const g = gameRef.current;
    const isRed = tl.state === "red";

    // Poste
    ctx.fillStyle = "#555";
    ctx.fillRect(tx + 10, groundY - 90, 6, 90);
    // Braco horizontal
    ctx.fillRect(tx - 5, groundY - 90, 36, 5);

    // Caixa do semaforo (maior)
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.roundRect(tx - 4, groundY - 130, 34, 70, 6);
    ctx.fill();
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(tx - 4, groundY - 130, 34, 70, 6);
    ctx.stroke();

    // Luz vermelha
    ctx.fillStyle = isRed ? "#FF0000" : "#330000";
    ctx.beginPath();
    ctx.arc(tx + 13, groundY - 115, 9, 0, Math.PI * 2);
    ctx.fill();
    if (isRed) {
      // Halo vermelho pulsante
      const pulse = 0.15 + Math.sin(g.frameCount * 0.15) * 0.1;
      ctx.fillStyle = `rgba(255,0,0,${pulse})`;
      ctx.beginPath();
      ctx.arc(tx + 13, groundY - 115, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // Luz amarela (sempre apagada)
    ctx.fillStyle = "#332200";
    ctx.beginPath();
    ctx.arc(tx + 13, groundY - 95, 9, 0, Math.PI * 2);
    ctx.fill();

    // Luz verde
    ctx.fillStyle = !isRed ? "#00FF00" : "#003300";
    ctx.beginPath();
    ctx.arc(tx + 13, groundY - 75, 9, 0, Math.PI * 2);
    ctx.fill();
    if (!isRed) {
      ctx.fillStyle = "rgba(0,255,0,0.15)";
      ctx.beginPath();
      ctx.arc(tx + 13, groundY - 75, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    // === TEXTO INSTRUCAO (grande e claro) ===
    if (!tl.passed) {
      if (isRed) {
        // Fundo do aviso
        const blink = Math.sin(g.frameCount * 0.2) > 0;
        if (blink) {
          ctx.fillStyle = "rgba(255,0,0,0.85)";
          ctx.beginPath();
          ctx.roundRect(tx - 18, groundY - 160, 62, 24, 6);
          ctx.fill();
          ctx.fillStyle = "#FFF";
          ctx.font = "bold 14px Arial";
          ctx.textAlign = "center";
          ctx.fillText("PULE!", tx + 13, groundY - 143);
        }
      } else {
        ctx.fillStyle = "rgba(0,180,0,0.85)";
        ctx.beginPath();
        ctx.roundRect(tx - 18, groundY - 155, 62, 22, 6);
        ctx.fill();
        ctx.fillStyle = "#FFF";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.fillText("+20 PTS", tx + 13, groundY - 139);
      }
    }

    // Faixa de parada no chao (vermelho) ou faixa livre (verde)
    if (isRed) {
      ctx.fillStyle = "rgba(255,0,0,0.4)";
      ctx.fillRect(tx - 15, groundY - 3, 56, 6);
    } else {
      ctx.fillStyle = "rgba(0,255,0,0.3)";
      ctx.fillRect(tx - 15, groundY - 3, 56, 6);
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
      restActive: false, restTimer: 0, nextRestFrame: 2400,
      phase: 1, phaseState: "desafio", phaseTimer: 0,
      deliveries: 0, bossActive: false, bossDefeated: false,
      bossTimer: 0, bossSpawnTimer: 0, bossDerrotaTimer: 0,
      bossType: "guincho", guardaMultas: 0, dollarNotes: [],
      cegonhaCarrosPulados: 0, cegonhaCarrosJogados: 0,
      eventoClimatico: "normal", eventoTimer: 0, granizoDrops: [],
      invencivel: false, invencivelTimer: 0, boosted: false, boostTimer: 0,
      temSobrevida: false, sobreviveuHit: false,
      pombos: [], nextPomboSpawn: 300,
      raining: false, raindrops: [],
    });
    setDisplayPhase(1);
    setDisplayDeliveries(0);
    g.clouds = Array.from({ length: 5 }, () => ({
      x: Math.random() * 800, y: 20 + Math.random() * 80,
      w: 40 + Math.random() * 60, speed: 0.3 + Math.random() * 0.5,
    }));
    g.landmarks = [
      { x: 600, type: "pontilhao", width: 160, height: 120 },
      { x: 1200, type: "calcadao_osasco", width: 90, height: 85 },
      { x: 2000, type: "fabrica", width: 130, height: 100 },
      { x: 2800, type: "ponte_metalica", width: 120, height: 80 },
      { x: 3600, type: "catedral_se", width: 80, height: 155 },
      { x: 4400, type: "copan", width: 50, height: 150 },
      { x: 5200, type: "mercadao", width: 90, height: 95 },
      { x: 6000, type: "masp", width: 70, height: 85 },
      { x: 6800, type: "ibirapuera", width: 60, height: 165 },
      { x: 7800, type: "ponte_estaiada", width: 180, height: 160 },
      { x: 8800, type: "neo_quimica", width: 200, height: 140 },
      { x: 9800, type: "allianz_park", width: 180, height: 130 },
      { x: 10800, type: "morumbi", width: 180, height: 130 },
      { x: 11800, type: "portuguesa", width: 160, height: 110 },
      { x: 12800, type: "vila_belmiro", width: 160, height: 110 },
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

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function loop() {
      if (!canvas || !ctx) return;
      const g = gameRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const baseGroundY = H * GROUND_HEIGHT;

      // Terreno escala progressivamente
      // Terreno progride por fase: 1=reto, 2=leve, 3=médio, 4+=intenso
      if (g.phase === 1) g.terrainScale = Math.min(0.1, g.distance / 1000);
      else if (g.phase === 2) g.terrainScale = Math.min(0.35, 0.1 + g.phaseTimer / 3000);
      else if (g.phase === 3) g.terrainScale = Math.min(0.65, 0.35 + g.phaseTimer / 3000);
      else g.terrainScale = Math.min(1, 0.65 + (g.phase - 3) * 0.12);

      // Calcula altura do terreno na posicao do caminhao
      const truckTerrainOffset = getTerrainY(60 + g.groundOffset) * g.terrainScale;
      const truckGroundY = baseGroundY - truckTerrainOffset;

      // Slope angle para inclinar o caminhao
      const slopeDelta = getTerrainY(64 + g.groundOffset) - getTerrainY(56 + g.groundOffset);
      const slopeAngle = Math.atan2(-slopeDelta * g.terrainScale, 8);

      // nightMode controlado pelo sistema de fases (fase 3+)

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

      // === CENARIOS POR FASE ===
      // 1=Osasco, 2=Marginal Tietê, 3=Bairro, 4=Santos, 5=Aeroporto/Paulista, 6=Zona Leste, 7+=repete
      const cenarioFase = ((g.phase - 1) % 7) + 1;

      // CENARIO 1: OSASCO
      const isBossAtivo = g.phaseState === "boss" || g.phaseState === "boss_derrota";
      if (cenarioFase === 1 && !isBossAtivo) {
        // Cenario normal de Osasco (fora do boss)
        // Predios do centro de Osasco
        for (let oi = 0; oi < 5; oi++) {
          const ox = ((oi * 200 - g.groundOffset * 0.07 + 80) % (W + 400)) - 80;
          if (ox > -70 && ox < W + 50) {
            const oh = 50 + oi * 12;
            ctx.fillStyle = ["#C0B090", "#B0A080", "#D0C0A0", "#A09878", "#BBAA88"][oi];
            ctx.fillRect(ox, baseGroundY - oh, 45, oh);
            // Janelas
            ctx.fillStyle = "#87CEEB44";
            for (let jy = 0; jy < oh - 15; jy += 14) {
              ctx.fillRect(ox + 5, baseGroundY - oh + 5 + jy, 8, 8);
              ctx.fillRect(ox + 18, baseGroundY - oh + 5 + jy, 8, 8);
              ctx.fillRect(ox + 31, baseGroundY - oh + 5 + jy, 8, 8);
            }
          }
        }
        // Calcadao de Osasco
        ctx.fillStyle = "#E8DDD0";
        ctx.fillRect(0, baseGroundY - 4, W, 4);
        // Toldos de lojas
        for (let ti = 0; ti < 4; ti++) {
          const tx = ((ti * 250 - g.groundOffset * 0.09 + 120) % (W + 400)) - 80;
          if (tx > -40 && tx < W + 40) {
            ctx.fillStyle = ["#CC3333", "#3366CC", "#33AA33", "#CC9900"][ti];
            ctx.beginPath();
            ctx.moveTo(tx, baseGroundY - 25);
            ctx.lineTo(tx + 35, baseGroundY - 25);
            ctx.lineTo(tx + 38, baseGroundY - 18);
            ctx.lineTo(tx - 3, baseGroundY - 18);
            ctx.closePath();
            ctx.fill();
          }
        }
        // Estacao de trem (CPTM)
        const estX = ((500 - g.groundOffset * 0.05) % (W + 600)) - 100;
        if (estX > -80 && estX < W + 50) {
          ctx.fillStyle = "#555";
          ctx.fillRect(estX, baseGroundY - 40, 70, 40);
          ctx.fillStyle = "#0044AA";
          ctx.fillRect(estX, baseGroundY - 45, 70, 8);
          ctx.fillStyle = "#FFF";
          ctx.font = "bold 6px Arial";
          ctx.textAlign = "center";
          ctx.fillText("CPTM OSASCO", estX + 35, baseGroundY - 39);
        }
      }
      if (cenarioFase === 1 && isBossAtivo) {
        // Rio embaixo da ponte
        ctx.fillStyle = "#2A5F8A";
        ctx.fillRect(0, baseGroundY + 15, W, H - baseGroundY);
        // Ondas do rio
        ctx.strokeStyle = "#3A7FAA";
        ctx.lineWidth = 1;
        for (let wl = 0; wl < 3; wl++) {
          ctx.beginPath();
          for (let wx = 0; wx < W; wx += 3) {
            const wy = baseGroundY + 25 + wl * 12 + Math.sin((wx + g.frameCount * 1.2 + wl * 50) * 0.04) * 3;
            if (wx === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
          }
          ctx.stroke();
        }
        // Reflexo da luz na agua
        ctx.fillStyle = "rgba(100,180,230,0.15)";
        for (let ri = 0; ri < 5; ri++) {
          const rx = ((ri * 180 + g.frameCount * 0.3) % W);
          ctx.fillRect(rx, baseGroundY + 20, 30, 3);
        }

        // Estrutura da ponte (treliça metalica - estilo Ponte Metalica de Osasco)
        const ponteH = 80;
        // Vigas horizontais superiores
        ctx.strokeStyle = "#8B4513";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, baseGroundY - ponteH);
        ctx.lineTo(W, baseGroundY - ponteH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, baseGroundY - ponteH + 25);
        ctx.lineTo(W, baseGroundY - ponteH + 25);
        ctx.stroke();
        // Diagonais da trelica
        ctx.strokeStyle = "#A0522D";
        ctx.lineWidth = 3;
        for (let di = 0; di < W + 30; di += 30) {
          const dx = (di - (g.groundOffset * 0.3) % 30);
          ctx.beginPath();
          ctx.moveTo(dx, baseGroundY - ponteH);
          ctx.lineTo(dx + 30, baseGroundY - ponteH + 25);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(dx + 30, baseGroundY - ponteH);
          ctx.lineTo(dx, baseGroundY - ponteH + 25);
          ctx.stroke();
        }
        // Pilares verticais
        ctx.strokeStyle = "#6B3410";
        ctx.lineWidth = 5;
        for (let pi = 0; pi < W + 50; pi += 120) {
          const px = (pi - (g.groundOffset * 0.3) % 120);
          ctx.beginPath();
          ctx.moveTo(px, baseGroundY - ponteH);
          ctx.lineTo(px, baseGroundY);
          ctx.stroke();
        }
        // Grade lateral (protecao)
        ctx.strokeStyle = "#8B6914";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, baseGroundY - 5);
        ctx.lineTo(W, baseGroundY - 5);
        ctx.stroke();
        for (let gi = 0; gi < W; gi += 15) {
          const gx = (gi - (g.groundOffset * 0.5) % 15);
          ctx.beginPath();
          ctx.moveTo(gx, baseGroundY - 5);
          ctx.lineTo(gx, baseGroundY - 18);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(0, baseGroundY - 18);
        ctx.lineTo(W, baseGroundY - 18);
        ctx.stroke();

        // Placa "PONTE METALICA - OSASCO"
        ctx.fillStyle = "rgba(0,80,0,0.8)";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 65, baseGroundY - ponteH - 20, 130, 18, 3);
        ctx.fill();
        ctx.fillStyle = "#FFF";
        ctx.font = "bold 8px Arial";
        ctx.textAlign = "center";
        ctx.fillText("PONTE METALICA - OSASCO", W / 2, baseGroundY - ponteH - 8);
      }

      // CENARIO 2: MARGINAL TIETE
      if (cenarioFase === 2) {
        // Rio Tiete poluido no fundo
        ctx.fillStyle = "#5C6B3C";
        ctx.fillRect(0, baseGroundY - 50, W, 20);
        // Agua suja
        ctx.fillStyle = "#4A5A2A";
        ctx.fillRect(0, baseGroundY - 45, W, 12);
        // Ondas do rio
        ctx.strokeStyle = "#3A4A1A";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let rx = 0; rx < W; rx += 3) {
          const ry = baseGroundY - 42 + Math.sin((rx + g.frameCount) * 0.05) * 2;
          if (rx === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
        }
        ctx.stroke();
        // Viadutos
        for (let vi = 0; vi < 2; vi++) {
          const vx = ((vi * 400 - g.groundOffset * 0.08 + 200) % (W + 500)) - 100;
          if (vx > -150 && vx < W + 50) {
            ctx.fillStyle = "#666";
            ctx.fillRect(vx, baseGroundY - 100, 8, 70);
            ctx.fillRect(vx + 120, baseGroundY - 100, 8, 70);
            ctx.fillStyle = "#777";
            ctx.fillRect(vx - 10, baseGroundY - 108, 150, 12);
            // Carros no viaduto
            ctx.fillStyle = "#CCC";
            ctx.fillRect(vx + 20, baseGroundY - 115, 15, 8);
            ctx.fillStyle = "#999";
            ctx.fillRect(vx + 60, baseGroundY - 115, 15, 8);
          }
        }
        // Predios industriais
        for (let pi = 0; pi < 3; pi++) {
          const px = ((pi * 300 - g.groundOffset * 0.06 + 100) % (W + 400)) - 80;
          if (px > -80 && px < W + 50) {
            ctx.fillStyle = "#555";
            ctx.fillRect(px, baseGroundY - 70 - pi * 10, 50, 70 + pi * 10);
            // Chamine
            ctx.fillStyle = "#444";
            ctx.fillRect(px + 35, baseGroundY - 95 - pi * 10, 8, 25);
            // Fumaca
            ctx.fillStyle = "rgba(100,100,100,0.3)";
            ctx.beginPath();
            ctx.arc(px + 39, baseGroundY - 100 - pi * 10, 6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // CENARIO 4: SANTOS (porto, praia, mar)
      const isSantos = cenarioFase === 4;
      if (isSantos) {
        // Ceu mais azul/tropical
        const gradSantos = ctx.createLinearGradient(0, 0, 0, baseGroundY);
        gradSantos.addColorStop(0, "#4FC3F7");
        gradSantos.addColorStop(0.6, "#81D4FA");
        gradSantos.addColorStop(1, "#E1F5FE");
        ctx.fillStyle = gradSantos;
        ctx.fillRect(0, 0, W, baseGroundY);

        // Mar ao fundo
        ctx.fillStyle = "#1565C0";
        ctx.fillRect(0, baseGroundY - 60, W, 30);
        // Ondas
        ctx.strokeStyle = "#1E88E5";
        ctx.lineWidth = 1;
        for (let wx = 0; wx < W; wx += 3) {
          const wy = baseGroundY - 50 + Math.sin((wx + g.frameCount * 1.5) * 0.04) * 3;
          if (wx === 0) { ctx.beginPath(); ctx.moveTo(wx, wy); } else ctx.lineTo(wx, wy);
        }
        ctx.stroke();

        // Praia (areia)
        ctx.fillStyle = "#F5DEB3";
        ctx.fillRect(0, baseGroundY - 35, W, 10);

        // Guindastes do porto (fundo)
        for (let gi = 0; gi < 3; gi++) {
          const gx = ((gi * 250 - g.groundOffset * 0.08 + 100) % (W + 200)) - 50;
          if (gx > -80 && gx < W + 80) {
            // Poste vertical
            ctx.fillStyle = "#E65100";
            ctx.fillRect(gx, baseGroundY - 120, 6, 95);
            // Braco horizontal
            ctx.fillStyle = "#FF6F00";
            ctx.fillRect(gx - 30, baseGroundY - 125, 70, 6);
            // Cabo
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(gx + 30, baseGroundY - 125);
            ctx.lineTo(gx + 30, baseGroundY - 90);
            ctx.stroke();
            // Container pendurado
            ctx.fillStyle = ["#CC0000", "#0044AA", "#228822"][gi % 3];
            ctx.fillRect(gx + 22, baseGroundY - 95, 16, 10);
          }
        }

        // Navios cargueiros ao fundo
        const shipX = ((200 - g.groundOffset * 0.03) % (W + 300)) - 100;
        if (shipX > -150 && shipX < W + 50) {
          ctx.fillStyle = "#333";
          ctx.fillRect(shipX, baseGroundY - 55, 100, 20);
          ctx.fillStyle = "#B71C1C";
          ctx.beginPath();
          ctx.moveTo(shipX + 100, baseGroundY - 55);
          ctx.lineTo(shipX + 120, baseGroundY - 45);
          ctx.lineTo(shipX + 100, baseGroundY - 35);
          ctx.closePath();
          ctx.fill();
          // Containers no navio
          ctx.fillStyle = "#FF6F00";
          ctx.fillRect(shipX + 10, baseGroundY - 65, 30, 12);
          ctx.fillStyle = "#1565C0";
          ctx.fillRect(shipX + 45, baseGroundY - 65, 30, 12);
        }
      }

      // CENARIO 3: BAIRRO SP
      const isBairro = cenarioFase === 3;
      if (isBairro) {
        // Casas residenciais no fundo
        for (let ci = 0; ci < 6; ci++) {
          const hx = ((ci * 180 - g.groundOffset * 0.1 + 50) % (W + 300)) - 100;
          if (hx > -120 && hx < W + 50) {
            const hh = 50 + (ci % 3) * 15; // alturas variadas
            const cores = ["#D4C4A0", "#C4B090", "#B8A888", "#CCBBAA", "#E0D0B8", "#BBA888"];
            // Parede da casa
            ctx.fillStyle = cores[ci % cores.length];
            ctx.fillRect(hx, baseGroundY - hh, 60, hh);
            // Telhado
            ctx.fillStyle = ci % 2 === 0 ? "#8B4513" : "#A0522D";
            ctx.beginPath();
            ctx.moveTo(hx - 5, baseGroundY - hh);
            ctx.lineTo(hx + 30, baseGroundY - hh - 18);
            ctx.lineTo(hx + 65, baseGroundY - hh);
            ctx.closePath();
            ctx.fill();
            // Porta
            ctx.fillStyle = "#6B3410";
            ctx.fillRect(hx + 22, baseGroundY - 30, 14, 30);
            // Janelas
            ctx.fillStyle = "#87CEEB88";
            ctx.fillRect(hx + 8, baseGroundY - hh + 12, 10, 10);
            ctx.fillRect(hx + 42, baseGroundY - hh + 12, 10, 10);
            // Grade na janela (muito SP!)
            ctx.strokeStyle = "#666";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(hx + 8, baseGroundY - hh + 12, 10, 10);
            ctx.beginPath(); ctx.moveTo(hx + 13, baseGroundY - hh + 12); ctx.lineTo(hx + 13, baseGroundY - hh + 22); ctx.stroke();
            // Numero da casa
            ctx.fillStyle = "#333";
            ctx.font = "bold 5px Arial";
            ctx.textAlign = "center";
            ctx.fillText(`${100 + ci * 37}`, hx + 29, baseGroundY - 32);
          }
        }
        // Postes de luz
        for (let pi = 0; pi < 4; pi++) {
          const px = ((pi * 250 - g.groundOffset * 0.1 + 130) % (W + 350)) - 80;
          if (px > -30 && px < W + 30) {
            // Poste
            ctx.fillStyle = "#555";
            ctx.fillRect(px, baseGroundY - 90, 3, 90);
            // Luminaria
            ctx.fillStyle = "#777";
            ctx.fillRect(px - 8, baseGroundY - 93, 18, 4);
            // Luz (brilha a noite)
            if (g.nightMode) {
              ctx.fillStyle = "rgba(255,220,100,0.5)";
              ctx.beginPath();
              ctx.arc(px + 1, baseGroundY - 88, 15, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = g.nightMode ? "#FFD700" : "#DDD";
            ctx.beginPath();
            ctx.arc(px + 1, baseGroundY - 90, 3, 0, Math.PI * 2);
            ctx.fill();
            // Fios
            ctx.strokeStyle = "#444";
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(px - 8, baseGroundY - 85);
            ctx.quadraticCurveTo(px + 80, baseGroundY - 78, px + 250, baseGroundY - 85);
            ctx.stroke();
          }
        }
        // Calcada com muro pixado
        ctx.fillStyle = "#CCC";
        ctx.fillRect(0, baseGroundY - 5, W, 5);
      }

      // CENARIO 5: AEROPORTO GUARULHOS + AV. PAULISTA
      if (cenarioFase === 5) {
        // Pista do aeroporto ao fundo
        ctx.fillStyle = "#555";
        ctx.fillRect(0, baseGroundY - 35, W, 8);
        // Faixas da pista
        ctx.fillStyle = "#FFF";
        for (let fx = 0; fx < W; fx += 60) {
          ctx.fillRect(fx + ((g.groundOffset * 0.03) % 60), baseGroundY - 32, 30, 2);
        }
        // Aviao decolando
        const avX = ((300 - g.groundOffset * 0.04) % (W + 400)) - 100;
        if (avX > -80 && avX < W + 50) {
          const avY = baseGroundY - 80 - Math.max(0, (W / 2 - avX) * 0.15);
          // Fuselagem
          ctx.fillStyle = "#EEE";
          ctx.beginPath();
          ctx.ellipse(avX + 30, avY, 30, 8, -0.1, 0, Math.PI * 2);
          ctx.fill();
          // Asas
          ctx.fillStyle = "#DDD";
          ctx.beginPath();
          ctx.moveTo(avX + 15, avY);
          ctx.lineTo(avX - 10, avY + 15);
          ctx.lineTo(avX + 5, avY);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(avX + 15, avY);
          ctx.lineTo(avX - 10, avY - 15);
          ctx.lineTo(avX + 5, avY);
          ctx.closePath();
          ctx.fill();
          // Cauda
          ctx.fillStyle = "#0044AA";
          ctx.beginPath();
          ctx.moveTo(avX + 55, avY);
          ctx.lineTo(avX + 60, avY - 12);
          ctx.lineTo(avX + 50, avY);
          ctx.closePath();
          ctx.fill();
        }
        // Torre de controle
        const twX = ((500 - g.groundOffset * 0.05) % (W + 600)) - 100;
        if (twX > -40 && twX < W + 40) {
          ctx.fillStyle = "#888";
          ctx.fillRect(twX, baseGroundY - 100, 6, 70);
          ctx.fillStyle = "#AAA";
          ctx.fillRect(twX - 12, baseGroundY - 110, 30, 15);
          ctx.fillStyle = "#87CEEB88";
          ctx.fillRect(twX - 10, baseGroundY - 108, 26, 10);
        }
        // Predios da Paulista ao fundo
        for (let bi = 0; bi < 5; bi++) {
          const bpx = ((bi * 200 - g.groundOffset * 0.07 + 80) % (W + 400)) - 80;
          if (bpx > -60 && bpx < W + 50) {
            const bh = 80 + bi * 15;
            ctx.fillStyle = ["#668", "#778", "#889", "#779", "#888"][bi];
            ctx.fillRect(bpx, baseGroundY - bh, 40, bh);
            // Janelas
            ctx.fillStyle = "#87CEEB44";
            for (let jy = 0; jy < bh - 10; jy += 12) {
              for (let jx = 0; jx < 30; jx += 10) {
                ctx.fillRect(bpx + 5 + jx, baseGroundY - bh + 5 + jy, 6, 8);
              }
            }
          }
        }
      }

      // CENARIO 6: ZONA LESTE
      if (cenarioFase === 6) {
        // Conjuntos habitacionais (predios baixos iguais)
        for (let ci = 0; ci < 5; ci++) {
          const cx = ((ci * 160 - g.groundOffset * 0.09 + 60) % (W + 350)) - 80;
          if (cx > -80 && cx < W + 50) {
            ctx.fillStyle = "#B8A080";
            ctx.fillRect(cx, baseGroundY - 55, 50, 55);
            ctx.fillStyle = "#A09070";
            ctx.fillRect(cx, baseGroundY - 55, 50, 5);
            // Janelas em grade
            for (let jy = 0; jy < 3; jy++) {
              for (let jx = 0; jx < 3; jx++) {
                ctx.fillStyle = "#87CEEB55";
                ctx.fillRect(cx + 5 + jx * 15, baseGroundY - 48 + jy * 16, 10, 10);
              }
            }
          }
        }
        // Grafite nos muros
        const grafX = ((400 - g.groundOffset * 0.1) % (W + 500)) - 100;
        if (grafX > -80 && grafX < W + 50) {
          // Muro
          ctx.fillStyle = "#999";
          ctx.fillRect(grafX, baseGroundY - 30, 80, 30);
          // Grafite colorido
          ctx.fillStyle = "#FF4444";
          ctx.font = "bold 10px Arial";
          ctx.textAlign = "center";
          ctx.fillText("SP", grafX + 20, baseGroundY - 12);
          ctx.fillStyle = "#44FF44";
          ctx.fillText("ZL", grafX + 45, baseGroundY - 15);
          ctx.fillStyle = "#FFFF00";
          ctx.font = "8px Arial";
          ctx.fillText("ARTE", grafX + 65, baseGroundY - 10);
        }
        // Quadra esportiva
        const qdX = ((700 - g.groundOffset * 0.08) % (W + 600)) - 100;
        if (qdX > -60 && qdX < W + 50) {
          ctx.fillStyle = "#2E7D32";
          ctx.fillRect(qdX, baseGroundY - 15, 50, 15);
          ctx.strokeStyle = "#FFF";
          ctx.lineWidth = 1;
          ctx.strokeRect(qdX + 2, baseGroundY - 13, 46, 11);
          ctx.beginPath();
          ctx.arc(qdX + 25, baseGroundY - 7, 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // CENARIO 7: SERRA DO MAR (estrada com vegetacao densa)
      if (cenarioFase === 7) {
        // Vegetacao densa
        ctx.fillStyle = "#1B5E20";
        ctx.beginPath();
        ctx.moveTo(0, baseGroundY);
        for (let vx = 0; vx <= W; vx += 8) {
          const wx = vx + g.groundOffset * 0.06;
          const vh = Math.sin(wx * 0.008) * 25 + Math.cos(wx * 0.015) * 15 + 50;
          ctx.lineTo(vx, baseGroundY - vh);
        }
        ctx.lineTo(W, baseGroundY);
        ctx.closePath();
        ctx.fill();
        // Arvores
        ctx.fillStyle = "#2E7D32";
        ctx.beginPath();
        ctx.moveTo(0, baseGroundY);
        for (let vx = 0; vx <= W; vx += 6) {
          const wx = vx + g.groundOffset * 0.09;
          const vh = Math.sin(wx * 0.012) * 20 + Math.cos(wx * 0.02) * 10 + 35;
          ctx.lineTo(vx, baseGroundY - vh);
        }
        ctx.lineTo(W, baseGroundY);
        ctx.closePath();
        ctx.fill();
        // Neblina leve
        ctx.fillStyle = "rgba(200,220,200,0.15)";
        ctx.fillRect(0, baseGroundY - 80, W, 60);
      }

      // === MONTANHAS DE FUNDO ===
      if (isSantos || isBairro || cenarioFase === 2 || cenarioFase === 5 || cenarioFase === 6) {
        drawMountains(ctx, W, baseGroundY, g.groundOffset, false);
      } else {
        drawMountains(ctx, W, baseGroundY, g.groundOffset, g.nightMode);
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

      // === PLACAS SINALIZADORAS DE SP ===
      const placas = [
        // Fase 1 - Osasco / Zona Oeste
        { pos: 300, texto: "OSASCO", subtexto: "Centro", cor: "#006633" },
        { pos: 800, texto: "AV. DOS AUTONOMISTAS", subtexto: "Osasco", cor: "#006633" },
        { pos: 1500, texto: "PRES. ALTINO", subtexto: "1 km", cor: "#006633" },
        { pos: 2200, texto: "RODOVIA CASTELO BRANCO", subtexto: "SP-280", cor: "#0044AA" },
        { pos: 3000, texto: "ALPHAVILLE", subtexto: "Barueri", cor: "#006633" },
        { pos: 3800, texto: "VELOCIDADE", subtexto: "MAX 60 km/h", cor: "#CC0000" },
        // Fase 2 - Zona Oeste / Centro
        { pos: 4500, texto: "LAPA", subtexto: "Zona Oeste", cor: "#006633" },
        { pos: 5200, texto: "MARGINAL TIETE", subtexto: "SP-015", cor: "#0044AA" },
        { pos: 6000, texto: "PONTE DO PIQUERI", subtexto: "", cor: "#006633" },
        { pos: 6800, texto: "AV. PAULISTA", subtexto: "Centro", cor: "#006633" },
        { pos: 7500, texto: "AEROPORTO CONGONHAS", subtexto: "CGH  ✈️  3 km", cor: "#553300" },
        { pos: 8200, texto: "PINHEIROS", subtexto: "Zona Oeste", cor: "#006633" },
        // Fase 3 - Centro / Zona Sul
        { pos: 9000, texto: "SE / CENTRO", subtexto: "Catedral da Se", cor: "#006633" },
        { pos: 9800, texto: "MERCADAO MUNICIPAL", subtexto: "", cor: "#553300" },
        { pos: 10500, texto: "LIBERDADE", subtexto: "Bairro Japones", cor: "#006633" },
        { pos: 11200, texto: "INTERLAGOS", subtexto: "Autodromo", cor: "#006633" },
        { pos: 12000, texto: "MARGINAL PINHEIROS", subtexto: "SP-015", cor: "#0044AA" },
        { pos: 12800, texto: "VELOCIDADE", subtexto: "MAX 90 km/h", cor: "#CC0000" },
        // Fase 4 - Zona Leste / Norte
        { pos: 13500, texto: "TATUAPE", subtexto: "Zona Leste", cor: "#006633" },
        { pos: 14200, texto: "ITAQUERA", subtexto: "Neo Quimica Arena", cor: "#006633" },
        { pos: 15000, texto: "AEROPORTO GUARULHOS", subtexto: "GRU  ✈️  12 km", cor: "#553300" },
        { pos: 15800, texto: "ROD. PRES. DUTRA", subtexto: "BR-116", cor: "#0044AA" },
        { pos: 16500, texto: "GUARULHOS", subtexto: "Centro", cor: "#006633" },
        { pos: 17200, texto: "TUCURUVI", subtexto: "Zona Norte", cor: "#006633" },
        // Fase 5+ - ABC / Litoral
        { pos: 18000, texto: "SANTO ANDRE", subtexto: "ABC Paulista", cor: "#006633" },
        { pos: 18800, texto: "SAO BERNARDO", subtexto: "ABC Paulista", cor: "#006633" },
        { pos: 19500, texto: "ROD. ANCHIETA", subtexto: "SP-150  Santos", cor: "#0044AA" },
        { pos: 20200, texto: "CUBATAO", subtexto: "Serra do Mar", cor: "#006633" },
        { pos: 21000, texto: "PORTO DE SANTOS", subtexto: "Maior Porto da AL", cor: "#553300" },
        { pos: 21800, texto: "SANTOS", subtexto: "Praia", cor: "#006633" },
        { pos: 22500, texto: "SAO VICENTE", subtexto: "Litoral Sul", cor: "#006633" },
        { pos: 23200, texto: "PRAIA GRANDE", subtexto: "Litoral", cor: "#006633" },
        { pos: 24000, texto: "CAMPINAS", subtexto: "Interior  95 km", cor: "#0044AA" },
        { pos: 24800, texto: "SOROCABA", subtexto: "SP-270  100 km", cor: "#0044AA" },
        { pos: 25500, texto: "RIBEIRAO PRETO", subtexto: "SP-322  320 km", cor: "#0044AA" },
        { pos: 26200, texto: "PARQUE IBIRAPUERA", subtexto: "", cor: "#553300" },
        { pos: 27000, texto: "PONTE ESTAIADA", subtexto: "Octavio Frias", cor: "#553300" },
        { pos: 27800, texto: "BECO DO BATMAN", subtexto: "Vila Madalena", cor: "#553300" },
      ];
      // Placas ficam no FUNDO (parallax lento, acima da pista, semi-transparentes)
      const placaTotal = 28000;
      ctx.globalAlpha = 0.6; // semi-transparente pra nao confundir com obstaculos
      placas.forEach((placa) => {
        const px = ((placa.pos - g.groundOffset * 0.12) % placaTotal + placaTotal) % placaTotal - 200;
        if (px > -100 && px < W + 50) {
          // Posicao BEM ACIMA da pista (na linha dos landmarks)
          const py = baseGroundY - 5;
          // Poste fino (fundo)
          ctx.fillStyle = "#888";
          ctx.fillRect(px + 35, py - 70, 3, 70);
          // Placa pequena
          const tw = Math.max(placa.texto.length * 5.5, 55);
          const ph = placa.subtexto ? 22 : 16;
          ctx.fillStyle = placa.cor;
          ctx.beginPath();
          ctx.roundRect(px + 36 - tw / 2, py - 70 - ph, tw, ph, 2);
          ctx.fill();
          // Borda
          ctx.strokeStyle = "rgba(255,255,255,0.6)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(px + 36 - tw / 2 + 1, py - 70 - ph + 1, tw - 2, ph - 2, 1);
          ctx.stroke();
          // Texto
          ctx.fillStyle = "#FFF";
          ctx.font = "bold 6px Arial";
          ctx.textAlign = "center";
          if (placa.subtexto) {
            ctx.fillText(placa.texto, px + 36, py - 70 - ph + 9);
            ctx.font = "5px Arial";
            ctx.fillText(placa.subtexto, px + 36, py - 70 - ph + 17);
          } else {
            ctx.fillText(placa.texto, px + 36, py - 70 - ph / 2 + 3);
          }
        }
      });
      ctx.globalAlpha = 1; // restaura opacidade

      // === LANDMARKS NO FUNDO ===
      g.landmarks.forEach((lm) => {
        const lx = lm.x - g.groundOffset * 0.15;
        const totalWidth = 15000;
        const adjustedX = ((lx % totalWidth) + totalWidth) % totalWidth - 200;
        const drawLm = { ...lm, x: adjustedX };
        if (adjustedX > -250 && adjustedX < W + 250) {
          drawLandmark(ctx, drawLm, baseGroundY);
        }
      });

      // === ESTRADA COM TERRENO ===
      // Cor da pista muda por fase (fase 3+ fica mais escura/diferente)
      // Cor da pista: normal, escura, ou terra (fase 6+)
      const pistaColor = cenarioFase >= 6 ? "#7A5C3A" : g.phase >= 3 ? "#2a2a35" : "#333";
      // Superficie da estrada seguindo o terreno
      ctx.fillStyle = pistaColor;
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
      ctx.strokeStyle = cenarioFase >= 6 ? "#6A4C2A" : g.phase >= 3 ? "#4a4a55" : "#555";
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
        const isEntregaCutscene = g.phaseState === "entrega" || g.phaseState === "boss_derrota";
        if (!isEntregaCutscene) {
          g.speed += SPEED_INCREMENT;
          g.groundOffset += g.speed;
          g.distance += g.speed * 0.1;
        }
        g.comboTimer = Math.max(0, g.comboTimer - 1);
        if (g.comboTimer === 0) g.combo = 0;
        g.flashTimer = Math.max(0, g.flashTimer - 1);
        g.radarFlash = Math.max(0, g.radarFlash - 1);
        g.statusTimer = Math.max(0, g.statusTimer - 1);
        if (g.statusTimer === 0) g.statusText = "";

        // Invencibilidade (bilhete unico)
        if (g.invencivel) {
          g.invencivelTimer--;
          if (g.invencivelTimer <= 0) { g.invencivel = false; }
        }
        // Boost velocidade (guarana)
        if (g.boosted) {
          g.boostTimer--;
          if (g.boostTimer <= 0) { g.boosted = false; g.speed -= 1.5; }
        }

        // === EVENTOS CLIMATICOS SP ===
        // A cada 30s de jogo, chance de evento climatico (so a partir da fase 2)
        if (g.phase >= 2 && g.eventoClimatico === "normal" && g.phaseState === "desafio" && g.phaseTimer > 600 && Math.random() < 0.001) {
          const eventos: EventoClimatico[] = g.phase >= 4
            ? ["enchente", "nevoeiro", "granizo", "apagao"]
            : g.phase >= 3 ? ["enchente", "nevoeiro", "granizo"] : ["nevoeiro", "granizo"];
          g.eventoClimatico = eventos[Math.floor(Math.random() * eventos.length)];
          g.eventoTimer = 360; // ~6 segundos
          if (g.eventoClimatico === "granizo") {
            g.granizoDrops = Array.from({ length: 30 }, () => ({
              x: Math.random() * W, y: -Math.random() * 50, speed: 6 + Math.random() * 4,
            }));
          }
          const nomeEvento: Record<string, string> = { enchente: "ENCHENTE!", nevoeiro: "NEVOEIRO!", granizo: "GRANIZO!", apagao: "APAGAO!" };
          showStatus(`🌊 ${nomeEvento[g.eventoClimatico]}`, 60);
        }
        // Timer do evento
        if (g.eventoClimatico !== "normal") {
          g.eventoTimer--;
          if (g.eventoTimer <= 0) {
            g.eventoClimatico = "normal";
            g.granizoDrops = [];
          }
          // Granizo: atualiza posicao das pedras
          if (g.eventoClimatico === "granizo") {
            g.granizoDrops.forEach(d => {
              d.y += d.speed;
              d.x -= 1;
              if (d.y > H) { d.y = -10; d.x = Math.random() * W; }
            });
            // Granizo tira pontos se bater no jogador
            if (g.frameCount % 30 === 0 && !g.invencivel) {
              g.score = Math.max(0, g.score - 5);
              setDisplayScore(g.score);
            }
          }
        }

        // === POMBOS (fase 4+) ===
        if (g.phase >= 4 && g.phaseState === "desafio") {
          g.nextPomboSpawn--;
          if (g.nextPomboSpawn <= 0) {
            g.pombos.push({
              x: W + 20,
              y: truckGroundY - 60 - Math.random() * 40, // voam na altura do pulo
              wingPhase: Math.random() * Math.PI * 2,
              speed: g.speed * 0.7 + Math.random() * 1.5,
            });
            g.nextPomboSpawn = 200 + Math.random() * 250; // um a cada 3-7s
          }
        }
        // Move pombos
        g.pombos = g.pombos.filter(p => {
          p.x -= p.speed;
          p.wingPhase += 0.15;
          p.y += Math.sin(p.wingPhase * 0.5) * 0.3; // oscila suavemente
          return p.x > -40;
        });
        // Colisao: se pulando e bater no pombo = game over
        if (g.isJumping && !g.invencivel) {
          const tCX = 82, tCY = truckGroundY - TRUCK_SIZE / 2 + g.truckY;
          for (const pombo of g.pombos) {
            const dx = tCX - pombo.x, dy = tCY - pombo.y;
            if (Math.sqrt(dx * dx + dy * dy) < 25) {
              g.gameOver = true;
              g.running = false;
              playSound("game-over");
              bossMusicRef.current.stop();
              showStatus("ACERTOU O POMBO! 🐦", 60);
              spawnParticles(pombo.x, pombo.y, "#888888", 15);
              spawnParticles(pombo.x, pombo.y, "#FFFFFF", 10);
              if (Math.floor(g.distance) > g.highScore) {
                g.highScore = Math.floor(g.distance);
                localStorage.setItem("pegue_runner_highscore", g.highScore.toString());
                setDisplayHighScore(g.score);
              }
              setGameState("gameover");
              break;
            }
          }
        }

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

        // === SISTEMA DE FASES ===
        g.phaseTimer++;

        // Chuva a partir da fase 2
        if (g.phase >= 2 && !g.raining) {
          g.raining = true;
          g.raindrops = Array.from({ length: 80 }, () => ({
            x: Math.random() * W, y: Math.random() * H,
            speed: 8 + Math.random() * 6, len: 8 + Math.random() * 12,
          }));
        }
        // Atualiza gotas de chuva
        if (g.raining) {
          g.raindrops.forEach((d) => {
            d.y += d.speed;
            d.x -= 2;
            if (d.y > H) { d.y = -10; d.x = Math.random() * W; }
            if (d.x < 0) d.x = W;
          });
        }

        // Noite a partir da fase 3
        if (g.phase >= 3) g.nightMode = true;
        else if (g.phase < 3) g.nightMode = false;

        // Transicoes de fase
        const DESAFIO_FRAMES = 2400; // ~40s
        const RODOVIA_FRAMES = 420;  // ~7s
        const ENTREGA_FRAMES = 330;  // ~5.5s cutscene

        if (g.phaseState === "desafio" && g.phaseTimer >= DESAFIO_FRAMES) {
          g.phaseState = "rodovia";
          g.phaseTimer = 0;
          g.restActive = true;
          showStatus("🛣️ RODOVIA - RELAXA!", 80);
        }
        else if (g.phaseState === "rodovia" && g.phaseTimer >= RODOVIA_FRAMES) {
          g.phaseState = "boss";
          g.phaseTimer = 0;
          g.restActive = false;
          g.bossActive = true;
          g.bossDefeated = false;
          g.bossTimer = 600; // 10 segundos a 60fps
          g.bossSpawnTimer = 0;
          g.bossDerrotaTimer = 0;
          g.guardaMultas = 0;
          g.cegonhaCarrosPulados = 0;
          g.cegonhaCarrosJogados = 0;
          // Rotacao de 5 bosses
          const bossRotation: Array<"guincho" | "guarda" | "cegonha" | "bruto" | "coletor"> = ["guincho", "guarda", "cegonha", "bruto", "coletor"];
          g.bossType = bossRotation[(g.phase - 1) % 5];
          // bossHP pra barra visual (quantos objetos o boss joga)
          const hpMap: Record<string, number> = { cegonha: 4, bruto: 6, coletor: 10 };
          if (hpMap[g.bossType]) {
            g.obstacles[g.obstacles.length - 1].bossHP = hpMap[g.bossType];
          }
          // Spawn boss na frente
          g.obstacles = g.obstacles.filter(o => o.type !== "boss");
          g.obstacles.push({
            x: W + 80, width: 120, height: 70,
            type: "boss", vy: 0, flashTimer: 0, multado: false,
            bossHP: 10, bossHits: 0,
          });
          const bossNomes: Record<number, string> = { 1: "TRANQUILO", 2: "ESQUENTANDO", 3: "CORRERIA", 4: "CACHORRO LOUCO", 5: "PILOTO DE CORRIDA" };
          const bossMsg: Record<string, string> = {
            guincho: "⚠️ GUINCHO CET! DESVIE POR 10s!",
            guarda: "🚔 GUARDA PRF! 3 MULTAS = ELIMINADO!",
            cegonha: "🚛 CEGONHA LOUCA! PULE 4 CARROS!",
            bruto: "🚚 O BRUTO DO PORTO! DESVIE DE 6 CONTAINERS!",
            coletor: "🗑️ O COLETOR! DESVIE DE 10 SACOS DE LIXO!",
          };
          showStatus(bossMsg[g.bossType] || "BOSS!", 100);
          playSound("game-combo");
          // Inicia musica tensa do boss
          bossMusicRef.current.start();
        }
        // Boss ativo: conta timer e spawna obstaculos
        if (g.phaseState === "boss" && g.bossActive && !g.bossDefeated) {
          g.bossTimer--;
          const bossObs = g.obstacles.find(o => o.type === "boss");
          if (bossObs) {
            bossObs.bossHits = Math.floor((600 - g.bossTimer) / 60);
          }

          if (g.bossType === "guincho") {
            // === BOSS 1: GUINCHO CET - joga cavaletes e cones ===
            g.bossSpawnTimer--;
            if (g.bossSpawnTimer <= 0) {
              const bossPool: Obstacle["type"][] = ["cavalete", "cavalete", "cone", "cavalete", "barreira"];
              const tipo = bossPool[Math.floor(Math.random() * bossPool.length)];
              let w = 50, h = 35;
              if (tipo === "cone") { w = 25; h = 28; }
              else if (tipo === "barreira") { w = 40; h = 35; }
              g.obstacles.push({ x: W + 10, width: w, height: h, type: tipo, vy: 0, flashTimer: 0, multado: false });
              const spawnBase = g.phase <= 1 ? 55 : g.phase <= 2 ? 42 : g.phase <= 3 ? 32 : 22;
              g.bossSpawnTimer = spawnBase + Math.random() * 20;
            }
          } else if (g.bossType === "guarda") {
            // === BOSS 2: GUARDA PRF - joga radares, 3 multas = eliminado ===
            g.bossSpawnTimer--;
            if (g.bossSpawnTimer <= 0) {
              const guardaPool: Obstacle["type"][] = ["radar", "radar", "cone", "radar"];
              const tipo = guardaPool[Math.floor(Math.random() * guardaPool.length)];
              let w = 30, h = 72;
              if (tipo === "cone") { w = 20; h = 25; }
              g.obstacles.push({ x: W + 10, width: w, height: h, type: tipo, vy: 0, flashTimer: 0, multado: false });
              const spawnBase = g.phase <= 2 ? 50 : g.phase <= 3 ? 38 : 28;
              g.bossSpawnTimer = spawnBase + Math.random() * 20;
            }
            if (g.guardaMultas >= 3) {
              g.gameOver = true;
              g.running = false;
              playSound("game-over");
              showStatus("3 MULTAS! CARTEIRA SUSPENSA!", 80);
              bossMusicRef.current.stop();
              spawnParticles(60 + 20, truckGroundY - 20, "#FF0000", 25);
              if (Math.floor(g.distance) > g.highScore) {
                g.highScore = Math.floor(g.distance);
                localStorage.setItem("pegue_runner_highscore", g.highScore.toString());
                setDisplayHighScore(g.score);
              }
              setGameState("gameover");
            }
          } else if (g.bossType === "bruto") {
            // === BOSS 4: O BRUTO DO PORTO - joga 6 containers e caixas ===
            if (g.cegonhaCarrosJogados < 6) {
              g.bossSpawnTimer--;
              if (g.bossSpawnTimer <= 0) {
                g.cegonhaCarrosJogados++;
                // Alterna container e caixa de madeira
                const tipo: Obstacle["type"] = Math.random() > 0.5 ? "container" : "caixa_madeira";
                const w = tipo === "container" ? 60 : 50;
                g.obstacles.push({ x: W + 10, width: w, height: 40, type: tipo, vy: 0, flashTimer: 0, multado: false });
                g.bossSpawnTimer = 70 + Math.random() * 30;
                showStatus(`CONTAINER ${g.cegonhaCarrosJogados}/6!`, 25);
                if (bossObs) bossObs.bossHits = g.cegonhaCarrosJogados;
              }
            }
          } else if (g.bossType === "coletor") {
            // === BOSS 5: O COLETOR - joga 10 sacos de lixo ===
            if (g.cegonhaCarrosJogados < 10) {
              g.bossSpawnTimer--;
              if (g.bossSpawnTimer <= 0) {
                g.cegonhaCarrosJogados++;
                g.obstacles.push({ x: W + 10, width: 40, height: 35, type: "saco_lixo", vy: 0, flashTimer: 0, multado: false });
                g.bossSpawnTimer = 45 + Math.random() * 30; // mais rapido que bruto
                showStatus(`SACO ${g.cegonhaCarrosJogados}/10!`, 20);
                if (bossObs) bossObs.bossHits = g.cegonhaCarrosJogados;
              }
            }
          } else if (g.bossType === "cegonha") {
            // === BOSS 3: CEGONHA LOUCA - derruba veiculos, pule 4 pra vencer ===
            if (g.cegonhaCarrosJogados < 4) {
              g.bossSpawnTimer--;
              if (g.bossSpawnTimer <= 0) {
                g.cegonhaCarrosJogados++;
                g.obstacles.push({
                  x: W + 10, width: 65, height: 30,
                  type: "veiculo_cegonha", vy: 0, flashTimer: 0, multado: false,
                });
                g.bossSpawnTimer = 100 + Math.random() * 40; // ~1.7-2.3s entre carros
                showStatus(`CARRO ${g.cegonhaCarrosJogados}/4!`, 30);
                playSound("game-combo");
                // Atualiza barra visual
                if (bossObs) bossObs.bossHits = g.cegonhaCarrosPulados;
              }
            }
            // Checa se pulou os 4 (quando um obstaculo barreira sai da tela durante boss cegonha, conta como pulado)
          }

          // Checa vitoria de bosses que contam objetos (cegonha=4, bruto=6, coletor=10)
          const bossObjCount: Record<string, number> = { cegonha: 4, bruto: 6, coletor: 10 };
          const maxObj = bossObjCount[g.bossType];
          if (maxObj && g.cegonhaCarrosJogados >= maxObj) {
            const obsNaTela = g.obstacles.filter(o => o.type !== "boss" && o.type !== "cachorro" && o.type !== "radar" && o.x > -60 && o.x < W).length;
            if (obsNaTela === 0 && !g.gameOver) {
              g.cegonhaCarrosPulados = maxObj;
              g.bossDefeated = true;
              g.bossActive = false;
              g.phaseState = "boss_derrota";
              g.phaseTimer = 0;
              g.bossDerrotaTimer = 200;
              const vitoriaMsgs: Record<string, string> = {
                cegonha: "CET PRENDEU A CEGONHA!",
                bruto: "CARGA CAIU! BRUTO PRESO!",
                coletor: "LIXO RECOLHIDO! COLETOR SAIU!",
              };
              showStatus(vitoriaMsgs[g.bossType] || "BOSS DERROTADO!", 80);
              playSound("game-star");
              bossMusicRef.current.stop();
              if (bossObs) {
                spawnParticles(bossObs.x + 60, baseGroundY - 40, "#FF0000", 20);
                spawnParticles(bossObs.x + 60, baseGroundY - 40, "#0044FF", 20);
              }
            }
          }

          // Guincho/Guarda: sobreviveu 10 segundos!
          if (g.bossType !== "cegonha" && g.bossTimer <= 0 && !g.gameOver) {
            g.bossDefeated = true;
            g.bossActive = false;
            g.phaseState = "boss_derrota";
            g.phaseTimer = 0;
            g.bossDerrotaTimer = 180;
            if (g.bossType === "guincho") {
              showStatus("PNEU FURADO! BOSS DERROTADO!", 70);
            } else if (g.bossType === "bruto") {
              showStatus("CARGA CAIU! BRUTO DERROTADO!", 70);
            } else {
              showStatus("GUARDA FOI EMBORA! VOCE ESCAPOU!", 70);
            }
            playSound("game-star");
            bossMusicRef.current.stop(); // para musica do boss
            if (bossObs) {
              spawnParticles(bossObs.x + 60, baseGroundY - 40, "#FF6600", 25);
              spawnParticles(bossObs.x + 40, baseGroundY - 20, "#333333", 15);
            }
          }
        }
        // Animacao de derrota do boss (pneu fura, sai da pista)
        else if (g.phaseState === "boss_derrota") {
          g.bossDerrotaTimer--;
          const bossObs = g.obstacles.find(o => o.type === "boss");
          if (bossObs) {
            // Boss se move pra direita e pra cima (sai da pista)
            bossObs.x += 4;
            bossObs.vy = -0.5;
            bossObs.flashTimer = 3; // fica piscando
            // Particulas de fumaca (pneu furado)
            if (g.bossDerrotaTimer % 5 === 0) {
              spawnParticles(bossObs.x + 20, baseGroundY - 10, "#555555", 3);
            }
          }
          if (g.bossDerrotaTimer <= 0) {
            // Remove boss e vai pra entrega
            g.obstacles = g.obstacles.filter(o => o.type !== "boss");
            g.phaseState = "entrega";
            g.phaseTimer = 0;
            g.deliveries++;
            g.score += 100 * g.phase;
            setDisplayScore(g.score);
            setDisplayDeliveries(g.deliveries);
            showStatus(`📦 ENTREGA ${g.deliveries} CONCLUIDA! +${100 * g.phase}`, 90);
            playSound("game-star");
            spawnParticles(W / 2, baseGroundY - 50, "#C9A84C", 30);
            spawnParticles(W / 2, baseGroundY - 50, "#00FF00", 20);
            // Spawn 7 notas de dollar voando pro carro
            g.dollarNotes = [];
            for (let dn = 0; dn < 7; dn++) {
              g.dollarNotes.push({
                x: W + 30 + dn * 50,
                y: truckGroundY - 20 - Math.random() * 30,
                speed: 2.5 + Math.random() * 2,
                angle: Math.random() * 0.5 - 0.25,
              });
            }
          }
        }
        else if (g.phaseState === "entrega" && g.phaseTimer >= ENTREGA_FRAMES) {
          // Proxima fase
          g.phase++;
          g.phaseState = "desafio";
          g.phaseTimer = 0;
          // Velocidade: fases 1-6 contemplativas, 7+ desafiador
          if (g.phase <= 3) g.speed += 0.15;       // quase imperceptivel
          else if (g.phase <= 5) g.speed += 0.25;   // leve
          else if (g.phase <= 6) g.speed += 0.35;   // suave
          else if (g.phase === 7) g.speed += 0.6;   // aqui comeca
          else g.speed += 0.8;                       // fase 8+ intenso
          setDisplayPhase(g.phase);
          const nomesFase: Record<number, string> = {
            2: "🚚 ESQUENTANDO!",
            3: "🔥 CORRERIA!",
            4: "🐕 CACHORRO LOUCO!",
            5: "🏎️ PILOTO DE CORRIDA!",
          };
          showStatus(nomesFase[g.phase] || `🏎️ FASE ${g.phase} - INSANO!`, 80);
          playSound("game-combo");
          // A cada 3 fases (3, 6, 9...) spawna cruz de sobrevida
          if (g.phase % 3 === 0 && !g.temSobrevida) {
            g.items.push({
              x: W + 400 + Math.random() * 300, // aparece um pouco depois
              y: baseGroundY - 70 - Math.random() * 40,
              type: "sobrevida",
              collected: false, scale: 1,
            });
          }
        }

        // Spawn obstaculos (pausado na rodovia e entrega)
        // DIFICULDADE POR FASE:
        // 1 = Tranquilo (poucos obstaculos simples, bem espacados)
        // 2 = Esquentando (mais variedade, espacamento medio)
        // 3 = Correria (tudo aparece, espacamento curto)
        // 4 = Cachorro Louco (spam de obstaculos, velocidade alta)
        // 5+ = Piloto de Corrida (insano, so pra lenda)
        const canSpawn = g.phaseState === "desafio";
        if (canSpawn) {
          g.nextSpawn--;
          if (g.nextSpawn <= 0) {
            let pool: Obstacle["type"][];
            if (g.phase === 1) {
              pool = ["cone", "buraco", "cone", "buraco", "pedra", "cachorro"];
            } else if (g.phase === 2) {
              pool = ["barreira", "cone", "buraco", "pedra", "motoqueiro", "bueiro", "cachorro", "ambulante", "cavalete"];
            } else if (g.phase === 3) {
              pool = ["barreira", "cone", "buraco", "pedra", "motoqueiro", "motoboy", "radar", "bueiro", "catador", "ambulante", "cavalete"];
            } else if (g.phase === 4) {
              pool = ["barreira", "buraco", "motoqueiro", "motoboy", "radar", "bueiro", "catador", "onibus_parado", "ambulante", "cavalete"];
            } else {
              pool = ["barreira", "buraco", "motoqueiro", "motoboy", "radar", "bueiro", "catador", "onibus_parado", "ambulante", "pedra", "cavalete"];
            }
            const type = pool[Math.floor(Math.random() * pool.length)];
            let width = 25, height = 30;

            if (type === "barreira") { width = Math.random() > 0.5 ? 50 : 25; height = 25 + Math.random() * 25; }
            else if (type === "cone") { width = 20; height = 25; }
            else if (type === "buraco" || type === "bueiro") { width = 40 + Math.random() * 20; height = 6; }
            else if (type === "pedra") { width = 25 + Math.random() * 15; height = 15 + Math.random() * 15; }
            else if (type === "motoqueiro" || type === "motoboy") { width = 55; height = 45; }
            else if (type === "radar") { width = 30; height = 72; }
            else if (type === "ambulante") { width = 55; height = 38; }
            else if (type === "catador") { width = 55; height = 50; }
            else if (type === "onibus_parado") { width = 70; height = 50; }
            else if (type === "cachorro") { width = 40; height = 20; }
            else if (type === "cavalete") { width = 50; height = 35; }

            g.obstacles.push({ x: W + 20, width, height, type, vy: 0, flashTimer: 0, multado: false });

            // Espacamento entre obstaculos por fase
            // FASES 1-6: CONTEMPLATIVAS (jogador curte cenario e coleta itens)
            // FASES 7+: DESAFIADORAS (aqui o bicho pega)
            let spawnDelay: number;
            if (g.phase === 1) {
              spawnDelay = 170 + Math.random() * 160; // 2.8-5.5s
            } else if (g.phase === 2) {
              spawnDelay = 150 + Math.random() * 140; // 2.5-4.8s
            } else if (g.phase === 3) {
              spawnDelay = 140 + Math.random() * 120; // 2.3-4.3s
            } else if (g.phase === 4) {
              spawnDelay = 130 + Math.random() * 100; // 2.2-3.8s
            } else if (g.phase === 5) {
              spawnDelay = 120 + Math.random() * 90;  // 2.0-3.5s
            } else if (g.phase === 6) {
              spawnDelay = 100 + Math.random() * 80;  // 1.7-3.0s
            } else if (g.phase === 7) {
              spawnDelay = 70 + Math.random() * 60;   // 1.2-2.2s (comeca apertar)
            } else if (g.phase === 8) {
              spawnDelay = 55 + Math.random() * 50;   // 0.9-1.7s
            } else {
              spawnDelay = 40 + Math.random() * 40;   // 0.7-1.3s (insano)
            }
            if (type === "radar") spawnDelay += 60; // radares sempre mais espacados
            g.nextSpawn = spawnDelay;
          }
        }

        // Spawn semaforos (so a partir da fase 2)
        if (canSpawn && g.phase >= 2) {
          g.nextTrafficLight--;
          const semaforoDelay = g.phase <= 2 ? 300 : g.phase <= 3 ? 200 : 120;
          if (g.nextTrafficLight <= 0 && g.phaseTimer > 400) {
            g.trafficLights.push({
              x: W + 30,
              state: Math.random() > (g.phase >= 4 ? 0.55 : 0.4) ? "red" : "green",
              passed: false,
            });
            g.nextTrafficLight = semaforoDelay + Math.random() * 100;
          }
        }

        // Spawn itens (pausa durante entrega e derrota do boss)
        if (g.phaseState !== "entrega" && g.phaseState !== "boss_derrota") g.nextItemSpawn--;
        if (g.nextItemSpawn <= 0 && g.phaseState !== "entrega" && g.phaseState !== "boss_derrota") {
          const types: Item["type"][] = g.phase <= 2
            ? ["pacote", "pacote", "moeda", "moeda", "pegue_logo", "pao_chapa", "pastel", "coxinha"]
            : ["pacote", "moeda", "pegue_logo", "pao_chapa", "pastel", "mortadela", "coxinha", "guarana", "bilhete_unico"];
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
          if (o.type === "boss") {
            // Boss fica BEM na frente (lado direito da tela)
            const targetX = W * 0.72;
            if (g.phaseState === "boss_derrota") {
              // animacao controlada pelo bloco boss_derrota
            } else if (o.x > targetX) {
              o.x -= g.speed * 0.8;
            }
            if (o.x > W + 300) o.x = W + 300;
            o.vy = Math.sin(g.frameCount * 0.04) * 1;
          } else {
            o.x -= g.speed;
          }
          if (o.type === "motoqueiro" && o.vy !== undefined) {
            o.vy = Math.sin(g.frameCount * 0.08 + o.x * 0.02) * 0.5;
          }
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
            if (!obs.multado && tR > obs.x && tL < obs.x + obs.width) {
              obs.multado = true;
              if (!g.isJumping) {
                g.score = Math.max(0, g.score - 30);
                setDisplayScore(g.score);
                obs.flashTimer = 20;
                g.radarFlash = 15;
                // Se esta no boss guarda, conta multa
                if (g.bossActive && g.bossType === "guarda") {
                  g.guardaMultas++;
                  showStatus(`MULTA ${g.guardaMultas}/3! ${g.guardaMultas >= 3 ? "ELIMINADO!" : "CUIDADO!"}`, 50);
                } else {
                  showStatus("MULTADO! -30", 50);
                }
                playSound("game-over");
                spawnParticles(obs.x + 15, obsGY - 50, "#FF0000", 8);
              } else {
                g.score += 15;
                setDisplayScore(g.score);
                if (g.bossActive && g.bossType === "guarda") {
                  showStatus("LIMPO! SEM MULTA!", 35);
                } else {
                  showStatus("ESCAPOU! +15", 40);
                }
                playSound("game-star");
                spawnParticles(obs.x + 15, obsGY - 50, "#00FF00", 8);
              }
            }
            continue;
          }

          // BOSS - nao colide diretamente, so os obstaculos que ele joga
          if (obs.type === "boss") {
            continue;
          }

          // Cachorro caramelo: nao mata! Da bonus +5pts
          if (obs.type === "cachorro") {
            if (!obs.multado && tR > obs.x && tL < obs.x + obs.width) {
              obs.multado = true;
              g.score += 5;
              setDisplayScore(g.score);
              showStatus("CARAMELO RESGATADO! +5 ♥", 40);
              playSound("game-collect");
              spawnParticles(obs.x + 20, obsGY - 15, "#FF6B8A", 10);
            }
            continue;
          }

          let hit = false;
          if (obs.type === "buraco" || obs.type === "bueiro") {
            if (!g.isJumping && tR > obs.x + 5 && tL < obs.x + obs.width - 5) hit = true;
          } else {
            const obsTop = obsGY - obs.height;
            if (tR > obs.x + 3 && tL < obs.x + obs.width - 3 && tBot > obsTop + 5 && tTop < obsGY) hit = true;
          }

          if (hit) {
            // Invencibilidade (bilhete unico) = ignora hit
            if (g.invencivel) {
              spawnParticles(obs.x + 10, obsGY - 10, "#0088FF", 8);
              continue;
            }
            // Sobrevida (cruz) = absorve 1 hit
            if (g.temSobrevida && !g.sobreviveuHit) {
              g.sobreviveuHit = true;
              g.temSobrevida = false;
              showStatus("✝ SOBREVIDA USADA! PROXIMA BATE!", 60);
              playSound("game-combo");
              spawnParticles(60 + 20, truckGroundY - 20, "#FFD700", 20);
              spawnParticles(60 + 20, truckGroundY - 20, "#FFF", 10);
              continue;
            }
            g.gameOver = true;
            g.running = false;
            playSound("game-over");
            bossMusicRef.current.stop();
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
              bossMusicRef.current.stop();
              showStatus("SINAL VERMELHO!", 60);
              spawnParticles(tl.x + 10, truckGroundY - 30, "#FF0000", 20);
              if (Math.floor(g.distance) > g.highScore) {
                g.highScore = Math.floor(g.distance);
                localStorage.setItem("pegue_runner_highscore", g.highScore.toString());
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
            // Pontuacao por tipo de item
            const ptsMap: Record<string, number> = {
              pegue_logo: 50, moeda: 25, pacote: 10,
              pao_chapa: 15, pastel: 20, mortadela: 30, coxinha: 15,
              guarana: 10, bilhete_unico: 10, sobrevida: 0,
            };
            const pts = ptsMap[item.type] || 10;
            g.combo++;
            g.comboTimer = 120;
            g.score += pts * Math.min(g.combo, 5);
            g.flashTimer = 10;
            setDisplayScore(g.score);

            // Efeitos especiais
            if (item.type === "sobrevida") {
              g.temSobrevida = true;
              g.sobreviveuHit = false;
              showStatus("✝ SOBREVIDA! 1 CHANCE EXTRA!", 60);
            } else if (item.type === "guarana") {
              g.boosted = true;
              g.boostTimer = 180; // 3 segundos de boost
              g.speed += 1.5;
              showStatus("GUARANA! VELOCIDADE!", 40);
            } else if (item.type === "bilhete_unico") {
              g.invencivel = true;
              g.invencivelTimer = 300; // 5 segundos invencivel
              showStatus("BILHETE UNICO! INVENCIVEL!", 50);
            }

            playSound(item.type === "pegue_logo" || item.type === "mortadela" || item.type === "bilhete_unico" || item.type === "sobrevida" ? "game-star" : "game-collect");
            if (g.combo > 2) playSound("game-combo");
            const particleColor = item.type === "sobrevida" ? "#FFD700" : item.type === "guarana" ? "#00FF00" : item.type === "bilhete_unico" ? "#0088FF" : item.type === "pegue_logo" ? "#C9A84C" : "#FFD700";
            spawnParticles(item.x, itemY, particleColor, 12);
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

      // === POMBOS VOANDO ===
      if (g.pombos.length > 0) {
        g.pombos.forEach(pombo => {
          const px = pombo.x, py = pombo.y;
          const wingUp = Math.sin(pombo.wingPhase) * 8;

          // Corpo do pombo (cinza)
          ctx.fillStyle = "#777";
          ctx.beginPath();
          ctx.ellipse(px, py, 10, 6, 0, 0, Math.PI * 2);
          ctx.fill();

          // Cabeca
          ctx.fillStyle = "#666";
          ctx.beginPath();
          ctx.arc(px + 10, py - 3, 5, 0, Math.PI * 2);
          ctx.fill();

          // Olho
          ctx.fillStyle = "#FF6600";
          ctx.beginPath();
          ctx.arc(px + 12, py - 4, 1.5, 0, Math.PI * 2);
          ctx.fill();

          // Bico
          ctx.fillStyle = "#CC9900";
          ctx.beginPath();
          ctx.moveTo(px + 15, py - 3);
          ctx.lineTo(px + 19, py - 2);
          ctx.lineTo(px + 15, py - 1);
          ctx.closePath();
          ctx.fill();

          // Asas batendo
          ctx.fillStyle = "#888";
          // Asa esquerda
          ctx.beginPath();
          ctx.moveTo(px - 3, py - 2);
          ctx.lineTo(px - 12, py - 10 + wingUp);
          ctx.lineTo(px - 5, py - 3);
          ctx.closePath();
          ctx.fill();
          // Asa direita
          ctx.beginPath();
          ctx.moveTo(px + 3, py - 2);
          ctx.lineTo(px + 5, py - 12 + wingUp);
          ctx.lineTo(px + 8, py - 3);
          ctx.closePath();
          ctx.fill();

          // Rabo
          ctx.fillStyle = "#666";
          ctx.beginPath();
          ctx.moveTo(px - 10, py);
          ctx.lineTo(px - 17, py + 2);
          ctx.lineTo(px - 17, py - 2);
          ctx.closePath();
          ctx.fill();

          // Penas (pescoço iridescente - toque SP)
          ctx.fillStyle = "#558866";
          ctx.beginPath();
          ctx.arc(px + 9, py - 1, 3, 0, Math.PI * 2);
          ctx.fill();

          // Sombra no chao
          ctx.fillStyle = "rgba(0,0,0,0.15)";
          ctx.beginPath();
          ctx.ellipse(px, truckGroundY + 2, 8, 3, 0, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // === EVENTOS CLIMATICOS VISUAIS ===
      if (g.eventoClimatico === "enchente" && g.running) {
        // Agua subindo na parte inferior da pista
        const waterLevel = baseGroundY + (H - baseGroundY) * 0.3;
        ctx.fillStyle = "rgba(30,80,140,0.4)";
        ctx.fillRect(0, waterLevel, W, H - waterLevel);
        // Ondas
        ctx.strokeStyle = "rgba(100,160,220,0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x < W; x += 3) {
          const wy = waterLevel + Math.sin((x + g.frameCount * 2) * 0.03) * 4;
          if (x === 0) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }
      if (g.eventoClimatico === "nevoeiro" && g.running) {
        // Nevoeiro - visibilidade reduzida
        const fogAlpha = 0.5 + Math.sin(g.frameCount * 0.01) * 0.1;
        ctx.fillStyle = `rgba(200,200,210,${fogAlpha})`;
        ctx.fillRect(0, 0, W, H);
        // Claridade perto do carro (farol)
        const grad = ctx.createRadialGradient(100, truckGroundY - 20, 10, 100, truckGroundY - 20, 120);
        grad.addColorStop(0, "rgba(200,200,210,0)");
        grad.addColorStop(1, `rgba(200,200,210,${fogAlpha})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }
      if (g.eventoClimatico === "granizo" && g.running) {
        // Pedras de gelo caindo
        ctx.fillStyle = "#E8E8FF";
        g.granizoDrops.forEach(d => {
          ctx.beginPath();
          ctx.arc(d.x, d.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
        // Overlay frio
        ctx.fillStyle = "rgba(180,200,240,0.15)";
        ctx.fillRect(0, 0, W, H);
      }
      if (g.eventoClimatico === "apagao" && g.running) {
        // Tudo escuro, so farois iluminam
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(0, 0, W, H);
        // Cone de luz dos farois do carro
        ctx.fillStyle = "rgba(255,255,200,0.15)";
        ctx.beginPath();
        ctx.moveTo(100, truckGroundY - 10);
        ctx.lineTo(250, truckGroundY - 60);
        ctx.lineTo(250, truckGroundY + 30);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,200,0.08)";
        ctx.beginPath();
        ctx.moveTo(100, truckGroundY - 10);
        ctx.lineTo(350, truckGroundY - 80);
        ctx.lineTo(350, truckGroundY + 40);
        ctx.closePath();
        ctx.fill();
      }

      // === Invencibilidade visual (brilho azul no carro) ===
      if (g.invencivel && g.running) {
        ctx.fillStyle = `rgba(0,100,255,${0.15 + Math.sin(g.frameCount * 0.15) * 0.1})`;
        ctx.beginPath();
        ctx.arc(90, truckGroundY - 15, 50, 0, Math.PI * 2);
        ctx.fill();
      }
      // === Boost visual (chamas atras do carro) ===
      if (g.boosted && g.running) {
        ctx.fillStyle = "rgba(255,100,0,0.6)";
        ctx.beginPath();
        ctx.moveTo(35, truckGroundY - 5);
        ctx.lineTo(10 - Math.random() * 15, truckGroundY - 15);
        ctx.lineTo(35, truckGroundY - 25);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,200,0,0.4)";
        ctx.beginPath();
        ctx.moveTo(40, truckGroundY - 8);
        ctx.lineTo(20 - Math.random() * 10, truckGroundY - 15);
        ctx.lineTo(40, truckGroundY - 22);
        ctx.closePath();
        ctx.fill();
      }

      // === CHUVA ===
      if (g.raining && g.running) {
        ctx.strokeStyle = "rgba(150,180,255,0.4)";
        ctx.lineWidth = 1;
        g.raindrops.forEach((d) => {
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - 2, d.y + d.len);
          ctx.stroke();
        });
        // Overlay escuro da chuva
        ctx.fillStyle = "rgba(0,0,30,0.15)";
        ctx.fillRect(0, 0, W, H);
      }

      // === NOTAS DE DOLLAR VOANDO ===
      if (g.dollarNotes.length > 0 && (g.phaseState === "entrega" || g.phaseState === "boss_derrota")) {
        g.dollarNotes.forEach((note) => {
          // Move pra esquerda em direcao ao carro
          note.x -= note.speed;
          note.y += Math.sin(g.frameCount * 0.1 + note.x * 0.05) * 0.8;
          // Desenha nota de dollar
          if (note.x > -30 && note.x < W + 30) {
            ctx.save();
            ctx.translate(note.x, note.y);
            ctx.rotate(note.angle + Math.sin(g.frameCount * 0.05) * 0.1);
            // Nota verde
            ctx.fillStyle = "#2E7D32";
            ctx.fillRect(-18, -10, 36, 20);
            ctx.fillStyle = "#4CAF50";
            ctx.fillRect(-16, -8, 32, 16);
            // Borda
            ctx.strokeStyle = "#1B5E20";
            ctx.lineWidth = 1;
            ctx.strokeRect(-18, -10, 36, 20);
            // Simbolo $
            ctx.fillStyle = "#FFF";
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("$", 0, 0);
            ctx.textBaseline = "alphabetic";
            ctx.restore();
          }
        });
        // Remove notas que passaram do carro
        g.dollarNotes = g.dollarNotes.filter(n => n.x > -40);
      }

      // === CUTSCENE ENTREGA ===
      if (g.phaseState === "entrega" && g.running) {
        const t = g.phaseTimer;
        const total = 330;
        const cx = W * 0.55;
        const gy = truckGroundY;

        // Fundo semi-escuro pra destacar a cena
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(0, 0, W, H);

        // === Casa/Local de entrega ===
        // Parede
        ctx.fillStyle = "#D4C4A0";
        ctx.fillRect(cx + 40, gy - 80, 70, 80);
        // Telhado
        ctx.fillStyle = "#8B4513";
        ctx.beginPath();
        ctx.moveTo(cx + 30, gy - 80);
        ctx.lineTo(cx + 75, gy - 110);
        ctx.lineTo(cx + 120, gy - 80);
        ctx.closePath();
        ctx.fill();
        // Porta
        ctx.fillStyle = "#6B3410";
        ctx.fillRect(cx + 60, gy - 50, 20, 50);
        // Macaneta
        ctx.fillStyle = "#C9A84C";
        ctx.beginPath();
        ctx.arc(cx + 76, gy - 25, 2, 0, Math.PI * 2);
        ctx.fill();
        // Janela
        ctx.fillStyle = "#87CEEB";
        ctx.fillRect(cx + 88, gy - 65, 15, 15);
        ctx.strokeStyle = "#6B3410";
        ctx.lineWidth = 1;
        ctx.strokeRect(cx + 88, gy - 65, 15, 15);
        ctx.beginPath();
        ctx.moveTo(cx + 95.5, gy - 65);
        ctx.lineTo(cx + 95.5, gy - 50);
        ctx.stroke();
        // Numero da casa
        ctx.fillStyle = "#333";
        ctx.font = "bold 8px Arial";
        ctx.textAlign = "center";
        ctx.fillText("42", cx + 70, gy - 55);

        // === Pessoa recebendo (aparece apos 1s) ===
        if (t > 60) {
          const personX = cx + 35;
          // Corpo
          ctx.fillStyle = "#3366CC";
          ctx.fillRect(personX - 5, gy - 35, 10, 20);
          // Cabeca
          ctx.fillStyle = "#FFCC99";
          ctx.beginPath();
          ctx.arc(personX, gy - 42, 7, 0, Math.PI * 2);
          ctx.fill();
          // Cabelo
          ctx.fillStyle = "#333";
          ctx.beginPath();
          ctx.arc(personX, gy - 45, 7, Math.PI, 0);
          ctx.fill();
          // Sorriso
          ctx.strokeStyle = "#333";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(personX, gy - 40, 3, 0.1, Math.PI - 0.1);
          ctx.stroke();
          // Pernas
          ctx.fillStyle = "#444";
          ctx.fillRect(personX - 4, gy - 15, 3, 15);
          ctx.fillRect(personX + 1, gy - 15, 3, 15);

          // Braco acenando (animado)
          if (t > 120) {
            const waveAngle = Math.sin(t * 0.12) * 0.4;
            ctx.save();
            ctx.translate(personX + 5, gy - 30);
            ctx.rotate(-1.2 + waveAngle);
            ctx.fillStyle = "#FFCC99";
            ctx.fillRect(0, 0, 3, 15);
            // Mao
            ctx.beginPath();
            ctx.arc(1.5, 16, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        // === Pacote sendo entregue (voa do carro ate a pessoa) ===
        if (t > 30 && t < 150) {
          const p = Math.min(1, (t - 30) / 100);
          const startX = 100;
          const endX = cx + 30;
          const pkgX = startX + (endX - startX) * p;
          const pkgY = gy - 50 - Math.sin(p * Math.PI) * 80;
          ctx.fillStyle = "#C9A84C";
          ctx.fillRect(pkgX - 12, pkgY - 12, 24, 24);
          ctx.fillStyle = "#8B7530";
          ctx.fillRect(pkgX - 1, pkgY - 12, 2, 24);
          ctx.fillRect(pkgX - 12, pkgY - 1, 24, 2);
        }

        // === Confetti (apos entrega) ===
        if (t > 150) {
          const confettiColors = ["#C9A84C", "#FF6600", "#00CC00", "#FF0066", "#3366FF", "#FFCC00"];
          for (let i = 0; i < 25; i++) {
            const seed = i * 137.5;
            const confX = (W * 0.3 + Math.sin(seed) * W * 0.4 + t * 0.3 * Math.cos(seed * 0.7)) % W;
            const confY = ((seed * 3 + t * (1.5 + Math.sin(seed) * 0.5)) % (gy + 20));
            const rot = t * 0.05 + seed;
            ctx.save();
            ctx.translate(confX, confY);
            ctx.rotate(rot);
            ctx.fillStyle = confettiColors[i % confettiColors.length];
            ctx.fillRect(-4, -2, 8, 4);
            ctx.restore();
          }
        }

        // === Textos de comemoracao ===
        if (t > 80) {
          const scale = Math.min(1, (t - 80) / 30);
          ctx.save();
          ctx.translate(W / 2, gy - 160);
          ctx.scale(scale, scale);

          // Fundo do texto
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.beginPath();
          ctx.roundRect(-120, -25, 240, 65, 12);
          ctx.fill();
          ctx.strokeStyle = "#C9A84C";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(-120, -25, 240, 65, 12);
          ctx.stroke();

          ctx.fillStyle = "#00FF00";
          ctx.font = "bold 22px Arial";
          ctx.textAlign = "center";
          ctx.fillText(`ENTREGA ${g.deliveries}`, 0, 0);
          ctx.fillStyle = "#C9A84C";
          ctx.font = "bold 16px Arial";
          ctx.fillText("CONCLUIDA! 🎉", 0, 25);

          ctx.restore();
        }

        // Bonus text
        if (t > 200 && t < 300) {
          const alpha = Math.min(1, (t - 200) / 20) * Math.min(1, (300 - t) / 20);
          ctx.fillStyle = `rgba(201,168,76,${alpha})`;
          ctx.font = "bold 18px Arial";
          ctx.textAlign = "center";
          ctx.fillText(`+${100 * g.phase} PONTOS!`, W / 2, gy - 200);
        }
      }

      // === BANNER RODOVIA ===
      if (g.restActive && g.running) {
        // Placa de rodovia verde
        ctx.fillStyle = "rgba(0,100,0,0.85)";
        ctx.beginPath();
        ctx.roundRect(W / 2 - 90, 65, 180, 32, 6);
        ctx.fill();
        ctx.strokeStyle = "#FFF";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(W / 2 - 88, 67, 176, 28, 5);
        ctx.stroke();
        ctx.fillStyle = "#FFF";
        ctx.font = "bold 14px Arial";
        ctx.textAlign = "center";
        ctx.fillText("🛣️ RODOVIA", W / 2, 86);
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

      // Fase e entregas
      ctx.fillStyle = "#C9A84C";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      if (g.combo <= 1) {
        const nomeFaseHUD: Record<number, string> = {
          1: "TRANQUILO",
          2: "ESQUENTANDO",
          3: "CORRERIA",
          4: "CACHORRO LOUCO",
          5: "PILOTO DE CORRIDA",
        };
        const faseNome = nomeFaseHUD[g.phase] || `FASE ${g.phase}`;
        ctx.fillText(`${faseNome}  |  📦 ${g.deliveries}`, W / 2, 26);
      }
      if (g.combo > 1) {
        ctx.font = "bold 16px Arial";
        ctx.fillText(`x${Math.min(g.combo, 5)} COMBO!`, W / 2, 26);
      }

      // Recorde e velocidade
      ctx.fillStyle = "#C9A84C";
      ctx.font = "12px Arial";
      ctx.textAlign = "right";
      ctx.fillText(`Recorde: ${g.highScore}km`, W - 15, 26);
      ctx.fillStyle = "#666";
      ctx.font = "10px Arial";
      ctx.fillText(`${(g.speed * 10).toFixed(0)} km/h`, W - 15, 44);

      // Indicadores de status
      let statusIcons = "";
      if (g.raining) statusIcons += "🌧️";
      if (g.eventoClimatico === "enchente") statusIcons += "🌊";
      if (g.eventoClimatico === "nevoeiro") statusIcons += "🌫️";
      if (g.eventoClimatico === "granizo") statusIcons += "🧊";
      if (g.eventoClimatico === "apagao") statusIcons += "🔦";
      if (g.temSobrevida) statusIcons += "✝️";
      if (g.invencivel) statusIcons += "🛡️";
      if (g.boosted) statusIcons += "🚀";
      if (statusIcons) {
        ctx.fillStyle = "#AAA";
        ctx.font = "10px Arial";
        ctx.textAlign = "left";
        ctx.fillText(statusIcons, 80, 44);
      }

      // === MENU / TUTORIAL (fundo escuro, overlays React cuidam do conteudo) ===
      if (!g.started && !g.gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(0, 0, W, H);
      }

      // === GAME OVER (so mostra score, botoes ficam no overlay React) ===
      if (g.gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#FF4444";
        ctx.font = "bold 26px Arial";
        ctx.textAlign = "center";
        ctx.fillText("BATEU! 💥", W / 2, H * 0.18);

        // KM como destaque principal
        ctx.fillStyle = "#FFF";
        ctx.font = "bold 44px Arial";
        ctx.fillText(`${Math.floor(g.distance)}km`, W / 2, H * 0.28);
        ctx.font = "13px Arial";
        ctx.fillStyle = "#888";
        ctx.fillText("percorridos", W / 2, H * 0.33);

        ctx.fillStyle = "#C9A84C";
        ctx.font = "13px Arial";
        const goFaseNome: Record<number, string> = { 1: "Tranquilo", 2: "Esquentando", 3: "Correria", 4: "Cachorro Louco", 5: "Piloto de Corrida" };
        ctx.fillText(`📦 ${g.deliveries} entregas  •  R$${g.score}  •  ${goFaseNome[g.phase] || "Fase " + g.phase}`, W / 2, H * 0.39);

        if (Math.floor(g.distance) >= g.highScore) {
          ctx.fillStyle = "#FFD700";
          ctx.font = "bold 18px Arial";
          ctx.fillText("🏆 NOVO RECORDE DE KM!", W / 2, H * 0.45);
        } else {
          ctx.fillStyle = "#888";
          ctx.font = "13px Arial";
          ctx.fillText(`Recorde: ${g.highScore}km`, W / 2, H * 0.45);
        }
      }

      animRef.current = requestAnimationFrame(loop);
    }

    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", resize); bossMusicRef.current.stop(); };
  }, []);

  // Input handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handle(e: TouchEvent | MouseEvent) {
      e.preventDefault();
      const g = gameRef.current;
      if (g.gameOver) return; // bloqueado - usa overlay React
      if (!g.started) return; // usa overlay React (menu/tutorial)
      jump();
    }

    canvas.addEventListener("touchstart", handle, { passive: false });
    canvas.addEventListener("mousedown", handle);

    function keyHandle(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
      if (e.code === "Escape") onClose();
      // Debug: teclas 1-5 pulam direto pro boss da fase correspondente
      const debugKeys = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"];
      const keyIdx = debugKeys.indexOf(e.code);
      if (keyIdx >= 0 && gameRef.current.started && !gameRef.current.gameOver) {
        const g = gameRef.current;
        g.phase = keyIdx + 1;
        g.phaseState = "rodovia";
        g.phaseTimer = 400; // vai pro boss em ~0.3s
        g.restActive = true;
        g.obstacles = g.obstacles.filter(o => o.type === "boss");
        g.trafficLights = [];
        g.cegonhaCarrosJogados = 0;
        g.cegonhaCarrosPulados = 0;
      }
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
      {/* Botao fechar - escondido durante game over ate salvar */}
      {!(gameState === "gameover" && !scoreSaved) && (
        <button onClick={onClose} className="absolute right-3 top-3 z-50 rounded-full bg-black/50 p-2 text-white backdrop-blur">✕</button>
      )}

      {/* MENU INICIAL */}
      {gameState === "menu" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
          <p className="mb-2 text-4xl">🚚</p>
          <h1 className="mb-2 text-3xl font-bold text-[#C9A84C]">PEGUE RUNNER<sup className="text-xs">®</sup></h1>
          <p className="mb-6 text-sm text-gray-400">Pelas ruas de SP e Osasco!</p>
          <button
            onClick={() => {
              const jaViuTutorial = localStorage.getItem("pegue_runner_tutorial_visto");
              if (jaViuTutorial) {
                setGameState("playing");
                startGame();
              } else {
                setGameState("tutorial");
                setTutorialStep(0);
              }
            }}
            className="mb-4 w-56 rounded-xl bg-[#C9A84C] py-4 text-lg font-bold text-black"
          >
            JOGAR
          </button>
          <button
            onClick={() => { fetchRanking(); setShowRanking(true); }}
            className="w-56 rounded-xl border border-[#C9A84C]/50 py-3 text-sm font-bold text-[#C9A84C]"
          >
            🏆 Ver Ranking
          </button>
        </div>
      )}

      {/* TUTORIAL - 5 slides */}
      {gameState === "tutorial" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-2xl border border-[#C9A84C]/30 bg-black/95 p-6 backdrop-blur">
            {tutorialStep === 0 && (
              <div className="space-y-4 text-center">
                <p className="text-5xl">👆</p>
                <h2 className="text-xl font-bold text-[#C9A84C]">TOQUE = PULAR</h2>
                <p className="text-sm text-gray-300">Toque em qualquer lugar da tela para pular os obstaculos</p>
                <p className="text-xs text-gray-500">No computador: Espaco ou Seta pra cima</p>
              </div>
            )}
            {tutorialStep === 1 && (
              <div className="space-y-4 text-center">
                <p className="text-5xl">📦💰🏆</p>
                <h2 className="text-xl font-bold text-[#C9A84C]">COLETE ITENS</h2>
                <div className="space-y-1 text-sm text-gray-300">
                  <p>📦 Pacote = <span className="text-[#C9A84C]">10 pts</span></p>
                  <p>💰 Moeda = <span className="text-[#C9A84C]">25 pts</span></p>
                  <p>🏆 Logo Pegue = <span className="text-[#C9A84C]">50 pts</span></p>
                </div>
              </div>
            )}
            {tutorialStep === 2 && (
              <div className="space-y-4 text-center">
                <p className="text-5xl">🚦</p>
                <h2 className="text-xl font-bold text-[#C9A84C]">SEMAFORO</h2>
                <div className="space-y-2 text-sm">
                  <p className="text-red-400">🔴 Vermelho = <span className="font-bold">PULE!</span> (senao bate)</p>
                  <p className="text-green-400">🟢 Verde = <span className="font-bold">+20 pts</span> bonus!</p>
                </div>
              </div>
            )}
            {tutorialStep === 3 && (
              <div className="space-y-4 text-center">
                <p className="text-5xl">📷</p>
                <h2 className="text-xl font-bold text-[#C9A84C]">RADAR</h2>
                <div className="space-y-2 text-sm">
                  <p className="text-red-400">No chao = <span className="font-bold">MULTADO! -30 pts</span></p>
                  <p className="text-green-400">Pulou = <span className="font-bold">ESCAPOU! +15 pts</span></p>
                </div>
              </div>
            )}
            {tutorialStep === 4 && (
              <div className="space-y-4 text-center">
                <p className="text-5xl">🏍️🛣️🌉</p>
                <h2 className="text-xl font-bold text-[#C9A84C]">AVENTURA SP!</h2>
                <div className="space-y-1 text-sm text-gray-300">
                  <p>🏍️ Desvie dos motoqueiros e motoboys</p>
                  <p>🛣️ Rodovia = zona de descanso</p>
                  <p>🌉 Pontes, tuneis e ladeiras</p>
                </div>
              </div>
            )}

            {/* Indicador de pagina */}
            <div className="mt-5 flex justify-center gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className={`h-2 w-2 rounded-full ${i === tutorialStep ? "bg-[#C9A84C]" : "bg-gray-600"}`} />
              ))}
            </div>

            <button
              onClick={() => {
                if (tutorialStep < 4) {
                  setTutorialStep(tutorialStep + 1);
                } else {
                  localStorage.setItem("pegue_runner_tutorial_visto", "1");
                  setGameState("playing");
                  startGame();
                }
              }}
              className="mt-5 w-full rounded-xl bg-[#C9A84C] py-3 text-base font-bold text-black"
            >
              {tutorialStep < 4 ? "Proximo" : "COMECAR!"}
            </button>

            {tutorialStep > 0 && (
              <button
                onClick={() => setTutorialStep(tutorialStep - 1)}
                className="mt-2 w-full py-2 text-sm text-gray-500"
              >
                Voltar
              </button>
            )}
          </div>
        </div>
      )}

      {/* GAME OVER - Overlay fullscreen obrigatorio */}
      {gameState === "gameover" && !showRanking && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-2xl border border-[#C9A84C]/30 bg-black/95 p-6 backdrop-blur">
            {!scoreSaved ? (
              <div className="space-y-4">
                <p className="text-center text-lg font-bold text-[#C9A84C]">Digite seu nome para continuar</p>
                <p className="text-center text-xs text-gray-500">Sua pontuacao sera salva no ranking</p>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Seu nome ou apelido"
                  maxLength={20}
                  autoFocus
                  className="w-full rounded-lg border-2 border-[#C9A84C]/50 bg-[#111] px-4 py-3 text-center text-base text-white focus:border-[#C9A84C] focus:outline-none"
                  onKeyDown={(e) => { if (e.key === "Enter") saveScore(); }}
                />
                <button
                  onClick={saveScore}
                  disabled={!playerName.trim() || savingScore}
                  className="w-full rounded-lg bg-[#C9A84C] py-3 text-base font-bold text-black disabled:opacity-40"
                >
                  {savingScore ? "Salvando..." : "Salvar e Continuar"}
                </button>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <p className="text-lg text-green-400">✅ Pontuacao salva!</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => startGame()}
                    className="flex-1 rounded-lg bg-[#C9A84C] py-3 text-sm font-bold text-black"
                  >
                    Jogar de Novo
                  </button>
                  <button
                    onClick={() => { fetchRanking(); setShowRanking(true); }}
                    className="flex-1 rounded-lg border border-[#C9A84C]/50 py-3 text-sm font-bold text-[#C9A84C]"
                  >
                    🏆 Ranking
                  </button>
                </div>
                <button
                  onClick={onClose}
                  className="w-full rounded-lg border border-gray-700 py-2.5 text-sm font-bold text-gray-400"
                >
                  Voltar pro Mapa
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
              🏆 <span className="text-[#C9A84C]">Ranking</span> Pegue Runner®
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
                      <p className="text-xs text-gray-500">{r.entregas ? `📦${r.entregas} entregas` : ""} • R${r.score}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-bold ${i === 0 ? "text-[#C9A84C]" : "text-white"}`}>{r.distancia}km</p>
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
