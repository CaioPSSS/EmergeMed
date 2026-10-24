import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  dispatchPlantaoFeedbackBatch,
  createBedEvaluationBatchItem,
  createFeedbackBatchItem,
} from '../lib/ai/openrouter-batch';
import { processPlantaoBatchCheck } from '../lib/plantao/batch-processor';

// Mock in-memory database harness
function createMockSupabase(initialRecords: { tests?: any[]; ledger?: any[] } = {}) {
  const testsDB: Record<string, any> = {};
  (initialRecords.tests || []).forEach((t) => {
    testsDB[t.id] = JSON.parse(JSON.stringify(t));
  });

  const ledgerDB: Record<string, any> = {};
  (initialRecords.ledger || []).forEach((l) => {
    ledgerDB[l.batch_id] = JSON.parse(JSON.stringify(l));
  });

  const client: any = {
    _testsDB: testsDB,
    _ledgerDB: ledgerDB,
    from: (table: string) => {
      let filterCol = '';
      let filterVal: any = null;

      const builder: any = {
        select: (cols: string) => builder,
        eq: (col: string, val: any) => {
          filterCol = col;
          filterVal = val;
          return builder;
        },
        in: (col: string, vals: any[]) => builder,
        order: () => builder,
        limit: () => builder,
        gte: () => builder,
        maybeSingle: async () => {
          if (table === 'batch_generation_ledger') {
            const row = Object.values(ledgerDB).find((l: any) => l[filterCol] === filterVal);
            return { data: row || null, error: null };
          }
          if (table === 'tests') {
            const row = testsDB[filterVal];
            return { data: row || null, error: null };
          }
          if (table === 'user_settings') {
            return { data: { openrouter_api_key: 'mock-key' }, error: null };
          }
          return { data: null, error: null };
        },
        single: async () => {
          if (table === 'tests') {
            const row = testsDB[filterVal];
            return { data: row || null, error: null };
          }
          return { data: null, error: null };
        },
        update: (payload: any) => {
          return {
            eq: async (col: string, val: any) => {
              if (table === 'tests' && testsDB[val]) {
                testsDB[val] = { ...testsDB[val], ...payload };
              }
              if (table === 'batch_generation_ledger') {
                const target = Object.values(ledgerDB).find((l: any) => l[col] === val);
                if (target) Object.assign(target, payload);
              }
              return { error: null };
            },
          };
        },
        insert: (row: any) => { if (table === 'batch_generation_ledger') ledgerDB[row.batch_id] = { ...row }; return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; }, _oldInsert: async (row: any) => {
          if (table === 'batch_generation_ledger') {
            ledgerDB[row.batch_id] = { ...row };
          }
          return { error: null };
        },
        upsert: async () => ({ error: null }),
      };
      return builder;
    },
  };

  return client;
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   TESTE DE AUTO-CHAINING E CRON DO MODO PLANTAO         ');
  console.log('═══════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}:`, err.message);
      failed++;
    }
  }

  // TEST 1: dispatchPlantaoFeedbackBatch in mock mode
  await test('dispatchPlantaoFeedbackBatch: submete lote 2 e atualiza status para awaiting_batch_feedback', async () => {
    const mockTest = {
      id: 'test-autochain-01',
      user_id: 'user-01',
      mode: 'plantao',
      status: 'ready_for_adverse',
      chapter_ids: [1],
      questions: [
        { id: 1, type: 'multiple_choice', vignette: 'Caso 1', options: ['A', 'B'], correctOption: 0 },
        { id: 2, type: 'prescription_complete', vignette: 'Caso 2' },
      ],
      answers: { 1: 0, 2: 'Noradrenalina 0.1 mcg/kg/min EV contínua' },
      results: {
        1: { score: 10, isCorrect: true },
        2: { score: 9.0, evaluation: { verdict: 'Adequado', score: 9.0 } },
      },
      plantao_data: {
        beds: [{ bedNumber: 1, questionIds: [1, 2] }],
        status: 'ready_for_adverse',
      },
    };

    const supabase = createMockSupabase({ tests: [mockTest] });
    const result = await dispatchPlantaoFeedbackBatch({
      testId: 'test-autochain-01',
      supabase,
      userId: 'user-01',
      testRecord: mockTest,
      apiKey: 'mock-key',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 'awaiting_batch_feedback');
    assert.ok(result.batchId, 'Deve gerar um ID de lote');

    // Verifica se atualizou o banco
    const updatedTest = supabase._testsDB['test-autochain-01'];
    assert.strictEqual(updatedTest.status, 'awaiting_batch_feedback');
    assert.strictEqual(updatedTest.plantao_data.feedbackBatchId, result.batchId);
  });

  // TEST 2: Idempotency of dispatchPlantaoFeedbackBatch
  await test('dispatchPlantaoFeedbackBatch: idempotência evita duplicação se já submetido', async () => {
    const mockTest = {
      id: 'test-autochain-02',
      user_id: 'user-01',
      mode: 'plantao',
      status: 'awaiting_batch_feedback',
      plantao_data: {
        feedbackBatchId: 'batch_mock_existing_123',
      },
    };

    const supabase = createMockSupabase({ tests: [mockTest] });
    const result = await dispatchPlantaoFeedbackBatch({
      testId: 'test-autochain-02',
      supabase,
      userId: 'user-01',
      testRecord: mockTest,
      apiKey: 'mock-key',
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.batchId, 'batch_mock_existing_123');
    assert.ok(result.message?.includes('já submetido'));
  });

  // TEST 3: Auto-chaining when hasAnyAdverse is false
  await test('processPlantaoBatchCheck: Auto-chaining ativa quando nenhum leito descompensa', async () => {
    const mockTest = {
      id: 'test-autochain-03',
      user_id: 'user-01',
      mode: 'plantao',
      status: 'awaiting_batch_bed_evaluation',
      chapter_ids: [1],
      questions: [
        { id: 10, type: 'multiple_choice', vignette: 'Choque Séptico', options: ['A', 'B'], correctOption: 0 },
        { id: 11, type: 'prescription_complete', vignette: 'Prescrição Choque' },
      ],
      answers: { 10: 0, 11: 'Noradrenalina + Ceftriaxona' },
      results: {},
      plantao_data: {
        batch_job_id: 'batch_mock_beds_999',
        beds: [{ bedNumber: 1, questionIds: [10, 11] }],
        status: 'awaiting_batch_bed_evaluation',
      },
    };

    const mockLedger = {
      batch_id: 'batch_mock_beds_999',
      status: 'submitted',
    };

    const supabase = createMockSupabase({ tests: [mockTest], ledger: [mockLedger] });

    const outcome = await processPlantaoBatchCheck({
      testRecord: mockTest,
      supabase,
      defaultApiKey: 'mock',
    });

    assert.strictEqual(outcome.updated, true);
    assert.strictEqual(outcome.status, 'awaiting_batch_feedback', 'Deve encadear diretamente para awaiting_batch_feedback');
    assert.ok(outcome.feedbackBatchId, 'Deve conter feedbackBatchId do lote 2');
    assert.strictEqual(outcome.hasAdverseEvolution, false);

    // Confirma que o banco de dados tem o novo status da Fase 2
    const updatedTest = supabase._testsDB['test-autochain-03'];
    assert.strictEqual(updatedTest.status, 'awaiting_batch_feedback');
  });

  // TEST 4: Mandatory stop when hasAnyAdverse is true
  await test('processPlantaoBatchCheck: Parada obrigatória em ready_for_adverse quando há descompensação', async () => {
    const mockTest = {
      id: 'test-autochain-04',
      user_id: 'user-01',
      mode: 'plantao',
      status: 'awaiting_batch_bed_evaluation',
      chapter_ids: [1],
      questions: [
        { id: 20, type: 'multiple_choice', vignette: 'PCR', options: ['A', 'B'], correctOption: 1 },
        { id: 21, type: 'prescription_complete', vignette: 'Conduta PCR' },
      ],
      // Respostas em branco ou erradas -> força risco de deterioração no mock
      answers: { 20: 0, 21: '' },
      results: {},
      plantao_data: {
        batch_job_id: 'batch_mock_beds_888',
        beds: [{ bedNumber: 1, questionIds: [20, 21] }],
        status: 'awaiting_batch_bed_evaluation',
      },
    };

    const mockLedger = {
      batch_id: 'batch_mock_beds_888',
      status: 'submitted',
    };

    const supabase = createMockSupabase({ tests: [mockTest], ledger: [mockLedger] });

    const outcome = await processPlantaoBatchCheck({
      testRecord: mockTest,
      supabase,
      defaultApiKey: 'mock',
    });

    assert.strictEqual(outcome.updated, true);
    assert.strictEqual(outcome.status, 'ready_for_adverse', 'Deve parar em ready_for_adverse para o médico intervir');
    assert.strictEqual(outcome.hasAdverseEvolution, true);
    assert.strictEqual(outcome.feedbackBatchId, undefined, 'Não deve submeter lote de feedback se o paciente descompensou');
  });

  // TEST 5: Preceptorship Feedback completion transition
  await test('processPlantaoBatchCheck: Fase 2 conclui com nota final, XP e status completed', async () => {
    const mockTest = {
      id: 'test-autochain-05',
      user_id: 'user-01',
      mode: 'plantao',
      status: 'awaiting_batch_feedback',
      chapter_ids: [1],
      questions: [
        { id: 30, type: 'multiple_choice', vignette: 'Questão 1', correctOption: 0 },
        { id: 31, type: 'prescription_complete', vignette: 'Questão 2' },
      ],
      answers: { 30: 0, 31: 'Conduta adequada' },
      results: {
        30: { score: 10 },
        31: { score: 8.0 },
      },
      plantao_data: {
        feedbackBatchId: 'batch_mock_feedback_777',
        beds: [{ bedNumber: 1, chapterId: 1, questionIds: [30, 31] }],
        status: 'awaiting_batch_feedback',
      },
    };

    const mockLedger = {
      batch_id: 'batch_mock_feedback_777',
      status: 'submitted',
    };

    const supabase = createMockSupabase({ tests: [mockTest], ledger: [mockLedger] });

    const outcome = await processPlantaoBatchCheck({
      testRecord: mockTest,
      supabase,
      defaultApiKey: 'mock',
    });

    assert.strictEqual(outcome.updated, true);
    assert.strictEqual(outcome.status, 'completed');
    assert.strictEqual(outcome.score, 9.0, 'Média de (10 + 8) / 2 = 9.0');
    assert.ok(outcome.results?.generalFeedback, 'Deve conter o parecer geral do preceptor');

    const updatedTest = supabase._testsDB['test-autochain-05'];
    assert.strictEqual(updatedTest.status, 'completed');
    assert.strictEqual(updatedTest.completed, true);
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`TOTAL DE TESTES: ${passed + failed} | APROVADOS: ${passed} | FALHAS: ${failed}`);
  console.log('═══════════════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
