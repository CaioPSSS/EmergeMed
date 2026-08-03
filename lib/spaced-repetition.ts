import { DEFAULT_CHAPTER_WEIGHTS, getChapterWeight, ChapterWeight } from './chapter-weights-data';
import { CHAPTERS_DATA, Chapter } from './chapters-data';

export interface ChapterReviewStat {
  chapter_id: number;
  times_reviewed: number;
  times_correct: number;
  times_incorrect: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  ease_factor: number;
  interval_days: number;
}

export interface ScoredChapter {
  chapterId: number;
  chapterNumber: number;
  title: string;
  sectionNumber: number;
  sectionTitle: string;
  frequencyScore: number;
  importanceScore: number;
  daysSinceLastReview: number;
  accuracyRate: number;
  compositeScore: number; // Final weighted score
  lastReviewedAt: string | null;
}

export interface BedOutcome {
  type: 'alta' | 'internacao' | 'complicacao_leve' | 'complicacao_grave';
  label: string;
  color: 'green' | 'yellow' | 'orange' | 'red';
  message: string;
  triggersAdverseEvolution: boolean;
}

export interface PlantaoBed {
  bedNumber: number;
  chapterId: number;
  chapterTitle: string;
  sectionTitle: string;
  frequencyScore: number;
  importanceScore: number;
  questionSequence: ('multiple_choice' | 'prescription_complete' | 'prescription_immediate' | 'ventilator')[];
  patientSummary?: string;
  outcome?: BedOutcome;
}

/**
 * Calculates priority score for each read chapter based on:
 * - 35% Days since last review
 * - 25% Frequency score (from estatistica.md)
 * - 25% Importance score (from estatistica.md)
 * - 15% Error rate (1 - accuracy)
 */
export function calculateChapterScores(params: {
  readChapterIds: number[];
  reviewStats: ChapterReviewStat[];
  customWeights?: Record<number, { frequency: number; importance: number }>;
}): ScoredChapter[] {
  const { readChapterIds, reviewStats, customWeights } = params;
  const now = new Date();

  const statsMap = new Map<number, ChapterReviewStat>();
  reviewStats.forEach((st) => statsMap.set(st.chapter_id, st));

  const eligibleChapters = CHAPTERS_DATA.filter((c) => readChapterIds.includes(c.id));

  return eligibleChapters.map((cap) => {
    const stat = statsMap.get(cap.id);
    const weight = customWeights?.[cap.id]
      ? { frequencyScore: customWeights[cap.id].frequency, importanceScore: customWeights[cap.id].importance }
      : getChapterWeight(cap.id);

    let daysSinceLastReview = 999; // Default max for never-reviewed
    if (stat?.last_reviewed_at) {
      const lastDate = new Date(stat.last_reviewed_at);
      daysSinceLastReview = Math.max(0, (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    let accuracyRate = 1.0;
    if (stat && stat.times_reviewed > 0) {
      accuracyRate = stat.times_correct / (stat.times_correct + stat.times_incorrect || 1);
    }

    // Normalized factors
    const timeNorm = Math.min(daysSinceLastReview / 30, 1.0); // Saturates at 30 days
    const freqNorm = weight.frequencyScore / 10.0;
    const impNorm = weight.importanceScore / 10.0;
    const errorNorm = 1.0 - accuracyRate;

    // Weighted composite score (0 to 100)
    const compositeScore = (0.35 * timeNorm + 0.25 * freqNorm + 0.25 * impNorm + 0.15 * errorNorm) * 100;

    return {
      chapterId: cap.id,
      chapterNumber: cap.number,
      title: cap.title,
      sectionNumber: cap.sectionNumber,
      sectionTitle: cap.sectionTitle,
      frequencyScore: weight.frequencyScore,
      importanceScore: weight.importanceScore,
      daysSinceLastReview: Math.round(daysSinceLastReview * 10) / 10,
      accuracyRate: Math.round(accuracyRate * 100) / 100,
      compositeScore: Math.round(compositeScore * 10) / 10,
      lastReviewedAt: stat?.last_reviewed_at || null,
    };
  }).sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * Semi-random selection of bedCount chapters from top candidates
 */
export function selectPlantaoChapters(params: {
  scoredChapters: ScoredChapter[];
  bedCount?: number;
  maxPerSection?: number;
}): number[] {
  const { scoredChapters, bedCount = 4, maxPerSection = 2 } = params;

  if (scoredChapters.length <= bedCount) {
    return scoredChapters.map((c) => c.chapterId);
  }

  // Pick from top 50% candidates
  const topCandidateCount = Math.max(bedCount * 2, Math.ceil(scoredChapters.length * 0.5));
  const candidates = scoredChapters.slice(0, topCandidateCount);

  const selectedChapterIds: number[] = [];
  const sectionCounts = new Map<number, number>();

  // Weighted random pick from candidates
  const pool = [...candidates];

  while (selectedChapterIds.length < bedCount && pool.length > 0) {
    // Pick with probability biased towards higher rank
    const index = Math.floor(Math.pow(Math.random(), 1.5) * pool.length);
    const chosen = pool[index];

    const currentSecCount = sectionCounts.get(chosen.sectionNumber) || 0;
    if (currentSecCount < maxPerSection) {
      selectedChapterIds.push(chosen.chapterId);
      sectionCounts.set(chosen.sectionNumber, currentSecCount + 1);
    }

    pool.splice(index, 1);
  }

  // Fallback if maxPerSection constrained too much
  if (selectedChapterIds.length < bedCount) {
    for (const item of candidates) {
      if (selectedChapterIds.length >= bedCount) break;
      if (!selectedChapterIds.includes(item.chapterId)) {
        selectedChapterIds.push(item.chapterId);
      }
    }
  }

  return selectedChapterIds;
}

/**
 * Organizes selected chapters into beds with a 4-question clinical continuous sequence
 */
export function organizePlantaoBeds(selectedChapterIds: number[]): PlantaoBed[] {
  return selectedChapterIds.map((chapterId, idx) => {
    const cap = CHAPTERS_DATA.find((c) => c.id === chapterId);
    const weight = getChapterWeight(chapterId);

    return {
      bedNumber: idx + 1,
      chapterId,
      chapterTitle: cap?.title || `Capítulo ${chapterId}`,
      sectionTitle: cap?.sectionTitle || 'Emergência',
      frequencyScore: weight.frequencyScore,
      importanceScore: weight.importanceScore,
      questionSequence: [
        'multiple_choice',       // Q1: Triagem / Diagnóstico inicial
        'multiple_choice',       // Q2: Conduta diagnóstica / Exames
        'prescription_immediate',// Q3: Prescrição imediata de emergência
        'prescription_complete', // Q4: Prescrição completa ou Ventilador (se cabível)
      ],
    };
  });
}

/**
 * Determines outcome for a bed based on number of correct answers (out of 4 base questions)
 */
export function determineBedOutcome(correctCount: number, totalQuestions: number = 4): BedOutcome {
  const percentage = (correctCount / totalQuestions) * 100;

  if (percentage >= 90) {
    return {
      type: 'alta',
      label: 'Alta Hospitalar',
      color: 'green',
      message: 'Paciente estabilizado e alta concedida à enfermaria com sucesso.',
      triggersAdverseEvolution: false,
    };
  } else if (percentage >= 70) {
    return {
      type: 'internacao',
      label: 'Observação / Internação',
      color: 'yellow',
      message: 'Paciente em melhora parcial, mantido em observação na UPA.',
      triggersAdverseEvolution: false,
    };
  } else if (percentage >= 45) {
    return {
      type: 'complicacao_leve',
      label: 'Complicação Moderada',
      color: 'orange',
      message: 'Paciente evolui com descompensação clínica parcial!',
      triggersAdverseEvolution: true,
    };
  } else {
    return {
      type: 'complicacao_grave',
      label: 'Deterioração Grave / UTI',
      color: 'red',
      message: 'Paciente evolui com instabilidade refratária e risco iminente!',
      triggersAdverseEvolution: true,
    };
  }
}

/**
 * Standard SM-2 Spaced Repetition calculation after completing a bed
 */
export function calculateSM2Update(currentStat: Partial<ChapterReviewStat> | null, bedScore: number /* 0.0 to 10.0 */) {
  let easeFactor = currentStat?.ease_factor || 2.5;
  let interval = currentStat?.interval_days || 1;
  let timesReviewed = (currentStat?.times_reviewed || 0) + 1;
  let timesCorrect = currentStat?.times_correct || 0;
  let timesIncorrect = currentStat?.times_incorrect || 0;

  // Grade from 0 to 5 for SM-2 based on 0-10 score
  const grade = Math.min(5, Math.max(0, Math.round(bedScore / 2)));

  if (grade >= 3) {
    timesCorrect += 1;
    if (interval === 1) {
      interval = 3;
    } else if (interval === 3) {
      interval = 7;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  } else {
    timesIncorrect += 1;
    interval = 1; // Reset to 1 day on failure
  }

  // SM-2 Ease Factor formula
  easeFactor = easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return {
    times_reviewed: timesReviewed,
    times_correct: timesCorrect,
    times_incorrect: timesIncorrect,
    last_reviewed_at: new Date().toISOString(),
    next_review_at: nextReviewDate.toISOString(),
    ease_factor: Math.round(easeFactor * 100) / 100,
    interval_days: interval,
  };
}
