-- 2026-05-01: BUG #2 do audit silencioso pre-cadastro real de parceiros.
--
-- O fluxo do bot pede 4 fotos no cadastro:
--   1. Selfie (segurando documento)
--   2. Foto do documento aberto sozinho (RG/CNH)
--   3. Foto da placa do veiculo
--   4. Foto do veiculo inteiro
--
-- A foto #2 (documento) ERA RECEBIDA, ERA SUBIDA pro Storage e era LOGGADA em
-- bot_logs com tipo "foto_cadastro_documento", MAS NUNCA era persistida no
-- registro do prestador. Resultado: a prova juridica do documento ficava
-- orfa no Storage e nem aparecia no email de arquivamento.
--
-- Esta migration adiciona a coluna que faltava. Nao precisa preencher nada
-- pra cadastros antigos (nao tinham documento separado coletado de qualquer
-- forma). Cadastros novos a partir de 1/Mai/2026 vao preencher.

ALTER TABLE prestadores
  ADD COLUMN IF NOT EXISTS foto_documento_url TEXT;

COMMENT ON COLUMN prestadores.foto_documento_url IS
  'Path interno do Storage (bucket prestadores-docs) com a foto do documento aberto (RG/CNH) sozinho. Use getFotoPrestadorSignedUrl pra gerar URL acessavel.';
