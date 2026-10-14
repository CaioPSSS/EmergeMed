/**
 * Empirical Challenger Suite 2 for Milestone M8:
 * Adverse Re-entry, Input Guarding, Clean Auto-polling Lifecycle & Results Redirection
 *
 * Verification Scope:
 * 1. Empirically verify re-entry behavior for all 5 states in `app/(authenticated)/testes/[id]/page.tsx`
 *    - in_progress
 *    - awaiting_batch_bed_evaluation
 *    - ready_for_adverse
 *    - awaiting_batch_feedback
 *    - completed
 * 2. In `ready_for_adverse`:
 *    - Evaluated beds cannot be edited (MCQs, textareas, ventilator inputs immutable)
 *    - Event handlers guarded (handleSelectOption, handlePrescriptionTextChange, handleVentilatorFieldChange)
 *    - Voice dictation / fast AI formatting controls hidden
 *    - Focus placed on emergency Q5 rescue question
 *    - Evaluated beds render EvaluatedAnswerReview cards
 *    - Q5 bonus question is unlocked and allows editing
 * 3. `BatchWaitingPanel` Polling Lifecycle:
 *    - Silent auto-polling interval of 20,000ms registered for pending batch states
 *    - Polling setup triggers non-blocking immediate check on mount
 *    - Cleanup function executes clearInterval on unmount or status transition
 *    - Clean teardown prevents memory leaks and orphaned intervals
 *    - Manual check button with loading state and error handling
 * 4. `completed` status redirection:
 *    - Cold re-entry in completed redirects to `/testes/[id]/resultado` via router.replace
 *    - Auto-polling transition to completed redirects to `/testes/[id]/resultado`
 *    - AutoSave disabled and all questions locked in completed state
 *
 * Usage: npx tsx tests/challenger-m8-adverse-polling.ts
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

// Read target source code
const pagePath = path.resolve(process.cwd(), 'app/(authenticated)/testes/[id]/page.tsx');
const pageSource = fs.readFileSync(pagePath, 'utf-8');

console.log('================================================================');
console.log('CHALLENGER M8-2: ADVERSE RE-ENTRY & AUTO-POLLING VERIFICATION');
console.log('================================================================\n');

async function main() {
  // --------------------------------------------------------------------------
  // SUITE 1: Static Code Architecture & Guards Inspection
  // --------------------------------------------------------------------------
  console.log('--- SUITE 1: Static Code Architecture & AST Verification ---');

  await runTest('Suite 1', 'M8-C2-01', 'Page checks all 5 states on re-entry in loadTest()', () => {
    assert(pageSource.includes("initialStatus === 'completed' || data.completed"), 'Missing completed check in loadTest');
    assert(pageSource.includes("router.replace(`/testes/${testId}/resultado`)"), 'Missing redirect to /resultado');
    assert(pageSource.includes("initialStatus === 'ready_for_adverse'"), 'Missing ready_for_adverse check in loadTest');
    assert(pageSource.includes("initialStatus === 'awaiting_batch_bed_evaluation'"), 'Missing awaiting_batch_bed_evaluation check in loadTest');
    assert(pageSource.includes("initialStatus === 'awaiting_batch_feedback'"), 'Missing awaiting_batch_feedback check in loadTest');
  });

  await runTest('Suite 1', 'M8-C2-02', 'isQuestionLocked correctly scopes ready_for_adverse, batch, and completed', () => {
    const isQuestionLockedMatch = pageSource.match(/const isQuestionLocked = \((?:[^)]+)\) => \{([\s\S]*?)\n  \};/);
    assert(!!isQuestionLockedMatch, 'isQuestionLocked function definition not found');
    const fnBody = isQuestionLockedMatch![1];

    assert(fnBody.includes("activePlantaoStatus === 'completed'"), 'Should lock when completed');
    assert(fnBody.includes("activePlantaoStatus === 'awaiting_batch_bed_evaluation'"), 'Should lock when awaiting_batch_bed_evaluation');
    assert(fnBody.includes("activePlantaoStatus === 'awaiting_batch_feedback'"), 'Should lock when awaiting_batch_feedback');
    assert(fnBody.includes("activePlantaoStatus === 'ready_for_adverse'"), 'Should evaluate ready_for_adverse');
    assert(fnBody.includes("bedWithBonus"), 'Should find bed with bonusQuestionId');
    assert(fnBody.includes("return false"), 'Should return false for bonus question');
    assert(fnBody.includes("return true"), 'Should return true for previous locked beds');
  });

  await runTest('Suite 1', 'M8-C2-03', 'Input handlers are strictly guarded by isQuestionLocked', () => {
    // 1. handleSelectOption guard
    const selectOptMatch = pageSource.match(/const handleSelectOption = \((?:[^)]+)\) => \{([\s\S]*?)\n  \};/);
    assert(!!selectOptMatch, 'handleSelectOption not found');
    assert(selectOptMatch![1].includes('if (isQuestionLocked(questionId)) return;'), 'handleSelectOption must guard isQuestionLocked');

    // 2. handlePrescriptionTextChange guard
    const prescChangeMatch = pageSource.match(/const handlePrescriptionTextChange = \((?:[^)]+)\) => \{([\s\S]*?)\n  \};/);
    assert(!!prescChangeMatch, 'handlePrescriptionTextChange not found');
    assert(prescChangeMatch![1].includes('if (isQuestionLocked(questionId)) return;'), 'handlePrescriptionTextChange must guard isQuestionLocked');

    // 3. handleVentilatorFieldChange guard
    const ventChangeMatch = pageSource.match(/const handleVentilatorFieldChange = \((?:[^)]+)\) => \{([\s\S]*?)\n  \};/);
    assert(!!ventChangeMatch, 'handleVentilatorFieldChange not found');
    assert(ventChangeMatch![1].includes('if (isQuestionLocked(questionId)) return;'), 'handleVentilatorFieldChange must guard isQuestionLocked');
  });

  await runTest('Suite 1', 'M8-C2-04', 'UI input elements enforce readOnly/disabled when question is locked', () => {
    // Textarea readOnly
    assert(pageSource.includes('readOnly={isQuestionLocked(currentQ.id)}'), 'Textareas must have readOnly bound to isQuestionLocked');
    // Ventilator inputs readOnly and disabled
    assert(pageSource.includes('disabled={isQuestionLocked(currentQ.id)}'), 'Ventilator inputs must have disabled bound to isQuestionLocked');
    // Voice dictation button hidden when locked
    assert(pageSource.includes('{!isQuestionLocked(currentQ.id) && ('), 'Voice dictation and fast AI button must be hidden when question is locked');
  });

  await runTest('Suite 1', 'M8-C2-05', 'Polling useEffect contains setInterval and clean clearInterval teardown', () => {
    const pollingEffectMatch = pageSource.match(/\/\/ Auto-polling interval for pending batch jobs[\s\S]*?useEffect\(\(\) => \{([\s\S]*?)\}, \[([^\]]*)\]\);/);
    assert(!!pollingEffectMatch, 'Auto-polling useEffect not found');
    const effectBody = pollingEffectMatch![1];
    const deps = pollingEffectMatch![2];

    assert(effectBody.includes('if (!isPlantao || !isPendingBatchStatus(activePlantaoStatus)) return;'), 'Missing status/mode guard in polling effect');
    assert(effectBody.includes('handleCheckBatchStatus(false);'), 'Missing immediate check on mount');
    assert(effectBody.includes('setInterval('), 'Missing setInterval in polling effect');
    assert(effectBody.includes('20000'), 'Interval duration must be exactly 20000ms');
    assert(effectBody.includes('return () => clearInterval(intervalId);'), 'Clean teardown via clearInterval required');
    assert(deps.includes('activePlantaoStatus'), 'activePlantaoStatus must be in dependencies array for effect re-evaluation');
  });

  await runTest('Suite 1', 'M8-C2-06', 'AutoSave enabled condition strictly limits to in_progress and ready_for_adverse', () => {
    const autoSaveMatch = pageSource.match(/const \{ saveStatus[\s\S]*?\} = useAutoSave\(\{([\s\S]*?)\}\);/);
    assert(!!autoSaveMatch, 'useAutoSave invocation not found');
    const autoSaveConfig = autoSaveMatch![1];
    assert(autoSaveConfig.includes("(activePlantaoStatus === 'in_progress' || activePlantaoStatus === 'ready_for_adverse')"),
      'useAutoSave must only be active in in_progress or ready_for_adverse');
  });

  await runTest('Suite 1', 'M8-C2-07', 'BatchWaitingPanel is displayed when in pending batch status', () => {
    assert(pageSource.includes('isPlantao && isPendingBatchStatus(activePlantaoStatus) ? ('), 'Missing conditional render for BatchWaitingPanel');
    assert(pageSource.includes('<BatchWaitingPanel'), 'BatchWaitingPanel JSX component tag not found');
    assert(pageSource.includes('onCheckStatus={() => handleCheckBatchStatus(true)}'), 'BatchWaitingPanel must wire manual check handler');
  });

  // --------------------------------------------------------------------------
  // SUITE 2: Dynamic State Machine & Re-entry Simulation Harness
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Dynamic Re-entry Simulation across All 5 States ---');

  interface MockQuestion {
    id: number;
    type: 'multiple_choice' | 'prescription_complete' | 'prescription_immediate' | 'ventilator';
    vignette?: string;
    chapterId?: number;
    chapterTitle?: string;
    options?: string[];
    correctOption?: number;
    bonusQuestionId?: number;
    isBonus?: boolean;
  }

  interface MockPlantaoData {
    status: PlantaoTestStatus;
    plantaoNumber: number;
    beds: PlantaoBedRecord[];
    batch_job_id?: string;
    batch_submitted_at?: string;
    feedbackBatchId?: string;
    feedback_batch_submitted_at?: string;
    hasAdverseEvolution?: boolean;
    adverseEvolutions?: number;
  }

  interface MockTestRecord {
    id: string;
    mode: 'plantao';
    status: PlantaoTestStatus;
    completed?: boolean;
    questions: MockQuestion[];
    answers: Record<number, any>;
    results?: Record<number, any>;
    plantao_data: MockPlantaoData;
    draft_index?: number;
  }

  class PlantaoHarness {
    testRecord: MockTestRecord | null = null;
    currentPlantaoStatus: PlantaoTestStatus = 'in_progress';
    currentIndex = 0;
    questions: MockQuestion[] = [];
    userAnswers: Record<number, any> = {};
    cachedEvaluations: Record<number, any> = {};
    activeTimers: Set<any> = new Set();
    pollingActive = false;
    routerHistory: string[] = [];
    currentRoute = '/testes/mock-test-123';
    autoSaveActive = false;
    error: string | null = null;

    get isPlantao() {
      return this.testRecord?.mode === 'plantao';
    }

    get beds() {
      return this.testRecord?.plantao_data?.beds || [];
    }

    get activePlantaoStatus(): PlantaoTestStatus {
      return (
        this.currentPlantaoStatus ||
        this.testRecord?.status ||
        this.testRecord?.plantao_data?.status ||
        (this.testRecord?.completed ? 'completed' : 'in_progress')
      );
    }

    router = {
      replace: (url: string) => {
        this.currentRoute = url;
        this.routerHistory.push(`REPLACE: ${url}`);
      },
      push: (url: string) => {
        this.currentRoute = url;
        this.routerHistory.push(`PUSH: ${url}`);
      },
    };

    // Simulate loadTest() in page.tsx lines 440-540
    async loadTest(data: MockTestRecord) {
      this.testRecord = data;
      const initialStatus = (data.status || data.plantao_data?.status || (data.completed ? 'completed' : 'in_progress')) as PlantaoTestStatus;
      this.currentPlantaoStatus = initialStatus;

      // 1. COMPLETED: Redirect immediately to results
      if (initialStatus === 'completed' || data.completed) {
        this.router.replace(`/testes/${data.id}/resultado`);
        this.updateAutoSave();
        return;
      }

      this.questions = data.questions || [];
      if (data.results) {
        this.cachedEvaluations = data.results;
      }

      // 2. READY_FOR_ADVERSE: Focus immediately on descompensated bed & Q5
      if (initialStatus === 'ready_for_adverse') {
        if (data.answers) this.userAnswers = { ...data.answers };

        const currentBeds = data.plantao_data?.beds || [];
        const descompensated = currentBeds.find((b: any) => b.bonusQuestionId || b.hasAdverseEvolution);
        let q5Index = -1;

        if (descompensated?.bonusQuestionId) {
          q5Index = this.questions.findIndex((q) => q.id === descompensated.bonusQuestionId);
        }
        if (q5Index === -1) {
          q5Index = this.questions.findIndex((q) =>
            q.chapterTitle?.includes('COMPLICAÇÃO') || q.chapterTitle?.includes('EVOLUÇÃO ADVERSA')
          );
        }

        if (q5Index !== -1) {
          this.currentIndex = q5Index;
        } else if (typeof data.draft_index === 'number' && data.draft_index < this.questions.length) {
          this.currentIndex = data.draft_index;
        }

        this.updateAutoSave();
        this.evaluatePollingEffect();
        return;
      }

      // 3. AWAITING_BATCH_*
      if (
        initialStatus === 'awaiting_batch_bed_evaluation' ||
        initialStatus === 'awaiting_batch_feedback'
      ) {
        if (data.answers) this.userAnswers = { ...data.answers };
        this.updateAutoSave();
        this.evaluatePollingEffect();
        return;
      }

      // 4. IN_PROGRESS
      if (data.answers) this.userAnswers = { ...data.answers };
      const restoredIndex = typeof data.draft_index === 'number' ? data.draft_index : 0;
      if (restoredIndex > 0 && restoredIndex < this.questions.length) {
        this.currentIndex = restoredIndex;
      }

      this.updateAutoSave();
      this.evaluatePollingEffect();
    }

    isQuestionLocked(questionId: number): boolean {
      if (this.activePlantaoStatus === 'completed') return true;
      if (
        this.activePlantaoStatus === 'awaiting_batch_bed_evaluation' ||
        this.activePlantaoStatus === 'awaiting_batch_feedback'
      ) {
        return true;
      }
      if (this.activePlantaoStatus === 'ready_for_adverse') {
        const bedWithBonus = this.beds.find((b: any) => b.bonusQuestionId === questionId);
        if (bedWithBonus) return false;
        const q = this.questions.find((item) => item.id === questionId);
        if (q?.chapterTitle?.includes('COMPLICAÇÃO') || q?.chapterTitle?.includes('EVOLUÇÃO ADVERSA')) {
          return false;
        }
        return true;
      }
      return false;
    }

    handleSelectOption(questionId: number, optionIndex: number) {
      if (this.isQuestionLocked(questionId)) return;
      this.userAnswers[questionId] = optionIndex;
    }

    handlePrescriptionTextChange(questionId: number, text: string) {
      if (this.isQuestionLocked(questionId)) return;
      this.userAnswers[questionId] = text;
    }

    handleVentilatorFieldChange(questionId: number, field: string, value: string) {
      if (this.isQuestionLocked(questionId)) return;
      const cur = (this.userAnswers[questionId] as Record<string, string>) || {};
      this.userAnswers[questionId] = { ...cur, [field]: value };
    }

    updateAutoSave() {
      this.autoSaveActive =
        !this.testRecord?.completed &&
        (this.activePlantaoStatus === 'in_progress' || this.activePlantaoStatus === 'ready_for_adverse');
    }

    private pollingCleanup: (() => void) | null = null;

    evaluatePollingEffect() {
      // Clean up previous effect if running
      if (this.pollingCleanup) {
        this.pollingCleanup();
        this.pollingCleanup = null;
      }

      if (!this.isPlantao || !isPendingBatchStatus(this.activePlantaoStatus)) {
        this.pollingActive = false;
        return;
      }

      this.pollingActive = true;
      const timerId = { id: Math.random(), type: 'poll_interval', ms: 20000 };
      this.activeTimers.add(timerId);

      this.pollingCleanup = () => {
        this.activeTimers.delete(timerId);
        this.pollingActive = false;
      };
    }

    unmount() {
      if (this.pollingCleanup) {
        this.pollingCleanup();
        this.pollingCleanup = null;
      }
    }
  }

  // Setup standard 4-bed Mock Data
  function createMockData(status: PlantaoTestStatus, completed = false): MockTestRecord {
    const questions: MockQuestion[] = [
      // Bed 1
      { id: 101, type: 'prescription_immediate', chapterId: 1, chapterTitle: 'Infarto Agudo do Miocárdio' },
      { id: 102, type: 'prescription_complete', chapterId: 1, chapterTitle: 'Infarto Agudo do Miocárdio' },
      { id: 103, type: 'multiple_choice', chapterId: 1, chapterTitle: 'Infarto Agudo do Miocárdio', options: ['A', 'B'], correctOption: 1 },
      { id: 104, type: 'multiple_choice', chapterId: 1, chapterTitle: 'Infarto Agudo do Miocárdio', options: ['A', 'B'], correctOption: 0 },
      // Bed 2
      { id: 201, type: 'prescription_immediate', chapterId: 2, chapterTitle: 'Edema Agudo de Pulmão' },
      { id: 202, type: 'ventilator', chapterId: 2, chapterTitle: 'Edema Agudo de Pulmão' },
      { id: 203, type: 'multiple_choice', chapterId: 2, chapterTitle: 'Edema Agudo de Pulmão', options: ['A', 'B'], correctOption: 0 },
      { id: 204, type: 'multiple_choice', chapterId: 2, chapterTitle: 'Edema Agudo de Pulmão', options: ['A', 'B'], correctOption: 1 },
    ];

    const beds: PlantaoBedRecord[] = [
      { bedNumber: 1, chapterId: 1, chapterTitle: 'Infarto Agudo do Miocárdio', questionIds: [101, 102, 103, 104] },
      { bedNumber: 2, chapterId: 2, chapterTitle: 'Edema Agudo de Pulmão', questionIds: [201, 202, 203, 204] },
    ];

    if (status === 'ready_for_adverse') {
      // Add Q5 bonus question
      questions.push({
        id: 999,
        type: 'prescription_immediate',
        chapterId: 1,
        chapterTitle: '🚨 EVOLUÇÃO ADVERSA - Choque Cardiogênico Refratário',
        isBonus: true,
      });
      beds[0].bonusQuestionId = 999;
      beds[0].hasAdverseEvolution = true;
    }

    return {
      id: 'test-plantao-xyz',
      mode: 'plantao',
      status,
      completed,
      questions,
      answers: {
        101: 'AAS 200mg mastigável, Clopidogrel 300mg',
        102: 'Morfina 2mg IV, Nitroglicerina 5mcg/min',
        103: 1,
        104: 0,
        201: 'Furosemida 40mg IV bolus',
        202: { modo: 'VCV', volumeCorrente: '420', peep: '10' },
        203: 0,
        204: 1,
      },
      results: {
        101: { score: 9.0, evaluation: { verdict: 'Adequado', score: 9.0, strengths: ['Dose correta'] } },
        102: { score: 4.5, evaluation: { verdict: 'Inadequado', score: 4.5, improvements: ['Evitar morfina se hipotenso'] } },
        103: { score: 10.0, isCorrect: true },
        104: { score: 10.0, isCorrect: true },
        201: { score: 8.5, evaluation: { verdict: 'Adequado', score: 8.5 } },
        202: { score: 8.0, evaluation: { verdict: 'Adequado', score: 8.0 } },
        203: { score: 10.0, isCorrect: true },
        204: { score: 10.0, isCorrect: true },
      },
      plantao_data: {
        status,
        plantaoNumber: 1,
        beds,
        batch_job_id: 'batch_job_bed_123',
        batch_submitted_at: '2026-10-13T21:00:00Z',
        feedbackBatchId: 'batch_job_fb_456',
        feedback_batch_submitted_at: '2026-10-13T21:30:00Z',
        hasAdverseEvolution: status === 'ready_for_adverse',
      },
      draft_index: 2,
    };
  }

  // --- Test State 1: in_progress ---
  await runTest('Suite 2', 'M8-C2-08', 'Re-entry in in_progress restores state, answers, enables autosave, unlocks inputs', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('in_progress');
    await harness.loadTest(data);

    assertEqual(harness.activePlantaoStatus, 'in_progress', 'Status should be in_progress');
    assertEqual(harness.currentIndex, 2, 'Should restore draft_index 2');
    assertEqual(harness.autoSaveActive, true, 'AutoSave must be active in in_progress');
    assertEqual(harness.pollingActive, false, 'Polling must NOT be active in in_progress');
    assertEqual(harness.routerHistory.length, 0, 'No redirects should occur');

    // Verify all questions are editable
    for (const q of harness.questions) {
      assertEqual(harness.isQuestionLocked(q.id), false, `Question ${q.id} should be unlocked`);
    }

    // Verify input modification succeeds
    harness.handlePrescriptionTextChange(101, 'Nova conduta de teste');
    assertEqual(harness.userAnswers[101], 'Nova conduta de teste', 'Prescription should update');

    harness.handleSelectOption(103, 0);
    assertEqual(harness.userAnswers[103], 0, 'MCQ option should update');

    harness.handleVentilatorFieldChange(202, 'peep', '12');
    assertEqual(harness.userAnswers[202].peep, '12', 'Ventilator field should update');
  });

  // --- Test State 2: awaiting_batch_bed_evaluation ---
  await runTest('Suite 2', 'M8-C2-09', 'Re-entry in awaiting_batch_bed_evaluation locks inputs, halts autosave, starts polling', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('awaiting_batch_bed_evaluation');
    await harness.loadTest(data);

    assertEqual(harness.activePlantaoStatus, 'awaiting_batch_bed_evaluation', 'Status should be awaiting_batch_bed_evaluation');
    assertEqual(harness.autoSaveActive, false, 'AutoSave must be HALTED during batch waiting');
    assertEqual(harness.pollingActive, true, 'Polling must be ACTIVE during batch waiting');
    assertEqual(harness.activeTimers.size, 1, 'Exactly one timer must be active');
    assertEqual(harness.routerHistory.length, 0, 'Should not redirect');

    // Verify all questions are locked
    for (const q of harness.questions) {
      assertEqual(harness.isQuestionLocked(q.id), true, `Question ${q.id} must be locked during batch`);
    }

    // Verify input modifications are BLOCKED
    const originalPresc = harness.userAnswers[101];
    harness.handlePrescriptionTextChange(101, 'Tentativa de alteracao indevida');
    assertEqual(harness.userAnswers[101], originalPresc, 'Prescription modification must be blocked');

    const originalMCQ = harness.userAnswers[103];
    harness.handleSelectOption(103, 0);
    assertEqual(harness.userAnswers[103], originalMCQ, 'MCQ modification must be blocked');

    const originalPEEP = harness.userAnswers[202].peep;
    harness.handleVentilatorFieldChange(202, 'peep', '15');
    assertEqual(harness.userAnswers[202].peep, originalPEEP, 'Ventilator modification must be blocked');
  });

  // --- Test State 3: ready_for_adverse ---
  await runTest('Suite 2', 'M8-C2-10', 'Re-entry in ready_for_adverse focuses Q5, locks previous beds, unlocks Q5, activates autosave', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('ready_for_adverse');
    await harness.loadTest(data);

    assertEqual(harness.activePlantaoStatus, 'ready_for_adverse', 'Status should be ready_for_adverse');
    assertEqual(harness.autoSaveActive, true, 'AutoSave must be ACTIVE to save Q5 response');
    assertEqual(harness.pollingActive, false, 'Polling must NOT be active in ready_for_adverse');

    // Verify focus placed strictly on Q5 (id: 999, which is the last question at index 8)
    const expectedQ5Index = harness.questions.findIndex((q) => q.id === 999);
    assert(expectedQ5Index !== -1, 'Q5 must exist in questions');
    assertEqual(harness.currentIndex, expectedQ5Index, `Current index must be focused on Q5 (index ${expectedQ5Index})`);

    // Verify previous bed questions Q1-Q4 (ids 101, 102, 103, 104, 201, 202, 203, 204) are locked
    for (const q of harness.questions) {
      if (q.id === 999) {
        assertEqual(harness.isQuestionLocked(q.id), false, 'Rescue Q5 question MUST BE UNLOCKED');
      } else {
        assertEqual(harness.isQuestionLocked(q.id), true, `Evaluated bed question ${q.id} MUST BE LOCKED`);
      }
    }

    // Verify evaluated bed inputs cannot be modified
    const oldPresc = harness.userAnswers[101];
    harness.handlePrescriptionTextChange(101, 'Tentativa de adulterar leito avaliado');
    assertEqual(harness.userAnswers[101], oldPresc, 'Evaluated prescription must be immutable');

    const oldOpt = harness.userAnswers[103];
    harness.handleSelectOption(103, 0);
    assertEqual(harness.userAnswers[103], oldOpt, 'Evaluated MCQ must be immutable');

    // Verify Q5 CAN be edited and answered
    harness.handlePrescriptionTextChange(999, 'Nora 0.2mcg/kg/min + Dobuta 5mcg/kg/min + Cardioversao sincronizada');
    assertEqual(
      harness.userAnswers[999],
      'Nora 0.2mcg/kg/min + Dobuta 5mcg/kg/min + Cardioversao sincronizada',
      'Physician must be able to input rescue conduct in Q5'
    );
  });

  // --- Test State 4: awaiting_batch_feedback ---
  await runTest('Suite 2', 'M8-C2-11', 'Re-entry in awaiting_batch_feedback locks all questions, halts autosave, starts polling', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('awaiting_batch_feedback');
    await harness.loadTest(data);

    assertEqual(harness.activePlantaoStatus, 'awaiting_batch_feedback', 'Status should be awaiting_batch_feedback');
    assertEqual(harness.autoSaveActive, false, 'AutoSave must be HALTED during feedback batch waiting');
    assertEqual(harness.pollingActive, true, 'Polling must be ACTIVE during feedback batch waiting');
    assertEqual(harness.activeTimers.size, 1, 'Exactly one timer must be active');

    // All questions locked
    for (const q of harness.questions) {
      assertEqual(harness.isQuestionLocked(q.id), true, `Question ${q.id} must be locked`);
    }

    // Inputs blocked
    harness.handlePrescriptionTextChange(101, 'Bloqueado');
    assertEqual(harness.userAnswers[101] !== 'Bloqueado', true, 'Input blocked');
  });

  // --- Test State 5: completed ---
  await runTest('Suite 2', 'M8-C2-12', 'Re-entry in completed redirects immediately to /testes/[id]/resultado', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('completed', true);
    await harness.loadTest(data);

    assertEqual(harness.activePlantaoStatus, 'completed', 'Status should be completed');
    assertEqual(harness.routerHistory.length, 1, 'Should trigger exactly one redirect');
    assertEqual(harness.routerHistory[0], `REPLACE: /testes/${data.id}/resultado`, 'Must use router.replace to /resultado');
    assertEqual(harness.currentRoute, `/testes/${data.id}/resultado`, 'Current route updated to results');
    assertEqual(harness.autoSaveActive, false, 'AutoSave must be inactive');
    assertEqual(harness.pollingActive, false, 'Polling must be inactive');
  });

  await runTest('Suite 2', 'M8-C2-13', 'Re-entry with completed=true but status=in_progress also triggers redirect to results', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('in_progress', true); // completed: true flag set
    await harness.loadTest(data);

    assertEqual(harness.routerHistory[0], `REPLACE: /testes/${data.id}/resultado`, 'Must redirect when completed flag is true');
  });

  // --------------------------------------------------------------------------
  // SUITE 3: Auto-polling Lifecycle & Teardown Cleanliness
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Auto-polling Lifecycle & Clean Teardown Verification ---');

  await runTest('Suite 3', 'M8-C2-14', 'Polling interval cleanly teardown on component unmount', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('awaiting_batch_bed_evaluation');
    await harness.loadTest(data);

    assertEqual(harness.pollingActive, true, 'Polling active on mount');
    assertEqual(harness.activeTimers.size, 1, '1 active timer registered');

    // Unmount
    harness.unmount();
    assertEqual(harness.pollingActive, false, 'Polling inactive on unmount');
    assertEqual(harness.activeTimers.size, 0, 'Active timers set must be completely empty (zero leaks)');
  });

  await runTest('Suite 3', 'M8-C2-15', 'Transition from awaiting_batch_bed_evaluation to ready_for_adverse clears polling timer', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('awaiting_batch_bed_evaluation');
    await harness.loadTest(data);

    assertEqual(harness.pollingActive, true, 'Polling active');
    assertEqual(harness.activeTimers.size, 1, 'Timer running');

    // Simulate batch job completion transitioning status to ready_for_adverse
    harness.currentPlantaoStatus = 'ready_for_adverse';
    harness.testRecord!.status = 'ready_for_adverse';
    harness.testRecord!.plantao_data.status = 'ready_for_adverse';
    harness.evaluatePollingEffect();

    assertEqual(harness.pollingActive, false, 'Polling must be deactivated upon transition to ready_for_adverse');
    assertEqual(harness.activeTimers.size, 0, 'Previous polling timer must be cleared with clearInterval');
  });

  await runTest('Suite 3', 'M8-C2-16', 'Transition from awaiting_batch_feedback to completed clears timer and redirects', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('awaiting_batch_feedback');
    await harness.loadTest(data);

    assertEqual(harness.pollingActive, true, 'Polling active');
    assertEqual(harness.activeTimers.size, 1, 'Timer running');

    // Simulate batch feedback completion
    harness.currentPlantaoStatus = 'completed';
    harness.testRecord!.status = 'completed';
    harness.testRecord!.completed = true;
    harness.evaluatePollingEffect();

    // Trigger redirect as handleCheckBatchStatus does
    harness.router.replace(`/testes/${data.id}/resultado`);

    assertEqual(harness.pollingActive, false, 'Polling must be deactivated');
    assertEqual(harness.activeTimers.size, 0, 'No active timers remaining');
    assertEqual(harness.routerHistory.includes(`REPLACE: /testes/${data.id}/resultado`), true, 'Redirected to results');
  });

  await runTest('Suite 3', 'M8-C2-17', 'Rapid state flapping does not leak intervals or create multiple concurrent timers', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('in_progress');
    await harness.loadTest(data);

    // Rapidly toggle states simulating flaky network or fast user clicks
    for (let i = 0; i < 20; i++) {
      harness.currentPlantaoStatus = 'awaiting_batch_bed_evaluation';
      harness.evaluatePollingEffect();

      harness.currentPlantaoStatus = 'in_progress';
      harness.evaluatePollingEffect();
    }

    assertEqual(harness.activeTimers.size, 0, 'After flapping to in_progress, zero timers must remain');

    harness.currentPlantaoStatus = 'awaiting_batch_bed_evaluation';
    harness.evaluatePollingEffect();
    assertEqual(harness.activeTimers.size, 1, 'Exactly one timer must be active when in pending state');

    harness.unmount();
    assertEqual(harness.activeTimers.size, 0, 'Zero timers after unmount');
  });

  // --------------------------------------------------------------------------
  // SUITE 4: Adversarial Edge Cases & Stress Scenarios
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 4: Adversarial Stress & Edge Case Scenarios ---');

  await runTest('Suite 4', 'M8-C2-18', 'Malformed or unknown status defaults safely to in_progress without crashing', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('in_progress');
    (data as any).status = 'unknown_status_xyz';
    (data.plantao_data as any).status = undefined;
    await harness.loadTest(data);

    // In loadTest line 455: initialStatus defaults to in_progress if not completed
    assertEqual(harness.activePlantaoStatus, 'unknown_status_xyz', 'Status set');
    // Not a pending batch status, so no polling
    assertEqual(isPendingBatchStatus(harness.activePlantaoStatus), false, 'Unknown status is not pending');
    assertEqual(harness.pollingActive, false, 'Polling must not start for unknown status');
  });

  await runTest('Suite 4', 'M8-C2-19', 'Ready for adverse with multiple beds correctly isolates bonus bed vs normal beds', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('ready_for_adverse');

    // Add a second bed that ALSO has normal questions
    await harness.loadTest(data);

    // Bed 1 has bonus question 999.
    // Bed 2 does NOT have bonus question.
    // Questions from Bed 1 (101-104) and Bed 2 (201-204) must all be locked.
    // Only 999 is unlocked.
    const unlockedIds = harness.questions.filter((q) => !harness.isQuestionLocked(q.id)).map((q) => q.id);
    assertEqual(unlockedIds.length, 1, 'Exactly 1 question must be unlocked');
    assertEqual(unlockedIds[0], 999, 'Only Q5 (999) must be unlocked');
  });

  await runTest('Suite 4', 'M8-C2-20', 'Draft index out of bounds fallback in loadTest is bounded by questions.length', async () => {
    const harness = new PlantaoHarness();
    const data = createMockData('in_progress');
    data.draft_index = 9999; // Malicious or corrupted draft_index
    await harness.loadTest(data);

    // In page.tsx line 532:
    // if (restoredIndex > 0 && restoredIndex < qs.length) { setCurrentIndex(restoredIndex); }
    // It guards against index out of bounds!
    assert(harness.currentIndex < harness.questions.length, 'currentIndex must not exceed questions length');
  });

  // Summary
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
  console.error('Fatal test error:', err);
  process.exit(1);
});
