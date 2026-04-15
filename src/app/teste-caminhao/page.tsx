"use client";

import { useEffect, useRef, useState } from "react";

const TRUCKS = [
  { id: 1, nome: "HR / Bau", desc: "Hyundai HR com bau Pegue" },
  { id: 2, nome: "Fiat Strada", desc: "Pickup com carroceria carregada" },
  { id: 3, nome: "Trucado", desc: "Caminhao grande com bau" },
];

// Motorista estilo cartoon - visivel pela janela, debrucado pra fora
function drawMotorista(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number = 1) {
  ctx.save();
  const s = scale;

  // Braco debrucado pra fora da janela
  // Manga camisa azul
  ctx.fillStyle = "#4A90D9";
  ctx.beginPath();
  ctx.ellipse(x + 18 * s, y + 28 * s, 10 * s, 6 * s, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Braco pele
  ctx.fillStyle = "#F0C8A0";
  ctx.beginPath();
  ctx.moveTo(x + 24 * s, y + 26 * s);
  ctx.quadraticCurveTo(x + 38 * s, y + 22 * s, x + 40 * s, y + 28 * s);
  ctx.quadraticCurveTo(x + 38 * s, y + 32 * s, x + 24 * s, y + 32 * s);
  ctx.closePath();
  ctx.fill();
  // Mao
  ctx.fillStyle = "#F0C8A0";
  ctx.beginPath();
  ctx.arc(x + 40 * s, y + 28 * s, 5 * s, 0, Math.PI * 2);
  ctx.fill();

  // Corpo (camisa azul) - visivel pela janela
  ctx.fillStyle = "#4A90D9";
  ctx.beginPath();
  ctx.roundRect(x - 2 * s, y + 18 * s, 22 * s, 20 * s, 4 * s);
  ctx.fill();

  // Pescoco
  ctx.fillStyle = "#F0C8A0";
  ctx.fillRect(x + 6 * s, y + 12 * s, 8 * s, 8 * s);

  // Cabeca - oval grande, estilo cartoon
  ctx.fillStyle = "#F0C8A0";
  ctx.beginPath();
  ctx.ellipse(x + 10 * s, y + 2 * s, 14 * s, 16 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Orelha direita (visivel)
  ctx.fillStyle = "#E8B888";
  ctx.beginPath();
  ctx.ellipse(x + 24 * s, y + 4 * s, 4 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#D4A070";
  ctx.beginPath();
  ctx.ellipse(x + 24 * s, y + 4 * s, 2 * s, 3.5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cabelo castanho (por baixo do bone)
  ctx.fillStyle = "#5C3A1E";
  ctx.beginPath();
  ctx.arc(x + 10 * s, y + 2 * s, 14 * s, 0.5, Math.PI - 0.5);
  ctx.fill();
  // Topete saindo do bone
  ctx.fillStyle = "#5C3A1E";
  ctx.beginPath();
  ctx.moveTo(x + 22 * s, y - 10 * s);
  ctx.quadraticCurveTo(x + 28 * s, y - 14 * s, x + 24 * s, y - 6 * s);
  ctx.fill();

  // Bone vermelho (estilo da referencia)
  ctx.fillStyle = "#CC2222";
  ctx.beginPath();
  ctx.arc(x + 10 * s, y - 6 * s, 15 * s, Math.PI, 0);
  ctx.fill();
  // Aba do bone
  ctx.fillStyle = "#AA1111";
  ctx.beginPath();
  ctx.moveTo(x + 10 * s, y - 6 * s);
  ctx.quadraticCurveTo(x + 30 * s, y - 8 * s, x + 32 * s, y - 3 * s);
  ctx.quadraticCurveTo(x + 30 * s, y - 2 * s, x + 10 * s, y - 4 * s);
  ctx.closePath();
  ctx.fill();
  // Logo P no bone
  ctx.fillStyle = "#FFF";
  ctx.font = `bold ${12 * s}px Arial`;
  ctx.textAlign = "center";
  ctx.fillText("P", x + 10 * s, y - 8 * s);

  // Olhos - expressivos cartoon
  // Olho esquerdo
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.ellipse(x + 4 * s, y + 0 * s, 5 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(x + 5 * s, y + 1 * s, 3 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.arc(x + 4 * s, y - 1 * s, 1.2 * s, 0, Math.PI * 2);
  ctx.fill();

  // Olho direito
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.ellipse(x + 16 * s, y + 0 * s, 5 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(x + 17 * s, y + 1 * s, 3 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.arc(x + 16 * s, y - 1 * s, 1.2 * s, 0, Math.PI * 2);
  ctx.fill();

  // Sobrancelhas
  ctx.strokeStyle = "#4A2A0A";
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.arc(x + 4 * s, y - 5 * s, 5 * s, -0.5, 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 16 * s, y - 5 * s, 5 * s, Math.PI - 0.8, Math.PI + 0.5);
  ctx.stroke();

  // Nariz
  ctx.fillStyle = "#E0A878";
  ctx.beginPath();
  ctx.arc(x + 12 * s, y + 5 * s, 3 * s, 0, Math.PI * 2);
  ctx.fill();

  // Sorriso grande
  ctx.strokeStyle = "#8B5A2B";
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.arc(x + 10 * s, y + 6 * s, 7 * s, 0.2, Math.PI - 0.2);
  ctx.stroke();
  // Dentes
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.arc(x + 10 * s, y + 6 * s, 6 * s, 0.3, Math.PI - 0.3);
  ctx.lineTo(x + 4 * s, y + 7 * s);
  ctx.closePath();
  ctx.fill();

  // Ruguinhas do sorriso
  ctx.strokeStyle = "#D4A070";
  ctx.lineWidth = 1 * s;
  ctx.beginPath();
  ctx.arc(x + 2 * s, y + 6 * s, 3 * s, -0.5, 0.5);
  ctx.stroke();

  ctx.restore();
}

function drawHR(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const W = 180, H = 90;
  const groundY = y + H - 12;
  const bounce = Math.sin(frame * 0.15) * 1;

  // Sombra
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(x + W / 2, groundY + 6, W * 0.45, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // === BAU ===
  const bauX = x + 10, bauY = y + 10 + bounce, bauW = 95, bauH = 55;
  // Corpo do bau
  const grad = ctx.createLinearGradient(bauX, bauY, bauX, bauY + bauH);
  grad.addColorStop(0, "#D9B84A");
  grad.addColorStop(1, "#C9A84C");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(bauX, bauY, bauW, bauH, 4);
  ctx.fill();
  ctx.strokeStyle = "#A08530";
  ctx.lineWidth = 2;
  ctx.stroke();

  // PEGUE no bau
  ctx.fillStyle = "#000";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", bauX + bauW / 2, bauY + bauH / 2 + 5);
  // Sublinha
  ctx.strokeStyle = "#00000033";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bauX + 10, bauY + bauH - 12);
  ctx.lineTo(bauX + bauW - 10, bauY + bauH - 12);
  ctx.stroke();

  // === CABINE ===
  const cabX = x + 108, cabY = y + 18 + bounce, cabW = 55, cabH = 47;
  ctx.fillStyle = "#F0F0F0";
  ctx.beginPath();
  ctx.roundRect(cabX, cabY, cabW, cabH, [0, 10, 6, 0]);
  ctx.fill();
  ctx.strokeStyle = "#D0D0D0";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Parabrisa
  ctx.fillStyle = "#B8DFEF";
  ctx.beginPath();
  ctx.moveTo(cabX + 10, cabY + 4);
  ctx.lineTo(cabX + cabW - 4, cabY + 2);
  ctx.lineTo(cabX + cabW - 2, cabY + 28);
  ctx.lineTo(cabX + 8, cabY + 28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#8AB8CC";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Motorista na janela
  drawMotorista(ctx, cabX + 12, cabY + 2, 0.7);

  // Grade frontal
  ctx.fillStyle = "#DDD";
  ctx.beginPath();
  ctx.roundRect(cabX + cabW - 2, cabY + 30, 6, 15, [0, 3, 3, 0]);
  ctx.fill();
  // Farol
  ctx.fillStyle = "#FFF";
  ctx.strokeStyle = "#CCC";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cabX + cabW - 1, cabY + 26, 6, 6, 2);
  ctx.fill();
  ctx.stroke();

  // Lanterna traseira
  ctx.fillStyle = "#FF3333";
  ctx.beginPath();
  ctx.roundRect(bauX - 2, bauY + bauH - 15, 4, 10, 1);
  ctx.fill();

  // Chassi
  ctx.fillStyle = "#222";
  ctx.fillRect(x + 5, groundY - 8, W - 5, 8);

  // Rodas
  const wheelR = 12;
  for (const wx of [x + 35, x + 50, x + 145]) {
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(wx, groundY, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#444";
    ctx.beginPath();
    ctx.arc(wx, groundY, wheelR * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#666";
    ctx.beginPath();
    ctx.arc(wx, groundY, wheelR * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fumaca
  ctx.fillStyle = "rgba(180,180,180,0.3)";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x + 2 - i * 10, groundY - 20 - i * 8 + Math.sin(frame * 0.1 + i) * 3, 5 + i * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStrada(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const W = 170, H = 80;
  const groundY = y + H - 10;
  const bounce = Math.sin(frame * 0.15) * 1;

  // Sombra
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(x + W / 2, groundY + 5, W * 0.42, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // === CACAMBA ===
  const cacX = x + 8, cacY = y + 24 + bounce, cacW = 70, cacH = 35;
  ctx.fillStyle = "#CC2222";
  ctx.beginPath();
  ctx.roundRect(cacX, cacY, cacW, cacH, [3, 0, 0, 3]);
  ctx.fill();
  ctx.strokeStyle = "#991111";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Materiais na cacamba
  // Geladeira
  ctx.fillStyle = "#E0E0E0";
  ctx.fillRect(cacX + 5, cacY - 20 + bounce, 16, 28);
  ctx.fillStyle = "#CCC";
  ctx.fillRect(cacX + 7, cacY - 18 + bounce, 12, 12);
  ctx.fillRect(cacX + 7, cacY - 4 + bounce, 12, 8);
  ctx.fillStyle = "#AAA";
  ctx.fillRect(cacX + 17, cacY - 10 + bounce, 1.5, 4);
  // Caixas
  ctx.fillStyle = "#8B4513";
  ctx.fillRect(cacX + 24, cacY - 12 + bounce, 16, 18);
  ctx.fillStyle = "#DAA520";
  ctx.fillRect(cacX + 31, cacY - 12 + bounce, 1.5, 18);
  ctx.fillStyle = "#A0522D";
  ctx.fillRect(cacX + 26, cacY - 22 + bounce, 12, 12);
  ctx.fillStyle = "#DAA520";
  ctx.fillRect(cacX + 31, cacY - 22 + bounce, 1.5, 12);
  // Colchao enrolado
  ctx.fillStyle = "#D4A0A0";
  ctx.beginPath();
  ctx.ellipse(cacX + 50, cacY - 14 + bounce, 6, 14, Math.PI / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#B08080";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // PEGUE na lateral
  ctx.fillStyle = "#FFF";
  ctx.font = "bold 9px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", cacX + cacW / 2, cacY + cacH - 6);

  // === CABINE STRADA ===
  const cabX = x + 80, cabY = y + 12 + bounce, cabW = 72, cabH = 47;
  // Corpo vermelho com curva
  ctx.fillStyle = "#CC2222";
  ctx.beginPath();
  ctx.moveTo(cabX, cabY + cabH);
  ctx.lineTo(cabX, cabY + 12);
  ctx.quadraticCurveTo(cabX + 5, cabY, cabX + 20, cabY - 2);
  ctx.lineTo(cabX + cabW - 10, cabY - 4);
  ctx.quadraticCurveTo(cabX + cabW, cabY - 2, cabX + cabW, cabY + 15);
  ctx.lineTo(cabX + cabW, cabY + cabH);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#991111";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Parabrisa grande
  ctx.fillStyle = "#B8DFEF";
  ctx.beginPath();
  ctx.moveTo(cabX + 22, cabY + 2);
  ctx.lineTo(cabX + cabW - 6, cabY);
  ctx.lineTo(cabX + cabW - 4, cabY + 26);
  ctx.lineTo(cabX + 18, cabY + 28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#8AB8CC";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Motorista
  drawMotorista(ctx, cabX + 26, cabY - 2, 0.65);

  // Farol
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.moveTo(cabX + cabW, cabY + 10);
  ctx.lineTo(cabX + cabW + 5, cabY + 8);
  ctx.lineTo(cabX + cabW + 5, cabY + 22);
  ctx.lineTo(cabX + cabW, cabY + 22);
  ctx.closePath();
  ctx.fill();

  // Lanterna
  ctx.fillStyle = "#FF3333";
  ctx.beginPath();
  ctx.roundRect(cacX - 3, cacY + cacH - 12, 4, 8, 1);
  ctx.fill();

  // Chassi
  ctx.fillStyle = "#222";
  ctx.fillRect(x + 3, groundY - 6, W, 6);

  // Rodas
  const wheelR = 11;
  for (const wx of [x + 32, x + 135]) {
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(wx, groundY - 1, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#444";
    ctx.beginPath();
    ctx.arc(wx, groundY - 1, wheelR * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#666";
    ctx.beginPath();
    ctx.arc(wx, groundY - 1, wheelR * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTrucado(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const W = 210, H = 100;
  const groundY = y + H - 12;
  const bounce = Math.sin(frame * 0.15) * 1;

  // Sombra
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(x + W / 2, groundY + 7, W * 0.46, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // === BAU GRANDE ===
  const bauX = x + 5, bauY = y + 6 + bounce, bauW = 120, bauH = 66;
  const grad = ctx.createLinearGradient(bauX, bauY, bauX, bauY + bauH);
  grad.addColorStop(0, "#D9B84A");
  grad.addColorStop(1, "#C9A84C");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(bauX, bauY, bauW, bauH, 4);
  ctx.fill();
  ctx.strokeStyle = "#A08530";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // PEGUE grande
  ctx.fillStyle = "#000";
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", bauX + bauW / 2, bauY + bauH / 2 + 7);
  // Frete e Mudanca
  ctx.font = "bold 8px Arial";
  ctx.fillText("FRETE & MUDANCA", bauX + bauW / 2, bauY + bauH / 2 + 20);

  // Materiais amarrados em cima do bau
  // Colchao
  ctx.fillStyle = "#D4A0A0";
  ctx.beginPath();
  ctx.roundRect(bauX + 15, bauY - 8 + bounce, 50, 8, 3);
  ctx.fill();
  ctx.strokeStyle = "#B08080";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Cordas
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bauX + 25, bauY - 8 + bounce); ctx.lineTo(bauX + 25, bauY + 5);
  ctx.moveTo(bauX + 55, bauY - 8 + bounce); ctx.lineTo(bauX + 55, bauY + 5);
  ctx.stroke();
  // Mesa de pernas pra cima
  ctx.fillStyle = "#6B4226";
  ctx.fillRect(bauX + 70, bauY - 10 + bounce, 30, 4);
  ctx.fillRect(bauX + 74, bauY - 22 + bounce, 3, 12);
  ctx.fillRect(bauX + 93, bauY - 22 + bounce, 3, 12);

  // === CABINE TRUCK ===
  const cabX = x + 128, cabY = y + 14 + bounce, cabW = 65, cabH = 58;
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.roundRect(cabX, cabY, cabW, cabH, [0, 12, 8, 0]);
  ctx.fill();
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Parabrisa grande
  ctx.fillStyle = "#B8DFEF";
  ctx.beginPath();
  ctx.moveTo(cabX + 12, cabY + 4);
  ctx.lineTo(cabX + cabW - 6, cabY + 2);
  ctx.quadraticCurveTo(cabX + cabW - 2, cabY + 4, cabX + cabW - 2, cabY + 10);
  ctx.lineTo(cabX + cabW - 2, cabY + 32);
  ctx.lineTo(cabX + 10, cabY + 34);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#8AB8CC";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Motorista
  drawMotorista(ctx, cabX + 16, cabY, 0.75);

  // Grade frontal cromada
  ctx.fillStyle = "#BBB";
  ctx.beginPath();
  ctx.roundRect(cabX + cabW - 2, cabY + 34, 8, 20, [0, 4, 4, 0]);
  ctx.fill();
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Linhas da grade
  for (let gy = 0; gy < 4; gy++) {
    ctx.fillStyle = "#888";
    ctx.fillRect(cabX + cabW, cabY + 36 + gy * 5, 5, 2);
  }

  // Farol grande
  ctx.fillStyle = "#FFF";
  ctx.strokeStyle = "#CCC";
  ctx.beginPath();
  ctx.roundRect(cabX + cabW, cabY + 28, 7, 8, 2);
  ctx.fill();
  ctx.stroke();

  // Para-choque
  ctx.fillStyle = "#C9A84C";
  ctx.beginPath();
  ctx.roundRect(cabX + cabW - 2, cabY + cabH - 4, 10, 6, 2);
  ctx.fill();

  // Lanterna traseira
  ctx.fillStyle = "#FF3333";
  ctx.beginPath();
  ctx.roundRect(bauX - 3, bauY + bauH - 18, 4, 12, 1);
  ctx.fill();

  // Tanque diesel
  ctx.fillStyle = "#555";
  ctx.beginPath();
  ctx.roundRect(cabX - 5, cabY + cabH - 8, 18, 10, 3);
  ctx.fill();

  // Chassi pesado
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x, groundY - 10, W + 5, 10);

  // Rodas (3 eixos)
  const wheelR = 14;
  for (const wx of [x + 30, x + 52, x + 168]) {
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.arc(wx, groundY, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#444";
    ctx.beginPath();
    ctx.arc(wx, groundY, wheelR * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#666";
    ctx.beginPath();
    ctx.arc(wx, groundY, wheelR * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fumaca escapamento
  ctx.fillStyle = "rgba(180,180,180,0.25)";
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(x - 2 - i * 12, groundY - 30 - i * 10 + Math.sin(frame * 0.1 + i) * 4, 6 + i * 4, 0, Math.PI * 2);
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
    const sizes = [
      { w: 340, h: 130 },
      { w: 320, h: 120 },
      { w: 380, h: 150 },
    ];

    function animate() {
      frameRef.current++;
      canvasRefs.current.forEach((canvas, i) => {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const sz = sizes[i];
        canvas.width = sz.w;
        canvas.height = sz.h;

        // Fundo ceu
        const grad = ctx.createLinearGradient(0, 0, 0, sz.h * 0.7);
        grad.addColorStop(0, "#87CEEB");
        grad.addColorStop(1, "#C8E6F0");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, sz.w, sz.h * 0.72);

        // Estrada
        ctx.fillStyle = "#555";
        ctx.fillRect(0, sz.h * 0.72, sz.w, sz.h * 0.3);
        ctx.fillStyle = "#777";
        ctx.fillRect(0, sz.h * 0.70, sz.w, 3);
        // Faixa tracejada
        ctx.fillStyle = "#FFF";
        const off = (frameRef.current * 3) % 50;
        for (let fx = -off; fx < sz.w; fx += 50) ctx.fillRect(fx, sz.h * 0.82, 28, 3);
        // Faixa dourada
        ctx.fillStyle = "#C9A84C";
        ctx.fillRect(0, sz.h * 0.94, sz.w, 3);

        drawFns[i](ctx, 40, 10, frameRef.current);
      });
      animRef.current = requestAnimationFrame(animate);
    }
    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
      <div className="w-full max-w-lg space-y-4 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white">
            Escolha o <span className="text-[#C9A84C]">Veiculo</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">Qual vai representar a Pegue?</p>
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
                <span className="text-[#C9A84C] font-bold text-sm">✅ Escolhido</span>
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
            Veiculo {escolhido} selecionado! Me avisa no chat.
          </p>
        )}
      </div>
    </div>
  );
}
