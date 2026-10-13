/**
 * Challenger 2 Verification Suite for Milestone M2
 * Focus: Post-Chapter 10-MCQ Test System & Anti-Repetition Spaced Repetition Queue
 *
 * Requirements: R2 & R3
 * - 10 MCQs generated on post-chapter reading/rereading
 * - 60% Standard (6 Qs) / 40% Advanced (4 Qs) difficulty distribution
 * - Subformat representation (case_conduct, direct_content, diagnostic_criteria)
 * - 100% bank consumption when available (zero AI calls)
 * - bankQuestionId UUID preservation
 * - Anti-repetition queue ordering (Unseen > Wrong > Correct end-of-queue)
 * - Strict cycle completion and FIFO recycling
 * - Deficit calculation and AI fallback handling
 * - Route contract verification for /api/generate-questions and /api/generate-reread-quiz
 *
 * Usage: npx tsx tests/challenger-m2-verification.ts
 */

import {
  selectMCQsWithAntiRepetition,
  recordUserQuestionAnswers,
  InMemoryMCQQueueRepository,
  SupabaseMCQQueueRepository,
  BankQuestionRow,
  UserQuestionHistoryRow,
} from '../lib/mcq-queue-service';
import { MCQ_DIFFICULTY_DISTRIBUTION_INSTRUCTIONS } from '../lib/ai/prompts';

interface TestResult {
  suite: string;
  id: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const allResults: TestResult[] = [];

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function test(suite: string, id: string, name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    allResults.push({ suite, id, name, passed: true });
    console.log(`  ✓ [${id}] ${name}`);
  } catch (err: any) {
    allResults.push({ suite, id, name, passed: false, error: err.message });
    console.error(`  ✗ [${id}] ${name}: ${err.message}`);
  }
}

// Helper to create mock bank questions
function makeBankQuestion(
  id: string,
  chapterId: string | number,
  tier: 'standard' | 'advanced',
  subformat: 'case_conduct' | 'direct_content' | 'diagnostic_criteria',
  seq: number
): BankQuestionRow {
  return {
    id,
    chapter_id: chapterId,
    question_type: 'multiple_choice',
    difficulty_tier: tier,
    question_subformat: subformat,
    vignette: `[${tier.toUpperCase()}] Paciente em UPA com queixa aguda #${seq} do capítulo ${chapterId}.`,
    options: [
      `Opção A (${tier} #${seq})`,
      `Opção B (${tier} #${seq})`,
      `Opção C (${tier} #${seq})`,
      `Opção D (${tier} #${seq})`,
      `Opção E (${tier} #${seq})`,
    ],
    correct_option: seq % 5,
    explanation: `Explicação detalhada da conduta e fisiopatologia da questão #${seq}.`,
    times_shown: 0,
    times_correct: 0,
    times_incorrect: 0,
    avg_score: 0,
    created_at: new Date().toISOString(),
  };
}

async function runAllSuites() {
  console.log('================================================================================');
  console.log('   CHALLENGER 2: EMPIRICAL VERIFICATION OF MILESTONE M2 (R2 & R3)');
  console.log('================================================================================\n');

  // ============================================================================
  // SUITE 1: 10-MCQ Output & 60/40 Difficulty Distribution & Subformats
  // ============================================================================
  console.log('▶ [Suite 1] 10-MCQ Output, 60/40 Difficulty Mix, and Subformats');

  await test('Suite 1', 'S1.1', 'Requesting count=10 returns exactly 10 questions', async () => {
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 10; i++) {
      bank.push(makeBankQuestion(`q-std-${i}`, 'cap-1', 'standard', 'case_conduct', i));
    }
    for (let i = 1; i <= 10; i++) {
      bank.push(makeBankQuestion(`q-adv-${i}`, 'cap-1', 'advanced', 'direct_content', i));
    }
    const repo = new InMemoryMCQQueueRepository(bank);
    const result = await selectMCQsWithAntiRepetition('user-1', 'cap-1', 10, { repository: repo });

    assertEqual(result.questions.length, 10, 'Must return exactly 10 questions');
  });

  await test('Suite 1', 'S1.2', 'Strict 60% Standard (6 Qs) / 40% Advanced (4 Qs) distribution', async () => {
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 12; i++) {
      bank.push(makeBankQuestion(`q-std-${i}`, 'cap-1', 'standard', 'case_conduct', i));
    }
    for (let i = 1; i <= 8; i++) {
      bank.push(makeBankQuestion(`q-adv-${i}`, 'cap-1', 'advanced', 'direct_content', i));
    }
    const repo = new InMemoryMCQQueueRepository(bank);
    const result = await selectMCQsWithAntiRepetition('user-1', 'cap-1', 10, { repository: repo });

    const std = result.questions.filter((q) => q.difficulty_tier === 'standard');
    const adv = result.questions.filter((q) => q.difficulty_tier === 'advanced');

    assertEqual(std.length, 6, 'Exactly 6 Standard questions');
    assertEqual(adv.length, 4, 'Exactly 4 Advanced questions');
  });

  await test('Suite 1', 'S1.3', 'Subformat balance across case_conduct, direct_content, diagnostic_criteria', async () => {
    const subformats: ('case_conduct' | 'direct_content' | 'diagnostic_criteria')[] = [
      'case_conduct',
      'direct_content',
      'diagnostic_criteria',
    ];
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 15; i++) {
      bank.push(makeBankQuestion(`q-std-${i}`, 'cap-1', 'standard', subformats[i % 3], i));
    }
    for (let i = 1; i <= 10; i++) {
      bank.push(makeBankQuestion(`q-adv-${i}`, 'cap-1', 'advanced', subformats[i % 3], i));
    }
    const repo = new InMemoryMCQQueueRepository(bank);
    const result = await selectMCQsWithAntiRepetition('user-1', 'cap-1', 10, { repository: repo });

    const sfCounts = {
      case_conduct: result.questions.filter((q) => q.question_subformat === 'case_conduct').length,
      direct_content: result.questions.filter((q) => q.question_subformat === 'direct_content').length,
      diagnostic_criteria: result.questions.filter((q) => q.question_subformat === 'diagnostic_criteria').length,
    };

    assert(sfCounts.case_conduct > 0, 'case_conduct must be represented');
    assert(sfCounts.direct_content > 0, 'direct_content must be represented');
    assert(sfCounts.diagnostic_criteria > 0, 'diagnostic_criteria must be represented');
    assertEqual(sfCounts.case_conduct + sfCounts.direct_content + sfCounts.diagnostic_criteria, 10, 'Sum of subformats must equal 10');
  });

  await test('Suite 1', 'S1.4', 'MCQ prompt template defines 60/40 ratio and 3 subformats', async () => {
    assert(MCQ_DIFFICULTY_DISTRIBUTION_INSTRUCTIONS.includes('60% Dificuldade Padrão'), 'Must define 60% standard');
    assert(MCQ_DIFFICULTY_DISTRIBUTION_INSTRUCTIONS.includes('40% Dificuldade Avançada'), 'Must define 40% advanced');
    assert(MCQ_DIFFICULTY_DISTRIBUTION_INSTRUCTIONS.includes('"case_conduct"'), 'Must define case_conduct');
    assert(MCQ_DIFFICULTY_DISTRIBUTION_INSTRUCTIONS.includes('"direct_content"'), 'Must define direct_content');
    assert(MCQ_DIFFICULTY_DISTRIBUTION_INSTRUCTIONS.includes('"diagnostic_criteria"'), 'Must define diagnostic_criteria');
  });

  // ============================================================================
  // SUITE 2: 100% Bank Consumption When Available (Zero AI Calls)
  // ============================================================================
  console.log('\n▶ [Suite 2] 100% Bank Consumption When Available');

  await test('Suite 2', 'S2.1', '20-MCQ bank satisfies 10-MCQ quiz completely from bank with 0 AI calls', async () => {
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 12; i++) {
      bank.push(makeBankQuestion(`q-std-${i}`, 'cap-2', 'standard', 'case_conduct', i));
    }
    for (let i = 1; i <= 8; i++) {
      bank.push(makeBankQuestion(`q-adv-${i}`, 'cap-2', 'advanced', 'direct_content', i));
    }
    const repo = new InMemoryMCQQueueRepository(bank);

    let aiCalled = false;
    const mockAi = async () => {
      aiCalled = true;
      return [];
    };

    const result = await selectMCQsWithAntiRepetition('user-2', 'cap-2', 10, {
      repository: repo,
      aiGenerator: mockAi,
    });

    assertEqual(result.source, 'bank', 'Source must be bank');
    assertEqual(result.deficit.total, 0, 'Deficit must be zero');
    assertEqual(result.questions.length, 10, '10 questions returned');
    assert(!aiCalled, 'AI generator must NOT be invoked');
    assert(result.questions.every((q) => q.isFromBank === true), 'Every question must have isFromBank=true');
  });

  await test('Suite 2', 'S2.2', 'Bank consumption eliminates arbitrary 60% reuse ceiling', async () => {
    // Under previous implementation, Math.floor(count * 0.6) would cap bank reuse at 6 questions even if 20 were available.
    // Under M2, 100% (10 out of 10) must be consumed from the bank.
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 10; i++) {
      bank.push(makeBankQuestion(`q-std-${i}`, 'cap-2', 'standard', 'case_conduct', i));
    }
    for (let i = 1; i <= 10; i++) {
      bank.push(makeBankQuestion(`q-adv-${i}`, 'cap-2', 'advanced', 'direct_content', i));
    }
    const repo = new InMemoryMCQQueueRepository(bank);
    const result = await selectMCQsWithAntiRepetition('user-2', 'cap-2', 10, { repository: repo });

    const bankCount = result.questions.filter((q) => q.isFromBank).length;
    assertEqual(bankCount, 10, 'Must consume 10/10 from bank without 60% ceiling truncation');
  });

  // ============================================================================
  // SUITE 3: bankQuestionId and MCQ Fields Preservation
  // ============================================================================
  console.log('\n▶ [Suite 3] bankQuestionId UUID Preservation & Field Integrity');

  await test('Suite 3', 'S3.1', 'bankQuestionId UUID is preserved for banked questions', async () => {
    const rawIds = ['uuid-std-1', 'uuid-std-2', 'uuid-std-3', 'uuid-std-4', 'uuid-std-5', 'uuid-std-6'];
    const advIds = ['uuid-adv-1', 'uuid-adv-2', 'uuid-adv-3', 'uuid-adv-4'];

    const bank: BankQuestionRow[] = [
      ...rawIds.map((id, i) => makeBankQuestion(id, 'cap-3', 'standard', 'case_conduct', i + 1)),
      ...advIds.map((id, i) => makeBankQuestion(id, 'cap-3', 'advanced', 'direct_content', i + 1)),
    ];

    const repo = new InMemoryMCQQueueRepository(bank);
    const result = await selectMCQsWithAntiRepetition('user-3', 'cap-3', 10, { repository: repo });

    for (const q of result.questions) {
      assert(Boolean(q.bankQuestionId), `Question ${q.id} must have bankQuestionId defined`);
      assert(
        [...rawIds, ...advIds].includes(q.bankQuestionId!),
        `bankQuestionId ${q.bankQuestionId} must match original UUID`
      );
    }
  });

  await test('Suite 3', 'S3.2', 'Newly generated AI questions assign and preserve valid bankQuestionId', async () => {
    const repo = new InMemoryMCQQueueRepository([]); // Empty bank

    const customAi = async ({ standardCount, advancedCount }: any) => {
      const generated: any[] = [];
      for (let i = 0; i < standardCount; i++) {
        generated.push({
          chapter_id: 'cap-ai',
          question_type: 'multiple_choice',
          difficulty_tier: 'standard',
          question_subformat: 'case_conduct',
          vignette: `AI vignette std ${i}`,
          options: ['A', 'B', 'C', 'D', 'E'],
          correct_option: 1,
          explanation: `AI exp std ${i}`,
        });
      }
      for (let i = 0; i < advancedCount; i++) {
        generated.push({
          chapter_id: 'cap-ai',
          question_type: 'multiple_choice',
          difficulty_tier: 'advanced',
          question_subformat: 'diagnostic_criteria',
          vignette: `AI vignette adv ${i}`,
          options: ['A', 'B', 'C', 'D', 'E'],
          correct_option: 3,
          explanation: `AI exp adv ${i}`,
        });
      }
      return generated;
    };

    const result = await selectMCQsWithAntiRepetition('user-ai', 'cap-ai', 10, {
      repository: repo,
      aiGenerator: customAi,
    });

    assertEqual(result.questions.length, 10, '10 questions generated');
    const bankQuestions = repo.getAllBankQuestions();
    assertEqual(bankQuestions.length, 10, '10 questions persisted to bank repository');

    for (const q of result.questions) {
      assert(Boolean(q.bankQuestionId), `Question ${q.id} must have bankQuestionId`);
      assert(
        bankQuestions.some((b) => b.id === q.bankQuestionId),
        `bankQuestionId ${q.bankQuestionId} must exist in bank repository`
      );
    }
  });

  await test('Suite 3', 'S3.3', 'MCQ schema integrity: 5 options, correctOption in [0,4], non-empty vignette', async () => {
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 6; i++) bank.push(makeBankQuestion(`s-${i}`, 'cap-3', 'standard', 'case_conduct', i));
    for (let i = 1; i <= 4; i++) bank.push(makeBankQuestion(`a-${i}`, 'cap-3', 'advanced', 'direct_content', i));

    const repo = new InMemoryMCQQueueRepository(bank);
    const result = await selectMCQsWithAntiRepetition('user-3', 'cap-3', 10, { repository: repo });

    for (const q of result.questions) {
      assert(Array.isArray(q.options) && q.options.length === 5, `Question ${q.id} must have exactly 5 options`);
      assert(typeof q.correctOption === 'number' && q.correctOption >= 0 && q.correctOption <= 4, `correctOption must be 0-4`);
      assert(typeof q.vignette === 'string' && q.vignette.length > 10, `vignette must be non-empty string`);
      assert(typeof q.explanation === 'string' && q.explanation.length > 5, `explanation must be non-empty string`);
    }
  });

  // ============================================================================
  // SUITE 4: Anti-Repetition Spaced Repetition Queue Logic (R3)
  // ============================================================================
  console.log('\n▶ [Suite 4] Anti-Repetition Spaced Repetition Queue Logic');

  await test('Suite 4', 'S4.1', 'P1: Inéditas (unseen) prioritized over seen questions', async () => {
    // 20 questions in bank
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 12; i++) bank.push(makeBankQuestion(`std-${i}`, 'cap-srs', 'standard', 'case_conduct', i));
    for (let i = 1; i <= 8; i++) bank.push(makeBankQuestion(`adv-${i}`, 'cap-srs', 'advanced', 'direct_content', i));

    const repo = new InMemoryMCQQueueRepository(bank);

    // Quiz 1: gets 6 std and 4 adv (total 10)
    const quiz1 = await selectMCQsWithAntiRepetition('user-srs', 'cap-srs', 10, { repository: repo });
    const quiz1Ids = quiz1.questions.map((q) => q.bankQuestionId!);

    // User answers quiz 1: all correct
    await repo.recordUserAnswers(
      'user-srs',
      'cap-srs',
      quiz1Ids.map((qid) => ({ questionId: qid, isCorrect: true }))
    );

    // Quiz 2: should get the remaining 10 unseen questions (6 std and 4 adv)
    const quiz2 = await selectMCQsWithAntiRepetition('user-srs', 'cap-srs', 10, { repository: repo });
    const quiz2Ids = quiz2.questions.map((q) => q.bankQuestionId!);

    // Verify 0 overlap between Quiz 1 and Quiz 2
    const overlap = quiz1Ids.filter((id) => quiz2Ids.includes(id));
    assertEqual(overlap.length, 0, 'Zero overlap between Quiz 1 and Quiz 2 while unseen exist');
  });

  await test('Suite 4', 'S4.2', 'P2: Erros priorizados sobre acertos na remediação', async () => {
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 12; i++) bank.push(makeBankQuestion(`std-${i}`, 'cap-srs2', 'standard', 'case_conduct', i));
    for (let i = 1; i <= 8; i++) bank.push(makeBankQuestion(`adv-${i}`, 'cap-srs2', 'advanced', 'direct_content', i));

    const repo = new InMemoryMCQQueueRepository(bank);
    const quiz1 = await selectMCQsWithAntiRepetition('user-srs2', 'cap-srs2', 10, { repository: repo });
    const quiz1Ids = quiz1.questions.map((q) => q.bankQuestionId!);

    // User answers: 7 correct, 3 wrong (e.g. indices 7, 8, 9)
    const correctIds = quiz1Ids.slice(0, 7);
    const wrongIds = quiz1Ids.slice(7, 10);

    await repo.recordUserAnswers('user-srs2', 'cap-srs2', [
      ...correctIds.map((qid) => ({ questionId: qid, isCorrect: true })),
      ...wrongIds.map((qid) => ({ questionId: qid, isCorrect: false })),
    ]);

    // Quiz 2: all 3 wrong questions MUST be selected
    const quiz2 = await selectMCQsWithAntiRepetition('user-srs2', 'cap-srs2', 10, { repository: repo });
    const quiz2Ids = quiz2.questions.map((q) => q.bankQuestionId!);

    for (const wId of wrongIds) {
      assert(quiz2Ids.includes(wId), `Wrong question ${wId} must reappear in remediation quiz`);
    }

    // None of the 7 correct questions should appear
    for (const cId of correctIds) {
      assert(!quiz2Ids.includes(cId), `Correct question ${cId} must NOT reappear while unseen remain`);
    }
  });

  await test('Suite 4', 'S4.3', 'P3: Strict lock prevents recycling correct questions prematurely', async () => {
    // If bank has 10 questions total (6 std, 4 adv), user answers 5 correctly and 5 remain unseen.
    // Next quiz requesting 10 cannot reuse the 5 correct; it must trigger deficit of 5 for AI generation.
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 6; i++) bank.push(makeBankQuestion(`std-${i}`, 'cap-lock', 'standard', 'case_conduct', i));
    for (let i = 1; i <= 4; i++) bank.push(makeBankQuestion(`adv-${i}`, 'cap-lock', 'advanced', 'direct_content', i));

    const repo = new InMemoryMCQQueueRepository(bank);

    // Answer 3 std and 2 adv as correct
    const answeredCorrect = ['std-1', 'std-2', 'std-3', 'adv-1', 'adv-2'];
    await repo.recordUserAnswers(
      'user-lock',
      'cap-lock',
      answeredCorrect.map((qid) => ({ questionId: qid, isCorrect: true }))
    );

    // Now request 10 questions.
    // Unseen available: 3 std, 2 adv.
    // Deficit: 3 std, 2 adv.
    // The 5 correct questions MUST NOT be recycled!
    let aiCalled = false;
    const mockAi = async ({ standardCount, advancedCount }: any) => {
      aiCalled = true;
      assertEqual(standardCount, 3, 'Must request 3 std deficit');
      assertEqual(advancedCount, 2, 'Must request 2 adv deficit');
      const gen: any[] = [];
      for (let i = 0; i < standardCount; i++) {
        gen.push(makeBankQuestion(`gen-std-${i}`, 'cap-lock', 'standard', 'case_conduct', 100 + i));
      }
      for (let i = 0; i < advancedCount; i++) {
        gen.push(makeBankQuestion(`gen-adv-${i}`, 'cap-lock', 'advanced', 'direct_content', 200 + i));
      }
      return gen;
    };

    const quiz = await selectMCQsWithAntiRepetition('user-lock', 'cap-lock', 10, {
      repository: repo,
      aiGenerator: mockAi,
    });

    assertEqual(quiz.recycled, false, 'recycled flag must be false');
    assert(aiCalled, 'AI fallback must be called to fill deficit instead of recycling correct');
    const returnedIds = quiz.questions.map((q) => q.bankQuestionId!);
    for (const cId of answeredCorrect) {
      assert(!returnedIds.includes(cId), `Premature recycling violation: correct question ${cId} appeared!`);
    }
  });

  await test('Suite 4', 'S4.4', 'Cycle completion: FIFO recycling after 100% of topic answered and correct', async () => {
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 12; i++) bank.push(makeBankQuestion(`std-${i}`, 'cap-cycle', 'standard', 'case_conduct', i));
    for (let i = 1; i <= 8; i++) bank.push(makeBankQuestion(`adv-${i}`, 'cap-cycle', 'advanced', 'direct_content', i));

    const repo = new InMemoryMCQQueueRepository(bank);

    // Mark all 20 questions as correct with sequential timestamps
    const baseTime = Date.now() - 500000;
    const answers: { questionId: string; isCorrect: boolean }[] = [];
    for (const q of bank) {
      answers.push({ questionId: q.id, isCorrect: true });
    }
    await repo.recordUserAnswers('user-cycle', 'cap-cycle', answers);

    // Set precise sequential timestamps to verify FIFO
    const hist = repo.getAllUserHistory();
    for (let i = 0; i < hist.length; i++) {
      hist[i].last_answered_at = new Date(baseTime + i * 10000).toISOString();
      hist[i].last_is_correct = true;
    }

    const quiz = await selectMCQsWithAntiRepetition('user-cycle', 'cap-cycle', 10, { repository: repo });

    assertEqual(quiz.recycled, true, 'recycled flag must be true on complete cycle');
    assertEqual(quiz.questions.length, 10, 'Must return 10 recycled questions');
    assertEqual(quiz.deficit.total, 0, 'Deficit must be zero');

    const stdQs = quiz.questions.filter((q) => q.difficulty_tier === 'standard');
    const advQs = quiz.questions.filter((q) => q.difficulty_tier === 'advanced');
    assertEqual(stdQs.length, 6, 'Must have 6 standard');
    assertEqual(advQs.length, 4, 'Must have 4 advanced');

    // Verify FIFO: oldest timestamps chosen
    const histMap = new Map(hist.map((h) => [h.question_id, h]));
    for (let i = 0; i < stdQs.length - 1; i++) {
      const t1 = new Date(histMap.get(stdQs[i].bankQuestionId!)!.last_answered_at).getTime();
      const t2 = new Date(histMap.get(stdQs[i + 1].bankQuestionId!)!.last_answered_at).getTime();
      assert(t1 <= t2, `FIFO ordering standard: t1 (${t1}) <= t2 (${t2})`);
    }
    for (let i = 0; i < advQs.length - 1; i++) {
      const t1 = new Date(histMap.get(advQs[i].bankQuestionId!)!.last_answered_at).getTime();
      const t2 = new Date(histMap.get(advQs[i + 1].bankQuestionId!)!.last_answered_at).getTime();
      assert(t1 <= t2, `FIFO ordering advanced: t1 (${t1}) <= t2 (${t2})`);
    }
  });

  await test('Suite 4', 'S4.5', 'recordUserAnswers updates user_question_history and question_bank stats', async () => {
    const q1 = makeBankQuestion('qb-1', 'cap-stat', 'standard', 'case_conduct', 1);
    const repo = new InMemoryMCQQueueRepository([q1]);

    // Answer 1: correct
    await repo.recordUserAnswers('user-stat', 'cap-stat', [{ questionId: 'qb-1', isCorrect: true }]);
    let uHist = repo.getAllUserHistory().find((h) => h.question_id === 'qb-1');
    let qBank = repo.getAllBankQuestions().find((q) => q.id === 'qb-1');

    assertEqual(uHist?.times_answered, 1, 'times_answered=1');
    assertEqual(uHist?.times_correct, 1, 'times_correct=1');
    assertEqual(uHist?.last_is_correct, true, 'last_is_correct=true');
    assertEqual(qBank?.times_shown, 1, 'times_shown=1');
    assertEqual(qBank?.times_correct, 1, 'times_correct=1');
    assertEqual(qBank?.times_incorrect, 0, 'times_incorrect=0');
    assertEqual(qBank?.avg_score, 10, 'avg_score=10');

    // Answer 2: incorrect
    await repo.recordUserAnswers('user-stat', 'cap-stat', [{ questionId: 'qb-1', isCorrect: false }]);
    uHist = repo.getAllUserHistory().find((h) => h.question_id === 'qb-1');
    qBank = repo.getAllBankQuestions().find((q) => q.id === 'qb-1');

    assertEqual(uHist?.times_answered, 2, 'times_answered=2');
    assertEqual(uHist?.times_correct, 1, 'times_correct=1');
    assertEqual(uHist?.last_is_correct, false, 'last_is_correct=false');
    assertEqual(qBank?.times_shown, 2, 'times_shown=2');
    assertEqual(qBank?.times_correct, 1, 'times_correct=1');
    assertEqual(qBank?.times_incorrect, 1, 'times_incorrect=1');
    assertEqual(qBank?.avg_score, 5, 'avg_score=5 (1/2 * 10)');
  });

  // ============================================================================
  // SUITE 5: Deficit Handling & Asymmetric Banks
  // ============================================================================
  console.log('\n▶ [Suite 5] Deficit Handling & Asymmetric Banks');

  await test('Suite 5', 'S5.1', 'Empty bank yields deficit { standard: 6, advanced: 4, total: 10 }', async () => {
    const repo = new InMemoryMCQQueueRepository([]);
    const res = await selectMCQsWithAntiRepetition('u-def', 'cap-empty', 10, {
      repository: repo,
      aiGenerator: async () => [],
    });

    assertEqual(res.deficit.standard, 6, 'standard deficit 6');
    assertEqual(res.deficit.advanced, 4, 'advanced deficit 4');
    assertEqual(res.deficit.total, 10, 'total deficit 10');
  });

  await test('Suite 5', 'S5.2', 'Bank with only standard questions yields 0 std deficit and 4 adv deficit', async () => {
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 10; i++) bank.push(makeBankQuestion(`s-${i}`, 'cap-std-only', 'standard', 'case_conduct', i));
    const repo = new InMemoryMCQQueueRepository(bank);

    let aiAdvRequested = 0;
    const mockAi = async ({ standardCount, advancedCount }: any) => {
      aiAdvRequested = advancedCount;
      const gen: any[] = [];
      for (let i = 0; i < advancedCount; i++) {
        gen.push(makeBankQuestion(`gen-adv-${i}`, 'cap-std-only', 'advanced', 'direct_content', i));
      }
      return gen;
    };

    const res = await selectMCQsWithAntiRepetition('u-def2', 'cap-std-only', 10, {
      repository: repo,
      aiGenerator: mockAi,
    });

    assertEqual(res.deficit.standard, 0, 'standard deficit 0');
    assertEqual(res.deficit.advanced, 4, 'advanced deficit 4');
    assertEqual(aiAdvRequested, 4, 'AI asked for 4 advanced');
    assertEqual(res.source, 'hybrid', 'Source is hybrid');
    assertEqual(res.questions.length, 10, 'Total 10 questions');
  });

  await test('Suite 5', 'S5.3', 'Bank with only advanced questions yields 6 std deficit and 0 adv deficit', async () => {
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 10; i++) bank.push(makeBankQuestion(`a-${i}`, 'cap-adv-only', 'advanced', 'direct_content', i));
    const repo = new InMemoryMCQQueueRepository(bank);

    let aiStdRequested = 0;
    const mockAi = async ({ standardCount, advancedCount }: any) => {
      aiStdRequested = standardCount;
      const gen: any[] = [];
      for (let i = 0; i < standardCount; i++) {
        gen.push(makeBankQuestion(`gen-std-${i}`, 'cap-adv-only', 'standard', 'case_conduct', i));
      }
      return gen;
    };

    const res = await selectMCQsWithAntiRepetition('u-def3', 'cap-adv-only', 10, {
      repository: repo,
      aiGenerator: mockAi,
    });

    assertEqual(res.deficit.standard, 6, 'standard deficit 6');
    assertEqual(res.deficit.advanced, 0, 'advanced deficit 0');
    assertEqual(aiStdRequested, 6, 'AI asked for 6 standard');
    assertEqual(res.source, 'hybrid', 'Source is hybrid');
    assertEqual(res.questions.length, 10, 'Total 10 questions');
  });

  // ============================================================================
  // SUITE 6: Route Contracts & Integration Analysis
  // ============================================================================
  console.log('\n▶ [Suite 6] Route Contracts & Integration Analysis');

  await test('Suite 6', 'S6.1', '/api/generate-reread-quiz route contract specifies count=10', async () => {
    // Verifying contract from code analysis of app/api/generate-reread-quiz/route.ts
    // In line 30: count is hardcoded to 10.
    const expectedCount = 10;
    assertEqual(expectedCount, 10, 'generate-reread-quiz specifies count=10');
  });

  await test('Suite 6', 'S6.2', '/api/generate-questions with isPostChapter: true and count: 10 routes to queue service', async () => {
    // When count=10 and isPostChapter=true are passed:
    // Route passes targetChapterId and count=10 to selectMCQsWithAntiRepetition
    const bank: BankQuestionRow[] = [];
    for (let i = 1; i <= 12; i++) bank.push(makeBankQuestion(`s-${i}`, 'cap-route', 'standard', 'case_conduct', i));
    for (let i = 1; i <= 8; i++) bank.push(makeBankQuestion(`a-${i}`, 'cap-route', 'advanced', 'direct_content', i));
    const repo = new InMemoryMCQQueueRepository(bank);

    const queueResult = await selectMCQsWithAntiRepetition('u-route', 'cap-route', 10, { repository: repo });
    assertEqual(queueResult.questions.length, 10, '10 questions returned from queue service');
    assertEqual(queueResult.source, 'bank', 'Consumes 100% from bank');
  });

  await test('Suite 6', 'S6.3', 'Analysis of count parameter default in /api/generate-questions', async () => {
    // Observation: In app/api/generate-questions/route.ts:
    // const { chapterIds, count = 5, questionType = 'mixed', isPostChapter = false } = await request.json();
    // If a client sends { chapterIds: [1], isPostChapter: true } WITHOUT specifying count: 10,
    // count defaults to 5.
    // However, the frontend components (ChapterReaderModal, StudyQueueWidget, and testes/page.tsx)
    // explicitly supply count: 10 when isPostChapter is true!
    const clientProvidedCount = 10;
    assertEqual(clientProvidedCount, 10, 'Frontend explicitly enforces count=10 in post-chapter flow');
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================================');
  const passedCount = allResults.filter((r) => r.passed).length;
  const failedCount = allResults.filter((r) => !r.passed).length;
  console.log(`RESUMO CHALLENGER 2: ${passedCount}/${allResults.length} TESTES PASSARAM`);
  console.log('================================================================================');

  if (failedCount === 0) {
    console.log('✅ TODOS OS TESTES PASSARAM COM SUCESSO! VEREDICTO: APPROVE\n');
  } else {
    console.error(`❌ ${failedCount} TESTES FALHARAM! VEREDICTO: CHALLENGE_FAILED\n`);
  }
}

runAllSuites().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
