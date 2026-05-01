-- Tabela `vocabulario_observado` — acumula padroes de comunicacao
-- detectados pelo cron `aprendiz-vocabulario-externo`. Diferente de
-- `qualidade_extracao_ia` (que mede acerto em corridas reais), aqui
-- ficam variacoes SINTETICAS geradas pela IA + contraste com prompt
-- atual + cruzamento com erros reais observados.
--
-- Cumpre regra mestra APRENDIZADO CONSTANTE: sistema antecipa
-- vocabulario novo ANTES de clientes reais sofrerem com bug.

CREATE TABLE IF NOT EXISTS vocabulario_observado (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Mensagem sintetica gerada pela IA (~1 frase, como cliente diria)
  mensagem_sintetica text NOT NULL,

  -- Categoria detectada (frete/mudanca/guincho)
  categoria       text,

  -- Termos especificos detectados como nao cobertos pelo prompt atual
  termos_novos    text[],

  -- Quando o prompt atual ERROU em entender essa mensagem (true/false)
  prompt_atual_errou boolean,

  -- Detalhe do erro (qual campo extraiu errado)
  campos_errados  text[],

  -- Se esse padrao tambem aparece em medicoes REAIS (qualidade_extracao_ia)
  -- ele tem prioridade — ja afeta cliente vivo.
  cruzou_com_real boolean DEFAULT false,
  qtd_ocorrencias_reais integer DEFAULT 0,

  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vocabulario_observado_criado_em
  ON vocabulario_observado (criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_vocabulario_observado_errou
  ON vocabulario_observado (prompt_atual_errou) WHERE prompt_atual_errou = true;

CREATE INDEX IF NOT EXISTS idx_vocabulario_observado_termos_novos
  ON vocabulario_observado USING gin (termos_novos);

ALTER TABLE vocabulario_observado ENABLE ROW LEVEL SECURITY;
