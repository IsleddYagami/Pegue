-- Adiciona colunas pra capturar TODAS as variaveis que afetam o preco no
-- fluxo AVALIAR. Antes a simulacao so variava ajudante (boolean) e os
-- avaliadores (Fabio, prestadores) reclamaram que falta variedade:
--   - escada vs elevador vs terreo
--   - 0 / 1 / 2 ajudantes (nao mais boolean)
--
-- Mantem `tem_ajudante` por compatibilidade (deriva de qtd_ajudantes > 0).

ALTER TABLE feedback_precos
  ADD COLUMN IF NOT EXISTS qtd_ajudantes integer,
  ADD COLUMN IF NOT EXISTS andares_origem integer,
  ADD COLUMN IF NOT EXISTS tem_elevador boolean,
  ADD COLUMN IF NOT EXISTS tem_escada boolean;
