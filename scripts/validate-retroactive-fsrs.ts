import * as fs from 'fs';
import * as path from 'path';
import {
  deriveAllTopicMetrics,
  buildReadinessSnapshot,
  ChapterProgressItem,
  ChapterReviewStatFSRS,
  TestRecordItem,
} from '../lib/learning-engine';
import { CHAPTERS_DATA } from '../lib/chapters-data';
import { DEFAULT_CHAPTER_WEIGHTS } from '../lib/chapter-weights-data';

// ==========================================
// 1. RFC 4180 Safe CSV Parser
// ==========================================
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

// ==========================================
// 2. Main Validation Script
// ==========================================
async function runValidation() {
  console.log('========================================================================');
  console.log('       EMERGEMED FSRS RECALIBRATION: RETROACTIVE DATA VALIDATION        ');
  console.log('========================================================================\n');

  const validationDir = path.resolve('C:/Users/souza/Downloads/Validacao');
  const statsCsvPath = path.join(validationDir, 'chapter_review_stats_rows.csv');
  const testsCsvPath = path.join(validationDir, 'tests_rows.csv');

  if (!fs.existsSync(statsCsvPath) || !fs.existsSync(testsCsvPath)) {
    console.error(`ERROR: Validation files not found in ${validationDir}`);
    process.exit(1);
  }

  console.log(`Loading real dataset:`);
  console.log(`  - Stats CSV: ${statsCsvPath}`);
  console.log(`  - Tests CSV: ${testsCsvPath}\n`);

  const statsRaw = fs.readFileSync(statsCsvPath, 'utf8');
  const testsRaw = fs.readFileSync(testsCsvPath, 'utf8');

  const statsRows = parseCSV(statsRaw);
  const testsRows = parseCSV(testsRaw);

  console.log(`Parsed ${statsRows.length} rows from chapter_review_stats_rows.csv`);
  console.log(`Parsed ${testsRows.length} rows from tests_rows.csv\n`);

  // Adapter: chapter_review_stats
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

  // Adapter: tests
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

  const completedTests = testsList.filter((t) => t.completed && t.score !== null);
  const totalCompletedTests = completedTests.length;
  const sumScores = completedTests.reduce((acc, t) => acc + (t.score || 0), 0);
  const avgTestScore = totalCompletedTests > 0 ? sumScores / totalCompletedTests : 0;

  console.log(`========================================================================`);
  console.log(`                       STUDENT TEST HISTORY SUMMARY                      `);
  console.log(`========================================================================`);
  console.log(`Total Tests: ${testsList.length} (${totalCompletedTests} completed, ${testsList.length - totalCompletedTests} in progress)`);
  console.log(`Average Test Score: ${avgTestScore.toFixed(2)} / 10.00 (${(avgTestScore * 10).toFixed(1)}%)\n`);

  console.log(`Completed Tests Breakdown:`);
  completedTests.forEach((t, idx) => {
    console.log(`  #${(idx + 1).toString().padStart(2, ' ')} | Date: ${t.completed_at?.substring(0, 16)} | Mode: ${t.mode?.padEnd(8, ' ')} | Score: ${t.score?.toFixed(2)}/10 | Chapters: [${t.chapter_ids.join(', ')}]`);
  });
  console.log('');

  // Infer user chapter progress
  const progressMap = new Map<number, { is_read: boolean; read_at: string; read_count: number; last_read_at: string }>();

  statsList.forEach((s) => {
    const ts = s.last_reviewed_at || s.last_evidence_at || new Date('2026-08-03T00:00:00Z').toISOString();
    progressMap.set(s.chapter_id, {
      is_read: true,
      read_at: ts,
      read_count: s.times_reviewed || 1,
      last_read_at: ts,
    });
  });

  testsList.forEach((t) => {
    if (!t.completed || !t.completed_at) return;
    const cIds = new Set<number>();
    if (t.chapter_ids) t.chapter_ids.forEach((id) => cIds.add(id));
    if (t.plantao_data?.beds) {
      t.plantao_data.beds.forEach((b: any) => { if (b.chapterId) cIds.add(b.chapterId); });
    }

    cIds.forEach((id) => {
      const existing = progressMap.get(id);
      if (!existing) {
        progressMap.set(id, {
          is_read: true,
          read_at: t.completed_at!,
          read_count: 1,
          last_read_at: t.completed_at!,
        });
      } else {
        if (new Date(t.completed_at!) > new Date(existing.last_read_at)) {
          existing.last_read_at = t.completed_at!;
        }
        if (new Date(t.completed_at!) < new Date(existing.read_at)) {
          existing.read_at = t.completed_at!;
        }
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

  // Evaluation timestamp: current real evaluation time or reference time
  const evalNow = new Date('2026-08-28T21:44:28Z');

  // ==========================================
  // 3. Baseline Simulation (Legacy Engine)
  // ==========================================
  // Simulates the legacy uncalibrated formulas:
  // - Half-life R = 100 * 2^(-t/S)
  // - Static DB timestamp (ignores testsList completed_at)
  // - Bayesian m = 3.0, prior = 50.0
  // - Topic Readiness = 0.60 * P + 0.40 * R
  // - Linear Global Readiness = (0.65*P + 0.35*R) * (0.20 + 0.80 * coverage)

  const baselineResults = new Map<number, {
    daysSince: number;
    stability: number;
    retention: number;
    performance: number;
    topicReadiness: number;
  }>();

  // Legacy test evidence without completed_at sync
  const legacyStatsMap = new Map<number, ChapterReviewStatFSRS>();
  statsList.forEach((s) => legacyStatsMap.set(s.chapter_id, s));

  // Extract test evidence observed averages
  const testEvidenceMap = new Map<number, { sumScore: number; count: number }>();
  completedTests.forEach((t) => {
    const isPlantao = t.mode === 'plantao';
    if (isPlantao && t.plantao_data?.beds) {
      t.plantao_data.beds.forEach((bed: any) => {
        const cId = bed.chapterId;
        if (!cId) return;
        const qIds = bed.questionIds || [];
        let bScore = 0;
        let qC = 0;
        qIds.forEach((qId: any) => {
          const res = t.results ? t.results[qId] : null;
          if (res && typeof res.score === 'number') {
            bScore += res.score;
            qC++;
          }
        });
        const bedAvg = qC > 0 ? (bScore / qC) * 10 : (t.score || 5) * 10;
        if (!testEvidenceMap.has(cId)) testEvidenceMap.set(cId, { sumScore: 0, count: 0 });
        const entry = testEvidenceMap.get(cId)!;
        entry.sumScore += bedAvg;
        entry.count++;
      });
    } else if (t.chapter_ids) {
      t.chapter_ids.forEach((cId) => {
        if (!testEvidenceMap.has(cId)) testEvidenceMap.set(cId, { sumScore: 0, count: 0 });
        const entry = testEvidenceMap.get(cId)!;
        entry.sumScore += (t.score || 5) * 10;
        entry.count++;
      });
    }
  });

  progressList.forEach((p) => {
    const stat = legacyStatsMap.get(p.chapter_id);
    let legacyLastEvidenceDate: Date | null = null;
    if (p.read_at) legacyLastEvidenceDate = new Date(p.read_at);
    if (stat?.last_reviewed_at) {
      const d = new Date(stat.last_reviewed_at);
      if (!legacyLastEvidenceDate || d > legacyLastEvidenceDate) legacyLastEvidenceDate = d;
    }
    if (stat?.last_evidence_at) {
      const d = new Date(stat.last_evidence_at);
      if (!legacyLastEvidenceDate || d > legacyLastEvidenceDate) legacyLastEvidenceDate = d;
    }

    let daysSince = 999;
    if (legacyLastEvidenceDate) {
      daysSince = Math.max(0, (evalNow.getTime() - legacyLastEvidenceDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    const stab = stat?.stability || 3.0;
    const ret = Math.min(100, Math.max(0, 100 * Math.pow(2, -daysSince / stab)));
    const ev = testEvidenceMap.get(p.chapter_id);
    const n = ev?.count || 0;
    const obsAvg = ev && ev.count > 0 ? ev.sumScore / ev.count : 50;
    const perf = n > 0 ? (n * obsAvg + 3.0 * 50.0) / (n + 3.0) : 50.0;
    const readiness = 0.60 * perf + 0.40 * ret;

    baselineResults.set(p.chapter_id, {
      daysSince,
      stability: stab,
      retention: ret,
      performance: perf,
      topicReadiness: readiness,
    });
  });

  // Custom chapters present in user test history (IDs 1001, 1003, 1004)
  const customChapters = [
    {
      id: 1001,
      number: 1001,
      title: 'Cetoacidose Diabética e EHH',
      sectionNumber: 99,
      sectionTitle: 'Capítulos Personalizados',
      category: 'Metabólico',
      isCustom: true,
      importanceScore: 9.5,
      frequencyScore: 8.5,
    },
    {
      id: 1003,
      number: 1003,
      title: 'Sepse e Choque Séptico na Emergência',
      sectionNumber: 99,
      sectionTitle: 'Capítulos Personalizados',
      category: 'Infectologia',
      isCustom: true,
      importanceScore: 10.0,
      frequencyScore: 9.0,
    },
    {
      id: 1004,
      number: 1004,
      title: 'AVC Isquêmico Agudo',
      sectionNumber: 99,
      sectionTitle: 'Capítulos Personalizados',
      category: 'Neurologia',
      isCustom: true,
      importanceScore: 9.5,
      frequencyScore: 8.5,
    },
  ];
  const allChapters = [...CHAPTERS_DATA, ...customChapters];

  // ==========================================
  // 4. Calibrated Pipeline (Recalibrated Engine)
  // ==========================================
  const calibratedMetrics = deriveAllTopicMetrics({
    progressList,
    reviewStatsList: statsList,
    testsList,
    chaptersList: allChapters,
    now: evalNow,
  });

  const calibratedSnapshot = buildReadinessSnapshot({
    progressList,
    reviewStatsList: statsList,
    testsList,
    chaptersList: allChapters,
    now: evalNow,
  });

  // ==========================================
  // 5. Comparative Report: Studied Chapters Table
  // ==========================================
  console.log(`========================================================================================================`);
  console.log(`                      COMPARATIVE ANALYSIS: BASELINE (BEFORE) vs CALIBRATED (AFTER)                     `);
  console.log(`========================================================================================================`);
  console.log(
    `Cap ID | Chapter Title                        | Days (Old->New) | Ret (Old->New)  | Perf (Old->New) | Readiness (Old->New)`
  );
  console.log(`--------------------------------------------------------------------------------------------------------`);

  const studiedIds = progressList.map((p) => p.chapter_id).sort((a, b) => a - b);

  studiedIds.forEach((id) => {
    const base = baselineResults.get(id);
    const cal = calibratedMetrics.get(id);
    const cap = allChapters.find((c) => c.id === id);
    const title = (cap?.title || `Custom ${id}`).padEnd(36, ' ').substring(0, 36);

    const baseDays = base ? base.daysSince.toFixed(1) + 'd' : 'N/A';
    const calDays = cal ? cal.daysSinceLastEvidence.toFixed(1) + 'd' : 'N/A';
    const daysStr = `${baseDays.padStart(5)} -> ${calDays.padEnd(5)}`;

    const baseRet = base ? base.retention.toFixed(1) + '%' : 'N/A';
    const calRet = cal ? cal.retention.toFixed(1) + '%' : 'N/A';
    const retStr = `${baseRet.padStart(6)} -> ${calRet.padEnd(6)}`;

    const basePerf = base ? base.performance.toFixed(1) + '%' : 'N/A';
    const calPerf = cal ? cal.performance.toFixed(1) + '%' : 'N/A';
    const perfStr = `${basePerf.padStart(6)} -> ${calPerf.padEnd(6)}`;

    const baseReady = base ? base.topicReadiness.toFixed(1) + '%' : 'N/A';
    const calReady = cal ? cal.topicReadiness.toFixed(1) + '%' : 'N/A';
    const readyStr = `${baseReady.padStart(6)} -> ${calReady.padEnd(6)}`;

    console.log(
      `${id.toString().padStart(6, ' ')} | ${title} | ${daysStr.padEnd(15)} | ${retStr.padEnd(15)} | ${perfStr.padEnd(15)} | ${readyStr}`
    );
  });
  console.log(`--------------------------------------------------------------------------------------------------------\n`);

  // ==========================================
  // 6. Deep Dive: Chapter 31 (Fibrilação Atrial)
  // ==========================================
  const cap31Base = baselineResults.get(31)!;
  const cap31Cal = calibratedMetrics.get(31)!;

  console.log(`========================================================================`);
  console.log(`             DEEP DIVE: CHAPTER 31 — FIBRILAÇÃO ATRIAL                  `);
  console.log(`========================================================================`);
  console.log(`Clinical Context: 5 Plantão tests taken (Aug 3, 4, 14, 24, 28) with scores up to 9.05/10.`);
  console.log(`Latest test completed: 2026-08-28 03:25:45 UTC (18h before evaluation).\n`);

  console.log(`Metric                   | Baseline (Broken) | Calibrated (Fixed) | Status`);
  console.log(`-------------------------|-------------------|--------------------|--------`);
  console.log(`Days Since Evidence      | ${cap31Base.daysSince.toFixed(1).padStart(15)} d | ${cap31Cal.daysSinceLastEvidence.toFixed(1).padStart(16)} d | DYNAMIC SYNC`);
  console.log(`Memory Retention R(t,S)  | ${cap31Base.retention.toFixed(1).padStart(16)}% | ${cap31Cal.retention.toFixed(1).padStart(17)}% | POWER-LAW`);
  console.log(`Bayesian Performance    | ${cap31Base.performance.toFixed(1).padStart(16)}% | ${cap31Cal.performance.toFixed(1).padStart(17)}% | m=1.0 PRIOR`);
  console.log(`Clinical Topic Readiness | ${cap31Base.topicReadiness.toFixed(1).padStart(16)}% | ${cap31Cal.topicReadiness.toFixed(1).padStart(17)}% | 85%/15% DECOUPLED`);
  console.log(`FSRS Stability S         | ${cap31Base.stability.toFixed(1).padStart(15)} d | ${cap31Cal.stability.toFixed(1).padStart(16)} d | S0 = 7.0d\n`);

  // ==========================================
  // 7. Global Readiness & Specialty Radar
  // ==========================================
  console.log(`========================================================================`);
  console.log(`                 GLOBAL READINESS & SPECIALTY RADAR                     `);
  console.log(`========================================================================`);
  console.log(`Active Studied Chapters: ${calibratedSnapshot.totalReadChapters} chapters`);
  console.log(`Active Proficiency:      ${calibratedSnapshot.activeProficiency}%`);
  console.log(`Active Retention:        ${calibratedSnapshot.activeRetention}%`);
  console.log(`Clinical Coverage Ratio: ${calibratedSnapshot.curricularCoverage.clinicalWeightedPercent}%`);
  console.log(`Global Readiness Score:  ${calibratedSnapshot.globalReadiness}%`);
  console.log(`Readiness Status:        ${calibratedSnapshot.readinessStatus.label}`);
  console.log(`Status Description:      ${calibratedSnapshot.readinessStatus.description}\n`);

  console.log(`Specialty Radar Breakdown:`);
  calibratedSnapshot.specialtyScores.forEach((spec) => {
    console.log(
      `  - ${spec.name.padEnd(20)} | Score: ${spec.score.toString().padStart(3)}% | Started: ${spec.isStarted ? 'YES' : 'NO '} | Studied: ${spec.readCount}/${spec.totalChapters} caps | Coverage: ${spec.coveragePercent}%`
    );
  });
  console.log('');

  console.log(`Top 3 Recommended Actions:`);
  if (calibratedSnapshot.recommendations) {
    calibratedSnapshot.recommendations.forEach((rec, idx) => {
      console.log(`  ${idx + 1}. [${rec.mode.toUpperCase()}] Cap ${rec.recommendedChapterId} — ${rec.reason}`);
    });
  }
  console.log('');

  // ==========================================
  // 8. Automated Acceptance Criteria Assertions
  // ==========================================
  console.log(`========================================================================`);
  console.log(`                AUTOMATED ACCEPTANCE CRITERIA VERIFICATION              `);
  console.log(`========================================================================`);

  const assertions: Array<{ name: string; pass: boolean; details: string }> = [
    {
      name: 'AC1: Completed Tests Count == 14',
      pass: totalCompletedTests === 14,
      details: `Observed: ${totalCompletedTests} tests (Expected: 14)`,
    },
    {
      name: 'AC2: Average Completed Test Score >= 8.0/10',
      pass: avgTestScore >= 8.0,
      details: `Observed: ${avgTestScore.toFixed(2)}/10 (Expected: >= 8.0)`,
    },
    {
      name: 'AC3: Cap 31 Retention >= 70.0%',
      pass: cap31Cal.retention >= 70.0,
      details: `Observed: ${cap31Cal.retention.toFixed(1)}% (Baseline: ${cap31Base.retention.toFixed(1)}%)`,
    },
    {
      name: 'AC4: Cap 31 Clinical Topic Readiness >= 75.0%',
      pass: cap31Cal.topicReadiness >= 75.0,
      details: `Observed: ${cap31Cal.topicReadiness.toFixed(1)}% (Baseline: ${cap31Base.topicReadiness.toFixed(1)}%)`,
    },
    {
      name: 'AC5: Active Proficiency >= 78.0%',
      pass: calibratedSnapshot.activeProficiency >= 78.0,
      details: `Observed: ${calibratedSnapshot.activeProficiency}% (Reflects ~8.3/10 test average)`,
    },
    {
      name: 'AC6: Global Readiness in Supervision Range (>= 45.0%)',
      pass: calibratedSnapshot.globalReadiness >= 45.0,
      details: `Observed: ${calibratedSnapshot.globalReadiness}%`,
    },
  ];

  let allPassed = true;
  assertions.forEach((a) => {
    if (a.pass) {
      console.log(`  [PASS] ${a.name} -> ${a.details}`);
    } else {
      console.error(`  [FAIL] ${a.name} -> ${a.details}`);
      allPassed = false;
    }
  });

  console.log(`------------------------------------------------------------------------`);
  if (allPassed) {
    console.log(`  >>> ALL ACCEPTANCE CRITERIA SATISFIED WITH 100% SUCCESS! <<<\n`);
  } else {
    console.error(`  >>> SOME ACCEPTANCE CRITERIA FAILED! <<<\n`);
    process.exit(1);
  }
}

runValidation().catch((err) => {
  console.error('Validation Script Error:', err);
  process.exit(1);
});
