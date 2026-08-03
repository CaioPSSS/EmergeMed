-- Migration: Add B-Tree Indexes for Performance Optimization
-- Created at: 2026-08-03

-- B-Tree Indexes for 'tests' table queries
CREATE INDEX IF NOT EXISTS idx_tests_user_id ON public.tests USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_tests_created_at_desc ON public.tests USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tests_user_id_completed ON public.tests USING btree (user_id, completed);
CREATE INDEX IF NOT EXISTS idx_tests_user_id_mode ON public.tests USING btree (user_id, mode);

-- B-Tree Indexes for 'chapter_review_stats' table queries
CREATE INDEX IF NOT EXISTS idx_chapter_review_stats_user_id ON public.chapter_review_stats USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_chapter_review_stats_chapter_id ON public.chapter_review_stats USING btree (chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapter_review_stats_next_review_at ON public.chapter_review_stats USING btree (next_review_at);
CREATE INDEX IF NOT EXISTS idx_chapter_review_stats_user_chapter ON public.chapter_review_stats USING btree (user_id, chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapter_review_stats_user_next_review ON public.chapter_review_stats USING btree (user_id, next_review_at);
