-- =============================================================================
-- EmergeMed Supabase Database Schema  (IDEMPOTENTE / SEMPRE REEXECUTÁVEL)
-- Sincronizado com as migrations até 20261016000003_batch_ledger_kind.sql
--
-- Regras deste arquivo:
--   * CREATE TABLE / INDEX / EXTENSION sempre com IF NOT EXISTS.
--   * Colunas adicionadas por migrations usam ADD COLUMN IF NOT EXISTS, então
--     bancos criados antes dessas migrations são atualizados na própria execução.
--   * Toda policy faz DROP POLICY IF EXISTS antes do CREATE POLICY (a definição
--     fica sempre atualizada e não dá erro de "already exists").
--   * Backfills de dados rodam UMA única vez (protegidos por checagem) e nunca
--     duplicam linhas.
--   * Nada aqui apaga tabelas, colunas, índices ou dados.
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABELAS BASE
-- =============================================================================

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

-- migration 20260807: read_count / last_read_at (backfill de last_read_at roda só na 1ª vez)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chapter_progress' AND column_name = 'last_read_at'
  ) THEN
    ALTER TABLE public.chapter_progress
      ADD COLUMN IF NOT EXISTS read_count INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP WITH TIME ZONE;

    UPDATE public.chapter_progress
    SET last_read_at = read_at
    WHERE last_read_at IS NULL AND read_at IS NOT NULL;
  END IF;
END $$;

ALTER TABLE public.chapter_progress ADD COLUMN IF NOT EXISTS read_count INTEGER DEFAULT 1;
ALTER TABLE public.chapter_progress ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP WITH TIME ZONE;

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
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'awaiting_batch_bed_evaluation', 'ready_for_adverse', 'awaiting_batch_feedback', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Colunas adicionadas depois (migrations 20260822 e 20261016000002)
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'standard';
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS plantao_data JSONB;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS draft_index INTEGER DEFAULT 0;
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'in_progress';

-- migration 20261016000002: backfill + CHECK de status (só roda enquanto a constraint não existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tests_status_check' AND conrelid = 'public.tests'::regclass
  ) THEN
    UPDATE public.tests
    SET status = 'completed'
    WHERE completed = true AND (status = 'in_progress' OR status IS NULL);

    UPDATE public.tests
    SET status = 'in_progress'
    WHERE status IS NULL;

    ALTER TABLE public.tests
      ADD CONSTRAINT tests_status_check
      CHECK (status IN (
        'in_progress',
        'awaiting_batch_bed_evaluation',
        'ready_for_adverse',
        'awaiting_batch_feedback',
        'completed'
      ));
  END IF;
END $$;

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

-- migration 20260806: campos FSRS
ALTER TABLE public.chapter_review_stats ADD COLUMN IF NOT EXISTS last_evidence_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.chapter_review_stats ADD COLUMN IF NOT EXISTS stability NUMERIC(6,2) DEFAULT 3.0;
ALTER TABLE public.chapter_review_stats ADD COLUMN IF NOT EXISTS difficulty NUMERIC(4,2) DEFAULT 5.0;

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

-- Indexes: chapter_recommendation_events (migrations 20260806 e 20260808000003)
CREATE INDEX IF NOT EXISTS idx_rec_events_user_surface_created ON public.chapter_recommendation_events (user_id, surface, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_events_user_action ON public.chapter_recommendation_events (user_id, action);
CREATE INDEX IF NOT EXISTS idx_rec_events_user_recommended ON public.chapter_recommendation_events (user_id, recommended_chapter_id);
CREATE INDEX IF NOT EXISTS idx_rec_events_user_date ON public.chapter_recommendation_events (user_id, created_at DESC);

-- Indexes: chapter_read_logs / chapter_progress (migration 20260807)
CREATE INDEX IF NOT EXISTS idx_chapter_read_logs_user_chapter ON public.chapter_read_logs (user_id, chapter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapter_progress_user_read_count ON public.chapter_progress (user_id, read_count);

-- Indexes: tests / chapter_review_stats (migrations 20260803 e 20260808000003)
CREATE INDEX IF NOT EXISTS idx_tests_user_mode ON public.tests (user_id, mode);
CREATE INDEX IF NOT EXISTS idx_tests_user_completed ON public.tests (user_id, completed);
CREATE INDEX IF NOT EXISTS idx_tests_user_status ON public.tests (user_id, status);
CREATE INDEX IF NOT EXISTS idx_review_stats_next_review ON public.chapter_review_stats (user_id, next_review_at);
-- B-Tree da 20260803 que não são redundantes com os acima. Os demais índices dessa
-- migration (idx_tests_user_id, idx_tests_user_id_completed, idx_tests_user_id_mode,
-- idx_chapter_review_stats_user_id, _user_chapter, _user_next_review) duplicam índices
-- já definidos aqui e por isso não são recriados.
CREATE INDEX IF NOT EXISTS idx_tests_created_at_desc ON public.tests USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chapter_review_stats_chapter_id ON public.chapter_review_stats USING btree (chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapter_review_stats_next_review_at ON public.chapter_review_stats USING btree (next_review_at);

-- =============================================================================
-- ROW LEVEL SECURITY - TABELAS BASE
-- =============================================================================
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
-- (a migration 20260809 cria "Authenticated users can insert/update chapter weights",
--  equivalente a esta; se ela já existir no banco, é inofensiva e não é tocada aqui)
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

-- =============================================================================
-- V2 TABLES (Gamification, Question Bank, Error Patterns)
-- =============================================================================

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
  difficulty_tier TEXT DEFAULT 'standard' CHECK (difficulty_tier IN ('standard', 'advanced')),
  question_subformat TEXT DEFAULT 'case_conduct' CHECK (question_subformat IN ('case_conduct', 'direct_content', 'diagnostic_criteria')),
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

-- migration 20261016000000 (em tabela pré-existente; o CHECK acompanha a coluna)
ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS difficulty_tier TEXT DEFAULT 'standard'
    CHECK (difficulty_tier IN ('standard', 'advanced'));
ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS question_subformat TEXT DEFAULT 'case_conduct'
    CHECK (question_subformat IN ('case_conduct', 'direct_content', 'diagnostic_criteria'));

-- Table: user_question_history (SRS queue tracking per user and question)
CREATE TABLE IF NOT EXISTS public.user_question_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  question_id UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  last_is_correct BOOLEAN NOT NULL,
  times_answered INTEGER DEFAULT 1,
  times_correct INTEGER DEFAULT 0,
  last_answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_user_question_history_user_question UNIQUE(user_id, question_id)
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

-- Indexes for V2 tables
CREATE INDEX IF NOT EXISTS idx_qbank_chapter ON public.question_bank(chapter_id);
CREATE INDEX IF NOT EXISTS idx_qbank_type ON public.question_bank(question_type);
CREATE INDEX IF NOT EXISTS idx_question_bank_tier_subformat ON public.question_bank(difficulty_tier, question_subformat);
CREATE INDEX IF NOT EXISTS idx_user_question_history_user_chapter ON public.user_question_history(user_id, chapter_id);
CREATE INDEX IF NOT EXISTS idx_user_question_history_last_answered ON public.user_question_history(last_answered_at ASC);
CREATE INDEX IF NOT EXISTS idx_error_patterns_user ON public.error_pattern_tags(user_id, competency);
CREATE INDEX IF NOT EXISTS idx_daily_activity ON public.user_daily_activity(user_id, activity_date);

-- RLS for V2 tables
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_question_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_pattern_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_gamification_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read questions" ON public.question_bank;
CREATE POLICY "Authenticated users can read questions"
  ON public.question_bank FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage questions" ON public.question_bank;
CREATE POLICY "Authenticated users can manage questions"
  ON public.question_bank FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can read own question history" ON public.user_question_history;
CREATE POLICY "Users can read own question history"
  ON public.user_question_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own question history" ON public.user_question_history;
CREATE POLICY "Users can insert own question history"
  ON public.user_question_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own question history" ON public.user_question_history;
CREATE POLICY "Users can update own question history"
  ON public.user_question_history
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own error patterns" ON public.error_pattern_tags;
CREATE POLICY "Users can manage own error patterns"
  ON public.error_pattern_tags FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own daily activity" ON public.user_daily_activity;
CREATE POLICY "Users manage own daily activity"
  ON public.user_daily_activity FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own achievements" ON public.user_achievements;
CREATE POLICY "Users manage own achievements"
  ON public.user_achievements FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own gamification stats" ON public.user_gamification_stats;
CREATE POLICY "Users manage own gamification stats"
  ON public.user_gamification_stats FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- Table: study_queue (Personalized Study Queue with ordering)
-- =============================================================================
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

ALTER TABLE public.study_queue ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE;

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

-- =============================================================================
-- TABLE: custom_chapters (Capítulos/artigos importados pelo usuário) - migration 20260809
-- =============================================================================
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

-- A sequence deve começar em 1001 para nunca colidir com os IDs padrão 1..122.
-- SEGURO PARA REEXECUÇÃO: só reposiciona enquanto a sequence ainda não chegou a 1001,
-- ou seja, nunca volta atrás nem reutiliza IDs já emitidos.
DO $$
DECLARE
  seq TEXT := pg_get_serial_sequence('public.custom_chapters', 'id');
  cur BIGINT;
BEGIN
  IF seq IS NOT NULL THEN
    EXECUTE format('SELECT last_value FROM %s', seq) INTO cur;
    IF cur < 1001 THEN
      PERFORM setval(seq::regclass, 1001, false);
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_custom_chapters_user_id ON public.custom_chapters(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_chapters_category ON public.custom_chapters(category);
CREATE INDEX IF NOT EXISTS idx_custom_chapters_source_book ON public.custom_chapters(source_book);

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

-- =============================================================================
-- TABLE: bed_case_bank (Banco de Casos Clínicos Estruturados para Modo Plantão)
-- (o backfill a partir de public.tests da migration 20261015000000 NÃO é repetido
--  aqui: ele inseriria linhas duplicadas a cada execução)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bed_case_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id INTEGER NOT NULL,
  chapter_title TEXT NOT NULL,
  section_title TEXT,
  phenotype_title TEXT,
  complexity_level TEXT DEFAULT 'classic' CHECK (complexity_level IN ('classic', 'complex', 'atypical')),
  questions JSONB NOT NULL,
  times_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bed_case_bank_chapter_id ON public.bed_case_bank(chapter_id);
CREATE INDEX IF NOT EXISTS idx_bed_case_bank_times_used ON public.bed_case_bank(times_used ASC);
CREATE INDEX IF NOT EXISTS idx_bed_case_bank_complexity ON public.bed_case_bank(complexity_level);

ALTER TABLE public.bed_case_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read bed_case_bank" ON public.bed_case_bank;
CREATE POLICY "Allow authenticated read bed_case_bank"
  ON public.bed_case_bank FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert bed_case_bank" ON public.bed_case_bank;
CREATE POLICY "Allow authenticated insert bed_case_bank"
  ON public.bed_case_bank FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update times_used on bed_case_bank" ON public.bed_case_bank;
CREATE POLICY "Allow authenticated update times_used on bed_case_bank"
  ON public.bed_case_bank FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- TABLE: batch_generation_ledger (OpenRouter Batch Ledger & Budget Caps)
-- =============================================================================
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
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'completed', 'failed', 'capped')),
  batch_kind TEXT NOT NULL DEFAULT 'nightly_generation' CHECK (batch_kind IN ('nightly_generation', 'plantao_correction'))
);

-- migration 20261016000003: batch_kind separa geração noturna (tetos US$ 0.15/dia e
-- US$ 0.90/mês) das correções do Modo Plantão (sem teto).
-- Em tabela pré-existente, adiciona a coluna E reclassifica as correções de plantão
-- já registradas, uma única vez (só entra aqui enquanto a coluna não existe).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'batch_generation_ledger' AND column_name = 'batch_kind'
  ) THEN
    ALTER TABLE public.batch_generation_ledger
      ADD COLUMN batch_kind TEXT NOT NULL DEFAULT 'nightly_generation'
      CHECK (batch_kind IN ('nightly_generation', 'plantao_correction'));

    UPDATE public.batch_generation_ledger l
    SET batch_kind = 'plantao_correction'
    WHERE EXISTS (
      SELECT 1 FROM public.tests t
      WHERE t.plantao_data->>'batch_job_id' = l.batch_id
         OR t.plantao_data->>'batch_bed_eval_id' = l.batch_id
         OR t.plantao_data->>'bedBatchId' = l.batch_id
         OR t.plantao_data->>'feedbackBatchId' = l.batch_id
         OR t.plantao_data->>'feedback_batch_id' = l.batch_id
         OR t.plantao_data->>'feedback_batch_job_id' = l.batch_id
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_batch_ledger_submission_timestamp
  ON public.batch_generation_ledger(submission_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_batch_ledger_batch_id
  ON public.batch_generation_ledger(batch_id);

CREATE INDEX IF NOT EXISTS idx_batch_ledger_status
  ON public.batch_generation_ledger(status);

CREATE INDEX IF NOT EXISTS idx_batch_ledger_kind
  ON public.batch_generation_ledger(batch_kind);

ALTER TABLE public.batch_generation_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read batch_generation_ledger" ON public.batch_generation_ledger;
CREATE POLICY "Allow authenticated read batch_generation_ledger"
  ON public.batch_generation_ledger
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated insert batch_generation_ledger" ON public.batch_generation_ledger;
CREATE POLICY "Allow authenticated insert batch_generation_ledger"
  ON public.batch_generation_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated update batch_generation_ledger" ON public.batch_generation_ledger;
CREATE POLICY "Allow authenticated update batch_generation_ledger"
  ON public.batch_generation_ledger
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service_role all batch_generation_ledger" ON public.batch_generation_ledger;
CREATE POLICY "Allow service_role all batch_generation_ledger"
  ON public.batch_generation_ledger
  TO service_role
  USING (true)
  WITH CHECK (true);