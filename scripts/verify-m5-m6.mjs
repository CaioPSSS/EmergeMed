import { getCurrentLevelInfo, LEVEL_THRESHOLDS, ACHIEVEMENTS } from '../dist/gamification-engine.js';
import { deriveAllTopicMetrics } from '../dist/learning-engine.js';
import { CHAPTERS_DATA } from '../dist/chapters-data.js';
import { LEARNING_TRACKS } from '../dist/learning-tracks.js';

console.log('====================================================');
console.log('EMPIRICAL VERIFICATION HARNESS — M5 & M6');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, testName, detail) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (detail) console.error(`       Detail: ${detail}`);
    failCount++;
  }
}

// ----------------------------------------------------
// TEST GROUP 1: Gamification Level Resolution & Boundaries
// ----------------------------------------------------
console.log('--- TEST GROUP 1: Gamification Level Resolution & Boundaries ---');

assert(LEVEL_THRESHOLDS.length === 10, 'LEVEL_THRESHOLDS has exactly 10 levels');
const expectedTitles = [
  'Acadêmico',
  'Interno',
  'R1 — Primeiro Ano',
  'R2 — Emergencista Jr',
  'R3 — Emergencista',
  'Preceptor',
  'Chefe de Plantão',
  'Coordenador de UPA',
  'Especialista Sênior',
  'Mestre da Emergência'
];

LEVEL_THRESHOLDS.forEach((thresh, idx) => {
  assert(thresh.level === idx + 1, `Level ${idx + 1} has correct index`);
  assert(thresh.title === expectedTitles[idx], `Level ${idx + 1} title is "${thresh.title}" (expected "${expectedTitles[idx]}")`);
});

const xpBoundaries = [
  { xp: -10, expectedLevel: 1, expectedTitle: 'Acadêmico', expectedProgress: 0 },
  { xp: 0, expectedLevel: 1, expectedTitle: 'Acadêmico', expectedProgress: 0 },
  { xp: 100, expectedLevel: 1, expectedTitle: 'Acadêmico', expectedProgress: 50 },
  { xp: 199, expectedLevel: 1, expectedTitle: 'Acadêmico', expectedProgress: 100 },
  { xp: 200, expectedLevel: 2, expectedTitle: 'Interno', expectedProgress: 0 },
  { xp: 350, expectedLevel: 2, expectedTitle: 'Interno', expectedProgress: 50 },
  { xp: 499, expectedLevel: 2, expectedTitle: 'Interno', expectedProgress: 100 },
  { xp: 500, expectedLevel: 3, expectedTitle: 'R1 — Primeiro Ano', expectedProgress: 0 },
  { xp: 999, expectedLevel: 3, expectedTitle: 'R1 — Primeiro Ano', expectedProgress: 100 },
  { xp: 1000, expectedLevel: 4, expectedTitle: 'R2 — Emergencista Jr', expectedProgress: 0 },
  { xp: 1999, expectedLevel: 4, expectedTitle: 'R2 — Emergencista Jr', expectedProgress: 100 },
  { xp: 2000, expectedLevel: 5, expectedTitle: 'R3 — Emergencista', expectedProgress: 0 },
  { xp: 3499, expectedLevel: 5, expectedTitle: 'R3 — Emergencista', expectedProgress: 100 },
  { xp: 3500, expectedLevel: 6, expectedTitle: 'Preceptor', expectedProgress: 0 },
  { xp: 4999, expectedLevel: 6, expectedTitle: 'Preceptor', expectedProgress: 100 },
  { xp: 5000, expectedLevel: 7, expectedTitle: 'Chefe de Plantão', expectedProgress: 0 },
  { xp: 7999, expectedLevel: 7, expectedTitle: 'Chefe de Plantão', expectedProgress: 100 },
  { xp: 8000, expectedLevel: 8, expectedTitle: 'Coordenador de UPA', expectedProgress: 0 },
  { xp: 11999, expectedLevel: 8, expectedTitle: 'Coordenador de UPA', expectedProgress: 100 },
  { xp: 12000, expectedLevel: 9, expectedTitle: 'Especialista Sênior', expectedProgress: 0 },
  { xp: 19999, expectedLevel: 9, expectedTitle: 'Especialista Sênior', expectedProgress: 100 },
  { xp: 20000, expectedLevel: 10, expectedTitle: 'Mestre da Emergência', expectedProgress: 100 },
  { xp: 50000, expectedLevel: 10, expectedTitle: 'Mestre da Emergência', expectedProgress: 100 }
];

xpBoundaries.forEach((b) => {
  const info = getCurrentLevelInfo(b.xp);
  assert(
    info.currentLevel.level === b.expectedLevel,
    `XP ${b.xp} -> Level ${info.currentLevel.level} (expected ${b.expectedLevel})`
  );
  assert(
    info.currentLevel.title === b.expectedTitle,
    `XP ${b.xp} -> Title "${info.currentLevel.title}" (expected "${b.expectedTitle}")`
  );
  assert(
    info.progressPercent === b.expectedProgress,
    `XP ${b.xp} -> Progress ${info.progressPercent}% (expected ${b.expectedProgress}%)`
  );
});

assert(ACHIEVEMENTS.length === 13, `ACHIEVEMENTS count is 13 (actual ${ACHIEVEMENTS.length})`);


// ----------------------------------------------------
// TEST GROUP 2: Prerequisites & Penalty Verification
// ----------------------------------------------------
console.log('\n--- TEST GROUP 2: Prerequisites & Penalty Verification ---');

const chaptersWithPrereqs = CHAPTERS_DATA.filter((c) => c.prerequisites && c.prerequisites.length > 0);
console.log(`Found ${chaptersWithPrereqs.length} chapters with defined prerequisites.`);
assert(chaptersWithPrereqs.length >= 7, 'At least 7 chapters have explicit prerequisites configured');

const cap7 = CHAPTERS_DATA.find((c) => c.id === 7);
assert(JSON.stringify(cap7?.prerequisites) === '[6]', 'Cap 7 (VM) requires Cap 6 (IRpA)');

const cap5 = CHAPTERS_DATA.find((c) => c.id === 5);
assert(JSON.stringify(cap5?.prerequisites) === '[3,4]', 'Cap 5 (PCR Criança) requires Cap 3 & Cap 4');

const cap36 = CHAPTERS_DATA.find((c) => c.id === 36);
assert(JSON.stringify(cap36?.prerequisites) === '[31,8]', 'Cap 36 (IAM Choque) requires Cap 31 & Cap 8');

// Empirically test deriveAllTopicMetrics prerequisite penalty
const metricsNoReads = deriveAllTopicMetrics({
  progressList: [],
  reviewStatsList: [],
  testsList: [],
  now: new Date()
});

const metricCap6 = metricsNoReads.get(6);
const metricCap7 = metricsNoReads.get(7);

console.log(`Cap 6 (No Prereq) expansion score: ${metricCap6.expansionScore}`);
console.log(`Cap 7 (Prereq Cap 6 unread) expansion score: ${metricCap7.expansionScore}`);

assert(
  metricCap7.expansionScore < metricCap6.expansionScore,
  'Cap 7 expansion score is penalized compared to Cap 6 when Cap 6 is unread'
);

const metricsCap6Read = deriveAllTopicMetrics({
  progressList: [
    {
      user_id: 'test-user',
      chapter_id: 6,
      is_read: true,
      read_count: 1,
      read_at: new Date().toISOString(),
      last_read_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],
  reviewStatsList: [],
  testsList: [],
  now: new Date()
});

const metricCap7WithCap6Read = metricsCap6Read.get(7);
console.log(`Cap 7 (Prereq Cap 6 READ) expansion score: ${metricCap7WithCap6Read.expansionScore}`);

const ratioCap7 = metricCap7.expansionScore / metricCap7WithCap6Read.expansionScore;
console.log(`Ratio (Unread prereq / Read prereq) for Cap 7 = ${ratioCap7}`);
assert(
  Math.abs(ratioCap7 - 0.15) < 0.0001,
  `Prerequisite penalty factor is exactly 0.15 (85% reduction). Measured: ${ratioCap7.toFixed(4)}`
);

const metricsCap3ReadOnly = deriveAllTopicMetrics({
  progressList: [{ user_id: 'u', chapter_id: 3, is_read: true, read_count: 1, read_at: new Date().toISOString(), last_read_at: new Date().toISOString(), created_at: '', updated_at: '' }],
  reviewStatsList: [],
  testsList: [],
  now: new Date()
});

const metricsCap3And4Read = deriveAllTopicMetrics({
  progressList: [
    { user_id: 'u', chapter_id: 3, is_read: true, read_count: 1, read_at: new Date().toISOString(), last_read_at: new Date().toISOString(), created_at: '', updated_at: '' },
    { user_id: 'u', chapter_id: 4, is_read: true, read_count: 1, read_at: new Date().toISOString(), last_read_at: new Date().toISOString(), created_at: '', updated_at: '' }
  ],
  reviewStatsList: [],
  testsList: [],
  now: new Date()
});

const cap5Partial = metricsCap3ReadOnly.get(5);
const cap5Full = metricsCap3And4Read.get(5);
const ratioCap5 = cap5Partial.expansionScore / cap5Full.expansionScore;
console.log(`Cap 5 Partial Prereqs expansion: ${cap5Partial.expansionScore}, Full Prereqs expansion: ${cap5Full.expansionScore}, Ratio: ${ratioCap5}`);
assert(
  Math.abs(ratioCap5 - 0.15) < 0.0001,
  'Cap 5 requires BOTH prerequisites to be read to avoid 0.15 penalty factor'
);


// ----------------------------------------------------
// TEST GROUP 3: Learning Tracks Verification
// ----------------------------------------------------
console.log('\n--- TEST GROUP 3: Learning Tracks Verification ---');

assert(LEARNING_TRACKS.length === 6, 'LEARNING_TRACKS contains 6 specialty tracks');

const trackIds = LEARNING_TRACKS.map((t) => t.id);
console.log('Tracks found:', trackIds.join(', '));
assert(trackIds.includes('abordagem-inicial'), 'Contains track: abordagem-inicial');
assert(trackIds.includes('cardiologia-emergencia'), 'Contains track: cardiologia-emergencia');
assert(trackIds.includes('pneumologia-emergencia'), 'Contains track: pneumologia-emergencia');
assert(trackIds.includes('infectologia-sepse'), 'Contains track: infectologia-sepse');
assert(trackIds.includes('trauma'), 'Contains track: trauma');
assert(trackIds.includes('terapia-intensiva'), 'Contains track: terapia-intensiva');

LEARNING_TRACKS.forEach((track) => {
  assert(track.chapters.length > 0, `Track ${track.id} has chapters`);
  track.chapters.forEach((cId) => {
    const exists = CHAPTERS_DATA.some((c) => c.id === cId);
    assert(exists, `Track ${track.id} references valid chapter ID ${cId}`);
  });
});


// ----------------------------------------------------
// SUMMARY
// ----------------------------------------------------
console.log('\n====================================================');
console.log(`VERIFICATION COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log('====================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
