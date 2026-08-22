-- Migration: Add draft_index column to tests table for persisting user position in active tests/plantões
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS draft_index INTEGER DEFAULT 0;
