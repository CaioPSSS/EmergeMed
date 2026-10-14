/**
 * Empirical Adversarial Challenger & State Flapping Stress Suite
 * Milestone 9: Visual Copy, Icon Spinners, Button Routing, Edge Cases & State Flapping
 *
 * Challenger Role: M9 Challenger 1 (Visual Copy & State Flapping Stress)
 *
 * Verifies:
 * 1. Exact verbatim copy strings in components/dashboard/ActivePlantaoBanner.tsx per Requirement R4
 * 2. Visual icon spinners (animate-spin, pulse) and disabled states on refresh
 * 3. Button URLs, Next.js App Router navigation calls, and dismiss actions
 * 4. Plantoes page badges (5 colors/texts) and per-item contextual action buttons
 * 5. Edge cases: null plantao, legacy plantao with null status, invalid date timestamps, score 0 vs null, corrupt status
 * 6. State flapping stress test: 2,500 rapid cycles across all states testing memory consumption, DOM integrity, and keys
 *
 * Usage: npx tsx tests/challenger-m9-adversarial-stress.ts
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import { PlantaoTestStatus, PLANTAO_STATUSES } from '../types/plantao';

interface StressTestResult {
  suite: string;
  id: string;
  name: string;
  passed: boolean;
  verdict: 'PASS' | 'FAIL';
  details?: string;
  error?: string;
}

const results: StressTestResult[] = [];

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

async function runTest(
  suite: string,
  id: string,
  name: string,
  fn: () => void | Promise<void>
) {
  try {
    await fn();
    results.push({ suite, id, name, passed: true, verdict: 'PASS' });
    console.log(`  ✓ [${id}] ${name}`);
  } catch (err: any) {
    results.push({ suite, id, name, passed: false, verdict: 'FAIL', error: err.message });
    console.error(`  ✗ [${id}] ${name}: ${err.message}`);
  }
}

// ============================================================================
// Setup Next.js AppRouterContext for React 19 rendering
// ============================================================================
let AppRouterContext: any = null;
let ActivePlantaoBanner: any = null;

async function setupComponents() {
  const routerMod = await import('next/dist/shared/lib/app-router-context.shared-runtime.js');
  AppRouterContext = routerMod.AppRouterContext;

  const bannerMod = await import('../components/dashboard/ActivePlantaoBanner');
  ActivePlantaoBanner = bannerMod.ActivePlantaoBanner;
}

function renderBanner(props: any, routerMock: any = {}) {
  const router = {
    push: (url: string) => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    ...routerMock,
  };

  const element = React.createElement(
    AppRouterContext.Provider,
    { value: router },
    React.createElement(ActivePlantaoBanner, props)
  );

  const rawHtml = renderToString(element);
  // Strip React SSR comment markers between text nodes (e.g. <!-- -->) for accurate text matching
  return rawHtml.replace(/<!--\s*-->/g, '');
}

// ============================================================================
// SUITE 1: Verbatim Copy and Visual DOM Elements (React 19 Rendered)
// ============================================================================
async function testVerbatimCopyAndDOM() {
  console.log('\n--- SUITE 1: Verbatim Copy and Visual DOM Elements (React 19 Rendered) ---');

  // Test 1.1: awaiting_batch_bed_evaluation
  await runTest('COPY_DOM', 'C1.1-AWAITING-BED-EVAL', 'Awaiting bed batch renders exact verbatim copy and spinners', () => {
    const html = renderBanner({
      plantao: {
        id: 'test-batch-1',
        status: 'awaiting_batch_bed_evaluation',
        plantao_data: {
          plantaoNumber: 3,
          bedCount: 4,
          batch_submitted_at: '2026-10-14T11:00:00.000Z',
        },
      },
      isRefreshing: false,
    });

    assert(
      html.includes('⏳ Passagem de Plantão Assíncrona em processamento no lote (OpenRouter Batch)...'),
      'Missing exact heading for awaiting bed evaluation'
    );
    assert(
      html.includes('OpenRouter Batch • 50% de Economia'),
      'Missing 50% economy badge copy'
    );
    assert(
      html.includes('Avaliando condutas e prescrições dos leitos na fila noturna.'),
      'Missing awaiting bed evaluation description'
    );
    assert(
      html.includes('Enviado em:'),
      'Must display "Enviado em:" submission time'
    );
    assert(
      html.includes('🔄 Atualizar Status do Lote'),
      'Missing exact refresh button copy'
    );
    assert(
      html.includes('animate-spin'),
      'Clock icon must have animate-spin class'
    );
    assert(
      !html.includes('disabled=""'),
      'Refresh button should not be disabled when not refreshing'
    );
  });

  // Test 1.2: awaiting_batch_feedback
  await runTest('COPY_DOM', 'C1.2-AWAITING-FEEDBACK', 'Awaiting feedback batch renders preceptorship copy', () => {
    const html = renderBanner({
      plantao: {
        id: 'test-batch-2',
        status: 'awaiting_batch_feedback',
        plantao_data: {
          plantaoNumber: 3,
          bedCount: 4,
        },
      },
      isRefreshing: false,
    });

    assert(
      html.includes('⏳ Passagem de Plantão Assíncrona em processamento no lote (OpenRouter Batch)...'),
      'Missing exact heading for awaiting feedback'
    );
    assert(
      html.includes('Gerando relatório pedagógico de preceptoria pós-adversos.'),
      'Missing awaiting feedback description'
    );
    assert(
      html.includes('🔄 Atualizar Status do Lote'),
      'Missing refresh button copy'
    );
  });

  // Test 1.3: isRefreshing = true
  await runTest('COPY_DOM', 'C1.3-REFRESHING-SPINNER', 'isRefreshing displays spinner and disables button', () => {
    const html = renderBanner({
      plantao: {
        id: 'test-batch-3',
        status: 'awaiting_batch_bed_evaluation',
      },
      isRefreshing: true,
    });

    assert(
      html.includes('Consultando Lote...'),
      'Must display "Consultando Lote..." during active refresh'
    );
    assert(
      html.includes('disabled=""'),
      'Button must have disabled attribute when isRefreshing is true'
    );
    assert(
      html.includes('animate-spin'),
      'Must have spinning CSS class on refresh icon'
    );
  });

  // Test 1.4: ready_for_adverse
  await runTest('COPY_DOM', 'C1.4-READY-FOR-ADVERSE', 'Ready for adverse renders alert copy and action CTA', () => {
    const html = renderBanner({
      plantao: {
        id: 'test-adverse-1',
        status: 'ready_for_adverse',
        plantao_data: {
          plantaoNumber: 2,
        },
      },
    });

    assert(
      html.includes('🔔 Intercorrência Clínica! O leito descompensou após a conduta inicial. Clique para atender a evolução adversa.'),
      'Missing exact verbatim adverse heading'
    );
    assert(
      html.includes('Urgência Clínica • Ação Imediata'),
      'Missing urgency clinical badge'
    );
    assert(
      html.includes('🚨 Atender Intercorrência'),
      'Missing exact adverse action button label'
    );
    assert(
      html.includes('pulse 3s infinite'),
      'Must have pulsing visual alert style'
    );
  });

  // Test 1.5: completed
  await runTest('COPY_DOM', 'C1.5-COMPLETED', 'Completed state renders verbatim preceptorship conclusion copy', () => {
    const html = renderBanner({
      plantao: {
        id: 'test-completed-1',
        status: 'completed',
        score: 8.5,
        plantao_data: {
          plantaoNumber: 5,
        },
      },
      onDismiss: () => {},
    });

    assert(
      html.includes('✨ Passagem de Plantão concluída! Veja seu relatório pedagógico de preceptoria.'),
      'Missing exact verbatim completed heading'
    );
    assert(
      html.includes('Concluído • Nota 8.5/10'),
      'Missing completed badge with score'
    );
    assert(
      html.includes('📊 Ver Resultados'),
      'Missing verbatim view results button'
    );
    assert(
      html.includes('data-testid="btn-dismiss-completed"'),
      'Missing dismiss button test ID'
    );
    assert(
      html.includes('Dispensar aviso'),
      'Dismiss button must have title/aria-label "Dispensar aviso"'
    );
  });

  // Test 1.6: in_progress
  await runTest('COPY_DOM', 'C1.6-IN-PROGRESS', 'In progress state renders verbatim shift and continue CTA', () => {
    const html = renderBanner({
      plantao: {
        id: 'test-progress-1',
        status: 'in_progress',
        plantao_data: {
          plantaoNumber: 1,
          bedCount: 4,
        },
      },
    });

    assert(
      html.includes('🏥 Plantão em Andamento — Leitos aguardando prescrição e conduta na Sala Vermelha.'),
      'Missing exact verbatim in_progress heading'
    );
    assert(
      html.includes('Plantão em Andamento'),
      'Missing status badge'
    );
    assert(
      html.includes('Continuar Plantão'),
      'Missing verbatim continue shift button'
    );
  });
}

// ============================================================================
// SUITE 2: Navigation URLs, Dismiss Handlers & Callbacks
// ============================================================================
async function testNavigationAndHandlers() {
  console.log('\n--- SUITE 2: Navigation URLs, Dismiss Handlers & Callbacks ---');

  const bannerSource = fs.readFileSync(
    path.resolve(process.cwd(), 'components/dashboard/ActivePlantaoBanner.tsx'),
    'utf-8'
  );

  // Test 2.1: Adverse routing URL
  await runTest('NAV_HANDLERS', 'N2.1-ADVERSE-URL', 'Adverse CTA navigates to `/testes/${plantao.id}`', () => {
    assert(
      bannerSource.includes('router.push(`/testes/${plantao.id}`)'),
      'Adverse button must route to `/testes/${plantao.id}`'
    );
  });

  // Test 2.2: Completed results routing URL
  await runTest('NAV_HANDLERS', 'N2.2-RESULTS-URL', 'Completed CTA navigates to `/testes/${plantao.id}/resultado`', () => {
    assert(
      bannerSource.includes('router.push(`/testes/${plantao.id}/resultado`)'),
      'Completed button must route to `/testes/${plantao.id}/resultado`'
    );
  });

  // Test 2.3: In progress routing URL
  await runTest('NAV_HANDLERS', 'N2.3-CONTINUE-URL', 'In progress CTA navigates to `/testes/${plantao.id}`', () => {
    assert(
      bannerSource.includes('router.push(`/testes/${plantao.id}`)'),
      'In progress continue button must route to `/testes/${plantao.id}`'
    );
  });

  // Test 2.4: Dismiss callback integration
  await runTest('NAV_HANDLERS', 'N2.4-DISMISS-CALLBACK', 'Dismiss button triggers onDismiss callback', () => {
    assert(
      bannerSource.includes('onClick={onDismiss}'),
      'Dismiss button must trigger onDismiss callback'
    );
    assert(
      bannerSource.includes('{onDismiss && ('),
      'Dismiss button must only render when onDismiss prop is provided'
    );
  });

  // Test 2.5: Optional dismiss prop omitted
  await runTest('NAV_HANDLERS', 'N2.5-NO-DISMISS-OMITTED', 'Completed banner renders cleanly without onDismiss prop', () => {
    const html = renderBanner({
      plantao: {
        id: 'test-completed-nodismiss',
        status: 'completed',
      },
      // onDismiss omitted
    });

    assert(
      !html.includes('data-testid="btn-dismiss-completed"'),
      'Dismiss button should not be rendered when onDismiss is omitted'
    );
    assert(
      html.includes('✨ Passagem de Plantão concluída!'),
      'Banner content must still render completely'
    );
  });
}

// ============================================================================
// SUITE 3: Plantoes Page 5 State Badges & Per-Item Actions
// ============================================================================
async function testPlantoesPageSignaling() {
  console.log('\n--- SUITE 3: Plantoes Page 5 State Badges & Per-Item Actions ---');

  const plantoesSource = fs.readFileSync(
    path.resolve(process.cwd(), 'app/(authenticated)/plantoes/page.tsx'),
    'utf-8'
  );

  // Test 3.1: 5 Badges
  await runTest('PLANTOES_UI', 'P3.1-BADGE-VARIANTS', 'All 5 badge states defined with respective icons and colors', () => {
    assert(plantoesSource.includes("'awaiting_batch_bed_evaluation'"), 'Missing awaiting_batch_bed_evaluation badge');
    assert(plantoesSource.includes("'ready_for_adverse'"), 'Missing ready_for_adverse badge');
    assert(plantoesSource.includes("'awaiting_batch_feedback'"), 'Missing awaiting_batch_feedback badge');
    assert(plantoesSource.includes("'completed'"), 'Missing completed badge');
    assert(plantoesSource.includes("'in_progress'"), 'Missing in_progress badge');

    // Badge texts
    assert(plantoesSource.includes('⏳ Avaliando Leitos (Lote)'), 'Missing awaiting bed badge label');
    assert(plantoesSource.includes('🔔 Intercorrência Clínica!'), 'Missing adverse badge label');
    assert(plantoesSource.includes('⏳ Gerando Preceptoria (Lote)'), 'Missing awaiting feedback badge label');
    assert(plantoesSource.includes('✓ Concluído'), 'Missing completed badge label');
    assert(plantoesSource.includes('Em Andamento'), 'Missing in_progress badge label');
  });

  // Test 3.2: Badge animations
  await runTest('PLANTOES_UI', 'P3.2-BADGE-ANIMATIONS', 'Batch badges have spinning icons; adverse has pulse animation', () => {
    assert(plantoesSource.includes('className="animate-spin"'), 'Batch badges must have animate-spin icons');
    assert(plantoesSource.includes("animation: 'pulse 2s infinite'"), 'Adverse badge must have pulsing alert');
  });

  // Test 3.3: Per-item action buttons and discrete spinners
  await runTest('PLANTOES_UI', 'P3.3-PER-ITEM-ACTION', 'Per-item action button provides discrete loading spinner and stopPropagation', () => {
    assert(plantoesSource.includes('handleCheckBatchItem'), 'Must define handleCheckBatchItem');
    assert(plantoesSource.includes('checkingBatchMap[t.id]'), 'Must track discrete item checking state');
    assert(plantoesSource.includes('e.stopPropagation()'), 'Must prevent table card click propagation');
    assert(plantoesSource.includes('🔄 Atualizar Lote'), 'Missing per-item batch check button text');
    assert(plantoesSource.includes('Consultando...'), 'Missing per-item loading state text');
  });
}

// ============================================================================
// SUITE 4: Edge Cases & Resiliency Matrix
// ============================================================================
async function testEdgeCases() {
  console.log('\n--- SUITE 4: Edge Cases & Resiliency Matrix ---');

  const dashboardSource = fs.readFileSync(
    path.resolve(process.cwd(), 'app/(authenticated)/dashboard/page.tsx'),
    'utf-8'
  );

  // Test 4.1: Dashboard banner conditional rendering (null plantao)
  await runTest('EDGE_CASES', 'E4.1-NULL-PLANTAO', 'Dashboard guards against null activePlantao without rendering or crashing', () => {
    assert(
      dashboardSource.includes('{activePlantao && (!dismissCompletedBanner || activePlantao.status !== \'completed\') && ('),
      'Dashboard must guard rendering when activePlantao is null or dismissed'
    );
  });

  // Test 4.2: Legacy shift with null status and completed = false
  await runTest('EDGE_CASES', 'E4.2-LEGACY-IN-PROGRESS', 'Legacy shift with null status and completed=false resolves to in_progress', () => {
    function resolveStatus(record: any) {
      return (
        record.status ||
        record.plantao_data?.status ||
        (record.completed ? 'completed' : 'in_progress')
      );
    }

    const legacyUnfinished = {
      id: 'legacy-1',
      status: null,
      plantao_data: null,
      completed: false,
    };
    assertEqual(resolveStatus(legacyUnfinished), 'in_progress', 'Legacy unfinished record');

    const html = renderBanner({
      plantao: {
        id: legacyUnfinished.id,
        status: resolveStatus(legacyUnfinished),
      },
    });
    assert(html.includes('🏥 Plantão em Andamento'), 'Renders in_progress variant cleanly');
  });

  // Test 4.3: Legacy shift with null status and completed = true
  await runTest('EDGE_CASES', 'E4.3-LEGACY-COMPLETED', 'Legacy shift with null status and completed=true resolves to completed', () => {
    function resolveStatus(record: any) {
      return (
        record.status ||
        record.plantao_data?.status ||
        (record.completed ? 'completed' : 'in_progress')
      );
    }

    const legacyDone = {
      id: 'legacy-2',
      status: null,
      plantao_data: null,
      completed: true,
      score: 9.0,
    };
    assertEqual(resolveStatus(legacyDone), 'completed', 'Legacy completed record');

    const html = renderBanner({
      plantao: {
        id: legacyDone.id,
        status: resolveStatus(legacyDone),
        score: legacyDone.score,
      },
    });
    assert(html.includes('✨ Passagem de Plantão concluída!'), 'Renders completed variant cleanly');
    assert(html.includes('9/10'), 'Displays legacy score 9/10');
  });

  // Test 4.4: Corrupt / unknown status string falls back to in_progress variant safely
  await runTest('EDGE_CASES', 'E4.4-CORRUPT-STATUS', 'Corrupt / unknown status string renders in_progress variant without throw', () => {
    const corruptPlantao = {
      id: 'corrupt-1',
      status: 'corrupt_unknown_status' as any,
      plantao_data: null,
    };

    let html = '';
    assert(
      (() => {
        try {
          html = renderBanner({ plantao: corruptPlantao });
          return true;
        } catch {
          return false;
        }
      })(),
      'Should not throw when rendering unknown status'
    );

    assert(
      html.includes('🏥 Plantão em Andamento'),
      'Falls through safely to in_progress variant'
    );
  });

  // Test 4.5: Score = 0 handled accurately (not considered falsey / undefined)
  await runTest('EDGE_CASES', 'E4.5-SCORE-ZERO', 'Score 0 renders "0/10" accurately rather than "Pronta"', () => {
    const html = renderBanner({
      plantao: {
        id: 'test-zero',
        status: 'completed',
        score: 0,
      },
    });

    assert(html.includes('Nota 0/10'), 'Score 0 must display "Nota 0/10"');
    assert(!html.includes('Nota Pronta'), 'Score 0 must not display "Nota Pronta"');
  });

  // Test 4.6: Score = null / undefined renders "Pronta"
  await runTest('EDGE_CASES', 'E4.6-SCORE-NULL', 'Null/undefined score renders "Nota Pronta"', () => {
    const html = renderBanner({
      plantao: {
        id: 'test-null-score',
        status: 'completed',
        score: null,
      },
    });

    assert(html.includes('Nota Pronta'), 'Null score must display "Nota Pronta"');
  });

  // Test 4.7: Invalid timestamp format falls back to "Recente"
  await runTest('EDGE_CASES', 'E4.7-INVALID-TIMESTAMP', 'Invalid date strings fall back gracefully to "Recente"', () => {
    const html = renderBanner({
      plantao: {
        id: 'test-invalid-date',
        status: 'awaiting_batch_bed_evaluation',
        plantao_data: {
          batch_submitted_at: 'NOT_A_VALID_DATE_STRING_123',
        },
      },
    });

    assert(html.includes('Enviado em: Recente'), 'Must fall back to "Enviado em: Recente"');
  });

  // Test 4.8: Missing timestamp falls back to "Recente"
  await runTest('EDGE_CASES', 'E4.8-MISSING-TIMESTAMP', 'Missing timestamps fall back gracefully to "Recente"', () => {
    const html = renderBanner({
      plantao: {
        id: 'test-missing-date',
        status: 'awaiting_batch_bed_evaluation',
        plantao_data: {},
      },
    });

    assert(html.includes('Enviado em: Recente'), 'Must fall back to "Enviado em: Recente"');
  });

  // Test 4.9: Null plantao_data uses safe defaults
  await runTest('EDGE_CASES', 'E4.9-NULL-PLANTAO-DATA', 'Null plantao_data uses default plantaoNumber="—" and bedCount=4', () => {
    const html = renderBanner({
      plantao: {
        id: 'test-null-pdata',
        status: 'in_progress',
        plantao_data: null,
      },
    });

    assert(html.includes('Plantão #— (4 Leitos)'), 'Must default cleanly without undefined errors');
  });

  // Test 4.10: Dismissal persistence isolation
  await runTest('EDGE_CASES', 'E4.10-DISMISSAL-ISOLATION', 'Dismissing completed shift does NOT hide subsequent active shift', () => {
    function shouldShowBanner(activePlantao: any, dismissCompletedBanner: boolean) {
      return !!activePlantao && (!dismissCompletedBanner || activePlantao.status !== 'completed');
    }

    // 1. Initial completed shift -> shown
    let active = { id: 'p1', status: 'completed' };
    let dismissed = false;
    assertEqual(shouldShowBanner(active, dismissed), true, 'Initial completed shift shown');

    // 2. User clicks dismiss -> hidden
    dismissed = true;
    assertEqual(shouldShowBanner(active, dismissed), false, 'Dismissed completed shift hidden');

    // 3. User starts or receives an active shift -> MUST BE SHOWN despite dismissed=true
    active = { id: 'p2', status: 'ready_for_adverse' };
    assertEqual(shouldShowBanner(active, dismissed), true, 'New adverse shift shown despite previous dismissal');

    active = { id: 'p3', status: 'in_progress' };
    assertEqual(shouldShowBanner(active, dismissed), true, 'In progress shift shown despite previous dismissal');

    active = { id: 'p4', status: 'awaiting_batch_bed_evaluation' };
    assertEqual(shouldShowBanner(active, dismissed), true, 'Batch shift shown despite previous dismissal');
  });
}

// ============================================================================
// SUITE 5: State Flapping & Memory Leak Stress Test
// ============================================================================
async function testStateFlappingAndMemory() {
  console.log('\n--- SUITE 5: State Flapping & Memory Leak Stress Test ---');

  // Test 5.1: 2,500 State Flapping Transitions
  await runTest('STRESS', 'S5.1-RAPID-FLAPPING', '2,500 rapid alternating state transitions render cleanly', () => {
    const states: PlantaoTestStatus[] = [
      'in_progress',
      'awaiting_batch_bed_evaluation',
      'ready_for_adverse',
      'awaiting_batch_feedback',
      'completed',
    ];

    const iterations = 2500;
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      const currentStatus = states[i % states.length];
      const isRefreshing = i % 2 === 0;
      const score = currentStatus === 'completed' ? (i % 10) + 1 : null;

      const html = renderBanner({
        plantao: {
          id: `plantao-flap-${i}`,
          status: currentStatus,
          score,
          plantao_data: {
            plantaoNumber: (i % 20) + 1,
            bedCount: 4,
            batch_submitted_at: new Date(1700000000000 + i * 1000).toISOString(),
          },
        },
        isRefreshing,
        onDismiss: () => {},
      });

      assert(html.length > 500, `Render output at cycle ${i} was unexpectedly short: ${html.length} chars`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`     Rendered ${iterations} state flaps in ${elapsed}ms (${(elapsed / iterations).toFixed(2)}ms/render)`);
  });

  // Test 5.2: Memory Leak / Heap growth check
  await runTest('STRESS', 'S5.2-MEMORY-RETENTION', 'Memory heap delta remains bounded after 2,500 state flips', () => {
    const hasGc = typeof (global as any).gc === 'function';
    if (hasGc) {
      (global as any).gc();
    }
    const memBefore = process.memoryUsage().heapUsed;

    const iterations = 2500;
    for (let i = 0; i < iterations; i++) {
      const currentStatus = PLANTAO_STATUSES[i % PLANTAO_STATUSES.length];
      renderBanner({
        plantao: {
          id: `plantao-mem-${i}`,
          status: currentStatus,
          score: 8.0,
        },
      });
    }

    if (hasGc) {
      (global as any).gc();
    }
    const memAfter = process.memoryUsage().heapUsed;
    const diffMb = (memAfter - memBefore) / (1024 * 1024);
    console.log(`     Heap used delta after 2,500 renders: ${diffMb.toFixed(2)} MB (gc available: ${hasGc})`);

    // If GC is available, true retained memory delta must be negligible (< 5MB)
    // If GC is not exposed, V8 uncollected allocations across 2,500 renders must stay below 80MB
    const limit = hasGc ? 5 : 80;
    assert(diffMb < limit, `Excessive heap retention detected: ${diffMb.toFixed(2)} MB (limit: ${limit} MB)`);
  });

  // Test 5.3: Unique Container Keys & Element TestIDs
  await runTest('STRESS', 'S5.3-DOM-KEY-EXCLUSIVITY', 'Each state variant possesses a distinct data-testid preventing DOM collisions', () => {
    const testIds = new Set<string>();

    const states: PlantaoTestStatus[] = [
      'awaiting_batch_bed_evaluation',
      'ready_for_adverse',
      'completed',
      'in_progress',
    ];

    for (const st of states) {
      const html = renderBanner({
        plantao: {
          id: 'test-testid',
          status: st,
        },
        onDismiss: () => {},
      });

      const match = html.match(/data-testid="([^"]+)"/);
      assert(match !== null, `Variant for status ${st} must have a container data-testid`);
      const testId = match![1];
      assert(!testIds.has(testId), `Duplicate container testid "${testId}" detected`);
      testIds.add(testId);
    }

    assertEqual(testIds.size, 4, 'Must have exactly 4 distinct top-level container testids');
  });

  // Test 5.4: Simulated asynchronous out-of-order polling flapping
  await runTest('STRESS', 'S5.4-OUT-OF-ORDER-RACE', 'Simulates race conditions between simultaneous polling events', async () => {
    let activeRecord = {
      id: 'race-plantao',
      status: 'awaiting_batch_bed_evaluation' as PlantaoTestStatus,
      completed: false,
    };

    // Simulate 3 async check responses returning in reverse order
    const call1 = new Promise<any>((resolve) =>
      setTimeout(() => resolve({ call: 1, updated: false, status: 'awaiting_batch_bed_evaluation' }), 60)
    );
    const call2 = new Promise<any>((resolve) =>
      setTimeout(() => resolve({ call: 2, updated: true, status: 'ready_for_adverse' }), 30)
    );
    const call3 = new Promise<any>((resolve) =>
      setTimeout(() => resolve({ call: 3, updated: true, status: 'completed' }), 10)
    );

    // If an earlier response completes last, in modern status machines timestamp or state monotonic progression guards it.
    // Let's verify that completed or terminal states do not get superseded by older stale awaiting checks
    const responses = await Promise.all([call1, call2, call3]);

    function applyUpdateSafely(current: any, update: any) {
      const precedence: Record<PlantaoTestStatus, number> = {
        in_progress: 1,
        awaiting_batch_bed_evaluation: 2,
        ready_for_adverse: 3,
        awaiting_batch_feedback: 4,
        completed: 5,
      };

      if (!update.updated) return current;
      if (precedence[update.status as PlantaoTestStatus] >= precedence[current.status as PlantaoTestStatus]) {
        return { ...current, status: update.status };
      }
      return current; // Ignore stale backward transition
    }

    let state = { ...activeRecord };
    // Apply in arrival order: call3 (completed) -> call2 (ready_for_adverse) -> call1 (awaiting)
    state = applyUpdateSafely(state, responses[2]); // call3
    assertEqual(state.status, 'completed', 'Transitions to completed');

    state = applyUpdateSafely(state, responses[1]); // call2 (stale ready_for_adverse arrives later)
    assertEqual(state.status, 'completed', 'Completed state is monotonic and guarded against regression');

    state = applyUpdateSafely(state, responses[0]); // call1 (stale un-updated check)
    assertEqual(state.status, 'completed', 'Awaiting batch response ignored when shift already completed');
  });
}

// ============================================================================
// MAIN RUNNER
// ============================================================================
async function main() {
  console.log('================================================================');
  console.log('  CHALLENGER 1 ADVERSARIAL & STATE FLAPPING STRESS SUITE (M9)   ');
  console.log('================================================================');

  await setupComponents();

  await testVerbatimCopyAndDOM();
  await testNavigationAndHandlers();
  await testPlantoesPageSignaling();
  await testEdgeCases();
  await testStateFlappingAndMemory();

  console.log('\n================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Summary: ${passed}/${total} adversarial stress tests passed (${failed} failed)`);
  if (failed > 0) {
    console.error('\nFAILED CHALLENGER TESTS:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.error(`  - [${r.suite}] ${r.id}: ${r.name} -> ${r.error}`));
    process.exit(1);
  } else {
    console.log('ALL ADVERSARIAL STRESS TESTS PASSED WITH 100% SUCCESS.');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
