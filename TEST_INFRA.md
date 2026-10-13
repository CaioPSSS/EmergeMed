# E2E Test Infra: EmergeMed Modo Plantão, Quiz & Batch Restructuring

## Test Philosophy
- **Opaque-box & Requirement-driven**: Tests derive strictly from user requirements in `ORIGINAL_REQUEST.md`, without coupling to implementation internals.
- **Methodology**: Systematic 4-Tier design (Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing).

## Feature Inventory & Test Coverage
| # | Feature | Requirement Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (E2E Scenario) |
|---|---------|-------------------|:-----------------:|:-----------------:|:-----------------:|:---------------------:|
| 1 | F1.1 Vignette Anti-Spoiler | ORIGINAL_REQUEST §R1 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 2 | F1.2 2-Stage Bed Prescriptions | ORIGINAL_REQUEST §R1 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 3 | F1.3 2 MCQs per Bed | ORIGINAL_REQUEST §R1 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 4 | F1.4 Bed Navigation & Evaluation | ORIGINAL_REQUEST §R1 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 5 | F2.1 10-MCQ Post-Chapter Test | ORIGINAL_REQUEST §R2 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 6 | F2.2 60/40 Difficulty Mix | ORIGINAL_REQUEST §R2 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 7 | F2.3 Balanced MCQ Subformats | ORIGINAL_REQUEST §R2 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 8 | F2.4 Priority Bank Consumption | ORIGINAL_REQUEST §R2 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 9 | F3.1 User Question History | ORIGINAL_REQUEST §R3 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 10 | F3.2 Anti-Repetition Queue Algorithm | ORIGINAL_REQUEST §R3 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 11 | F3.3 Client Scoring & History Sync | ORIGINAL_REQUEST §R3 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 12 | F4.1 OpenRouter Batch Client | ORIGINAL_REQUEST §R4 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 13 | F4.2 Candidate Prioritization Tree | ORIGINAL_REQUEST §R4 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 14 | F4.3 Saturation Control | ORIGINAL_REQUEST §R4 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 15 | F4.4 Medical Ingestion Validation | ORIGINAL_REQUEST §R4 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 16 | F5.1 Budget Ledger Table | ORIGINAL_REQUEST §R5 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 17 | F5.2 Hard Budget Caps | ORIGINAL_REQUEST §R5 | ≥5 cases | ≥5 cases | ✓ | ✓ |
| 18 | F5.3 CLI & NPM Pipeline Script | ORIGINAL_REQUEST §R5 | ≥5 cases | ≥5 cases | ✓ | ✓ |

## Test Architecture
- **Test Runner**: `scripts/run-e2e-tests.ts` executed via `npx tsx scripts/run-e2e-tests.ts`.
- **Pass/Fail Semantics**: All test suites must return exit code 0. Zero uncaught errors, strict assertion validations for data integrity, budget math, and anti-repetition rules.
- **Test Suites Structure**:
  - `tests/e2e/tier1-features/`: Unit & functional tests verifying every feature in isolation.
  - `tests/e2e/tier2-boundaries/`: Edge cases, bank empty/overflow, zero budget, monthly cap breach, missing options, mojibake inputs.
  - `tests/e2e/tier3-pairwise/`: Cross-feature combinations (e.g. bed generation consuming anti-repetition queue; batch ingestion feeding bed cases; ledger capping mid-batch).
  - `tests/e2e/tier4-scenarios/`: Full user journeys (e.g., Doctor reads chapter -> 10-MCQ quiz generated -> answers with 3 errors -> starts Modo Plantão -> 2-stage bed + 2 MCQs with remediation priority -> nightly batch saturates chapter -> ledger tracks exact spend under caps).

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥90 tests (≥5 per feature).
- **Tier 2 (Boundary & Corner)**: ≥90 tests (≥5 per feature).
- **Tier 3 (Cross-Feature Combinations)**: ≥18 integration tests.
- **Tier 4 (Real-World Scenarios)**: ≥9 comprehensive end-to-end scenarios.
- **Total Minimum**: ≥207 tests.
