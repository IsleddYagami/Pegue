// Utilitarios do bot

// Palavras reservadas que NUNCA devem ser aceitas como endereço.
// Bug detectado em 25/Abr/2026: cliente digitou PRONTO pra fechar fotos e o
// sistema geocodificou "Pronto" como endereço de destino. Cotacao R$780 saiu
// com destino="Pronto". Inaceitavel — viola feedback_jamais_cotar_sem_certeza.
const PALAVRAS_RESERVADAS_ENDERECO = new Set([
  // Comandos de fluxo
  "pronto", "sim", "nao", "não", "ok", "agora", "ajudante", "ajudantes",
  "confirma", "confirmar", "confirmado", "corrigir", "alterar", "cancelar",
  "repetir", "avaliar", "parar", "proximo", "próximo", "pular", "jogar",
  // Comandos de prestador/cliente
  "meus", "minha", "esqueci", "indicar", "despesa", "gastos", "ferias", "férias",
  "voltei", "pegar", "atendimento", "data", "menu", "frete", "frete?",
  "carreto", "guincho", "mudanca", "mudança", "parcerias", "fretes",
  // Confirmacoes/saudacoes curtas
  "oi", "ola", "olá", "bom", "boa", "obrigado", "obrigada", "valeu", "tchau",
  // Numeros isolados (1-22 cobre menus + lista mudanca)
  ...Array.from({ length: 22 }, (_, i) => String(i + 1)),
]);

export function isPalavraReservadaEndereco(texto: string): boolean {
  if (!texto) return true;
  const limpo = texto.trim().toLowerCase().replace(/[!.?]+$/, "");
  if (limpo.length === 0) return true;
  // Se for UMA unica palavra/numero E essa palavra esta na lista de reservadas
  if (!/\s/.test(limpo) && PALAVRAS_RESERVADAS_ENDERECO.has(limpo)) return true;
  return false;
}

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

// Detecta se o texto digitado pelo cliente menciona rua/avenida/etc.
// Quando NAO menciona (ex: cliente digitou so "Agua Branca"), nao podemos
// inventar uma rua no formato — bug detectado em 25/Abr.
export function inputContemRua(texto: string): boolean {
  if (!texto) return false;
  const lower = texto.toLowerCase();
  const palavrasRua = [
    "rua ", "r. ", "r ", "av ", "avenida ", "av. ",
    "alameda ", "al ", "al. ",
    "estrada ", "estr ", "estr. ", "rodovia ", "rod ", "rod. ",
    "travessa ", "tv ", "tv. ",
    "praca ", "praça ", "pç ", "pca ",
    "viela ", "viaduto ", "largo ", "ladeira ",
  ];
  return palavrasRua.some((p) => lower.startsWith(p) || lower.includes(", " + p) || lower.includes(" " + p));
}

// Retorna so bairro + cidade (omite rua/numero). Usado quando o cliente
// digitou so o bairro — mostrar uma rua que ele nao mencionou da impressao
// que o sistema inventou (ver Bug 25/Abr/2026 com "Agua Branca").
export async function reverseGeocodeBairroCidade(
  lat: number,
  lng: number
): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { "User-Agent": "Pegue-Bot/1.0" } }
    );
    if (!response.ok) return "Localizacao recebida";
    const data = await response.json();
    const addr = data.address || {};
    const parts = [
      addr.suburb || addr.neighbourhood,
      addr.city || addr.town || addr.village,
    ].filter(Boolean);
    return parts.join(", ") || data.display_name || "Localizacao recebida";
  } catch {
    return "Localizacao recebida";
  }
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

// Geocode endereco para coordenadas via Nominatim.
// Adiciona "São Paulo" ao endereco se nao tiver contexto de estado/cidade.
// Tenta FALLBACK em cascata se a primeira busca falhar:
//   1. endereco completo
//   2. bairro + cidade (tira o numero/rua)
//   3. so cidade (aproximacao ampla)
// Retorna coords mesmo que aproximadas pra nao travar o fluxo do cliente.

async function geocodeUnico(query: string, timeoutMs = 3000): Promise<{ lat: number; lng: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`,
      { headers: { "User-Agent": "Pegue-Bot/1.0" }, signal: controller.signal }
    );
    clearTimeout(timer);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

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

    const queryCompleta = temContexto ? addr : `${addr}, São Paulo, SP`;
    const partes = addr.split(",").map((p) => p.trim()).filter(Boolean);

    // Prepara as 3 queries (completa, bairro+cidade, so cidade) e dispara TODAS em paralelo.
    // Primeira que responder coords validas vence. Reduz tempo de ~3s (cascata) pra ~1s (paralelo).
    const queries: { query: string; label: string }[] = [
      { query: queryCompleta, label: "completa" },
    ];

    if (partes.length >= 2) {
      const semRua = partes.slice(-2).join(", ");
      queries.push({
        query: temContexto ? semRua : `${semRua}, SP`,
        label: "bairro_cidade",
      });
    }
    if (partes.length >= 1) {
      const soCidade = partes[partes.length - 1].split("/")[0].trim();
      if (soCidade.length > 2) {
        queries.push({ query: `${soCidade}, SP, Brasil`, label: "so_cidade" });
      }
    }

    try {
      // Promise.any: primeira que resolver com resultado valido ganha. Rejeita null explicitamente
      // pra que Promise.any continue esperando outras candidatas.
      const resultado = await Promise.any(
        queries.map(async ({ query, label }) => {
          const r = await geocodeUnico(query);
          if (!r) throw new Error(`${label} falhou`);
          if (label !== "completa") {
            console.warn(`[geocode] fallback "${label}" venceu pra: "${addr}"`);
          }
          return r;
        })
      );
      return resultado;
    } catch {
      console.error(`[geocode] TODAS as tentativas falharam pra: "${addr}"`);
      return null;
    }
  } catch (error: any) {
    console.error(`[geocode] exception:`, error?.message);
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
type ZonaDificuldade = "normal" | "dificil" | "fundao" | "indisponivel";

// === AREAS INDISPONIVEIS (favelas/areas livres) ===
// Nao atendemos para preservar seguranca dos prestadores
const ZONAS_INDISPONIVEL: string[] = [
  // SP - Complexos e comunidades conhecidas
  "heliopolis", "heliópolis", "paraisopolis", "paraisópolis",
  "vila prudente favela", "sapopemba favela",
  "cidade de deus", "pantanal zona sul",
  "favela do moinho", "moinho",
  "favela alba", "favela do alba",
  "jaqueline", "vila jaqueline",
  "jardim keralux", "keralux",
  "favela do real parque", "real parque favela",
  "jardim colombo favela",
  "vila nova jaguare favela",
  // Osasco
  "morro do socó", "morro do soco",
  "favela do mandaqui",
  "vila menck favela",
  // Guarulhos
  "favela dos pelados",
  // Termos genericos que indicam area livre
  "area livre", "área livre",
  "ocupacao", "ocupação",
  "invasao", "invasão",
];

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

  // Primeiro: verifica se é area indisponivel (favela/area livre)
  for (const zona of ZONAS_INDISPONIVEL) {
    const zonaNorm = zona.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (lower.includes(zonaNorm)) return "indisponivel";
  }
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
  // Aceita: 06010000, 06010-000, 06010.000, 06010 000, 06.010-000, "cep 06010-000"
  // Remove pontos e espacos antes de bater o regex
  const limpo = (texto || "").replace(/\./g, "").replace(/\s+/g, " ");
  const match = limpo.match(/\b(\d{5})[-\s]?(\d{3})\b/);
  if (!match) return null;
  return `${match[1]}${match[2]}`;
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
  // Normaliza pra detectar tambem com acento ("Praça da Sé" vira "praca da se")
  const lower = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return palavras.some((p) => lower.includes(p)) || !!extrairCep(texto);
}

// Detecta saudacao
export function isSaudacao(texto: string): boolean {
  const saudacoes = [
    "oi", "ola", "olá", "bom dia", "boa tarde", "boa noite",
    "hey", "eae", "e ai", "hello", "hi", "fala", "salve", "opa",
    "boa", "blz", "beleza",
  ];
  const lower = texto.toLowerCase().trim();
  return saudacoes.some((s) => lower.startsWith(s));
}

export function isInicioServico(texto: string): boolean {
  const termos = [
    "frete", "fretes", "carreto", "carretos", "mudanca", "mudança",
    "mudancas", "mudanças", "guincho", "guinchos", "transporte",
    "transportar", "levar", "buscar", "preciso", "quero",
    "cotacao", "cotação", "orcamento", "orçamento", "quanto custa",
  ];
  const lower = texto.toLowerCase().trim();
  return termos.some((t) => lower.includes(t));
}

// Detecta agradecimento
export function isAgradecimento(texto: string): boolean {
  const palavras = ["obrigad", "valeu", "thanks", "brigad", "agradec"];
  // Normaliza pra detectar tambem com cedilha ("agradeço" vira "agradeco")
  const lower = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

// Mensagens automaticas tipicas do WhatsApp Business e bots empresariais.
// Usado logo no inicio do webhook - se detectado, NAO responder nem alertar.
// Vale pra qualquer phone (cliente, prestador ou desconhecido).
const RESPOSTAS_AUTOMATICAS_GLOBAIS = [
  "obrigado por entrar em contato",
  "agradecemos sua mensagem",
  "retornaremos em breve",
  "mensagem automatica",
  "mensagem automática",
  "no momento nao",
  "no momento não",
  "estamos indisponiveis",
  "estamos indisponíveis",
  "horario de atendimento",
  "horário de atendimento",
  "aguarde um momento",
  "em breve retornaremos",
  "servico de rastreamento",
  "serviço de rastreamento",
  "atendimento positron",
  "atendimento pósitron",
  "bem vindo ao atendimento",
  "bem-vindo ao atendimento",
  "digite uma das opcoes",
  "digite uma das opções",
  "escolha uma opcao",
  "escolha uma opção",
  "nao entendi a opcao",
  "não entendi a opção",
  "opcao invalida",
  "opção inválida",
  "nao encontrei a opcao",
  "não encontrei a opção",
];

export function ehRespostaAutomatica(texto: string): boolean {
  if (!texto) return false;
  const lower = texto.toLowerCase();
  return RESPOSTAS_AUTOMATICAS_GLOBAIS.some((r) => lower.includes(r));
}

// Itens que exigem desmontagem prévia (Pegue não monta nem desmonta).
// Quando IA Vision identificar um desses, bot avisa no momento.
const ITENS_PRECISAM_DESMONTAR = [
  "guarda-roupa", "guarda roupa", "guarda-roupas",
  "cama", "cama casal", "cama solteiro", "cama box", "beliche",
  "estante", "estantes",
  "armario", "armário",
  "rack", "racks",
  "escrivaninha",
  "home theater",
  "berço", "berco",
  "aparador",
  "mesa de jantar",
  "mesa grande",
];

export function precisaDesmontar(descricaoItens: string | string[]): string[] {
  if (!descricaoItens) return [];
  const textos = Array.isArray(descricaoItens) ? descricaoItens : [descricaoItens];
  const alertas: string[] = [];
  for (const txt of textos) {
    const lower = txt.toLowerCase();
    for (const padrao of ITENS_PRECISAM_DESMONTAR) {
      if (lower.includes(padrao)) {
        // Extrai o nome mais "limpo" do item (sem classificacao entre parenteses etc)
        const nome = txt.replace(/\([^)]*\)/g, "").trim();
        if (!alertas.includes(nome)) alertas.push(nome);
        break;
      }
    }
  }
  return alertas;
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
// Extrai horario da mensagem do cliente. Cobre: 14:30, 14h, 14h30,
// 14hs, 14 horas, "as 14", "manha", "tarde", numero solto sem data.
export function extrairHorario(texto: string): string | null {
  // PRIMEIRO tenta formatos especificos (14:30, 14h, "as 14"). Se cliente
  // disse "amanha as 14:30", queremos retornar "14:30", nao "Manha"
  // (bug 25/Abr: substring 'manha' dentro de 'amanha' era detectada antes).

  // Formato: 14:30, 14h30, 14hs30
  const matchHM1 = texto.match(/(\d{1,2})\s*[h:]\s*(\d{1,2})/);
  if (matchHM1) {
    const h = parseInt(matchHM1[1]);
    const m = parseInt(matchHM1[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  // Formato: 15h, 15hs, 15 horas, 15 hs, 15hora
  const matchH = texto.match(/(\d{1,2})\s*(?:h|hs|hrs|horas|hora)/);
  if (matchH) {
    const h = parseInt(matchH[1]);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:00`;
    }
  }

  // Formato: "as 15", "às 15"
  const matchAs = texto.match(/[aà]s?\s+(\d{1,2})(?!\s*[\/\-])/);
  if (matchAs) {
    const h = parseInt(matchAs[1]);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, "0")}:00`;
    }
  }

  // So numero solto (15, 9) - apenas se NAO tem data na mensagem
  const temData = /\d{1,2}[\/\-]\d{1,2}|amanh|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo|hoje/i.test(texto);
  if (!temData) {
    const matchNum = texto.match(/^(\d{1,2})$/);
    if (matchNum) {
      const h = parseInt(matchNum[1]);
      if (h >= 6 && h <= 23) {
        return `${String(h).padStart(2, "0")}:00`;
      }
    }
  }

  // FALLBACK: palavras manha/tarde — so se nao achou formato especifico antes.
  // Negative lookbehind `(?<!a)` evita falso positivo com "amanha" (contem
  // "manha"). Lookbehind funciona melhor que \b com caracteres acentuados.
  if (/(?<!a)manh[ãa]/.test(texto)) return "Manha (08:00 - 12:00)";
  if (/tarde/.test(texto)) return "Tarde (13:00 - 17:00)";

  return null;
}

// Extrai data da mensagem. Cobre: 25/04, 25-4, 02.05, "02 de maio",
// "dia 25", "02 05", "hoje", "amanha", dias da semana.
// Retorna formato DD/MM (mes atual se ambíguo).
export function extrairData(texto: string): string | null {
  const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

  // Meses por nome
  const meses: Record<string, number> = {
    janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4,
    maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9,
    outubro: 10, novembro: 11, dezembro: 12,
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  };

  // Formato: 25/04, 25/4, 25-04, 02.05
  const matchBarra = texto.match(/(\d{1,2})[\/\-\.](\d{1,2})/);
  if (matchBarra) {
    const dia = String(parseInt(matchBarra[1])).padStart(2, "0");
    const mes = String(parseInt(matchBarra[2])).padStart(2, "0");
    return `${dia}/${mes}`;
  }

  // Formato: "02 de maio", "2 de maio", "dia 02 de maio"
  for (const [nomeMes, numMes] of Object.entries(meses)) {
    const regexDeMes = new RegExp(`(\\d{1,2})\\s*(?:de\\s*)?${nomeMes}`);
    const matchMes = texto.match(regexDeMes);
    if (matchMes) {
      const dia = String(parseInt(matchMes[1])).padStart(2, "0");
      const mes = String(numMes).padStart(2, "0");
      return `${dia}/${mes}`;
    }
  }

  // Formato: "dia 25", "dia 02" (assume mes atual)
  const matchDia = texto.match(/dia\s+(\d{1,2})/);
  if (matchDia) {
    const dia = String(parseInt(matchDia[1])).padStart(2, "0");
    const mes = String(hoje.getMonth() + 1).padStart(2, "0");
    return `${dia}/${mes}`;
  }

  // Formato: "02 05" (dois numeros separados por espaco, sem horario no meio)
  // So pega se nao tem h/hora/hs junto do segundo numero
  const matchEspaco = texto.match(/(\d{1,2})\s+(\d{1,2})(?!\s*[h:]|\s*hora|\s*hs)/);
  if (matchEspaco) {
    const n1 = parseInt(matchEspaco[1]);
    const n2 = parseInt(matchEspaco[2]);
    // Se n1 <= 31 e n2 <= 12, assume dia/mes
    if (n1 >= 1 && n1 <= 31 && n2 >= 1 && n2 <= 12) {
      return `${String(n1).padStart(2, "0")}/${String(n2).padStart(2, "0")}`;
    }
  }

  // Palavras: hoje, amanha
  if (texto.includes("hoje")) {
    return `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  }
  if (texto.includes("amanh")) {
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    return `${String(amanha.getDate()).padStart(2, "0")}/${String(amanha.getMonth() + 1).padStart(2, "0")}`;
  }

  // Dias da semana
  const diasSemana: Record<string, number> = {
    domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3,
    quinta: 4, sexta: 5, sabado: 6, sábado: 6,
  };

  for (const [nome, numDia] of Object.entries(diasSemana)) {
    if (texto.includes(nome)) {
      const diff = (numDia - hoje.getDay() + 7) % 7 || 7;
      const data = new Date(hoje);
      data.setDate(data.getDate() + diff);
      return `${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}`;
    }
  }

  return null;
}

// Determina o melhor veiculo entre o atual e um novo sugerido. NUNCA regride
// (se atual=hr e novo sugere utilitario, mantem hr). Garante que adicionar
// itens menores nao baixa o veiculo escolhido pra um item maior anterior.
export function determinarMelhorVeiculo(
  veiculoAtual: string | null,
  veiculoNovo: string
): string {
  const hierarquia: Record<string, number> = {
    carro_comum: 0,
    utilitario: 1,
    hr: 2,
    caminhao_bau: 3,
  };
  const nivelAtual = hierarquia[veiculoAtual || "utilitario"] ?? 1;
  const nivelNovo = hierarquia[veiculoNovo] ?? 1;
  if (nivelNovo > nivelAtual) return veiculoNovo;
  return veiculoAtual || "utilitario";
}

// Formata lista de itens (separados por ", ") em formato numerado pra exibir
// pro cliente. Ex: "Geladeira, Sofa, TV" -> "1. Geladeira\n2. Sofa\n3. TV"
export function formatarListaNumerada(descricao: string | null): string {
  if (!descricao) return "";
  return descricao
    .split(", ")
    .filter((i) => i.trim().length > 0)
    .map((item, idx) => `${idx + 1}. ${item}`)
    .join("\n");
}

// Conta quantidade total de itens em texto livre.
// Aceita QUALQUER formato: virgula, ponto, ponto-e-virgula, quebra de
// linha, ' e ', ' / ', traco, ou multiplos espacos/tabs.
// Ex: "2 camas, 3 cadeiras, 1 sofa" => 6
// Ex: "geladeira\nfogao\ncama" => 3 (lista em linhas)
// Ex: "5x caixas" => 5 (forma alternativa com 'x')
export function contarItensTexto(texto: string): number {
  if (!texto) return 0;
  // Splitter robusto: virgula, ponto-virgula, ponto, quebra linha,
  // ' e ', ' / ', barra, traco com espacos.
  const partes = texto
    .split(/[,;.\n\r]|\s+e\s+|\s+\/\s+|\s+-\s+/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 1);
  let total = 0;
  for (const parte of partes) {
    const matchQtd = parte.match(/^(\d+)\s*x?\s*\w/i);
    total += matchQtd ? parseInt(matchQtd[1], 10) : 1;
  }
  return total || (texto.trim() ? 1 : 0);
}

// Sugere veiculo baseado em volume (m3) e peso (kg) total da carga.
// Limites calibrados 26/Abr/2026 com base em FROTA REAL Pegue + ajustes
// conservadores Fabio (HR 1000kg, caminhao 2500kg pra evitar saturacao
// e considerar trafego urbano).
//
// - Strada/Saveiro/Courier (utilitario): 650kg + 1.0m³
// - HR Bongo: 1.000kg + 8m³ (Fabio: conservador, capacidade real eh 1.800kg
//   mas em pratica fretistas evitam cheio por trafego/seguranca)
// - Iveco Daily (caminhao_bau): 2.500kg + 12m³
// - Acima: carga_excedida → escala humano
export function sugerirVeiculoPorVolumePeso(
  volumeM3: number,
  pesoKg: number
): "utilitario" | "hr" | "caminhao_bau" | "carga_excedida" {
  // Excede o maior veiculo da frota Pegue
  if (volumeM3 > 12 || pesoKg > 2500) return "carga_excedida";
  // Caminhao bau Iveco Daily
  if (volumeM3 > 8 || pesoKg > 1000) return "caminhao_bau";
  // HR Bongo
  if (volumeM3 > 1.0 || pesoKg > 650) return "hr";
  // Utilitario: cabe em Strada/Saveiro/Courier
  return "utilitario";
}

// Parse "100 50 200" ou "100x50x200" ou "100 x 50 x 200" pra [largura, altura, comprimento] em cm.
// Retorna null se nao conseguir parsear 3 numeros.
export function parseDimensoes(texto: string): { largura: number; altura: number; comprimento: number } | null {
  if (!texto) return null;
  // Captura todos numeros (inclusive decimais)
  const numeros = texto.match(/\d+(?:[.,]\d+)?/g);
  if (!numeros || numeros.length < 3) return null;
  const [a, b, c] = numeros.slice(0, 3).map((n) => parseFloat(n.replace(",", ".")));
  if (isNaN(a) || isNaN(b) || isNaN(c)) return null;
  if (a <= 0 || b <= 0 || c <= 0) return null;
  return { largura: a, altura: b, comprimento: c };
}

// Calcula volume em m3 dadas dimensoes em CM. (LxAxC)/1.000.000
export function calcularVolumeM3(larguraCm: number, alturaCm: number, comprimentoCm: number): number {
  return (larguraCm * alturaCm * comprimentoCm) / 1_000_000;
}

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
