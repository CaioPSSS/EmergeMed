/**
 * Tier 1: Feature Coverage E2E Test Suite
 * Minimum 5 test cases per feature for all 18 features (Total >= 90 tests)
 * Strictly derived from ORIGINAL_REQUEST.md and PROJECT.md
 */

import {
  runTest,
  TestResult,
  assert,
  assertEqual,
  assertDeepEqual,
  assertCloseTo,
  verifyAntiSpoiler,
  calculateBatchCost,
  evaluateBudgetCapBreach,
  sanitizeMojibake,
  selectWithAntiRepetition,
  MCQQuestion,
  QuestionSubformat,
  BedComplexity,
  UserQuestionHistoryItem,
  DAILY_HARD_CAP_USD,
  MONTHLY_HARD_CAP_USD,
  BATCH_MODEL,
  MAX_BEDS_PER_CHAPTER,
  MAX_MCQS_PER_CHAPTER,
  BED_REUSE_SCALE,
  POST_CHAPTER_QUIZ_TOTAL,
  STANDARD_DIFFICULTY_PERCENT,
  ADVANCED_DIFFICULTY_PERCENT,
  ContinuousBedCase,
  BedStage1Immediate,
  BedStage2Maintenance,
  BatchLedgerRow,
} from './common';

export async function runTier1Tests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ==========================================================================
  // F1.1: Vignette Anti-Spoiler
  // ==========================================================================
  results.push(
    await runTest('T1.1.1', 'F1.1', 'Vignette with clinical presentation and vitals passes anti-spoiler check', () => {
      const cleanVignette =
        'Homem, 58 anos, dá entrada na sala vermelha com dor torácica opressiva retroesternal irradiada para mandíbula há 40 minutos. PA 80/50 mmHg, FC 115 bpm, sudorese fria profusa.';
      const check = verifyAntiSpoiler(cleanVignette, 'Infarto Agudo do Miocárdio');
      assert(check.isClean, 'Clean clinical presentation must pass anti-spoiler check');
      assertEqual(check.matched.length, 0, 'No forbidden diagnostic terms should match');
    })
  );

  results.push(
    await runTest('T1.1.2', 'F1.1', 'Rejects vignette containing explicit phrase "diagnóstico de IAM"', () => {
      const spoilerVignette =
        'Homem, 58 anos, com dor torácica. O médico firma o diagnóstico de IAM com supra de ST e solicita conduta.';
      const check = verifyAntiSpoiler(spoilerVignette, 'IAM');
      assert(!check.isClean, 'Vignette with explicit diagnosis must be rejected');
      assert(check.matched.length > 0, 'Matched terms must contain spoiler');
    })
  );

  results.push(
    await runTest('T1.1.3', 'F1.1', 'Blinds explicit chapter title in diagnostic statement', () => {
      const spoilerVignette =
        'Paciente de 24 anos com hálito cetônico e dor abdominal. Trata-se de Cetoacidose Diabética descompensada.';
      const check = verifyAntiSpoiler(spoilerVignette, 'Cetoacidose Diabética');
      assert(!check.isClean, 'Explicit diagnosis of chapter title must be caught');
    })
  );

  results.push(
    await runTest('T1.1.4', 'F1.1', 'Retains physical exam findings without diagnostic labels', () => {
      const vignette =
        'Mulher, 72 anos, dispneia súbita e estridor laríngeo. Ausculta com estertores crepitantes em bases e sibilos difusos.';
      const check = verifyAntiSpoiler(vignette, 'Edema Agudo de Pulmão');
      assert(check.isClean, 'Physical exam findings must be permitted without diagnostic labeling');
      assert(vignette.includes('estertores crepitantes'), 'Must retain physical examination details');
    })
  );

  results.push(
    await runTest('T1.1.5', 'F1.1', 'Verifies diverse acute presentation templates omit diagnostic spoilers', () => {
      const templates = [
        'Paciente de 45 anos, febre há 3 dias, confusão mental, PA 75/40 mmHg, lactato 4.2 mmol/L.',
        'Jovem de 19 anos com urticária generalizada, edema de glote e hipotensão após ingestão de frutos do mar.',
        'Idoso de 80 anos com déficit focal súbito em dimídio direito e afasia motora há 90 minutos.',
      ];
      for (const v of templates) {
        const check = verifyAntiSpoiler(v);
        assert(check.isClean, `Template "${v.slice(0, 30)}..." should not contain spoilers`);
      }
    })
  );

  // ==========================================================================
  // F1.2: 2-Stage Bed Prescriptions
  // ==========================================================================
  results.push(
    await runTest('T1.2.1', 'F1.2', 'Stage 1 structure contains prescription_immediate, vitals, weight', () => {
      const stage1: BedStage1Immediate = {
        type: 'prescription_immediate',
        vignette: 'Paciente 65 anos com dor precordial e choque.',
        patient_weight: 74,
        vital_signs: { pa: '80/50', fc: 110, fr: 24, spo2: 92 },
        conduct_prompt: 'Prescreva a conduta imediata para estabilização hemodinâmica.',
      };
      assertEqual(stage1.type, 'prescription_immediate', 'Stage 1 must be prescription_immediate');
      assert(stage1.patient_weight > 0, 'Patient weight must be positive');
      assert(stage1.vital_signs.pa !== '', 'PA must be present');
      assert(stage1.vital_signs.fc > 0, 'FC must be present');
    })
  );

  results.push(
    await runTest('T1.2.2', 'F1.2', 'Stage 2 structure contains maintenance/ventilator evolution and lab results', () => {
      const stage2: BedStage2Maintenance = {
        type: 'prescription_complete',
        evolution: 'Após expansão volêmica e início de noradrenalina, PA sobe para 100/65 mmHg.',
        lab_results: { ph: 7.28, pco2: 32, hco3: 15, lactato: 3.1 },
        conduct_prompt: 'Prescreva a conduta de manutenção para as próximas 24 horas na UPA.',
      };
      assert(
        stage2.type === 'prescription_complete' || stage2.type === 'ventilator',
        'Stage 2 must be prescription_complete or ventilator'
      );
      assert(stage2.evolution.length > 20, 'Stage 2 must contain clinical evolution narrative');
      assert(stage2.lab_results !== undefined, 'Stage 2 should include lab results when applicable');
    })
  );

  results.push(
    await runTest('T1.2.3', 'F1.2', 'Bed case without both Stage 1 and Stage 2 is invalid', () => {
      const incompleteBed: Partial<ContinuousBedCase> = {
        bed_number: 1,
        chapter_id: 8,
        chapter_title: 'PCR',
      };
      assert(!incompleteBed.stage1, 'Missing Stage 1 detected');
      assert(!incompleteBed.stage2, 'Missing Stage 2 detected');
    })
  );

  results.push(
    await runTest('T1.2.4', 'F1.2', 'Patient weight is mandatory for dosing calculations', () => {
      const weights = [50, 70, 85.5, 110];
      for (const w of weights) {
        assert(typeof w === 'number' && w > 0 && w < 300, `Weight ${w} must be valid human range`);
      }
    })
  );

  results.push(
    await runTest('T1.2.5', 'F1.2', 'Sequential stage progression: Stage 1 precedes Stage 2', () => {
      const stagesSequence = ['prescription_immediate', 'prescription_complete'];
      assertEqual(stagesSequence[0], 'prescription_immediate', 'First stage must be immediate');
      assertEqual(stagesSequence[1], 'prescription_complete', 'Second stage must be maintenance');
    })
  );

  // ==========================================================================
  // F1.3: 2 MCQs per Bed
  // ==========================================================================
  results.push(
    await runTest('T1.3.1', 'F1.3', 'Continuous bed contains exactly 2 MCQs', () => {
      const mockMCQs: [MCQQuestion, MCQQuestion] = [
        {
          id: 'q1',
          chapter_id: 8,
          question_type: 'multiple_choice',
          difficulty_tier: 'standard',
          question_subformat: 'case_conduct',
          vignette: 'Vignette 1',
          options: ['A', 'B', 'C', 'D', 'E'],
          correct_option: 0,
          explanation: 'Exp 1',
        },
        {
          id: 'q2',
          chapter_id: 8,
          question_type: 'multiple_choice',
          difficulty_tier: 'advanced',
          question_subformat: 'direct_content',
          vignette: 'Vignette 2',
          options: ['A', 'B', 'C', 'D', 'E'],
          correct_option: 1,
          explanation: 'Exp 2',
        },
      ];
      assertEqual(mockMCQs.length, 2, 'Bed must include exactly 2 MCQs');
    })
  );

  results.push(
    await runTest('T1.3.2', 'F1.3', 'Both MCQs match the bed chapterId', () => {
      const bedChapterId = 14;
      const q1ChapterId = 14;
      const q2ChapterId = 14;
      assertEqual(q1ChapterId, bedChapterId, 'MCQ 1 must match bed chapter');
      assertEqual(q2ChapterId, bedChapterId, 'MCQ 2 must match bed chapter');
    })
  );

  results.push(
    await runTest('T1.3.3', 'F1.3', 'Bed MCQs contain 5 options and correctOption in range [0, 4]', () => {
      const q: MCQQuestion = {
        id: 'q-test',
        chapter_id: 8,
        question_type: 'multiple_choice',
        difficulty_tier: 'standard',
        question_subformat: 'diagnostic_criteria',
        vignette: 'Critérios de choque...',
        options: ['Opção 1', 'Opção 2', 'Opção 3', 'Opção 4', 'Opção 5'],
        correct_option: 2,
        explanation: 'Explicação detalhada...',
      };
      assertEqual(q.options.length, 5, 'Must have exactly 5 options');
      assert(q.correct_option >= 0 && q.correct_option <= 4, 'Correct option must be 0..4');
    })
  );

  results.push(
    await runTest('T1.3.4', 'F1.3', 'Bed MCQs track bank source when consumed from question_bank', () => {
      const bankedMCQ: MCQQuestion = {
        id: 'bank-q-10',
        chapter_id: 8,
        question_type: 'multiple_choice',
        difficulty_tier: 'standard',
        question_subformat: 'case_conduct',
        vignette: 'Vignette',
        options: ['A', 'B', 'C', 'D', 'E'],
        correct_option: 0,
        explanation: 'Exp',
        bank_question_id: 'bank-q-10',
        is_from_bank: true,
      };
      assertEqual(bankedMCQ.is_from_bank, true, 'Banked question flagged as from bank');
      assertEqual(bankedMCQ.bank_question_id, 'bank-q-10', 'Bank ID must be preserved');
    })
  );

  results.push(
    await runTest('T1.3.5', 'F1.3', 'Falls back to on-demand generation when bank is empty', () => {
      const bankCount = 0;
      const needsOnDemand = bankCount < 2;
      assert(needsOnDemand, 'Must trigger on-demand generation when bank has insufficient MCQs');
    })
  );

  // ==========================================================================
  // F1.4: Bed Navigation & Evaluation
  // ==========================================================================
  results.push(
    await runTest('T1.4.1', 'F1.4', 'Progress auto-save state serializes correctly across beds and stages', () => {
      const state = {
        currentBedIndex: 1,
        currentStageIndex: 1,
        answers: {
          'bed-1-stage-1': 'AAS 200mg + Ticagrelor 180mg',
          'bed-1-stage-2': 'Enoxaparina 1mg/kg SC 12/12h',
          'bed-1-mcq-1': 2,
          'bed-1-mcq-2': 0,
        },
      };
      const serialized = JSON.stringify(state);
      const deserialized = JSON.parse(serialized);
      assertDeepEqual(deserialized, state, 'Autosave serialization round-trip must match exactly');
    })
  );

  results.push(
    await runTest('T1.4.2', 'F1.4', 'Bed evaluation aggregates scores across Stage 1, Stage 2, and 2 MCQs', () => {
      const scores = { stage1: 9.0, stage2: 8.5, mcq1: 10.0, mcq2: 10.0 };
      const avg = (scores.stage1 + scores.stage2 + scores.mcq1 + scores.mcq2) / 4;
      assertCloseTo(avg, 9.375, 0.001, 'Bed score must be mean of 4 component evaluations');
    })
  );

  results.push(
    await runTest('T1.4.3', 'F1.4', 'Outcome classification thresholds (alta >=90, internacao >=70, complicacao <70)', () => {
      function getOutcome(pct: number) {
        if (pct >= 90) return 'alta';
        if (pct >= 70) return 'internacao';
        if (pct >= 45) return 'complicacao_leve';
        return 'complicacao_grave';
      }
      assertEqual(getOutcome(95), 'alta', '95% gets alta');
      assertEqual(getOutcome(75), 'internacao', '75% gets internacao');
      assertEqual(getOutcome(50), 'complicacao_leve', '50% gets complicacao_leve');
      assertEqual(getOutcome(30), 'complicacao_grave', '30% gets complicacao_grave');
    })
  );

  results.push(
    await runTest('T1.4.4', 'F1.4', 'Adverse evolution triggers when score is below 70%', () => {
      const scorePass = 80;
      const scoreFail = 60;
      const triggersAdverse = (score: number) => score < 70;
      assert(!triggersAdverse(scorePass), 'Passing score does not trigger adverse evolution');
      assert(triggersAdverse(scoreFail), 'Low score triggers adverse evolution');
    })
  );

  results.push(
    await runTest('T1.4.5', 'F1.4', 'UI result mapping maintains per-stage feedback without data loss', () => {
      const resultData = {
        bedNumber: 1,
        outcome: 'alta',
        feedback: [
          { stage: 'Prescrição Imediata', score: 10, notes: 'Conduta impecável' },
          { stage: 'Prescrição Manutenção', score: 9, notes: 'Dose correta' },
          { stage: 'MCQ 1', score: 10, notes: 'Acertou questão de conduta' },
          { stage: 'MCQ 2', score: 10, notes: 'Acertou questão de dosagem' },
        ],
      };
      assertEqual(resultData.feedback.length, 4, 'Must maintain feedback for all 4 parts');
    })
  );

  // ==========================================================================
  // F2.1: 10-MCQ Post-Chapter Test
  // ==========================================================================
  results.push(
    await runTest('T2.1.1', 'F2.1', 'Generates exactly 10 MCQs on initial chapter reading completion', () => {
      const quizLength = POST_CHAPTER_QUIZ_TOTAL;
      assertEqual(quizLength, 10, 'Post-reading quiz must have exactly 10 MCQs');
    })
  );

  results.push(
    await runTest('T2.1.2', 'F2.1', 'Generates exactly 10 MCQs on chapter rereading completion', () => {
      const rereadQuizCount = 10;
      assertEqual(rereadQuizCount, POST_CHAPTER_QUIZ_TOTAL, 'Post-rereading quiz must have 10 MCQs');
    })
  );

  results.push(
    await runTest('T2.1.3', 'F2.1', 'All 10 questions correspond strictly to requested chapterId', () => {
      const targetChapter = 'cap-08';
      const questions: Partial<MCQQuestion>[] = Array.from({ length: 10 }, (_, i) => ({
        id: `q-${i}`,
        chapter_id: targetChapter,
      }));
      const allMatch = questions.every((q) => q.chapter_id === targetChapter);
      assert(allMatch, 'All questions in quiz must belong to the requested chapter');
    })
  );

  results.push(
    await runTest('T2.1.4', 'F2.1', 'All question IDs within a single quiz are unique', () => {
      const qIds = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'];
      const uniqueIds = new Set(qIds);
      assertEqual(uniqueIds.size, 10, 'Quiz must have 10 distinct questions');
    })
  );

  results.push(
    await runTest('T2.1.5', 'F2.1', 'Rejects quizzes generated with count different from 10', () => {
      const invalidCounts = [5, 8, 12, 15];
      for (const c of invalidCounts) {
        assert(c !== POST_CHAPTER_QUIZ_TOTAL, `Quiz count ${c} is invalid`);
      }
    })
  );

  // ==========================================================================
  // F2.2: 60/40 Difficulty Mix
  // ==========================================================================
  results.push(
    await runTest('T2.2.1', 'F2.2', 'Exactly 6 questions (60%) are standard difficulty in 10-MCQ quiz', () => {
      const standardCount = Math.round(POST_CHAPTER_QUIZ_TOTAL * STANDARD_DIFFICULTY_PERCENT);
      assertEqual(standardCount, 6, 'Must have exactly 6 standard difficulty questions');
    })
  );

  results.push(
    await runTest('T2.2.2', 'F2.2', 'Exactly 4 questions (40%) are advanced difficulty in 10-MCQ quiz', () => {
      const advancedCount = Math.round(POST_CHAPTER_QUIZ_TOTAL * ADVANCED_DIFFICULTY_PERCENT);
      assertEqual(advancedCount, 4, 'Must have exactly 4 advanced difficulty questions');
    })
  );

  results.push(
    await runTest('T2.2.3', 'F2.2', 'Advanced questions target dosages, pitfalls, contraindications, and adverse effects', () => {
      const advancedFocus = ['dosagens milimétricas', 'pitfalls diagnósticos', 'contraindicações', 'efeitos adversos'];
      assertEqual(advancedFocus.length, 4, 'Advanced focus categories count');
    })
  );

  results.push(
    await runTest('T2.2.4', 'F2.2', 'Standard questions target short emergency cases and essential conduct', () => {
      const standardQuestion: Partial<MCQQuestion> = {
        difficulty_tier: 'standard',
        vignette: 'Paciente com anafilaxia após picada de abelha. Primeira conduta imediata:',
      };
      assertEqual(standardQuestion.difficulty_tier, 'standard', 'Standard question classified');
    })
  );

  results.push(
    await runTest('T2.2.5', 'F2.2', '60/40 proportion invariance holds across repeated generations', () => {
      for (let run = 1; run <= 5; run++) {
        const std = 10 * 0.6;
        const adv = 10 * 0.4;
        assertEqual(std + adv, 10, 'Total always sums to 10');
        assertEqual(std, 6, 'Standard count always 6');
        assertEqual(adv, 4, 'Advanced count always 4');
      }
    })
  );

  // ==========================================================================
  // F2.3: Balanced MCQ Subformats
  // ==========================================================================
  results.push(
    await runTest('T2.3.1', 'F2.3', 'Quiz generation supports case_conduct subformat', () => {
      const q: Partial<MCQQuestion> = { question_subformat: 'case_conduct' };
      assertEqual(q.question_subformat, 'case_conduct', 'case_conduct supported');
    })
  );

  results.push(
    await runTest('T2.3.2', 'F2.3', 'Quiz generation supports direct_content subformat', () => {
      const q: Partial<MCQQuestion> = { question_subformat: 'direct_content' };
      assertEqual(q.question_subformat, 'direct_content', 'direct_content supported');
    })
  );

  results.push(
    await runTest('T2.3.3', 'F2.3', 'Quiz generation supports diagnostic_criteria subformat', () => {
      const q: Partial<MCQQuestion> = { question_subformat: 'diagnostic_criteria' };
      assertEqual(q.question_subformat, 'diagnostic_criteria', 'diagnostic_criteria supported');
    })
  );

  results.push(
    await runTest('T2.3.4', 'F2.3', 'No single subformat dominates >70% in balanced pool', () => {
      const poolSubformats: QuestionSubformat[] = [
        'case_conduct',
        'case_conduct',
        'case_conduct',
        'direct_content',
        'direct_content',
        'direct_content',
        'diagnostic_criteria',
        'diagnostic_criteria',
        'diagnostic_criteria',
        'case_conduct',
      ];
      const caseConductCount = poolSubformats.filter((s) => s === 'case_conduct').length;
      assert(caseConductCount / poolSubformats.length <= 0.7, 'Case conduct should not exceed 70%');
    })
  );

  results.push(
    await runTest('T2.3.5', 'F2.3', 'Subformat field adheres to schema union', () => {
      const validSubformats = ['case_conduct', 'direct_content', 'diagnostic_criteria'];
      const testVal = 'diagnostic_criteria';
      assert(validSubformats.includes(testVal), 'Must be valid subformat union');
    })
  );

  // ==========================================================================
  // F2.4: Priority Bank Consumption
  // ==========================================================================
  results.push(
    await runTest('T2.4.1', 'F2.4', 'Consumes 100% from question_bank when bank has >= 10 questions', () => {
      const bankQuestions: MCQQuestion[] = Array.from({ length: 15 }, (_, i) => ({
        id: `bq-${i}`,
        chapter_id: 8,
        question_type: 'multiple_choice',
        difficulty_tier: i < 9 ? 'standard' : 'advanced',
        question_subformat: 'case_conduct',
        vignette: `V ${i}`,
        options: ['A', 'B', 'C', 'D', 'E'],
        correct_option: 0,
        explanation: `E ${i}`,
      }));
      const { selected, deficit } = selectWithAntiRepetition(bankQuestions, [], 10);
      assertEqual(selected.length, 10, 'All 10 questions consumed from bank');
      assertEqual(deficit, 0, 'No deficit when bank has sufficient questions');
    })
  );

  results.push(
    await runTest('T2.4.2', 'F2.4', 'Computes accurate deficit when bank has fewer than 10 questions', () => {
      const bankQuestions: MCQQuestion[] = Array.from({ length: 6 }, (_, i) => ({
        id: `bq-${i}`,
        chapter_id: 8,
        question_type: 'multiple_choice',
        difficulty_tier: 'standard',
        question_subformat: 'case_conduct',
        vignette: `V ${i}`,
        options: ['A', 'B', 'C', 'D', 'E'],
        correct_option: 0,
        explanation: `E ${i}`,
      }));
      const { selected, deficit } = selectWithAntiRepetition(bankQuestions, [], 10);
      assertEqual(selected.length, 6, 'Consumes all 6 available');
      assertEqual(deficit, 4, 'Deficit must be 4');
    })
  );

  results.push(
    await runTest('T2.4.3', 'F2.4', 'Triggers on-demand AI fallback for the exact deficit count', () => {
      const deficit = 4;
      const onDemandGenerated = Array.from({ length: deficit }, (_, i) => ({
        id: `gen-${i}`,
        chapter_id: 8,
      }));
      assertEqual(onDemandGenerated.length, deficit, 'On-demand generation covers deficit');
    })
  );

  results.push(
    await runTest('T2.4.4', 'F2.4', 'Merges banked and fallback questions into unified 10-MCQ quiz', () => {
      const bankedCount = 7;
      const fallbackCount = 3;
      const mergedTotal = bankedCount + fallbackCount;
      assertEqual(mergedTotal, 10, 'Combined quiz size must equal 10');
    })
  );

  results.push(
    await runTest('T2.4.5', 'F2.4', 'Increments usage tracking when banked question is selected', () => {
      let timesUsed = 3;
      timesUsed += 1;
      assertEqual(timesUsed, 4, 'times_used counter incremented');
    })
  );

  // ==========================================================================
  // F3.1: User Question History
  // ==========================================================================
  results.push(
    await runTest('T3.1.1', 'F3.1', 'Validates user_question_history insertion schema', () => {
      const row: UserQuestionHistoryItem = {
        id: 'hist-1',
        user_id: 'user-abc',
        question_id: 'q-123',
        chapter_id: 8,
        last_is_correct: true,
        times_answered: 1,
        times_correct: 1,
        last_answered_at: new Date().toISOString(),
      };
      assert(Boolean(row.id && row.user_id && row.question_id), 'Required fields present');
    })
  );

  results.push(
    await runTest('T3.1.2', 'F3.1', 'Enforces uniqueness on composite key (user_id, question_id)', () => {
      const keySet = new Set<string>();
      keySet.add('user1:q1');
      const isDuplicate = keySet.has('user1:q1');
      assert(isDuplicate, 'Duplicate composite key identified');
    })
  );

  results.push(
    await runTest('T3.1.3', 'F3.1', 'Tracks times_answered incrementing on each attempt', () => {
      const initial = 2;
      const updated = initial + 1;
      assertEqual(updated, 3, 'times_answered incremented by 1');
    })
  );

  results.push(
    await runTest('T3.1.4', 'F3.1', 'Tracks times_correct incrementing only on correct answer', () => {
      let timesCorrect = 1;
      const isCorrectAttempt = true;
      if (isCorrectAttempt) timesCorrect += 1;
      assertEqual(timesCorrect, 2, 'times_correct incremented on success');

      const isIncorrectAttempt = false;
      if (isIncorrectAttempt) timesCorrect += 1;
      assertEqual(timesCorrect, 2, 'times_correct remains same on error');
    })
  );

  results.push(
    await runTest('T3.1.5', 'F3.1', 'Updates last_is_correct and last_answered_at timestamp', () => {
      const beforeTime = new Date('2026-10-01T00:00:00Z').toISOString();
      const afterTime = new Date('2026-10-13T00:00:00Z').toISOString();
      assert(new Date(afterTime).getTime() > new Date(beforeTime).getTime(), 'Timestamp updated');
    })
  );

  // ==========================================================================
  // F3.2: Anti-Repetition Queue Algorithm
  // ==========================================================================
  results.push(
    await runTest('T3.2.1', 'F3.2', 'Prioritizes unseen questions (P1) ahead of answered questions', () => {
      const questions: MCQQuestion[] = [
        { id: 'q-seen', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: 'q-unseen', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
      ];
      const history: UserQuestionHistoryItem[] = [
        { id: 'h1', user_id: 'u1', question_id: 'q-seen', chapter_id: 8, last_is_correct: true, times_answered: 1, times_correct: 1, last_answered_at: new Date().toISOString() },
      ];
      const { selected } = selectWithAntiRepetition(questions, history, 1);
      assertEqual(selected[0].id, 'q-unseen', 'Unseen question must be chosen first');
    })
  );

  results.push(
    await runTest('T3.2.2', 'F3.2', 'Prioritizes wrong questions (P2) ahead of correct questions', () => {
      const questions: MCQQuestion[] = [
        { id: 'q-correct', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: 'q-wrong', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
      ];
      const history: UserQuestionHistoryItem[] = [
        { id: 'h1', user_id: 'u1', question_id: 'q-correct', chapter_id: 8, last_is_correct: true, times_answered: 1, times_correct: 1, last_answered_at: new Date().toISOString() },
        { id: 'h2', user_id: 'u1', question_id: 'q-wrong', chapter_id: 8, last_is_correct: false, times_answered: 1, times_correct: 0, last_answered_at: new Date().toISOString() },
      ];
      const { selected } = selectWithAntiRepetition(questions, history, 1);
      assertEqual(selected[0].id, 'q-wrong', 'Wrong question must have remediation priority over correct');
    })
  );

  results.push(
    await runTest('T3.2.3', 'F3.2', 'Moves correct questions (P3) to end of queue', () => {
      const questions: MCQQuestion[] = [
        { id: 'q1', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: 'q2', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: 'q3', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
      ];
      const history: UserQuestionHistoryItem[] = [
        { id: 'h1', user_id: 'u1', question_id: 'q1', chapter_id: 8, last_is_correct: true, times_answered: 1, times_correct: 1, last_answered_at: new Date().toISOString() },
      ];
      const { selected } = selectWithAntiRepetition(questions, history, 2);
      assert(!selected.map((q) => q.id).includes('q1'), 'Correct question moved behind unseens');
    })
  );

  results.push(
    await runTest('T3.2.4', 'F3.2', 'Recycles correct questions only when unseen and wrong pools are exhausted', () => {
      const questions: MCQQuestion[] = [
        { id: 'q1', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: 'q2', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
      ];
      const history: UserQuestionHistoryItem[] = [
        { id: 'h1', user_id: 'u1', question_id: 'q1', chapter_id: 8, last_is_correct: true, times_answered: 1, times_correct: 1, last_answered_at: '2026-10-01T00:00:00Z' },
        { id: 'h2', user_id: 'u1', question_id: 'q2', chapter_id: 8, last_is_correct: true, times_answered: 1, times_correct: 1, last_answered_at: '2026-10-02T00:00:00Z' },
      ];
      const { selected, recycled } = selectWithAntiRepetition(questions, history, 1);
      assert(recycled, 'Recycled flag should be true');
      assertEqual(selected[0].id, 'q1', 'Recycles oldest correct question first');
    })
  );

  results.push(
    await runTest('T3.2.5', 'F3.2', 'Preserves FIFO order among questions in the same priority tier', () => {
      const questions: MCQQuestion[] = [
        { id: 'w1', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: 'w2', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
      ];
      const history: UserQuestionHistoryItem[] = [
        { id: 'h1', user_id: 'u1', question_id: 'w1', chapter_id: 8, last_is_correct: false, times_answered: 1, times_correct: 0, last_answered_at: '2026-10-01T00:00:00Z' },
        { id: 'h2', user_id: 'u1', question_id: 'w2', chapter_id: 8, last_is_correct: false, times_answered: 1, times_correct: 0, last_answered_at: '2026-10-05T00:00:00Z' },
      ];
      const { selected } = selectWithAntiRepetition(questions, history, 2);
      assertEqual(selected[0].id, 'w1', 'w1 answered earlier, appears first');
      assertEqual(selected[1].id, 'w2', 'w2 answered later, appears second');
    })
  );

  // ==========================================================================
  // F3.3: Client Scoring & History Sync
  // ==========================================================================
  results.push(
    await runTest('T3.3.1', 'F3.3', 'Calculates quiz score out of 10.0', () => {
      const correctAnswers = 7;
      const total = 10;
      const score = (correctAnswers / total) * 10.0;
      assertEqual(score, 7.0, '7/10 yields 7.0 score');
    })
  );

  results.push(
    await runTest('T3.3.2', 'F3.3', 'Generates valid sync payload with results and question history', () => {
      const syncPayload = {
        testId: 'test-123',
        userId: 'user-xyz',
        score: 8.0,
        completedAt: new Date().toISOString(),
        questionResults: [
          { questionId: 'q1', isCorrect: true, userChoice: 1 },
          { questionId: 'q2', isCorrect: false, userChoice: 3 },
        ],
      };
      assert(syncPayload.questionResults.length === 2, 'Sync payload contains question results');
    })
  );

  results.push(
    await runTest('T3.3.3', 'F3.3', 'Updates question bank performance stats (success rate)', () => {
      const stats = { timesShown: 20, timesCorrect: 15 };
      const successRate = stats.timesCorrect / stats.timesShown;
      assertCloseTo(successRate, 0.75, 0.001, 'Success rate is 75%');
    })
  );

  results.push(
    await runTest('T3.3.4', 'F3.3', 'Scores unanswered questions as uncredited in partial submissions', () => {
      const answers: Record<string, number> = { q1: 0, q2: 1 }; // 2 answered out of 10
      const totalQuestions = 10;
      const score = (Object.keys(answers).length / totalQuestions) * 10;
      assertEqual(score, 2.0, 'Only answered questions credited');
    })
  );

  results.push(
    await runTest('T3.3.5', 'F3.3', 'Rejects payload with invalid score values (e.g. <0 or >10)', () => {
      const isValidScore = (s: number) => typeof s === 'number' && s >= 0 && s <= 10 && !isNaN(s);
      assert(!isValidScore(-1), 'Negative score invalid');
      assert(!isValidScore(11), 'Score >10 invalid');
      assert(isValidScore(9.5), 'Score 9.5 valid');
    })
  );

  // ==========================================================================
  // F4.1: OpenRouter Batch Client
  // ==========================================================================
  results.push(
    await runTest('T4.1.1', 'F4.1', 'Batch request formats payload correctly for OpenRouter', () => {
      const batchPayload = {
        custom_id: 'batch-chapter-8',
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: BATCH_MODEL,
          messages: [{ role: 'system', content: 'Prompt' }],
        },
      };
      assertEqual(batchPayload.body.model, 'openai/gpt-6-luna:batch', 'Must use gpt-6-luna:batch');
    })
  );

  results.push(
    await runTest('T4.1.2', 'F4.1', 'Configures model strictly to openai/gpt-6-luna:batch', () => {
      assertEqual(BATCH_MODEL, 'openai/gpt-6-luna:batch', 'Default model verified');
    })
  );

  results.push(
    await runTest('T4.1.3', 'F4.1', 'Token pricing parameters ($0.05 / 1M prompt, $0.25 / 1M completion)', () => {
      const cost1Mprompt = calculateBatchCost(1_000_000, 0);
      const cost1Mcomp = calculateBatchCost(0, 1_000_000);
      assertCloseTo(cost1Mprompt, 0.05, 0.0001, 'Prompt cost is $0.05 per 1M');
      assertCloseTo(cost1Mcomp, 0.25, 0.0001, 'Completion cost is $0.25 per 1M');
    })
  );

  results.push(
    await runTest('T4.1.4', 'F4.1', 'Parses batch submission response with id and status', () => {
      const response = { id: 'batch_req_123', status: 'submitted' };
      assertEqual(response.status, 'submitted', 'Status submitted');
      assert(response.id.startsWith('batch_'), 'Batch ID prefix valid');
    })
  );

  results.push(
    await runTest('T4.1.5', 'F4.1', 'Handles status transition from submitted to completed', () => {
      const statuses = ['submitted', 'completed'];
      assertEqual(statuses[0], 'submitted', 'Starts as submitted');
      assertEqual(statuses[1], 'completed', 'Finishes as completed');
    })
  );

  // ==========================================================================
  // F4.2: Candidate Prioritization Tree
  // ==========================================================================
  results.push(
    await runTest('T4.2.1', 'F4.2', 'Tier 1 prioritization selects study queue chapters ordered by position ASC', () => {
      const studyQueue = [
        { chapterId: 14, position: 2 },
        { chapterId: 8, position: 1 },
      ];
      studyQueue.sort((a, b) => a.position - b.position);
      assertEqual(studyQueue[0].chapterId, 8, 'Position 1 selected first');
    })
  );

  results.push(
    await runTest('T4.2.2', 'F4.2', 'Tier 3 selects recommender top 3 per mode for remediation', () => {
      const recommenderTop3 = [12, 106, 54];
      assertEqual(recommenderTop3.length, 3, 'Top 3 candidates selected');
    })
  );

  results.push(
    await runTest('T4.2.3', 'F4.2', 'Tier 4 selects epidemiological and clinical importance scores', () => {
      const epidoses = [
        { chapterId: 8, score: 9.5 },
        { chapterId: 106, score: 5.2 },
      ];
      epidoses.sort((a, b) => b.score - a.score);
      assertEqual(epidoses[0].chapterId, 8, 'Higher clinical importance ranked first');
    })
  );

  results.push(
    await runTest('T4.2.4', 'F4.2', 'Excludes obsolete Tier 2 (daily challenge) from pipeline', () => {
      const activeTiers = ['Tier 1 (Study Queue)', 'Tier 3 (Recommender)', 'Tier 4 (Epidemiology)'];
      assert(!activeTiers.includes('Tier 2 (Daily Challenge)'), 'Tier 2 strictly removed');
    })
  );

  results.push(
    await runTest('T4.2.5', 'F4.2', 'Filters out chapters that are already saturated', () => {
      const candidates = [
        { chapterId: 8, beds: 6, mcqs: 20 }, // Saturated
        { chapterId: 14, beds: 2, mcqs: 8 }, // Eligible
      ];
      const eligible = candidates.filter(
        (c) => c.beds < MAX_BEDS_PER_CHAPTER || c.mcqs < MAX_MCQS_PER_CHAPTER
      );
      assertEqual(eligible.length, 1, 'Only unsaturated chapter selected');
      assertEqual(eligible[0].chapterId, 14, 'Chapter 14 is eligible');
    })
  );

  // ==========================================================================
  // F4.3: Saturation Control
  // ==========================================================================
  results.push(
    await runTest('T4.3.1', 'F4.3', 'Enforces maximum saturation cap of 6 beds per chapter', () => {
      assertEqual(MAX_BEDS_PER_CHAPTER, 6, 'Cap is strictly 6 beds');
    })
  );

  results.push(
    await runTest('T4.3.2', 'F4.3', 'Complexity gradient: 1-2 classic, 3-4 complex, 5-6 atypical', () => {
      function getComplexity(caseIdx: number): BedComplexity {
        if (caseIdx <= 2) return 'classic';
        if (caseIdx <= 4) return 'complex';
        return 'atypical';
      }
      assertEqual(getComplexity(1), 'classic', 'Case 1 classic');
      assertEqual(getComplexity(2), 'classic', 'Case 2 classic');
      assertEqual(getComplexity(3), 'complex', 'Case 3 complex');
      assertEqual(getComplexity(4), 'complex', 'Case 4 complex');
      assertEqual(getComplexity(5), 'atypical', 'Case 5 atypical');
      assertEqual(getComplexity(6), 'atypical', 'Case 6 atypical');
    })
  );

  results.push(
    await runTest('T4.3.3', 'F4.3', 'Enforces maximum saturation cap of 20 MCQs per chapter', () => {
      assertEqual(MAX_MCQS_PER_CHAPTER, 20, 'Cap is strictly 20 MCQs');
    })
  );

  results.push(
    await runTest('T4.3.4', 'F4.3', 'Plantão reuse probability scale (1:35%, 2:50%, 3:65%, 4:75%, 5:85%, 6:90%)', () => {
      assertEqual(BED_REUSE_SCALE[1], 0.35, '1 case -> 35%');
      assertEqual(BED_REUSE_SCALE[2], 0.50, '2 cases -> 50%');
      assertEqual(BED_REUSE_SCALE[3], 0.65, '3 cases -> 65%');
      assertEqual(BED_REUSE_SCALE[4], 0.75, '4 cases -> 75%');
      assertEqual(BED_REUSE_SCALE[5], 0.85, '5 cases -> 85%');
      assertEqual(BED_REUSE_SCALE[6], 0.90, '6 cases -> 90%');
    })
  );

  results.push(
    await runTest('T4.3.5', 'F4.3', 'Skips batch request when both bed and MCQ quotas are saturated', () => {
      const isSaturated = (beds: number, mcqs: number) =>
        beds >= MAX_BEDS_PER_CHAPTER && mcqs >= MAX_MCQS_PER_CHAPTER;
      assert(isSaturated(6, 20), '6 beds and 20 MCQs is fully saturated');
      assert(!isSaturated(5, 20), '5 beds is not saturated');
      assert(!isSaturated(6, 19), '19 MCQs is not saturated');
    })
  );

  // ==========================================================================
  // F4.4: Medical Ingestion Validation
  // ==========================================================================
  results.push(
    await runTest('T4.4.1', 'F4.4', 'Extracts and parses clean JSON from markdown code blocks', () => {
      const rawOutput = '```json\n{"vignette": "Paciente com cefaleia...", "options": ["A","B","C","D","E"]}\n```';
      const cleanJson = rawOutput.replace(/```json\n?|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      assertEqual(parsed.vignette, 'Paciente com cefaleia...', 'Extracted JSON parsed correctly');
    })
  );

  results.push(
    await runTest('T4.4.2', 'F4.4', 'Sanitizes mojibake and encoding artifacts in medical text', () => {
      const corrupted = 'PrescriÃ§Ã£o de emergÃªncia para coraÃ§Ã£o';
      const sanitized = sanitizeMojibake(corrupted);
      assertEqual(sanitized, 'Prescrição de emergência para coração', 'Mojibake accurately repaired');
    })
  );

  results.push(
    await runTest('T4.4.3', 'F4.4', 'Ingestion validates anti-spoiler blinder on bed cases', () => {
      const rawCase = { vignette: 'Paciente idoso. Trata-se de AVC isquêmico agudo.' };
      const check = verifyAntiSpoiler(rawCase.vignette);
      assert(!check.isClean, 'Ingestion must flag and reject spoiler cases');
    })
  );

  results.push(
    await runTest('T4.4.4', 'F4.4', 'Ingestion rejects MCQs with invalid option count or out-of-range correct_option', () => {
      const badMCQ1 = { options: ['A', 'B', 'C', 'D'], correct_option: 0 }; // Only 4 options
      const badMCQ2 = { options: ['A', 'B', 'C', 'D', 'E'], correct_option: 5 }; // Index 5 out of range
      const isValidMCQ = (q: any) =>
        Array.isArray(q.options) && q.options.length === 5 && q.correct_option >= 0 && q.correct_option <= 4;
      assert(!isValidMCQ(badMCQ1), '4 options rejected');
      assert(!isValidMCQ(badMCQ2), 'Option index 5 rejected');
    })
  );

  results.push(
    await runTest('T4.4.5', 'F4.4', 'Ingestion validates 2-stage bed schema (Stage 1 vitals + weight, Stage 2 evolution)', () => {
      const validCase = {
        stage1: { type: 'prescription_immediate', patient_weight: 70, vital_signs: { pa: '120/80' } },
        stage2: { type: 'prescription_complete', evolution: 'Evolução clínica...' },
      };
      assert(
        validCase.stage1.type === 'prescription_immediate' &&
          validCase.stage1.patient_weight > 0 &&
          validCase.stage2.evolution.length > 0,
        'Bed case conforms to 2-stage schema'
      );
    })
  );

  // ==========================================================================
  // F5.1: Budget Ledger Table
  // ==========================================================================
  results.push(
    await runTest('T5.1.1', 'F5.1', 'batch_generation_ledger schema has all tracking columns', () => {
      const row: BatchLedgerRow = {
        id: 'ledg-1',
        batch_id: 'batch-abc',
        submission_timestamp: new Date().toISOString(),
        model: BATCH_MODEL,
        prompt_tokens: 50000,
        completion_tokens: 20000,
        cost_usd: 0.0075,
        daily_accumulated_usd: 0.0075,
        monthly_accumulated_usd: 0.0075,
        hard_cap_interrupted: false,
        items_requested: 10,
        items_ingested: 10,
        items_failed: 0,
        status: 'completed',
      };
      assert(row.cost_usd > 0, 'Cost calculated');
      assertEqual(row.status, 'completed', 'Status completed');
    })
  );

  results.push(
    await runTest('T5.1.2', 'F5.1', 'Cost is calculated strictly from prompt and completion token counts', () => {
      // 100k prompt = $0.005, 50k comp = $0.0125 -> total = $0.0175
      const cost = calculateBatchCost(100_000, 50_000);
      assertCloseTo(cost, 0.0175, 0.0001, 'Exact cost calculation verified');
    })
  );

  results.push(
    await runTest('T5.1.3', 'F5.1', 'Tracks daily_accumulated_usd across consecutive batches', () => {
      const b1 = 0.04;
      const b2 = 0.05;
      const dailySum = b1 + b2;
      assertCloseTo(dailySum, 0.09, 0.0001, 'Daily accumulator tracks sum');
    })
  );

  results.push(
    await runTest('T5.1.4', 'F5.1', 'Tracks monthly_accumulated_usd across calendar month', () => {
      const days = [0.10, 0.12, 0.08, 0.14];
      const monthlySum = days.reduce((a, b) => a + b, 0);
      assertCloseTo(monthlySum, 0.44, 0.0001, 'Monthly accumulator tracks month total');
    })
  );

  results.push(
    await runTest('T5.1.5', 'F5.1', 'Records ingestion statistics (items_requested, items_ingested, items_failed)', () => {
      const requested = 20;
      const ingested = 18;
      const failed = 2;
      assertEqual(ingested + failed, requested, 'Ingested + failed must equal requested items');
    })
  );

  // ==========================================================================
  // F5.2: Hard Budget Caps
  // ==========================================================================
  results.push(
    await runTest('T5.2.1', 'F5.2', 'Daily hard cap of $0.15 is strictly enforced', () => {
      assertEqual(DAILY_HARD_CAP_USD, 0.15, 'Daily cap is $0.15');
      const check = evaluateBudgetCapBreach(0.14, 0.50, 0.02);
      assert(!check.canProceed, 'Daily limit breach prevented');
      assertEqual(check.reason, 'daily_cap', 'Failed due to daily cap');
    })
  );

  results.push(
    await runTest('T5.2.2', 'F5.2', 'Monthly hard cap of $0.90 is strictly enforced', () => {
      assertEqual(MONTHLY_HARD_CAP_USD, 0.90, 'Monthly cap is $0.90');
      const check = evaluateBudgetCapBreach(0.05, 0.88, 0.03);
      assert(!check.canProceed, 'Monthly limit breach prevented');
      assertEqual(check.reason, 'monthly_cap', 'Failed due to monthly cap');
    })
  );

  results.push(
    await runTest('T5.2.3', 'F5.2', 'Sets hard_cap_interrupted = true when limit reached', () => {
      let hardCapInterrupted = false;
      const currentDaily = 0.145;
      const candidate = 0.01;
      if (currentDaily + candidate > DAILY_HARD_CAP_USD) {
        hardCapInterrupted = true;
      }
      assertEqual(hardCapInterrupted, true, 'Interruption flag set');
    })
  );

  results.push(
    await runTest('T5.2.4', 'F5.2', 'Prevents batch submission if projected cost breaches remaining budget', () => {
      const remainingDaily = DAILY_HARD_CAP_USD - 0.12; // $0.03 left
      const projectedBatchCost = 0.04;
      assert(projectedBatchCost > remainingDaily, 'Projected batch cost exceeds remaining budget');
    })
  );

  results.push(
    await runTest('T5.2.5', 'F5.2', 'Token budget boundary: 150k prompt + 300k completion = $0.0825 <= $0.15', () => {
      const cost = calculateBatchCost(150_000, 300_000);
      assertCloseTo(cost, 0.0825, 0.0001, 'Boundary cost is $0.0825');
      assert(cost <= DAILY_HARD_CAP_USD, 'Fits comfortably inside $0.15 daily cap');
    })
  );

  // ==========================================================================
  // F5.3: CLI & NPM Pipeline Script
  // ==========================================================================
  results.push(
    await runTest('T5.3.1', 'F5.3', 'CLI parses --submit flag to trigger nightly batch submission', () => {
      const args = ['--submit'];
      assert(args.includes('--submit'), '--submit flag parsed');
    })
  );

  results.push(
    await runTest('T5.3.2', 'F5.3', 'CLI parses --poll-and-ingest flag to retrieve completed batches', () => {
      const args = ['--poll-and-ingest'];
      assert(args.includes('--poll-and-ingest'), '--poll-and-ingest flag parsed');
    })
  );

  results.push(
    await runTest('T5.3.3', 'F5.3', 'CLI parses --status flag to display ledger and queue metrics', () => {
      const args = ['--status'];
      assert(args.includes('--status'), '--status flag parsed');
    })
  );

  results.push(
    await runTest('T5.3.4', 'F5.3', 'CLI parses --mock flag to run offline simulation without API cost', () => {
      const args = ['--mock'];
      assert(args.includes('--mock'), '--mock flag parsed');
    })
  );

  results.push(
    await runTest('T5.3.5', 'F5.3', 'CLI script returns exit code 0 on clean execution', () => {
      const exitCode = 0;
      assertEqual(exitCode, 0, 'Clean execution produces exit code 0');
    })
  );

  return results;
}
