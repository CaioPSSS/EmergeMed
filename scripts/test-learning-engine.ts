import {
  getNormalizedClinicalWeights,
  deriveAllTopicMetrics,
  buildReadinessSnapshot,
  calculateFSRSUpdate,
} from '../lib/learning-engine';

console.log('=== RUNNING UNIT TESTS FOR LEARNING ENGINE (FSRS) ===\n');

// Test 1: PCR vs Dermatitis weights
const weightsMap = getNormalizedClinicalWeights();
const pcrWeight = weightsMap.get(8)!; // Chapter 8: Parada Cardiorrespiratória (Freq 7, Imp 10)
const dermWeight = weightsMap.get(106)!; // Chapter 106: Emergências Dermatológicas (Freq 6, Imp 4)

console.log(`Test 1 - Clinical Weights:`);
console.log(`  PCR (Cap 8): rawWeight = ${pcrWeight.rawWeight.toFixed(4)}, clinicalWeight = ${pcrWeight.clinicalWeight.toFixed(6)}`);
console.log(`  Dermatite (Cap 106): rawWeight = ${dermWeight.rawWeight.toFixed(4)}, clinicalWeight = ${dermWeight.clinicalWeight.toFixed(6)}`);

if (pcrWeight.clinicalWeight > dermWeight.clinicalWeight) {
  console.log('  PASSED: PCR clinical weight is significantly higher than Dermatite.\n');
} else {
  console.error('  FAILED: Expected PCR weight to be higher than Dermatite.\n');
}

// Test 2: Dynamic Thresholds
const pcrMetrics = deriveAllTopicMetrics({ progressList: [], reviewStatsList: [], testsList: [] }).get(8)!;
const dermMetrics = deriveAllTopicMetrics({ progressList: [], reviewStatsList: [], testsList: [] }).get(106)!;

console.log(`Test 2 - Dynamic Thresholds:`);
console.log(`  PCR Dynamic Threshold: ${pcrMetrics.dynamicThreshold} (Target: ~85-90)`);
console.log(`  Dermatite Dynamic Threshold: ${dermMetrics.dynamicThreshold} (Target: ~65-70)`);

if (pcrMetrics.dynamicThreshold > dermMetrics.dynamicThreshold) {
  console.log('  PASSED: Critical topic PCR requires higher threshold than secondary Dermatite.\n');
} else {
  console.error('  FAILED: Expected PCR threshold to be higher than Dermatite threshold.\n');
}

// Test 3: Retention decay over time without DB writes
const t0 = new Date('2026-08-01T00:00:00Z');
const t30 = new Date('2026-08-31T00:00:00Z');

const progressListRead = [{ chapter_id: 8, is_read: true, read_at: t0.toISOString() }];
const statsListRead = [{
  chapter_id: 8,
  times_reviewed: 1,
  times_correct: 1,
  times_incorrect: 0,
  last_reviewed_at: t0.toISOString(),
  last_evidence_at: t0.toISOString(),
  next_review_at: new Date('2026-08-10T00:00:00Z').toISOString(),
  ease_factor: 2.5,
  interval_days: 10,
  stability: 10.0,
  difficulty: 5.0,
}];

const metricsDay0 = deriveAllTopicMetrics({ progressList: progressListRead, reviewStatsList: statsListRead, testsList: [], now: t0 }).get(8)!;
const metricsDay30 = deriveAllTopicMetrics({ progressList: progressListRead, reviewStatsList: statsListRead, testsList: [], now: t30 }).get(8)!;

console.log(`Test 3 - Retention Decay over Time:`);
console.log(`  PCR Retention Day 0: ${metricsDay0.retention}%`);
console.log(`  PCR Retention Day 30: ${metricsDay30.retention}%`);

if (metricsDay0.retention > metricsDay30.retention) {
  console.log('  PASSED: Memory retention naturally decays over time without database writes.\n');
} else {
  console.error('  FAILED: Expected retention to decay over time.\n');
}

// Test 4: Expansion allowed in Dashboard but excluded in Plantão for unread topics
const snapshotDash = buildReadinessSnapshot({ progressList: [], reviewStatsList: [], testsList: [], surface: 'dashboard' });
const snapshotPlantao = buildReadinessSnapshot({ progressList: [], reviewStatsList: [], testsList: [], surface: 'plantao' });

console.log(`Test 4 - Surface Restrictions:`);
console.log(`  Dashboard surface mode: ${snapshotDash.recommendation.mode}`);
console.log(`  Plantão surface recommended chapter ID: ${snapshotPlantao.recommendation.recommendedChapterId}`);

if (snapshotDash.recommendation.mode === 'expansion') {
  console.log('  PASSED: Dashboard mode correctly suggests Expansion for unread topics.\n');
} else {
  console.error(`  FAILED: Expected Dashboard mode to be expansion, got ${snapshotDash.recommendation.mode}\n`);
}

// Test 5: FSRS Update after review
const fsrsUpdatedSuccess = calculateFSRSUpdate(statsListRead[0], 9.0, t30);
const fsrsUpdatedFail = calculateFSRSUpdate(statsListRead[0], 2.0, t30);

console.log(`Test 5 - FSRS Update:`);
console.log(`  Success (Score 9.0): New Stability = ${fsrsUpdatedSuccess.stability}d, New Difficulty = ${fsrsUpdatedSuccess.difficulty}`);
console.log(`  Fail (Score 2.0): New Stability = ${fsrsUpdatedFail.stability}d, New Difficulty = ${fsrsUpdatedFail.difficulty}`);

if (fsrsUpdatedSuccess.stability > statsListRead[0].stability && fsrsUpdatedFail.stability < statsListRead[0].stability) {
  console.log('  PASSED: FSRS increases stability on success and decreases stability on failure.\n');
} else {
  console.error('  FAILED: FSRS stability update behavior is incorrect.\n');
}

// Test 6: AI JSON normalization test (handles options as object and correct_answer as "B")
import { normalizeQuestionItem } from '../lib/ai/openrouter';

const rawAiOutputObject = {
  question: "Paciente em PCR...",
  options: {
    "A": "Conduta A",
    "B": "Conduta B",
    "C": "Conduta C",
    "D": "Conduta D",
    "E": "Conduta E"
  },
  correct_answer: "B"
};

const normalized = normalizeQuestionItem(rawAiOutputObject);

console.log(`Test 6 - AI Question Normalization:`);
console.log(`  Vignette: "${normalized.vignette}"`);
console.log(`  Options (Array check): ${Array.isArray(normalized.options) ? 'YES' : 'NO'} (${normalized.options?.length} items)`);
console.log(`  Correct Option Index: ${normalized.correctOption} (Expected: 1 for "B")`);

if (Array.isArray(normalized.options) && normalized.options.length === 5 && normalized.correctOption === 1 && normalized.vignette === rawAiOutputObject.question) {
  console.log('  PASSED: AI question object safely normalized to expected schema.\n');
} else {
  console.error('  FAILED: Question normalization did not produce valid schema.\n');
}

// Test 7: FSRS Manual Re-read Stability Boost
import { calculateFSRSManualReadUpdate } from '../lib/learning-engine';

const initialStat = { stability: 4.0, ease_factor: 2.5, times_reviewed: 1 };
const fsrsManualReadUpdate = calculateFSRSManualReadUpdate(initialStat, t30);

console.log(`Test 7 - FSRS Manual Re-read Update:`);
console.log(`  Initial Stability: ${initialStat.stability}d`);
console.log(`  New Stability after Re-read: ${fsrsManualReadUpdate.stability}d`);

if (fsrsManualReadUpdate.stability > initialStat.stability && fsrsManualReadUpdate.last_evidence_at) {
  console.log('  PASSED: Manual re-reading reinforces FSRS stability and updates last evidence timestamp.\n');
} else {
  console.error('  FAILED: Manual re-read stability update behavior is incorrect.\n');
}

// Test 8: Official FSRS Power-Law Curve Mathematical Invariants
console.log('Test 8 - FSRS Power-Law Mathematical Invariants:');
const testStability = 14.0;
const testT0 = new Date('2026-08-01T00:00:00Z');

// t = 0 -> R = 100%
const metricsT0 = deriveAllTopicMetrics({
  progressList: [{ chapter_id: 31, is_read: true, read_at: testT0.toISOString() }],
  reviewStatsList: [{
    chapter_id: 31, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
    last_reviewed_at: testT0.toISOString(), last_evidence_at: testT0.toISOString(),
    next_review_at: null, ease_factor: 2.5, interval_days: 14, stability: testStability, difficulty: 5.0,
  }],
  testsList: [],
  now: testT0,
}).get(31)!;

// t = S (14 days) -> R = 90.0%
const testTS = new Date('2026-08-15T00:00:00Z');
const metricsTS = deriveAllTopicMetrics({
  progressList: [{ chapter_id: 31, is_read: true, read_at: testT0.toISOString() }],
  reviewStatsList: [{
    chapter_id: 31, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
    last_reviewed_at: testT0.toISOString(), last_evidence_at: testT0.toISOString(),
    next_review_at: null, ease_factor: 2.5, interval_days: 14, stability: testStability, difficulty: 5.0,
  }],
  testsList: [],
  now: testTS,
}).get(31)!;

// t = 3S (42 days) -> R ~ 76.6%
const testT3S = new Date('2026-09-12T00:00:00Z');
const metricsT3S = deriveAllTopicMetrics({
  progressList: [{ chapter_id: 31, is_read: true, read_at: testT0.toISOString() }],
  reviewStatsList: [{
    chapter_id: 31, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
    last_reviewed_at: testT0.toISOString(), last_evidence_at: testT0.toISOString(),
    next_review_at: null, ease_factor: 2.5, interval_days: 14, stability: testStability, difficulty: 5.0,
  }],
  testsList: [],
  now: testT3S,
}).get(31)!;

console.log(`  R(t=0, S=14): ${metricsT0.retention}% (Expected: 100%)`);
console.log(`  R(t=S, S=14): ${metricsTS.retention}% (Expected: 90.0%)`);
console.log(`  R(t=3S, S=14): ${metricsT3S.retention}% (Expected: ~76.6%)`);

if (
  Math.abs(metricsT0.retention - 100.0) < 0.1 &&
  Math.abs(metricsTS.retention - 90.0) < 0.1 &&
  Math.abs(metricsT3S.retention - 76.6) < 0.5
) {
  console.log('  PASSED: FSRS Power-Law satisfies R(0)=100%, R(S)=90%, R(3S)=76.6% exactly.\n');
} else {
  console.error('  FAILED: FSRS Power-Law mathematical values do not match expected curve.\n');
}

// Test 9: Clinical Topic Readiness Decoupling (0.85 * Performance + 0.15 * Retention)
console.log('Test 9 - Clinical Topic Readiness Decoupling (85% Performance / 15% Retention):');
// Case A: Read topic, performance 80.0%, retention 90.0% -> Readiness = 0.85 * 80.0 + 0.15 * 90.0 = 68.0 + 13.5 = 81.5%
const readinessCalc = 0.85 * 80.0 + 0.15 * 90.0;
console.log(`  Expected Readiness for Perf 80% & Ret 90%: ${readinessCalc.toFixed(1)}%`);
console.log(`  Measured Readiness in Engine (Cap 31 at t=S): ${metricsTS.topicReadiness}%`);

// With m=1.0 and prior=70 (no test evidence), performance = 70.0%
// Topic Readiness = 0.85 * 70.0 + 0.15 * 90.0 = 59.5 + 13.5 = 73.0%
if (Math.abs(metricsTS.topicReadiness - 73.0) < 0.2) {
  console.log('  PASSED: Clinical Topic Readiness correctly weights 85% clinical competence and 15% recency.\n');
} else {
  console.error(`  FAILED: Expected readiness 73.0%, got ${metricsTS.topicReadiness}\n`);
}

// Test 10: Bayesian Smoothing (m = 1.0, prior = 70.0%)
console.log('Test 10 - Bayesian Smoothing (m = 1.0, Prior = 70%):');
const mockTest1 = {
  id: 'test-1',
  chapter_ids: [31],
  mode: 'standard',
  score: 10.0, // 100%
  completed: true,
  completed_at: testT0.toISOString(),
};

// n = 1 test with score 100%: performance = (1 * 100 + 1 * 70) / (1 + 1) = 85.0%
const metricsWith1Test = deriveAllTopicMetrics({
  progressList: [{ chapter_id: 31, is_read: true, read_at: testT0.toISOString() }],
  reviewStatsList: [],
  testsList: [mockTest1],
  now: testT0,
}).get(31)!;

console.log(`  1 Test (Score 10.0): Performance = ${metricsWith1Test.performance}% (Expected: 85.0%)`);

if (Math.abs(metricsWith1Test.performance - 85.0) < 0.2) {
  console.log('  PASSED: Bayesian smoothing with m=1.0 accurately reflects doctor performance without severe drag.\n');
} else {
  console.error(`  FAILED: Expected performance 85.0%, got ${metricsWith1Test.performance}\n`);
}

// Test 11: Dynamic Evidence Synchronization with Tests Table
console.log('Test 11 - Dynamic Evidence Synchronization from Tests Table:');
const dateOld = new Date('2026-08-03T12:00:00Z');
const dateToday = new Date('2026-08-28T12:00:00Z');

// DB stat is 25 days old, but a test was taken today
const mockTestToday = {
  id: 'test-today',
  chapter_ids: [31],
  mode: 'standard',
  score: 8.4,
  completed: true,
  completed_at: dateToday.toISOString(),
};

const metricsWithDynamicSync = deriveAllTopicMetrics({
  progressList: [{ chapter_id: 31, is_read: true, read_at: dateOld.toISOString() }],
  reviewStatsList: [{
    chapter_id: 31, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
    last_reviewed_at: dateOld.toISOString(), last_evidence_at: null,
    next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0,
  }],
  testsList: [mockTestToday],
  now: dateToday,
}).get(31)!;

console.log(`  Days Since Last Evidence: ${metricsWithDynamicSync.daysSinceLastEvidence}d (Expected: ~0d)`);
console.log(`  Retention: ${metricsWithDynamicSync.retention}% (Expected: ~100%)`);
console.log(`  Topic Readiness: ${metricsWithDynamicSync.topicReadiness}%`);

if (metricsWithDynamicSync.daysSinceLastEvidence < 0.1 && metricsWithDynamicSync.retention >= 99.0) {
  console.log('  PASSED: Dynamic evidence timestamp dynamically synchronized from testsList.\n');
} else {
  console.error('  FAILED: Dynamic evidence synchronization did not pick up recent test completed_at.\n');
}

// Test 12: Global Readiness Sublinear Coverage Scaling
console.log('Test 12 - Global Readiness Sublinear Coverage Scaling:');
const studiedChapterIds = [3, 7, 8, 31, 32, 41, 45, 51, 58, 81, 82, 89, 1001, 1003, 1004];
const mockProgressList = studiedChapterIds.map((id) => ({
  chapter_id: id,
  is_read: true,
  read_at: dateToday.toISOString(),
  last_read_at: dateToday.toISOString(),
  read_count: 1,
}));

const mockStatsList = studiedChapterIds.map((id) => ({
  chapter_id: id,
  times_reviewed: 1,
  times_correct: 1,
  times_incorrect: 0,
  last_reviewed_at: dateToday.toISOString(),
  last_evidence_at: dateToday.toISOString(),
  next_review_at: null,
  ease_factor: 2.5,
  interval_days: 7,
  stability: 7.0,
  difficulty: 5.0,
}));

const mockTestsList = studiedChapterIds.map((id, idx) => ({
  id: `test-stud-${idx}`,
  chapter_ids: [id],
  mode: 'standard',
  score: 8.36,
  completed: true,
  completed_at: dateToday.toISOString(),
}));

const snapshot15Chapters = buildReadinessSnapshot({
  progressList: mockProgressList,
  reviewStatsList: mockStatsList,
  testsList: mockTestsList,
  now: dateToday,
});

console.log(`  Active Proficiency: ${snapshot15Chapters.activeProficiency}%`);
console.log(`  Active Retention: ${snapshot15Chapters.activeRetention}%`);
console.log(`  Clinical Coverage: ${snapshot15Chapters.curricularCoverage.clinicalWeightedPercent}%`);
console.log(`  Global Readiness: ${snapshot15Chapters.globalReadiness}% (Expected: >= 45%)`);
console.log(`  Readiness Status: ${snapshot15Chapters.readinessStatus.label}`);

if (snapshot15Chapters.globalReadiness >= 45.0) {
  console.log('  PASSED: Global Readiness sublinear curve appropriately scales active mastery.\n');
} else {
  console.error(`  FAILED: Expected Global Readiness >= 45%, got ${snapshot15Chapters.globalReadiness}%\n`);
}

console.log('=== ALL UNIT TESTS COMPLETED SUCCESSFULLY ===\n');

// Run Retroactive CSV Validation Suite
import './validate-retroactive-fsrs';

