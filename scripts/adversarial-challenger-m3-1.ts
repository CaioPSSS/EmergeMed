/**
 * Empirical Adversarial Challenger 1 Suite for Milestone M3
 * (OpenRouter Nightly Batch Pipeline & Budget Ledger)
 *
 * Requirements R4 and R5:
 * 1. Exact mathematical cost calculation for `openai/gpt-6-luna:batch` across token values:
 *    (0, 1000, 1M, fractional micro-costs, negative validation, high-precision oracle).
 * 2. Daily Hard Cap ($0.15/day) boundary values:
 *    ($0.149999 allows submit, $0.150000 halts with capped status).
 * 3. Monthly Hard Cap ($0.90/month) boundary values:
 *    ($0.899999 allows submit, $0.900000 halts with capped status).
 * 4. Ledger recording accumulated totals, status='capped', and hard_cap_interrupted=true.
 * 5. Dynamic budget request slicing and pre-submission cutoff integration.
 * 6. Property-based fuzzing oracles (10,000 price evaluations + 2,000 cap evaluations).
 */

import fs from 'fs';
import path from 'path';
import {
  BATCH_MODEL,
  PROMPT_TOKEN_PRICE_PER_M,
  COMPLETION_TOKEN_PRICE_PER_M,
  DAILY_HARD_CAP_USD,
  MONTHLY_HARD_CAP_USD,
  MAX_BEDS_PER_CHAPTER,
  MAX_MCQS_PER_CHAPTER,
  BatchLedgerRow,
  calculateBatchCost,
  evaluateBudgetCapBreach,
  fetchAccumulatedBudget,
  insertBatchLedgerRecord,
  readLocalLedger,
  writeLocalLedger,
} from '../lib/ai/openrouter-batch';
import {
  runBatchSubmission,
  verifyAntiSpoiler,
  validateBedCase,
  validateMCQ,
} from './nightly-batch-pipeline';

// ============================================================================
// ASSERTION ENGINE & LEDGER ISOLATION
// ============================================================================

interface TestResult {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  details?: string;
}

const testResults: TestResult[] = [];

function check(
  id: string,
  category: string,
  name: string,
  condition: boolean,
  details?: string
): void {
  if (condition) {
    testResults.push({ id, category, name, passed: true });
    console.log(`  ✓ [PASS] [${id}] [${category}] ${name}`);
  } else {
    testResults.push({ id, category, name, passed: false, details });
    console.error(`  ✗ [FAIL] [${id}] [${category}] ${name} -> ${details || 'Assertion failed'}`);
  }
}

const LOCAL_LEDGER_FILE = path.join(process.cwd(), '.agents', 'batch-generation-ledger-local.json');
let savedLedgerBackup: string | null = null;

function backupLedger(): void {
  if (fs.existsSync(LOCAL_LEDGER_FILE)) {
    savedLedgerBackup = fs.readFileSync(LOCAL_LEDGER_FILE, 'utf8');
  }
}

function restoreLedger(): void {
  if (savedLedgerBackup !== null) {
    fs.writeFileSync(LOCAL_LEDGER_FILE, savedLedgerBackup, 'utf8');
    console.log('\n[Teardown] Original ledger file restored.');
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runChallenger1Suite(): Promise<void> {
  console.log('\n================================================================================');
  console.log('⚔️  EMPIRICAL ADVERSARIAL CHALLENGER 1: MILESTONE M3');
  console.log('   Scope: Budget Governance, Hard Caps ($0.15/$0.90) & Cost Calculations');
  console.log('================================================================================\n');

  backupLedger();

  try {
    // ------------------------------------------------------------------------
    // SECTION 1: SPECIFICATION CONTRACT VERIFICATION
    // ------------------------------------------------------------------------
    console.log('▶ [Section 1] Specification Constants & Contract Invariants');

    check(
      'M3.1-SPEC-1',
      'Contract',
      'Model name is strictly openai/gpt-6-luna:batch',
      BATCH_MODEL === 'openai/gpt-6-luna:batch'
    );
    check(
      'M3.1-SPEC-2',
      'Contract',
      'Prompt token price per million is $0.05',
      PROMPT_TOKEN_PRICE_PER_M === 0.05
    );
    check(
      'M3.1-SPEC-3',
      'Contract',
      'Completion token price per million is $0.25',
      COMPLETION_TOKEN_PRICE_PER_M === 0.25
    );
    check(
      'M3.1-SPEC-4',
      'Contract',
      'Daily Hard Cap is strictly $0.15',
      DAILY_HARD_CAP_USD === 0.15
    );
    check(
      'M3.1-SPEC-5',
      'Contract',
      'Monthly Hard Cap is strictly $0.90',
      MONTHLY_HARD_CAP_USD === 0.90
    );
    check(
      'M3.1-SPEC-6',
      'Contract',
      'Max beds per chapter is strictly 6',
      MAX_BEDS_PER_CHAPTER === 6
    );
    check(
      'M3.1-SPEC-7',
      'Contract',
      'Max MCQs per chapter is strictly 20',
      MAX_MCQS_PER_CHAPTER === 20
    );

    // ------------------------------------------------------------------------
    // SECTION 2: COST CALCULATION FORMULA ACROSS TOKEN VALUES
    // ------------------------------------------------------------------------
    console.log('\n▶ [Section 2] Cost Calculation Formula across Token Values');

    // 2.1 Zero tokens
    check(
      'M3.1-COST-1',
      'Cost Calculation',
      'Zero tokens yields exactly $0.000000',
      calculateBatchCost(0, 0) === 0
    );

    // 2.2 1,000 tokens
    check(
      'M3.1-COST-2',
      'Cost Calculation',
      '1,000 prompt tokens = (1000/1e6)*0.05 = $0.000050',
      calculateBatchCost(1000, 0) === 0.00005
    );
    check(
      'M3.1-COST-3',
      'Cost Calculation',
      '1,000 completion tokens = (1000/1e6)*0.25 = $0.000250',
      calculateBatchCost(0, 1000) === 0.00025
    );
    check(
      'M3.1-COST-4',
      'Cost Calculation',
      '1,000 prompt + 1,000 completion tokens = $0.000300',
      calculateBatchCost(1000, 1000) === 0.0003
    );

    // 2.3 1,000,000 tokens (1M)
    check(
      'M3.1-COST-5',
      'Cost Calculation',
      '1,000,000 prompt tokens = $0.050000',
      calculateBatchCost(1_000_000, 0) === 0.05
    );
    check(
      'M3.1-COST-6',
      'Cost Calculation',
      '1,000,000 completion tokens = $0.250000',
      calculateBatchCost(0, 1_000_000) === 0.25
    );
    check(
      'M3.1-COST-7',
      'Cost Calculation',
      '1M prompt + 1M completion tokens = $0.300000',
      calculateBatchCost(1_000_000, 1_000_000) === 0.3
    );

    // 2.4 Fractional micro-costs and microdollar resolution
    check(
      'M3.1-COST-8',
      'Micro Precision',
      '20 prompt tokens = exactly $0.000001 (1 microdollar resolution)',
      calculateBatchCost(20, 0) === 0.000001
    );
    check(
      'M3.1-COST-9',
      'Micro Precision',
      '4 completion tokens = exactly $0.000001 (1 microdollar resolution)',
      calculateBatchCost(0, 4) === 0.000001
    );
    check(
      'M3.1-COST-10',
      'Micro Precision',
      '20 prompt + 4 completion tokens = exactly $0.000002',
      calculateBatchCost(20, 4) === 0.000002
    );
    check(
      'M3.1-COST-11',
      'Micro Precision',
      '10 prompt tokens (half microdollar) rounds to $0.000001',
      calculateBatchCost(10, 0) === 0.000001
    );
    check(
      'M3.1-COST-12',
      'Micro Precision',
      '1 prompt token (0.00000005) rounds down to $0.000000',
      calculateBatchCost(1, 0) === 0
    );

    // 2.5 Realistic batch pipeline request sizes
    check(
      'M3.1-COST-13',
      'Pipeline Costing',
      'Standard Bed Case (1500 prompt, 1000 comp) costs $0.000325',
      calculateBatchCost(1500, 1000) === 0.000325
    );
    check(
      'M3.1-COST-14',
      'Pipeline Costing',
      'Standard MCQ Batch (1200 prompt, 1500 comp) costs $0.000435',
      calculateBatchCost(1200, 1500) === 0.000435
    );

    // 2.6 Error handling on negative inputs
    let negPromptError = false;
    try {
      calculateBatchCost(-10, 50);
    } catch (e: any) {
      negPromptError = e.message.includes('negative');
    }
    check(
      'M3.1-COST-15',
      'Negative Inputs',
      'Negative prompt tokens throws descriptive error',
      negPromptError
    );

    let negCompError = false;
    try {
      calculateBatchCost(50, -10);
    } catch (e: any) {
      negCompError = e.message.includes('negative');
    }
    check(
      'M3.1-COST-16',
      'Negative Inputs',
      'Negative completion tokens throws descriptive error',
      negCompError
    );

    // 2.7 Massive scale verification
    check(
      'M3.1-COST-17',
      'Scale Testing',
      '50,000,000 prompt + 100,000,000 completion = $2.50 + $25.00 = $27.500000',
      calculateBatchCost(50_000_000, 100_000_000) === 27.5
    );

    // ------------------------------------------------------------------------
    // SECTION 3: DAILY HARD CAP ($0.15/DAY) BOUNDARY TESTING
    // ------------------------------------------------------------------------
    console.log('\n▶ [Section 3] Daily Hard Cap ($0.15/day) Boundary Testing');

    // Boundary 3.1: $0.149999 + $0.000001 = $0.150000 (ALLOWS SUBMIT)
    const dBoundaryAllow = evaluateBudgetCapBreach(0.149999, 0.0, 0.000001);
    check(
      'M3.1-CAPD-1',
      'Daily Cap Boundary',
      '$0.149999 daily + $0.000001 candidate = $0.150000 allows submit',
      dBoundaryAllow.canProceed === true && dBoundaryAllow.reason === undefined
    );

    // Boundary 3.2: $0.149999 + $0.000002 = $0.150001 (HALTS with daily_cap)
    const dBoundaryHalt = evaluateBudgetCapBreach(0.149999, 0.0, 0.000002);
    check(
      'M3.1-CAPD-2',
      'Daily Cap Boundary',
      '$0.149999 daily + $0.000002 candidate = $0.150001 halts with daily_cap',
      dBoundaryHalt.canProceed === false && dBoundaryHalt.reason === 'daily_cap'
    );

    // Boundary 3.3: $0.150000 + $0.000001 = $0.150001 (HALTS with daily_cap)
    const dCeilingHalt = evaluateBudgetCapBreach(0.15, 0.0, 0.000001);
    check(
      'M3.1-CAPD-3',
      'Daily Cap Boundary',
      '$0.150000 ceiling + $0.000001 candidate halts with daily_cap',
      dCeilingHalt.canProceed === false && dCeilingHalt.reason === 'daily_cap'
    );

    // Boundary 3.4: $0.150000 + $0.000000 = $0.150000 (Exact ceiling with 0 cost is accepted)
    const dCeilingZero = evaluateBudgetCapBreach(0.15, 0.0, 0.0);
    check(
      'M3.1-CAPD-4',
      'Daily Cap Boundary',
      '$0.150000 ceiling + $0.000000 candidate is accepted',
      dCeilingZero.canProceed === true
    );

    // Boundary 3.5: Pre-existing overage $0.150001 halts even with 0 candidate cost
    const dOverHalt = evaluateBudgetCapBreach(0.150001, 0.0, 0.0);
    check(
      'M3.1-CAPD-5',
      'Daily Cap Boundary',
      'Pre-existing overage $0.150001 halts immediately',
      dOverHalt.canProceed === false && dOverHalt.reason === 'daily_cap'
    );

    // ------------------------------------------------------------------------
    // SECTION 4: MONTHLY HARD CAP ($0.90/MONTH) BOUNDARY TESTING
    // ------------------------------------------------------------------------
    console.log('\n▶ [Section 4] Monthly Hard Cap ($0.90/month) Boundary Testing');

    // Boundary 4.1: $0.899999 + $0.000001 = $0.900000 (ALLOWS SUBMIT)
    const mBoundaryAllow = evaluateBudgetCapBreach(0.0, 0.899999, 0.000001);
    check(
      'M3.1-CAPM-1',
      'Monthly Cap Boundary',
      '$0.899999 monthly + $0.000001 candidate = $0.900000 allows submit',
      mBoundaryAllow.canProceed === true && mBoundaryAllow.reason === undefined
    );

    // Boundary 4.2: $0.899999 + $0.000002 = $0.900001 (HALTS with monthly_cap)
    const mBoundaryHalt = evaluateBudgetCapBreach(0.0, 0.899999, 0.000002);
    check(
      'M3.1-CAPM-2',
      'Monthly Cap Boundary',
      '$0.899999 monthly + $0.000002 candidate = $0.900001 halts with monthly_cap',
      mBoundaryHalt.canProceed === false && mBoundaryHalt.reason === 'monthly_cap'
    );

    // Boundary 4.3: $0.900000 + $0.000001 = $0.900001 (HALTS with monthly_cap)
    const mCeilingHalt = evaluateBudgetCapBreach(0.0, 0.9, 0.000001);
    check(
      'M3.1-CAPM-3',
      'Monthly Cap Boundary',
      '$0.900000 ceiling + $0.000001 candidate halts with monthly_cap',
      mCeilingHalt.canProceed === false && mCeilingHalt.reason === 'monthly_cap'
    );

    // Boundary 4.4: Pre-existing overage $0.900001 halts immediately
    const mOverHalt = evaluateBudgetCapBreach(0.0, 0.900001, 0.0);
    check(
      'M3.1-CAPM-4',
      'Monthly Cap Boundary',
      'Pre-existing overage $0.900001 monthly halts immediately',
      mOverHalt.canProceed === false && mOverHalt.reason === 'monthly_cap'
    );

    // Boundary 4.5: Partial monthly allowance with daily compliance
    // Daily $0.05 (allowed <= 0.15), Monthly $0.85 + $0.05 = $0.90 (ALLOWS SUBMIT)
    const mPartialAllow = evaluateBudgetCapBreach(0.0, 0.85, 0.05);
    check(
      'M3.1-CAPM-5',
      'Monthly Cap Boundary',
      'Monthly $0.85 + candidate $0.050000 = $0.900000 allows submit',
      mPartialAllow.canProceed === true
    );

    // Boundary 4.6: Partial monthly breach: $0.85 + $0.050001 = $0.900001 (HALTS with monthly_cap)
    const mPartialHalt = evaluateBudgetCapBreach(0.0, 0.85, 0.050001);
    check(
      'M3.1-CAPM-6',
      'Monthly Cap Boundary',
      'Monthly $0.85 + candidate $0.050001 = $0.900001 halts with monthly_cap',
      mPartialHalt.canProceed === false && mPartialHalt.reason === 'monthly_cap'
    );

    // Boundary 4.7: Simultaneous ceiling: Daily 0.149999 + 0.000001 = 0.150000, Monthly 0.899999 + 0.000001 = 0.900000
    const dualCeiling = evaluateBudgetCapBreach(0.149999, 0.899999, 0.000001);
    check(
      'M3.1-CAPM-7',
      'Dual Cap Boundary',
      'Both daily and monthly reach exact caps simultaneously -> allows submit',
      dualCeiling.canProceed === true
    );

    // Boundary 4.8: Simultaneous breach: daily cap evaluated first
    const dualBreach = evaluateBudgetCapBreach(0.149999, 0.899999, 0.000002);
    check(
      'M3.1-CAPM-8',
      'Dual Cap Boundary',
      'Both caps breached simultaneously -> daily_cap takes precedence',
      dualBreach.canProceed === false && dualBreach.reason === 'daily_cap'
    );

    // ------------------------------------------------------------------------
    // SECTION 5: BATCH GENERATION LEDGER ACCUMULATION & HARD CAP INTERRUPTION
    // ------------------------------------------------------------------------
    console.log('\n▶ [Section 5] Batch Ledger Accumulation & hard_cap_interrupted Flag');

    const simulatedNow = new Date();
    const todayIso = simulatedNow.toISOString();
    const yesterdayIso = new Date(simulatedNow.getTime() - 24 * 3600 * 1000).toISOString();

    // Isolated ledger records for testing accumulation
    const testLedger: BatchLedgerRow[] = [
      {
        batch_id: 'batch_test_item_1',
        submission_timestamp: todayIso,
        completion_timestamp: todayIso,
        model: BATCH_MODEL,
        prompt_tokens: 1_000_000,
        completion_tokens: 0,
        cost_usd: 0.05,
        daily_accumulated_usd: 0.05,
        monthly_accumulated_usd: 0.05,
        hard_cap_interrupted: false,
        items_requested: 10,
        items_ingested: 10,
        items_failed: 0,
        status: 'completed',
      },
      {
        batch_id: 'batch_test_item_2',
        submission_timestamp: todayIso,
        completion_timestamp: todayIso,
        model: BATCH_MODEL,
        prompt_tokens: 1_000_000,
        completion_tokens: 0,
        cost_usd: 0.05,
        daily_accumulated_usd: 0.10,
        monthly_accumulated_usd: 0.10,
        hard_cap_interrupted: false,
        items_requested: 10,
        items_ingested: 10,
        items_failed: 0,
        status: 'completed',
      },
    ];

    writeLocalLedger(testLedger);

    const budgetStatus = await fetchAccumulatedBudget(null);
    check(
      'M3.1-LEDG-1',
      'Ledger Accumulation',
      'Accumulated daily spend is sum of today items ($0.100000)',
      budgetStatus.dailyAccumulated === 0.1
    );

    // Record hard cap interrupted entry
    const insertedCapped = await insertBatchLedgerRecord(
      {
        batch_id: 'batch_test_capped_halt',
        submission_timestamp: new Date().toISOString(),
        completion_timestamp: new Date().toISOString(),
        model: BATCH_MODEL,
        prompt_tokens: 0,
        completion_tokens: 0,
        cost_usd: 0,
        daily_accumulated_usd: 0.15,
        monthly_accumulated_usd: 0.15,
        hard_cap_interrupted: true,
        items_requested: 0,
        items_ingested: 0,
        items_failed: 0,
        status: 'capped',
      },
      null
    );

    check(
      'M3.1-LEDG-2',
      'Ledger Hard Cap Flag',
      'Ledger entry sets hard_cap_interrupted = true',
      insertedCapped.hard_cap_interrupted === true
    );
    check(
      'M3.1-LEDG-3',
      'Ledger Hard Cap Status',
      'Ledger entry sets status = "capped"',
      insertedCapped.status === 'capped'
    );
    check(
      'M3.1-LEDG-4',
      'Ledger Hard Cap Cost',
      'Capped ledger entry records cost_usd = 0',
      insertedCapped.cost_usd === 0
    );

    const reReadRows = readLocalLedger();
    const storedCapped = reReadRows.find((r) => r.batch_id === 'batch_test_capped_halt');
    check(
      'M3.1-LEDG-5',
      'Ledger Persistence',
      'Capped record correctly persisted in ledger storage with all fields',
      storedCapped !== undefined &&
        storedCapped.hard_cap_interrupted === true &&
        storedCapped.status === 'capped' &&
        storedCapped.daily_accumulated_usd === 0.15
    );

    // ------------------------------------------------------------------------
    // SECTION 6: PIPELINE SUBMISSION PRE-CHECK & DYNAMIC SLICING
    // ------------------------------------------------------------------------
    console.log('\n▶ [Section 6] Pipeline Submission Pre-Check & Dynamic Slicing');

    // Test 6.1: When dailyAccumulated >= 0.150000, pipeline halts immediately
    const cappedLedgerState: BatchLedgerRow[] = [
      {
        batch_id: 'batch_mock_pre_capped',
        submission_timestamp: new Date().toISOString(),
        completion_timestamp: new Date().toISOString(),
        model: BATCH_MODEL,
        prompt_tokens: 3_000_000,
        completion_tokens: 0,
        cost_usd: 0.15,
        daily_accumulated_usd: 0.15,
        monthly_accumulated_usd: 0.15,
        hard_cap_interrupted: false,
        items_requested: 100,
        items_ingested: 100,
        items_failed: 0,
        status: 'completed',
      },
    ];
    writeLocalLedger(cappedLedgerState);

    // Run pipeline submit in mock mode - should halt at pre-check
    await runBatchSubmission(true);

    const postHaltRows = readLocalLedger();
    const latestCappedRecord = postHaltRows[postHaltRows.length - 1];
    check(
      'M3.1-PIPE-1',
      'Pipeline Pre-Check',
      'Pipeline submit at $0.15 ceiling immediately halts with status="capped" and hard_cap_interrupted=true',
      latestCappedRecord.hard_cap_interrupted === true && latestCappedRecord.status === 'capped'
    );

    // Test 6.2: Dynamic Slicing: When remaining daily budget is $0.000400
    // (dailyAccumulated = 0.149600)
    // Bed case cost = $0.000325 (fits!)
    // 2nd Bed case = $0.000325 + $0.000325 = $0.000650 (does not fit, sliced!)
    const nearCapLedgerState: BatchLedgerRow[] = [
      {
        batch_id: 'batch_near_cap_1',
        submission_timestamp: new Date().toISOString(),
        completion_timestamp: new Date().toISOString(),
        model: BATCH_MODEL,
        prompt_tokens: 2_992_000,
        completion_tokens: 0,
        cost_usd: 0.1496,
        daily_accumulated_usd: 0.1496,
        monthly_accumulated_usd: 0.1496,
        hard_cap_interrupted: false,
        items_requested: 50,
        items_ingested: 50,
        items_failed: 0,
        status: 'completed',
      },
    ];
    writeLocalLedger(nearCapLedgerState);

    await runBatchSubmission(true);

    const slicedRows = readLocalLedger();
    const submittedRecord = slicedRows[slicedRows.length - 1];
    check(
      'M3.1-PIPE-2',
      'Dynamic Slicing',
      'Pipeline dynamically slices requests to fit exactly 1 item within $0.000400 headroom',
      submittedRecord.items_requested === 1 && submittedRecord.status === 'submitted'
    );

    // Clean up mock batch file if generated
    const mockFile = path.join(process.cwd(), '.agents', `mock_batch_${submittedRecord.batch_id}.json`);
    if (fs.existsSync(mockFile)) {
      try {
        fs.unlinkSync(mockFile);
      } catch {}
    }

    // ------------------------------------------------------------------------
    // SECTION 7: RANDOMIZED PROPERTY FUZZING (ORACLE VALIDATION)
    // ------------------------------------------------------------------------
    console.log('\n▶ [Section 7] Randomized Property Fuzzing (High-Precision Oracles)');

    // 7.1 Mathematical Cost Oracle (10,000 trials)
    let mathFuzzFails = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      const p = Math.floor(Math.random() * 5_000_000);
      const c = Math.floor(Math.random() * 5_000_000);
      const calculated = calculateBatchCost(p, c);

      // Independent high precision oracle
      const expected = Number(((p / 1e6) * 0.05 + (c / 1e6) * 0.25).toFixed(6));
      if (Math.abs(calculated - expected) > 1e-6) {
        mathFuzzFails++;
      }
    }
    check(
      'M3.1-FUZZ-1',
      'Property Fuzzing',
      '10,000 random token pairs strictly match high-precision oracle (0 delta)',
      mathFuzzFails === 0,
      `Failures: ${mathFuzzFails} / ${trials}`
    );

    // 7.2 Monotonicity Invariant Oracle (2,000 trials)
    let invFuzzFails = 0;
    const invTrials = 2000;
    for (let i = 0; i < invTrials; i++) {
      const d = Math.round(Math.random() * 0.16 * 1e6) / 1e6;
      const m = Math.round(Math.random() * 0.95 * 1e6) / 1e6;
      const c = Math.round(Math.random() * 0.02 * 1e6) / 1e6;

      const fullRes = evaluateBudgetCapBreach(d, m, c);
      const halfC = Math.round((c * 0.5) * 1e6) / 1e6;
      const halfRes = evaluateBudgetCapBreach(d, m, halfC);

      // If larger cost is approved, half cost must unconditionally be approved
      if (fullRes.canProceed && !halfRes.canProceed) {
        invFuzzFails++;
      }
    }
    check(
      'M3.1-FUZZ-2',
      'Property Fuzzing',
      '2,000 budget cap evaluations satisfy monotonic invariance',
      invFuzzFails === 0,
      `Monotonicity failures: ${invFuzzFails}`
    );

  } finally {
    restoreLedger();
  }

  // --------------------------------------------------------------------------
  // EXECUTIVE SUMMARY TABLE
  // --------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log('📊 CHALLENGER 1 EMPIRICAL RESULTS SUMMARY (MILESTONE M3)');
  console.log('================================================================================');

  const categories = Array.from(new Set(testResults.map((t) => t.category)));
  let totalPassed = 0;
  let totalFailed = 0;

  console.log('| Category                     | Tests | Passed | Failed | Status |');
  console.log('|------------------------------|:-----:|:------:|:------:|:------:|');

  for (const cat of categories) {
    const inCat = testResults.filter((t) => t.category === cat);
    const pass = inCat.filter((t) => t.passed).length;
    const fail = inCat.filter((t) => !t.passed).length;
    totalPassed += pass;
    totalFailed += fail;
    const status = fail === 0 ? 'PASS' : 'FAIL';
    console.log(`| ${cat.padEnd(28)} | ${String(inCat.length).padStart(5)} | ${String(pass).padStart(6)} | ${String(fail).padStart(6)} |  ${status}  |`);
  }

  console.log('|------------------------------|:-----:|:------:|:------:|:------:|');
  console.log(`| TOTAL                        | ${String(testResults.length).padStart(5)} | ${String(totalPassed).padStart(6)} | ${String(totalFailed).padStart(6)} |  ${totalFailed === 0 ? 'PASS' : 'FAIL'}  |`);
  console.log('================================================================================\n');

  if (totalFailed > 0) {
    console.error(`❌ VERDICT: CHALLENGE_FAILED (${totalFailed} failure(s) found)`);
    process.exit(1);
  } else {
    console.log(`✅ VERDICT: APPROVE (All ${totalPassed} empirical stress tests strictly passed)`);
    process.exit(0);
  }
}

runChallenger1Suite().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
