// Banco de rotas reais pra simulacao de precos
// Cada rota tem origem, destino, km aproximado (rota real - ja inclui fator estrada)
// e zona do destino (normal/dificil/fundao - afeta o calculo via bot-utils)
//
// Fabio pode editar essa lista no futuro. A ideia e cobrir rotas tipicas da Pegue:
// Osasco + Grande SP Oeste + Centro SP + algumas pras demais regioes

export type Rota = {
  id: string;
  origem: string;
  destino: string;
  km: number;
  zonaDestino: "normal" | "dificil" | "fundao";
};

export const ROTAS: Rota[] = [
  // === OSASCO e proximidades (core da Pegue) ===
  { id: "r01", origem: "Osasco Centro", destino: "Presidente Altino (Osasco)", km: 3, zonaDestino: "normal" },
  { id: "r02", origem: "Presidente Altino (Osasco)", destino: "Vila Yara (Osasco)", km: 4, zonaDestino: "normal" },
  { id: "r03", origem: "Osasco Centro", destino: "Quitaúna (Osasco)", km: 5, zonaDestino: "normal" },
  { id: "r04", origem: "Carapicuíba", destino: "Osasco Centro", km: 6, zonaDestino: "normal" },
  { id: "r05", origem: "Osasco Centro", destino: "Carapicuíba", km: 7, zonaDestino: "dificil" },
  { id: "r06", origem: "Jandira", destino: "Osasco", km: 11, zonaDestino: "normal" },
  { id: "r07", origem: "Barueri Centro", destino: "Osasco", km: 10, zonaDestino: "normal" },
  { id: "r08", origem: "Osasco", destino: "Alphaville (Barueri)", km: 8, zonaDestino: "normal" },
  { id: "r09", origem: "Itapevi", destino: "Osasco", km: 18, zonaDestino: "normal" },
  { id: "r10", origem: "Osasco", destino: "Cotia", km: 22, zonaDestino: "dificil" },

  // === OSASCO -> ZONA OESTE SP ===
  { id: "r11", origem: "Osasco", destino: "Butantã (SP)", km: 10, zonaDestino: "normal" },
  { id: "r12", origem: "Osasco", destino: "Lapa (SP)", km: 12, zonaDestino: "normal" },
  { id: "r13", origem: "Osasco", destino: "Pinheiros (SP)", km: 15, zonaDestino: "normal" },
  { id: "r14", origem: "Osasco", destino: "Perdizes (SP)", km: 14, zonaDestino: "normal" },
  { id: "r15", origem: "Osasco", destino: "Água Branca (SP)", km: 11, zonaDestino: "normal" },

  // === OSASCO -> CENTRO SP ===
  { id: "r16", origem: "Osasco", destino: "Sé (SP)", km: 18, zonaDestino: "normal" },
  { id: "r17", origem: "Osasco", destino: "Brás (SP)", km: 22, zonaDestino: "normal" },
  { id: "r18", origem: "Osasco", destino: "Bela Vista (SP)", km: 20, zonaDestino: "normal" },
  { id: "r19", origem: "Osasco", destino: "Liberdade (SP)", km: 21, zonaDestino: "normal" },
  { id: "r20", origem: "Osasco", destino: "Bom Retiro (SP)", km: 17, zonaDestino: "normal" },

  // === OSASCO -> ZONA SUL SP ===
  { id: "r21", origem: "Osasco", destino: "Morumbi (SP)", km: 16, zonaDestino: "normal" },
  { id: "r22", origem: "Osasco", destino: "Vila Olímpia (SP)", km: 18, zonaDestino: "normal" },
  { id: "r23", origem: "Osasco", destino: "Santo Amaro (SP)", km: 22, zonaDestino: "dificil" },
  { id: "r24", origem: "Osasco", destino: "Capão Redondo (SP)", km: 25, zonaDestino: "fundao" },
  { id: "r25", origem: "Osasco", destino: "Campo Limpo (SP)", km: 23, zonaDestino: "fundao" },

  // === OSASCO -> ZONA LESTE SP ===
  { id: "r26", origem: "Osasco", destino: "Tatuapé (SP)", km: 28, zonaDestino: "normal" },
  { id: "r27", origem: "Osasco", destino: "Mooca (SP)", km: 25, zonaDestino: "normal" },
  { id: "r28", origem: "Osasco", destino: "Itaquera (SP)", km: 40, zonaDestino: "dificil" },
  { id: "r29", origem: "Osasco", destino: "São Mateus (SP)", km: 42, zonaDestino: "fundao" },

  // === OSASCO -> ZONA NORTE SP ===
  { id: "r30", origem: "Osasco", destino: "Santana (SP)", km: 20, zonaDestino: "normal" },
  { id: "r31", origem: "Osasco", destino: "Tucuruvi (SP)", km: 24, zonaDestino: "normal" },
  { id: "r32", origem: "Osasco", destino: "Brasilândia (SP)", km: 22, zonaDestino: "fundao" },
  { id: "r33", origem: "Osasco", destino: "Pirituba (SP)", km: 14, zonaDestino: "normal" },

  // === OSASCO -> ABC / GUARULHOS ===
  { id: "r34", origem: "Osasco", destino: "Santo André", km: 38, zonaDestino: "normal" },
  { id: "r35", origem: "Osasco", destino: "São Bernardo do Campo", km: 42, zonaDestino: "normal" },
  { id: "r36", origem: "Osasco", destino: "Diadema", km: 40, zonaDestino: "dificil" },
  { id: "r37", origem: "Osasco", destino: "Guarulhos Centro", km: 35, zonaDestino: "normal" },
  { id: "r38", origem: "Osasco", destino: "Cumbica (Guarulhos)", km: 40, zonaDestino: "normal" },

  // === ROTAS SP INTERNAS (para variedade) ===
  { id: "r39", origem: "Pinheiros (SP)", destino: "Brás (SP)", km: 10, zonaDestino: "normal" },
  { id: "r40", origem: "Tatuapé (SP)", destino: "Santana (SP)", km: 13, zonaDestino: "normal" },
];

export function sortearRota(): Rota {
  return ROTAS[Math.floor(Math.random() * ROTAS.length)];
}

// Pega endereco fake baseado na zona pra passar pro calcularPrecos()
// (calcularPrecos detecta zona pelo texto do endereco)
export function enderecoPorZona(zona: "normal" | "dificil" | "fundao"): string {
  if (zona === "fundao") return "Capão Redondo - SP";
  if (zona === "dificil") return "Itapevi - SP";
  return "Centro - SP";
}
