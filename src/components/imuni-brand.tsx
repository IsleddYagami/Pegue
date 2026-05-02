// Componentes oficiais da marca IMUNI.
//
// Use sempre que precisar exibir wordmark ou simbolo. Os SVG paths
// estao inline aqui (vindos de public/imuni/svg/) pra garantir que
// renderizam mesmo sem rede e funcionam em SSR/RSC.
//
// IMPORTANTE: nao reproduzir manualmente a logo em outro lugar.
// Sempre importar daqui pra preservar consistencia visual da marca.
//
// Versao 2 (2/Mai/2026): refinamento aprovado por Fabio com chanfros
// diagonais entre M/N e os "i" laterais — separa as 5 letras (i·M·U·N·i)
// dando respiracao e legibilidade. Em tamanhos micro (favicon 16/32px)
// usar `ImuniCompacto` que omite os chanfros pra nao virar ruido.

import { type CSSProperties } from "react";

// Todas as 3 variantes compartilham o mesmo viewBox 0 0 476 208.
const VIEWBOX = "0 0 476 208";

type SvgProps = {
  className?: string;
  style?: CSSProperties;
  title?: string;
};

/**
 * Wordmark "iMUNi" — versao PRINCIPAL com chanfros diagonais.
 *
 * USO PADRAO: dashboard, site, papelaria, redes sociais, apresentacoes,
 * cartoes — qualquer coisa exibida acima de ~80px de altura.
 *
 * - currentColor: herda do CSS pai (text-white, text-[#C9A84C], etc)
 * - paths inline: nada de fetch, funciona sem rede
 *
 * @example
 * <ImuniWordmark className="text-[#C9A84C] h-12" />
 */
export function ImuniWordmark({ className, style, title = "IMUNI" }: SvgProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEWBOX}
      role="img"
      aria-label={title}
      className={className}
      style={style}
      fill="currentColor"
    >
      <title>{title}</title>
      {/* Anticorpo esquerdo (ponto sobre o "i" da esquerda) */}
      <path d="M 24.00 0.00 L 16.00 3.00 L 7.00 11.00 L 2.00 23.00 L 2.00 33.00 L 6.00 43.00 L 12.00 50.00 L 21.00 55.00 L 32.00 56.00 L 33.00 55.00 L 39.00 54.00 L 48.00 48.00 L 53.00 41.00 L 53.00 39.00 L 55.00 36.00 L 56.00 25.00 L 55.00 24.00 L 55.00 21.00 L 53.00 15.00 L 44.00 5.00 L 33.00 0.00 Z" />
      {/* Anticorpo direito (ponto sobre o "i" da direita) */}
      <path d="M 442.00 2.00 L 433.00 5.00 L 424.00 13.00 L 419.00 25.00 L 419.00 35.00 L 422.00 44.00 L 428.00 52.00 L 436.00 57.00 L 448.00 59.00 L 449.00 58.00 L 453.00 58.00 L 459.00 56.00 L 467.00 49.00 L 471.00 43.00 L 473.00 37.00 L 473.00 24.00 L 470.00 16.00 L 467.00 12.00 L 460.00 6.00 L 450.00 2.00 Z" />
      {/* M central */}
      <path d="M 156.00 66.00 L 154.00 68.00 L 154.00 166.00 L 155.00 167.00 L 155.00 170.00 L 158.00 179.00 L 166.00 191.00 L 175.00 198.00 L 181.00 201.00 L 187.00 203.00 L 190.00 203.00 L 191.00 204.00 L 195.00 204.00 L 201.00 206.00 L 209.00 206.00 L 210.00 205.00 L 209.00 68.00 L 207.00 66.00 L 204.00 65.00 L 163.00 65.00 L 162.00 66.00 Z" />
      {/* U central */}
      <path d="M 331.00 65.00 L 280.00 65.00 L 278.00 66.00 L 276.00 69.00 L 276.00 206.00 L 284.00 206.00 L 285.00 205.00 L 296.00 204.00 L 312.00 198.00 L 322.00 190.00 L 328.00 182.00 L 331.00 176.00 L 334.00 167.00 L 334.00 164.00 L 335.00 163.00 L 335.00 68.00 Z" />
      {/* N central (com chanfro pra "i" direito) */}
      <path d="M 340.00 66.00 L 340.00 139.00 L 351.00 147.00 L 356.00 152.00 L 358.00 152.00 L 373.00 165.00 L 377.00 166.00 L 382.00 171.00 L 412.00 195.00 L 412.00 114.00 Z" />
      {/* "i" esquerdo — coluna guardia */}
      <path d="M 2.00 69.00 L 0.00 72.00 L 0.00 192.00 L 1.00 194.00 L 5.00 197.00 L 52.00 197.00 L 56.00 195.00 L 56.00 191.00 L 57.00 190.00 L 57.00 181.00 L 56.00 180.00 L 56.00 152.00 L 57.00 151.00 L 57.00 69.00 L 26.00 69.00 L 25.00 68.00 L 18.00 68.00 L 17.00 69.00 Z" />
      {/* Curva da base — escudo invisivel abracando MUN */}
      <path d="M 62.00 69.00 L 62.00 154.00 L 96.00 183.00 L 100.00 185.00 L 107.00 185.00 L 113.00 181.00 L 121.00 173.00 L 122.00 173.00 L 149.00 149.00 L 149.00 70.00 L 110.00 105.00 L 106.00 105.00 L 82.00 84.00 L 70.00 75.00 L 64.00 69.00 Z" />
      {/* "i" direito — coluna guardia */}
      <path d="M 420.00 72.00 L 418.00 73.00 L 417.00 75.00 L 417.00 198.00 L 421.00 202.00 L 471.00 202.00 L 475.00 197.00 L 475.00 75.00 L 472.00 72.00 Z" />
      {/* Conexao da base entre "i"s laterais e MUN central */}
      <path d="M 215.00 148.00 L 215.00 206.00 L 216.00 207.00 L 270.00 207.00 L 271.00 206.00 L 271.00 148.00 L 270.00 148.00 L 264.00 154.00 L 260.00 156.00 L 251.00 157.00 L 250.00 158.00 L 235.00 158.00 L 234.00 157.00 L 229.00 157.00 L 220.00 153.00 Z" />
    </svg>
  );
}

/**
 * Wordmark "iMUNi" — versao COMPACTA sem chanfros (formas fundidas).
 *
 * USO ESPECIFICO: micro-aplicacoes onde os chanfros virariam ruido
 * pixelado — favicon 16/32px, badges pequenos, indicadores de UI
 * muito reduzidos.
 *
 * Mantem todos os elementos da marca (anticorpos + colunas + MUN
 * abracado) porem sem os cortes diagonais.
 *
 * @example
 * <ImuniCompacto className="text-[#C9A84C] h-4" />
 */
export function ImuniCompacto({ className, style, title = "IMUNI" }: SvgProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEWBOX}
      role="img"
      aria-label={title}
      className={className}
      style={style}
      fill="currentColor"
    >
      <title>{title}</title>
      <path d="M 25.00 0.00 L 24.00 2.00 L 19.00 3.00 L 14.00 6.00 L 8.00 12.00 L 3.00 24.00 L 3.00 34.00 L 7.00 44.00 L 13.00 51.00 L 22.00 56.00 L 33.00 57.00 L 34.00 56.00 L 40.00 55.00 L 49.00 49.00 L 54.00 42.00 L 54.00 40.00 L 56.00 37.00 L 57.00 26.00 L 56.00 25.00 L 56.00 22.00 L 54.00 16.00 L 45.00 6.00 L 37.00 2.00 L 35.00 2.00 L 34.00 0.00 Z" />
      <path d="M 443.00 3.00 L 434.00 6.00 L 425.00 14.00 L 420.00 26.00 L 420.00 36.00 L 423.00 45.00 L 429.00 53.00 L 437.00 58.00 L 449.00 60.00 L 450.00 59.00 L 454.00 59.00 L 460.00 57.00 L 468.00 50.00 L 472.00 44.00 L 474.00 38.00 L 474.00 25.00 L 471.00 17.00 L 468.00 13.00 L 461.00 7.00 L 451.00 3.00 Z" />
      <path d="M 157.00 67.00 L 155.00 69.00 L 155.00 167.00 L 156.00 168.00 L 156.00 171.00 L 159.00 180.00 L 167.00 192.00 L 176.00 199.00 L 182.00 202.00 L 188.00 204.00 L 191.00 204.00 L 192.00 205.00 L 196.00 205.00 L 202.00 207.00 L 210.00 207.00 L 211.00 206.00 L 210.00 69.00 L 208.00 67.00 L 205.00 66.00 L 164.00 66.00 L 163.00 67.00 Z" />
      <path d="M 332.00 66.00 L 281.00 66.00 L 279.00 67.00 L 277.00 70.00 L 277.00 207.00 L 285.00 207.00 L 286.00 206.00 L 297.00 205.00 L 313.00 199.00 L 323.00 191.00 L 329.00 183.00 L 332.00 177.00 L 335.00 168.00 L 335.00 165.00 L 336.00 164.00 L 336.00 69.00 Z" />
      <path d="M 341.00 67.00 L 341.00 140.00 L 352.00 148.00 L 357.00 153.00 L 359.00 153.00 L 374.00 166.00 L 378.00 167.00 L 383.00 172.00 L 405.00 189.00 L 408.00 192.00 L 408.00 205.00 L 424.00 205.00 L 425.00 203.00 L 472.00 203.00 L 475.00 200.00 L 475.00 75.00 L 473.00 73.00 L 425.00 73.00 L 424.00 72.00 L 424.00 67.00 L 408.00 67.00 L 408.00 109.00 L 405.00 110.00 Z" />
      <path d="M 0.00 73.00 L 0.00 193.00 L 1.00 193.00 L 4.00 197.00 L 6.00 198.00 L 52.00 198.00 L 53.00 199.00 L 67.00 199.00 L 67.00 161.00 L 68.00 160.00 L 97.00 184.00 L 101.00 186.00 L 108.00 186.00 L 114.00 182.00 L 122.00 174.00 L 123.00 174.00 L 150.00 150.00 L 150.00 71.00 L 111.00 106.00 L 107.00 106.00 L 104.00 104.00 L 83.00 85.00 L 71.00 76.00 L 67.00 72.00 L 67.00 70.00 L 27.00 70.00 L 26.00 69.00 L 19.00 69.00 L 18.00 70.00 L 3.00 70.00 L 2.00 72.00 Z" />
      <path d="M 216.00 149.00 L 216.00 207.00 L 272.00 207.00 L 272.00 149.00 L 271.00 149.00 L 265.00 155.00 L 261.00 157.00 L 252.00 158.00 L 251.00 159.00 L 236.00 159.00 L 235.00 158.00 L 230.00 158.00 L 221.00 154.00 Z" />
    </svg>
  );
}

/**
 * Simbolo isolado IMUNI — apenas os 2 anticorpos (pontos circulares).
 *
 * Marca standalone reduzida ao essencial. Use como favicon micro,
 * watermark, marca d'agua, indicador de presenca da IMUNI quando o
 * espaco nao comporta nenhuma forma textual.
 *
 * Mantem o mesmo viewBox do wordmark pra alinhar perfeitamente
 * quando colado lado a lado.
 *
 * @example
 * <ImuniSimbolo className="text-[#C9A84C] h-3" />
 */
export function ImuniSimbolo({ className, style, title = "IMUNI" }: SvgProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEWBOX}
      role="img"
      aria-label={title}
      className={className}
      style={style}
      fill="currentColor"
    >
      <title>{title}</title>
      <path d="M 24.00 0.00 L 16.00 3.00 L 7.00 11.00 L 2.00 23.00 L 2.00 33.00 L 6.00 43.00 L 12.00 50.00 L 21.00 55.00 L 32.00 56.00 L 33.00 55.00 L 39.00 54.00 L 48.00 48.00 L 53.00 41.00 L 53.00 39.00 L 55.00 36.00 L 56.00 25.00 L 55.00 24.00 L 55.00 21.00 L 53.00 15.00 L 44.00 5.00 L 33.00 0.00 Z" />
      <path d="M 442.00 2.00 L 433.00 5.00 L 424.00 13.00 L 419.00 25.00 L 419.00 35.00 L 422.00 44.00 L 428.00 52.00 L 436.00 57.00 L 448.00 59.00 L 449.00 58.00 L 453.00 58.00 L 459.00 56.00 L 467.00 49.00 L 471.00 43.00 L 473.00 37.00 L 473.00 24.00 L 470.00 16.00 L 467.00 12.00 L 460.00 6.00 L 450.00 2.00 Z" />
    </svg>
  );
}

/**
 * Cores oficiais da marca IMUNI. Use como referencia ou direto:
 *   <div style={{ background: IMUNI_COLORS.gold }}>
 */
export const IMUNI_COLORS = {
  gold: "#C9A84C",
  warmIvory: "#F7F4EC",
  carbonBlack: "#050505",
  deepBlack: "#0B0B0C",
  coolGray: "#687280",
  amberAlert: "#D97706",
  pureWhite: "#FFFFFF",
} as const;

/**
 * Tagline oficial da IMUNI.
 */
export const IMUNI_TAGLINE = "Defended. Organic. Unified. IMUNI.";
export const IMUNI_TAGLINE_PT = "Proteção inteligente para o que importa.";
export const IMUNI_SLOGAN_INTERNO = "Built to protect. Designed to unite.";
