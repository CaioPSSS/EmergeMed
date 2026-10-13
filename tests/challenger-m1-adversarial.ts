/**
 * Challenger 2 Adversarial Stress Test Suite
 * 
 * Deep dive into edge cases, corrupt data, boundary payloads, and stress scenarios.
 */

import { determineBedOutcome, calculateFSRSUpdate, organizePlantaoBeds } from '../lib/spaced-repetition';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, message?: string) {
  if (condition) {
    results.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } else {
    results.push({ name, passed: false, error: message || 'Assertion failed' });
    console.error(`  ✗ ${name}: ${message || 'Assertion failed'}`);
  }
}

console.log('\n=== ADVERSARIAL STRESS TEST 1: RESULTADO PAGE WITH EXTREME / CORRUPTED DATA ===');

function simulateResultadoPageProcessing(testData: any) {
  const score = Number(testData.score) || 0;
  const questions = (testData.questions || []);
  const resultsData = testData.results || {};
  const isPlantao = testData.mode === 'plantao';
  const plantaoData = testData.plantao_data || {};
  const beds = plantaoData.beds || [];

  const getScoreColor = (val: number) => {
    if (val >= 8) return '#34d399';
    if (val >= 6) return '#38bdf8';
    if (val >= 4) return '#fbbf24';
    return '#f43f5e';
  };

  const getStepInfo = (q: any) => {
    if (!isPlantao) return null;
    const parentBed = beds.find(
      (b: any) => (b.questionIds || []).includes(q.id) || b.bonusQuestionId === q.id
    );
    if (!parentBed) return null;

    if (parentBed.bonusQuestionId === q.id) {
      return {
        bedNumber: parentBed.bedNumber,
        step: 'Etapa de Complicação (Bônus)',
        title: 'Manejo de Complicação Adversa',
        color: '#f43f5e',
        bg: 'rgba(244, 63, 94, 0.15)',
      };
    }

    const idxInBed = (parentBed.questionIds || []).indexOf(q.id);
    const firstQInBed = questions.find((item: any) => item.id === parentBed.questionIds?.[0]);
    const isR1Sequence = firstQInBed?.type === 'prescription_immediate';

    if (isR1Sequence) {
      if (idxInBed === 0) return { bedNumber: parentBed.bedNumber, step: 'Etapa 1', title: 'Conduta Imediata de Resgate' };
      if (idxInBed === 1) return { bedNumber: parentBed.bedNumber, step: 'Etapa 2', title: 'Conduta de Manutenção / Ventilação' };
      if (idxInBed === 2) return { bedNumber: parentBed.bedNumber, step: 'Múltipla Escolha 1', title: 'Questão de Múltipla Escolha (1/2)' };
      if (idxInBed === 3) return { bedNumber: parentBed.bedNumber, step: 'Múltipla Escolha 2', title: 'Questão de Múltipla Escolha (2/2)' };
    } else {
      const legacySteps = [
        { step: 'Etapa 1', title: 'Triagem & Suspeita Diagnóstica' },
        { step: 'Etapa 2', title: 'Exames & Confirmação Diagnóstica' },
        { step: 'Etapa 3', title: 'Conduta Imediata de Resgate' },
        { step: 'Etapa 4', title: 'Prescrição do Dia / Ventilação Mecânica' },
      ];
      if (legacySteps[idxInBed]) {
        return { bedNumber: parentBed.bedNumber, ...legacySteps[idxInBed] };
      }
    }

    return { bedNumber: parentBed.bedNumber, step: `Questão ${idxInBed + 1}`, title: 'Fallback' };
  };

  // Process all beds
  const processedBeds = beds.map((bed: any) => {
    const bedQs = questions.filter(
      (q: any) => (bed.questionIds || []).includes(q.id) || bed.bonusQuestionId === q.id
    );
    let bedPoints = 0;
    bedQs.forEach((q: any) => {
      bedPoints += resultsData[q.id]?.score || 0;
    });
    const bedAvgScore = bedQs.length > 0 ? bedPoints / bedQs.length : 0;
    const outcome = determineBedOutcome(bedAvgScore, 10);
    return { bed, bedAvgScore, outcome };
  });

  // Process all questions
  const processedQuestions = questions.map((q: any, idx: number) => {
    const res = resultsData[q.id] || {};
    const qScore = Number(res.score) || 0;
    const stepInfo = getStepInfo(q);
    return { q, qScore, stepInfo };
  });

  return { score, processedBeds, processedQuestions };
}

// Adversarial 1: Null or empty properties
{
  let threw = false;
  try {
    const res = simulateResultadoPageProcessing({
      mode: 'plantao',
      score: null,
      questions: null,
      results: null,
      plantao_data: null,
    });
    assert(res.score === 0, 'Adv 1.1 Handles null score without crash');
    assert(res.processedBeds.length === 0, 'Adv 1.2 Handles null plantao_data gracefully');
    assert(res.processedQuestions.length === 0, 'Adv 1.3 Handles null questions array gracefully');
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'Adv 1.4 No unhandled exceptions on null payload');
}

// Adversarial 2: Legacy Plantão with 12 questions (3 beds x 4 questions)
{
  const legacyTestData = {
    mode: 'plantao',
    score: 7.8,
    plantao_data: {
      beds: [
        { bedNumber: 1, chapterId: 10, chapterTitle: 'SCA', questionIds: [1, 2, 3, 4] },
        { bedNumber: 2, chapterId: 20, chapterTitle: 'AVC', questionIds: [5, 6, 7, 8] },
        { bedNumber: 3, chapterId: 30, chapterTitle: 'Sepse', questionIds: [9, 10, 11, 12] },
      ],
    },
    questions: [
      { id: 1, type: 'multiple_choice', chapterTitle: 'SCA' },
      { id: 2, type: 'multiple_choice', chapterTitle: 'SCA' },
      { id: 3, type: 'prescription_immediate', chapterTitle: 'SCA' },
      { id: 4, type: 'prescription_complete', chapterTitle: 'SCA' },
      { id: 5, type: 'multiple_choice', chapterTitle: 'AVC' },
      { id: 6, type: 'multiple_choice', chapterTitle: 'AVC' },
      { id: 7, type: 'prescription_immediate', chapterTitle: 'AVC' },
      { id: 8, type: 'ventilator', chapterTitle: 'AVC' },
      { id: 9, type: 'multiple_choice', chapterTitle: 'Sepse' },
      { id: 10, type: 'multiple_choice', chapterTitle: 'Sepse' },
      { id: 11, type: 'prescription_immediate', chapterTitle: 'Sepse' },
      { id: 12, type: 'prescription_complete', chapterTitle: 'Sepse' },
    ],
    results: {
      1: { score: 10 }, 2: { score: 0 }, 3: { score: 8.5 }, 4: { score: 9.0 },
      5: { score: 10 }, 6: { score: 10 }, 7: { score: 7.0 }, 8: { score: 8.0 },
      9: { score: 0 }, 10: { score: 10 }, 11: { score: 6.0 }, 12: { score: 7.0 },
    },
  };

  const processed = simulateResultadoPageProcessing(legacyTestData);
  assert(processed.processedBeds.length === 3, 'Adv 2.1 Processes all 3 legacy beds');
  assert(processed.processedQuestions[0].stepInfo?.title === 'Triagem & Suspeita Diagnóstica', 'Adv 2.2 Preserves Legacy Q1 Triagem label');
  assert(processed.processedQuestions[1].stepInfo?.title === 'Exames & Confirmação Diagnóstica', 'Adv 2.3 Preserves Legacy Q2 Exames label');
  assert(processed.processedQuestions[2].stepInfo?.title === 'Conduta Imediata de Resgate', 'Adv 2.4 Preserves Legacy Q3 Imediata label');
  assert(processed.processedQuestions[3].stepInfo?.title === 'Prescrição do Dia / Ventilação Mecânica', 'Adv 2.5 Preserves Legacy Q4 Completa label');
  assert(processed.processedQuestions[7].stepInfo?.title === 'Prescrição do Dia / Ventilação Mecânica', 'Adv 2.6 Preserves Legacy Q8 Ventilator label');
}

// Adversarial 3: Mixed or partial evaluations (user disconnected or model timed out on one bed)
{
  const partialTestData = {
    mode: 'plantao',
    score: 4.5,
    plantao_data: {
      beds: [
        { bedNumber: 1, chapterId: 10, chapterTitle: 'SCA', questionIds: [101, 102, 103, 104] },
      ],
    },
    questions: [
      { id: 101, type: 'prescription_immediate' },
      { id: 102, type: 'prescription_complete' },
      { id: 103, type: 'multiple_choice' },
      { id: 104, type: 'multiple_choice' },
    ],
    results: {
      101: { score: 9.0 },
      // 102 is missing from results!
      103: { score: 10.0 },
      104: { score: 0.0 },
    },
  };

  const processed = simulateResultadoPageProcessing(partialTestData);
  // Missing question 102 should evaluate to 0 in sum without throwing TypeError
  assert(processed.processedBeds[0].bedAvgScore === (9 + 0 + 10 + 0) / 4, 'Adv 3.1 Gracefully handles missing evaluation in bed average score');
  assert(processed.processedQuestions[1].qScore === 0, 'Adv 3.2 Missing evaluation receives score 0 without NaN');
}

// Adversarial 4: organizePlantaoBeds structure verification
{
  const organized = organizePlantaoBeds([1, 2, 3]);
  assert(organized.length === 3, 'Adv 4.1 Organizes exactly 3 beds');
  assert(organized[0].questionSequence[0] === 'prescription_immediate', 'Adv 4.2 Sequence starts with prescription_immediate');
  assert(organized[0].questionSequence[1] === 'prescription_complete', 'Adv 4.3 Sequence continues with prescription_complete');
  assert(organized[0].questionSequence[2] === 'multiple_choice', 'Adv 4.4 Sequence has multiple_choice as Q3');
  assert(organized[0].questionSequence[3] === 'multiple_choice', 'Adv 4.5 Sequence has multiple_choice as Q4');
}

const total = results.length;
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;

console.log('\n====================================================================');
console.log(`CHALLENGER 2 ADVERSARIAL TEST SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
console.log('====================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
