'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CHAPTERS_DATA, Chapter } from '@/lib/chapters-data';
import { ReadinessEngineSnapshot, calculateFSRSRereadWithQuiz, calculateFSRSManualReadUpdate } from '@/lib/learning-engine';
import { recordActivityAndAwardXP, getGamificationSnapshot } from '@/lib/gamification-engine';
import { analyzeErrorPatterns, ErrorPatternReport } from '@/lib/error-pattern-analyzer';
import { RereadQuizModal } from '@/components/RereadQuizModal';
import {
  Shuffle,
  CheckCircle2,
  BookOpen,
  FileQuestion,
  Award,
  Sparkles,
  Search,
  Activity,
  Stethoscope,
  ShieldCheck,
  Zap,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  HeartPulse,
  Brain,
  Info,
  Clock,
  Gauge,
  Flame,
} from 'lucide-react';

interface SpecialtyScore {
  name: string;
  score: number; // 0 - 100
  chapterIds: number[];
  color: string;
  confidence?: number;
}

// Responsive SVG Radar Chart Component
function MedicalRadarChart({ data }: { data: SpecialtyScore[] }) {
  const cx = 200;
  const cy = 200;
  const radius = 110;
  const numAxes = data.length || 5;

  const points = data.map((item, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / numAxes;
    const r = radius * (Math.max(10, Math.min(100, item.score)) / 100);
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return { x, y, angle, item };
  });

  const polygonPointsStr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <div style={{ width: '100%', maxWidth: '420px', margin: '0 auto', position: 'relative' }}>
      <svg viewBox="0 0 400 400" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <defs>
          <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        {gridLevels.map((level, idx) => {
          const rLevel = radius * level;
          const levelPoints = data
            .map((_, i) => {
              const angle = -Math.PI / 2 + (i * 2 * Math.PI) / numAxes;
              const x = cx + rLevel * Math.cos(angle);
              const y = cy + rLevel * Math.sin(angle);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');

          return (
            <polygon
              key={`grid-${idx}`}
              points={levelPoints}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="1"
              strokeDasharray={idx < 4 ? '3,3' : undefined}
            />
          );
        })}

        {data.map((_, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / numAxes;
          const x = cx + radius * Math.cos(angle);
          const y = cy + radius * Math.sin(angle);
          return (
            <line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="1.5"
            />
          );
        })}

        <polygon
          points={polygonPointsStr}
          fill="url(#radarGradient)"
          stroke="#10b981"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {points.map((p, i) => {
          const labelRadius = radius + 32;
          const lx = cx + labelRadius * Math.cos(p.angle);
          const ly = cy + labelRadius * Math.sin(p.angle);

          let textAnchor: 'middle' | 'start' | 'end' | 'inherit' = 'middle';
          if (Math.abs(Math.cos(p.angle)) > 0.3) {
            textAnchor = Math.cos(p.angle) > 0 ? 'start' : 'end';
          }

          return (
            <g key={`node-${i}`}>
              <circle
                cx={p.x}
                cy={p.y}
                r="5"
                fill={p.item.color}
                stroke="#0f172a"
                strokeWidth="2"
              />
              <text
                x={p.x}
                y={p.y - 10}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="11"
                fontWeight="700"
              >
                {Math.round(p.item.score)}%
              </text>
              <text
                x={lx}
                y={ly}
                textAnchor={textAnchor}
                fill="#f8fafc"
                fontSize="12"
                fontWeight="700"
              >
                {p.item.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [snapshot, setSnapshot] = useState<ReadinessEngineSnapshot | null>(null);
  const [readChapterIds, setReadChapterIds] = useState<number[]>([]);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [drawingNext, setDrawingNext] = useState<boolean>(false);
  const [stats, setStats] = useState({
    totalRead: 0,
    testsCompleted: 0,
    averageScore: 0,
  });

  const [showTestModal, setShowTestModal] = useState<boolean>(false);
  const [showManualSelectModal, setShowManualSelectModal] = useState<boolean>(false);
  const [manualSearch, setManualSearch] = useState<string>('');

  const [excludedFromSession, setExcludedFromSession] = useState<number[]>([]);
  const [rereadQuizTarget, setRereadQuizTarget] = useState<Chapter | null>(null);
  const [gamificationData, setGamificationData] = useState<any>(null);
  const [errorPatternReport, setErrorPatternReport] = useState<ErrorPatternReport | null>(null);

  async function fetchEngineRecommendation(chapterIdOverride?: number, excludeStr?: string) {
    try {
      let url = '/api/recommendations?surface=dashboard';
      if (chapterIdOverride) url += `&chapterId=${chapterIdOverride}`;
      if (excludeStr) url += `&exclude=${excludeStr}`;

      const res = await fetch(url);
      if (res.ok) {
        const snap: ReadinessEngineSnapshot = await res.json();
        setSnapshot(snap);

        const chosenId = snap.recommendation?.selectedChapterId;
        const capObj = CHAPTERS_DATA.find((c) => c.id === chosenId);
        if (capObj) {
          setCurrentChapter(capObj);
        }

        // Log shown event
        await fetch('/api/recommendations/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recommendedChapterId: snap.recommendation.recommendedChapterId,
            selectedChapterId: chosenId,
            surface: 'dashboard',
            mode: snap.recommendation.mode,
            prioritySnapshot: snap.recommendation.factors,
            action: 'shown',
          }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to fetch recommendation engine data:', err);
    }
  }

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: progress } = await supabase
          .from('chapter_progress')
          .select('chapter_id, is_read')
          .eq('user_id', user.id)
          .eq('is_read', true);

        const readIds = progress ? progress.map((p) => p.chapter_id) : [];
        setReadChapterIds(readIds);

        const { data: testsData } = await supabase
          .from('tests')
          .select('score, completed')
          .eq('user_id', user.id)
          .eq('completed', true);

        const validTests = testsData ? testsData.filter((t) => t.score !== null && t.score !== undefined) : [];
        const testsCount = validTests.length;
        const avg =
          testsCount > 0
            ? Math.round((validTests.reduce((acc, curr) => acc + Number(curr.score), 0) / testsCount) * 10) / 10
            : 0;

        setStats({
          totalRead: readIds.length,
          testsCompleted: testsCount,
          averageScore: avg,
        });

        try {
          const gSnap = await getGamificationSnapshot(supabase, user.id);
          setGamificationData(gSnap);
        } catch (e) {
          console.warn('Failed to load gamification snapshot:', e);
        }

        try {
          const { data: errorTagsData } = await supabase
            .from('error_pattern_tags')
            .select('*')
            .eq('user_id', user.id);

          if (errorTagsData && errorTagsData.length > 0) {
            const report = analyzeErrorPatterns(errorTagsData);
            setErrorPatternReport(report);
          }
        } catch (e) {
          console.warn('Failed to load error pattern tags:', e);
        }

        await fetchEngineRecommendation();
      }
      setLoading(false);
    }

    loadDashboardData();
  }, []);

  const handleDrawNextChapter = async () => {
    if (!snapshot) return;
    setDrawingNext(true);

    const currentlyDisplayed = (snapshot.recommendations || [snapshot.recommendation])
      .filter(Boolean)
      .map((r) => r.selectedChapterId);

    const newExcluded = Array.from(
      new Set([...excludedFromSession, ...currentlyDisplayed, ...(currentChapter ? [currentChapter.id] : [])])
    );
    setExcludedFromSession(newExcluded);

    const excludeParam = newExcluded.join(',');
    const rec = snapshot.recommendation;
    if (rec) {
      await fetch('/api/recommendations/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendedChapterId: rec.recommendedChapterId,
          selectedChapterId: rec.selectedChapterId,
          surface: 'dashboard',
          mode: rec.mode,
          prioritySnapshot: rec.factors,
          action: 'rerolled',
        }),
      }).catch(() => {});
    }

    await fetchEngineRecommendation(undefined, excludeParam);
    setDrawingNext(false);
  };

  const handleMarkAsRead = async (chapter?: Chapter) => {
    const target = chapter || currentChapter;
    if (!target) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const isAlreadyRead = readChapterIds.includes(target.id);
      const { data: currentProg } = await supabase
        .from('chapter_progress')
        .select('read_count, last_read_at')
        .eq('user_id', user.id)
        .eq('chapter_id', target.id)
        .maybeSingle();

      const currentCount = currentProg?.read_count || (isAlreadyRead ? 1 : 0);
      const newCount = currentCount + 1;
      const nowIso = new Date().toISOString();

      await supabase.from('chapter_progress').upsert({
        user_id: user.id,
        chapter_id: target.id,
        is_read: true,
        read_at: currentProg?.last_read_at || nowIso,
        read_count: newCount,
        last_read_at: nowIso,
      });

      await supabase.from('chapter_read_logs').insert({
        user_id: user.id,
        chapter_id: target.id,
        read_count_snapshot: newCount,
        source: isAlreadyRead ? 'reread_dashboard' : 'first_read_dashboard',
      });

      const { data: stat } = await supabase
        .from('chapter_review_stats')
        .select('*')
        .eq('user_id', user.id)
        .eq('chapter_id', target.id)
        .maybeSingle();

      const fsrsUpdate = calculateFSRSManualReadUpdate(stat);
      await supabase.from('chapter_review_stats').upsert({
        user_id: user.id,
        chapter_id: target.id,
        ...fsrsUpdate,
      });

      await recordActivityAndAwardXP(supabase, user.id, { type: 'first_read' });
    }

    router.push(`/testes?chapterId=${target.id}`);
  };

  const handleSelectChapterManually = async (cap: Chapter) => {
    if (!snapshot) return;
    setCurrentChapter(cap);
    setShowManualSelectModal(false);

    const rec = snapshot.recommendation;
    await fetch('/api/recommendations/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recommendedChapterId: rec.recommendedChapterId,
        selectedChapterId: cap.id,
        surface: 'dashboard',
        mode: rec.mode,
        prioritySnapshot: rec.factors,
        action: 'manual_selected',
      }),
    }).catch(() => {});

    await fetchEngineRecommendation(cap.id);
  };

  const isCurrentRead = currentChapter ? readChapterIds.includes(currentChapter.id) : false;
  const filteredChapters = CHAPTERS_DATA.filter(
    (c) =>
      c.title.toLowerCase().includes(manualSearch.toLowerCase()) ||
      c.sectionTitle.toLowerCase().includes(manualSearch.toLowerCase())
  );

  const currentMetrics = currentChapter && snapshot?.chapterMetrics
    ? snapshot.chapterMetrics[currentChapter.id]
    : null;

  const globalReadinessScore = snapshot ? Math.round(snapshot.globalReadiness) : 0;
  const confidence = snapshot ? snapshot.globalConfidence : 0;

  // Badge Logic for UPA Readiness
  let readinessBadge = {
    label: snapshot?.readinessStatus.label || 'CAPACITAÇÃO EM ANDAMENTO (ESTIMATIVA INICIAL)',
    color: snapshot?.readinessStatus.color || '#38bdf8',
    bg: snapshot?.readinessStatus.bg || 'rgba(14, 165, 233, 0.15)',
    border: snapshot?.readinessStatus.border || 'rgba(14, 165, 233, 0.3)',
    icon: confidence < 0.40 ? Brain : globalReadinessScore >= 80 ? ShieldCheck : AlertTriangle,
    description: snapshot?.readinessStatus.description || 'Avaliação conservadora inicial com baixa confiança acumulada.',
  };

  const BadgeIcon = readinessBadge.icon;

  const modeBadgeMap = {
    remediation: { label: 'Remediação de Lacuna', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)' },
    expansion: { label: 'Expansão de Catálogo', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' },
    maintenance: { label: 'Manutenção FSRS (Revisão)', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.15)' },
  };

  const activeModeBadge = snapshot?.recommendation
    ? modeBadgeMap[snapshot.recommendation.mode]
    : modeBadgeMap.remediation;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="pulse-badge">
              <Brain size={14} /> Motor FSRS + Matriz Epidemiológica UPA
            </span>
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc' }}>
            Central de Preparação Clínica
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Livro Medicina de Emergência — 122 Capítulos de Prática Intensiva
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => router.push('/testes?mode=plantao')}
            className="btn-primary"
            style={{ padding: '12px 20px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)' }}
          >
            <Stethoscope size={18} /> Iniciar Modo Plantão
          </button>

          <button
            onClick={() => router.push('/testes')}
            className="btn-secondary"
            style={{ padding: '12px 20px' }}
          >
            <Sparkles size={18} /> Simulado Clássico
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>Capítulos Lidos</span>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8' }}>
              <BookOpen size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', marginTop: '12px' }}>
            {stats.totalRead} <span style={{ fontSize: '1rem', color: 'var(--text-subtle)', fontWeight: 500 }}>/ {CHAPTERS_DATA.length}</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>Simulados Realizados</span>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
              <FileQuestion size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', marginTop: '12px' }}>
            {stats.testsCompleted}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>Nota Média IA</span>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
              <Award size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', marginTop: '12px' }}>
            {stats.averageScore > 0 ? `${stats.averageScore} / 10` : '—'}
          </div>
        </div>
      </div>
        
        {/* TOP 3 RECOMENDAÇÕES DIÁRIAS (Remediação, Expansão, Manutenção) */}
      {snapshot?.recommendations && snapshot.recommendations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="#38bdf8" />
              <span>Recomendações Clínicas Prioritárias (Top 3 por Modo)</span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowManualSelectModal(true)}
                className="btn-secondary"
                style={{ fontSize: '0.85rem', padding: '8px 14px' }}
              >
                <Search size={16} /> Mudar Capítulo
              </button>
              <button
                onClick={handleDrawNextChapter}
                disabled={drawingNext}
                className="btn-secondary"
                style={{
                  fontSize: '0.85rem',
                  padding: '8px 14px',
                  borderColor: 'rgba(56, 189, 248, 0.4)',
                  color: '#38bdf8',
                }}
              >
                <Shuffle size={16} /> {drawingNext ? 'Calculando...' : 'Sortear de Novo'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {snapshot.recommendations.map((recItem: any) => {
              const cap = CHAPTERS_DATA.find((c) => c.id === recItem.selectedChapterId || c.id === recItem.recommendedChapterId);
              if (!cap) return null;

              const isSelected = currentChapter?.id === cap.id;
              const modeMeta = modeBadgeMap[recItem.mode as keyof typeof modeBadgeMap] || modeBadgeMap.remediation;
              const isRead = readChapterIds.includes(cap.id);
              const factors = recItem.factors;

              return (
                <div
                  key={`${recItem.mode}-${cap.id}`}
                  className="glass-panel"
                  style={{
                    padding: '24px',
                    borderRadius: '16px',
                    border: isSelected ? `2px solid ${modeMeta.color}` : '1px solid var(--border-subtle)',
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.9) 100%)'
                      : 'rgba(15, 23, 42, 0.65)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                    boxShadow: isSelected ? `0 10px 30px ${modeMeta.bg}` : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div>
                    {/* Header Row: Mode Badge + Section */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          background: modeMeta.bg,
                          color: modeMeta.color,
                          border: `1px solid ${modeMeta.color}`,
                          letterSpacing: '0.04em',
                        }}
                      >
                        MODO {modeMeta.label.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>
                        Seção {cap.sectionNumber}
                      </span>
                    </div>

                    {/* Chapter Title */}
                    <h3
                      onClick={() => {
                        setCurrentChapter(cap);
                        fetchEngineRecommendation(cap.id);
                      }}
                      style={{
                        fontSize: '1.15rem',
                        fontWeight: 800,
                        color: '#ffffff',
                        marginBottom: '6px',
                        cursor: 'pointer',
                        lineHeight: 1.3,
                      }}
                    >
                      Cap. {cap.number}: {cap.title}
                    </h3>

                    {/* Reason */}
                    <p style={{ fontSize: '0.82rem', color: '#34d399', fontWeight: 600, marginBottom: '14px', lineHeight: 1.4 }}>
                      💡 {recItem.reason}
                    </p>

                    {/* FSRS Factors Breakdown */}
                    {factors && (
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '8px',
                          background: 'rgba(0, 0, 0, 0.25)',
                          padding: '12px',
                          borderRadius: '10px',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                        }}
                      >
                        <div>
                          Domínio:{' '}
                          <strong style={{ color: factors.readiness >= factors.dynamicThreshold ? '#34d399' : '#fb923c' }}>
                            {factors.readiness}%
                          </strong>
                        </div>
                        <div>
                          Limiar: <strong style={{ color: '#fff' }}>{factors.dynamicThreshold}%</strong>
                        </div>
                        <div>
                          Retenção: <strong style={{ color: '#38bdf8' }}>{factors.retention}%</strong>
                        </div>
                        <div>
                          Vencimento: <strong style={{ color: '#fbbf24' }}>{factors.dueRatio}x</strong>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <button
                      onClick={() => handleMarkAsRead(cap)}
                      className="btn-primary"
                      style={{ flex: 1, padding: '10px 12px', fontSize: '0.82rem', justifyContent: 'center' }}
                    >
                      <RefreshCw size={15} /> {isRead ? 'Registrar Releitura & Ir para Testes' : 'Marcar 1ª Leitura & Ir para Testes'}
                    </button>
                    <button
                      onClick={() => router.push(`/testes?chapterId=${cap.id}`)}
                      className="btn-secondary"
                      style={{ padding: '10px 12px', fontSize: '0.82rem' }}
                    >
                      <Sparkles size={15} /> Testar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Engine Recommendation Card */}
      <div
        className="glass-panel"
        style={{
          padding: '36px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.75) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, transparent 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Calculando próxima prioridade pelo motor FSRS...
          </div>
        ) : currentChapter ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  background: activeModeBadge.bg,
                  color: activeModeBadge.color,
                  border: `1px solid ${activeModeBadge.color}`,
                }}>
                  MODO {activeModeBadge.label.toUpperCase()}
                </span>

                <span style={{
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}>
                  SEÇÃO {currentChapter.sectionNumber} — {currentChapter.sectionTitle}
                </span>

                {isCurrentRead ? (
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <CheckCircle2 size={14} /> Revisão #{currentMetrics?.readCount || 1}
                  </span>
                ) : (
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <BookOpen size={14} /> 1ª Leitura
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowManualSelectModal(true)}
                  className="btn-secondary"
                  style={{ fontSize: '0.88rem', padding: '8px 14px' }}
                >
                  <Search size={16} /> Mudar Capítulo
                </button>
                <button
                  onClick={handleDrawNextChapter}
                  disabled={drawingNext}
                  className="btn-secondary"
                  style={{
                    fontSize: '0.88rem',
                    padding: '8px 14px',
                    borderColor: 'rgba(56, 189, 248, 0.4)',
                    color: '#38bdf8',
                  }}
                >
                  <Shuffle size={16} /> {drawingNext ? 'Calculando...' : 'Sortear de Novo'}
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.82rem', color: '#34d399', fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Brain size={16} /> {snapshot?.recommendation?.reason}
              </div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.25 }}>
                Capítulo {currentChapter.number}: {currentChapter.title}
              </h2>
            </div>

            {/* FSRS Factors Breakdown */}
            {currentMetrics && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '12px',
                  padding: '16px',
                  borderRadius: '12px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>DOMÍNIO ATUAL</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: currentMetrics.topicReadiness >= currentMetrics.dynamicThreshold ? '#34d399' : '#fb923c' }}>
                    {currentMetrics.topicReadiness}% <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ Alvo {currentMetrics.dynamicThreshold}%</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>RETENÇÃO FSRS</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8' }}>
                    {currentMetrics.retention}% <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(Est. {currentMetrics.stability}d)</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>EVIDÊNCIA & CONFIANÇA</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#a78bfa' }}>
                    {Math.round(currentMetrics.confidence * 100)}% <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({currentMetrics.evidenceCount} testes)</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600 }}>PESO CLÍNICO UPA</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f59e0b' }}>
                    Freq {currentMetrics.frequencyScore}/10 • Imp {currentMetrics.importanceScore}/10
                  </div>
                </div>
              </div>
            )}

            {/* Actions for current chapter */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginTop: '12px',
              paddingTop: '20px',
              borderTop: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
            }}>
              {!isCurrentRead ? (
                <button
                  onClick={() => handleMarkAsRead()}
                  className="btn-primary"
                  style={{ padding: '12px 24px', fontSize: '0.95rem' }}
                >
                  <CheckCircle2 size={18} /> Marcar 1ª Leitura & Ir para Testes
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleMarkAsRead()}
                    className="btn-primary"
                    style={{
                      padding: '12px 24px',
                      fontSize: '0.95rem',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    }}
                  >
                    <RefreshCw size={18} /> Registrar Releitura (Revisão #{(currentMetrics?.readCount || 1) + 1}) & Ir para Testes
                  </button>

                  <button
                    onClick={() => router.push(`/testes?chapterId=${currentChapter.id}`)}
                    className="btn-secondary"
                    style={{ padding: '12px 20px', fontSize: '0.95rem' }}
                  >
                    <Sparkles size={18} /> Criar Teste Sobre Este Capítulo
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* DASHBOARD MEDICAL COMPETENCIES RADAR CHART & UPA READINESS INDICATOR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
        {/* Left Column: UPA Medical Readiness Indicator */}
        <div
          className="glass-panel"
          style={{
            padding: '28px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  padding: '10px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                }}
              >
                <HeartPulse size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>
                  Prontidão Médica da UPA
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Índice Ponderado por Risco & FSRS (0-100)
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: readinessBadge.color, lineHeight: 1 }}>
                {globalReadinessScore}%
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600, marginTop: '2px' }}>
                SCORE GLOBAL
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: readinessBadge.bg,
              border: `1px solid ${readinessBadge.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <BadgeIcon size={20} style={{ color: readinessBadge.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: readinessBadge.color, letterSpacing: '0.04em' }}>
                {readinessBadge.label}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {readinessBadge.description}
              </div>
            </div>
          </div>

          {/* Pedagogical disclaimer for low confidence */}
          {confidence < 0.40 && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                fontSize: '0.78rem',
                color: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Info size={16} color="#38bdf8" style={{ flexShrink: 0 }} />
              <span>
                <strong>Estimativa pedagógica inicial:</strong> Realize plantões e simulados para gerar evidências técnicas e elevar o nível de confiança do seu indicador.
              </span>
            </div>
          )}

          {/* Per-Specialty Progress Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TrendingUp size={16} style={{ color: '#38bdf8' }} /> Desempenho Ponderado por Especialidade UPA
            </div>

            {(snapshot?.specialtyScores || []).map((spec) => (
              <div key={spec.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{spec.name}</span>
                  <span style={{ color: '#fff', fontWeight: 700 }}>{spec.score}%</span>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    borderRadius: '9999px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${spec.score}%`,
                      height: '100%',
                      background: spec.color,
                      borderRadius: '9999px',
                      transition: 'width 0.6s ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Shift Readiness Status Banner */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Zap size={18} style={{ color: '#fbbf24' }} />
              <span style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: 600 }}>
                Status de Prontidão para Plantão Noturno
              </span>
            </div>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '9999px',
                background: globalReadinessScore >= 70 && confidence >= 0.40 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                color: globalReadinessScore >= 70 && confidence >= 0.40 ? '#34d399' : '#fbbf24',
              }}
            >
              {globalReadinessScore >= 70 && confidence >= 0.40 ? 'Escala Liberada' : 'Sob Preceptoria'}
            </span>
          </div>
        </div>

        {/* Right Column: Responsive Radar Chart */}
        <div
          className="glass-panel"
          style={{
            padding: '28px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: '100%', marginBottom: '16px', textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>
              Radar de Competências Médicas
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Avaliação Pentagonal de Especialidades de Emergência UPA (0-100)
            </p>
          </div>

          <MedicalRadarChart data={snapshot?.specialtyScores || []} />
        </div>
      </div>

      {/* Modo Plantão Callout Card */}
      <div
        className="glass-panel"
        style={{
          padding: '28px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(14, 165, 233, 0.08) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#34d399',
              flexShrink: 0,
            }}
          >
            <Stethoscope size={28} />
          </div>

          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
              NÚCLEO DE REPETIÇÃO ESPAÇADA FSRS
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
              Modo Plantão — Leitos UPA & Evolução de Pacientes
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: '600px' }}>
              Revise temas automaticamente priorizados pelo algoritmo FSRS + matriz epidemiológica. Cada leito traz um caso em 4 etapas contínuas.
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push('/testes?mode=plantao')}
          className="btn-primary"
          style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)' }}
        >
          <Stethoscope size={18} /> Iniciar Plantão Noturno
        </button>
      </div>

      {/* Gamification Badges & XP Rewards Section (M5 / Requirement R5) */}
      <div className="glass-panel" style={{ padding: '28px', borderRadius: '20px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b',
            }}>
              <Award size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                Conquistas & Nível da Emergência
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                Badges desbloqueadas e progressão de XP no sistema de gamificação médica
              </p>
            </div>
          </div>

          {gamificationData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 700, color: '#f59e0b' }}>
                <Flame size={18} color="#f59e0b" />
                <span>{gamificationData.currentStreak} dias seguidos</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 700, color: '#10b981' }}>
                <Zap size={18} color="#10b981" />
                <span>{gamificationData.totalXp} XP</span>
              </div>
            </div>
          )}
        </div>

        {/* Level Progress Banner */}
        {gamificationData?.levelInfo && (
          <div
            style={{
              padding: '16px 20px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(16, 185, 129, 0.08))',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                <span style={{ fontSize: '1.2rem' }}>{gamificationData.levelInfo.currentLevel.icon}</span>
                <span>Nível {gamificationData.levelInfo.currentLevel.level}: {gamificationData.levelInfo.currentLevel.title}</span>
              </div>
              <span style={{ fontSize: '0.82rem', color: '#10b981', fontWeight: 700 }}>
                {gamificationData.levelInfo.nextLevel
                  ? `Próximo Nível: ${gamificationData.levelInfo.nextLevel.title} (${gamificationData.levelInfo.nextLevel.xp} XP)`
                  : 'Nível Máximo Alcançado! 👑'}
              </span>
            </div>

            <div className="progress-bar-bg" style={{ height: '8px', background: 'rgba(255, 255, 255, 0.1)' }}>
              <div
                className="progress-bar-fill"
                style={{
                  width: `${gamificationData.levelInfo.progressPercent}%`,
                  background: 'linear-gradient(90deg, #f59e0b, #10b981)',
                }}
              />
            </div>
          </div>
        )}

        {/* Achievements Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
          {(gamificationData?.achievements || []).map((ach: any) => (
            <div
              key={ach.key}
              style={{
                padding: '14px',
                borderRadius: '14px',
                background: ach.unlocked ? 'rgba(16, 185, 129, 0.1)' : 'rgba(15, 23, 42, 0.5)',
                border: ach.unlocked ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(255, 255, 255, 0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                opacity: ach.unlocked ? 1 : 0.65,
                transition: 'all 0.2s ease',
              }}
            >
              <span style={{ fontSize: '2rem', flexShrink: 0 }}>{ach.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: ach.unlocked ? '#f8fafc' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ach.title}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginTop: '2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {ach.desc}
                </div>
                <div style={{ marginTop: '6px', fontSize: '0.7rem', fontWeight: 600, color: ach.unlocked ? '#34d399' : '#64748b' }}>
                  {ach.unlocked ? '✅ Desbloqueado' : '🔒 Bloqueado'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Padrões de Erro Transversais (M11 / Requirement) */}
      {errorPatternReport && errorPatternReport.summaries.length > 0 && (
        <div className="glass-panel" style={{ padding: '28px', borderRadius: '20px', marginTop: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444',
            }}>
              <AlertTriangle size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                Padrões de Erro Transversais & Competências
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                Análise clínica de lacunas recorrentes detectadas em prescrições e simulados
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {errorPatternReport.summaries.map((s) => (
              <div
                key={s.competency}
                style={{
                  padding: '16px',
                  borderRadius: '14px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{s.icon}</span> {s.label}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444', padding: '2px 8px', borderRadius: '9999px', background: 'rgba(239, 68, 68, 0.15)' }}>
                    {s.errorCount} erros ({s.criticalCount} críticos)
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                  {s.recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de confirmação para se testar após concluir leitura */}
      {showTestModal && currentChapter && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '24px',
        }}>
          <div className="glass-panel" style={{ maxWidth: '500px', width: '100%', padding: '32px', textAlign: 'center' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(14, 165, 233, 0.2))',
              border: '1px solid rgba(52, 211, 153, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              color: '#34d399',
            }}>
              <CheckCircle2 size={32} />
            </div>

            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
              Capítulo Concluído com Sucesso!
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '24px' }}>
              Você marcou o <strong>Capítulo {currentChapter.number}: {currentChapter.title}</strong> como lido. Deseja gerar um teste de fixeza imediato sobre este tema?
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setShowTestModal(false);
                  handleDrawNextChapter();
                }}
                className="btn-secondary"
                style={{ flex: 1, padding: '12px' }}
              >
                Apenas Sortear Próximo
              </button>

              <button
                onClick={() => {
                  setShowTestModal(false);
                  router.push(`/testes?chapterId=${currentChapter.id}`);
                }}
                className="btn-primary"
                style={{ flex: 1, padding: '12px' }}
              >
                <Sparkles size={18} /> Testar Agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Seleção Manual de Capítulo */}
      {showManualSelectModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '24px',
        }}>
          <div className="glass-panel" style={{ maxWidth: '640px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                Selecionar Capítulo Manualmente
              </h3>
              <button
                onClick={() => setShowManualSelectModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input
                type="text"
                className="input-field"
                style={{ paddingLeft: '42px' }}
                placeholder="Buscar por título ou número..."
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
              />
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredChapters.map((cap) => {
                const isRead = readChapterIds.includes(cap.id);
                return (
                  <div
                    key={cap.id}
                    onClick={() => handleSelectChapterManually(cap)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                  >
                    <div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
                        Seção {cap.sectionNumber}: {cap.sectionTitle}
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
                        Cap. {cap.number}: {cap.title}
                      </div>
                    </div>

                    {isRead ? (
                      <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={14} /> Lido
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Não lido</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Quiz de Releitura (M3) */}
      {rereadQuizTarget && (
        <RereadQuizModal
          chapterId={rereadQuizTarget.id}
          chapterNumber={rereadQuizTarget.number}
          chapterTitle={rereadQuizTarget.title}
          onClose={() => setRereadQuizTarget(null)}
          onSuccess={async () => {
            setRereadQuizTarget(null);
            await fetchEngineRecommendation();
            setShowTestModal(true);
          }}
        />
      )}
    </div>
  );
}
