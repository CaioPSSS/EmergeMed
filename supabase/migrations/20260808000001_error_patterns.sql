CREATE TABLE IF NOT EXISTS public.error_pattern_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  chapter_id INTEGER NOT NULL,
  competency TEXT NOT NULL,  -- 'farmacologia' | 'diagnostico' | 'conduta' | 'ventilacao' | 'prescricao_geral'
  severity TEXT NOT NULL,    -- 'critico' | 'moderado' | 'leve'
  error_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_patterns_user ON public.error_pattern_tags(user_id, competency);
ALTER TABLE public.error_pattern_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own error patterns"
  ON public.error_pattern_tags FOR ALL USING (auth.uid() = user_id);
