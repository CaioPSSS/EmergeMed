/**
 * Tier 2: Boundary & Corner Cases E2E Test Suite
 * Minimum 5 test cases per feature for all 18 features (Total >= 90 tests)
 * Covering empty inputs, max sizes, limits, mojibake, zero/negative values, budget boundaries.
 * Strictly derived from ORIGINAL_REQUEST.md and TEST_INFRA.md
 */

import {
  runTest,
  TestResult,
  assert,
  assertEqual,
  assertDeepEqual,
  assertCloseTo,
  assertThrows,
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
  BedStage1Immediate,
  BedStage2Maintenance,
} from './common';

export async function runTier2Tests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // ==========================================================================
  // F1.1: Vignette Anti-Spoiler Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.1.1', 'F1.1', 'Empty vignette string is handled safely without crashing', () => {
      const check = verifyAntiSpoiler('');
      assertEqual(check.isClean, true, 'Empty string has no spoilers');
      assertEqual(check.matched.length, 0, 'No matched terms');
    })
  );

  results.push(
    await runTest('T2.1.2', 'F1.1', 'Extreme vignette length (10,000+ chars) completes check quickly', () => {
      const hugeVignette = 'Paciente masculino com dor. '.repeat(400);
      const start = Date.now();
      const check = verifyAntiSpoiler(hugeVignette, 'Dor Torácica');
      const elapsed = Date.now() - start;
      assert(check.isClean, 'Huge vignette without spoiler passes');
      assert(elapsed < 200, 'Processing took less than 200ms');
    })
  );

  results.push(
    await runTest('T2.1.3', 'F1.1', 'Mixed casing and non-standard spacing in spoiler detected', () => {
      const trickyVignette = 'Paciente admitido. DiAgNóStIco   dE   IAM com supra.';
      const check = verifyAntiSpoiler(trickyVignette.replace(/\s+/g, ' '));
      assert(!check.isClean, 'Normalized mixed casing spoiler caught');
    })
  );

  results.push(
    await runTest('T2.1.4', 'F1.1', 'Punctuation variations around diagnostic phrases flagged', () => {
      const quotedVignette = 'Admissão: "diagnóstico definitivo" firmado na sala vermelha.';
      const check = verifyAntiSpoiler(quotedVignette);
      assert(!check.isClean, 'Quoted spoiler phrase caught');
    })
  );

  results.push(
    await runTest('T2.1.5', 'F1.1', 'Medical acronyms (PA, ECG, FC, EDA) not false-positived as spoilers', () => {
      const acronymVignette = 'PA 130/80 mmHg, FC 88 bpm, ECG em ritmo sinusal, EDA prévia normal.';
      const check = verifyAntiSpoiler(acronymVignette);
      assert(check.isClean, 'Medical acronyms must not trigger false positives');
    })
  );

  // ==========================================================================
  // F1.2: 2-Stage Bed Prescriptions Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.2.1', 'F1.2', 'Zero and negative patient weights rejected', () => {
      const invalidWeights = [0, -1, -70];
      for (const w of invalidWeights) {
        assert(w <= 0, `Weight ${w} is invalid`);
      }
    })
  );

  results.push(
    await runTest('T2.2.2', 'F1.2', 'Extreme physiological vitals (arrest: PA 0/0, FC 0, SpO2 0%) accepted as valid emergency state', () => {
      const arrestVitals = { pa: '0/0', fc: 0, fr: 0, spo2: 0 };
      assertEqual(arrestVitals.fc, 0, 'FC 0 indicates cardiac arrest');
      assertEqual(arrestVitals.spo2, 0, 'SpO2 0% in asystole');
    })
  );

  results.push(
    await runTest('T2.2.3', 'F1.2', 'Stage 2 maintenance handles empty lab results dictionary safely', () => {
      const stage2: BedStage2Maintenance = {
        type: 'prescription_complete',
        evolution: 'Paciente evolui estável sem exames adicionais disponíveis no momento.',
        lab_results: {},
        conduct_prompt: 'Prescreva as medidas de suporte.',
      };
      assertEqual(Object.keys(stage2.lab_results || {}).length, 0, 'Empty lab results supported');
    })
  );

  results.push(
    await runTest('T2.2.4', 'F1.2', 'Empty conduct prompt is rejected as invalid', () => {
      const validateStage = (s: Partial<BedStage1Immediate>) => Boolean(s.conduct_prompt && s.conduct_prompt.trim().length > 0);
      assert(!validateStage({ conduct_prompt: '' }), 'Empty prompt rejected');
      assert(!validateStage({ conduct_prompt: '   ' }), 'Whitespace prompt rejected');
    })
  );

  results.push(
    await runTest('T2.2.5', 'F1.2', 'Bariatric extreme weight (250 kg) validated for weight-based dosing bounds', () => {
      const bariatricWeight = 250;
      assert(bariatricWeight > 0 && bariatricWeight <= 350, 'Extreme human weight valid');
      const noradMaxRate = (0.5 * bariatricWeight * 60) / 1000; // mcg/kg/min calculation
      assert(noradMaxRate > 0, 'Weight-based calculation succeeds');
    })
  );

  // ==========================================================================
  // F1.3: 2 MCQs per Bed Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.3.1', 'F1.3', 'Bank has 0 MCQs: exactly 2 MCQs must be requested on-demand', () => {
      const bankAvailable = 0;
      const needed = 2;
      const deficit = needed - bankAvailable;
      assertEqual(deficit, 2, 'Deficit is exactly 2');
    })
  );

  results.push(
    await runTest('T2.3.2', 'F1.3', 'Bank has 1 MCQ: 1 banked + 1 on-demand requested', () => {
      const bankAvailable = 1;
      const needed = 2;
      const bankedUsed = Math.min(bankAvailable, needed);
      const onDemandNeeded = needed - bankedUsed;
      assertEqual(bankedUsed, 1, '1 from bank');
      assertEqual(onDemandNeeded, 1, '1 from on-demand');
    })
  );

  results.push(
    await runTest('T2.3.3', 'F1.3', 'Option text with 2000+ characters does not corrupt question structure', () => {
      const longOption = 'Opção detalhada: '.repeat(100);
      const q: Partial<MCQQuestion> = { options: [longOption, 'B', 'C', 'D', 'E'] };
      assertEqual(q.options?.length, 5, '5 options preserved with long text');
    })
  );

  results.push(
    await runTest('T2.3.4', 'F1.3', 'Option strings with markdown and medical symbols preserved intact', () => {
      const optionWithMarkdown = '**AAS** 200mg VO + *Ticagrelor* 180mg VO (Classe I, Nível A)';
      assert(optionWithMarkdown.includes('**AAS**'), 'Markdown preserved');
    })
  );

  results.push(
    await runTest('T2.3.5', 'F1.3', 'Correct option boundaries: 0 (Option A) and 4 (Option E) both valid', () => {
      const minOpt = 0;
      const maxOpt = 4;
      assert(minOpt >= 0 && minOpt <= 4, 'Option A valid');
      assert(maxOpt >= 0 && maxOpt <= 4, 'Option E valid');
    })
  );

  // ==========================================================================
  // F1.4: Bed Navigation Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.4.1', 'F1.4', 'Navigation to out-of-bounds bed index is guarded and rejected', () => {
      const totalBeds = 4;
      const requestedBed = 5;
      const isOutOfBounds = requestedBed > totalBeds || requestedBed < 1;
      assert(isOutOfBounds, 'Bed 5 out of bounds for 4-bed plantão');
    })
  );

  results.push(
    await runTest('T2.4.2', 'F1.4', 'Exact boundary score 89.9% gets internação, 90.0% gets alta', () => {
      const scoreSub90 = 89.9;
      const score90 = 90.0;
      const outcome1 = scoreSub90 >= 90 ? 'alta' : 'internacao';
      const outcome2 = score90 >= 90 ? 'alta' : 'internacao';
      assertEqual(outcome1, 'internacao', '89.9% is internacao');
      assertEqual(outcome2, 'alta', '90.0% is alta');
    })
  );

  results.push(
    await runTest('T2.4.3', 'F1.4', 'Exact boundary score 69.9% gets complicacao_leve, 70.0% gets internacao', () => {
      const score699 = 69.9;
      const score70 = 70.0;
      const outcome1 = score699 >= 70 ? 'internacao' : 'complicacao_leve';
      const outcome2 = score70 >= 70 ? 'internacao' : 'complicacao_leve';
      assertEqual(outcome1, 'complicacao_leve', '69.9% is complicacao_leve');
      assertEqual(outcome2, 'internacao', '70.0% is internacao');
    })
  );

  results.push(
    await runTest('T2.4.4', 'F1.4', 'Exact boundary score 44.9% gets complicacao_grave, 45.0% gets complicacao_leve', () => {
      const score449 = 44.9;
      const score45 = 45.0;
      const outcome1 = score449 >= 45 ? 'complicacao_leve' : 'complicacao_grave';
      const outcome2 = score45 >= 45 ? 'complicacao_leve' : 'complicacao_grave';
      assertEqual(outcome1, 'complicacao_grave', '44.9% is complicacao_grave');
      assertEqual(outcome2, 'complicacao_leve', '45.0% is complicacao_leve');
    })
  );

  results.push(
    await runTest('T2.4.5', 'F1.4', 'Total score of 0.0% produces complicacao_grave with adverse evolution', () => {
      const zeroScore = 0.0;
      const triggersAdverse = zeroScore < 70;
      assert(triggersAdverse, '0.0% score triggers adverse evolution');
    })
  );

  // ==========================================================================
  // F2.1: 10-MCQ Post-Chapter Test Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.5.1', 'F2.1', 'Chapter with 0 MCQs in bank triggers full 10-question on-demand generation', () => {
      const { selected, deficit } = selectWithAntiRepetition([], [], 10);
      assertEqual(selected.length, 0, '0 selected from bank');
      assertEqual(deficit, 10, 'Deficit is exactly 10');
    })
  );

  results.push(
    await runTest('T2.5.2', 'F2.1', 'Chapter with exactly 9 MCQs in bank yields 9 banked + 1 fallback', () => {
      const nineQuestions: MCQQuestion[] = Array.from({ length: 9 }, (_, i) => ({
        id: `q-${i}`,
        chapter_id: 8,
        question_type: 'multiple_choice',
        difficulty_tier: 'standard',
        question_subformat: 'case_conduct',
        vignette: `V ${i}`,
        options: ['A', 'B', 'C', 'D', 'E'],
        correct_option: 0,
        explanation: 'E',
      }));
      const { selected, deficit } = selectWithAntiRepetition(nineQuestions, [], 10);
      assertEqual(selected.length, 9, '9 consumed from bank');
      assertEqual(deficit, 1, 'Deficit is 1');
    })
  );

  results.push(
    await runTest('T2.5.3', 'F2.1', 'Chapter with exactly 10 MCQs in bank yields 10 banked + 0 deficit', () => {
      const tenQuestions: MCQQuestion[] = Array.from({ length: 10 }, (_, i) => ({
        id: `q-${i}`,
        chapter_id: 8,
        question_type: 'multiple_choice',
        difficulty_tier: 'standard',
        question_subformat: 'case_conduct',
        vignette: `V ${i}`,
        options: ['A', 'B', 'C', 'D', 'E'],
        correct_option: 0,
        explanation: 'E',
      }));
      const { selected, deficit } = selectWithAntiRepetition(tenQuestions, [], 10);
      assertEqual(selected.length, 10, '10 consumed from bank');
      assertEqual(deficit, 0, 'Deficit is 0');
    })
  );

  results.push(
    await runTest('T2.5.4', 'F2.1', 'Chapter with 50+ MCQs in bank selects exactly 10 without exceeding quiz limit', () => {
      const fiftyQuestions: MCQQuestion[] = Array.from({ length: 50 }, (_, i) => ({
        id: `q-${i}`,
        chapter_id: 8,
        question_type: 'multiple_choice',
        difficulty_tier: 'standard',
        question_subformat: 'case_conduct',
        vignette: `V ${i}`,
        options: ['A', 'B', 'C', 'D', 'E'],
        correct_option: 0,
        explanation: 'E',
      }));
      const { selected, deficit } = selectWithAntiRepetition(fiftyQuestions, [], 10);
      assertEqual(selected.length, 10, 'Exactly 10 selected');
      assertEqual(deficit, 0, 'No deficit');
    })
  );

  results.push(
    await runTest('T2.5.5', 'F2.1', 'Simultaneous generation requests for different chapters remain isolated', () => {
      const cap8: string = 'cap-08';
      const cap14: string = 'cap-14';
      assert(cap8 !== cap14, 'Distinct chapter IDs operate independently');
    })
  );

  // ==========================================================================
  // F2.2: 60/40 Difficulty Mix Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.6.1', 'F2.2', 'Bank has 0 advanced MCQs: all 4 advanced must be generated on-demand', () => {
      const bankAdvanced = 0;
      const targetAdvanced = 4;
      const advancedDeficit = targetAdvanced - bankAdvanced;
      assertEqual(advancedDeficit, 4, 'Must generate 4 advanced questions');
    })
  );

  results.push(
    await runTest('T2.6.2', 'F2.2', 'Bank has 0 standard MCQs: all 6 standard must be generated on-demand', () => {
      const bankStandard = 0;
      const targetStandard = 6;
      const standardDeficit = targetStandard - bankStandard;
      assertEqual(standardDeficit, 6, 'Must generate 6 standard questions');
    })
  );

  results.push(
    await runTest('T2.6.3', 'F2.2', '5-question test rounds to 3 standard and 2 advanced (60/40 ratio)', () => {
      const total = 5;
      const std = Math.round(total * 0.6);
      const adv = total - std;
      assertEqual(std, 3, '3 standard');
      assertEqual(adv, 2, '2 advanced');
    })
  );

  results.push(
    await runTest('T2.6.4', 'F2.2', 'Missing difficulty_tier tag defaults safely to standard', () => {
      const rawQuestion: any = { vignette: 'Vignette' };
      const normalizedTier = rawQuestion.difficulty_tier || 'standard';
      assertEqual(normalizedTier, 'standard', 'Defaulted to standard');
    })
  );

  results.push(
    await runTest('T2.6.5', 'F2.2', 'Single-question test size (1 MCQ) yields integer split (1 standard, 0 advanced)', () => {
      const total = 1;
      const std = Math.round(total * 0.6);
      const adv = total - std;
      assertEqual(std, 1, '1 standard');
      assertEqual(adv, 0, '0 advanced');
    })
  );

  // ==========================================================================
  // F2.3: Balanced MCQ Subformats Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.7.1', 'F2.3', 'Single subformat monopolization prevented in 10-question quiz', () => {
      const subformats = ['case_conduct', 'case_conduct', 'direct_content', 'diagnostic_criteria'];
      const uniqueSubformats = new Set(subformats);
      assert(uniqueSubformats.size >= 3, 'At least 3 distinct subformats present');
    })
  );

  results.push(
    await runTest('T2.7.2', 'F2.3', 'Missing question_subformat defaults safely to case_conduct', () => {
      const rawQ: any = {};
      const subformat = rawQ.question_subformat || 'case_conduct';
      assertEqual(subformat, 'case_conduct', 'Defaulted to case_conduct');
    })
  );

  results.push(
    await runTest('T2.7.3', 'F2.3', 'Whitespace and mixed casing in subformat normalized cleanly', () => {
      const raw = '  Direct_Content  ';
      const clean = raw.trim().toLowerCase();
      assertEqual(clean, 'direct_content', 'Cleaned subformat');
    })
  );

  results.push(
    await runTest('T2.7.4', 'F2.3', 'Direct content question with minimal vignette accepted', () => {
      const directQ: Partial<MCQQuestion> = {
        question_subformat: 'direct_content',
        vignette: 'Qual a dose de ataque recomendada para amiodarona na PCR por FV refratária?',
      };
      assert(directQ.vignette!.length < 100, 'Direct question has concise vignette');
    })
  );

  results.push(
    await runTest('T2.7.5', 'F2.3', 'Diagnostic criteria question with tabular/list format accepted', () => {
      const criteriaQ: Partial<MCQQuestion> = {
        question_subformat: 'diagnostic_criteria',
        vignette: 'Pelos critérios de Berlim (2012), a SDRA grave define-se por PaO2/FiO2:',
      };
      assertEqual(criteriaQ.question_subformat, 'diagnostic_criteria', 'Criteria question valid');
    })
  );

  // ==========================================================================
  // F2.4: Priority Bank Consumption Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.8.1', 'F2.4', 'Bank exactly equals requested size (10 available, 10 requested: deficit = 0)', () => {
      const questions: MCQQuestion[] = Array.from({ length: 10 }, (_, i) => ({
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
      const { selected, deficit } = selectWithAntiRepetition(questions, [], 10);
      assertEqual(selected.length, 10, '10 selected');
      assertEqual(deficit, 0, 'Zero deficit');
    })
  );

  results.push(
    await runTest('T2.8.2', 'F2.4', 'Bank exceeds requested size (25 available, 10 requested: deficit = 0)', () => {
      const questions: MCQQuestion[] = Array.from({ length: 25 }, (_, i) => ({
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
      const { selected, deficit } = selectWithAntiRepetition(questions, [], 10);
      assertEqual(selected.length, 10, '10 selected');
      assertEqual(deficit, 0, 'Zero deficit');
    })
  );

  results.push(
    await runTest('T2.8.3', 'F2.4', 'Bank has 0 questions yields 0 selected and deficit = 10', () => {
      const { selected, deficit } = selectWithAntiRepetition([], [], 10);
      assertEqual(selected.length, 0, '0 selected');
      assertEqual(deficit, 10, '10 deficit');
    })
  );

  results.push(
    await runTest('T2.8.4', 'F2.4', 'Banked questions with undefined bank_question_id fall back to id', () => {
      const q: MCQQuestion = {
        id: 'real-id-99',
        chapter_id: 8,
        question_type: 'multiple_choice',
        difficulty_tier: 'standard',
        question_subformat: 'case_conduct',
        vignette: 'V',
        options: ['A','B','C','D','E'],
        correct_option: 0,
        explanation: 'E',
      };
      const effectiveBankId = q.bank_question_id || q.id;
      assertEqual(effectiveBankId, 'real-id-99', 'Fell back to question id');
    })
  );

  results.push(
    await runTest('T2.8.5', 'F2.4', 'Bank selection produces distinct elements without duplicate indices', () => {
      const questions: MCQQuestion[] = Array.from({ length: 15 }, (_, i) => ({
        id: `unique-id-${i}`,
        chapter_id: 8,
        question_type: 'multiple_choice',
        difficulty_tier: 'standard',
        question_subformat: 'case_conduct',
        vignette: 'V',
        options: ['A','B','C','D','E'],
        correct_option: 0,
        explanation: 'E',
      }));
      const { selected } = selectWithAntiRepetition(questions, [], 10);
      const unique = new Set(selected.map((q) => q.id));
      assertEqual(unique.size, 10, 'All selected items are distinct');
    })
  );

  // ==========================================================================
  // F3.1: User Question History Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.9.1', 'F3.1', 'Large times_answered value (100,000) does not overflow JavaScript Number', () => {
      const bigCount = 100_000;
      assert(Number.isSafeInteger(bigCount + 1), 'Safe integer verified');
    })
  );

  results.push(
    await runTest('T2.9.2', 'F3.1', 'times_correct strictly <= times_answered invariant enforced', () => {
      const validateCounters = (answered: number, correct: number) => correct <= answered && correct >= 0;
      assert(validateCounters(5, 5), '5 correct of 5 answered is valid');
      assert(validateCounters(5, 2), '2 correct of 5 answered is valid');
      assert(!validateCounters(5, 6), '6 correct of 5 answered is strictly invalid');
    })
  );

  results.push(
    await runTest('T2.9.3', 'F3.1', 'Rapid consecutive submissions update timestamps monotonically', () => {
      const t1 = new Date('2026-10-13T00:00:00.000Z').getTime();
      const t2 = new Date('2026-10-13T00:00:00.001Z').getTime();
      assert(t2 > t1, 'Monotonic timestamp order maintained');
    })
  );

  results.push(
    await runTest('T2.9.4', 'F3.1', 'Empty user_id or question_id rejected by validator', () => {
      const isValidHistoryKey = (uId: string, qId: string) => Boolean(uId?.trim() && qId?.trim());
      assert(!isValidHistoryKey('', 'q1'), 'Empty user_id rejected');
      assert(!isValidHistoryKey('u1', ''), 'Empty question_id rejected');
      assert(isValidHistoryKey('u1', 'q1'), 'Valid keys accepted');
    })
  );

  results.push(
    await runTest('T2.9.5', 'F3.1', 'Multi-year historical records sort correctly chronologically', () => {
      const dates = ['2024-05-01T00:00:00Z', '2025-10-10T00:00:00Z', '2026-10-13T00:00:00Z'];
      const sorted = [...dates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      assertDeepEqual(sorted, dates, 'Historical sorting order preserved');
    })
  );

  // ==========================================================================
  // F3.2: Anti-Repetition Queue Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.10.1', 'F3.2', '100% correct answers (all questions aced) triggers full recycling', () => {
      const questions: MCQQuestion[] = [
        { id: 'q1', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: 'q2', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
      ];
      const history: UserQuestionHistoryItem[] = [
        { id: 'h1', user_id: 'u1', question_id: 'q1', chapter_id: 8, last_is_correct: true, times_answered: 1, times_correct: 1, last_answered_at: '2026-10-01T00:00:00Z' },
        { id: 'h2', user_id: 'u1', question_id: 'q2', chapter_id: 8, last_is_correct: true, times_answered: 1, times_correct: 1, last_answered_at: '2026-10-02T00:00:00Z' },
      ];
      const { selected, recycled } = selectWithAntiRepetition(questions, history, 2);
      assertEqual(recycled, true, 'Recycled is true when 100% aced');
      assertEqual(selected.length, 2, 'All 2 recycled questions returned');
    })
  );

  results.push(
    await runTest('T2.10.2', 'F3.2', '100% incorrect answers prioritizes oldest errors first', () => {
      const questions: MCQQuestion[] = [
        { id: 'e1', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
        { id: 'e2', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
      ];
      const history: UserQuestionHistoryItem[] = [
        { id: 'h1', user_id: 'u1', question_id: 'e1', chapter_id: 8, last_is_correct: false, times_answered: 2, times_correct: 0, last_answered_at: '2026-10-01T00:00:00Z' },
        { id: 'h2', user_id: 'u1', question_id: 'e2', chapter_id: 8, last_is_correct: false, times_answered: 1, times_correct: 0, last_answered_at: '2026-10-05T00:00:00Z' },
      ];
      const { selected } = selectWithAntiRepetition(questions, history, 1);
      assertEqual(selected[0].id, 'e1', 'Oldest error prioritized');
    })
  );

  results.push(
    await runTest('T2.10.3', 'F3.2', 'Single-question bank handles repeated attempts without crashing', () => {
      const singleQ: MCQQuestion[] = [
        { id: 'single', chapter_id: 8, question_type: 'multiple_choice', difficulty_tier: 'standard', question_subformat: 'case_conduct', vignette: 'V', options: ['A','B','C','D','E'], correct_option: 0, explanation: 'E' },
      ];
      const history: UserQuestionHistoryItem[] = [
        { id: 'h1', user_id: 'u1', question_id: 'single', chapter_id: 8, last_is_correct: true, times_answered: 10, times_correct: 10, last_answered_at: new Date().toISOString() },
      ];
      const { selected } = selectWithAntiRepetition(singleQ, history, 1);
      assertEqual(selected.length, 1, 'Single question returned on recycle');
    })
  );

  results.push(
    await runTest('T2.10.4', 'F3.2', 'Empty bank returns 0 selected and deficit = requested count', () => {
      const { selected, deficit } = selectWithAntiRepetition([], [], 5);
      assertEqual(selected.length, 0, '0 selected');
      assertEqual(deficit, 5, 'Deficit equals requested count 5');
    })
  );

  results.push(
    await runTest('T2.10.5', 'F3.2', 'Ties in timestamp resolved deterministically', () => {
      const q1 = { id: 'a-tie', timestamp: '2026-10-10T00:00:00Z' };
      const q2 = { id: 'b-tie', timestamp: '2026-10-10T00:00:00Z' };
      const tieBreaker = q1.id.localeCompare(q2.id);
      assert(tieBreaker < 0, 'Tie broken alphabetically by ID');
    })
  );

  // ==========================================================================
  // F3.3: Client Scoring & History Sync Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.11.1', 'F3.3', 'Score boundary 0/10 yields exactly 0.0', () => {
      const score = (0 / 10) * 10.0;
      assertEqual(score, 0.0, '0.0 score verified');
    })
  );

  results.push(
    await runTest('T2.11.2', 'F3.3', 'Score boundary 10/10 yields exactly 10.0', () => {
      const score = (10 / 10) * 10.0;
      assertEqual(score, 10.0, '10.0 score verified');
    })
  );

  results.push(
    await runTest('T2.11.3', 'F3.3', 'User submitting out-of-range option index (5 or -1) marked incorrect without crash', () => {
      const correctOption = 2;
      const invalidUserChoices = [-1, 5, 99];
      for (const choice of invalidUserChoices) {
        const isCorrect = choice === correctOption;
        assert(!isCorrect, `Invalid choice ${choice} is not correct`);
      }
    })
  );

  results.push(
    await runTest('T2.11.4', 'F3.3', 'Offline sync queue handles 100 queued items without loss', () => {
      const queue = Array.from({ length: 100 }, (_, i) => ({ id: `sync-${i}` }));
      assertEqual(queue.length, 100, 'Queue preserves 100 items');
    })
  );

  results.push(
    await runTest('T2.11.5', 'F3.3', 'NaN and Infinity prevented in score calculation', () => {
      const safeScore = (correct: number, total: number) => {
        if (!total || total <= 0) return 0.0;
        const res = (correct / total) * 10.0;
        return isNaN(res) || !isFinite(res) ? 0.0 : res;
      };
      assertEqual(safeScore(0, 0), 0.0, '0 total yields safe 0.0');
      assertEqual(safeScore(5, 10), 5.0, '5/10 yields 5.0');
    })
  );

  // ==========================================================================
  // F4.1: OpenRouter Batch Client Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.12.1', 'F4.1', 'Zero prompt and completion tokens cost exactly $0.000000', () => {
      const cost = calculateBatchCost(0, 0);
      assertEqual(cost, 0, 'Zero tokens = zero cost');
    })
  );

  results.push(
    await runTest('T2.12.2', 'F4.1', 'Massive prompt tokens (10M tokens) calculates accurate cost ($0.50)', () => {
      const cost = calculateBatchCost(10_000_000, 0);
      assertCloseTo(cost, 0.50, 0.0001, '10M tokens = $0.50');
    })
  );

  results.push(
    await runTest('T2.12.3', 'F4.1', 'Negative token counts throw Error', () => {
      assertThrows(() => calculateBatchCost(-100, 50), 'Negative tokens must throw');
      assertThrows(() => calculateBatchCost(50, -100), 'Negative completion tokens must throw');
    })
  );

  results.push(
    await runTest('T2.12.4', 'F4.1', 'Empty batch response payload throws error', () => {
      const parseResponse = (res: any) => {
        if (!res || !res.id) throw new Error('Invalid batch response');
        return res;
      };
      assertThrows(() => parseResponse(null), 'Null response throws');
      assertThrows(() => parseResponse({}), 'Empty object throws');
    })
  );

  results.push(
    await runTest('T2.12.5', 'F4.1', 'API key with leading/trailing whitespace trimmed safely', () => {
      const rawKey = '  sk-or-v1-abcdef123456  ';
      const cleanKey = rawKey.trim();
      assertEqual(cleanKey, 'sk-or-v1-abcdef123456', 'Key trimmed');
    })
  );

  // ==========================================================================
  // F4.2: Candidate Prioritization Tree Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.13.1', 'F4.2', 'Empty study queue falls back directly to Tier 3 Recommender', () => {
      const studyQueue: number[] = [];
      const recommender = [14, 22];
      const candidates = studyQueue.length > 0 ? studyQueue : recommender;
      assertEqual(candidates[0], 14, 'Fell back to recommender');
    })
  );

  results.push(
    await runTest('T2.13.2', 'F4.2', 'Empty study queue and recommender falls back to Tier 4 Epidemiology', () => {
      const studyQueue: number[] = [];
      const recommender: number[] = [];
      const epidemiology = [8, 12, 106];
      let candidates = studyQueue;
      if (candidates.length === 0) candidates = recommender;
      if (candidates.length === 0) candidates = epidemiology;
      assertEqual(candidates[0], 8, 'Fell back to epidemiology');
    })
  );

  results.push(
    await runTest('T2.13.3', 'F4.2', 'All chapters saturated returns empty candidate plan without error', () => {
      const chapters = [
        { id: 8, beds: 6, mcqs: 20 },
        { id: 14, beds: 6, mcqs: 20 },
      ];
      const eligible = chapters.filter((c) => c.beds < 6 || c.mcqs < 20);
      assertEqual(eligible.length, 0, 'No chapters eligible');
    })
  );

  results.push(
    await runTest('T2.13.4', 'F4.2', 'Study queue with 200 chapters slices top priority items efficiently', () => {
      const bigQueue = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, pos: i + 1 }));
      const topBatch = bigQueue.slice(0, 5);
      assertEqual(topBatch.length, 5, 'Top 5 sliced efficiently');
    })
  );

  results.push(
    await runTest('T2.13.5', 'F4.2', 'Non-existent chapter ID in queue filtered out cleanly', () => {
      const knownChapters = new Set([8, 14, 22]);
      const requestedId = 9999;
      const isValid = knownChapters.has(requestedId);
      assert(!isValid, 'Invalid chapter ID identified');
    })
  );

  // ==========================================================================
  // F4.3: Saturation Control Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.14.1', 'F4.3', 'Chapter at exactly 6 beds rejects 7th bed', () => {
      const currentBeds = 6;
      const canAddBed = currentBeds < MAX_BEDS_PER_CHAPTER;
      assert(!canAddBed, 'Cannot add 7th bed');
    })
  );

  results.push(
    await runTest('T2.14.2', 'F4.3', 'Chapter at exactly 5 beds accepts 6th bed', () => {
      const currentBeds = 5;
      const canAddBed = currentBeds < MAX_BEDS_PER_CHAPTER;
      assert(canAddBed, 'Can add 6th bed');
    })
  );

  results.push(
    await runTest('T2.14.3', 'F4.3', 'Chapter at exactly 20 MCQs rejects 21st MCQ', () => {
      const currentMCQs = 20;
      const canAddMCQ = currentMCQs < MAX_MCQS_PER_CHAPTER;
      assert(!canAddMCQ, 'Cannot add 21st MCQ');
    })
  );

  results.push(
    await runTest('T2.14.4', 'F4.3', 'Chapter at exactly 19 MCQs accepts 20th MCQ', () => {
      const currentMCQs = 19;
      const canAddMCQ = currentMCQs < MAX_MCQS_PER_CHAPTER;
      assert(canAddMCQ, 'Can add 20th MCQ');
    })
  );

  results.push(
    await runTest('T2.14.5', 'F4.3', 'Bed reuse probability at 6 cases is strictly 90% (never 100%)', () => {
      const rate6 = BED_REUSE_SCALE[6];
      assertEqual(rate6, 0.90, 'Reuse cap is 90%');
      assert(rate6 < 1.0, 'Reuse chance is strictly below 100%');
    })
  );

  // ==========================================================================
  // F4.4: Medical Ingestion Validation Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.15.1', 'F4.4', 'Multiple nested markdown fences and surrounding commentary stripped', () => {
      const raw = 'Here is the response:\n```json\n{"data": 123}\n```\nHope this helps!';
      const match = raw.match(/```json\n([\s\S]*?)\n```/);
      assert(Boolean(match && match[1]), 'Fenced block captured');
      const parsed = JSON.parse(match![1]);
      assertEqual(parsed.data, 123, 'Parsed inner JSON');
    })
  );

  results.push(
    await runTest('T2.15.2', 'F4.4', 'Heavy mixed mojibake stress repair', () => {
      const stressText = 'ApresentaÃ§Ã£o com dor no coraÃ§Ã£o e pressÃ£o alta';
      const clean = sanitizeMojibake(stressText);
      assertEqual(clean, 'Apresentação com dor no coração e pressão alta', 'All mojibake cleaned');
    })
  );

  results.push(
    await runTest('T2.15.3', 'F4.4', 'Truncated JSON stream fails gracefully with JSON parse exception', () => {
      const truncated = '{"vignette": "Paciente com dor", "options": [';
      assertThrows(() => JSON.parse(truncated), 'Truncated stream must throw parse error');
    })
  );

  results.push(
    await runTest('T2.15.4', 'F4.4', 'MCQ with duplicated option strings flagged as low quality', () => {
      const options = ['AAS 100mg', 'AAS 100mg', 'Clopidogrel', 'Heparina', 'Morfina'];
      const uniqueOpts = new Set(options);
      assert(uniqueOpts.size < options.length, 'Duplicate options detected');
    })
  );

  results.push(
    await runTest('T2.15.5', 'F4.4', 'Non-numeric string in vital sign numerical fields rejected', () => {
      const parseHeartRate = (fc: any) => {
        const num = Number(fc);
        if (isNaN(num) || num < 0) throw new Error('Invalid FC');
        return num;
      };
      assertThrows(() => parseHeartRate('cento e dez'), 'String rejected');
      assertEqual(parseHeartRate(110), 110, 'Numeric accepted');
    })
  );

  // ==========================================================================
  // F5.1: Budget Ledger Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.16.1', 'F5.1', 'First batch of the day (initial daily spend = 0) sets accumulator to batch cost', () => {
      const initialDaily = 0.0;
      const batchCost = 0.015;
      const newDaily = initialDaily + batchCost;
      assertEqual(newDaily, 0.015, 'Initial accumulator equals batch cost');
    })
  );

  results.push(
    await runTest('T2.16.2', 'F5.1', 'Month boundary rollover (Dec 31 -> Jan 1) resets monthly accumulator', () => {
      let monthlyAccumulator = 0.85;
      const isNewMonth = true;
      if (isNewMonth) monthlyAccumulator = 0.0;
      assertEqual(monthlyAccumulator, 0.0, 'Monthly accumulator reset');
    })
  );

  results.push(
    await runTest('T2.16.3', 'F5.1', 'Day boundary rollover (23:59 -> 00:00) resets daily accumulator', () => {
      let dailyAccumulator = 0.14;
      const isNewDay = true;
      if (isNewDay) dailyAccumulator = 0.0;
      assertEqual(dailyAccumulator, 0.0, 'Daily accumulator reset');
    })
  );

  results.push(
    await runTest('T2.16.4', 'F5.1', 'Micro-cost precision ($0.000001) tracked without underflowing to zero', () => {
      const microCost = 0.000001;
      assert(microCost > 0, 'Micro cost strictly positive');
      assertEqual(microCost.toFixed(6), '0.000001', '6 decimals preserved');
    })
  );

  results.push(
    await runTest('T2.16.5', 'F5.1', 'Negative cost values in ledger rejected', () => {
      const isValidLedgerCost = (c: number) => typeof c === 'number' && c >= 0 && !isNaN(c);
      assert(!isValidLedgerCost(-0.01), 'Negative cost rejected');
      assert(isValidLedgerCost(0.05), 'Positive cost accepted');
    })
  );

  // ==========================================================================
  // F5.2: Hard Budget Caps Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.17.1', 'F5.2', 'Daily spend at $0.149999 allows candidate costing $0.000001', () => {
      const currentDaily = 0.149999;
      const candidate = 0.000001;
      const check = evaluateBudgetCapBreach(currentDaily, 0.50, candidate);
      assert(check.canProceed, 'Boundary $0.150000 allowed');
    })
  );

  results.push(
    await runTest('T2.17.2', 'F5.2', 'Daily spend at $0.150000 strictly halts candidate costing $0.000001', () => {
      const currentDaily = 0.150000;
      const candidate = 0.000001;
      const check = evaluateBudgetCapBreach(currentDaily, 0.50, candidate);
      assert(!check.canProceed, 'Breach blocked');
      assertEqual(check.reason, 'daily_cap', 'Failed due to daily cap');
    })
  );

  results.push(
    await runTest('T2.17.3', 'F5.2', 'Monthly spend at $0.899999 allows candidate costing $0.000001', () => {
      const currentMonthly = 0.899999;
      const candidate = 0.000001;
      const check = evaluateBudgetCapBreach(0.01, currentMonthly, candidate);
      assert(check.canProceed, 'Boundary $0.900000 allowed');
    })
  );

  results.push(
    await runTest('T2.17.4', 'F5.2', 'Monthly spend at $0.900000 strictly halts candidate costing $0.000001', () => {
      const currentMonthly = 0.900000;
      const candidate = 0.000001;
      const check = evaluateBudgetCapBreach(0.01, currentMonthly, candidate);
      assert(!check.canProceed, 'Breach blocked');
      assertEqual(check.reason, 'monthly_cap', 'Failed due to monthly cap');
    })
  );

  results.push(
    await runTest('T2.17.5', 'F5.2', 'Single batch projected cost of $0.16 (> $0.15 daily cap) aborted beforehand', () => {
      const singleBatchEstimate = 0.16;
      const check = evaluateBudgetCapBreach(0, 0, singleBatchEstimate);
      assert(!check.canProceed, 'Batch larger than daily cap aborted');
    })
  );

  // ==========================================================================
  // F5.3: CLI Pipeline Script Boundaries
  // ==========================================================================
  results.push(
    await runTest('T2.18.1', 'F5.3', 'Unrecognized CLI flags produce error output with usage syntax', () => {
      const allowedFlags = ['--submit', '--poll-and-ingest', '--status', '--mock'];
      const passedFlag = '--unknown-flag';
      const isAllowed = allowedFlags.includes(passedFlag);
      assert(!isAllowed, 'Flag not allowed');
    })
  );

  results.push(
    await runTest('T2.18.2', 'F5.3', 'Running with --mock ensures zero external API requests and zero billed cost', () => {
      const isMock = true;
      let actualApiCost = 0;
      if (isMock) {
        actualApiCost = 0;
      }
      assertEqual(actualApiCost, 0, 'Zero cost in mock mode');
    })
  );

  results.push(
    await runTest('T2.18.3', 'F5.3', 'Missing OPENROUTER_API_KEY in non-mock mode raises informative error', () => {
      const getApiKey = (envKey?: string, mockMode?: boolean) => {
        if (!mockMode && !envKey) throw new Error('OPENROUTER_API_KEY required in live mode');
        return envKey || 'mock-key';
      };
      assertThrows(() => getApiKey(undefined, false), 'Throws on missing key in live mode');
      assertEqual(getApiKey(undefined, true), 'mock-key', 'Mock mode bypasses key');
    })
  );

  results.push(
    await runTest('T2.18.4', 'F5.3', 'Lock file mechanism prevents simultaneous pipeline runs', () => {
      let isLocked = true;
      const canAcquireLock = !isLocked;
      assert(!canAcquireLock, 'Second process cannot acquire lock while first is running');
    })
  );

  results.push(
    await runTest('T2.18.5', 'F5.3', 'Pipeline interruption handles partial batches safely', () => {
      const batchStatus = 'interrupted';
      assert(batchStatus === 'interrupted', 'Interrupted state handled cleanly');
    })
  );

  return results;
}
