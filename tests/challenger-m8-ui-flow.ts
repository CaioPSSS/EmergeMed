/**
 * Adversarial Challenger Suite for Milestone M8:
 * Dual Choice & Plantão Execution Flow (UI Verification & State Machine Simulation)
 *
 * Requirements Tested:
 * 1. Dual Choice Modals:
 *    - Bed completion presents "⚡ Correção em Tempo Real" vs "Passagem de Plantão Assíncrona (Batch)" (-50% OFF).
 *    - Post-adverse preceptorship feedback presents the same dual choice.
 * 2. Batch Submission & State Transitions:
 *    - Bed batch calls /api/plantao/submit-batch and sets status to awaiting_batch_bed_evaluation.
 *    - Feedback batch calls /api/plantao/submit-feedback-batch and sets status to awaiting_batch_feedback.
 * 3. Budget Cap Breach (HTTP 429):
 *    - Alerts in-modal with exact budget metrics and provides fallback button to realtime.
 * 4. State Re-entry across all 5 states:
 *    - in_progress: standard question card, auto-save active.
 *    - awaiting_batch_bed_evaluation: BatchWaitingPanel, manual refresh button, silent 20s auto-polling.
 *    - ready_for_adverse: directs to Q5, previous beds locked in review mode with EvaluatedAnswerReview, EmergencyAdverseBanner displayed.
 *    - awaiting_batch_feedback: BatchWaitingPanel, polling active.
 *    - completed: immediate redirect to /testes/[id]/resultado.
 * 5. Input Locking & Review Mode:
 *    - Locked questions disable textareas, inputs, and mode changes.
 *    - EvaluatedAnswerReview renders score, verdict, strengths, improvements, ideal conduct.
 *
 * Usage: npx tsx tests/challenger-m8-ui-flow.ts
 */

import fs from 'fs';
import path from 'path';
import {
  PlantaoTestStatus,
  PLANTAO_STATUSES,
  isValidPlantaoStatus,
  isPendingBatchStatus,
  PlantaoBedRecord,
} from '../types/plantao';

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
// SIMULATION HELPERS: Mimic UI Logic in app/(authenticated)/testes/[id]/page.tsx
// ============================================================================

interface MockQuestion {
  id: number;
  type: 'multiple_choice' | 'prescription_complete' | 'prescription_immediate' | 'ventilator';
  vignette?: string;
  promptText?: string;
  chapterId?: number;
  chapterTitle?: string;
  idealPrescription?: string;
  evaluationCriteria?: string;
  correctOption?: number;
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
  };
}

class MockPlantaoUIState {
  currentStatus: PlantaoTestStatus;
  currentIndex: number;
  questions: MockQuestion[];
  beds: PlantaoBedRecord[];
  userAnswers: Record<number, any>;
  cachedEvaluations: Record<number, any>;
  autoSaveEnabled: boolean;
  showDualChoiceModal: boolean;
  showFeedbackDualChoiceModal: boolean;
  batchBudgetBreach: any | null;
  batchFeedbackBudgetBreach: any | null;
  pollingActive: boolean;
  redirectUrl: string | null;

  constructor(initialRecord: MockTestRecord, initialQuestions: MockQuestion[]) {
    this.currentStatus = initialRecord.status;
    this.questions = [...initialQuestions];
    this.beds = [...initialRecord.plantao_data.beds];
    this.userAnswers = { ...initialRecord.answers };
    this.cachedEvaluations = { ...(initialRecord.results || {}) };
    this.currentIndex = 0;
    this.autoSaveEnabled = false;
    this.showDualChoiceModal = false;
    this.showFeedbackDualChoiceModal = false;
    this.batchBudgetBreach = null;
    this.batchFeedbackBudgetBreach = null;
    this.pollingActive = false;
    this.redirectUrl = null;

    // Simulate loadTest() re-entry logic
    this.applyReentryRules(initialRecord);
    this.updateAutoSaveCondition();
  }

  applyReentryRules(test: MockTestRecord) {
    const rawStatus = (test.plantao_data?.status || test.status) as PlantaoTestStatus;
    this.currentStatus = rawStatus;

    if (rawStatus === 'completed' || test.completed) {
      this.redirectUrl = `/testes/${test.id}/resultado`;
      return;
    }

    if (rawStatus === 'ready_for_adverse') {
      // Find emergency question
      const adverseIdx = this.questions.findIndex((q) => {
        return q.isBonus || this.beds.some((b) => b.bonusQuestionId === q.id);
      });
      if (adverseIdx !== -1) {
        this.currentIndex = adverseIdx;
      }
    }

    if (isPendingBatchStatus(rawStatus)) {
      this.pollingActive = true;
    }
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

  handleAnswerChange(qId: number, answer: any): boolean {
    if (this.isQuestionLocked(qId)) {
      return false; // rejected!
    }
    this.userAnswers[qId] = answer;
    return true;
  }

  // Trigger bed completion dual choice
  handleInitiateBedCompletion() {
    if (this.currentStatus !== 'in_progress') return;
    this.batchBudgetBreach = null;
    this.showDualChoiceModal = true;
  }

  // Option A: Realtime Bed Completion
  handleSelectBedOptionA_Realtime(mockScores: Record<number, number>) {
    this.showDualChoiceModal = false;
    // Realtime evaluation populates cachedEvaluations
    for (const [idStr, score] of Object.entries(mockScores)) {
      const qId = Number(idStr);
      this.cachedEvaluations[qId] = {
        score,
        evaluation: {
          score,
          verdict: score >= 6.0 ? 'Adequado' : 'Inadequado',
          strengths: ['Identificou a condição clínica'],
          improvements: score < 6.0 ? ['Ajustar dosagem'] : [],
        },
      };
    }

    // Check if adverse evolution is triggered
    const hasFailure = Object.values(mockScores).some((s) => s < 6.0);
    if (hasFailure) {
      // Create Q5
      const q5: MockQuestion = {
        id: 501,
        type: 'prescription_immediate',
        isBonus: true,
        vignette: 'Paciente descompensou criticamente!',
        chapterTitle: 'Emergência Respiratória',
      };
      this.questions.push(q5);
      this.beds[0].bonusQuestionId = 501;
      this.currentStatus = 'ready_for_adverse';
      this.currentIndex = this.questions.length - 1;
    } else {
      this.currentStatus = 'ready_for_adverse';
    }
    this.updateAutoSaveCondition();
  }

  // Option B: Batch Bed Completion
  handleSelectBedOptionB_Batch(simulateBudgetBreach: boolean = false) {
    if (simulateBudgetBreach) {
      this.batchBudgetBreach = {
        error: 'Limite diário de $0.15 atingido.',
        dailyAccumulated: 0.152,
        monthlyAccumulated: 0.42,
      };
      return;
    }
    this.showDualChoiceModal = false;
    this.currentStatus = 'awaiting_batch_bed_evaluation';
    this.pollingActive = true;
    this.updateAutoSaveCondition();
  }

  // Trigger feedback dual choice
  handleInitiateFeedbackCompletion() {
    if (this.currentStatus !== 'ready_for_adverse') return;
    this.batchFeedbackBudgetBreach = null;
    this.showFeedbackDualChoiceModal = true;
  }

  // Option A: Realtime Feedback
  handleSelectFeedbackOptionA_Realtime() {
    this.showFeedbackDualChoiceModal = false;
    this.currentStatus = 'completed';
    this.updateAutoSaveCondition();
    this.redirectUrl = `/testes/test-123/resultado`;
  }

  // Option B: Batch Feedback
  handleSelectFeedbackOptionB_Batch(simulateBudgetBreach: boolean = false) {
    if (simulateBudgetBreach) {
      this.batchFeedbackBudgetBreach = {
        error: 'Limite diário de $0.15 atingido.',
        dailyAccumulated: 0.154,
        monthlyAccumulated: 0.45,
      };
      return;
    }
    this.showFeedbackDualChoiceModal = false;
    this.currentStatus = 'awaiting_batch_feedback';
    this.pollingActive = true;
    this.updateAutoSaveCondition();
  }

  // Polling update resolution
  handlePollUpdate(newStatus: PlantaoTestStatus, evaluations?: Record<number, any>) {
    if (evaluations) {
      this.cachedEvaluations = { ...this.cachedEvaluations, ...evaluations };
    }
    this.currentStatus = newStatus;
    if (newStatus === 'ready_for_adverse') {
      const q5Idx = this.questions.findIndex((q) => q.isBonus || this.beds.some((b) => b.bonusQuestionId === q.id));
      if (q5Idx !== -1) {
        this.currentIndex = q5Idx;
      }
    } else if (newStatus === 'completed') {
      this.redirectUrl = `/testes/test-123/resultado`;
    }
    this.updateAutoSaveCondition();
  }
}

// ============================================================================
// SUITE EXECUTION
// ============================================================================

async function main() {
  console.log('\n================================================================');
  console.log('CHALLENGER M8: DUAL CHOICE & PLANTAO EXECUTION FLOW VERIFICATION');
  console.log('================================================================\n');

  const pagePath = path.join(process.cwd(), 'app/(authenticated)/testes/[id]/page.tsx');
  assert(fs.existsSync(pagePath), `Target page does not exist: ${pagePath}`);
  const pageSource = fs.readFileSync(pagePath, 'utf-8');

  // --------------------------------------------------------------------------
  // SUITE 1: Static AST & Source Code Conformance
  // --------------------------------------------------------------------------
  console.log('--- SUITE 1: Static Code Architecture & Conformance ---');

  await runTest('suite1', 'M8-S1-01', 'Page imports PlantaoTestStatus and isPendingBatchStatus from types/plantao', () => {
    assert(pageSource.includes("import { PlantaoTestStatus, isPendingBatchStatus } from '@/types/plantao'"), 'Missing import of PlantaoTestStatus & isPendingBatchStatus');
  });

  await runTest('suite1', 'M8-S1-02', 'BatchWaitingPanel component is declared with manual status check & auto-poll UI', () => {
    assert(pageSource.includes('function BatchWaitingPanel'), 'BatchWaitingPanel component missing');
    assert(pageSource.includes('Atualizar Status do Lote'), 'Manual check button missing in BatchWaitingPanel');
    assert(pageSource.includes('openai/gpt-6-luna:batch'), 'Batch model description missing in BatchWaitingPanel');
    assert(pageSource.includes('50% de economia'), 'Discount messaging missing in BatchWaitingPanel');
  });

  await runTest('suite1', 'M8-S1-03', 'EvaluatedAnswerReview component is declared and renders verdict, score, strengths and improvements', () => {
    assert(pageSource.includes('function EvaluatedAnswerReview'), 'EvaluatedAnswerReview component missing');
    assert(pageSource.includes('isPass'), 'Score pass check missing');
    assert(pageSource.includes('evaluation.evaluation.verdict'), 'Verdict check missing');
    assert(pageSource.includes('evaluation.evaluation?.strengths'), 'Strengths display missing');
    assert(pageSource.includes('evaluation.evaluation?.improvements'), 'Improvements display missing');
  });

  await runTest('suite1', 'M8-S1-04', 'Dual Choice Modal 1 (Bed Completion) is present with Option A and Option B (-50% OFF)', () => {
    assert(pageSource.includes('MODAL 1: DUAL CHOICE - BED COMPLETION'), 'Modal 1 comment/marker missing');
    assert(pageSource.includes('showDualChoiceModal'), 'showDualChoiceModal state missing');
    assert(pageSource.includes('handleSelectOptionA_Realtime'), 'Option A handler missing');
    assert(pageSource.includes('handleSelectOptionB_Batch'), 'Option B handler missing');
    assert(pageSource.includes('-50% OFF'), '50% discount badge missing in Modal 1');
    assert(pageSource.includes('/api/plantao/submit-batch'), 'submit-batch endpoint call missing');
  });

  await runTest('suite1', 'M8-S1-05', 'Dual Choice Modal 2 (Preceptorship Feedback) is present with Option A and Option B (-50% OFF)', () => {
    assert(pageSource.includes('MODAL 2: DUAL CHOICE - PRECEPTORSHIP FEEDBACK'), 'Modal 2 comment/marker missing');
    assert(pageSource.includes('showFeedbackDualChoiceModal'), 'showFeedbackDualChoiceModal state missing');
    assert(pageSource.includes('handleSelectFeedbackOptionA_Realtime'), 'Feedback Option A handler missing');
    assert(pageSource.includes('handleSelectFeedbackOptionB_Batch'), 'Feedback Option B handler missing');
    assert(pageSource.includes('/api/plantao/submit-feedback-batch'), 'submit-feedback-batch endpoint call missing');
  });

  await runTest('suite1', 'M8-S1-06', 'Budget Cap Breach (HTTP 429) guards are wired in both modals with fallback button', () => {
    assert(pageSource.includes('batchBudgetBreach'), 'batchBudgetBreach state missing');
    assert(pageSource.includes('batchFeedbackBudgetBreach'), 'batchFeedbackBudgetBreach state missing');
    assert(pageSource.includes('Teto de Orçamento Batch Atingido (HTTP 429)'), 'Budget breach alert title missing');
    assert(pageSource.includes('Prosseguir com Correção em Tempo Real Agora'), 'Fallback to realtime button missing in Modal 1');
    assert(pageSource.includes('Prosseguir com Feedback em Tempo Real'), 'Fallback to realtime button missing in Modal 2');
  });

  await runTest('suite1', 'M8-S1-07', 'Non-blocking auto-polling interval of 20 seconds is registered for pending batch states', () => {
    assert(pageSource.includes('setInterval'), 'setInterval missing for auto-polling');
    assert(pageSource.includes('20000'), '20000ms (20s) interval missing');
    assert(pageSource.includes('/api/plantao/check-batch-status'), 'check-batch-status API call missing');
  });

  await runTest('suite1', 'M8-S1-08', 'useAutoSave hook is disabled during batch waiting and completed states', () => {
    assert(
      pageSource.includes("activePlantaoStatus === 'in_progress' || activePlantaoStatus === 'ready_for_adverse'"),
      'AutoSave condition must only permit in_progress or ready_for_adverse'
    );
  });

  await runTest('suite1', 'M8-S1-09', 'Question locking protects MCQs, prescriptions, and ventilator inputs in review mode', () => {
    assert(pageSource.includes('isQuestionLocked'), 'isQuestionLocked helper missing');
    assert(pageSource.includes('handleSelectOption') && pageSource.includes('isQuestionLocked(questionId)'), 'MCQ selector lock missing');
    assert(pageSource.includes('handlePrescriptionTextChange') && pageSource.includes('isQuestionLocked(questionId)'), 'Prescription lock missing');
    assert(pageSource.includes('handleVentilatorFieldChange') && pageSource.includes('isQuestionLocked(questionId)'), 'Ventilator lock missing');
  });

  // --------------------------------------------------------------------------
  // SUITE 2: State Transitions & Dual Choice Flow Simulation
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 2: State Transitions & Flow Simulation ---');

  const baseQuestions: MockQuestion[] = [
    { id: 101, type: 'multiple_choice', chapterId: 1, chapterTitle: 'Leito 1 - Sepse' },
    { id: 102, type: 'prescription_immediate', chapterId: 1, chapterTitle: 'Leito 1 - Sepse' },
    { id: 201, type: 'multiple_choice', chapterId: 2, chapterTitle: 'Leito 2 - IAM' },
    { id: 202, type: 'prescription_complete', chapterId: 2, chapterTitle: 'Leito 2 - IAM' },
  ];

  const baseBeds: PlantaoBedRecord[] = [
    { bedNumber: 1, patientWeight: 70, chapterId: 1, chapterTitle: 'Sepse', questionIds: [101, 102] },
    { bedNumber: 2, patientWeight: 80, chapterId: 2, chapterTitle: 'IAM', questionIds: [201, 202] },
  ];

  await runTest('suite2', 'M8-S2-01', 'Initial re-entry in in_progress enables autosave and leaves inputs unlocked', () => {
    const record: MockTestRecord = {
      id: 'test-101',
      status: 'in_progress',
      answers: {},
      plantao_data: { beds: baseBeds },
    };
    const ui = new MockPlantaoUIState(record, baseQuestions);
    assertEqual(ui.currentStatus, 'in_progress', 'Status must be in_progress');
    assertEqual(ui.autoSaveEnabled, true, 'AutoSave must be enabled');
    assertEqual(ui.isQuestionLocked(101), false, 'Q101 must not be locked');
    assertEqual(ui.isQuestionLocked(102), false, 'Q102 must not be locked');
    assert(ui.handleAnswerChange(102, 'Ceftriaxone 2g IV'), 'Must allow typing answers');
    assertEqual(ui.userAnswers[102], 'Ceftriaxone 2g IV', 'Answer must be recorded');
  });

  await runTest('suite2', 'M8-S2-02', 'Bed Completion triggers Dual Choice Modal 1', () => {
    const record: MockTestRecord = {
      id: 'test-101',
      status: 'in_progress',
      answers: { 101: 0, 102: 'Ceftriaxone 2g IV', 201: 1, 202: 'AAS 300mg VO' },
      plantao_data: { beds: baseBeds },
    };
    const ui = new MockPlantaoUIState(record, baseQuestions);
    ui.handleInitiateBedCompletion();
    assertEqual(ui.showDualChoiceModal, true, 'Dual choice modal 1 must be open');
  });

  await runTest('suite2', 'M8-S2-03', 'Bed Completion Option B (Batch) enters awaiting_batch_bed_evaluation and disables autosave', () => {
    const record: MockTestRecord = {
      id: 'test-101',
      status: 'in_progress',
      answers: { 101: 0, 102: 'Ceftriaxone 2g IV', 201: 1, 202: 'AAS 300mg VO' },
      plantao_data: { beds: baseBeds },
    };
    const ui = new MockPlantaoUIState(record, baseQuestions);
    ui.handleInitiateBedCompletion();
    ui.handleSelectBedOptionB_Batch(false);

    assertEqual(ui.showDualChoiceModal, false, 'Modal 1 must close');
    assertEqual(ui.currentStatus, 'awaiting_batch_bed_evaluation', 'Status must transition to awaiting_batch_bed_evaluation');
    assertEqual(ui.pollingActive, true, 'Polling must be active');
    assertEqual(ui.autoSaveEnabled, false, 'AutoSave must be disabled in batch waiting state');
    assertEqual(ui.isQuestionLocked(101), true, 'Questions must be locked in batch waiting state');
    assert(!ui.handleAnswerChange(102, 'Modificação Indevida'), 'Answers must reject edits during batch wait');
  });

  await runTest('suite2', 'M8-S2-04', 'Budget cap breach on Option B renders in-modal warning and allows fallback to Option A', () => {
    const record: MockTestRecord = {
      id: 'test-101',
      status: 'in_progress',
      answers: { 101: 0, 102: 'Ceftriaxone 2g IV', 201: 1, 202: 'AAS 300mg VO' },
      plantao_data: { beds: baseBeds },
    };
    const ui = new MockPlantaoUIState(record, baseQuestions);
    ui.handleInitiateBedCompletion();
    ui.handleSelectBedOptionB_Batch(true); // HTTP 429 budget cap breach!

    assertEqual(ui.showDualChoiceModal, true, 'Modal must remain open on budget breach');
    assert(ui.batchBudgetBreach !== null, 'batchBudgetBreach must be set');
    assertEqual(ui.currentStatus, 'in_progress', 'Status must remain in_progress to avoid lost state');

    // Click fallback button -> Option A (Realtime)
    ui.handleSelectBedOptionA_Realtime({ 101: 10, 102: 4.0, 201: 10, 202: 9.0 });
    assertEqual(ui.showDualChoiceModal, false, 'Modal must close after fallback');
    assertEqual(ui.currentStatus, 'ready_for_adverse', 'Must transition to ready_for_adverse');
  });

  await runTest('suite2', 'M8-S2-05', 'Re-entry in awaiting_batch_bed_evaluation restores waiting panel with polling active', () => {
    const record: MockTestRecord = {
      id: 'test-101',
      status: 'awaiting_batch_bed_evaluation',
      answers: { 101: 0, 102: 'Ceftriaxone 2g IV' },
      plantao_data: {
        status: 'awaiting_batch_bed_evaluation',
        beds: baseBeds,
        batch_job_id: 'batch-999',
        batch_submitted_at: new Date().toISOString(),
      },
    };
    const ui = new MockPlantaoUIState(record, baseQuestions);
    assertEqual(ui.currentStatus, 'awaiting_batch_bed_evaluation', 'Must restore awaiting_batch_bed_evaluation');
    assertEqual(ui.pollingActive, true, 'Polling must be active on re-entry');
    assertEqual(ui.autoSaveEnabled, false, 'AutoSave must be disabled');
    assertEqual(ui.redirectUrl, null, 'Must not redirect prematurely');
  });

  await runTest('suite2', 'M8-S2-06', 'Polling update from awaiting_batch_bed_evaluation to ready_for_adverse focuses Q5 and locks Q1-Q4', () => {
    const record: MockTestRecord = {
      id: 'test-101',
      status: 'awaiting_batch_bed_evaluation',
      answers: { 101: 0, 102: 'Ceftriaxone 2g IV' },
      plantao_data: { status: 'awaiting_batch_bed_evaluation', beds: baseBeds },
    };
    const ui = new MockPlantaoUIState(record, baseQuestions);
    const q5: MockQuestion = {
      id: 999,
      type: 'prescription_immediate',
      isBonus: true,
      vignette: 'Choque séptico refratário!',
      chapterTitle: 'Emergência Sepse Q5',
    };
    ui.questions.push(q5);
    ui.beds[0].bonusQuestionId = 999;

    // Simulate poll returning completed batch with adverse event
    ui.handlePollUpdate('ready_for_adverse', {
      101: { score: 10, evaluation: { verdict: 'Adequado' } },
      102: { score: 4.5, evaluation: { verdict: 'Inadequado', improvements: ['Dose subótima'] } },
    });

    assertEqual(ui.currentStatus, 'ready_for_adverse', 'Status must update to ready_for_adverse');
    assertEqual(ui.currentIndex, 4, 'Current index must focus on Q5 (index 4)');
    assertEqual(ui.autoSaveEnabled, true, 'AutoSave must be re-enabled for Q5');
    assertEqual(ui.isQuestionLocked(101), true, 'Q101 must be locked in review mode');
    assertEqual(ui.isQuestionLocked(102), true, 'Q102 must be locked in review mode');
    assertEqual(ui.isQuestionLocked(999), false, 'Q5 (999) must NOT be locked');
    assert(ui.handleAnswerChange(999, 'Noradrenalina 0.5 mcg/kg/min'), 'Q5 must accept input');
  });

  await runTest('suite2', 'M8-S2-07', 'Shift Completion in ready_for_adverse triggers Dual Choice Modal 2 (Feedback)', () => {
    const record: MockTestRecord = {
      id: 'test-101',
      status: 'ready_for_adverse',
      answers: { 101: 0, 102: 'Ceftriaxone 2g IV', 999: 'Noradrenalina 0.5 mcg/kg/min' },
      plantao_data: { status: 'ready_for_adverse', beds: baseBeds, hasAdverseEvolution: true },
    };
    const ui = new MockPlantaoUIState(record, [
      ...baseQuestions,
      { id: 999, type: 'prescription_immediate', isBonus: true },
    ]);
    ui.handleInitiateFeedbackCompletion();
    assertEqual(ui.showFeedbackDualChoiceModal, true, 'Modal 2 must be open');
  });

  await runTest('suite2', 'M8-S2-08', 'Feedback Option B (Batch) enters awaiting_batch_feedback and activates polling', () => {
    const record: MockTestRecord = {
      id: 'test-101',
      status: 'ready_for_adverse',
      answers: { 101: 0, 102: 'Ceftriaxone 2g IV', 999: 'Noradrenalina 0.5 mcg/kg/min' },
      plantao_data: { status: 'ready_for_adverse', beds: baseBeds },
    };
    const ui = new MockPlantaoUIState(record, [
      ...baseQuestions,
      { id: 999, type: 'prescription_immediate', isBonus: true },
    ]);
    ui.handleInitiateFeedbackCompletion();
    ui.handleSelectFeedbackOptionB_Batch(false);

    assertEqual(ui.showFeedbackDualChoiceModal, false, 'Modal 2 must close');
    assertEqual(ui.currentStatus, 'awaiting_batch_feedback', 'Status must be awaiting_batch_feedback');
    assertEqual(ui.pollingActive, true, 'Polling must be active');
    assertEqual(ui.autoSaveEnabled, false, 'AutoSave must be disabled');
  });

  await runTest('suite2', 'M8-S2-09', 'Budget cap breach on Feedback Option B allows fallback to Option A (Realtime Feedback)', () => {
    const record: MockTestRecord = {
      id: 'test-101',
      status: 'ready_for_adverse',
      answers: { 101: 0, 102: 'Ceftriaxone 2g IV', 999: 'Noradrenalina 0.5 mcg/kg/min' },
      plantao_data: { status: 'ready_for_adverse', beds: baseBeds },
    };
    const ui = new MockPlantaoUIState(record, [
      ...baseQuestions,
      { id: 999, type: 'prescription_immediate', isBonus: true },
    ]);
    ui.handleInitiateFeedbackCompletion();
    ui.handleSelectFeedbackOptionB_Batch(true); // HTTP 429 breach!

    assertEqual(ui.showFeedbackDualChoiceModal, true, 'Modal 2 remains open');
    assert(ui.batchFeedbackBudgetBreach !== null, 'batchFeedbackBudgetBreach must be populated');

    // Fallback to Realtime
    ui.handleSelectFeedbackOptionA_Realtime();
    assertEqual(ui.showFeedbackDualChoiceModal, false, 'Modal 2 closes');
    assertEqual(ui.currentStatus, 'completed', 'Status transitions to completed');
    assertEqual(ui.redirectUrl, '/testes/test-123/resultado', 'Redirects to resultado');
  });

  await runTest('suite2', 'M8-S2-10', 'Re-entry in completed immediately redirects to /resultado and locks all inputs', () => {
    const record: MockTestRecord = {
      id: 'test-101',
      status: 'completed',
      completed: true,
      answers: { 101: 0, 102: 'Ceftriaxone 2g IV' },
      plantao_data: { status: 'completed', beds: baseBeds },
    };
    const ui = new MockPlantaoUIState(record, baseQuestions);
    assertEqual(ui.currentStatus, 'completed', 'Status must be completed');
    assertEqual(ui.redirectUrl, '/testes/test-101/resultado', 'Must trigger redirect to /resultado');
    assertEqual(ui.autoSaveEnabled, false, 'AutoSave must be inactive');
    assertEqual(ui.isQuestionLocked(101), true, 'All questions must be locked');
    assertEqual(ui.isQuestionLocked(102), true, 'All questions must be locked');
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.filter((r) => !r.passed).length;
  console.log(`TOTAL TESTS: ${allResults.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
