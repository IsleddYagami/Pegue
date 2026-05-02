// IMUNI persona — identidade, linguagem e tom de voz.
//
// Diretiva Fabio (1/Mai/2026): "alguem leigo... que vizualizando de
// alguma forma o que ela esta fazendo seja divertido e facil entender,
// nao precisa ser programador para conseguir entender os efeitos que
// ela realmente causou naquele corpo... ela eh a cura para corpos
// sistemicos com imunidade baixa".
//
// IMUNI eh tratada como AGENTE AUTONOMO com:
//   - Identidade propria (nao eh "ferramenta", eh "ela")
//   - Linguagem medica/biologica (corpo, defesa, patogeno, anticorpo)
//   - Personalidade calma e protetora
//   - Comunicacao em primeira pessoa quando faz sentido

// === MAPEAMENTO TECNICO -> HUMANO ===
// Centralizado aqui pra todo dashboard, e-mails e relatorios usarem
// a mesma linguagem.

export const TERMOS = {
  // Sistema
  invariante: "sentinela",
  invariantes: "sentinelas",
  plugin: "tratamento",
  cron: "patrulha",

  // Estados
  violacao_alta: "ameaca critica",
  violacoes_alta: "ameacas criticas",
  violacao_media: "sintoma leve",
  violacoes_media: "sintomas leves",
  saudavel: "imunidade ativa",
  ok: "tudo limpo",

  // Acoes
  bug_caçado: "patogeno neutralizado",
  bugs_caçados: "patogenos neutralizados",
  execucao: "patrulha",
  execucoes: "patrulhas",
  alerta: "aviso de saude",

  // Metricas
  score: "saude geral",
  tempo_limpo: "dias sem incidente",
  tendencia: "evolucao da saude",

  // Camadas
  schema_types: "memoria celular",
  lint_rules: "anticorpos",
  testes: "exames de rotina",
  invariantes_cron: "patrulha diaria",
  pre_commit: "barreira protetora",
  monitoring: "monitor cardiaco",
};

// === FRASES DA IMUNI ===
// Curtas, em primeira pessoa, calmas. Sem jargão técnico.

export function fraseSaudacao(plugin: string): string {
  const dominioCapitalizado = plugin.charAt(0).toUpperCase() + plugin.slice(1);
  return `Sou a IMUNI. Cuido da saude do sistema ${dominioCapitalizado} 24h por dia, sem descanso.`;
}

export function fraseStatus(score: number): string {
  if (score >= 90) return "Imunidade otima. Pode dormir tranquilo.";
  if (score >= 70) return "Imunidade boa, mas com alguns sintomas pra observar.";
  if (score >= 50) return "Atencao: ha sinais de fragilidade no sistema.";
  return "Estado critico. Preciso de ajuda humana agora.";
}

export function fraseTempoLimpo(horas: number | null): string {
  if (horas === null) return "Desde que cheguei, nunca tive uma ameaca critica.";
  if (horas < 24) return `Ha ${horas}h enfrentei uma ameaca critica. Estou de olho.`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return `${dias} dias sem ameaca critica. Mantendo vigilancia.`;
  if (dias < 30) return `${dias} dias limpos. Sistema em otima forma.`;
  return `${dias} dias sem incidente. Sistema em estado de saude exemplar.`;
}

export function fraseTendencia(rumo: "melhor" | "pior" | "igual", delta: number): string {
  if (rumo === "melhor") return `O corpo esta se fortalecendo: ${Math.abs(delta)}% menos sintomas que semana passada.`;
  if (rumo === "pior") return `Atencao: aumento de ${delta}% em sintomas vs semana anterior. Investigar causa.`;
  return "Saude estavel comparado a semana anterior.";
}

export function fraseProximaPatrulha(): string {
  const agora = new Date();
  const proxima = new Date(agora);
  proxima.setHours(4, 0, 0, 0);
  if (agora.getHours() >= 4) {
    proxima.setDate(proxima.getDate() + 1);
  }
  const horas = Math.ceil((proxima.getTime() - agora.getTime()) / (60 * 60 * 1000));
  return `Proxima patrulha completa em ${horas}h (madrugada 04:00).`;
}

export function fraseSobreSentinela(nome: string, count: number, ok: boolean): string {
  if (ok) return "Tudo limpo nessa area.";
  if (count === 1) return "Detectei 1 caso suspeito que precisa ser investigado.";
  return `Detectei ${count} casos suspeitos nessa area do corpo.`;
}

// === SEVERIDADE COM EMOJI ===
// Pra ser instantaneamente legivel pra leigo.

export const SEVERIDADE_VISUAL = {
  alta: { emoji: "🔴", label: "Critico", cor: "red" },
  media: { emoji: "🟡", label: "Atencao", cor: "yellow" },
  baixa: { emoji: "🔵", label: "Leve", cor: "blue" },
};

// === STATUS GERAL ===

export function statusGeral(score: number): {
  emoji: string;
  titulo: string;
  cor: string;
  pulso: boolean; // se anima como batimento cardiaco
} {
  if (score >= 90) return { emoji: "💚", titulo: "Saudavel", cor: "green", pulso: true };
  if (score >= 70) return { emoji: "💛", titulo: "Atencao", cor: "yellow", pulso: true };
  if (score >= 50) return { emoji: "🧡", titulo: "Fragilizado", cor: "orange", pulso: true };
  return { emoji: "❤️‍🩹", titulo: "Critico", cor: "red", pulso: true };
}

// === ITENS DO BOLETIM (descricoes humanizadas das camadas) ===

export const CAMADAS_HUMANAS = [
  {
    id: "1",
    nome_tec: "Schema types",
    nome_humano: "Memoria celular",
    descricao_humana: "Lembro o formato exato de cada estrutura do corpo. Se algo tentar deformar, eu detecto antes mesmo de entrar.",
    icone: "🧬",
  },
  {
    id: "1B",
    nome_tec: "ESLint custom",
    nome_humano: "Anticorpos personalizados",
    descricao_humana: "Tenho 3 anticorpos especificos treinados pelos bugs ja encontrados. Cada novo bug vira novo anticorpo.",
    icone: "🦠",
  },
  {
    id: "2",
    nome_tec: "Testes regressivos",
    nome_humano: "Exames de rotina",
    descricao_humana: "450 exames clinicos automaticos rodam antes de qualquer mudanca entrar no corpo.",
    icone: "🧪",
  },
  {
    id: "3",
    nome_tec: "Cron invariantes",
    nome_humano: "Patrulha diaria",
    descricao_humana: "Toda madrugada vario o corpo todo procurando sinais de doenca. 16 sentinelas verificam areas criticas.",
    icone: "🛡️",
  },
  {
    id: "4",
    nome_tec: "Pre-commit hook",
    nome_humano: "Barreira protetora",
    descricao_humana: "Filtro a entrada de qualquer celula nova. Se nao passar nos exames, nao deixo entrar.",
    icone: "🚧",
  },
  {
    id: "5",
    nome_tec: "Sentry + alertas",
    nome_humano: "Monitor cardiaco",
    descricao_humana: "Acompanho cada batimento do sistema. Se algo der errado em tempo real, te aviso no WhatsApp.",
    icone: "💓",
  },
];
