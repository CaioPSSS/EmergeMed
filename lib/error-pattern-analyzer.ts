export interface ErrorPatternTag {
  id: string;
  user_id: string;
  test_id: string;
  question_id: number;
  chapter_id: number;
  competency: 'farmacologia' | 'diagnostico' | 'conduta' | 'ventilacao' | 'prescricao_geral';
  severity: 'critico' | 'moderado' | 'leve';
  error_description: string;
  created_at: string;
}

export interface CompetencyErrorSummary {
  competency: string;
  label: string;
  icon: string;
  errorCount: number;
  criticalCount: number;
  recentTrend: 'improving' | 'stable' | 'worsening';
  affectedChapters: number[];
  recommendation: string;
}

export interface ErrorPatternReport {
  summaries: CompetencyErrorSummary[];
  totalErrors: number;
  totalCritical: number;
}

const COMPETENCY_LABELS: Record<string, { label: string; icon: string; rec: string }> = {
  farmacologia: {
    label: 'Farmacologia & Doses',
    icon: '💊',
    rec: 'Atenção para dose, via, intervalo de administração e ajuste para disfunção renal/hepática.',
  },
  diagnostico: {
    label: 'Raciocínio Diagnóstico',
    icon: '🩺',
    rec: 'Rever critérios diagnósticos e exames complementares indicados na primeira hora.',
  },
  conduta: {
    label: 'Conduta / Sequenciamento',
    icon: '⚡',
    rec: 'Priorizar o sequenciamento rápido de condutas na Sala Vermelha (estabilização -> suporte -> etiologia).',
  },
  ventilacao: {
    label: 'Ventilação Mecânica',
    icon: '🫁',
    rec: 'Revisar cálculo de Vt predito (6 mL/kg), titulação PEEP x FiO2 e modos de suporte.',
  },
  prescricao_geral: {
    label: 'Prescrição de Emergência',
    icon: '📋',
    rec: 'Verificar omissão de profilaxias (TEV/úlcera de estresse), reposição volêmica e soluções de manutenção.',
  },
};

export function analyzeErrorPatterns(tags: ErrorPatternTag[]): ErrorPatternReport {
  const map = new Map<string, { total: number; critical: number; chapters: Set<number>; recentCount: number; olderCount: number }>();

  const now = new Date();
  const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

  tags.forEach((tag) => {
    if (!map.has(tag.competency)) {
      map.set(tag.competency, { total: 0, critical: 0, chapters: new Set(), recentCount: 0, olderCount: 0 });
    }
    const item = map.get(tag.competency)!;
    item.total += 1;
    if (tag.severity === 'critico') item.critical += 1;
    item.chapters.add(tag.chapter_id);

    const tagDate = new Date(tag.created_at);
    if (tagDate >= fifteenDaysAgo) {
      item.recentCount += 1;
    } else {
      item.olderCount += 1;
    }
  });

  let totalErrors = 0;
  let totalCritical = 0;

  const summaries: CompetencyErrorSummary[] = [];

  map.forEach((data, comp) => {
    totalErrors += data.total;
    totalCritical += data.critical;

    let recentTrend: 'improving' | 'stable' | 'worsening' = 'stable';
    if (data.recentCount > data.olderCount * 1.3) recentTrend = 'worsening';
    else if (data.recentCount < data.olderCount * 0.7) recentTrend = 'improving';

    const info = COMPETENCY_LABELS[comp] || { label: comp, icon: '⚠️', rec: 'Revisar erros do histórico.' };

    summaries.push({
      competency: comp,
      label: info.label,
      icon: info.icon,
      errorCount: data.total,
      criticalCount: data.critical,
      recentTrend,
      affectedChapters: Array.from(data.chapters),
      recommendation: info.rec,
    });
  });

  summaries.sort((a, b) => b.errorCount - a.errorCount);

  return { summaries, totalErrors, totalCritical };
}
