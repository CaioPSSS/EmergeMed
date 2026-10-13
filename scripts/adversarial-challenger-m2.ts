/**
 * Empirical Challenger Suite for Milestone M2 (MCQ & Anti-Repetition SRS Queue)
 * Adversarial Stress Tests & Oracles for:
 *
 * 1. Empty bank deficit calculation (6 standard, 4 advanced).
 * 2. Partial bank deficit calculation (e.g., 3 standard, 8 advanced -> generates only missing 3 standard).
 * 3. Priority ordering: Wrong questions prioritized before Unseen questions.
 * 4. Fim da Fila blocking: Correct questions strictly blocked while any unseen or wrong questions remain.
 * 5. Full cycle exhaustion: FIFO recycling ordered by last_answered_at ASC.
 * 6. Asymmetric bank deficits (e.g. 10 std / 0 adv, and 0 std / 10 adv).
 * 7. Variable test counts (count = 2 for Modo Plantão, count = 5, count = 1).
 * 8. Remediation lifecycle: Wrong -> Repeated Wrong -> Corrected -> Fim da Fila.
 * 9. Subformat distribution balance across case_conduct, direct_content, diagnostic_criteria.
 * 10. Multi-user isolation: User A's cycle completion does not pollute User B.
 * 11. Question bank metrics tracking (times_shown, times_correct, times_incorrect, avg_score).
 * 12. bankQuestionId integrity and contract compliance.
 */

import {
  selectMCQsWithAntiRepetition,
  recordUserQuestionAnswers,
  InMemoryMCQQueueRepository,
  BankQuestionRow,
  UserQuestionHistoryRow,
} from '../lib/mcq-queue-service';

interface TestSummary {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  details?: string;
}

const testResults: TestSummary[] = [];

function check(id: string, category: string, name: string, condition: boolean, details?: string): void {
  if (condition) {
    testResults.push({ id, category, name, passed: true });
    console.log(`  [PASS] [${id}] [${category}] ${name}`);
  } else {
    testResults.push({ id, category, name, passed: false, details });
    console.error(`  [FAIL] [${id}] [${category}] ${name} -> ${details || 'Assertion failed'}`);
  }
}

function createMockQuestion(
  id: string,
  chapterId: string,
  tier: 'standard' | 'advanced',
  subformat: 'case_conduct' | 'direct_content' | 'diagnostic_criteria',
  num: number
): BankQuestionRow {
  return {
    id,
    chapter_id: chapterId,
    question_type: 'multiple_choice',
    difficulty_tier: tier,
    question_subformat: subformat,
    vignette: `[${tier.toUpperCase()}][${subformat}] Vinheta #${num} do capítulo ${chapterId}.`,
    options: ['Opção A', 'Opção B', 'Opção C', 'Opção D', 'Opção E'],
    correct_option: 0,
    explanation: `Explicação detalhada #${num}.`,
    times_shown: 0,
    times_correct: 0,
    times_incorrect: 0,
    avg_score: 0,
    created_at: new Date().toISOString(),
  };
}

async function runAdversarialSuite() {
  console.log('================================================================================');
  console.log('   EMPIRICAL CHALLENGER SUITE — MILESTONE M2 (MCQ & ANTI-REPETITION SRS)');
  console.log('================================================================================\n');

  // ============================================================================
  // SUITE 1: Empty Bank & Deficit Oracle
  // ============================================================================
  console.log('--- SUITE 1: Empty Bank & Deficit Oracle ---');
  {
    const repo = new InMemoryMCQQueueRepository();
    let requestedStd = -1;
    let requestedAdv = -1;

    const mockAi = async ({
      standardCount,
      advancedCount,
    }: {
      chapterId: string | number;
      standardCount: number;
      advancedCount: number;
    }) => {
      requestedStd = standardCount;
      requestedAdv = advancedCount;
      const res: Omit<BankQuestionRow, 'id' | 'created_at' | 'updated_at'>[] = [];
      for (let i = 0; i < standardCount; i++) {
        res.push({
          chapter_id: 'cap-empty',
          question_type: 'multiple_choice',
          difficulty_tier: 'standard',
          question_subformat: 'case_conduct',
          vignette: `Std Q ${i}`,
          options: ['A', 'B', 'C', 'D', 'E'],
          correct_option: 0,
          explanation: 'Exp',
        });
      }
      for (let i = 0; i < advancedCount; i++) {
        res.push({
          chapter_id: 'cap-empty',
          question_type: 'multiple_choice',
          difficulty_tier: 'advanced',
          question_subformat: 'direct_content',
          vignette: `Adv Q ${i}`,
          options: ['A', 'B', 'C', 'D', 'E'],
          correct_option: 1,
          explanation: 'Exp',
        });
      }
      return res;
    };

    const res = await selectMCQsWithAntiRepetition('user-1', 'cap-empty', 10, {
      repository: repo,
      aiGenerator: mockAi,
    });

    check(
      'M2-C1.1',
      'Empty Bank',
      'Detects standard deficit = 6',
      res.deficit.standard === 6,
      `Expected 6, got ${res.deficit.standard}`
    );
    check(
      'M2-C1.2',
      'Empty Bank',
      'Detects advanced deficit = 4',
      res.deficit.advanced === 4,
      `Expected 4, got ${res.deficit.advanced}`
    );
    check(
      'M2-C1.3',
      'Empty Bank',
      'Requests exactly 6 std and 4 adv from AI generator',
      requestedStd === 6 && requestedAdv === 4,
      `AI requested std=${requestedStd}, adv=${requestedAdv}`
    );
    check(
      'M2-C1.4',
      'Empty Bank',
      'Source is "generated"',
      res.source === 'generated',
      `Source was ${res.source}`
    );
    check(
      'M2-C1.5',
      'Empty Bank',
      'Saves generated questions into bank repository with bankQuestionId',
      repo.getAllBankQuestions().length === 10 &&
        res.questions.every((q) => Boolean(q.bankQuestionId)),
      `Bank length: ${repo.getAllBankQuestions().length}`
    );
  }

  // ============================================================================
  // SUITE 2: Partial Bank Deficit Oracle (e.g. 3 std, 8 adv)
  // ============================================================================
  console.log('\n--- SUITE 2: Partial Bank Deficit Oracle ---');
  {
    const initialBank: BankQuestionRow[] = [];
    // 3 standard questions
    for (let i = 1; i <= 3; i++) {
      initialBank.push(createMockQuestion(`std-${i}`, 'cap-partial', 'standard', 'case_conduct', i));
    }
    // 8 advanced questions
    for (let i = 1; i <= 8; i++) {
      initialBank.push(createMockQuestion(`adv-${i}`, 'cap-partial', 'advanced', 'direct_content', i));
    }

    const repo = new InMemoryMCQQueueRepository(initialBank);
    let requestedStd = -1;
    let requestedAdv = -1;

    const mockAi = async ({
      standardCount,
      advancedCount,
    }: {
      chapterId: string | number;
      standardCount: number;
      advancedCount: number;
    }) => {
      requestedStd = standardCount;
      requestedAdv = advancedCount;
      const res: Omit<BankQuestionRow, 'id' | 'created_at' | 'updated_at'>[] = [];
      for (let i = 0; i < standardCount; i++) {
        res.push({
          chapter_id: 'cap-partial',
          question_type: 'multiple_choice',
          difficulty_tier: 'standard',
          question_subformat: 'diagnostic_criteria',
          vignette: `Gen Std Q ${i}`,
          options: ['A', 'B', 'C', 'D', 'E'],
          correct_option: 0,
          explanation: 'Exp',
        });
      }
      return res;
    };

    const res = await selectMCQsWithAntiRepetition('user-partial', 'cap-partial', 10, {
      repository: repo,
      aiGenerator: mockAi,
    });

    check(
      'M2-C2.1',
      'Partial Bank',
      'Identifies standard deficit = 3 (target 6 - 3 banked)',
      res.deficit.standard === 3,
      `Expected 3, got ${res.deficit.standard}`
    );
    check(
      'M2-C2.2',
      'Partial Bank',
      'Identifies advanced deficit = 0 (target 4 <= 8 banked)',
      res.deficit.advanced === 0,
      `Expected 0, got ${res.deficit.advanced}`
    );
    check(
      'M2-C2.3',
      'Partial Bank',
      'Requests only 3 standard and 0 advanced from AI generator',
      requestedStd === 3 && requestedAdv === 0,
      `AI requested std=${requestedStd}, adv=${requestedAdv}`
    );
    check(
      'M2-C2.4',
      'Partial Bank',
      'Resulting mix contains exactly 6 standard and 4 advanced questions',
      res.questions.filter((q) => q.difficulty_tier === 'standard').length === 6 &&
        res.questions.filter((q) => q.difficulty_tier === 'advanced').length === 4,
      `Std: ${res.questions.filter((q) => q.difficulty_tier === 'standard').length}, Adv: ${res.questions.filter((q) => q.difficulty_tier === 'advanced').length}`
    );
    check(
      'M2-C2.5',
      'Partial Bank',
      'Source is "hybrid"',
      res.source === 'hybrid',
      `Source was ${res.source}`
    );
    check(
      'M2-C2.6',
      'Partial Bank',
      'Bank now contains 14 questions (11 initial + 3 generated)',
      repo.getAllBankQuestions().length === 14,
      `Bank total: ${repo.getAllBankQuestions().length}`
    );
  }

  // ============================================================================
  // SUITE 3: Priority Ordering — Wrong Questions vs Unseen Questions
  // ============================================================================
  console.log('\n--- SUITE 3: Priority Ordering (Wrong vs Unseen vs Correct) ---');
  {
    // Chapter with 10 standard and 10 advanced questions
    const initialBank: BankQuestionRow[] = [];
    for (let i = 1; i <= 10; i++) {
      initialBank.push(createMockQuestion(`std-prio-${i}`, 'cap-prio', 'standard', 'case_conduct', i));
      initialBank.push(createMockQuestion(`adv-prio-${i}`, 'cap-prio', 'advanced', 'direct_content', i));
    }

    const repo = new InMemoryMCQQueueRepository(initialBank);
    const userId = 'user-prio';

    // Simulate previous attempts:
    // User answered 2 standard questions (std-prio-1, std-prio-2) WRONG
    // User answered 1 standard question (std-prio-3) CORRECT
    // User answered 1 advanced question (adv-prio-1) WRONG
    // User answered 2 advanced questions (adv-prio-2, adv-prio-3) CORRECT
    await repo.recordUserAnswers(userId, 'cap-prio', [
      { questionId: 'std-prio-1', isCorrect: false },
      { questionId: 'std-prio-2', isCorrect: false },
      { questionId: 'std-prio-3', isCorrect: true },
      { questionId: 'adv-prio-1', isCorrect: false },
      { questionId: 'adv-prio-2', isCorrect: true },
      { questionId: 'adv-prio-3', isCorrect: true },
    ]);

    const res = await selectMCQsWithAntiRepetition(userId, 'cap-prio', 10, {
      repository: repo,
    });

    const returnedIds = res.questions.map((q) => q.bankQuestionId);

    check(
      'M2-C3.1',
      'Priority Order',
      'Both wrong standard questions (std-prio-1, std-prio-2) are included',
      returnedIds.includes('std-prio-1') && returnedIds.includes('std-prio-2'),
      `Returned: ${returnedIds.join(', ')}`
    );
    check(
      'M2-C3.2',
      'Priority Order',
      'The wrong advanced question (adv-prio-1) is included',
      returnedIds.includes('adv-prio-1'),
      `Returned: ${returnedIds.join(', ')}`
    );

    // In partition standard: target 6.
    // 2 wrong + 4 unseen = 6 standard.
    const returnedStdIds = res.questions
      .filter((q) => q.difficulty_tier === 'standard')
      .map((q) => q.bankQuestionId);

    // Verify wrong questions are placed before unseen standard questions
    const wrongIdx1 = returnedStdIds.indexOf('std-prio-1');
    const wrongIdx2 = returnedStdIds.indexOf('std-prio-2');
    check(
      'M2-C3.3',
      'Priority Order',
      'Wrong standard questions appear in the selection before unseen standard questions',
      wrongIdx1 < 2 && wrongIdx2 < 2,
      `std-prio-1 idx=${wrongIdx1}, std-prio-2 idx=${wrongIdx2}`
    );

    // Verify correct questions (std-prio-3, adv-prio-2, adv-prio-3) are NOT returned
    check(
      'M2-C3.4',
      'Priority Order',
      'Correct questions are excluded while unseen questions exist',
      !returnedIds.includes('std-prio-3') &&
        !returnedIds.includes('adv-prio-2') &&
        !returnedIds.includes('adv-prio-3'),
      `Contained correct questions: ${returnedIds.filter((id) => ['std-prio-3', 'adv-prio-2', 'adv-prio-3'].includes(id!)).join(', ')}`
    );
  }

  // ============================================================================
  // SUITE 4: Fim da Fila Strictness (Correct Questions Blocked)
  // ============================================================================
  console.log('\n--- SUITE 4: Fim da Fila Strictness ---');
  {
    // Scenario A: 20-question bank. 10 answered correctly, 10 unseen remain.
    const initialBank: BankQuestionRow[] = [];
    for (let i = 1; i <= 12; i++) {
      initialBank.push(createMockQuestion(`std-fdf-${i}`, 'cap-fdf', 'standard', 'case_conduct', i));
    }
    for (let i = 1; i <= 8; i++) {
      initialBank.push(createMockQuestion(`adv-fdf-${i}`, 'cap-fdf', 'advanced', 'direct_content', i));
    }

    const repo = new InMemoryMCQQueueRepository(initialBank);
    const userId = 'user-fdf';

    // User answered 6 std and 4 adv correctly
    const firstQuizAnswers = [
      ...['std-fdf-1', 'std-fdf-2', 'std-fdf-3', 'std-fdf-4', 'std-fdf-5', 'std-fdf-6'].map((id) => ({
        questionId: id,
        isCorrect: true,
      })),
      ...['adv-fdf-1', 'adv-fdf-2', 'adv-fdf-3', 'adv-fdf-4'].map((id) => ({
        questionId: id,
        isCorrect: true,
      })),
    ];
    await repo.recordUserAnswers(userId, 'cap-fdf', firstQuizAnswers);

    const res2 = await selectMCQsWithAntiRepetition(userId, 'cap-fdf', 10, {
      repository: repo,
    });
    const returnedIds2 = res2.questions.map((q) => q.bankQuestionId);
    const answeredIds = firstQuizAnswers.map((a) => a.questionId);

    const overlap = returnedIds2.filter((id) => answeredIds.includes(id!));
    check(
      'M2-C4.1',
      'Fim da Fila',
      'Zero repetition of previously correct questions when unseen questions exist',
      overlap.length === 0,
      `Repeated ${overlap.length} correct questions: ${overlap.join(', ')}`
    );
    check(
      'M2-C4.2',
      'Fim da Fila',
      'recycled flag is false',
      res2.recycled === false,
      `recycled was ${res2.recycled}`
    );

    // Scenario B: 19 questions correct, exactly 1 question wrong!
    // Strictness test: Even with 95% of questions correct, the correct questions
    // CANNOT be recycled until 100% of questions are answered AND correct.
    const answersPartB = [
      ...['std-fdf-7', 'std-fdf-8', 'std-fdf-9', 'std-fdf-10', 'std-fdf-11', 'std-fdf-12'].map((id) => ({
        questionId: id,
        isCorrect: true,
      })),
      ...['adv-fdf-5', 'adv-fdf-6', 'adv-fdf-7'].map((id) => ({
        questionId: id,
        isCorrect: true,
      })),
      // Exactly 1 wrong question
      { questionId: 'adv-fdf-8', isCorrect: false },
    ];
    await repo.recordUserAnswers(userId, 'cap-fdf', answersPartB);

    // In this state: 19 questions correct, 1 wrong. Unseen = 0. Wrong = 1.
    // canRecycleCorrect must be FALSE because isCycleComplete requires !hasAnyWrongInBank.
    const res3 = await selectMCQsWithAntiRepetition(userId, 'cap-fdf', 10, {
      repository: repo,
      aiGenerator: async ({ standardCount, advancedCount }) => {
        // Mock fallback to satisfy deficit
        const res: Omit<BankQuestionRow, 'id' | 'created_at' | 'updated_at'>[] = [];
        for (let i = 0; i < standardCount; i++) {
          res.push({
            chapter_id: 'cap-fdf',
            question_type: 'multiple_choice',
            difficulty_tier: 'standard',
            question_subformat: 'case_conduct',
            vignette: `Deficit Std ${i}`,
            options: ['A', 'B', 'C', 'D', 'E'],
            correct_option: 0,
            explanation: 'Exp',
          });
        }
        for (let i = 0; i < advancedCount; i++) {
          res.push({
            chapter_id: 'cap-fdf',
            question_type: 'multiple_choice',
            difficulty_tier: 'advanced',
            question_subformat: 'direct_content',
            vignette: `Deficit Adv ${i}`,
            options: ['A', 'B', 'C', 'D', 'E'],
            correct_option: 1,
            explanation: 'Exp',
          });
        }
        return res;
      },
    });

    check(
      'M2-C4.3',
      'Fim da Fila',
      'recycled flag is false when 1 question is still wrong',
      res3.recycled === false,
      `recycled was ${res3.recycled}`
    );
    check(
      'M2-C4.4',
      'Fim da Fila',
      'The single wrong question (adv-fdf-8) is selected',
      res3.questions.some((q) => q.bankQuestionId === 'adv-fdf-8'),
      `adv-fdf-8 not found in ${res3.questions.map((q) => q.bankQuestionId).join(', ')}`
    );
    check(
      'M2-C4.5',
      'Fim da Fila',
      'None of the 19 correct questions were prematurely recycled',
      res3.questions.filter((q) => q.isFromBank).length === 1,
      `Selected ${res3.questions.filter((q) => q.isFromBank).length} from bank instead of 1`
    );
  }

  // ============================================================================
  // SUITE 5: Full Cycle Exhaustion & FIFO Recycling
  // ============================================================================
  console.log('\n--- SUITE 5: Full Cycle Exhaustion & FIFO Recycling ---');
  {
    const initialBank: BankQuestionRow[] = [];
    for (let i = 1; i <= 10; i++) {
      initialBank.push(createMockQuestion(`std-fifo-${i}`, 'cap-fifo', 'standard', 'case_conduct', i));
    }
    for (let i = 1; i <= 6; i++) {
      initialBank.push(createMockQuestion(`adv-fifo-${i}`, 'cap-fifo', 'advanced', 'direct_content', i));
    }

    const repo = new InMemoryMCQQueueRepository(initialBank);
    const userId = 'user-fifo';

    // Mark ALL 16 questions as answered and correct with strict ascending timestamps
    const baseTime = 1700000000000;
    const historyRows: UserQuestionHistoryRow[] = [];

    // Standard questions answered in order 1..10
    for (let i = 1; i <= 10; i++) {
      historyRows.push({
        id: `h-std-${i}`,
        user_id: userId,
        question_id: `std-fifo-${i}`,
        chapter_id: 'cap-fifo',
        last_is_correct: true,
        times_answered: 1,
        times_correct: 1,
        last_answered_at: new Date(baseTime + i * 10000).toISOString(),
      });
    }

    // Advanced questions answered in order 1..6
    for (let i = 1; i <= 6; i++) {
      historyRows.push({
        id: `h-adv-${i}`,
        user_id: userId,
        question_id: `adv-fifo-${i}`,
        chapter_id: 'cap-fifo',
        last_is_correct: true,
        times_answered: 1,
        times_correct: 1,
        last_answered_at: new Date(baseTime + i * 10000).toISOString(),
      });
    }

    // Inject history
    const repoWithHist = new InMemoryMCQQueueRepository(initialBank, historyRows);

    const res = await selectMCQsWithAntiRepetition(userId, 'cap-fifo', 10, {
      repository: repoWithHist,
    });

    check(
      'M2-C5.1',
      'FIFO Recycling',
      'recycled flag is true when 100% of questions are answered and correct',
      res.recycled === true,
      `recycled was ${res.recycled}`
    );
    check(
      'M2-C5.2',
      'FIFO Recycling',
      'Returns exactly 10 questions with 0 deficit',
      res.questions.length === 10 && res.deficit.total === 0,
      `len=${res.questions.length}, def=${res.deficit.total}`
    );

    const stdIds = res.questions
      .filter((q) => q.difficulty_tier === 'standard')
      .map((q) => q.bankQuestionId);
    const advIds = res.questions
      .filter((q) => q.difficulty_tier === 'advanced')
      .map((q) => q.bankQuestionId);

    // Standard needs 6 questions. Since std-fifo-1 to std-fifo-6 have the oldest timestamps,
    // FIFO MUST select std-fifo-1, 2, 3, 4, 5, 6 in exact order!
    check(
      'M2-C5.3',
      'FIFO Recycling',
      'Standard questions recycled strictly in FIFO order (std-fifo-1..6)',
      JSON.stringify(stdIds) ===
        JSON.stringify([
          'std-fifo-1',
          'std-fifo-2',
          'std-fifo-3',
          'std-fifo-4',
          'std-fifo-5',
          'std-fifo-6',
        ]),
      `Got stdIds: ${JSON.stringify(stdIds)}`
    );

    // Advanced needs 4 questions. Since adv-fifo-1 to adv-fifo-4 have the oldest timestamps,
    // FIFO MUST select adv-fifo-1, 2, 3, 4 in exact order!
    check(
      'M2-C5.4',
      'FIFO Recycling',
      'Advanced questions recycled strictly in FIFO order (adv-fifo-1..4)',
      JSON.stringify(advIds) ===
        JSON.stringify(['adv-fifo-1', 'adv-fifo-2', 'adv-fifo-3', 'adv-fifo-4']),
      `Got advIds: ${JSON.stringify(advIds)}`
    );
  }

  // ============================================================================
  // SUITE 6: Asymmetric Bank Deficits (10 Std / 0 Adv and 0 Std / 10 Adv)
  // ============================================================================
  console.log('\n--- SUITE 6: Asymmetric Bank Deficits ---');
  {
    // Scenario 6A: Bank has 10 standard, 0 advanced
    const bank6A = [
      ...Array.from({ length: 10 }, (_, i) =>
        createMockQuestion(`std-6a-${i + 1}`, 'cap-6a', 'standard', 'case_conduct', i + 1)
      ),
    ];
    const repo6A = new InMemoryMCQQueueRepository(bank6A);
    let requestedStd6A = -1;
    let requestedAdv6A = -1;

    const res6A = await selectMCQsWithAntiRepetition('u6a', 'cap-6a', 10, {
      repository: repo6A,
      aiGenerator: async ({ standardCount, advancedCount }) => {
        requestedStd6A = standardCount;
        requestedAdv6A = advancedCount;
        return Array.from({ length: advancedCount }, (_, i) => ({
          chapter_id: 'cap-6a',
          question_type: 'multiple_choice',
          difficulty_tier: 'advanced' as const,
          question_subformat: 'direct_content' as const,
          vignette: `Gen Adv ${i}`,
          options: ['A', 'B', 'C', 'D', 'E'],
          correct_option: 0,
          explanation: 'Exp',
        }));
      },
    });

    check(
      'M2-C6.1',
      'Asymmetric Deficit',
      'Bank with 10 std / 0 adv: std deficit = 0, adv deficit = 4',
      res6A.deficit.standard === 0 && res6A.deficit.advanced === 4,
      `stdDef=${res6A.deficit.standard}, advDef=${res6A.deficit.advanced}`
    );
    check(
      'M2-C6.2',
      'Asymmetric Deficit',
      'Generates only the 4 advanced questions',
      requestedStd6A === 0 && requestedAdv6A === 4,
      `Requested std=${requestedStd6A}, adv=${requestedAdv6A}`
    );

    // Scenario 6B: Bank has 0 standard, 10 advanced
    const bank6B = [
      ...Array.from({ length: 10 }, (_, i) =>
        createMockQuestion(`adv-6b-${i + 1}`, 'cap-6b', 'advanced', 'direct_content', i + 1)
      ),
    ];
    const repo6B = new InMemoryMCQQueueRepository(bank6B);
    let requestedStd6B = -1;
    let requestedAdv6B = -1;

    const res6B = await selectMCQsWithAntiRepetition('u6b', 'cap-6b', 10, {
      repository: repo6B,
      aiGenerator: async ({ standardCount, advancedCount }) => {
        requestedStd6B = standardCount;
        requestedAdv6B = advancedCount;
        return Array.from({ length: standardCount }, (_, i) => ({
          chapter_id: 'cap-6b',
          question_type: 'multiple_choice',
          difficulty_tier: 'standard' as const,
          question_subformat: 'case_conduct' as const,
          vignette: `Gen Std ${i}`,
          options: ['A', 'B', 'C', 'D', 'E'],
          correct_option: 0,
          explanation: 'Exp',
        }));
      },
    });

    check(
      'M2-C6.3',
      'Asymmetric Deficit',
      'Bank with 0 std / 10 adv: std deficit = 6, adv deficit = 0',
      res6B.deficit.standard === 6 && res6B.deficit.advanced === 0,
      `stdDef=${res6B.deficit.standard}, advDef=${res6B.deficit.advanced}`
    );
    check(
      'M2-C6.4',
      'Asymmetric Deficit',
      'Generates only the 6 standard questions',
      requestedStd6B === 6 && requestedAdv6B === 0,
      `Requested std=${requestedStd6B}, adv=${requestedAdv6B}`
    );
  }

  // ============================================================================
  // SUITE 7: Variable Test Counts (Modo Plantão count = 2, count = 5, count = 1)
  // ============================================================================
  console.log('\n--- SUITE 7: Variable Test Counts (Plantão & Short Tests) ---');
  {
    const bank = [
      ...Array.from({ length: 6 }, (_, i) =>
        createMockQuestion(`std-cnt-${i + 1}`, 'cap-cnt', 'standard', 'case_conduct', i + 1)
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        createMockQuestion(`adv-cnt-${i + 1}`, 'cap-cnt', 'advanced', 'direct_content', i + 1)
      ),
    ];
    const repo = new InMemoryMCQQueueRepository(bank);

    // Count = 2 (Plantão mode: 2 MCQs per bed)
    // targetStandard = round(2 * 0.6) = 1, targetAdvanced = 2 - 1 = 1
    const res2 = await selectMCQsWithAntiRepetition('u-cnt', 'cap-cnt', 2, { repository: repo });
    check(
      'M2-C7.1',
      'Variable Count',
      'Count = 2 (Plantão): returns 2 questions (1 standard, 1 advanced)',
      res2.questions.length === 2 &&
        res2.questions.filter((q) => q.difficulty_tier === 'standard').length === 1 &&
        res2.questions.filter((q) => q.difficulty_tier === 'advanced').length === 1,
      `len=${res2.questions.length}, std=${res2.questions.filter((q) => q.difficulty_tier === 'standard').length}, adv=${res2.questions.filter((q) => q.difficulty_tier === 'advanced').length}`
    );

    // Count = 5 (Quick quiz)
    // targetStandard = round(5 * 0.6) = 3, targetAdvanced = 5 - 3 = 2
    const res5 = await selectMCQsWithAntiRepetition('u-cnt', 'cap-cnt', 5, { repository: repo });
    check(
      'M2-C7.2',
      'Variable Count',
      'Count = 5: returns 5 questions (3 standard, 2 advanced)',
      res5.questions.length === 5 &&
        res5.questions.filter((q) => q.difficulty_tier === 'standard').length === 3 &&
        res5.questions.filter((q) => q.difficulty_tier === 'advanced').length === 2,
      `len=${res5.questions.length}`
    );

    // Count = 1 (Single question)
    // targetStandard = round(1 * 0.6) = 1, targetAdvanced = 0
    const res1 = await selectMCQsWithAntiRepetition('u-cnt', 'cap-cnt', 1, { repository: repo });
    check(
      'M2-C7.3',
      'Variable Count',
      'Count = 1: returns 1 question (1 standard, 0 advanced)',
      res1.questions.length === 1 &&
        res1.questions.filter((q) => q.difficulty_tier === 'standard').length === 1,
      `len=${res1.questions.length}`
    );
  }

  // ============================================================================
  // SUITE 8: Subformat Balancing Across Question Types
  // ============================================================================
  console.log('\n--- SUITE 8: Subformat Balancing ---');
  {
    // Bank with skew: 8 case_conduct, 1 direct_content, 1 diagnostic_criteria in standard
    const skewedBank: BankQuestionRow[] = [
      ...Array.from({ length: 8 }, (_, i) =>
        createMockQuestion(`std-cc-${i + 1}`, 'cap-subf', 'standard', 'case_conduct', i + 1)
      ),
      createMockQuestion('std-dc-1', 'cap-subf', 'standard', 'direct_content', 1),
      createMockQuestion('std-diag-1', 'cap-subf', 'standard', 'diagnostic_criteria', 1),
      ...Array.from({ length: 5 }, (_, i) =>
        createMockQuestion(`adv-subf-${i + 1}`, 'cap-subf', 'advanced', 'case_conduct', i + 1)
      ),
    ];

    const repo = new InMemoryMCQQueueRepository(skewedBank);
    const res = await selectMCQsWithAntiRepetition('u-subf', 'cap-subf', 10, { repository: repo });

    const selectedStd = res.questions.filter((q) => q.difficulty_tier === 'standard');
    const hasCaseConduct = selectedStd.some((q) => q.question_subformat === 'case_conduct');
    const hasDirectContent = selectedStd.some((q) => q.question_subformat === 'direct_content');
    const hasDiagCriteria = selectedStd.some((q) => q.question_subformat === 'diagnostic_criteria');

    check(
      'M2-C8.1',
      'Subformat Balancing',
      'Selects direct_content and diagnostic_criteria despite case_conduct skew',
      hasCaseConduct && hasDirectContent && hasDiagCriteria,
      `Subformats present: cc=${hasCaseConduct}, dc=${hasDirectContent}, diag=${hasDiagCriteria}`
    );
  }

  // ============================================================================
  // SUITE 9: Multi-User Isolation
  // ============================================================================
  console.log('\n--- SUITE 9: Multi-User Isolation ---');
  {
    const bank = [
      ...Array.from({ length: 6 }, (_, i) =>
        createMockQuestion(`std-iso-${i + 1}`, 'cap-iso', 'standard', 'case_conduct', i + 1)
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        createMockQuestion(`adv-iso-${i + 1}`, 'cap-iso', 'advanced', 'direct_content', i + 1)
      ),
    ];

    const repo = new InMemoryMCQQueueRepository(bank);

    // User A answers all 10 correctly -> completes cycle
    await repo.recordUserAnswers(
      'user-A',
      'cap-iso',
      bank.map((q) => ({ questionId: q.id, isCorrect: true }))
    );

    // User A selects MCQs -> recycled must be true
    const resA = await selectMCQsWithAntiRepetition('user-A', 'cap-iso', 10, { repository: repo });

    // User B selects MCQs -> has never answered -> recycled must be false
    const resB = await selectMCQsWithAntiRepetition('user-B', 'cap-iso', 10, { repository: repo });

    check(
      'M2-C9.1',
      'Multi-User Isolation',
      'User A cycle completion sets recycled = true for User A',
      resA.recycled === true,
      `User A recycled=${resA.recycled}`
    );
    check(
      'M2-C9.2',
      'Multi-User Isolation',
      'User B remains unseen and recycled = false',
      resB.recycled === false,
      `User B recycled=${resB.recycled}`
    );
    check(
      'M2-C9.3',
      'Multi-User Isolation',
      'User B gets 0 deficit and consumes bank directly',
      resB.questions.length === 10 && resB.deficit.total === 0,
      `len=${resB.questions.length}, def=${resB.deficit.total}`
    );
  }

  // ============================================================================
  // SUITE 10: History Tracking & Bank Usage Metrics Oracle
  // ============================================================================
  console.log('\n--- SUITE 10: Bank Usage Metrics & History Recording ---');
  {
    const bank = [
      createMockQuestion('q-stat-1', 'cap-stat', 'standard', 'case_conduct', 1),
      createMockQuestion('q-stat-2', 'cap-stat', 'standard', 'case_conduct', 2),
    ];

    const repo = new InMemoryMCQQueueRepository(bank);

    // Answer q-stat-1 wrong
    await repo.recordUserAnswers('user-stat', 'cap-stat', [
      { questionId: 'q-stat-1', isCorrect: false },
    ]);

    const hist1 = (await repo.getUserQuestionHistory('user-stat', 'cap-stat')).find(
      (h) => h.question_id === 'q-stat-1'
    );
    const bank1 = (await repo.getBankQuestions('cap-stat')).find((q) => q.id === 'q-stat-1');

    check(
      'M2-C10.1',
      'Metrics Oracle',
      'After 1 wrong attempt: times_answered=1, times_correct=0, last_is_correct=false',
      hist1?.times_answered === 1 && hist1?.times_correct === 0 && hist1?.last_is_correct === false,
      `times_answered=${hist1?.times_answered}, times_correct=${hist1?.times_correct}, last=${hist1?.last_is_correct}`
    );
    check(
      'M2-C10.2',
      'Metrics Oracle',
      'Bank stats: times_shown=1, times_incorrect=1, times_correct=0, avg_score=0',
      bank1?.times_shown === 1 &&
        bank1?.times_incorrect === 1 &&
        bank1?.times_correct === 0 &&
        bank1?.avg_score === 0,
      `shown=${bank1?.times_shown}, inc=${bank1?.times_incorrect}, cor=${bank1?.times_correct}, avg=${bank1?.avg_score}`
    );

    // Answer q-stat-1 again, this time correct!
    await repo.recordUserAnswers('user-stat', 'cap-stat', [
      { questionId: 'q-stat-1', isCorrect: true },
    ]);

    const hist2 = (await repo.getUserQuestionHistory('user-stat', 'cap-stat')).find(
      (h) => h.question_id === 'q-stat-1'
    );
    const bank2 = (await repo.getBankQuestions('cap-stat')).find((q) => q.id === 'q-stat-1');

    check(
      'M2-C10.3',
      'Metrics Oracle',
      'After second attempt (correct): times_answered=2, times_correct=1, last_is_correct=true',
      hist2?.times_answered === 2 && hist2?.times_correct === 1 && hist2?.last_is_correct === true,
      `times_answered=${hist2?.times_answered}, times_correct=${hist2?.times_correct}, last=${hist2?.last_is_correct}`
    );
    check(
      'M2-C10.4',
      'Metrics Oracle',
      'Bank stats updated: times_shown=2, times_correct=1, times_incorrect=1, avg_score=5.0',
      bank2?.times_shown === 2 &&
        bank2?.times_correct === 1 &&
        bank2?.times_incorrect === 1 &&
        bank2?.avg_score === 5,
      `shown=${bank2?.times_shown}, cor=${bank2?.times_correct}, inc=${bank2?.times_incorrect}, avg=${bank2?.avg_score}`
    );
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================================');
  const passedCount = testResults.filter((t) => t.passed).length;
  const totalCount = testResults.length;
  console.log(`CHALLENGER RESULT SUMMARY: ${passedCount}/${totalCount} TESTS PASSED`);
  console.log('================================================================================');

  if (passedCount === totalCount) {
    console.log('>>> VERDICT: EMPIRICAL TESTS PASSED ACCROSS ALL ADVERSARIAL ORACLES <<<');
    process.exit(0);
  } else {
    console.error(`>>> VERDICT: ${totalCount - passedCount} TESTS FAILED <<<`);
    process.exit(1);
  }
}

runAdversarialSuite().catch((err) => {
  console.error('Fatal crash in Challenger Suite:', err);
  process.exit(1);
});
