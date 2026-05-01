// AUTO-GERADO por scripts/gerar-types-supabase.mjs
// NAO EDITAR MANUALMENTE — re-rodar o script apos mudanca de schema.
//
// Esse arquivo eh a Camada 1 da defesa em profundidade contra bugs de
// schema. Permite createClient<Database>(...) — qualquer coluna ou tabela
// errada falha em compile time. Resolve categoria #1 dos 40 bugs do
// audit 1/Mai/2026 (repasse_pago_em vs pago_em, prestador_veiculos vs
// prestadores_veiculos, etc).
//
// Gerado a partir de https://ztbhtayiufdckckhspoq.supabase.co
// Em 2026-05-01T21:38:57.399Z

export interface Database {
  public: {
    Tables: {
      admin_usuarios: {
        Row: {
          id: string;
          email: string;
          nome: string;
          role: string;
          ativo: boolean;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          email?: string | null;
          nome?: string | null;
          role?: string | null;
          ativo?: boolean | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          email?: string | null;
          nome?: string | null;
          role?: string | null;
          ativo?: boolean | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      ajustes_precos: {
        Row: {
          id: string;
          veiculo: string;
          zona: string;
          km_min: number;
          km_max: number;
          qtd_itens_min: number;
          qtd_itens_max: number;
          com_ajudante: boolean;
          fator_multiplicador: number;
          valor_fixo: number;
          descricao: string;
          ativo: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string | null;
          veiculo?: string | null;
          zona?: string | null;
          km_min?: number | null;
          km_max?: number | null;
          qtd_itens_min?: number | null;
          qtd_itens_max?: number | null;
          com_ajudante?: boolean | null;
          fator_multiplicador?: number | null;
          valor_fixo?: number | null;
          descricao?: string | null;
          ativo?: boolean | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
        };
        Update: {
          id?: string | null;
          veiculo?: string | null;
          zona?: string | null;
          km_min?: number | null;
          km_max?: number | null;
          qtd_itens_min?: number | null;
          qtd_itens_max?: number | null;
          com_ajudante?: boolean | null;
          fator_multiplicador?: number | null;
          valor_fixo?: number | null;
          descricao?: string | null;
          ativo?: boolean | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
        };
        Relationships: [];
      };
      alertas_admin_pendentes: {
        Row: {
          id: string;
          codigo: string;
          cliente_phone: string;
          titulo: string;
          detalhes: string;
          status: string;
          assumido_por: string;
          assumido_em: string;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          codigo?: string | null;
          cliente_phone?: string | null;
          titulo?: string | null;
          detalhes?: string | null;
          status?: string | null;
          assumido_por?: string | null;
          assumido_em?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          codigo?: string | null;
          cliente_phone?: string | null;
          titulo?: string | null;
          detalhes?: string | null;
          status?: string | null;
          assumido_por?: string | null;
          assumido_em?: string | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      avaliacoes: {
        Row: {
          id: string;
          corrida_id: string;
          cliente_id: string;
          prestador_id: string;
          nota: number;
          comentario: string;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          corrida_id?: string | null;
          cliente_id?: string | null;
          prestador_id?: string | null;
          nota?: number | null;
          comentario?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          corrida_id?: string | null;
          cliente_id?: string | null;
          prestador_id?: string | null;
          nota?: number | null;
          comentario?: string | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      bot_logs: {
        Row: {
          id: number;
          payload: any;
          criado_em: string;
        };
        Insert: {
          id?: number | null;
          payload?: any | null;
          criado_em?: string | null;
        };
        Update: {
          id?: number | null;
          payload?: any | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      bot_sessions: {
        Row: {
          phone: string;
          step: string;
          origem_endereco: string;
          origem_lat: number;
          origem_lng: number;
          destino_endereco: string;
          destino_lat: number;
          destino_lng: number;
          distancia_km: number;
          descricao_carga: string;
          veiculo_sugerido: string;
          foto_url: string;
          data_agendada: string;
          periodo: string;
          plano_escolhido: string;
          valor_estimado: number;
          tem_escada: boolean;
          andar: number;
          precisa_ajudante: boolean;
          corrida_id: string;
          criado_em: string;
          atualizado_em: string;
          instance_chatpro: number;
          alerta_admin_enviado_em: string;
          silenciado_ate: string;
          msgs_contador: number;
          msgs_contador_inicio: string;
          bot_detectado: boolean;
        };
        Insert: {
          phone?: string | null;
          step?: string | null;
          origem_endereco?: string | null;
          origem_lat?: number | null;
          origem_lng?: number | null;
          destino_endereco?: string | null;
          destino_lat?: number | null;
          destino_lng?: number | null;
          distancia_km?: number | null;
          descricao_carga?: string | null;
          veiculo_sugerido?: string | null;
          foto_url?: string | null;
          data_agendada?: string | null;
          periodo?: string | null;
          plano_escolhido?: string | null;
          valor_estimado?: number | null;
          tem_escada?: boolean | null;
          andar?: number | null;
          precisa_ajudante?: boolean | null;
          corrida_id?: string | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
          instance_chatpro?: number | null;
          alerta_admin_enviado_em?: string | null;
          silenciado_ate?: string | null;
          msgs_contador?: number | null;
          msgs_contador_inicio?: string | null;
          bot_detectado?: boolean | null;
        };
        Update: {
          phone?: string | null;
          step?: string | null;
          origem_endereco?: string | null;
          origem_lat?: number | null;
          origem_lng?: number | null;
          destino_endereco?: string | null;
          destino_lat?: number | null;
          destino_lng?: number | null;
          distancia_km?: number | null;
          descricao_carga?: string | null;
          veiculo_sugerido?: string | null;
          foto_url?: string | null;
          data_agendada?: string | null;
          periodo?: string | null;
          plano_escolhido?: string | null;
          valor_estimado?: number | null;
          tem_escada?: boolean | null;
          andar?: number | null;
          precisa_ajudante?: boolean | null;
          corrida_id?: string | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
          instance_chatpro?: number | null;
          alerta_admin_enviado_em?: string | null;
          silenciado_ate?: string | null;
          msgs_contador?: number | null;
          msgs_contador_inicio?: string | null;
          bot_detectado?: boolean | null;
        };
        Relationships: [];
      };
      clientes: {
        Row: {
          id: string;
          telefone: string;
          nome: string;
          email: string;
          nivel: string;
          total_corridas: number;
          nota_media: number;
          ativo: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string | null;
          telefone?: string | null;
          nome?: string | null;
          email?: string | null;
          nivel?: string | null;
          total_corridas?: number | null;
          nota_media?: number | null;
          ativo?: boolean | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
        };
        Update: {
          id?: string | null;
          telefone?: string | null;
          nome?: string | null;
          email?: string | null;
          nivel?: string | null;
          total_corridas?: number | null;
          nota_media?: number | null;
          ativo?: boolean | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
        };
        Relationships: [];
      };
      configuracoes: {
        Row: {
          chave: string;
          valor: string;
          atualizado_em: string;
        };
        Insert: {
          chave?: string | null;
          valor?: string | null;
          atualizado_em?: string | null;
        };
        Update: {
          chave?: string | null;
          valor?: string | null;
          atualizado_em?: string | null;
        };
        Relationships: [];
      };
      conversas_whatsapp: {
        Row: {
          id: string;
          cliente_id: string;
          telefone: string;
          direcao: string;
          tipo: string;
          conteudo: string;
          audio_url: string;
          midia_url: string;
          metadata: any;
          corrida_id: string;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          cliente_id?: string | null;
          telefone?: string | null;
          direcao?: string | null;
          tipo?: string | null;
          conteudo?: string | null;
          audio_url?: string | null;
          midia_url?: string | null;
          metadata?: any | null;
          corrida_id?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          cliente_id?: string | null;
          telefone?: string | null;
          direcao?: string | null;
          tipo?: string | null;
          conteudo?: string | null;
          audio_url?: string | null;
          midia_url?: string | null;
          metadata?: any | null;
          corrida_id?: string | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      corrida_status_log: {
        Row: {
          id: string;
          corrida_id: string;
          status_anterior: string;
          status_novo: string;
          observacao: string;
          lat: number;
          lng: number;
          criado_por: string;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          corrida_id?: string | null;
          status_anterior?: string | null;
          status_novo?: string | null;
          observacao?: string | null;
          lat?: number | null;
          lng?: number | null;
          criado_por?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          corrida_id?: string | null;
          status_anterior?: string | null;
          status_novo?: string | null;
          observacao?: string | null;
          lat?: number | null;
          lng?: number | null;
          criado_por?: string | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      corridas: {
        Row: {
          id: string;
          codigo: string;
          cliente_id: string;
          prestador_id: string;
          origem_endereco: string;
          origem_lat: number;
          origem_lng: number;
          destino_endereco: string;
          destino_lat: number;
          destino_lng: number;
          distancia_km: number;
          tipo_servico: string;
          tipo_veiculo: string;
          descricao_carga: string;
          escada_origem: boolean;
          andares_origem: number;
          elevador_origem: boolean;
          escada_destino: boolean;
          andares_destino: number;
          elevador_destino: boolean;
          qtd_ajudantes: number;
          urgencia: string;
          plano: string;
          valor_estimado: number;
          valor_final: number;
          valor_prestador: number;
          valor_pegue: number;
          data_agendada: string;
          periodo: string;
          status: string;
          pin_entrega: string;
          pago_em: string;
          coleta_em: string;
          entrega_em: string;
          cancelado_em: string;
          motivo_cancelamento: string;
          canal_origem: string;
          criado_em: string;
          atualizado_em: string;
          rastreio_token: string;
          rastreio_ativo: boolean;
          chegou_destino: boolean;
          contraoferta_prestador_id: string;
          contraoferta_data: string;
          contraoferta_criada_em: string;
          dispatch_ativo: boolean;
          dispatch_prestadores: string[];
          dispatch_iniciado_em: string;
          dispatch_finalizado_em: string;
          dispatch_rodada: number;
          corrida_anterior_id: string;
          credito_anterior: number;
          asaas_payment_id: string;
        };
        Insert: {
          id?: string | null;
          codigo?: string | null;
          cliente_id?: string | null;
          prestador_id?: string | null;
          origem_endereco?: string | null;
          origem_lat?: number | null;
          origem_lng?: number | null;
          destino_endereco?: string | null;
          destino_lat?: number | null;
          destino_lng?: number | null;
          distancia_km?: number | null;
          tipo_servico?: string | null;
          tipo_veiculo?: string | null;
          descricao_carga?: string | null;
          escada_origem?: boolean | null;
          andares_origem?: number | null;
          elevador_origem?: boolean | null;
          escada_destino?: boolean | null;
          andares_destino?: number | null;
          elevador_destino?: boolean | null;
          qtd_ajudantes?: number | null;
          urgencia?: string | null;
          plano?: string | null;
          valor_estimado?: number | null;
          valor_final?: number | null;
          valor_prestador?: number | null;
          valor_pegue?: number | null;
          data_agendada?: string | null;
          periodo?: string | null;
          status?: string | null;
          pin_entrega?: string | null;
          pago_em?: string | null;
          coleta_em?: string | null;
          entrega_em?: string | null;
          cancelado_em?: string | null;
          motivo_cancelamento?: string | null;
          canal_origem?: string | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
          rastreio_token?: string | null;
          rastreio_ativo?: boolean | null;
          chegou_destino?: boolean | null;
          contraoferta_prestador_id?: string | null;
          contraoferta_data?: string | null;
          contraoferta_criada_em?: string | null;
          dispatch_ativo?: boolean | null;
          dispatch_prestadores?: string[] | null;
          dispatch_iniciado_em?: string | null;
          dispatch_finalizado_em?: string | null;
          dispatch_rodada?: number | null;
          corrida_anterior_id?: string | null;
          credito_anterior?: number | null;
          asaas_payment_id?: string | null;
        };
        Update: {
          id?: string | null;
          codigo?: string | null;
          cliente_id?: string | null;
          prestador_id?: string | null;
          origem_endereco?: string | null;
          origem_lat?: number | null;
          origem_lng?: number | null;
          destino_endereco?: string | null;
          destino_lat?: number | null;
          destino_lng?: number | null;
          distancia_km?: number | null;
          tipo_servico?: string | null;
          tipo_veiculo?: string | null;
          descricao_carga?: string | null;
          escada_origem?: boolean | null;
          andares_origem?: number | null;
          elevador_origem?: boolean | null;
          escada_destino?: boolean | null;
          andares_destino?: number | null;
          elevador_destino?: boolean | null;
          qtd_ajudantes?: number | null;
          urgencia?: string | null;
          plano?: string | null;
          valor_estimado?: number | null;
          valor_final?: number | null;
          valor_prestador?: number | null;
          valor_pegue?: number | null;
          data_agendada?: string | null;
          periodo?: string | null;
          status?: string | null;
          pin_entrega?: string | null;
          pago_em?: string | null;
          coleta_em?: string | null;
          entrega_em?: string | null;
          cancelado_em?: string | null;
          motivo_cancelamento?: string | null;
          canal_origem?: string | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
          rastreio_token?: string | null;
          rastreio_ativo?: boolean | null;
          chegou_destino?: boolean | null;
          contraoferta_prestador_id?: string | null;
          contraoferta_data?: string | null;
          contraoferta_criada_em?: string | null;
          dispatch_ativo?: boolean | null;
          dispatch_prestadores?: string[] | null;
          dispatch_iniciado_em?: string | null;
          dispatch_finalizado_em?: string | null;
          dispatch_rodada?: number | null;
          corrida_anterior_id?: string | null;
          credito_anterior?: number | null;
          asaas_payment_id?: string | null;
        };
        Relationships: [];
      };
      enderecos_favoritos: {
        Row: {
          id: string;
          cliente_id: string;
          apelido: string;
          endereco: string;
          lat: number;
          lng: number;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          cliente_id?: string | null;
          apelido?: string | null;
          endereco?: string | null;
          lat?: number | null;
          lng?: number | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          cliente_id?: string | null;
          apelido?: string | null;
          endereco?: string | null;
          lat?: number | null;
          lng?: number | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      feedback_precos: {
        Row: {
          id: string;
          fretista_phone: string;
          fretista_nome: string;
          veiculo: string;
          rota_id: string;
          origem: string;
          destino: string;
          distancia_km: number;
          zona: string;
          itens: string;
          qtd_itens: number;
          tem_ajudante: boolean;
          preco_pegue: number;
          preco_sugerido: number;
          gap_percentual: number;
          criado_em: string;
          qtd_ajudantes: number;
          andares_origem: number;
          tem_elevador: boolean;
          tem_escada: boolean;
        };
        Insert: {
          id?: string | null;
          fretista_phone?: string | null;
          fretista_nome?: string | null;
          veiculo?: string | null;
          rota_id?: string | null;
          origem?: string | null;
          destino?: string | null;
          distancia_km?: number | null;
          zona?: string | null;
          itens?: string | null;
          qtd_itens?: number | null;
          tem_ajudante?: boolean | null;
          preco_pegue?: number | null;
          preco_sugerido?: number | null;
          gap_percentual?: number | null;
          criado_em?: string | null;
          qtd_ajudantes?: number | null;
          andares_origem?: number | null;
          tem_elevador?: boolean | null;
          tem_escada?: boolean | null;
        };
        Update: {
          id?: string | null;
          fretista_phone?: string | null;
          fretista_nome?: string | null;
          veiculo?: string | null;
          rota_id?: string | null;
          origem?: string | null;
          destino?: string | null;
          distancia_km?: number | null;
          zona?: string | null;
          itens?: string | null;
          qtd_itens?: number | null;
          tem_ajudante?: boolean | null;
          preco_pegue?: number | null;
          preco_sugerido?: number | null;
          gap_percentual?: number | null;
          criado_em?: string | null;
          qtd_ajudantes?: number | null;
          andares_origem?: number | null;
          tem_elevador?: boolean | null;
          tem_escada?: boolean | null;
        };
        Relationships: [];
      };
      incidentes_atendimento: {
        Row: {
          id: string;
          phone: string;
          phone_masked: string;
          ultimo_step: string;
          duracao_min: number;
          mensagens_qtd: number;
          resumo_msgs: string;
          diagnostico_ia: string;
          proposta_acao: string;
          status: string;
          aprovado_por: string;
          aprovado_em: string;
          observacao_admin: string;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          phone?: string | null;
          phone_masked?: string | null;
          ultimo_step?: string | null;
          duracao_min?: number | null;
          mensagens_qtd?: number | null;
          resumo_msgs?: string | null;
          diagnostico_ia?: string | null;
          proposta_acao?: string | null;
          status?: string | null;
          aprovado_por?: string | null;
          aprovado_em?: string | null;
          observacao_admin?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          phone?: string | null;
          phone_masked?: string | null;
          ultimo_step?: string | null;
          duracao_min?: number | null;
          mensagens_qtd?: number | null;
          resumo_msgs?: string | null;
          diagnostico_ia?: string | null;
          proposta_acao?: string | null;
          status?: string | null;
          aprovado_por?: string | null;
          aprovado_em?: string | null;
          observacao_admin?: string | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      notificacoes: {
        Row: {
          id: string;
          destinatario_tipo: string;
          destinatario_id: string;
          tipo: string;
          titulo: string;
          mensagem: string;
          canal: string;
          enviado: boolean;
          enviado_em: string;
          corrida_id: string;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          destinatario_tipo?: string | null;
          destinatario_id?: string | null;
          tipo?: string | null;
          titulo?: string | null;
          mensagem?: string | null;
          canal?: string | null;
          enviado?: boolean | null;
          enviado_em?: string | null;
          corrida_id?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          destinatario_tipo?: string | null;
          destinatario_id?: string | null;
          tipo?: string | null;
          titulo?: string | null;
          mensagem?: string | null;
          canal?: string | null;
          enviado?: boolean | null;
          enviado_em?: string | null;
          corrida_id?: string | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      ocorrencias: {
        Row: {
          id: string;
          corrida_id: string;
          prestador_id: string;
          cliente_id: string;
          tipo: string;
          descricao: string;
          foto_url: string;
          status: string;
          decisao_admin: string;
          valor_reembolso: number;
          resolvida_em: string;
          resolvida_por: string;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          corrida_id?: string | null;
          prestador_id?: string | null;
          cliente_id?: string | null;
          tipo?: string | null;
          descricao?: string | null;
          foto_url?: string | null;
          status?: string | null;
          decisao_admin?: string | null;
          valor_reembolso?: number | null;
          resolvida_em?: string | null;
          resolvida_por?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          corrida_id?: string | null;
          prestador_id?: string | null;
          cliente_id?: string | null;
          tipo?: string | null;
          descricao?: string | null;
          foto_url?: string | null;
          status?: string | null;
          decisao_admin?: string | null;
          valor_reembolso?: number | null;
          resolvida_em?: string | null;
          resolvida_por?: string | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      pagamentos: {
        Row: {
          id: string;
          corrida_id: string;
          mp_payment_id: string;
          mp_preference_id: string;
          mp_link: string;
          valor: number;
          metodo: string;
          status: string;
          repasse_status: string;
          repasse_aprovado_por: string;
          repasse_pago_em: string;
          pago_em: string;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          corrida_id?: string | null;
          mp_payment_id?: string | null;
          mp_preference_id?: string | null;
          mp_link?: string | null;
          valor?: number | null;
          metodo?: string | null;
          status?: string | null;
          repasse_status?: string | null;
          repasse_aprovado_por?: string | null;
          repasse_pago_em?: string | null;
          pago_em?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          corrida_id?: string | null;
          mp_payment_id?: string | null;
          mp_preference_id?: string | null;
          mp_link?: string | null;
          valor?: number | null;
          metodo?: string | null;
          status?: string | null;
          repasse_status?: string | null;
          repasse_aprovado_por?: string | null;
          repasse_pago_em?: string | null;
          pago_em?: string | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      phones_bloqueados: {
        Row: {
          phone: string;
          motivo: string;
          adicionado_em: string;
          adicionado_por: string;
        };
        Insert: {
          phone?: string | null;
          motivo?: string | null;
          adicionado_em?: string | null;
          adicionado_por?: string | null;
        };
        Update: {
          phone?: string | null;
          motivo?: string | null;
          adicionado_em?: string | null;
          adicionado_por?: string | null;
        };
        Relationships: [];
      };
      prestador_documentos: {
        Row: {
          id: string;
          prestador_id: string;
          tipo: string;
          documento_url: string;
          validado: boolean;
          validado_por: string;
          validado_em: string;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          prestador_id?: string | null;
          tipo?: string | null;
          documento_url?: string | null;
          validado?: boolean | null;
          validado_por?: string | null;
          validado_em?: string | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          prestador_id?: string | null;
          tipo?: string | null;
          documento_url?: string | null;
          validado?: boolean | null;
          validado_por?: string | null;
          validado_em?: string | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      prestador_veiculos: {
        Row: {
          id: string;
          prestador_id: string;
          tipo: string;
          marca: string;
          modelo: string;
          ano: number;
          placa: string;
          foto_url: string;
          capacidade_kg: number;
          ativo: boolean;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          prestador_id?: string | null;
          tipo?: string | null;
          marca?: string | null;
          modelo?: string | null;
          ano?: number | null;
          placa?: string | null;
          foto_url?: string | null;
          capacidade_kg?: number | null;
          ativo?: boolean | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          prestador_id?: string | null;
          tipo?: string | null;
          marca?: string | null;
          modelo?: string | null;
          ano?: number | null;
          placa?: string | null;
          foto_url?: string | null;
          capacidade_kg?: number | null;
          ativo?: boolean | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      prestadores: {
        Row: {
          id: string;
          telefone: string;
          nome: string;
          cpf: string;
          selfie_url: string;
          conta_banco_dados: any;
          status: string;
          score: number;
          total_corridas: number;
          total_reclamacoes: number;
          regiao_atuacao: string;
          disponivel: boolean;
          termos_aceitos: boolean;
          termos_aceitos_em: string;
          criado_em: string;
          atualizado_em: string;
          email: string;
          chave_pix: string;
          foto_placa_url: string;
          foto_veiculo_url: string;
          termos_aceitos_ip: string;
          convite_token: string;
          convite_expira_em: string;
          foto_documento_url: string;
        };
        Insert: {
          id?: string | null;
          telefone?: string | null;
          nome?: string | null;
          cpf?: string | null;
          selfie_url?: string | null;
          conta_banco_dados?: any | null;
          status?: string | null;
          score?: number | null;
          total_corridas?: number | null;
          total_reclamacoes?: number | null;
          regiao_atuacao?: string | null;
          disponivel?: boolean | null;
          termos_aceitos?: boolean | null;
          termos_aceitos_em?: string | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
          email?: string | null;
          chave_pix?: string | null;
          foto_placa_url?: string | null;
          foto_veiculo_url?: string | null;
          termos_aceitos_ip?: string | null;
          convite_token?: string | null;
          convite_expira_em?: string | null;
          foto_documento_url?: string | null;
        };
        Update: {
          id?: string | null;
          telefone?: string | null;
          nome?: string | null;
          cpf?: string | null;
          selfie_url?: string | null;
          conta_banco_dados?: any | null;
          status?: string | null;
          score?: number | null;
          total_corridas?: number | null;
          total_reclamacoes?: number | null;
          regiao_atuacao?: string | null;
          disponivel?: boolean | null;
          termos_aceitos?: boolean | null;
          termos_aceitos_em?: string | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
          email?: string | null;
          chave_pix?: string | null;
          foto_placa_url?: string | null;
          foto_veiculo_url?: string | null;
          termos_aceitos_ip?: string | null;
          convite_token?: string | null;
          convite_expira_em?: string | null;
          foto_documento_url?: string | null;
        };
        Relationships: [];
      };
      prestadores_veiculos: {
        Row: {
          id: string;
          prestador_id: string;
          tipo: string;
          marca: string;
          modelo: string;
          ano: number;
          placa: string;
          foto_url: string;
          ativo: boolean;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          prestador_id?: string | null;
          tipo?: string | null;
          marca?: string | null;
          modelo?: string | null;
          ano?: number | null;
          placa?: string | null;
          foto_url?: string | null;
          ativo?: boolean | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          prestador_id?: string | null;
          tipo?: string | null;
          marca?: string | null;
          modelo?: string | null;
          ano?: number | null;
          placa?: string | null;
          foto_url?: string | null;
          ativo?: boolean | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      provas_digitais: {
        Row: {
          id: string;
          corrida_id: string;
          tipo: string;
          foto_url: string;
          foto_placa_url: string;
          lat: number;
          lng: number;
          nome_recebedor: string;
          pin_confirmado: boolean;
          metadata: any;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          corrida_id?: string | null;
          tipo?: string | null;
          foto_url?: string | null;
          foto_placa_url?: string | null;
          lat?: number | null;
          lng?: number | null;
          nome_recebedor?: string | null;
          pin_confirmado?: boolean | null;
          metadata?: any | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          corrida_id?: string | null;
          tipo?: string | null;
          foto_url?: string | null;
          foto_placa_url?: string | null;
          lat?: number | null;
          lng?: number | null;
          nome_recebedor?: string | null;
          pin_confirmado?: boolean | null;
          metadata?: any | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      qualidade_extracao_ia: {
        Row: {
          id: string;
          corrida_id: string;
          mensagem_original: string;
          extracao_ia: any;
          valores_finais: any;
          campos_corretos: string[];
          campos_incorretos: string[];
          taxa_acerto: number;
          modelo_ia: string;
          custo_usd: number;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          corrida_id?: string | null;
          mensagem_original?: string | null;
          extracao_ia?: any | null;
          valores_finais?: any | null;
          campos_corretos?: string[] | null;
          campos_incorretos?: string[] | null;
          taxa_acerto?: number | null;
          modelo_ia?: string | null;
          custo_usd?: number | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          corrida_id?: string | null;
          mensagem_original?: string | null;
          extracao_ia?: any | null;
          valores_finais?: any | null;
          campos_corretos?: string[] | null;
          campos_incorretos?: string[] | null;
          taxa_acerto?: number | null;
          modelo_ia?: string | null;
          custo_usd?: number | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      ranking_pegue_runner: {
        Row: {
          id: string;
          nome: string;
          score: number;
          distancia: number;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          nome?: string | null;
          score?: number | null;
          distancia?: number | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          nome?: string | null;
          score?: number | null;
          distancia?: number | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      rastreio_localizacoes: {
        Row: {
          id: string;
          corrida_id: string;
          lat: number;
          lng: number;
          accuracy: number;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          corrida_id?: string | null;
          lat?: number | null;
          lng?: number | null;
          accuracy?: number | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          corrida_id?: string | null;
          lat?: number | null;
          lng?: number | null;
          accuracy?: number | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      rate_limit_buckets: {
        Row: {
          chave: string;
          janela_iso: string;
          contador: number;
          criado_em: string;
        };
        Insert: {
          chave?: string | null;
          janela_iso?: string | null;
          contador?: number | null;
          criado_em?: string | null;
        };
        Update: {
          chave?: string | null;
          janela_iso?: string | null;
          contador?: number | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      tabela_precos: {
        Row: {
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
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string | null;
          nome?: string | null;
          preco_base_km?: number | null;
          km_minimo?: number | null;
          valor_minimo?: number | null;
          mult_utilitario?: number | null;
          mult_van?: number | null;
          mult_caminhao_bau?: number | null;
          mult_caminhao_grande?: number | null;
          adicional_ajudante?: number | null;
          adicional_andar_escada?: number | null;
          mult_urgente?: number | null;
          mult_economica?: number | null;
          mult_padrao?: number | null;
          mult_premium?: number | null;
          comissao_percentual?: number | null;
          ativo?: boolean | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
        };
        Update: {
          id?: string | null;
          nome?: string | null;
          preco_base_km?: number | null;
          km_minimo?: number | null;
          valor_minimo?: number | null;
          mult_utilitario?: number | null;
          mult_van?: number | null;
          mult_caminhao_bau?: number | null;
          mult_caminhao_grande?: number | null;
          adicional_ajudante?: number | null;
          adicional_andar_escada?: number | null;
          mult_urgente?: number | null;
          mult_economica?: number | null;
          mult_padrao?: number | null;
          mult_premium?: number | null;
          comissao_percentual?: number | null;
          ativo?: boolean | null;
          criado_em?: string | null;
          atualizado_em?: string | null;
        };
        Relationships: [];
      };
      tarefas_agendadas: {
        Row: {
          id: string;
          tipo: string;
          referencia: string;
          payload: any;
          executar_em: string;
          executado_em: string;
          erro: string;
          tentativas: number;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          tipo?: string | null;
          referencia?: string | null;
          payload?: any | null;
          executar_em?: string | null;
          executado_em?: string | null;
          erro?: string | null;
          tentativas?: number | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          tipo?: string | null;
          referencia?: string | null;
          payload?: any | null;
          executar_em?: string | null;
          executado_em?: string | null;
          erro?: string | null;
          tentativas?: number | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      vocabulario_observado: {
        Row: {
          id: string;
          mensagem_sintetica: string;
          categoria: string;
          termos_novos: string[];
          prompt_atual_errou: boolean;
          campos_errados: string[];
          cruzou_com_real: boolean;
          qtd_ocorrencias_reais: number;
          criado_em: string;
        };
        Insert: {
          id?: string | null;
          mensagem_sintetica?: string | null;
          categoria?: string | null;
          termos_novos?: string[] | null;
          prompt_atual_errou?: boolean | null;
          campos_errados?: string[] | null;
          cruzou_com_real?: boolean | null;
          qtd_ocorrencias_reais?: number | null;
          criado_em?: string | null;
        };
        Update: {
          id?: string | null;
          mensagem_sintetica?: string | null;
          categoria?: string | null;
          termos_novos?: string[] | null;
          prompt_atual_errou?: boolean | null;
          campos_errados?: string[] | null;
          cruzou_com_real?: boolean | null;
          qtd_ocorrencias_reais?: number | null;
          criado_em?: string | null;
        };
        Relationships: [];
      };
      webhooks_mp_processados: {
        Row: {
          payment_id: string;
          processado_em: string;
          status_pagamento: string;
          corrida_id: string;
          resultado: string;
        };
        Insert: {
          payment_id?: string | null;
          processado_em?: string | null;
          status_pagamento?: string | null;
          corrida_id?: string | null;
          resultado?: string | null;
        };
        Update: {
          payment_id?: string | null;
          processado_em?: string | null;
          status_pagamento?: string | null;
          corrida_id?: string | null;
          resultado?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
}
