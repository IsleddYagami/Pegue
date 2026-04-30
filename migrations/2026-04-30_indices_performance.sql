-- Indices de performance identificados na auditoria multi-agente 30/Abr/2026.
-- Queries que rodam frequentemente (crons, paginas admin) usam .gte(criado_em, X)
-- ou .filter("payload->>tipo", ...) — sem indice nessas colunas, varredura
-- sequencial degrada com volume de dados.

-- bot_logs: queries por tipo (crons de alertas, dashboards) e por criado_em DESC
-- (cleanup, relatorios). Generated column simplifica queries com filter("payload->>tipo")
CREATE INDEX IF NOT EXISTS idx_bot_logs_criado_em_desc
  ON bot_logs (criado_em DESC);

-- prestadores_veiculos: lookup ativo por prestador (dispatch — query quente
-- agora que migramos pra .in(prestador_id, [...])).
CREATE INDEX IF NOT EXISTS idx_prestadores_veiculos_prestador_ativo
  ON prestadores_veiculos (prestador_id, ativo);

-- bot_sessions: cleanup de zumbis filtra por atualizado_em (cron periodico).
CREATE INDEX IF NOT EXISTS idx_bot_sessions_atualizado_em
  ON bot_sessions (atualizado_em);

-- corridas: queries por status + criado_em (admin-operacao, dashboards).
CREATE INDEX IF NOT EXISTS idx_corridas_status_criado_em
  ON corridas (status, criado_em DESC);

-- feedback_precos: ordenacao por criado_em DESC ja eh frequente
-- (admin-feedback-precos, admin-sugestoes-ajuste).
CREATE INDEX IF NOT EXISTS idx_feedback_precos_criado_em_desc
  ON feedback_precos (criado_em DESC);

-- ajustes_precos: getRegrasAtivas filtra por ativo=true (toda cotacao).
CREATE INDEX IF NOT EXISTS idx_ajustes_precos_ativo
  ON ajustes_precos (ativo) WHERE ativo = true;
