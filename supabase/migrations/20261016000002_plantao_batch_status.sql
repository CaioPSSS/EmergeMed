-- Migration: 20261016000002_plantao_batch_status.sql
-- Description: State machine status column, check constraint, compound index, and safe backfill for public.tests (Plantão Batch Evaluation)

-- 1. Add status column to tests table with default value 'in_progress'
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_progress';

-- 2. Safe deterministic backfill of existing rows:
-- A. Any historical test marked completed must have status = 'completed'
UPDATE public.tests
SET status = 'completed'
WHERE completed = true AND (status = 'in_progress' OR status IS NULL);

-- B. Any uncompleted test with NULL status must default to 'in_progress'
UPDATE public.tests
SET status = 'in_progress'
WHERE status IS NULL;

-- 3. Idempotently add CHECK constraint enforcing valid state machine transitions
ALTER TABLE public.tests
  DROP CONSTRAINT IF EXISTS tests_status_check;

ALTER TABLE public.tests
  ADD CONSTRAINT tests_status_check
  CHECK (status IN (
    'in_progress',
    'awaiting_batch_bed_evaluation',
    'ready_for_adverse',
    'awaiting_batch_feedback',
    'completed'
  ));

-- 4. Create compound index for fast querying of user tests by status
CREATE INDEX IF NOT EXISTS idx_tests_user_status
  ON public.tests(user_id, status);
