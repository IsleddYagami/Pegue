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
// Adiciona "São Paulo" ao endereco se nao tiver contexto de estado/cidade
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    let addr = address.trim();
    const lower = addr.toLowerCase();

    // Corrige nomes comuns da Grande SP que dao conflito
    const correcoes: Record<string, string> = {
      "sao bernardo": "Sao Bernardo do Campo, SP",
      "são bernardo": "São Bernardo do Campo, SP",
      "santo andre": "Santo Andre, SP, Grande Sao Paulo",
      "santo andré": "Santo André, SP, Grande São Paulo",
      "sao caetano": "Sao Caetano do Sul, SP",
      "são caetano": "São Caetano do Sul, SP",
      "maua": "Maua, SP, Grande Sao Paulo",
      "mauá": "Mauá, SP, Grande São Paulo",
      "diadema": "Diadema, SP, Grande Sao Paulo",
      "itapecerica": "Itapecerica da Serra, SP",
      "ferraz": "Ferraz de Vasconcelos, SP",
      "francisco morato": "Francisco Morato, SP",
      "franco da rocha": "Franco da Rocha, SP",
      "embu": "Embu das Artes, SP",
      "taboao": "Taboao da Serra, SP",
      "taboão": "Taboão da Serra, SP",
    };

    for (const [chave, correcao] of Object.entries(correcoes)) {
      if (lower === chave || lower.startsWith(chave + " ") || lower.startsWith(chave + ",")) {
        addr = correcao;
        break;
      }
    }

    const lowerAddr = addr.toLowerCase();
    const temContexto = lowerAddr.includes("sp") || lowerAddr.includes("são paulo") ||
      lowerAddr.includes("sao paulo") || lowerAddr.includes("santos") ||
      lowerAddr.includes("guarulhos") || lowerAddr.includes("campinas") ||
      lowerAddr.includes("osasco") || lowerAddr.includes("rio de janeiro") ||
      lowerAddr.includes("rj") || lowerAddr.includes("/") ||
      lowerAddr.includes("grande");

    const searchAddress = temContexto ? addr : `${addr}, São Paulo, SP`;

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchAddress)}&format=json&limit=1&countrycodes=br`,
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

// Distancia em linha reta (sem fator de estrada) - para deteccao de proximidade GPS
export function distanciaRetaKm(
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
  return R * c; // km em linha reta, sem arredondamento
}

// Calcula preco base do veiculo pela distancia
// Formula recalibrada em 16/Abr/2026 com 200+ amostras de mercado (ajustes Fabio)
// Insight: Fabio aplica multiplicadores DIFERENTES por faixa de distancia
// - Curtas: caminhao caro proporcionalmente (mult alto)
// - Longas: caminhao nao sobe tanto (mult achata)
// - HR: sempre abaixo do que a formula antiga dava
function calcularPrecoBaseUtilitario(km: number): number {
  if (km <= 2) return 150;
  return Math.round(30 * Math.sqrt(km) + 148);
}

// Multiplicadores DINAMICOS por veiculo e faixa de distancia
function getMultiplicador(veiculo: string, km: number): number {
  if (veiculo === "carro_comum") return 0.85;
  if (veiculo === "utilitario") {
    // Utilitario: mult ~1.0 curto, sobe levemente em médio
    if (km <= 20) return 1.0;
    if (km <= 50) return 1.05;
    return 1.1; // longas
  }
  if (veiculo === "hr") {
    // HR: mult 1.5 fixo (calibrado com lista 1 do Fabio - erro <3%)
    return 1.5;
  }
  if (veiculo === "caminhao_bau") {
    // Caminhao: mult 2.2 fixo (bate perfeito com lista 1 do Fabio)
    // Rotas perifericas/dificeis (Capao Redondo, Jardim Angela etc) podem ter ajuste manual
    return 2.2;
  }
  return 1.0;
}

// Minimos por veiculo (sem ajudante, terreo)
const MIN_VEICULO: Record<string, number> = {
  carro_comum: 120,
  utilitario: 150,
  hr: 220,
  caminhao_bau: 500,
};

// === ZONAS DE DIFICULDADE ===
// Regioes perigosas, acesso dificil, densidade alta, area de risco
// Multiplicador extra aplicado sobre o preco base
// normal=1.0, dificil=1.15, fundao=1.30
type ZonaDificuldade = "normal" | "dificil" | "fundao";

const ZONAS_FUNDAO: string[] = [
  // Zona Sul extrema SP
  "capao redondo", "jardim angela", "jardim sao luiz", "grajau", "parelheiros",
  "marsilac", "cidade dutra", "pedreira", "jardim herculano",
  "campo limpo", "jardim miriam", "cidade ademar",
  // Zona Leste extrema SP
  "cidade tiradentes", "guaianases", "lajeado", "jose bonifacio",
  "sao mateus", "iguatemi", "sao rafael", "jardim helena",
  "itaim paulista", "vila curuça", "jardim romano",
  // Zona Norte dificil
  "brasilandia", "cachoeirinha", "perus", "anhanguera",
  "jaraguá", "pirituba norte",
  // Municipios dificeis
  "franco da rocha", "francisco morato", "cajamar",
  "rio grande da serra", "suzano", "ferraz de vasconcelos",
  "itaquaquecetuba", "poa",
];

const ZONAS_DIFICIL: string[] = [
  // Zona Leste media
  "itaquera", "sao miguel", "penha", "ermelino matarazzo",
  "artur alvim", "cangaiba", "vila matilde",
  // Zona Sul media
  "interlagos", "socorro", "santo amaro sul", "jabaquara",
  "ipiranga sul", "sacomã",
  // Zona Norte
  "tucuruvi", "tremembé", "jaçanã", "vila medeiros",
  "santana norte", "casa verde alta", "freguesia do ó",
  "caieiras", "mairiporã",
  // ABC periferia
  "mauá", "diadema", "ribeirão pires",
  // Oeste dificil
  "embu das artes", "taboão da serra", "itapevi", "jandira",
  "carapicuíba", "cotia",
];

// Detecta zona de dificuldade pelo endereco do destino
export function detectarZona(endereco: string): ZonaDificuldade {
  if (!endereco) return "normal";
  const lower = endereco.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove acentos

  for (const zona of ZONAS_FUNDAO) {
    const zonaNorm = zona.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (lower.includes(zonaNorm)) return "fundao";
  }
  for (const zona of ZONAS_DIFICIL) {
    const zonaNorm = zona.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (lower.includes(zonaNorm)) return "dificil";
  }
  return "normal";
}

// Multiplicador por zona
function getMultZona(zona: ZonaDificuldade): number {
  if (zona === "fundao") return 1.30;  // +30% area de risco
  if (zona === "dificil") return 1.15; // +15% acesso dificil
  return 1.0;
}

export interface PrecoDetalhado {
  base: number;
  ajudante: number;
  elevador: number;
  escada: number;
  total: number;
}

export function calcularPrecos(
  distanciaKm: number,
  veiculoTipo: string = "utilitario",
  temAjudante: boolean = false,
  andares: number = 0,
  temElevador: boolean = false,
  enderecoDestino: string = ""
): { padrao: PrecoDetalhado; zona: ZonaDificuldade } {
  // Preco base do utilitario pela distancia
  const baseUtil = calcularPrecoBaseUtilitario(distanciaKm);

  // Aplica multiplicador do veiculo
  const mult = getMultiplicador(veiculoTipo, distanciaKm);
  const minimo = MIN_VEICULO[veiculoTipo] || 150;
  let base = Math.max(Math.round(baseUtil * mult), minimo);

  // Aplica multiplicador de zona (fundao/dificil/normal)
  const zona = detectarZona(enderecoDestino);
  const multZona = getMultZona(zona);
  base = Math.round(base * multZona);

  // Adicionais
  let ajudante = 0;
  if (temAjudante) {
    ajudante = distanciaKm <= 10 ? 80 : 100;
  }

  let elevador = 0;
  if (temElevador) {
    elevador = 50;
  }

  let escada = 0;
  if (andares > 0 && !temElevador) {
    escada = andares * 30;
  }

  const total = base + ajudante + elevador + escada;

  return {
    padrao: { base, ajudante, elevador, escada, total },
    zona,
  };
}

// Calcula precos para os 3 veiculos de uma vez
export function calcularPrecosCompleto(
  distanciaKm: number,
  temAjudante: boolean = false,
  andares: number = 0,
  temElevador: boolean = false,
  enderecoDestino: string = ""
) {
  const util = calcularPrecos(distanciaKm, "utilitario", temAjudante, andares, temElevador, enderecoDestino);
  const hr = calcularPrecos(distanciaKm, "hr", temAjudante, andares, temElevador, enderecoDestino);
  const cam = calcularPrecos(distanciaKm, "caminhao_bau", temAjudante, andares, temElevador, enderecoDestino);

  return {
    utilitario: util.padrao,
    hr: hr.padrao,
    caminhao_bau: cam.padrao,
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
    "jardim",
    "jd",
    "parque",
    "centro",
    "marginal",
    "br-",
    "sp-",
    "km ",
    "numero",
    "nro",
    "n.",
    "osasco",
    "alphaville",
    "barueri",
    "carapicuiba",
    "cotia",
    "santo andre",
    "sao bernardo",
    "guarulhos",
    "santos",
    "brooklin",
    "pinheiros",
    "lapa",
    "agua branca",
    "perdizes",
    "butanta",
    "morumbi",
    "tatuape",
    "mooca",
    "itaquera",
    "penha",
    "santana",
    "tucuruvi",
    "casa verde",
    "pirituba",
    "zona norte",
    "zona sul",
    "zona leste",
    "zona oeste",
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
