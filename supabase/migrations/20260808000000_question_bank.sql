CREATE TABLE IF NOT EXISTS public.question_bank (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chapter_id INTEGER NOT NULL,
  question_type TEXT NOT NULL, -- 'multiple_choice' | 'prescription_complete' | 'ventilator'
  vignette TEXT NOT NULL,
  options JSONB,              -- para MCQ: array de strings
  correct_option INTEGER,     -- para MCQ: índice 0-based
  explanation TEXT,
  ideal_prescription TEXT,
  evaluation_criteria JSONB,  -- array de strings
  ideal_ventilator JSONB,
  prompt_text TEXT,
  
  -- Metadados de uso
  times_shown INTEGER DEFAULT 0,
  times_correct INTEGER DEFAULT 0,
  times_incorrect INTEGER DEFAULT 0,
  avg_score NUMERIC(4,2) DEFAULT 0.0,
  difficulty_computed NUMERIC(4,2) DEFAULT 5.0,
  
  -- Curadoria
  is_curated BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'ai_generated', -- 'ai_generated' | 'manual' | 'imported'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qbank_chapter ON public.question_bank(chapter_id);
CREATE INDEX IF NOT EXISTS idx_qbank_type ON public.question_bank(question_type);

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read questions" 
  ON public.question_bank FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage questions"
  ON public.question_bank FOR ALL TO authenticated USING (true);
