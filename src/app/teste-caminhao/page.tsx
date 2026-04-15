"use client";

import { useEffect, useRef, useState } from "react";

const TRUCKS = [
  { id: 1, nome: "HR / Bau", desc: "Hyundai HR com bau e fretista de bone" },
  { id: 2, nome: "Fiat Strada", desc: "Pickup Strada com carroceria e pacotes" },
  { id: 3, nome: "Trucado", desc: "Caminhao truck grande com bau Pegue" },
];

function drawMotorista(ctx: CanvasRenderingContext2D, x: number, y: number, flip?: boolean) {
  const dir = flip ? -1 : 1;
  ctx.save();

  // Braco pra fora da janela com mao
  ctx.fillStyle = "#C48B5C";
  // Braco (manga da camisa)
  ctx.fillStyle = "#C9A84C";
  ctx.fillRect(x + dir * 4, y + 13, dir * 6, 4.5);
  // Antebraco (pele)
  ctx.fillStyle = "#C48B5C";
  ctx.fillRect(x + dir * 9, y + 13, dir * 6, 4);
  // Mao
  ctx.fillStyle = "#D2996B";
  ctx.beginPath();
  ctx.arc(x + dir * 15, y + 15, 2.8, 0, Math.PI * 2);
  ctx.fill();
  // Dedos (polegar pra cima - joinha)
  ctx.fillStyle = "#D2996B";
  ctx.fillRect(x + dir * 14, y + 10, 2.5, 5);
  ctx.beginPath();
  ctx.arc(x + dir * 15.2, y + 10, 1.3, 0, Math.PI * 2);
  ctx.fill();

  // Corpo (camisa polo Pegue)
  ctx.fillStyle = "#C9A84C";
  ctx.beginPath();
  ctx.roundRect(x - 5, y + 8, 10, 12, 2);
  ctx.fill();
  // Gola da camisa
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(x - 3, y + 8);
  ctx.lineTo(x, y + 11);
  ctx.lineTo(x + 3, y + 8);
  ctx.stroke();

  // Pescoco
  ctx.fillStyle = "#C48B5C";
  ctx.fillRect(x - 2, y + 6, 4, 4);

  // Cabeca (formato mais realista - oval)
  ctx.fillStyle = "#D2996B";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 7, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Orelha
  ctx.fillStyle = "#C48B5C";
  ctx.beginPath();
  ctx.ellipse(x - dir * 6.5, y + 2, 2.5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#B07A4A";
  ctx.beginPath();
  ctx.ellipse(x - dir * 6.5, y + 2, 1.2, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cabelo nas laterais (por baixo do bone)
  ctx.fillStyle = "#2a1a0a";
  ctx.fillRect(x - 6, y + 0, 2, 5);
  ctx.fillRect(x + 4, y + 0, 2, 5);

  // Bone realista
  ctx.fillStyle = "#1a1a1a";
  // Topo do bone (copa)
  ctx.beginPath();
  ctx.ellipse(x, y - 4, 8, 5, 0, Math.PI, 0);
  ctx.fill();
  // Botao no topo
  ctx.fillStyle = "#C9A84C";
  ctx.beginPath();
  ctx.arc(x, y - 8.5, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // Aba curvada
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.ellipse(x + dir * 6, y - 4, 7, 2.5, dir * 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Logo P bordado no bone
  ctx.fillStyle = "#C9A84C";
  ctx.font = "bold 7px Arial";
  ctx.textAlign = "center";
  ctx.fillText("P", x + dir * 1, y - 2);

  // Oculos de sol
  ctx.fillStyle = "#111";
  // Lente
  ctx.beginPath();
  ctx.ellipse(x + dir * 3, y + 0, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // Armacao
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 1, y + 0);
  ctx.lineTo(x + dir * 7, y - 0.5);
  ctx.stroke();
  // Reflexo no oculos
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.ellipse(x + dir * 2, y - 1, 1.5, 1, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nariz
  ctx.fillStyle = "#B8854A";
  ctx.beginPath();
  ctx.moveTo(x + dir * 2, y + 1);
  ctx.lineTo(x + dir * 4, y + 3.5);
  ctx.lineTo(x + dir * 1, y + 3.5);
  ctx.closePath();
  ctx.fill();

  // Barba/cavanhaque leve
  ctx.fillStyle = "rgba(40,25,10,0.3)";
  ctx.beginPath();
  ctx.ellipse(x + dir * 1, y + 6, 4, 2.5, 0, 0, Math.PI);
  ctx.fill();

  // Sorriso
  ctx.strokeStyle = "#9B6540";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x + dir * 2, y + 4.5, 3, 0.1, Math.PI * 0.5);
  ctx.stroke();

  // Dente aparecendo no sorriso
  ctx.fillStyle = "#FFF";
  ctx.fillRect(x + dir * 1.5, y + 5, 2.5, 1.5);

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
  ctx.ellipse(x + 28, ty + 48, 32, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // === HR Hyundai - cabine sobre chassi achatada, bau retangular ===

  // BAU - retangular, mais alto, tipico HR
  const grad = ctx.createLinearGradient(x - 8, ty, x - 8, ty + 32);
  grad.addColorStop(0, "#D4AF37");
  grad.addColorStop(1, "#B8963F");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x - 8, ty + 2, 38, 32, 2);
  ctx.fill();
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Porta traseira aberta mostrando carga
  ctx.fillStyle = "#B8963F";
  ctx.beginPath();
  ctx.roundRect(x - 12, ty + 3, 6, 30, [2, 0, 0, 2]);
  ctx.fill();
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Materiais dentro do bau
  drawMateriais(ctx, x - 8, ty, "bau");

  // PEGUE no bau
  ctx.fillStyle = "#000";
  ctx.font = "bold 8px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", x + 11, ty + 22);

  // Cabine HR - achatada, tipica Hyundai HR branca
  ctx.fillStyle = "#F0F0F0";
  ctx.beginPath();
  ctx.roundRect(x + 32, ty + 10, 24, 24, [0, 5, 3, 0]);
  ctx.fill();
  ctx.strokeStyle = "#D0D0D0";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Friso azul Hyundai
  ctx.fillStyle = "#3366CC";
  ctx.fillRect(x + 32, ty + 30, 24, 3);

  // Parabrisa grande inclinado (tipico HR)
  ctx.fillStyle = "#87CEEB";
  ctx.beginPath();
  ctx.moveTo(x + 36, ty + 12);
  ctx.lineTo(x + 54, ty + 11);
  ctx.lineTo(x + 55, ty + 23);
  ctx.lineTo(x + 36, ty + 23);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#AAA";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Divisor parabrisa
  ctx.strokeStyle = "#999";
  ctx.beginPath();
  ctx.moveTo(x + 45, ty + 12);
  ctx.lineTo(x + 45, ty + 23);
  ctx.stroke();

  // Motorista
  drawMotorista(ctx, x + 48, ty + 10, false);

  // Grade frontal HR
  ctx.fillStyle = "#CCC";
  ctx.beginPath();
  ctx.roundRect(x + 55, ty + 24, 4, 9, [0, 2, 2, 0]);
  ctx.fill();
  // Logo H
  ctx.fillStyle = "#3366CC";
  ctx.font = "bold 6px Arial";
  ctx.textAlign = "center";
  ctx.fillText("H", x + 57, ty + 30);
  // Farol
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.roundRect(x + 55, ty + 22, 4, 3, 1);
  ctx.fill();
  // Seta
  ctx.fillStyle = "#FFA500";
  ctx.beginPath();
  ctx.roundRect(x + 55, ty + 33, 4, 2, 1);
  ctx.fill();

  // Lanterna traseira
  ctx.fillStyle = "#FF3333";
  ctx.beginPath();
  ctx.roundRect(x - 11, ty + 24, 3, 6, 1);
  ctx.fill();

  // Chassi
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x - 14, ty + 34, 74, 6);

  // Rodas traseiras (duplas - tipico HR)
  for (const wx of [x + 2, x + 10]) {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(wx, ty + 42, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#444";
    ctx.beginPath();
    ctx.arc(wx, ty + 42, 4, 0, Math.PI * 2);
    ctx.fill();
    const a = frame * 0.15;
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;
    for (let r = 0; r < 4; r++) {
      const ra = a + (r * Math.PI * 2) / 4;
      ctx.beginPath();
      ctx.moveTo(wx, ty + 42);
      ctx.lineTo(wx + Math.cos(ra) * 5.5, ty + 42 + Math.sin(ra) * 5.5);
      ctx.stroke();
    }
  }
  // Roda dianteira
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + 48, ty + 42, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#444";
  ctx.beginPath();
  ctx.arc(x + 48, ty + 42, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Fumaca
  ctx.fillStyle = "rgba(150,150,150,0.2)";
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x - 16 - i * 7, ty + 30 - i * 3 + Math.sin(frame * 0.1 + i) * 2, 3 + i, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStrada(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  const bounce = Math.sin(frame * 0.15) * 1;
  const ty = y + bounce;

  // Sombra
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x + 26, ty + 42, 28, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // === Fiat Strada - pickup compacta, cabine integrada, cacamba aberta ===

  // Cacamba aberta (lateral com grade)
  ctx.fillStyle = "#CC0000"; // Vermelha tipica Fiat
  ctx.beginPath();
  ctx.roundRect(x - 6, ty + 12, 28, 18, [2, 0, 0, 2]);
  ctx.fill();
  ctx.strokeStyle = "#990000";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Grade lateral da cacamba
  ctx.strokeStyle = "#AA0000";
  ctx.lineWidth = 0.5;
  for (let gx = 0; gx < 4; gx++) {
    ctx.beginPath();
    ctx.moveTo(x - 3 + gx * 7, ty + 14);
    ctx.lineTo(x - 3 + gx * 7, ty + 28);
    ctx.stroke();
  }
  // PEGUE na lateral
  ctx.fillStyle = "#FFF";
  ctx.font = "bold 6px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", x + 8, ty + 24);

  // Materiais de mudanca
  drawMateriais(ctx, x - 4, ty + 12, "aberto");

  // Cabine Strada - integrada, teto curvo tipico Fiat
  ctx.fillStyle = "#CC0000";
  ctx.beginPath();
  ctx.moveTo(x + 24, ty + 30);
  ctx.lineTo(x + 24, ty + 10);
  ctx.quadraticCurveTo(x + 26, ty + 4, x + 34, ty + 3);
  ctx.lineTo(x + 50, ty + 2);
  ctx.quadraticCurveTo(x + 56, ty + 3, x + 56, ty + 10);
  ctx.lineTo(x + 56, ty + 30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#990000";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Parabrisa inclinado (tipico Strada)
  ctx.fillStyle = "#87CEEB";
  ctx.beginPath();
  ctx.moveTo(x + 38, ty + 5);
  ctx.lineTo(x + 54, ty + 4);
  ctx.lineTo(x + 55, ty + 18);
  ctx.lineTo(x + 36, ty + 19);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#777";
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Motorista
  drawMotorista(ctx, x + 47, ty + 4, false);

  // Macaneta
  ctx.fillStyle = "#AA0000";
  ctx.fillRect(x + 30, ty + 20, 5, 2);

  // Farol angular tipico Strada
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.moveTo(x + 55, ty + 12);
  ctx.lineTo(x + 58, ty + 10);
  ctx.lineTo(x + 58, ty + 18);
  ctx.lineTo(x + 55, ty + 18);
  ctx.closePath();
  ctx.fill();
  // Seta
  ctx.fillStyle = "#FFA500";
  ctx.beginPath();
  ctx.roundRect(x + 55, ty + 19, 3, 3, 1);
  ctx.fill();

  // Grade frontal Fiat
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.roundRect(x + 55, ty + 22, 4, 8, [0, 2, 2, 0]);
  ctx.fill();
  // Logo Fiat
  ctx.fillStyle = "#CC0000";
  ctx.beginPath();
  ctx.arc(x + 57, ty + 26, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Lanterna traseira
  ctx.fillStyle = "#FF3333";
  ctx.beginPath();
  ctx.roundRect(x - 5, ty + 18, 2, 8, 1);
  ctx.fill();

  // Chassi
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x - 8, ty + 30, 68, 5);

  // Rodas (pickup - maiores na traseira)
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + 6, ty + 37, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#555";
  ctx.beginPath();
  ctx.arc(x + 6, ty + 37, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(x + 46, ty + 37, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#555";
  ctx.beginPath();
  ctx.arc(x + 46, ty + 37, 3, 0, Math.PI * 2);
  ctx.fill();
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
