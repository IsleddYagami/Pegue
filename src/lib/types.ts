export type Cliente = {
  id: string;
  telefone: string;
  nome: string | null;
  email: string | null;
  nivel: string;
  total_corridas: number;
  nota_media: number | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type Prestador = {
  id: string;
  telefone: string;
  nome: string;
  cpf: string;
  selfie_url: string | null;
  conta_banco_dados: Record<string, string> | null;
  status: string;
  score: number;
  total_corridas: number;
  total_reclamacoes: number;
  regiao_atuacao: string | null;
  disponivel: boolean;
  termos_aceitos: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type PrestadorVeiculo = {
  id: string;
  prestador_id: string;
  tipo: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  placa: string;
  foto_url: string | null;
  ativo: boolean;
};

export type Corrida = {
  id: string;
  codigo: string;
  cliente_id: string;
  prestador_id: string | null;
  origem_endereco: string;
  origem_lat: number | null;
  origem_lng: number | null;
  destino_endereco: string;
  destino_lat: number | null;
  destino_lng: number | null;
  distancia_km: number | null;
  tipo_servico: string;
  tipo_veiculo: string | null;
  descricao_carga: string | null;
  escada_origem: boolean;
  andares_origem: number;
  elevador_origem: boolean;
  escada_destino: boolean;
  andares_destino: number;
  elevador_destino: boolean;
  qtd_ajudantes: number;
  urgencia: string;
  plano: string | null;
  valor_estimado: number | null;
  valor_final: number | null;
  valor_prestador: number | null;
  valor_pegue: number | null;
  data_agendada: string | null;
  periodo: string | null;
  status: string;
  pin_entrega: string | null;
  asaas_payment_id: string | null;
  pago_em: string | null;
  coleta_em: string | null;
  entrega_em: string | null;
  cancelado_em: string | null;
  canal_origem: string;
  criado_em: string;
  atualizado_em: string;
  // Joined
  cliente?: Cliente;
  prestador?: Prestador;
};

export type Pagamento = {
  id: string;
  corrida_id: string;
  mp_payment_id: string | null;
  valor: number;
  metodo: string | null;
  status: string;
  repasse_status: string;
  pago_em: string | null;
  criado_em: string;
  corrida?: Corrida;
};

export type Avaliacao = {
  id: string;
  corrida_id: string;
  cliente_id: string;
  prestador_id: string;
  nota: number;
  comentario: string | null;
  criado_em: string;
};

export type TabelaPrecos = {
  id: string;
  nome: string;
  preco_base_km: number;
  km_minimo: number;
  valor_minimo: number;
  mult_utilitario: number;
  mult_van: number;
  mult_caminhao_bau: number;
  mult_caminhao_grande: number;
  adicional_ajudante: number;
  adicional_andar_escada: number;
  mult_urgente: number;
  mult_economica: number;
  mult_padrao: number;
  mult_premium: number;
  comissao_percentual: number;
  ativo: boolean;
};
