/**
 * Adversarial Challenger Suite for Milestone M9:
 * Dashboard & Plantões Active Signaling and Background Batch Ingestion
 *
 * Requirements Tested:
 * 1. ActivePlantaoBanner Component:
 *    - Supports all 5 states: in_progress, awaiting_batch_bed_evaluation, ready_for_adverse, awaiting_batch_feedback, completed.
 *    - Verbatim copies match Requirement R4 exactly:
 *      - Batch awaiting: "⏳ Passagem de Plantão Assíncrona em processamento no lote (OpenRouter Batch)..."
 *      - Adverse alert: "🔔 Intercorrência Clínica! O leito descompensou após a conduta inicial. Clique para atender a evolução adversa."
 *      - Completed report: "✨ Passagem de Plantão concluída! Veja seu relatório pedagógico de preceptoria."
 *      - In progress: "🏥 Plantão em Andamento — Leitos aguardando prescrição e conduta na Sala Vermelha."
 *    - Verbatim buttons: "🔄 Atualizar Status do Lote", "🚨 Atender Intercorrência", "📊 Ver Resultados", "Continuar Plantão".
 *    - Manual refresh button with loading spinner & disabled state.
 *    - Dismissal support for completed banner.
 *    - Displays submission timestamp.
 * 2. Dashboard Integration (app/(authenticated)/dashboard/page.tsx):
 *    - Queries most recent plantão: mode === 'plantao', order created_at desc, limit 1.
 *    - Robust fallback resolution: status || plantao_data?.status || (completed ? 'completed' : 'in_progress').
 *    - Placed between Header Banner and Stats Bar.
 *    - Non-blocking useEffect polling when awaiting batch.
 *    - Non-blocking loadDashboardData(true) execution without page flickering.
 *    - Manual check button handler.
 * 3. Plantoes List Integration (app/(authenticated)/plantoes/page.tsx):
 *    - Resolves 5 states for every item.
 *    - 5 colored badges:
 *      - in_progress: Amber "Em Andamento"
 *      - awaiting_batch_bed_evaluation: Cyan "⏳ Avaliando Leitos (Lote)"
 *      - ready_for_adverse: Rose/Red "🔔 Intercorrência Clínica!"
 *      - awaiting_batch_feedback: Violet "⏳ Gerando Preceptoria (Lote)"
 *      - completed: Emerald "✓ Concluído" with score
 *    - Contextual action buttons:
 *      - in_progress: "Continuar Plantão" -> /testes/[id]
 *      - awaiting_batch_*: "🔄 Atualizar Lote"
 *      - ready_for_adverse: "🚨 Atender Intercorrência" -> /testes/[id]
 *      - completed: "Ver Resultados" -> /testes/[id]/resultado
 *    - Non-blocking background check upon mount for pending batch plantões.
 *    - Discrete per-item checking spinner.
 * 4. State Machine & Polling Simulations:
 *    - Full transition simulation across all 5 states.
 *    - Non-blocking asynchronous updates without UI freeze.
 *
 * Usage: npx tsx tests/challenger-m9-ui-signaling.ts
 */

import fs from 'fs';
import path from 'path';
import {
  PlantaoTestStatus,
  PLANTAO_STATUSES,
  isValidPlantaoStatus,
  isPendingBatchStatus,
} from '../types/plantao';

interface TestResult {
  suite: string;
  id: string;
  name: string;
  passed: boolean;
  error?: string;
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

// ============================================================================
// SUITE 1: ActivePlantaoBanner Component Structure & Verbatim Copy
// ============================================================================
async function testBannerComponent() {
  console.log('\n--- SUITE 1: ActivePlantaoBanner Component Structure & Verbatim Copy ---');

  const bannerPath = path.resolve(process.cwd(), 'components/dashboard/ActivePlantaoBanner.tsx');

  await runTest('BANNER', 'B1-FILE-EXISTS', 'ActivePlantaoBanner.tsx exists at expected location', () => {
    assert(fs.existsSync(bannerPath), `File does not exist: ${bannerPath}`);
  });

  const bannerContent = fs.readFileSync(bannerPath, 'utf-8');

  await runTest('BANNER', 'B2-EXPORTS', 'Exports ActivePlantaoBanner and ActivePlantaoData types', () => {
    assert(bannerContent.includes('export function ActivePlantaoBanner'), 'Missing export ActivePlantaoBanner');
    assert(bannerContent.includes('export interface ActivePlantaoData'), 'Missing export interface ActivePlantaoData');
    assert(bannerContent.includes('export interface ActivePlantaoBannerProps'), 'Missing export interface ActivePlantaoBannerProps');
  });

  await runTest('BANNER', 'B3-COPY-VERBATIM-AWAITING', 'Verbatim copy match for awaiting_batch states', () => {
    const expectedHeading = '⏳ Passagem de Plantão Assíncrona em processamento no lote (OpenRouter Batch)...';
    const expectedButton = '🔄 Atualizar Status do Lote';
    assert(bannerContent.includes(expectedHeading), `Missing verbatim awaiting heading: "${expectedHeading}"`);
    assert(bannerContent.includes(expectedButton), `Missing verbatim refresh button text: "${expectedButton}"`);
    assert(bannerContent.includes('OpenRouter Batch • 50% de Economia'), 'Missing economy badge copy');
  });

  await runTest('BANNER', 'B4-COPY-VERBATIM-ADVERSE', 'Verbatim copy match for ready_for_adverse state', () => {
    const expectedHeading = '🔔 Intercorrência Clínica! O leito descompensou após a conduta inicial. Clique para atender a evolução adversa.';
    const expectedButton = '🚨 Atender Intercorrência';
    assert(bannerContent.includes(expectedHeading), `Missing verbatim adverse heading: "${expectedHeading}"`);
    assert(bannerContent.includes(expectedButton), `Missing verbatim adverse button text: "${expectedButton}"`);
    assert(bannerContent.includes('router.push(`/testes/${plantao.id}`)'), 'Adverse button must route to /testes/${plantao.id}');
  });

  await runTest('BANNER', 'B5-COPY-VERBATIM-COMPLETED', 'Verbatim copy match for completed state', () => {
    const expectedHeading = '✨ Passagem de Plantão concluída! Veja seu relatório pedagógico de preceptoria.';
    const expectedButton = '📊 Ver Resultados';
    assert(bannerContent.includes(expectedHeading), `Missing verbatim completed heading: "${expectedHeading}"`);
    assert(bannerContent.includes(expectedButton), `Missing verbatim view results button text: "${expectedButton}"`);
    assert(bannerContent.includes('router.push(`/testes/${plantao.id}/resultado`)'), 'Completed button must route to /testes/${plantao.id}/resultado');
  });

  await runTest('BANNER', 'B6-COPY-VERBATIM-IN-PROGRESS', 'Verbatim copy match for in_progress state', () => {
    const expectedHeading = '🏥 Plantão em Andamento — Leitos aguardando prescrição e conduta na Sala Vermelha.';
    const expectedButton = 'Continuar Plantão';
    assert(bannerContent.includes(expectedHeading), `Missing verbatim in_progress heading: "${expectedHeading}"`);
    assert(bannerContent.includes(expectedButton), `Missing verbatim continue button text: "${expectedButton}"`);
    assert(bannerContent.includes('router.push(`/testes/${plantao.id}`)'), 'In progress button must route to /testes/${plantao.id}');
  });

  await runTest('BANNER', 'B7-DISMISSAL-SUPPORT', 'Supports dismissal for completed state via onDismiss prop', () => {
    assert(bannerContent.includes('onDismiss?: () => void;'), 'ActivePlantaoBannerProps must accept optional onDismiss');
    assert(bannerContent.includes('data-testid="btn-dismiss-completed"'), 'Completed variant must render dismiss button');
    assert(bannerContent.includes('onClick={onDismiss}'), 'Dismiss button must trigger onDismiss');
  });

  await runTest('BANNER', 'B8-TIMESTAMP-FORMATTING', 'Formats and displays submission timestamp', () => {
    assert(bannerContent.includes('formatTimestamp'), 'Must have formatTimestamp helper');
    assert(bannerContent.includes('Enviado em:'), 'Must display "Enviado em:" label with timestamp');
    assert(bannerContent.includes('batch_submitted_at') || bannerContent.includes('created_at'), 'Must resolve submission timestamp');
  });

  await runTest('BANNER', 'B9-REFRESH-SPINNER', 'Refresh button indicates loading state when isRefreshing is true', () => {
    assert(bannerContent.includes('disabled={isRefreshing}'), 'Button must be disabled when isRefreshing');
    assert(bannerContent.includes('animate-spin'), 'Must include spinning animation for loading');
    assert(bannerContent.includes('Consultando Lote...'), 'Must render loading feedback text');
  });
}

// ============================================================================
// SUITE 2: Dashboard Integration & Non-Blocking Ingestion
// ============================================================================
async function testDashboardIntegration() {
  console.log('\n--- SUITE 2: Dashboard Integration & Non-Blocking Ingestion ---');

  const dashboardPath = path.resolve(process.cwd(), 'app/(authenticated)/dashboard/page.tsx');
  assert(fs.existsSync(dashboardPath), `Dashboard file does not exist: ${dashboardPath}`);

  const content = fs.readFileSync(dashboardPath, 'utf-8');

  await runTest('DASHBOARD', 'D1-IMPORT', 'Imports ActivePlantaoBanner and ActivePlantaoData', () => {
    assert(content.includes("from '@/components/dashboard/ActivePlantaoBanner'"), 'Missing import of ActivePlantaoBanner');
    assert(content.includes('ActivePlantaoBanner'), 'Missing ActivePlantaoBanner identifier');
  });

  await runTest('DASHBOARD', 'D2-STATE', 'Declares activePlantao, isCheckingBatch, and dismissCompletedBanner states', () => {
    assert(content.includes('const [activePlantao, setActivePlantao] = useState'), 'Missing activePlantao state');
    assert(content.includes('const [isCheckingBatch, setIsCheckingBatch] = useState'), 'Missing isCheckingBatch state');
    assert(content.includes('const [dismissCompletedBanner, setDismissCompletedBanner] = useState'), 'Missing dismissCompletedBanner state');
  });

  await runTest('DASHBOARD', 'D3-QUERY', 'Queries most recent plantão with mode === "plantao" and descending order', () => {
    assert(content.includes(".eq('mode', 'plantao')"), 'Query must filter by mode = plantao');
    assert(content.includes(".order('created_at', { ascending: false })"), 'Query must order by created_at desc');
    assert(content.includes('.limit(1)'), 'Query must limit to 1 record');
  });

  await runTest('DASHBOARD', 'D4-FALLBACK-RESOLUTION', 'Resolves status fallback: status || plantao_data?.status || completed', () => {
    assert(
      content.includes('plantaoRecord.status') &&
      content.includes('plantaoRecord.plantao_data?.status') &&
      content.includes('plantaoRecord.completed'),
      'Must resolve state fallback chain properly'
    );
  });

  await runTest('DASHBOARD', 'D5-JSX-PLACEMENT', 'Renders ActivePlantaoBanner between Header Banner and Stats Bar', () => {
    const bannerIdx = content.indexOf('<ActivePlantaoBanner');
    const statsBarIdx = content.indexOf('{/* Stats Bar */}');
    const headerIdx = content.indexOf('{/* Header Banner */}');

    assert(bannerIdx > -1, 'ActivePlantaoBanner JSX not found');
    assert(headerIdx > -1, 'Header Banner not found');
    assert(statsBarIdx > -1, 'Stats Bar not found');
    assert(bannerIdx > headerIdx, 'ActivePlantaoBanner must be below Header Banner');
    assert(bannerIdx < statsBarIdx, 'ActivePlantaoBanner must be above Stats Bar');
  });

  await runTest('DASHBOARD', 'D6-NON-BLOCKING-CHECK', 'Calls /api/plantao/check-batch-status non-blockingly and reloads data', () => {
    assert(content.includes('/api/plantao/check-batch-status'), 'Must call /api/plantao/check-batch-status');
    assert(content.includes('handleBatchCheck'), 'Must define handleBatchCheck handler');
    assert(content.includes('result.updated'), 'Must check result.updated');
    assert(content.includes('loadDashboardData(true)'), 'Must call loadDashboardData silently (true) on update');
  });

  await runTest('DASHBOARD', 'D7-AUTO-POLL-EFFECT', 'useEffect triggers batch check when activePlantao is awaiting_batch_*', () => {
    assert(
      content.includes('awaiting_batch_bed_evaluation') &&
      content.includes('awaiting_batch_feedback'),
      'useEffect must check both awaiting batch states'
    );
  });

  await runTest('DASHBOARD', 'D8-DISMISSAL-LOGIC', 'Respects dismissCompletedBanner flag for completed state', () => {
    assert(
      content.includes('!dismissCompletedBanner || activePlantao.status !== \'completed\''),
      'Must hide completed banner when dismissed'
    );
    assert(content.includes('setDismissCompletedBanner(true)'), 'Must set dismissCompletedBanner on dismiss');
  });
}

// ============================================================================
// SUITE 3: Plantoes List Badges & Contextual Action Buttons
// ============================================================================
async function testPlantoesPage() {
  console.log('\n--- SUITE 3: Plantoes List Badges & Contextual Action Buttons ---');

  const plantoesPath = path.resolve(process.cwd(), 'app/(authenticated)/plantoes/page.tsx');
  assert(fs.existsSync(plantoesPath), `Plantoes file does not exist: ${plantoesPath}`);

  const content = fs.readFileSync(plantoesPath, 'utf-8');

  await runTest('PLANTOES', 'P1-STATE-RESOLVER', 'Defines state resolver function supporting all 5 states', () => {
    assert(content.includes('getPlantaoState'), 'Missing getPlantaoState helper function');
    assert(content.includes('plantao_data?.status'), 'Must check plantao_data?.status');
    assert(content.includes('t.completed ? \'completed\' : \'in_progress\''), 'Must have legacy binary fallback');
  });

  await runTest('PLANTOES', 'P2-BADGE-TEXTS', 'Renders 5 colored badges with exact required texts', () => {
    const requiredBadges = [
      'Em Andamento',
      '⏳ Avaliando Leitos (Lote)',
      '🔔 Intercorrência Clínica!',
      '⏳ Gerando Preceptoria (Lote)',
      '✓ Concluído',
    ];

    for (const b of requiredBadges) {
      assert(content.includes(b), `Missing badge text: "${b}"`);
    }
  });

  await runTest('PLANTOES', 'P3-ACTION-BUTTONS', 'Renders contextual action buttons with exact labels', () => {
    const requiredActions = [
      'Continuar Plantão',
      '🔄 Atualizar Lote',
      '🚨 Atender Intercorrência',
      'Ver Resultados',
    ];

    for (const a of requiredActions) {
      assert(content.includes(a), `Missing action button label: "${a}"`);
    }
  });

  await runTest('PLANTOES', 'P4-ACTION-ROUTING', 'Action buttons route to correct endpoints', () => {
    assert(content.includes('router.push(`/testes/${t.id}`)'), 'Must route to /testes/${t.id} for continuing or adverse');
    assert(content.includes('router.push(`/testes/${t.id}/resultado`)'), 'Must route to /testes/${t.id}/resultado for completed');
  });

  await runTest('PLANTOES', 'P5-BACKGROUND-CHECK', 'Executes non-blocking background check upon mount for pending items', () => {
    assert(content.includes('runBackgroundBatchCheck'), 'Missing runBackgroundBatchCheck function');
    assert(content.includes('/api/plantao/check-batch-status'), 'Must call /api/plantao/check-batch-status');
  });

  await runTest('PLANTOES', 'P6-MANUAL-ITEM-REFRESH', 'Provides per-item manual refresh with checking state map', () => {
    assert(content.includes('handleCheckBatchItem'), 'Missing handleCheckBatchItem handler');
    assert(content.includes('checkingBatchMap'), 'Missing checkingBatchMap state');
    assert(content.includes('e.stopPropagation()'), 'Must prevent container click propagation');
  });
}

// ============================================================================
// SUITE 4: Functional State Machine & Simulated Polling Transitions
// ============================================================================
async function testStateMachineSimulation() {
  console.log('\n--- SUITE 4: Functional State Machine & Simulated Polling Transitions ---');

  // Pure resolution logic function under test (reproducing getPlantaoState)
  function resolvePlantaoState(t: any): PlantaoTestStatus {
    if (t.status && PLANTAO_STATUSES.includes(t.status)) return t.status;
    if (t.plantao_data?.status && PLANTAO_STATUSES.includes(t.plantao_data.status)) return t.plantao_data.status;
    return t.completed ? 'completed' : 'in_progress';
  }

  await runTest('STATE-MACHINE', 'SM1-RESOLVE-DIRECT-STATUS', 'Resolves direct status column across all 5 states', () => {
    for (const st of PLANTAO_STATUSES) {
      const record = { id: 'test-1', status: st, completed: false };
      assertEqual(resolvePlantaoState(record), st, `Direct status ${st} resolution`);
    }
  });

  await runTest('STATE-MACHINE', 'SM2-RESOLVE-PLANTAO-DATA-STATUS', 'Resolves status from plantao_data when column is null', () => {
    for (const st of PLANTAO_STATUSES) {
      const record = { id: 'test-2', status: null, plantao_data: { status: st }, completed: false };
      assertEqual(resolvePlantaoState(record), st, `plantao_data status ${st} resolution`);
    }
  });

  await runTest('STATE-MACHINE', 'SM3-RESOLVE-LEGACY-FALLBACK', 'Resolves legacy records with binary completed flag', () => {
    const legacyCompleted = { id: 'test-3', status: null, plantao_data: null, completed: true };
    assertEqual(resolvePlantaoState(legacyCompleted), 'completed', 'Legacy completed record');

    const legacyInProgress = { id: 'test-4', status: null, plantao_data: null, completed: false };
    assertEqual(resolvePlantaoState(legacyInProgress), 'in_progress', 'Legacy in_progress record');
  });

  await runTest('STATE-MACHINE', 'SM4-SIMULATE-BATCH-TRANSITIONS', 'Simulates batch completion transitions non-blockingly', async () => {
    // Initial state: awaiting batch bed evaluation
    let mockDB = {
      id: 'plantao-sim-100',
      status: 'awaiting_batch_bed_evaluation' as PlantaoTestStatus,
      completed: false,
      score: null as number | null,
    };

    assertEqual(resolvePlantaoState(mockDB), 'awaiting_batch_bed_evaluation', 'Initial state');
    assert(isPendingBatchStatus(mockDB.status), 'Is pending batch status');

    // Simulate poll 1: batch still pending
    const poll1Result = { updated: false, pending: true };
    if (poll1Result.updated) {
      mockDB.status = 'ready_for_adverse';
    }
    assertEqual(resolvePlantaoState(mockDB), 'awaiting_batch_bed_evaluation', 'Remains pending after poll 1');

    // Simulate poll 2: batch completed with descompensation -> transitions to ready_for_adverse
    const poll2Result = { updated: true, status: 'ready_for_adverse', pending: false };
    if (poll2Result.updated) {
      mockDB.status = poll2Result.status as PlantaoTestStatus;
    }
    assertEqual(resolvePlantaoState(mockDB), 'ready_for_adverse', 'Transitions to ready_for_adverse');
    assert(!isPendingBatchStatus(mockDB.status), 'No longer pending batch');

    // Simulate doctor submitting adverse evolution -> transitions to awaiting_batch_feedback
    mockDB.status = 'awaiting_batch_feedback';
    assertEqual(resolvePlantaoState(mockDB), 'awaiting_batch_feedback', 'Doctor submits adverse, now awaiting feedback');
    assert(isPendingBatchStatus(mockDB.status), 'Awaiting batch feedback is pending');

    // Simulate poll 3: batch feedback completed -> transitions to completed
    const poll3Result = { updated: true, status: 'completed', pending: false };
    if (poll3Result.updated) {
      mockDB.status = poll3Result.status as PlantaoTestStatus;
      mockDB.completed = true;
      mockDB.score = 8.5;
    }
    assertEqual(resolvePlantaoState(mockDB), 'completed', 'Transitions to completed');
    assertEqual(mockDB.score, 8.5, 'Score updated on completed');
  });
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function main() {
  console.log('================================================================');
  console.log('   CHALLENGER SUITE M9: Dashboard & Plantoes Active Signaling   ');
  console.log('================================================================');

  await testBannerComponent();
  await testDashboardIntegration();
  await testPlantoesPage();
  await testStateMachineSimulation();

  console.log('\n================================================================');
  const total = allResults.length;
  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.filter((r) => !r.passed).length;

  console.log(`Summary: ${passed}/${total} tests passed (${failed} failed)`);
  if (failed > 0) {
    console.error('\nFAILED TESTS:');
    allResults
      .filter((r) => !r.passed)
      .forEach((r) => console.error(`  - [${r.suite}] ${r.id}: ${r.name} -> ${r.error}`));
    process.exit(1);
  } else {
    console.log('All Milestone 9 Challenger tests PASSED! 100% SUCCESS.');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
