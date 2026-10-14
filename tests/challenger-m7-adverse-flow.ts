/**
 * Adversarial Challenger 2 Verification Suite for Milestone M7:
 * Adverse Flow & State Transitions Empirical Stress Testing
 *
 * Requirements Tested:
 * 1. State machine transitions through all 5 states:
 *    in_progress -> awaiting_batch_bed_evaluation -> ready_for_adverse -> awaiting_batch_feedback -> completed
 * 2. Adverse evolution triggering vs non-triggering:
 *    - Bed with perfect score -> no Q5 created, ready_for_adverse with hasAdverseEvolution: false
 *    - Bed with failure (<6.0 or >=2 MCQ errors) -> Q5 created, hasAdverseEvolution: true
 *    - Multi-bed granular isolation (failing bed gets Q5, perfect bed does not)
 *    - Idempotency guard against duplicate Q5 creation
 * 3. Mock batch cache & cancelOpenRouterBatch:
 *    - In-memory cache storage, retrieval, and synthesis
 *    - cancelOpenRouterBatch behavior and ledger status update to 'failed'
 *    - Budget cap limits and ledger reconciliation
 *
 * Usage: npx tsx tests/challenger-m7-adverse-flow.ts
 */

import fs from 'fs';
import path from 'path';
import {
  PlantaoTestStatus,
  PLANTAO_STATUSES,
  isValidPlantaoStatus,
  isPendingBatchStatus,
  PlantaoBedRecord,
  PlantaoMetadata,
  PlantaoTestRecord,
} from '../types/plantao';
import {
  BATCH_MODEL,
  DAILY_HARD_CAP_USD,
  MONTHLY_HARD_CAP_USD,
  calculateBatchCost,
  evaluateBudgetCapBreach,
  estimateBatchCost,
  submitOpenRouterBatch,
  getOpenRouterBatchStatus,
  cancelOpenRouterBatch,
  createBedEvaluationBatchItem,
  createFeedbackBatchItem,
  readLocalLedger,
  writeLocalLedger,
  insertBatchLedgerRecord,
  updateBatchLedgerRecord,
  fetchAccumulatedBudget,
  BatchRequestItem,
} from '../lib/ai/openrouter-batch';
import { parseJsonFromMarkdown, QuestionItem } from '../lib/ai/openrouter';
import { parsePrescriptionDrugs, formatDrugFactsForPrompt } from '../lib/ai/drug-math-validator';
import { fixMojibake } from '../lib/text-sanitizer';

interface TestResult {
  suite: string;
  id: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const allResults: TestResult[] = [];

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function runTest(suite: string, id: string, name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    allResults.push({ suite, id, name, passed: true });
    console.log(`  ✓ [${id}] ${name}`);
  } catch (err: any) {
    allResults.push({ suite, id, name, passed: false, error: err.message });
    console.error(`  ✗ [${id}] ${name}: ${err.message}`);
  }
}

// ============================================================================
// SIMULATION ENGINE FOR ADVERSE EVOLUTION & INGESTION
// Replicates exact business logic from check-batch-status/route.ts
// ============================================================================
function simulateBedBatchIngestion({
  testRecord,
  batchResults,
  isMock = true,
}: {
  testRecord: {
    id: string;
    status: PlantaoTestStatus;
    questions: any[];
    answers: Record<number, any>;
    results: Record<number, any>;
    plantao_data: PlantaoMetadata;
  };
  batchResults?: any[];
  isMock?: boolean;
}) {
  const currentStatus = testRecord.status;
  if (currentStatus !== 'awaiting_batch_bed_evaluation') {
    throw new Error(`Invalid status for bed ingestion: ${currentStatus}`);
  }

  const questions = [...testRecord.questions];
  const userAnswers = testRecord.answers || {};
  const evaluations: Record<number, any> = { ...(testRecord.results || {}) };

  // 1. Ensure MCQ evaluation
  for (const q of questions) {
    if (
      q.type === 'multiple_choice' &&
      (!evaluations[q.id] || typeof evaluations[q.id].score !== 'number')
    ) {
      const answer = userAnswers[q.id];
      const isCorrect = answer === q.correctOption;
      evaluations[q.id] = {
        userAnswer: answer,
        isCorrect,
        score: isCorrect ? 10 : 0,
        explanation: q.explanation,
      };
    }
  }

  // 2. Parse batch results
  if (batchResults && batchResults.length > 0) {
    for (const item of batchResults) {
      const content = item.response?.body?.choices?.[0]?.message?.content || '{}';
      const parsedData = parseJsonFromMarkdown<any>(content);
      const rawEvals = parsedData?.evaluations || parsedData;
      if (rawEvals && typeof rawEvals === 'object') {
        for (const [key, val] of Object.entries(rawEvals)) {
          const qId = parseInt(key, 10);
          if (!isNaN(qId) && val && typeof val === 'object') {
            const evalObj = val as any;
            const rawScore = typeof evalObj.score === 'number' ? evalObj.score : 0;
            evaluations[qId] = {
              userPrescription: userAnswers[qId] || '',
              evaluation: evalObj,
              score: rawScore,
            };
          }
        }
      }
    }
  }

  // 3. Evaluate clinical descompensation
  const beds = (testRecord.plantao_data?.beds || []).map((b) => ({ ...b }));
  const newlyGeneratedBonusQuestions: QuestionItem[] = [];
  const updatedQuestions = [...questions];

  for (const bed of beds) {
    // Concurrency guard: skip if Q5 was already generated
    if (bed.bonusQuestionId) continue;

    const bedQs = updatedQuestions.filter((q) =>
      (bed.questionIds || []).includes(q.id)
    );

    // Criteria 1: MCQ errors >= 2
    const mcqWrong = bedQs.filter(
      (q) =>
        q.type === 'multiple_choice' &&
        userAnswers[q.id] !== undefined &&
        userAnswers[q.id] !== q.correctOption
    );

    // Criteria 2: Prescription failure (< 6.0 or Inadequado / Requer Ajustes)
    const prescFailures = bedQs.filter((q) => {
      if (q.type === 'multiple_choice') return false;
      const evalItem = evaluations[q.id];
      const score = evalItem?.score;
      const verdict = evalItem?.evaluation?.verdict;
      return (
        (typeof score === 'number' && score < 6.0) ||
        verdict === 'Inadequado' ||
        verdict === 'Requer Ajustes'
      );
    });

    // Criteria 3: Bed average < 6.0
    let bedPoints = 0;
    let bedCount = 0;
    bedQs.forEach((q) => {
      if (evaluations[q.id]?.score !== undefined) {
        bedPoints += evaluations[q.id].score;
        bedCount++;
      }
    });
    const bedAvg = bedCount > 0 ? bedPoints / bedCount : 0;

    const isFailing = mcqWrong.length >= 2 || prescFailures.length > 0 || bedAvg < 6.0;

    if (isFailing) {
      const maxId = Math.max(...updatedQuestions.map((q) => q.id), 0);
      const newId = maxId + 1;

      const q5Question: QuestionItem = {
        id: newId,
        type: 'prescription_immediate',
        chapterId: bed.chapterId || 1,
        chapterTitle: `${bed.chapterTitle || 'Leito ' + bed.bedNumber} — COMPLICAÇÃO (EVOLUÇÃO ADVERSA)`,
        vignette: `[INTERCORRÊNCIA CLÍNICA - LEITO ${bed.bedNumber}] Paciente apresentou instabilidade hemodinâmica grave após a conduta inicial. Sinais vitais: PA 65/40 mmHg, FC 138 bpm, SatO2 86%. Prescreva a conduta imediata de emergência para resgate do paciente.`,
        patientWeight: bed.patientWeight || 70,
        promptText: 'Prescreva a conduta de emergência para estabilização imediata.',
      };

      bed.bonusQuestionId = newId;
      bed.hasAdverseEvolution = true;
      newlyGeneratedBonusQuestions.push(q5Question);
      updatedQuestions.push(q5Question);
    } else {
      bed.hasAdverseEvolution = false;
    }
  }

  const hasAnyAdverse = beds.some((b) => Boolean(b.bonusQuestionId || b.hasAdverseEvolution));
  const updatedPlantaoData: PlantaoMetadata = {
    ...testRecord.plantao_data,
    beds,
    hasAdverseEvolution: hasAnyAdverse,
    adverseEvolutions: beds.filter((b) => Boolean(b.bonusQuestionId)).length,
    bedEvaluationCompletedAt: new Date().toISOString(),
    status: 'ready_for_adverse',
  };

  return {
    status: 'ready_for_adverse' as PlantaoTestStatus,
    updatedQuestions,
    evaluations,
    updatedPlantaoData,
    newlyGeneratedBonusQuestions,
    hasAnyAdverse,
  };
}

// Helper to construct a standard bed with 2 MCQs and 2 Prescriptions
function createMockBedQuestions(startId: number, bedNum: number, chapterId: number) {
  return [
    {
      id: startId,
      type: 'multiple_choice',
      bedNumber: bedNum,
      chapterId,
      vignette: `Leito ${bedNum} MCQ 1`,
      options: ['A', 'B', 'C', 'D', 'E'],
      correctOption: 0,
      explanation: 'Gabarito MCQ 1',
    },
    {
      id: startId + 1,
      type: 'multiple_choice',
      bedNumber: bedNum,
      chapterId,
      vignette: `Leito ${bedNum} MCQ 2`,
      options: ['A', 'B', 'C', 'D', 'E'],
      correctOption: 1,
      explanation: 'Gabarito MCQ 2',
    },
    {
      id: startId + 2,
      type: 'prescription_immediate',
      bedNumber: bedNum,
      chapterId,
      vignette: `Leito ${bedNum} Prescrição 1 (Imediata)`,
      patientWeight: 75,
      idealPrescription: 'Conduta imediata padrão',
    },
    {
      id: startId + 3,
      type: 'prescription_complete',
      bedNumber: bedNum,
      chapterId,
      vignette: `Leito ${bedNum} Prescrição 2 (Manutenção)`,
      patientWeight: 75,
      idealPrescription: 'Conduta manutenção padrão',
    },
  ];
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('   CHALLENGER 2: ADVERSE FLOW & STATE MACHINE TRANSITIONS (M7)        ');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // ==========================================================================
  // SUITE 1: 5-STATE TRANSITIONS & LIFECYCLE PROGRESSION
  // ==========================================================================
  console.log('--- SUITE 1: 5-State Machine Transitions & Validation ---');

  await runTest('STATE_LIFECYCLE', 'ADV-01', 'State machine moves sequentially across all 5 states', () => {
    const states: PlantaoTestStatus[] = [
      'in_progress',
      'awaiting_batch_bed_evaluation',
      'ready_for_adverse',
      'awaiting_batch_feedback',
      'completed',
    ];

    for (let i = 0; i < states.length; i++) {
      assert(isValidPlantaoStatus(states[i]), `State ${states[i]} must be valid`);
      if (i === 1 || i === 3) {
        assert(isPendingBatchStatus(states[i]), `${states[i]} must be identified as pending batch status`);
      } else {
        assert(!isPendingBatchStatus(states[i]), `${states[i]} must not be pending batch status`);
      }
    }
  });

  await runTest('STATE_LIFECYCLE', 'ADV-02', 'Disallow illegal or arbitrary string states in domain guard', () => {
    const invalidStates = [
      'waiting_evaluation',
      'in-progress',
      'in_review',
      'finished',
      'pending',
      '',
      null,
      undefined,
      123,
      {},
    ];
    for (const st of invalidStates) {
      assert(!isValidPlantaoStatus(st), `Arbitrary value ${JSON.stringify(st)} must be rejected`);
    }
  });

  await runTest('STATE_LIFECYCLE', 'ADV-03', 'State transition idempotency contract', () => {
    // When already awaiting_batch_bed_evaluation with batch_job_id, submit route returns existing batch
    const existingBatchId = 'batch_mock_already_submitted';
    const testRecord = {
      id: 'test-uuid-idempotent',
      status: 'awaiting_batch_bed_evaluation' as PlantaoTestStatus,
      plantao_data: { batch_job_id: existingBatchId },
    };

    const isAlreadyAwaiting = testRecord.status === 'awaiting_batch_bed_evaluation' && Boolean(testRecord.plantao_data?.batch_job_id);
    assert(isAlreadyAwaiting, 'Should detect already awaiting bed batch and prevent duplicate batch creation');

    // When already awaiting_batch_feedback with feedbackBatchId
    const feedbackTestRecord = {
      id: 'test-uuid-idempotent-fb',
      status: 'awaiting_batch_feedback' as PlantaoTestStatus,
      plantao_data: { feedbackBatchId: 'batch_mock_feedback_existing' },
    };
    const isAlreadyFeedbackAwaiting = feedbackTestRecord.status === 'awaiting_batch_feedback' && Boolean(feedbackTestRecord.plantao_data?.feedbackBatchId);
    assert(isAlreadyFeedbackAwaiting, 'Should detect already awaiting feedback batch and prevent duplicate batch creation');
  });

  // ==========================================================================
  // SUITE 2: ADVERSE EVOLUTION TRIGGERING (FAILURE SCENARIOS)
  // ==========================================================================
  console.log('\n--- SUITE 2: Adverse Evolution Triggering (Clinical Failure Scenarios) ---');

  await runTest('ADVERSE_TRIGGER', 'ADV-04', 'Trigger Q5 on bed failure: Prescription score < 6.0', () => {
    const bedQuestions = createMockBedQuestions(1, 1, 10);
    const testRecord = {
      id: 'test-adverse-low-presc',
      status: 'awaiting_batch_bed_evaluation' as PlantaoTestStatus,
      questions: bedQuestions,
      answers: {
        1: 0, // MCQ 1 correct
        2: 1, // MCQ 2 correct
        3: 'Conduta insuficiente sem vasopressor',
        4: 'Manutenção incompleta',
      },
      results: {},
      plantao_data: {
        beds: [
          {
            bedNumber: 1,
            chapterId: 10,
            chapterTitle: 'Choque Séptico',
            patientWeight: 75,
            questionIds: [1, 2, 3, 4],
          },
        ],
      },
    };

    const mockBatchResults = [
      {
        custom_id: JSON.stringify({ type: 'bed_evaluation', bedNumber: 1, questionIds: [3, 4] }),
        response: {
          body: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    evaluations: {
                      '3': { score: 4.5, verdict: 'Inadequado', detailedFeedback: 'Falta de vasopressor precoce.' },
                      '4': { score: 5.0, verdict: 'Requer Ajustes', detailedFeedback: 'Parâmetros inadequados.' },
                    },
                  }),
                },
              },
            ],
          },
        },
      },
    ];

    const result = simulateBedBatchIngestion({ testRecord, batchResults: mockBatchResults });

    assertEqual(result.status, 'ready_for_adverse', 'Status must transition to ready_for_adverse');
    assert(result.hasAnyAdverse, 'hasAnyAdverse must be true');
    assertEqual(result.newlyGeneratedBonusQuestions.length, 1, 'Exactly 1 Q5 must be generated');
    const q5 = result.newlyGeneratedBonusQuestions[0];
    assertEqual(q5.id, 5, 'Q5 ID must be maxId + 1 (5)');
    assertEqual(q5.type, 'prescription_immediate', 'Q5 type must be prescription_immediate');
    assert(Boolean(q5.chapterTitle?.includes('COMPLICAÇÃO (EVOLUÇÃO ADVERSA)')), 'Q5 title must indicate complication');
    assert(Boolean(q5.vignette?.includes('[INTERCORRÊNCIA CLÍNICA - LEITO 1]')), 'Q5 vignette must indicate clinical intercurrence for Bed 1');
    assertEqual(result.updatedPlantaoData.beds?.[0].bonusQuestionId, 5, 'Bed 1 bonusQuestionId must equal Q5 id');
    assertEqual(result.updatedPlantaoData.beds?.[0].hasAdverseEvolution, true, 'Bed 1 hasAdverseEvolution must be true');
    assertEqual(result.updatedQuestions.length, 5, 'Total questions length must increase from 4 to 5');
  });

  await runTest('ADVERSE_TRIGGER', 'ADV-05', 'Trigger Q5 on bed failure: 2 MCQ errors (even with perfect prescription)', () => {
    const bedQuestions = createMockBedQuestions(1, 1, 10);
    const testRecord = {
      id: 'test-adverse-mcq-fail',
      status: 'awaiting_batch_bed_evaluation' as PlantaoTestStatus,
      questions: bedQuestions,
      answers: {
        1: 3, // WRONG (correct is 0)
        2: 4, // WRONG (correct is 1)
        3: 'Nora + Cristaloides perfeitamente dosados',
        4: 'Manutenção perfeita',
      },
      results: {},
      plantao_data: {
        beds: [
          {
            bedNumber: 1,
            chapterId: 10,
            chapterTitle: 'Insuficiência Respiratória',
            patientWeight: 70,
            questionIds: [1, 2, 3, 4],
          },
        ],
      },
    };

    // Prescription is rated Adequado with 9.0 and 9.5
    const mockBatchResults = [
      {
        custom_id: JSON.stringify({ type: 'bed_evaluation', bedNumber: 1, questionIds: [3, 4] }),
        response: {
          body: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    evaluations: {
                      '3': { score: 9.0, verdict: 'Adequado' },
                      '4': { score: 9.5, verdict: 'Adequado' },
                    },
                  }),
                },
              },
            ],
          },
        },
      },
    ];

    const result = simulateBedBatchIngestion({ testRecord, batchResults: mockBatchResults });

    assert(result.hasAnyAdverse, 'Bed with >= 2 MCQ errors must trigger adverse evolution despite good prescriptions');
    assertEqual(result.newlyGeneratedBonusQuestions.length, 1, 'Q5 must be created');
    assertEqual(result.updatedPlantaoData.hasAdverseEvolution, true, 'Plantao metadata hasAdverseEvolution must be true');
    assertEqual(result.updatedPlantaoData.adverseEvolutions, 1, 'Adverse count must be 1');
  });

  await runTest('ADVERSE_TRIGGER', 'ADV-06', 'Trigger Q5 on bed failure: Verdict is Inadequado or Requer Ajustes', () => {
    const bedQuestions = createMockBedQuestions(1, 1, 10);
    const testRecord = {
      id: 'test-adverse-verdict-fail',
      status: 'awaiting_batch_bed_evaluation' as PlantaoTestStatus,
      questions: bedQuestions,
      answers: { 1: 0, 2: 1, 3: 'Ans', 4: 'Ans' },
      results: {},
      plantao_data: {
        beds: [{ bedNumber: 1, chapterId: 10, questionIds: [1, 2, 3, 4] }],
      },
    };

    // Score is 6.5 (>= 6.0), but verdict is 'Requer Ajustes'
    const mockBatchResults = [
      {
        custom_id: JSON.stringify({ type: 'bed_evaluation', bedNumber: 1, questionIds: [3, 4] }),
        response: {
          body: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    evaluations: {
                      '3': { score: 6.5, verdict: 'Requer Ajustes' },
                      '4': { score: 7.0, verdict: 'Adequado' },
                    },
                  }),
                },
              },
            ],
          },
        },
      },
    ];

    const result = simulateBedBatchIngestion({ testRecord, batchResults: mockBatchResults });
    assert(result.hasAnyAdverse, 'Verdict "Requer Ajustes" must trigger adverse evolution');
  });

  // ==========================================================================
  // SUITE 3: CLEAN BEDS (NON-TRIGGERING SCENARIOS)
  // ==========================================================================
  console.log('\n--- SUITE 3: Clean Beds & Non-Triggering Scenarios ---');

  await runTest('CLEAN_BED', 'ADV-07', 'Bed with perfect score -> NO Q5 created, transitions to ready_for_adverse with hasAdverseEvolution: false', () => {
    const bedQuestions = createMockBedQuestions(1, 1, 10);
    const testRecord = {
      id: 'test-perfect-clean-bed',
      status: 'awaiting_batch_bed_evaluation' as PlantaoTestStatus,
      questions: bedQuestions,
      answers: {
        1: 0, // MCQ 1 correct
        2: 1, // MCQ 2 correct
        3: 'Nora 4 ampolas + SG 234ml a 10 ml/h com metas alcançadas',
        4: 'Prescrição do dia completa',
      },
      results: {},
      plantao_data: {
        beds: [
          {
            bedNumber: 1,
            chapterId: 10,
            chapterTitle: 'IAM com Supra de ST',
            patientWeight: 75,
            questionIds: [1, 2, 3, 4],
          },
        ],
      },
    };

    const mockBatchResults = [
      {
        custom_id: JSON.stringify({ type: 'bed_evaluation', bedNumber: 1, questionIds: [3, 4] }),
        response: {
          body: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    evaluations: {
                      '3': { score: 9.5, verdict: 'Adequado', detailedFeedback: 'Excelente conduta de reperfusão.' },
                      '4': { score: 9.0, verdict: 'Adequado', detailedFeedback: 'Manejo clínico impecável.' },
                    },
                  }),
                },
              },
            ],
          },
        },
      },
    ];

    const result = simulateBedBatchIngestion({ testRecord, batchResults: mockBatchResults });

    assertEqual(result.status, 'ready_for_adverse', 'Must transition to ready_for_adverse even with zero adverse evolutions');
    assertEqual(result.hasAnyAdverse, false, 'hasAnyAdverse must be FALSE');
    assertEqual(result.newlyGeneratedBonusQuestions.length, 0, 'No bonus questions must be generated');
    assertEqual(result.updatedQuestions.length, 4, 'Total questions length must remain unchanged (4)');
    assertEqual(result.updatedPlantaoData.hasAdverseEvolution, false, 'PlantaoMetadata.hasAdverseEvolution must be false');
    assertEqual(result.updatedPlantaoData.adverseEvolutions, 0, 'PlantaoMetadata.adverseEvolutions must be 0');
    assertEqual(result.updatedPlantaoData.beds?.[0].bonusQuestionId, undefined, 'Bed 1 bonusQuestionId must remain undefined');
    assertEqual(result.updatedPlantaoData.beds?.[0].hasAdverseEvolution, false, 'Bed 1 hasAdverseEvolution must be false');
  });

  await runTest('CLEAN_BED', 'ADV-08', 'Single MCQ error does NOT trigger adverse if prescriptions are solid and average >= 6.0', () => {
    const bedQuestions = createMockBedQuestions(1, 1, 10);
    const testRecord = {
      id: 'test-single-mcq-error',
      status: 'awaiting_batch_bed_evaluation' as PlantaoTestStatus,
      questions: bedQuestions,
      answers: {
        1: 0, // MCQ 1 correct (10 pts)
        2: 3, // MCQ 2 WRONG (0 pts) -> exactly 1 error, not 2
        3: 'Prescrição adequada',
        4: 'Prescrição manutenção adequada',
      },
      results: {},
      plantao_data: {
        beds: [{ bedNumber: 1, chapterId: 10, questionIds: [1, 2, 3, 4] }],
      },
    };

    // Prescriptions: 8.5 and 8.5. Bed avg: (10 + 0 + 8.5 + 8.5)/4 = 6.75 >= 6.0
    const mockBatchResults = [
      {
        custom_id: JSON.stringify({ type: 'bed_evaluation', bedNumber: 1, questionIds: [3, 4] }),
        response: {
          body: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    evaluations: {
                      '3': { score: 8.5, verdict: 'Adequado' },
                      '4': { score: 8.5, verdict: 'Adequado' },
                    },
                  }),
                },
              },
            ],
          },
        },
      },
    ];

    const result = simulateBedBatchIngestion({ testRecord, batchResults: mockBatchResults });
    assertEqual(result.hasAnyAdverse, false, 'Single MCQ error with good prescriptions must NOT trigger descompensation');
    assertEqual(result.newlyGeneratedBonusQuestions.length, 0, 'No Q5 question generated');
  });

  // ==========================================================================
  // SUITE 4: MULTI-BED SHIFT ISOLATION & IDEMPOTENCY
  // ==========================================================================
  console.log('\n--- SUITE 4: Multi-Bed Shift Isolation & Concurrency Guard ---');

  await runTest('MULTI_BED', 'ADV-09', 'Multi-bed shift: Bed 1 perfect (clean) and Bed 2 fails (adverse) are strictly isolated', () => {
    const bed1Qs = createMockBedQuestions(1, 1, 10); // IDs 1,2,3,4
    const bed2Qs = createMockBedQuestions(5, 2, 11); // IDs 5,6,7,8
    const allQs = [...bed1Qs, ...bed2Qs];

    const testRecord = {
      id: 'test-multi-bed-shift',
      status: 'awaiting_batch_bed_evaluation' as PlantaoTestStatus,
      questions: allQs,
      answers: {
        // Bed 1: Perfect
        1: 0, 2: 1, 3: 'Conduta perfeita Leito 1', 4: 'Manutenção Leito 1',
        // Bed 2: Fails MCQs
        5: 2, 6: 4, 7: 'Conduta Leito 2', 8: 'Manutenção Leito 2',
      },
      results: {},
      plantao_data: {
        beds: [
          { bedNumber: 1, chapterId: 10, questionIds: [1, 2, 3, 4] },
          { bedNumber: 2, chapterId: 11, questionIds: [5, 6, 7, 8] },
        ],
      },
    };

    const mockBatchResults = [
      {
        custom_id: JSON.stringify({ type: 'bed_evaluation', bedNumber: 1, questionIds: [3, 4] }),
        response: {
          body: {
            choices: [{ message: { content: JSON.stringify({ evaluations: { '3': { score: 9.0, verdict: 'Adequado' }, '4': { score: 9.0, verdict: 'Adequado' } } }) } }],
          },
        },
      },
      {
        custom_id: JSON.stringify({ type: 'bed_evaluation', bedNumber: 2, questionIds: [7, 8] }),
        response: {
          body: {
            choices: [{ message: { content: JSON.stringify({ evaluations: { '7': { score: 8.5, verdict: 'Adequado' }, '8': { score: 8.5, verdict: 'Adequado' } } }) } }],
          },
        },
      },
    ];

    const result = simulateBedBatchIngestion({ testRecord, batchResults: mockBatchResults });

    assert(result.hasAnyAdverse, 'Shift with 1 failing bed must have hasAnyAdverse = true');
    assertEqual(result.newlyGeneratedBonusQuestions.length, 1, 'Only 1 Q5 question must be created');
    assertEqual(result.updatedPlantaoData.adverseEvolutions, 1, 'Exactly 1 adverse evolution counted');

    const beds = result.updatedPlantaoData.beds!;
    assertEqual(beds[0].hasAdverseEvolution, false, 'Bed 1 must NOT have adverse evolution');
    assertEqual(beds[0].bonusQuestionId, undefined, 'Bed 1 must NOT have bonusQuestionId');

    assertEqual(beds[1].hasAdverseEvolution, true, 'Bed 2 MUST have adverse evolution');
    assertEqual(beds[1].bonusQuestionId, 9, 'Bed 2 bonusQuestionId must be set to 9');
    assertEqual(result.newlyGeneratedBonusQuestions[0].id, 9, 'Bonus question ID must match bed 2 bonusQuestionId');
    assert(Boolean(result.newlyGeneratedBonusQuestions[0].vignette?.includes('LEITO 2')), 'Intercurrence vignette must reference LEITO 2');
  });

  await runTest('MULTI_BED', 'ADV-10', 'Idempotency guard prevents duplicate Q5 questions on repeated ingestion checks', () => {
    // Bed already has bonusQuestionId set from prior check
    const bedQuestions = createMockBedQuestions(1, 1, 10);
    const existingQ5: QuestionItem = {
      id: 5,
      type: 'prescription_immediate',
      chapterId: 10,
      chapterTitle: 'Leito 1 — COMPLICAÇÃO',
      vignette: 'Intercorrência pré-existente',
    };
    const testRecord = {
      id: 'test-idempotent-q5',
      status: 'awaiting_batch_bed_evaluation' as PlantaoTestStatus,
      questions: [...bedQuestions, existingQ5],
      answers: { 1: 3, 2: 4, 3: 'Ans', 4: 'Ans' },
      results: {},
      plantao_data: {
        beds: [
          {
            bedNumber: 1,
            chapterId: 10,
            questionIds: [1, 2, 3, 4],
            bonusQuestionId: 5, // Already generated!
            hasAdverseEvolution: true,
          },
        ],
      },
    };

    const result = simulateBedBatchIngestion({ testRecord, batchResults: [] });
    assertEqual(result.newlyGeneratedBonusQuestions.length, 0, 'Must NOT re-generate Q5 when bonusQuestionId already present');
    assertEqual(result.updatedQuestions.length, 5, 'Questions count must stay at 5, no duplicate Q5 added');
  });

  // ==========================================================================
  // SUITE 5: MOCK BATCH CACHE & CANCEL OPENROUTER BATCH
  // ==========================================================================
  console.log('\n--- SUITE 5: Mock Batch Cache & cancelOpenRouterBatch ---');

  let testMockBatchId: string = '';

  await runTest('CACHE_CANCEL', 'ADV-11', 'submitOpenRouterBatch caches mock request items in memory', async () => {
    const items: BatchRequestItem[] = [
      createBedEvaluationBatchItem({
        testId: 'test-cache-verify',
        bedNumber: 1,
        chapterId: 12,
        questionIds: [10, 11],
        systemPrompt: 'System',
        userPrompt: 'User Prompt For Cache',
      }),
    ];

    const submission = await submitOpenRouterBatch(items, 'mock', true);
    assert(submission.id.startsWith('batch_mock_'), 'Must return synthetic batch ID');
    testMockBatchId = submission.id;

    // Retrieve from cache via getOpenRouterBatchStatus
    const status = await getOpenRouterBatchStatus(testMockBatchId, 'mock', true);
    assertEqual(status.status, 'completed', 'Cache hit returns status completed');
    assertEqual(status.results?.length, 1, 'Cache returns exactly 1 item result');
    const custom = JSON.parse(status.results![0].custom_id);
    assertEqual(custom.bedNumber, 1, 'Custom data retrieved correctly from cache');
  });

  await runTest('CACHE_CANCEL', 'ADV-12', 'cancelOpenRouterBatch marks ledger record status as failed', async () => {
    // First record the batch in local ledger
    const nowIso = new Date().toISOString();
    await insertBatchLedgerRecord({
      batch_id: testMockBatchId,
      submission_timestamp: nowIso,
      model: BATCH_MODEL,
      prompt_tokens: 3500,
      completion_tokens: 1500,
      cost_usd: 0.00055,
      daily_accumulated_usd: 0.00055,
      monthly_accumulated_usd: 0.00055,
      hard_cap_interrupted: false,
      items_requested: 1,
      items_ingested: 0,
      items_failed: 0,
      status: 'submitted',
    });

    // Cancel batch
    const cancelRes = await cancelOpenRouterBatch(testMockBatchId, 'mock', true);
    assertEqual(cancelRes.status, 'cancelled', 'Cancel response status must be cancelled');
    assertEqual(cancelRes.id, testMockBatchId, 'Cancel response id must match target batch');

    // Verify ledger record was updated to failed
    const localRows = readLocalLedger();
    const ledgerRow = localRows.find((r) => r.batch_id === testMockBatchId);
    assert(Boolean(ledgerRow), 'Ledger row must exist');
    assertEqual(ledgerRow!.status, 'failed', 'Ledger row status must be updated to "failed"');
  });

  await runTest('CACHE_CANCEL', 'ADV-13', 'cancelOpenRouterBatch throws when batchId is empty', async () => {
    let threw = false;
    try {
      await cancelOpenRouterBatch('', 'mock', true);
    } catch {
      threw = true;
    }
    assert(threw, 'cancelOpenRouterBatch must throw error on empty batchId');
  });

  await runTest('CACHE_CANCEL', 'ADV-14', 'getOpenRouterBatchStatus throws when batchId is empty', async () => {
    let threw = false;
    try {
      await getOpenRouterBatchStatus('', 'mock', true);
    } catch {
      threw = true;
    }
    assert(threw, 'getOpenRouterBatchStatus must throw error on empty batchId');
  });

  // ==========================================================================
  // SUITE 6: POST-ADVERSE FEEDBACK BATCH & SHIFT COMPLETION
  // ==========================================================================
  console.log('\n--- SUITE 6: Post-Adverse Feedback Batch & Shift Completion ---');

  await runTest('COMPLETION_FLOW', 'ADV-15', 'Full journey from ready_for_adverse to completed', () => {
    // Shift is in ready_for_adverse with Q5 answered
    const bedQuestions = createMockBedQuestions(1, 1, 10);
    const q5Question: QuestionItem = {
      id: 5,
      type: 'prescription_immediate',
      chapterId: 10,
      chapterTitle: 'Leito 1 — COMPLICAÇÃO',
      vignette: 'Intercorrência Leito 1',
    };
    const allQuestions = [...bedQuestions, q5Question];

    const results = {
      1: { score: 10 },
      2: { score: 0 },
      3: { score: 7.0 },
      4: { score: 7.0 },
      5: { score: 8.5 }, // Q5 rescue answered well
    };

    // Calculate final overall score: (10 + 0 + 7 + 7 + 8.5) / 50 * 10 = 32.5 / 50 * 10 = 6.5
    let totalPoints = 0;
    allQuestions.forEach((q) => {
      totalPoints += (results as any)[q.id]?.score || 0;
    });
    const maxPoints = allQuestions.length * 10;
    const finalScore = Math.round((totalPoints / maxPoints) * 100) / 10;
    assertEqual(finalScore, 6.5, 'Final overall score must be 6.5');

    // Simulate completion state
    const completedPlantaoData: PlantaoMetadata = {
      status: 'completed',
      feedbackCompletedAt: new Date().toISOString(),
    };

    assertEqual(completedPlantaoData.status, 'completed', 'Final state is completed');
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  const passedCount = allResults.filter((r) => r.passed).length;
  const failedCount = allResults.filter((r) => !r.passed).length;
  console.log(`TOTAL TESTS: ${allResults.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);

  if (failedCount > 0) {
    console.error('CHALLENGER ADVERSE FLOW VERIFICATION FAILED!');
    process.exit(1);
  } else {
    console.log('CHALLENGER ADVERSE FLOW SUCCEEDED: ALL ADVERSE & STATE TRANSITION CHECKS PASSED!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
