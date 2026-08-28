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
  draft_index INTEGER DEFAULT 0,
  mode TEXT DEFAULT 'standard', -- 'standard' | 'plantao'
  plantao_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Ensure new columns exist on tests table if it was created previously
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'standard';
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS plantao_data JSONB;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS draft_index INTEGER DEFAULT 0;

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

-- ═══════════════════════════════════════════════════════════
-- V2 TABLES (Gamification, Question Bank, Error Patterns)
-- ═══════════════════════════════════════════════════════════

-- Table: question_bank (Reusable curated questions)
CREATE TABLE IF NOT EXISTS public.question_bank (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chapter_id INTEGER NOT NULL,
  question_type TEXT NOT NULL,
  vignette TEXT NOT NULL,
  options JSONB,
  correct_option INTEGER,
  explanation TEXT,
  ideal_prescription TEXT,
  evaluation_criteria JSONB,
  ideal_ventilator JSONB,
  prompt_text TEXT,
  times_shown INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0,
  times_incorrect INTEGER DEFAULT 0,
  avg_score NUMERIC(4,2) DEFAULT 0.0,
  difficulty_computed NUMERIC(4,2) DEFAULT 5.0,
  is_curated BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'ai_generated',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: error_pattern_tags (Transversal competency error tracking)
CREATE TABLE IF NOT EXISTS public.error_pattern_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  chapter_id INTEGER NOT NULL,
  competency TEXT NOT NULL,
  severity TEXT NOT NULL,
  error_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: user_daily_activity (Streaks and daily stats)
CREATE TABLE IF NOT EXISTS public.user_daily_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  chapters_read INTEGER DEFAULT 0,
  chapters_reread INTEGER DEFAULT 0,
  tests_completed INTEGER DEFAULT 0,
  plantoes_completed INTEGER DEFAULT 0,
  questions_answered INTEGER DEFAULT 0,
  questions_correct INTEGER DEFAULT 0,
  study_events INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, activity_date)
);

-- Table: user_achievements (Badges / conquistas)
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, achievement_key)
);

-- Table: user_gamification_stats (Consolidated XP, level, streaks)
CREATE TABLE IF NOT EXISTS public.user_gamification_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  max_streak INTEGER DEFAULT 0,
  total_xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  last_activity_date DATE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_qbank_chapter ON public.question_bank(chapter_id);
CREATE INDEX IF NOT EXISTS idx_qbank_type ON public.question_bank(question_type);
CREATE INDEX IF NOT EXISTS idx_error_patterns_user ON public.error_pattern_tags(user_id, competency);
CREATE INDEX IF NOT EXISTS idx_daily_activity ON public.user_daily_activity(user_id, activity_date);
CREATE INDEX IF NOT EXISTS idx_tests_user_mode ON public.tests(user_id, mode);
CREATE INDEX IF NOT EXISTS idx_tests_user_completed ON public.tests(user_id, completed);
CREATE INDEX IF NOT EXISTS idx_review_stats_next_review ON public.chapter_review_stats(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_rec_events_user_date ON public.chapter_recommendation_events(user_id, created_at DESC);

-- RLS for new tables
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_pattern_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_gamification_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read questions"
  ON public.question_bank FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage questions"
  ON public.question_bank FOR ALL TO authenticated USING (true);
CREATE POLICY "Users can manage own error patterns"
  ON public.error_pattern_tags FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own daily activity"
  ON public.user_daily_activity FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own achievements"
  ON public.user_achievements FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own gamification stats"
  ON public.user_gamification_stats FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════
-- Table: study_queue (Personalized Study Queue with ordering)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.study_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS idx_study_queue_user_position ON public.study_queue(user_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_study_queue_user_chapter ON public.study_queue(user_id, chapter_id);

ALTER TABLE public.study_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own study queue" ON public.study_queue;
CREATE POLICY "Users can view own study queue"
  ON public.study_queue FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own study queue" ON public.study_queue;
CREATE POLICY "Users can insert own study queue"
  ON public.study_queue FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own study queue" ON public.study_queue;
CREATE POLICY "Users can update own study queue"
  ON public.study_queue FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own study queue" ON public.study_queue;
CREATE POLICY "Users can delete own study queue"
  ON public.study_queue FOR DELETE TO authenticated USING (auth.uid() = user_id);


