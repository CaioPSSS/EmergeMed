/**
 * OpenRouter Batch API Client & Budget Ledger Service
 * Supports model openai/gpt-6-luna:batch ($0.05/1M prompt, $0.25/1M completion)
 * Enforces Hard Budget Caps ($0.15/day, $0.90/month) ONLY on nightly asynchronous
 * clinical case / MCQ generation ('nightly_generation').
 * Plantão batch corrections ('plantao_correction') are exempt from budget caps.
 * Requirements R4 and R5
 */

import { SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ============================================================================
// 1. CONSTANTS & SPECIFICATIONS
// ============================================================================

export const BATCH_MODEL = 'openai/gpt-6-luna:batch';
export const BATCH_SUBMISSION_MODEL = 'openai/gpt-6-luna';
export const BATCH_DEFAULT_ENDPOINT = '/v1/chat/completions';
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
export type BatchKind = 'nightly_generation' | 'plantao_correction';

export interface BatchLedgerRow {
  id?: string;
  batch_id: string;
  batch_kind?: BatchKind;
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
  method?: 'POST';
  url?: string; // '/v1/chat/completions'
  body: {
    model?: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: 'json_object' };
  };
}

export interface OpenRouterBatchSubmitPayload {
  endpoint: string;
  model: string;
  requests: Array<{
    custom_id: string;
    body: {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      temperature?: number;
      max_tokens?: number;
      response_format?: { type: 'json_object' };
    };
  }>;
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
    cost?: number;
  };
  error?: {
    code?: number;
    message?: string;
    [key: string]: any;
  } | null;
  created_at?: string | number;
  completed_at?: string;
  finalized_at?: number | string | null;
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
 * NOTE: Applied ONLY to nightly asynchronous case/question generation ('nightly_generation').
 * Plantão batch corrections ('plantao_correction') are exempt from cost caps.
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
 * Normalizes a model identifier for OpenRouter's POST /api/v1/batches payload.
 * OpenRouter requires the base model slug (e.g. "openai/gpt-6-luna") without the ":batch" suffix.
 */
export function normalizeBatchModelSlug(model: string = BATCH_MODEL): string {
  const cleaned = String(model || BATCH_MODEL).trim().replace(/:batch$/i, '');
  return cleaned || BATCH_SUBMISSION_MODEL;
}

/**
 * Builds the exact payload required by OpenRouter's POST /api/v1/batches endpoint:
 * - `endpoint` and `model` (without `:batch`) serialized BEFORE `requests` (required by OpenRouter's stream parser).
 * - Each item in `requests` contains only `{ custom_id, body }`, omitting `body.model` so it inherits the batch-level model.
 */
export function buildBatchSubmitPayload(
  requests: BatchRequestItem[],
  model: string = BATCH_MODEL,
  endpoint: string = BATCH_DEFAULT_ENDPOINT
): OpenRouterBatchSubmitPayload {
  if (!requests || requests.length === 0) {
    throw new Error('Batch requests payload cannot be empty');
  }

  const normalizedModel = normalizeBatchModelSlug(model);
  const resolvedEndpoint = endpoint || requests[0]?.url || BATCH_DEFAULT_ENDPOINT;

  const formattedRequests = requests.map((req, idx) => {
    if (!req.custom_id || !String(req.custom_id).trim()) {
      throw new Error(`custom_id is required on requests[${idx}]`);
    }
    const { model: _ignoredItemModel, ...restBody } = req.body || ({} as any);
    return {
      custom_id: String(req.custom_id),
      body: restBody,
    };
  });

  // Key order is strictly: endpoint, model, requests
  return {
    endpoint: resolvedEndpoint,
    model: normalizedModel,
    requests: formattedRequests,
  };
}

// In-memory mock batch cache so mock submissions can be polled offline
const MOCK_BATCH_CACHE = new Map<string, BatchRequestItem[]>();

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
    MOCK_BATCH_CACHE.set(mockBatchId, requests);
    return {
      id: mockBatchId,
      status: 'submitted',
      created_at: new Date().toISOString(),
      model: BATCH_MODEL,
      total_requests: requests.length,
    };
  }

  const cleanKey = sanitizeApiKey(apiKey, isMock);
  const payload = buildBatchSubmitPayload(requests);

  const response = await fetch(OPENROUTER_BATCH_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://emergemed.upa',
      'X-Title': 'EmergeMed Batch Pipeline',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter Batch API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data || !data.id) {
    throw new Error('Invalid batch submission response: missing batch ID');
  }

  const createdAtIso =
    typeof data.created_at === 'number'
      ? new Date(data.created_at * 1000).toISOString()
      : data.created_at || new Date().toISOString();

  return {
    id: data.id,
    status: data.status || 'submitted',
    created_at: createdAtIso,
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
    const cachedRequests = MOCK_BATCH_CACHE.get(batchId);
    const targetRequests = mockRequests || cachedRequests || [];

    const results: BatchItemResult[] = targetRequests.map((req) => {
      let mockContent = '{}';
      try {
        const customData = JSON.parse(req.custom_id);
        if (customData.type === 'bed_case') {
          mockContent = JSON.stringify([
            {
              type: 'prescription_immediate',
              patientWeight: 70,
              vignette: `Paciente de 64 anos, 70 kg, admitido na sala vermelha da UPA com rebaixamento do nível de consciência e hipotensão aguda. PA 80/50 mmHg, FC 116 bpm, FR 24 irpm, SpO2 92% em ar ambiente, Tax 38.4°C, HGT 180 mg/dL.`,
              promptText: 'Interprete o quadro clínico agudo e prescreva a conduta imediata de resgate/estabilização para este paciente na Sala Vermelha:',
              idealPrescription: 'SF 0,9% 1000mL IV rápido em acesso calibroso\nNoradrenalina em BIC se PAM < 65 mmHg\nColeta de lactato, culturas e início precoce de antimicrobiano IV',
              evaluationCriteria: [
                'Ressuscitação volêmica inicial com cristaloide',
                'Suporte vasopressor precoce se hipotensão refratária',
                'Manejo etiológico imediato na primeira hora',
              ],
            },
            {
              type: 'prescription_complete',
              patientWeight: 70,
              vignette: 'Após expansão inicial com cristaloide e início de droga vasoativa em BIC, PAM atinge 68 mmHg, FC 98 bpm, SpO2 96% em cateter nasal de O2. Gasometria arterial mostra pH 7.29, HCO3 16 mEq/L, lactato 3.4 mmol/L, creatinina 1.4 mg/dL, K 4.3 mEq/L.',
              promptText: 'Escreva a prescrição médica COMPLETA de internação/observação para a manutenção deste paciente na Sala Vermelha:',
              idealPrescription: 'REPOUSO E CABECEIRA: Repouso absoluto no leito | Cabeceira elevada 30°\nDIETA: Dieta zero até estabilização hemodinâmica completa\nHIDRATAÇÃO E INFUSÕES: SF 0,9% de manutenção ajustado ao balanço hídrico\nMEDICAMENTOS FIXOS: Manter Noradrenalina em BIC titulada para PAM >= 65 mmHg + Antimicrobiano IV em dose plena\nSINTOMÁTICOS E PROTOCOLOS: Dipirona se dor/febre, Omeprazol 40mg IV 1x/dia, Enoxaparina 40mg SC 1x/dia, Insulina Regular SC conforme HGT',
              evaluationCriteria: [
                'Manutenção de droga vasoativa titulada para PAM >= 65 mmHg',
                'Monitorização contínua e controle de diurese horária',
                'Profilaxias de úlcera de estresse, TEV e controle glicêmico',
              ],
            },
          ]);
        } else if (customData.type === 'bed_evaluation') {
          const evals: Record<string, any> = {};
          const qIds = Array.isArray(customData.questionIds) && customData.questionIds.length > 0
            ? customData.questionIds
            : [1, 2];
          for (const qId of qIds) {
            evals[String(qId)] = {
              score: 8.5,
              verdict: 'Adequado',
              strengths: [
                'Boa escolha de cristaloides e indicação correta de vasopressor precoce.',
                'Dose de infusão compatível com a estabilização hemodinâmica guiada por metas da UPA.',
              ],
              improvements: [
                'Atentar para monitorização contínua de débito urinário e lactato de controle.',
              ],
              detailedFeedback: '🟢 DESFECHO: Paciente Estabilizado com Segurança\nConduta apropriada para o caso.',
              idealPrescription: 'Conduta padrão da Sala Vermelha da UPA.',
              errorTags: [],
            };
          }
          mockContent = JSON.stringify({ evaluations: evals });
        } else if (customData.type === 'plantao_feedback') {
          mockContent = `### Síntese do Plantão Noturno na Sala Vermelha da UPA

Plantão de alta complexidade clínica conduzido com rigor técnico e foco na estabilização hemodinâmica dos leitos críticos.

### Auditoria de Leitos & Desfechos Clínicos
- **Leitos Atendidos:** Boa resposta inicial com reconhecimento rápido dos sinais de gravidade.
- **Pontos Fortes:** Ajuste posológico seguro das drogas vasoativas e suporte ventilatório adequado.
- **Pontos de Atenção:** Manter checagem frequente de parâmetros gasométricos após medidas de ressuscitação.

### Plano de Ação para o Próximo Plantão
1. Revisar curvas de titulação de drogas vasoativas.
2. Manter checagem sistemática de eletrólitos e gasometria.
3. Priorizar reavaliação precoce após medidas de ressuscitação.`;
        } else {
          mockContent = JSON.stringify([
            {
              id: 1,
              type: 'multiple_choice',
              difficulty_tier: 'standard',
              question_subformat: 'case_conduct',
              vignette: 'Paciente de 62 anos, 72 kg, admitido na Sala Vermelha com queixa aguda de emergência necessitando de conduta imediata.',
              options: [
                'Conduta prioritária de primeira linha',
                'Conduta secundária diferida',
                'Medida contraindicada no choque',
                'Exame de alta complexidade indisponível na UPA',
                'Aguardar evolução clínica espontânea',
              ],
              correctOption: 0,
              explanation: 'A conduta imediata de estabilização é a intervenção prioritária.',
            },
          ]);
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

  if (!data.completed_at && typeof data.finalized_at === 'number') {
    data.completed_at = new Date(data.finalized_at * 1000).toISOString();
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
 * Computes daily and monthly accumulated costs from batch_generation_ledger for the specified
 * batchKind (defaults to 'nightly_generation' so Plantão corrections never count toward or
 * get blocked by the nightly generation hard caps).
 * Daily: current calendar day (from 00:00:00 UTC/Local)
 * Monthly: current calendar month (from 1st of month 00:00:00 UTC/Local)
 */
export async function fetchAccumulatedBudget(
  supabase?: SupabaseClient | null,
  batchKind: BatchKind = 'nightly_generation'
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
      let { data, error } = await supabase
        .from('batch_generation_ledger')
        .select('batch_id, cost_usd, submission_timestamp, completion_timestamp, status, items_requested, batch_kind')
        .gte('submission_timestamp', startOfMonth);

      if (error) {
        // Fallback if batch_kind column is not yet present in DB
        const fallback = await supabase
          .from('batch_generation_ledger')
          .select('batch_id, cost_usd, submission_timestamp, completion_timestamp, status, items_requested')
          .gte('submission_timestamp', startOfMonth);
        data = fallback.data as any;
        error = fallback.error;
      }

      if (!error && Array.isArray(data)) {
        for (const row of data as any[]) {
          const rowKind: BatchKind =
            row.batch_kind === 'plantao_correction' ? 'plantao_correction' : 'nightly_generation';
          if (rowKind !== batchKind) continue;

          // Ignore synthetic mock records if they were ever persisted to Supabase
          if (row.batch_id && String(row.batch_id).startsWith('batch_mock_')) continue;

          const cost = Number(row.cost_usd) || 0;
          const status = String(row.status || '');
          const pendingReservation = status === 'submitted'
            ? estimatePendingBatchReservationUsd(Number(row.items_requested) || 0)
            : 0;

          monthlyAccumulated += cost;
          monthlyPendingReserved += pendingReservation;

          const completedToday = Boolean(row.completion_timestamp && row.completion_timestamp >= startOfDay);
          if (row.submission_timestamp >= startOfDay || completedToday) {
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
    const rowKind: BatchKind =
      row.batch_kind === 'plantao_correction' ? 'plantao_correction' : 'nightly_generation';
    if (rowKind !== batchKind) continue;

    const cost = Number(row.cost_usd) || 0;
    const pendingReservation = row.status === 'submitted'
      ? estimatePendingBatchReservationUsd(Number(row.items_requested) || 0)
      : 0;

    if (row.submission_timestamp >= startOfMonth) {
      monthlyAccumulated += cost;
      monthlyPendingReserved += pendingReservation;
    }
    const completedToday = Boolean(row.completion_timestamp && row.completion_timestamp >= startOfDay);
    if (row.submission_timestamp >= startOfDay || completedToday) {
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
  const effectiveKind: BatchKind = record.batch_kind || 'nightly_generation';
  const row: BatchLedgerRow = {
    ...record,
    batch_kind: effectiveKind,
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
    const baseDbPayload = {
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
    };

    try {
      let { data, error } = await supabase
        .from('batch_generation_ledger')
        .insert([{ ...baseDbPayload, batch_kind: effectiveKind }])
        .select()
        .single();

      if (error) {
        // Fallback if batch_kind column is not migrated yet
        const retry = await supabase
          .from('batch_generation_ledger')
          .insert([baseDbPayload])
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (!error && data) {
        return { ...(data as BatchLedgerRow), batch_kind: (data as any).batch_kind || effectiveKind };
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
      const { error } = await supabase
        .from('batch_generation_ledger')
        .update(updates)
        .eq('batch_id', batchId);

      if (error && 'batch_kind' in updates) {
        const { batch_kind: _ignoredKind, ...fallbackUpdates } = updates;
        await supabase
          .from('batch_generation_ledger')
          .update(fallbackUpdates)
          .eq('batch_id', batchId);
      }
    } catch (err) {
      console.warn('[Ledger] Failed to update Supabase batch_generation_ledger:', err);
    }
  }
}

/**
 * Retrieves the most recent batch ledger entry for the given batchKind (defaults to 'nightly_generation').
 */
export async function getLatestBatchLedger(
  supabase?: SupabaseClient | null,
  batchKind: BatchKind = 'nightly_generation'
): Promise<BatchLedgerRow | null> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('batch_generation_ledger')
        .select('*')
        .order('submission_timestamp', { ascending: false })
        .limit(20);

      if (!error && Array.isArray(data)) {
        const matched = data.find((r: any) => {
          const k: BatchKind = r.batch_kind === 'plantao_correction' ? 'plantao_correction' : 'nightly_generation';
          return k === batchKind;
        });
        if (matched) {
          return matched as BatchLedgerRow;
        }
      }
    } catch {}
  }

  const localRows = readLocalLedger().filter((r) => {
    const k: BatchKind = r.batch_kind === 'plantao_correction' ? 'plantao_correction' : 'nightly_generation';
    return k === batchKind;
  });
  if (localRows.length > 0) {
    return localRows[localRows.length - 1];
  }

  return null;
}

/**
 * Lists all pending batch ledger entries awaiting completion for the given batchKind
 * (defaults to 'nightly_generation' so the nightly pipeline never hijacks Plantão correction batches).
 */
export async function listPendingBatchLedgers(
  supabase?: SupabaseClient | null,
  batchKind: BatchKind = 'nightly_generation'
): Promise<BatchLedgerRow[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('batch_generation_ledger')
        .select('*')
        .eq('status', 'submitted')
        .order('submission_timestamp', { ascending: true });

      if (!error && Array.isArray(data)) {
        return (data as BatchLedgerRow[]).filter((r: any) => {
          const k: BatchKind = r.batch_kind === 'plantao_correction' ? 'plantao_correction' : 'nightly_generation';
          return k === batchKind;
        });
      }
    } catch {}
  }

  const localRows = readLocalLedger();
  return localRows.filter((r) => {
    const k: BatchKind = r.batch_kind === 'plantao_correction' ? 'plantao_correction' : 'nightly_generation';
    return r.status === 'submitted' && k === batchKind;
  });
}

/**
 * Cancels an in-progress or queued batch on OpenRouter.
 * DELETE https://openrouter.ai/api/v1/batches/{id} / POST cancel fallback
 */
export async function cancelOpenRouterBatch(
  batchId: string,
  apiKey?: string,
  isMock: boolean = false,
  supabase?: SupabaseClient | null
): Promise<{ id: string; status: string }> {
  if (!batchId || !batchId.trim()) {
    throw new Error('Batch ID is required for cancellation');
  }

  if (isMock) {
    await updateBatchLedgerRecord(batchId, { status: 'failed' }, supabase);
    return { id: batchId, status: 'cancelled' };
  }

  const cleanKey = sanitizeApiKey(apiKey, isMock);

  try {
    const response = await fetch(`${OPENROUTER_BATCH_ENDPOINT}/${encodeURIComponent(batchId.trim())}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        'HTTP-Referer': 'https://emergemed.upa',
        'X-Title': 'EmergeMed Batch Pipeline',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[OpenRouter Batch] Cancel endpoint returned (${response.status}): ${errorText}`);
    }

    const data = await response.json().catch(() => ({}));
    await updateBatchLedgerRecord(batchId, { status: 'failed' }, supabase);

    return {
      id: data?.id || batchId,
      status: data?.status || 'cancelled',
    };
  } catch (err: any) {
    console.error(`[OpenRouter Batch] Error cancelling batch ${batchId}:`, err);
    await updateBatchLedgerRecord(batchId, { status: 'failed' }, supabase);
    return { id: batchId, status: 'cancelled' };
  }
}

/**
 * Estimates prompt tokens, completion tokens, and dollar cost for a batch of requests.
 */
export function estimateBatchCost(
  itemsCount: number,
  promptTokensPerItem: number = 3500,
  completionTokensPerItem: number = 1500
): { estimatedPromptTokens: number; estimatedCompletionTokens: number; estimatedCostUsd: number } {
  const promptTokens = itemsCount * promptTokensPerItem;
  const completionTokens = itemsCount * completionTokensPerItem;
  const cost = calculateBatchCost(promptTokens, completionTokens);
  return {
    estimatedPromptTokens: promptTokens,
    estimatedCompletionTokens: completionTokens,
    estimatedCostUsd: cost,
  };
}

/**
 * Builds a standardized BatchRequestItem for bed sequence evaluation.
 */
export function createBedEvaluationBatchItem({
  testId,
  bedNumber,
  chapterId,
  questionIds,
  systemPrompt,
  userPrompt,
}: {
  testId: string;
  bedNumber: number;
  chapterId?: number;
  questionIds: number[];
  systemPrompt: string;
  userPrompt: string;
}): BatchRequestItem {
  return {
    custom_id: JSON.stringify({
      type: 'bed_evaluation',
      testId,
      bedNumber,
      chapterId,
      questionIds,
    }),
    method: 'POST',
    url: '/v1/chat/completions',
    body: {
      model: BATCH_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    },
  };
}

/**
 * Builds a standardized BatchRequestItem for shift preceptorship feedback.
 */
export function createFeedbackBatchItem({
  testId,
  overallScore,
  systemPrompt,
  userPrompt,
}: {
  testId: string;
  overallScore: number;
  systemPrompt: string;
  userPrompt: string;
}): BatchRequestItem {
  return {
    custom_id: JSON.stringify({
      type: 'plantao_feedback',
      testId,
      overallScore,
    }),
    method: 'POST',
    url: '/v1/chat/completions',
    body: {
      model: BATCH_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
    },
  };
}