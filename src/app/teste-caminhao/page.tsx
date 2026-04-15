"use client";

import { useEffect, useRef, useState } from "react";

const TRUCKS = [
  { id: 1, nome: "Bau Classico", desc: "Caminhao bau com logo Pegue" },
  { id: 2, nome: "Utilitario", desc: "Furgao tipo Sprinter/HR" },
  { id: 3, nome: "Caminhao Truck", desc: "Caminhao grande estradeiro" },
  { id: 4, nome: "Pickup", desc: "Pickup com carroceria aberta" },
];

function drawTruck1(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Bau Classico - cabine na frente (direita)
  // Carroceria (bau)
  const grad = ctx.createLinearGradient(x, y, x, y + 28);
  grad.addColorStop(0, "#D4AF37");
  grad.addColorStop(1, "#B8963F");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x - 4, y + 2, 32, 26, 3);
  ctx.fill();
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#000";
  ctx.font = "bold 7px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", x + 12, y + 18);

  // Cabine (frente = direita)
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath();
  ctx.roundRect(x + 30, y + 5, 16, 23, [0, 5, 3, 0]);
  ctx.fill();
  // Janela
  ctx.fillStyle = "#87CEEB";
  ctx.beginPath();
  ctx.roundRect(x + 33, y + 7, 10, 10, 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(x + 40, y + 8, 2, 5);
  // Para-choque
  ctx.fillStyle = "#C9A84C";
  ctx.fillRect(x + 46, y + 22, 4, 6);
  // Farol
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.arc(x + 49, y + 20, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Lanterna traseira
  ctx.fillStyle = "#FF3333";
  ctx.beginPath();
  ctx.arc(x - 3, y + 20, 2, 0, Math.PI * 2);
  ctx.fill();

  // Chassi
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x - 6, y + 28, 56, 6);

  // Rodas
  for (const wx of [x + 4, x + 38, x + 44]) {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(wx, y + 36, wx > x + 30 ? 6 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(wx, y + 36, wx > x + 30 ? 3 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTruck2(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Utilitario - furgao tipo HR/Sprinter
  const grad = ctx.createLinearGradient(x, y, x, y + 28);
  grad.addColorStop(0, "#D4AF37");
  grad.addColorStop(1, "#B8963F");
  ctx.fillStyle = grad;
  // Corpo unico arredondado
  ctx.beginPath();
  ctx.roundRect(x, y, 48, 28, [6, 10, 3, 3]);
  ctx.fill();
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Janela dianteira
  ctx.fillStyle = "#87CEEB";
  ctx.beginPath();
  ctx.roundRect(x + 34, y + 3, 12, 11, [2, 6, 2, 2]);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(x + 42, y + 4, 2, 5);
  // Pegue texto
  ctx.fillStyle = "#000";
  ctx.font = "bold 7px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", x + 18, y + 17);
  // Farol
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.arc(x + 48, y + 18, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Lanterna
  ctx.fillStyle = "#FF3333";
  ctx.beginPath();
  ctx.arc(x + 1, y + 18, 2, 0, Math.PI * 2);
  ctx.fill();
  // Chassi
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x - 2, y + 28, 52, 5);
  // Rodas
  for (const wx of [x + 8, x + 40]) {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(wx, y + 35, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(wx, y + 35, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTruck3(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Caminhao Truck grande
  // Carroceria grande
  ctx.fillStyle = "#C9A84C";
  ctx.fillRect(x - 8, y - 2, 38, 32);
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 8, y - 2, 38, 32);
  ctx.fillStyle = "#000";
  ctx.font = "bold 8px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", x + 11, y + 18);
  // Grade lateral
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 10); ctx.lineTo(x + 30, y + 10);
  ctx.moveTo(x - 8, y + 22); ctx.lineTo(x + 30, y + 22);
  ctx.stroke();

  // Cabine grande
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.roundRect(x + 32, y + 2, 20, 28, [0, 6, 4, 0]);
  ctx.fill();
  ctx.fillStyle = "#87CEEB";
  ctx.beginPath();
  ctx.roundRect(x + 36, y + 4, 13, 12, [2, 4, 2, 2]);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(x + 45, y + 5, 2, 6);
  // Para-choque cromado
  ctx.fillStyle = "#AAA";
  ctx.fillRect(x + 52, y + 20, 4, 10);
  // Farol
  ctx.fillStyle = "#FFD";
  ctx.beginPath();
  ctx.arc(x + 54, y + 18, 3, 0, Math.PI * 2);
  ctx.fill();

  // Chassi robusto
  ctx.fillStyle = "#111";
  ctx.fillRect(x - 10, y + 30, 66, 7);
  // Rodas (3 eixos)
  for (const wx of [x - 2, x + 6, x + 44]) {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(wx, y + 39, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#444";
    ctx.beginPath();
    ctx.arc(wx, y + 39, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTruck4(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Pickup com carroceria aberta
  // Carroceria aberta
  ctx.fillStyle = "#C9A84C";
  ctx.fillRect(x - 2, y + 10, 24, 18);
  ctx.strokeStyle = "#8B7530";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 2, y + 10, 24, 18);
  // Pacotes na carroceria
  ctx.fillStyle = "#8B4513";
  ctx.fillRect(x + 2, y + 6, 10, 10);
  ctx.fillStyle = "#A0522D";
  ctx.fillRect(x + 10, y + 3, 8, 12);
  ctx.fillStyle = "#DAA520";
  ctx.fillRect(x + 6, y + 6, 1, 10);

  // Cabine
  ctx.fillStyle = "#C9A84C";
  ctx.beginPath();
  ctx.roundRect(x + 24, y + 5, 22, 23, [0, 8, 4, 0]);
  ctx.fill();
  ctx.strokeStyle = "#8B7530";
  ctx.stroke();
  // Janela
  ctx.fillStyle = "#87CEEB";
  ctx.beginPath();
  ctx.roundRect(x + 30, y + 7, 13, 10, [2, 5, 2, 2]);
  ctx.fill();
  // Farol
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.arc(x + 46, y + 20, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // PEGUE na porta
  ctx.fillStyle = "#000";
  ctx.font = "bold 6px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PEGUE", x + 35, y + 24);

  // Chassi
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x - 4, y + 28, 52, 5);
  // Rodas
  for (const wx of [x + 6, x + 38]) {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(wx, y + 35, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(wx, y + 35, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function TesteCaminhaoPage() {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [escolhido, setEscolhido] = useState<number | null>(null);

  useEffect(() => {
    const drawFns = [drawTruck1, drawTruck2, drawTruck3, drawTruck4];
    canvasRefs.current.forEach((canvas, i) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = 200;
      canvas.height = 80;
      // Fundo estrada
      ctx.fillStyle = "#333";
      ctx.fillRect(0, 0, 200, 80);
      ctx.fillStyle = "#555";
      ctx.fillRect(0, 58, 200, 2);
      ctx.fillStyle = "#FFF";
      for (let x = 0; x < 200; x += 30) ctx.fillRect(x, 45, 18, 2);
      // Desenha caminhao
      drawFns[i](ctx, 70, 16);
    });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000] p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-[#C9A84C]/20 bg-[#0A0A0A] p-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white">
            Escolha o <span className="text-[#C9A84C]">Caminhao</span>
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
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        ))}

        {escolhido && (
          <p className="text-center text-sm text-[#C9A84C]">
            Caminhao {escolhido} selecionado! Me diz qual escolheu no chat.
          </p>
        )}
      </div>
    </div>
  );
}
