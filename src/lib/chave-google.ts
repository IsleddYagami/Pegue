// De qual projeto do Google vem a chave de mapas da Pegue.
//
// ORDEM DO FABIO (8/Nov/2026), quando eu perguntei se ligava o Places na
// chave de hoje ou criava um projeto novo: *"nao entendi? ja falei que nada
// da pegue se mistura a otimizi"* e, em seguida, *"independente"*.
//
// Entao a chave dos mapas da Pegue tem que nascer num projeto do Google
// Cloud que e' SO' da Pegue — faturamento, cota gratuita e historico de uso
// separados da Otimizi. Nome da variavel novo pra isso ser visivel:
//
//   GOOGLE_MAPS_API_KEY_PEGUE  -> chave do projeto so' da Pegue (o certo)
//   GOOGLE_MAPS_API_KEY        -> chave HERDADA, projeto nao confirmado
//
// Por que a herdada continua valendo: desligar o Google de uma vez jogaria
// o geocoder de volta pro Nominatim sozinho, que e' exatamente a falha que
// derrubou cliente de verdade em 28/Abr (Vila Atlantico). Quebrar a cotacao
// pra "ficar limpo" seria trocar uma violacao por um prejuizo.
//
// O QUE FAZ ISSO NAO SER PROMESSA: a herdada e' DENUNCIADA todo dia. O probe
// de google_maps no registry de integracoes (INV-51, cron diario) devolve
// "degradado" enquanto a chave for a antiga, com o motivo escrito. No dia em
// que ele puser GOOGLE_MAPS_API_KEY_PEGUE, o aviso apaga sozinho — sem
// deploy, sem ninguem lembrar de limpar nada.

import type { ResultadoProbe } from "@/lib/imuni/integracoes";

export type OrigemChaveGoogle = "pegue" | "herdada" | "ausente";

/** A chave que as chamadas usam. Prefere a do projeto so' da Pegue. */
export function chaveGoogle(): string | null {
  const propria = process.env.GOOGLE_MAPS_API_KEY_PEGUE;
  if (propria && propria.trim()) return propria.trim();
  const herdada = process.env.GOOGLE_MAPS_API_KEY;
  if (herdada && herdada.trim()) return herdada.trim();
  return null;
}

/** De onde ela veio — e' isso que o vigia diario le. */
export function origemChaveGoogle(): OrigemChaveGoogle {
  if (process.env.GOOGLE_MAPS_API_KEY_PEGUE?.trim()) return "pegue";
  if (process.env.GOOGLE_MAPS_API_KEY?.trim()) return "herdada";
  return "ausente";
}

/** Frase pronta pro painel/alerta. null quando esta tudo certo. */
export function avisoChaveGoogle(): string | null {
  switch (origemChaveGoogle()) {
    case "pegue":
      return null;
    case "herdada":
      return "chave em GOOGLE_MAPS_API_KEY: projeto do Google NAO confirmado como so da Pegue. Criar projeto proprio e por a chave em GOOGLE_MAPS_API_KEY_PEGUE.";
    case "ausente":
      return "sem chave do Google: geocoding e busca de bairro caem no OpenStreetMap (cobertura menor).";
  }
}

/**
 * Probe pro registry de integracoes (INV-51, cron diario). Fica AQUI, e nao
 * no registry, por um motivo pratico: o registry importa o supabase-admin e
 * nao carrega fora do servidor — aqui a trava tem teste de verdade rodando.
 *
 * NAO chama o Google: toda chamada la' e' billable. So' le a variavel.
 */
export function probeChaveGoogle(): Promise<ResultadoProbe> {
  const aviso = avisoChaveGoogle();
  if (!aviso) return Promise.resolve({ status: "ok", latenciaMs: 0 });
  return Promise.resolve({ status: "degradado", latenciaMs: 0, detalhe: aviso });
}
