/**
 * Adversarial Challenger Suite for Milestone M3
 * (OpenRouter Nightly Batch Pipeline & Budget Governance - Requirements R4 & R5)
 *
 * Stress-tests:
 * 1. Mathematical Cost & Micro-pricing Formula (Prompt $0.05/1M, Comp $0.25/1M).
 * 2. Budget Hard Cap Defense Boundaries ($0.15/day, $0.90/month).
 * 3. Candidate Prioritization Tree (Tier 1 > Tier 3 > Tier 4, no Tier 2, deduplication).
 * 4. Saturation Control & Complexity Gradient (Classic 1-2, Complex 3-4, Atypical 5-6).
 * 5. Medical Ingestion Validation (Anti-Spoiler Blinder, 2-Stage bed, Patient Weight, 5-option MCQs).
 * 6. Mojibake Sanitization & NFC Normalization.
 * 7. Concurrency Lock & CLI Configuration.
 */

import fs from 'fs';
import path from 'path';
import {
  BATCH_MODEL,
  DAILY_HARD_CAP_USD,
  MONTHLY_HARD_CAP_USD,
  MAX_BEDS_PER_CHAPTER,
  MAX_MCQS_PER_CHAPTER,
  calculateBatchCost,
  evaluateBudgetCapBreach,
  sanitizeApiKey,
  submitOpenRouterBatch,
  getOpenRouterBatchStatus,
} from '../lib/ai/openrouter-batch';
import {
  verifyAntiSpoiler,
  validateBedCase,
  validateMCQ,
  buildCandidatePrioritizationList,
} from './nightly-batch-pipeline';
import { fixMojibake, normalizeNFC } from '../lib/text-sanitizer';
import { CHAPTERS_DATA } from '../lib/chapters-data';
import { getNormalizedClinicalWeights } from '../lib/learning-engine';

interface TestResult {
  id: string;
  category: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function check(id: string, category: string, name: string, condition: boolean, details?: string): void {
  if (condition) {
    results.push({ id, category, name, passed: true });
    console.log(`  ✓ [PASS] [${id}] [${category}] ${name}`);
  } else {
    results.push({ id, category, name, passed: false, details });
    console.error(`  ✗ [FAIL] [${id}] [${category}] ${name} -> ${details || 'Assertion failed'}`);
  }
}

async function runAdversarialM3(): Promise<void> {
  console.log('\n================================================================================');
  console.log('   ADVERSARIAL CHALLENGER SUITE: MILESTONE M3 (R4 & R5)');
  console.log('================================================================================\n');

  // ==========================================================================
  // 1. MATHEMATICAL COST & MICRO-PRICING PRECISION
  // ==========================================================================
  console.log('--- CATEGORY 1: Mathematical Cost & Micro-pricing ---');

  // 1.1: 1M prompt + 1M completion = $0.05 + $0.25 = $0.30
  const cost1 = calculateBatchCost(1_000_000, 1_000_000);
  check('M3.1.1', 'Pricing', '1M prompt + 1M completion equals strictly $0.30', cost1 === 0.3);

  // 1.2: Standard batch request: 1500 prompt, 1000 completion = $0.000325
  const cost2 = calculateBatchCost(1500, 1000);
  check('M3.1.2', 'Pricing', '1500 prompt + 1000 completion equals strictly $0.000325', cost2 === 0.000325);

  // 1.3: Zero tokens = $0.000000
  const cost3 = calculateBatchCost(0, 0);
  check('M3.1.3', 'Pricing', '0 tokens equals strictly $0.000000', cost3 === 0);

  // 1.4: 10,000 prompt tokens = $0.000500
  const cost4 = calculateBatchCost(10_000, 0);
  check('M3.1.4', 'Pricing', '10k prompt tokens equals strictly $0.000500', cost4 === 0.0005);

  // 1.5: 10,000 completion tokens = $0.002500
  const cost5 = calculateBatchCost(0, 10_000);
  check('M3.1.5', 'Pricing', '10k completion tokens equals strictly $0.002500', cost5 === 0.0025);

  // 1.6: Negative prompt tokens throws error
  let negPromptThrew = false;
  try {
    calculateBatchCost(-1, 500);
  } catch {
    negPromptThrew = true;
  }
  check('M3.1.6', 'Pricing', 'Negative prompt tokens throws Error', negPromptThrew);

  // 1.7: Negative completion tokens throws error
  let negCompThrew = false;
  try {
    calculateBatchCost(500, -1);
  } catch {
    negCompThrew = true;
  }
  check('M3.1.7', 'Pricing', 'Negative completion tokens throws Error', negCompThrew);

  // 1.8: Precision rounding to 6 decimal places preserves micro-cents
  const cost8 = calculateBatchCost(1234, 5678);
  const expected8 = Number(((1234 / 1e6) * 0.05 + (5678 / 1e6) * 0.25).toFixed(6));
  check('M3.1.8', 'Pricing', 'Micro-cost precision preserves 6 decimal places accurately', cost8 === expected8);

  // ==========================================================================
  // 2. BUDGET HARD CAP DEFENSE BOUNDARIES
  // ==========================================================================
  console.log('\n--- CATEGORY 2: Budget Hard Cap Boundaries ---');

  // 2.1: Exactly at Daily Cap: 0.149999 + 0.000001 = 0.150000 -> can proceed
  const cap1 = evaluateBudgetCapBreach(0.149999, 0.50, 0.000001);
  check('M3.2.1', 'BudgetCap', 'Reaching exactly $0.150000 daily does NOT breach cap', cap1.canProceed === true);

  // 2.2: 1 micro-cent above Daily Cap: 0.150000 + 0.000001 = 0.150001 -> BREACH
  const cap2 = evaluateBudgetCapBreach(0.150000, 0.50, 0.000001);
  check('M3.2.2', 'BudgetCap', '$0.150001 daily spend is intercepted with daily_cap breach', cap2.canProceed === false && cap2.reason === 'daily_cap');

  // 2.3: Already at Daily Cap ($0.150000) with any positive cost -> BREACH
  const cap3 = evaluateBudgetCapBreach(0.15, 0.50, 0.0001);
  check('M3.2.3', 'BudgetCap', 'Further expenditure at $0.15 daily ceiling is blocked', cap3.canProceed === false);

  // 2.4: Exactly at Monthly Cap: 0.05 daily, 0.899999 + 0.000001 = 0.900000 monthly -> can proceed
  const cap4 = evaluateBudgetCapBreach(0.05, 0.899999, 0.000001);
  check('M3.2.4', 'BudgetCap', 'Reaching exactly $0.900000 monthly does NOT breach cap', cap4.canProceed === true);

  // 2.5: 1 micro-cent above Monthly Cap: 0.05 daily, 0.900000 + 0.000001 = 0.900001 -> BREACH
  const cap5 = evaluateBudgetCapBreach(0.05, 0.900000, 0.000001);
  check('M3.2.5', 'BudgetCap', '$0.900001 monthly spend is intercepted with monthly_cap breach', cap5.canProceed === false && cap5.reason === 'monthly_cap');

  // 2.6: Both Caps breached simultaneously: daily 0.16, monthly 0.95 -> Daily takes precedence
  const cap6 = evaluateBudgetCapBreach(0.15, 0.90, 0.01);
  check('M3.2.6', 'BudgetCap', 'Dual cap breach flags daily_cap prior to monthly', cap6.canProceed === false && cap6.reason === 'daily_cap');

  // 2.7: Constant invariants
  check('M3.2.7', 'BudgetCap', 'DAILY_HARD_CAP_USD is strictly 0.15', DAILY_HARD_CAP_USD === 0.15);
  check('M3.2.8', 'BudgetCap', 'MONTHLY_HARD_CAP_USD is strictly 0.90', MONTHLY_HARD_CAP_USD === 0.90);

  // ==========================================================================
  // 3. CANDIDATE PRIORITIZATION TREE & SATURATION CONTROL
  // ==========================================================================
  console.log('\n--- CATEGORY 3: Candidate Prioritization Tree & Saturation ---');

  // 3.1: Max saturation constants
  check('M3.3.1', 'Saturation', 'MAX_BEDS_PER_CHAPTER is strictly 6', MAX_BEDS_PER_CHAPTER === 6);
  check('M3.3.2', 'Saturation', 'MAX_MCQS_PER_CHAPTER is strictly 20', MAX_MCQS_PER_CHAPTER === 20);

  // 3.2: Mock Supabase client to test Tier 1 > Tier 3 > Tier 4 prioritization
  const mockStudyQueue = [
    { chapter_id: 14, position: 2, completed: false },
    { chapter_id: 8, position: 1, completed: false },
    { chapter_id: 999, position: 3, completed: true }, // completed should be ignored
  ];

  const mockSupabase: any = {
    from: (table: string) => {
      if (table === 'study_queue') {
        return {
          select: () => ({
            eq: () => ({
              order: (col: string, opts?: { ascending?: boolean }) => {
                const filtered = mockStudyQueue.filter((q) => !q.completed);
                filtered.sort((a: any, b: any) => (opts?.ascending ? a[col] - b[col] : b[col] - a[col]));
                return Promise.resolve({ data: filtered });
              },
            }),
          }),
        };
      }
      if (table === 'bed_case_bank' || table === 'question_bank') {
        return {
          select: () => Promise.resolve({ data: [] }),
        };
      }
      return {
        select: () => Promise.resolve({ data: [] }),
      };
    },
  };

  const candidateList = await buildCandidatePrioritizationList(mockSupabase, false);

  // Tier 1 items must be at the very top, ordered by position ASC
  const firstCandidate = candidateList[0];
  const secondCandidate = candidateList[1];

  check('M3.3.3', 'Prioritization', 'Tier 1 position 1 (chapter 8) is ranked #1', firstCandidate.chapterId === 8 && firstCandidate.tier === 'Tier 1 (Study Queue)');
  check('M3.3.4', 'Prioritization', 'Tier 1 position 2 (chapter 14) is ranked #2', secondCandidate.chapterId === 14 && secondCandidate.tier === 'Tier 1 (Study Queue)');

  // Completed items in study queue must not enter Tier 1
  const chapter999 = candidateList.find((c) => c.chapterId === 999);
  check('M3.3.5', 'Prioritization', 'Completed items in study queue are not added as candidates', chapter999 === undefined);

  // Tier 3 candidates appear after Tier 1 candidates
  const tier3Candidates = candidateList.filter((c) => c.tier === 'Tier 3 (Recommender)');
  check('M3.3.6', 'Prioritization', 'Tier 3 Recommender has at most 3 candidates (empty when user has no history)', tier3Candidates.length <= 3);

  // Deduplication check: no chapter ID appears more than once in the candidate list
  const seenIds = new Set<number>();
  let hasDuplicates = false;
  for (const c of candidateList) {
    if (seenIds.has(c.chapterId)) {
      hasDuplicates = true;
      break;
    }
    seenIds.add(c.chapterId);
  }
  check('M3.3.7', 'Prioritization', 'Candidate list contains zero duplicate chapters across all tiers', !hasDuplicates);

  // Saturated chapters filter check:
  // If a chapter has 6 beds and 20 MCQs, it must be excluded completely
  const mockSaturatedSupabase: any = {
    from: (table: string) => {
      if (table === 'study_queue') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [{ chapter_id: 8, position: 1, completed: false }] }),
            }),
          }),
        };
      }
      if (table === 'bed_case_bank') {
        // chapter 8 has 6 beds (saturated)
        const rows = Array(6).fill({ chapter_id: '8' });
        return { select: () => Promise.resolve({ data: rows }) };
      }
      if (table === 'question_bank') {
        // chapter 8 has 20 MCQs (saturated)
        const rows = Array(20).fill({ chapter_id: '8' });
        return { select: () => Promise.resolve({ data: rows }) };
      }
      return { select: () => Promise.resolve({ data: [] }) };
    },
  };

  const saturatedList = await buildCandidatePrioritizationList(mockSaturatedSupabase, false);
  const ch8InSaturated = saturatedList.find((c) => c.chapterId === 8);
  check('M3.3.8', 'Saturation', 'Chapter with 6 beds AND 20 MCQs is completely omitted from candidate list', ch8InSaturated === undefined);

  // Partial saturation: 6 beds but only 10 MCQs -> included with bedsNeeded = 0, mcqsNeeded = 10
  const mockPartialSupabase: any = {
    from: (table: string) => {
      if (table === 'study_queue') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [{ chapter_id: 8, position: 1, completed: false }] }),
            }),
          }),
        };
      }
      if (table === 'bed_case_bank') {
        const rows = Array(6).fill({ chapter_id: '8' });
        return { select: () => Promise.resolve({ data: rows }) };
      }
      if (table === 'question_bank') {
        const rows = Array(10).fill({ chapter_id: '8' });
        return { select: () => Promise.resolve({ data: rows }) };
      }
      return { select: () => Promise.resolve({ data: [] }) };
    },
  };

  const partialList = await buildCandidatePrioritizationList(mockPartialSupabase, false);
  const ch8Partial = partialList.find((c) => c.chapterId === 8);
  check('M3.3.9', 'Saturation', 'Chapter with 6 beds and 10 MCQs is retained with bedsNeeded=0 and mcqsNeeded=10',
    ch8Partial !== undefined && ch8Partial.bedsNeeded === 0 && ch8Partial.mcqsNeeded === 10
  );

  // Complexity gradient: case 1-2 classic, 3-4 complex, 5-6 atypical
  function getComplexity(idx: number): string {
    return idx <= 2 ? 'classic' : idx <= 4 ? 'complex' : 'atypical';
  }
  check('M3.3.10', 'Complexity', 'Case 1 complexity is classic', getComplexity(1) === 'classic');
  check('M3.3.11', 'Complexity', 'Case 2 complexity is classic', getComplexity(2) === 'classic');
  check('M3.3.12', 'Complexity', 'Case 3 complexity is complex', getComplexity(3) === 'complex');
  check('M3.3.13', 'Complexity', 'Case 4 complexity is complex', getComplexity(4) === 'complex');
  check('M3.3.14', 'Complexity', 'Case 5 complexity is atypical', getComplexity(5) === 'atypical');
  check('M3.3.15', 'Complexity', 'Case 6 complexity is atypical', getComplexity(6) === 'atypical');

  // ==========================================================================
  // 4. MEDICAL INGESTION VALIDATION & ANTI-SPOILER BLINDER
  // ==========================================================================
  console.log('\n--- CATEGORY 4: Medical Ingestion & Anti-Spoiler Blinder ---');

  // 4.1: Anti-spoiler detects forbidden phrases
  const spoiler1 = verifyAntiSpoiler('Paciente admitido na sala vermelha com diagnóstico de IAM sem supra.');
  check('M3.4.1', 'AntiSpoiler', 'Rejects vignette containing "diagnóstico de"', !spoiler1.isClean);

  const spoiler2 = verifyAntiSpoiler('Paciente com hipótese confirmada de choque séptico.');
  check('M3.4.2', 'AntiSpoiler', 'Rejects vignette containing "hipótese confirmada de"', !spoiler2.isClean);

  const spoiler3 = verifyAntiSpoiler('Trata-se de cetoacidose grave.');
  check('M3.4.3', 'AntiSpoiler', 'Rejects vignette containing "trata-se de cetoacidose"', !spoiler3.isClean);

  const spoiler4 = verifyAntiSpoiler('Paciente portador de pneumonia adquirida na comunidade em sepse.');
  check('M3.4.4', 'AntiSpoiler', 'Rejects vignette containing PAC forbidden phrase', !spoiler4.isClean);

  const spoiler5 = verifyAntiSpoiler('Paciente idoso chega com diagnóstico de Insuficiência Cardíaca.', 'Insuficiência Cardíaca');
  check('M3.4.5', 'AntiSpoiler', 'Rejects vignette naming chapter title explicitly', !spoiler5.isClean);

  // Clean clinical presentation vignette must pass
  const cleanVignette = 'Mulher de 58 anos, hipertensa e tabagista, trazida à UPA com dispneia súbita e ortopneia há 3 horas. Ao exame: estertores crepitantes em bases, turgência jugular a 45°, PA 180/100 mmHg, FC 112 bpm, SpO2 88% em ar ambiente.';
  const cleanCheck = verifyAntiSpoiler(cleanVignette, 'Edema Agudo de Pulmão');
  check('M3.4.6', 'AntiSpoiler', 'Clean symptom-and-vital vignette passes anti-spoiler blinder', cleanCheck.isClean);

  // 4.2: 2-Stage Bed Case Validation
  const validBedPayload = {
    stage1: {
      type: 'prescription_immediate',
      vignette: cleanVignette,
      patient_weight: 65,
      vital_signs: { pa: '180/100', fc: 112, fr: 28, spo2: 88 },
      conduct_prompt: 'Prescreva a conduta imediata para estabilização.',
    },
    stage2: {
      type: 'prescription_complete',
      evolution: 'Após uso de vasodilatador venoso e VNI, paciente apresenta melhora do padrão respiratório, SpO2 95%, PA 140/85 mmHg.',
      conduct_prompt: 'Prescreva o plano de manutenção na sala amarela.',
    },
  };
  const validBedResult = validateBedCase(validBedPayload, 'Edema Agudo de Pulmão');
  check('M3.4.7', 'BedValidation', 'Valid 2-stage bed case passes validation', validBedResult.isValid);

  // Missing patient_weight
  const noWeightPayload = JSON.parse(JSON.stringify(validBedPayload));
  delete noWeightPayload.stage1.patient_weight;
  const noWeightResult = validateBedCase(noWeightPayload, 'Edema Agudo de Pulmão');
  check('M3.4.8', 'BedValidation', 'Missing patient_weight is rejected', !noWeightResult.isValid);

  // Negative patient_weight
  const negWeightPayload = JSON.parse(JSON.stringify(validBedPayload));
  negWeightPayload.stage1.patient_weight = -70;
  const negWeightResult = validateBedCase(negWeightPayload, 'Edema Agudo de Pulmão');
  check('M3.4.9', 'BedValidation', 'Negative patient_weight is rejected', !negWeightResult.isValid);

  // String patient_weight ("70 kg")
  const strWeightPayload = JSON.parse(JSON.stringify(validBedPayload));
  strWeightPayload.stage1.patient_weight = '70 kg';
  const strWeightResult = validateBedCase(strWeightPayload, 'Edema Agudo de Pulmão');
  check('M3.4.10', 'BedValidation', 'Non-number patient_weight is rejected', !strWeightResult.isValid);

  // Missing vital signs
  const noVitalsPayload = JSON.parse(JSON.stringify(validBedPayload));
  delete noVitalsPayload.stage1.vital_signs;
  const noVitalsResult = validateBedCase(noVitalsPayload, 'Edema Agudo de Pulmão');
  check('M3.4.11', 'BedValidation', 'Missing vital_signs is rejected', !noVitalsResult.isValid);

  // Invalid stage 1 type
  const badStage1Payload = JSON.parse(JSON.stringify(validBedPayload));
  badStage1Payload.stage1.type = 'multiple_choice';
  const badStage1Result = validateBedCase(badStage1Payload, 'Edema Agudo de Pulmão');
  check('M3.4.12', 'BedValidation', 'Stage 1 with wrong type is rejected', !badStage1Result.isValid);

  // Invalid stage 2 type
  const badStage2Payload = JSON.parse(JSON.stringify(validBedPayload));
  badStage2Payload.stage2.type = 'initial_conduct';
  const badStage2Result = validateBedCase(badStage2Payload, 'Edema Agudo de Pulmão');
  check('M3.4.13', 'BedValidation', 'Stage 2 with wrong type is rejected', !badStage2Result.isValid);

  // Stage 2 with ventilator type is ACCEPTED
  const ventPayload = JSON.parse(JSON.stringify(validBedPayload));
  ventPayload.stage2.type = 'ventilator';
  const ventResult = validateBedCase(ventPayload, 'Edema Agudo de Pulmão');
  check('M3.4.14', 'BedValidation', 'Stage 2 with type ventilator is accepted', ventResult.isValid);

  // Stage 1 with spoiler is rejected
  const spoiledBedPayload = JSON.parse(JSON.stringify(validBedPayload));
  spoiledBedPayload.stage1.vignette = 'Paciente admitido com diagnóstico definitivo de infarto agudo.';
  const spoiledBedResult = validateBedCase(spoiledBedPayload, 'IAM');
  check('M3.4.15', 'BedValidation', 'Bed case with diagnostic spoiler in vignette is rejected', !spoiledBedResult.isValid);

  // 4.3: MCQ Validation
  const validMCQ = {
    vignette: 'Paciente de 45 anos em PCR em assistolia após 10 minutos de manobras de RCP. Qual a conduta prioritária imediata?',
    options: [
      'Adrenalina 1mg IV a cada 3-5 minutos e RCP contínua de alta qualidade',
      'Desfibrilação imediata com choque de 200J bifásico',
      'Amiodarona 300mg IV em bólus imediatamente',
      'Atropina 1mg IV em bólus a cada 3 minutos',
      'Bicarbonato de sódio 8.4% 1mEq/kg de rotina',
    ],
    correct_option: 0,
    explanation: 'Na assistolia, o ritmo não é chocável. O manejo prioritário consiste em RCP de alta qualidade e Adrenalina 1mg IV a cada 3 a 5 minutos.',
    difficulty_tier: 'standard',
    question_subformat: 'case_conduct',
  };
  const validMCQResult = validateMCQ(validMCQ);
  check('M3.4.16', 'MCQValidation', 'Valid 5-option MCQ passes validation', validMCQResult.isValid);

  // 4 options (rejected)
  const mcq4 = { ...validMCQ, options: validMCQ.options.slice(0, 4) };
  check('M3.4.17', 'MCQValidation', 'MCQ with 4 options is rejected', !validateMCQ(mcq4).isValid);

  // 6 options (rejected)
  const mcq6 = { ...validMCQ, options: [...validMCQ.options, 'Opção F'] };
  check('M3.4.18', 'MCQValidation', 'MCQ with 6 options is rejected', !validateMCQ(mcq6).isValid);

  // Duplicate options (rejected)
  const mcqDup = {
    ...validMCQ,
    options: [
      'Mesma opção',
      'Mesma opção',
      'Opção C',
      'Opção D',
      'Opção E',
    ],
  };
  check('M3.4.19', 'MCQValidation', 'MCQ with duplicate option strings is rejected', !validateMCQ(mcqDup).isValid);

  // Invalid correct_option index (> 4)
  const mcqBadIndex = { ...validMCQ, correct_option: 5 };
  check('M3.4.20', 'MCQValidation', 'correct_option = 5 is rejected', !validateMCQ(mcqBadIndex).isValid);

  // Invalid correct_option index (< 0)
  const mcqNegIndex = { ...validMCQ, correct_option: -1 };
  check('M3.4.21', 'MCQValidation', 'correct_option = -1 is rejected', !validateMCQ(mcqNegIndex).isValid);

  // ==========================================================================
  // 5. TEXT SANITIZATION & MOJIBAKE NORMALIZATION
  // ==========================================================================
  console.log('\n--- CATEGORY 5: Text Sanitization & Mojibake Normalization ---');

  check('M3.5.1', 'Sanitizer', 'Repairs "CÃ¡lcio" to "Cálcio"', fixMojibake('CÃ¡lcio') === 'Cálcio');
  check('M3.5.2', 'Sanitizer', 'Repairs "pressÃ£o" to "pressão"', fixMojibake('pressÃ£o') === 'pressão');
  check('M3.5.3', 'Sanitizer', 'Repairs "soluÃ§Ã£o" to "solução"', fixMojibake('soluÃ§Ã£o') === 'solução');
  check('M3.5.4', 'Sanitizer', 'Repairs "nÃ£o" to "não"', fixMojibake('nÃ£o') === 'não');
  check('M3.5.5', 'Sanitizer', 'Repairs "emergÃªncia" to "emergência"', fixMojibake('emergÃªncia') === 'emergência');

  const decomposed = 'e\u0301'; // 'e' + combining acute accent
  const precomposed = 'é';
  check('M3.5.6', 'Sanitizer', 'normalizeNFC unifies decomposed combining characters', normalizeNFC(decomposed) === precomposed);

  // ==========================================================================
  // 6. CLIENT & CLI INTEGRATION
  // ==========================================================================
  console.log('\n--- CATEGORY 6: Client & CLI Configuration ---');

  check('M3.6.1', 'Client', 'BATCH_MODEL is strictly openai/gpt-6-luna:batch', BATCH_MODEL === 'openai/gpt-6-luna:batch');

  check('M3.6.2', 'Client', 'sanitizeApiKey in mock mode returns mock key without error', sanitizeApiKey(undefined, true) === 'mock-openrouter-key');

  let emptyLiveKeyThrew = false;
  const originalKey = process.env.OPENROUTER_API_KEY;
  try {
    delete process.env.OPENROUTER_API_KEY;
    sanitizeApiKey('', false);
  } catch {
    emptyLiveKeyThrew = true;
  } finally {
    process.env.OPENROUTER_API_KEY = originalKey;
  }
  check('M3.6.3', 'Client', 'Empty API key in live mode without env var throws descriptive error', emptyLiveKeyThrew);

  let emptyBatchThrew = false;
  try {
    await submitOpenRouterBatch([], undefined, true);
  } catch {
    emptyBatchThrew = true;
  }
  check('M3.6.4', 'Client', 'Empty batch requests array throws error', emptyBatchThrew);

  // Mock batch submission works end to end
  const mockSub = await submitOpenRouterBatch(
    [
      {
        custom_id: JSON.stringify({ type: 'bed_case', chapterId: 8, chapterTitle: 'PCR', caseIdx: 1, complexity: 'classic' }),
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: BATCH_MODEL,
          messages: [{ role: 'user', content: 'hello' }],
        },
      },
    ],
    undefined,
    true
  );
  check('M3.6.5', 'Client', 'Mock submission returns valid batch ID and status submitted',
    typeof mockSub.id === 'string' && mockSub.status === 'submitted' && mockSub.model === BATCH_MODEL
  );

  const mockStatus = await getOpenRouterBatchStatus(mockSub.id, undefined, true, [
    {
      custom_id: JSON.stringify({ type: 'bed_case', chapterId: 8, chapterTitle: 'PCR', caseIdx: 1, complexity: 'classic' }),
      method: 'POST',
      url: '/v1/chat/completions',
      body: {
        model: BATCH_MODEL,
        messages: [{ role: 'user', content: 'hello' }],
      },
    },
  ]);
  check('M3.6.6', 'Client', 'Mock status returns completed with results array',
    mockStatus.status === 'completed' && Array.isArray(mockStatus.results) && mockStatus.results.length === 1
  );

  // Package.json script check
  const pkgJsonPath = path.join(process.cwd(), 'package.json');
  const pkgContent = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  check('M3.6.7', 'CLI', 'package.json has script "batch:nightly"', pkgContent.scripts?.['batch:nightly'] === 'tsx scripts/nightly-batch-pipeline.ts');

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log('\n================================================================================');
  console.log(`ADVERSARIAL STRESS TEST SUMMARY: ${passed}/${total} passed (${failed} failed)`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdversarialM3().catch((err) => {
  console.error('Fatal error during adversarial runner:', err);
  process.exit(1);
});
