import * as fs from 'fs';
import * as path from 'path';
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
import { CHAPTERS_DATA, Chapter } from '../lib/chapters-data';
import { DEFAULT_CHAPTER_WEIGHTS } from '../lib/chapter-weights-data';

// =========================================================================
// ADVERSARIAL STRESS TEST SUITE FOR EMERGEMED FSRS RECALIBRATION
// =========================================================================

let failures = 0;
let passes = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passes++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failures++;
    console.error(`  [FAIL] ${testName} -> ${details || 'Assertion failed'}`);
  }
}

// Copy of parseCSV from validate-retroactive-fsrs.ts for unit testing
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
  const header = rows[0].map((h) => h.trim().replace(/^\uFEFF/, '')); // remove BOM if present
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

console.log('========================================================================');
console.log('          CHALLENGER 2: ADVERSARIAL STRESS TEST & AUDIT SUITE           ');
console.log('========================================================================\n');

// =========================================================================
// SECTION 1: CSV PARSER ADVERSARIAL STRESS TESTING
// =========================================================================
console.log('>>> SECTION 1: CSV Parser Stress Testing');

// 1.1: Empty and whitespace strings
const emptyCsv = '';
const whitespaceCsv = '   \n\n\r\n   ';
assert(parseCSV(emptyCsv).length === 0, 'CSV 1.1: Empty string returns empty array');
assert(parseCSV(whitespaceCsv).length === 0, 'CSV 1.2: Whitespace-only string returns empty array');

// 1.2: Header only
const headerOnlyCsv = 'id,name,score\n';
assert(parseCSV(headerOnlyCsv).length === 0, 'CSV 1.3: Header only returns empty array');

// 1.3: Escaped quotes and commas within quotes
const complexQuotesCsv = 'id,title,json_data\n1,"Choque, Séptico","{""val"": ""foo, bar""}"\n2,"Normal Title","{}"\n';
const parsedQuotes = parseCSV(complexQuotesCsv);
assert(parsedQuotes.length === 2, 'CSV 1.4: Parsed 2 rows with complex quoted fields');
assert(parsedQuotes[0].title === 'Choque, Séptico', 'CSV 1.5: Comma inside quotes preserved');
assert(parsedQuotes[0].json_data === '{"val": "foo, bar"}', 'CSV 1.6: Escaped quotes parsed correctly');

// 1.4: Multiline fields within quotes
const multilineCsv = 'id,description,status\n1,"Line 1\nLine 2\r\nLine 3",active\n2,Single line,pending\n';
const parsedMultiline = parseCSV(multilineCsv);
assert(parsedMultiline.length === 2, 'CSV 1.7: Parsed multiline fields correctly');
assert(parsedMultiline[0].description === 'Line 1\nLine 2\r\nLine 3', 'CSV 1.8: Preserved internal newlines');

// 1.5: UTF-8 BOM Handling
const bomCsv = '\uFEFFid,name\n1,Test\n';
const parsedBom = parseCSV(bomCsv);
assert(parsedBom.length === 1, 'CSV 1.9: Handled UTF-8 BOM gracefully');
assert(parsedBom[0].id === '1', 'CSV 1.10: BOM stripped from header key');

// 1.6: Trailing empty lines and CRLF / LF variations
const mixedLineEndings = 'id,val\r1,A\n2,B\r\n3,C\n\n\r\n';
const parsedMixed = parseCSV(mixedLineEndings);
assert(parsedMixed.length === 3, 'CSV 1.11: Handled CR, LF, CRLF and trailing empty lines', `Got ${parsedMixed.length} rows`);

// 1.7: Missing columns in rows
const jaggedCsv = 'a,b,c\n1,2\n3,4,5,6\n';
const parsedJagged = parseCSV(jaggedCsv);
assert(parsedJagged.length === 2, 'CSV 1.12: Handled jagged columns without crash');
assert(parsedJagged[0].c === '', 'CSV 1.13: Missing column defaults to empty string');
assert(parsedJagged[1].c === '5', 'CSV 1.14: Present column preserved');

console.log('');

// =========================================================================
// SECTION 2: CHAPTER 31 GROUND TRUTH RAW CSV VERIFICATION
// =========================================================================
console.log('>>> SECTION 2: Chapter 31 Ground Truth Raw CSV Verification');

const validationDir = path.resolve('C:/Users/souza/Downloads/Validacao');
const statsCsvPath = path.join(validationDir, 'chapter_review_stats_rows.csv');
const testsCsvPath = path.join(validationDir, 'tests_rows.csv');

if (!fs.existsSync(statsCsvPath) || !fs.existsSync(testsCsvPath)) {
  console.error('CRITICAL: CSV files missing in Downloads folder');
  process.exit(1);
}

const rawStatsText = fs.readFileSync(statsCsvPath, 'utf8');
const rawTestsText = fs.readFileSync(testsCsvPath, 'utf8');

const statsRows = parseCSV(rawStatsText);
const testsRows = parseCSV(rawTestsText);

// Filter Chapter 31 in stats
const cap31StatRow = statsRows.find((r) => r.chapter_id === '31');
assert(!!cap31StatRow, 'Cap 31 Ground Truth 2.1: Found Chapter 31 in chapter_review_stats_rows.csv');
assert(cap31StatRow?.last_reviewed_at === '2026-08-03 13:49:14.559+00', 'Cap 31 Ground Truth 2.2: Stale review timestamp 2026-08-03');

// Find all tests containing Chapter 31
const cap31Tests: Array<{ id: string; completed_at: string; score: number; mode: string; bedAvgScore: number }> = [];

testsRows.forEach((r) => {
  if (r.completed !== 'true' && r.completed !== 't' && r.completed !== '1') return;
  if (!r.completed_at) return;

  let hasCap31 = false;
  let bedScore = 0;

  // Check plantao beds
  if (r.mode === 'plantao' && r.plantao_data) {
    try {
      const pData = JSON.parse(r.plantao_data);
      if (pData.beds && Array.isArray(pData.beds)) {
        const bed = pData.beds.find((b: any) => b.chapterId === 31);
        if (bed) {
          hasCap31 = true;
          const qIds = bed.questionIds || [];
          let sum = 0;
          let cnt = 0;
          let results: any = {};
          try { if (r.results) results = JSON.parse(r.results); } catch {}
          qIds.forEach((qId: any) => {
            const ev = results[qId];
            if (ev && typeof ev.score === 'number') {
              sum += ev.score;
              cnt++;
            }
          });
          bedScore = cnt > 0 ? (sum / cnt) * 10 : (parseFloat(r.score) || 5) * 10;
        }
      }
    } catch {}
  }

  // Check chapter_ids
  if (!hasCap31 && r.chapter_ids) {
    try {
      const cIds = JSON.parse(r.chapter_ids);
      if (Array.isArray(cIds) && cIds.includes(31)) {
        hasCap31 = true;
        bedScore = (parseFloat(r.score) || 5) * 10;
      }
    } catch {
      if (r.chapter_ids.includes('31')) {
        hasCap31 = true;
        bedScore = (parseFloat(r.score) || 5) * 10;
      }
    }
  }

  if (hasCap31) {
    cap31Tests.push({
      id: r.id,
      completed_at: r.completed_at,
      score: parseFloat(r.score) || 0,
      mode: r.mode || 'standard',
      bedAvgScore: bedScore,
    });
  }
});

assert(cap31Tests.length === 5, `Cap 31 Ground Truth 2.3: Found exactly 5 completed tests with Cap 31 (Observed: ${cap31Tests.length})`);

// Sort by completed_at ascending
cap31Tests.sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime());
const latestCap31Test = cap31Tests[cap31Tests.length - 1];
assert(
  latestCap31Test.completed_at.startsWith('2026-08-28 03:25'),
  `Cap 31 Ground Truth 2.4: Latest test completed on 2026-08-28 (Observed: ${latestCap31Test.completed_at})`
);

// Mathematical verification of Cap 31 metrics with evalNow = 2026-08-28T21:44:28Z
const evalNow = new Date('2026-08-28T21:44:28Z');
const evalDateCap31 = new Date(latestCap31Test.completed_at);
const daysSinceCap31 = (evalNow.getTime() - evalDateCap31.getTime()) / (1000 * 60 * 60 * 24);

assert(daysSinceCap31 >= 0.7 && daysSinceCap31 <= 0.85, `Cap 31 Ground Truth 2.5: Days since evidence is ~0.8d (Observed: ${daysSinceCap31.toFixed(3)}d)`);

// FSRS Retention: R = 100 * (1 + (19/81)*(days/7.0))^(-0.5)
const expectedRetCap31 = 100.0 * Math.pow(1.0 + (19.0 / 81.0) * (daysSinceCap31 / 7.0), -0.5);
assert(expectedRetCap31 >= 98.0 && expectedRetCap31 <= 99.5, `Cap 31 Ground Truth 2.6: FSRS Retention R ~ 98.7% (Observed: ${expectedRetCap31.toFixed(2)}%)`);

console.log('');

// =========================================================================
// SECTION 3: DIVERSE STUDENT PROFILES STRESS TESTING
// =========================================================================
console.log('>>> SECTION 3: Diverse Student Profiles Simulation');

// Custom chapters
const customChapters = [
  { id: 1001, number: 1001, title: 'CAD e EHH', sectionNumber: 99, sectionTitle: 'Custom', category: 'Metabólico', isCustom: true, importanceScore: 9.5, frequencyScore: 8.5 },
  { id: 1003, number: 1003, title: 'Sepse', sectionNumber: 99, sectionTitle: 'Custom', category: 'Infectologia', isCustom: true, importanceScore: 10.0, frequencyScore: 9.0 },
  { id: 1004, number: 1004, title: 'AVC', sectionNumber: 99, sectionTitle: 'Custom', category: 'Neurologia', isCustom: true, importanceScore: 9.5, frequencyScore: 8.5 },
];
const allChapters = [...CHAPTERS_DATA, ...customChapters];

// Profile 1: Cold Start (0 tests, 0 reads)
const p1Snapshot = buildReadinessSnapshot({
  progressList: [],
  reviewStatsList: [],
  testsList: [],
  chaptersList: allChapters,
  now: evalNow,
});
assert(p1Snapshot.globalReadiness === 0, 'Profile 1 (Cold Start): Global Readiness is 0%');
assert(p1Snapshot.activeProficiency === 0, 'Profile 1 (Cold Start): Active Proficiency is 0%');
assert(p1Snapshot.curricularCoverage.readCount === 0, 'Profile 1 (Cold Start): Read Count is 0');
assert(p1Snapshot.readinessStatus.badgeKey === 'capacitacao', 'Profile 1 (Cold Start): Badge is Capacitação');
assert(p1Snapshot.specialtyScores.every((s) => !s.isStarted && s.score === 0), 'Profile 1 (Cold Start): All specialties not started with 0 score');
assert(p1Snapshot.recommendation.mode === 'expansion', 'Profile 1 (Cold Start): Recommendation mode is Expansion');

// Profile 2: 5 Reads, 0 Tests
const p2Progress: ChapterProgressItem[] = [3, 7, 8, 31, 45].map((id) => ({
  chapter_id: id,
  is_read: true,
  read_at: evalNow.toISOString(),
  read_count: 1,
  last_read_at: evalNow.toISOString(),
}));
const p2Snapshot = buildReadinessSnapshot({
  progressList: p2Progress,
  reviewStatsList: [],
  testsList: [],
  chaptersList: allChapters,
  now: evalNow,
});
assert(p2Snapshot.activeProficiency === 74.5, `Profile 2 (5 Reads, 0 Tests): Active Proficiency ~ 74.5% (Observed: ${p2Snapshot.activeProficiency}%)`);
assert(p2Snapshot.activeRetention === 100.0, `Profile 2 (5 Reads, 0 Tests): Active Retention is 100% on day 0`);
assert(p2Snapshot.globalReadiness >= 30.0 && p2Snapshot.globalReadiness <= 50.0, `Profile 2 (5 Reads, 0 Tests): Global Readiness sane (${p2Snapshot.globalReadiness}%)`);
assert(p2Snapshot.confidenceLabel === 'estimativa_inicial', 'Profile 2 (5 Reads, 0 Tests): Confidence is Estimativa Inicial (0 tests)');

// Profile 3: 5 Tests (Beginner, avg score 7.5/10)
const p3Tests: TestRecordItem[] = [3, 7, 8, 31, 45].map((id, idx) => ({
  id: `p3-test-${idx}`,
  chapter_ids: [id],
  mode: 'standard',
  score: 7.5,
  completed: true,
  completed_at: evalNow.toISOString(),
}));
const p3Snapshot = buildReadinessSnapshot({
  progressList: p2Progress,
  reviewStatsList: [],
  testsList: p3Tests,
  chaptersList: allChapters,
  now: evalNow,
});
assert(p3Snapshot.activeProficiency >= 72.0 && p3Snapshot.activeProficiency <= 78.0, `Profile 3 (5 Tests): Active Proficiency sane (${p3Snapshot.activeProficiency}%)`);
assert(p3Snapshot.globalConfidence > p2Snapshot.globalConfidence, 'Profile 3 (5 Tests): Confidence increased with tests');

// Profile 4: 14 Tests (Current Real User)
const parsedStatsList: ChapterReviewStatFSRS[] = statsRows.map((r) => ({
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

const parsedTestsList: TestRecordItem[] = testsRows.map((r) => {
  let cIds: number[] = [];
  try { if (r.chapter_ids) cIds = JSON.parse(r.chapter_ids); } catch {}
  let results: any = null;
  try { if (r.results) results = JSON.parse(r.results); } catch {}
  let pData: any = null;
  try { if (r.plantao_data) pData = JSON.parse(r.plantao_data); } catch {}
  return {
    id: r.id,
    chapter_ids: cIds,
    mode: r.mode || null,
    score: r.score ? parseFloat(r.score) : null,
    completed: r.completed === 'true' || r.completed === 't' || r.completed === '1',
    completed_at: r.completed_at || null,
    results,
    plantao_data: pData,
  };
});

// Infer progress for real user
const p4Map = new Map<number, ChapterProgressItem>();
parsedStatsList.forEach((s) => {
  const ts = s.last_reviewed_at || s.last_evidence_at || '2026-08-03T00:00:00Z';
  p4Map.set(s.chapter_id, { chapter_id: s.chapter_id, is_read: true, read_at: ts, read_count: s.times_reviewed || 1, last_read_at: ts });
});
parsedTestsList.forEach((t) => {
  if (!t.completed || !t.completed_at) return;
  const ids = new Set<number>();
  if (t.chapter_ids) t.chapter_ids.forEach((id) => ids.add(id));
  if (t.plantao_data?.beds) t.plantao_data.beds.forEach((b: any) => { if (b.chapterId) ids.add(b.chapterId); });
  ids.forEach((id) => {
    const ex = p4Map.get(id);
    if (!ex) {
      p4Map.set(id, { chapter_id: id, is_read: true, read_at: t.completed_at!, read_count: 1, last_read_at: t.completed_at! });
    } else {
      if (new Date(t.completed_at!) > new Date(ex.last_read_at || '')) ex.last_read_at = t.completed_at!;
      ex.read_count = (ex.read_count ?? 1) + 1;
    }
  });
});
const p4ProgressList = Array.from(p4Map.values());

const p4Snapshot = buildReadinessSnapshot({
  progressList: p4ProgressList,
  reviewStatsList: parsedStatsList,
  testsList: parsedTestsList,
  chaptersList: allChapters,
  now: evalNow,
});

assert(p4Snapshot.totalReadChapters === 15, `Profile 4 (14 Tests): Studied 15 chapters (Observed: ${p4Snapshot.totalReadChapters})`);
assert(p4Snapshot.activeProficiency >= 78.0 && p4Snapshot.activeProficiency <= 80.0, `Profile 4 (14 Tests): Active Proficiency ~78.6% (Observed: ${p4Snapshot.activeProficiency}%)`);
assert(p4Snapshot.globalReadiness >= 45.0 && p4Snapshot.globalReadiness <= 55.0, `Profile 4 (14 Tests): Global Readiness in Supervision range (Observed: ${p4Snapshot.globalReadiness}%)`);
assert(p4Snapshot.readinessStatus.badgeKey === 'supervisao', 'Profile 4 (14 Tests): Badge is Supervisão');

// Profile 5: 50 Tests (High Mastery - 50 chapters read/tested with 9.0/10)
const p5Ids = CHAPTERS_DATA.slice(0, 50).map((c) => c.id);
const p5Progress: ChapterProgressItem[] = p5Ids.map((id) => ({
  chapter_id: id,
  is_read: true,
  read_at: evalNow.toISOString(),
  read_count: 3,
  last_read_at: evalNow.toISOString(),
}));
const p5Stats: ChapterReviewStatFSRS[] = p5Ids.map((id) => ({
  chapter_id: id,
  times_reviewed: 3,
  times_correct: 3,
  times_incorrect: 0,
  last_reviewed_at: evalNow.toISOString(),
  last_evidence_at: evalNow.toISOString(),
  next_review_at: null,
  ease_factor: 2.8,
  interval_days: 21,
  stability: 21.0,
  difficulty: 3.5,
}));
const p5Tests: TestRecordItem[] = p5Ids.map((id, idx) => ({
  id: `p5-test-${idx}`,
  chapter_ids: [id],
  mode: 'standard',
  score: 9.2,
  completed: true,
  completed_at: evalNow.toISOString(),
}));

const p5Snapshot = buildReadinessSnapshot({
  progressList: p5Progress,
  reviewStatsList: p5Stats,
  testsList: p5Tests,
  chaptersList: allChapters,
  now: evalNow,
});
assert(p5Snapshot.activeProficiency >= 85.0, `Profile 5 (50 Tests Mastery): Active Proficiency >= 85% (Observed: ${p5Snapshot.activeProficiency}%)`);
assert(p5Snapshot.globalReadiness >= 75.0, `Profile 5 (50 Tests Mastery): Global Readiness in Apto range >= 75% (Observed: ${p5Snapshot.globalReadiness}%)`);
assert(p5Snapshot.readinessStatus.badgeKey === 'apto', 'Profile 5 (50 Tests Mastery): Badge is Apto');

// Profile 6: Decayed Mastery (50 chapters tested 180 days ago, no recent activity)
const pastDate = new Date(evalNow.getTime() - 180 * 24 * 60 * 60 * 1000);
const p6Progress: ChapterProgressItem[] = p5Ids.map((id) => ({
  chapter_id: id,
  is_read: true,
  read_at: pastDate.toISOString(),
  read_count: 3,
  last_read_at: pastDate.toISOString(),
}));
const p6Stats: ChapterReviewStatFSRS[] = p5Ids.map((id) => ({
  chapter_id: id,
  times_reviewed: 3,
  times_correct: 3,
  times_incorrect: 0,
  last_reviewed_at: pastDate.toISOString(),
  last_evidence_at: pastDate.toISOString(),
  next_review_at: null,
  ease_factor: 2.8,
  interval_days: 21,
  stability: 21.0,
  difficulty: 3.5,
}));
const p6Tests: TestRecordItem[] = p5Ids.map((id, idx) => ({
  id: `p6-test-${idx}`,
  chapter_ids: [id],
  mode: 'standard',
  score: 9.2,
  completed: true,
  completed_at: pastDate.toISOString(),
}));

const p6Snapshot = buildReadinessSnapshot({
  progressList: p6Progress,
  reviewStatsList: p6Stats,
  testsList: p6Tests,
  chaptersList: allChapters,
  now: evalNow,
});
assert(p6Snapshot.activeRetention < 60.0, `Profile 6 (Decayed Mastery): Active Retention decayed to < 60% (Observed: ${p6Snapshot.activeRetention}%)`);
assert(p6Snapshot.activeProficiency > 75.0, `Profile 6 (Decayed Mastery): Clinical performance competence remains resilient (Observed: ${p6Snapshot.activeProficiency}%)`);
assert(p6Snapshot.globalReadiness < p5Snapshot.globalReadiness, `Profile 6 (Decayed Mastery): Global readiness decayed over 180d without practice (${p6Snapshot.globalReadiness}% vs ${p5Snapshot.globalReadiness}%)`);

// Profile 7: Failing Student (50 tests with low scores 2.0-3.5/10)
const p7Tests: TestRecordItem[] = p5Ids.map((id, idx) => ({
  id: `p7-test-${idx}`,
  chapter_ids: [id],
  mode: 'standard',
  score: 2.8,
  completed: true,
  completed_at: evalNow.toISOString(),
}));
const p7Snapshot = buildReadinessSnapshot({
  progressList: p5Progress,
  reviewStatsList: p5Stats,
  testsList: p7Tests,
  chaptersList: allChapters,
  now: evalNow,
});
assert(p7Snapshot.activeProficiency <= 50.0, `Profile 7 (Failing Student): Active Proficiency is low (Observed: ${p7Snapshot.activeProficiency}%)`);
assert(p7Snapshot.readinessStatus.badgeKey === 'capacitacao' || p7Snapshot.readinessStatus.badgeKey === 'supervisao', 'Profile 7 (Failing Student): Not Apto');
assert(Boolean(p7Snapshot.recommendations?.some((r) => r.mode === 'remediation')), 'Profile 7 (Failing Student): Recommends Remediation for struggling topics');

console.log('');

// =========================================================================
// SECTION 4: NUMERICAL BOUNDARIES, EDGE CASES & MONOTONICITY
// =========================================================================
console.log('>>> SECTION 4: Numerical Boundaries & Edge Cases');

// 4.1: Stability clamping and edge values
const statZeroStab: Partial<ChapterReviewStatFSRS> = { stability: 0, interval_days: 0, ease_factor: 0 };
const updateZeroStab = calculateFSRSUpdate(statZeroStab, 8.5, evalNow);
assert(updateZeroStab.stability >= 7.0, `Num 4.1: S=0 clamped to S >= 7.0 (Observed: ${updateZeroStab.stability})`);

const statNegativeStab: Partial<ChapterReviewStatFSRS> = { stability: -10, interval_days: -5 };
const updateNegStab = calculateFSRSUpdate(statNegativeStab, 8.5, evalNow);
assert(updateNegStab.stability >= 7.0, `Num 4.2: S=-10 clamped to S >= 7.0 (Observed: ${updateNegStab.stability})`);

const statMaxStab: Partial<ChapterReviewStatFSRS> = { stability: 360, interval_days: 360, ease_factor: 3.5, difficulty: 1.0 };
const updateMaxStab = calculateFSRSUpdate(statMaxStab, 10.0, evalNow);
assert(updateMaxStab.stability <= 365.0, `Num 4.3: Stability capped at 365.0 days (Observed: ${updateMaxStab.stability})`);

// 4.2: Quiz update edge cases
const quizZero = calculateFSRSRereadWithQuiz(null, 0, 3, evalNow);
assert(quizZero.stability >= 7.0, `Num 4.4: Quiz 0/3 preserves min stability >= 7.0 (Observed: ${quizZero.stability})`);
const quizFull = calculateFSRSRereadWithQuiz({ stability: 10.0 }, 3, 3, evalNow);
assert(quizFull.stability === 13.5, `Num 4.5: Quiz 3/3 applies 1.35x bonus (Observed: ${quizFull.stability})`);

// 4.3: Retention Monotonicity check across 365 days
let prevRetention = 101.0;
let retentionMonotonic = true;
for (let day = 0; day <= 365; day += 5) {
  const checkDate = new Date(evalNow.getTime() + day * 24 * 60 * 60 * 1000);
  const m = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 31, is_read: true, read_at: evalNow.toISOString() }],
    reviewStatsList: [{ chapter_id: 31, times_reviewed: 1, times_correct: 1, times_incorrect: 0, last_reviewed_at: evalNow.toISOString(), last_evidence_at: evalNow.toISOString(), next_review_at: null, ease_factor: 2.5, interval_days: 14, stability: 14.0, difficulty: 5.0 }],
    testsList: [],
    now: checkDate,
  }).get(31)!;

  if (m.retention > prevRetention || isNaN(m.retention) || m.retention < 0 || m.retention > 100) {
    retentionMonotonic = false;
  }
  prevRetention = m.retention;
}
assert(retentionMonotonic, 'Num 4.6: Retention is strictly monotonically decreasing in [0, 100] over 365 days');

// 4.4: Specialty Radar Score Bounds [0, 100] across extreme inputs
const extremeSnapshot = buildReadinessSnapshot({
  progressList: CHAPTERS_DATA.map((c) => ({ chapter_id: c.id, is_read: true, read_at: evalNow.toISOString(), read_count: 10, last_read_at: evalNow.toISOString() })),
  reviewStatsList: CHAPTERS_DATA.map((c) => ({ chapter_id: c.id, times_reviewed: 10, times_correct: 10, times_incorrect: 0, last_reviewed_at: evalNow.toISOString(), next_review_at: null, ease_factor: 3.5, interval_days: 365, stability: 365, difficulty: 1.0 })),
  testsList: CHAPTERS_DATA.map((c, i) => ({ id: `ext-${i}`, chapter_ids: [c.id], score: 10.0, completed: true, completed_at: evalNow.toISOString() })),
  now: evalNow,
});
const radarBounded = extremeSnapshot.specialtyScores.every((s) => s.score >= 0 && s.score <= 100 && !isNaN(s.score));
assert(radarBounded, 'Num 4.7: All specialty scores strictly bounded in [0, 100]');
assert(extremeSnapshot.globalReadiness === 100.0, `Num 4.8: Max theoretical mastery yields 100% Global Readiness (Observed: ${extremeSnapshot.globalReadiness}%)`);

// 4.5: Plantão Bed Selection Constraints
const plantaoBeds = selectPlantaoBedsWithEngine({
  snapshot: p4Snapshot,
  bedCount: 4,
  maxPerSection: 2,
});
assert(plantaoBeds.length === 4, `Num 4.9: Selected exactly 4 beds for Plantão (Observed: ${plantaoBeds.length})`);
const sectionCounts = new Map<number, number>();
plantaoBeds.forEach((b) => {
  const count = (sectionCounts.get(b.metrics.sectionNumber) || 0) + 1;
  sectionCounts.set(b.metrics.sectionNumber, count);
});
const maxSectionObserved = Math.max(...Array.from(sectionCounts.values()));
assert(maxSectionObserved <= 2, `Num 4.10: Max 2 beds per section constraint respected (Observed: ${maxSectionObserved})`);

console.log('========================================================================');
console.log(`TOTAL ADVERSARIAL ASSERTIONS: ${passes + failures} | PASSED: ${passes} | FAILED: ${failures}`);
console.log('========================================================================');

if (failures > 0) {
  process.exit(1);
}
