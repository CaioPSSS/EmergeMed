import {
  deriveAllTopicMetrics,
  buildReadinessSnapshot,
  calculateFSRSUpdate,
  calculateFSRSManualReadUpdate,
  calculateFSRSRereadWithQuiz,
  getNormalizedClinicalWeights,
  extractChapterPerformanceEvidence,
  selectPlantaoBedsWithEngine,
  ChapterProgressItem,
  ChapterReviewStatFSRS,
  TestRecordItem,
} from '../lib/learning-engine';
import { CHAPTERS_DATA } from '../lib/chapters-data';

interface StressTestResult {
  suite: string;
  name: string;
  passed: boolean;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS';
  details: string;
  empiricalData?: any;
}

const results: StressTestResult[] = [];

function record(
  suite: string,
  name: string,
  passed: boolean,
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS',
  details: string,
  empiricalData?: any
) {
  results.push({ suite, name, passed, severity, details, empiricalData });
  const status = passed ? '[PASS]' : `[FAIL - ${severity}]`;
  console.log(`  ${status} [${suite}] ${name} -> ${details}`);
}

console.log('========================================================================');
console.log('       FSRS RECALIBRATION ADVERSARIAL STRESS TEST & ORACLE HARNESS      ');
console.log('========================================================================\n');

// ========================================================================
// SUITE 1: FSRS POWER-LAW RETENTION CURVE MATHEMATICAL INVARIANTS
// ========================================================================
console.log('--- SUITE 1: FSRS Retention Curve Mathematical Invariants ---');

// Invariant 1.1: Boundary t = 0 -> R = 100%
{
  const t0 = new Date('2026-08-01T00:00:00Z');
  const metrics = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
    reviewStatsList: [{
      chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: t0.toISOString(), last_evidence_at: t0.toISOString(),
      next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0,
    }],
    testsList: [],
    now: t0,
  }).get(1)!;

  const passed = Math.abs(metrics.retention - 100.0) < 1e-6;
  record('Retention', 'Boundary t = 0', passed, passed ? 'PASS' : 'CRITICAL', `R(0, 7.0) = ${metrics.retention}% (Expected: 100%)`, { retention: metrics.retention });
}

// Invariant 1.2: Boundary t = S -> R = 90.0%
{
  const t0 = new Date('2026-08-01T00:00:00Z');
  const stabs = [7.0, 14.0, 30.0, 90.0, 180.0, 365.0];
  let allExact90 = true;
  const data: any[] = [];

  for (const s of stabs) {
    const tS = new Date(t0.getTime() + s * 24 * 60 * 60 * 1000);
    const m = deriveAllTopicMetrics({
      progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
      reviewStatsList: [{
        chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
        last_reviewed_at: t0.toISOString(), last_evidence_at: t0.toISOString(),
        next_review_at: null, ease_factor: 2.5, interval_days: Math.round(s), stability: s, difficulty: 5.0,
      }],
      testsList: [],
      now: tS,
    }).get(1)!;

    data.push({ s, retention: m.retention });
    if (Math.abs(m.retention - 90.0) > 0.05) allExact90 = false;
  }

  record('Retention', 'Boundary t = S gives exact 90.0%', allExact90, allExact90 ? 'PASS' : 'CRITICAL', `Tested S in [7..365]: all yielded R(S,S)=90.0%`, data);
}

// Invariant 1.3: Asymptotic Behavior t >> S -> R approaches 0 but strictly > 0
{
  const t0 = new Date('2026-08-01T00:00:00Z');
  const tFar = new Date(t0.getTime() + 10000 * 24 * 60 * 60 * 1000); // 10,000 days (~27 years)
  const mFar = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
    reviewStatsList: [{
      chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: t0.toISOString(), last_evidence_at: t0.toISOString(),
      next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0,
    }],
    testsList: [],
    now: tFar,
  }).get(1)!;

  const passed = mFar.retention > 0 && mFar.retention < 10.0;
  record('Retention', 'Asymptotic t >> S (t=10000d)', passed, passed ? 'PASS' : 'HIGH', `R(10000, 7.0) = ${mFar.retention}% (>0 and bounded)`, { retention: mFar.retention });
}

// Invariant 1.4: Future Timestamp (t < 0) -> Handled cleanly as t = 0 (R = 100%)
{
  const t0 = new Date('2026-08-10T00:00:00Z');
  const tPast = new Date('2026-08-01T00:00:00Z'); // now is BEFORE evidence date
  const mFuture = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
    reviewStatsList: [{
      chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: t0.toISOString(), last_evidence_at: t0.toISOString(),
      next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0,
    }],
    testsList: [],
    now: tPast,
  }).get(1)!;

  const passed = mFuture.retention === 100.0 && mFuture.daysSinceLastEvidence === 0;
  record('Retention', 'Negative elapsed time t < 0 clamped', passed, passed ? 'PASS' : 'HIGH', `Days=${mFuture.daysSinceLastEvidence}d, Retention=${mFuture.retention}%`, { mFuture });
}

// Invariant 1.5: Monotonic Decay Property: for all t1 < t2, R(t1, S) >= R(t2, S)
{
  const t0 = new Date('2026-01-01T00:00:00Z');
  let monotonicViolations = 0;
  let checksCount = 0;

  const stabilitiesToTest = [7.0, 10.0, 21.0, 60.0, 180.0, 365.0];
  for (const s of stabilitiesToTest) {
    let prevRet = 100.0;
    for (let day = 0; day <= 365; day += 0.5) {
      const now = new Date(t0.getTime() + day * 24 * 60 * 60 * 1000);
      const m = deriveAllTopicMetrics({
        progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
        reviewStatsList: [{
          chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
          last_reviewed_at: t0.toISOString(), last_evidence_at: t0.toISOString(),
          next_review_at: null, ease_factor: 2.5, interval_days: Math.round(s), stability: s, difficulty: 5.0,
        }],
        testsList: [],
        now,
      }).get(1)!;

      checksCount++;
      if (m.retention > prevRet + 1e-9) {
        monotonicViolations++;
      }
      prevRet = m.retention;
    }
  }

  const passed = monotonicViolations === 0;
  record('Retention', `Monotonic Decay Property (${checksCount} checks across S in [7..365])`, passed, passed ? 'PASS' : 'CRITICAL', `Violations: ${monotonicViolations}`);
}

// Invariant 1.6: Stability Boundary Clamping (S = 0, S = negative, S = 99999)
{
  const t0 = new Date('2026-08-01T00:00:00Z');

  const mS0 = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
    reviewStatsList: [{
      chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: t0.toISOString(), last_evidence_at: t0.toISOString(),
      next_review_at: null, ease_factor: 2.5, interval_days: 1, stability: 0, difficulty: 5.0,
    }],
    testsList: [],
    now: t0,
  }).get(1)!;

  const mSNeg = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
    reviewStatsList: [{
      chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: t0.toISOString(), last_evidence_at: t0.toISOString(),
      next_review_at: null, ease_factor: 2.5, interval_days: 1, stability: -10, difficulty: 5.0,
    }],
    testsList: [],
    now: t0,
  }).get(1)!;

  const mSHigh = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
    reviewStatsList: [{
      chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: t0.toISOString(), last_evidence_at: t0.toISOString(),
      next_review_at: null, ease_factor: 2.5, interval_days: 1, stability: 99999, difficulty: 5.0,
    }],
    testsList: [],
    now: t0,
  }).get(1)!;

  const passed = mS0.stability === 7.0 && mSNeg.stability === 7.0 && mSHigh.stability === 365.0;
  record('Retention', 'Stability Clamping [7.0, 365.0]', passed, passed ? 'PASS' : 'HIGH', `S(0)->${mS0.stability}d, S(-10)->${mSNeg.stability}d, S(99999)->${mSHigh.stability}d`);
}

// Invariant 1.7: Unread topic retention is always 0.0%
{
  const mUnread = deriveAllTopicMetrics({
    progressList: [],
    reviewStatsList: [],
    testsList: [],
  }).get(1)!;

  const passed = mUnread.retention === 0.0 && mUnread.topicReadiness === 0.0 && mUnread.isRead === false;
  record('Retention', 'Unread Topic Invariant', passed, passed ? 'PASS' : 'HIGH', `isRead=${mUnread.isRead}, Retention=${mUnread.retention}%, Readiness=${mUnread.topicReadiness}%`);
}

console.log('');

// ========================================================================
// SUITE 2: BAYESIAN SMOOTHING & PERFORMANCE BOUNDARIES
// ========================================================================
console.log('--- SUITE 2: Bayesian Smoothing & Performance Boundaries ---');

// Invariant 2.1: n = 0 boundary conditions
{
  const t0 = new Date('2026-08-01T00:00:00Z');
  const mReadN0 = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
    reviewStatsList: [],
    testsList: [],
    now: t0,
  }).get(1)!;

  const mUnreadN0 = deriveAllTopicMetrics({
    progressList: [],
    reviewStatsList: [],
    testsList: [],
    now: t0,
  }).get(1)!;

  const passed = mReadN0.performance === 70.0 && mUnreadN0.performance === 0.0 && mReadN0.confidence === 0.0;
  record('Bayesian', 'n = 0 Boundary (Read vs Unread prior)', passed, passed ? 'PASS' : 'CRITICAL', `Read Perf=${mReadN0.performance}%, Unread Perf=${mUnreadN0.performance}%, Conf=${mReadN0.confidence}`);
}

// Invariant 2.2: Adversarial Edge Case: Score 0.0/10 vs Falsy Or-Coercion
{
  const t0 = new Date('2026-08-01T00:00:00Z');
  // Score 0.0/10 (0%): Bayesian smoothing should yield (1 * 0 + 1 * 70) / 2 = 35.0%
  const mScore0 = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
    reviewStatsList: [],
    testsList: [{ id: 't0', chapter_ids: [1], mode: 'standard', score: 0.0, completed: true, completed_at: t0.toISOString() }],
    now: t0,
  }).get(1)!;

  const expected0 = 35.0;
  const isBuggyFalsyCoercion = mScore0.performance === 60.0; // ((Number(0.0) || 5) * 10 = 50 -> (50 + 70)/2 = 60%)
  const passed = Math.abs(mScore0.performance - expected0) < 0.1;

  record(
    'Bayesian',
    'Adversarial Score 0.0/10 Falsy Coercion Bug Check',
    passed,
    'HIGH',
    passed
      ? `Observed: ${mScore0.performance}% (Exact expected: 35.0%)`
      : `BUG DETECTED: Score 0.0 evaluated to observed 50% yielding performance=${mScore0.performance}% instead of 35.0% due to '(Number(score) || 5)' falsy coercion at lib/learning-engine.ts:275!`
  );
}

// Invariant 2.3: Score 10.0/10 (100%): (1 * 100 + 1 * 70) / 2 = 85.0%
{
  const t0 = new Date('2026-08-01T00:00:00Z');
  const mScore10 = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
    reviewStatsList: [],
    testsList: [{ id: 't10', chapter_ids: [1], mode: 'standard', score: 10.0, completed: true, completed_at: t0.toISOString() }],
    now: t0,
  }).get(1)!;

  const passed = Math.abs(mScore10.performance - 85.0) < 0.1;
  record('Bayesian', 'n = 1 Perfect Score (10.0/10 -> 85.0%)', passed, passed ? 'PASS' : 'HIGH', `Score 10.0 -> ${mScore10.performance}% (Expected: 85.0%)`);
}

// Invariant 2.4: Monotonicity of performance across score spectrum [0.0 .. 10.0]
{
  const t0 = new Date('2026-08-01T00:00:00Z');
  const scoreCurve: Array<{ score: number; performance: number }> = [];
  let violations = 0;

  for (let s = 0.0; s <= 10.0; s += 0.5) {
    const m = deriveAllTopicMetrics({
      progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
      reviewStatsList: [],
      testsList: [{ id: `test-${s}`, chapter_ids: [1], mode: 'standard', score: s, completed: true, completed_at: t0.toISOString() }],
      now: t0,
    }).get(1)!;

    scoreCurve.push({ score: s, performance: m.performance });
  }

  for (let i = 1; i < scoreCurve.length; i++) {
    if (scoreCurve[i].performance < scoreCurve[i - 1].performance) {
      violations++;
    }
  }

  const passed = violations === 0;
  record(
    'Bayesian',
    'Monotonic Score Scaling Spectrum [0.0 .. 10.0]',
    passed,
    'HIGH',
    passed
      ? `Strictly monotonic across all 21 score samples`
      : `NON-MONOTONIC: Score 0.0 gives Perf=${scoreCurve[0].performance}%, but Score 0.5 gives Perf=${scoreCurve[1].performance}% (Violations: ${violations})`
  );
}

// Invariant 2.5: n = 100 asymptotic convergence to observed score
{
  const t0 = new Date('2026-08-01T00:00:00Z');
  const manyTestsScore10: TestRecordItem[] = Array.from({ length: 100 }, (_, i) => ({
    id: `test-100-${i}`,
    chapter_ids: [1],
    mode: 'standard',
    score: 10.0,
    completed: true,
    completed_at: t0.toISOString(),
  }));

  const mN100 = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
    reviewStatsList: [],
    testsList: manyTestsScore10,
    now: t0,
  }).get(1)!;

  const passed = Math.abs(mN100.performance - 99.7) < 0.2 && mN100.confidence === 1.0;
  record('Bayesian', 'n = 100 Convergence & Confidence Saturation', passed, passed ? 'PASS' : 'HIGH', `Perf=${mN100.performance}% (Exp: 99.7%), Conf=${mN100.confidence} (Exp: 1.0)`);
}

console.log('');

// ========================================================================
// SUITE 3: TOPIC READINESS & DECOUPLING INVARIANTS
// ========================================================================
console.log('--- SUITE 3: Topic Readiness & Decoupling Invariants ---');

// Invariant 3.1: 85% Performance / 15% Retention exact weighting
{
  const t0 = new Date('2026-08-01T00:00:00Z');
  const m = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
    reviewStatsList: [{
      chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: t0.toISOString(), last_evidence_at: t0.toISOString(),
      next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0,
    }],
    testsList: [{ id: 't-perf', chapter_ids: [1], mode: 'standard', score: 8.0, completed: true, completed_at: t0.toISOString() }],
    now: t0,
  }).get(1)!;

  const expectedReadiness = Math.round((0.85 * 75.0 + 0.15 * 100.0) * 10) / 10; // 78.8%
  const passed = Math.abs(m.topicReadiness - expectedReadiness) < 0.1;
  record('Readiness', '85%/15% Exact Decoupling Formula', passed, passed ? 'PASS' : 'CRITICAL', `Topic Readiness=${m.topicReadiness}% (Expected: ${expectedReadiness}%)`);
}

// Invariant 3.2: Boundedness [0, 100]
{
  const t0 = new Date('2026-08-01T00:00:00Z');
  const mMax = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: t0.toISOString() }],
    reviewStatsList: [{
      chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: t0.toISOString(), last_evidence_at: t0.toISOString(),
      next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0,
    }],
    testsList: [{ id: 't-max', chapter_ids: [1], mode: 'standard', score: 10.0, completed: true, completed_at: t0.toISOString() }],
    now: t0,
  }).get(1)!;

  const passed = mMax.topicReadiness <= 100.0 && mMax.topicReadiness >= 0.0;
  record('Readiness', 'Topic Readiness Boundedness [0, 100]', passed, passed ? 'PASS' : 'HIGH', `Readiness=${mMax.topicReadiness}%`);
}

console.log('');

// ========================================================================
// SUITE 4: DYNAMIC EVIDENCE EXTRACTION & TIMESTAMP SYNCHRONIZATION
// ========================================================================
console.log('--- SUITE 4: Dynamic Evidence Synchronization ---');

// Invariant 4.1: Unordered test timestamps extract the maximum date
{
  const tOld = new Date('2026-08-01T00:00:00Z');
  const tMax = new Date('2026-08-28T12:00:00Z');
  const tMid1 = new Date('2026-08-15T00:00:00Z');
  const tMid2 = new Date('2026-08-20T00:00:00Z');

  const testsUnordered: TestRecordItem[] = [
    { id: 't1', chapter_ids: [1], score: 8.0, completed: true, completed_at: tMid2.toISOString() },
    { id: 't2', chapter_ids: [1], score: 9.0, completed: true, completed_at: tMax.toISOString() }, // MAX
    { id: 't3', chapter_ids: [1], score: 7.0, completed: true, completed_at: tOld.toISOString() },
    { id: 't4', chapter_ids: [1], score: 8.5, completed: true, completed_at: tMid1.toISOString() },
  ];

  const m = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: tOld.toISOString() }],
    reviewStatsList: [{
      chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: tOld.toISOString(), last_evidence_at: tOld.toISOString(),
      next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0,
    }],
    testsList: testsUnordered,
    now: tMax,
  }).get(1)!;

  const passed = m.daysSinceLastEvidence === 0 && m.retention === 100.0;
  record('Evidence Sync', 'Unordered Test Dates Extracts Max Timestamp', passed, passed ? 'PASS' : 'CRITICAL', `Days=${m.daysSinceLastEvidence}d (Exp: 0d), Retention=${m.retention}% (Exp: 100%)`);
}

// Invariant 4.2: Robustness against null, undefined, invalid dates in deriveAllTopicMetrics
{
  const tValid = new Date('2026-08-25T00:00:00Z');
  const tNow = new Date('2026-08-25T00:00:00Z');

  const testsWithCorruptDates: TestRecordItem[] = [
    { id: 't-inv1', chapter_ids: [1], score: 8.0, completed: true, completed_at: 'not-a-date' },
    { id: 't-inv2', chapter_ids: [1], score: 8.0, completed: true, completed_at: null as any },
    { id: 't-inv3', chapter_ids: [1], score: 8.0, completed: true, completed_at: undefined as any },
    { id: 't-inv4', chapter_ids: [1], score: 8.0, completed: true, completed_at: '' },
    { id: 't-valid', chapter_ids: [1], score: 9.0, completed: true, completed_at: tValid.toISOString() },
  ];

  const m = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 1, is_read: true, read_at: 'invalid-read-date' }],
    reviewStatsList: [{
      chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: null, last_evidence_at: undefined,
      next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0,
    }],
    testsList: testsWithCorruptDates,
    now: tNow,
  }).get(1)!;

  const passed = !isNaN(m.daysSinceLastEvidence) && m.daysSinceLastEvidence === 0 && !isNaN(m.retention) && m.retention === 100.0;
  record('Evidence Sync', 'Resilience to Null/Invalid Date Strings', passed, passed ? 'PASS' : 'HIGH', `Days=${m.daysSinceLastEvidence}d, Retention=${m.retention}%`);
}

// Invariant 4.3: Adversarial test: NaN date propagation in extractChapterPerformanceEvidence
{
  const tNow = new Date('2026-08-28T00:00:00Z');
  const corruptTest: TestRecordItem = {
    id: 'corrupt-date-test',
    chapter_ids: [1],
    score: 8.0,
    completed: true,
    completed_at: 'invalid-iso-date',
  };

  const evidence = extractChapterPerformanceEvidence([corruptTest], tNow);
  const ev1 = evidence.get(1);
  const hasNaNEvidence = ev1 && (isNaN(ev1.observedAverage) || isNaN(ev1.weightedCount));

  record(
    'Evidence Sync',
    'Adversarial Invalid Date in extractChapterPerformanceEvidence',
    !hasNaNEvidence,
    'MEDIUM',
    !hasNaNEvidence
      ? `extractChapterPerformanceEvidence safely ignored invalid date`
      : `BUG DETECTED: Invalid completed_at string '${corruptTest.completed_at}' propagated NaN into observedAverage=${ev1?.observedAverage} and weightedCount=${ev1?.weightedCount} due to missing isNaN(testDate.getTime()) guard at line 239!`
  );
}

// Invariant 4.4: Plantão beds chapter ID extraction vs standard test chapter_ids
{
  const tNow = new Date('2026-08-28T00:00:00Z');
  const plantaoTest: TestRecordItem = {
    id: 'plantao-1',
    mode: 'plantao',
    completed: true,
    completed_at: tNow.toISOString(),
    chapter_ids: [],
    plantao_data: {
      beds: [
        { bedNumber: 1, chapterId: 31, questionIds: [101, 102] },
        { bedNumber: 2, chapterId: 8, questionIds: [103, 104] },
      ],
    },
    results: {
      101: { score: 9.0 },
      102: { score: 10.0 },
      103: { score: 8.0 },
      104: { score: 8.0 },
    },
  };

  const metricsMap = deriveAllTopicMetrics({
    progressList: [
      { chapter_id: 31, is_read: true, read_at: '2026-08-01T00:00:00Z' },
      { chapter_id: 8, is_read: true, read_at: '2026-08-01T00:00:00Z' },
    ],
    reviewStatsList: [],
    testsList: [plantaoTest],
    now: tNow,
  });

  const m31 = metricsMap.get(31)!;
  const m8 = metricsMap.get(8)!;

  const passed = m31.daysSinceLastEvidence === 0 && m8.daysSinceLastEvidence === 0 && m31.observedAverage === 95.0 && m8.observedAverage === 80.0;
  record('Evidence Sync', 'Plantão Bed Level Score & Evidence Sync', passed, passed ? 'PASS' : 'HIGH', `Cap 31 Obs=${m31.observedAverage}% (Exp: 95%), Cap 8 Obs=${m8.observedAverage}% (Exp: 80%)`);
}

console.log('');

// ========================================================================
// SUITE 5: FSRS STATE TRANSITIONS & STABILITY UPDATE RULES
// ========================================================================
console.log('--- SUITE 5: FSRS State Transitions & Updates ---');

// Invariant 5.1: Success streak at scheduled interval t = S reaches 365d cap monotonically
{
  let currentStat: Partial<ChapterReviewStatFSRS> | null = {
    stability: 7.0,
    difficulty: 5.0,
    ease_factor: 2.5,
    times_reviewed: 0,
    last_evidence_at: '2026-08-01T00:00:00Z',
  };

  let monotonicStability = true;
  let tCursor = new Date('2026-08-01T00:00:00Z');

  for (let review = 1; review <= 15; review++) {
    const scheduledDays = Math.round(currentStat.stability || 7.0);
    tCursor = new Date(tCursor.getTime() + scheduledDays * 24 * 60 * 60 * 1000);
    const updated = calculateFSRSUpdate(currentStat, 9.5, tCursor); // Grade 4 (Easy)
    if (updated.stability < (currentStat.stability || 7.0)) {
      monotonicStability = false;
    }
    currentStat = updated;
  }

  const passed = monotonicStability && currentStat.stability === 365.0;
  record('FSRS Transitions', 'Success Streak at Scheduled Interval Reaches 365d Cap', passed, passed ? 'PASS' : 'HIGH', `Final S=${currentStat.stability}d (Cap = 365.0d), D=${currentStat.difficulty}`);
}

// Invariant 5.2: Failure streak decreases stability and increases difficulty
{
  let currentStat: Partial<ChapterReviewStatFSRS> | null = {
    stability: 50.0,
    difficulty: 5.0,
    ease_factor: 2.5,
    times_reviewed: 5,
    last_evidence_at: '2026-08-01T00:00:00Z',
  };

  const tReview = new Date('2026-08-10T00:00:00Z');
  const updatedFail = calculateFSRSUpdate(currentStat, 2.0, tReview); // Grade 1 (Again)

  const passed = updatedFail.stability < (currentStat?.stability ?? 50.0) && updatedFail.difficulty > (currentStat?.difficulty ?? 5.0) && updatedFail.interval_days === 1;
  record('FSRS Transitions', 'Failure decreases stability & resets interval to 1d', passed, passed ? 'PASS' : 'HIGH', `Old S=50d -> New S=${updatedFail.stability}d, Old D=5.0 -> New D=${updatedFail.difficulty}, Int=${updatedFail.interval_days}d`);
}

// Invariant 5.3: Manual re-read stability multiplication 1.35x bounded in [7.0, 365.0]
{
  const tNow = new Date('2026-08-28T00:00:00Z');
  const statLow = { stability: 4.0, ease_factor: 2.5 };
  const statHigh = { stability: 300.0, ease_factor: 2.5 };

  const updatedLow = calculateFSRSManualReadUpdate(statLow, tNow);
  const updatedHigh = calculateFSRSManualReadUpdate(statHigh, tNow);

  const passed = updatedLow.stability >= 7.0 && updatedHigh.stability <= 365.0 && Math.abs(updatedHigh.stability - 365.0) < 0.1;
  record('FSRS Transitions', 'Manual Re-read Clamping [7.0, 365.0]', passed, passed ? 'PASS' : 'HIGH', `S=4d -> ${updatedLow.stability}d (min 7.0), S=300d -> ${updatedHigh.stability}d (max 365.0)`);
}

// Invariant 5.4: Re-read Quiz updates: >=66% gives 1.35x bonus and D - 0.2; <66% gives 1.10x and D + 0.3
{
  const tNow = new Date('2026-08-28T00:00:00Z');
  const baseStat = { stability: 10.0, difficulty: 5.0, ease_factor: 2.5 };

  const quizPass = calculateFSRSRereadWithQuiz(baseStat, 2, 3, tNow); // 66.7% -> pass
  const quizFail = calculateFSRSRereadWithQuiz(baseStat, 1, 3, tNow); // 33.3% -> fail

  const passOk = Math.abs(quizPass.stability - 13.5) < 0.1 && Math.abs(quizPass.difficulty - 4.8) < 0.1;
  const failOk = Math.abs(quizFail.stability - 11.0) < 0.1 && Math.abs(quizFail.difficulty - 5.3) < 0.1;

  const passed = passOk && failOk;
  record('FSRS Transitions', 'Re-read Quiz Conditional Multiplier (Pass vs Fail)', passed, passed ? 'PASS' : 'HIGH', `Pass (2/3): S=${quizPass.stability}d, D=${quizPass.difficulty} | Fail (1/3): S=${quizFail.stability}d, D=${quizFail.difficulty}`);
}

// Invariant 5.5: Adversarial NaN score input to calculateFSRSUpdate
{
  const stat = { stability: 10.0, difficulty: 5.0, ease_factor: 2.5 };
  const updatedNaN = calculateFSRSUpdate(stat, NaN);

  // If bedScore is NaN, does it falsely grant Grade 4 / Easy?
  const wasFalselyTreatedAsSuccess = updatedNaN.stability > stat.stability;
  record(
    'FSRS Transitions',
    'Adversarial NaN Score in calculateFSRSUpdate',
    !wasFalselyTreatedAsSuccess,
    'MEDIUM',
    !wasFalselyTreatedAsSuccess
      ? `NaN score safely rejected or treated as failure`
      : `VULNERABILITY: calculateFSRSUpdate(stat, NaN) fell through to Grade 4 (Easy) and increased stability from 10.0d to ${updatedNaN.stability}d!`
  );
}

console.log('');

// ========================================================================
// SUITE 6: GLOBAL READINESS & RECOMMENDATIONS ENGINE
// ========================================================================
console.log('--- SUITE 6: Global Readiness & Recommendations Engine ---');

// Invariant 6.1: Empty state produces 0 readiness
{
  const snapshotEmpty = buildReadinessSnapshot({
    progressList: [],
    reviewStatsList: [],
    testsList: [],
  });

  const passed = snapshotEmpty.globalReadiness === 0 && snapshotEmpty.activeProficiency === 0 && snapshotEmpty.totalReadChapters === 0;
  record('Global Readiness', 'Empty State Baseline = 0', passed, passed ? 'PASS' : 'HIGH', `Global=${snapshotEmpty.globalReadiness}%, ActiveProf=${snapshotEmpty.activeProficiency}%`);
}

// Invariant 6.2: Recommendations deduplication (3 distinct modes, 3 distinct chapter IDs)
{
  const mockProgress: ChapterProgressItem[] = [
    { chapter_id: 31, is_read: true, read_at: '2026-08-01T00:00:00Z' },
    { chapter_id: 8, is_read: true, read_at: '2026-08-01T00:00:00Z' },
    { chapter_id: 3, is_read: true, read_at: '2026-08-01T00:00:00Z' },
  ];

  const snapshot = buildReadinessSnapshot({
    progressList: mockProgress,
    reviewStatsList: [],
    testsList: [],
  });

  const recs = snapshot.recommendations || [];
  const recIds = recs.map((r) => r.recommendedChapterId);
  const uniqueIds = new Set(recIds);

  const passed = recs.length === 3 && uniqueIds.size === 3;
  record('Recommendations', '3 Distinct Recommendation Cards with Unique Chapters', passed, passed ? 'PASS' : 'HIGH', `Count=${recs.length}, Unique IDs=${Array.from(uniqueIds).join(', ')}`);
}

// Invariant 6.3: Reroll exclusion prevents excluded chapter IDs from reappearing
{
  const excludeIds = [19, 31, 8];
  const snapshot = buildReadinessSnapshot({
    progressList: [{ chapter_id: 31, is_read: true, read_at: '2026-08-01T00:00:00Z' }],
    reviewStatsList: [],
    testsList: [],
    excludeChapterIds: excludeIds,
  });

  const recId = snapshot.recommendation.recommendedChapterId;
  const passed = !excludeIds.includes(recId);
  record('Recommendations', 'Reroll Exclusion Filter', passed, passed ? 'PASS' : 'HIGH', `Excluded=[${excludeIds.join(', ')}], Chosen=${recId} (Not in excluded list)`);
}

// Invariant 6.4: Plantão bed selection respects max 2 per section constraint
{
  const mockProgressAll: ChapterProgressItem[] = CHAPTERS_DATA.map((c) => ({
    chapter_id: c.id,
    is_read: true,
    read_at: '2026-08-01T00:00:00Z',
  }));

  const snapshot = buildReadinessSnapshot({
    progressList: mockProgressAll,
    reviewStatsList: [],
    testsList: [],
  });

  const beds = selectPlantaoBedsWithEngine({
    snapshot,
    bedCount: 4,
    maxPerSection: 2,
  });

  const sectionCounts = new Map<number, number>();
  beds.forEach((b) => {
    const sec = b.metrics.sectionNumber;
    sectionCounts.set(sec, (sectionCounts.get(sec) || 0) + 1);
  });

  let maxPerSecObserved = 0;
  sectionCounts.forEach((cnt) => {
    if (cnt > maxPerSecObserved) maxPerSecObserved = cnt;
  });

  const passed = beds.length === 4 && maxPerSecObserved <= 2;
  record('Plantão Beds', 'Bed Selector Respects maxPerSection <= 2', passed, passed ? 'PASS' : 'HIGH', `Beds Selected=${beds.length}, Max in any section=${maxPerSecObserved}`);
}

console.log('\n========================================================================');
console.log('                          STRESS TEST SUMMARY                           ');
console.log('========================================================================');

const totalTests = results.length;
const passedTests = results.filter((r) => r.passed).length;
const failedTests = totalTests - passedTests;

console.log(`Total Stress Assertions: ${totalTests}`);
console.log(`Passed:                  ${passedTests}`);
console.log(`Failed:                  ${failedTests}`);
console.log(`Success Rate:            ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);

const criticalOrHigh = results.filter((r) => !r.passed && (r.severity === 'CRITICAL' || r.severity === 'HIGH'));
if (criticalOrHigh.length > 0) {
  console.log(`Detected ${criticalOrHigh.length} HIGH/CRITICAL issue(s):`);
  criticalOrHigh.forEach((c) => {
    console.log(`  - [${c.severity}] ${c.suite}: ${c.name} -> ${c.details}`);
  });
}
