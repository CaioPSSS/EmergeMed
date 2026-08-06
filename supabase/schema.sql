-- EmergeMed Supabase Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: chapter_progress (Tracks read status per user and chapter)
CREATE TABLE IF NOT EXISTS public.chapter_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  read_count INTEGER DEFAULT 1,
  last_read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, chapter_id)
);

-- Table: chapter_contents (Stores PDF extracted text per chapter)
CREATE TABLE IF NOT EXISTS public.chapter_contents (
  chapter_id INTEGER PRIMARY KEY,
  content TEXT NOT NULL,
  word_count INTEGER,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: tests (Stores test attempts and AI evaluations)
CREATE TABLE IF NOT EXISTS public.tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_ids INTEGER[] NOT NULL,
  question_type TEXT NOT NULL, -- 'multiple_choice' | 'prescription' | 'mixed'
  total_questions INTEGER NOT NULL,
  score NUMERIC(5,2),
  questions JSONB NOT NULL,
  answers JSONB,
  results JSONB,
  completed BOOLEAN DEFAULT FALSE,
  mode TEXT DEFAULT 'standard', -- 'standard' | 'plantao'
  plantao_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Ensure new columns exist on tests table if it was created previously
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'standard';
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS plantao_data JSONB;

-- Table: chapter_weights (Stores frequency and importance weights per chapter)
CREATE TABLE IF NOT EXISTS public.chapter_weights (
  chapter_id INTEGER PRIMARY KEY,
  frequency_score NUMERIC(3,1) NOT NULL DEFAULT 5.0,
  importance_score NUMERIC(3,1) NOT NULL DEFAULT 5.0,
  category TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: chapter_review_stats (FSRS / SM-2 spaced repetition stats per user and chapter)
CREATE TABLE IF NOT EXISTS public.chapter_review_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL,
  times_reviewed INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0,
  times_incorrect INTEGER DEFAULT 0,
  last_reviewed_at TIMESTAMP WITH TIME ZONE,
  last_evidence_at TIMESTAMP WITH TIME ZONE,
  next_review_at TIMESTAMP WITH TIME ZONE,
  ease_factor NUMERIC(4,2) DEFAULT 2.5,
  interval_days INTEGER DEFAULT 1,
  stability NUMERIC(6,2) DEFAULT 3.0,
  difficulty NUMERIC(4,2) DEFAULT 5.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, chapter_id)
);

-- Table: chapter_recommendation_events (Audit events for recommendation engine)
CREATE TABLE IF NOT EXISTS public.chapter_recommendation_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommended_chapter_id INTEGER NOT NULL,
  selected_chapter_id INTEGER NOT NULL,
  surface TEXT NOT NULL, -- 'dashboard' | 'plantao'
  mode TEXT NOT NULL, -- 'remediation' | 'expansion' | 'maintenance'
  algorithm_version TEXT NOT NULL DEFAULT 'v1.0-fsrs',
  priority_snapshot JSONB NOT NULL,
  action TEXT NOT NULL, -- 'shown' | 'accepted' | 'rerolled' | 'manual_selected' | 'completed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: chapter_read_logs (Immutable log of chapter reading and re-reading events)
CREATE TABLE IF NOT EXISTS public.chapter_read_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL,
  read_count_snapshot INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'dashboard_recommendation',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: user_settings (Stores OpenRouter API key and model preferences)
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  openrouter_api_key TEXT,
  question_model TEXT DEFAULT 'deepseek/deepseek-v4-flash',
  prescription_model TEXT DEFAULT 'qwen/qwen3.6-35b-a3b',
  fallback_model TEXT DEFAULT 'google/gemini-2.5-flash',
  current_chapter_id INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) Policies
ALTER TABLE public.chapter_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_review_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_recommendation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_read_logs ENABLE ROW LEVEL SECURITY;

-- Policies for chapter_read_logs
DROP POLICY IF EXISTS "Users can manage their own chapter read logs" ON public.chapter_read_logs;
CREATE POLICY "Users can manage their own chapter read logs"
  ON public.chapter_read_logs
  FOR ALL
  USING (auth.uid() = user_id);

-- Policies for chapter_progress
DROP POLICY IF EXISTS "Users can manage their own chapter progress" ON public.chapter_progress;
CREATE POLICY "Users can manage their own chapter progress"
  ON public.chapter_progress
  FOR ALL
  USING (auth.uid() = user_id);

-- Policies for chapter_contents (readable by all authenticated users, writable by authenticated)
DROP POLICY IF EXISTS "Authenticated users can read chapter contents" ON public.chapter_contents;
CREATE POLICY "Authenticated users can read chapter contents"
  ON public.chapter_contents
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert/update chapter contents" ON public.chapter_contents;
CREATE POLICY "Authenticated users can insert/update chapter contents"
  ON public.chapter_contents
  FOR ALL
  TO authenticated
  USING (true);

-- Policies for tests
DROP POLICY IF EXISTS "Users can manage their own tests" ON public.tests;
CREATE POLICY "Users can manage their own tests"
  ON public.tests
  FOR ALL
  USING (auth.uid() = user_id);

-- Policies for user_settings
DROP POLICY IF EXISTS "Users can manage their own settings" ON public.user_settings;
CREATE POLICY "Users can manage their own settings"
  ON public.user_settings
  FOR ALL
  USING (auth.uid() = user_id);

-- Policies for chapter_weights
DROP POLICY IF EXISTS "Authenticated users can read weights" ON public.chapter_weights;
CREATE POLICY "Authenticated users can read weights"
  ON public.chapter_weights
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage weights" ON public.chapter_weights;
CREATE POLICY "Authenticated users can manage weights"
  ON public.chapter_weights
  FOR ALL
  TO authenticated
  USING (true);

-- Policies for chapter_review_stats
DROP POLICY IF EXISTS "Users can manage their own review stats" ON public.chapter_review_stats;
CREATE POLICY "Users can manage their own review stats"
  ON public.chapter_review_stats
  FOR ALL
  USING (auth.uid() = user_id);

-- Policies for chapter_recommendation_events
DROP POLICY IF EXISTS "Users can manage their own recommendation events" ON public.chapter_recommendation_events;
CREATE POLICY "Users can manage their own recommendation events"
  ON public.chapter_recommendation_events
  FOR ALL
  USING (auth.uid() = user_id);


