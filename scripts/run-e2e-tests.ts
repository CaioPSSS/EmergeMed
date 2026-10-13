/**
 * E2E Test Suite Runner
 * Orchestrates and executes all 4 tiers of tests:
 * - Tier 1: Feature Coverage (>= 90 tests)
 * - Tier 2: Boundary & Corner Cases (>= 90 tests)
 * - Tier 3: Cross-Feature Combinations (>= 18 tests)
 * - Tier 4: Real-World Scenarios (>= 9 tests)
 * Total Minimum Threshold: >= 207 tests
 *
 * Usage: npx tsx scripts/run-e2e-tests.ts
 */

import { runTier1Tests } from '../tests/e2e/tier1-features.test';
import { runTier2Tests } from '../tests/e2e/tier2-boundaries.test';
import { runTier3Tests } from '../tests/e2e/tier3-pairwise.test';
import { runTier4Tests } from '../tests/e2e/tier4-scenarios.test';
import { TestResult } from '../tests/e2e/common';

async function main(): Promise<void> {
  const globalStart = Date.now();
  console.log('================================================================================');
  console.log('   EMERGEMED MODO PLANTÃO, QUIZ & BATCH RESTUDY — E2E TEST RUNNER');
  console.log('   Opaque-Box Requirement-Driven Test Suite (Tiers 1-4)');
  console.log('================================================================================\n');

  console.log('▶ [1/4] Executing Tier 1: Feature Coverage (F1.1 through F5.3)...');
  const tier1Start = Date.now();
  const tier1Results: TestResult[] = await runTier1Tests();
  const tier1Duration = Date.now() - tier1Start;
  const tier1Passed = tier1Results.filter((r) => r.passed).length;
  const tier1Failed = tier1Results.filter((r) => !r.passed).length;
  console.log(`  ✓ Tier 1 Finished: ${tier1Passed}/${tier1Results.length} passed in ${tier1Duration}ms\n`);

  console.log('▶ [2/4] Executing Tier 2: Boundary & Corner Cases (Limits, Caps, Mojibake)...');
  const tier2Start = Date.now();
  const tier2Results: TestResult[] = await runTier2Tests();
  const tier2Duration = Date.now() - tier2Start;
  const tier2Passed = tier2Results.filter((r) => r.passed).length;
  const tier2Failed = tier2Results.filter((r) => !r.passed).length;
  console.log(`  ✓ Tier 2 Finished: ${tier2Passed}/${tier2Results.length} passed in ${tier2Duration}ms\n`);

  console.log('▶ [3/4] Executing Tier 3: Cross-Feature Combinations (Pairwise Integrations)...');
  const tier3Start = Date.now();
  const tier3Results: TestResult[] = await runTier3Tests();
  const tier3Duration = Date.now() - tier3Start;
  const tier3Passed = tier3Results.filter((r) => r.passed).length;
  const tier3Failed = tier3Results.filter((r) => !r.passed).length;
  console.log(`  ✓ Tier 3 Finished: ${tier3Passed}/${tier3Results.length} passed in ${tier3Duration}ms\n`);

  console.log('▶ [4/4] Executing Tier 4: Real-World Application Scenarios (End-to-End Journeys)...');
  const tier4Start = Date.now();
  const tier4Results: TestResult[] = await runTier4Tests();
  const tier4Duration = Date.now() - tier4Start;
  const tier4Passed = tier4Results.filter((r) => r.passed).length;
  const tier4Failed = tier4Results.filter((r) => !r.passed).length;
  console.log(`  ✓ Tier 4 Finished: ${tier4Passed}/${tier4Results.length} passed in ${tier4Duration}ms\n`);

  const totalResults = [...tier1Results, ...tier2Results, ...tier3Results, ...tier4Results];
  const totalPassed = totalResults.filter((r) => r.passed).length;
  const totalFailed = totalResults.filter((r) => !r.passed).length;
  const totalDuration = Date.now() - globalStart;

  // Print failure details if any
  if (totalFailed > 0) {
    console.error('\n================================================================================');
    console.error('   FAILED TESTS SUMMARY');
    console.error('================================================================================');
    totalResults
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.error(`  ✖ [${r.id}] ${r.feature} — ${r.name}`);
        console.error(`    Error: ${r.error}\n`);
      });
  }

  // Summary Table
  console.log('\n================================================================================');
  console.log('   E2E TEST EXECUTION SUMMARY');
  console.log('================================================================================');
  console.log('| Tier | Description                    | Target | Actual | Passed | Failed | Status |');
  console.log('|------|--------------------------------|:------:|:------:|:------:|:------:|:------:|');
  console.log(
    `| T1   | Feature Coverage (F1.1-F5.3)   |  ≥ 90  |   ${tier1Results.length}   |   ${tier1Passed}   |   ${tier1Failed}    |  ${tier1Failed === 0 && tier1Results.length >= 90 ? 'PASS' : 'FAIL'}  |`
  );
  console.log(
    `| T2   | Boundary & Corner Cases        |  ≥ 90  |   ${tier2Results.length}   |   ${tier2Passed}   |   ${tier2Failed}    |  ${tier2Failed === 0 && tier2Results.length >= 90 ? 'PASS' : 'FAIL'}  |`
  );
  console.log(
    `| T3   | Cross-Feature Combinations     |  ≥ 18  |   ${tier3Results.length}   |   ${tier3Passed}   |   ${tier3Failed}    |  ${tier3Failed === 0 && tier3Results.length >= 18 ? 'PASS' : 'FAIL'}  |`
  );
  console.log(
    `| T4   | Real-World E2E Scenarios       |  ≥  9  |   ${tier4Results.length}   |   ${tier4Passed}   |   ${tier4Failed}    |  ${tier4Failed === 0 && tier4Results.length >= 9 ? 'PASS' : 'FAIL'}  |`
  );
  console.log('|------|--------------------------------|:------:|:------:|:------:|:------:|:------:|');
  console.log(
    `| ALL  | TOTAL COVERAGE                 |  ≥207  |  ${totalResults.length}   |  ${totalPassed}   |   ${totalFailed}    |  ${totalFailed === 0 && totalResults.length >= 207 ? 'PASS' : 'FAIL'}  |`
  );
  console.log('================================================================================');
  console.log(`Execution completed in ${totalDuration}ms.\n`);

  // Verification checks
  if (totalResults.length < 207) {
    console.error(`❌ INSUFFICIENT TEST COUNT: Expected at least 207 tests, executed ${totalResults.length}.`);
    process.exit(1);
  }

  if (totalFailed > 0) {
    console.error(`❌ TEST FAILURES DETECTED: ${totalFailed} tests failed.`);
    process.exit(1);
  }

  console.log('✅ ALL TEST SUITES PASSED STRICTLY (100% SUCCESSFUL). Test framework ready.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
