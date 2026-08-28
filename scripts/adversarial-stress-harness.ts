import * as fs from 'fs';
import * as path from 'path';
import {
  deriveAllTopicMetrics,
  buildReadinessSnapshot,
  getNormalizedClinicalWeights,
  calculateFSRSUpdate,
  calculateFSRSManualReadUpdate,
  calculateFSRSRereadWithQuiz,
  ChapterProgressItem,
  ChapterReviewStatFSRS,
  TestRecordItem,
  ChapterMetrics,
  SPECIALTIES_CONFIG,
} from '../lib/learning-engine';
import { CHAPTERS_DATA } from '../lib/chapters-data';

// =========================================================================
// SECTION A: CSV PARSER ROBUSTNESS TEST SUITE
// =========================================================================
function parseCSV(csvText: string): Record<string, string>[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        i++; // skip \n
      } else if (char === '\n' || char === '\r') {
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().replace(/^\uFEFF/, ''));
  const results: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0].trim() === '') continue; // skip empty line
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = row[c] !== undefined ? row[c] : '';
    }
    results.push(obj);
  }

  return results;
}

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  details: string;
}

const testResults: TestResult[] = [];

function assert(suite: string, name: string, condition: boolean, details: string) {
  testResults.push({ suite, name, passed: condition, details });
  if (condition) {
    console.log(`  [PASS] ${name}: ${details}`);
  } else {
    console.error(`  [FAIL] ${name}: ${details}`);
  }
}

console.log('========================================================================');
console.log('         EMERGEMED CHALLENGER 2: ADVERSARIAL STRESS HARNESS             ');
console.log('========================================================================\n');

// 1. Escaped quotes and embedded commas/newlines
const testCsv1 = `id,name,description,score\n1,"Cardio, Basic","Contains ""escaped"" quotes and\nembedded newline",9.5\n2,"Normal","Simple row",8.0`;
const parsed1 = parseCSV(testCsv1);
assert('CSV Parser', 'Escaped quotes & embedded newlines',
  parsed1.length === 2 &&
  parsed1[0].name === 'Cardio, Basic' &&
  parsed1[0].description === 'Contains "escaped" quotes and\nembedded newline' &&
  parsed1[0].score === '9.5',
  `Parsed ${parsed1.length} rows; row 0 description correctly unescaped.`);

// 2. UTF-8 BOM and trailing empty rows
const testCsv2 = `\uFEFFid,score,status\r\n10,8.5,active\r\n11,9.0,active\r\n\r\n\r\n`;
const parsed2 = parseCSV(testCsv2);
assert('CSV Parser', 'UTF-8 BOM and trailing blank rows',
  parsed2.length === 2 &&
  parsed2[0].id === '10' &&
  parsed2[1].id === '11',
  `Parsed ${parsed2.length} rows (skipped 2 trailing blank lines, stripped BOM).`);

// 3. Null values and missing columns
const testCsv3 = `id,chapter_id,last_evidence_at,score\n1,31,,8.5\n2,32,2026-08-01,\n3,33,,\n`;
const parsed3 = parseCSV(testCsv3);
assert('CSV Parser', 'Null and empty column values',
  parsed3.length === 3 &&
  parsed3[0].last_evidence_at === '' &&
  parsed3[1].score === '' &&
  parsed3[2].last_evidence_at === '' && parsed3[2].score === '',
  `Handled empty fields cleanly across all 3 rows.`);

// 4. Empty CSV string, whitespace only, header only
assert('CSV Parser', 'Empty CSV string', parseCSV('').length === 0, 'Returned [] for empty string');
assert('CSV Parser', 'Whitespace only CSV', parseCSV('   \n\n  \r\n').length === 0, 'Returned [] for whitespace');
assert('CSV Parser', 'Header only CSV', parseCSV('id,name,score\n').length === 0, 'Returned [] for header only');

// 5. Unclosed quotes edge case
const testCsv5 = `id,name,score\n1,"Unclosed quote value,9.0\n2,valid,10.0`;
const parsed5 = parseCSV(testCsv5);
assert('CSV Parser', 'Unclosed quote resilience',
  parsed5.length >= 1,
  `Did not throw fatal exception on unclosed quote (parsed ${parsed5.length} rows).`);

console.log('');

// =========================================================================
// SECTION B: RAW CSV VS CALCULATION ORACLE FOR CHAPTER 31
// =========================================================================
console.log('------------------------------------------------------------------------');
console.log(' SECTION B: CHAPTER 31 DEEP-DIVE CALCULATION ORACLE VS RAW CSV DATA     ');
console.log('------------------------------------------------------------------------');

const validationDir = path.resolve('C:/Users/souza/Downloads/Validacao');
const statsCsvPath = path.join(validationDir, 'chapter_review_stats_rows.csv');
const testsCsvPath = path.join(validationDir, 'tests_rows.csv');

const statsRows = parseCSV(fs.readFileSync(statsCsvPath, 'utf8'));
const testsRows = parseCSV(fs.readFileSync(testsCsvPath, 'utf8'));

// Parse testsList with adapter
const testsList: TestRecordItem[] = testsRows.map((r) => {
  let chapterIds: number[] = [];
  try {
    if (r.chapter_ids) {
      const parsed = JSON.parse(r.chapter_ids);
      if (Array.isArray(parsed)) {
        chapterIds = parsed.map((x: any) => typeof x === 'number' ? x : parseInt(x, 10)).filter((x: any) => !isNaN(x));
      }
    }
  } catch {
    chapterIds = r.chapter_ids ? r.chapter_ids.replace(/[\[\]]/g, '').split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => !isNaN(x)) : [];
  }

  let results: Record<string, any> | null = null;
  try {
    if (r.results) results = JSON.parse(r.results);
  } catch {}

  let plantaoData: any = null;
  try {
    if (r.plantao_data) plantaoData = JSON.parse(r.plantao_data);
  } catch {}

  return {
    id: r.id,
    chapter_ids: chapterIds,
    mode: r.mode || null,
    score: r.score !== '' && r.score !== null && r.score !== undefined ? parseFloat(r.score) : null,
    completed: r.completed === 'true' || r.completed === 't' || r.completed === '1',
    completed_at: r.completed_at || null,
    results,
    plantao_data: plantaoData,
  };
});

const statsList: ChapterReviewStatFSRS[] = statsRows.map((r) => ({
  chapter_id: parseInt(r.chapter_id, 10),
  times_reviewed: parseInt(r.times_reviewed, 10) || 0,
  times_correct: parseInt(r.times_correct, 10) || 0,
  times_incorrect: parseInt(r.times_incorrect, 10) || 0,
  last_reviewed_at: r.last_reviewed_at || null,
  last_evidence_at: r.last_evidence_at || null,
  next_review_at: r.next_review_at || null,
  ease_factor: parseFloat(r.ease_factor) || 2.5,
  interval_days: parseInt(r.interval_days, 10) || 1,
  stability: r.stability ? parseFloat(r.stability) : undefined,
  difficulty: r.difficulty ? parseFloat(r.difficulty) : undefined,
}));

// Find all tests containing Chapter 31
const evalNow = new Date('2026-08-28T21:44:28Z');
const cap31Tests: Array<{ testId: string; date: string; mode: string; testScore: number; bedAvg: number; weight: number }> = [];

testsList.forEach((t) => {
  if (!t.completed || !t.completed_at) return;
  const isPlantao = t.mode === 'plantao';
  const testDate = new Date(t.completed_at);
  const daysAgo = Math.max(0, (evalNow.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24));
  const timeDecayWeight = Math.exp(-Math.LN2 * daysAgo / 90);

  if (isPlantao && t.plantao_data?.beds) {
    t.plantao_data.beds.forEach((bed: any) => {
      if (bed.chapterId === 31) {
        const qIds = bed.questionIds || [];
        let bedTotalScore = 0;
        let qCount = 0;
        qIds.forEach((qId: any) => {
          const evalObj = t.results ? t.results[qId] : null;
          if (evalObj && typeof evalObj.score === 'number') {
            bedTotalScore += evalObj.score;
            qCount++;
          }
        });
        const bedAvgScore = qCount > 0 ? (bedTotalScore / qCount) * 10 : (t.score || 5) * 10;
        const totalWeight = 1.25 * timeDecayWeight;
        cap31Tests.push({
          testId: t.id,
          date: t.completed_at!,
          mode: 'plantao',
          testScore: (t.score || 0) * 10,
          bedAvg: bedAvgScore,
          weight: totalWeight,
        });
      }
    });
  } else if (t.chapter_ids && t.chapter_ids.includes(31)) {
    const score100 = (t.score || 5) * 10;
    const attributionConfidence = 1.0 / Math.max(1, t.chapter_ids.length);
    const totalWeight = 1.0 * attributionConfidence * timeDecayWeight;
    cap31Tests.push({
      testId: t.id,
      date: t.completed_at!,
      mode: t.mode || 'standard',
      testScore: score100,
      bedAvg: score100,
      weight: totalWeight,
    });
  }
});

console.log(`Extracted ${cap31Tests.length} tests referencing Chapter 31:`);
cap31Tests.forEach((ct, i) => {
  console.log(`  #${i + 1} | Date: ${ct.date} | Mode: ${ct.mode} | BedScore: ${ct.bedAvg.toFixed(2)} | Weight: ${ct.weight.toFixed(4)}`);
});

// Step-by-step mathematical oracle for Chapter 31
let sumWeightedScore = 0;
let sumWeights = 0;
let maxCompletedAt: Date | null = null;

cap31Tests.forEach((ct) => {
  sumWeightedScore += ct.bedAvg * ct.weight;
  sumWeights += ct.weight;
  const d = new Date(ct.date);
  if (!maxCompletedAt || d.getTime() > maxCompletedAt.getTime()) maxCompletedAt = d;
});

const oracleObservedAvg = sumWeights > 0 ? sumWeightedScore / sumWeights : 70.0;
const oracleN = cap31Tests.length;
const oraclePrior = 70.0;
const oraclePerformance = (oracleN * oracleObservedAvg + 1.0 * oraclePrior) / (oracleN + 1.0);

const oracleDaysSince = maxCompletedAt !== null
  ? Math.max(0, (evalNow.getTime() - (maxCompletedAt as Date).getTime()) / (1000 * 60 * 60 * 24))
  : 999;

// Stability: from chapter_review_stats, stat stability is 3.0, but clamped to min S0 = 7.0
const stat31 = statsList.find((s) => s.chapter_id === 31);
const rawStatStab = stat31?.stability || 7.0;
const oracleStability = Math.min(365.0, Math.max(7.0, rawStatStab));

// Retention: R = 100 * (1 + (19/81) * (days / S))^(-0.5)
const oracleRetention = 100.0 * Math.pow(1.0 + (19.0 / 81.0) * (oracleDaysSince / oracleStability), -0.5);

// Topic Readiness = 0.85 * P + 0.15 * R
const oracleTopicReadiness = 0.85 * oraclePerformance + 0.15 * oracleRetention;

// Run engine
const progressMap = new Map<number, { is_read: boolean; read_at: string; read_count: number; last_read_at: string }>();
statsList.forEach((s) => {
  const ts = s.last_reviewed_at || s.last_evidence_at || new Date('2026-08-03T00:00:00Z').toISOString();
  progressMap.set(s.chapter_id, { is_read: true, read_at: ts, read_count: s.times_reviewed || 1, last_read_at: ts });
});
testsList.forEach((t) => {
  if (!t.completed || !t.completed_at) return;
  const cIds = new Set<number>();
  if (t.chapter_ids) t.chapter_ids.forEach((id) => cIds.add(id));
  if (t.plantao_data?.beds) t.plantao_data.beds.forEach((b: any) => { if (b.chapterId) cIds.add(b.chapterId); });
  cIds.forEach((id) => {
    const existing = progressMap.get(id);
    if (!existing) {
      progressMap.set(id, { is_read: true, read_at: t.completed_at!, read_count: 1, last_read_at: t.completed_at! });
    } else {
      if (new Date(t.completed_at!) > new Date(existing.last_read_at)) existing.last_read_at = t.completed_at!;
      if (new Date(t.completed_at!) < new Date(existing.read_at)) existing.read_at = t.completed_at!;
      existing.read_count++;
    }
  });
});

const progressList: ChapterProgressItem[] = Array.from(progressMap.entries()).map(([chapter_id, val]) => ({
  chapter_id,
  is_read: val.is_read,
  read_at: val.read_at,
  read_count: val.read_count,
  last_read_at: val.last_read_at,
}));

const customChapters = [
  { id: 1001, number: 1001, title: 'Cetoacidose Diabética e EHH', sectionNumber: 99, sectionTitle: 'Capítulos Personalizados', category: 'Metabólico', isCustom: true, importanceScore: 9.5, frequencyScore: 8.5 },
  { id: 1003, number: 1003, title: 'Sepse e Choque Séptico na Emergência', sectionNumber: 99, sectionTitle: 'Capítulos Personalizados', category: 'Infectologia', isCustom: true, importanceScore: 10.0, frequencyScore: 9.0 },
  { id: 1004, number: 1004, title: 'AVC Isquêmico Agudo', sectionNumber: 99, sectionTitle: 'Capítulos Personalizados', category: 'Neurologia', isCustom: true, importanceScore: 9.5, frequencyScore: 8.5 },
];
const allChapters = [...CHAPTERS_DATA, ...customChapters];

const engineMetrics = deriveAllTopicMetrics({
  progressList,
  reviewStatsList: statsList,
  testsList,
  chaptersList: allChapters,
  now: evalNow,
});

const engine31 = engineMetrics.get(31)!;

console.log('\n--- Oracle vs Engine Comparison for Chapter 31 ---');
console.log(`Evidence count:       Oracle = ${oracleN} | Engine = ${engine31.evidenceCount}`);
console.log(`Observed Average:     Oracle = ${oracleObservedAvg.toFixed(4)}% | Engine = ${engine31.observedAverage}%`);
console.log(`Bayesian Performance: Oracle = ${oraclePerformance.toFixed(4)}% | Engine = ${engine31.performance}%`);
console.log(`Days Since Evidence:  Oracle = ${oracleDaysSince.toFixed(4)}d | Engine = ${engine31.daysSinceLastEvidence}d`);
console.log(`FSRS Stability:       Oracle = ${oracleStability.toFixed(4)}d | Engine = ${engine31.stability}d`);
console.log(`FSRS Retention:       Oracle = ${oracleRetention.toFixed(4)}% | Engine = ${engine31.retention}%`);
console.log(`Topic Readiness:      Oracle = ${oracleTopicReadiness.toFixed(4)}% | Engine = ${engine31.topicReadiness}%`);

assert('Oracle Verification', 'Cap 31 Evidence Count', engine31.evidenceCount === oracleN, `Count matches ${oracleN}`);
assert('Oracle Verification', 'Cap 31 Observed Average', Math.abs(engine31.observedAverage - oracleObservedAvg) < 0.1, `ObsAvg diff < 0.1`);
assert('Oracle Verification', 'Cap 31 Bayesian Performance', Math.abs(engine31.performance - oraclePerformance) < 0.1, `Perf diff < 0.1`);
assert('Oracle Verification', 'Cap 31 Days Since Evidence', Math.abs(engine31.daysSinceLastEvidence - oracleDaysSince) < 0.1, `Days diff < 0.1`);
assert('Oracle Verification', 'Cap 31 FSRS Stability', Math.abs(engine31.stability - oracleStability) < 0.1, `Stability matches min S0=7.0d`);
assert('Oracle Verification', 'Cap 31 FSRS Retention', Math.abs(engine31.retention - oracleRetention) < 0.1, `Retention diff < 0.1`);
assert('Oracle Verification', 'Cap 31 Topic Readiness', Math.abs(engine31.topicReadiness - oracleTopicReadiness) < 0.1, `Readiness diff < 0.1`);

console.log('');

// =========================================================================
// SECTION C: DIVERSE STUDENT PROFILES STRESS TESTING
// =========================================================================
console.log('------------------------------------------------------------------------');
console.log(' SECTION C: DIVERSE STUDENT PROFILES (0, 5, 14, 50 TESTS)               ');
console.log('------------------------------------------------------------------------');

// PROFILE 1: 0 tests, 0 read (Absolute Beginner)
const snap0_0 = buildReadinessSnapshot({
  progressList: [],
  reviewStatsList: [],
  testsList: [],
  now: evalNow,
});
assert('Profile 0 Tests (0 read)', 'Global Readiness is 0', snap0_0.globalReadiness === 0, `globalReadiness = ${snap0_0.globalReadiness}%`);
assert('Profile 0 Tests (0 read)', 'Active Proficiency is 0', snap0_0.activeProficiency === 0, `activeProficiency = ${snap0_0.activeProficiency}%`);
assert('Profile 0 Tests (0 read)', 'Active Retention is 0', snap0_0.activeRetention === 0, `activeRetention = ${snap0_0.activeRetention}%`);
assert('Profile 0 Tests (0 read)', 'Global Confidence is 0', snap0_0.globalConfidence === 0, `globalConfidence = ${snap0_0.globalConfidence}`);
assert('Profile 0 Tests (0 read)', 'Confidence label is estimativa_inicial', snap0_0.confidenceLabel === 'estimativa_inicial', `label = ${snap0_0.confidenceLabel}`);
assert('Profile 0 Tests (0 read)', 'Specialties all not started', snap0_0.specialtyScores.every((s) => !s.isStarted && s.score === 0), 'All 5 specialties score 0 and isStarted false');
assert('Profile 0 Tests (0 read)', 'Recommendation mode is expansion', snap0_0.recommendation.mode === 'expansion', `mode = ${snap0_0.recommendation.mode}`);
assert('Profile 0 Tests (0 read)', 'Daily challenge exists without error', snap0_0.dailyChallenge !== undefined && snap0_0.dailyChallenge.chapterId > 0, `Daily challenge chapter = ${snap0_0.dailyChallenge?.chapterId}`);

// PROFILE 2: 0 tests, 5 read (Read-only student)
const snap0_5read = buildReadinessSnapshot({
  progressList: [
    { chapter_id: 31, is_read: true, read_at: evalNow.toISOString() }, // Read today (t=0, R=100%, P=70%, Ready=74.5%)
    { chapter_id: 32, is_read: true, read_at: evalNow.toISOString() },
    { chapter_id: 8, is_read: true, read_at: evalNow.toISOString() },
    { chapter_id: 41, is_read: true, read_at: evalNow.toISOString() },
    { chapter_id: 45, is_read: true, read_at: evalNow.toISOString() },
  ],
  reviewStatsList: [],
  testsList: [],
  now: evalNow,
});
assert('Profile 0 Tests (5 read)', 'Active Proficiency uses prior 70%', Math.abs(snap0_5read.activePerformance - 70.0) < 0.2, `Active Perf = ${snap0_5read.activePerformance}%`);
assert('Profile 0 Tests (5 read)', 'Active Retention is 100% at t=0', snap0_5read.activeRetention === 100, `Active Ret = ${snap0_5read.activeRetention}%`);
assert('Profile 0 Tests (5 read)', 'Global Readiness scales sublinearly', snap0_5read.globalReadiness > 0 && snap0_5read.globalReadiness < 50, `Global Readiness = ${snap0_5read.globalReadiness}%`);
assert('Profile 0 Tests (5 read)', 'Cardio specialty is started', snap0_5read.specialtyScores.find((s) => s.name === 'Cardiologia')?.isStarted === true, 'Cardiologia started');

// PROFILE 3: 5 tests (Novice test taker)
const snap5 = buildReadinessSnapshot({
  progressList: [
    { chapter_id: 31, is_read: true, read_at: evalNow.toISOString() },
    { chapter_id: 32, is_read: true, read_at: evalNow.toISOString() },
    { chapter_id: 41, is_read: true, read_at: evalNow.toISOString() },
  ],
  reviewStatsList: [
    { chapter_id: 31, times_reviewed: 2, times_correct: 2, times_incorrect: 0, last_reviewed_at: evalNow.toISOString(), next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0 },
    { chapter_id: 32, times_reviewed: 1, times_correct: 1, times_incorrect: 0, last_reviewed_at: evalNow.toISOString(), next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0 },
    { chapter_id: 41, times_reviewed: 2, times_correct: 2, times_incorrect: 0, last_reviewed_at: evalNow.toISOString(), next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0 },
  ],
  testsList: [
    { id: 't1', chapter_ids: [31], mode: 'standard', score: 9.0, completed: true, completed_at: evalNow.toISOString() },
    { id: 't2', chapter_ids: [31], mode: 'standard', score: 8.5, completed: true, completed_at: evalNow.toISOString() },
    { id: 't3', chapter_ids: [32], mode: 'standard', score: 9.5, completed: true, completed_at: evalNow.toISOString() },
    { id: 't4', chapter_ids: [41], mode: 'standard', score: 8.0, completed: true, completed_at: evalNow.toISOString() },
    { id: 't5', chapter_ids: [41], mode: 'standard', score: 8.5, completed: true, completed_at: evalNow.toISOString() },
  ],
  now: evalNow,
});
assert('Profile 5 Tests', 'Active Proficiency reflects high test scores', snap5.activeProficiency >= 80.0, `Active Prof = ${snap5.activeProficiency}%`);
assert('Profile 5 Tests', 'Global Confidence reflects 5 evaluations', snap5.globalConfidence > 0.15 && snap5.globalConfidence < 0.60, `Global Confidence = ${snap5.globalConfidence}`);
assert('Profile 5 Tests', 'Cardio score > 80%', (snap5.specialtyScores.find((s) => s.name === 'Cardiologia')?.score || 0) >= 80, `Cardio score = ${snap5.specialtyScores.find((s) => s.name === 'Cardiologia')?.score}%`);
assert('Profile 5 Tests', 'Trauma score is 0% (unstarted)', snap5.specialtyScores.find((s) => s.name === 'Traumatologia')?.score === 0, 'Trauma score = 0%');

// PROFILE 4: 14 tests (Real-World CSV Dataset)
const snap14 = buildReadinessSnapshot({
  progressList,
  reviewStatsList: statsList,
  testsList,
  chaptersList: allChapters,
  now: evalNow,
});
assert('Profile 14 Tests', 'Active Proficiency >= 78.0%', snap14.activeProficiency >= 78.0, `Active Prof = ${snap14.activeProficiency}%`);
assert('Profile 14 Tests', 'Active Retention >= 85.0%', snap14.activeRetention >= 85.0, `Active Ret = ${snap14.activeRetention}%`);
assert('Profile 14 Tests', 'Global Readiness in Supervision Range (>= 45%)', snap14.globalReadiness >= 45.0, `Global Readiness = ${snap14.globalReadiness}%`);
assert('Profile 14 Tests', 'Status badge is supervisao', snap14.readinessStatus.badgeKey === 'supervisao', `Badge = ${snap14.readinessStatus.badgeKey}`);
assert('Profile 14 Tests', 'Recommendations contains 3 distinct items',
  snap14.recommendations !== undefined &&
  snap14.recommendations.length === 3 &&
  new Set(snap14.recommendations.map((r) => r.recommendedChapterId)).size === 3,
  `Generated 3 unique recommendations: [${snap14.recommendations?.map((r) => r.recommendedChapterId).join(', ')}]`);

// PROFILE 5: 50 tests (Senior / High-Volume User with high scores)
// 40 distinct chapters studied with 50 completed tests
const highVolumeProgList: ChapterProgressItem[] = [];
const highVolumeStatsList: ChapterReviewStatFSRS[] = [];
const highVolumeTestsList: TestRecordItem[] = [];

for (let i = 1; i <= 40; i++) {
  const cap = CHAPTERS_DATA[i - 1];
  if (!cap) continue;
  highVolumeProgList.push({
    chapter_id: cap.id,
    is_read: true,
    read_at: evalNow.toISOString(),
    last_read_at: evalNow.toISOString(),
    read_count: 2,
  });
  highVolumeStatsList.push({
    chapter_id: cap.id,
    times_reviewed: 3,
    times_correct: 3,
    times_incorrect: 0,
    last_reviewed_at: evalNow.toISOString(),
    last_evidence_at: evalNow.toISOString(),
    next_review_at: null,
    ease_factor: 2.8,
    interval_days: 20,
    stability: 20.0,
    difficulty: 3.5,
  });
}

for (let i = 1; i <= 50; i++) {
  const capId = CHAPTERS_DATA[(i - 1) % 40].id;
  highVolumeTestsList.push({
    id: `test-high-${i}`,
    chapter_ids: [capId],
    mode: 'plantao',
    score: 9.5,
    completed: true,
    completed_at: evalNow.toISOString(),
    plantao_data: {
      beds: [{ bedNumber: 1, chapterId: capId, questionIds: [100 + i] }],
    },
    results: {
      [100 + i]: { score: 9.5 },
    },
  });
}

const snap50 = buildReadinessSnapshot({
  progressList: highVolumeProgList,
  reviewStatsList: highVolumeStatsList,
  testsList: highVolumeTestsList,
  now: evalNow,
});

assert('Profile 50 Tests', 'Active Proficiency >= 90.0%', snap50.activeProficiency >= 90.0, `Active Prof = ${snap50.activeProficiency}%`);
assert('Profile 50 Tests', 'Active Retention >= 95.0%', snap50.activeRetention >= 95.0, `Active Ret = ${snap50.activeRetention}%`);
assert('Profile 50 Tests', 'Global Confidence >= 0.90', snap50.globalConfidence >= 0.90, `Global Confidence = ${snap50.globalConfidence}`);
assert('Profile 50 Tests', 'Global Readiness >= 75% (Apto Sala Vermelha)', snap50.globalReadiness >= 75.0, `Global Readiness = ${snap50.globalReadiness}%`);
assert('Profile 50 Tests', 'Readiness Status is APTO', snap50.readinessStatus.badgeKey === 'apto', `Badge = ${snap50.readinessStatus.badgeKey} (${snap50.readinessStatus.label})`);

// PROFILE 6: 50 Failing Tests (Score 0.0/10) - Stress Test Lower Boundary
const failingProgList: ChapterProgressItem[] = [];
const failingTestsList: TestRecordItem[] = [];
for (let i = 1; i <= 20; i++) {
  const cap = CHAPTERS_DATA[i - 1];
  failingProgList.push({ chapter_id: cap.id, is_read: true, read_at: evalNow.toISOString() });
}
for (let i = 1; i <= 50; i++) {
  const capId = CHAPTERS_DATA[(i - 1) % 20].id;
  failingTestsList.push({
    id: `test-fail-${i}`,
    chapter_ids: [capId],
    mode: 'standard',
    score: 0.0,
    completed: true,
    completed_at: evalNow.toISOString(),
  });
}
const snapFail = buildReadinessSnapshot({
  progressList: failingProgList,
  reviewStatsList: [],
  testsList: failingTestsList,
  now: evalNow,
});

assert('Profile Failing Tests', 'Active Proficiency pulled down towards 0%', snapFail.activeProficiency < 35.0, `Active Prof = ${snapFail.activeProficiency}%`);
assert('Profile Failing Tests', 'Global Readiness remains low', snapFail.globalReadiness < 30.0, `Global Readiness = ${snapFail.globalReadiness}%`);
assert('Profile Failing Tests', 'Status is capacitacao', snapFail.readinessStatus.badgeKey === 'capacitacao', `Badge = ${snapFail.readinessStatus.badgeKey}`);
assert('Profile Failing Tests', 'Remediation is primary recommended mode',
  Boolean(snapFail.recommendation.mode === 'remediation' || snapFail.recommendations?.some((r) => r.mode === 'remediation')),
  `Recommended mode = ${snapFail.recommendation.mode}`);

// PROFILE 7: Full Curriculum Mastery (122 chapters read, 122 tests with 10.0)
const masterProgList: ChapterProgressItem[] = CHAPTERS_DATA.map((c) => ({
  chapter_id: c.id,
  is_read: true,
  read_at: evalNow.toISOString(),
  read_count: 5,
}));
const masterStatsList: ChapterReviewStatFSRS[] = CHAPTERS_DATA.map((c) => ({
  chapter_id: c.id,
  times_reviewed: 5,
  times_correct: 5,
  times_incorrect: 0,
  last_reviewed_at: evalNow.toISOString(),
  last_evidence_at: evalNow.toISOString(),
  next_review_at: null,
  ease_factor: 3.5,
  interval_days: 60,
  stability: 60.0,
  difficulty: 2.0,
}));
const masterTestsList: TestRecordItem[] = CHAPTERS_DATA.map((c, i) => ({
  id: `test-master-${i}`,
  chapter_ids: [c.id],
  mode: 'standard',
  score: 10.0,
  completed: true,
  completed_at: evalNow.toISOString(),
}));

const snapMaster = buildReadinessSnapshot({
  progressList: masterProgList,
  reviewStatsList: masterStatsList,
  testsList: masterTestsList,
  now: evalNow,
});

assert('Profile Full Mastery', 'Clinical Coverage is 100%', snapMaster.curricularCoverage.clinicalWeightedPercent === 100, `Coverage = ${snapMaster.curricularCoverage.clinicalWeightedPercent}%`);
assert('Profile Full Mastery', 'Active Proficiency >= 95%', snapMaster.activeProficiency >= 95.0, `Active Prof = ${snapMaster.activeProficiency}%`);
assert('Profile Full Mastery', 'Global Readiness >= 95%', snapMaster.globalReadiness >= 95.0, `Global Readiness = ${snapMaster.globalReadiness}%`);
assert('Profile Full Mastery', 'All 5 Specialties score >= 95%', snapMaster.specialtyScores.every((s) => s.score >= 95), 'All 5 specialty scores >= 95%');

console.log('');

// =========================================================================
// SECTION D: MATHEMATICAL INVARIANTS & FSRS CAP/GROWTH HARNESS
// =========================================================================
console.log('------------------------------------------------------------------------');
console.log(' SECTION D: FSRS FUNCTIONAL & MATHEMATICAL INVARIANTS                   ');
console.log('------------------------------------------------------------------------');

// Invariant 1: Stability 365 cap under consecutive perfect reviews
let statLoop: Partial<ChapterReviewStatFSRS> | null = null;
let currentDay = new Date('2026-01-01T00:00:00Z');
for (let review = 1; review <= 20; review++) {
  statLoop = calculateFSRSUpdate(statLoop, 10.0, currentDay);
  currentDay = new Date(currentDay.getTime() + 1000 * 60 * 60 * 24 * statLoop.interval_days!);
}
assert('FSRS Stability Cap', 'Stability cap respects 365 days max', statLoop!.stability! <= 365.0, `Final stability after 20 perfect reviews = ${statLoop!.stability}d (Cap = 365d)`);
assert('FSRS Stability Growth', 'Stability is >= 100d after 20 reviews', statLoop!.stability! >= 100.0, `Stability = ${statLoop!.stability}d`);

// Invariant 2: calculateFSRSManualReadUpdate stability boost
const readBoost0 = calculateFSRSManualReadUpdate(null, evalNow);
assert('FSRS Manual Read', 'Initial stability is 7.0 * 1.35 = 9.45d', readBoost0.stability === 9.45, `Stability = ${readBoost0.stability}d`);

// Invariant 3: calculateFSRSRereadWithQuiz stability bonus
const quizBoostPass = calculateFSRSRereadWithQuiz(null, 3, 3, evalNow); // 100% pass -> 1.35x
const quizBoostFail = calculateFSRSRereadWithQuiz(null, 1, 3, evalNow); // 33% fail -> 1.10x
assert('FSRS Quiz Re-read', 'Full quiz pass gives 1.35x bonus', quizBoostPass.stability === 9.45, `Pass stability = ${quizBoostPass.stability}d`);
assert('FSRS Quiz Re-read', 'Partial quiz gives 1.10x bonus', quizBoostFail.stability === 7.7, `Fail stability = ${quizBoostFail.stability}d`);

// Invariant 4: Monotonicity of retention over time
const testCaps = deriveAllTopicMetrics({
  progressList: [{ chapter_id: 1, is_read: true, read_at: new Date('2026-08-01T00:00:00Z').toISOString() }],
  reviewStatsList: [{ chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0, last_reviewed_at: new Date('2026-08-01T00:00:00Z').toISOString(), last_evidence_at: new Date('2026-08-01T00:00:00Z').toISOString(), next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0 }],
  testsList: [],
  now: new Date('2026-08-01T00:00:00Z'),
}).get(1)!;

const testCaps10d = deriveAllTopicMetrics({
  progressList: [{ chapter_id: 1, is_read: true, read_at: new Date('2026-08-01T00:00:00Z').toISOString() }],
  reviewStatsList: [{ chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0, last_reviewed_at: new Date('2026-08-01T00:00:00Z').toISOString(), last_evidence_at: new Date('2026-08-01T00:00:00Z').toISOString(), next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0 }],
  testsList: [],
  now: new Date('2026-08-11T00:00:00Z'),
}).get(1)!;

const testCaps30d = deriveAllTopicMetrics({
  progressList: [{ chapter_id: 1, is_read: true, read_at: new Date('2026-08-01T00:00:00Z').toISOString() }],
  reviewStatsList: [{ chapter_id: 1, times_reviewed: 1, times_correct: 1, times_incorrect: 0, last_reviewed_at: new Date('2026-08-01T00:00:00Z').toISOString(), last_evidence_at: new Date('2026-08-01T00:00:00Z').toISOString(), next_review_at: null, ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0 }],
  testsList: [],
  now: new Date('2026-08-31T00:00:00Z'),
}).get(1)!;

assert('Retention Monotonicity', 'R(0d) > R(10d) > R(30d)',
  testCaps.retention > testCaps10d.retention && testCaps10d.retention > testCaps30d.retention,
  `R(0d) = ${testCaps.retention}%, R(10d) = ${testCaps10d.retention}%, R(30d) = ${testCaps30d.retention}%`);

console.log('\n========================================================================');
console.log('                       STRESS HARNESS SUMMARY                           ');
console.log('========================================================================');
const totalTests = testResults.length;
const passedTests = testResults.filter((t) => t.passed).length;
const failedTests = testResults.filter((t) => !t.passed).length;

console.log(`Total Assertions: ${totalTests}`);
console.log(`Passed:           ${passedTests}`);
console.log(`Failed:           ${failedTests}\n`);

if (failedTests === 0) {
  console.log('>>> VERDICT: ALL ADVERSARIAL STRESS TESTS PASSED WITH ZERO ERRORS! <<<\n');
  process.exit(0);
} else {
  console.error('>>> VERDICT: ADVERSARIAL STRESS TESTS FAILED! <<<\n');
  process.exit(1);
}
