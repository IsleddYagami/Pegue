// Numero do WhatsApp da Pegue (trocar pelo numero real)
export const WHATSAPP_NUMBER = "5511999999999";
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=Oi%2C%20quero%20fazer%20um%20frete!`;
export const WHATSAPP_LINK_SIMULAR = `https://wa.me/${WHATSAPP_NUMBER}?text=Quero%20um%20or%C3%A7amento%20de%20frete`;

// Cores da marca
export const BRAND = {
  green: "#00C896",
  greenDark: "#00A87A",
  dark: "#1a1a1a",
  gray: "#666666",
};

// Tabela de precos base
export const PRICING = {
  precoPorKm: 8.0,
  kmMinimo: 5,
  valorMinimo: 80,
  multiplicadores: {
    utilitario: 1.0,
    van: 1.3,
    caminhao_bau: 1.6,
    caminhao_grande: 2.0,
  },
  adicionalAjudante: 80,
  adicionalAndarEscada: 30,
  multiplicadorUrgente: 1.5,
  planos: {
    economica: 0.7,
    padrao: 1.0,
    premium: 1.4,
  },
  comissaoPegue: 0.2,
};
