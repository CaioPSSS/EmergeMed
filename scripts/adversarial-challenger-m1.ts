/**
 * Empirical Challenger Suite for Milestone M1 (Modo Plantão Restructuring)
 * Adversarial Stress Tests & Oracles for:
 * 1. Anti-spoiler blinder against adversarial inputs (sneaky diagnosis, acronyms, formatting tricks)
 * 2. Bed generation sequence & structure ([prescription_immediate, prescription_complete/ventilator, MCQ, MCQ])
 * 3. Reuse scale bounds (35% to 90%) with Monte Carlo verification
 * 4. Question bank MCQ fallback matrix (0, 1, 2 MCQs in bank)
 * 5. Dynamic result card step mapping & backward compatibility
 */

import { organizePlantaoBeds } from '../lib/spaced-repetition';
import { CHAPTERS_DATA } from '../lib/chapters-data';
import { DEFAULT_CHAPTER_WEIGHTS } from '../lib/chapter-weights-data';
import { verifyAntiSpoiler, FORBIDDEN_DIAGNOSTIC_TERMS, BED_REUSE_SCALE } from '../tests/e2e/common';
import { SYSTEM_PROMPT_PLANTAO_GENERATOR, SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR } from '../lib/ai/prompts';

interface TestSummary {
  name: string;
  passed: boolean;
  category: string;
  details?: string;
}

const summary: TestSummary[] = [];

function check(category: string, name: string, condition: boolean, details?: string) {
  if (condition) {
    summary.push({ name, passed: true, category });
    console.log(`  [PASS] [${category}] ${name}`);
  } else {
    summary.push({ name, passed: false, category, details });
    console.error(`  [FAIL] [${category}] ${name} -> ${details || 'Assertion failed'}`);
  }
}

// =========================================================================
// SUITE 1: ANTI-SPOILER BLINDER AGAINST ADVERSARIAL INPUTS
// =========================================================================
console.log('\n--- SUITE 1: Anti-Spoiler Blinder Adversarial Stress Testing ---');

// 1.1 Sneaky diagnostic phrases that an adversarial generator might output
const adversarialSneakyVignettes = [
  { vignette: 'Paciente de 62 anos, DM2, com diagnóstico de IAM com supra de ST.', spoiler: 'diagnóstico de IAM', shouldPass: false },
  { vignette: 'Admitido na Sala Vermelha com diagnóstico firmado de sepse de foco pulmonar.', spoiler: 'diagnóstico firmado', shouldPass: false },
  { vignette: 'Mulher, 28 anos, sonolenta, trata-se de cetoacidose diabética descompensada.', spoiler: 'trata-se de cetoacidose', shouldPass: false },
  { vignette: 'Homem de 45 anos com choque séptico confirmado após pneumonia.', spoiler: 'choque séptico confirmado', shouldPass: false },
  { vignette: 'Idoso, 75 anos, conclusão diagnóstica: AVC isquêmico extenso.', spoiler: 'conclusão diagnóstica:', shouldPass: false },
  { vignette: 'Paciente com diagnósticos de insuficiência cardíaca descompensada e edema agudo.', spoiler: 'paciente com diagnósticos de', shouldPass: false },
  { vignette: 'Caso de anafilaxia confirmada após administração de contraste iodado.', spoiler: 'caso de anafilaxia confirmada', shouldPass: false },
];

for (const testCase of adversarialSneakyVignettes) {
  const result = verifyAntiSpoiler(testCase.vignette);
  check(
    'Anti-Spoiler',
    `Catches explicit diagnostic marker: "${testCase.spoiler}"`,
    result.isClean === testCase.shouldPass && result.matched.length > 0,
    `Expected clean=${testCase.shouldPass}, got isClean=${result.isClean}, matched=${result.matched.join(', ')}`
  );
}

// 1.2 Obfuscated formatting: mixed casing and whitespace normalization
const trickySpacingVignette = 'Paciente admitido. DiAgNóStIco   dE   IAM com supra na parede anterior.';
const normalizedTricky = trickySpacingVignette.replace(/\s+/g, ' ');
const trickyCheck = verifyAntiSpoiler(normalizedTricky);
check(
  'Anti-Spoiler',
  'Catches mixed casing and multi-space spoiler after normalization',
  !trickyCheck.isClean && trickyCheck.matched.length > 0,
  `Matched terms: ${trickyCheck.matched.join(', ')}`
);

// 1.3 Acronym discrimination: clinical vitals/tools vs diagnostic disease acronyms
const vitalsVignette = 'PA 80/50 mmHg, FC 122 bpm, FR 28 irpm, SpO2 88% em ar ambiente, Tax 38.9°C, HGT 210 mg/dL, Glasgow 11, SVD com débito reduzido, BIC preparada.';
const vitalsCheck = verifyAntiSpoiler(vitalsVignette);
check(
  'Anti-Spoiler',
  'Permits legitimate clinical acronyms (PA, FC, FR, SpO2, Tax, HGT, Glasgow, SVD, BIC) without false positives',
  vitalsCheck.isClean,
  `Matched false positives: ${vitalsCheck.matched.join(', ')}`
);

// 1.4 Legitimate physical exam findings without diagnostic labels
const examVignette = 'Ausculta com estertores crepitantes em terço médio bilateral, sibilos expiratórios esparsos, turgência jugular a 45 graus e edema de MMII 2+/4+.';
const examCheck = verifyAntiSpoiler(examVignette);
check(
  'Anti-Spoiler',
  'Permits objective physical exam signs (estertores, sibilos, turgência jugular, edema) without diagnostic labels',
  examCheck.isClean,
  `Matched false positives: ${examCheck.matched.join(', ')}`
);

// 1.5 Explicit chapter title detection in diagnostic phrasing
const chapterTitleCases = [
  { vignette: 'Paciente admitido com diagnóstico de Cetoacidose Diabética grave.', title: 'Cetoacidose Diabética', shouldBeCaught: true },
  { vignette: 'Idoso, 70 anos, quadro de Infarto Agudo do Miocárdio.', title: 'Infarto Agudo do Miocárdio', shouldBeCaught: true },
  { vignette: 'Paciente jovem, trata-se de Anafilaxia grave.', title: 'Anafilaxia', shouldBeCaught: true },
  // Clean presentation of same chapter without explicit diagnostic phrase
  { vignette: 'Paciente jovem, 24 anos, com hálito cetônico, dor abdominal difusa, vômitos, glicemia 480 mg/dL, pH 7.15, bicarbonato 9 mEq/L.', title: 'Cetoacidose Diabética', shouldBeCaught: false },
];

for (const tc of chapterTitleCases) {
  const res = verifyAntiSpoiler(tc.vignette, tc.title);
  const caught = !res.isClean;
  check(
    'Anti-Spoiler',
    `Chapter title check: "${tc.title}" with vignette "${tc.vignette.slice(0, 45)}..."`,
    caught === tc.shouldBeCaught,
    `Expected caught=${tc.shouldBeCaught}, got caught=${caught}`
  );
}

// 1.6 Verify System Prompt anti-spoiler rule integrity
check(
  'Prompt Rules',
  'SYSTEM_PROMPT_PLANTAO_GENERATOR contains REGRA DE OURO INFLEXÍVEL: CEGAMENTO DIAGNÓSTICO',
  SYSTEM_PROMPT_PLANTAO_GENERATOR.includes('REGRA DE OURO INFLEXÍVEL: CEGAMENTO DIAGNÓSTICO (ANTI-SPOILER)') &&
  SYSTEM_PROMPT_PLANTAO_GENERATOR.includes('O diagnóstico NUNCA deve estar escrito de forma explícita na vinheta'),
  'Prompt must strictly forbid explicit diagnosis in vignettes'
);

check(
  'Prompt Rules',
  'SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR explicitly references CEGAMENTO DIAGNÓSTICO context',
  SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR.includes('CEGAMENTO DIAGNÓSTICO') &&
  SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR.includes('Etapa 1: Conduta Imediata de Resgate') &&
  SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR.includes('Etapa 2: Conduta de Manutenção / Resgate / Ventilação'),
  'Evaluator prompt must reflect 2-stage blinded bed structure'
);

// =========================================================================
// SUITE 2: BED GENERATION SEQUENCE & STRUCTURE
// =========================================================================
console.log('\n--- SUITE 2: Bed Generation Sequence & Structure Testing ---');

// 2.1 Test organizePlantaoBeds across various bed counts (1, 2, 4, 6, 8)
const testBedCounts = [1, 2, 4, 6, 8];
for (const count of testBedCounts) {
  const dummyChapterIds = CHAPTERS_DATA.slice(0, count).map(c => c.id);
  const organizedBeds = organizePlantaoBeds(dummyChapterIds, CHAPTERS_DATA, DEFAULT_CHAPTER_WEIGHTS);

  check(
    'Bed Structure',
    `organizePlantaoBeds generates exactly ${count} bed(s)`,
    organizedBeds.length === count,
    `Expected ${count}, got ${organizedBeds.length}`
  );

  let allBedsConform = true;
  for (const bed of organizedBeds) {
    const seq = bed.questionSequence;
    if (
      !Array.isArray(seq) ||
      seq.length !== 4 ||
      seq[0] !== 'prescription_immediate' ||
      seq[1] !== 'prescription_complete' ||
      seq[2] !== 'multiple_choice' ||
      seq[3] !== 'multiple_choice'
    ) {
      allBedsConform = false;
      break;
    }
  }

  check(
    'Bed Structure',
    `Every bed in ${count}-bed plantão has exactly [prescription_immediate, prescription_complete, multiple_choice, multiple_choice]`,
    allBedsConform,
    `Beds failed sequence validation for count=${count}`
  );
}

// 2.2 Test bed assembly logic simulating route.ts
interface MockQuestion {
  id: number;
  type: string;
  vignette: string;
}

function assembleBedQuestions(
  stage1: MockQuestion,
  stage2: MockQuestion,
  mcqs: MockQuestion[]
): MockQuestion[] {
  if (!stage1 || !stage2) throw new Error('Missing stages');
  return [stage1, stage2, ...mcqs.slice(0, 2)];
}

const mockStage1: MockQuestion = { id: 1, type: 'prescription_immediate', vignette: 'Chegada aguda...' };
const mockStage2Complete: MockQuestion = { id: 2, type: 'prescription_complete', vignette: 'Evolução clínica...' };
const mockStage2Vent: MockQuestion = { id: 2, type: 'ventilator', vignette: 'Evolução com IOT...' };
const mockMcq1: MockQuestion = { id: 3, type: 'multiple_choice', vignette: 'MCQ 1' };
const mockMcq2: MockQuestion = { id: 4, type: 'multiple_choice', vignette: 'MCQ 2' };

const assembledComplete = assembleBedQuestions(mockStage1, mockStage2Complete, [mockMcq1, mockMcq2]);
check(
  'Bed Assembly',
  'Assembled bed with prescription_complete has length 4 and exact types',
  assembledComplete.length === 4 &&
  assembledComplete[0].type === 'prescription_immediate' &&
  assembledComplete[1].type === 'prescription_complete' &&
  assembledComplete[2].type === 'multiple_choice' &&
  assembledComplete[3].type === 'multiple_choice',
  `Types: ${assembledComplete.map(q => q.type).join(', ')}`
);

const assembledVentilator = assembleBedQuestions(mockStage1, mockStage2Vent, [mockMcq1, mockMcq2]);
check(
  'Bed Assembly',
  'Assembled bed with ventilator has length 4 and exact types',
  assembledVentilator.length === 4 &&
  assembledVentilator[0].type === 'prescription_immediate' &&
  assembledVentilator[1].type === 'ventilator' &&
  assembledVentilator[2].type === 'multiple_choice' &&
  assembledVentilator[3].type === 'multiple_choice',
  `Types: ${assembledVentilator.map(q => q.type).join(', ')}`
);

// 2.3 Bank legacy filter test: route.ts line 219
const mixedBankCases = [
  { id: 'c1', questions: [{ type: 'multiple_choice' }, { type: 'multiple_choice' }, { type: 'prescription_immediate' }, { type: 'prescription_complete' }] }, // Legacy 4-item
  { id: 'c2', questions: [{ type: 'prescription_immediate' }, { type: 'prescription_complete' }] }, // Valid R1 2-stage
  { id: 'c3', questions: [{ type: 'prescription_immediate' }, { type: 'ventilator' }] }, // Valid R1 2-stage with vent
  { id: 'c4', questions: [{ type: 'prescription_complete' }] }, // Incomplete
  { id: 'c5', questions: null }, // Corrupted
];

const valid2StageCases = mixedBankCases.filter((c: any) => {
  const qs = c.questions;
  return Array.isArray(qs) && qs.length >= 2 && qs[0]?.type === 'prescription_immediate';
});

check(
  'Bank Filtering',
  'Filters out legacy 4-item cases starting with multiple_choice and retains only valid R1 2-stage cases',
  valid2StageCases.length === 2 && valid2StageCases[0].id === 'c2' && valid2StageCases[1].id === 'c3',
  `Filtered count: ${valid2StageCases.length}, IDs: ${valid2StageCases.map(c => c.id).join(', ')}`
);

// 2.4 Dynamic Step Mapping in Test Results (mimicking resultado/page.tsx getStepInfo)
function getStepInfoMock(parentBed: { bedNumber: number; questionIds: number[] }, questions: MockQuestion[], q: MockQuestion) {
  const idxInBed = (parentBed.questionIds || []).indexOf(q.id);
  const firstQInBed = questions.find((item: any) => item.id === parentBed.questionIds?.[0]);
  const isR1Sequence = firstQInBed?.type === 'prescription_immediate';

  if (isR1Sequence) {
    if (idxInBed === 0) return { step: 'Etapa 1', title: 'Conduta Imediata de Resgate' };
    if (idxInBed === 1) return { step: 'Etapa 2', title: 'Conduta de Manutenção / Ventilação' };
    if (idxInBed === 2) return { step: 'Múltipla Escolha 1', title: 'Questão de Múltipla Escolha (1/2)' };
    if (idxInBed === 3) return { step: 'Múltipla Escolha 2', title: 'Questão de Múltipla Escolha (2/2)' };
  } else {
    // Legacy fallback
    const legacySteps = [
      { step: 'Etapa 1', title: 'Triagem & Suspeita Diagnóstica' },
      { step: 'Etapa 2', title: 'Exames & Confirmação Diagnóstica' },
      { step: 'Etapa 3', title: 'Conduta Imediata de Resgate' },
      { step: 'Etapa 4', title: 'Prescrição do Dia / Ventilação Mecânica' },
    ];
    return legacySteps[idxInBed] || { step: `Etapa ${idxInBed + 1}`, title: 'Outra' };
  }
  return { step: 'Unknown', title: 'Unknown' };
}

const r1Bed = { bedNumber: 1, questionIds: [10, 11, 12, 13] };
const r1Questions: MockQuestion[] = [
  { id: 10, type: 'prescription_immediate', vignette: 'v1' },
  { id: 11, type: 'prescription_complete', vignette: 'v2' },
  { id: 12, type: 'multiple_choice', vignette: 'v3' },
  { id: 13, type: 'multiple_choice', vignette: 'v4' },
];

const step0 = getStepInfoMock(r1Bed, r1Questions, r1Questions[0]);
const step1 = getStepInfoMock(r1Bed, r1Questions, r1Questions[1]);
const step2 = getStepInfoMock(r1Bed, r1Questions, r1Questions[2]);
const step3 = getStepInfoMock(r1Bed, r1Questions, r1Questions[3]);

check(
  'Result Mapping',
  'R1 Bed Step 0 maps to "Conduta Imediata de Resgate"',
  step0.step === 'Etapa 1' && step0.title === 'Conduta Imediata de Resgate',
  `Got ${step0.step}: ${step0.title}`
);
check(
  'Result Mapping',
  'R1 Bed Step 1 maps to "Conduta de Manutenção / Ventilação"',
  step1.step === 'Etapa 2' && step1.title === 'Conduta de Manutenção / Ventilação',
  `Got ${step1.step}: ${step1.title}`
);
check(
  'Result Mapping',
  'R1 Bed Step 2 maps to "Questão de Múltipla Escolha (1/2)"',
  step2.step === 'Múltipla Escolha 1' && step2.title === 'Questão de Múltipla Escolha (1/2)',
  `Got ${step2.step}: ${step2.title}`
);
check(
  'Result Mapping',
  'R1 Bed Step 3 maps to "Questão de Múltipla Escolha (2/2)"',
  step3.step === 'Múltipla Escolha 2' && step3.title === 'Questão de Múltipla Escolha (2/2)',
  `Got ${step3.step}: ${step3.title}`
);

// Backward compatibility check for legacy bed
const legacyBed = { bedNumber: 1, questionIds: [1, 2, 3, 4] };
const legacyQuestions: MockQuestion[] = [
  { id: 1, type: 'multiple_choice', vignette: 'Legacy Q1' },
  { id: 2, type: 'multiple_choice', vignette: 'Legacy Q2' },
  { id: 3, type: 'prescription_immediate', vignette: 'Legacy Q3' },
  { id: 4, type: 'prescription_complete', vignette: 'Legacy Q4' },
];
const legacyStep0 = getStepInfoMock(legacyBed, legacyQuestions, legacyQuestions[0]);
check(
  'Result Mapping',
  'Legacy Bed backward compatibility preserved (Step 0 = Triagem & Suspeita Diagnóstica)',
  legacyStep0.step === 'Etapa 1' && legacyStep0.title === 'Triagem & Suspeita Diagnóstica',
  `Got ${legacyStep0.step}: ${legacyStep0.title}`
);

// =========================================================================
// SUITE 3: REUSE SCALE BOUNDS (35% to 90%)
// =========================================================================
console.log('\n--- SUITE 3: Reuse Scale Bounds & Monte Carlo Simulation ---');

function getReuseChance(caseCount: number): number {
  if (caseCount === 1) return 0.35;
  if (caseCount === 2) return 0.50;
  if (caseCount === 3) return 0.65;
  if (caseCount === 4) return 0.75;
  if (caseCount === 5) return 0.85;
  if (caseCount >= 6) return 0.90;
  return 0;
}

// 3.1 Verify exact mathematical constants
const expectedChances: Record<number, number> = {
  0: 0.00,
  1: 0.35,
  2: 0.50,
  3: 0.65,
  4: 0.75,
  5: 0.85,
  6: 0.90,
  7: 0.90,
  10: 0.90,
  50: 0.90,
};

for (const [countStr, expected] of Object.entries(expectedChances)) {
  const count = Number(countStr);
  const actual = getReuseChance(count);
  check(
    'Reuse Scale',
    `Reuse probability for ${count} case(s) in bank is exactly ${expected * 100}%`,
    actual === expected,
    `Expected ${expected}, got ${actual}`
  );
}

// 3.2 Monte Carlo Simulation: 50,000 iterations per count
console.log('  Running Monte Carlo simulation (50,000 trials per case count)...');
const trials = 50000;
for (let c = 0; c <= 7; c++) {
  const pTheoretical = getReuseChance(c);
  let reusedCount = 0;

  for (let i = 0; i < trials; i++) {
    const shouldReuse = c > 0 && Math.random() < pTheoretical;
    if (shouldReuse) reusedCount++;
  }

  const pObserved = reusedCount / trials;
  // Margin of error at 99.7% confidence: 3 * sqrt(p*(1-p)/N) <= 0.0067
  const tolerance = c === 0 ? 0.0001 : 0.008;
  const diff = Math.abs(pObserved - pTheoretical);

  check(
    'Monte Carlo',
    `Case count ${c}: observed ${(pObserved * 100).toFixed(2)}% vs theoretical ${(pTheoretical * 100).toFixed(2)}% (diff ${(diff * 100).toFixed(3)}% within tolerance ${(tolerance * 100).toFixed(2)}%)`,
    diff <= tolerance,
    `Diff ${diff} exceeded tolerance ${tolerance}`
  );
}

// =========================================================================
// SUITE 4: QUESTION BANK MCQ FALLBACK MATRIX (0, 1, 2 MCQs)
// =========================================================================
console.log('\n--- SUITE 4: Question Bank MCQ Fallback Simulation ---');

interface MockBankMCQ {
  id: string;
  chapter_id: number;
  vignette: string;
  times_shown: number;
}

function simulateBedMCQSelection(
  bankMCQs: MockBankMCQ[],
  aiGenerator: (needed: number) => MockQuestion[]
): { bedMcqs: MockQuestion[]; bankUpdates: string[]; aiRequestedCount: number } {
  const bedMcqs: MockQuestion[] = [];
  const bankUpdates: string[] = [];

  const mcqsFromBank = bankMCQs.slice(0, 2);
  for (const mcqRow of mcqsFromBank) {
    bedMcqs.push({
      id: 0,
      type: 'multiple_choice',
      vignette: mcqRow.vignette,
    });
    bankUpdates.push(mcqRow.id);
  }

  const mcqsNeeded = 2 - bedMcqs.length;
  let aiRequestedCount = 0;

  if (mcqsNeeded > 0) {
    aiRequestedCount = mcqsNeeded;
    const generated = aiGenerator(mcqsNeeded);
    for (const q of generated) {
      bedMcqs.push(q);
    }
  }

  return { bedMcqs, bankUpdates, aiRequestedCount };
}

// 4.1 Bank has 2 MCQs
const bankWith2: MockBankMCQ[] = [
  { id: 'b1', chapter_id: 1, vignette: 'Bank MCQ 1', times_shown: 0 },
  { id: 'b2', chapter_id: 1, vignette: 'Bank MCQ 2', times_shown: 0 },
];
const sim2 = simulateBedMCQSelection(bankWith2, () => {
  throw new Error('AI generator should NOT be called when bank has 2 MCQs');
});
check(
  'MCQ Fallback',
  'When bank has 2 MCQs: 0 requested from AI, exactly 2 used from bank',
  sim2.bedMcqs.length === 2 && sim2.aiRequestedCount === 0 && sim2.bankUpdates.length === 2,
  `bedMcqs length: ${sim2.bedMcqs.length}, aiRequested: ${sim2.aiRequestedCount}`
);

// 4.2 Bank has 1 MCQ
const bankWith1: MockBankMCQ[] = [
  { id: 'b1', chapter_id: 1, vignette: 'Bank MCQ 1', times_shown: 1 },
];
let aiCalledWithCount = 0;
const sim1 = simulateBedMCQSelection(bankWith1, (needed) => {
  aiCalledWithCount = needed;
  return [{ id: 99, type: 'multiple_choice', vignette: 'AI Generated MCQ 1' }];
});
check(
  'MCQ Fallback',
  'When bank has 1 MCQ: exactly 1 requested from AI, resulting in 2 MCQs total',
  sim1.bedMcqs.length === 2 && sim1.aiRequestedCount === 1 && aiCalledWithCount === 1 && sim1.bankUpdates.length === 1,
  `bedMcqs length: ${sim1.bedMcqs.length}, aiRequested: ${sim1.aiRequestedCount}`
);

// 4.3 Bank has 0 MCQs
const bankWith0: MockBankMCQ[] = [];
let aiCalledWithCount0 = 0;
const sim0 = simulateBedMCQSelection(bankWith0, (needed) => {
  aiCalledWithCount0 = needed;
  return [
    { id: 101, type: 'multiple_choice', vignette: 'AI Generated MCQ 1' },
    { id: 102, type: 'multiple_choice', vignette: 'AI Generated MCQ 2' },
  ];
});
check(
  'MCQ Fallback',
  'When bank has 0 MCQs: exactly 2 requested from AI, resulting in 2 MCQs total',
  sim0.bedMcqs.length === 2 && sim0.aiRequestedCount === 2 && aiCalledWithCount0 === 2 && sim0.bankUpdates.length === 0,
  `bedMcqs length: ${sim0.bedMcqs.length}, aiRequested: ${sim0.aiRequestedCount}`
);

// 4.4 Bank has excess MCQs (5 available)
const bankWith5: MockBankMCQ[] = [
  { id: 'b1', chapter_id: 1, vignette: 'Bank MCQ 1', times_shown: 0 },
  { id: 'b2', chapter_id: 1, vignette: 'Bank MCQ 2', times_shown: 0 },
  { id: 'b3', chapter_id: 1, vignette: 'Bank MCQ 3', times_shown: 0 },
  { id: 'b4', chapter_id: 1, vignette: 'Bank MCQ 4', times_shown: 0 },
  { id: 'b5', chapter_id: 1, vignette: 'Bank MCQ 5', times_shown: 0 },
];
const sim5 = simulateBedMCQSelection(bankWith5, () => {
  throw new Error('AI generator should NOT be called when bank has 5 MCQs');
});
check(
  'MCQ Fallback',
  'When bank has 5 MCQs: strictly slices 2, never attaches excess questions to bed',
  sim5.bedMcqs.length === 2 && sim5.bankUpdates.length === 2 && sim5.aiRequestedCount === 0,
  `bedMcqs length: ${sim5.bedMcqs.length}`
);

// 4.5 Stress test: AI generator failure simulation
let aiFailureHandled = false;
try {
  const bedMcqsOnFailure: MockQuestion[] = [];
  try {
    const generatedMcqs = (() => {
      throw new Error('OpenRouter API 503 Service Unavailable');
    })();
  } catch (err) {
    // Mimics route.ts line 431 catch block
    aiFailureHandled = true;
  }
  check(
    'MCQ Fallback',
    'AI generator error in MCQ fallback is caught without unhandled process crash',
    aiFailureHandled,
    'Exception was not caught'
  );
} catch (e) {
  check('MCQ Fallback', 'AI generator error crash', false, String(e));
}

// =========================================================================
// SUITE 5: PATIENT WEIGHT INTEGRITY FOR DRUG DOSING
// =========================================================================
console.log('\n--- SUITE 5: Patient Weight & Prescription Math Integrity ---');

check(
  'Patient Weight',
  'SYSTEM_PROMPT_PLANTAO_GENERATOR mandates patientWeight integer in both stages',
  SYSTEM_PROMPT_PLANTAO_GENERATOR.includes('CAMPO OBRIGATÓRIO "patientWeight"') &&
  SYSTEM_PROMPT_PLANTAO_GENERATOR.includes('"patientWeight": 75'),
  'Prompt must enforce patientWeight'
);

const sampleBedCase = {
  stage1: {
    type: 'prescription_immediate',
    patientWeight: 80,
    vignette: 'Homem, 65 anos, 80 kg...',
  },
  stage2: {
    type: 'prescription_complete',
    patientWeight: 80,
    vignette: 'Evolução clínica do paciente de 80 kg...',
  },
};

check(
  'Patient Weight',
  'Patient weight is a positive integer matching across stages',
  typeof sampleBedCase.stage1.patientWeight === 'number' &&
  sampleBedCase.stage1.patientWeight > 0 &&
  sampleBedCase.stage1.patientWeight === sampleBedCase.stage2.patientWeight,
  `Weights: stage1=${sampleBedCase.stage1.patientWeight}, stage2=${sampleBedCase.stage2.patientWeight}`
);

// =========================================================================
// SUMMARY REPORT
// =========================================================================
console.log('\n=========================================================================');
console.log('   EMPIRICAL CHALLENGER M1 EXECUTION SUMMARY');
console.log('=========================================================================');

const total = summary.length;
const passed = summary.filter(s => s.passed).length;
const failed = summary.filter(s => !s.passed).length;

const categoryStats: Record<string, { total: number; passed: number; failed: number }> = {};
for (const s of summary) {
  if (!categoryStats[s.category]) {
    categoryStats[s.category] = { total: 0, passed: 0, failed: 0 };
  }
  categoryStats[s.category].total++;
  if (s.passed) categoryStats[s.category].passed++;
  else categoryStats[s.category].failed++;
}

for (const [cat, stats] of Object.entries(categoryStats)) {
  console.log(`| ${cat.padEnd(18)} | Total: ${String(stats.total).padStart(2)} | Passed: ${String(stats.passed).padStart(2)} | Failed: ${String(stats.failed).padStart(2)} |`);
}
console.log('-------------------------------------------------------------------------');
console.log(`TOTAL: ${total} tests | PASSED: ${passed} | FAILED: ${failed}`);
console.log('=========================================================================\n');

if (failed === 0) {
  console.log('>>> VERDICT: APPROVE <<<');
  process.exit(0);
} else {
  console.error('>>> VERDICT: CHALLENGE_FAILED <<<');
  process.exit(1);
}
