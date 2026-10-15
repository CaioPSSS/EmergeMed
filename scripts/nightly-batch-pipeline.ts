#!/usr/bin/env tsx
/**
 * Nightly Batch Pipeline CLI
 * OpenRouter Batch API (openai/gpt-6-luna:batch)
 * Requirements R4 and R5
 *
 * Usage:
 *   npx tsx scripts/nightly-batch-pipeline.ts --submit [--mock]
 *   npx tsx scripts/nightly-batch-pipeline.ts --poll-and-ingest [--mock]
 *   npx tsx scripts/nightly-batch-pipeline.ts --status
 */

import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CHAPTERS_DATA, Chapter } from '../lib/chapters-data';
import { getNormalizedClinicalWeights, buildReadinessSnapshot } from '../lib/learning-engine';
import { getUnifiedChapters, getUnifiedChapterWeights } from '../lib/chapters-service';
import { fixMojibake, normalizeNFC } from '../lib/text-sanitizer';
import {
  parseJsonFromMarkdown,
  normalizeQuestionItem,
  buildPlantaoBedGenerationRequest,
  parsePlantaoBedGenerationResponse,
  buildQuestionsGenerationRequest,
  parseQuestionsGenerationResponse,
  QuestionItem,
} from '../lib/ai/openrouter';
import {
  BATCH_MODEL,
  DAILY_HARD_CAP_USD,
  MONTHLY_HARD_CAP_USD,
  MAX_BEDS_PER_CHAPTER,
  MAX_MCQS_PER_CHAPTER,
  BatchLedgerRow,
  BatchRequestItem,
  calculateBatchCost,
  evaluateBudgetCapBreach,
  fetchAccumulatedBudget,
  insertBatchLedgerRecord,
  updateBatchLedgerRecord,
  getLatestBatchLedger,
  listPendingBatchLedgers,
  submitOpenRouterBatch,
  getOpenRouterBatchStatus,
  readLocalLedger,
} from '../lib/ai/openrouter-batch';

// ============================================================================
// 1. ENVIRONMENT & CONFIGURATION
// ============================================================================

const LOCK_FILE = path.join(process.cwd(), '.nightly-batch.lock');
const ALLOWED_FLAGS = ['--submit', '--poll-and-ingest', '--salvage', '--cancel-pending', '--status', '--pending-status', '--mock', '--json'];

/**
 * Maximum number of candidate chapters / requests scheduled in a single live nightly batch run
 * to keep payload sizes compact, avoid OpenRouter 402 upfront balance reservation errors,
 * and stay strictly within the $0.15 daily cap when full book chapters are embedded.
 */
export const MAX_CANDIDATE_CHAPTERS_PER_LIVE_RUN = 15;
export const MAX_REQUESTS_PER_LIVE_BATCH = 20;

export interface PollAndIngestSummary {
  pendingAtStart: number;
  completedBatches: number;
  failedBatches: number;
  stillPendingBatches: number;
}

export function shouldBlockSubmissionDueToPending(pendingCount: number): boolean {
  return Number.isFinite(pendingCount) && pendingCount > 0;
}

export function classifyBatchProgressStatus(status: string): 'completed' | 'failed' | 'pending' {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') return 'completed';
  if (normalized === 'failed' || normalized === 'cancelled' || normalized === 'expired') return 'failed';
  return 'pending';
}

function loadEnv(): void {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const val = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      }
    });
  }
}

loadEnv();

function getSupabaseClient(isMock: boolean = false): SupabaseClient | null {
  if (isMock) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    return createClient(url, key);
  } catch (err) {
    console.warn('[DB] Could not initialize Supabase client:', err);
    return null;
  }
}

// ============================================================================
// 2. LOCK FILE MANAGEMENT
// ============================================================================

function acquireLock(): boolean {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const stats = fs.statSync(LOCK_FILE);
      const ageMs = Date.now() - stats.mtimeMs;
      // Stale lock after 2 hours
      if (ageMs > 2 * 60 * 60 * 1000) {
        fs.unlinkSync(LOCK_FILE);
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {}
}

// ============================================================================
// 3. CANDIDATE PRIORITIZATION TREE (TIERS 1, 3, 4)
// ============================================================================

export interface CandidateChapter {
  chapterId: number;
  chapterTitle: string;
  tier: 'Tier 1 (Study Queue)' | 'Tier 3 (Recommender)' | 'Tier 4 (Epidemiology)';
  currentBeds: number;
  currentMCQs: number;
  bedsNeeded: number;
  mcqsNeeded: number;
}

/**
 * Retrieves existing bed and MCQ counts for chapters from database or local files.
 */
async function getChapterInventoryCounts(
  supabase: SupabaseClient | null,
  chapterIds: number[],
  isMock: boolean = false
): Promise<Map<number, { beds: number; mcqs: number }>> {
  const counts = new Map<number, { beds: number; mcqs: number }>();
  for (const id of chapterIds) {
    counts.set(id, { beds: 0, mcqs: 0 });
  }

  if (!isMock && supabase) {
    try {
      const { data: bedData } = await supabase
        .from('bed_case_bank')
        .select('chapter_id');
      if (Array.isArray(bedData)) {
        for (const row of bedData) {
          const cid = Number(row.chapter_id);
          if (counts.has(cid)) {
            counts.get(cid)!.beds += 1;
          }
        }
      }

      const { data: mcqData } = await supabase
        .from('question_bank')
        .select('chapter_id');
      if (Array.isArray(mcqData)) {
        for (const row of mcqData) {
          const cid = Number(row.chapter_id);
          if (counts.has(cid)) {
            counts.get(cid)!.mcqs += 1;
          }
        }
      }
    } catch (err) {
      console.warn('[Inventory] Supabase inventory fetch error, using zero baseline:', err);
    }
  }

  return counts;
}

/**
 * Resolves which doctor's study queue / recommender drives the nightly batch.
 * Prefers BATCH_TARGET_USER_ID; otherwise falls back to the owner of the
 * most recently updated active study_queue entry (single-user deployment).
 */
async function resolveTargetUserId(supabase: SupabaseClient): Promise<string | null> {
  if (process.env.BATCH_TARGET_USER_ID) return process.env.BATCH_TARGET_USER_ID;
  try {
    const { data } = await supabase
      .from('study_queue')
      .select('user_id')
      .eq('completed', false)
      .limit(1);
    return (Array.isArray(data) && data[0]?.user_id) || null;
  } catch {
    return null;
  }
}

/**
 * Returns the chapter IDs shown in the dashboard card
 * "Recomendações Clínicas Prioritárias (Top 3 por Modo)", computed with the
 * exact same engine and inputs as app/api/recommendations/route.ts.
 */
async function fetchRecommenderTop3(supabase: SupabaseClient, userId: string): Promise<number[]> {
  try {
    const [progress, reviewStats, tests, events, chaptersList, customWeights] = await Promise.all([
      supabase.from('chapter_progress').select('chapter_id, is_read, read_at, read_count, last_read_at').eq('user_id', userId),
      supabase.from('chapter_review_stats').select('*').eq('user_id', userId),
      supabase.from('tests').select('id, chapter_ids, mode, score, completed, completed_at, results, plantao_data').eq('user_id', userId),
      supabase
        .from('chapter_recommendation_events')
        .select('recommended_chapter_id, selected_chapter_id, surface, mode, action, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
      getUnifiedChapters(supabase, userId),
      getUnifiedChapterWeights(supabase, userId),
    ]);

    const snapshot = buildReadinessSnapshot({
      progressList: progress.data || [],
      reviewStatsList: reviewStats.data || [],
      testsList: tests.data || [],
      recentEvents: (events.data as any[]) || [],
      surface: 'dashboard',
      chaptersList,
      customWeights,
    });

    return (snapshot.recommendations || [])
      .map((r: any) => Number(r.selectedChapterId || r.recommendedChapterId))
      .filter((n: number) => Number.isFinite(n) && n > 0);
  } catch (err) {
    console.warn('[Prioritization] Tier 3 recommender snapshot skipped:', err);
    return [];
  }
}

/**
 * Executes the Candidate Prioritization Tree:
 * Tier 1 (study_queue position ASC) >
 * Tier 3 (Recommender Top 3 per mode: remediation, maintenance FSRS dueRatio >= 0.8, expansion) >
 * Tier 4 (getNormalizedClinicalWeights clinical/epidemiological scores).
 * Note: Tier 2 (daily challenge) is strictly removed.
 */
export async function buildCandidatePrioritizationList(
  supabase: SupabaseClient | null,
  isMock: boolean = false
): Promise<CandidateChapter[]> {
  const allChaptersMap = new Map<number, Chapter>();
  for (const c of CHAPTERS_DATA) {
    allChaptersMap.set(c.id, c);
  }

  const prioritizedIds: Array<{ id: number; tier: CandidateChapter['tier'] }> = [];
  const seenIds = new Set<number>();
  const targetUserId = !isMock && supabase ? await resolveTargetUserId(supabase) : null;

  // --------------------------------------------------------------------------
  // Tier 1: Fila de Estudos (study_queue position ASC)
  // --------------------------------------------------------------------------
  if (!isMock && supabase) {
    try {
      let queueQuery = supabase
        .from('study_queue')
        .select('chapter_id, position, completed')
        .eq('completed', false);
      if (targetUserId) queueQuery = queueQuery.eq('user_id', targetUserId);
      const { data: queueData } = await queueQuery.order('position', { ascending: true });

      if (Array.isArray(queueData)) {
        for (const q of queueData) {
          const cid = Number(q.chapter_id);
          if (allChaptersMap.has(cid) && !seenIds.has(cid)) {
            prioritizedIds.push({ id: cid, tier: 'Tier 1 (Study Queue)' });
            seenIds.add(cid);
          }
        }
      }
    } catch (err) {
      console.warn('[Prioritization] Tier 1 study_queue query skipped:', err);
    }
  }

  // --------------------------------------------------------------------------
  // Tier 3: Recomendações Clínicas Prioritárias (Top 3 por Modo) — same engine
  // and same inputs as the dashboard card (app/api/recommendations/route.ts).
  // --------------------------------------------------------------------------
  const tier3Ids = !isMock && supabase && targetUserId
    ? await fetchRecommenderTop3(supabase, targetUserId)
    : [];
  for (const cid of tier3Ids) {
    if (allChaptersMap.has(cid) && !seenIds.has(cid)) {
      prioritizedIds.push({ id: cid, tier: 'Tier 3 (Recommender)' });
      seenIds.add(cid);
    }
  }

  // --------------------------------------------------------------------------
  // Tier 4: Scores Epidemiológicos e Clínicos (getNormalizedClinicalWeights DESC)
  // --------------------------------------------------------------------------
  const weightsMap = getNormalizedClinicalWeights(CHAPTERS_DATA);
  const sortedByWeight = [...CHAPTERS_DATA].sort((a, b) => {
    const wA = weightsMap.get(a.id)?.clinicalWeight || 0;
    const wB = weightsMap.get(b.id)?.clinicalWeight || 0;
    return wB - wA;
  });

  for (const c of sortedByWeight) {
    if (!seenIds.has(c.id)) {
      prioritizedIds.push({ id: c.id, tier: 'Tier 4 (Epidemiology)' });
      seenIds.add(c.id);
    }
  }

  // --------------------------------------------------------------------------
  // Saturation Filter & Delta Calculation
  // --------------------------------------------------------------------------
  const inventoryCounts = await getChapterInventoryCounts(
    supabase,
    prioritizedIds.map((p) => p.id),
    isMock
  );

  const eligibleCandidates: CandidateChapter[] = [];

  for (const item of prioritizedIds) {
    const chapter = allChaptersMap.get(item.id);
    if (!chapter) continue; // Boundary check: skip non-existent chapters

    const current = inventoryCounts.get(item.id) || { beds: 0, mcqs: 0 };
    const bedsNeeded = Math.max(0, MAX_BEDS_PER_CHAPTER - current.beds);
    const mcqsNeeded = Math.max(0, MAX_MCQS_PER_CHAPTER - current.mcqs);

    // Skip chapters that have already reached saturation in both beds and MCQs
    if (bedsNeeded === 0 && mcqsNeeded === 0) {
      continue;
    }

    eligibleCandidates.push({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      tier: item.tier,
      currentBeds: current.beds,
      currentMCQs: current.mcqs,
      bedsNeeded,
      mcqsNeeded,
    });
  }

  return eligibleCandidates;
}

// ============================================================================
// 4. INGESTION VALIDATION & NORMALIZATION
// ============================================================================

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
  if (!vignette) return { isClean: false, matched: ['empty_vignette'] };
  const lower = vignette.toLowerCase();
  const matched: string[] = [];

  for (const term of FORBIDDEN_DIAGNOSTIC_TERMS) {
    if (lower.includes(term.toLowerCase())) {
      matched.push(term);
    }
  }

  if (chapterTitle && chapterTitle.trim().length > 3) {
    const titleLower = chapterTitle.toLowerCase();
    const patterns = [
      `diagnóstico de ${titleLower}`,
      `trata-se de ${titleLower}`,
      `quadro de ${titleLower}`,
    ];
    for (const pat of patterns) {
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
 * Extracts raw 2-stage array from AI response if present (supports top-level array `[q1, q2]`,
 * `{ questions: [q1, q2] }`, `{ items: [q1, q2] }`, `{ beds: [{ questions: [q1, q2] }] }`, `{ data: [q1, q2] }`).
 */
function extractBedStagesArray(parsed: any): any[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return null;
  if (Array.isArray(parsed.questions)) return parsed.questions;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.beds) && parsed.beds.length > 0) {
    const firstBed = parsed.beds[0];
    if (Array.isArray(firstBed?.questions)) return firstBed.questions;
    return parsed.beds;
  }
  return null;
}

/**
 * Validates both the official Plantao 2-stage QuestionItem[] schema
 * (`[ { type: 'prescription_immediate', ... }, { type: 'prescription_complete' | 'ventilator', ... } ]`)
 * produced by `SYSTEM_PROMPT_PLANTAO_GENERATOR` AND the legacy/mock `{ stage1, stage2 }` format.
 */
export function validateBedCase(parsed: any, chapterTitle: string): { isValid: boolean; error?: string } {
  if (!parsed || typeof parsed !== 'object') {
    return { isValid: false, error: 'Bed case payload is not an object' };
  }

  // Case A: Official 2-stage QuestionItem array (same format as synchronous generatePlantaoBedQuestionsWithAI)
  const rawStages = extractBedStagesArray(parsed);
  if (Array.isArray(rawStages) && rawStages.length >= 2) {
    const [rawQ1, rawQ2] = rawStages;
    if (!rawQ1 || !rawQ2 || typeof rawQ1 !== 'object' || typeof rawQ2 !== 'object') {
      return { isValid: false, error: 'Missing Stage 1 or Stage 2 in questions array' };
    }

    const q1 = normalizeQuestionItem({ ...rawQ1 });
    const q2 = normalizeQuestionItem({ ...rawQ2 });

    if (q1.type !== 'prescription_immediate') {
      return {
        isValid: false,
        error: `Stage 1 must have type="prescription_immediate" (got "${rawQ1.type}")`,
      };
    }

    if (!q1.vignette || typeof q1.vignette !== 'string' || q1.vignette.trim().length < 20) {
      return { isValid: false, error: 'Stage 1 vignette is missing or too short' };
    }

    // Verify patientWeight (either explicit numeric field > 0 or embedded in vignette)
    const rawWeight = rawQ1.patientWeight ?? rawQ1.patient_weight ?? rawQ1.weight;
    if (rawWeight !== undefined) {
      if (typeof rawWeight !== 'number' || rawWeight <= 0) {
        return { isValid: false, error: 'Stage 1 must include valid numeric patientWeight > 0' };
      }
    }

    const antiSpoiler1 = verifyAntiSpoiler(q1.vignette, chapterTitle);
    if (!antiSpoiler1.isClean) {
      return { isValid: false, error: `Stage 1 vignette contains forbidden diagnosis: ${antiSpoiler1.matched.join(', ')}` };
    }

    if (q2.type !== 'prescription_complete' && q2.type !== 'ventilator') {
      return {
        isValid: false,
        error: `Stage 2 must have type="prescription_complete" or "ventilator" (got "${rawQ2.type}")`,
      };
    }

    if (!q2.vignette || typeof q2.vignette !== 'string' || q2.vignette.trim().length < 10) {
      return { isValid: false, error: 'Stage 2 evolution vignette is missing or too short' };
    }

    const antiSpoiler2 = verifyAntiSpoiler(q2.vignette, chapterTitle);
    if (!antiSpoiler2.isClean) {
      return { isValid: false, error: `Stage 2 vignette contains forbidden diagnosis: ${antiSpoiler2.matched.join(', ')}` };
    }

    return { isValid: true };
  }

  // Case B: Legacy / Unit Test { stage1, stage2 } format
  const stage1 = parsed.stage1;
  const stage2 = parsed.stage2;

  if (!stage1 || !stage2) {
    return { isValid: false, error: 'Missing stage1 or stage2' };
  }

  if (stage1.type !== 'prescription_immediate') {
    return { isValid: false, error: 'Stage 1 must have type prescription_immediate' };
  }

  const weight = stage1.patient_weight !== undefined ? stage1.patient_weight : stage1.patientWeight;
  if (typeof weight !== 'number' || weight <= 0) {
    return { isValid: false, error: 'Stage 1 must include valid patient_weight > 0' };
  }

  const vitals = stage1.vital_signs || stage1.vitalSigns;
  if (!vitals || typeof vitals !== 'object') {
    return { isValid: false, error: 'Stage 1 must include vital_signs' };
  }

  const antiSpoiler = verifyAntiSpoiler(stage1.vignette, chapterTitle);
  if (!antiSpoiler.isClean) {
    return { isValid: false, error: `Vignette contains forbidden diagnosis: ${antiSpoiler.matched.join(', ')}` };
  }

  if (stage2.type !== 'prescription_complete' && stage2.type !== 'ventilator') {
    return { isValid: false, error: 'Stage 2 must have type prescription_complete or ventilator' };
  }

  if (!stage2.evolution || typeof stage2.evolution !== 'string' || stage2.evolution.trim().length < 10) {
    return { isValid: false, error: 'Stage 2 must include non-empty evolution' };
  }

  return { isValid: true };
}

/**
 * Normalizes a validated bed case payload into the exact `QuestionItem[]` array
 * stored in `bed_case_bank.questions` by synchronous generation (`app/api/generate-plantao/route.ts`).
 */
export function normalizeBedQuestionsForDatabase(
  parsed: any,
  chapterInfo?: { id: number; title: string }
): QuestionItem[] {
  const rawStages = extractBedStagesArray(parsed);
  if (Array.isArray(rawStages) && rawStages.length >= 2) {
    return rawStages.slice(0, 2).map((rawQ: any, idx: number) => {
      const norm = normalizeQuestionItem({ ...rawQ });
      if (idx === 0) {
        norm.type = 'prescription_immediate';
      } else if (norm.type !== 'ventilator') {
        norm.type = 'prescription_complete';
      }
      if (chapterInfo) {
        norm.chapterId = chapterInfo.id;
        norm.chapterTitle = chapterInfo.title;
      }
      if (!norm.patientWeight) {
        const wMatch = (norm.vignette || '').match(/(\d{2,3})\s*kg\b/i);
        norm.patientWeight = wMatch ? parseInt(wMatch[1], 10) : 70;
      }
      if (!norm.promptText) {
        norm.promptText =
          idx === 0
            ? 'Interprete o quadro clínico agudo e prescreva a conduta imediata de resgate/estabilização para este paciente na Sala Vermelha:'
            : norm.type === 'ventilator'
            ? 'Configure os parâmetros iniciais do ventilador mecânico para este paciente:'
            : 'Escreva a prescrição médica COMPLETA de internação/observação para a manutenção deste paciente na Sala Vermelha:';
      }
      norm.isFromBank = false;
      return norm;
    });
  }

  // Fallback conversion for legacy `{ stage1, stage2 }` payloads into canonical QuestionItem[]
  const s1 = parsed.stage1;
  const s2 = parsed.stage2;
  const weight = Number(s1.patient_weight || s1.patientWeight) || 70;
  const vitals = s1.vital_signs || s1.vitalSigns || {};
  const vitalsStr = Object.entries(vitals)
    .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
    .join(', ');

  const vignette1 = s1.vignette.includes('kg')
    ? s1.vignette
    : `${s1.vignette} Peso estimado: ${weight} kg.${vitalsStr ? ` Sinais vitais: ${vitalsStr}.` : ''}`;

  const isVent = s2.type === 'ventilator';

  const stage1Item: QuestionItem = {
    id: 1,
    type: 'prescription_immediate',
    chapterId: chapterInfo?.id ?? 1,
    chapterTitle: chapterInfo?.title,
    patientWeight: weight,
    vignette: fixMojibake(vignette1),
    promptText: fixMojibake(
      s1.promptText || s1.question || s1.conduct_prompt || 'Prescreva a conduta imediata de estabilização.'
    ),
    idealPrescription: fixMojibake(
      s1.idealPrescription || s1.expectedAnswer || 'Estabilização inicial conforme protocolo da Sala Vermelha.'
    ),
    evaluationCriteria: Array.isArray(s1.evaluationCriteria)
      ? s1.evaluationCriteria
      : ['Estabilização hemodinâmica e manejo imediato de primeira linha'],
    isFromBank: false,
  };

  const stage2Item: QuestionItem = {
    id: 2,
    type: isVent ? 'ventilator' : 'prescription_complete',
    chapterId: chapterInfo?.id ?? 1,
    chapterTitle: chapterInfo?.title,
    patientWeight: weight,
    vignette: fixMojibake(s2.vignette || s2.evolution),
    promptText: fixMojibake(
      s2.promptText || s2.question || s2.conduct_prompt || 'Prescreva a conduta de manutenção na Sala Vermelha.'
    ),
    ...(isVent
      ? {
          ventilatorFields: {
            modo: '',
            volumeCorrente: '',
            frequenciaRespiratoria: '',
            peep: '',
            fio2: '',
            relacaoIE: '',
            pressaoPlatoAlvo: '',
            fluxoOuPressao: '',
            alarmes: '',
          },
          idealVentilator: s2.idealVentilator || s2.ventilatorParams || {
            modo: 'VCV ou PCV',
            volumeCorrente: `${Math.round(weight * 6)} mL (6 mL/kg)`,
            frequenciaRespiratoria: '16 irpm',
            peep: '5-8 cmH2O',
            fio2: '1.0 inicial, titular para SpO2 92-96%',
            relacaoIE: '1:2',
            pressaoPlatoAlvo: '< 30 cmH2O',
            fluxoOuPressao: '40-60 L/min',
            alarmes: 'Ppico > 40, Pplatô > 30, SpO2 < 90%',
          },
        }
      : {
          idealPrescription: fixMojibake(
            s2.idealPrescription || s2.expectedAnswer || 'Prescrição hospitalar completa de manutenção na Sala Vermelha.'
          ),
        }),
    evaluationCriteria: Array.isArray(s2.evaluationCriteria)
      ? s2.evaluationCriteria
      : ['Manutenção clínica, monitorização e profilaxias adequadas'],
    isFromBank: false,
  };

  return [stage1Item, stage2Item];
}

export function validateMCQ(q: any): { isValid: boolean; error?: string } {
  if (!q || typeof q !== 'object') {
    return { isValid: false, error: 'MCQ payload is not an object' };
  }

  if (!Array.isArray(q.options) || q.options.length !== 5) {
    return { isValid: false, error: 'MCQ must contain exactly 5 options' };
  }

  // Strip accidental "A) " prefixes if present before checking uniqueness
  const cleanedOptions = q.options.map((opt: any) =>
    String(opt).replace(/^[A-Ea-e][).:-]\s*/, '').trim()
  );
  const uniqueOptions = new Set(cleanedOptions);
  if (uniqueOptions.size !== 5) {
    return { isValid: false, error: 'MCQ has duplicate option strings' };
  }

  // Support correctOption (from SYSTEM_PROMPT_QUESTION_GENERATOR), correct_option, and correctAnswer
  const correctIdx =
    typeof q.correctOption === 'number'
      ? q.correctOption
      : typeof q.correct_option === 'number'
      ? q.correct_option
      : q.correctAnswer;
  if (typeof correctIdx !== 'number' || correctIdx < 0 || correctIdx > 4) {
    return { isValid: false, error: 'correctOption / correct_option must be an integer index between 0 and 4' };
  }

  const vignetteText = q.vignette || q.question;
  if (!vignetteText || typeof vignetteText !== 'string' || vignetteText.trim().length < 15) {
    return { isValid: false, error: 'MCQ vignette is missing or too short' };
  }

  if (!q.explanation || typeof q.explanation !== 'string' || q.explanation.trim().length < 10) {
    return { isValid: false, error: 'MCQ explanation is missing or too short' };
  }

  return { isValid: true };
}

// ============================================================================
// 5. BATCH SUBMISSION WORKFLOW (--submit)
// ============================================================================

export async function runBatchSubmission(isMock: boolean = false): Promise<void> {
  console.log('\n================================================================================');
  console.log(`▶ [NIGHTLY BATCH PIPELINE] SUBMIT RUN — ${new Date().toISOString()}`);
  console.log(`  Mode: ${isMock ? 'MOCK (Offline Simulation)' : 'LIVE (OpenRouter Batch API)'}`);
  console.log(`  Model: ${BATCH_MODEL}`);
  console.log('================================================================================\n');

  const supabase = getSupabaseClient(isMock);

  const rawPendingBatches = await listPendingBatchLedgers(supabase, 'nightly_generation');
  const pendingBatches = isMock
    ? rawPendingBatches
    : rawPendingBatches.filter((b) => !String(b.batch_id || '').startsWith('batch_mock_'));

  if (shouldBlockSubmissionDueToPending(pendingBatches.length)) {
    console.log(`[Queue] Found ${pendingBatches.length} pending submitted batch(es).`);
    console.log('✓ Submission skipped: existing batch work is still in progress and must finish before creating a new batch.');
    return;
  }

  // 1. Budget hard cap check before doing any work (strictly scoped to 'nightly_generation')
  const {
    dailyAccumulated,
    monthlyAccumulated,
    dailyPendingReserved,
    monthlyPendingReserved,
    dailyTotalWithPendingReserved,
    monthlyTotalWithPendingReserved,
  } = await fetchAccumulatedBudget(supabase, 'nightly_generation');
  console.log(`[Budget] Daily Realized:              $${dailyAccumulated.toFixed(6)} / $${DAILY_HARD_CAP_USD.toFixed(2)}`);
  console.log(`[Budget] Monthly Realized:            $${monthlyAccumulated.toFixed(6)} / $${MONTHLY_HARD_CAP_USD.toFixed(2)}`);
  console.log(`[Budget] Daily Pending Reserved:      $${dailyPendingReserved.toFixed(6)}`);
  console.log(`[Budget] Monthly Pending Reserved:    $${monthlyPendingReserved.toFixed(6)}`);
  console.log(`[Budget] Daily Total (Realized+Res):  $${dailyTotalWithPendingReserved.toFixed(6)} / $${DAILY_HARD_CAP_USD.toFixed(2)}`);
  console.log(`[Budget] Monthly Total (Realized+Res):$${monthlyTotalWithPendingReserved.toFixed(6)} / $${MONTHLY_HARD_CAP_USD.toFixed(2)}`);

  if (dailyTotalWithPendingReserved >= DAILY_HARD_CAP_USD || monthlyTotalWithPendingReserved >= MONTHLY_HARD_CAP_USD) {
    console.warn(`\n⚠️  [HARD BUDGET CAP HALT] Budget ceiling reached!`);
    console.warn(`   Daily Total: $${dailyTotalWithPendingReserved.toFixed(4)} >= $${DAILY_HARD_CAP_USD.toFixed(2)} OR Monthly Total: $${monthlyTotalWithPendingReserved.toFixed(4)} >= $${MONTHLY_HARD_CAP_USD.toFixed(2)}`);
    console.warn(`   Execution halted automatically. Flagging hard_cap_interrupted = true in ledger.`);

    await insertBatchLedgerRecord(
      {
        batch_id: `batch_cap_${Date.now()}`,
        batch_kind: 'nightly_generation',
        submission_timestamp: new Date().toISOString(),
        completion_timestamp: new Date().toISOString(),
        model: BATCH_MODEL,
        prompt_tokens: 0,
        completion_tokens: 0,
        cost_usd: 0,
        daily_accumulated_usd: dailyAccumulated,
        monthly_accumulated_usd: monthlyAccumulated,
        hard_cap_interrupted: true,
        items_requested: 0,
        items_ingested: 0,
        items_failed: 0,
        status: 'capped',
      },
      supabase
    );
    return;
  }

  // 2. Select prioritized candidates
  console.log('[Tree] Evaluating Candidate Prioritization Tree (Tier 1 > Tier 3 > Tier 4)...');
  const candidates = await buildCandidatePrioritizationList(supabase, isMock);
  console.log(`[Tree] Found ${candidates.length} unsaturated chapter candidates.`);

  if (candidates.length === 0) {
    console.log('✓ All chapters have reached full saturation (6 beds and 20 MCQs). Nothing to submit.');
    return;
  }

  // Map chapter metadata (number, title, sectionTitle)
  const allChaptersMap = new Map<number, Chapter>();
  for (const c of CHAPTERS_DATA) {
    allChaptersMap.set(c.id, c);
  }

  // In live mode, scope chapter_contents prefetch to top prioritized candidates for tonight's run
  const targetCandidates = isMock
    ? candidates
    : candidates.slice(0, MAX_CANDIDATE_CHAPTERS_PER_LIVE_RUN);

  const candidateChapterIds = targetCandidates.map((c) => c.chapterId);
  const chapterTextsMap = new Map<number, string>();
  const existingPhenotypesMap = new Map<number, string[]>();

  if (!isMock && supabase && candidateChapterIds.length > 0) {
    try {
      const [{ data: contentsData }, { data: bankCasesData }] = await Promise.all([
        supabase
          .from('chapter_contents')
          .select('chapter_id, content')
          .in('chapter_id', candidateChapterIds),
        supabase
          .from('bed_case_bank')
          .select('chapter_id, phenotype_title, questions')
          .in('chapter_id', candidateChapterIds)
          .order('created_at', { ascending: true }),
      ]);

      if (Array.isArray(contentsData)) {
        for (const row of contentsData) {
          if (row.content) {
            chapterTextsMap.set(Number(row.chapter_id), String(row.content));
          }
        }
      }

      if (Array.isArray(bankCasesData)) {
        for (const row of bankCasesData) {
          const cid = Number(row.chapter_id);
          const pheno =
            row.phenotype_title ||
            (Array.isArray(row.questions) && row.questions[0]?.vignette
              ? String(row.questions[0].vignette).slice(0, 100)
              : '');
          if (pheno) {
            if (!existingPhenotypesMap.has(cid)) {
              existingPhenotypesMap.set(cid, []);
            }
            existingPhenotypesMap.get(cid)!.push(pheno);
          }
        }
      }
    } catch (err) {
      console.warn('[Context] Could not prefetch chapter_contents / bed_case_bank phenotypes:', err);
    }
  }

  // 3. Construct batch requests (limit batch size to respect remaining daily & monthly caps)
  const remainingDaily = DAILY_HARD_CAP_USD - dailyTotalWithPendingReserved;
  const remainingMonthly = MONTHLY_HARD_CAP_USD - monthlyTotalWithPendingReserved;
  const maxSpendAllowed = Math.min(remainingDaily, remainingMonthly);

  const requests: BatchRequestItem[] = [];
  let projectedCost = 0;

  for (const candidate of targetCandidates) {
    if (!isMock && requests.length >= MAX_REQUESTS_PER_LIVE_BATCH) break;

    const chapterMeta = allChaptersMap.get(candidate.chapterId);
    const chapterInfo = {
      id: candidate.chapterId,
      number: chapterMeta?.number || candidate.chapterId,
      title: chapterMeta?.title || candidate.chapterTitle,
      sectionTitle: chapterMeta?.sectionTitle || 'Emergência Clínica',
    };
    const chapterText = chapterTextsMap.get(candidate.chapterId);
    const extraChapterTokens = chapterText ? Math.ceil(chapterText.length / 4) : 0;
    const basePhenotypes = existingPhenotypesMap.get(candidate.chapterId) || [];

    // Schedule at most 1 new bed case per chapter per batch run so that each subsequent night
    // observes the actual generated phenotype_title in `bed_case_bank` (preserving exact parity with sync).
    const bedsToSchedule = Math.min(candidate.bedsNeeded, 1);

    for (let i = 0; i < bedsToSchedule; i++) {
      if (!isMock && requests.length >= MAX_REQUESTS_PER_LIVE_BATCH) break;

      const caseIdx = candidate.currentBeds + i + 1;
      const estimatedCost = calculateBatchCost(1500 + extraChapterTokens, 1000);

      if (projectedCost + estimatedCost > maxSpendAllowed) {
        break;
      }

      // Build the EXACT same messages, system prompt, user prompt, temperature, and max_tokens
      // as synchronous `generatePlantaoBedQuestionsWithAI` in `lib/ai/openrouter.ts`
      const builtBedReq = buildPlantaoBedGenerationRequest({
        bedNumber: caseIdx,
        chapterInfo,
        chapterText,
        existingPhenotypes: basePhenotypes,
      });

      // Keep custom_id compact (< 64 chars) for OpenAI/OpenRouter Batch API compatibility
      requests.push({
        custom_id: JSON.stringify({
          type: 'bed_case',
          chapterId: candidate.chapterId,
          caseIdx,
        }),
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: BATCH_MODEL,
          messages: builtBedReq.messages,
          temperature: builtBedReq.temperature,
          max_tokens: builtBedReq.max_tokens,
        },
      });

      projectedCost += estimatedCost;
    }

    // Generate MCQs needed using the exact `buildQuestionsGenerationRequest` from `lib/ai/openrouter.ts`
    if (candidate.mcqsNeeded > 0 && (isMock || requests.length < MAX_REQUESTS_PER_LIVE_BATCH)) {
      const count = Math.min(candidate.mcqsNeeded, 10);
      const estimatedCost = calculateBatchCost(1200 + extraChapterTokens, 1500);

      if (projectedCost + estimatedCost <= maxSpendAllowed) {
        const stdCount = Math.round(count * 0.6);
        const advCount = count - stdCount;

        const builtMcqReq = buildQuestionsGenerationRequest({
          chaptersInfo: [chapterInfo],
          chapterTexts: chapterText ? { [chapterInfo.id]: chapterText } : undefined,
          count,
          questionType: 'multiple_choice',
          difficultyMix: { standard: stdCount, advanced: advCount },
          isPostChapter: true,
        });

        requests.push({
          custom_id: JSON.stringify({
            type: 'mcqs',
            chapterId: candidate.chapterId,
            count,
          }),
          method: 'POST',
          url: '/v1/chat/completions',
          body: {
            model: BATCH_MODEL,
            messages: builtMcqReq.messages,
            temperature: builtMcqReq.temperature,
            max_tokens: builtMcqReq.max_tokens,
          },
        });
        projectedCost += estimatedCost;
      }
    }

    if (projectedCost >= maxSpendAllowed) break;
  }

  if (requests.length === 0) {
    console.warn('\n⚠️  [HARD BUDGET CAP HALT] Insufficient remaining budget to schedule even 1 batch item.');
    console.warn(`   Remaining Daily: $${remainingDaily.toFixed(6)}, Remaining Monthly: $${remainingMonthly.toFixed(6)}`);
    console.warn(`   Execution halted automatically. Flagging hard_cap_interrupted = true in ledger.`);

    await insertBatchLedgerRecord(
      {
        batch_id: `batch_cap_${Date.now()}`,
        batch_kind: 'nightly_generation',
        submission_timestamp: new Date().toISOString(),
        completion_timestamp: new Date().toISOString(),
        model: BATCH_MODEL,
        prompt_tokens: 0,
        completion_tokens: 0,
        cost_usd: 0,
        daily_accumulated_usd: dailyAccumulated,
        monthly_accumulated_usd: monthlyAccumulated,
        hard_cap_interrupted: true,
        items_requested: 0,
        items_ingested: 0,
        items_failed: 0,
        status: 'capped',
      },
      supabase
    );
    return;
  }

  console.log(`[Batch] Prepared ${requests.length} requests across ${targetCandidates.length} candidate chapters.`);
  console.log(`[Budget] Projected Batch Cost: $${projectedCost.toFixed(6)} (Limit: $${maxSpendAllowed.toFixed(6)})`);

  // 4. Submit batch to OpenRouter
  console.log('[API] Submitting batch to OpenRouter Batch API...');
  const submission = await submitOpenRouterBatch(requests, process.env.OPENROUTER_API_KEY, isMock);
  console.log(`✓ Batch Submitted Successfully! Batch ID: ${submission.id} (Status: ${submission.status})`);

  // 5. Persist submission in batch_generation_ledger
  await insertBatchLedgerRecord(
    {
      batch_id: submission.id,
      batch_kind: 'nightly_generation',
      submission_timestamp: new Date().toISOString(),
      model: BATCH_MODEL,
      prompt_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0,
      daily_accumulated_usd: dailyAccumulated,
      monthly_accumulated_usd: monthlyAccumulated,
      hard_cap_interrupted: false,
      items_requested: requests.length,
      items_ingested: 0,
      items_failed: 0,
      status: 'submitted',
    },
    supabase
  );

  // Store mock requests if running in mock mode for retrieval during poll
  if (isMock) {
    const agentsDir = path.join(process.cwd(), '.agents');
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }
    const mockStorage = path.join(agentsDir, `mock_batch_${submission.id}.json`);
    fs.writeFileSync(mockStorage, JSON.stringify(requests), 'utf8');
  }

  console.log('✓ Submission logged to public.batch_generation_ledger.\n');
}

// ============================================================================
// 6. BATCH POLLING & INGESTION WORKFLOW (--poll-and-ingest)
// ============================================================================

export async function runPollAndIngest(isMock: boolean = false): Promise<PollAndIngestSummary> {
  console.log('\n================================================================================');
  console.log(`▶ [NIGHTLY BATCH PIPELINE] POLL & INGEST RUN — ${new Date().toISOString()}`);
  console.log(`  Mode: ${isMock ? 'MOCK (Offline Simulation)' : 'LIVE (OpenRouter Batch API)'}`);
  console.log('================================================================================\n');

  const supabase = getSupabaseClient(isMock);
  const pendingBatches = await listPendingBatchLedgers(supabase, 'nightly_generation');
  const summary: PollAndIngestSummary = {
    pendingAtStart: pendingBatches.length,
    completedBatches: 0,
    failedBatches: 0,
    stillPendingBatches: 0,
  };

  if (pendingBatches.length === 0) {
    console.log('✓ No pending submitted batches found in ledger.');
    return summary;
  }

  console.log(`[Queue] Found ${pendingBatches.length} pending batches awaiting ingestion.`);

  const allChaptersMap = new Map<number, Chapter>();
  for (const c of CHAPTERS_DATA) {
    allChaptersMap.set(c.id, c);
  }

  for (const batchRow of pendingBatches) {
    console.log(`\n--- Processing Batch ${batchRow.batch_id} ---`);

    // If running in live mode and a synthetic mock batch ID was persisted in Supabase, mark it failed so it never blocks live runs
    if (!isMock && String(batchRow.batch_id || '').startsWith('batch_mock_')) {
      console.warn(`[Status] Batch ${batchRow.batch_id} is a synthetic mock batch in live DB. Marking as failed to unblock queue.`);
      await updateBatchLedgerRecord(
        batchRow.batch_id,
        {
          completion_timestamp: new Date().toISOString(),
          status: 'failed',
        },
        supabase
      );
      summary.failedBatches += 1;
      continue;
    }

    let mockRequests: BatchRequestItem[] = [];
    if (isMock) {
      const mockStorage = path.join(process.cwd(), '.agents', `mock_batch_${batchRow.batch_id}.json`);
      if (fs.existsSync(mockStorage)) {
        mockRequests = JSON.parse(fs.readFileSync(mockStorage, 'utf8'));
      }
    }

    let statusResponse;
    try {
      statusResponse = await getOpenRouterBatchStatus(
        batchRow.batch_id,
        process.env.OPENROUTER_API_KEY,
        isMock,
        mockRequests
      );
    } catch (pollErr: any) {
      const errMsg = String(pollErr?.message || pollErr);
      console.warn(`[Status] Error polling batch ${batchRow.batch_id}: ${errMsg}`);
      // OpenRouter returns transient 404 immediately after POST /v1/batches while status="validating" is indexing.
      // Only mark 404 as permanently failed if the batch was submitted more than 24 hours ago (or 410 Gone).
      const submittedAtMs = batchRow.submission_timestamp ? new Date(batchRow.submission_timestamp).getTime() : 0;
      const ageMs = submittedAtMs > 0 ? Date.now() - submittedAtMs : 0;
      const isStale404 = ageMs > 24 * 60 * 60 * 1000;

      if (errMsg.includes('(410)') || (errMsg.includes('(404)') && isStale404)) {
        await updateBatchLedgerRecord(
          batchRow.batch_id,
          {
            completion_timestamp: new Date().toISOString(),
            status: 'failed',
          },
          supabase
        );
        summary.failedBatches += 1;
      } else {
        console.log(`[Status] Batch ${batchRow.batch_id} is still indexing/validating on OpenRouter (transient 404). Will retry on next poll.`);
        summary.stillPendingBatches += 1;
      }
      continue;
    }

    console.log(`[Status] Batch State: ${statusResponse.status}`);
    const batchProgress = classifyBatchProgressStatus(statusResponse.status);

    const salvageableResults = (statusResponse.results || []).filter((r) =>
      Boolean(r?.response?.body?.choices?.[0]?.message?.content)
    );

    if (batchProgress === 'failed' && salvageableResults.length === 0) {
      if (statusResponse.error) {
        console.warn(`[Status] Batch Error Details:`, JSON.stringify(statusResponse.error));
      }
      await updateBatchLedgerRecord(
        batchRow.batch_id,
        {
          completion_timestamp: new Date().toISOString(),
          status: 'failed',
        },
        supabase
      );
      summary.failedBatches += 1;
      console.warn(`[Status] Batch ${batchRow.batch_id} is terminal with status "${statusResponse.status}" and 0 salvageable items. Marked as failed in ledger.`);
      continue;
    }

    if (batchProgress === 'failed' && salvageableResults.length > 0) {
      console.log(
        `[Salvage] Batch ${batchRow.batch_id} has status "${statusResponse.status}", but ${salvageableResults.length} request(s) succeeded! Salvaging valid items...`
      );
    } else

    if (batchProgress !== 'completed') {
      console.log(`[Status] Batch still in progress. Skipping ingestion for now.`);
      summary.stillPendingBatches += 1;
      continue;
    }

    // Ingest results
    const results = statusResponse.results || [];
    console.log(`[Ingestion] Validating ${results.length} result payloads...`);

    let itemsIngested = 0;
    let itemsFailed = 0;
    const bedRowsToInsert: any[] = [];
    const mcqRowsToInsert: any[] = [];

    for (const item of results) {
      try {
        const rawContent = item.response?.body?.choices?.[0]?.message?.content;
        if (!rawContent) {
          itemsFailed++;
          continue;
        }

        // Sanitization & normalization
        const sanitized = normalizeNFC(fixMojibake(rawContent));
        const parsed = parseJsonFromMarkdown(sanitized);

        const customData = JSON.parse(item.custom_id);
        const chapterMeta = allChaptersMap.get(Number(customData.chapterId));
        const chapterTitle = customData.chapterTitle || chapterMeta?.title || `Capítulo ${customData.chapterId}`;
        const sectionTitle = customData.sectionTitle || chapterMeta?.sectionTitle || '';
        const caseIdx = Number(customData.caseIdx) || 1;
        const complexity: 'classic' | 'complex' | 'atypical' =
          customData.complexity || (caseIdx === 1 ? 'classic' : caseIdx <= 3 ? 'complex' : 'atypical');

        if (customData.type === 'bed_case') {
          const validation = validateBedCase(parsed, chapterTitle);
          if (!validation.isValid) {
            console.warn(`[Reject] Bed Case rejected: ${validation.error}`);
            itemsFailed++;
            continue;
          }

          const normalizedQuestions = normalizeBedQuestionsForDatabase(parsed, {
            id: Number(customData.chapterId),
            title: chapterTitle,
          });

          const stage1Vignette = normalizedQuestions[0]?.vignette || '';
          const phenotypeTitle = stage1Vignette
            ? `${stage1Vignette.slice(0, 90)}...`
            : chapterTitle;

          bedRowsToInsert.push({
            chapter_id: Number(customData.chapterId),
            chapter_title: chapterTitle,
            section_title: sectionTitle,
            phenotype_title: phenotypeTitle,
            complexity_level: complexity,
            questions: normalizedQuestions,
            times_used: 0,
          });
          itemsIngested++;
        } else if (customData.type === 'mcqs') {
          const normalizedMcqs = parseQuestionsGenerationResponse(sanitized);
          for (const normQ of normalizedMcqs) {
            const validation = validateMCQ(normQ);
            if (!validation.isValid) {
              console.warn(`[Reject] MCQ rejected: ${validation.error}`);
              itemsFailed++;
              continue;
            }

            const cleanedOptions = (normQ.options || []).map((opt: any) =>
              String(opt).replace(/^[A-Ea-e][).:-]\s*/, '').trim()
            );

            mcqRowsToInsert.push({
              chapter_id: Number(customData.chapterId),
              question_type: 'multiple_choice',
              difficulty_tier: normQ.difficulty_tier || 'standard',
              question_subformat: normQ.question_subformat || 'case_conduct',
              vignette: normQ.vignette,
              options: cleanedOptions,
              correct_option: normQ.correctOption,
              explanation: normQ.explanation,
              source: 'ai_generated',
              times_shown: 0,
            });
            itemsIngested++;
          }
        }
      } catch (err: any) {
        console.warn(`[Ingestion Error] Failed to process result item:`, err?.message || err);
        itemsFailed++;
      }
    }

    // Persist to Supabase in bulk if not in mock mode
    if (!isMock && supabase) {
      if (bedRowsToInsert.length > 0) {
        const { error: bedError } = await supabase.from('bed_case_bank').insert(bedRowsToInsert);
        if (bedError) {
          throw new Error(`Falha ao inserir em bed_case_bank: ${bedError.message}`);
        }
      }
      if (mcqRowsToInsert.length > 0) {
        const { error: mcqError } = await supabase.from('question_bank').insert(mcqRowsToInsert);
        if (mcqError) {
          throw new Error(`Falha ao inserir em question_bank: ${mcqError.message}`);
        }
      }
    }

    // Compute actual cost from reported usage
    const promptTokens = statusResponse.usage?.prompt_tokens || 0;
    const completionTokens = statusResponse.usage?.completion_tokens || 0;
    const actualCost = calculateBatchCost(promptTokens, completionTokens);

    const { dailyAccumulated, monthlyAccumulated } = await fetchAccumulatedBudget(supabase, 'nightly_generation');
    const updatedDaily = Number((dailyAccumulated + actualCost).toFixed(6));
    const updatedMonthly = Number((monthlyAccumulated + actualCost).toFixed(6));

    console.log(`[Tokens] Prompt: ${promptTokens} | Completion: ${completionTokens}`);
    console.log(`[Cost] Incurred: $${actualCost.toFixed(6)} | Day: $${updatedDaily.toFixed(6)} | Month: $${updatedMonthly.toFixed(6)}`);
    console.log(`[Ingestion Summary] Ingested: ${itemsIngested} | Failed: ${itemsFailed}`);

    const finalStatus = batchProgress === 'failed' && itemsIngested === 0 ? 'failed' : 'completed';

    // Update batch ledger row
    await updateBatchLedgerRecord(
      batchRow.batch_id,
      {
        batch_kind: 'nightly_generation',
        completion_timestamp: new Date().toISOString(),
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cost_usd: actualCost,
        daily_accumulated_usd: updatedDaily,
        monthly_accumulated_usd: updatedMonthly,
        items_ingested: itemsIngested,
        items_failed: itemsFailed,
        status: finalStatus,
      },
      supabase
    );

    if (finalStatus === 'completed') {
      console.log(`✓ Batch ${batchRow.batch_id} finalized and marked completed (${itemsIngested} ingested).`);
      summary.completedBatches += 1;
    } else {
      console.warn(`⚠️ Batch ${batchRow.batch_id} had 0 valid items after salvage check; marked failed.`);
      summary.failedBatches += 1;
    }
  }

  return summary;
}


export async function runSalvageFailedBatches(isMock: boolean = false): Promise<PollAndIngestSummary> {
  const supabase = getSupabaseClient(isMock);
  if (supabase && !isMock) {
    // Re-open any failed nightly_generation batch that had 0 items ingested so runPollAndIngest can inspect & salvage its completed items
    const { data: failedRows } = await supabase
      .from('batch_generation_ledger')
      .select('batch_id, items_ingested, batch_kind')
      .eq('status', 'failed')
      .eq('items_ingested', 0);

    if (Array.isArray(failedRows)) {
      for (const r of failedRows) {
        const bid = String(r.batch_id || '');
        const kind = r.batch_kind === 'plantao_correction' ? 'plantao_correction' : 'nightly_generation';
        if (kind === 'nightly_generation' && bid && !bid.startsWith('batch_mock_') && !bid.startsWith('batch_cap_')) {
          await supabase
            .from('batch_generation_ledger')
            .update({ status: 'submitted' })
            .eq('batch_id', bid);
        }
      }
    }
  }
  return runPollAndIngest(isMock);
}

// ============================================================================
// 7. STATUS & METRICS WORKFLOW (--status)
// ============================================================================

export async function runStatusDisplay(): Promise<void> {
  console.log('\n================================================================================');
  console.log(`▶ [NIGHTLY BATCH PIPELINE] STATUS & BUDGET LEDGER OVERVIEW`);
  console.log('================================================================================\n');

  const supabase = getSupabaseClient(false);
  const {
    dailyAccumulated,
    monthlyAccumulated,
    dailyPendingReserved,
    monthlyPendingReserved,
    dailyTotalWithPendingReserved,
    monthlyTotalWithPendingReserved,
  } = await fetchAccumulatedBudget(supabase, 'nightly_generation');

  const remainingDaily = Math.max(0, DAILY_HARD_CAP_USD - dailyTotalWithPendingReserved);
  const remainingMonthly = Math.max(0, MONTHLY_HARD_CAP_USD - monthlyTotalWithPendingReserved);

  console.log('📊 GOVERNANÇA ORÇAMENTÁRIA (HARD BUDGET CAPS — SOMENTE GERAÇÃO NOTURNA):');
  console.log('--------------------------------------------------------------------------------');
  console.log(`• Teto Diário ($0.15/dia):     Realizado: $${dailyAccumulated.toFixed(6)} | Reserva Pendente: $${dailyPendingReserved.toFixed(6)} | Total: $${dailyTotalWithPendingReserved.toFixed(6)} | Restante: $${remainingDaily.toFixed(6)} (${((dailyTotalWithPendingReserved / DAILY_HARD_CAP_USD) * 100).toFixed(1)}% usado)`);
  console.log(`• Teto Mensal ($0.90/mês):    Realizado: $${monthlyAccumulated.toFixed(6)} | Reserva Pendente: $${monthlyPendingReserved.toFixed(6)} | Total: $${monthlyTotalWithPendingReserved.toFixed(6)} | Restante: $${remainingMonthly.toFixed(6)} (${((monthlyTotalWithPendingReserved / MONTHLY_HARD_CAP_USD) * 100).toFixed(1)}% usado)`);
  console.log(`• Modelo em Lote:             ${BATCH_MODEL} ($0.05 / 1M prompt, $0.25 / 1M completion)`);

  const pending = await listPendingBatchLedgers(supabase, 'nightly_generation');
  console.log(`• Lotes Pendentes em Fila:    ${pending.length}`);

  const latest = await getLatestBatchLedger(supabase, 'nightly_generation');
  if (latest) {
    console.log('\n🕒 ÚLTIMO LOTE DE GERAÇÃO NOTURNA PROCESSADO:');
    console.log('--------------------------------------------------------------------------------');
    console.log(`• Batch ID:                   ${latest.batch_id}`);
    console.log(`• Status:                     ${latest.status}`);
    console.log(`• Submetido em:               ${latest.submission_timestamp}`);
    console.log(`• Concluído em:               ${latest.completion_timestamp || 'Aguardando'}`);
    console.log(`• Custo do Lote:              $${Number(latest.cost_usd).toFixed(6)}`);
    console.log(`• Itens Ingeridos / Falhos:   ${latest.items_ingested} / ${latest.items_failed} (de ${latest.items_requested} solicitados)`);
    console.log(`• Interrupção por Teto:       ${latest.hard_cap_interrupted ? 'SIM (Cap Ativado)' : 'NÃO'}`);
  }

  const candidates = await buildCandidatePrioritizationList(supabase);
  console.log('\n🎯 SATURAÇÃO DO ACERVO DE CAPÍTULOS:');
  console.log('--------------------------------------------------------------------------------');
  console.log(`• Capítulos Não-Saturados:    ${candidates.length} de ${CHAPTERS_DATA.length}`);
  console.log(`• Meta de Saturação por Cap:  6 Leitos (1 classic, 2-3 complex, 4-6 atypical) | 20 MCQs (60/40)`);
  console.log('================================================================================\n');
}

export async function getPendingBatchStatus(isMock: boolean = false): Promise<{
  pendingSubmittedCount: number;
  hasPendingSubmitted: boolean;
  pendingBatchIds: string[];
}> {
  const supabase = getSupabaseClient(isMock);
  const rawPending = await listPendingBatchLedgers(supabase, 'nightly_generation');
  const pending = isMock
    ? rawPending
    : rawPending.filter((b) => !String(b.batch_id || '').startsWith('batch_mock_'));
  return {
    pendingSubmittedCount: pending.length,
    hasPendingSubmitted: pending.length > 0,
    pendingBatchIds: pending.map((row) => row.batch_id),
  };
}

// ============================================================================
// 8. CLI ENTRYPOINT & ARGUMENT PARSER
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Validate flags against allowed flags
  for (const arg of args) {
    if (!ALLOWED_FLAGS.includes(arg)) {
      console.error(`\n❌ Erro: Flag não reconhecida "${arg}"`);
      console.error('Uso syntax:');
      console.error('  npx tsx scripts/nightly-batch-pipeline.ts --submit [--mock]');
      console.error('  npx tsx scripts/nightly-batch-pipeline.ts --poll-and-ingest [--mock]');
      console.error('  npx tsx scripts/nightly-batch-pipeline.ts --status');
      console.error('  npx tsx scripts/nightly-batch-pipeline.ts --pending-status [--json]\n');
      process.exit(1);
    }
  }

  const isMock = args.includes('--mock');
  const isJson = args.includes('--json');
  const isSubmit = args.includes('--submit');
  const isPoll = args.includes('--poll-and-ingest');
  const isSalvage = args.includes('--salvage');
  const isStatus = args.includes('--status');
  const isPendingStatus = args.includes('--pending-status');

  if (!isSubmit && !isPoll && !isSalvage && !isStatus && !isPendingStatus) {
    console.log('EmergeMed Nightly Batch Pipeline CLI');
    console.log('Uso:');
    console.log('  npx tsx scripts/nightly-batch-pipeline.ts --submit [--mock]');
    console.log('  npx tsx scripts/nightly-batch-pipeline.ts --poll-and-ingest [--mock]');
    console.log('  npx tsx scripts/nightly-batch-pipeline.ts --status');
    console.log('  npx tsx scripts/nightly-batch-pipeline.ts --pending-status [--json]');
    process.exit(0);
  }

  if (isPendingStatus) {
    const pendingStatus = await getPendingBatchStatus(isMock);
    if (isJson) {
      process.stdout.write(`${JSON.stringify(pendingStatus)}\n`);
    } else {
      console.log(`Pending submitted batches: ${pendingStatus.pendingSubmittedCount}`);
      if (pendingStatus.hasPendingSubmitted) {
        console.log(`Batch IDs: ${pendingStatus.pendingBatchIds.join(', ')}`);
      }
    }
    return;
  }

  if (isStatus) {
    await runStatusDisplay();
    return;
  }

  // Check OpenRouter API key if running in live mode
  if (!isMock && (isSubmit || isPoll || isSalvage)) {
    if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_API_KEY.trim()) {
      console.error('❌ Erro: Variável OPENROUTER_API_KEY não encontrada no ambiente (.env.local).');
      console.error('   Para testes locais ou simulação sem custos, use a flag --mock.');
      process.exit(1);
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL.trim()) {
      console.error('❌ Erro: Variável NEXT_PUBLIC_SUPABASE_URL não encontrada no ambiente (.env.local).');
      process.exit(1);
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY.trim()) {
      console.error('❌ Erro: Variável SUPABASE_SERVICE_ROLE_KEY não encontrada no ambiente (.env.local).');
      console.error('   O pipeline noturno requer service role key para gravações no ledger/bancos.');
      process.exit(1);
    }
  }

  // Acquire lock to avoid concurrency issues
  if (!acquireLock()) {
    console.error('❌ Erro: Pipeline em execução. Lock ativo (.nightly-batch.lock).');
    process.exit(1);
  }

  try {
    if (isSubmit) {
      await runBatchSubmission(isMock);
    }
    if (isSalvage) {
      const summary = await runSalvageFailedBatches(isMock);
      if (isJson) {
        process.stdout.write(`${JSON.stringify(summary)}\n`);
      }
    }
    if (isPoll) {
      const summary = await runPollAndIngest(isMock);
      if (isJson) {
        process.stdout.write(`${JSON.stringify(summary)}\n`);
      }
    }
  } finally {
    releaseLock();
  }

  process.exitCode = 0;
}

// Only run main if executed directly via CLI
if (process.argv[1] && process.argv[1].endsWith('nightly-batch-pipeline.ts')) {
  main().catch((err) => {
    releaseLock();
    console.error('\n❌ Fatal error in nightly batch pipeline:', err);
    process.exit(1);
  });
}