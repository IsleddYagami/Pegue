-- Tabela de incidentes de atendimento (Aprendizado Constante Fase 1)
-- Cron diario coleta sessoes nao-concluidas e gera 1 linha por sessao com
-- diagnostico via IA + proposta de acao pro admin aprovar.
--
-- Fluxo:
--   1) cron `/api/cron/aprendizado-incidentes` roda 1x/dia (manha)
--   2) Busca bot_sessions atualizadas 24-48h atras com step != concluido
--   3) Pra cada uma, monta resumo de msgs e chama gpt-4o-mini
--   4) Insere linha aqui com status='pendente'
--   5) Admin revisa em /admin/aprendizado e aprova/rejeita propostas

CREATE TABLE IF NOT EXISTS incidentes_atendimento (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        text NOT NULL,
  phone_masked text NOT NULL,
  ultimo_step  text,
  duracao_min  integer,
  mensagens_qtd integer,
  resumo_msgs  text,
  diagnostico_ia text,
  proposta_acao text,
  status       text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'aplicado')),
  aprovado_por text,
  aprovado_em  timestamptz,
  observacao_admin text,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

-- Indice pra evitar duplicar incidente do mesmo phone na mesma janela
CREATE UNIQUE INDEX IF NOT EXISTS idx_incidentes_atendimento_phone_dia
  ON incidentes_atendimento (phone, date_trunc('day', criado_em));

CREATE INDEX IF NOT EXISTS idx_incidentes_atendimento_status_criado
  ON incidentes_atendimento (status, criado_em DESC);

-- RLS: tabela so acessivel via service_role (rotina cron + admin endpoint)
ALTER TABLE incidentes_atendimento ENABLE ROW LEVEL SECURITY;
