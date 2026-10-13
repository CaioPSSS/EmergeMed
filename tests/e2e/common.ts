/**
 * E2E Test Suite Common Infrastructure & Domain Oracles
 * Strictly derived from ORIGINAL_REQUEST.md, PROJECT.md, and TEST_INFRA.md
 */

// ============================================================================
// 1. CONSTANTS & HARD SPECIFICATIONS
// ============================================================================

export const DAILY_HARD_CAP_USD = 0.15;
export const MONTHLY_HARD_CAP_USD = 0.90;

export const BATCH_MODEL = 'openai/gpt-6-luna:batch';
export const PROMPT_TOKEN_PRICE_PER_M = 0.05;
export const COMPLETION_TOKEN_PRICE_PER_M = 0.25;

export const MAX_BEDS_PER_CHAPTER = 6;
export const MAX_MCQS_PER_CHAPTER = 20;

export const BED_REUSE_SCALE: Record<number, number> = {
  1: 0.35,
  2: 0.50,
  3: 0.65,
  4: 0.75,
  5: 0.85,
  6: 0.90,
};

export const POST_CHAPTER_QUIZ_TOTAL = 10;
export const STANDARD_DIFFICULTY_PERCENT = 0.60; // 6 questions
export const ADVANCED_DIFFICULTY_PERCENT = 0.40; // 4 questions

// ============================================================================
// 2. DOMAIN TYPES
// ============================================================================

export type DifficultyTier = 'standard' | 'advanced';
export type QuestionSubformat = 'case_conduct' | 'direct_content' | 'diagnostic_criteria';
export type BedComplexity = 'classic' | 'complex' | 'atypical';
export type BedStageType = 'prescription_immediate' | 'prescription_complete' | 'ventilator';

export interface MCQQuestion {
  id: string;
  chapter_id: string | number;
  question_type: 'multiple_choice';
  difficulty_tier: DifficultyTier;
  question_subformat: QuestionSubformat;
  vignette: string;
  options: string[];
  correct_option: number; // 0 to 4
  explanation: string;
  bank_question_id?: string;
  is_from_bank?: boolean;
}

export interface BedStage1Immediate {
  type: 'prescription_immediate';
  vignette: string;
  patient_weight: number;
  vital_signs: {
    pa: string;
    fc: number;
    fr: number;
    spo2: number;
    temp?: number;
    hgt?: number;
  };
  conduct_prompt: string;
}

export interface BedStage2Maintenance {
  type: 'prescription_complete' | 'ventilator';
  evolution: string;
  lab_results?: Record<string, string | number>;
  conduct_prompt: string;
}

export interface ContinuousBedCase {
  bed_number: number;
  chapter_id: string | number;
  chapter_title: string;
  stage1: BedStage1Immediate;
  stage2: BedStage2Maintenance;
  mcqs: [MCQQuestion, MCQQuestion];
  complexity: BedComplexity;
}

export interface UserQuestionHistoryItem {
  id: string;
  user_id: string;
  question_id: string;
  chapter_id: string | number;
  last_is_correct: boolean;
  times_answered: number;
  times_correct: number;
  last_answered_at: string;
}

export interface BatchLedgerRow {
  id: string;
  batch_id: string;
  submission_timestamp: string;
  completion_timestamp?: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  daily_accumulated_usd: number;
  monthly_accumulated_usd: number;
  hard_cap_interrupted: boolean;
  items_requested: number;
  items_ingested: number;
  items_failed: number;
  status: 'submitted' | 'completed' | 'failed' | 'capped';
}

// ============================================================================
// 3. ASSERTION ENGINE & TEST HELPERS
// ============================================================================

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new AssertionError(`Assertion failed: ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new AssertionError(`${message} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDeepEqual<T>(actual: T, expected: T, message: string): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new AssertionError(`${message} -> Expected ${expectedStr}, got ${actualStr}`);
  }
}

export function assertCloseTo(actual: number, expected: number, delta: number = 0.0001, message: string): void {
  if (Math.abs(actual - expected) > delta) {
    throw new AssertionError(`${message} -> Expected ${expected} (±${delta}), got ${actual}`);
  }
}

export function assertMatches(text: string, regex: RegExp, message: string): void {
  if (!regex.test(text)) {
    throw new AssertionError(`${message} -> Text "${text.slice(0, 100)}" does not match pattern ${regex}`);
  }
}

export function assertThrows(fn: () => void, message: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new AssertionError(`Expected function to throw: ${message}`);
  }
}

// ============================================================================
// 4. TEST CASE EXECUTION WRAPPER
// ============================================================================

export interface TestResult {
  id: string;
  name: string;
  feature: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export async function runTest(
  id: string,
  feature: string,
  name: string,
  fn: () => void | Promise<void>
): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return {
      id,
      feature,
      name,
      passed: true,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      id,
      feature,
      name,
      passed: false,
      durationMs: Date.now() - start,
      error: err?.message || String(err),
    };
  }
}

// ============================================================================
// 5. DOMAIN ORACLES & MATHEMATICAL SPECIFICATIONS
// ============================================================================

/**
 * OpenRouter Batch Cost calculation formula
 * prompt: $0.05 / 1,000,000 tokens
 * completion: $0.25 / 1,000,000 tokens
 */
export function calculateBatchCost(promptTokens: number, completionTokens: number): number {
  if (promptTokens < 0 || completionTokens < 0) {
    throw new Error('Token counts cannot be negative');
  }
  const promptCost = (promptTokens / 1_000_000) * PROMPT_TOKEN_PRICE_PER_M;
  const completionCost = (completionTokens / 1_000_000) * COMPLETION_TOKEN_PRICE_PER_M;
  return Number((promptCost + completionCost).toFixed(6));
}

/**
 * Checks if candidate cost would breach daily or monthly cap
 */
export function evaluateBudgetCapBreach(
  currentDaily: number,
  currentMonthly: number,
  candidateCost: number
): { canProceed: boolean; reason?: 'daily_cap' | 'monthly_cap' } {
  if (currentDaily + candidateCost > DAILY_HARD_CAP_USD) {
    return { canProceed: false, reason: 'daily_cap' };
  }
  if (currentMonthly + candidateCost > MONTHLY_HARD_CAP_USD) {
    return { canProceed: false, reason: 'monthly_cap' };
  }
  return { canProceed: true };
}

/**
 * Anti-spoiler blinding check:
 * Clinical vignette must NEVER state the explicit diagnosis
 */
export const FORBIDDEN_DIAGNOSTIC_TERMS = [
  'diagnóstico de',
  'diagnóstico firmado',
  'diagnóstico definitivo',
  'trata-se de infarto agudo',
  'trata-se de iam',
  'trata-se de avc',
  'trata-se de cetoacidose',
  'quadro de cetoacidose diabética',
  'quadro confirmado de sepse',
  'choque séptico confirmado',
  'paciente com diagnósticos de',
  'hipótese confirmada de',
  'conclusão diagnóstica:',
  'caso de anafilaxia confirmada',
  'paciente portador de pneumonia adquirida na comunidade',
];

export function verifyAntiSpoiler(vignette: string, chapterTitle?: string): { isClean: boolean; matched: string[] } {
  const lower = vignette.toLowerCase();
  const matched: string[] = [];

  for (const term of FORBIDDEN_DIAGNOSTIC_TERMS) {
    if (lower.includes(term.toLowerCase())) {
      matched.push(term);
    }
  }

  // Also verify that the chapter title is not stated as an explicit diagnosis in the vignette
  if (chapterTitle && chapterTitle.trim().length > 3) {
    const explicitPatterns = [
      `diagnóstico de ${chapterTitle.toLowerCase()}`,
      `trata-se de ${chapterTitle.toLowerCase()}`,
      `quadro de ${chapterTitle.toLowerCase()}`,
    ];
    for (const pat of explicitPatterns) {
      if (lower.includes(pat)) {
        matched.push(pat);
      }
    }
  }

  return {
    isClean: matched.length === 0,
    matched,
  };
}

/**
 * Sanitizes mojibake and UTF-8 encoding corruption
 */
export function sanitizeMojibake(text: string): string {
  if (!text) return '';
  return text
    .replace(/Ã§/g, 'ç')
    .replace(/Ã£/g, 'ã')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã¢/g, 'â')
    .replace(/Ãª/g, 'ê')
    .replace(/Ã´/g, 'ô')
    .replace(/Ãµ/g, 'õ')
    .replace(/Ã€/g, 'À')
    .replace(/Ã‰/g, 'É')
    .replace(/Ã\s/g, 'à')
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€“/g, '–')
    .replace(/â€”/g, '—')
    .replace(/Âº/g, 'º')
    .replace(/Âª/g, 'ª')
    .replace(/\uFFFD/g, '');
}

/**
 * Simulates the Anti-Repetition SRS queue selection algorithm
 * Unseen (P1) > Wrong (P2) > Correct (P3 end of queue)
 */
export function selectWithAntiRepetition(
  allQuestions: MCQQuestion[],
  userHistory: UserQuestionHistoryItem[],
  count: number = 10
): { selected: MCQQuestion[]; recycled: boolean; deficit: number } {
  const historyMap = new Map<string, UserQuestionHistoryItem>();
  for (const h of userHistory) {
    historyMap.set(h.question_id, h);
  }

  const unseen: MCQQuestion[] = [];
  const wrong: MCQQuestion[] = [];
  const correct: MCQQuestion[] = [];

  for (const q of allQuestions) {
    const hist = historyMap.get(q.id);
    if (!hist || hist.times_answered === 0) {
      unseen.push(q);
    } else if (!hist.last_is_correct) {
      wrong.push(q);
    } else {
      correct.push(q);
    }
  }

  // Sort wrong questions: least recently answered first (or highest error count)
  wrong.sort((a, b) => {
    const ha = historyMap.get(a.id);
    const hb = historyMap.get(b.id);
    const timeA = ha?.last_answered_at ? new Date(ha.last_answered_at).getTime() : 0;
    const timeB = hb?.last_answered_at ? new Date(hb.last_answered_at).getTime() : 0;
    return timeA - timeB;
  });

  // Sort correct questions by last_answered_at ascending (oldest first, i.e. end of queue)
  correct.sort((a, b) => {
    const ha = historyMap.get(a.id);
    const hb = historyMap.get(b.id);
    const timeA = ha?.last_answered_at ? new Date(ha.last_answered_at).getTime() : 0;
    const timeB = hb?.last_answered_at ? new Date(hb.last_answered_at).getTime() : 0;
    return timeA - timeB;
  });

  const selected: MCQQuestion[] = [];

  // P1: Unseen
  for (const q of unseen) {
    if (selected.length < count) selected.push(q);
  }

  // P2: Wrong (Remediation)
  for (const q of wrong) {
    if (selected.length < count) selected.push(q);
  }

  // P3: Correct (Recycle from end of queue only if unseen & wrong exhausted)
  let recycled = false;
  if (selected.length < count && correct.length > 0) {
    recycled = true;
    for (const q of correct) {
      if (selected.length < count) selected.push(q);
    }
  }

  const deficit = Math.max(0, count - selected.length);
  return { selected, recycled, deficit };
}
