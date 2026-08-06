-- Migration: 20260806000000_engine_recommendations_and_events.sql
-- Description: Expand chapter_review_stats with FSRS fields and create chapter_recommendation_events table with RLS and indexes.

-- 1. Add FSRS and evidence columns to public.chapter_review_stats
ALTER TABLE public.chapter_review_stats
  ADD COLUMN IF NOT EXISTS last_evidence_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS stability NUMERIC(6,2) DEFAULT 3.0,
  ADD COLUMN IF NOT EXISTS difficulty NUMERIC(4,2) DEFAULT 5.0;

-- 2. Create public.chapter_recommendation_events table
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

-- 3. Enable RLS on chapter_recommendation_events
ALTER TABLE public.chapter_recommendation_events ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy for chapter_recommendation_events
DROP POLICY IF EXISTS "Users can manage their own recommendation events" ON public.chapter_recommendation_events;
CREATE POLICY "Users can manage their own recommendation events"
  ON public.chapter_recommendation_events
  FOR ALL
  USING (auth.uid() = user_id);

-- 5. Indexes for fast event querying and audit reads
CREATE INDEX IF NOT EXISTS idx_rec_events_user_surface_created
  ON public.chapter_recommendation_events (user_id, surface, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rec_events_user_action
  ON public.chapter_recommendation_events (user_id, action);

CREATE INDEX IF NOT EXISTS idx_rec_events_user_recommended
  ON public.chapter_recommendation_events (user_id, recommended_chapter_id);
