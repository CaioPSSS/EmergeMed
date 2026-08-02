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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
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

-- Policies for chapter_progress
CREATE POLICY "Users can manage their own chapter progress"
  ON public.chapter_progress
  FOR ALL
  USING (auth.uid() = user_id);

-- Policies for chapter_contents (readable by all authenticated users, writable by authenticated)
CREATE POLICY "Authenticated users can read chapter contents"
  ON public.chapter_contents
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert/update chapter contents"
  ON public.chapter_contents
  FOR ALL
  TO authenticated
  USING (true);

-- Policies for tests
CREATE POLICY "Users can manage their own tests"
  ON public.tests
  FOR ALL
  USING (auth.uid() = user_id);

-- Policies for user_settings
CREATE POLICY "Users can manage their own settings"
  ON public.user_settings
  FOR ALL
  USING (auth.uid() = user_id);
