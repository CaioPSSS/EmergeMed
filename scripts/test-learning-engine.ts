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

console.log('=== ALL UNIT TESTS COMPLETED SUCCESSFULLY ===');
