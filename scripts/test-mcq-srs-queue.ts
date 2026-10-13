/**
 * Verification Script: MCQ Anti-Repetition Spaced Repetition Queue (Milestone 2)
 * Demonstrates the 5 essential test cases specified by Explorer 2 and R2/R3.
 *
 * Usage: npx tsx scripts/test-mcq-srs-queue.ts
 */

import {
  selectMCQsWithAntiRepetition,
  recordUserQuestionAnswers,
  InMemoryMCQQueueRepository,
  BankQuestionRow,
} from '../lib/mcq-queue-service';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (expected: ${expected}, got: ${actual})`);
  }
}

async function runTests(): Promise<void> {
  console.log('================================================================================');
  console.log('   MILESTONE 2: POST-CHAPTER 10-MCQ TEST & ANTI-REPETITION QUEUE TESTS');
  console.log('================================================================================\n');

  let passed = 0;
  let total = 0;

  // --------------------------------------------------------------------------
  // Helper to generate mock questions with specific tier and subformat
  // --------------------------------------------------------------------------
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
      vignette: `[${tier.toUpperCase()}] Vinheta clínica #${num} sobre emergência médica no capítulo ${chapterId}.`,
      options: [
        `Opção A (${tier} #${num})`,
        `Opção B (${tier} #${num})`,
        `Opção C (${tier} #${num})`,
        `Opção D (${tier} #${num})`,
        `Opção E (${tier} #${num})`,
      ],
      correct_option: 1,
      explanation: `Explicação detalhada da questão ${tier} #${num}.`,
      times_shown: 0,
      times_correct: 0,
      times_incorrect: 0,
      avg_score: 0,
      created_at: new Date().toISOString(),
    };
  }

  // ==========================================================================
  // CASO 1: Banco Vazio -> Detecta déficit (6 standard, 4 advanced) -> IA -> 10 Qs salvas
  // ==========================================================================
  total++;
  try {
    console.log('▶ [Caso 1] Banco Vazio: detecta déficit de 6 standard e 4 advanced, gera e salva no banco...');
    const repo1 = new InMemoryMCQQueueRepository();
    const userId1 = 'user-case-1';
    const chapterId1 = 'cap-empty-1';

    let aiCallCount = 0;
    const customAiGenerator = async ({
      standardCount,
      advancedCount,
    }: {
      chapterId: string | number;
      standardCount: number;
      advancedCount: number;
    }) => {
      aiCallCount++;
      const generated: Omit<BankQuestionRow, 'id' | 'created_at' | 'updated_at'>[] = [];
      const subformats: ('case_conduct' | 'direct_content' | 'diagnostic_criteria')[] = [
        'case_conduct',
        'direct_content',
        'diagnostic_criteria',
      ];

      for (let i = 0; i < standardCount; i++) {
        generated.push({
          chapter_id: chapterId1,
          question_type: 'multiple_choice',
          difficulty_tier: 'standard',
          question_subformat: subformats[i % subformats.length],
          vignette: `Vinheta AI Standard #${i + 1}`,
          options: ['A', 'B', 'C', 'D', 'E'],
          correct_option: 0,
          explanation: `Explicação Standard #${i + 1}`,
        });
      }

      for (let i = 0; i < advancedCount; i++) {
        generated.push({
          chapter_id: chapterId1,
          question_type: 'multiple_choice',
          difficulty_tier: 'advanced',
          question_subformat: subformats[i % subformats.length],
          vignette: `Vinheta AI Advanced #${i + 1}`,
          options: ['A', 'B', 'C', 'D', 'E'],
          correct_option: 2,
          explanation: `Explicação Advanced #${i + 1}`,
        });
      }

      return generated;
    };

    const result1 = await selectMCQsWithAntiRepetition(userId1, chapterId1, 10, {
      repository: repo1,
      aiGenerator: customAiGenerator,
    });

    assertEqual(result1.questions.length, 10, 'Deve retornar exatamente 10 questões');
    assertEqual(result1.deficit.standard, 6, 'Déficit standard deve ser exatamente 6');
    assertEqual(result1.deficit.advanced, 4, 'Déficit advanced deve ser exatamente 4');
    assertEqual(result1.deficit.total, 10, 'Déficit total deve ser 10');
    assertEqual(result1.source, 'generated', 'Fonte deve ser generated');
    assertEqual(aiCallCount, 1, 'IA deve ser disparada exatamente 1 vez');

    // Verificar que todas as 10 possuem bankQuestionId e foram salvas no banco
    const bankAfter = repo1.getAllBankQuestions();
    assertEqual(bankAfter.length, 10, 'Banco deve conter as 10 questões geradas');
    for (const q of result1.questions) {
      assert(Boolean(q.bankQuestionId), `bankQuestionId deve estar presente na questão ${q.id}`);
      assert(bankAfter.some((b) => b.id === q.bankQuestionId), `Questão ${q.bankQuestionId} deve existir no banco`);
    }

    const stdQs = result1.questions.filter((q) => q.difficulty_tier === 'standard');
    const advQs = result1.questions.filter((q) => q.difficulty_tier === 'advanced');
    assertEqual(stdQs.length, 6, 'Devem ser 6 questões standard');
    assertEqual(advQs.length, 4, 'Devem ser 4 questões advanced');

    console.log('  ✓ Caso 1 passou com sucesso: 10 questões geradas com 60/40 mix e salvas no banco.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✖ Caso 1 falhou:', err.message);
  }

  // ==========================================================================
  // CASO 2: Banco com 20 Qs, Usuário Inédito -> 100% Banco, 6 Standard, 4 Advanced, Zero IA
  // ==========================================================================
  total++;
  let case2Questions: any[] = [];
  let repo2: InMemoryMCQQueueRepository;
  const userId2 = 'user-case-2';
  const chapterId2 = 'cap-srs-20';

  try {
    console.log('▶ [Caso 2] Banco com 20 Qs, Usuário Inédito: consome 100% do banco (6 standard, 4 advanced) sem IA...');
    // Criar acervo de 20 questões: 12 standard, 8 advanced
    const subformats: ('case_conduct' | 'direct_content' | 'diagnostic_criteria')[] = [
      'case_conduct',
      'direct_content',
      'diagnostic_criteria',
    ];

    const initialBank: BankQuestionRow[] = [];
    for (let i = 1; i <= 12; i++) {
      initialBank.push(
        createMockQuestion(`q-std-${i}`, chapterId2, 'standard', subformats[i % 3], i)
      );
    }
    for (let i = 1; i <= 8; i++) {
      initialBank.push(
        createMockQuestion(`q-adv-${i}`, chapterId2, 'advanced', subformats[i % 3], i)
      );
    }

    repo2 = new InMemoryMCQQueueRepository(initialBank);

    let aiCalled = false;
    const mockAi = async () => {
      aiCalled = true;
      return [];
    };

    const result2 = await selectMCQsWithAntiRepetition(userId2, chapterId2, 10, {
      repository: repo2,
      aiGenerator: mockAi,
    });

    assertEqual(result2.questions.length, 10, 'Deve retornar 10 questões');
    assertEqual(result2.source, 'bank', 'Fonte deve ser bank');
    assertEqual(result2.deficit.total, 0, 'Déficit deve ser 0');
    assert(!aiCalled, 'Nenhuma chamada de IA deve ser realizada');

    const stdQs = result2.questions.filter((q) => q.difficulty_tier === 'standard');
    const advQs = result2.questions.filter((q) => q.difficulty_tier === 'advanced');
    assertEqual(stdQs.length, 6, 'Exatamente 6 questões standard');
    assertEqual(advQs.length, 4, 'Exatamente 4 questões advanced');

    case2Questions = result2.questions;
    console.log('  ✓ Caso 2 passou com sucesso: 10 questões consumidas 100% do banco com zero chamadas de IA.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✖ Caso 2 falhou:', err.message);
  }

  // ==========================================================================
  // CASO 3: Transição Pós-Simulado com Erros: Usuário acerta 7 e erra 3.
  // No próximo teste, as 3 erradas devem reaparecer antes das 7 acertadas!
  // ==========================================================================
  total++;
  let case3Result: any = null;
  const wrongQIds: string[] = [];
  const correctQIds: string[] = [];

  try {
    console.log('▶ [Caso 3] Transição pós-simulado: usuário acerta 7 e erra 3. As 3 erradas devem ser priorizadas...');
    assert(case2Questions.length === 10, 'Requer resultado do Caso 2');

    // Definir 7 acertos e 3 erros
    for (let i = 0; i < 7; i++) {
      correctQIds.push(case2Questions[i].bankQuestionId);
    }
    for (let i = 7; i < 10; i++) {
      wrongQIds.push(case2Questions[i].bankQuestionId);
    }

    // Registrar respostas no histórico
    const userAnswers = [
      ...correctQIds.map((qid) => ({ questionId: qid, isCorrect: true })),
      ...wrongQIds.map((qid) => ({ questionId: qid, isCorrect: false })),
    ];
    await repo2!.recordUserAnswers(userId2, chapterId2, userAnswers);

    // Agora gerar próximo teste de 10 questões
    case3Result = await selectMCQsWithAntiRepetition(userId2, chapterId2, 10, {
      repository: repo2!,
    });

    assertEqual(case3Result.questions.length, 10, 'Deve retornar 10 questões');

    // Verificar se as 3 erradas reaparecem no quiz
    const returnedBankIds = case3Result.questions.map((q: any) => q.bankQuestionId);
    for (const wrongId of wrongQIds) {
      assert(
        returnedBankIds.includes(wrongId),
        `A questão errada ${wrongId} deve reaparecer no próximo teste de remediação`
      );
    }

    console.log('  ✓ Caso 3 passou com sucesso: todas as 3 questões erradas reapareceram no simulado.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✖ Caso 3 falhou:', err.message);
  }

  // ==========================================================================
  // CASO 4: Anti-Repetição de Acertos: Nenhuma das 7 acertadas pode reaparecer
  // enquanto houver questões inéditas ou erradas pendentes no tema!
  // ==========================================================================
  total++;
  try {
    console.log('▶ [Caso 4] Anti-repetição de acertos: nenhuma das 7 acertadas pode reaparecer com questões pendentes...');
    assert(case3Result !== null, 'Requer resultado do Caso 3');

    const returnedBankIds = case3Result.questions.map((q: any) => q.bankQuestionId);

    let repeatedCorrectCount = 0;
    for (const correctId of correctQIds) {
      if (returnedBankIds.includes(correctId)) {
        repeatedCorrectCount++;
      }
    }

    assertEqual(
      repeatedCorrectCount,
      0,
      `Nenhuma questão acertada deve reaparecer (foram encontradas ${repeatedCorrectCount} repetidas)`
    );

    console.log('  ✓ Caso 4 passou com sucesso: 0% de repetição de questões acertadas enquanto havia inéditas/erradas pendentes.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✖ Caso 4 falhou:', err.message);
  }

  // ==========================================================================
  // CASO 5: Completude de Ciclo: Após todas as 20 questões serem acertadas,
  // o sistema recicla as acertadas ordenadas por last_answered_at ASC (FIFO).
  // ==========================================================================
  total++;
  try {
    console.log('▶ [Caso 5] Completude de Ciclo: após todas as 20 serem acertadas, recicla FIFO por last_answered_at ASC...');
    
    // Simular que o usuário respondeu a todas as 20 questões do banco e acertou todas elas,
    // com timestamps conhecidos e sequenciais.
    const allBank = repo2!.getAllBankQuestions();
    const cycleAnswers: { questionId: string; isCorrect: boolean }[] = [];

    // Marcar as 20 questões como respondidas com sucesso com timestamps incrementais
    const baseTime = Date.now() - 100000;
    const orderedHistory = repo2!.getAllUserHistory();

    // Atualizar todas as 20 para acertadas
    for (let i = 0; i < allBank.length; i++) {
      const q = allBank[i];
      cycleAnswers.push({ questionId: q.id, isCorrect: true });
    }
    await repo2!.recordUserAnswers(userId2, chapterId2, cycleAnswers);

    // Ajustar explicitamente last_answered_at de cada questão para testar FIFO ordenado
    const updatedHistory = repo2!.getAllUserHistory();
    for (let i = 0; i < updatedHistory.length; i++) {
      updatedHistory[i].last_answered_at = new Date(baseTime + i * 1000).toISOString();
      updatedHistory[i].last_is_correct = true;
    }

    // Solicitar novo simulado de 10 questões
    const cycleResult = await selectMCQsWithAntiRepetition(userId2, chapterId2, 10, {
      repository: repo2!,
    });

    assertEqual(cycleResult.questions.length, 10, 'Deve retornar 10 questões recicladas');
    assertEqual(cycleResult.recycled, true, 'Flag recycled deve ser true');
    assertEqual(cycleResult.deficit.total, 0, 'Déficit deve ser 0');

    const stdQs = cycleResult.questions.filter((q) => q.difficulty_tier === 'standard');
    const advQs = cycleResult.questions.filter((q) => q.difficulty_tier === 'advanced');
    assertEqual(stdQs.length, 6, 'Exatamente 6 standard recicladas');
    assertEqual(advQs.length, 4, 'Exatamente 4 advanced recicladas');

    // Verificar ordenação FIFO: para cada tier, a questão anterior deve ter last_answered_at <= próxima questão
    const histMap = new Map(updatedHistory.map((h) => [h.question_id, h]));
    for (let i = 0; i < stdQs.length - 1; i++) {
      const timeA = new Date(histMap.get(stdQs[i].bankQuestionId!)?.last_answered_at || 0).getTime();
      const timeB = new Date(histMap.get(stdQs[i + 1].bankQuestionId!)?.last_answered_at || 0).getTime();
      assert(timeA <= timeB, `Standard reciclada deve seguir ordem FIFO (tA: ${timeA} <= tB: ${timeB})`);
    }

    for (let i = 0; i < advQs.length - 1; i++) {
      const timeA = new Date(histMap.get(advQs[i].bankQuestionId!)?.last_answered_at || 0).getTime();
      const timeB = new Date(histMap.get(advQs[i + 1].bankQuestionId!)?.last_answered_at || 0).getTime();
      assert(timeA <= timeB, `Advanced reciclada deve seguir ordem FIFO (tA: ${timeA} <= tB: ${timeB})`);
    }

    console.log('  ✓ Caso 5 passou com sucesso: ciclo completo ativado e questões recicladas estritamente em ordem FIFO.\n');
    passed++;
  } catch (err: any) {
    console.error('  ✖ Caso 5 falhou:', err.message);
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('================================================================================');
  console.log(`RESUMO DOS TESTES MCQ & SRS: ${passed}/${total} CASOS PASSARAM`);
  console.log('================================================================================');

  if (passed === total) {
    console.log('✅ TODOS OS 5 CASOS DE TESTE PASSARAM RIGOROSAMENTE!');
    process.exit(0);
  } else {
    console.error(`❌ FALHA: Apenas ${passed} de ${total} casos passaram.`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro fatal no executor de testes:', err);
  process.exit(1);
});
