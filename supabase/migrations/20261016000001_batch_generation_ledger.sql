-- Migration: 20261016000001_batch_generation_ledger.sql
-- Description: OpenRouter Nightly Batch Generation Ledger & Budget Governance (Requirements R4 and R5)

CREATE TABLE IF NOT EXISTS public.batch_generation_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT UNIQUE NOT NULL,
  submission_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completion_timestamp TIMESTAMPTZ,
  model TEXT DEFAULT 'openai/gpt-6-luna:batch',
  prompt_tokens INT DEFAULT 0,
  completion_tokens INT DEFAULT 0,
  cost_usd NUMERIC(10, 6) DEFAULT 0,
  daily_accumulated_usd NUMERIC(10, 6) DEFAULT 0,
  monthly_accumulated_usd NUMERIC(10, 6) DEFAULT 0,
  hard_cap_interrupted BOOLEAN DEFAULT FALSE,
  items_requested INT DEFAULT 0,
  items_ingested INT DEFAULT 0,
  items_failed INT DEFAULT 0,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'completed', 'failed', 'capped'))
);

CREATE INDEX IF NOT EXISTS idx_batch_ledger_submission_timestamp 
  ON public.batch_generation_ledger(submission_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_batch_ledger_batch_id 
  ON public.batch_generation_ledger(batch_id);

CREATE INDEX IF NOT EXISTS idx_batch_ledger_status 
  ON public.batch_generation_ledger(status);

-- Enable Row Level Security
ALTER TABLE public.batch_generation_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read batch_generation_ledger" 
  ON public.batch_generation_ledger 
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Allow authenticated insert batch_generation_ledger" 
  ON public.batch_generation_ledger 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update batch_generation_ledger" 
  ON public.batch_generation_ledger 
  FOR UPDATE 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY "Allow service_role all batch_generation_ledger" 
  ON public.batch_generation_ledger 
  TO service_role 
  USING (true) 
  WITH CHECK (true);
