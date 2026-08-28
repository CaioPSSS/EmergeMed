-- Migration: 20260829000000_study_queue.sql
-- Description: Adds study_queue table for user-ordered study queue / custom study list

CREATE TABLE IF NOT EXISTS public.study_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, chapter_id)
);

-- Ensure completed column exists if table was already created
ALTER TABLE public.study_queue ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;

-- Indexes for efficient ordering and user queries
CREATE INDEX IF NOT EXISTS idx_study_queue_user_position ON public.study_queue(user_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_study_queue_user_chapter ON public.study_queue(user_id, chapter_id);

-- Row Level Security
ALTER TABLE public.study_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own study queue" ON public.study_queue;
CREATE POLICY "Users can view own study queue"
  ON public.study_queue
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own study queue" ON public.study_queue;
CREATE POLICY "Users can insert own study queue"
  ON public.study_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own study queue" ON public.study_queue;
CREATE POLICY "Users can update own study queue"
  ON public.study_queue
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own study queue" ON public.study_queue;
CREATE POLICY "Users can delete own study queue"
  ON public.study_queue
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
