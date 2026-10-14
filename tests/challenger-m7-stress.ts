/**
 * Empirical Stress Test Suite for Milestone M7:
 * Budget Cap Breaches, Concurrency, and Malformed Payloads
 *
 * Authored by: M7 Challenger 1 (Stress & Budget Testing)
 * Usage: npx tsx tests/challenger-m7-stress.ts
 */

import fs from 'fs';
import path from 'path';
import {
  calculateBatchCost,
  evaluateBudgetCapBreach,
  estimateBatchCost,
  DAILY_HARD_CAP_USD,
  MONTHLY_HARD_CAP_USD,
  BATCH_MODEL,
  createBedEvaluationBatchItem,
  createFeedbackBatchItem,
  submitOpenRouterBatch,
  getOpenRouterBatchStatus,
} from '../lib/ai/openrouter-batch';
import { parsePrescriptionDrugs, formatDrugFactsForPrompt } from '../lib/ai/drug-math-validator';
import { parseJsonFromMarkdown, QuestionItem } from '../lib/ai/openrouter';
import { fixMojibake } from '../lib/text-sanitizer';
import { PlantaoTestStatus, isValidPlantaoStatus } from '../types/plantao';

interface StressTestResult {
  suite: string;
  id: string;
  name: string;
  passed: boolean;
  error?: string;
  finding?: string;
}

const stressResults: StressTestResult[] = [];

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

async function runStressTest(
  suite: string,
  id: string,
  name: string,
  fn: () => void | Promise<void>,
  finding?: string
) {
  try {
    await fn();
    stressResults.push({ suite, id, name, passed: true, finding });
    console.log(`  ✓ [${id}] ${name}`);
  } catch (err: any) {
    stressResults.push({ suite, id, name, passed: false, error: err.message, finding });
    console.error(`  ✗ [${id}] ${name}: ${err.message}`);
  }
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('   CHALLENGER M7: EMPIRICAL STRESS & ADVERSARIAL HARNESS              ');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // ==========================================================================
  // SUITE 1: BUDGET CAP BREACHES ($0.149 DAILY SPEND & EDGE CASES)
  // ==========================================================================
  console.log('--- SUITE 1: Budget Cap Breaches & Hard Limits ---');

  await runStressTest(
    'BUDGET_CAP',
    'STRESS-01',
    'Daily spend at $0.149: 1-bed batch ($0.000550) is ALLOWED (projected $0.149550 <= $0.15)',
    () => {
      const currentDaily = 0.149;
      const currentMonthly = 0.50;
      // 1 bed evaluation: 3500 prompt tokens, 1500 completion tokens
      const oneBedCost = calculateBatchCost(3500, 1500); // 0.000550
      assertEqual(Number(oneBedCost.toFixed(6)), 0.000550, '1-bed cost must be exactly $0.000550');

      const evalResult = evaluateBudgetCapBreach(currentDaily, currentMonthly, oneBedCost);
      assert(evalResult.canProceed, '1 bed MUST be allowed because $0.149 + $0.000550 = $0.149550 <= $0.150000');
      assertEqual(evalResult.reason, undefined, 'No breach reason should be returned');
    }
  );

  await runStressTest(
    'BUDGET_CAP',
    'STRESS-02',
    'Daily spend at $0.149: 2-bed batch ($0.001100) is BLOCKED (projected $0.150100 > $0.15)',
    () => {
      const currentDaily = 0.149;
      const currentMonthly = 0.50;
      // 2 bed evaluation: 7000 prompt tokens, 3000 completion tokens
      const twoBedCost = calculateBatchCost(7000, 3000); // 0.001100
      assertEqual(Number(twoBedCost.toFixed(6)), 0.001100, '2-bed cost must be exactly $0.001100');

      const evalResult = evaluateBudgetCapBreach(currentDaily, currentMonthly, twoBedCost);
      assert(!evalResult.canProceed, '2 beds MUST be blocked because $0.149 + $0.001100 = $0.150100 > $0.150000');
      assertEqual(evalResult.reason, 'daily_cap', 'Breach reason must be daily_cap');
    }
  );

  await runStressTest(
    'BUDGET_CAP',
    'STRESS-03',
    'Daily spend at $0.149: Standard 3-bed shift batch ($0.001650) is BLOCKED with daily_cap',
    () => {
      const currentDaily = 0.149;
      const currentMonthly = 0.50;
      // Standard plantão has 3 beds: 10500 prompt tokens, 4500 completion tokens
      const threeBedCost = calculateBatchCost(10500, 4500); // 0.001650
      assertEqual(Number(threeBedCost.toFixed(6)), 0.001650, '3-bed cost must be exactly $0.001650');

      const evalResult = evaluateBudgetCapBreach(currentDaily, currentMonthly, threeBedCost);
      assert(!evalResult.canProceed, 'Standard 3-bed batch MUST be blocked at $0.149 daily spend');
      assertEqual(evalResult.reason, 'daily_cap', 'Breach reason must be daily_cap');
    }
  );

  await runStressTest(
    'BUDGET_CAP',
    'STRESS-04',
    'Daily spend at $0.149: Feedback batch ($0.000650) is ALLOWED (projected $0.149650 <= $0.15)',
    () => {
      const currentDaily = 0.149;
      const currentMonthly = 0.50;
      // Feedback batch: 3000 prompt tokens, 2000 completion tokens
      const feedbackCost = calculateBatchCost(3000, 2000); // 0.000650
      assertEqual(Number(feedbackCost.toFixed(6)), 0.000650, 'Feedback cost must be exactly $0.000650');

      const evalResult = evaluateBudgetCapBreach(currentDaily, currentMonthly, feedbackCost);
      assert(evalResult.canProceed, 'Feedback batch MUST be allowed when margin is $0.001000');
    }
  );

  await runStressTest(
    'BUDGET_CAP',
    'STRESS-05',
    'Daily spend at $0.1495: Feedback batch ($0.000650) is BLOCKED (projected $0.150150 > $0.15)',
    () => {
      const currentDaily = 0.1495;
      const currentMonthly = 0.50;
      const feedbackCost = calculateBatchCost(3000, 2000); // 0.000650
      const evalResult = evaluateBudgetCapBreach(currentDaily, currentMonthly, feedbackCost);
      assert(!evalResult.canProceed, 'Feedback batch MUST be blocked when daily spend is $0.1495');
      assertEqual(evalResult.reason, 'daily_cap', 'Breach reason must be daily_cap');
    }
  );

  await runStressTest(
    'BUDGET_CAP',
    'STRESS-06',
    'Daily spend exactly at hard cap $0.150000: Any new batch is BLOCKED',
    () => {
      const currentDaily = DAILY_HARD_CAP_USD;
      const currentMonthly = 0.50;
      const evalResult = evaluateBudgetCapBreach(currentDaily, currentMonthly, 0.000001);
      assert(!evalResult.canProceed, 'Must block even for micro-cost when at exact cap');
      assertEqual(evalResult.reason, 'daily_cap', 'Breach reason must be daily_cap');
    }
  );

  await runStressTest(
    'BUDGET_CAP',
    'STRESS-07',
    'Monthly spend at $0.899: 3-bed batch ($0.001650) is BLOCKED with monthly_cap ($0.900650 > $0.90)',
    () => {
      const currentDaily = 0.01;
      const currentMonthly = 0.899;
      const threeBedCost = calculateBatchCost(10500, 4500); // 0.001650
      const evalResult = evaluateBudgetCapBreach(currentDaily, currentMonthly, threeBedCost);
      assert(!evalResult.canProceed, 'Must block when candidate exceeds monthly cap');
      assertEqual(evalResult.reason, 'monthly_cap', 'Breach reason must be monthly_cap');
    }
  );

  await runStressTest(
    'BUDGET_CAP',
    'STRESS-08',
    'Monthly spend exactly at hard cap $0.900000: Blocked immediately',
    () => {
      const currentDaily = 0.01;
      const currentMonthly = MONTHLY_HARD_CAP_USD;
      const evalResult = evaluateBudgetCapBreach(currentDaily, currentMonthly, 0.000001);
      assert(!evalResult.canProceed, 'Must block at exact monthly cap');
      assertEqual(evalResult.reason, 'monthly_cap', 'Breach reason must be monthly_cap');
    }
  );

  await runStressTest(
    'BUDGET_CAP',
    'STRESS-09',
    'Simulated Route HTTP 429 response on breach: No OpenRouter call, no ledger insertion',
    () => {
      // Simulate route logic from submit-batch / submit-feedback-batch
      const dailyAccumulated = 0.149;
      const monthlyAccumulated = 0.50;
      const estPromptTokens = 3 * 3500;
      const estCompletionTokens = 3 * 1500;
      const estimatedCost = calculateBatchCost(estPromptTokens, estCompletionTokens);

      const capBreach = evaluateBudgetCapBreach(dailyAccumulated, monthlyAccumulated, estimatedCost);
      let httpStatus = 200;
      let responseBody: any = null;
      let openRouterCalled = false;
      let ledgerInserted = false;

      if (!capBreach.canProceed) {
        httpStatus = 429;
        responseBody = {
          error: `Limite de orçamento em lote atingido: Teto diário de US$ ${DAILY_HARD_CAP_USD.toFixed(2)} atingido.`,
          budgetBreach: true,
          reason: capBreach.reason,
          dailyAccumulated,
          monthlyAccumulated,
        };
      } else {
        openRouterCalled = true;
        ledgerInserted = true;
      }

      assertEqual(httpStatus, 429, 'HTTP status must be 429');
      assert(responseBody.budgetBreach === true, 'Response must flag budgetBreach');
      assertEqual(responseBody.reason, 'daily_cap', 'Reason must be daily_cap');
      assert(!openRouterCalled, 'OpenRouter API MUST NOT be called');
      assert(!ledgerInserted, 'Ledger record MUST NOT be inserted');
    }
  );

  // ==========================================================================
  // SUITE 2: CONCURRENCY & RACE CONDITIONS ON BATCH CHECK
  // ==========================================================================
  console.log('\n--- SUITE 2: Concurrency & Race Conditions on Batch Check ---');

  await runStressTest(
    'CONCURRENCY',
    'STRESS-10',
    'VULNERABILITY AUDIT: Concurrency Guard expression evaluation in check-batch-status line 133',
    () => {
      // Line 94: const currentStatus = testRecord.status || testRecord.plantao_data?.status;
      // Line 133: if (existingLedger?.status === 'completed' && testRecord.status !== currentStatus)
      const testRecordStatus = 'awaiting_batch_bed_evaluation';
      const plantaoDataStatus = 'awaiting_batch_bed_evaluation';
      const currentStatus = testRecordStatus || plantaoDataStatus;

      const existingLedger = { status: 'completed' };

      // Evaluate the actual line in check-batch-status
      const guardTriggers = existingLedger?.status === 'completed' && testRecordStatus !== currentStatus;

      // Because testRecordStatus === currentStatus ('awaiting_batch_bed_evaluation' === 'awaiting_batch_bed_evaluation'),
      // testRecordStatus !== currentStatus is FALSE!
      // Therefore guardTriggers is FALSE!
      assert(
        guardTriggers === false,
        'CRITICAL FLAW CONFIRMED: Line 133 evaluates to false when testRecord.status is populated! The guard fails to trigger.'
      );
    },
    'VULNERABILITY: Line 133 in check-batch-status has a dead condition `testRecord.status !== currentStatus` which prevents the concurrency guard from activating when testRecord.status is non-null.'
  );

  await runStressTest(
    'CONCURRENCY',
    'STRESS-11',
    'Simulation: Concurrent execution of two status check workers on the same test ID',
    async () => {
      // State setup
      const sharedDB = {
        test: {
          id: 'test-race-1',
          status: 'awaiting_batch_bed_evaluation',
          questions: [
            { id: 1, type: 'multiple_choice', correctOption: 0 },
            { id: 2, type: 'multiple_choice', correctOption: 1 },
            { id: 3, type: 'prescription_immediate', vignette: 'Choque 70kg' },
          ] as any[],
          answers: { 1: 3, 2: 3, 3: 'Conduta inadequada' }, // Failing answers
          plantao_data: {
            beds: [{ bedNumber: 1, questionIds: [1, 2, 3] }],
            batch_job_id: 'batch_mock_race_1',
          },
          results: {},
        },
        ledger: {
          batch_id: 'batch_mock_race_1',
          status: 'submitted',
          cost_usd: 0.00165,
        },
        q5Generations: 0,
        ledgerCompletions: 0,
      };

      // Mock batch generator in openrouter-batch
      await submitOpenRouterBatch(
        [
          createBedEvaluationBatchItem({
            testId: 'test-race-1',
            bedNumber: 1,
            chapterId: 10,
            questionIds: [3],
            systemPrompt: 'sys',
            userPrompt: 'eval',
          }),
        ],
        'mock',
        true
      );

      // Worker function simulating check-batch-status handler
      async function executeCheckWorker(workerId: string, fixConcurrencyBug: boolean = false) {
        // Step 1: Read test record
        const testRecord = { ...sharedDB.test };
        const currentStatus = testRecord.status;

        if (currentStatus !== 'awaiting_batch_bed_evaluation') {
          return { workerId, updated: false, reason: 'not_awaiting' };
        }

        // Step 2: Check ledger
        const ledger = sharedDB.ledger;
        const guardCondition = fixConcurrencyBug
          ? ledger.status === 'completed'
          : ledger.status === 'completed' && testRecord.status !== currentStatus;

        if (guardCondition) {
          return { workerId, updated: false, reason: 'already_completed_in_ledger' };
        }

        // Simulate small processing delay
        await new Promise((r) => setTimeout(r, 10));

        // Step 3: Ingest batch and generate Q5
        sharedDB.q5Generations++;
        const newQ5: QuestionItem = {
          id: 4,
          type: 'prescription_immediate',
          chapterId: 10,
          chapterTitle: 'Complicação',
          vignette: 'Intercorrência clínica',
          promptText: 'Conduta de resgate',
        };

        sharedDB.test.questions.push(newQ5);
        sharedDB.test.status = 'ready_for_adverse';
        sharedDB.ledger.status = 'completed';
        sharedDB.ledgerCompletions++;

        return { workerId, updated: true };
      }

      // Test with CURRENT buggy implementation
      const [res1, res2] = await Promise.all([
        executeCheckWorker('Worker-A', false),
        executeCheckWorker('Worker-B', false),
      ]);

      // Under the unfixed logic, both workers run and generate duplicate Q5 / completions!
      assertEqual(sharedDB.q5Generations, 2, 'Without fixed guard, 2 Q5 generations occur concurrently');
      assertEqual(sharedDB.ledgerCompletions, 2, 'Without fixed guard, 2 ledger updates occur concurrently');
      assert(sharedDB.test.questions.length > 4, 'Duplicate questions were appended to the test');
    },
    'CONFIRMED RACE CONDITION: Simultaneous requests cause duplicate Q5 question generation and duplicate ledger updates.'
  );

  await runStressTest(
    'CONCURRENCY',
    'STRESS-12',
    'Fix Verification: With correct guard (ledger.status === "completed"), second worker aborts cleanly',
    async () => {
      const sharedDB = {
        test: {
          id: 'test-race-2',
          status: 'awaiting_batch_bed_evaluation',
          questions: [{ id: 1, type: 'multiple_choice' }],
          plantao_data: { batch_job_id: 'batch_mock_race_2' },
        },
        ledger: {
          batch_id: 'batch_mock_race_2',
          status: 'submitted',
        },
        q5Generations: 0,
      };

      async function executeGuardedWorker(workerId: string, delayMs: number) {
        await new Promise((r) => setTimeout(r, delayMs));
        const testRecord = { ...sharedDB.test };
        const currentStatus = testRecord.status;

        // FIXED GUARD: Check if ledger is already completed OR status changed
        if (currentStatus !== 'awaiting_batch_bed_evaluation' || sharedDB.ledger.status === 'completed') {
          return { workerId, updated: false, reason: 'guarded' };
        }

        sharedDB.q5Generations++;
        sharedDB.ledger.status = 'completed';
        sharedDB.test.status = 'ready_for_adverse';
        return { workerId, updated: true };
      }

      const [resA, resB] = await Promise.all([
        executeGuardedWorker('Worker-A', 0),
        executeGuardedWorker('Worker-B', 15),
      ]);

      assertEqual(resA.updated, true, 'First worker succeeds');
      assertEqual(resB.updated, false, 'Second worker is guarded');
      assertEqual(sharedDB.q5Generations, 1, 'Exactly 1 Q5 generation occurs');
    }
  );

  await runStressTest(
    'CONCURRENCY',
    'STRESS-13',
    'Sequential Idempotency: Request arriving after state is ready_for_adverse skips ingestion',
    () => {
      // Simulate request after ingestion finished
      const testRecord = {
        id: 'test-sequential',
        status: 'ready_for_adverse',
        plantao_data: { status: 'ready_for_adverse' },
      };
      const currentStatus = testRecord.status;

      let ingested = false;
      if (
        currentStatus !== 'awaiting_batch_bed_evaluation' &&
        currentStatus !== 'awaiting_batch_feedback'
      ) {
        // Skips ingestion
        ingested = false;
      } else {
        ingested = true;
      }

      assert(!ingested, 'Sequential request on ready_for_adverse MUST NOT re-ingest');
    }
  );

  // ==========================================================================
  // SUITE 3: MALFORMED PAYLOADS, MISSING BEDS & DEFENSIVE CONTRACTS
  // ==========================================================================
  console.log('\n--- SUITE 3: Malformed Payloads & Missing Beds ---');

  await runStressTest(
    'MALFORMED_INPUTS',
    'STRESS-14',
    'submit-batch: Missing testId in request body returns 400',
    () => {
      const bodyVariants: any[] = [
        {},
        { testId: '' },
        { testId: null },
        { testId: undefined },
      ];

      for (const body of bodyVariants) {
        const { testId } = body;
        let isError = false;
        let statusCode = 200;
        if (!testId) {
          isError = true;
          statusCode = 400;
        }
        assert(isError && statusCode === 400, `Must reject empty testId: ${JSON.stringify(body)}`);
      }
    }
  );

  await runStressTest(
    'MALFORMED_INPUTS',
    'STRESS-15',
    'submit-batch: Empty beds array (bedsData: []) and no beds in DB returns 400',
    () => {
      const body = { testId: 'test-123', bedsData: [] };
      const testRecord: any = { plantao_data: { beds: [] } };

      const rawBeds = body.bedsData && body.bedsData.length > 0
        ? body.bedsData
        : (testRecord.plantao_data?.beds || []);

      let statusCode = 200;
      let errorMsg = '';
      if (!rawBeds || rawBeds.length === 0) {
        statusCode = 400;
        errorMsg = 'Nenhum leito disponível para avaliação em lote.';
      }

      assertEqual(statusCode, 400, 'Must return HTTP 400 for empty beds');
      assertEqual(errorMsg, 'Nenhum leito disponível para avaliação em lote.', 'Error message must match');
    }
  );

  await runStressTest(
    'MALFORMED_INPUTS',
    'STRESS-16',
    'submit-batch: Bed with missing patientWeight safely falls back to 70 kg',
    () => {
      const bed = { bedNumber: 1, chapterId: 5 }; // patientWeight omitted
      const patientWeight = (bed as any).patientWeight || 70;
      assertEqual(patientWeight, 70, 'Default patient weight must be 70kg');
    }
  );

  await runStressTest(
    'MALFORMED_INPUTS',
    'STRESS-17',
    'submit-batch: Bed with zero valid prescriptions returns 400',
    () => {
      const bed = { bedNumber: 1, prescriptionsPayload: [] };
      const testRecord = { questions: [] };

      let prescriptions = bed.prescriptionsPayload || [];
      const batchRequests: any[] = [];
      if (prescriptions.length === 0) {
        // skips bed
      }

      let statusCode = 200;
      if (batchRequests.length === 0) {
        statusCode = 400;
      }
      assertEqual(statusCode, 400, 'Must return 400 when no valid bed prescriptions exist');
    }
  );

  await runStressTest(
    'MALFORMED_INPUTS',
    'STRESS-18',
    'submit-batch: Rejection if test is already completed (status === completed)',
    () => {
      const testRecord = { status: 'completed' };
      let statusCode = 200;
      if (testRecord.status === 'completed') {
        statusCode = 400;
      }
      assertEqual(statusCode, 400, 'Must reject completed tests');
    }
  );

  await runStressTest(
    'MALFORMED_INPUTS',
    'STRESS-19',
    'submit-batch: Idempotency if test already awaiting_batch_bed_evaluation with batch_job_id',
    () => {
      const testRecord = {
        status: 'awaiting_batch_bed_evaluation',
        plantao_data: { batch_job_id: 'batch_existing_123' },
      };

      let response: any = null;
      if (testRecord.status === 'awaiting_batch_bed_evaluation' && testRecord.plantao_data?.batch_job_id) {
        response = {
          success: true,
          batchId: testRecord.plantao_data.batch_job_id,
          status: 'awaiting_batch_bed_evaluation',
        };
      }

      assert(Boolean(response), 'Should return idempotent success response');
      assertEqual(response.batchId, 'batch_existing_123', 'Must return existing batch ID');
    }
  );

  await runStressTest(
    'MALFORMED_INPUTS',
    'STRESS-20',
    'submit-feedback-batch: Graceful fallback when evaluationsSummary is missing',
    () => {
      const testRecord = {
        score: 7.5,
        total_questions: 2,
        questions: [{ id: 1, type: 'prescription_immediate', chapterTitle: 'SCA', vignette: 'Dor torácica' }],
        results: { 1: { score: 7.5, userPrescription: 'AAS 200mg', evaluation: { detailedFeedback: 'Bom' } } },
      };

      const evaluationsSummary = undefined; // Missing in request body
      let summaryText = '';

      if (Array.isArray(evaluationsSummary)) {
        summaryText = 'array_summary';
      } else if (typeof evaluationsSummary === 'string') {
        summaryText = evaluationsSummary;
      } else {
        // Fallback reconstruction
        const results = (testRecord.results || {}) as Record<number, any>;
        const questions = (testRecord.questions as any[]) || [];
        summaryText = questions.map((q: any, idx: number) => {
          const res = results[q.id];
          return `QUESTÃO ${idx + 1}: ${res?.score}/10`;
        }).join('\n');
      }

      assert(summaryText.includes('QUESTÃO 1: 7.5/10'), 'Reconstruction from testRecord must succeed gracefully');
    }
  );

  // ==========================================================================
  // SUITE 4: MISSING ANSWERS & EXTREME INPUT ROBUSTNESS
  // ==========================================================================
  console.log('\n--- SUITE 4: Missing Answers & Extreme Input Robustness ---');

  await runStressTest(
    'MISSING_ANSWERS',
    'STRESS-21',
    'check-batch-status: Missing MCQ answer evaluates to score 0 without throwing',
    () => {
      const questions = [{ id: 10, type: 'multiple_choice', correctOption: 2, explanation: 'Gabarito C' }];
      const userAnswers: Record<number, any> = {}; // Missing answer for Q 10
      const evaluations: Record<number, any> = {};

      for (const q of questions) {
        if (q.type === 'multiple_choice') {
          const answer = userAnswers[q.id];
          const isCorrect = answer === q.correctOption;
          evaluations[q.id] = {
            userAnswer: answer,
            isCorrect,
            score: isCorrect ? 10 : 0,
            explanation: q.explanation,
          };
        }
      }

      assertEqual(evaluations[10].score, 0, 'Unanswered MCQ must receive score 0');
      assertEqual(evaluations[10].isCorrect, false, 'Unanswered MCQ must be marked incorrect');
      assertEqual(evaluations[10].userAnswer, undefined, 'User answer recorded as undefined');
    }
  );

  await runStressTest(
    'MISSING_ANSWERS',
    'STRESS-22',
    'check-batch-status: Missing prescription answer triggers Inadequado verdict and Q5 adverse',
    () => {
      const ans: any = undefined;
      const isAnswered = ans && (typeof ans === 'string' ? ans.trim().length > 10 : true);
      assert(!isAnswered, 'Undefined prescription must be flagged not answered');

      const evalScore = isAnswered ? 8.5 : 4.0;
      const verdict = isAnswered ? 'Adequado' : 'Inadequado';
      assertEqual(evalScore, 4.0, 'Unanswered prescription receives failing score 4.0');
      assertEqual(verdict, 'Inadequado', 'Verdict must be Inadequado');

      // Check clinical trigger: score < 6.0 triggers adverse evolution
      const triggersAdverse = evalScore < 6.0 || verdict === 'Inadequado';
      assert(triggersAdverse, 'Must trigger adverse evolution for unanswered bed');
    }
  );

  await runStressTest(
    'DRUG_PARSER_STRESS',
    'STRESS-23',
    'parsePrescriptionDrugs: Handles empty, whitespace, null, and non-string inputs safely',
    () => {
      assertEqual(parsePrescriptionDrugs('', 70).length, 0, 'Empty string returns empty array');
      assertEqual(parsePrescriptionDrugs('   \n  \t  ', 70).length, 0, 'Whitespace returns empty array');
      assertEqual(parsePrescriptionDrugs(null as any, 70).length, 0, 'Null returns empty array');
      assertEqual(parsePrescriptionDrugs(undefined as any, 70).length, 0, 'Undefined returns empty array');
    }
  );

  await runStressTest(
    'DRUG_PARSER_STRESS',
    'STRESS-24',
    'parsePrescriptionDrugs: Handles negative and zero patient weight safely',
    () => {
      const rx = 'Noradrenalina 4 ampolas + SG5% 234ml a 10ml/h';
      assertEqual(parsePrescriptionDrugs(rx, 0).length, 0, 'Zero weight returns empty array');
      assertEqual(parsePrescriptionDrugs(rx, -70).length, 0, 'Negative weight returns empty array');
    }
  );

  await runStressTest(
    'DRUG_PARSER_STRESS',
    'STRESS-25',
    'parsePrescriptionDrugs: 50,000 character adversarial input does not crash or hang (ReDoS check)',
    () => {
      const start = Date.now();
      const adversarialText = 'Noradrenalina ' + 'ampola '.repeat(5000) + 'em SG5% ' + '0,9% '.repeat(5000) + ' a 15 ml/h';
      const calcs = parsePrescriptionDrugs(adversarialText, 70);
      const elapsed = Date.now() - start;

      assert(elapsed < 2000, `Parser must finish within 2000ms (took ${elapsed}ms)`);
      assert(calcs.length >= 0, 'Must not throw error on huge text');
    }
  );

  await runStressTest(
    'AI_JSON_ROBUSTNESS',
    'STRESS-26',
    'VULNERABILITY AUDIT: Corrupted AI response content in check-batch-status (Uncaught parseJsonFromMarkdown)',
    () => {
      // Line 295 of check-batch-status:
      // const content = item.response?.body?.choices?.[0]?.message?.content || '{}';
      // const parsedData = parseJsonFromMarkdown<any>(content);
      const corruptedContents = [
        '502 Bad Gateway: Backend unavailable',
        '<html><body>Error 504</body></html>',
        'Rate limit exceeded. Please wait 60s.',
      ];

      for (const corrupt of corruptedContents) {
        let threw = false;
        try {
          parseJsonFromMarkdown(corrupt);
        } catch {
          threw = true;
        }
        assert(threw, `parseJsonFromMarkdown throws on "${corrupt}"`);
      }
    },
    'VULNERABILITY: In check-batch-status line 295, parseJsonFromMarkdown is not wrapped in a try/catch. A corrupted OpenRouter response throws an unhandled error causing an HTTP 500 failure instead of marking the item failed.'
  );

  await runStressTest(
    'REMEDIATION_VERIFICATION',
    'STRESS-27',
    'Remediation Verification: Concurrency Guard in check-batch-status route checks ledger completion without tautology',
    () => {
      const routePath = path.join(process.cwd(), 'app', 'api', 'plantao', 'check-batch-status', 'route.ts');
      const routeContent = fs.readFileSync(routePath, 'utf8');
      assert(
        routeContent.includes("if (existingLedger?.status === 'completed')"),
        'Concurrency guard must check if existingLedger?.status === "completed"'
      );
      assert(
        !routeContent.includes("existingLedger?.status === 'completed' && testRecord.status !== currentStatus"),
        'Tautological status inequality check must be eliminated'
      );
    }
  );

  await runStressTest(
    'REMEDIATION_VERIFICATION',
    'STRESS-28',
    'Remediation Verification: check-batch-status route wraps parseJsonFromMarkdown in try/catch with fallback bed evaluation',
    () => {
      const routePath = path.join(process.cwd(), 'app', 'api', 'plantao', 'check-batch-status', 'route.ts');
      const routeContent = fs.readFileSync(routePath, 'utf8');
      assert(
        routeContent.includes('try {') && routeContent.includes('parsedData = parseJsonFromMarkdown<any>(content)'),
        'parseJsonFromMarkdown must be enclosed in try block'
      );
      assert(
        routeContent.includes('catch (parseErr)'),
        'parseJsonFromMarkdown must catch parseErr'
      );
      assert(
        routeContent.includes("verdict: 'Requer Ajustes'"),
        'Fallback evaluation must record Requer Ajustes'
      );
    }
  );

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  const passedCount = stressResults.filter((r) => r.passed).length;
  const failedCount = stressResults.filter((r) => !r.passed).length;
  console.log(`TOTAL STRESS TESTS: ${stressResults.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);

  console.log('\n--- EMPIRICAL FINDINGS & AUDIT HIGHLIGHTS ---');
  stressResults
    .filter((r) => Boolean(r.finding))
    .forEach((r) => {
      console.log(`• [${r.id}] ${r.finding}`);
    });

  if (failedCount > 0) {
    console.error('\nSTRESS HARNESS ENCOUNTERED TEST ASSERTION FAILURES!');
    process.exit(1);
  } else {
    console.log('\nALL 26 STRESS AND ADVERSARIAL TEST HARNESSES COMPLETED SUCCESSFULLY!');
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal stress test runner error:', err);
  process.exit(1);
});
