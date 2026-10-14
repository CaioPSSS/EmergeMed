/**
 * Empirical Adversarial Challenger 2 Test Suite for Milestone M11
 * Focused on:
 * 1. DEFAULT_CHAPTER_WEIGHTS 150 entries integrity (IDs 1 to 150)
 * 2. getNormalizedClinicalWeights() sum == 1.0 (+/- 0.0001)
 * 3. Choque (Cap. 8) weight > Afogamento (Cap. 106) weight
 * 4. FSRS globalReadiness simulation (15 caps >= 45.0%, 50 caps, 150 caps, monotonicity)
 * 5. Gamification badge "Enciclopédia Viva" (all_chapters) boundary tests (122, 149, 150, 151)
 * 6. Stress tests, mathematical invariants and edge cases
 */

import { DEFAULT_CHAPTER_WEIGHTS, getChapterWeight, ChapterWeight } from '../lib/chapter-weights-data.js';
import { CHAPTERS_DATA, Chapter } from '../lib/chapters-data.js';
import {
  getNormalizedClinicalWeights,
  deriveAllTopicMetrics,
  buildReadinessSnapshot,
  ChapterProgressItem,
  ChapterReviewStatFSRS,
  TestRecordItem
} from '../lib/learning-engine.js';
import {
  ACHIEVEMENTS,
  checkAndAwardAchievements
} from '../lib/gamification-engine.js';
import type { SupabaseClient } from '@supabase/supabase-js';

interface AssertionResult {
  group: string;
  id: string;
  name: string;
  passed: boolean;
  details?: string;
  data?: any;
}

const testResults: AssertionResult[] = [];

function assert(
  group: string,
  id: string,
  name: string,
  condition: boolean,
  details?: string,
  data?: any
) {
  testResults.push({
    group,
    id,
    name,
    passed: condition,
    details,
    data
  });

  const icon = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [${id}] ${name}${details ? ` -> ${details}` : ''}`);
  if (!condition && data !== undefined) {
    console.error('   Failure details:', data);
  }
}

// Mock Supabase Factory for gamification test
function createMockSupabase(params: {
  existingAchievementKeys?: string[];
  readCount: number;
  streak?: number;
  completedTests?: any[];
}): SupabaseClient {
  const existingKeys = params.existingAchievementKeys || [];
  const readProgress = Array.from({ length: params.readCount }, (_, i) => ({
    chapter_id: i + 1,
    is_read: true,
  }));
  const streak = params.streak || 0;
  const completedTests = params.completedTests || [];
  const insertedAchievements: any[] = [];

  const mock = {
    from: (table: string) => {
      const queryBuilder: any = {
        _table: table,
        _filters: {},
        select: (columns: string) => queryBuilder,
        eq: (col: string, val: any) => {
          queryBuilder._filters[col] = val;
          return queryBuilder;
        },
        single: async () => {
          if (table === 'user_gamification_stats') {
            return {
              data: {
                current_streak: streak,
                max_streak: streak,
                total_xp: 500,
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        then: (resolve: any) => {
          if (table === 'user_achievements') {
            resolve({
              data: existingKeys.map((k) => ({ achievement_key: k })),
              error: null,
            });
            return;
          }
          if (table === 'chapter_progress') {
            resolve({
              data: readProgress,
              error: null,
            });
            return;
          }
          if (table === 'user_gamification_stats') {
            resolve({
              data: {
                current_streak: streak,
                max_streak: streak,
                total_xp: 500,
              },
              error: null,
            });
            return;
          }
          if (table === 'tests') {
            resolve({
              data: completedTests,
              error: null,
            });
            return;
          }
          if (table === 'chapter_review_stats') {
            resolve({
              data: [],
              error: null,
            });
            return;
          }
          resolve({ data: [], error: null });
        },
        upsert: async (rows: any[], options?: any) => {
          insertedAchievements.push(...rows);
          return { data: rows, error: null };
        },
      };
      return queryBuilder;
    },
  };

  return mock as unknown as SupabaseClient;
}

export async function runEmpiricalChallengerSuite() {
  console.log('========================================================================');
  console.log('🔬 EMPIRICAL CHALLENGER 2: CLINICAL WEIGHTS & FSRS ENGINE AUDIT (150 CAPS)');
  console.log('========================================================================\n');

  // ==========================================================================
  // GROUP 1: DEFAULT_CHAPTER_WEIGHTS Structural & Domain Integrity (150 Chapters)
  // ==========================================================================
  console.log('--- GROUP 1: DEFAULT_CHAPTER_WEIGHTS Structure & IDs (1..150) ---');

  assert(
    'Group 1',
    'G1.1',
    'DEFAULT_CHAPTER_WEIGHTS contains exactly 150 records',
    DEFAULT_CHAPTER_WEIGHTS.length === 150,
    `Length: ${DEFAULT_CHAPTER_WEIGHTS.length}`
  );

  const weightIds = DEFAULT_CHAPTER_WEIGHTS.map((w) => w.chapterId);
  const uniqueWeightIds = new Set(weightIds);

  assert(
    'Group 1',
    'G1.2',
    'DEFAULT_CHAPTER_WEIGHTS has 150 unique chapter IDs',
    uniqueWeightIds.size === 150,
    `Unique IDs: ${uniqueWeightIds.size}`
  );

  let allIds1To150Present = true;
  const missingIds: number[] = [];
  for (let i = 1; i <= 150; i++) {
    if (!uniqueWeightIds.has(i)) {
      allIds1To150Present = false;
      missingIds.push(i);
    }
  }

  assert(
    'Group 1',
    'G1.3',
    'IDs cover exactly sequence 1 to 150 with zero gaps',
    allIds1To150Present,
    missingIds.length > 0 ? `Missing IDs: ${missingIds.join(', ')}` : 'IDs 1..150 all present'
  );

  let strictlyOrdered = true;
  for (let i = 0; i < DEFAULT_CHAPTER_WEIGHTS.length; i++) {
    if (DEFAULT_CHAPTER_WEIGHTS[i].chapterId !== i + 1) {
      strictlyOrdered = false;
      break;
    }
  }

  assert(
    'Group 1',
    'G1.4',
    'DEFAULT_CHAPTER_WEIGHTS array is sorted strictly 1..150',
    strictlyOrdered,
    strictlyOrdered ? 'Strict order verified' : 'Array is not index-aligned'
  );

  let invalidFreqScore = 0;
  let invalidImpScore = 0;
  let emptyCategoryCount = 0;

  DEFAULT_CHAPTER_WEIGHTS.forEach((w) => {
    if (typeof w.frequencyScore !== 'number' || w.frequencyScore < 1 || w.frequencyScore > 10) {
      invalidFreqScore++;
    }
    if (typeof w.importanceScore !== 'number' || w.importanceScore < 1 || w.importanceScore > 10) {
      invalidImpScore++;
    }
    if (!w.category || typeof w.category !== 'string' || w.category.trim() === '') {
      emptyCategoryCount++;
    }
  });

  assert(
    'Group 1',
    'G1.5',
    'All frequencyScore values in range [1..10]',
    invalidFreqScore === 0,
    `Invalid count: ${invalidFreqScore}`
  );

  assert(
    'Group 1',
    'G1.6',
    'All importanceScore values in range [1..10]',
    invalidImpScore === 0,
    `Invalid count: ${invalidImpScore}`
  );

  assert(
    'Group 1',
    'G1.7',
    'All category fields are non-empty strings',
    emptyCategoryCount === 0,
    `Empty categories count: ${emptyCategoryCount}`
  );

  // Check alignment with CHAPTERS_DATA
  let alignmentDiscrepancies = 0;
  CHAPTERS_DATA.forEach((chap) => {
    const w = DEFAULT_CHAPTER_WEIGHTS.find((dw) => dw.chapterId === chap.id);
    if (!w) {
      alignmentDiscrepancies++;
    } else {
      if (chap.frequencyScore !== undefined && chap.frequencyScore !== w.frequencyScore) {
        alignmentDiscrepancies++;
      }
      if (chap.importanceScore !== undefined && chap.importanceScore !== w.importanceScore) {
        alignmentDiscrepancies++;
      }
    }
  });

  assert(
    'Group 1',
    'G1.8',
    'DEFAULT_CHAPTER_WEIGHTS perfectly mirrors CHAPTERS_DATA frequency and importance scores',
    alignmentDiscrepancies === 0,
    `Discrepancies count: ${alignmentDiscrepancies}`
  );

  // Complementary chapters (123 to 150)
  const complementaryWeights = DEFAULT_CHAPTER_WEIGHTS.filter((w) => w.chapterId >= 123 && w.chapterId <= 150);
  const allComplementaryCategory = complementaryWeights.every((w) => w.category === 'Conteúdo Complementar');

  assert(
    'Group 1',
    'G1.9',
    'Complementary chapters (123..150) count 28 and have category "Conteúdo Complementar"',
    complementaryWeights.length === 28 && allComplementaryCategory,
    `Found ${complementaryWeights.length} complementary weights, all categorized correctly: ${allComplementaryCategory}`
  );

  // getChapterWeight fallback behavior
  const fallbackWeight = getChapterWeight(9999);
  assert(
    'Group 1',
    'G1.10',
    'getChapterWeight(id) safely handles unknown chapterId with fallback',
    fallbackWeight.chapterId === 9999 && fallbackWeight.frequencyScore === 5.0 && fallbackWeight.importanceScore === 5.0,
    `Fallback: Freq=${fallbackWeight.frequencyScore}, Imp=${fallbackWeight.importanceScore}, Cat=${fallbackWeight.category}`
  );

  console.log('');

  // ==========================================================================
  // GROUP 2: Mathematical Invariants of getNormalizedClinicalWeights()
  // ==========================================================================
  console.log('--- GROUP 2: Mathematical Invariants of getNormalizedClinicalWeights() ---');

  const normalizedWeights = getNormalizedClinicalWeights();

  assert(
    'Group 2',
    'G2.1',
    'getNormalizedClinicalWeights() returns map with exactly 150 keys',
    normalizedWeights.size === 150,
    `Map size: ${normalizedWeights.size}`
  );

  let sumClinicalWeight = 0;
  let sumRawWeight = 0;
  let hasNanOrInf = false;
  let minClinicalWeight = Infinity;
  let maxClinicalWeight = -Infinity;

  normalizedWeights.forEach((item, id) => {
    sumClinicalWeight += item.clinicalWeight;
    sumRawWeight += item.rawWeight;
    if (isNaN(item.clinicalWeight) || !isFinite(item.clinicalWeight) ||
        isNaN(item.rawWeight) || !isFinite(item.rawWeight) ||
        isNaN(item.impactNorm) || !isFinite(item.impactNorm) ||
        isNaN(item.frequencyNorm) || !isFinite(item.frequencyNorm)) {
      hasNanOrInf = true;
    }
    if (item.clinicalWeight < minClinicalWeight) minClinicalWeight = item.clinicalWeight;
    if (item.clinicalWeight > maxClinicalWeight) maxClinicalWeight = item.clinicalWeight;
  });

  const sumDelta = Math.abs(sumClinicalWeight - 1.0);
  assert(
    'Group 2',
    'G2.2',
    'Sum of clinicalWeight in getNormalizedClinicalWeights() is exactly 1.0 (+/- 0.0001)',
    sumDelta <= 0.0001,
    `Sum: ${sumClinicalWeight.toFixed(8)}, Delta from 1.0: ${sumDelta.toExponential(4)}`
  );

  assert(
    'Group 2',
    'G2.3',
    'No NaN, Infinity, or non-finite values in normalized weights map',
    !hasNanOrInf,
    `hasNanOrInf: ${hasNanOrInf}`
  );

  assert(
    'Group 2',
    'G2.4',
    'All clinical weights strictly positive (> 0)',
    minClinicalWeight > 0,
    `Min clinical weight: ${minClinicalWeight.toFixed(6)}, Max: ${maxClinicalWeight.toFixed(6)}`
  );

  // Custom subset normalization invariant: sum must always normalize to 1.0
  const subsetChapters = CHAPTERS_DATA.slice(0, 10);
  const subsetWeights = getNormalizedClinicalWeights(subsetChapters);
  let subsetSum = 0;
  subsetWeights.forEach((item) => {
    subsetSum += item.clinicalWeight;
  });
  const subsetDelta = Math.abs(subsetSum - 1.0);

  assert(
    'Group 2',
    'G2.5',
    'Custom chapter subset (10 chapters) renormalizes sum to 1.0 (+/- 0.0001)',
    subsetDelta <= 0.0001,
    `Subset sum: ${subsetSum.toFixed(8)}, Delta: ${subsetDelta.toExponential(4)}`
  );

  console.log('');

  // ==========================================================================
  // GROUP 3: Clinical Hierarchy & Specific Chapters (Choque vs Afogamento)
  // ==========================================================================
  console.log('--- GROUP 3: Clinical Hierarchy: Choque (Cap. 8) vs Afogamento (Cap. 106) ---');

  const cap8Meta = CHAPTERS_DATA.find((c) => c.id === 8);
  const cap106Meta = CHAPTERS_DATA.find((c) => c.id === 106);

  const cap8Weight = normalizedWeights.get(8)!;
  const cap106Weight = normalizedWeights.get(106)!;

  assert(
    'Group 3',
    'G3.1',
    'Chapter 8 is "Choque" and Chapter 106 is "Afogamento"',
    cap8Meta?.title?.toLowerCase().includes('choque') === true &&
    cap106Meta?.title?.toLowerCase().includes('afogamento') === true,
    `Cap 8: "${cap8Meta?.title}", Cap 106: "${cap106Meta?.title}"`
  );

  console.log(`   Choque (Cap. 8):     rawWeight = ${cap8Weight.rawWeight.toFixed(4)}, clinicalWeight = ${cap8Weight.clinicalWeight.toFixed(6)} (Freq: ${cap8Meta?.frequencyScore}, Imp: ${cap8Meta?.importanceScore})`);
  console.log(`   Afogamento (Cap. 106): rawWeight = ${cap106Weight.rawWeight.toFixed(4)}, clinicalWeight = ${cap106Weight.clinicalWeight.toFixed(6)} (Freq: ${cap106Meta?.frequencyScore}, Imp: ${cap106Meta?.importanceScore})`);

  const choqueWeightRatio = cap8Weight.clinicalWeight / cap106Weight.clinicalWeight;

  assert(
    'Group 3',
    'G3.2',
    'Choque (Cap. 8) clinical weight is strictly greater than Afogamento (Cap. 106)',
    cap8Weight.clinicalWeight > cap106Weight.clinicalWeight,
    `Cap 8 (${cap8Weight.clinicalWeight.toFixed(6)}) > Cap 106 (${cap106Weight.clinicalWeight.toFixed(6)}) by factor of ${choqueWeightRatio.toFixed(2)}x`
  );

  assert(
    'Group 3',
    'G3.3',
    'Choque (Cap. 8) raw weight is strictly greater than Afogamento (Cap. 106)',
    cap8Weight.rawWeight > cap106Weight.rawWeight,
    `Cap 8 raw (${cap8Weight.rawWeight.toFixed(4)}) > Cap 106 raw (${cap106Weight.rawWeight.toFixed(4)})`
  );

  // Dynamic threshold comparison
  const defaultMetrics = deriveAllTopicMetrics({ progressList: [], reviewStatsList: [], testsList: [] });
  const cap8Metric = defaultMetrics.get(8)!;
  const cap106Metric = defaultMetrics.get(106)!;

  assert(
    'Group 3',
    'G3.4',
    'Dynamic threshold for Choque (Cap. 8) is strictly higher than Afogamento (Cap. 106)',
    cap8Metric.dynamicThreshold > cap106Metric.dynamicThreshold,
    `Choque threshold: ${cap8Metric.dynamicThreshold}% vs Afogamento threshold: ${cap106Metric.dynamicThreshold}%`
  );

  // Clinical priority hierarchy audit: Emergency Core vs Complementary average weights
  let coreWeightsSum = 0;
  let coreCount = 0;
  let compWeightsSum = 0;
  let compCount = 0;

  CHAPTERS_DATA.forEach((chap) => {
    const w = normalizedWeights.get(chap.id)!;
    if (chap.isEmergencyCore) {
      coreWeightsSum += w.clinicalWeight;
      coreCount++;
    }
    if (chap.isComplementary) {
      compWeightsSum += w.clinicalWeight;
      compCount++;
    }
  });

  const avgCoreWeight = coreWeightsSum / coreCount;
  const avgCompWeight = compWeightsSum / compCount;

  assert(
    'Group 3',
    'G3.5',
    'Average clinical weight of Emergency Core chapters is strictly higher than Complementary chapters',
    avgCoreWeight > avgCompWeight,
    `Avg Core: ${avgCoreWeight.toFixed(6)} vs Avg Comp: ${avgCompWeight.toFixed(6)} (${(avgCoreWeight / avgCompWeight).toFixed(2)}x)`
  );

  console.log('');

  // ==========================================================================
  // GROUP 4: FSRS Learning Engine & globalReadiness Simulation Scenarios
  // ==========================================================================
  console.log('--- GROUP 4: FSRS Learning Engine & globalReadiness Scenarios ---');

  const now = new Date('2026-10-14T12:00:00Z');

  // Scenario 0: 0 chapters read
  const snap0 = buildReadinessSnapshot({
    progressList: [],
    reviewStatsList: [],
    testsList: [],
    now,
  });

  assert(
    'Group 4',
    'G4.1',
    'Scenario 0 (0 chapters read): globalReadiness === 0.0%',
    snap0.globalReadiness === 0,
    `Observed: ${snap0.globalReadiness}%`
  );

  // Scenario A: 15 Core High-Yield Chapters (studied & tested ~8.36/10)
  // Realistic clinical study scenario with 15 core emergency topics:
  // Cap 1 (Abordagem inicial), 2 (Via aérea), 3 (BLS), 4 (SAV), 6 (Insuf resp), 7 (VM), 8 (Choque),
  // 9 (Sepse), 10 (Coma), 31 (IAM com supra), 32 (Fibrilação atrial), 41 (Oclusão arterial),
  // 45 (Derrame pleural), 51 (Dengue), 82 (Distúrbios acidobásicos)
  const core15ChapterIds = [1, 2, 3, 4, 6, 7, 8, 9, 10, 31, 32, 41, 45, 51, 82];

  const progress15 = core15ChapterIds.map((id) => ({
    chapter_id: id,
    is_read: true,
    read_at: now.toISOString(),
    last_read_at: now.toISOString(),
    read_count: 1,
  }));

  const stats15 = core15ChapterIds.map((id) => ({
    chapter_id: id,
    times_reviewed: 1,
    times_correct: 1,
    times_incorrect: 0,
    last_reviewed_at: now.toISOString(),
    last_evidence_at: now.toISOString(),
    next_review_at: null,
    ease_factor: 2.5,
    interval_days: 7,
    stability: 7.0,
    difficulty: 5.0,
  }));

  const tests15 = core15ChapterIds.map((id, idx) => ({
    id: `test-m11-15-${idx}`,
    chapter_ids: [id],
    mode: 'standard',
    score: 8.36,
    completed: true,
    completed_at: now.toISOString(),
  }));

  const snap15 = buildReadinessSnapshot({
    progressList: progress15,
    reviewStatsList: stats15,
    testsList: tests15,
    now,
  });

  console.log(`   Scenario 15 Chapters (Core):`);
  console.log(`     Active Proficiency:  ${snap15.activeProficiency}%`);
  console.log(`     Active Retention:    ${snap15.activeRetention}%`);
  console.log(`     Clinical Coverage:   ${snap15.curricularCoverage.clinicalWeightedPercent}%`);
  console.log(`     Global Readiness:    ${snap15.globalReadiness}% (Target: >= 45.0%)`);
  console.log(`     Readiness Status:    ${snap15.readinessStatus.label}`);

  assert(
    'Group 4',
    'G4.2',
    'Scenario 15 Core Chapters reaches globalReadiness >= 45.0%',
    snap15.globalReadiness >= 45.0,
    `globalReadiness: ${snap15.globalReadiness}% (Expected: >= 45.0%)`
  );

  // Scenario B: 15 Low-Yield / Complementary Chapters (sensitivity check)
  const comp15ChapterIds = [123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137];
  const snap15Comp = buildReadinessSnapshot({
    progressList: comp15ChapterIds.map((id) => ({ chapter_id: id, is_read: true, read_at: now.toISOString(), read_count: 1 })),
    reviewStatsList: comp15ChapterIds.map((id) => ({
      chapter_id: id, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: now.toISOString(), last_evidence_at: now.toISOString(),
      next_review_at: null,
      ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0,
    })),
    testsList: comp15ChapterIds.map((id, idx) => ({
      id: `test-m11-comp15-${idx}`, chapter_ids: [id], mode: 'standard', score: 8.36, completed: true, completed_at: now.toISOString(),
    })),
    now,
  });

  console.log(`   Scenario 15 Chapters (Complementary): Global Readiness = ${snap15Comp.globalReadiness}%, Clinical Coverage = ${snap15Comp.curricularCoverage.clinicalWeightedPercent}%`);

  assert(
    'Group 4',
    'G4.3',
    'Clinical weight sensitivity: 15 Core chapters yield higher readiness than 15 Complementary chapters',
    snap15.globalReadiness > snap15Comp.globalReadiness,
    `Core Readiness: ${snap15.globalReadiness}% vs Comp Readiness: ${snap15Comp.globalReadiness}%`
  );

  // Scenario C: 50 Chapters (first 50 chapters read & tested)
  const ids50 = Array.from({ length: 50 }, (_, i) => i + 1);
  const snap50 = buildReadinessSnapshot({
    progressList: ids50.map((id) => ({ chapter_id: id, is_read: true, read_at: now.toISOString(), read_count: 1 })),
    reviewStatsList: ids50.map((id) => ({
      chapter_id: id, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: now.toISOString(), last_evidence_at: now.toISOString(),
      next_review_at: null,
      ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0,
    })),
    testsList: ids50.map((id, idx) => ({
      id: `test-m11-50-${idx}`, chapter_ids: [id], mode: 'standard', score: 8.5, completed: true, completed_at: now.toISOString(),
    })),
    now,
  });

  console.log(`   Scenario 50 Chapters: Global Readiness = ${snap50.globalReadiness}%, Clinical Coverage = ${snap50.curricularCoverage.clinicalWeightedPercent}%`);

  assert(
    'Group 4',
    'G4.4',
    'Scenario 50 Chapters achieves globalReadiness >= 60.0%',
    snap50.globalReadiness >= 60.0,
    `Observed: ${snap50.globalReadiness}%`
  );

  // Scenario D: 150 Chapters (All 150 chapters mastered with 9.0/10)
  const ids150 = Array.from({ length: 150 }, (_, i) => i + 1);
  const snap150 = buildReadinessSnapshot({
    progressList: ids150.map((id) => ({ chapter_id: id, is_read: true, read_at: now.toISOString(), read_count: 1 })),
    reviewStatsList: ids150.map((id) => ({
      chapter_id: id, times_reviewed: 2, times_correct: 2, times_incorrect: 0,
      last_reviewed_at: now.toISOString(), last_evidence_at: now.toISOString(),
      next_review_at: null,
      ease_factor: 2.5, interval_days: 14, stability: 14.0, difficulty: 4.5,
    })),
    testsList: ids150.map((id, idx) => ({
      id: `test-m11-150-${idx}`, chapter_ids: [id], mode: 'standard', score: 9.0, completed: true, completed_at: now.toISOString(),
    })),
    now,
  });

  console.log(`   Scenario 150 Chapters (Full Curriculum): Global Readiness = ${snap150.globalReadiness}%, Clinical Coverage = ${snap150.curricularCoverage.clinicalWeightedPercent}%`);

  assert(
    'Group 4',
    'G4.5',
    'Scenario 150 Chapters achieves full curriculum readiness >= 85.0%',
    snap150.globalReadiness >= 85.0,
    `Observed: ${snap150.globalReadiness}%, Status: ${snap150.readinessStatus.label}`
  );

  // Monotonicity Invariant: Readiness(15 core) < Readiness(50) < Readiness(150)
  assert(
    'Group 4',
    'G4.6',
    'Strict Monotonicity: globalReadiness scales strictly with curriculum progress (15 < 50 < 150)',
    snap15.globalReadiness < snap50.globalReadiness && snap50.globalReadiness < snap150.globalReadiness,
    `${snap15.globalReadiness}% < ${snap50.globalReadiness}% < ${snap150.globalReadiness}%`
  );

  console.log('');

  // ==========================================================================
  // GROUP 5: Gamification Engine & "Enciclopédia Viva" Badge Unlock Verification
  // ==========================================================================
  console.log('--- GROUP 5: Gamification Engine & "Enciclopédia Viva" Badge ---');

  const enciclopediaBadge = ACHIEVEMENTS.find((a) => a.key === 'all_chapters');

  assert(
    'Group 5',
    'G5.1',
    'ACHIEVEMENTS has "all_chapters" with title "Enciclopédia Viva"',
    enciclopediaBadge !== undefined && enciclopediaBadge.title === 'Enciclopédia Viva',
    `Found: ${enciclopediaBadge?.title}`
  );

  assert(
    'Group 5',
    'G5.2',
    'Enciclopédia Viva description explicitly references "150 capítulos"',
    enciclopediaBadge?.desc.includes('150 capítulos') === true,
    `Description: "${enciclopediaBadge?.desc}"`
  );

  // Boundary 1: readCount = 0
  const mock0 = createMockSupabase({ readCount: 0 });
  const unlocked0 = await checkAndAwardAchievements(mock0, 'user-challenger-0');
  assert(
    'Group 5',
    'G5.3',
    'Boundary readCount = 0: "all_chapters" NOT unlocked',
    !unlocked0.includes('all_chapters'),
    `Newly unlocked: [${unlocked0.join(', ')}]`
  );

  // Boundary 2: readCount = 122 (former 18th edition threshold)
  const mock122 = createMockSupabase({ readCount: 122 });
  const unlocked122 = await checkAndAwardAchievements(mock122, 'user-challenger-122');
  assert(
    'Group 5',
    'G5.4',
    'Boundary readCount = 122 (old 18th ed limit): "all_chapters" NOT unlocked',
    !unlocked122.includes('all_chapters'),
    `Newly unlocked: [${unlocked122.join(', ')}]`
  );

  // Boundary 3: readCount = 149 (immediate predecessor N-1)
  const mock149 = createMockSupabase({ readCount: 149 });
  const unlocked149 = await checkAndAwardAchievements(mock149, 'user-challenger-149');
  assert(
    'Group 5',
    'G5.5',
    'Boundary readCount = 149 (N-1): "all_chapters" NOT unlocked',
    !unlocked149.includes('all_chapters'),
    `Newly unlocked: [${unlocked149.join(', ')}]`
  );

  // Boundary 4: readCount = 150 (exact threshold N)
  const mock150 = createMockSupabase({ readCount: 150 });
  const unlocked150 = await checkAndAwardAchievements(mock150, 'user-challenger-150');
  assert(
    'Group 5',
    'G5.6',
    'Boundary readCount = 150 (N): "all_chapters" IS unlocked',
    unlocked150.includes('all_chapters'),
    `Newly unlocked: [${unlocked150.join(', ')}]`
  );

  // Boundary 5: readCount = 151 (overflow)
  const mock151 = createMockSupabase({ readCount: 151 });
  const unlocked151 = await checkAndAwardAchievements(mock151, 'user-challenger-151');
  assert(
    'Group 5',
    'G5.7',
    'Boundary readCount = 151 (N+1): "all_chapters" IS unlocked',
    unlocked151.includes('all_chapters'),
    `Newly unlocked: [${unlocked151.join(', ')}]`
  );

  // Boundary 6: Already unlocked check (idempotency)
  const mockAlready = createMockSupabase({ readCount: 150, existingAchievementKeys: ['all_chapters'] });
  const unlockedAlready = await checkAndAwardAchievements(mockAlready, 'user-challenger-already');
  assert(
    'Group 5',
    'G5.8',
    'Idempotency: "all_chapters" NOT re-awarded if already in user_achievements',
    !unlockedAlready.includes('all_chapters'),
    `Newly unlocked: [${unlockedAlready.join(', ')}]`
  );

  console.log('');

  // ==========================================================================
  // GROUP 6: Adversarial Stress Tests & Edge Cases
  // ==========================================================================
  console.log('--- GROUP 6: Adversarial Stress Tests & Edge Cases ---');

  // Stress 1: 365 days retention decay test across 150 chapters
  const tOld = new Date('2025-10-14T12:00:00Z');
  const snapDecayed = buildReadinessSnapshot({
    progressList: ids150.map((id) => ({ chapter_id: id, is_read: true, read_at: tOld.toISOString(), read_count: 1 })),
    reviewStatsList: ids150.map((id) => ({
      chapter_id: id, times_reviewed: 1, times_correct: 1, times_incorrect: 0,
      last_reviewed_at: tOld.toISOString(), last_evidence_at: tOld.toISOString(),
      next_review_at: null,
      ease_factor: 2.5, interval_days: 7, stability: 7.0, difficulty: 5.0,
    })),
    testsList: [],
    now,
  });

  console.log(`   Decayed Curriculum (365 days ago): Active Retention = ${snapDecayed.activeRetention}%, Global Readiness = ${snapDecayed.globalReadiness}%`);

  assert(
    'Group 6',
    'G6.1',
    'Severe time decay (365 days) reduces retention and global readiness naturally',
    snapDecayed.activeRetention < 50.0 && snapDecayed.globalReadiness < snap150.globalReadiness,
    `Decayed Retention: ${snapDecayed.activeRetention}%, Decayed Readiness: ${snapDecayed.globalReadiness}% vs Fresh: ${snap150.globalReadiness}%`
  );

  // Stress 2: Bayesian prior stability under extreme scores (0/10 vs 10/10)
  const snapZeroScore = buildReadinessSnapshot({
    progressList: [{ chapter_id: 8, is_read: true, read_at: now.toISOString(), read_count: 1 }],
    reviewStatsList: [],
    testsList: [{ id: 'test-zero', chapter_ids: [8], mode: 'standard', score: 0.0, completed: true, completed_at: now.toISOString() }],
    now,
  });

  const snapPerfectScore = buildReadinessSnapshot({
    progressList: [{ chapter_id: 8, is_read: true, read_at: now.toISOString(), read_count: 1 }],
    reviewStatsList: [],
    testsList: [{ id: 'test-perf', chapter_ids: [8], mode: 'standard', score: 10.0, completed: true, completed_at: now.toISOString() }],
    now,
  });

  assert(
    'Group 6',
    'G6.2',
    'Bayesian smoothing smoothly separates 0 score from 10 score without crashing',
    snapZeroScore.activeProficiency < snapPerfectScore.activeProficiency &&
    snapZeroScore.activeProficiency > 0, // Prior keeps it smoothed above 0
    `Zero Score Active Proficiency: ${snapZeroScore.activeProficiency}% vs Perfect Score: ${snapPerfectScore.activeProficiency}%`
  );

  // Stress 3: Floating point precision check for clinical weights
  let accumulator = 0;
  for (let i = 1; i <= 150; i++) {
    const w = normalizedWeights.get(i)!;
    accumulator += w.clinicalWeight;
  }
  const floatPrecisionDiff = Math.abs(1.0 - accumulator);

  assert(
    'Group 6',
    'G6.3',
    'Accumulated clinical weights float error is below IEEE-754 machine precision tolerance (1e-6)',
    floatPrecisionDiff < 1e-6,
    `Absolute difference: ${floatPrecisionDiff.toExponential(4)}`
  );

  console.log('\n========================================================================');
  console.log('🏁 EMPIRICAL CHALLENGER 2 AUDIT COMPLETE');
  console.log('========================================================================');

  const totalTests = testResults.length;
  const passedTests = testResults.filter((t) => t.passed).length;
  const failedTests = testResults.filter((t) => !t.passed).length;

  console.log(`Total Assertions: ${totalTests}`);
  console.log(`Passed:           ${passedTests}`);
  console.log(`Failed:           ${failedTests}`);

  if (failedTests === 0) {
    console.log('\n🟢 FINAL VERDICT: APPROVE — All 150-chapter weights, FSRS invariants & gamification criteria verified with 100% empirical pass.');
  } else {
    console.error(`\n🔴 FINAL VERDICT: REQUEST_CHANGES — ${failedTests} assertions failed.`);
  }

  return {
    totalTests,
    passedTests,
    failedTests,
    verdict: failedTests === 0 ? 'APPROVE' : 'REQUEST_CHANGES',
    results: testResults,
  };
}

runEmpiricalChallengerSuite().then((outcome) => {
  if (outcome.failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}).catch((err) => {
  console.error('Fatal error in challenger test runner:', err);
  process.exit(1);
});
