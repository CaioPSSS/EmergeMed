-- Migration: 20261015000000_bed_case_bank.sql
-- Description: Create bed_case_bank for storing validated quartets of sequential bed cases (Q1-Q4)
-- Enables hybrid plantão loading with weighted reuse (40-80%) and phenotypic diversity.

CREATE TABLE IF NOT EXISTS bed_case_bank (
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

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_bed_case_bank_chapter_id ON bed_case_bank(chapter_id);
CREATE INDEX IF NOT EXISTS idx_bed_case_bank_times_used ON bed_case_bank(times_used ASC);
CREATE INDEX IF NOT EXISTS idx_bed_case_bank_complexity ON bed_case_bank(complexity_level);

-- Enable RLS
ALTER TABLE bed_case_bank ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read and insert bed cases
CREATE POLICY "Allow authenticated read bed_case_bank"
  ON bed_case_bank
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert bed_case_bank"
  ON bed_case_bank
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update times_used on bed_case_bank"
  ON bed_case_bank
  FOR UPDATE
  TO authenticated
  USING (true);
