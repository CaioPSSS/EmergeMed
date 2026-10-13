-- Migration: 20261016000000_mcq_anti_repetition_queue.sql
-- Description: Post-Chapter 10-MCQ Test System & Anti-Repetition Spaced Repetition Queue (R2 and R3)
-- Adds difficulty tiers and subformats to question_bank, and introduces user_question_history table.

-- 1. Extend question_bank with difficulty_tier and question_subformat
ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS difficulty_tier TEXT DEFAULT 'standard'
    CHECK (difficulty_tier IN ('standard', 'advanced'));

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS question_subformat TEXT DEFAULT 'case_conduct'
    CHECK (question_subformat IN ('case_conduct', 'direct_content', 'diagnostic_criteria'));

-- Index for efficient tier and subformat querying
CREATE INDEX IF NOT EXISTS idx_question_bank_tier_subformat 
  ON public.question_bank(difficulty_tier, question_subformat);

-- 2. Create user_question_history table for per-user spaced repetition tracking
CREATE TABLE IF NOT EXISTS public.user_question_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  question_id UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  last_is_correct BOOLEAN NOT NULL,
  times_answered INT DEFAULT 1,
  times_correct INT DEFAULT 0,
  last_answered_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_question_history_user_question UNIQUE(user_id, question_id)
);

-- Fast lookup indexes for queue partitioning and FIFO recycling
CREATE INDEX IF NOT EXISTS idx_user_question_history_user_chapter 
  ON public.user_question_history(user_id, chapter_id);

CREATE INDEX IF NOT EXISTS idx_user_question_history_last_answered 
  ON public.user_question_history(last_answered_at ASC);

-- 3. Row Level Security for user_question_history
ALTER TABLE public.user_question_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own question history"
  ON public.user_question_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own question history"
  ON public.user_question_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own question history"
  ON public.user_question_history
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
