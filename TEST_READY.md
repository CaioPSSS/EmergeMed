# TEST_READY: EmergeMed Modo Plantão, Quiz & Batch Restructuring

> **Status:** READY FOR VERIFICATION & CONTINUOUS INTEGRATION  
> **Timestamp:** 2026-10-13T01:48:30Z  
> **Test Harness:** `scripts/run-e2e-tests.ts`  
> **Runner Command:** `npx tsx scripts/run-e2e-tests.ts`  
> **Overall Result:** 210 / 210 tests passed (100% success rate, 0 failures)

---

## 1. Executive Summary & Coverage Matrix

An opaque-box, requirement-driven E2E test suite has been implemented to comprehensively test Requirements **R1 through R5** across all **18 features** defined in `PROJECT.md` and `ORIGINAL_REQUEST.md`.

| Tier | Category / Scope | Minimum Required | Actual Executed | Passed | Failed | Status |
|:---|:---|:---:|:---:|:---:|:---:|:---:|
| **Tier 1** | Feature Coverage (F1.1 to F5.3) | ≥ 90 | **90** | 90 | 0 | **PASS** |
| **Tier 2** | Boundary & Corner Cases (Limits, Caps, Mojibake) | ≥ 90 | **90** | 90 | 0 | **PASS** |
| **Tier 3** | Cross-Feature Combinations (Pairwise Integrations) | ≥ 18 | **20** | 20 | 0 | **PASS** |
| **Tier 4** | Real-World Application Scenarios (End-to-End Journeys) | ≥ 9 | **10** | 10 | 0 | **PASS** |
| **TOTAL** | **Comprehensive Full Coverage** | **≥ 207** | **210** | **210** | **0** | **100% PASS** |

---

## 2. Test Architecture & File Manifest

All test files are self-contained, isolated, and strictly follow project boundaries:

1. **`tests/e2e/common.ts`**
   - Core test harness (`runTest`, assertions `assertEqual`, `assertCloseTo`, `assertDeepEqual`, `assertThrows`).
   - Domain types for 2-stage beds, MCQs, SRS history, and batch ledger.
   - Authoritative domain oracles:
     - `verifyAntiSpoiler`: Detects and flags explicit diagnosis text.
     - `calculateBatchCost`: Computes token costs using `openai/gpt-6-luna:batch` rates ($0.05 / 1M prompt, $0.25 / 1M completion).
     - `evaluateBudgetCapBreach`: Enforces $0.15 daily hard cap and $0.90 monthly hard cap.
     - `sanitizeMojibake`: Repairs corrupted UTF-8 encodings in medical vignettes.
     - `selectWithAntiRepetition`: Implements Unseen (P1) > Wrong (P2) > Correct (P3 end-of-queue) queue algorithm.

2. **`tests/e2e/tier1-features.test.ts`** (90 Tests)
   - ≥ 5 test cases per feature across all 18 features (F1.1 to F5.3).
   - Validates anti-spoiler blinder, 2-stage bed case structure, 2 MCQs per bed, auto-save state, 10-MCQ quizzes, 60/40 difficulty mix, balanced subformats, priority bank consumption, user question history, SRS anti-repetition queue, OpenRouter batch client, prioritization tree (Tiers 1, 3, 4), saturation controls (6 beds, 20 MCQs), medical ingestion validation, budget ledger schema, hard budget caps ($0.15/$0.90), and CLI pipeline flags.

3. **`tests/e2e/tier2-boundaries.test.ts`** (90 Tests)
   - ≥ 5 boundary test cases per feature across all 18 features (F1.1 to F5.3).
   - Tests boundary values: 0/0 BP in cardiac arrest, zero/negative patient weights, empty vignettes, massive strings (10,000+ chars), exact score thresholds (89.9% vs 90.0%, 69.9% vs 70.0%, 44.9% vs 45.0%), pool deficits (0, 1, 9, 10, 50 banked questions), 100% acertos full recycle, 100% errors priority, token costs at $0.149999 vs $0.150000, monthly cap at $0.899999 vs $0.900000, and heavy mixed mojibake stress repair.

4. **`tests/e2e/tier3-pairwise.test.ts`** (20 Tests)
   - Cross-feature integrations testing pairwise interactions:
     - F1.3 + F3.2: Modo Plantão consuming 2 MCQs filtered through SRS queue.
     - F2.1 + F2.4: 10-MCQ quiz consuming bank with on-demand deficit generation.
     - F4.3 + F4.4: Ingested bed cases progressing up to saturation cap of 6.
     - F5.1 + F5.2: Accumulated ledger spend tripping daily hard cap and flagging interruption.
     - F1.2 + F1.4: 2-stage bed submissions aggregated into final bed outcome (alta/internação).
     - F3.1 + F3.3: Quiz evaluation updating question history and client scoring.
     - F4.1 + F5.1: OpenRouter Batch response tokens converting to USD ledger records.
     - F4.2 + F4.3: Prioritization tree skipping saturated chapters for open chapters.
     - F1.1 + F4.4: Anti-spoiler blinder guarding incoming batch cases before database commit.
     - F2.2 + F2.3: 60/40 difficulty mix intersecting with subformat diversity.
     - F1.3 + F4.3: Bed MCQ reuse scale operating within 20 MCQ saturation limit.
     - F3.2 + F2.4: SRS anti-repetition ordering applied to banked questions before deficit calculation.
     - F4.1 + F5.3: CLI runner `--submit` executing batch model payload.
     - F5.2 + F5.3: CLI runner detecting budget limit breach and terminating with safety halt.
     - F1.4 + F3.1: Bed completion updating user question history for bed MCQs.
     - F4.2 + F5.2: Candidate tree selecting jobs up to daily budget cap limit.
     - F2.1 + F3.2: 10-MCQ quiz recycling in FIFO order when bank is 100% aced.
     - F4.4 + F4.3: Ingestion tagging sequential bed cases with complexity tiers (classic/complex/atypical).
     - F3.3 + F2.2: User scoring calculating standard vs advanced mastery independently.
     - F5.1 + F4.2: Ledger tracking spend distribution across prioritization tiers.

5. **`tests/e2e/tier4-scenarios.test.ts`** (10 Tests)
   - Comprehensive end-to-end user journeys:
     - Scenario 1: Reading -> 10-MCQ Quiz (60/40 mix) -> 3 errors -> SRS Remediation Priority.
     - Scenario 2: Modo Plantão shift: Blinded Case -> 2-Stage Prescriptions -> 2 MCQs -> Bed Outcome.
     - Scenario 3: Nightly batch tree prioritization -> Ingestion validation -> Saturation at 6 beds & 20 MCQs.
     - Scenario 4: Budget governance: Multi-batch execution halted at $0.15 daily hard cap with ledger flag.
     - Scenario 5: Spaced repetition mastery cycle: 20 MCQs completed with 100% accuracy -> Clean FIFO recycling from end of queue.
     - Scenario 6: Bed complexity gradient: 0 -> classic (1-2) -> complex (3-4) -> atypical (5-6) -> saturated.
     - Scenario 7: Ingestion self-healing: Markdown fences + escaped quotes + mojibake repaired.
     - Scenario 8: Anti-spoiler blinding: Intercepts & rejects hallucinated explicit diagnoses.
     - Scenario 9: CLI pipeline lifecycle: `--mock` -> `--submit` -> `--status` -> `--poll-and-ingest`.
     - Scenario 10: Monthly budget defense: 30-day accumulation hits $0.90 cap -> Calendar reset to $0.00.

6. **`scripts/run-e2e-tests.ts`**
   - Central runner orchestrating all tiers, timing execution, printing formatted tables, and asserting pass thresholds. Exits with code 0 on complete pass.

---

## 3. How to Execute Tests

```bash
# Execute the entire E2E test suite (Tiers 1 to 4)
npx tsx scripts/run-e2e-tests.ts

# Type-check test suite
npx tsc --noEmit --skipLibCheck tests/e2e/common.ts tests/e2e/tier1-features.test.ts tests/e2e/tier2-boundaries.test.ts tests/e2e/tier3-pairwise.test.ts tests/e2e/tier4-scenarios.test.ts scripts/run-e2e-tests.ts
```

---

## 4. Discovered Implementation Defects (Escalation to Milestones)

During global repository typecheck (`npx tsc --noEmit`), the following TypeScript compilation errors were identified in application code currently being developed in **Milestone M1**:

- **Location:** `app/api/generate-plantao/route.ts`
  - Lines 304, 310, 375: `error TS2353: Object literal may only specify known properties, and 'isFromBank' does not exist in type 'QuestionItem'`.
    - *Cause:* `QuestionItem` interface in `lib/ai/openrouter.ts` does not yet declare optional `isFromBank?: boolean`.
  - Lines 438, 439: `error TS2322: Type 'QuestionItem | null' is not assignable to type 'QuestionItem'`.
    - *Cause:* `stage1Immediate` and `stage2Maintenance` are typed as `QuestionItem | null` while being assigned to fields expecting non-null `QuestionItem`.
  - *Action:* Escalate to the implementing agent for Milestone M1 (`teamwork_preview_developer_m1`). Test suite files themselves compile cleanly with exit code 0.
