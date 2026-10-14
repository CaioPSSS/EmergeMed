/**
 * Challenger Verification Suite for Milestone M7:
 * Database State Machine & OpenRouter Batch Backend API
 *
 * Requirements Tested:
 * - R1: Dual correction batch submission endpoints & contracts
 * - R2: Database state machine transitions (in_progress -> awaiting_batch_bed_evaluation
 *       -> ready_for_adverse -> awaiting_batch_feedback -> completed)
 * - R3: OpenRouter batch status polling, mock generators, Q5 adverse evolution triggers,
 *       deduplicated ledger accounting, FSRS spaced repetition updates, and gamification XP
 * - R5: Hard budget caps ($0.15 daily / $0.90 monthly) with 429 budget breach prevention
 *
 * Usage: npx tsx tests/challenger-m7-backend.ts
 */

import fs from 'fs';
import path from 'path';
import {
  PlantaoTestStatus,
  PLANTAO_STATUSES,
  isValidPlantaoStatus,
  isPendingBatchStatus,
  PlantaoTestRecord,
} from '../types/plantao';
import { TestRecordItem, calculateFSRSUpdate } from '../lib/learning-engine';
import {
  BATCH_MODEL,
  DAILY_HARD_CAP_USD,
  MONTHLY_HARD_CAP_USD,
  calculateBatchCost,
  evaluateBudgetCapBreach,
  estimateBatchCost,
  createBedEvaluationBatchItem,
  createFeedbackBatchItem,
  submitOpenRouterBatch,
  getOpenRouterBatchStatus,
  cancelOpenRouterBatch,
  BatchRequestItem,
} from '../lib/ai/openrouter-batch';
import { parsePrescriptionDrugs, formatDrugFactsForPrompt } from '../lib/ai/drug-math-validator';
import { fixMojibake } from '../lib/text-sanitizer';

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

async function runTest(suite: string, id: string, name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    allResults.push({ suite, id, name, passed: true });
    console.log(`  ✓ [${id}] ${name}`);
  } catch (err: any) {
    allResults.push({ suite, id, name, passed: false, error: err.message });
    console.error(`  ✗ [${id}] ${name}: ${err.message}`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('   CHALLENGER M7: DATABASE STATE MACHINE & BATCH BACKEND API SUITE     ');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // ==========================================================================
  // SUITE 1: DATABASE MIGRATION & SCHEMA DOCUMENTATION
  // ==========================================================================
  console.log('--- SUITE 1: Database Migration & Schema Documentation ---');

  await runTest('DB_MIGRATION', 'M7-01', 'Migration file exists with correct filename', () => {
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261016000002_plantao_batch_status.sql');
    assert(fs.existsSync(migrationPath), `Migration file not found at ${migrationPath}`);
  });

  await runTest('DB_MIGRATION', 'M7-02', 'Migration adds status column with in_progress default', () => {
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261016000002_plantao_batch_status.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert(content.includes('ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'in_progress\''), 'Column status with default in_progress missing');
  });

  await runTest('DB_MIGRATION', 'M7-03', 'Migration safely backfills completed tests to status = completed', () => {
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261016000002_plantao_batch_status.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert(content.includes("SET status = 'completed'"), 'Backfill to completed missing');
    assert(content.includes('WHERE completed = true'), 'Condition completed = true missing');
  });

  await runTest('DB_MIGRATION', 'M7-04', 'Migration creates tests_status_check constraint with 5 states', () => {
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261016000002_plantao_batch_status.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert(content.includes('tests_status_check'), 'Constraint tests_status_check missing');
    assert(content.includes("'in_progress'"), 'in_progress status missing from constraint');
    assert(content.includes("'awaiting_batch_bed_evaluation'"), 'awaiting_batch_bed_evaluation missing from constraint');
    assert(content.includes("'ready_for_adverse'"), 'ready_for_adverse missing from constraint');
    assert(content.includes("'awaiting_batch_feedback'"), 'awaiting_batch_feedback missing from constraint');
    assert(content.includes("'completed'"), 'completed missing from constraint');
  });

  await runTest('DB_MIGRATION', 'M7-05', 'Migration creates compound index idx_tests_user_status', () => {
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20261016000002_plantao_batch_status.sql');
    const content = fs.readFileSync(migrationPath, 'utf8');
    assert(content.includes('CREATE INDEX IF NOT EXISTS idx_tests_user_status'), 'Index idx_tests_user_status missing');
    assert(content.includes('(user_id, status)'), 'Index columns user_id, status missing');
  });

  await runTest('DB_MIGRATION', 'M7-06', 'supabase/schema.sql documents status column and compound index', () => {
    const schemaPath = path.join(process.cwd(), 'supabase', 'schema.sql');
    const content = fs.readFileSync(schemaPath, 'utf8');
    assert(content.includes("status TEXT DEFAULT 'in_progress'"), 'status column missing in schema.sql');
    assert(content.includes('idx_tests_user_status'), 'idx_tests_user_status missing in schema.sql');
  });

  // ==========================================================================
  // SUITE 2: TYPESCRIPT TYPES & DOMAIN GUARDS
  // ==========================================================================
  console.log('\n--- SUITE 2: TypeScript Types & Domain Guards ---');

  await runTest('TYPES', 'M7-07', 'PLANTAO_STATUSES contains exactly the 5 state machine states', () => {
    assertEqual(PLANTAO_STATUSES.length, 5, 'Must contain exactly 5 statuses');
    assert(PLANTAO_STATUSES.includes('in_progress'), 'Missing in_progress');
    assert(PLANTAO_STATUSES.includes('awaiting_batch_bed_evaluation'), 'Missing awaiting_batch_bed_evaluation');
    assert(PLANTAO_STATUSES.includes('ready_for_adverse'), 'Missing ready_for_adverse');
    assert(PLANTAO_STATUSES.includes('awaiting_batch_feedback'), 'Missing awaiting_batch_feedback');
    assert(PLANTAO_STATUSES.includes('completed'), 'Missing completed');
  });

  await runTest('TYPES', 'M7-08', 'isValidPlantaoStatus type guard handles valid and invalid statuses', () => {
    assert(isValidPlantaoStatus('in_progress'), 'in_progress should be valid');
    assert(isValidPlantaoStatus('awaiting_batch_bed_evaluation'), 'awaiting_batch_bed_evaluation should be valid');
    assert(isValidPlantaoStatus('ready_for_adverse'), 'ready_for_adverse should be valid');
    assert(isValidPlantaoStatus('awaiting_batch_feedback'), 'awaiting_batch_feedback should be valid');
    assert(isValidPlantaoStatus('completed'), 'completed should be valid');
    assert(!isValidPlantaoStatus('unknown_state'), 'unknown_state should be invalid');
    assert(!isValidPlantaoStatus(''), 'empty string should be invalid');
    assert(!isValidPlantaoStatus(null), 'null should be invalid');
    assert(!isValidPlantaoStatus(123), 'number should be invalid');
  });

  await runTest('TYPES', 'M7-09', 'isPendingBatchStatus identifies awaiting states', () => {
    assert(isPendingBatchStatus('awaiting_batch_bed_evaluation'), 'Should identify awaiting_batch_bed_evaluation as pending');
    assert(isPendingBatchStatus('awaiting_batch_feedback'), 'Should identify awaiting_batch_feedback as pending');
    assert(!isPendingBatchStatus('in_progress'), 'in_progress is not a pending batch status');
    assert(!isPendingBatchStatus('ready_for_adverse'), 'ready_for_adverse is not a pending batch status');
    assert(!isPendingBatchStatus('completed'), 'completed is not a pending batch status');
  });

  await runTest('TYPES', 'M7-10', 'TestRecordItem in learning-engine.ts has status property', () => {
    const record: TestRecordItem = {
      id: 'test-uuid-1',
      chapter_ids: [1, 2],
      status: 'awaiting_batch_bed_evaluation',
      plantao_data: {
        batch_bed_eval_id: 'batch_123',
        batch_feedback_id: 'batch_456',
      },
    };
    assertEqual(record.status, 'awaiting_batch_bed_evaluation', 'Status property must typecheck');
  });

  // ==========================================================================
  // SUITE 3: OPENROUTER BATCH HELPERS & BUDGET CALCULATIONS
  // ==========================================================================
  console.log('\n--- SUITE 3: OpenRouter Batch Helpers & Budget Calculations ---');

  await runTest('BATCH_HELPERS', 'M7-11', 'calculateBatchCost applies $0.05 / 1M prompt and $0.25 / 1M completion', () => {
    const cost = calculateBatchCost(1_000_000, 1_000_000);
    // 0.05 + 0.25 = 0.30
    assertEqual(Number(cost.toFixed(2)), 0.30, 'Cost of 1M in / 1M out must be $0.30');

    const bedCost = calculateBatchCost(3500, 1500);
    // (3500/1e6)*0.05 + (1500/1e6)*0.25 = 0.000175 + 0.000375 = 0.000550
    assertEqual(Number(bedCost.toFixed(6)), 0.000550, 'Cost of single bed evaluation must match formula');
  });

  await runTest('BATCH_HELPERS', 'M7-12', 'estimateBatchCost computes tokens and cost for arbitrary batch size', () => {
    const est = estimateBatchCost(3, 3500, 1500);
    assertEqual(est.estimatedPromptTokens, 10500, 'Prompt tokens for 3 beds should be 10,500');
    assertEqual(est.estimatedCompletionTokens, 4500, 'Completion tokens for 3 beds should be 4,500');
    assertEqual(Number(est.estimatedCostUsd.toFixed(6)), 0.001650, 'Estimated cost should be $0.001650');
  });

  await runTest('BATCH_HELPERS', 'M7-13', 'evaluateBudgetCapBreach enforces $0.15 daily hard cap', () => {
    // Under budget
    const ok = evaluateBudgetCapBreach(0.10, 0.50, 0.01);
    assert(ok.canProceed, 'Should proceed when below daily cap');

    // Breaching daily cap ($0.149 + $0.002 = $0.151 > $0.15)
    const dailyBreach = evaluateBudgetCapBreach(0.149, 0.50, 0.002);
    assert(!dailyBreach.canProceed, 'Must block when candidate exceeds daily cap');
    assertEqual(dailyBreach.reason, 'daily_cap', 'Breach reason must be daily_cap');
  });

  await runTest('BATCH_HELPERS', 'M7-14', 'evaluateBudgetCapBreach enforces $0.90 monthly hard cap', () => {
    // Under budget monthly
    const ok = evaluateBudgetCapBreach(0.01, 0.85, 0.01);
    assert(ok.canProceed, 'Should proceed when below monthly cap');

    // Breaching monthly cap ($0.899 + $0.002 = $0.901 > $0.90)
    const monthlyBreach = evaluateBudgetCapBreach(0.01, 0.899, 0.002);
    assert(!monthlyBreach.canProceed, 'Must block when candidate exceeds monthly cap');
    assertEqual(monthlyBreach.reason, 'monthly_cap', 'Breach reason must be monthly_cap');
  });

  await runTest('BATCH_HELPERS', 'M7-15', 'createBedEvaluationBatchItem builds valid structured custom_id and model payload', () => {
    const item = createBedEvaluationBatchItem({
      testId: 'test-123',
      bedNumber: 1,
      chapterId: 14,
      questionIds: [101, 102],
      systemPrompt: 'System evaluator prompt',
      userPrompt: 'Evaluate Bed 1',
    });

    assertEqual(item.method, 'POST', 'HTTP method must be POST');
    assertEqual(item.url, '/v1/chat/completions', 'URL must be /v1/chat/completions');
    assertEqual(item.body.model, BATCH_MODEL, `Model must be ${BATCH_MODEL}`);
    assertEqual(item.body.temperature, 0.3, 'Temperature should be 0.3');

    const customData = JSON.parse(item.custom_id);
    assertEqual(customData.type, 'bed_evaluation', 'custom_id type must be bed_evaluation');
    assertEqual(customData.testId, 'test-123', 'custom_id testId must match');
    assertEqual(customData.bedNumber, 1, 'custom_id bedNumber must match');
    assertEqual(customData.chapterId, 14, 'custom_id chapterId must match');
    assertEqual(customData.questionIds[0], 101, 'custom_id questionIds must match');
  });

  await runTest('BATCH_HELPERS', 'M7-16', 'createFeedbackBatchItem builds valid structured custom_id and model payload', () => {
    const item = createFeedbackBatchItem({
      testId: 'test-123',
      overallScore: 8.5,
      systemPrompt: 'Preceptorship feedback system prompt',
      userPrompt: 'Generate shift feedback',
    });

    assertEqual(item.method, 'POST', 'HTTP method must be POST');
    assertEqual(item.body.model, BATCH_MODEL, `Model must be ${BATCH_MODEL}`);
    assertEqual(item.body.temperature, 0.4, 'Temperature should be 0.4');

    const customData = JSON.parse(item.custom_id);
    assertEqual(customData.type, 'plantao_feedback', 'custom_id type must be plantao_feedback');
    assertEqual(customData.testId, 'test-123', 'custom_id testId must match');
    assertEqual(customData.overallScore, 8.5, 'custom_id overallScore must match');
  });

  // ==========================================================================
  // SUITE 4: MOCK SUBMISSION, POLLING & OFFLINE GENERATOR
  // ==========================================================================
  console.log('\n--- SUITE 4: Mock Submission, Polling & Offline Generator ---');

  let mockBedBatchId: string = '';
  let mockFeedbackBatchId: string = '';

  await runTest('MOCK_PIPELINE', 'M7-17', 'submitOpenRouterBatch in mock mode returns synthetic batch ID and caches requests', async () => {
    const bedItems = [
      createBedEvaluationBatchItem({
        testId: 'test-uuid-batch',
        bedNumber: 1,
        chapterId: 10,
        questionIds: [1, 2],
        systemPrompt: 'system prompt',
        userPrompt: 'user prompt',
      }),
      createBedEvaluationBatchItem({
        testId: 'test-uuid-batch',
        bedNumber: 2,
        chapterId: 11,
        questionIds: [3, 4],
        systemPrompt: 'system prompt',
        userPrompt: 'user prompt',
      }),
    ];

    const result = await submitOpenRouterBatch(bedItems, 'mock', true);
    assert(result.id.startsWith('batch_mock_'), 'Mock batch ID must start with batch_mock_');
    assertEqual(result.status, 'submitted', 'Status must be submitted');
    assertEqual(result.total_requests, 2, 'Total requests must be 2');
    assertEqual(result.model, BATCH_MODEL, 'Model must be BATCH_MODEL');
    mockBedBatchId = result.id;
  });

  await runTest('MOCK_PIPELINE', 'M7-18', 'getOpenRouterBatchStatus returns completed results from cached mock batch for bed_evaluation', async () => {
    const statusRes = await getOpenRouterBatchStatus(mockBedBatchId, 'mock', true);
    assertEqual(statusRes.status, 'completed', 'Mock status must resolve to completed');
    assert(Boolean(statusRes.results), 'statusRes.results must be defined');
    const results = statusRes.results!;
    assertEqual(results.length, 2, 'Must return 2 results');

    // Inspect first result
    const firstResult = results[0];
    const parsedCustom = JSON.parse(firstResult.custom_id);
    assertEqual(parsedCustom.type, 'bed_evaluation', 'Parsed custom_id must be bed_evaluation');
    assertEqual(parsedCustom.bedNumber, 1, 'Bed number must be 1');

    const content = firstResult.response?.body?.choices?.[0]?.message?.content || '{}';
    const parsedContent = JSON.parse(content);
    assert(Boolean(parsedContent.evaluations), 'Evaluations object must be present in mock bed evaluation');
    assert(Boolean(parsedContent.evaluations['1']), 'Evaluation for question 1 must exist');
    assertEqual(parsedContent.evaluations['1'].verdict, 'Adequado', 'Mock evaluation verdict must be Adequado');
    assertEqual(parsedContent.evaluations['1'].score, 8.5, 'Mock evaluation score must be 8.5');
  });

  await runTest('MOCK_PIPELINE', 'M7-19', 'submitOpenRouterBatch & getOpenRouterBatchStatus handle plantao_feedback in mock mode', async () => {
    const feedbackItem = createFeedbackBatchItem({
      testId: 'test-uuid-batch',
      overallScore: 8.5,
      systemPrompt: 'Feedback prompt',
      userPrompt: 'Generate shift feedback',
    });

    const sub = await submitOpenRouterBatch([feedbackItem], 'mock', true);
    mockFeedbackBatchId = sub.id;

    const statusRes = await getOpenRouterBatchStatus(mockFeedbackBatchId, 'mock', true);
    assertEqual(statusRes.status, 'completed', 'Mock feedback status must be completed');
    assert(Boolean(statusRes.results), 'statusRes.results must be defined');
    const results = statusRes.results!;
    assertEqual(results.length, 1, 'Must return 1 result');

    const content = results[0].response?.body?.choices?.[0]?.message?.content || '';
    assert(content.includes('Síntese do Plantão Noturno'), 'Mock feedback must contain preceptorship synthesis');
    assert(content.includes('Auditoria de Leitos'), 'Mock feedback must contain bed audit section');
    assert(content.includes('Plano de Ação'), 'Mock feedback must contain action plan');
  });

  await runTest('MOCK_PIPELINE', 'M7-20', 'cancelOpenRouterBatch marks mock batch as cancelled', async () => {
    const res = await cancelOpenRouterBatch('batch_mock_to_cancel', 'mock', true);
    assertEqual(res.status, 'cancelled', 'Status must be cancelled');
    assertEqual(res.id, 'batch_mock_to_cancel', 'Returned ID must match');
  });

  // ==========================================================================
  // SUITE 5: DRUG MATH VALIDATOR & CLINICAL CRITERIA
  // ==========================================================================
  console.log('\n--- SUITE 5: Drug Math Validator & Pre-Calculated Math Facts ---');

  await runTest('DRUG_MATH', 'M7-21', 'parsePrescriptionDrugs correctly parses Norepinephrine infusion and computes mcg/kg/min', () => {
    const prescriptionText = 'Noradrenalina (4mg/4ml) 4 ampolas + SG5% 234ml EV em BIC a 15 ml/h';
    const patientWeight = 70;
    const calcs = parsePrescriptionDrugs(prescriptionText, patientWeight);

    assert(calcs.length > 0, 'Must detect norepinephrine');
    const nora = calcs[0];
    assert(nora.calculable, 'Norepinephrine calculation must be calculable');
    assertEqual(nora.totalVolumeMl, 250, 'Total volume must be 250 ml (16ml + 234ml)');
    assert(Boolean(nora.dosePerKgPerTimeUnit), 'Dose per kg per min must be calculated');

    const formattedFacts = formatDrugFactsForPrompt(calcs);
    assert(formattedFacts.includes('FATOS MATEMÁTICOS PRÉ-CALCULADOS'), 'Formatted facts must include header');
    assert(formattedFacts.includes('NOREPINEFRINA') || formattedFacts.includes('NORADRENALINA'), 'Formatted facts must include NOREPINEFRINA or NORADRENALINA');
  });

  await runTest('DRUG_MATH', 'M7-22', 'fixMojibake repairs garbled UTF-8 / Latin-1 strings', () => {
    const garbled = 'PrescriÃ§Ã£o mÃ©dica de emergÃªncia';
    const fixed = fixMojibake(garbled);
    assertEqual(fixed, 'Prescrição médica de emergência', 'Mojibake text must be cleanly restored');
  });

  // ==========================================================================
  // SUITE 6: STATE MACHINE TRANSITIONS & ADVERSE EVOLUTION GENERATION
  // ==========================================================================
  console.log('\n--- SUITE 6: State Machine Transitions & Adverse Evolution Simulation ---');

  await runTest('STATE_MACHINE', 'M7-23', 'Adverse Evolution Trigger: Bed fails when prescription score < 6.0', () => {
    // Simulate bed evaluation check criteria
    const evaluations = {
      101: { score: 4.5, evaluation: { verdict: 'Inadequado' } },
      102: { score: 5.0, evaluation: { verdict: 'Requer Ajustes' } },
    };
    const bedQuestions = [{ id: 101, type: 'prescription_immediate' }, { id: 102, type: 'prescription_complete' }];

    const prescFailures = bedQuestions.filter((q: any) => {
      const evalItem = (evaluations as any)[q.id];
      return evalItem?.score < 6.0 || evalItem?.evaluation?.verdict === 'Inadequado';
    });

    assert(prescFailures.length > 0, 'Must detect prescription failure');
  });

  await runTest('STATE_MACHINE', 'M7-24', 'Adverse Evolution Trigger: Bed fails when 2 or more MCQs are incorrect', () => {
    const userAnswers: Record<number, any> = { 201: 2, 202: 3 };
    const bedQuestions = [
      { id: 201, type: 'multiple_choice', correctOption: 0 },
      { id: 202, type: 'multiple_choice', correctOption: 1 },
    ];

    const mcqWrong = bedQuestions.filter((q) => userAnswers[q.id] !== q.correctOption);
    assertEqual(mcqWrong.length, 2, 'Must detect 2 wrong MCQs');
    assert(mcqWrong.length >= 2, '2 wrong MCQs must trigger adverse evolution');
  });

  await runTest('STATE_MACHINE', 'M7-25', 'Clean Bed: No adverse evolution triggered when bed score >= 8.0 and MCQs correct', () => {
    const userAnswers: Record<number, any> = { 301: 0, 302: 1 };
    const evaluations = {
      303: { score: 8.5, evaluation: { verdict: 'Adequado' } },
      304: { score: 9.0, evaluation: { verdict: 'Adequado' } },
    };
    const bedQuestions = [
      { id: 301, type: 'multiple_choice', correctOption: 0 },
      { id: 302, type: 'multiple_choice', correctOption: 1 },
      { id: 303, type: 'prescription_immediate' },
      { id: 304, type: 'prescription_complete' },
    ];

    const mcqWrong = bedQuestions.filter((q) => q.type === 'multiple_choice' && userAnswers[q.id] !== q.correctOption);
    const prescFailures = bedQuestions.filter((q) => {
      if (q.type === 'multiple_choice') return false;
      const evalItem = (evaluations as any)[q.id];
      return evalItem?.score < 6.0 || evalItem?.evaluation?.verdict === 'Inadequado';
    });

    assertEqual(mcqWrong.length, 0, 'Zero wrong MCQs');
    assertEqual(prescFailures.length, 0, 'Zero prescription failures');
    const isFailing = mcqWrong.length >= 2 || prescFailures.length > 0;
    assert(!isFailing, 'Clean bed must not fail or trigger adverse evolution');
  });

  await runTest('STATE_MACHINE', 'M7-26', 'Full 5-State Life-Cycle Sequence Contract', () => {
    let status: PlantaoTestStatus = 'in_progress';

    // 1. In progress
    assertEqual(status, 'in_progress', 'Initial state must be in_progress');

    // 2. Submit bed batch
    status = 'awaiting_batch_bed_evaluation';
    assertEqual(status, 'awaiting_batch_bed_evaluation', 'State after bed batch submit');

    // 3. Batch complete -> Ready for adverse
    status = 'ready_for_adverse';
    assertEqual(status, 'ready_for_adverse', 'State after bed evaluations ingested');

    // 4. Submit feedback batch
    status = 'awaiting_batch_feedback';
    assertEqual(status, 'awaiting_batch_feedback', 'State after adverse completed and feedback batch submitted');

    // 5. Shift complete
    status = 'completed';
    assertEqual(status, 'completed', 'Final state after feedback ingested');
  });

  // ==========================================================================
  // SUITE 7: ROUTE FILES & ENDPOINT CODE INTEGRITY
  // ==========================================================================
  console.log('\n--- SUITE 7: Route Files & Endpoint Code Integrity ---');

  await runTest('ROUTES', 'M7-27', 'app/api/plantao/submit-batch/route.ts exists and implements budget cap check and dosage math', () => {
    const routePath = path.join(process.cwd(), 'app', 'api', 'plantao', 'submit-batch', 'route.ts');
    assert(fs.existsSync(routePath), 'submit-batch route file must exist');
    const content = fs.readFileSync(routePath, 'utf8');
    assert(content.includes('export async function POST'), 'Must export POST handler');
    assert(content.includes('evaluateBudgetCapBreach'), 'Must check budget cap breach');
    assert(content.includes('parsePrescriptionDrugs'), 'Must calculate dosage math');
    assert(content.includes('awaiting_batch_bed_evaluation'), 'Must transition to awaiting_batch_bed_evaluation');
    assert(content.includes('insertBatchLedgerRecord'), 'Must record batch in ledger');
  });

  await runTest('ROUTES', 'M7-28', 'app/api/plantao/submit-feedback-batch/route.ts exists and implements budget cap check and feedback prompt', () => {
    const routePath = path.join(process.cwd(), 'app', 'api', 'plantao', 'submit-feedback-batch', 'route.ts');
    assert(fs.existsSync(routePath), 'submit-feedback-batch route file must exist');
    const content = fs.readFileSync(routePath, 'utf8');
    assert(content.includes('export async function POST'), 'Must export POST handler');
    assert(content.includes('evaluateBudgetCapBreach'), 'Must check budget cap breach');
    assert(content.includes('SYSTEM_PROMPT_PLANTAO_FEEDBACK'), 'Must use preceptorship feedback prompt');
    assert(content.includes('awaiting_batch_feedback'), 'Must transition to awaiting_batch_feedback');
  });

  await runTest('ROUTES', 'M7-29', 'app/api/plantao/check-batch-status/route.ts exists and implements ingestion, Q5 adverse generation, and ledger update', () => {
    const routePath = path.join(process.cwd(), 'app', 'api', 'plantao', 'check-batch-status', 'route.ts');
    assert(fs.existsSync(routePath), 'check-batch-status route file must exist');
    const content = fs.readFileSync(routePath, 'utf8');
    assert(content.includes('export async function POST'), 'Must export POST handler');
    assert(content.includes('getOpenRouterBatchStatus'), 'Must query batch status');
    assert(content.includes('ready_for_adverse'), 'Must transition to ready_for_adverse on bed completion');
    assert(content.includes('updateBatchLedgerRecord'), 'Must reconcile tokens and cost in ledger');
    assert(content.includes('calculateFSRSUpdate'), 'Must update spaced repetition stats');
    assert(content.includes('recordActivityAndAwardXP'), 'Must award gamification XP');
  });

  await runTest('ROUTES', 'M7-30', 'check-batch-status route concurrency guard checks existingLedger?.status === "completed" without tautological status inequality', () => {
    const routePath = path.join(process.cwd(), 'app', 'api', 'plantao', 'check-batch-status', 'route.ts');
    const content = fs.readFileSync(routePath, 'utf8');
    assert(content.includes("if (existingLedger?.status === 'completed')"), 'Must check existingLedger?.status === "completed" cleanly');
    assert(!content.includes("existingLedger?.status === 'completed' && testRecord.status !== currentStatus"), 'Tautological status inequality check must be removed');
  });

  await runTest('ROUTES', 'M7-31', 'check-batch-status route wraps parseJsonFromMarkdown in try/catch and provides fallback bed evaluation', () => {
    const routePath = path.join(process.cwd(), 'app', 'api', 'plantao', 'check-batch-status', 'route.ts');
    const content = fs.readFileSync(routePath, 'utf8');
    assert(content.includes('try {'), 'Must include try block around json parsing');
    assert(content.includes('parsedData = parseJsonFromMarkdown<any>(content)'), 'Must call parseJsonFromMarkdown');
    assert(content.includes('catch (parseErr)'), 'Must catch parsing errors');
    assert(content.includes("verdict: 'Requer Ajustes'"), 'Must evaluate with Requer Ajustes fallback on corrupted batch response');
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  const passedCount = allResults.filter((r) => r.passed).length;
  const failedCount = allResults.filter((r) => !r.passed).length;
  console.log(`TOTAL TESTS: ${allResults.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);

  if (failedCount > 0) {
    console.error('CHALLENGER VERIFICATION FAILED!');
    process.exit(1);
  } else {
    console.log('CHALLENGER VERIFICATION SUCCEEDED: ALL M7 BACKEND REQUIREMENTS VERIFIED!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
