// Utilitarios do bot

// Verifica se esta no horario de atendimento humano (seg-sex 10h-15h)
export function isHorarioAtendimentoHumano(): boolean {
  const agora = new Date();
  // Ajusta para horario de SP (UTC-3)
  const spOffset = -3;
  const utcHour = agora.getUTCHours();
  const spHour = (utcHour + spOffset + 24) % 24;
  const diaSemana = agora.getUTCDay(); // 0=dom, 6=sab

  // Segunda (1) a Sexta (5), 10h as 15h
  return diaSemana >= 1 && diaSemana <= 5 && spHour >= 10 && spHour < 15;
}

// Busca endereco por coordenadas via Nominatim
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      {
        headers: {
          "User-Agent": "Pegue-Bot/1.0",
        },
      }
    );

    if (!response.ok) return "Localizacao recebida";

    const data = await response.json();
    const addr = data.address || {};

    const parts = [
      addr.road,
      addr.house_number,
      addr.suburb || addr.neighbourhood,
      addr.city || addr.town || addr.village,
    ].filter(Boolean);

    return parts.join(", ") || data.display_name || "Localizacao recebida";
  } catch {
    return "Localizacao recebida";
  }
}

// Busca endereco por CEP via ViaCEP
export async function buscaCep(cep: string): Promise<string | null> {
  try {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return null;

    const response = await fetch(
      `https://viacep.com.br/ws/${cepLimpo}/json/`
    );
    if (!response.ok) return null;

    const data = await response.json();
    if (data.erro) return null;

    return `${data.logradouro}, ${data.bairro}, ${data.localidade}/${data.uf}`;
  } catch {
    return null;
  }
}

// Geocode endereco para coordenadas via Nominatim
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=br`,
      {
        headers: {
          "User-Agent": "Pegue-Bot/1.0",
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.length) return null;

    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

// Calcula distancia entre dois pontos (Haversine)
export function calcularDistanciaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 1.3 * 10) / 10; // *1.3 fator rota real
}

// Calcula precos nos 3 planos
export function calcularPrecos(
  distanciaKm: number,
  veiculoTipo: string = "utilitario",
  temAjudante: boolean = false,
  andares: number = 0
) {
  const precoPorKm = 8.0;
  const kmMinimo = 5;
  const valorMinimoSemAjudante = 150;
  const valorMinimoComAjudante = 250;
  const valorMinimo = temAjudante ? valorMinimoComAjudante : valorMinimoSemAjudante;

  const multVeiculo: Record<string, number> = {
    utilitario: 1.0,
    van: 1.3,
    caminhao_bau: 1.6,
    caminhao_grande: 2.0,
  };

  const km = Math.max(distanciaKm, kmMinimo);
  const base = km * precoPorKm * (multVeiculo[veiculoTipo] || 1.0);

  let adicional = 0;
  if (temAjudante) adicional += 80;
  if (andares > 0) adicional += andares * 30;

  const total = Math.max(base + adicional, valorMinimo);

  return {
    economica: Math.max(Math.round(total * 0.7), valorMinimo),
    padrao: Math.max(Math.round(total * 1.0), valorMinimo),
    premium: Math.max(Math.round(total * 1.4), valorMinimo + 50),
  };
}

// Extrai CEP de uma mensagem
export function extrairCep(texto: string): string | null {
  const match = texto.match(/\d{5}-?\d{3}/);
  return match ? match[0] : null;
}

// Detecta se mensagem parece ser um endereco
export function pareceEndereco(texto: string): boolean {
  const palavras = [
    "rua",
    "av",
    "avenida",
    "alameda",
    "travessa",
    "praca",
    "estrada",
    "rodovia",
    "largo",
    "vila",
    "bairro",
  ];
  const lower = texto.toLowerCase();
  return palavras.some((p) => lower.includes(p)) || !!extrairCep(texto);
}

// Detecta saudacao
export function isSaudacao(texto: string): boolean {
  const saudacoes = [
    "oi",
    "ola",
    "bom dia",
    "boa tarde",
    "boa noite",
    "hey",
    "eae",
    "e ai",
    "hello",
    "hi",
    "fala",
    "salve",
    "opa",
  ];
  const lower = texto.toLowerCase().trim();
  return saudacoes.some((s) => lower.startsWith(s));
}

// Detecta agradecimento
export function isAgradecimento(texto: string): boolean {
  const palavras = ["obrigad", "valeu", "thanks", "brigad", "agradec"];
  const lower = texto.toLowerCase();
  return palavras.some((p) => lower.includes(p));
}

// Detecta pedido de atendente humano
export function isAtendente(texto: string): boolean {
  const palavras = [
    "atendente",
    "humano",
    "pessoa",
    "alguem",
    "falar com",
    "atendimento",
    "funcionario",
    "gerente",
  ];
  const lower = texto.toLowerCase();
  return palavras.some((p) => lower.includes(p));
}

// Detecta resposta SIM com valor (para prestadores)
export function extrairRespostaPrestador(
  texto: string
): { aceite: boolean; valor: number | null } {
  const lower = texto.toLowerCase().trim();

  if (!lower.startsWith("sim")) {
    return { aceite: false, valor: null };
  }

  const valorMatch = texto.match(/\d+/);
  const valor = valorMatch ? parseInt(valorMatch[0]) : null;

  return { aceite: true, valor };
}

// Formata telefone para exibicao
export function formatarTelefoneExibicao(phone: string): string {
  // 5511970363713 -> (11) 97036-3713
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}
