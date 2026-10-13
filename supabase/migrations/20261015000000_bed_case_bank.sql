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
  USING (true)
  WITH CHECK (true);

-- Backfill existing plantão beds from public.tests table if any exist
DO $$
DECLARE
  test_record RECORD;
  bed_elem JSONB;
  bed_qs JSONB;
  q_ids JSONB;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tests') THEN
    FOR test_record IN SELECT id, questions, plantao_data FROM public.tests WHERE mode = 'plantao' AND plantao_data IS NOT NULL LOOP
      IF test_record.plantao_data->'beds' IS NOT NULL THEN
        FOR bed_elem IN SELECT * FROM jsonb_array_elements(test_record.plantao_data->'beds') LOOP
          q_ids := bed_elem->'questionIds';
          SELECT jsonb_agg(q) INTO bed_qs
          FROM jsonb_array_elements(test_record.questions) q
          WHERE (q->>'id')::int IN (SELECT (jsonb_array_elements_text(q_ids))::int);

          IF bed_qs IS NOT NULL AND jsonb_array_length(bed_qs) >= 4 THEN
            INSERT INTO public.bed_case_bank (
              chapter_id,
              chapter_title,
              section_title,
              phenotype_title,
              questions,
              complexity_level,
              times_used
            ) VALUES (
              (bed_elem->>'chapterId')::int,
              COALESCE(bed_elem->>'chapterTitle', 'Capítulo Clínico'),
              bed_elem->>'sectionTitle',
              COALESCE(SUBSTRING(bed_qs->0->>'vignette' FROM 1 FOR 90) || '...', bed_elem->>'chapterTitle'),
              bed_qs,
              'classic',
              1
            );
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Fallback silencioso caso schema de testes seja heterogêneo
  RAISE NOTICE 'Nota: Backfill de leitos anteriores ignorado: %', SQLERRM;
END $$;

