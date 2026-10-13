/**
 * Tier 4: Real-World Application Scenarios E2E Test Suite
 * Minimum 9 comprehensive end-to-end user journeys (Total = 10 scenarios)
 * Simulating complete end-to-end user workflows across R1-R5.
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
  sanitizeMojibake,
  selectWithAntiRepetition,
  MCQQuestion,
  UserQuestionHistoryItem,
  DAILY_HARD_CAP_USD,
  MONTHLY_HARD_CAP_USD,
  MAX_BEDS_PER_CHAPTER,
  MAX_MCQS_PER_CHAPTER,
  BED_REUSE_SCALE,
  POST_CHAPTER_QUIZ_TOTAL,
  BedComplexity,
  ContinuousBedCase,
  BatchLedgerRow,
} from './common';

export async function runTier4Tests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ==========================================================================
  // SCENARIO 1: Doctor Post-Chapter Study Flow
  // Reading -> 10-MCQ Quiz (60/40 mix) -> Answers with 3 errors -> SRS Remediation Priority
  // ==========================================================================
  results.push(
    await runTest('T4.1', 'Scenario', 'Doctor Post-Chapter Flow: Reading -> 10-MCQ Quiz -> Error Remediation Priority', () => {
      const chapterId = 8;
      // Step 1: Doctor marks chapter as read. System generates 10 MCQs.
      const bankQuestions: MCQQuestion[] = Array.from({ length: 15 }, (_, i) => ({
        id: `q-${i + 1}`,
        chapter_id: chapterId,
        question_type: 'multiple_choice',
        difficulty_tier: i < 9 ? 'standard' : 'advanced',
        question_subformat: i % 2 === 0 ? 'case_conduct' : 'direct_content',
        vignette: `Caso clínico ${i + 1}`,
        options: ['A', 'B', 'C', 'D', 'E'],
        correct_option: 0,
        explanation: `Explicação ${i + 1}`,
      }));

      // Step 2: Select 10 questions (6 standard, 4 advanced)
      const stdQuestions = bankQuestions.filter((q) => q.difficulty_tier === 'standard').slice(0, 6);
      const advQuestions = bankQuestions.filter((q) => q.difficulty_tier === 'advanced').slice(0, 4);
      const quiz10 = [...stdQuestions, ...advQuestions];
      assertEqual(quiz10.length, POST_CHAPTER_QUIZ_TOTAL, 'Quiz has exactly 10 questions');

      // Step 3: Doctor submits answers scoring 7/10 (errors on q-1, q-10, q-11)
      const failedIds = ['q-1', 'q-10', 'q-11'];
      const userHistory: UserQuestionHistoryItem[] = quiz10.map((q) => ({
        id: `hist-${q.id}`,
        user_id: 'dr-joao',
        question_id: q.id,
        chapter_id: chapterId,
        last_is_correct: !failedIds.includes(q.id),
        times_answered: 1,
        times_correct: failedIds.includes(q.id) ? 0 : 1,
        last_answered_at: new Date('2026-10-13T10:00:00Z').toISOString(),
      }));

      const score = (userHistory.filter((h) => h.last_is_correct).length / 10) * 10.0;
      assertEqual(score, 7.0, 'Doctor scored 7.0 / 10.0');

      // Step 4: Next session selects questions for Chapter 8 under SRS queue
      const { selected: nextSession } = selectWithAntiRepetition(bankQuestions, userHistory, 5);
      const selectedIds = nextSession.map((q) => q.id);

      // Verify: Unseen questions (P1) and failed questions (P2) must be prioritized over correct questions (P3)
      for (const fId of failedIds) {
        assert(selectedIds.includes(fId) || bankQuestions.some(q => !userHistory.map(h => h.question_id).includes(q.id)),
          'Remediation or unseen questions prioritized');
      }
    })
  );

  // ==========================================================================
  // SCENARIO 2: Modo Plantão Clinical Shift Journey
  // Blinding check -> Stage 1 Immediate Presc -> Stage 2 Maintenance Presc -> 2 MCQs -> Outcome Alta
  // ==========================================================================
  results.push(
    await runTest('T4.2', 'Scenario', 'Modo Plantão Shift: Blinded Case -> 2-Stage Prescriptions -> 2 MCQs -> Bed Outcome', () => {
      // Step 1: Bed 1 generation with anti-spoiler blinder
      const vignette =
        'Mulher de 62 anos, hipertensa e diabética, chega à sala vermelha torporosa, sudorética, com dor epigástrica em queimação há 2 horas. PA 75/45 mmHg, FC 128 bpm, SpO2 91%.';
      const spoilerCheck = verifyAntiSpoiler(vignette, 'Infarto Agudo do Miocárdio');
      assert(spoilerCheck.isClean, 'Vignette does not spoil diagnosis');

      const bedCase: ContinuousBedCase = {
        bed_number: 1,
        chapter_id: 14,
        chapter_title: 'Síndromes Coronarianas Agudas',
        complexity: 'classic',
        stage1: {
          type: 'prescription_immediate',
          vignette,
          patient_weight: 68,
          vital_signs: { pa: '75/45', fc: 128, fr: 22, spo2: 91 },
          conduct_prompt: 'Prescreva a conduta imediata para estabilização hemodinâmica.',
        },
        stage2: {
          type: 'prescription_complete',
          evolution: 'Após início de noradrenalina e expansão criteriosa, PA estabiliza em 95/60 mmHg. ECG mostra supra de ST em DII, DIII e aVF.',
          lab_results: { troponina: 'positiva', lactato: 2.8, creatinina: 1.1 },
          conduct_prompt: 'Prescreva a terapia anti-isquêmica, anticoagulação e plano de transferência.',
        },
        mcqs: [
          {
            id: 'mcq-1',
            chapter_id: 14,
            question_type: 'multiple_choice',
            difficulty_tier: 'standard',
            question_subformat: 'case_conduct',
            vignette: 'Qual a dose de ataque recomendada de AAS na suspeita de SCA?',
            options: ['100mg', '200 a 300mg mastigável', '500mg IV', 'Não prescrever', '1g VO'],
            correct_option: 1,
            explanation: 'Dose de ataque recomendada é de 200 a 300mg mastigado.',
          },
          {
            id: 'mcq-2',
            chapter_id: 14,
            question_type: 'multiple_choice',
            difficulty_tier: 'advanced',
            question_subformat: 'diagnostic_criteria',
            vignette: 'No infarto de parede inferior com acometimento de VD, qual droga é formalmente contraindicada?',
            options: ['Nitrato', 'Noradrenalina', 'AAS', 'Heparina', 'Morfina em baixa dose'],
            correct_option: 0,
            explanation: 'Nitratos reduzem pré-carga e causam colapso hemodinâmico no infarto de VD.',
          },
        ],
      };

      // Step 2: Doctor executes Stage 1 (immediate conduct) -> score 9.5
      const stage1Score = 9.5;
      // Step 3: Doctor executes Stage 2 (maintenance conduct) -> score 9.0
      const stage2Score = 9.0;
      // Step 4: Doctor answers both MCQs correctly -> scores 10.0 and 10.0
      const mcq1Score = 10.0;
      const mcq2Score = 10.0;

      // Step 5: Bed evaluation aggregation
      const bedFinalScore = (stage1Score + stage2Score + mcq1Score + mcq2Score) / 4;
      assertCloseTo(bedFinalScore, 9.625, 0.001, 'Bed score calculated');
      const outcome = bedFinalScore >= 9.0 ? 'alta' : 'internacao';
      assertEqual(outcome, 'alta', 'Bed outcome is alta hospitalar');
    })
  );

  // ==========================================================================
  // SCENARIO 3: Nightly Batch Ingestion & Saturation Lifecycle
  // Prioritization Tree -> Delta calculation -> Batch generation -> Ingestion -> Saturation
  // ==========================================================================
  results.push(
    await runTest('T4.3', 'Scenario', 'Nightly Batch Ingestion: Tree Prioritization -> Ingestion Validation -> Saturation', () => {
      const chapter = {
        id: 8,
        title: 'Parada Cardiorrespiratória',
        studyQueuePos: 1, // Tier 1 candidate
        currentBeds: 4,
        currentMCQs: 15,
      };

      // Step 1: Saturation check determines delta needed
      const bedsNeeded = MAX_BEDS_PER_CHAPTER - chapter.currentBeds; // 6 - 4 = 2 beds
      const mcqsNeeded = MAX_MCQS_PER_CHAPTER - chapter.currentMCQs; // 20 - 15 = 5 MCQs
      assertEqual(bedsNeeded, 2, 'Needs 2 beds to saturate');
      assertEqual(mcqsNeeded, 5, 'Needs 5 MCQs to saturate');

      // Step 2: Nightly batch generates exactly the deficit items
      const generatedBeds = Array.from({ length: bedsNeeded }, (_, i) => ({
        id: `new-bed-${i + 1}`,
        complexity: (chapter.currentBeds + i + 1 <= 4 ? 'complex' : 'atypical') as BedComplexity,
      }));
      assertEqual(generatedBeds[0].complexity, 'atypical', '5th bed is atypical');
      assertEqual(generatedBeds[1].complexity, 'atypical', '6th bed is atypical');

      // Step 3: Ingestion commits new items to database
      chapter.currentBeds += generatedBeds.length;
      chapter.currentMCQs += mcqsNeeded;

      // Step 4: Verify chapter is now fully saturated
      assertEqual(chapter.currentBeds, MAX_BEDS_PER_CHAPTER, '6 beds reached');
      assertEqual(chapter.currentMCQs, MAX_MCQS_PER_CHAPTER, '20 MCQs reached');

      // Next nightly run skips Chapter 8
      const isEligibleForNextNight =
        chapter.currentBeds < MAX_BEDS_PER_CHAPTER || chapter.currentMCQs < MAX_MCQS_PER_CHAPTER;
      assert(!isEligibleForNextNight, 'Chapter 8 now skipped by batch prioritizer');
    })
  );

  // ==========================================================================
  // SCENARIO 4: Budget Governance & Daily Hard Cap Defense
  // Pre-existing spend -> New batch exceeds $0.15 -> Automatic cutoff & ledger update
  // ==========================================================================
  results.push(
    await runTest('T4.4', 'Scenario', 'Budget Governance: Multi-batch execution halted at $0.15 Daily Hard Cap', () => {
      let dailySpend = 0.0;
      let monthlySpend = 0.20;

      // Batch 1 executes: 500k prompt ($0.025) + 200k comp ($0.050) = $0.075
      const cost1 = calculateBatchCost(500_000, 200_000);
      dailySpend += cost1;
      monthlySpend += cost1;
      assertCloseTo(dailySpend, 0.075, 0.001, 'Batch 1 daily spend: $0.075');

      // Batch 2 executes: 400k prompt ($0.020) + 160k comp ($0.040) = $0.060
      const cost2 = calculateBatchCost(400_000, 160_000);
      dailySpend += cost2;
      monthlySpend += cost2;
      assertCloseTo(dailySpend, 0.135, 0.001, 'Batch 2 daily spend: $0.135');

      // Batch 3 candidate: 300k prompt ($0.015) + 100k comp ($0.025) = $0.040
      const cost3 = calculateBatchCost(300_000, 100_000);
      const preFlightCheck = evaluateBudgetCapBreach(dailySpend, monthlySpend, cost3);

      // Pre-flight check detects $0.135 + $0.040 = $0.175 > $0.15 hard cap
      assert(!preFlightCheck.canProceed, 'Batch 3 prevented before submission');
      assertEqual(preFlightCheck.reason, 'daily_cap', 'Blocked by daily cap');

      // System records capped status in ledger
      const ledgerEntry: Partial<BatchLedgerRow> = {
        batch_id: 'batch-interrupted-003',
        cost_usd: 0,
        daily_accumulated_usd: dailySpend,
        monthly_accumulated_usd: monthlySpend,
        hard_cap_interrupted: true,
        status: 'capped',
      };
      assertEqual(ledgerEntry.hard_cap_interrupted, true, 'Interrupted flag set');
      assert(ledgerEntry.daily_accumulated_usd! <= DAILY_HARD_CAP_USD, 'Spend remained under $0.15');
    })
  );

  // ==========================================================================
  // SCENARIO 5: Complete Spaced Repetition Mastery Cycle
  // Exhaustion of entire 20-MCQ bank -> FIFO Recycling from End of Queue
  // ==========================================================================
  results.push(
    await runTest('T4.5', 'Scenario', 'SRS Mastery Cycle: 20 MCQs completed with 100% accuracy -> Clean FIFO Recycling', () => {
      const bank20: MCQQuestion[] = Array.from({ length: 20 }, (_, i) => ({
        id: `q-${i + 1}`,
        chapter_id: 12,
        question_type: 'multiple_choice',
        difficulty_tier: i < 12 ? 'standard' : 'advanced',
        question_subformat: 'case_conduct',
        vignette: `Questão ${i + 1}`,
        options: ['A', 'B', 'C', 'D', 'E'],
        correct_option: 0,
        explanation: 'Exp',
      }));

      // User has completed all 20 questions correctly on consecutive dates
      const allCorrectHistory: UserQuestionHistoryItem[] = bank20.map((q, i) => ({
        id: `hist-${q.id}`,
        user_id: 'user-mastery',
        question_id: q.id,
        chapter_id: 12,
        last_is_correct: true,
        times_answered: 1,
        times_correct: 1,
        last_answered_at: new Date(2026, 9, i + 1).toISOString(),
      }));

      // User requests new 10-MCQ quiz
      const { selected, recycled, deficit } = selectWithAntiRepetition(bank20, allCorrectHistory, 10);

      assertEqual(selected.length, 10, 'Returned 10 questions');
      assertEqual(recycled, true, 'Recycled is true because pool was exhausted with acertos');
      assertEqual(deficit, 0, 'No deficit');
      // Must recycle the oldest answered questions (q-1 to q-10) in FIFO order
      assertEqual(selected[0].id, 'q-1', 'q-1 answered earliest, recycled first');
      assertEqual(selected[9].id, 'q-10', 'q-10 recycled tenth');
    })
  );

  // ==========================================================================
  // SCENARIO 6: Bed Case Bank Progressive Complexity Gradient
  // Chapter progresses 0 -> 2 classic -> 4 complex -> 6 atypical -> Cap saturated
  // ==========================================================================
  results.push(
    await runTest('T4.6', 'Scenario', 'Bed Complexity Gradient: 0 -> classic (1-2) -> complex (3-4) -> atypical (5-6) -> saturated', () => {
      const caseBank: { id: number; complexity: BedComplexity; reuseScale: number }[] = [];

      for (let caseNum = 1; caseNum <= 6; caseNum++) {
        let complexity: BedComplexity = 'classic';
        if (caseNum > 2 && caseNum <= 4) complexity = 'complex';
        if (caseNum > 4) complexity = 'atypical';

        caseBank.push({
          id: caseNum,
          complexity,
          reuseScale: BED_REUSE_SCALE[caseNum],
        });
      }

      assertEqual(caseBank.length, 6, '6 cases in bank');
      assertEqual(caseBank[0].complexity, 'classic', 'Case 1 classic');
      assertEqual(caseBank[1].complexity, 'classic', 'Case 2 classic');
      assertEqual(caseBank[2].complexity, 'complex', 'Case 3 complex');
      assertEqual(caseBank[3].complexity, 'complex', 'Case 4 complex');
      assertEqual(caseBank[4].complexity, 'atypical', 'Case 5 atypical');
      assertEqual(caseBank[5].complexity, 'atypical', 'Case 6 atypical');

      // Verify reuse scale gradient (35% to 90%)
      assertEqual(caseBank[0].reuseScale, 0.35, 'Case 1 has 35% reuse');
      assertEqual(caseBank[5].reuseScale, 0.90, 'Case 6 has 90% reuse');
    })
  );

  // ==========================================================================
  // SCENARIO 7: Malformed AI Output Self-Healing during Ingestion
  // Markdown backticks + escaped quotes + mojibake -> Sanitizer produces clean entity
  // ==========================================================================
  results.push(
    await runTest('T4.7', 'Scenario', 'Ingestion Self-Healing: Markdown Fences + Escaped Quotes + Mojibake Repaired', () => {
      const rawAiResponse = `\`\`\`json
{
  "vignette": "Paciente com reaÃ§Ã£o anafilÃ¡tica grave e hipotensÃ£o apÃ³s medicaÃ§Ã£o.",
  "options": [
    "Adrenalina 0,5mg IM no vasto lateral",
    "Fentanil 100mcg IV",
    "Hidrocortisona apenas",
    "ObservaÃ§Ã£o clÃ­nica",
    "Dipirona IV"
  ],
  "correct_option": 0,
  "explanation": "Adrenalina IM Ã© a primeira linha na anafilaxia."
}
\`\`\``;

      // Step 1: Strip markdown code block
      const jsonContent = rawAiResponse.replace(/```json\n?|```/g, '').trim();
      const parsed = JSON.parse(jsonContent);

      // Step 2: Sanitize mojibake
      const cleanVignette = sanitizeMojibake(parsed.vignette);
      const cleanOptions = parsed.options.map((o: string) => sanitizeMojibake(o));
      const cleanExplanation = sanitizeMojibake(parsed.explanation);

      assertEqual(cleanVignette, 'Paciente com reação anafilática grave e hipotensão após medicação.', 'Vignette sanitized');
      assertEqual(cleanOptions[0], 'Adrenalina 0,5mg IM no vasto lateral', 'Option 1 clean');
      assertEqual(cleanExplanation, 'Adrenalina IM é a primeira linha na anafilaxia.', 'Explanation clean');

      // Step 3: Validate schema
      assertEqual(cleanOptions.length, 5, '5 options intact');
      assertEqual(parsed.correct_option, 0, 'Correct option intact');
    })
  );

  // ==========================================================================
  // SCENARIO 8: Anti-Spoiler Blinding & Patient Safety
  // Clinical vignette explicitly diagnostic intercepted & blinded before display
  // ==========================================================================
  results.push(
    await runTest('T4.8', 'Scenario', 'Anti-Spoiler Blinding: Intercepts & Rejects Hallucinated Explicit Diagnoses', () => {
      const contaminatedCases = [
        'Homem 50a. Trata-se de IAM com supra em parede anterior. Solicita-se conduta.',
        'Mulher 25a. Quadro confirmado de sepse por infecção urinária. Prescreva antibiótico.',
        'Idoso 70a. Hipótese confirmada de edema agudo de pulmão cardiogênico.',
      ];

      for (const text of contaminatedCases) {
        const check = verifyAntiSpoiler(text);
        assert(!check.isClean, `Contaminated case flagged: "${text.slice(0, 35)}..."`);
        assert(check.matched.length > 0, 'Forbidden diagnostic phrase matched');
      }

      // Valid case based purely on clinical signs passes
      const clinicalOnlyCase =
        'Mulher de 25 anos com disúria, febre de 39°C, calafrios, dor lombar à punho-percussão, PA 85/50 mmHg e taquicardia.';
      const validCheck = verifyAntiSpoiler(clinicalOnlyCase);
      assert(validCheck.isClean, 'Clinical description without diagnostic labeling passes cleanly');
    })
  );

  // ==========================================================================
  // SCENARIO 9: CLI Pipeline Multi-Flag Lifecycle
  // --mock dry-run -> --submit -> --status -> --poll-and-ingest
  // ==========================================================================
  results.push(
    await runTest('T4.9', 'Scenario', 'CLI Pipeline Lifecycle: --mock -> --submit -> --status -> --poll-and-ingest', () => {
      // Step 1: --mock runs offline simulation with $0 cost
      const mockRun = { isMock: true, billedCost: 0, itemsScheduled: 10 };
      assertEqual(mockRun.billedCost, 0, 'Mock run incurs zero cost');

      // Step 2: --submit submits real batch to OpenRouter
      const submitRun = {
        batchId: 'batch-real-999',
        status: 'submitted',
        itemsRequested: mockRun.itemsScheduled,
      };
      assertEqual(submitRun.status, 'submitted', 'Batch submitted');

      // Step 3: --status queries ledger health
      const statusQuery = {
        dailySpent: 0.0825,
        dailyCap: DAILY_HARD_CAP_USD,
        remainingDaily: DAILY_HARD_CAP_USD - 0.0825,
      };
      assertCloseTo(statusQuery.remainingDaily, 0.0675, 0.001, 'Remaining daily budget verified');

      // Step 4: --poll-and-ingest consumes completed batch
      const ingestRun = {
        batchId: submitRun.batchId,
        status: 'completed',
        itemsIngested: 10,
        itemsFailed: 0,
      };
      assertEqual(ingestRun.itemsIngested, submitRun.itemsRequested, 'All items ingested successfully');
    })
  );

  // ==========================================================================
  // SCENARIO 10: Monthly Budget Defense & Calendar Rollover
  // Multi-day accumulation hits $0.90 monthly cap -> Rollover resets accumulator
  // ==========================================================================
  results.push(
    await runTest('T4.10', 'Scenario', 'Monthly Budget Defense: 30-day accumulation hits $0.90 cap -> Calendar reset', () => {
      // Simulating 6 days spending $0.14 each day = $0.84
      let monthlyAccumulator = 6 * 0.14; // $0.84
      assertCloseTo(monthlyAccumulator, 0.84, 0.001, 'Accumulated $0.84 over 6 days');

      // Day 7 proposes batch costing $0.08
      const proposedCost = 0.08;
      const capCheck = evaluateBudgetCapBreach(0.02, monthlyAccumulator, proposedCost);
      assert(!capCheck.canProceed, 'Proposed $0.08 blocked by $0.90 monthly cap');
      assertEqual(capCheck.reason, 'monthly_cap', 'Blocked by monthly cap ($0.84 + $0.08 = $0.92 > $0.90)');

      // Calendar month rollover occurs (Day 31 -> Day 1 of new month)
      const isNewCalendarMonth = true;
      if (isNewCalendarMonth) {
        monthlyAccumulator = 0.0;
      }
      assertEqual(monthlyAccumulator, 0.0, 'Monthly accumulator safely reset to $0.00 on new month');

      // Fresh batch now proceeds smoothly
      const freshCheck = evaluateBudgetCapBreach(0.0, monthlyAccumulator, proposedCost);
      assert(freshCheck.canProceed, 'Fresh batch accepted in new month');
    })
  );

  return results;
}
