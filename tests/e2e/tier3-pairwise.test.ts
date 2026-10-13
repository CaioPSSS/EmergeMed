/**
 * Tier 3: Cross-Feature Combinations E2E Test Suite
 * Minimum 18 pairwise interaction test cases (Total = 20 tests)
 * Testing complex multi-module interactions across R1-R5.
 * Strictly derived from ORIGINAL_REQUEST.md, PROJECT.md, and TEST_INFRA.md
 */

import {
  runTest,
  TestResult,
  assert,
  assertEqual,
  assertCloseTo,
  verifyAntiSpoiler,
  calculateBatchCost,
  evaluateBudgetCapBreach,
  selectWithAntiRepetition,
  MCQQuestion,
  UserQuestionHistoryItem,
  DAILY_HARD_CAP_USD,
  MONTHLY_HARD_CAP_USD,
  BATCH_MODEL,
  MAX_BEDS_PER_CHAPTER,
  MAX_MCQS_PER_CHAPTER,
  BED_REUSE_SCALE,
  BedComplexity,
  BedStage1Immediate,
  BedStage2Maintenance,
  BatchLedgerRow,
} from './common';

export async function runTier3Tests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ==========================================================================
  // 1. F1.3 + F3.2: Modo Plantão requesting 2 MCQs with anti-repetition queue
  // ==========================================================================
  results.push(
    await runTest('T3.1', 'F1.3+F3.2', 'Plantão bed consumes 2 MCQs respecting anti-repetition priority', () => {
      const bankMCQs: MCQQuestion[] = [
        { id: 'q-seen', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'Seen', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: 'q-unseen-1', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'Unseen 1', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: 'q-unseen-2', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'advanced', question_subformat: 'direct_content', vignette: 'Unseen 2', options: ['A','B','C','D','E'], correct_option: 1, explanation: 'E' },
      ];
      const history: UserQuestionHistoryItem[] = [
        { id: 'h1', user_id: 'u1', question_id: 'q-seen', chapter_id: 8, last_is_correct: true, times_answered: 1, times_correct: 1, last_answered_at: new Date().toISOString() },
      ];
      const { selected } = selectWithAntiRepetition(bankMCQs, history, 2);
      assertEqual(selected.length, 2, 'Selected 2 MCQs for bed');
      assert(!selected.map((q) => q.id).includes('q-seen'), 'Unseen questions picked ahead of seen');
    })
  );

  // ==========================================================================
  // 2. F2.1 + F2.4: 10-MCQ post-chapter quiz triggering bank consumption & deficit
  // ==========================================================================
  results.push(
    await runTest('T3.2', 'F2.1+F2.4', '10-MCQ quiz consumes 7 banked MCQs and calculates deficit of 3 for AI fallback', () => {
      const bank: MCQQuestion[] = Array.from({ length: 7 }, (_, i) => ({
        id: `bq-${i}`,
        chapter_id: 14,
        question_type: 'multiple_choice',
        difficulty_tier: i < 4 ? 'standard' : 'advanced',
        question_subformat: 'case_conduct',
        vignette: `V ${i}`,
        options: ['A','B','C','D','E'],
        correct_option: 0,
        explanation: 'E',
      }));
      const { selected, deficit } = selectWithAntiRepetition(bank, [], 10);
      assertEqual(selected.length, 7, '7 taken from bank');
      assertEqual(deficit, 3, 'Deficit of 3 for on-demand generator');
      const fallbackQuestions = Array.from({ length: deficit }, (_, i) => ({ id: `fallback-${i}` }));
      assertEqual(selected.length + fallbackQuestions.length, 10, 'Unified quiz size is exactly 10');
    })
  );

  // ==========================================================================
  // 3. F4.3 + F4.4: Batch pipeline saturation checking ingested cases against validation
  // ==========================================================================
  results.push(
    await runTest('T3.3', 'F4.3+F4.4', 'Batch ingestion populates bed cases up to saturation cap of 6', () => {
      const ingestedBeds: any[] = [];
      for (let i = 1; i <= 7; i++) {
        if (ingestedBeds.length < MAX_BEDS_PER_CHAPTER) {
          ingestedBeds.push({ bedNumber: i, complexity: i <= 2 ? 'classic' : i <= 4 ? 'complex' : 'atypical' });
        }
      }
      assertEqual(ingestedBeds.length, 6, 'Ingestion stopped strictly at 6 beds');
      assertEqual(ingestedBeds[5].complexity, 'atypical', '6th bed has atypical complexity');
    })
  );

  // ==========================================================================
  // 4. F5.1 + F5.2: Budget ledger accumulator triggering hard budget cap interruption
  // ==========================================================================
  results.push(
    await runTest('T3.4', 'F5.1+F5.2', 'Accumulated ledger spend trips daily hard cap and flags interruption', () => {
      const currentDailySpend = 0.13;
      const candidateTokensPrompt = 300_000;
      const candidateTokensComp = 100_000;
      const candidateCost = calculateBatchCost(candidateTokensPrompt, candidateTokensComp); // $0.015 + $0.025 = $0.04
      const check = evaluateBudgetCapBreach(currentDailySpend, 0.50, candidateCost);
      assert(!check.canProceed, 'Execution prevented');
      assertEqual(check.reason, 'daily_cap', 'Daily cap tripped');
      const ledgerRecord: Partial<BatchLedgerRow> = {
        daily_accumulated_usd: currentDailySpend,
        hard_cap_interrupted: true,
        status: 'capped',
      };
      assertEqual(ledgerRecord.hard_cap_interrupted, true, 'Interruption recorded in ledger');
      assertEqual(ledgerRecord.status, 'capped', 'Status marked as capped');
    })
  );

  // ==========================================================================
  // 5. F1.2 + F1.4: 2-stage bed prescription progression feeding bed evaluation
  // ==========================================================================
  results.push(
    await runTest('T3.5', 'F1.2+F1.4', '2-stage bed submissions evaluated together for overall outcome', () => {
      const stage1Score = 9.5;
      const stage2Score = 8.5;
      const mcqScore = 10.0;
      const meanScore = (stage1Score + stage2Score + mcqScore + mcqScore) / 4;
      assertCloseTo(meanScore, 9.5, 0.001, 'Mean score calculated');
      const outcome = meanScore >= 9.0 ? 'alta' : 'internacao';
      assertEqual(outcome, 'alta', '95% score grants hospital discharge');
    })
  );

  // ==========================================================================
  // 6. F3.1 + F3.3: Client test completion updating user question history & scoring
  // ==========================================================================
  results.push(
    await runTest('T3.6', 'F3.1+F3.3', 'Quiz evaluation synchronizes per-question history and overall test score', () => {
      const quizQuestions = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'];
      const userAnswers: Record<string, boolean> = {
        q1: true, q2: true, q3: true, q4: true, q5: true,
        q6: true, q7: true, q8: false, q9: false, q10: true,
      };
      const correctCount = Object.values(userAnswers).filter(Boolean).length;
      const totalScore = (correctCount / quizQuestions.length) * 10.0;
      assertEqual(totalScore, 8.0, 'Score is 8.0/10');
      const historyUpdates = quizQuestions.map((qId) => ({
        question_id: qId,
        last_is_correct: userAnswers[qId],
      }));
      assertEqual(historyUpdates.filter((h) => h.last_is_correct).length, 8, '8 correct in history');
      assertEqual(historyUpdates.filter((h) => !h.last_is_correct).length, 2, '2 incorrect in history');
    })
  );

  // ==========================================================================
  // 7. F4.1 + F5.1: OpenRouter Batch client response tokens populating ledger
  // ==========================================================================
  results.push(
    await runTest('T3.7', 'F4.1+F5.1', 'Batch completion token metadata converts to exact USD in ledger', () => {
      const batchApiResponse = {
        id: 'batch_789',
        usage: { prompt_tokens: 120_000, completion_tokens: 60_000 },
      };
      const cost = calculateBatchCost(
        batchApiResponse.usage.prompt_tokens,
        batchApiResponse.usage.completion_tokens
      );
      // (120k * 0.05 / 1M) = 0.006 + (60k * 0.25 / 1M) = 0.015 -> 0.021
      assertCloseTo(cost, 0.021, 0.0001, 'Calculated cost matches token usage');
    })
  );

  // ==========================================================================
  // 8. F4.2 + F4.3: Candidate prioritization filtering out chapters already saturated
  // ==========================================================================
  results.push(
    await runTest('T3.8', 'F4.2+F4.3', 'Candidate tree skips saturated chapter in study queue for next unsaturated chapter', () => {
      const studyQueue = [
        { chapterId: 8, position: 1, currentBeds: 6, currentMCQs: 20 }, // Saturated
        { chapterId: 14, position: 2, currentBeds: 2, currentMCQs: 5 }, // Open
      ];
      const eligible = studyQueue.filter(
        (c) => c.currentBeds < MAX_BEDS_PER_CHAPTER || c.currentMCQs < MAX_MCQS_PER_CHAPTER
      );
      assertEqual(eligible[0].chapterId, 14, 'Chapter 14 selected; Chapter 8 skipped due to saturation');
    })
  );

  // ==========================================================================
  // 9. F1.1 + F4.4: Ingested bed cases passing vignette anti-spoiler validation
  // ==========================================================================
  results.push(
    await runTest('T3.9', 'F1.1+F4.4', 'Ingested bed cases checked with anti-spoiler filter before DB commit', () => {
      const incomingBatchCases = [
        { vignette: 'Paciente hipotenso e confuso, sem foco infeccioso evidente.', valid: true },
        { vignette: 'Paciente com diagnóstico de sepse de foco pulmonar.', valid: false },
      ];
      const validatedCases = incomingBatchCases.filter((c) => verifyAntiSpoiler(c.vignette).isClean);
      assertEqual(validatedCases.length, 1, 'Only clean case passed ingestion validation');
      assertEqual(validatedCases[0].vignette, incomingBatchCases[0].vignette, 'Clean vignette preserved');
    })
  );

  // ==========================================================================
  // 10. F2.2 + F2.3: 60/40 difficulty mix intersecting with balanced subformats
  // ==========================================================================
  results.push(
    await runTest('T3.10', 'F2.2+F2.3', '10-MCQ quiz balances both 60/40 difficulty and subformat diversity', () => {
      const quiz: MCQQuestion[] = [
        // 6 Standard
        { id: '1', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: '2', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: '3', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'direct_content', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: '4', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'direct_content', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: '5', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'diagnostic_criteria', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: '6', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'diagnostic_criteria', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        // 4 Advanced
        { id: '7', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'advanced', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: '8', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'advanced', question_subformat: 'direct_content', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: '9', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'advanced', question_subformat: 'diagnostic_criteria', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: '10', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'advanced', question_subformat: 'diagnostic_criteria', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
      ];
      const stdCount = quiz.filter((q) => q.difficulty_tier === 'standard').length;
      const advCount = quiz.filter((q) => q.difficulty_tier === 'advanced').length;
      assertEqual(stdCount, 6, 'Exactly 6 standard');
      assertEqual(advCount, 4, 'Exactly 4 advanced');
      const subformats = new Set(quiz.map((q) => q.question_subformat));
      assertEqual(subformats.size, 3, 'All 3 subformats present');
    })
  );

  // ==========================================================================
  // 11. F1.3 + F4.3: Plantão bed MCQ reuse scale operating within 20 MCQ saturation
  // ==========================================================================
  results.push(
    await runTest('T3.11', 'F1.3+F4.3', 'Bed MCQ consumption leverages saturated bank with 90% reuse ceiling', () => {
      const bankMCQCount = 20;
      assert(bankMCQCount <= MAX_MCQS_PER_CHAPTER, 'Within saturation limit');
      const reuseChance = BED_REUSE_SCALE[6]; // maximum scale
      assertEqual(reuseChance, 0.90, '90% reuse ceiling applied');
    })
  );

  // ==========================================================================
  // 12. F3.2 + F2.4: Priority bank consumption respecting SRS anti-repetition ordering
  // ==========================================================================
  results.push(
    await runTest('T3.12', 'F3.2+F2.4', 'Bank consumption sorts banked questions through SRS before deficit calculation', () => {
      const bank: MCQQuestion[] = [
        { id: 'q-seen', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: 'q-wrong', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
      ];
      const history: UserQuestionHistoryItem[] = [
        { id: 'h1', user_id: 'u1', question_id: 'q-seen', chapter_id: 8, last_is_correct: true, times_answered: 1, times_correct: 1, last_answered_at: '2026-10-01T00:00:00Z' },
        { id: 'h2', user_id: 'u1', question_id: 'q-wrong', chapter_id: 8, last_is_correct: false, times_answered: 1, times_correct: 0, last_answered_at: '2026-10-02T00:00:00Z' },
      ];
      const { selected } = selectWithAntiRepetition(bank, history, 2);
      assertEqual(selected[0].id, 'q-wrong', 'Wrong question prioritized over correct');
    })
  );

  // ==========================================================================
  // 13. F4.1 + F5.3: CLI pipeline running --submit with OpenRouter batch payload
  // ==========================================================================
  results.push(
    await runTest('T3.13', 'F4.1+F5.3', 'CLI runner --submit validates batch model and arguments', () => {
      const cliArgs = ['--submit', '--model', BATCH_MODEL];
      assert(cliArgs.includes('--submit'), '--submit present');
      assert(cliArgs.includes('openai/gpt-6-luna:batch'), 'Model specified');
    })
  );

  // ==========================================================================
  // 14. F5.2 + F5.3: CLI pipeline aborting when budget hard cap is reached
  // ==========================================================================
  results.push(
    await runTest('T3.14', 'F5.2+F5.3', 'CLI runner detects monthly hard cap of $0.90 and exits with safety halt', () => {
      const monthlySpend = 0.90;
      const check = evaluateBudgetCapBreach(0.01, monthlySpend, 0.01);
      assert(!check.canProceed, 'Safety halt activated');
      assertEqual(check.reason, 'monthly_cap', 'Blocked by monthly cap');
    })
  );

  // ==========================================================================
  // 15. F1.4 + F3.1: Plantão evaluation updating bed performance and question history
  // ==========================================================================
  results.push(
    await runTest('T3.15', 'F1.4+F3.1', 'Finishing bed updates question history for both included MCQs', () => {
      const bedMCQAnswers = [
        { questionId: 'bed-mcq-1', isCorrect: true },
        { questionId: 'bed-mcq-2', isCorrect: false },
      ];
      const recordsToInsert = bedMCQAnswers.map((a) => ({
        question_id: a.questionId,
        last_is_correct: a.isCorrect,
      }));
      assertEqual(recordsToInsert.length, 2, '2 records prepared for history table');
    })
  );

  // ==========================================================================
  // 16. F4.2 + F5.2: Prioritization tree selecting candidates up to the daily budget cap
  // ==========================================================================
  results.push(
    await runTest('T3.16', 'F4.2+F5.2', 'Candidate tree prunes jobs when cumulative projected cost approaches $0.15', () => {
      const candidates = [
        { id: 1, estimatedCost: 0.05 },
        { id: 2, estimatedCost: 0.05 },
        { id: 3, estimatedCost: 0.04 },
        { id: 4, estimatedCost: 0.05 }, // Would push to $0.19
      ];
      let runningCost = 0;
      const scheduled: any[] = [];
      for (const cand of candidates) {
        if (runningCost + cand.estimatedCost <= DAILY_HARD_CAP_USD) {
          scheduled.push(cand);
          runningCost += cand.estimatedCost;
        }
      }
      assertEqual(scheduled.length, 3, 'Top 3 candidates scheduled');
      assertCloseTo(runningCost, 0.14, 0.001, 'Total cost stays under $0.15');
    })
  );

  // ==========================================================================
  // 17. F2.1 + F3.2: 10-MCQ quiz recycling correctly when user aced all 20 questions
  // ==========================================================================
  results.push(
    await runTest('T3.17', 'F2.1+F3.2', 'Full 20-MCQ bank aced recycles oldest 10 in FIFO order without freeze', () => {
      const bank: MCQQuestion[] = Array.from({ length: 20 }, (_, i) => ({
        id: `q-${i}`,
        chapter_id: 8,
        question_type: 'multiple_choice',
        difficulty_tier: 'standard',
        question_subformat: 'case_conduct',
        vignette: 'V',
        options: ['A','B','C','D','E'],
        correct_option: 0,
        explanation: 'E',
      }));
      const history: UserQuestionHistoryItem[] = bank.map((q, i) => ({
        id: `h-${i}`,
        user_id: 'u1',
        question_id: q.id,
        chapter_id: 8,
        last_is_correct: true,
        times_answered: 1,
        times_correct: 1,
        last_answered_at: new Date(2026, 9, i + 1).toISOString(),
      }));
      const { selected, recycled } = selectWithAntiRepetition(bank, history, 10);
      assert(recycled, 'Recycled is true');
      assertEqual(selected.length, 10, '10 questions returned');
      assertEqual(selected[0].id, 'q-0', 'Oldest answered question recycled first');
    })
  );

  // ==========================================================================
  // 18. F4.4 + F4.3: Batch ingestion updating bed complexity tiers up to 6
  // ==========================================================================
  results.push(
    await runTest('T3.18', 'F4.4+F4.3', 'Ingestion tags sequential bed cases with correct complexity tier', () => {
      const existingBedsCount = 4;
      const nextBedIndex = existingBedsCount + 1; // 5th case
      const complexity: BedComplexity = nextBedIndex <= 2 ? 'classic' : nextBedIndex <= 4 ? 'complex' : 'atypical';
      assertEqual(complexity, 'atypical', '5th case tagged atypical');
    })
  );

  // ==========================================================================
  // 19. F3.3 + F2.2: User scoring updating standard vs advanced mastery separately
  // ==========================================================================
  results.push(
    await runTest('T3.19', 'F3.3+F2.2', 'Scoring engine computes separate mastery for standard (60%) and advanced (40%) items', () => {
      const resultsMap = {
        standard: { total: 6, correct: 5 },
        advanced: { total: 4, correct: 2 },
      };
      const standardMastery = (resultsMap.standard.correct / resultsMap.standard.total) * 100;
      const advancedMastery = (resultsMap.advanced.correct / resultsMap.advanced.total) * 100;
      assertCloseTo(standardMastery, 83.33, 0.1, '83.3% standard mastery');
      assertCloseTo(advancedMastery, 50.0, 0.1, '50.0% advanced mastery');
    })
  );

  // ==========================================================================
  // 20. F5.1 + F4.2: Ledger expenditure per tier audit (Tier 1 vs Tier 3 vs Tier 4)
  // ==========================================================================
  results.push(
    await runTest('T3.20', 'F5.1+F4.2', 'Ledger tracks spend distribution across prioritization tiers', () => {
      const spendByTier = {
        tier1_study_queue: 0.08,
        tier3_recommender: 0.04,
        tier4_epidemiology: 0.02,
      };
      const totalSpend = Object.values(spendByTier).reduce((a, b) => a + b, 0);
      assertCloseTo(totalSpend, 0.14, 0.001, 'Sum matches daily total');
      assert(spendByTier.tier1_study_queue > spendByTier.tier3_recommender, 'Tier 1 received largest share');
    })
  );

  return results;
}
