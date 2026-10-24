-- Migration: 20261024000000_plantao_batch_cron.sql
-- Description: Agendamento assíncrono via pg_cron + pg_net para verificação contínua dos lotes de plantão (Auto-Chaining)
-- Habilita as extensões nativas do Supabase
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Tabela de configurações internas para webhooks do cron (URL e Token)
CREATE TABLE IF NOT EXISTS app_cron_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Valores padrão (o usuário pode atualizar com a URL do seu app em produção e o CRON_SECRET)
INSERT INTO app_cron_config (key, value)
VALUES 
  ('app_url', 'http://localhost:3000'),
  ('cron_secret', 'default_secret')
ON CONFLICT (key) DO NOTHING;

-- Função que executa a cada 2 minutos no banco de dados
CREATE OR REPLACE FUNCTION check_pending_plantao_batches()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pending_count INT;
  v_app_url TEXT;
  v_cron_secret TEXT;
BEGIN
  -- 1. Consulta ultrarrápida indexada: verifica se há algum plantão aguardando lote
  SELECT count(*) INTO v_pending_count
  FROM tests
  WHERE status IN ('awaiting_batch_bed_evaluation', 'awaiting_batch_feedback');

  -- Se não houver plantão pendente, encerra com CUSTO ZERO (0ms de rede)
  IF v_pending_count = 0 THEN
    RETURN;
  END IF;

  -- 2. Recupera configurações de URL e segredo
  SELECT value INTO v_app_url FROM app_cron_config WHERE key = 'app_url';
  SELECT value INTO v_cron_secret FROM app_cron_config WHERE key = 'cron_secret';

  IF v_app_url IS NULL OR v_app_url = '' THEN
    RETURN;
  END IF;

  -- 3. Dispara chamada HTTP assíncrona ao servidor via pg_net
  PERFORM net.http_post(
    url := v_app_url || '/api/cron/check-batch-status',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_cron_secret, '')
    ),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'pending_count', v_pending_count,
      'triggered_at', now()
    )
  );
END;
$$;

-- Agendamento no pg_cron: roda a cada 2 minutos
-- (Remove agendamento prévio com o mesmo nome se existir para evitar duplicidade)
DO $$
BEGIN
  PERFORM cron.unschedule('check-plantao-batches-cron');
EXCEPTION WHEN OTHERS THEN
  -- Ignora se o job ainda não existia
END $$;

SELECT cron.schedule(
  'check-plantao-batches-cron',
  '*/2 * * * *',
  'SELECT check_pending_plantao_batches();'
);
