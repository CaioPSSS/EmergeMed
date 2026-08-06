-- Migration: Chapter Read Logs and Re-reads tracking for FSRS Engine
-- Date: 2026-08-07

-- 1. Add read_count and last_read_at to chapter_progress
ALTER TABLE public.chapter_progress
  ADD COLUMN IF NOT EXISTS read_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP WITH TIME ZONE;

-- Initialize last_read_at with read_at for existing rows
UPDATE public.chapter_progress
SET last_read_at = read_at
WHERE last_read_at IS NULL AND read_at IS NOT NULL;

-- 2. Create chapter_read_logs table for immutable reading history
CREATE TABLE IF NOT EXISTS public.chapter_read_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL,
  read_count_snapshot INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'dashboard_recommendation',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for chapter_read_logs
ALTER TABLE public.chapter_read_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own chapter read logs" ON public.chapter_read_logs;
CREATE POLICY "Users can manage their own chapter read logs"
  ON public.chapter_read_logs
  FOR ALL
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chapter_read_logs_user_chapter
  ON public.chapter_read_logs (user_id, chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chapter_progress_user_read_count
  ON public.chapter_progress (user_id, read_count);
