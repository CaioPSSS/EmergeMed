import { CHAPTERS_DATA, Chapter } from './chapters-data';
import { DEFAULT_CHAPTER_WEIGHTS, getChapterWeight, ChapterWeight } from './chapter-weights-data';

export const ALGORITHM_VERSION = 'v1.0-fsrs';

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

export interface ReadinessEngineSnapshot {
  calculatedAt: string;
  algorithmVersion: string;
  globalReadiness: number; // 0-100
  unadjustedReadiness: number;
  criticalGapPenalty: number;
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
    chapterIds: number[];
    color: string;
    confidence: number;
  }>;
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

// Helper: Normalize weights for all 122 chapters
export function getNormalizedClinicalWeights(): Map<number, { impactNorm: number; frequencyNorm: number; rawWeight: number; clinicalWeight: number }> {
  const result = new Map<number, { impactNorm: number; frequencyNorm: number; rawWeight: number; clinicalWeight: number }>();
  let sumRaw = 0;

  CHAPTERS_DATA.forEach((cap) => {
    const weight = getChapterWeight(cap.id);
    const frequencyNorm = Math.min(1.0, Math.max(0.1, weight.frequencyScore / 10.0));
    const impactNorm = Math.min(1.0, Math.max(0.1, weight.importanceScore / 10.0));
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
  CHAPTERS_DATA.forEach((cap) => {
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
    const daysAgo = Math.max(0, (now.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24));
    // Exponential decay half-life = 90 days
    const timeDecayWeight = Math.exp(-Math.LN2 * daysAgo / 90);

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

        const bedAvgScore = qCount > 0 ? (bedTotalScore / qCount) * 10 : (Number(test.score) || 5) * 10;
        const totalWeight = 1.25 * timeDecayWeight;

        if (!evidenceMap.has(chapterId)) evidenceMap.set(chapterId, []);
        evidenceMap.get(chapterId)!.push({ score: bedAvgScore, weight: totalWeight, daysAgo });
      });
    } else if (Array.isArray(test.chapter_ids) && test.chapter_ids.length > 0) {
      // Classic test: assign overall score to all chapters in test
      const score100 = (Number(test.score) || 5) * 10;
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

// Compute metrics for all 122 chapters
export function deriveAllTopicMetrics(params: {
  progressList: ChapterProgressItem[];
  reviewStatsList: ChapterReviewStatFSRS[];
  testsList: TestRecordItem[];
  now?: Date;
}): Map<number, ChapterMetrics> {
  const now = params.now || new Date();
  const weightsMap = getNormalizedClinicalWeights();
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

  CHAPTERS_DATA.forEach((cap) => {
    const w = weightsMap.get(cap.id)!;
    const weightInfo = getChapterWeight(cap.id);
    const prog = progressMap.get(cap.id);
    const stat = statsMap.get(cap.id);
    const ev = evidenceMap.get(cap.id);

    const isRead = prog?.is_read || false;
    const readAt = prog?.read_at || null;
    const readCount = prog?.read_count || (isRead ? 1 : 0);
    const lastReadAt = prog?.last_read_at || null;

    // Last evidence date = max(readAt, lastReadAt, stat.last_reviewed_at, stat.last_evidence_at)
    let lastEvidenceDate: Date | null = null;
    if (readAt) lastEvidenceDate = new Date(readAt);
    if (lastReadAt) {
      const d = new Date(lastReadAt);
      if (!lastEvidenceDate || d > lastEvidenceDate) lastEvidenceDate = d;
    }
    if (stat?.last_reviewed_at) {
      const d = new Date(stat.last_reviewed_at);
      if (!lastEvidenceDate || d > lastEvidenceDate) lastEvidenceDate = d;
    }
    if (stat?.last_evidence_at) {
      const d = new Date(stat.last_evidence_at);
      if (!lastEvidenceDate || d > lastEvidenceDate) lastEvidenceDate = d;
    }

    let daysSinceLastEvidence = 999;
    if (lastEvidenceDate) {
      daysSinceLastEvidence = Math.max(0, (now.getTime() - lastEvidenceDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Bayesian Smoothing: performance = (n * observedAverage + 3 * prior) / (n + 3)
    const n = ev?.count || 0;
    const observedAverage = ev ? ev.observedAverage : (isRead ? 50 : 0);
    const prior = isRead ? 50 : 0;
    const performance = n > 0 ? (n * observedAverage + 3 * prior) / (n + 3) : prior;
    const confidence = Math.min(1.0, n / 5.0);

    // FSRS Stability S and Difficulty D
    let stability = stat?.stability || (stat?.interval_days && stat?.ease_factor ? stat.interval_days * stat.ease_factor : 3.0);
    stability = Math.min(180.0, Math.max(1.0, stability));
    const difficulty = Math.min(10.0, Math.max(1.0, stat?.difficulty || 5.0));

    // FSRS Retention Curve: R = 100 * exp(-ln(2) * daysSince / S)
    const retention = isRead
      ? Math.min(100.0, Math.max(0.0, 100.0 * Math.exp((-Math.LN2 * daysSinceLastEvidence) / stability)))
      : 0.0;

    const dueRatio = isRead ? Math.min(1.5, Math.max(0.0, daysSinceLastEvidence / stability)) : 0.0;

    // Topic Readiness = 0.60 * performance + 0.40 * retention (for read topic)
    const topicReadiness = isRead ? Math.min(100.0, 0.60 * performance + 0.40 * retention) : 0.0;

    // Dynamic Threshold = clamp(60 + 20 * clinicalWeightNormalized + 5 * impactNorm, 65, 90)
    // Relative clinical weight for threshold scaling
    const dynamicThreshold = Math.min(90.0, Math.max(65.0, 60.0 + 20.0 * (w.rawWeight / 0.75) + 5.0 * w.impactNorm));
    const remediationGap = Math.max(0.0, dynamicThreshold - topicReadiness);

    const isCritical = w.impactNorm >= 0.8 && w.frequencyNorm >= 0.6;

    // Mode Scores
    const remediationScore = w.clinicalWeight * remediationGap * (0.65 + 0.35 * confidence);
    const expansionScore = !isRead ? w.clinicalWeight * (0.70 + 0.30 * w.impactNorm) : 0.0;
    const maintenanceScore = isRead ? w.clinicalWeight * (performance / 100.0) * dueRatio : 0.0;

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
        isRead,
        readAt,
        readCount,
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
  now?: Date;
}): ReadinessEngineSnapshot {
  const now = params.now || new Date();
  const surface = params.surface || 'dashboard';
  const metricsMap = deriveAllTopicMetrics({
    progressList: params.progressList,
    reviewStatsList: params.reviewStatsList,
    testsList: params.testsList,
    now,
  });

  let sumWeightedReadiness = 0;
  let sumWeight = 0;
  let sumWeightedConfidence = 0;
  let criticalPenaltyTotal = 0;
  let readCount = 0;

  metricsMap.forEach((m) => {
    if (m.isRead) readCount++;
    sumWeightedReadiness += m.clinicalWeight * m.topicReadiness;
    sumWeightedConfidence += m.clinicalWeight * m.confidence;
    sumWeight += m.clinicalWeight;

    // Critical gap penalty
    if (m.isCritical && m.topicReadiness < m.dynamicThreshold) {
      const deficit = m.dynamicThreshold - m.topicReadiness;
      const penaltyContribution = m.clinicalWeight * (deficit / m.dynamicThreshold) * 15.0;
      criticalPenaltyTotal += penaltyContribution;
    }
  });

  const unadjustedReadiness = sumWeight > 0 ? sumWeightedReadiness / sumWeight : 0;
  criticalPenaltyTotal = Math.min(15.0, criticalPenaltyTotal);
  let globalReadiness = Math.max(0, Math.round((unadjustedReadiness - criticalPenaltyTotal) * 10) / 10);
  const globalConfidence = Math.round((sumWeight > 0 ? sumWeightedConfidence / sumWeight : 0) * 100) / 100;

  // Beginner zero state check
  const totalEvaluations = params.testsList.filter((t) => t.completed).length;
  if (readCount === 0 && totalEvaluations === 0) {
    globalReadiness = 0;
  }

  const confidenceLabel: 'confiavel' | 'estimativa_inicial' = globalConfidence < 0.40 ? 'estimativa_inicial' : 'confiavel';

  // Status Badge Logic
  let readinessStatus: ReadinessEngineSnapshot['readinessStatus'] = {
    label: 'CAPACITAÇÃO EM ANDAMENTO (ESTIMATIVA INICIAL)',
    color: '#38bdf8',
    bg: 'rgba(14, 165, 233, 0.15)',
    border: 'rgba(14, 165, 233, 0.3)',
    description: 'Pouca evidência clínica acumulada. Score baseado em estimativa pedagógica inicial.',
    badgeKey: 'capacitacao',
  };

  if (globalConfidence >= 0.40) {
    if (globalReadiness >= 80) {
      readinessStatus = {
        label: 'APTO — SALA VERMELHA & CASOS CRÍTICOS',
        color: '#34d399',
        bg: 'rgba(16, 185, 129, 0.15)',
        border: 'rgba(16, 185, 129, 0.3)',
        description: 'Prontidão médica excelente para Sala Vermelha, politrauma e emergências graves UPA.',
        badgeKey: 'apto',
      };
    } else if (globalReadiness >= 60) {
      readinessStatus = {
        label: 'PRONTIDÃO INTERMEDIÁRIA (SOB SUPERVISÃO)',
        color: '#fbbf24',
        bg: 'rgba(245, 158, 11, 0.15)',
        border: 'rgba(245, 158, 11, 0.3)',
        description: 'Capacidade sólida para plantão geral com suporte de preceptoria em temas críticos.',
        badgeKey: 'supervisao',
      };
    }
  }

  // Specialty Breakdown
  const specialtyScores = SPECIALTIES_CONFIG.map((spec) => {
    let specWeightedReadiness = 0;
    let specWeightedConf = 0;
    let specWeight = 0;

    spec.chapterIds.forEach((id) => {
      const m = metricsMap.get(id);
      if (m) {
        specWeightedReadiness += m.clinicalWeight * m.topicReadiness;
        specWeightedConf += m.clinicalWeight * m.confidence;
        specWeight += m.clinicalWeight;
      }
    });

    const score = specWeight > 0 ? Math.round(specWeightedReadiness / specWeight) : 0;
    const confidence = specWeight > 0 ? Math.round((specWeightedConf / specWeight) * 100) / 100 : 0;

    return {
      name: spec.name,
      score: Math.min(100, Math.max(0, score)),
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

  const candidatesList = Array.from(metricsMap.values());

  if (surface === 'plantao') {
    // Plantão MUST only select read chapters
    const readCandidates = candidatesList.filter((m) => m.isRead);
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
    // Dashboard: can select remediation, expansion, or maintenance
    const maintenanceDue = candidatesList.find((m) => m.isRead && m.dueRatio >= 1.0);

    if (criticalCoverageRatio < 0.85 || (!hasRecentExpansion && candidatesList.some((m) => !m.isRead))) {
      selectedMode = 'expansion';
      const unreadCandidates = candidatesList.filter((m) => !m.isRead);
      unreadCandidates.sort((a, b) => b.expansionScore - a.expansionScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId);
      chosenMetric = unreadCandidates[0] || null;
    } else if (maintenanceDue) {
      selectedMode = 'maintenance';
      const readCandidates = candidatesList.filter((m) => m.isRead);
      readCandidates.sort((a, b) => b.maintenanceScore - a.maintenanceScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId);
      chosenMetric = readCandidates[0] || null;
    } else {
      // Pick highest recommendationScore
      candidatesList.sort((a, b) => b.recommendationScore - a.recommendationScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId);
      chosenMetric = candidatesList[0] || null;

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

  // If specific chapter was requested manually
  if (params.requestedChapterId && metricsMap.has(params.requestedChapterId)) {
    chosenMetric = metricsMap.get(params.requestedChapterId)!;
  }

  if (!chosenMetric) {
    chosenMetric = candidatesList[0];
  }

  const isReRead = chosenMetric.isRead && chosenMetric.readCount > 0;
  const readLabel = isReRead ? `Revisão #${chosenMetric.readCount + 1}` : '1ª Leitura';

  const reasonMap: Record<string, string> = {
    remediation: isReRead
      ? `Releitura Recomendada (${readLabel}): Déficit de domínio no Capítulo ${chosenMetric.chapterNumber} (Prontidão ${chosenMetric.topicReadiness}% vs Limiar ${chosenMetric.dynamicThreshold}%).`
      : `Déficit de domínio identificado no Capítulo ${chosenMetric.chapterNumber} (Domínio ${chosenMetric.topicReadiness}% vs Limiar ${chosenMetric.dynamicThreshold}%).`,
    expansion: `Expansão de catálogo (${readLabel}) recomendada para cobrir lacuna no Capítulo ${chosenMetric.chapterNumber} (${chosenMetric.category}).`,
    maintenance: `Releitura de Consolidação (${readLabel}) agendada pelo FSRS (Vencimento ${chosenMetric.dueRatio.toFixed(1)}x estabilidade).`,
  };

  const snapshot: ReadinessEngineSnapshot = {
    calculatedAt: now.toISOString(),
    algorithmVersion: ALGORITHM_VERSION,
    globalReadiness,
    unadjustedReadiness: Math.round(unadjustedReadiness * 10) / 10,
    criticalGapPenalty: Math.round(criticalPenaltyTotal * 10) / 10,
    globalConfidence,
    confidenceLabel,
    readinessStatus,
    totalReadChapters: readCount,
    totalEvaluations,
    specialtyScores,
    chapterMetrics: Object.fromEntries(metricsMap),
    recommendation: {
      recommendedChapterId: chosenMetric.chapterId,
      selectedChapterId: chosenMetric.chapterId,
      surface,
      mode: selectedMode,
      score: chosenMetric.recommendationScore,
      reason: reasonMap[selectedMode] || 'Sugestão clínica do recomendador.',
      factors: {
        clinicalWeight: chosenMetric.clinicalWeight,
        readiness: chosenMetric.topicReadiness,
        dynamicThreshold: chosenMetric.dynamicThreshold,
        gap: chosenMetric.remediationGap,
        retention: chosenMetric.retention,
        confidence: chosenMetric.confidence,
        dueRatio: chosenMetric.dueRatio,
      },
    },
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
  let stability = currentStat?.stability || 3.0;
  let difficulty = currentStat?.difficulty || 5.0;
  let timesReviewed = (currentStat?.times_reviewed || 0) + 1;
  let timesCorrect = currentStat?.times_correct || 0;
  let timesIncorrect = currentStat?.times_incorrect || 0;

  const isSuccess = bedScore >= 6.0;

  if (isSuccess) {
    timesCorrect += 1;
  } else {
    timesIncorrect += 1;
  }

  // Calculate elapsed days since last evidence
  let elapsedDays = 1.0;
  if (currentStat?.last_evidence_at) {
    const lastDate = new Date(currentStat.last_evidence_at);
    elapsedDays = Math.max(0.1, (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // FSRS 4.5 Update Rules
  if (isSuccess) {
    // Grade G on scale 1-4
    const grade = Math.min(4, Math.max(2, Math.round(bedScore / 2.5)));
    difficulty = Math.min(10.0, Math.max(1.0, difficulty - 0.4 * (grade - 3)));

    const retentionAtReview = Math.exp(-Math.LN2 * elapsedDays / stability);
    const growthFactor = 1.0 + 2.5 * (1.0 - retentionAtReview) * Math.exp(0.08 * (10.0 - difficulty));

    stability = Math.min(180.0, Math.max(1.0, stability * growthFactor));
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
  let stability = currentStat?.stability || 3.0;
  let difficulty = currentStat?.difficulty || 5.0;
  let timesReviewed = (currentStat?.times_reviewed || 0) + 1;
  let timesCorrect = currentStat?.times_correct || 0;
  let timesIncorrect = currentStat?.times_incorrect || 0;

  // Re-reading reinforces memory stability S by 35% (up to 180 days)
  stability = Math.min(180.0, Math.max(3.0, stability * 1.35));
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
