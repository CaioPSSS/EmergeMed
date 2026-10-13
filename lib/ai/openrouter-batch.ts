/**
 * OpenRouter Batch API Client & Budget Ledger Service
 * Supports model openai/gpt-6-luna:batch ($0.05/1M prompt, $0.25/1M completion)
 * Enforces Hard Budget Caps ($0.15/day, $0.90/month)
 * Requirements R4 and R5
 */

import { SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ============================================================================
// 1. CONSTANTS & SPECIFICATIONS
// ============================================================================

export const BATCH_MODEL = 'openai/gpt-6-luna:batch';
export const PROMPT_TOKEN_PRICE_PER_M = 0.05;
export const COMPLETION_TOKEN_PRICE_PER_M = 0.25;

export const DAILY_HARD_CAP_USD = 0.15;
export const MONTHLY_HARD_CAP_USD = 0.90;

export const MAX_BEDS_PER_CHAPTER = 6;
export const MAX_MCQS_PER_CHAPTER = 20;
export const PENDING_RESERVATION_PROMPT_TOKENS_PER_ITEM = 1200;
export const PENDING_RESERVATION_COMPLETION_TOKENS_PER_ITEM = 1500;
export const PENDING_RESERVATION_USD_PER_ITEM = Number(
  calculateBatchCost(
    PENDING_RESERVATION_PROMPT_TOKENS_PER_ITEM,
    PENDING_RESERVATION_COMPLETION_TOKENS_PER_ITEM
  ).toFixed(6)
);

export const OPENROUTER_BATCH_ENDPOINT = 'https://openrouter.ai/api/v1/batches';

// ============================================================================
// 2. DOMAIN TYPES
// ============================================================================

export type BatchStatus = 'submitted' | 'completed' | 'failed' | 'capped' | 'interrupted';

export interface BatchLedgerRow {
  id?: string;
  batch_id: string;
  submission_timestamp: string;
  completion_timestamp?: string | null;
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
  status: BatchStatus;
}

export interface AccumulatedBudgetSnapshot {
  dailyAccumulated: number;
  monthlyAccumulated: number;
  dailyPendingReserved: number;
  monthlyPendingReserved: number;
  dailyTotalWithPendingReserved: number;
  monthlyTotalWithPendingReserved: number;
  pendingSubmittedCount: number;
}

export interface BatchRequestItem {
  custom_id: string;
  method: 'POST';
  url: string; // '/v1/chat/completions'
  body: {
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    temperature?: number;
    response_format?: { type: 'json_object' };
  };
}

export interface BatchSubmissionResponse {
  id: string;
  status: string;
  created_at?: string;
  model?: string;
  total_requests?: number;
}

export interface BatchItemResult {
  custom_id: string;
  response?: {
    status_code: number;
    body: {
      choices: Array<{
        message: {
          content: string;
        };
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };
  };
  error?: any;
}

export interface BatchStatusResponse {
  id: string;
  status: string;
  request_counts?: {
    total: number;
    completed: number;
    failed: number;
  };
  results?: BatchItemResult[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  created_at?: string;
  completed_at?: string;
}

// ============================================================================
// 3. MATHEMATICAL COST & BUDGET FORMULAS
// ============================================================================

/**
 * Calculates batch cost strictly based on prompt and completion token counts:
 * cost_usd = (prompt_tokens / 1e6) * 0.05 + (completion_tokens / 1e6) * 0.25
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
 * Evaluates whether candidate cost would breach daily ($0.15) or monthly ($0.90) hard cap.
 */
export function evaluateBudgetCapBreach(
  currentDaily: number,
  currentMonthly: number,
  candidateCost: number
): { canProceed: boolean; reason?: 'daily_cap' | 'monthly_cap' } {
  const projectedDaily = Number((currentDaily + candidateCost).toFixed(6));
  const projectedMonthly = Number((currentMonthly + candidateCost).toFixed(6));

  if (projectedDaily > DAILY_HARD_CAP_USD) {
    return { canProceed: false, reason: 'daily_cap' };
  }
  if (projectedMonthly > MONTHLY_HARD_CAP_USD) {
    return { canProceed: false, reason: 'monthly_cap' };
  }
  return { canProceed: true };
}

export function estimatePendingBatchReservationUsd(itemsRequested: number): number {
  if (!Number.isFinite(itemsRequested) || itemsRequested <= 0) return 0;
  return Number((itemsRequested * PENDING_RESERVATION_USD_PER_ITEM).toFixed(6));
}

// ============================================================================
// 4. OPENROUTER BATCH API CLIENT
// ============================================================================

/**
 * Validates and sanitizes API key.
 */
export function sanitizeApiKey(apiKey?: string, isMock: boolean = false): string {
  if (isMock) {
    return 'mock-openrouter-key';
  }
  const key = apiKey || process.env.OPENROUTER_API_KEY;
  if (!key || !key.trim()) {
    throw new Error('OPENROUTER_API_KEY is required in live mode');
  }
  return key.trim();
}

/**
 * Submits an array of requests to OpenRouter Batch API endpoint.
 * POST https://openrouter.ai/api/v1/batches
 */
export async function submitOpenRouterBatch(
  requests: BatchRequestItem[],
  apiKey?: string,
  isMock: boolean = false
): Promise<BatchSubmissionResponse> {
  if (!requests || requests.length === 0) {
    throw new Error('Batch requests payload cannot be empty');
  }

  if (isMock) {
    const mockBatchId = `batch_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return {
      id: mockBatchId,
      status: 'submitted',
      created_at: new Date().toISOString(),
      model: BATCH_MODEL,
      total_requests: requests.length,
    };
  }

  const cleanKey = sanitizeApiKey(apiKey, isMock);

  const response = await fetch(OPENROUTER_BATCH_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://emergemed.upa',
      'X-Title': 'EmergeMed Batch Pipeline',
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter Batch API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data || !data.id) {
    throw new Error('Invalid batch submission response: missing batch ID');
  }

  return {
    id: data.id,
    status: data.status || 'submitted',
    created_at: data.created_at || new Date().toISOString(),
    model: BATCH_MODEL,
    total_requests: requests.length,
  };
}

/**
 * Polls status and results of a submitted batch from OpenRouter.
 * GET https://openrouter.ai/api/v1/batches/{id}
 */
export async function getOpenRouterBatchStatus(
  batchId: string,
  apiKey?: string,
  isMock: boolean = false,
  mockRequests?: BatchRequestItem[]
): Promise<BatchStatusResponse> {
  if (!batchId || !batchId.trim()) {
    throw new Error('Batch ID is required');
  }

  if (isMock) {
    // Generate simulated batch completion results
    const results: BatchItemResult[] = (mockRequests || []).map((req) => {
      let mockContent = '{}';
      try {
        const customData = JSON.parse(req.custom_id);
        if (customData.type === 'bed_case') {
          mockContent = JSON.stringify({
            stage1: {
              type: 'prescription_immediate',
              vignette: `Paciente de 64 anos, admitido na sala vermelha da UPA com rebaixamento e hipotensão. PA 80/50 mmHg, FC 116 bpm, FR 24 irpm, SpO2 92%, HGT 180 mg/dL.`,
              patient_weight: 70,
              vital_signs: { pa: '80/50', fc: 116, fr: 24, spo2: 92 },
              conduct_prompt: 'Prescreva a conduta imediata para estabilização hemodinâmica.',
            },
            stage2: {
              type: 'prescription_complete',
              evolution: 'Após expansão com cristaloide e início de DVA, PAM atinge 68 mmHg. Gasometria com acidose metabólica.',
              lab_results: { lactato: 3.4, creatinina: 1.4 },
              conduct_prompt: 'Prescreva a manutenção e plano de internação na sala vermelha.',
            },
          });
        } else {
          mockContent = JSON.stringify({
            questions: [
              {
                vignette: 'Paciente com queixa aguda de emergência necessitando de conduta imediata.',
                options: [
                  'Conduta prioritária de primeira linha',
                  'Conduta secundária diferida',
                  'Medida contraindicada no choque',
                  'Exame de alta complexidade indisponível na UPA',
                  'Aguardar evolução clínica espontânea',
                ],
                correct_option: 0,
                explanation: 'A conduta imediata de estabilização é a intervenção prioritária.',
                difficulty_tier: 'standard',
                question_subformat: 'case_conduct',
              },
            ],
          });
        }
      } catch {
        mockContent = '{}';
      }

      return {
        custom_id: req.custom_id,
        response: {
          status_code: 200,
          body: {
            choices: [{ message: { content: mockContent } }],
            usage: {
              prompt_tokens: 1200,
              completion_tokens: 600,
              total_tokens: 1800,
            },
          },
        },
      };
    });

    const promptTokens = results.length * 1200;
    const completionTokens = results.length * 600;

    return {
      id: batchId,
      status: 'completed',
      request_counts: {
        total: results.length,
        completed: results.length,
        failed: 0,
      },
      results,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      created_at: new Date(Date.now() - 3600000).toISOString(),
      completed_at: new Date().toISOString(),
    };
  }

  const cleanKey = sanitizeApiKey(apiKey, isMock);

  const response = await fetch(`${OPENROUTER_BATCH_ENDPOINT}/${encodeURIComponent(batchId.trim())}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${cleanKey}`,
      'HTTP-Referer': 'https://emergemed.upa',
      'X-Title': 'EmergeMed Batch Pipeline',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter Batch Status API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data || !data.id) {
    throw new Error('Invalid batch status response payload');
  }

  return data as BatchStatusResponse;
}

// ============================================================================
// 5. LEDGER PERSISTENCE & BUDGET RECONCILIATION
// ============================================================================

const LOCAL_LEDGER_FILE = path.join(process.cwd(), '.agents', 'batch-generation-ledger-local.json');

function ensureLocalLedgerDir(): void {
  const dir = path.dirname(LOCAL_LEDGER_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readLocalLedger(): BatchLedgerRow[] {
  try {
    if (fs.existsSync(LOCAL_LEDGER_FILE)) {
      const raw = fs.readFileSync(LOCAL_LEDGER_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[Ledger] Failed to read local ledger file:', err);
  }
  return [];
}

export function writeLocalLedger(rows: BatchLedgerRow[]): void {
  try {
    ensureLocalLedgerDir();
    fs.writeFileSync(LOCAL_LEDGER_FILE, JSON.stringify(rows, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Ledger] Failed to write local ledger file:', err);
  }
}

/**
 * Computes daily and monthly accumulated costs from batch_generation_ledger:
 * Daily: current calendar day (from 00:00:00 UTC/Local)
 * Monthly: current calendar month (from 1st of month 00:00:00 UTC/Local)
 */
export async function fetchAccumulatedBudget(
  supabase?: SupabaseClient | null
): Promise<AccumulatedBudgetSnapshot> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  let dailyAccumulated = 0;
  let monthlyAccumulated = 0;
  let dailyPendingReserved = 0;
  let monthlyPendingReserved = 0;
  let pendingSubmittedCount = 0;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('batch_generation_ledger')
        .select('cost_usd, submission_timestamp, status, items_requested')
        .gte('submission_timestamp', startOfMonth);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const cost = Number(row.cost_usd) || 0;
          const status = String(row.status || '');
          const pendingReservation = status === 'submitted'
            ? estimatePendingBatchReservationUsd(Number(row.items_requested) || 0)
            : 0;

          monthlyAccumulated += cost;
          monthlyPendingReserved += pendingReservation;

          if (row.submission_timestamp >= startOfDay) {
            dailyAccumulated += cost;
            dailyPendingReserved += pendingReservation;
          }

          if (status === 'submitted') {
            pendingSubmittedCount += 1;
          }
        }

        const normalizedDaily = Number(dailyAccumulated.toFixed(6));
        const normalizedMonthly = Number(monthlyAccumulated.toFixed(6));
        const normalizedDailyReserved = Number(dailyPendingReserved.toFixed(6));
        const normalizedMonthlyReserved = Number(monthlyPendingReserved.toFixed(6));

        return {
          dailyAccumulated: normalizedDaily,
          monthlyAccumulated: normalizedMonthly,
          dailyPendingReserved: normalizedDailyReserved,
          monthlyPendingReserved: normalizedMonthlyReserved,
          dailyTotalWithPendingReserved: Number((normalizedDaily + normalizedDailyReserved).toFixed(6)),
          monthlyTotalWithPendingReserved: Number((normalizedMonthly + normalizedMonthlyReserved).toFixed(6)),
          pendingSubmittedCount,
        };
      }
    } catch (err) {
      console.warn('[Ledger] Supabase ledger query failed, falling back to local file:', err);
    }
  }

  // Fallback to local ledger storage
  const localRows = readLocalLedger();
  for (const row of localRows) {
    const cost = Number(row.cost_usd) || 0;
    const pendingReservation = row.status === 'submitted'
      ? estimatePendingBatchReservationUsd(Number(row.items_requested) || 0)
      : 0;

    if (row.submission_timestamp >= startOfMonth) {
      monthlyAccumulated += cost;
      monthlyPendingReserved += pendingReservation;
    }
    if (row.submission_timestamp >= startOfDay) {
      dailyAccumulated += cost;
      dailyPendingReserved += pendingReservation;
    }
    if (row.status === 'submitted') {
      pendingSubmittedCount += 1;
    }
  }

  const normalizedDaily = Number(dailyAccumulated.toFixed(6));
  const normalizedMonthly = Number(monthlyAccumulated.toFixed(6));
  const normalizedDailyReserved = Number(dailyPendingReserved.toFixed(6));
  const normalizedMonthlyReserved = Number(monthlyPendingReserved.toFixed(6));

  return {
    dailyAccumulated: normalizedDaily,
    monthlyAccumulated: normalizedMonthly,
    dailyPendingReserved: normalizedDailyReserved,
    monthlyPendingReserved: normalizedMonthlyReserved,
    dailyTotalWithPendingReserved: Number((normalizedDaily + normalizedDailyReserved).toFixed(6)),
    monthlyTotalWithPendingReserved: Number((normalizedMonthly + normalizedMonthlyReserved).toFixed(6)),
    pendingSubmittedCount,
  };
}

/**
 * Inserts a new record into batch_generation_ledger.
 */
export async function insertBatchLedgerRecord(
  record: Omit<BatchLedgerRow, 'id'>,
  supabase?: SupabaseClient | null
): Promise<BatchLedgerRow> {
  const row: BatchLedgerRow = {
    ...record,
    id: `ledg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };

  // Sync to local file
  const localRows = readLocalLedger();
  const existingIdx = localRows.findIndex((r) => r.batch_id === row.batch_id);
  if (existingIdx >= 0) {
    localRows[existingIdx] = row;
  } else {
    localRows.push(row);
  }
  writeLocalLedger(localRows);

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('batch_generation_ledger')
        .insert([
          {
            batch_id: row.batch_id,
            submission_timestamp: row.submission_timestamp,
            completion_timestamp: row.completion_timestamp,
            model: row.model,
            prompt_tokens: row.prompt_tokens,
            completion_tokens: row.completion_tokens,
            cost_usd: row.cost_usd,
            daily_accumulated_usd: row.daily_accumulated_usd,
            monthly_accumulated_usd: row.monthly_accumulated_usd,
            hard_cap_interrupted: row.hard_cap_interrupted,
            items_requested: row.items_requested,
            items_ingested: row.items_ingested,
            items_failed: row.items_failed,
            status: row.status,
          },
        ])
        .select()
        .single();

      if (!error && data) {
        return data as BatchLedgerRow;
      }
    } catch (err) {
      console.warn('[Ledger] Failed to insert to Supabase batch_generation_ledger:', err);
    }
  }

  return row;
}

/**
 * Updates an existing record in batch_generation_ledger.
 */
export async function updateBatchLedgerRecord(
  batchId: string,
  updates: Partial<BatchLedgerRow>,
  supabase?: SupabaseClient | null
): Promise<void> {
  // Update local file
  const localRows = readLocalLedger();
  const idx = localRows.findIndex((r) => r.batch_id === batchId);
  if (idx >= 0) {
    localRows[idx] = { ...localRows[idx], ...updates };
    writeLocalLedger(localRows);
  }

  if (supabase) {
    try {
      await supabase
        .from('batch_generation_ledger')
        .update(updates)
        .eq('batch_id', batchId);
    } catch (err) {
      console.warn('[Ledger] Failed to update Supabase batch_generation_ledger:', err);
    }
  }
}

/**
 * Retrieves the most recent batch ledger entry.
 */
export async function getLatestBatchLedger(
  supabase?: SupabaseClient | null
): Promise<BatchLedgerRow | null> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('batch_generation_ledger')
        .select('*')
        .order('submission_timestamp', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        return data as BatchLedgerRow;
      }
    } catch {}
  }

  const localRows = readLocalLedger();
  if (localRows.length > 0) {
    return localRows[localRows.length - 1];
  }

  return null;
}

/**
 * Lists all pending batch ledger entries awaiting completion.
 */
export async function listPendingBatchLedgers(
  supabase?: SupabaseClient | null
): Promise<BatchLedgerRow[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('batch_generation_ledger')
        .select('*')
        .eq('status', 'submitted')
        .order('submission_timestamp', { ascending: true });

      if (!error && Array.isArray(data)) {
        return data as BatchLedgerRow[];
      }
    } catch {}
  }

  const localRows = readLocalLedger();
  return localRows.filter((r) => r.status === 'submitted');
}
