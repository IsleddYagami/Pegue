-- Garante idempotencia do cron aprendizado-incidentes mesmo em chamadas
-- concorrentes. O cron ja faz SELECT COUNT antes de INSERT, mas se 2 crons
-- rodarem em paralelo (raro mas possivel em retries), ambos veem count=0
-- e ambos inserem. UNIQUE constraint barra duplicata no DB.
--
-- Usa expressao em (criado_em AT TIME ZONE 'UTC')::date que eh IMMUTABLE
-- (criado_em sozinho seria timestamptz, falha em IMMUTABLE — vide migration
-- 2026-04-30_incidentes_atendimento.sql original que rejeitou date_trunc).

CREATE UNIQUE INDEX IF NOT EXISTS idx_incidentes_phone_dia_utc
  ON incidentes_atendimento (phone, ((criado_em AT TIME ZONE 'UTC')::date));
