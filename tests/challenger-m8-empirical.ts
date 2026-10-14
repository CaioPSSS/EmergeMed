/**
 * Empirical Challenger Test Suite for Milestone 8:
 * Modal Triggering, Option A/B Execution, HTTP 429 Budget Breach Handling, and Edge Cases.
 *
 * Suites:
 * 1. Verification of baseline tests/challenger-m8-ui-flow.ts
 * 2. Modal Open/Close State Machine (Both Modals)
 * 3. Option A vs Option B Execution Mechanics
 * 4. HTTP 429 Budget Breach Handling & Fallback to Realtime
 * 5. Edge Cases: Empty Answers & Partial Submissions
 * 6. Edge Cases: Double Clicks & Concurrent Rapid Invocations
 * 7. Edge Cases: Unhandled Errors & Network Failures
 *
 * Usage: npx tsx tests/challenger-m8-empirical.ts
 */

import fs from 'fs';
import path from 'path';
import {
  PlantaoTestStatus,
  isPendingBatchStatus,
  isValidPlantaoStatus,
  PlantaoBedRecord,
} from '../types/plantao';

interface AssertionResult {
  suite: string;
  testId: string;
  description: string;
  passed: boolean;
  error?: string;
}

const results: AssertionResult[] = [];

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

async function runTestCase(
  suite: string,
  testId: string,
  description: string,
  fn: () => void | Promise<void>
) {
  try {
    await fn();
    results.push({ suite, testId, description, passed: true });
    console.log(`  ✓ [${testId}] ${description}`);
  } catch (err: any) {
    results.push({ suite, testId, description, passed: false, error: err.message });
    console.error(`  ✗ [${testId}] ${description}: ${err.message}`);
  }
}

// ============================================================================
// SIMULATION ENGINE: Mirrors page.tsx logic exactly
// ============================================================================

interface MockQuestion {
  id: number;
  type: 'multiple_choice' | 'prescription_complete' | 'prescription_immediate' | 'ventilator';
  vignette?: string;
  promptText?: string;
  chapterId?: number;
  chapterTitle?: string;
  options?: string[];
  correctOption?: number;
  idealPrescription?: string;
  evaluationCriteria?: string;
  idealVentilator?: Record<string, string>;
  patientWeight?: number;
  isBonus?: boolean;
}

interface MockTestRecord {
  id: string;
  status: PlantaoTestStatus;
  completed?: boolean;
  answers: Record<number, any>;
  results?: Record<number, any>;
  score?: number;
  plantao_data: {
    status?: PlantaoTestStatus;
    plantaoNumber?: number;
    beds: PlantaoBedRecord[];
    batch_job_id?: string;
    batch_submitted_at?: string;
    feedbackBatchId?: string;
    feedback_batch_submitted_at?: string;
    adverseEvolutions?: number;
    hasAdverseEvolution?: boolean;
    batch_error?: string;
  };
}

class EmpiricalPlantaoHarness {
  testId: string = 'test-audit-001';
  isPlantao: boolean = true;
  currentStatus: PlantaoTestStatus;
  currentIndex: number = 0;
  questions: MockQuestion[];
  beds: PlantaoBedRecord[];
  userAnswers: Record<number, any>;
  cachedEvaluations: Record<number, any>;

  // Modal states
  showDualChoiceModal: boolean = false;
  showFeedbackDualChoiceModal: boolean = false;
  batchBudgetBreach: any | null = null;
  batchFeedbackBudgetBreach: any | null = null;

  // Loading / lock flags
  submitting: boolean = false;
  submittingBatch: boolean = false;
  submittingRealtimeFeedback: boolean = false;
  submittingFeedbackBatch: boolean = false;
  checkingBatchStatus: boolean = false;

  // Notification / error states
  errorMessage: string | null = null;
  batchCheckMessage: string | null = null;
  redirectUrl: string | null = null;
  autoSaveEnabled: boolean = false;
  draftCleared: boolean = false;

  // Window mock hooks
  confirmDialogResult: boolean = true;
  confirmPromptLog: string[] = [];
  alertLog: string[] = [];

  // Network call counters
  networkCalls: Record<string, number> = {};

  // Mock fetch responses
  fetchMocks: Record<string, (body: any) => Promise<{ status: number; ok: boolean; data: any }>> = {};

  constructor(initialRecord: MockTestRecord, initialQuestions: MockQuestion[]) {
    this.currentStatus = (initialRecord.plantao_data?.status || initialRecord.status) as PlantaoTestStatus;
    this.questions = JSON.parse(JSON.stringify(initialQuestions));
    this.beds = JSON.parse(JSON.stringify(initialRecord.plantao_data.beds));
    this.userAnswers = { ...initialRecord.answers };
    this.cachedEvaluations = { ...(initialRecord.results || {}) };

    this.updateAutoSaveCondition();
    this.applyReentry(initialRecord);
  }

  applyReentry(test: MockTestRecord) {
    const rawStatus = (test.plantao_data?.status || test.status) as PlantaoTestStatus;
    this.currentStatus = rawStatus;

    if (rawStatus === 'completed' || test.completed) {
      this.redirectUrl = `/testes/${test.id}/resultado`;
      this.updateAutoSaveCondition();
      return;
    }

    if (rawStatus === 'ready_for_adverse') {
      const adverseIdx = this.questions.findIndex((q) => {
        return q.isBonus || this.beds.some((b) => b.bonusQuestionId === q.id);
      });
      if (adverseIdx !== -1) {
        this.currentIndex = adverseIdx;
      }
    }

    this.updateAutoSaveCondition();
  }

  updateAutoSaveCondition() {
    this.autoSaveEnabled =
      this.currentStatus === 'in_progress' || this.currentStatus === 'ready_for_adverse';
  }

  isQuestionLocked(qId: number): boolean {
    if (this.currentStatus === 'completed') return true;
    if (isPendingBatchStatus(this.currentStatus)) return true;
    if (this.currentStatus === 'ready_for_adverse') {
      const isEmergencyQ =
        this.questions.find((q) => q.id === qId)?.isBonus ||
        this.beds.some((b) => b.bonusQuestionId === qId);
      return !isEmergencyQ;
    }
    return false;
  }

  countUnanswered(): number {
    return this.questions.filter((q) => {
      const answer = this.userAnswers[q.id];
      if (answer === undefined || answer === null) return true;
      if (typeof answer === 'string' && answer.trim() === '') return true;
      if (q.type === 'ventilator' && typeof answer === 'object') {
        return Object.values(answer).every((v) => !v || (v as string).trim() === '');
      }
      return false;
    }).length;
  }

  buildBedsPayload() {
    return this.beds.map((bed: any) => {
      const bedQs = this.questions.filter(
        (q) => (bed.questionIds || []).includes(q.id) || bed.bonusQuestionId === q.id
      );

      const patientWeight =
        bedQs.find((q) => q.patientWeight)?.patientWeight ||
        (bedQs[0]?.vignette?.match(/(\d{2,3})\s*kg\b/i)
          ? parseInt(bedQs[0].vignette.match(/(\d{2,3})\s*kg\b/i)![1], 10)
          : 70);

      const mcqResults = bedQs
        .filter((q) => q.type === 'multiple_choice')
        .map((q) => ({
          id: q.id,
          vignette: q.vignette,
          userAnswer: q.options?.[this.userAnswers[q.id]] || 'Não respondida',
          isCorrect: this.userAnswers[q.id] === q.correctOption,
          explanation: (q as any).explanation,
        }));

      const prescriptionsPayload = bedQs
        .filter((q) => q.type !== 'multiple_choice')
        .map((q) => {
          if (q.type === 'ventilator') {
            const ventilatorData = (this.userAnswers[q.id] as Record<string, string>) || {};
            const userPrescription = Object.entries(ventilatorData)
              .map(([k, v]) => `${k}: ${v || '(vazio)'}`)
              .join('\n');
            return {
              id: q.id,
              type: q.type,
              vignette: q.vignette,
              userPrescription,
              idealPrescription: q.idealVentilator
                ? Object.entries(q.idealVentilator).map(([k, v]) => `${k}: ${v}`).join('\n')
                : undefined,
              evaluationCriteria: q.evaluationCriteria,
              ventilatorData,
            };
          } else {
            const userPrescription = this.userAnswers[q.id] || 'Sem resposta enviada';
            return {
              id: q.id,
              type: q.type,
              vignette: q.vignette,
              userPrescription,
              idealPrescription: q.idealPrescription,
              evaluationCriteria: q.evaluationCriteria,
            };
          }
        });

      return {
        bedNumber: bed.bedNumber,
        patientWeight,
        chapterId: bed.chapterId || bedQs[0]?.chapterId,
        chapterTitle: bed.chapterTitle || `Leito ${bed.bedNumber}`,
        mcqResults,
        prescriptionsPayload,
      };
    });
  }

  private mockFetch(endpoint: string, body: any): Promise<{ status: number; ok: boolean; data: any }> {
    this.networkCalls[endpoint] = (this.networkCalls[endpoint] || 0) + 1;
    if (this.fetchMocks[endpoint]) {
      return this.fetchMocks[endpoint](body);
    }
    return Promise.resolve({ status: 200, ok: true, data: {} });
  }

  // --- Handlers from page.tsx ---

  async handleInitiateCompletion(): Promise<void> {
    if (!this.isPlantao) {
      await this.handleSubmitTest();
      return;
    }

    if (this.currentStatus === 'ready_for_adverse') {
      const unansweredCount = this.countUnanswered();
      if (unansweredCount > 0) {
        this.confirmPromptLog.push(`Unanswered in ready_for_adverse: ${unansweredCount}`);
        if (!this.confirmDialogResult) return;
      }
      await this.handleSubmitTest();
      return;
    }

    const unansweredCount = this.countUnanswered();
    if (unansweredCount > 0) {
      this.confirmPromptLog.push(`Unanswered in in_progress: ${unansweredCount}`);
      if (!this.confirmDialogResult) return;
    }

    this.batchBudgetBreach = null;
    this.showDualChoiceModal = true;
  }

  async handleSelectOptionA_Realtime(): Promise<void> {
    this.showDualChoiceModal = false;
    this.batchBudgetBreach = null;
    await this.handleSubmitTest();
  }

  async handleSelectOptionB_Batch(): Promise<void> {
    if (this.submittingBatch) return; // double-click protection
    this.submittingBatch = true;
    this.batchBudgetBreach = null;
    this.errorMessage = null;

    try {
      const bedsDataPayload = this.buildBedsPayload();
      const res = await this.mockFetch('/api/plantao/submit-batch', {
        testId: this.testId,
        bedsData: bedsDataPayload,
        userAnswers: this.userAnswers,
      });

      if (res.status === 429 || res.data.budgetBreach) {
        this.batchBudgetBreach = {
          error: res.data.error || 'Limite diário de $0.15 ou mensal de $0.90 atingido.',
          reason: res.data.reason,
          dailyAccumulated: res.data.dailyAccumulated,
          monthlyAccumulated: res.data.monthlyAccumulated,
        };
        return;
      }

      if (!res.ok) {
        throw new Error(res.data.error || 'Erro ao submeter lote de leitos.');
      }

      this.currentStatus = 'awaiting_batch_bed_evaluation';
      this.showDualChoiceModal = false;
      this.draftCleared = true;
      this.updateAutoSaveCondition();
    } catch (err: any) {
      this.errorMessage = err.message || 'Falha ao conectar com o serviço de lotes.';
    } finally {
      this.submittingBatch = false;
    }
  }

  async handleSelectFeedbackOptionA_Realtime(): Promise<void> {
    if (this.submittingRealtimeFeedback) return; // double-click protection
    this.submittingRealtimeFeedback = true;
    this.batchFeedbackBudgetBreach = null;

    try {
      const res = await this.mockFetch('/api/generate-feedback', {
        testId: this.testId,
        overallScore: 8.5,
        evaluationsSummary: [],
      });

      if (!res.ok) {
        throw new Error(res.data.error || 'Erro ao gerar feedback em tempo real.');
      }

      this.draftCleared = true;
      this.showFeedbackDualChoiceModal = false;
      this.currentStatus = 'completed';
      this.updateAutoSaveCondition();
      this.redirectUrl = `/testes/${this.testId}/resultado`;
    } catch (err: any) {
      this.alertLog.push(err.message || 'Falha ao processar correção em tempo real.');
    } finally {
      this.submittingRealtimeFeedback = false;
    }
  }

  async handleSelectFeedbackOptionB_Batch(): Promise<void> {
    if (this.submittingFeedbackBatch) return; // double-click protection
    this.submittingFeedbackBatch = true;
    this.batchFeedbackBudgetBreach = null;

    try {
      const res = await this.mockFetch('/api/plantao/submit-feedback-batch', {
        testId: this.testId,
        overallScore: 8.5,
        evaluationsSummary: [],
      });

      if (res.status === 429 || res.data.budgetBreach) {
        this.batchFeedbackBudgetBreach = {
          error: res.data.error || 'Limite diário de $0.15 ou mensal de $0.90 atingido.',
          reason: res.data.reason,
          dailyAccumulated: res.data.dailyAccumulated,
          monthlyAccumulated: res.data.monthlyAccumulated,
        };
        return;
      }

      if (!res.ok) {
        throw new Error(res.data.error || 'Erro ao submeter lote de feedback.');
      }

      this.currentStatus = 'awaiting_batch_feedback';
      this.draftCleared = true;
      this.showFeedbackDualChoiceModal = false;
      this.updateAutoSaveCondition();
    } catch (err: any) {
      this.alertLog.push(err.message || 'Falha na comunicação com a API de lote.');
    } finally {
      this.submittingFeedbackBatch = false;
    }
  }

  async handleCheckBatchStatus(isManual: boolean = false): Promise<void> {
    if (this.checkingBatchStatus) return; // Concurrency guard
    if (isManual) {
      this.checkingBatchStatus = true;
      this.batchCheckMessage = null;
    }

    try {
      const res = await this.mockFetch('/api/plantao/check-batch-status', { testId: this.testId });

      if (!res.ok) {
        if (isManual) {
          this.batchCheckMessage = `⚠️ ${res.data.error || 'Erro ao consultar lote no OpenRouter.'}`;
        }
        return;
      }

      if (res.data.updated) {
        if (res.data.status === 'completed') {
          this.currentStatus = 'completed';
          this.redirectUrl = `/testes/${this.testId}/resultado`;
          this.updateAutoSaveCondition();
          return;
        }

        if (res.data.status === 'ready_for_adverse') {
          this.currentStatus = 'ready_for_adverse';
          if (res.data.questions) this.questions = res.data.questions;
          if (res.data.results) this.cachedEvaluations = res.data.results;

          if (res.data.hasAdverseEvolution && isManual) {
            this.alertLog.push('⚠️ INTERCORRÊNCIA CLÍNICA DETECTADA!');
          }

          if (isManual) {
            this.batchCheckMessage = '✅ Avaliação do lote concluída com sucesso!';
          }
          this.updateAutoSaveCondition();
        }
      } else {
        if (isManual) {
          this.batchCheckMessage = '⏳ O lote continua na fila de execução do OpenRouter Batch.';
        }
      }
    } catch (err: any) {
      if (isManual) {
        this.batchCheckMessage = `❌ ${err.message || 'Erro ao checar status.'}`;
      }
    } finally {
      if (isManual) this.checkingBatchStatus = false;
    }
  }

  async handleSubmitTest(): Promise<void> {
    this.submitting = true;
    try {
      // Mock evaluation
      const hasFailure = Object.entries(this.userAnswers).some(([k, v]) => {
        return !v || (typeof v === 'string' && v.includes('errada'));
      });

      if (this.currentStatus === 'in_progress' && hasFailure) {
        // Adverse evolution triggered
        const q5: MockQuestion = {
          id: 999,
          type: 'prescription_immediate',
          isBonus: true,
          vignette: 'Paciente descompensou criticamente!',
          chapterTitle: 'Emergência Respiratória Q5',
        };
        this.questions.push(q5);
        this.beds[0].bonusQuestionId = 999;
        this.currentStatus = 'ready_for_adverse';
        this.currentIndex = this.questions.length - 1;
        this.alertLog.push('⚠️ EVOLUÇÃO ADVERSA DETECTADA!');
        this.updateAutoSaveCondition();
        return;
      }

      // If in plantao mode, interception opens Feedback Dual Choice Modal
      if (this.isPlantao) {
        this.showFeedbackDualChoiceModal = true;
        return;
      }

      this.currentStatus = 'completed';
      this.redirectUrl = `/testes/${this.testId}/resultado`;
      this.updateAutoSaveCondition();
    } finally {
      this.submitting = false;
    }
  }
}

// ============================================================================
// MAIN TEST HARNESS
// ============================================================================

async function main() {
  console.log('\n================================================================');
  console.log('EMPIRICAL CHALLENGER: MILENSTONE 8 MODAL & EDGE CASE TEST SUITE');
  console.log('================================================================\n');

  const baseQuestions: MockQuestion[] = [
    { id: 101, type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], correctOption: 1, chapterId: 1, chapterTitle: 'Sepse' },
    { id: 102, type: 'prescription_immediate', idealPrescription: 'Ceftriaxone 2g IV', chapterId: 1, chapterTitle: 'Sepse' },
    { id: 201, type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], correctOption: 0, chapterId: 2, chapterTitle: 'IAM' },
    { id: 202, type: 'prescription_complete', idealPrescription: 'AAS 300mg VO + Clopidogrel 300mg VO', chapterId: 2, chapterTitle: 'IAM' },
    { id: 301, type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], correctOption: 2, chapterId: 3, chapterTitle: 'Edema Pulmonar' },
    { id: 302, type: 'ventilator', idealVentilator: { peep: '10', fio2: '60%' }, chapterId: 3, chapterTitle: 'Edema Pulmonar' },
    { id: 401, type: 'multiple_choice', options: ['A', 'B', 'C', 'D'], correctOption: 3, chapterId: 4, chapterTitle: 'AVC Isquêmico' },
    { id: 402, type: 'prescription_immediate', idealPrescription: 'Alteplase 0.9 mg/kg', chapterId: 4, chapterTitle: 'AVC Isquêmico' },
  ];

  const baseBeds: PlantaoBedRecord[] = [
    { bedNumber: 1, patientWeight: 70, chapterId: 1, chapterTitle: 'Sepse', questionIds: [101, 102] },
    { bedNumber: 2, patientWeight: 80, chapterId: 2, chapterTitle: 'IAM', questionIds: [201, 202] },
    { bedNumber: 3, patientWeight: 65, chapterId: 3, chapterTitle: 'Edema Pulmonar', questionIds: [301, 302] },
    { bedNumber: 4, patientWeight: 75, chapterId: 4, chapterTitle: 'AVC Isquêmico', questionIds: [401, 402] },
  ];

  const standardAnswers: Record<number, any> = {
    101: 1,
    102: 'Ceftriaxone 2g IV',
    201: 0,
    202: 'AAS 300mg VO + Clopidogrel 300mg VO',
    301: 2,
    302: { peep: '10', fio2: '60%' },
    401: 3,
    402: 'Alteplase 0.9 mg/kg',
  };

  const createInitialRecord = (status: PlantaoTestStatus = 'in_progress'): MockTestRecord => ({
    id: 'test-audit-001',
    status,
    answers: { ...standardAnswers },
    plantao_data: { beds: baseBeds, status },
  });

  // --------------------------------------------------------------------------
  // SUITE 1: Baseline Verification of tests/challenger-m8-ui-flow.ts
  // --------------------------------------------------------------------------
  console.log('--- SUITE 1: Baseline Verification of tests/challenger-m8-ui-flow.ts ---');

  await runTestCase('S1', 'M8-EMP-01', 'Existing challenger suite file exists and has non-zero size', () => {
    const existingSuite = path.join(process.cwd(), 'tests', 'challenger-m8-ui-flow.ts');
    assert(fs.existsSync(existingSuite), 'tests/challenger-m8-ui-flow.ts must exist');
    const stats = fs.statSync(existingSuite);
    assert(stats.size > 5000, `Expected file size > 5000 bytes, got ${stats.size}`);
  });

  await runTestCase('S1', 'M8-EMP-02', 'Target page.tsx contains all M8 UI flow anchors and components', () => {
    const pagePath = path.join(process.cwd(), 'app', '(authenticated)', 'testes', '[id]', 'page.tsx');
    const content = fs.readFileSync(pagePath, 'utf-8');
    assert(content.includes('function BatchWaitingPanel'), 'BatchWaitingPanel must be present');
    assert(content.includes('function EvaluatedAnswerReview'), 'EvaluatedAnswerReview must be present');
    assert(content.includes('showDualChoiceModal'), 'showDualChoiceModal must be declared');
    assert(content.includes('showFeedbackDualChoiceModal'), 'showFeedbackDualChoiceModal must be declared');
    assert(content.includes('batchBudgetBreach'), 'batchBudgetBreach must be declared');
    assert(content.includes('batchFeedbackBudgetBreach'), 'batchFeedbackBudgetBreach must be declared');
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Modal Open/Close State Machine (Both Modals)
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Modal Open/Close State Machine (Both Modals) ---');

  await runTestCase('S2', 'M8-EMP-03', 'Bed Completion triggers Modal 1 and allows dismissal and re-triggering', async () => {
    const harness = new EmpiricalPlantaoHarness(createInitialRecord('in_progress'), baseQuestions);
    assertEqual(harness.showDualChoiceModal, false, 'Modal 1 must start closed');

    // Trigger completion
    await harness.handleInitiateCompletion();
    assertEqual(harness.showDualChoiceModal, true, 'Modal 1 must be open after initiate completion');
    assertEqual(harness.batchBudgetBreach, null, 'batchBudgetBreach must be reset');

    // Dismiss modal (User clicks "Voltar e Revisar Leitos")
    harness.showDualChoiceModal = false;
    assertEqual(harness.showDualChoiceModal, false, 'Modal 1 must close upon dismissal');
    assertEqual(harness.currentStatus, 'in_progress', 'Status must remain in_progress');

    // Re-trigger completion
    await harness.handleInitiateCompletion();
    assertEqual(harness.showDualChoiceModal, true, 'Modal 1 must reopen cleanly on subsequent trigger');
  });

  await runTestCase('S2', 'M8-EMP-04', 'Shift completion in ready_for_adverse opens Modal 2 (Feedback) and allows dismissal', async () => {
    const record = createInitialRecord('ready_for_adverse');
    const harness = new EmpiricalPlantaoHarness(record, [
      ...baseQuestions,
      { id: 999, type: 'prescription_immediate', isBonus: true },
    ]);
    harness.userAnswers[999] = 'Conduta de emergência';

    assertEqual(harness.showFeedbackDualChoiceModal, false, 'Modal 2 must start closed');

    // Trigger shift completion
    await harness.handleInitiateCompletion();
    assertEqual(harness.showFeedbackDualChoiceModal, true, 'Modal 2 must open for preceptorship feedback');
    assertEqual(harness.showDualChoiceModal, false, 'Modal 1 must remain closed while Modal 2 is open');

    // Dismiss Modal 2
    harness.showFeedbackDualChoiceModal = false;
    assertEqual(harness.showFeedbackDualChoiceModal, false, 'Modal 2 must close upon dismissal');
    assertEqual(harness.currentStatus, 'ready_for_adverse', 'Status must stay ready_for_adverse');
  });

  await runTestCase('S2', 'M8-EMP-05', 'Modals 1 and 2 are mutually exclusive and never render simultaneously', async () => {
    const harness = new EmpiricalPlantaoHarness(createInitialRecord('in_progress'), baseQuestions);
    await harness.handleInitiateCompletion();
    assertEqual(harness.showDualChoiceModal, true, 'Modal 1 open');
    assertEqual(harness.showFeedbackDualChoiceModal, false, 'Modal 2 closed');

    // Transition to feedback modal
    harness.showDualChoiceModal = false;
    harness.currentStatus = 'ready_for_adverse';
    await harness.handleInitiateCompletion();
    assertEqual(harness.showDualChoiceModal, false, 'Modal 1 closed');
    assertEqual(harness.showFeedbackDualChoiceModal, true, 'Modal 2 open');
  });

  // --------------------------------------------------------------------------
  // SUITE 3: Option A vs Option B Execution Mechanics
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Option A vs Option B Execution Mechanics ---');

  await runTestCase('S3', 'M8-EMP-06', 'Modal 1 Option A executes realtime evaluation, detects failure, and routes to Q5 in ready_for_adverse', async () => {
    const record = createInitialRecord('in_progress');
    // Introduce a failing answer in Bed 1
    record.answers[102] = 'Conduta errada com subdosagem';
    const harness = new EmpiricalPlantaoHarness(record, baseQuestions);

    await harness.handleInitiateCompletion();
    assertEqual(harness.showDualChoiceModal, true, 'Modal 1 open');

    await harness.handleSelectOptionA_Realtime();
    assertEqual(harness.showDualChoiceModal, false, 'Modal 1 must close immediately upon selecting Option A');
    assertEqual(harness.currentStatus, 'ready_for_adverse', 'Must transition to ready_for_adverse due to bed failure');
    assertEqual(harness.questions.length, 9, 'Q5 bonus question must be appended');
    assertEqual(harness.currentIndex, 8, 'Active index must focus on Q5');
    assertEqual(harness.isQuestionLocked(101), true, 'Bed 1 MCQ must be locked');
    assertEqual(harness.isQuestionLocked(102), true, 'Bed 1 prescription must be locked');
    assertEqual(harness.isQuestionLocked(999), false, 'Q5 must remain unlocked for physician rescue');
    assertEqual(harness.autoSaveEnabled, true, 'AutoSave must be active for Q5 in ready_for_adverse');
  });

  await runTestCase('S3', 'M8-EMP-07', 'Modal 1 Option B dispatches batch, transitions to awaiting_batch_bed_evaluation, and locks all inputs', async () => {
    const harness = new EmpiricalPlantaoHarness(createInitialRecord('in_progress'), baseQuestions);
    harness.fetchMocks['/api/plantao/submit-batch'] = async (body) => {
      assertEqual(body.testId, 'test-audit-001', 'Must pass correct testId');
      assert(Array.isArray(body.bedsData), 'Must include bedsData array');
      assertEqual(body.bedsData.length, 4, 'Must send all 4 beds');
      return {
        status: 200,
        ok: true,
        data: { success: true, batchId: 'batch_job_9988', submittedAt: new Date().toISOString() },
      };
    };

    await harness.handleInitiateCompletion();
    await harness.handleSelectOptionB_Batch();

    assertEqual(harness.showDualChoiceModal, false, 'Modal 1 must close on batch dispatch');
    assertEqual(harness.currentStatus, 'awaiting_batch_bed_evaluation', 'Status must transition to awaiting_batch_bed_evaluation');
    assertEqual(harness.draftCleared, true, 'Draft must be cleared from storage');
    assertEqual(harness.autoSaveEnabled, false, 'AutoSave must be disabled in batch waiting state');
    assertEqual(harness.isQuestionLocked(101), true, 'Inputs must be locked');
    assertEqual(harness.isQuestionLocked(102), true, 'Prescriptions must be locked');
  });

  await runTestCase('S3', 'M8-EMP-08', 'Modal 2 Option A generates realtime preceptorship feedback and completes shift with redirect', async () => {
    const record = createInitialRecord('ready_for_adverse');
    const harness = new EmpiricalPlantaoHarness(record, [
      ...baseQuestions,
      { id: 999, type: 'prescription_immediate', isBonus: true },
    ]);
    harness.fetchMocks['/api/generate-feedback'] = async () => ({
      status: 200,
      ok: true,
      data: { success: true, generalFeedback: 'Excelente condução dos leitos e reversão do choque.' },
    });

    await harness.handleInitiateCompletion();
    assertEqual(harness.showFeedbackDualChoiceModal, true, 'Modal 2 open');

    await harness.handleSelectFeedbackOptionA_Realtime();
    assertEqual(harness.showFeedbackDualChoiceModal, false, 'Modal 2 must close');
    assertEqual(harness.currentStatus, 'completed', 'Status must transition to completed');
    assertEqual(harness.redirectUrl, '/testes/test-audit-001/resultado', 'Must redirect to resultado');
    assertEqual(harness.autoSaveEnabled, false, 'AutoSave must be off');
  });

  await runTestCase('S3', 'M8-EMP-09', 'Modal 2 Option B submits feedback to batch and sets awaiting_batch_feedback', async () => {
    const record = createInitialRecord('ready_for_adverse');
    const harness = new EmpiricalPlantaoHarness(record, [
      ...baseQuestions,
      { id: 999, type: 'prescription_immediate', isBonus: true },
    ]);
    harness.fetchMocks['/api/plantao/submit-feedback-batch'] = async () => ({
      status: 200,
      ok: true,
      data: { success: true, batchId: 'feedback_batch_7766', submittedAt: new Date().toISOString() },
    });

    await harness.handleInitiateCompletion();
    await harness.handleSelectFeedbackOptionB_Batch();

    assertEqual(harness.showFeedbackDualChoiceModal, false, 'Modal 2 must close on batch submission');
    assertEqual(harness.currentStatus, 'awaiting_batch_feedback', 'Status must transition to awaiting_batch_feedback');
    assertEqual(harness.autoSaveEnabled, false, 'AutoSave must be disabled');
  });

  // --------------------------------------------------------------------------
  // SUITE 4: HTTP 429 Budget Breach Handling & Fallback
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 4: HTTP 429 Budget Breach Handling & Fallback ---');

  await runTestCase('S4', 'M8-EMP-10', 'Bed batch HTTP 429 keeps Modal 1 open, populates budget breach metrics, and enables fallback to Option A', async () => {
    const harness = new EmpiricalPlantaoHarness(createInitialRecord('in_progress'), baseQuestions);
    harness.fetchMocks['/api/plantao/submit-batch'] = async () => ({
      status: 429,
      ok: false,
      data: {
        error: 'Teto diário de $0.15 atingido.',
        budgetBreach: true,
        reason: 'daily_cap_exceeded',
        dailyAccumulated: 0.158,
        monthlyAccumulated: 0.65,
      },
    });

    await harness.handleInitiateCompletion();
    await harness.handleSelectOptionB_Batch();

    // Verification of breach handling
    assertEqual(harness.showDualChoiceModal, true, 'Modal 1 must REMAIN OPEN on budget cap breach');
    assert(harness.batchBudgetBreach !== null, 'batchBudgetBreach state must be populated');
    assertEqual(harness.batchBudgetBreach.dailyAccumulated, 0.158, 'Daily accumulated must match');
    assertEqual(harness.batchBudgetBreach.monthlyAccumulated, 0.65, 'Monthly accumulated must match');
    assertEqual(harness.currentStatus, 'in_progress', 'Status must not advance to awaiting_batch');

    // Execute fallback to Option A
    await harness.handleSelectOptionA_Realtime();
    assertEqual(harness.showDualChoiceModal, false, 'Modal 1 closes after fallback');
    assertEqual(harness.batchBudgetBreach, null, 'batchBudgetBreach reset after fallback');
  });

  await runTestCase('S4', 'M8-EMP-11', 'Feedback batch HTTP 429 keeps Modal 2 open, populates breach info, and enables fallback to Realtime Feedback', async () => {
    const record = createInitialRecord('ready_for_adverse');
    const harness = new EmpiricalPlantaoHarness(record, [
      ...baseQuestions,
      { id: 999, type: 'prescription_immediate', isBonus: true },
    ]);
    harness.fetchMocks['/api/plantao/submit-feedback-batch'] = async () => ({
      status: 429,
      ok: false,
      data: {
        error: 'Teto mensal de $0.90 atingido.',
        budgetBreach: true,
        dailyAccumulated: 0.08,
        monthlyAccumulated: 0.915,
      },
    });
    harness.fetchMocks['/api/generate-feedback'] = async () => ({
      status: 200,
      ok: true,
      data: { success: true, generalFeedback: 'Relatório imediato gerado.' },
    });

    await harness.handleInitiateCompletion();
    await harness.handleSelectFeedbackOptionB_Batch();

    assertEqual(harness.showFeedbackDualChoiceModal, true, 'Modal 2 must REMAIN OPEN on budget breach');
    assert(harness.batchFeedbackBudgetBreach !== null, 'batchFeedbackBudgetBreach must be populated');
    assertEqual(harness.currentStatus, 'ready_for_adverse', 'Status must not advance to awaiting_batch_feedback');

    // Execute fallback to Option A Feedback
    await harness.handleSelectFeedbackOptionA_Realtime();
    assertEqual(harness.showFeedbackDualChoiceModal, false, 'Modal 2 closes after fallback');
    assertEqual(harness.currentStatus, 'completed', 'Status advances to completed');
    assertEqual(harness.redirectUrl, '/testes/test-audit-001/resultado', 'Redirects to resultado');
  });

  // --------------------------------------------------------------------------
  // SUITE 5: Edge Cases: Empty Answers & Partial Submissions
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 5: Edge Cases: Empty Answers & Partial Submissions ---');

  await runTestCase('S5', 'M8-EMP-12', 'Unanswered count accurately detects blank MCQs, empty textareas, and empty ventilator objects', () => {
    const record = createInitialRecord('in_progress');
    record.answers = {
      101: undefined,             // Unanswered MCQ
      102: '',                    // Empty textarea
      201: null,                  // Null MCQ
      202: '   ',                 // Whitespace textarea
      301: 2,                     // Answered MCQ
      302: { peep: '', fio2: '' }, // Empty ventilator fields
      401: 3,                     // Answered MCQ
      402: 'Conduta válida',       // Answered textarea
    };
    const harness = new EmpiricalPlantaoHarness(record, baseQuestions);
    const count = harness.countUnanswered();
    assertEqual(count, 5, 'Must detect exactly 5 unanswered questions (101, 102, 201, 202, 302)');
  });

  await runTestCase('S5', 'M8-EMP-13', 'Cancelling confirmation dialog on empty answers prevents modal from opening', async () => {
    const record = createInitialRecord('in_progress');
    record.answers = {}; // All unanswered!
    const harness = new EmpiricalPlantaoHarness(record, baseQuestions);
    harness.confirmDialogResult = false; // User clicks "Cancelar"

    await harness.handleInitiateCompletion();
    assertEqual(harness.showDualChoiceModal, false, 'Modal must NOT open when user cancels confirmation');
    assertEqual(harness.confirmPromptLog.length, 1, 'Confirmation prompt must have been presented');
  });

  await runTestCase('S5', 'M8-EMP-14', 'buildBedsPayload formats completely empty answers safely without throwing undefined exceptions', () => {
    const record = createInitialRecord('in_progress');
    record.answers = {}; // Empty answers
    const harness = new EmpiricalPlantaoHarness(record, baseQuestions);
    const payload = harness.buildBedsPayload();

    assertEqual(payload.length, 4, 'Must construct 4 bed payloads');
    const bed1 = payload[0];
    assertEqual(bed1.mcqResults[0].userAnswer, 'Não respondida', 'Unanswered MCQ defaults to Não respondida');
    assertEqual(bed1.prescriptionsPayload[0].userPrescription, 'Sem resposta enviada', 'Empty prescription defaults to Sem resposta enviada');

    const bed3 = payload[2]; // Bed with ventilator
    assertEqual(bed3.prescriptionsPayload[0].type, 'ventilator', 'Bed 3 must have ventilator');
    assertEqual(typeof bed3.prescriptionsPayload[0].userPrescription, 'string', 'Ventilator userPrescription must be valid string');
  });

  // --------------------------------------------------------------------------
  // SUITE 6: Edge Cases: Double Clicks & Concurrent Rapid Invocations
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 6: Edge Cases: Double Clicks & Concurrent Rapid Invocations ---');

  await runTestCase('S6', 'M8-EMP-15', 'Rapid double click on Modal 1 Option B is intercepted by submittingBatch guard', async () => {
    const harness = new EmpiricalPlantaoHarness(createInitialRecord('in_progress'), baseQuestions);
    let networkCallCount = 0;
    harness.fetchMocks['/api/plantao/submit-batch'] = async () => {
      networkCallCount++;
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 50));
      return { status: 200, ok: true, data: { success: true, batchId: 'batch-double-click' } };
    };

    await harness.handleInitiateCompletion();

    // Fire two calls concurrently (simulating rapid double click)
    const call1 = harness.handleSelectOptionB_Batch();
    const call2 = harness.handleSelectOptionB_Batch();
    await Promise.all([call1, call2]);

    assertEqual(networkCallCount, 1, 'Only 1 network dispatch must occur despite rapid double click');
    assertEqual(harness.currentStatus, 'awaiting_batch_bed_evaluation', 'State transitions once');
  });

  await runTestCase('S6', 'M8-EMP-16', 'Rapid double click on Modal 2 Option B is intercepted by submittingFeedbackBatch guard', async () => {
    const record = createInitialRecord('ready_for_adverse');
    const harness = new EmpiricalPlantaoHarness(record, [
      ...baseQuestions,
      { id: 999, type: 'prescription_immediate', isBonus: true },
    ]);
    let networkCallCount = 0;
    harness.fetchMocks['/api/plantao/submit-feedback-batch'] = async () => {
      networkCallCount++;
      await new Promise((r) => setTimeout(r, 50));
      return { status: 200, ok: true, data: { success: true, batchId: 'fb-batch-double-click' } };
    };

    await harness.handleInitiateCompletion();

    const call1 = harness.handleSelectFeedbackOptionB_Batch();
    const call2 = harness.handleSelectFeedbackOptionB_Batch();
    await Promise.all([call1, call2]);

    assertEqual(networkCallCount, 1, 'Only 1 network call must execute for feedback batch');
    assertEqual(harness.currentStatus, 'awaiting_batch_feedback', 'State transitions once');
  });

  await runTestCase('S6', 'M8-EMP-17', 'Manual batch status check blocks concurrent clicks while checkingBatchStatus is true', async () => {
    const record = createInitialRecord('awaiting_batch_bed_evaluation');
    const harness = new EmpiricalPlantaoHarness(record, baseQuestions);
    let pollCallCount = 0;
    harness.fetchMocks['/api/plantao/check-batch-status'] = async () => {
      pollCallCount++;
      await new Promise((r) => setTimeout(r, 50));
      return { status: 200, ok: true, data: { updated: false, pending: true } };
    };

    const poll1 = harness.handleCheckBatchStatus(true);
    const poll2 = harness.handleCheckBatchStatus(true);
    await Promise.all([poll1, poll2]);

    assertEqual(pollCallCount, 1, 'Concurrent check calls must be dropped by checkingBatchStatus guard');
  });

  // --------------------------------------------------------------------------
  // SUITE 7: Edge Cases: Unhandled Errors & Network Failures
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 7: Edge Cases: Unhandled Errors & Network Failures ---');

  await runTestCase('S7', 'M8-EMP-18', 'Network failure during submit-batch is caught, displays error, and resets submittingBatch', async () => {
    const harness = new EmpiricalPlantaoHarness(createInitialRecord('in_progress'), baseQuestions);
    harness.fetchMocks['/api/plantao/submit-batch'] = async () => {
      throw new Error('TypeError: Failed to fetch');
    };

    await harness.handleInitiateCompletion();
    await harness.handleSelectOptionB_Batch();

    assertEqual(harness.submittingBatch, false, 'submittingBatch must be reset in finally');
    assertEqual(harness.currentStatus, 'in_progress', 'Status must remain in_progress');
    assert(harness.errorMessage !== null && harness.errorMessage.includes('Failed to fetch'), 'Error message must be set');
  });

  await runTestCase('S7', 'M8-EMP-19', 'Manual check batch status catches network error and displays formatted error banner', async () => {
    const record = createInitialRecord('awaiting_batch_bed_evaluation');
    const harness = new EmpiricalPlantaoHarness(record, baseQuestions);
    harness.fetchMocks['/api/plantao/check-batch-status'] = async () => {
      throw new Error('Connection refused');
    };

    await harness.handleCheckBatchStatus(true);
    assertEqual(harness.checkingBatchStatus, false, 'checkingBatchStatus must reset to false in finally');
    assert(harness.batchCheckMessage !== null && harness.batchCheckMessage.includes('Connection refused'), 'Must display formatted error banner');
  });

  await runTestCase('S7', 'M8-EMP-20', 'Silent polling (isManual=false) suppresses alerts on network error without disturbing user', async () => {
    const record = createInitialRecord('awaiting_batch_bed_evaluation');
    const harness = new EmpiricalPlantaoHarness(record, baseQuestions);
    harness.fetchMocks['/api/plantao/check-batch-status'] = async () => {
      throw new Error('Timeout 504 Gateway');
    };

    await harness.handleCheckBatchStatus(false);
    assertEqual(harness.batchCheckMessage, null, 'Silent polling must NOT set batchCheckMessage');
    assertEqual(harness.alertLog.length, 0, 'Silent polling must NOT trigger alerts');
  });

  await runTestCase('S7', 'M8-EMP-21', 'Polling completion transitions to ready_for_adverse and presents clinical decompensation alert', async () => {
    const record = createInitialRecord('awaiting_batch_bed_evaluation');
    const harness = new EmpiricalPlantaoHarness(record, baseQuestions);
    harness.fetchMocks['/api/plantao/check-batch-status'] = async () => ({
      status: 200,
      ok: true,
      data: {
        updated: true,
        status: 'ready_for_adverse',
        hasAdverseEvolution: true,
        questions: [
          ...baseQuestions,
          { id: 999, type: 'prescription_immediate', isBonus: true, chapterTitle: 'Emergência Sepse Q5' },
        ],
        results: {
          101: { score: 10 },
          102: { score: 3.5, evaluation: { verdict: 'Inadequado' } },
        },
      },
    });

    await harness.handleCheckBatchStatus(true);
    assertEqual(harness.currentStatus, 'ready_for_adverse', 'Status must update to ready_for_adverse');
    assertEqual(harness.questions.length, 9, 'Questions must be updated with Q5');
    assertEqual(harness.alertLog.length, 1, 'Manual check must trigger clinical decompensation alert');
    assert(harness.alertLog[0].includes('INTERCORRÊNCIA CLÍNICA DETECTADA'), 'Alert text must match requirement');
    assertEqual(harness.batchCheckMessage, '✅ Avaliação do lote concluída com sucesso!', 'Success message must be set');
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`EMPIRICAL RESULTS: ${results.length} TOTAL | ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
