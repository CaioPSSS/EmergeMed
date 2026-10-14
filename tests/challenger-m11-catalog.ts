import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CHAPTERS_DATA, SECTIONS } from '../lib/chapters-data.js';
import { DEFAULT_CHAPTER_WEIGHTS, getChapterWeight } from '../lib/chapter-weights-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

interface ComparisonResult {
  passed: boolean;
  testName: string;
  details?: string;
  data?: any;
}

const results: ComparisonResult[] = [];

function assert(condition: boolean, testName: string, details?: string, data?: any) {
  if (condition) {
    results.push({ passed: true, testName, details, data });
  } else {
    results.push({ passed: false, testName, details, data });
    console.error(`❌ FAIL: ${testName} - ${details || ''}`, data || '');
  }
}

async function runEmpiricalCatalogChallenge() {
  console.log('===============================================================');
  console.log('🔬 STARTING EMPIRICAL CHALLENGER SUITE: M11 CATALOG INTEGRITY');
  console.log('===============================================================\n');

  // Load canonical sources
  const chapters19Path = path.join(rootDir, 'scripts', 'chapters_19ed_pages.json');
  const indexCachePath = path.join(rootDir, 'scripts', 'index_cache.json');

  const chapters19Raw = JSON.parse(fs.readFileSync(chapters19Path, 'utf-8'));
  const indexCacheRaw = JSON.parse(fs.readFileSync(indexCachePath, 'utf-8'));

  console.log(`📁 Loaded canonical sources:`);
  console.log(`   - chapters_19ed_pages.json: ${chapters19Raw.length} entries`);
  console.log(`   - index_cache.json: ${Object.keys(indexCacheRaw).length} entries\n`);

  // -------------------------------------------------------------
  // Test Group 1: CHAPTERS_DATA Quantity and ID Sequence
  // -------------------------------------------------------------
  console.log('▶ Test Group 1: CHAPTERS_DATA Quantity and ID Sequence');
  assert(
    CHAPTERS_DATA.length === 150,
    'T1.1: Exactly 150 chapters in CHAPTERS_DATA',
    `Found ${CHAPTERS_DATA.length} chapters`
  );

  const ids = CHAPTERS_DATA.map((c) => c.id);
  const uniqueIds = new Set(ids);
  assert(
    uniqueIds.size === 150,
    'T1.2: All chapter IDs are unique',
    `Unique IDs count: ${uniqueIds.size}`
  );

  let idSeqValid = true;
  for (let i = 1; i <= 150; i++) {
    if (!uniqueIds.has(i)) {
      idSeqValid = false;
      break;
    }
  }
  assert(
    idSeqValid,
    'T1.3: Chapter IDs form continuous sequence from 1 to 150 without gaps',
    'IDs 1..150 continuous'
  );

  let idEqualsIndex = true;
  for (let i = 0; i < CHAPTERS_DATA.length; i++) {
    if (CHAPTERS_DATA[i].id !== i + 1 || CHAPTERS_DATA[i].number !== i + 1) {
      idEqualsIndex = false;
      break;
    }
  }
  assert(
    idEqualsIndex,
    'T1.4: CHAPTERS_DATA array index matches id and number (1-based)',
    'Array index corresponds to id'
  );

  // -------------------------------------------------------------
  // Test Group 2: SECTIONS Integrity and Structure
  // -------------------------------------------------------------
  console.log('\n▶ Test Group 2: SECTIONS Integrity and Chapter Mapping');
  assert(
    SECTIONS.length === 21,
    'T2.1: Exactly 21 sections in SECTIONS',
    `Found ${SECTIONS.length} sections`
  );

  const sectionTitles = new Set(SECTIONS.map((s) => s.title));
  assert(
    sectionTitles.size === 21,
    'T2.2: All 21 section titles are distinct',
    `Unique section titles count: ${sectionTitles.size}`
  );

  const sectionNumbers = SECTIONS.map((s) => s.number);
  const validSecNums = sectionNumbers.every((n, idx) => n === idx + 1);
  assert(
    validSecNums,
    'T2.3: Section numbers are strictly sequential from 1 to 21',
    `Sections: 1..21`
  );

  let allChaptersMappedToValidSection = true;
  let invalidChapterSectionList: any[] = [];
  for (const chap of CHAPTERS_DATA) {
    const sec = SECTIONS.find((s) => s.number === chap.sectionNumber);
    if (!sec || sec.title !== chap.sectionTitle || chap.section !== chap.sectionTitle) {
      allChaptersMappedToValidSection = false;
      invalidChapterSectionList.push({
        id: chap.id,
        chapSecNum: chap.sectionNumber,
        chapSecTitle: chap.sectionTitle,
        chapSection: chap.section,
        foundSec: sec ? sec.title : null,
      });
    }
  }
  assert(
    allChaptersMappedToValidSection,
    'T2.4: All 150 chapters belong to a valid section with matching titles',
    `Mismatches: ${invalidChapterSectionList.length}`,
    invalidChapterSectionList.slice(0, 5)
  );

  // Check section aggregation: do the chapters in SECTIONS[i].chapters match CHAPTERS_DATA?
  let totalSectionChapters = 0;
  const sectionChapterIds: number[] = [];
  for (const sec of SECTIONS) {
    totalSectionChapters += sec.chapters.length;
    for (const c of sec.chapters) {
      sectionChapterIds.push(c.id);
    }
  }
  assert(
    totalSectionChapters === 150,
    'T2.5: Total chapters inside SECTIONS array is exactly 150',
    `Found ${totalSectionChapters} chapters across sections`
  );

  const uniqueSecChapIds = new Set(sectionChapterIds);
  assert(
    uniqueSecChapIds.size === 150,
    'T2.6: No duplicate or missing chapters across sections in SECTIONS',
    `Found ${uniqueSecChapIds.size} unique chapter IDs in sections`
  );

  // -------------------------------------------------------------
  // Test Group 3: Deep Comparison against Canonical Sources
  // -------------------------------------------------------------
  console.log('\n▶ Test Group 3: Deep Comparison against Canonical Sources (19ed_pages & index_cache)');
  let titleMatchesPagesJson = 0;
  let pageMatchesPagesJson = 0;
  let titleMatchesIndexCache = 0;
  let pageMatchesIndexCache = 0;
  let wordCountMatchesIndexCache = 0;

  const titleDiscrepancies: any[] = [];
  const pageDiscrepancies: any[] = [];
  const wordCountDiscrepancies: any[] = [];

  for (let i = 0; i < 150; i++) {
    const chap = CHAPTERS_DATA[i];
    const canonPages = chapters19Raw[i];
    const canonCache = indexCacheRaw[String(i + 1)];

    // Check against chapters_19ed_pages.json
    if (chap.title === canonPages.title) {
      titleMatchesPagesJson++;
    } else {
      titleDiscrepancies.push({
        id: chap.id,
        target: 'chapters_19ed_pages.json',
        expected: canonPages.title,
        actual: chap.title,
      });
    }

    if (
      chap.startPage === canonPages.startPage &&
      chap.endPage === canonPages.endPage &&
      chap.pageCount === canonPages.pageCount
    ) {
      pageMatchesPagesJson++;
    } else {
      pageDiscrepancies.push({
        id: chap.id,
        target: 'chapters_19ed_pages.json',
        expected: { start: canonPages.startPage, end: canonPages.endPage, count: canonPages.pageCount },
        actual: { start: chap.startPage, end: chap.endPage, count: chap.pageCount },
      });
    }

    // Check against index_cache.json
    if (canonCache) {
      if (chap.title === canonCache.title) {
        titleMatchesIndexCache++;
      } else {
        titleDiscrepancies.push({
          id: chap.id,
          target: 'index_cache.json',
          expected: canonCache.title,
          actual: chap.title,
        });
      }

      if (
        chap.startPage === canonCache.startPage &&
        chap.endPage === canonCache.endPage &&
        chap.pageCount === canonCache.pageCount
      ) {
        pageMatchesIndexCache++;
      }

      if (chap.wordCount === canonCache.word_count) {
        wordCountMatchesIndexCache++;
      } else {
        wordCountDiscrepancies.push({
          id: chap.id,
          expected: canonCache.word_count,
          actual: chap.wordCount,
        });
      }
    }
  }

  assert(
    titleMatchesPagesJson === 150,
    'T3.1: All 150 titles match chapters_19ed_pages.json exactly (150/150)',
    `Matches: ${titleMatchesPagesJson}/150`,
    titleDiscrepancies.slice(0, 5)
  );

  assert(
    pageMatchesPagesJson === 150,
    'T3.2: All 150 startPage/endPage/pageCount match chapters_19ed_pages.json exactly (150/150)',
    `Matches: ${pageMatchesPagesJson}/150`,
    pageDiscrepancies.slice(0, 5)
  );

  assert(
    titleMatchesIndexCache === 150,
    'T3.3: All 150 titles match index_cache.json exactly (150/150)',
    `Matches: ${titleMatchesIndexCache}/150`
  );

  assert(
    pageMatchesIndexCache === 150,
    'T3.4: All 150 pagination tuples match index_cache.json exactly (150/150)',
    `Matches: ${pageMatchesIndexCache}/150`
  );

  assert(
    wordCountMatchesIndexCache === 150,
    'T3.5: All 150 wordCounts match index_cache.json exactly (150/150)',
    `Matches: ${wordCountMatchesIndexCache}/150`,
    wordCountDiscrepancies.slice(0, 5)
  );

  // -------------------------------------------------------------
  // Test Group 4: Specific Spot-Checks & Complementary Chapters
  // -------------------------------------------------------------
  console.log('\n▶ Test Group 4: Specific Spot-Checks & Complementary Chapters');

  // Cap. 11
  const cap11 = CHAPTERS_DATA[10];
  assert(
    cap11 &&
      cap11.id === 11 &&
      cap11.title === 'Medicina Aeroespacial – história, fisiologia e doenças relacionadas à altitude' &&
      cap11.startPage === 242 &&
      cap11.endPage === 249 &&
      cap11.pageCount === 8,
    'T4.1: Cap. 11 is Medicina Aeroespacial with correct pages (pp. 242-249)',
    JSON.stringify(cap11)
  );

  // Cap. 79
  const cap79 = CHAPTERS_DATA[78];
  assert(
    cap79 &&
      cap79.id === 79 &&
      cap79.title === 'Apendicite aguda' &&
      cap79.startPage === 1100 &&
      cap79.endPage === 1105 &&
      cap79.pageCount === 6,
    'T4.2: Cap. 79 is Apendicite aguda with correct pages (pp. 1100-1105)',
    JSON.stringify(cap79)
  );

  // Cap. 99
  const cap99 = CHAPTERS_DATA[98];
  assert(
    cap99 &&
      cap99.id === 99 &&
      cap99.title === 'Tromboelastografia na avaliação do paciente com sangramento' &&
      cap99.startPage === 1314 &&
      cap99.endPage === 1321 &&
      cap99.pageCount === 8,
    'T4.3: Cap. 99 is Tromboelastografia with correct pages (pp. 1314-1321)',
    JSON.stringify(cap99)
  );

  // Cap. 120, 121, 122
  const cap120 = CHAPTERS_DATA[119];
  const cap121 = CHAPTERS_DATA[120];
  const cap122 = CHAPTERS_DATA[121];
  assert(
    cap120.title === 'Marca-passo e dispositivos implantáveis no departamento de emergência' &&
      cap120.startPage === 1657 &&
      cap120.endPage === 1666,
    'T4.4: Cap. 120 is Marca-passo (pp. 1657-1666)',
    cap120.title
  );
  assert(
    cap121.title === 'Acessos vasculares' && cap121.startPage === 1667 && cap121.endPage === 1683,
    'T4.5: Cap. 121 is Acessos vasculares (pp. 1667-1683)',
    cap121.title
  );
  assert(
    cap122.title === 'Toracocentese e drenagem pleural' && cap122.startPage === 1684 && cap122.endPage === 1694,
    'T4.6: Cap. 122 is Toracocentese e drenagem pleural (pp. 1684-1694)',
    cap122.title
  );

  // Cap. 123 to 150 Complementary checks
  let complementaryAllValid = true;
  const complementaryIssues: any[] = [];
  for (let id = 123; id <= 150; id++) {
    const c = CHAPTERS_DATA[id - 1];
    const isComp = c.isComplementary === true;
    const isCore = c.isEmergencyCore === false;
    const isSecComp = c.section === 'Conteúdo complementar' && c.sectionTitle === 'Conteúdo complementar';
    const isSec21 = c.sectionNumber === 21;
    const chapNumExpected = id - 122;
    const hasChapNum = c.chapterNumber === chapNumExpected;

    if (!isComp || !isCore || !isSecComp || !isSec21 || !hasChapNum) {
      complementaryAllValid = false;
      complementaryIssues.push({
        id,
        isComp,
        isCore,
        section: c.section,
        sectionNumber: c.sectionNumber,
        chapterNumber: c.chapterNumber,
        expectedChapterNumber: chapNumExpected,
      });
    }
  }
  assert(
    complementaryAllValid,
    'T4.7: Chapters 123 to 150 all have isComplementary=true, isEmergencyCore=false, section="Conteúdo complementar", sectionNumber=21, and chapterNumber 1..28',
    `Issues: ${complementaryIssues.length}`,
    complementaryIssues
  );

  // Main chapters 1 to 122: verify isComplementary=false and isEmergencyCore=true
  let mainChaptersAllValid = true;
  for (let id = 1; id <= 122; id++) {
    const c = CHAPTERS_DATA[id - 1];
    if (c.isComplementary !== false || c.isEmergencyCore !== true || c.chapterNumber !== id) {
      mainChaptersAllValid = false;
      break;
    }
  }
  assert(
    mainChaptersAllValid,
    'T4.8: Chapters 1 to 122 all have isComplementary=false, isEmergencyCore=true, and chapterNumber 1..122',
    'Main chapters validated'
  );

  // -------------------------------------------------------------
  // Test Group 5: DEFAULT_CHAPTER_WEIGHTS Rigorous Verification
  // -------------------------------------------------------------
  console.log('\n▶ Test Group 5: DEFAULT_CHAPTER_WEIGHTS Rigorous Verification');
  assert(
    DEFAULT_CHAPTER_WEIGHTS.length === 150,
    'T5.1: Exactly 150 weights in DEFAULT_CHAPTER_WEIGHTS',
    `Found ${DEFAULT_CHAPTER_WEIGHTS.length} weights`
  );

  const weightIds = DEFAULT_CHAPTER_WEIGHTS.map((w) => w.chapterId);
  const uniqueWeightIds = new Set(weightIds);
  assert(
    uniqueWeightIds.size === 150,
    'T5.2: All weight chapterIds are unique',
    `Unique weight chapterIds count: ${uniqueWeightIds.size}`
  );

  let weightSeqValid = true;
  for (let i = 1; i <= 150; i++) {
    if (!uniqueWeightIds.has(i)) {
      weightSeqValid = false;
      break;
    }
  }
  assert(
    weightSeqValid,
    'T5.3: Weight chapterIds form continuous sequence 1..150',
    'Continuous 1..150'
  );

  let scoresInRange = true;
  const invalidScores: any[] = [];
  for (const w of DEFAULT_CHAPTER_WEIGHTS) {
    if (
      typeof w.frequencyScore !== 'number' ||
      w.frequencyScore < 1 ||
      w.frequencyScore > 10 ||
      typeof w.importanceScore !== 'number' ||
      w.importanceScore < 1 ||
      w.importanceScore > 10 ||
      !w.category
    ) {
      scoresInRange = false;
      invalidScores.push(w);
    }
  }
  assert(
    scoresInRange,
    'T5.4: All frequencyScore and importanceScore are integers/numbers in range [1, 10]',
    `Invalid scores count: ${invalidScores.length}`,
    invalidScores
  );

  // Cross-consistency: CHAPTERS_DATA vs DEFAULT_CHAPTER_WEIGHTS
  let weightsCatalogConsistent = true;
  const consistencyMismatches: any[] = [];
  for (let i = 0; i < 150; i++) {
    const chap = CHAPTERS_DATA[i];
    const weight = DEFAULT_CHAPTER_WEIGHTS[i];
    if (
      chap.id !== weight.chapterId ||
      chap.frequencyScore !== weight.frequencyScore ||
      chap.importanceScore !== weight.importanceScore ||
      chap.category !== weight.category
    ) {
      weightsCatalogConsistent = false;
      consistencyMismatches.push({
        id: chap.id,
        chap: { freq: chap.frequencyScore, imp: chap.importanceScore, cat: chap.category },
        weight: { freq: weight.frequencyScore, imp: weight.importanceScore, cat: weight.category },
      });
    }
  }
  assert(
    weightsCatalogConsistent,
    'T5.5: CHAPTERS_DATA scores and categories match DEFAULT_CHAPTER_WEIGHTS 100%',
    `Mismatches: ${consistencyMismatches.length}`,
    consistencyMismatches.slice(0, 5)
  );

  // getChapterWeight fallback function test
  const testW1 = getChapterWeight(1);
  const testW150 = getChapterWeight(150);
  const testW999 = getChapterWeight(999);
  assert(
    testW1.chapterId === 1 && testW150.chapterId === 150 && testW999.frequencyScore === 5.0,
    'T5.6: getChapterWeight() correctly resolves existing IDs and default fallback',
    `Fallback test: ${JSON.stringify(testW999)}`
  );

  // -------------------------------------------------------------
  // Test Group 6: Pagination and Mathematical Geometry
  // -------------------------------------------------------------
  console.log('\n▶ Test Group 6: Pagination and Mathematical Geometry');
  let validGeometry = true;
  const geometryViolations: any[] = [];
  for (const c of CHAPTERS_DATA) {
    if (
      !c.startPage ||
      !c.endPage ||
      !c.pageCount ||
      c.startPage <= 0 ||
      c.endPage < c.startPage ||
      c.endPage - c.startPage + 1 !== c.pageCount
    ) {
      validGeometry = false;
      geometryViolations.push({
        id: c.id,
        startPage: c.startPage,
        endPage: c.endPage,
        pageCount: c.pageCount,
        expectedCount: (c.endPage || 0) - (c.startPage || 0) + 1,
      });
    }
  }
  assert(
    validGeometry,
    'T6.1: All 150 chapters satisfy startPage > 0, endPage >= startPage, and pageCount === endPage - startPage + 1',
    `Violations: ${geometryViolations.length}`,
    geometryViolations
  );

  // Book boundaries and monotonicity
  // Main book: Cap 1 (p. 78) to Cap 122 (p. 1694)
  // Complementary: Cap 123 (p. 1695) to Cap 150 (p. 1973)
  const cap1 = CHAPTERS_DATA[0];
  const cap122_item = CHAPTERS_DATA[121];
  const cap123_item = CHAPTERS_DATA[122];
  const cap150_item = CHAPTERS_DATA[149];
  assert(
    cap1.startPage === 78 &&
      cap122_item.endPage === 1694 &&
      cap123_item.startPage === 1695 &&
      cap150_item.endPage === 1973,
    'T6.2: Global book pagination continuity: Main (78..1694) and Complementary (1695..1973)',
    `Main: ${cap1.startPage}..${cap122_item.endPage}, Comp: ${cap123_item.startPage}..${cap150_item.endPage}`
  );

  let strictlyMonotonic = true;
  for (let i = 1; i < CHAPTERS_DATA.length; i++) {
    const prev = CHAPTERS_DATA[i - 1];
    const curr = CHAPTERS_DATA[i];
    // Start page of current chapter should be >= end page of previous chapter or right next page
    if (curr.startPage! < prev.startPage!) {
      strictlyMonotonic = false;
      break;
    }
  }
  assert(
    strictlyMonotonic,
    'T6.3: startPage is strictly non-decreasing across all 150 chapters',
    'startPage[i] >= startPage[i-1]'
  );

  // -------------------------------------------------------------
  // Test Group 7: Prerequisites Graph Integrity
  // -------------------------------------------------------------
  console.log('\n▶ Test Group 7: Prerequisites Graph Integrity');
  let prereqsValid = true;
  const invalidPrereqs: any[] = [];
  for (const c of CHAPTERS_DATA) {
    if (c.prerequisites && c.prerequisites.length > 0) {
      for (const p of c.prerequisites) {
        if (p < 1 || p > 150 || p === c.id) {
          prereqsValid = false;
          invalidPrereqs.push({ chapterId: c.id, invalidPrereq: p });
        }
      }
    }
  }
  assert(
    prereqsValid,
    'T7.1: All prerequisites point to valid, non-self chapter IDs (1..150)',
    `Invalid prereqs: ${invalidPrereqs.length}`,
    invalidPrereqs
  );

  // -------------------------------------------------------------
  // Summary & Metrics Output
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('📊 EMPIRICAL VERIFICATION SUMMARY');
  console.log('===============================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  const totalCount = results.length;

  console.log(`Total Assertions Checked: ${totalCount}`);
  console.log(`Assertions Passed:        ${passedCount}`);
  console.log(`Assertions Failed:        ${failedCount}`);
  console.log(`Overall Pass Rate:        ${((passedCount / totalCount) * 100).toFixed(2)}%`);
  console.log('===============================================================\n');

  if (failedCount > 0) {
    console.error('❌ DISCREPANCIES DETECTED:');
    for (const failure of results.filter((r) => !r.passed)) {
      console.error(`- ${failure.testName}: ${failure.details}`);
    }
    process.exit(1);
  } else {
    console.log('✅ ALL EMPIRICAL CHALLENGES PASSED PERFECTLY!');
    process.exit(0);
  }
}

runEmpiricalCatalogChallenge().catch((err) => {
  console.error('Unexpected error running challenger test:', err);
  process.exit(1);
});
