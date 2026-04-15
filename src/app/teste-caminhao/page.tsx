"use client";

import { useEffect, useRef, useState } from "react";

const TRUCKS = [
  { id: 1, nome: "HR / Bau", desc: "Hyundai HR com bau e fretista de bone" },
  { id: 2, nome: "Fiat Strada", desc: "Pickup Strada com carroceria e pacotes" },
  { id: 3, nome: "Trucado", desc: "Caminhao truck grande com bau Pegue" },
];

function drawMotorista(ctx: CanvasRenderingContext2D, x: number, y: number, flip?: boolean) {
  // Motorista com bone pra fora da janela
  const dir = flip ? -1 : 1;
  ctx.save();

  // Braco pra fora da janela
  ctx.fillStyle = "#D2996B";
  ctx.fillRect(x + dir * 6, y + 12, dir * 8, 4);

  // Corpo (camisa)
  ctx.fillStyle = "#C9A84C";
  ctx.fillRect(x - 4, y + 8, 8, 10);

  // Cabeca
  ctx.fillStyle = "#D2996B";
  ctx.beginPath();
  ctx.arc(x, y + 2, 7, 0, Math.PI * 2);
  ctx.fill();

  // Bone (aba pra frente)
  ctx.fillStyle = "#1a1a1a";
  // Topo do bone
  ctx.beginPath();
  ctx.arc(x, y - 2, 7.5, Math.PI, 0);
  ctx.fill();
  // Aba do bone
  ctx.fillStyle = "#111";
  ctx.fillRect(x + (flip ? -12 : 2), y - 3, 10, 3);
  // Logo P no bone
  ctx.fillStyle = "#C9A84C";
  ctx.font = "bold 6px Arial";
  ctx.textAlign = "center";
  ctx.fillText("P", x, y - 0);

  // Olho
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(x + dir * 3, y + 1, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Sorriso
  ctx.strokeStyle = "#8B6040";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + dir * 2, y + 4, 3, 0, Math.PI * 0.6);
  ctx.stroke();

  ctx.restore();
}

// Desenha materiais de mudanca empilhados
function drawMateriais(ctx: CanvasRenderingContext2D, x: number, y: number, tipo: "bau" | "aberto" | "grande") {
  if (tipo === "aberto") {
    // Materiais na carroceria aberta (Strada)
    // Geladeira
    ctx.fillStyle = "#DDD";
    ctx.fillRect(x, y - 18, 10, 20);
    ctx.fillStyle = "#BBB";
    ctx.fillRect(x + 1, y - 16, 8, 8);
    ctx.fillRect(x + 1, y - 6, 8, 5);
    ctx.fillStyle = "#999";
    ctx.fillRect(x + 8, y - 12, 1, 3);
    ctx.fillRect(x + 8, y - 4, 1, 2);

    // Caixas empilhadas
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(x + 12, y - 10, 9, 11);
    ctx.fillStyle = "#DAA520";
    ctx.fillRect(x + 15, y - 10, 1, 11);
    ctx.fillRect(x + 12, y - 5, 9, 1);

    ctx.fillStyle = "#A0522D";
    ctx.fillRect(x + 13, y - 16, 7, 8);
    ctx.fillStyle = "#DAA520";
    ctx.fillRect(x + 15.5, y - 16, 1, 8);

    // Colchao enrolado (rosa)
    ctx.fillStyle = "#D4A0A0";
    ctx.beginPath();
    ctx.ellipse(x + 5, y - 22, 8, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#B08080";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Vassoura/rodo
    ctx.strokeStyle = "#8B7530";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 20, y - 20);
    ctx.lineTo(x + 22, y + 2);
    ctx.stroke();
  } else if (tipo === "bau") {
    // Materiais vistos pela porta traseira do bau (HR)
    // Sofa visto de lado
    ctx.fillStyle = "#6B4226";
    ctx.fillRect(x - 4, y + 8, 14, 12);
    ctx.fillStyle = "#8B5A2B";
    ctx.fillRect(x - 4, y + 6, 14, 4);
    // Almofadas
    ctx.fillStyle = "#7B4A2A";
    ctx.fillRect(x - 2, y + 10, 5, 8);
    ctx.fillRect(x + 4, y + 10, 5, 8);

    // Caixas atras
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(x + 12, y + 10, 8, 10);
    ctx.fillStyle = "#DAA520";
    ctx.fillRect(x + 15, y + 10, 1, 10);

    ctx.fillStyle = "#A0522D";
    ctx.fillRect(x + 10, y + 4, 10, 8);
    ctx.fillStyle = "#DAA520";
    ctx.fillRect(x + 14, y + 4, 1, 8);

    // Geladeira no fundo
    ctx.fillStyle = "#CCC";
    ctx.fillRect(x + 22, y + 2, 8, 18);
    ctx.fillStyle = "#AAA";
    ctx.fillRect(x + 23, y + 3, 6, 7);
    ctx.fillRect(x + 23, y + 11, 6, 5);
  } else {
    // Grande (trucado) - materiais na parte de cima do bau
    // Colchao amarrado em cima
    ctx.fillStyle = "#D4A0A0";
    ctx.fillRect(x, y - 6, 30, 5);
    ctx.strokeStyle = "#B08080";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y - 6, 30, 5);
    // Cordas amarrando
    ctx.strokeStyle = "#8B7530";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 5, y - 6); ctx.lineTo(x + 5, y + 4);
    ctx.moveTo(x + 25, y - 6); ctx.lineTo(x + 25, y + 4);
    ctx.stroke();

    // Mesa de pernas pra cima
    ctx.fillStyle = "#6B4226";
    ctx.fillRect(x + 6, y - 12, 18, 3);
    ctx.fillRect(x + 8, y - 18, 2, 6);
    ctx.fillRect(x + 20, y - 18, 2, 6);

    // Cadeira
    ctx.fillStyle = "#555";
    ctx.fillRect(x + 32, y - 10, 6, 8);
    ctx.fillRect(x + 32, y - 16, 6, 3);
  }
}

function drawHR(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bounce = Math.sin(frame * 0.15) * 1;
  const ty = y + bounce;

  // Sombra
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x + 28, ty + 46, 30, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Materiais vistos pela traseira do bau
  drawMateriais(ctx, x - 6, ty, "bau");

  // Carroceria BAU
  const grad = ctx.createLinearGradient(x - 6, ty, x - 6, ty + 30);
  grad.addColorStop(0, "#D4AF37");
  grad.addColorStop(1, "#B8963F");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x - 6, ty + 4, 34, 28, 3);
  ctx.fill();
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Porta traseira aberta do bau (mostra que ta carregado)
  ctx.fillStyle = "#B8963F";
  ctx.fillRect(x - 8, ty + 4, 4, 28);
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 8, ty + 4, 4, 28);

  // Texto PEGUE no bau
  ctx.fillStyle = "#000";
  ctx.font = "bold 7px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", x + 14, ty + 21);
  // Linha decorativa
  ctx.strokeStyle = "#00000044";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x - 3, ty + 26); ctx.lineTo(x + 25, ty + 26);
  ctx.stroke();

  // Cabine HR
  ctx.fillStyle = "#F5F5F5";
  ctx.beginPath();
  ctx.roundRect(x + 30, ty + 8, 22, 24, [0, 6, 4, 0]);
  ctx.fill();
  ctx.strokeStyle = "#DDD";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Janela
  ctx.fillStyle = "#87CEEB";
  ctx.beginPath();
  ctx.roundRect(x + 34, ty + 10, 14, 11, [1, 4, 1, 1]);
  ctx.fill();

  // Motorista com bone
  drawMotorista(ctx, x + 41, ty + 8, false);

  // Grade frontal
  ctx.fillStyle = "#CCC";
  ctx.fillRect(x + 52, ty + 22, 3, 10);
  // Farol
  ctx.fillStyle = "#FFE";
  ctx.beginPath();
  ctx.arc(x + 54, ty + 22, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#DDD";
  ctx.stroke();

  // Lanterna traseira
  ctx.fillStyle = "#FF3333";
  ctx.beginPath();
  ctx.arc(x - 5, ty + 24, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Chassi
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x - 8, ty + 32, 64, 6);

  // Rodas traseiras (duplas)
  for (const wx of [x + 4, x + 10]) {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(wx, ty + 40, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#444";
    ctx.beginPath();
    ctx.arc(wx, ty + 40, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;
    const a = frame * 0.15;
    for (let r = 0; r < 3; r++) {
      const ra = a + (r * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(wx, ty + 40);
      ctx.lineTo(wx + Math.cos(ra) * 5, ty + 40 + Math.sin(ra) * 5);
      ctx.stroke();
    }
  }

  // Roda dianteira
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + 44, ty + 40, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#444";
  ctx.beginPath();
  ctx.arc(x + 44, ty + 40, 3, 0, Math.PI * 2);
  ctx.fill();

  // Fumaca
  ctx.fillStyle = "rgba(150,150,150,0.25)";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x - 10 - i * 7, ty + 28 - i * 3 + Math.sin(frame * 0.1 + i) * 2, 3 + i, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStrada(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bounce = Math.sin(frame * 0.15) * 1;
  const ty = y + bounce;

  // Sombra
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x + 24, ty + 42, 26, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Carroceria aberta
  ctx.fillStyle = "#C9A84C";
  ctx.fillRect(x - 4, ty + 12, 26, 18);
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 4, ty + 12, 26, 18);

  // Materiais de mudanca na carroceria
  drawMateriais(ctx, x - 2, ty + 12, "aberto");

  // Cabine Strada
  ctx.fillStyle = "#E8E8E8";
  ctx.beginPath();
  ctx.roundRect(x + 24, ty + 6, 24, 24, [0, 8, 4, 0]);
  ctx.fill();
  ctx.strokeStyle = "#CCC";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Janela grande
  ctx.fillStyle = "#87CEEB";
  ctx.beginPath();
  ctx.roundRect(x + 28, ty + 8, 16, 11, [2, 5, 2, 2]);
  ctx.fill();

  // Motorista com bone
  drawMotorista(ctx, x + 38, ty + 6, false);

  // Farol
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.roundRect(x + 47, ty + 20, 4, 6, 2);
  ctx.fill();

  // Grade
  ctx.fillStyle = "#333";
  ctx.fillRect(x + 48, ty + 15, 2, 15);

  // Lanterna
  ctx.fillStyle = "#FF3333";
  ctx.beginPath();
  ctx.arc(x - 3, ty + 22, 2, 0, Math.PI * 2);
  ctx.fill();

  // Chassi
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x - 6, ty + 30, 58, 5);

  // Rodas
  for (const wx of [x + 6, x + 40]) {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(wx, ty + 37, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(wx, ty + 37, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // PEGUE na lateral da carroceria
  ctx.fillStyle = "#000";
  ctx.font = "bold 6px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", x + 9, ty + 24);
}

function drawTrucado(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bounce = Math.sin(frame * 0.15) * 1;
  const ty = y + bounce;

  // Sombra
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x + 30, ty + 50, 36, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Materiais em cima do bau
  drawMateriais(ctx, x - 8, ty, "grande");

  // BAU grande
  const grad = ctx.createLinearGradient(x - 10, ty, x - 10, ty + 34);
  grad.addColorStop(0, "#D4AF37");
  grad.addColorStop(1, "#B8963F");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x - 10, ty, 42, 34, 3);
  ctx.fill();
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 2;
  ctx.stroke();

  // PEGUE grande no bau
  ctx.fillStyle = "#000";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", x + 11, ty + 22);
  // Linhas
  ctx.strokeStyle = "#00000033";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x - 7, ty + 28); ctx.lineTo(x + 29, ty + 28);
  ctx.stroke();

  // Cabine truck
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.roundRect(x + 34, ty + 4, 26, 30, [0, 8, 5, 0]);
  ctx.fill();

  // Detalhe cromado cabine
  ctx.fillStyle = "#555";
  ctx.fillRect(x + 34, ty + 4, 2, 30);

  // Janela grande
  ctx.fillStyle = "#87CEEB";
  ctx.beginPath();
  ctx.roundRect(x + 38, ty + 6, 18, 13, [2, 6, 2, 2]);
  ctx.fill();

  // Motorista com bone
  drawMotorista(ctx, x + 49, ty + 4, false);

  // Grade frontal cromada
  ctx.fillStyle = "#AAA";
  ctx.fillRect(x + 60, ty + 20, 5, 14);
  ctx.fillStyle = "#888";
  for (let gy = 0; gy < 4; gy++) {
    ctx.fillRect(x + 61, ty + 21 + gy * 3.5, 3, 2);
  }

  // Farol grande
  ctx.fillStyle = "#FFE";
  ctx.beginPath();
  ctx.arc(x + 63, ty + 18, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#DDD";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Para-choque
  ctx.fillStyle = "#C9A84C";
  ctx.fillRect(x + 60, ty + 34, 6, 4);

  // Lanterna
  ctx.fillStyle = "#FF3333";
  ctx.beginPath();
  ctx.arc(x - 9, ty + 26, 3, 0, Math.PI * 2);
  ctx.fill();

  // Chassi pesado
  ctx.fillStyle = "#111";
  ctx.fillRect(x - 12, ty + 34, 78, 8);

  // Tanque de combustivel
  ctx.fillStyle = "#444";
  ctx.beginPath();
  ctx.roundRect(x + 20, ty + 35, 12, 6, 2);
  ctx.fill();

  // Rodas traseiras (duplas x2)
  for (const wx of [x - 2, x + 6, x + 12]) {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(wx, ty + 44, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#444";
    ctx.beginPath();
    ctx.arc(wx, ty + 44, 4, 0, Math.PI * 2);
    ctx.fill();
    const a = frame * 0.15;
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;
    for (let r = 0; r < 3; r++) {
      const ra = a + (r * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(wx, ty + 44);
      ctx.lineTo(wx + Math.cos(ra) * 5.5, ty + 44 + Math.sin(ra) * 5.5);
      ctx.stroke();
    }
  }

  // Roda dianteira
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + 50, ty + 44, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#444";
  ctx.beginPath();
  ctx.arc(x + 50, ty + 44, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Fumaca (escapamento vertical)
  ctx.fillStyle = "rgba(150,150,150,0.3)";
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(x - 14 - i * 6, ty + 20 - i * 5 + Math.sin(frame * 0.1 + i) * 2, 3 + i * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function TesteCaminhaoPage() {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const frameRef = useRef(0);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const drawFns = [drawHR, drawStrada, drawTrucado];

    function animate() {
      frameRef.current++;
      canvasRefs.current.forEach((canvas, i) => {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = 240;
        canvas.height = 100;

        // Fundo ceu
        const grad = ctx.createLinearGradient(0, 0, 0, 60);
        grad.addColorStop(0, "#87CEEB");
        grad.addColorStop(1, "#B0E0E6");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 240, 60);

        // Estrada
        ctx.fillStyle = "#444";
        ctx.fillRect(0, 60, 240, 40);
        ctx.fillStyle = "#666";
        ctx.fillRect(0, 58, 240, 3);
        // Faixa
        ctx.fillStyle = "#FFF";
        const off = (frameRef.current * 2) % 40;
        for (let x = -off; x < 240; x += 40) ctx.fillRect(x, 72, 22, 2);
        ctx.fillStyle = "#C9A84C";
        ctx.fillRect(0, 88, 240, 2);

        drawFns[i](ctx, 80, 16, frameRef.current);
      });
      animRef.current = requestAnimationFrame(animate);
    }
    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white">
            Escolha o <span className="text-[#C9A84C]">Caminhao</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">Fretista de bone pilotando! Qual prefere?</p>
        </div>

        {TRUCKS.map((truck, i) => (
          <div
            key={truck.id}
            onClick={() => setEscolhido(truck.id)}
            className={`cursor-pointer rounded-xl border p-3 transition-all ${
              escolhido === truck.id
                ? "border-[#C9A84C] bg-[#C9A84C]/10"
                : "border-gray-800 bg-[#111] hover:border-gray-600"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-bold text-white">{truck.nome}</p>
                <p className="text-xs text-gray-400">{truck.desc}</p>
              </div>
              {escolhido === truck.id && (
                <span className="text-[#C9A84C] font-bold text-sm">✅</span>
              )}
            </div>
            <canvas
              ref={(el) => { canvasRefs.current[i] = el; }}
              className="w-full rounded-lg"
            />
          </div>
        ))}

        {escolhido && (
          <p className="text-center text-sm text-[#C9A84C]">
            Caminhao {escolhido} selecionado! Me avisa no chat.
          </p>
        )}
      </div>
    </div>
  );
}
