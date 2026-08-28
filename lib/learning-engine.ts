import { CHAPTERS_DATA, Chapter } from './chapters-data';
import { DEFAULT_CHAPTER_WEIGHTS, getChapterWeight, ChapterWeight } from './chapter-weights-data';

export const ALGORITHM_VERSION = 'v2.0-fsrs';
export const DESIRED_RETENTION = 0.90; // Target retention at review time

export interface ChapterReviewStatFSRS {
  chapter_id: number;
  times_reviewed: number;
  times_correct: number;
  times_incorrect: number;
  last_reviewed_at: string | null;
  last_evidence_at?: string | null;
  next_review_at: string | null;
  ease_factor: number;
  interval_days: number;
  stability?: number;
  difficulty?: number;
}

export interface ChapterProgressItem {
  chapter_id: number;
  is_read: boolean;
  read_at?: string | null;
  read_count?: number;
  last_read_at?: string | null;
}

export interface TestRecordItem {
  id: string;
  chapter_ids: number[];
  mode?: string | null;
  score?: number | null;
  completed?: boolean | null;
  completed_at?: string | null;
  results?: Record<string, any> | null;
  plantao_data?: {
    beds?: Array<{
      bedNumber: number;
      chapterId: number;
      questionIds?: number[];
      bonusQuestionId?: number;
    }>;
  } | null;
}

export interface RecommendationEventItem {
  recommended_chapter_id: number;
  selected_chapter_id: number;
  surface: string;
  mode: 'remediation' | 'expansion' | 'maintenance';
  action: 'shown' | 'accepted' | 'rerolled' | 'manual_selected' | 'completed';
  created_at: string;
}

export interface ChapterMetrics {
  chapterId: number;
  chapterNumber: number;
  title: string;
  sectionNumber: number;
  sectionTitle: string;
  category: string;
  frequencyScore: number;
  importanceScore: number;
  impactNorm: number;
  frequencyNorm: number;
  rawClinicalWeight: number;
  clinicalWeight: number; // Normalized sum = 1
  isRead: boolean;
  readAt: string | null;
  readCount: number;
  lastReadAt: string | null;
  observedAverage: number;
  evidenceCount: number;
  performance: number; // 0-100 Bayesian smoothed
  confidence: number; // 0-1
  stability: number; // FSRS S (days)
  difficulty: number; // FSRS D (1-10)
  daysSinceLastEvidence: number;
  retention: number; // 0-100 FSRS curve
  dueRatio: number; // days / stability
  topicReadiness: number; // 0-100
  dynamicThreshold: number; // 65-90
  remediationGap: number; // max(0, threshold - readiness)
  remediationScore: number;
  expansionScore: number;
  maintenanceScore: number;
  recommendationScore: number;
  isCritical: boolean; // impactNorm >= 0.8 && frequencyNorm >= 0.6
}

export interface DailyChallenge {
  title: string;
  subtitle: string;
  specialty: string;
  chapterId: number;
  chapterNumber: number;
  chapterTitle: string;
  sectionTitle: string;
  reason: string;
  actionType: 'plantao' | 'test' | 'read';
  actionLabel: string;
  badge: string;
  importanceScore: number;
  frequencyScore: number;
}

export interface ReadinessEngineSnapshot {
  calculatedAt: string;
  algorithmVersion: string;
  globalReadiness: number; // 0-100 (Integrated readiness)
  unadjustedReadiness: number;
  criticalGapPenalty: number;
  activeProficiency: number; // 0-100 (Real weighted proficiency on studied topics)
  activeRetention: number; // 0-100 (FSRS memory retention on studied topics)
  activePerformance: number; // 0-100 (Bayesian performance average on studied topics)
  curricularCoverage: {
    readCount: number;
    totalChapters: number;
    percent: number;
    clinicalWeightedPercent: number;
  };
  globalConfidence: number; // 0-1
  confidenceLabel: 'confiavel' | 'estimativa_inicial';
  readinessStatus: {
    label: string;
    color: string;
    bg: string;
    border: string;
    description: string;
    badgeKey: 'apto' | 'supervisao' | 'capacitacao';
  };
  totalReadChapters: number;
  totalEvaluations: number;
  specialtyScores: Array<{
    name: string;
    score: number;
    readCount: number;
    totalChapters: number;
    isStarted: boolean;
    coveragePercent: number;
    clinicalCoveragePercent: number;
    chapterIds: number[];
    color: string;
    confidence: number;
  }>;
  dailyChallenge?: DailyChallenge;
  chapterMetrics: Record<number, ChapterMetrics>;
  recommendation: {
    recommendedChapterId: number;
    selectedChapterId: number;
    surface: 'dashboard' | 'plantao';
    mode: 'remediation' | 'expansion' | 'maintenance';
    score: number;
    reason: string;
    factors: {
      clinicalWeight: number;
      readiness: number;
      dynamicThreshold: number;
      gap: number;
      retention: number;
      confidence: number;
      dueRatio: number;
    };
  };
  recommendations?: Array<ReadinessEngineSnapshot['recommendation']>;
}

export const SPECIALTIES_CONFIG: Array<{ name: string; chapterIds: number[]; color: string }> = [
  {
    name: 'Cardiologia',
    chapterIds: [29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
    color: '#ef4444',
  },
  {
    name: 'Pneumologia',
    chapterIds: [2, 6, 7, 41, 42, 43, 44, 45, 46, 47],
    color: '#38bdf8',
  },
  {
    name: 'Infectologia',
    chapterIds: [9, 48, 49, 50, 51, 52, 71],
    color: '#10b981',
  },
  {
    name: 'Traumatologia',
    chapterIds: [62, 63, 64, 65, 66, 67, 68, 69],
    color: '#f59e0b',
  },
  {
    name: 'Terapia Intensiva',
    chapterIds: [1, 3, 4, 5, 8, 10, 13, 78, 80],
    color: '#a855f7',
  },
];

// Helper: Normalize weights for all chapters (official + custom)
export function getNormalizedClinicalWeights(
  chaptersList?: Chapter[],
  customWeights?: Record<number, ChapterWeight>
): Map<number, { impactNorm: number; frequencyNorm: number; rawWeight: number; clinicalWeight: number }> {
  const chapters = chaptersList && chaptersList.length > 0 ? chaptersList : CHAPTERS_DATA;
  const result = new Map<number, { impactNorm: number; frequencyNorm: number; rawWeight: number; clinicalWeight: number }>();
  let sumRaw = 0;

  chapters.forEach((cap) => {
    const weight = customWeights && customWeights[cap.id] ? customWeights[cap.id] : getChapterWeight(cap.id);
    const frequencyNorm = Math.min(1.0, Math.max(0.1, (cap.frequencyScore || weight.frequencyScore) / 10.0));
    const impactNorm = Math.min(1.0, Math.max(0.1, (cap.importanceScore || weight.importanceScore) / 10.0));
    const rawWeight = 0.45 * impactNorm + 0.35 * frequencyNorm + 0.20 * impactNorm * frequencyNorm;
    sumRaw += rawWeight;

    result.set(cap.id, {
      impactNorm,
      frequencyNorm,
      rawWeight,
      clinicalWeight: rawWeight,
    });
  });

  // Renormalize so sum = 1.0
  chapters.forEach((cap) => {
    const item = result.get(cap.id)!;
    item.clinicalWeight = item.rawWeight / (sumRaw || 1.0);
  });

  return result;
}

// Extract chapter performance evidence from test history
export function extractChapterPerformanceEvidence(
  tests: TestRecordItem[],
  now: Date
): Map<number, { observedAverage: number; count: number; weightedCount: number }> {
  const evidenceMap = new Map<number, Array<{ score: number; weight: number; daysAgo: number }>>();

  tests.forEach((test) => {
    if (!test.completed || !test.completed_at) return;
    const testDate = new Date(test.completed_at);
    if (isNaN(testDate.getTime())) return;
    const daysAgo = Math.max(0, (now.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24));
    // Exponential decay half-life = 90 days
    const timeDecayWeight = Math.exp(-Math.LN2 * daysAgo / 90);

    const numericScore = test.score !== null && test.score !== undefined && !isNaN(Number(test.score))
      ? Number(test.score)
      : 5.0;

    const isPlantao = test.mode === 'plantao';

    if (isPlantao && test.plantao_data?.beds && Array.isArray(test.plantao_data.beds)) {
      // Plantão mode: assign exact bed score to each chapter in bed
      const beds = test.plantao_data.beds;
      const results = test.results || {};

      beds.forEach((bed) => {
        const chapterId = bed.chapterId;
        if (!chapterId) return;

        const qIds = bed.questionIds || [];
        let bedTotalScore = 0;
        let qCount = 0;

        qIds.forEach((qId) => {
          const evalObj = results[qId];
          if (evalObj && typeof evalObj.score === 'number') {
            bedTotalScore += evalObj.score;
            qCount++;
          }
        });

        const bedAvgScore = qCount > 0 ? (bedTotalScore / qCount) * 10 : numericScore * 10;
        const totalWeight = 1.25 * timeDecayWeight;

        if (!evidenceMap.has(chapterId)) evidenceMap.set(chapterId, []);
        evidenceMap.get(chapterId)!.push({ score: bedAvgScore, weight: totalWeight, daysAgo });
      });
    } else if (Array.isArray(test.chapter_ids) && test.chapter_ids.length > 0) {
      // Classic test: assign overall score to all chapters in test
      const score100 = numericScore * 10;
      const attributionConfidence = 1.0 / Math.max(1, test.chapter_ids.length);
      const totalWeight = 1.0 * attributionConfidence * timeDecayWeight;

      test.chapter_ids.forEach((chapterId) => {
        if (!evidenceMap.has(chapterId)) evidenceMap.set(chapterId, []);
        evidenceMap.get(chapterId)!.push({ score: score100, weight: totalWeight, daysAgo });
      });
    }
  });

  const result = new Map<number, { observedAverage: number; count: number; weightedCount: number }>();

  evidenceMap.forEach((list, chapterId) => {
    let sumWeightedScore = 0;
    let sumWeight = 0;

    list.forEach((item) => {
      sumWeightedScore += item.score * item.weight;
      sumWeight += item.weight;
    });

    const observedAverage = sumWeight > 0 ? sumWeightedScore / sumWeight : 50;
    result.set(chapterId, {
      observedAverage: Math.round(observedAverage * 10) / 10,
      count: list.length,
      weightedCount: Math.round(sumWeight * 100) / 100,
    });
  });

  return result;
}

// Compute metrics for all chapters (official + custom)
export function deriveAllTopicMetrics(params: {
  progressList: ChapterProgressItem[];
  reviewStatsList: ChapterReviewStatFSRS[];
  testsList: TestRecordItem[];
  chaptersList?: Chapter[];
  customWeights?: Record<number, ChapterWeight>;
  now?: Date;
}): Map<number, ChapterMetrics> {
  const now = params.now || new Date();
  const chapters = params.chaptersList && params.chaptersList.length > 0 ? params.chaptersList : CHAPTERS_DATA;
  const weightsMap = getNormalizedClinicalWeights(chapters, params.customWeights);
  const evidenceMap = extractChapterPerformanceEvidence(params.testsList, now);

  const progressMap = new Map<number, ChapterProgressItem>();
  params.progressList.forEach((p) => progressMap.set(p.chapter_id, p));

  const statsMap = new Map<number, ChapterReviewStatFSRS>();
  params.reviewStatsList.forEach((s) => statsMap.set(s.chapter_id, s));

  const result = new Map<number, ChapterMetrics>();

  // First pass: gather raw mode scores to find max for normalization
  let maxRemediation = 0.001;
  let maxExpansion = 0.001;
  let maxMaintenance = 0.001;

  const rawMetricsList: Array<{ cap: Chapter; metric: Partial<ChapterMetrics> }> = [];

  // Dynamic evidence timestamp extraction from testsList
  const latestTestDateMap = new Map<number, Date>();
  params.testsList.forEach((test) => {
    if (!test.completed || !test.completed_at) return;
    const testDate = new Date(test.completed_at);
    if (isNaN(testDate.getTime())) return;

    const chapterIdsSet = new Set<number>();
    if (test.mode === 'plantao' && test.plantao_data?.beds && Array.isArray(test.plantao_data.beds)) {
      test.plantao_data.beds.forEach((b) => {
        if (b.chapterId) chapterIdsSet.add(b.chapterId);
      });
    }
    if (Array.isArray(test.chapter_ids)) {
      test.chapter_ids.forEach((id) => chapterIdsSet.add(id));
    }

    chapterIdsSet.forEach((id) => {
      const existing = latestTestDateMap.get(id);
      if (!existing || testDate > existing) {
        latestTestDateMap.set(id, testDate);
      }
    });
  });

  chapters.forEach((cap) => {
    const w = weightsMap.get(cap.id)!;
    const weightInfo = params.customWeights && params.customWeights[cap.id]
      ? params.customWeights[cap.id]
      : getChapterWeight(cap.id);
    const prog = progressMap.get(cap.id);
    const stat = statsMap.get(cap.id);
    const ev = evidenceMap.get(cap.id);

    const isRead = prog?.is_read || false;
    const readAt = prog?.read_at || null;
    const readCount = prog?.read_count || (isRead ? 1 : 0);
    const lastReadAt = prog?.last_read_at || null;

    // Last evidence date = max(readAt, lastReadAt, stat.last_reviewed_at, stat.last_evidence_at, latestTestCompletedAt)
    let lastEvidenceDate: Date | null = null;
    if (readAt) {
      const d = new Date(readAt);
      if (!isNaN(d.getTime())) lastEvidenceDate = d;
    }
    if (lastReadAt) {
      const d = new Date(lastReadAt);
      if (!isNaN(d.getTime()) && (!lastEvidenceDate || d > lastEvidenceDate)) lastEvidenceDate = d;
    }
    if (stat?.last_reviewed_at) {
      const d = new Date(stat.last_reviewed_at);
      if (!isNaN(d.getTime()) && (!lastEvidenceDate || d > lastEvidenceDate)) lastEvidenceDate = d;
    }
    if (stat?.last_evidence_at) {
      const d = new Date(stat.last_evidence_at);
      if (!isNaN(d.getTime()) && (!lastEvidenceDate || d > lastEvidenceDate)) lastEvidenceDate = d;
    }
    const latestTestDate = latestTestDateMap.get(cap.id);
    if (latestTestDate) {
      if (!lastEvidenceDate || latestTestDate > lastEvidenceDate) lastEvidenceDate = latestTestDate;
    }

    const effectiveIsRead = isRead || (ev !== undefined && ev.count > 0);

    let daysSinceLastEvidence = 999;
    if (lastEvidenceDate) {
      daysSinceLastEvidence = Math.max(0, (now.getTime() - lastEvidenceDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Bayesian Smoothing: performance = (n * observedAverage + 1.0 * prior) / (n + 1.0)
    const n = ev?.count || 0;
    const prior = effectiveIsRead ? 70.0 : 0.0;
    const observedAverage = ev ? ev.observedAverage : prior;
    const performance = n > 0 ? (n * observedAverage + 1.0 * prior) / (n + 1.0) : prior;
    const confidence = Math.min(1.0, n / 4.0);

    // FSRS Stability S and Difficulty D (baseline S0 = 7.0 days)
    let stability = stat?.stability || (stat?.interval_days && stat?.ease_factor ? stat.interval_days * stat.ease_factor : 7.0);
    stability = Math.min(365.0, Math.max(7.0, stability));
    const difficulty = Math.min(10.0, Math.max(1.0, stat?.difficulty || 5.0));

    // Official FSRS Power-Law Retention Curve: R = 100 * (1 + (19/81) * (days / S))^(-0.5)
    const retention = effectiveIsRead
      ? Math.min(100.0, Math.max(0.0, 100.0 * Math.pow(1.0 + (19.0 / 81.0) * (daysSinceLastEvidence / stability), -0.5)))
      : 0.0;

    const scheduledInterval = stability; // For DESIRED_RETENTION = 0.90
    const dueRatio = effectiveIsRead ? Math.min(2.0, Math.max(0.0, daysSinceLastEvidence / Math.max(1, scheduledInterval))) : 0.0;

    // Topic Readiness = 0.85 * performance + 0.15 * retention (for read/tested topic)
    const topicReadiness = effectiveIsRead ? Math.min(100.0, 0.85 * performance + 0.15 * retention) : 0.0;

    // Dynamic Threshold = clamp(60 + 20 * clinicalWeightNormalized + 5 * impactNorm, 65, 90)
    // Relative clinical weight for threshold scaling
    const dynamicThreshold = Math.min(90.0, Math.max(65.0, 60.0 + 20.0 * (w.rawWeight / 0.75) + 5.0 * w.impactNorm));
    const remediationGap = Math.max(0.0, dynamicThreshold - topicReadiness);

    const isCritical = w.impactNorm >= 0.8 && w.frequencyNorm >= 0.6;

    // Check prerequisites for R6
    const prereqs = cap.prerequisites || [];
    const prereqsMet = prereqs.length === 0 || prereqs.every((pId) => {
      const pProg = progressMap.get(pId);
      const pEv = evidenceMap.get(pId);
      return (pProg?.is_read === true) || (pEv !== undefined && pEv.count > 0);
    });
    const prereqPenalty = prereqsMet ? 1.0 : 0.15;

    // Mode Scores
    const remediationScore = w.clinicalWeight * remediationGap * (0.65 + 0.35 * confidence);
    const expansionScore = !effectiveIsRead ? w.clinicalWeight * (0.70 + 0.30 * w.impactNorm) * prereqPenalty : 0.0;
    const maintenanceScore = effectiveIsRead ? w.clinicalWeight * (performance / 100.0) * dueRatio : 0.0;

    if (remediationScore > maxRemediation) maxRemediation = remediationScore;
    if (expansionScore > maxExpansion) maxExpansion = expansionScore;
    if (maintenanceScore > maxMaintenance) maxMaintenance = maintenanceScore;

    rawMetricsList.push({
      cap,
      metric: {
        chapterId: cap.id,
        chapterNumber: cap.number,
        title: cap.title,
        sectionNumber: cap.sectionNumber,
        sectionTitle: cap.sectionTitle,
        category: weightInfo.category,
        frequencyScore: weightInfo.frequencyScore,
        importanceScore: weightInfo.importanceScore,
        impactNorm: w.impactNorm,
        frequencyNorm: w.frequencyNorm,
        rawClinicalWeight: w.rawWeight,
        clinicalWeight: w.clinicalWeight,
        isRead: effectiveIsRead,
        readAt,
        readCount: prog?.read_count || (effectiveIsRead ? 1 : 0),
        lastReadAt,
        observedAverage: Math.round(observedAverage * 10) / 10,
        evidenceCount: n,
        performance: Math.round(performance * 10) / 10,
        confidence: Math.round(confidence * 100) / 100,
        stability: Math.round(stability * 10) / 10,
        difficulty: Math.round(difficulty * 10) / 10,
        daysSinceLastEvidence: Math.round(daysSinceLastEvidence * 10) / 10,
        retention: Math.round(retention * 10) / 10,
        dueRatio: Math.round(dueRatio * 100) / 100,
        topicReadiness: Math.round(topicReadiness * 10) / 10,
        dynamicThreshold: Math.round(dynamicThreshold * 10) / 10,
        remediationGap: Math.round(remediationGap * 10) / 10,
        remediationScore,
        expansionScore,
        maintenanceScore,
        isCritical,
      },
    });
  });

  // Second pass: compute normalized recommendation score
  rawMetricsList.forEach(({ cap, metric }) => {
    const remNorm = (metric.remediationScore || 0) / maxRemediation;
    const expNorm = (metric.expansionScore || 0) / maxExpansion;
    const mainNorm = (metric.maintenanceScore || 0) / maxMaintenance;

    const recommendationScore = 0.55 * remNorm + 0.25 * expNorm + 0.20 * mainNorm;

    const fullMetric: ChapterMetrics = {
      ...(metric as ChapterMetrics),
      recommendationScore: Math.round(recommendationScore * 1000) / 1000,
    };

    result.set(cap.id, fullMetric);
  });

  return result;
}

// Build complete snapshot and select best recommendation
export function buildReadinessSnapshot(params: {
  progressList: ChapterProgressItem[];
  reviewStatsList: ChapterReviewStatFSRS[];
  testsList: TestRecordItem[];
  recentEvents?: RecommendationEventItem[];
  surface?: 'dashboard' | 'plantao';
  requestedChapterId?: number;
  excludeChapterIds?: number[];
  chaptersList?: Chapter[];
  customWeights?: Record<number, ChapterWeight>;
  now?: Date;
}): ReadinessEngineSnapshot {
  const now = params.now || new Date();
  const surface = params.surface || 'dashboard';
  const metricsMap = deriveAllTopicMetrics({
    progressList: params.progressList,
    reviewStatsList: params.reviewStatsList,
    testsList: params.testsList,
    chaptersList: params.chaptersList,
    customWeights: params.customWeights,
    now,
  });

  const totalChapters = metricsMap.size || CHAPTERS_DATA.length;
  const readMetrics = Array.from(metricsMap.values()).filter((m) => m.isRead);
  const readCount = readMetrics.length;
  const totalEvaluations = params.testsList.filter((t) => t.completed).length;

  let sumAllClinicalWeight = 0;
  let sumReadClinicalWeight = 0;
  let sumWeightedTopicReadiness = 0;
  let sumWeightedRetention = 0;
  let sumWeightedPerformance = 0;
  let sumWeightedConfidence = 0;

  metricsMap.forEach((m) => {
    sumAllClinicalWeight += m.clinicalWeight;
    if (m.isRead) {
      sumReadClinicalWeight += m.clinicalWeight;
      sumWeightedTopicReadiness += m.clinicalWeight * m.topicReadiness;
      sumWeightedRetention += m.clinicalWeight * m.retention;
      sumWeightedPerformance += m.clinicalWeight * m.performance;
      sumWeightedConfidence += m.clinicalWeight * m.confidence;
    }
  });

  const clinicalWeightedCoveragePercent = Math.min(
    100,
    Math.round(sumReadClinicalWeight * 1000) / 10
  );
  const unweightedCoveragePercent = Math.min(
    100,
    Math.round((readCount / Math.max(1, totalChapters)) * 1000) / 10
  );

  // Active proficiency: weighted average across studied/read topics
  const activeProficiency =
    sumReadClinicalWeight > 0
      ? Math.round((sumWeightedTopicReadiness / sumReadClinicalWeight) * 10) / 10
      : 0;

  const activeRetention =
    sumReadClinicalWeight > 0
      ? Math.round((sumWeightedRetention / sumReadClinicalWeight) * 10) / 10
      : 0;

  const activePerformance =
    sumReadClinicalWeight > 0
      ? Math.round((sumWeightedPerformance / sumReadClinicalWeight) * 10) / 10
      : 0;

  const activeConfidence =
    sumReadClinicalWeight > 0
      ? Math.round((sumWeightedConfidence / sumReadClinicalWeight) * 100) / 100
      : 0;

  // Global Confidence based on active evidence count and evaluations
  const globalConfidence = Math.min(
    1.0,
    Math.round((activeConfidence * 0.70 + Math.min(1.0, totalEvaluations / 10.0) * 0.30) * 100) / 100
  );

  // Integrated Global Readiness:
  // Reflects both the active mastery (weighted by severity and frequency) and curriculum coverage
  let globalReadiness = 0;
  if (readCount === 0 && totalEvaluations === 0) {
    globalReadiness = 0;
  } else {
    // Active quality index (70% mastery + 30% retention)
    const activeQualityIndex = 0.70 * activeProficiency + 0.30 * activeRetention;
    // Sublinear coverage factor: 0.35 baseline + 0.65 * sqrt(coverage)
    const coverageRatio = Math.min(1.0, sumReadClinicalWeight);
    const coverageFactor = 0.35 + 0.65 * Math.sqrt(coverageRatio);
    globalReadiness = Math.round(activeQualityIndex * coverageFactor * 10) / 10;
  }

  const unadjustedReadiness = activeProficiency;
  const criticalGapPenalty = 0;

  const confidenceLabel: 'confiavel' | 'estimativa_inicial' =
    globalConfidence < 0.35 ? 'estimativa_inicial' : 'confiavel';

  // Status Badge Logic
  let readinessStatus: ReadinessEngineSnapshot['readinessStatus'] = {
    label: 'CAPACITAÇÃO EM ANDAMENTO (ESTIMATIVA INICIAL)',
    color: '#38bdf8',
    bg: 'rgba(14, 165, 233, 0.15)',
    border: 'rgba(14, 165, 233, 0.3)',
    description: `Proficiência ativa de ${activeProficiency}% nos temas estudados. Continue realizando simulados e plantões para expandir a cobertura UPA.`,
    badgeKey: 'capacitacao',
  };

  if (globalConfidence >= 0.35) {
    if (globalReadiness >= 75) {
      readinessStatus = {
        label: 'APTO — SALA VERMELHA & CASOS CRÍTICOS',
        color: '#34d399',
        bg: 'rgba(16, 185, 129, 0.15)',
        border: 'rgba(16, 185, 129, 0.3)',
        description: 'Prontidão médica excelente para Sala Vermelha, politrauma e emergências graves UPA.',
        badgeKey: 'apto',
      };
    } else if (globalReadiness >= 45) {
      readinessStatus = {
        label: 'PRONTIDÃO INTERMEDIÁRIA (SOB SUPERVISÃO)',
        color: '#fbbf24',
        bg: 'rgba(245, 158, 11, 0.15)',
        border: 'rgba(245, 158, 11, 0.3)',
        description: 'Capacidade sólida para plantão geral com suporte de preceptoria em temas críticos.',
        badgeKey: 'supervisao',
      };
    } else {
      readinessStatus = {
        label: 'CAPACITAÇÃO EM ANDAMENTO (FORMAÇÃO SÓLIDA)',
        color: '#38bdf8',
        bg: 'rgba(14, 165, 233, 0.15)',
        border: 'rgba(14, 165, 233, 0.3)',
        description: `Domínio de ${activeProficiency}% nos temas estudados. Amplie a cobertura para liberar a escala noturna plena.`,
        badgeKey: 'capacitacao',
      };
    }
  }

  // Specialty Breakdown (Active proficiency per specialty with coverage)
  const specialtyScores = SPECIALTIES_CONFIG.map((spec) => {
    let specAllWeight = 0;
    let specReadWeight = 0;
    let specWeightedReadiness = 0;
    let specWeightedConf = 0;
    let readInSpecCount = 0;

    spec.chapterIds.forEach((id) => {
      const m = metricsMap.get(id);
      if (m) {
        specAllWeight += m.clinicalWeight;
        if (m.isRead) {
          readInSpecCount++;
          specReadWeight += m.clinicalWeight;
          specWeightedReadiness += m.clinicalWeight * m.topicReadiness;
          specWeightedConf += m.clinicalWeight * m.confidence;
        }
      }
    });

    const isStarted = readInSpecCount > 0;
    const score = isStarted && specReadWeight > 0
      ? Math.round(specWeightedReadiness / specReadWeight)
      : 0;
    const confidence = isStarted && specReadWeight > 0
      ? Math.round((specWeightedConf / specReadWeight) * 100) / 100
      : 0;
    const coveragePercent = spec.chapterIds.length > 0
      ? Math.round((readInSpecCount / spec.chapterIds.length) * 100)
      : 0;
    const clinicalCoveragePercent = specAllWeight > 0
      ? Math.round((specReadWeight / specAllWeight) * 100)
      : 0;

    return {
      name: spec.name,
      score: Math.min(100, Math.max(0, score)),
      readCount: readInSpecCount,
      totalChapters: spec.chapterIds.length,
      isStarted,
      coveragePercent,
      clinicalCoveragePercent,
      chapterIds: spec.chapterIds,
      color: spec.color,
      confidence,
    };
  });

  // Calculate Critical Coverage
  let criticalReadCount = 0;
  let criticalTotal = 0;
  metricsMap.forEach((m) => {
    if (m.isCritical) {
      criticalTotal++;
      if (m.isRead) criticalReadCount++;
    }
  });
  const criticalCoverageRatio = criticalTotal > 0 ? criticalReadCount / criticalTotal : 1.0;

  // Determine Recommendation Mode and Chapter
  const recentEvents = params.recentEvents || [];
  const last4AcceptedModes = recentEvents
    .filter((e) => e.action === 'accepted')
    .slice(0, 4)
    .map((e) => e.mode);

  const hasRecentExpansion = last4AcceptedModes.includes('expansion');

  let selectedMode: 'remediation' | 'expansion' | 'maintenance' = 'remediation';
  let chosenMetric: ChapterMetrics | null = null;

  const rawCandidatesList = Array.from(metricsMap.values());
  const excludeSet = new Set(params.excludeChapterIds || []);
  const candidatesList = rawCandidatesList.filter((m) => !excludeSet.has(m.chapterId));
  const effectiveCandidates = candidatesList.length > 0 ? candidatesList : rawCandidatesList;

  if (surface === 'plantao') {
    const readCandidates = effectiveCandidates.filter((m) => m.isRead);
    const maintenanceDueCandidate = readCandidates.find((m) => m.dueRatio >= 1.0);

    if (maintenanceDueCandidate) {
      selectedMode = 'maintenance';
      readCandidates.sort((a, b) => b.maintenanceScore - a.maintenanceScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId);
      chosenMetric = readCandidates[0] || null;
    } else {
      selectedMode = 'remediation';
      readCandidates.sort((a, b) => b.remediationScore - a.remediationScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId);
      chosenMetric = readCandidates[0] || null;
    }
  } else {
    const maintenanceDue = effectiveCandidates.find((m) => m.isRead && m.dueRatio >= 1.0);

    if (criticalCoverageRatio < 0.85 || (!hasRecentExpansion && effectiveCandidates.some((m) => !m.isRead))) {
      selectedMode = 'expansion';
      const unreadCandidates = effectiveCandidates.filter((m) => !m.isRead);
      unreadCandidates.sort((a, b) => b.expansionScore - a.expansionScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId);
      chosenMetric = unreadCandidates[0] || null;
    } else if (maintenanceDue) {
      selectedMode = 'maintenance';
      const readCandidates = effectiveCandidates.filter((m) => m.isRead);
      readCandidates.sort((a, b) => b.maintenanceScore - a.maintenanceScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId);
      chosenMetric = readCandidates[0] || null;
    } else {
      effectiveCandidates.sort((a, b) => b.recommendationScore - a.recommendationScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId);
      chosenMetric = effectiveCandidates[0] || null;

      if (chosenMetric) {
        if (!chosenMetric.isRead) {
          selectedMode = 'expansion';
        } else if (chosenMetric.dueRatio >= 0.8) {
          selectedMode = 'maintenance';
        } else {
          selectedMode = 'remediation';
        }
      }
    }
  }

  if (params.requestedChapterId && metricsMap.has(params.requestedChapterId)) {
    chosenMetric = metricsMap.get(params.requestedChapterId)!;
  }

  if (!chosenMetric) {
    chosenMetric = effectiveCandidates[0] || rawCandidatesList[0];
  }

  const buildRecObj = (metric: ChapterMetrics, mode: 'remediation' | 'expansion' | 'maintenance') => {
    const isReRead = metric.isRead && metric.readCount > 0;
    const readLabel = isReRead ? `Revisão #${metric.readCount + 1}` : '1ª Leitura';
    const reasonMap: Record<string, string> = {
      remediation: isReRead
        ? `Releitura Recomendada (${readLabel}): Déficit de domínio no Capítulo ${metric.chapterNumber} (Prontidão ${metric.topicReadiness}% vs Limiar ${metric.dynamicThreshold}%).`
        : `Déficit de domínio identificado no Capítulo ${metric.chapterNumber} (Domínio ${metric.topicReadiness}% vs Limiar ${metric.dynamicThreshold}%).`,
      expansion: `Expansão de catálogo (${readLabel}) recomendada para cobrir lacuna no Capítulo ${metric.chapterNumber} (${metric.category}).`,
      maintenance: `Releitura de Consolidação (${readLabel}) agendada pelo FSRS (Vencimento ${metric.dueRatio.toFixed(1)}x estabilidade).`,
    };

    return {
      recommendedChapterId: metric.chapterId,
      selectedChapterId: metric.chapterId,
      surface,
      mode,
      score: metric.recommendationScore,
      reason: reasonMap[mode] || 'Sugestão clínica do recomendador.',
      factors: {
        clinicalWeight: metric.clinicalWeight,
        readiness: metric.topicReadiness,
        dynamicThreshold: metric.dynamicThreshold,
        gap: metric.remediationGap,
        retention: metric.retention,
        confidence: metric.confidence,
        dueRatio: metric.dueRatio,
      },
    };
  };

  // Build top recommendations for each mode with unique chapter IDs
  const usedChapterIds = new Set<number>();
  const recommendations: Array<ReadinessEngineSnapshot['recommendation']> = [];

  // 1. Remediation: prefers read chapters with remediationGap > 0
  const remediationCandidates = effectiveCandidates
    .filter((m) => m.isRead)
    .sort((a, b) => {
      const aGap = a.remediationGap > 0 ? 1 : 0;
      const bGap = b.remediationGap > 0 ? 1 : 0;
      if (bGap !== aGap) return bGap - aGap;
      return b.remediationScore - a.remediationScore;
    });
  const remediationMatch = remediationCandidates.find((c) => !usedChapterIds.has(c.chapterId));
  if (remediationMatch) {
    recommendations.push(buildRecObj(remediationMatch, 'remediation'));
    usedChapterIds.add(remediationMatch.chapterId);
  }

  // 2. Expansion: prefers unread chapters
  const expansionCandidates = effectiveCandidates
    .filter((m) => !m.isRead)
    .sort((a, b) => b.expansionScore - a.expansionScore);
  const expansionMatch = expansionCandidates.find((c) => !usedChapterIds.has(c.chapterId));
  if (expansionMatch) {
    recommendations.push(buildRecObj(expansionMatch, 'expansion'));
    usedChapterIds.add(expansionMatch.chapterId);
  }

  // 3. Maintenance: prefers read chapters with dueRatio >= 0.8
  const maintenanceCandidates = effectiveCandidates
    .filter((m) => m.isRead)
    .sort((a, b) => {
      const aDue = a.dueRatio >= 0.8 ? 1 : 0;
      const bDue = b.dueRatio >= 0.8 ? 1 : 0;
      if (bDue !== aDue) return bDue - aDue;
      return b.maintenanceScore - a.maintenanceScore;
    });
  const maintenanceMatch = maintenanceCandidates.find((c) => !usedChapterIds.has(c.chapterId));
  if (maintenanceMatch) {
    recommendations.push(buildRecObj(maintenanceMatch, 'maintenance'));
    usedChapterIds.add(maintenanceMatch.chapterId);
  }

  // Fallback if fewer than 3 recommendations were found
  if (recommendations.length < 3) {
    const fallbackList = [...effectiveCandidates].sort((a, b) => b.recommendationScore - a.recommendationScore);
    for (const cand of fallbackList) {
      if (recommendations.length >= 3) break;
      if (!usedChapterIds.has(cand.chapterId)) {
        const mode: 'remediation' | 'expansion' | 'maintenance' = cand.isRead
          ? (cand.dueRatio >= 0.8 ? 'maintenance' : 'remediation')
          : 'expansion';
        recommendations.push(buildRecObj(cand, mode));
        usedChapterIds.add(cand.chapterId);
      }
    }
  }

  if (recommendations.length === 0 && chosenMetric) {
    recommendations.push(buildRecObj(chosenMetric, selectedMode));
  }

  const primaryRec = buildRecObj(chosenMetric, selectedMode);

  // Generate Daily Clinical Challenge
  let dailyChallenge: DailyChallenge | undefined;

  const unstartedSpec = specialtyScores.find((s) => !s.isStarted);
  if (unstartedSpec) {
    const specChapterMetrics = unstartedSpec.chapterIds
      .map((id) => metricsMap.get(id))
      .filter(Boolean) as ChapterMetrics[];
    specChapterMetrics.sort((a, b) => b.rawClinicalWeight - a.rawClinicalWeight);
    const target = specChapterMetrics[0];

    if (target) {
      dailyChallenge = {
        title: 'Desafio Clínico do Dia',
        subtitle: `Iniciar Especialidade: ${unstartedSpec.name}`,
        specialty: unstartedSpec.name,
        chapterId: target.chapterId,
        chapterNumber: target.chapterNumber,
        chapterTitle: target.title,
        sectionTitle: target.sectionTitle,
        reason: `Especialidade fundamental da UPA ainda sem registros. Domine este tema de alto impacto (Importância ${target.importanceScore}/10) para equilibrar seu Radar.`,
        actionType: 'test',
        actionLabel: 'Iniciar Primeiro Simulado',
        badge: 'Desbloquear Especialidade',
        importanceScore: target.importanceScore,
        frequencyScore: target.frequencyScore,
      };
    }
  }

  if (!dailyChallenge) {
    const dueMetric = readMetrics.find((m) => m.dueRatio >= 1.0);
    if (dueMetric) {
      dailyChallenge = {
        title: 'Desafio Clínico do Dia',
        subtitle: `Manutenção FSRS: ${dueMetric.category || dueMetric.sectionTitle}`,
        specialty: dueMetric.category || dueMetric.sectionTitle,
        chapterId: dueMetric.chapterId,
        chapterNumber: dueMetric.chapterNumber,
        chapterTitle: dueMetric.title,
        sectionTitle: dueMetric.sectionTitle,
        reason: `Revisão espaçada recomendada pelo algoritmo FSRS (${dueMetric.dueRatio.toFixed(1)}x intervalo) para consolidar a memória de longo prazo.`,
        actionType: 'plantao',
        actionLabel: 'Revisar no Modo Plantão',
        badge: 'Revisão Espaçada',
        importanceScore: dueMetric.importanceScore,
        frequencyScore: dueMetric.frequencyScore,
      };
    }
  }

  if (!dailyChallenge) {
    const gapMetric = readMetrics.find((m) => m.remediationGap > 15);
    if (gapMetric) {
      dailyChallenge = {
        title: 'Desafio Clínico do Dia',
        subtitle: `Reforço Clínico: ${gapMetric.category || gapMetric.sectionTitle}`,
        specialty: gapMetric.category || gapMetric.sectionTitle,
        chapterId: gapMetric.chapterId,
        chapterNumber: gapMetric.chapterNumber,
        chapterTitle: gapMetric.title,
        sectionTitle: gapMetric.sectionTitle,
        reason: `Déficit de domínio identificado (Prontidão ${gapMetric.topicReadiness}% vs Limiar ${gapMetric.dynamicThreshold}%). Reforce este tema para elevar seu score.`,
        actionType: 'test',
        actionLabel: 'Fazer Simulado de Reforço',
        badge: 'Remediação Prioritária',
        importanceScore: gapMetric.importanceScore,
        frequencyScore: gapMetric.frequencyScore,
      };
    }
  }

  if (!dailyChallenge) {
    const unreadCandidates = Array.from(metricsMap.values()).filter((m) => !m.isRead);
    unreadCandidates.sort((a, b) => b.expansionScore - a.expansionScore);
    const topUnread = unreadCandidates[0];
    if (topUnread) {
      dailyChallenge = {
        title: 'Desafio Clínico do Dia',
        subtitle: `Expansão de Catálogo: ${topUnread.category || topUnread.sectionTitle}`,
        specialty: topUnread.category || topUnread.sectionTitle,
        chapterId: topUnread.chapterId,
        chapterNumber: topUnread.chapterNumber,
        chapterTitle: topUnread.title,
        sectionTitle: topUnread.sectionTitle,
        reason: `Tema de alta incidência e gravidade na UPA. Amplie sua cobertura curricular estudando este capítulo.`,
        actionType: 'test',
        actionLabel: 'Estudar Capítulo',
        badge: 'Expansão UPA',
        importanceScore: topUnread.importanceScore,
        frequencyScore: topUnread.frequencyScore,
      };
    }
  }

  const snapshot: ReadinessEngineSnapshot = {
    calculatedAt: now.toISOString(),
    algorithmVersion: ALGORITHM_VERSION,
    globalReadiness,
    unadjustedReadiness,
    criticalGapPenalty,
    activeProficiency,
    activeRetention,
    activePerformance,
    curricularCoverage: {
      readCount,
      totalChapters,
      percent: unweightedCoveragePercent,
      clinicalWeightedPercent: clinicalWeightedCoveragePercent,
    },
    globalConfidence,
    confidenceLabel,
    readinessStatus,
    totalReadChapters: readCount,
    totalEvaluations,
    specialtyScores,
    dailyChallenge,
    chapterMetrics: Object.fromEntries(metricsMap),
    recommendation: primaryRec,
    recommendations,
  };

  return snapshot;
}

// Select multiple chapters for Modo Plantão with max 2 per section constraint
export function selectPlantaoBedsWithEngine(params: {
  snapshot: ReadinessEngineSnapshot;
  bedCount?: number;
  maxPerSection?: number;
}): Array<{ chapterId: number; mode: string; metrics: ChapterMetrics }> {
  const { snapshot, bedCount = 4, maxPerSection = 2 } = params;
  const allMetrics = Object.values(snapshot.chapterMetrics);
  const readMetrics = allMetrics.filter((m) => m.isRead);

  if (readMetrics.length === 0) return [];

  // Sort candidates by highest urgency (remediation gap or maintenance dueRatio or clinical weight)
  const pool = [...readMetrics].sort((a, b) => {
    const scoreA = 0.50 * a.remediationScore + 0.30 * a.maintenanceScore + 0.20 * a.clinicalWeight;
    const scoreB = 0.50 * b.remediationScore + 0.30 * b.maintenanceScore + 0.20 * b.clinicalWeight;
    return scoreB - scoreA || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId;
  });

  const selected: Array<{ chapterId: number; mode: string; metrics: ChapterMetrics }> = [];
  const sectionCounts = new Map<number, number>();

  for (const item of pool) {
    if (selected.length >= bedCount) break;

    const secCount = sectionCounts.get(item.sectionNumber) || 0;
    if (secCount < maxPerSection) {
      const mode = item.dueRatio >= 1.0 ? 'maintenance' : 'remediation';
      selected.push({ chapterId: item.chapterId, mode, metrics: item });
      sectionCounts.set(item.sectionNumber, secCount + 1);
    }
  }

  // Fallback if section constraint was too tight
  if (selected.length < bedCount) {
    for (const item of pool) {
      if (selected.length >= bedCount) break;
      if (!selected.some((s) => s.chapterId === item.chapterId)) {
        const mode = item.dueRatio >= 1.0 ? 'maintenance' : 'remediation';
        selected.push({ chapterId: item.chapterId, mode, metrics: item });
      }
    }
  }

  return selected;
}

// Calculate FSRS update upon completing a review or test bed
export function calculateFSRSUpdate(
  currentStat: Partial<ChapterReviewStatFSRS> | null,
  bedScore: number /* 0.0 to 10.0 */,
  now: Date = new Date()
) {
  let easeFactor = currentStat?.ease_factor || 2.5;
  let interval = currentStat?.interval_days || 1;
  let stability = currentStat?.stability || 7.0;
  let difficulty = currentStat?.difficulty || 5.0;
  let timesReviewed = (currentStat?.times_reviewed || 0) + 1;
  let timesCorrect = currentStat?.times_correct || 0;
  let timesIncorrect = currentStat?.times_incorrect || 0;

  // Grade G on scale 1-4
  // Score 0-3.9 -> Grade 1 (Again), Score 4-5.9 -> Grade 2 (Hard), Score 6-7.9 -> Grade 3 (Good), Score 8-10 -> Grade 4 (Easy)
  let grade: number;
  if (isNaN(bedScore) || bedScore < 4.0) grade = 1;
  else if (bedScore < 6.0) grade = 2;
  else if (bedScore < 8.0) grade = 3;
  else grade = 4;

  const isSuccess = grade >= 2;

  if (isSuccess) {
    timesCorrect += 1;
  } else {
    timesIncorrect += 1;
  }

  // Calculate elapsed days since last evidence
  let elapsedDays = 1.0;
  if (currentStat?.last_evidence_at) {
    const lastDate = new Date(currentStat.last_evidence_at);
    if (!isNaN(lastDate.getTime())) {
      elapsedDays = Math.max(0.1, (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  // FSRS 4.5 Update Rules
  if (isSuccess) {
    difficulty = Math.min(10.0, Math.max(1.0, difficulty - 0.4 * (grade - 3)));

    const retentionAtReview = Math.pow(1.0 + (19.0 / 81.0) * (elapsedDays / stability), -0.5);
    const growthFactor = 1.0 + 2.5 * (1.0 - retentionAtReview) * Math.exp(0.08 * (10.0 - difficulty));

    stability = Math.min(365.0, Math.max(7.0, stability * growthFactor));
    interval = Math.max(1, Math.round(stability));
    easeFactor = Math.min(3.5, Math.max(1.3, easeFactor + 0.1));
  } else {
    difficulty = Math.min(10.0, Math.max(1.0, difficulty + 0.8));
    stability = Math.max(1.0, stability * 0.5);
    interval = 1;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  }

  const nextReviewDate = new Date(now.getTime());
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return {
    times_reviewed: timesReviewed,
    times_correct: timesCorrect,
    times_incorrect: timesIncorrect,
    last_reviewed_at: now.toISOString(),
    last_evidence_at: now.toISOString(),
    next_review_at: nextReviewDate.toISOString(),
    ease_factor: Math.round(easeFactor * 100) / 100,
    interval_days: interval,
    stability: Math.round(stability * 100) / 100,
    difficulty: Math.round(difficulty * 100) / 100,
  };
}

// Calculate FSRS update upon marking a manual re-reading of a chapter
export function calculateFSRSManualReadUpdate(
  currentStat: Partial<ChapterReviewStatFSRS> | null,
  now: Date = new Date()
) {
  let easeFactor = currentStat?.ease_factor || 2.5;
  let stability = currentStat?.stability || 7.0;
  let difficulty = currentStat?.difficulty || 5.0;
  let timesReviewed = (currentStat?.times_reviewed || 0) + 1;
  let timesCorrect = currentStat?.times_correct || 0;
  let timesIncorrect = currentStat?.times_incorrect || 0;

  // Re-reading reinforces memory stability S by 35% (up to 365 days, min 7.0)
  stability = Math.min(365.0, Math.max(7.0, stability * 1.35));
  const interval = Math.max(1, Math.round(stability));

  const nextReviewDate = new Date(now.getTime());
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return {
    times_reviewed: timesReviewed,
    times_correct: timesCorrect,
    times_incorrect: timesIncorrect,
    last_evidence_at: now.toISOString(),
    next_review_at: nextReviewDate.toISOString(),
    ease_factor: Math.round(easeFactor * 100) / 100,
    interval_days: interval,
    stability: Math.round(stability * 100) / 100,
    difficulty: Math.round(difficulty * 100) / 100,
  };
}

/**
 * FSRS update upon completing a re-read verification quiz.
 * Full bonus (S*1.35) if quizScore >= 66%, partial (S*1.10) otherwise.
 */
export function calculateFSRSRereadWithQuiz(
  currentStat: Partial<ChapterReviewStatFSRS> | null,
  quizCorrect: number,
  quizTotal: number,
  now: Date = new Date()
) {
  const passRate = quizTotal > 0 ? quizCorrect / quizTotal : 0;
  const stabilityMultiplier = passRate >= 0.66 ? 1.35 : 1.10;

  let stability = currentStat?.stability || 7.0;
  let easeFactor = currentStat?.ease_factor || 2.5;
  let difficulty = currentStat?.difficulty || 5.0;
  let timesReviewed = (currentStat?.times_reviewed || 0) + 1;
  let timesCorrect = (currentStat?.times_correct || 0) + quizCorrect;
  let timesIncorrect = (currentStat?.times_incorrect || 0) + (quizTotal - quizCorrect);

  stability = Math.min(365.0, Math.max(7.0, stability * stabilityMultiplier));

  if (passRate >= 0.66) {
    difficulty = Math.max(1.0, difficulty - 0.2);
  } else {
    difficulty = Math.min(10.0, difficulty + 0.3);
  }

  const interval = Math.max(1, Math.round(stability));

  const nextReviewDate = new Date(now.getTime());
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return {
    times_reviewed: timesReviewed,
    times_correct: timesCorrect,
    times_incorrect: timesIncorrect,
    last_evidence_at: now.toISOString(),
    next_review_at: nextReviewDate.toISOString(),
    ease_factor: Math.round(easeFactor * 100) / 100,
    interval_days: interval,
    stability: Math.round(stability * 100) / 100,
    difficulty: Math.round(difficulty * 100) / 100,
  };
}
