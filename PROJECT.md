# Project: EmergeMed v2 Implementation

## Architecture
Next.js 15 App Router + React 19 + TypeScript + Supabase (PostgreSQL / RLS) + OpenRouter AI.
Core engines in `lib/`: `learning-engine.ts`, `gamification-engine.ts`, `learning-tracks.ts`, `error-pattern-analyzer.ts`.
API endpoints in `app/api/`: `/api/generate-reread-quiz`, `/api/recommendations`, `/api/generate-questions`, `/api/evaluate-prescription`.
Frontend routes in `app/(authenticated)/`: `dashboard/page.tsx`, `capitulos/page.tsx`, `testes/[id]/page.tsx`, `trilhas/page.tsx`, `layout.tsx`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | FSRS 90% Retention & Stability Cap (365d) | Correct FSRS formula, 4-grade mapping, decay, 365d cap | M1 (Done) | ORIGINAL_REQUEST §R1 |
| 2 | Granular Scoring per Chapter | Separate scores per chapter in multi-chapter tests | M1 (Done) | ORIGINAL_REQUEST §R1 |
| 3 | Adverse Evolution Dedup & DB Indexes | Dedup triggers in testes page & create 20260808000003 migration | M2 (Done) | ORIGINAL_REQUEST §R2 |
| 4 | Re-read Verification Quiz UI Modal | Wire 3-MCQ quiz modal in dashboard and capitulos before applying FSRS bonus | M3 (Done) | ORIGINAL_REQUEST §R3 |
| 5 | Top 3 Recommendation Cards | Render remediation, expansion, maintenance cards side-by-side on dashboard | M4 (Done) | ORIGINAL_REQUEST §R4 |
| 6 | Reroll Exclusion in Session | Session tracking `excludedFromSession` and API parameter `exclude` | M4 (Done) | ORIGINAL_REQUEST §R4 |
| 7 | Gamification DB & Engine | Migration 20260808000002_gamification.sql & lib/gamification-engine.ts | M5 | ORIGINAL_REQUEST §R5 |
| 8 | Gamification Sidebar & Dashboard UI | Level titles 1-10, Streak, XP bar, achievement badges, XP rewards | M5 | ORIGINAL_REQUEST §R5 |
| 9 | Prerequisites & Expansion Penalty | Chapter prerequisites array in lib/chapters-data.ts & 85% penalty | M6 | ORIGINAL_REQUEST §R6 |
| 10 | Learning Tracks Roadmap UI | 6 specialty tracks in lib/learning-tracks.ts, /trilhas RPG skill-tree, sidebar link | M6 | ORIGINAL_REQUEST §R6 |
| 11 | Question Bank Schema & AI Reuse | Migration 20260808000000_question_bank.sql & generate-questions 60% reuse | M7 | ORIGINAL_REQUEST §R7 |
| 12 | Error Pattern Detection & Dashboard | Migration 20260808000001_error_patterns.sql, prompt errorTags, error-pattern-analyzer.ts & UI widget | M7 | ORIGINAL_REQUEST §R7 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | FSRS Core Corrections | R1 (FSRS math, 4 grades, 365d cap, granular multi-chapter scores) | none | DONE |
| M2 | Bug Fixes & DB Performance | R2 (Adverse evolution dedup & 20260808000003_performance_indexes.sql) | none | DONE |
| M3 | Re-read Verification Quiz UI | R3 (Frontend 3-MCQ Quiz modal in dashboard/page.tsx & capitulos/page.tsx) | M1 | DONE |
| M4 | Multi-Recommendation Cards & Reroll Exclusion | R4 (Top 3 mode cards on dashboard, session reroll exclude parameter) | M1 | DONE |
| M5 | Visual Gamification System | R5 (20260808000002_gamification.sql, lib/gamification-engine.ts, sidebar & dashboard UI) | none | PLANNED |
| M6 | Prerequisites & Learning Tracks | R6 (prerequisites penalty in learning-engine, lib/learning-tracks.ts, /trilhas UI, sidebar link) | M4 | PLANNED |
| M7 | Question Bank & Transversal Error Pattern Detection | R7 (20260808000000_question_bank.sql, 20260808000001_error_patterns.sql, prompt errorTags, error-pattern-analyzer.ts, UI widget) | none | PLANNED |

## Interface Contracts
### Learning Engine ↔ Dashboard
- `buildReadinessSnapshot(params)` returns `{ recommendations: Array<Recommendation>, recommendation: Recommendation }`
- `calculateFSRSRereadWithQuiz(currentStat, quizCorrect, quizTotal)` returns updated FSRS stats.
### Gamification Engine ↔ UI
- `calculateXP(...)`, `getUserGamificationStats(...)`, `checkAchievements(...)`
### Question Bank ↔ generate-questions API
- `POST /api/generate-questions` selects up to 60% banked questions, generates rest via AI, inserts new questions to bank.
### Error Pattern Analyzer ↔ Dashboard
- `POST /api/evaluate-prescription` returns evaluation including `errorTags`.
- `lib/error-pattern-analyzer.ts` aggregates error tags by competency (`farmacologia`, `diagnostico`, `conduta`, `ventilacao`, `prescricao_geral`).

## Code Layout
- `lib/learning-engine.ts`: FSRS calculation, readiness engine snapshot, multi-recommendation
- `lib/gamification-engine.ts`: XP, levels, streaks, badges calculation
- `lib/learning-tracks.ts`: Track definitions
- `lib/error-pattern-analyzer.ts`: Aggregation of error tags
- `lib/ai/prompts.ts`: AI prompt definitions
- `lib/ai/openrouter.ts`: AI evaluation models and interfaces
- `app/api/`: Next.js API routes
- `app/(authenticated)/`: Protected pages (`dashboard`, `capitulos`, `testes/[id]`, `trilhas`)
- `supabase/migrations/`: Database SQL migrations
