-- Trava de processamento por phone — evita race quando cliente manda
-- multiplas msgs em rajada (caso real Igor 7/Mai/2026: 9 msgs em 3s
-- viraram 9 webhooks paralelos, cada um tentando processar como endereco
-- separado, gerando spam de respostas + escalacao indevida pra humano).
--
-- Uso: webhook tenta INSERT (UNIQUE phone). Se conflict + lock antigo
-- (>15s), UPDATE atomico. Se conflict + lock recente, OUTRO request tem
-- lock = aguardar OU processar via debounce.
--
-- Idempotente: executar varias vezes nao faz mal.

CREATE TABLE IF NOT EXISTS processing_locks (
  phone TEXT PRIMARY KEY,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pra cleanup de locks expirados (cron pode usar)
CREATE INDEX IF NOT EXISTS idx_processing_locks_acquired_at
  ON processing_locks(acquired_at);

-- Comentario pra rastreabilidade
COMMENT ON TABLE processing_locks IS
  '7/Mai/2026 — lock por phone pra serializar processamento de webhooks concorrentes do mesmo cliente. Lock TTL 15s (auto-expira via codigo).';
