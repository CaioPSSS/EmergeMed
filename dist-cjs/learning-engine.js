"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPECIALTIES_CONFIG = exports.DESIRED_RETENTION = exports.ALGORITHM_VERSION = void 0;
exports.getNormalizedClinicalWeights = getNormalizedClinicalWeights;
exports.extractChapterPerformanceEvidence = extractChapterPerformanceEvidence;
exports.deriveAllTopicMetrics = deriveAllTopicMetrics;
exports.buildReadinessSnapshot = buildReadinessSnapshot;
exports.selectPlantaoBedsWithEngine = selectPlantaoBedsWithEngine;
exports.calculateFSRSUpdate = calculateFSRSUpdate;
exports.calculateFSRSManualReadUpdate = calculateFSRSManualReadUpdate;
exports.calculateFSRSRereadWithQuiz = calculateFSRSRereadWithQuiz;
var chapters_data_1 = require("./chapters-data");
var chapter_weights_data_1 = require("./chapter-weights-data");
exports.ALGORITHM_VERSION = 'v2.0-fsrs';
exports.DESIRED_RETENTION = 0.90; // Target retention at review time
exports.SPECIALTIES_CONFIG = [
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
function getNormalizedClinicalWeights() {
    var result = new Map();
    var sumRaw = 0;
    chapters_data_1.CHAPTERS_DATA.forEach(function (cap) {
        var weight = (0, chapter_weights_data_1.getChapterWeight)(cap.id);
        var frequencyNorm = Math.min(1.0, Math.max(0.1, weight.frequencyScore / 10.0));
        var impactNorm = Math.min(1.0, Math.max(0.1, weight.importanceScore / 10.0));
        var rawWeight = 0.45 * impactNorm + 0.35 * frequencyNorm + 0.20 * impactNorm * frequencyNorm;
        sumRaw += rawWeight;
        result.set(cap.id, {
            impactNorm: impactNorm,
            frequencyNorm: frequencyNorm,
            rawWeight: rawWeight,
            clinicalWeight: rawWeight,
        });
    });
    // Renormalize so sum = 1.0
    chapters_data_1.CHAPTERS_DATA.forEach(function (cap) {
        var item = result.get(cap.id);
        item.clinicalWeight = item.rawWeight / (sumRaw || 1.0);
    });
    return result;
}
// Extract chapter performance evidence from test history
function extractChapterPerformanceEvidence(tests, now) {
    var evidenceMap = new Map();
    tests.forEach(function (test) {
        var _a;
        if (!test.completed || !test.completed_at)
            return;
        var testDate = new Date(test.completed_at);
        var daysAgo = Math.max(0, (now.getTime() - testDate.getTime()) / (1000 * 60 * 60 * 24));
        // Exponential decay half-life = 90 days
        var timeDecayWeight = Math.exp(-Math.LN2 * daysAgo / 90);
        var isPlantao = test.mode === 'plantao';
        if (isPlantao && ((_a = test.plantao_data) === null || _a === void 0 ? void 0 : _a.beds) && Array.isArray(test.plantao_data.beds)) {
            // Plantão mode: assign exact bed score to each chapter in bed
            var beds = test.plantao_data.beds;
            var results_1 = test.results || {};
            beds.forEach(function (bed) {
                var chapterId = bed.chapterId;
                if (!chapterId)
                    return;
                var qIds = bed.questionIds || [];
                var bedTotalScore = 0;
                var qCount = 0;
                qIds.forEach(function (qId) {
                    var evalObj = results_1[qId];
                    if (evalObj && typeof evalObj.score === 'number') {
                        bedTotalScore += evalObj.score;
                        qCount++;
                    }
                });
                var bedAvgScore = qCount > 0 ? (bedTotalScore / qCount) * 10 : (Number(test.score) || 5) * 10;
                var totalWeight = 1.25 * timeDecayWeight;
                if (!evidenceMap.has(chapterId))
                    evidenceMap.set(chapterId, []);
                evidenceMap.get(chapterId).push({ score: bedAvgScore, weight: totalWeight, daysAgo: daysAgo });
            });
        }
        else if (Array.isArray(test.chapter_ids) && test.chapter_ids.length > 0) {
            // Classic test: assign overall score to all chapters in test
            var score100_1 = (Number(test.score) || 5) * 10;
            var attributionConfidence = 1.0 / Math.max(1, test.chapter_ids.length);
            var totalWeight_1 = 1.0 * attributionConfidence * timeDecayWeight;
            test.chapter_ids.forEach(function (chapterId) {
                if (!evidenceMap.has(chapterId))
                    evidenceMap.set(chapterId, []);
                evidenceMap.get(chapterId).push({ score: score100_1, weight: totalWeight_1, daysAgo: daysAgo });
            });
        }
    });
    var result = new Map();
    evidenceMap.forEach(function (list, chapterId) {
        var sumWeightedScore = 0;
        var sumWeight = 0;
        list.forEach(function (item) {
            sumWeightedScore += item.score * item.weight;
            sumWeight += item.weight;
        });
        var observedAverage = sumWeight > 0 ? sumWeightedScore / sumWeight : 50;
        result.set(chapterId, {
            observedAverage: Math.round(observedAverage * 10) / 10,
            count: list.length,
            weightedCount: Math.round(sumWeight * 100) / 100,
        });
    });
    return result;
}
// Compute metrics for all 122 chapters
function deriveAllTopicMetrics(params) {
    var now = params.now || new Date();
    var weightsMap = getNormalizedClinicalWeights();
    var evidenceMap = extractChapterPerformanceEvidence(params.testsList, now);
    var progressMap = new Map();
    params.progressList.forEach(function (p) { return progressMap.set(p.chapter_id, p); });
    var statsMap = new Map();
    params.reviewStatsList.forEach(function (s) { return statsMap.set(s.chapter_id, s); });
    var result = new Map();
    // First pass: gather raw mode scores to find max for normalization
    var maxRemediation = 0.001;
    var maxExpansion = 0.001;
    var maxMaintenance = 0.001;
    var rawMetricsList = [];
    chapters_data_1.CHAPTERS_DATA.forEach(function (cap) {
        var w = weightsMap.get(cap.id);
        var weightInfo = (0, chapter_weights_data_1.getChapterWeight)(cap.id);
        var prog = progressMap.get(cap.id);
        var stat = statsMap.get(cap.id);
        var ev = evidenceMap.get(cap.id);
        var isRead = (prog === null || prog === void 0 ? void 0 : prog.is_read) || false;
        var readAt = (prog === null || prog === void 0 ? void 0 : prog.read_at) || null;
        var readCount = (prog === null || prog === void 0 ? void 0 : prog.read_count) || (isRead ? 1 : 0);
        var lastReadAt = (prog === null || prog === void 0 ? void 0 : prog.last_read_at) || null;
        // Last evidence date = max(readAt, lastReadAt, stat.last_reviewed_at, stat.last_evidence_at)
        var lastEvidenceDate = null;
        if (readAt)
            lastEvidenceDate = new Date(readAt);
        if (lastReadAt) {
            var d = new Date(lastReadAt);
            if (!lastEvidenceDate || d > lastEvidenceDate)
                lastEvidenceDate = d;
        }
        if (stat === null || stat === void 0 ? void 0 : stat.last_reviewed_at) {
            var d = new Date(stat.last_reviewed_at);
            if (!lastEvidenceDate || d > lastEvidenceDate)
                lastEvidenceDate = d;
        }
        if (stat === null || stat === void 0 ? void 0 : stat.last_evidence_at) {
            var d = new Date(stat.last_evidence_at);
            if (!lastEvidenceDate || d > lastEvidenceDate)
                lastEvidenceDate = d;
        }
        var daysSinceLastEvidence = 999;
        if (lastEvidenceDate) {
            daysSinceLastEvidence = Math.max(0, (now.getTime() - lastEvidenceDate.getTime()) / (1000 * 60 * 60 * 24));
        }
        // Bayesian Smoothing: performance = (n * observedAverage + 3 * prior) / (n + 3)
        var n = (ev === null || ev === void 0 ? void 0 : ev.count) || 0;
        var observedAverage = ev ? ev.observedAverage : (isRead ? 50 : 0);
        var prior = isRead ? 50 : 0;
        var performance = n > 0 ? (n * observedAverage + 3 * prior) / (n + 3) : prior;
        var confidence = Math.min(1.0, n / 5.0);
        // FSRS Stability S and Difficulty D
        var stability = (stat === null || stat === void 0 ? void 0 : stat.stability) || ((stat === null || stat === void 0 ? void 0 : stat.interval_days) && (stat === null || stat === void 0 ? void 0 : stat.ease_factor) ? stat.interval_days * stat.ease_factor : 3.0);
        stability = Math.min(365.0, Math.max(1.0, stability));
        var difficulty = Math.min(10.0, Math.max(1.0, (stat === null || stat === void 0 ? void 0 : stat.difficulty) || 5.0));
        // FSRS Retention Curve: R = 100 * exp(-ln(2) * daysSince / S)
        var retention = isRead
            ? Math.min(100.0, Math.max(0.0, 100.0 * Math.exp((-Math.LN2 * daysSinceLastEvidence) / stability)))
            : 0.0;
        var scheduledInterval = stability * (-Math.log(exports.DESIRED_RETENTION) / Math.LN2);
        var dueRatio = isRead ? Math.min(2.0, Math.max(0.0, daysSinceLastEvidence / Math.max(1, scheduledInterval))) : 0.0;
        // Topic Readiness = 0.60 * performance + 0.40 * retention (for read topic)
        var topicReadiness = isRead ? Math.min(100.0, 0.60 * performance + 0.40 * retention) : 0.0;
        // Dynamic Threshold = clamp(60 + 20 * clinicalWeightNormalized + 5 * impactNorm, 65, 90)
        // Relative clinical weight for threshold scaling
        var dynamicThreshold = Math.min(90.0, Math.max(65.0, 60.0 + 20.0 * (w.rawWeight / 0.75) + 5.0 * w.impactNorm));
        var remediationGap = Math.max(0.0, dynamicThreshold - topicReadiness);
        var isCritical = w.impactNorm >= 0.8 && w.frequencyNorm >= 0.6;
        // Check prerequisites for R6
        var prereqs = cap.prerequisites || [];
        var prereqsMet = prereqs.length === 0 || prereqs.every(function (pId) {
            var pProg = progressMap.get(pId);
            return (pProg === null || pProg === void 0 ? void 0 : pProg.is_read) === true;
        });
        var prereqPenalty = prereqsMet ? 1.0 : 0.15;
        // Mode Scores
        var remediationScore = w.clinicalWeight * remediationGap * (0.65 + 0.35 * confidence);
        var expansionScore = !isRead ? w.clinicalWeight * (0.70 + 0.30 * w.impactNorm) * prereqPenalty : 0.0;
        var maintenanceScore = isRead ? w.clinicalWeight * (performance / 100.0) * dueRatio : 0.0;
        if (remediationScore > maxRemediation)
            maxRemediation = remediationScore;
        if (expansionScore > maxExpansion)
            maxExpansion = expansionScore;
        if (maintenanceScore > maxMaintenance)
            maxMaintenance = maintenanceScore;
        rawMetricsList.push({
            cap: cap,
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
                isRead: isRead,
                readAt: readAt,
                readCount: readCount,
                lastReadAt: lastReadAt,
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
                remediationScore: remediationScore,
                expansionScore: expansionScore,
                maintenanceScore: maintenanceScore,
                isCritical: isCritical,
            },
        });
    });
    // Second pass: compute normalized recommendation score
    rawMetricsList.forEach(function (_a) {
        var cap = _a.cap, metric = _a.metric;
        var remNorm = (metric.remediationScore || 0) / maxRemediation;
        var expNorm = (metric.expansionScore || 0) / maxExpansion;
        var mainNorm = (metric.maintenanceScore || 0) / maxMaintenance;
        var recommendationScore = 0.55 * remNorm + 0.25 * expNorm + 0.20 * mainNorm;
        var fullMetric = __assign(__assign({}, metric), { recommendationScore: Math.round(recommendationScore * 1000) / 1000 });
        result.set(cap.id, fullMetric);
    });
    return result;
}
// Build complete snapshot and select best recommendation
function buildReadinessSnapshot(params) {
    var now = params.now || new Date();
    var surface = params.surface || 'dashboard';
    var metricsMap = deriveAllTopicMetrics({
        progressList: params.progressList,
        reviewStatsList: params.reviewStatsList,
        testsList: params.testsList,
        now: now,
    });
    var sumWeightedReadiness = 0;
    var sumWeight = 0;
    var sumWeightedConfidence = 0;
    var criticalPenaltyTotal = 0;
    var readCount = 0;
    metricsMap.forEach(function (m) {
        if (m.isRead)
            readCount++;
        sumWeightedReadiness += m.clinicalWeight * m.topicReadiness;
        sumWeightedConfidence += m.clinicalWeight * m.confidence;
        sumWeight += m.clinicalWeight;
        // Critical gap penalty
        if (m.isCritical && m.topicReadiness < m.dynamicThreshold) {
            var deficit = m.dynamicThreshold - m.topicReadiness;
            var penaltyContribution = m.clinicalWeight * (deficit / m.dynamicThreshold) * 15.0;
            criticalPenaltyTotal += penaltyContribution;
        }
    });
    var unadjustedReadiness = sumWeight > 0 ? sumWeightedReadiness / sumWeight : 0;
    criticalPenaltyTotal = Math.min(15.0, criticalPenaltyTotal);
    var globalReadiness = Math.max(0, Math.round((unadjustedReadiness - criticalPenaltyTotal) * 10) / 10);
    var globalConfidence = Math.round((sumWeight > 0 ? sumWeightedConfidence / sumWeight : 0) * 100) / 100;
    // Beginner zero state check
    var totalEvaluations = params.testsList.filter(function (t) { return t.completed; }).length;
    if (readCount === 0 && totalEvaluations === 0) {
        globalReadiness = 0;
    }
    var confidenceLabel = globalConfidence < 0.40 ? 'estimativa_inicial' : 'confiavel';
    // Status Badge Logic
    var readinessStatus = {
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
        }
        else if (globalReadiness >= 60) {
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
    var specialtyScores = exports.SPECIALTIES_CONFIG.map(function (spec) {
        var specWeightedReadiness = 0;
        var specWeightedConf = 0;
        var specWeight = 0;
        spec.chapterIds.forEach(function (id) {
            var m = metricsMap.get(id);
            if (m) {
                specWeightedReadiness += m.clinicalWeight * m.topicReadiness;
                specWeightedConf += m.clinicalWeight * m.confidence;
                specWeight += m.clinicalWeight;
            }
        });
        var score = specWeight > 0 ? Math.round(specWeightedReadiness / specWeight) : 0;
        var confidence = specWeight > 0 ? Math.round((specWeightedConf / specWeight) * 100) / 100 : 0;
        return {
            name: spec.name,
            score: Math.min(100, Math.max(0, score)),
            chapterIds: spec.chapterIds,
            color: spec.color,
            confidence: confidence,
        };
    });
    // Calculate Critical Coverage
    var criticalReadCount = 0;
    var criticalTotal = 0;
    metricsMap.forEach(function (m) {
        if (m.isCritical) {
            criticalTotal++;
            if (m.isRead)
                criticalReadCount++;
        }
    });
    var criticalCoverageRatio = criticalTotal > 0 ? criticalReadCount / criticalTotal : 1.0;
    // Determine Recommendation Mode and Chapter
    var recentEvents = params.recentEvents || [];
    var last4AcceptedModes = recentEvents
        .filter(function (e) { return e.action === 'accepted'; })
        .slice(0, 4)
        .map(function (e) { return e.mode; });
    var hasRecentExpansion = last4AcceptedModes.includes('expansion');
    var selectedMode = 'remediation';
    var chosenMetric = null;
    var rawCandidatesList = Array.from(metricsMap.values());
    var excludeSet = new Set(params.excludeChapterIds || []);
    var candidatesList = rawCandidatesList.filter(function (m) { return !excludeSet.has(m.chapterId); });
    var effectiveCandidates = candidatesList.length > 0 ? candidatesList : rawCandidatesList;
    if (surface === 'plantao') {
        var readCandidates = effectiveCandidates.filter(function (m) { return m.isRead; });
        var maintenanceDueCandidate = readCandidates.find(function (m) { return m.dueRatio >= 1.0; });
        if (maintenanceDueCandidate) {
            selectedMode = 'maintenance';
            readCandidates.sort(function (a, b) { return b.maintenanceScore - a.maintenanceScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId; });
            chosenMetric = readCandidates[0] || null;
        }
        else {
            selectedMode = 'remediation';
            readCandidates.sort(function (a, b) { return b.remediationScore - a.remediationScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId; });
            chosenMetric = readCandidates[0] || null;
        }
    }
    else {
        var maintenanceDue = effectiveCandidates.find(function (m) { return m.isRead && m.dueRatio >= 1.0; });
        if (criticalCoverageRatio < 0.85 || (!hasRecentExpansion && effectiveCandidates.some(function (m) { return !m.isRead; }))) {
            selectedMode = 'expansion';
            var unreadCandidates = effectiveCandidates.filter(function (m) { return !m.isRead; });
            unreadCandidates.sort(function (a, b) { return b.expansionScore - a.expansionScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId; });
            chosenMetric = unreadCandidates[0] || null;
        }
        else if (maintenanceDue) {
            selectedMode = 'maintenance';
            var readCandidates = effectiveCandidates.filter(function (m) { return m.isRead; });
            readCandidates.sort(function (a, b) { return b.maintenanceScore - a.maintenanceScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId; });
            chosenMetric = readCandidates[0] || null;
        }
        else {
            effectiveCandidates.sort(function (a, b) { return b.recommendationScore - a.recommendationScore || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId; });
            chosenMetric = effectiveCandidates[0] || null;
            if (chosenMetric) {
                if (!chosenMetric.isRead) {
                    selectedMode = 'expansion';
                }
                else if (chosenMetric.dueRatio >= 0.8) {
                    selectedMode = 'maintenance';
                }
                else {
                    selectedMode = 'remediation';
                }
            }
        }
    }
    if (params.requestedChapterId && metricsMap.has(params.requestedChapterId)) {
        chosenMetric = metricsMap.get(params.requestedChapterId);
    }
    if (!chosenMetric) {
        chosenMetric = effectiveCandidates[0] || rawCandidatesList[0];
    }
    var buildRecObj = function (metric, mode) {
        var isReRead = metric.isRead && metric.readCount > 0;
        var readLabel = isReRead ? "Revis\u00E3o #".concat(metric.readCount + 1) : '1ª Leitura';
        var reasonMap = {
            remediation: isReRead
                ? "Releitura Recomendada (".concat(readLabel, "): D\u00E9ficit de dom\u00EDnio no Cap\u00EDtulo ").concat(metric.chapterNumber, " (Prontid\u00E3o ").concat(metric.topicReadiness, "% vs Limiar ").concat(metric.dynamicThreshold, "%).")
                : "D\u00E9ficit de dom\u00EDnio identificado no Cap\u00EDtulo ".concat(metric.chapterNumber, " (Dom\u00EDnio ").concat(metric.topicReadiness, "% vs Limiar ").concat(metric.dynamicThreshold, "%)."),
            expansion: "Expans\u00E3o de cat\u00E1logo (".concat(readLabel, ") recomendada para cobrir lacuna no Cap\u00EDtulo ").concat(metric.chapterNumber, " (").concat(metric.category, ")."),
            maintenance: "Releitura de Consolida\u00E7\u00E3o (".concat(readLabel, ") agendada pelo FSRS (Vencimento ").concat(metric.dueRatio.toFixed(1), "x estabilidade)."),
        };
        return {
            recommendedChapterId: metric.chapterId,
            selectedChapterId: metric.chapterId,
            surface: surface,
            mode: mode,
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
    var usedChapterIds = new Set();
    var recommendations = [];
    // 1. Remediation: prefers read chapters with remediationGap > 0
    var remediationCandidates = effectiveCandidates
        .filter(function (m) { return m.isRead; })
        .sort(function (a, b) {
        var aGap = a.remediationGap > 0 ? 1 : 0;
        var bGap = b.remediationGap > 0 ? 1 : 0;
        if (bGap !== aGap)
            return bGap - aGap;
        return b.remediationScore - a.remediationScore;
    });
    var remediationMatch = remediationCandidates.find(function (c) { return !usedChapterIds.has(c.chapterId); });
    if (remediationMatch) {
        recommendations.push(buildRecObj(remediationMatch, 'remediation'));
        usedChapterIds.add(remediationMatch.chapterId);
    }
    // 2. Expansion: prefers unread chapters
    var expansionCandidates = effectiveCandidates
        .filter(function (m) { return !m.isRead; })
        .sort(function (a, b) { return b.expansionScore - a.expansionScore; });
    var expansionMatch = expansionCandidates.find(function (c) { return !usedChapterIds.has(c.chapterId); });
    if (expansionMatch) {
        recommendations.push(buildRecObj(expansionMatch, 'expansion'));
        usedChapterIds.add(expansionMatch.chapterId);
    }
    // 3. Maintenance: prefers read chapters with dueRatio >= 0.8
    var maintenanceCandidates = effectiveCandidates
        .filter(function (m) { return m.isRead; })
        .sort(function (a, b) {
        var aDue = a.dueRatio >= 0.8 ? 1 : 0;
        var bDue = b.dueRatio >= 0.8 ? 1 : 0;
        if (bDue !== aDue)
            return bDue - aDue;
        return b.maintenanceScore - a.maintenanceScore;
    });
    var maintenanceMatch = maintenanceCandidates.find(function (c) { return !usedChapterIds.has(c.chapterId); });
    if (maintenanceMatch) {
        recommendations.push(buildRecObj(maintenanceMatch, 'maintenance'));
        usedChapterIds.add(maintenanceMatch.chapterId);
    }
    // Fallback if fewer than 3 recommendations were found
    if (recommendations.length < 3) {
        var fallbackList = __spreadArray([], effectiveCandidates, true).sort(function (a, b) { return b.recommendationScore - a.recommendationScore; });
        for (var _i = 0, fallbackList_1 = fallbackList; _i < fallbackList_1.length; _i++) {
            var cand = fallbackList_1[_i];
            if (recommendations.length >= 3)
                break;
            if (!usedChapterIds.has(cand.chapterId)) {
                var mode = cand.isRead
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
    var primaryRec = buildRecObj(chosenMetric, selectedMode);
    var snapshot = {
        calculatedAt: now.toISOString(),
        algorithmVersion: exports.ALGORITHM_VERSION,
        globalReadiness: globalReadiness,
        unadjustedReadiness: Math.round(unadjustedReadiness * 10) / 10,
        criticalGapPenalty: Math.round(criticalPenaltyTotal * 10) / 10,
        globalConfidence: globalConfidence,
        confidenceLabel: confidenceLabel,
        readinessStatus: readinessStatus,
        totalReadChapters: readCount,
        totalEvaluations: totalEvaluations,
        specialtyScores: specialtyScores,
        chapterMetrics: Object.fromEntries(metricsMap),
        recommendation: primaryRec,
        recommendations: recommendations,
    };
    return snapshot;
}
// Select multiple chapters for Modo Plantão with max 2 per section constraint
function selectPlantaoBedsWithEngine(params) {
    var snapshot = params.snapshot, _a = params.bedCount, bedCount = _a === void 0 ? 4 : _a, _b = params.maxPerSection, maxPerSection = _b === void 0 ? 2 : _b;
    var allMetrics = Object.values(snapshot.chapterMetrics);
    var readMetrics = allMetrics.filter(function (m) { return m.isRead; });
    if (readMetrics.length === 0)
        return [];
    // Sort candidates by highest urgency (remediation gap or maintenance dueRatio or clinical weight)
    var pool = __spreadArray([], readMetrics, true).sort(function (a, b) {
        var scoreA = 0.50 * a.remediationScore + 0.30 * a.maintenanceScore + 0.20 * a.clinicalWeight;
        var scoreB = 0.50 * b.remediationScore + 0.30 * b.maintenanceScore + 0.20 * b.clinicalWeight;
        return scoreB - scoreA || b.clinicalWeight - a.clinicalWeight || a.chapterId - b.chapterId;
    });
    var selected = [];
    var sectionCounts = new Map();
    for (var _i = 0, pool_1 = pool; _i < pool_1.length; _i++) {
        var item = pool_1[_i];
        if (selected.length >= bedCount)
            break;
        var secCount = sectionCounts.get(item.sectionNumber) || 0;
        if (secCount < maxPerSection) {
            var mode = item.dueRatio >= 1.0 ? 'maintenance' : 'remediation';
            selected.push({ chapterId: item.chapterId, mode: mode, metrics: item });
            sectionCounts.set(item.sectionNumber, secCount + 1);
        }
    }
    // Fallback if section constraint was too tight
    if (selected.length < bedCount) {
        var _loop_1 = function (item) {
            if (selected.length >= bedCount)
                return "break";
            if (!selected.some(function (s) { return s.chapterId === item.chapterId; })) {
                var mode = item.dueRatio >= 1.0 ? 'maintenance' : 'remediation';
                selected.push({ chapterId: item.chapterId, mode: mode, metrics: item });
            }
        };
        for (var _c = 0, pool_2 = pool; _c < pool_2.length; _c++) {
            var item = pool_2[_c];
            var state_1 = _loop_1(item);
            if (state_1 === "break")
                break;
        }
    }
    return selected;
}
// Calculate FSRS update upon completing a review or test bed
function calculateFSRSUpdate(currentStat, bedScore /* 0.0 to 10.0 */, now) {
    if (now === void 0) { now = new Date(); }
    var easeFactor = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.ease_factor) || 2.5;
    var interval = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.interval_days) || 1;
    var stability = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.stability) || 3.0;
    var difficulty = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.difficulty) || 5.0;
    var timesReviewed = ((currentStat === null || currentStat === void 0 ? void 0 : currentStat.times_reviewed) || 0) + 1;
    var timesCorrect = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.times_correct) || 0;
    var timesIncorrect = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.times_incorrect) || 0;
    // Grade G on scale 1-4
    // Score 0-3.9 -> Grade 1 (Again), Score 4-5.9 -> Grade 2 (Hard), Score 6-7.9 -> Grade 3 (Good), Score 8-10 -> Grade 4 (Easy)
    var grade;
    if (bedScore < 4.0)
        grade = 1;
    else if (bedScore < 6.0)
        grade = 2;
    else if (bedScore < 8.0)
        grade = 3;
    else
        grade = 4;
    var isSuccess = grade >= 2;
    if (isSuccess) {
        timesCorrect += 1;
    }
    else {
        timesIncorrect += 1;
    }
    // Calculate elapsed days since last evidence
    var elapsedDays = 1.0;
    if (currentStat === null || currentStat === void 0 ? void 0 : currentStat.last_evidence_at) {
        var lastDate = new Date(currentStat.last_evidence_at);
        elapsedDays = Math.max(0.1, (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    // FSRS 4.5 Update Rules
    if (isSuccess) {
        difficulty = Math.min(10.0, Math.max(1.0, difficulty - 0.4 * (grade - 3)));
        var retentionAtReview = Math.exp(-Math.LN2 * elapsedDays / stability);
        var growthFactor = 1.0 + 2.5 * (1.0 - retentionAtReview) * Math.exp(0.08 * (10.0 - difficulty));
        stability = Math.min(365.0, Math.max(1.0, stability * growthFactor));
        var intervalFromRetention = stability * (-Math.log(exports.DESIRED_RETENTION) / Math.LN2);
        interval = Math.max(1, Math.round(intervalFromRetention));
        easeFactor = Math.min(3.5, Math.max(1.3, easeFactor + 0.1));
    }
    else {
        difficulty = Math.min(10.0, Math.max(1.0, difficulty + 0.8));
        stability = Math.max(1.0, stability * 0.5);
        interval = 1;
        easeFactor = Math.max(1.3, easeFactor - 0.2);
    }
    var nextReviewDate = new Date(now.getTime());
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
function calculateFSRSManualReadUpdate(currentStat, now) {
    if (now === void 0) { now = new Date(); }
    var easeFactor = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.ease_factor) || 2.5;
    var stability = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.stability) || 3.0;
    var difficulty = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.difficulty) || 5.0;
    var timesReviewed = ((currentStat === null || currentStat === void 0 ? void 0 : currentStat.times_reviewed) || 0) + 1;
    var timesCorrect = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.times_correct) || 0;
    var timesIncorrect = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.times_incorrect) || 0;
    // Re-reading reinforces memory stability S by 35% (up to 365 days)
    stability = Math.min(365.0, Math.max(3.0, stability * 1.35));
    var intervalFromRetention = stability * (-Math.log(exports.DESIRED_RETENTION) / Math.LN2);
    var interval = Math.max(1, Math.round(intervalFromRetention));
    var nextReviewDate = new Date(now.getTime());
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
function calculateFSRSRereadWithQuiz(currentStat, quizCorrect, quizTotal, now) {
    if (now === void 0) { now = new Date(); }
    var passRate = quizTotal > 0 ? quizCorrect / quizTotal : 0;
    var stabilityMultiplier = passRate >= 0.66 ? 1.35 : 1.10;
    var stability = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.stability) || 3.0;
    var easeFactor = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.ease_factor) || 2.5;
    var difficulty = (currentStat === null || currentStat === void 0 ? void 0 : currentStat.difficulty) || 5.0;
    var timesReviewed = ((currentStat === null || currentStat === void 0 ? void 0 : currentStat.times_reviewed) || 0) + 1;
    var timesCorrect = ((currentStat === null || currentStat === void 0 ? void 0 : currentStat.times_correct) || 0) + quizCorrect;
    var timesIncorrect = ((currentStat === null || currentStat === void 0 ? void 0 : currentStat.times_incorrect) || 0) + (quizTotal - quizCorrect);
    stability = Math.min(365.0, Math.max(3.0, stability * stabilityMultiplier));
    if (passRate >= 0.66) {
        difficulty = Math.max(1.0, difficulty - 0.2);
    }
    else {
        difficulty = Math.min(10.0, difficulty + 0.3);
    }
    var intervalFromRetention = stability * (-Math.log(exports.DESIRED_RETENTION) / Math.LN2);
    var interval = Math.max(1, Math.round(intervalFromRetention));
    var nextReviewDate = new Date(now.getTime());
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
