-- Migration: 20261014000001_batch_ledger_kind.sql
-- Description: Separa os lotes de GERAÇÃO NOTURNA de casos (sujeitos aos tetos de custo
-- US$ 0.15/dia e US$ 0.90/mês) dos lotes de CORREÇÃO do Modo Plantão (sem teto).
-- Linhas antigas assumem 'nightly_generation' por padrão; as correções de plantão já
-- registradas são reclassificadas pelo modelo de ledger (sem itens de geração) quando possível.

ALTER TABLE public.batch_generation_ledger
  ADD COLUMN IF NOT EXISTS batch_kind TEXT NOT NULL DEFAULT 'nightly_generation'
  CHECK (batch_kind IN ('nightly_generation', 'plantao_correction'));

CREATE INDEX IF NOT EXISTS idx_batch_ledger_kind
  ON public.batch_generation_ledger(batch_kind);

-- Reclassifica correções de plantão já existentes: seus batch_id estão gravados em
-- tests.plantao_data->>'batch_job_id' ou tests.plantao_data->>'feedback_batch_job_id'.
UPDATE public.batch_generation_ledger l
SET batch_kind = 'plantao_correction'
WHERE EXISTS (
  SELECT 1 FROM public.tests t
  WHERE t.plantao_data->>'batch_job_id' = l.batch_id
     OR t.plantao_data->>'feedback_batch_job_id' = l.batch_id
);
