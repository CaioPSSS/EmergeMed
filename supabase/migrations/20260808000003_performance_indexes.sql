-- Acelerar queries de histórico
CREATE INDEX IF NOT EXISTS idx_tests_user_mode 
  ON public.tests(user_id, mode);

CREATE INDEX IF NOT EXISTS idx_tests_user_completed 
  ON public.tests(user_id, completed);

-- Acelerar lookup de revisões vencidas (para o motor FSRS)
CREATE INDEX IF NOT EXISTS idx_review_stats_next_review 
  ON public.chapter_review_stats(user_id, next_review_at);

-- Acelerar recommendation events por data
CREATE INDEX IF NOT EXISTS idx_rec_events_user_date 
  ON public.chapter_recommendation_events(user_id, created_at DESC);
