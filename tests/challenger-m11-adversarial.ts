import { CHAPTERS_DATA, SECTIONS } from '../lib/chapters-data.js';
import { DEFAULT_CHAPTER_WEIGHTS, getChapterWeight } from '../lib/chapter-weights-data.js';
import { getNormalizedClinicalWeights, SPECIALTIES_CONFIG } from '../lib/learning-engine.js';
import { ACHIEVEMENTS } from '../lib/gamification-engine.js';

interface StressResult {
  name: string;
  passed: boolean;
  message: string;
  data?: any;
}

const stressResults: StressResult[] = [];

function check(passed: boolean, name: string, message: string, data?: any) {
  stressResults.push({ name, passed, message, data });
  if (!passed) {
    console.error(`❌ STRESS FAIL: ${name} - ${message}`, data || '');
  }
}

async function runAdversarialStressSuite() {
  console.log('===============================================================');
  console.log('💥 STARTING ADVERSARIAL STRESS SUITE: M11 RESILIENCE & FUZZING');
  console.log('===============================================================\n');

  // -------------------------------------------------------------
  // Stress 1: Gamification Engine Boundary Testing
  // -------------------------------------------------------------
  console.log('▶ Stress 1: Gamification Engine Boundary Testing');
  const allChaptersBadge = ACHIEVEMENTS.find((b) => b.key === 'all_chapters');
  check(
    allChaptersBadge !== undefined && allChaptersBadge.desc.includes('150'),
    'S1.1: Badge Enciclopédia Viva description reflects 150 chapters',
    `Found description: "${allChaptersBadge?.desc}"`
  );

  // Pure logic test of all_chapters unlock threshold:
  const isUnlockedFn = (readCount: number) => readCount >= CHAPTERS_DATA.length;

  check(!isUnlockedFn(0), 'S1.2: 0 chapters read -> all_chapters LOCKED', 'readCount = 0');
  check(!isUnlockedFn(149), 'S1.3: 149 chapters read -> all_chapters LOCKED (off-by-one check)', 'readCount = 149');
  check(isUnlockedFn(150), 'S1.4: 150 chapters read -> all_chapters UNLOCKED', 'readCount = 150');
  check(isUnlockedFn(151), 'S1.5: 151 chapters read -> all_chapters UNLOCKED (overflow check)', 'readCount = 151');

  // -------------------------------------------------------------
  // Stress 2: Fuzzing getChapterWeight() Fallback Behavior
  // -------------------------------------------------------------
  console.log('\n▶ Stress 2: Fuzzing getChapterWeight() Fallback Behavior');
  const adversarialIds = [0, -1, -999, 151, 9999, NaN, Infinity, -Infinity];
  let fallbackHandledGracefully = true;
  for (const aid of adversarialIds) {
    try {
      const res = getChapterWeight(aid as number);
      if (res.frequencyScore !== 5.0 || res.importanceScore !== 5.0 || res.category !== 'Geral') {
        fallbackHandledGracefully = false;
        break;
      }
    } catch {
      fallbackHandledGracefully = false;
      break;
    }
  }
  check(
    fallbackHandledGracefully,
    'S2.1: getChapterWeight() gracefully survives extreme adversarial IDs with standard fallback',
    'survived [0, -1, -999, 151, 9999, NaN, Infinity, -Infinity]'
  );

  // -------------------------------------------------------------
  // Stress 3: Mathematical Invariants of getNormalizedClinicalWeights()
  // -------------------------------------------------------------
  console.log('\n▶ Stress 3: Mathematical Invariants of getNormalizedClinicalWeights()');
  const weightsMap = getNormalizedClinicalWeights();
  check(
    weightsMap.size === 150,
    'S3.1: getNormalizedClinicalWeights() returns exactly 150 entries',
    `Returned size: ${weightsMap.size}`
  );

  let sumNormalized = 0;
  let hasNaNOrInf = false;
  weightsMap.forEach((w) => {
    if (isNaN(w.clinicalWeight) || !isFinite(w.clinicalWeight) || isNaN(w.rawWeight) || !isFinite(w.rawWeight)) {
      hasNaNOrInf = true;
    }
    sumNormalized += w.clinicalWeight;
  });

  check(!hasNaNOrInf, 'S3.2: No NaN or Infinite values in normalized weights', 'Clean finite numbers');
  check(
    Math.abs(sumNormalized - 1.0) < 1e-9,
    'S3.3: Sum of clinicalWeight is exactly 1.0 (within 1e-9 epsilon)',
    `Sum: ${sumNormalized}`
  );

  // -------------------------------------------------------------
  // Stress 4: Specialties Configuration Integrity
  // -------------------------------------------------------------
  console.log('\n▶ Stress 4: Specialties Configuration Integrity');
  let allSpecialtyChapterIdsValid = true;
  const invalidSpecialtyIds: any[] = [];
  const knownChapterIdSet = new Set(CHAPTERS_DATA.map((c) => c.id));

  for (const spec of SPECIALTIES_CONFIG) {
    for (const cid of spec.chapterIds) {
      if (!knownChapterIdSet.has(cid)) {
        allSpecialtyChapterIdsValid = false;
        invalidSpecialtyIds.push({ specialty: spec.name, invalidId: cid });
      }
    }
  }
  check(
    allSpecialtyChapterIdsValid,
    'S4.1: All chapter IDs referenced in SPECIALTIES_CONFIG exist in CHAPTERS_DATA',
    `Invalid references: ${invalidSpecialtyIds.length}`,
    invalidSpecialtyIds
  );

  // -------------------------------------------------------------
  // Stress 5: Section Distribution & Boundary Validation
  // -------------------------------------------------------------
  console.log('\n▶ Stress 5: Section Distribution & Boundary Validation');
  let mainChaptersCount = 0;
  for (let i = 0; i < 20; i++) {
    mainChaptersCount += SECTIONS[i].chapters.length;
  }
  check(
    mainChaptersCount === 122,
    'S5.1: Sections 1 through 20 contain exactly 122 main chapters',
    `Sections 1..20 count: ${mainChaptersCount}`
  );

  const compSection = SECTIONS[20]; // Section 21 (0-indexed 20)
  check(
    compSection &&
      compSection.number === 21 &&
      compSection.title === 'Conteúdo complementar' &&
      compSection.chapters.length === 28,
    'S5.2: Section 21 is "Conteúdo complementar" and contains exactly 28 chapters',
    `Section 21 title: "${compSection?.title}", chapters: ${compSection?.chapters.length}`
  );

  // Ensure every section has at least 1 chapter
  const emptySections = SECTIONS.filter((s) => s.chapters.length === 0);
  check(
    emptySections.length === 0,
    'S5.3: No section is empty (all 21 sections have >= 1 chapter)',
    `Empty sections count: ${emptySections.length}`
  );

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('💥 ADVERSARIAL STRESS TEST SUMMARY');
  console.log('===============================================================');
  const passedCount = stressResults.filter((r) => r.passed).length;
  const failedCount = stressResults.filter((r) => !r.passed).length;
  const totalCount = stressResults.length;

  console.log(`Total Stress Assertions: ${totalCount}`);
  console.log(`Passed:                 ${passedCount}`);
  console.log(`Failed:                 ${failedCount}`);
  console.log(`Pass Rate:              ${((passedCount / totalCount) * 100).toFixed(2)}%`);
  console.log('===============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    console.log('✅ ALL ADVERSARIAL STRESS TESTS COMPLETED WITH 100% SUCCESS!');
    process.exit(0);
  }
}

runAdversarialStressSuite().catch((err) => {
  console.error('Fatal stress error:', err);
  process.exit(1);
});
