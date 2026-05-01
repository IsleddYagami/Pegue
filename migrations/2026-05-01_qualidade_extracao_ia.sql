-- Tabela `qualidade_extracao_ia` — mede taxa de acerto da IA de extracao
-- de contexto (extrair-contexto.ts) comparando o que a IA extraiu da
-- 1a mensagem do cliente contra os valores que efetivamente foram usados
-- na corrida (depois das correcoes do cliente).
--
-- Cumpre regra mestra APRENDIZADO CONSTANTE INEGOCIAVEL:
--   - sistema mede sua propria qualidade
--   - identifica top divergencias (vocabulario novo, padroes nao captados)
--   - cron semanal IA propoe melhorias de prompt baseadas em dados reais
--
-- Idempotencia: 1 linha por corrida (UNIQUE em corrida_id).

CREATE TABLE IF NOT EXISTS qualidade_extracao_ia (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corrida_id      uuid NOT NULL,

  -- Texto que cliente enviou na 1a mensagem
  mensagem_original text,

  -- O que IA extraiu (JSON dos 14 campos do ContextoExtraido)
  extracao_ia     jsonb,

  -- Valores efetivamente usados na corrida final
  valores_finais  jsonb,

  -- Analise de acertos: array de campos que IA acertou e errou
  campos_corretos   text[],
  campos_incorretos text[],

  -- Taxa de acerto (0.0 a 1.0). Calculada como acertos / total_campos_avaliados.
  taxa_acerto     numeric(4,3),

  -- Metadata da chamada IA
  modelo_ia       text,
  custo_usd       numeric(8,5),

  criado_em       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT qualidade_extracao_ia_corrida_unique UNIQUE (corrida_id)
);

-- Indices pra dashboard e cron de aprendizado
CREATE INDEX IF NOT EXISTS idx_qualidade_extracao_criado_em
  ON qualidade_extracao_ia (criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_qualidade_extracao_taxa_acerto
  ON qualidade_extracao_ia (taxa_acerto);

-- Aceleracao da query de "campos errados na semana" (dashboard top-divergencias)
CREATE INDEX IF NOT EXISTS idx_qualidade_extracao_campos_incorretos
  ON qualidade_extracao_ia USING gin (campos_incorretos);

ALTER TABLE qualidade_extracao_ia ENABLE ROW LEVEL SECURITY;
