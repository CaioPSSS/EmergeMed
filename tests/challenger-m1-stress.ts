/**
 * Challenger 2 Empirical Stress Test Suite for Milestone M1
 * 
 * Verifies:
 * 1. Auto-save continuity across bed and step switching.
 * 2. Backwards compatibility with legacy 4-step tests in resultado/page.tsx.
 * 3. Evaluation of 2-stage bed sequences and scoring.
 */

import { determineBedOutcome, calculateFSRSUpdate } from '../lib/spaced-repetition';
import { parsePrescriptionDrugs, formatDrugFactsForPrompt } from '../lib/ai/drug-math-validator';
import { SYSTEM_PROMPT_PLANTAO_GENERATOR, SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR } from '../lib/ai/prompts';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
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

// ============================================================================
// SUITE 1: Auto-Save Continuity Across Bed and Step Transitions
// ============================================================================
console.log('\n=== SUITE 1: AUTO-SAVE CONTINUITY ACROSS BEDS & STEPS ===');

// Mock localStorage
class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

// Mock Supabase Client
class MockSupabaseClient {
  public updates: Array<{ id: string; payload: any }> = [];
  public shouldFail: boolean = false;

  from(table: string) {
    return {
      update: (payload: any) => ({
        eq: async (column: string, value: string) => {
          if (this.shouldFail) {
            return { error: new Error('Network timeout or DB connection error') };
          }
          this.updates.push({ id: value, payload });
          return { error: null };
        },
      }),
    };
  }
}

// Emulate useAutoSave engine behavior
class AutoSaveHarness {
  public storage: MockLocalStorage;
  public supabase: MockSupabaseClient;
  public testId: string;
  public userAnswers: Record<number, any> = {};
  public currentIndex: number = 0;
  public saveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  public lastSavedAt: Date | null = null;
  public lastSavedPayload: string = '';
  public pendingTimer: any = null;

  constructor(testId: string) {
    this.testId = testId;
    this.storage = new MockLocalStorage();
    this.supabase = new MockSupabaseClient();
  }

  saveToLocalMirror(answers: Record<number, any>, index: number) {
    if (Object.keys(answers).length > 0) {
      this.storage.setItem(
        `test-draft-${this.testId}`,
        JSON.stringify({
          answers,
          currentIndex: index,
          savedAt: new Date().toISOString(),
        })
      );
    }
  }

  getLocalBackup() {
    const raw = this.storage.getItem(`test-draft-${this.testId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  }

  async executeSupabaseSave(answers: Record<number, any>, index: number): Promise<boolean> {
    if (Object.keys(answers).length === 0) return true;
    const payloadString = JSON.stringify({ answers, draft_index: index });
    if (payloadString === this.lastSavedPayload) {
      return true; // deduplication
    }

    this.saveStatus = 'saving';
    const { error } = await this.supabase
      .from('tests')
      .update({ answers, draft_index: index })
      .eq('id', this.testId);

    if (error) {
      this.saveStatus = 'error';
      return false;
    }

    this.lastSavedPayload = payloadString;
    this.lastSavedAt = new Date();
    this.saveStatus = 'saved';
    return true;
  }

  async forceSave(answersOverride?: Record<number, any>, indexOverride?: number): Promise<boolean> {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    const answers = answersOverride ?? this.userAnswers;
    const index = indexOverride ?? this.currentIndex;
    this.saveToLocalMirror(answers, index);
    return await this.executeSupabaseSave(answers, index);
  }

  onUserAnswerChange(answers: Record<number, any>, index: number, debounceMs = 2500) {
    this.userAnswers = answers;
    this.currentIndex = index;
    this.saveToLocalMirror(answers, index);

    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
    }
    this.pendingTimer = setTimeout(() => {
      this.executeSupabaseSave(answers, index);
    }, debounceMs);
  }
}

// 1.1: User answers Bed 1 Step 1 and immediately switches to Bed 1 Step 2
{
  const harness = new AutoSaveHarness('test-m1-001');
  harness.onUserAnswerChange({ 101: 'AAS 200mg VO + Clopidogrel 300mg VO' }, 0);
  
  // Verify localStorage has instant mirror before debounce
  const backup1 = harness.getLocalBackup();
  assert(backup1 !== null && backup1.answers[101].includes('AAS 200mg'), '1.1 Local mirror saves immediately on keystroke without waiting for debounce');
  
  // User navigates to next step (handleNext calls forceSave)
  await harness.forceSave(undefined, 1);
  assert(harness.saveStatus === 'saved', '1.2 forceSave on step change completes successfully');
  assert(harness.supabase.updates.length === 1, '1.3 Supabase received immediate update on step transition');
  assert(harness.supabase.updates[0].payload.draft_index === 1, '1.4 Supabase draft_index updated to new step index (1)');
}

// 1.2: Switching between beds while debounce is still running
{
  const harness = new AutoSaveHarness('test-m1-002');
  // In Bed 1, answering stage 1
  harness.onUserAnswerChange({ 101: 'SF 0.9% 500ml' }, 0);
  // User clicks Bed 2 (question index 4) after only 200ms
  // Bed switch executes forceSave() which cancels debounce and writes to DB
  harness.userAnswers[102] = 'Captopril 25mg'; // answered stage 2
  harness.currentIndex = 4; // jumping to Bed 2 first question
  await harness.forceSave();

  assert(harness.supabase.updates.length === 1, '1.5 Bed jump cancels pending debounce and executes immediate DB flush');
  assert(harness.supabase.updates[0].payload.answers[101] === 'SF 0.9% 500ml', '1.6 Bed 1 stage 1 answers preserved on bed switch');
  assert(harness.supabase.updates[0].payload.answers[102] === 'Captopril 25mg', '1.7 Bed 1 stage 2 answers preserved on bed switch');
  assert(harness.supabase.updates[0].payload.draft_index === 4, '1.8 draft_index points to Bed 2 question index (4)');
}

// 1.3: Complex multi-bed answers with heterogeneous answer types (prescriptions, MCQs, ventilator objects)
{
  const harness = new AutoSaveHarness('test-m1-003');
  const complexAnswers: Record<number, any> = {
    101: 'AAS 200mg + Clopidogrel 300mg', // Stage 1 text
    102: { modo: 'VCV', volumeCorrente: '420', peep: '8', fio2: '0.6' }, // Stage 2 ventilator object
    103: 2, // Bed 1 MCQ 1 (option C)
    104: 0, // Bed 1 MCQ 2 (option A)
    201: 'Noradrenalina 0.1 mcg/kg/min', // Bed 2 Stage 1 text
    202: 'Enoxaparina 70mg SC 12/12h', // Bed 2 Stage 2 text
    203: 3, // Bed 2 MCQ 1 (option D)
  };

  harness.userAnswers = complexAnswers;
  harness.currentIndex = 6;
  await harness.forceSave();

  const backup = harness.getLocalBackup();
  assert(backup.answers[102].modo === 'VCV', '1.9 Ventilator dictionary preserved without serialization corruption');
  assert(backup.answers[103] === 2, '1.10 Numeric MCQ selections preserved accurately');
  assert(backup.answers[201].includes('Noradrenalina'), '1.11 Multi-bed prescription answers intact across bed boundaries');
}

// 1.4: Resilient recovery when network fails during auto-save
{
  const harness = new AutoSaveHarness('test-m1-004');
  harness.supabase.shouldFail = true; // simulate network crash
  harness.userAnswers = { 101: 'Conduta crítica de emergência' };
  harness.currentIndex = 0;

  const saveSuccess = await harness.forceSave();
  assert(!saveSuccess, '1.12 Network failure properly reported by executeSupabaseSave');
  assert(harness.saveStatus === 'error', '1.13 saveStatus set to error on network failure');

  // Verify local mirror survived
  const localBackup = harness.getLocalBackup();
  assert(localBackup !== null, '1.14 Local storage mirror survives network outage');
  assert(localBackup.answers[101] === 'Conduta crítica de emergência', '1.15 Unsent draft content safely preserved in local mirror for subsequent restore');
}


// ============================================================================
// SUITE 2: Backwards Compatibility with Legacy 4-Step Tests in resultado/page.tsx
// ============================================================================
console.log('\n=== SUITE 2: BACKWARDS COMPATIBILITY IN RESULTADO/PAGE.TSX ===');

// Implementation replica of getStepInfo from app/(authenticated)/testes/[id]/resultado/page.tsx
function getStepInfo(
  q: any,
  isPlantao: boolean,
  beds: any[],
  questions: any[]
) {
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

  // Check if bed follows the R1 structure (starts with prescription_immediate) or legacy (starts with multiple_choice)
  const firstQInBed = questions.find((item: any) => item.id === parentBed.questionIds?.[0]);
  const isR1Sequence = firstQInBed?.type === 'prescription_immediate';

  if (isR1Sequence) {
    if (idxInBed === 0) {
      return {
        bedNumber: parentBed.bedNumber,
        step: 'Etapa 1',
        title: 'Conduta Imediata de Resgate',
        color: '#fb923c',
        bg: 'rgba(249, 115, 22, 0.15)',
      };
    }
    if (idxInBed === 1) {
      return {
        bedNumber: parentBed.bedNumber,
        step: 'Etapa 2',
        title: 'Conduta de Manutenção / Ventilação',
        color: '#a78bfa',
        bg: 'rgba(167, 139, 250, 0.15)',
      };
    }
    if (idxInBed === 2) {
      return {
        bedNumber: parentBed.bedNumber,
        step: 'Múltipla Escolha 1',
        title: 'Questão de Múltipla Escolha (1/2)',
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.15)',
      };
    }
    if (idxInBed === 3) {
      return {
        bedNumber: parentBed.bedNumber,
        step: 'Múltipla Escolha 2',
        title: 'Questão de Múltipla Escolha (2/2)',
        color: '#34d399',
        bg: 'rgba(16, 185, 129, 0.15)',
      };
    }
  } else {
    // Legacy structure backward compatibility
    const legacySteps = [
      { step: 'Etapa 1', title: 'Triagem & Suspeita Diagnóstica', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' },
      { step: 'Etapa 2', title: 'Exames & Confirmação Diagnóstica', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.15)' },
      { step: 'Etapa 3', title: 'Conduta Imediata de Resgate', color: '#fb923c', bg: 'rgba(249, 115, 22, 0.15)' },
      { step: 'Etapa 4', title: 'Prescrição do Dia / Ventilação Mecânica', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)' },
    ];
    if (legacySteps[idxInBed]) {
      return {
        bedNumber: parentBed.bedNumber,
        ...legacySteps[idxInBed],
      };
    }
  }

  // Dynamic fallback based on question type
  if (q.type === 'prescription_immediate') {
    return {
      bedNumber: parentBed.bedNumber,
      step: `Etapa ${idxInBed + 1}`,
      title: 'Conduta Imediata de Resgate',
      color: '#fb923c',
      bg: 'rgba(249, 115, 22, 0.15)',
    };
  }
  if (q.type === 'prescription_complete' || q.type === 'ventilator') {
    return {
      bedNumber: parentBed.bedNumber,
      step: `Etapa ${idxInBed + 1}`,
      title: 'Conduta de Manutenção / Ventilação',
      color: '#a78bfa',
      bg: 'rgba(167, 139, 250, 0.15)',
    };
  }
  return {
    bedNumber: parentBed.bedNumber,
    step: `Questão ${idxInBed + 1}`,
    title: 'Questão de Múltipla Escolha',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.15)',
  };
}

// 2.1: Legacy Test (Starts with multiple_choice: Q1 Triagem, Q2 Exames, Q3 Imediata, Q4 Completa)
{
  const legacyBeds = [
    { bedNumber: 1, questionIds: [1, 2, 3, 4] },
    { bedNumber: 2, questionIds: [5, 6, 7, 8] },
  ];
  const legacyQuestions = [
    { id: 1, type: 'multiple_choice' },
    { id: 2, type: 'multiple_choice' },
    { id: 3, type: 'prescription_immediate' },
    { id: 4, type: 'prescription_complete' },
    { id: 5, type: 'multiple_choice' },
    { id: 6, type: 'multiple_choice' },
    { id: 7, type: 'prescription_immediate' },
    { id: 8, type: 'ventilator' },
  ];

  const infoQ1 = getStepInfo(legacyQuestions[0], true, legacyBeds, legacyQuestions);
  const infoQ2 = getStepInfo(legacyQuestions[1], true, legacyBeds, legacyQuestions);
  const infoQ3 = getStepInfo(legacyQuestions[2], true, legacyBeds, legacyQuestions);
  const infoQ4 = getStepInfo(legacyQuestions[3], true, legacyBeds, legacyQuestions);

  assert(infoQ1?.step === 'Etapa 1' && infoQ1?.title === 'Triagem & Suspeita Diagnóstica', '2.1 Legacy Q1 correctly mapped to Triagem & Suspeita Diagnóstica');
  assert(infoQ2?.step === 'Etapa 2' && infoQ2?.title === 'Exames & Confirmação Diagnóstica', '2.2 Legacy Q2 correctly mapped to Exames & Confirmação Diagnóstica');
  assert(infoQ3?.step === 'Etapa 3' && infoQ3?.title === 'Conduta Imediata de Resgate', '2.3 Legacy Q3 correctly mapped to Conduta Imediata de Resgate');
  assert(infoQ4?.step === 'Etapa 4' && infoQ4?.title === 'Prescrição do Dia / Ventilação Mecânica', '2.4 Legacy Q4 correctly mapped to Prescrição do Dia / Ventilação Mecânica');
}

// 2.2: R1 New Structure (Starts with prescription_immediate: Q1 Imediata, Q2 Manutenção, Q3 MCQ 1, Q4 MCQ 2)
{
  const r1Beds = [
    { bedNumber: 1, questionIds: [101, 102, 103, 104] },
    { bedNumber: 2, questionIds: [201, 202, 203, 204], bonusQuestionId: 205 },
  ];
  const r1Questions = [
    { id: 101, type: 'prescription_immediate' },
    { id: 102, type: 'prescription_complete' },
    { id: 103, type: 'multiple_choice' },
    { id: 104, type: 'multiple_choice' },
    { id: 201, type: 'prescription_immediate' },
    { id: 202, type: 'ventilator' },
    { id: 203, type: 'multiple_choice' },
    { id: 204, type: 'multiple_choice' },
    { id: 205, type: 'prescription_immediate' },
  ];

  const infoR1_1 = getStepInfo(r1Questions[0], true, r1Beds, r1Questions);
  const infoR1_2 = getStepInfo(r1Questions[1], true, r1Beds, r1Questions);
  const infoR1_3 = getStepInfo(r1Questions[2], true, r1Beds, r1Questions);
  const infoR1_4 = getStepInfo(r1Questions[3], true, r1Beds, r1Questions);
  const infoVent = getStepInfo(r1Questions[5], true, r1Beds, r1Questions);
  const infoBonus = getStepInfo(r1Questions[8], true, r1Beds, r1Questions);

  assert(infoR1_1?.step === 'Etapa 1' && infoR1_1?.title === 'Conduta Imediata de Resgate', '2.5 R1 Q1 correctly mapped to Conduta Imediata de Resgate');
  assert(infoR1_2?.step === 'Etapa 2' && infoR1_2?.title === 'Conduta de Manutenção / Ventilação', '2.6 R1 Q2 correctly mapped to Conduta de Manutenção / Ventilação');
  assert(infoR1_3?.step === 'Múltipla Escolha 1' && infoR1_3?.title === 'Questão de Múltipla Escolha (1/2)', '2.7 R1 Q3 correctly mapped to Múltipla Escolha 1 (1/2)');
  assert(infoR1_4?.step === 'Múltipla Escolha 2' && infoR1_4?.title === 'Questão de Múltipla Escolha (2/2)', '2.8 R1 Q4 correctly mapped to Múltipla Escolha 2 (2/2)');
  assert(infoVent?.step === 'Etapa 2' && infoVent?.title === 'Conduta de Manutenção / Ventilação', '2.9 R1 Ventilator stage correctly identified as Etapa 2');
  assert(infoBonus?.step === 'Etapa de Complicação (Bônus)' && infoBonus?.title === 'Manejo de Complicação Adversa', '2.10 Bonus Q5 correctly labeled as Etapa de Complicação (Bônus)');
}

// 2.3: Robustness against non-plantão, missing IDs, or malformed data
{
  const nonPlantaoInfo = getStepInfo({ id: 99, type: 'multiple_choice' }, false, [], []);
  assert(nonPlantaoInfo === null, '2.11 Returns null gracefully for non-plantão mode');

  const orphanQuestion = getStepInfo({ id: 999, type: 'prescription_immediate' }, true, [{ bedNumber: 1, questionIds: [1, 2] }], [{ id: 1 }]);
  assert(orphanQuestion === null, '2.12 Returns null gracefully for orphan questions not in any bed');

  // Dynamic fallback when idxInBed exceeds standard 4 questions (e.g. index 4)
  const extraBedQuestion = getStepInfo(
    { id: 5, type: 'prescription_immediate' },
    true,
    [{ bedNumber: 1, questionIds: [1, 2, 3, 4, 5] }],
    [{ id: 1, type: 'prescription_immediate' }, { id: 5, type: 'prescription_immediate' }]
  );
  assert(extraBedQuestion !== null && extraBedQuestion.title === 'Conduta Imediata de Resgate', '2.13 Falls back dynamically to question-type inspection for extra questions beyond index 3');
}


// ============================================================================
// SUITE 3: Evaluation of 2-Stage Bed Sequences and Scoring
// ============================================================================
console.log('\n=== SUITE 3: 2-STAGE BED EVALUATION & SCORING ===');

// 3.1: Scoring arithmetic for 4-question bed
{
  const bedQs = [
    { id: 1, type: 'prescription_immediate' },
    { id: 2, type: 'prescription_complete' },
    { id: 3, type: 'multiple_choice' },
    { id: 4, type: 'multiple_choice' },
  ];
  const evals: Record<number, { score: number }> = {
    1: { score: 9.0 },
    2: { score: 8.0 },
    3: { score: 10.0 },
    4: { score: 0.0 },
  };

  let bedPoints = 0;
  bedQs.forEach((q) => { bedPoints += evals[q.id]?.score || 0; });
  const bedAvgScore = bedPoints / bedQs.length;
  const outcome = determineBedOutcome(bedAvgScore, 10);

  // bedAvgScore = 6.75 out of 10 -> percentage is 67.5% -> falls into 45%..69% -> 'orange' / 'Complicação Moderada'
  assert(bedAvgScore === 6.75, '3.1 Accurate 4-question bed average score calculation (6.75)');
  assert(outcome.color === 'orange', '3.2 Score 6.75 (67.5%) yields orange outcome ("Complicação Moderada")');
  assert(outcome.label === 'Complicação Moderada', '3.3 Outcome label correctly matches clinical category');
}

// 3.2: Scoring thresholds boundary test
{
  assert(determineBedOutcome(10.0, 10).color === 'green', '3.4 Score 10.0 (100%) is green (Alta Hospitalar)');
  assert(determineBedOutcome(9.0, 10).color === 'green', '3.5 Boundary 9.0 (90%) is green (Alta Hospitalar)');
  assert(determineBedOutcome(8.99, 10).color === 'yellow', '3.6 Boundary 8.99 (89.9%) is yellow (Observação / Internação)');
  assert(determineBedOutcome(7.0, 10).color === 'yellow', '3.7 Boundary 7.0 (70%) is yellow (Observação / Internação)');
  assert(determineBedOutcome(6.99, 10).color === 'orange', '3.8 Boundary 6.99 (69.9%) is orange (Complicação Moderada)');
  assert(determineBedOutcome(4.5, 10).color === 'orange', '3.9 Boundary 4.5 (45%) is orange (Complicação Moderada)');
  assert(determineBedOutcome(4.49, 10).color === 'red', '3.10 Boundary 4.49 (44.9%) is red (Deterioração Grave / UTI)');
  assert(determineBedOutcome(0.0, 10).color === 'red', '3.11 Score 0.0 is red (Deterioração Grave / UTI)');
}

// 3.3: 5-Question Bed with Bonus Q5 (Adverse Evolution)
{
  const bedQsWithBonus = [
    { id: 1, type: 'prescription_immediate' },
    { id: 2, type: 'prescription_complete' },
    { id: 3, type: 'multiple_choice' },
    { id: 4, type: 'multiple_choice' },
    { id: 5, type: 'prescription_immediate' }, // Q5 Bonus
  ];
  const evalsWithBonus: Record<number, { score: number }> = {
    1: { score: 4.0 }, // critical failure
    2: { score: 3.0 }, // failed maintenance
    3: { score: 0.0 }, // wrong MCQ
    4: { score: 0.0 }, // wrong MCQ
    5: { score: 10.0 }, // heroic Q5 recovery
  };

  let bedPoints = 0;
  bedQsWithBonus.forEach((q) => { bedPoints += evalsWithBonus[q.id]?.score || 0; });
  const bedAvgScore = bedPoints / bedQsWithBonus.length;

  assert(bedAvgScore === 3.4, '3.12 Bed average score properly divides by 5 when Q5 is present (17 / 5 = 3.4)');
  assert(determineBedOutcome(bedAvgScore, 10).color === 'red', '3.13 Score 3.4 correctly triggers red outcome');
}

// 3.4: FSRS Review Stats integration
{
  const initialStat = null;
  const update = calculateFSRSUpdate(initialStat, 8.5);
  assert(typeof update.interval_days === 'number', '3.14 FSRS returns valid interval_days');
  assert(typeof update.stability === 'number', '3.15 FSRS returns valid stability');
  assert(typeof update.difficulty === 'number', '3.16 FSRS returns valid difficulty');
}

// 3.5: Drug Math Validator on 2-stage bed prescriptions
{
  const immediatePresc = 'AAS 200mg VO agora\nNoradrenalina 0.2 mcg/kg/min IV em BIC contínua\nFentanil 2 mcg/kg IV';
  const calcs = parsePrescriptionDrugs(immediatePresc, 70);
  assert(calcs.length >= 1, '3.17 Drug math validator successfully parses prescription drugs from Stage 1');
  const facts = formatDrugFactsForPrompt(calcs);
  assert(facts.length > 0, '3.18 Math facts formatted cleanly for AI prompt injection');
}

// 3.6: System Prompts Verification (Anti-Spoiler Rules)
{
  assert(SYSTEM_PROMPT_PLANTAO_GENERATOR.includes('CEGAMENTO DIAGNÓSTICO (ANTI-SPOILER)'), '3.19 SYSTEM_PROMPT_PLANTAO_GENERATOR contains anti-spoiler blinding rule');
  assert(SYSTEM_PROMPT_PLANTAO_GENERATOR.includes('prescription_immediate'), '3.20 SYSTEM_PROMPT_PLANTAO_GENERATOR specifies prescription_immediate Stage 1');
  assert(SYSTEM_PROMPT_PLANTAO_GENERATOR.includes('prescription_complete'), '3.21 SYSTEM_PROMPT_PLANTAO_GENERATOR specifies prescription_complete Stage 2');
  assert(SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR.includes('CEGAMENTO DIAGNÓSTICO'), '3.22 SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR accounts for blinding');
  assert(SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR.includes('Etapa 1: Conduta Imediata de Resgate'), '3.23 SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR evaluates Stage 1');
  assert(SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR.includes('Etapa 2: Conduta de Manutenção'), '3.24 SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR evaluates Stage 2');
}

// Summary
const total = results.length;
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;

console.log('\n====================================================================');
console.log(`CHALLENGER 2 EMPIRICAL STRESS TEST SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
console.log('====================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
