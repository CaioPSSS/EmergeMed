# Project: EmergeMed Modo Plantão, Quiz & Batch Restructuring

## Architecture
- **Modo Plantão**: Continuous clinical case per bed centered strictly on 2 therapeutic decision stages:
  - Stage 1 (`prescription_immediate`): acute complaint, vitals, patientWeight, NO explicit diagnosis in vignette.
  - Stage 2 (`prescription_complete` or `ventilator`): clinical evolution, laboratory/imaging results, maintenance or vasoactive/ventilatory adjustments.
  - Bed MCQ complement: 2 multiple choice questions per bed from the same chapter/theme from `question_bank`.
- **Post-Chapter Test System**:
  - Exactly 10 MCQs on chapter reading or rereading completion.
  - Difficulty mix: 60% Standard (short emergency cases, essential UPA conduct), 40% Advanced (dosages, diagnostic pitfalls, critical adverse effects, contraindications).
  - Balanced subformats: case conduct, direct content / pathophysiology, objective diagnostic criteria.
  - Prioritized consumption from pre-generated `question_bank` with AI on-demand fallback when inventory is low.
- **Anti-Repetition Spaced Repetition Queue**:
  - Tracks `(user_id, question_id)` in `public.user_question_history`.
  - Queue ordering: Unseen / Inéditas (P1) > Wrong / Remediação (P2) > Correct / Fim da Fila (P3).
  - Correct questions only recycle after all questions of the topic have been answered and correct.
- **Nightly OpenRouter Batch Pipeline**:
  - Model `openai/gpt-6-luna:batch` ($0.05 / 1M prompt, $0.25 / 1M completion).
  - Prioritization tree: Tier 1 (`study_queue` position ASC) > Tier 3 (Recommender Top 3 per mode) > Tier 4 (Clinical importance & epidemiological frequency).
  - Saturation targets: `bed_case_bank` up to 6 cases (1-2 classic, 3-4 complex, 5-6 atypical; plantão reuse scale 35-90%) & `question_bank` up to 20 MCQs.
  - Ingestion validation: Medical JSON parsing, mojibake/UTF-8 sanitization, numeric field integrity, vignette anti-spoiler check, 2-stage bed case check, 5-option MCQ check.
- **Budget Governance**:
  - `public.batch_generation_ledger` table tracks daily and monthly spend.
  - Hard caps: $0.15 / day, $0.90 / month. Automatic execution cutoff before submission or upon limit breach.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1.1 Vignette Anti-Spoiler | Bed vignettes present clinical picture without explicit diagnosis text | M1 | ORIGINAL_REQUEST R1 |
| 2 | F1.2 2-Stage Bed Prescriptions | Case consists of Stage 1 (Immediate) and Stage 2 (Maintenance/Ventilation) | M1 | ORIGINAL_REQUEST R1 |
| 3 | F1.3 2 MCQs per Bed | Each bed includes 2 random theme-matched MCQs from question_bank or on-demand | M1 | ORIGINAL_REQUEST R1 |
| 4 | F1.4 Bed Navigation & Evaluation | Progress auto-save across beds/stages, scoring, and UI result mapping | M1 | ORIGINAL_REQUEST R1 |
| 5 | F2.1 10-MCQ Post-Chapter Test | Exactly 10 MCQs generated upon reading or rereading chapter | M2 | ORIGINAL_REQUEST R2 |
| 6 | F2.2 60/40 Difficulty Mix | 60% Standard difficulty, 40% Advanced (dosages, pitfalls, adverse effects) | M2 | ORIGINAL_REQUEST R2 |
| 7 | F2.3 Balanced MCQ Subformats | Balanced distribution of case conduct, direct content, diagnostic criteria | M2 | ORIGINAL_REQUEST R2 |
| 8 | F2.4 Priority Bank Consumption | 100% bank consumption if available; on-demand AI fallback for deficits | M2 | ORIGINAL_REQUEST R2 |
| 9 | F3.1 User Question History | `user_question_history` table tracking user responses per question | M2 | ORIGINAL_REQUEST R3 |
| 10 | F3.2 Anti-Repetition Queue Algorithm | Queue prioritizing Unseen > Wrong > Correct (end of queue) | M2 | ORIGINAL_REQUEST R3 |
| 11 | F3.3 Client Scoring & History Sync | Test evaluation updates question history and bank statistics | M2 | ORIGINAL_REQUEST R3 |
| 12 | F4.1 OpenRouter Batch Client | Wrapper for OpenRouter Batch API with `openai/gpt-6-luna:batch` | M3 | ORIGINAL_REQUEST R4 |
| 13 | F4.2 Candidate Prioritization Tree | Ordering: Tier 1 (study queue) > Tier 3 (recommender top 3) > Tier 4 (epidemiology) | M3 | ORIGINAL_REQUEST R4 |
| 14 | F4.3 Saturation Control | 6 beds per chapter (classic/complex/atypical) & 20 MCQs; updated reuse scale | M3 | ORIGINAL_REQUEST R4 |
| 15 | F4.4 Medical Ingestion Validation | JSON parsing, mojibake normalization, diagnosis exclusion, schema validation | M3 | ORIGINAL_REQUEST R4 |
| 16 | F5.1 Budget Ledger Table | `batch_generation_ledger` recording costs, accumulated totals, and flags | M3 | ORIGINAL_REQUEST R5 |
| 17 | F5.2 Hard Budget Caps | Hard caps: $0.15/day, $0.90/month with auto-cutoff | M3 | ORIGINAL_REQUEST R5 |
| 18 | F5.3 CLI & NPM Pipeline Script | `nightly-batch-pipeline.ts` with `--submit`, `--poll-and-ingest`, `--status`, `--mock` | M3 | ORIGINAL_REQUEST R5 |
| 19 | F0.1 E2E Test Suite | Comprehensive opaque-box test suite for Tiers 1-4 | M0 (Test Track) | Orchestrator Spec |
| 20 | F9.1 Final Verification & Hardening | Pass 100% E2E tests, Adversarial Hardening (Tier 5), build & typecheck exit 0 | M4 | Acceptance Criteria |
| 21 | F6.1 Mobile & Tablet Responsiveness | Drawer sidebar at ≤1024px, horizontal bed tabs, touch-first action bar | M5 | User Request |
| 22 | F7.1 Voice Dictation & Fast Formatting | Web Speech API streaming + 1.8s Xiaomi MiMo V2.6 Flash phonetic normalizer | M6 | User Request |
| 23 | F7.2 Unassisted Free Prescription | Complete removal of intrusive quick conduct chips, pure clinical reasoning | M6 | User Request |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | E2E Testing Suite | Test infrastructure and Tiers 1-4 test cases for R1-R5 | none | DONE |
| M1 | Modo Plantão Bed Restructuring | R1: 2-stage prescriptions, anti-spoiler vignette, 2 MCQs per bed | none | DONE |
| M2 | Post-Chapter Quiz & Anti-Repetition SRS | R2 & R3: 10 MCQs, 60/40 mix, `user_question_history`, SRS queue | none | DONE |
| M3 | OpenRouter Batch Pipeline & Budget Ledger | R4 & R5: Batch API, Tiers 1/3/4, saturation, $0.15/$0.90 caps, CLI | none | DONE |
| M4 | Final Integration, E2E Pass & Hardening | Pass 100% E2E tests, Tier 5 adversarial tests, auditor verify, build exit 0 | M0, M1, M2, M3 | DONE |
| M5 | Mobile & Tablet Responsiveness | Breakpoint 1024px, drawer sidebar, horizontal bed tabs, bottom action bar | none | DONE |
| M6 | Voice Dictation & Fast AI Formatting | Web Speech API, Xiaomi MiMo V2.6 (~1.8s), phonetic dictionary, zero dose changes | none | DONE |


## Interface Contracts

### M1 (Modo Plantão) ↔ M2 (MCQ Bank)
- Each plantão bed requests 2 MCQs for `chapterId`.
- Function: `selectMCQsForBed(chapterId: string, count: number = 2): Promise<Question[]>` (or direct query to `question_bank`).
- Each question has `{ id, chapterId, type: 'multiple_choice', vignette, options: string[], correctOption: number, explanation: string, bankQuestionId?: string }`.

### M2 (Quiz Engine) ↔ `question_bank` & `user_question_history`
- Schema `question_bank`:
  - `id`: UUID PRIMARY KEY
  - `chapter_id`: TEXT NOT NULL
  - `question_type`: TEXT ('multiple_choice')
  - `difficulty_tier`: TEXT ('standard' | 'advanced')
  - `question_subformat`: TEXT ('case_conduct' | 'direct_content' | 'diagnostic_criteria')
  - `vignette`: TEXT
  - `options`: JSONB
  - `correct_option`: INT
  - `explanation`: TEXT
- Schema `user_question_history`:
  - `id`: UUID PRIMARY KEY
  - `user_id`: UUID NOT NULL
  - `question_id`: UUID NOT NULL REFERENCES question_bank(id)
  - `chapter_id`: TEXT NOT NULL
  - `last_is_correct`: BOOLEAN NOT NULL
  - `times_answered`: INT DEFAULT 1
  - `times_correct`: INT DEFAULT 0
  - `last_answered_at`: TIMESTAMPTZ DEFAULT NOW()
  - UNIQUE(user_id, question_id)
- Function in `lib/mcq-queue-service.ts`:
  - `selectMCQsWithAntiRepetition(userId: string, chapterId: string, totalCount?: number): Promise<{ questions: Question[]; source: 'bank' | 'hybrid' | 'generated'; deficit: { standard: number; advanced: number } }>`

### M3 (Batch Pipeline) ↔ `batch_generation_ledger` & Bank Tables
- Schema `batch_generation_ledger`:
  - `id`: UUID PRIMARY KEY
  - `batch_id`: TEXT UNIQUE NOT NULL
  - `submission_timestamp`: TIMESTAMPTZ NOT NULL
  - `completion_timestamp`: TIMESTAMPTZ
  - `model`: TEXT DEFAULT 'openai/gpt-6-luna:batch'
  - `prompt_tokens`: INT DEFAULT 0
  - `completion_tokens`: INT DEFAULT 0
  - `cost_usd`: NUMERIC(10, 6) DEFAULT 0
  - `daily_accumulated_usd`: NUMERIC(10, 6) DEFAULT 0
  - `monthly_accumulated_usd`: NUMERIC(10, 6) DEFAULT 0
  - `hard_cap_interrupted`: BOOLEAN DEFAULT FALSE
  - `items_requested`: INT DEFAULT 0
  - `items_ingested`: INT DEFAULT 0
  - `items_failed`: INT DEFAULT 0
  - `status`: TEXT ('submitted' | 'completed' | 'failed' | 'capped')
- Caps:
  - `DAILY_HARD_CAP_USD = 0.15`
  - `MONTHLY_HARD_CAP_USD = 0.90`
- Cost formula for `openai/gpt-6-luna:batch`:
  - `cost = (prompt_tokens / 1_000_000) * 0.05 + (completion_tokens / 1_000_000) * 0.25`

## Code Layout
- `supabase/migrations/`: Database migrations
  - `20261015000000_bed_case_bank.sql` (Bed case repository for plantão reuse)
  - `20261016000000_mcq_anti_repetition_queue.sql` (User question history and anti-repetition queue)
  - `20261016000001_batch_generation_ledger.sql` (Ledger for OpenRouter Batch API budget tracking)
- `lib/`: Domain business logic and services
  - `lib/ai/model-router.ts` (Model profiles: CLINICAL_CORE, CLINICAL_EVALUATION, CLINICAL_FEEDBACK, PRESCRIPTION_FAST_FORMAT)
  - `lib/ai/prompts.ts` (Plantão 2-stage prompts, 60/40 MCQ difficulty prompts, phonetic medical STT dictionary)
  - `lib/ai/openrouter.ts` (Cascade executor, generation & evaluation functions, formatPrescriptionWithAI)
  - `lib/ai/openrouter-batch.ts` (Batch API client for openai/gpt-6-luna:batch)
  - `lib/mcq-queue-service.ts` (Anti-repetition queue service: Unseen > Wrong > Correct)
  - `lib/spaced-repetition.ts` (PlantaoBed sequence definition & FSRS calculations)
- `app/api/`: Next.js Route handlers
  - `app/api/format-prescription/route.ts` (Ultra-fast voice dictation normalization with Xiaomi MiMo V2.6)
  - `app/api/generate-plantao/route.ts` (2-stage bed + 2 MCQs, hybrid bed_case_bank reuse)
  - `app/api/generate-questions/route.ts` (10-MCQ post-chapter test with 60/40 difficulty mix)
  - `app/api/evaluate-bed/route.ts` (Evaluation of 2-stage continuous beds)
- `app/(authenticated)/`: UI pages
  - `app/(authenticated)/testes/[id]/page.tsx` (Test execution, voice dictation, anti-spoiler, mobile tabs, auto-save)
  - `app/(authenticated)/testes/[id]/resultado/page.tsx` (Result cards, step-by-step scoring, feedback)
- `components/`: UI components
  - `components/layout/Sidebar.tsx` (Responsive 1024px drawer sidebar)
  - `components/chapter/ChapterReaderModal.tsx` (10-MCQ post-reading trigger)
  - `components/dashboard/StudyQueueWidget.tsx` (10-MCQ post-rereading trigger)
- `scripts/`: CLI pipelines and test runners
  - `scripts/nightly-batch-pipeline.ts` (Nightly batch script with mock & live support)
  - `scripts/run-e2e-tests.ts` (Opaque-box E2E test runner for Tiers 1-4)

