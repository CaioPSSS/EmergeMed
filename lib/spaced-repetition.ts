import { DEFAULT_CHAPTER_WEIGHTS, getChapterWeight, ChapterWeight } from './chapter-weights-data';
import { CHAPTERS_DATA, Chapter } from './chapters-data';
import {
  deriveAllTopicMetrics,
  calculateFSRSUpdate,
  ChapterReviewStatFSRS,
} from './learning-engine';

export type ChapterReviewStat = ChapterReviewStatFSRS;
export { calculateFSRSUpdate };

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
 * Legacy support function for chapter scoring: delegates to learning-engine metrics.
 */
export function calculateChapterScores(params: {
  readChapterIds: number[];
  reviewStats: ChapterReviewStat[];
  customWeights?: Record<number, { frequency: number; importance: number }>;
}): ScoredChapter[] {
  const { readChapterIds, reviewStats } = params;

  const progressList = readChapterIds.map((id) => ({ chapter_id: id, is_read: true }));
  const metricsMap = deriveAllTopicMetrics({
    progressList,
    reviewStatsList: reviewStats,
    testsList: [],
  });

  const readMetrics = Array.from(metricsMap.values()).filter((m) => m.isRead);

  return readMetrics
    .map((m) => ({
      chapterId: m.chapterId,
      chapterNumber: m.chapterNumber,
      title: m.title,
      sectionNumber: m.sectionNumber,
      sectionTitle: m.sectionTitle,
      frequencyScore: m.frequencyScore,
      importanceScore: m.importanceScore,
      daysSinceLastReview: m.daysSinceLastEvidence,
      accuracyRate: m.confidence,
      compositeScore: m.recommendationScore,
      lastReviewedAt: null,
    }))
    .sort((a, b) => b.compositeScore - a.compositeScore);
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

  const selectedChapterIds: number[] = [];
  const sectionCounts = new Map<number, number>();

  for (const candidate of scoredChapters) {
    if (selectedChapterIds.length >= bedCount) break;
    const currentSecCount = sectionCounts.get(candidate.sectionNumber) || 0;
    if (currentSecCount < maxPerSection) {
      selectedChapterIds.push(candidate.chapterId);
      sectionCounts.set(candidate.sectionNumber, currentSecCount + 1);
    }
  }

  if (selectedChapterIds.length < bedCount) {
    for (const item of scoredChapters) {
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
export function organizePlantaoBeds(
  selectedChapterIds: number[],
  chaptersList?: Chapter[],
  customWeights?: Record<number, ChapterWeight>
): PlantaoBed[] {
  const chapters = chaptersList && chaptersList.length > 0 ? chaptersList : CHAPTERS_DATA;
  return selectedChapterIds.map((chapterId, idx) => {
    const cap = chapters.find((c) => c.id === chapterId);
    const weight = customWeights && customWeights[chapterId] ? customWeights[chapterId] : getChapterWeight(chapterId);

    return {
      bedNumber: idx + 1,
      chapterId,
      chapterTitle: cap?.title || `Capítulo ${chapterId}`,
      sectionTitle: cap?.sectionTitle || 'Emergência',
      frequencyScore: cap?.frequencyScore || weight.frequencyScore,
      importanceScore: cap?.importanceScore || weight.importanceScore,
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
  return calculateFSRSUpdate(currentStat, bedScore);
}

