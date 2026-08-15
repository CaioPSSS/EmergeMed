-- Migration: 20260809000000_custom_chapters.sql
-- Description: Adds custom_chapters table for user-imported book chapters & articles

CREATE TABLE IF NOT EXISTS public.custom_chapters (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_book TEXT NOT NULL DEFAULT 'Livro Personalizado',
  section_title TEXT NOT NULL DEFAULT 'Capítulos Personalizados',
  category TEXT NOT NULL DEFAULT 'Geral',
  summary TEXT,
  content TEXT NOT NULL,
  raw_content TEXT,
  frequency_score NUMERIC(3,1) NOT NULL DEFAULT 5.0,
  importance_score NUMERIC(3,1) NOT NULL DEFAULT 5.0,
  word_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure sequence starts at 1001 so it never collides with default 1..122 chapter IDs
ALTER SEQUENCE IF EXISTS public.custom_chapters_id_seq RESTART WITH 1001;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_custom_chapters_user_id ON public.custom_chapters(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_chapters_category ON public.custom_chapters(category);
CREATE INDEX IF NOT EXISTS idx_custom_chapters_source_book ON public.custom_chapters(source_book);

-- Row Level Security
ALTER TABLE public.custom_chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own custom chapters" ON public.custom_chapters;
CREATE POLICY "Users can view own custom chapters"
  ON public.custom_chapters
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own custom chapters" ON public.custom_chapters;
CREATE POLICY "Users can insert own custom chapters"
  ON public.custom_chapters
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own custom chapters" ON public.custom_chapters;
CREATE POLICY "Users can update own custom chapters"
  ON public.custom_chapters
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own custom chapters" ON public.custom_chapters;
CREATE POLICY "Users can delete own custom chapters"
  ON public.custom_chapters
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Ensure RLS policies on chapter_contents and chapter_weights allow inserts/updates
DROP POLICY IF EXISTS "Authenticated users can insert/update chapter weights" ON public.chapter_weights;
CREATE POLICY "Authenticated users can insert/update chapter weights"
  ON public.chapter_weights
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
