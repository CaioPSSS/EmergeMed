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
import { parseJsonFromMarkdown } from '../lib/ai/openrouter';
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
const ALLOWED_FLAGS = ['--submit', '--poll-and-ingest', '--status', '--mock'];

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

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
// 4. INGESTION VALIDATION (ANTI-SPOILER, 2-STAGE, 5-OPTION MCQ, MOJIBAKE)
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

export function validateBedCase(parsed: any, chapterTitle: string): { isValid: boolean; error?: string } {
  if (!parsed || typeof parsed !== 'object') {
    return { isValid: false, error: 'Bed case payload is not an object' };
  }

  const stage1 = parsed.stage1;
  const stage2 = parsed.stage2;

  if (!stage1 || !stage2) {
    return { isValid: false, error: 'Missing stage1 or stage2' };
  }

  // Stage 1 validation: prescription_immediate + vitals + patient_weight
  if (stage1.type !== 'prescription_immediate') {
    return { isValid: false, error: 'Stage 1 must have type prescription_immediate' };
  }

  const weight = stage1.patient_weight || stage1.patientWeight;
  if (typeof weight !== 'number' || weight <= 0) {
    return { isValid: false, error: 'Stage 1 must include valid patient_weight > 0' };
  }

  const vitals = stage1.vital_signs || stage1.vitalSigns;
  if (!vitals || typeof vitals !== 'object') {
    return { isValid: false, error: 'Stage 1 must include vital_signs' };
  }

  // Anti-spoiler check on Stage 1 vignette
  const antiSpoiler = verifyAntiSpoiler(stage1.vignette, chapterTitle);
  if (!antiSpoiler.isClean) {
    return { isValid: false, error: `Vignette contains forbidden diagnosis: ${antiSpoiler.matched.join(', ')}` };
  }

  // Stage 2 validation: prescription_complete or ventilator + evolution
  if (stage2.type !== 'prescription_complete' && stage2.type !== 'ventilator') {
    return { isValid: false, error: 'Stage 2 must have type prescription_complete or ventilator' };
  }

  if (!stage2.evolution || typeof stage2.evolution !== 'string' || stage2.evolution.trim().length < 10) {
    return { isValid: false, error: 'Stage 2 must include non-empty evolution' };
  }

  return { isValid: true };
}

export function validateMCQ(q: any): { isValid: boolean; error?: string } {
  if (!q || typeof q !== 'object') {
    return { isValid: false, error: 'MCQ payload is not an object' };
  }

  if (!Array.isArray(q.options) || q.options.length !== 5) {
    return { isValid: false, error: 'MCQ must contain exactly 5 options' };
  }

  // Check unique option strings (no duplicate distractors)
  const uniqueOptions = new Set(q.options.map((opt: any) => String(opt).trim()));
  if (uniqueOptions.size !== 5) {
    return { isValid: false, error: 'MCQ has duplicate option strings' };
  }

  if (typeof q.correct_option !== 'number' || q.correct_option < 0 || q.correct_option > 4) {
    return { isValid: false, error: 'correct_option must be an integer index between 0 and 4' };
  }

  if (!q.vignette || typeof q.vignette !== 'string' || q.vignette.trim().length < 15) {
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

  const supabase = getSupabaseClient();

  // 1. Budget hard cap check before doing any work
  const { dailyAccumulated, monthlyAccumulated } = await fetchAccumulatedBudget(supabase);
  console.log(`[Budget] Current Daily Accumulated:   $${dailyAccumulated.toFixed(6)} / $${DAILY_HARD_CAP_USD.toFixed(2)}`);
  console.log(`[Budget] Current Monthly Accumulated: $${monthlyAccumulated.toFixed(6)} / $${MONTHLY_HARD_CAP_USD.toFixed(2)}`);

  if (dailyAccumulated >= DAILY_HARD_CAP_USD || monthlyAccumulated >= MONTHLY_HARD_CAP_USD) {
    console.warn(`\n⚠️  [HARD BUDGET CAP HALT] Budget ceiling reached!`);
    console.warn(`   Daily: $${dailyAccumulated.toFixed(4)} >= $${DAILY_HARD_CAP_USD.toFixed(2)} OR Monthly: $${monthlyAccumulated.toFixed(4)} >= $${MONTHLY_HARD_CAP_USD.toFixed(2)}`);
    console.warn(`   Execution halted automatically. Flagging hard_cap_interrupted = true in ledger.`);

    await insertBatchLedgerRecord(
      {
        batch_id: `batch_cap_${Date.now()}`,
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

  // 3. Construct batch requests (limit batch size to respect remaining daily & monthly caps)
  const remainingDaily = DAILY_HARD_CAP_USD - dailyAccumulated;
  const remainingMonthly = MONTHLY_HARD_CAP_USD - monthlyAccumulated;
  const maxSpendAllowed = Math.min(remainingDaily, remainingMonthly);

  const requests: BatchRequestItem[] = [];
  let projectedCost = 0;

  for (const candidate of candidates) {
    // Generate bed cases needed
    for (let i = 0; i < candidate.bedsNeeded; i++) {
      const caseIdx = candidate.currentBeds + i + 1;
      const complexity = caseIdx <= 2 ? 'classic' : caseIdx <= 4 ? 'complex' : 'atypical';
      const estimatedCost = calculateBatchCost(1500, 1000);

      if (projectedCost + estimatedCost > maxSpendAllowed) {
        break;
      }

      requests.push({
        custom_id: JSON.stringify({
          type: 'bed_case',
          chapterId: candidate.chapterId,
          chapterTitle: candidate.chapterTitle,
          caseIdx,
          complexity,
        }),
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: BATCH_MODEL,
          messages: [
            {
              role: 'system',
              content: `Você é um preceptor sênior em medicina de emergência na UPA. Gere um caso clínico contínuo em 2 etapas para o capítulo "${candidate.chapterTitle}" com complexidade "${complexity}". NUNCA declare o diagnóstico explícito na vinheta. Inclua sinais vitais e peso do paciente (kg). Etapa 1: prescription_immediate. Etapa 2: prescription_complete ou ventilator. Retorne JSON válido com { stage1, stage2 }.`,
            },
            {
              role: 'user',
              content: `Gerar caso clínico do leito com complexidade ${complexity}.`,
            },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        },
      });

      projectedCost += estimatedCost;
    }

    // Generate MCQs needed
    if (candidate.mcqsNeeded > 0) {
      const count = Math.min(candidate.mcqsNeeded, 10);
      const estimatedCost = calculateBatchCost(1200, 1500);

      if (projectedCost + estimatedCost <= maxSpendAllowed) {
        requests.push({
          custom_id: JSON.stringify({
            type: 'mcqs',
            chapterId: candidate.chapterId,
            chapterTitle: candidate.chapterTitle,
            count,
          }),
          method: 'POST',
          url: '/v1/chat/completions',
          body: {
            model: BATCH_MODEL,
            messages: [
              {
                role: 'system',
                content: `Gere ${count} questões de múltipla escolha para o capítulo "${candidate.chapterTitle}". Mix: 60% standard e 40% advanced. Cada questão com exatamente 5 alternativas sem letras A-E, correct_option 0-4 e explicação detalhada. Retorne JSON válido com { questions: [...] }.`,
              },
              {
                role: 'user',
                content: `Gerar ${count} MCQs.`,
              },
            ],
            temperature: 0.2,
            response_format: { type: 'json_object' },
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

  console.log(`[Batch] Prepared ${requests.length} requests across ${candidates.length} candidate chapters.`);
  console.log(`[Budget] Projected Batch Cost: $${projectedCost.toFixed(6)} (Limit: $${maxSpendAllowed.toFixed(6)})`);

  // 4. Submit batch to OpenRouter
  console.log('[API] Submitting batch to OpenRouter Batch API...');
  const submission = await submitOpenRouterBatch(requests, process.env.OPENROUTER_API_KEY, isMock);
  console.log(`✓ Batch Submitted Successfully! Batch ID: ${submission.id} (Status: ${submission.status})`);

  // 5. Persist submission in batch_generation_ledger
  await insertBatchLedgerRecord(
    {
      batch_id: submission.id,
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
    const mockStorage = path.join(process.cwd(), '.agents', `mock_batch_${submission.id}.json`);
    fs.writeFileSync(mockStorage, JSON.stringify(requests), 'utf8');
  }

  console.log('✓ Submission logged to public.batch_generation_ledger.\n');
}

// ============================================================================
// 6. BATCH POLLING & INGESTION WORKFLOW (--poll-and-ingest)
// ============================================================================

export async function runPollAndIngest(isMock: boolean = false): Promise<void> {
  console.log('\n================================================================================');
  console.log(`▶ [NIGHTLY BATCH PIPELINE] POLL & INGEST RUN — ${new Date().toISOString()}`);
  console.log(`  Mode: ${isMock ? 'MOCK (Offline Simulation)' : 'LIVE (OpenRouter Batch API)'}`);
  console.log('================================================================================\n');

  const supabase = getSupabaseClient();
  const pendingBatches = await listPendingBatchLedgers(supabase);

  if (pendingBatches.length === 0) {
    console.log('✓ No pending submitted batches found in ledger.');
    return;
  }

  console.log(`[Queue] Found ${pendingBatches.length} pending batches awaiting ingestion.`);

  for (const batchRow of pendingBatches) {
    console.log(`\n--- Processing Batch ${batchRow.batch_id} ---`);

    let mockRequests: BatchRequestItem[] = [];
    if (isMock) {
      const mockStorage = path.join(process.cwd(), '.agents', `mock_batch_${batchRow.batch_id}.json`);
      if (fs.existsSync(mockStorage)) {
        mockRequests = JSON.parse(fs.readFileSync(mockStorage, 'utf8'));
      }
    }

    const statusResponse = await getOpenRouterBatchStatus(
      batchRow.batch_id,
      process.env.OPENROUTER_API_KEY,
      isMock,
      mockRequests
    );

    console.log(`[Status] Batch State: ${statusResponse.status}`);

    if (statusResponse.status !== 'completed') {
      console.log(`[Status] Batch still in progress. Skipping ingestion for now.`);
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

        if (customData.type === 'bed_case') {
          const validation = validateBedCase(parsed, customData.chapterTitle);
          if (!validation.isValid) {
            console.warn(`[Reject] Bed Case rejected: ${validation.error}`);
            itemsFailed++;
            continue;
          }

          bedRowsToInsert.push({
            chapter_id: customData.chapterId,
            chapter_title: customData.chapterTitle,
            complexity_level: customData.complexity,
            questions: [
              {
                id: 1,
                type: 'prescription_immediate',
                vignette: parsed.stage1.vignette,
                patient_weight: parsed.stage1.patient_weight || parsed.stage1.patientWeight,
                vital_signs: parsed.stage1.vital_signs || parsed.stage1.vitalSigns,
                promptText: parsed.stage1.conduct_prompt || 'Prescreva a conduta imediata.',
              },
              {
                id: 2,
                type: parsed.stage2.type,
                vignette: parsed.stage2.evolution,
                promptText: parsed.stage2.conduct_prompt || 'Prescreva a conduta de manutenção.',
              },
            ],
            times_used: 0,
          });
          itemsIngested++;
        } else if (customData.type === 'mcqs') {
          const qs = Array.isArray(parsed.questions) ? parsed.questions : [parsed];
          for (const q of qs) {
            const validation = validateMCQ(q);
            if (!validation.isValid) {
              console.warn(`[Reject] MCQ rejected: ${validation.error}`);
              itemsFailed++;
              continue;
            }

            mcqRowsToInsert.push({
              chapter_id: customData.chapterId,
              question_type: 'multiple_choice',
              difficulty_tier: q.difficulty_tier || 'standard',
              question_subformat: q.question_subformat || 'case_conduct',
              vignette: q.vignette,
              options: q.options,
              correct_option: q.correct_option,
              explanation: q.explanation,
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
        await supabase.from('bed_case_bank').insert(bedRowsToInsert);
      }
      if (mcqRowsToInsert.length > 0) {
        await supabase.from('question_bank').insert(mcqRowsToInsert);
      }
    }

    // Compute actual cost from reported usage
    const promptTokens = statusResponse.usage?.prompt_tokens || 0;
    const completionTokens = statusResponse.usage?.completion_tokens || 0;
    const actualCost = calculateBatchCost(promptTokens, completionTokens);

    const { dailyAccumulated, monthlyAccumulated } = await fetchAccumulatedBudget(supabase);
    const updatedDaily = Number((dailyAccumulated + actualCost).toFixed(6));
    const updatedMonthly = Number((monthlyAccumulated + actualCost).toFixed(6));

    console.log(`[Tokens] Prompt: ${promptTokens} | Completion: ${completionTokens}`);
    console.log(`[Cost] Incurred: $${actualCost.toFixed(6)} | Day: $${updatedDaily.toFixed(6)} | Month: $${updatedMonthly.toFixed(6)}`);
    console.log(`[Ingestion Summary] Ingested: ${itemsIngested} | Failed: ${itemsFailed}`);

    // Update batch ledger row
    await updateBatchLedgerRecord(
      batchRow.batch_id,
      {
        completion_timestamp: new Date().toISOString(),
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cost_usd: actualCost,
        daily_accumulated_usd: updatedDaily,
        monthly_accumulated_usd: updatedMonthly,
        items_ingested: itemsIngested,
        items_failed: itemsFailed,
        status: 'completed',
      },
      supabase
    );

    console.log(`✓ Batch ${batchRow.batch_id} finalized and marked completed.`);
  }
}

// ============================================================================
// 7. STATUS & METRICS WORKFLOW (--status)
// ============================================================================

export async function runStatusDisplay(): Promise<void> {
  console.log('\n================================================================================');
  console.log(`▶ [NIGHTLY BATCH PIPELINE] STATUS & BUDGET LEDGER OVERVIEW`);
  console.log('================================================================================\n');

  const supabase = getSupabaseClient();
  const { dailyAccumulated, monthlyAccumulated } = await fetchAccumulatedBudget(supabase);

  const remainingDaily = Math.max(0, DAILY_HARD_CAP_USD - dailyAccumulated);
  const remainingMonthly = Math.max(0, MONTHLY_HARD_CAP_USD - monthlyAccumulated);

  console.log('📊 GOVERNANÇA ORÇAMENTÁRIA (HARD BUDGET CAPS):');
  console.log('--------------------------------------------------------------------------------');
  console.log(`• Teto Diário ($0.15/dia):     Gasto: $${dailyAccumulated.toFixed(6)} | Restante: $${remainingDaily.toFixed(6)} (${((dailyAccumulated / DAILY_HARD_CAP_USD) * 100).toFixed(1)}% usado)`);
  console.log(`• Teto Mensal ($0.90/mês):    Gasto: $${monthlyAccumulated.toFixed(6)} | Restante: $${remainingMonthly.toFixed(6)} (${((monthlyAccumulated / MONTHLY_HARD_CAP_USD) * 100).toFixed(1)}% usado)`);
  console.log(`• Modelo em Lote:             ${BATCH_MODEL} ($0.05 / 1M prompt, $0.25 / 1M completion)`);

  const pending = await listPendingBatchLedgers(supabase);
  console.log(`• Lotes Pendentes em Fila:    ${pending.length}`);

  const latest = await getLatestBatchLedger(supabase);
  if (latest) {
    console.log('\n🕒 ÚLTIMO LOTE PROCESSADO:');
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
  console.log(`• Meta de Saturação por Cap:  6 Leitos (1-2 classic, 3-4 complex, 5-6 atypical) | 20 MCQs (60/40)`);
  console.log('================================================================================\n');
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
      console.error('  npx tsx scripts/nightly-batch-pipeline.ts --status\n');
      process.exit(1);
    }
  }

  const isMock = args.includes('--mock');
  const isSubmit = args.includes('--submit');
  const isPoll = args.includes('--poll-and-ingest');
  const isStatus = args.includes('--status');

  if (!isSubmit && !isPoll && !isStatus) {
    console.log('EmergeMed Nightly Batch Pipeline CLI');
    console.log('Uso:');
    console.log('  npx tsx scripts/nightly-batch-pipeline.ts --submit [--mock]');
    console.log('  npx tsx scripts/nightly-batch-pipeline.ts --poll-and-ingest [--mock]');
    console.log('  npx tsx scripts/nightly-batch-pipeline.ts --status');
    process.exit(0);
  }

  if (isStatus) {
    await runStatusDisplay();
    return;
  }

  // Check OpenRouter API key if running in live mode
  if (!isMock && (isSubmit || isPoll)) {
    if (!process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_API_KEY.trim()) {
      console.error('❌ Erro: Variável OPENROUTER_API_KEY não encontrada no ambiente (.env.local).');
      console.error('   Para testes locais ou simulação sem custos, use a flag --mock.');
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
    if (isPoll) {
      await runPollAndIngest(isMock);
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
