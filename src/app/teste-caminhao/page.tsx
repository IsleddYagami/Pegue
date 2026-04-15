"use client";

import { useEffect, useRef, useState } from "react";

const TRUCKS = [
  { id: 1, nome: "HR / Bau", desc: "Hyundai HR com bau Pegue carregado" },
  { id: 2, nome: "Fiat Strada", desc: "Pickup carregada de mudanca" },
  { id: 3, nome: "Trucado", desc: "Caminhao truck com bau grande" },
];

function drawMotorista(ctx: CanvasRenderingContext2D, x: number, y: number, s: number = 1) {
  ctx.save();
  // Braco debrucado
  ctx.fillStyle = "#4A90D9";
  ctx.beginPath();
  ctx.ellipse(x + 18 * s, y + 28 * s, 10 * s, 5 * s, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#F0C8A0";
  ctx.beginPath();
  ctx.moveTo(x + 24 * s, y + 26 * s);
  ctx.quadraticCurveTo(x + 38 * s, y + 22 * s, x + 40 * s, y + 28 * s);
  ctx.quadraticCurveTo(x + 38 * s, y + 32 * s, x + 24 * s, y + 32 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#F0C8A0";
  ctx.beginPath();
  ctx.arc(x + 40 * s, y + 28 * s, 5 * s, 0, Math.PI * 2);
  ctx.fill();

  // Corpo
  ctx.fillStyle = "#4A90D9";
  ctx.beginPath();
  ctx.roundRect(x - 2 * s, y + 18 * s, 22 * s, 18 * s, 4 * s);
  ctx.fill();

  // Pescoco
  ctx.fillStyle = "#F0C8A0";
  ctx.fillRect(x + 6 * s, y + 12 * s, 8 * s, 8 * s);

  // Cabeca
  ctx.fillStyle = "#F0C8A0";
  ctx.beginPath();
  ctx.ellipse(x + 10 * s, y + 2 * s, 14 * s, 15 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Orelha
  ctx.fillStyle = "#E8B888";
  ctx.beginPath();
  ctx.ellipse(x + 24 * s, y + 4 * s, 4 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cabelo
  ctx.fillStyle = "#5C3A1E";
  ctx.beginPath();
  ctx.arc(x + 10 * s, y + 2 * s, 14 * s, 0.5, Math.PI - 0.5);
  ctx.fill();

  // Bone
  ctx.fillStyle = "#CC2222";
  ctx.beginPath();
  ctx.arc(x + 10 * s, y - 6 * s, 15 * s, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#AA1111";
  ctx.beginPath();
  ctx.moveTo(x + 10 * s, y - 6 * s);
  ctx.quadraticCurveTo(x + 30 * s, y - 8 * s, x + 32 * s, y - 3 * s);
  ctx.quadraticCurveTo(x + 30 * s, y - 2 * s, x + 10 * s, y - 4 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#FFF";
  ctx.font = `bold ${12 * s}px Arial`;
  ctx.textAlign = "center";
  ctx.fillText("P", x + 10 * s, y - 8 * s);

  // Olhos
  for (const ox of [4, 16]) {
    ctx.fillStyle = "#FFF";
    ctx.beginPath();
    ctx.ellipse(x + ox * s, y, 5 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(x + (ox + 1) * s, y + 1 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.beginPath();
    ctx.arc(x + ox * s, y - 1 * s, 1.2 * s, 0, Math.PI * 2);
    ctx.fill();
  }

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

  // Sorriso
  ctx.strokeStyle = "#8B5A2B";
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.arc(x + 10 * s, y + 6 * s, 7 * s, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.arc(x + 10 * s, y + 6 * s, 6 * s, 0.3, Math.PI - 0.3);
  ctx.lineTo(x + 4 * s, y + 7 * s);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawWheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, frame: number) {
  // Pneu
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Banda de rodagem
  ctx.strokeStyle = "#333";
  ctx.lineWidth = r * 0.15;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
  ctx.stroke();
  // Roda (calota)
  ctx.fillStyle = "#888";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
  // Centro
  ctx.fillStyle = "#AAA";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
  // Raios girando
  ctx.strokeStyle = "#999";
  ctx.lineWidth = r * 0.08;
  const a = frame * 0.12;
  for (let i = 0; i < 5; i++) {
    const ra = a + (i * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ra) * r * 0.2, cy + Math.sin(ra) * r * 0.2);
    ctx.lineTo(cx + Math.cos(ra) * r * 0.55, cy + Math.sin(ra) * r * 0.55);
    ctx.stroke();
  }
  // Reflexo
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.arc(cx - r * 0.15, cy - r * 0.15, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawHR(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const gY = y + 108;
  const b = Math.sin(frame * 0.15) * 1;

  // Sombra
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.ellipse(x + 120, gY + 8, 110, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // === BAU ===
  // Base do bau
  ctx.fillStyle = "#C9A84C";
  ctx.beginPath();
  ctx.roundRect(x + 10, y + 16 + b, 120, 70, 4);
  ctx.fill();
  // Gradiente de volume no bau
  const bauGrad = ctx.createLinearGradient(x + 10, y + 16, x + 10, y + 86);
  bauGrad.addColorStop(0, "rgba(255,255,255,0.15)");
  bauGrad.addColorStop(0.5, "rgba(0,0,0,0)");
  bauGrad.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = bauGrad;
  ctx.fillRect(x + 10, y + 16 + b, 120, 70);
  // Borda
  ctx.strokeStyle = "#A08530";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x + 10, y + 16 + b, 120, 70, 4);
  ctx.stroke();
  // Teto do bau (brilho)
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x + 14, y + 18 + b, 112, 6);
  // Linha lateral
  ctx.strokeStyle = "rgba(0,0,0,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 70 + b);
  ctx.lineTo(x + 126, y + 70 + b);
  ctx.stroke();

  // PEGUE no bau
  ctx.fillStyle = "#000";
  ctx.font = "bold 18px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", x + 70, y + 52 + b);
  ctx.font = "8px Arial";
  ctx.fillStyle = "#555";
  ctx.fillText("FRETE & MUDANCA", x + 70, y + 64 + b);

  // Porta traseira entreaberta
  ctx.fillStyle = "#B89A40";
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 18 + b, 8, 66, [3, 0, 0, 3]);
  ctx.fill();
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Trinco
  ctx.fillStyle = "#777";
  ctx.fillRect(x + 7, y + 48 + b, 3, 8);

  // === CABINE BRANCA ===
  // Corpo cabine
  ctx.fillStyle = "#F2F2F2";
  ctx.beginPath();
  ctx.moveTo(x + 132, y + 86 + b);
  ctx.lineTo(x + 132, y + 30 + b);
  ctx.quadraticCurveTo(x + 134, y + 22 + b, x + 142, y + 20 + b);
  ctx.lineTo(x + 192, y + 18 + b);
  ctx.quadraticCurveTo(x + 200, y + 20 + b, x + 202, y + 30 + b);
  ctx.lineTo(x + 202, y + 86 + b);
  ctx.closePath();
  ctx.fill();
  // Sombra na cabine
  const cabShadow = ctx.createLinearGradient(x + 132, y + 20, x + 202, y + 20);
  cabShadow.addColorStop(0, "rgba(0,0,0,0.06)");
  cabShadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cabShadow;
  ctx.fillRect(x + 132, y + 20 + b, 70, 66);
  // Contorno
  ctx.strokeStyle = "#D8D8D8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 132, y + 86 + b);
  ctx.lineTo(x + 132, y + 30 + b);
  ctx.quadraticCurveTo(x + 134, y + 22 + b, x + 142, y + 20 + b);
  ctx.lineTo(x + 192, y + 18 + b);
  ctx.quadraticCurveTo(x + 200, y + 20 + b, x + 202, y + 30 + b);
  ctx.lineTo(x + 202, y + 86 + b);
  ctx.stroke();

  // Friso azul Hyundai
  ctx.fillStyle = "#2266BB";
  ctx.fillRect(x + 132, y + 78 + b, 70, 4);

  // Parabrisa
  ctx.fillStyle = "#A8D8EA";
  ctx.beginPath();
  ctx.moveTo(x + 140, y + 24 + b);
  ctx.lineTo(x + 196, y + 22 + b);
  ctx.quadraticCurveTo(x + 200, y + 24 + b, x + 200, y + 28 + b);
  ctx.lineTo(x + 200, y + 55 + b);
  ctx.lineTo(x + 138, y + 57 + b);
  ctx.closePath();
  ctx.fill();
  // Reflexo no vidro
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.moveTo(x + 185, y + 24 + b);
  ctx.lineTo(x + 196, y + 23 + b);
  ctx.lineTo(x + 198, y + 50 + b);
  ctx.lineTo(x + 190, y + 52 + b);
  ctx.closePath();
  ctx.fill();
  // Divisor
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 168, y + 23 + b);
  ctx.lineTo(x + 168, y + 56 + b);
  ctx.stroke();

  // Motorista
  drawMotorista(ctx, x + 145, y + 20 + b, 0.75);

  // Grade frontal
  ctx.fillStyle = "#E0E0E0";
  ctx.beginPath();
  ctx.roundRect(x + 202, y + 58 + b, 8, 24, [0, 4, 4, 0]);
  ctx.fill();
  ctx.strokeStyle = "#CCC";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Logo H
  ctx.fillStyle = "#2266BB";
  ctx.font = "bold 8px Arial";
  ctx.textAlign = "center";
  ctx.fillText("H", x + 206, y + 73 + b);

  // Farol
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.roundRect(x + 203, y + 52 + b, 7, 8, [0, 3, 3, 0]);
  ctx.fill();
  ctx.strokeStyle = "#DDD";
  ctx.stroke();
  // Seta
  ctx.fillStyle = "#FFA500";
  ctx.beginPath();
  ctx.roundRect(x + 203, y + 83 + b, 7, 4, [0, 2, 2, 0]);
  ctx.fill();

  // Lanterna traseira
  ctx.fillStyle = "#EE2222";
  ctx.beginPath();
  ctx.roundRect(x + 5, y + 62 + b, 5, 14, 2);
  ctx.fill();

  // Chassi
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 86 + b, 212, 10, 2);
  ctx.fill();

  // Rodas
  drawWheel(ctx, x + 45, gY, 14, frame);
  drawWheel(ctx, x + 65, gY, 14, frame);
  drawWheel(ctx, x + 185, gY, 13, frame);

  // Fumaca
  ctx.fillStyle = "rgba(180,180,180,0.2)";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x - 2 - i * 12, gY - 16 - i * 10 + Math.sin(frame * 0.08 + i) * 4, 5 + i * 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStrada(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const gY = y + 100;
  const b = Math.sin(frame * 0.15) * 1;

  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.ellipse(x + 105, gY + 7, 95, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // === CACAMBA ===
  ctx.fillStyle = "#CC2222";
  ctx.beginPath();
  ctx.roundRect(x + 8, y + 32 + b, 88, 46, [4, 0, 0, 4]);
  ctx.fill();
  // Volume
  const cacGrad = ctx.createLinearGradient(x + 8, y + 32, x + 8, y + 78);
  cacGrad.addColorStop(0, "rgba(255,255,255,0.1)");
  cacGrad.addColorStop(1, "rgba(0,0,0,0.15)");
  ctx.fillStyle = cacGrad;
  ctx.fillRect(x + 8, y + 32 + b, 88, 46);
  ctx.strokeStyle = "#991111";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x + 8, y + 32 + b, 88, 46, [4, 0, 0, 4]);
  ctx.stroke();

  // PEGUE na lateral
  ctx.fillStyle = "#FFF";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", x + 52, y + 70 + b);

  // Materiais na cacamba
  // Geladeira
  ctx.fillStyle = "#E8E8E8";
  ctx.beginPath();
  ctx.roundRect(x + 14, y + 8 + b, 22, 36, 2);
  ctx.fill();
  ctx.strokeStyle = "#CCC";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#D0D0D0";
  ctx.fillRect(x + 16, y + 10 + b, 18, 14);
  ctx.fillRect(x + 16, y + 26 + b, 18, 10);
  ctx.fillStyle = "#AAA";
  ctx.fillRect(x + 32, y + 20 + b, 2, 4);
  ctx.fillRect(x + 32, y + 30 + b, 2, 3);

  // Caixas
  ctx.fillStyle = "#8B6530";
  ctx.beginPath();
  ctx.roundRect(x + 40, y + 18 + b, 22, 24, 2);
  ctx.fill();
  ctx.fillStyle = "#DAA520";
  ctx.fillRect(x + 50, y + 18 + b, 2, 24);
  ctx.fillRect(x + 40, y + 28 + b, 22, 2);

  ctx.fillStyle = "#9B7540";
  ctx.beginPath();
  ctx.roundRect(x + 42, y + 4 + b, 18, 16, 2);
  ctx.fill();
  ctx.fillStyle = "#DAA520";
  ctx.fillRect(x + 50, y + 4 + b, 2, 16);

  // Colchao enrolado
  ctx.fillStyle = "#D4A0A0";
  ctx.beginPath();
  ctx.ellipse(x + 74, y + 16 + b, 8, 18, Math.PI / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#B08080";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Espiral do colchao
  ctx.strokeStyle = "#C09090";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(x + 74, y + 16 + b, 4, 0, Math.PI * 4);
  ctx.stroke();

  // === CABINE STRADA ===
  ctx.fillStyle = "#CC2222";
  ctx.beginPath();
  ctx.moveTo(x + 98, y + 78 + b);
  ctx.lineTo(x + 98, y + 30 + b);
  ctx.quadraticCurveTo(x + 100, y + 18 + b, x + 115, y + 14 + b);
  ctx.lineTo(x + 180, y + 10 + b);
  ctx.quadraticCurveTo(x + 195, y + 12 + b, x + 196, y + 28 + b);
  ctx.lineTo(x + 196, y + 78 + b);
  ctx.closePath();
  ctx.fill();
  // Volume
  const stGrad = ctx.createLinearGradient(x + 98, y + 10, x + 196, y + 10);
  stGrad.addColorStop(0, "rgba(0,0,0,0.08)");
  stGrad.addColorStop(0.5, "rgba(255,255,255,0.05)");
  stGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = stGrad;
  ctx.fillRect(x + 98, y + 10 + b, 98, 68);
  ctx.strokeStyle = "#991111";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 98, y + 78 + b);
  ctx.lineTo(x + 98, y + 30 + b);
  ctx.quadraticCurveTo(x + 100, y + 18 + b, x + 115, y + 14 + b);
  ctx.lineTo(x + 180, y + 10 + b);
  ctx.quadraticCurveTo(x + 195, y + 12 + b, x + 196, y + 28 + b);
  ctx.lineTo(x + 196, y + 78 + b);
  ctx.stroke();

  // Parabrisa
  ctx.fillStyle = "#A8D8EA";
  ctx.beginPath();
  ctx.moveTo(x + 120, y + 18 + b);
  ctx.lineTo(x + 188, y + 14 + b);
  ctx.quadraticCurveTo(x + 194, y + 16 + b, x + 194, y + 22 + b);
  ctx.lineTo(x + 194, y + 48 + b);
  ctx.lineTo(x + 118, y + 52 + b);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.moveTo(x + 178, y + 15 + b);
  ctx.lineTo(x + 190, y + 14 + b);
  ctx.lineTo(x + 192, y + 44 + b);
  ctx.lineTo(x + 182, y + 46 + b);
  ctx.closePath();
  ctx.fill();

  // Motorista
  drawMotorista(ctx, x + 126, y + 14 + b, 0.7);

  // Macaneta
  ctx.fillStyle = "#AA1111";
  ctx.beginPath();
  ctx.roundRect(x + 104, y + 56 + b, 8, 3, 1);
  ctx.fill();

  // Farol
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.moveTo(x + 196, y + 24 + b);
  ctx.lineTo(x + 202, y + 22 + b);
  ctx.lineTo(x + 202, y + 36 + b);
  ctx.lineTo(x + 196, y + 38 + b);
  ctx.closePath();
  ctx.fill();
  // Seta
  ctx.fillStyle = "#FFA500";
  ctx.beginPath();
  ctx.roundRect(x + 196, y + 40 + b, 6, 5, [0, 2, 2, 0]);
  ctx.fill();

  // Lanterna
  ctx.fillStyle = "#EE2222";
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 54 + b, 5, 14, 2);
  ctx.fill();

  // Chassi
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 78 + b, 202, 8, 2);
  ctx.fill();

  // Rodas
  drawWheel(ctx, x + 42, gY, 13, frame);
  drawWheel(ctx, x + 172, gY, 12, frame);
}

function drawTrucado(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const gY = y + 118;
  const b = Math.sin(frame * 0.15) * 1;

  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.ellipse(x + 140, gY + 9, 130, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // === BAU GRANDE ===
  ctx.fillStyle = "#C9A84C";
  ctx.beginPath();
  ctx.roundRect(x + 8, y + 10 + b, 155, 80, 4);
  ctx.fill();
  const bGrad = ctx.createLinearGradient(x + 8, y + 10, x + 8, y + 90);
  bGrad.addColorStop(0, "rgba(255,255,255,0.15)");
  bGrad.addColorStop(0.3, "rgba(0,0,0,0)");
  bGrad.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = bGrad;
  ctx.fillRect(x + 8, y + 10 + b, 155, 80);
  ctx.strokeStyle = "#A08530";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x + 8, y + 10 + b, 155, 80, 4);
  ctx.stroke();

  // Teto brilho
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x + 12, y + 12 + b, 147, 8);

  // PEGUE
  ctx.fillStyle = "#000";
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", x + 85, y + 56 + b);
  ctx.font = "bold 9px Arial";
  ctx.fillStyle = "#444";
  ctx.fillText("FRETE & MUDANCA", x + 85, y + 72 + b);

  // Materiais em cima do bau
  ctx.fillStyle = "#D4A0A0";
  ctx.beginPath();
  ctx.roundRect(x + 30, y + 2 + b, 60, 8, 3);
  ctx.fill();
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 40, y + 2 + b); ctx.lineTo(x + 40, y + 14 + b);
  ctx.moveTo(x + 80, y + 2 + b); ctx.lineTo(x + 80, y + 14 + b);
  ctx.stroke();
  // Mesa
  ctx.fillStyle = "#6B4226";
  ctx.fillRect(x + 100, y + 0 + b, 40, 4);
  ctx.fillRect(x + 105, y - 12 + b, 3, 12);
  ctx.fillRect(x + 133, y - 12 + b, 3, 12);

  // === CABINE TRUCK ===
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.moveTo(x + 166, y + 90 + b);
  ctx.lineTo(x + 166, y + 28 + b);
  ctx.quadraticCurveTo(x + 168, y + 18 + b, x + 178, y + 16 + b);
  ctx.lineTo(x + 242, y + 12 + b);
  ctx.quadraticCurveTo(x + 254, y + 14 + b, x + 256, y + 28 + b);
  ctx.lineTo(x + 256, y + 90 + b);
  ctx.closePath();
  ctx.fill();
  const tcGrad = ctx.createLinearGradient(x + 166, y + 12, x + 256, y + 12);
  tcGrad.addColorStop(0, "rgba(255,255,255,0.06)");
  tcGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = tcGrad;
  ctx.fillRect(x + 166, y + 12 + b, 90, 78);
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 166, y + 90 + b);
  ctx.lineTo(x + 166, y + 28 + b);
  ctx.quadraticCurveTo(x + 168, y + 18 + b, x + 178, y + 16 + b);
  ctx.lineTo(x + 242, y + 12 + b);
  ctx.quadraticCurveTo(x + 254, y + 14 + b, x + 256, y + 28 + b);
  ctx.lineTo(x + 256, y + 90 + b);
  ctx.stroke();

  // Parabrisa
  ctx.fillStyle = "#A8D8EA";
  ctx.beginPath();
  ctx.moveTo(x + 178, y + 20 + b);
  ctx.lineTo(x + 248, y + 16 + b);
  ctx.quadraticCurveTo(x + 254, y + 18 + b, x + 254, y + 24 + b);
  ctx.lineTo(x + 254, y + 56 + b);
  ctx.lineTo(x + 176, y + 60 + b);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.moveTo(x + 238, y + 17 + b);
  ctx.lineTo(x + 250, y + 16 + b);
  ctx.lineTo(x + 252, y + 52 + b);
  ctx.lineTo(x + 242, y + 54 + b);
  ctx.closePath();
  ctx.fill();

  // Motorista
  drawMotorista(ctx, x + 184, y + 16 + b, 0.78);

  // Grade frontal cromada
  ctx.fillStyle = "#C0C0C0";
  ctx.beginPath();
  ctx.roundRect(x + 256, y + 60 + b, 10, 28, [0, 4, 4, 0]);
  ctx.fill();
  ctx.strokeStyle = "#AAA";
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let gy = 0; gy < 5; gy++) {
    ctx.fillStyle = "#999";
    ctx.fillRect(x + 258, y + 62 + gy * 5.5 + b, 6, 2.5);
  }

  // Farol
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.roundRect(x + 257, y + 52 + b, 8, 10, [0, 3, 3, 0]);
  ctx.fill();
  ctx.strokeStyle = "#DDD";
  ctx.stroke();

  // Para-choque dourado
  ctx.fillStyle = "#C9A84C";
  ctx.beginPath();
  ctx.roundRect(x + 256, y + 90 + b, 12, 8, [0, 4, 4, 0]);
  ctx.fill();

  // Lanterna
  ctx.fillStyle = "#EE2222";
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 58 + b, 5, 16, 2);
  ctx.fill();

  // Tanque
  ctx.fillStyle = "#444";
  ctx.beginPath();
  ctx.roundRect(x + 155, y + 84 + b, 14, 10, 3);
  ctx.fill();

  // Chassi
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.roundRect(x, y + 92 + b, 270, 12, 2);
  ctx.fill();

  // Rodas
  drawWheel(ctx, x + 38, gY, 16, frame);
  drawWheel(ctx, x + 65, gY, 16, frame);
  drawWheel(ctx, x + 232, gY, 15, frame);
}

export default function TesteCaminhaoPage() {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const frameRef = useRef(0);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const drawFns = [drawHR, drawStrada, drawTrucado];
    const sizes = [
      { w: 440, h: 150 },
      { w: 420, h: 140 },
      { w: 500, h: 170 },
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

        // Ceu
        const grad = ctx.createLinearGradient(0, 0, 0, sz.h * 0.72);
        grad.addColorStop(0, "#87CEEB");
        grad.addColorStop(1, "#C8E6F0");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, sz.w, sz.h * 0.72);

        // Estrada
        ctx.fillStyle = "#555";
        ctx.fillRect(0, sz.h * 0.72, sz.w, sz.h * 0.3);
        ctx.fillStyle = "#777";
        ctx.fillRect(0, sz.h * 0.70, sz.w, 3);
        ctx.fillStyle = "#FFF";
        const off = (frameRef.current * 3) % 50;
        for (let fx = -off; fx < sz.w; fx += 50) ctx.fillRect(fx, sz.h * 0.82, 28, 3);
        ctx.fillStyle = "#C9A84C";
        ctx.fillRect(0, sz.h * 0.94, sz.w, 3);

        drawFns[i](ctx, 50, 12, frameRef.current);
      });
      animRef.current = requestAnimationFrame(animate);
    }
    animate();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
      <div className="w-full max-w-xl space-y-4 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white">
            Escolha o <span className="text-[#C9A84C]">Veiculo</span>
          </h1>
          <p className="mt-1 text-sm text-gray-400">Qual vai representar a Pegue no jogo?</p>
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
            Veiculo {escolhido} selecionado! Me avisa no chat qual escolheu.
          </p>
        )}
      </div>
    </div>
  );
}
