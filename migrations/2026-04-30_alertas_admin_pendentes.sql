-- Tabela de alertas pendentes pra claim entre admins.
-- Quando bot dispara alerta multi-admin, gera codigo curto (ex: A4F2). O
-- primeiro admin que responder "OK A4F2" pelo WhatsApp assume o caso. Os
-- demais admins recebem aviso que ja foi assumido. Evita 2 admins
-- contatarem o mesmo cliente em paralelo.
--
-- TTL implicito: 24h (cron de limpeza pode varrer status='pendente'
-- com criado_em antigo e marcar 'expirado').

CREATE TABLE IF NOT EXISTS alertas_admin_pendentes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        text NOT NULL UNIQUE,
  cliente_phone text,
  titulo        text NOT NULL,
  detalhes      text,
  status        text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'assumido', 'expirado')),
  assumido_por  text,
  assumido_em   timestamptz,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alertas_admin_status_criado
  ON alertas_admin_pendentes (status, criado_em DESC);

ALTER TABLE alertas_admin_pendentes ENABLE ROW LEVEL SECURITY;
