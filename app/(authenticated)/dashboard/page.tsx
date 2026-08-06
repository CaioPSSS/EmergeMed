'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CHAPTERS_DATA, Chapter } from '@/lib/chapters-data';
import { ReadinessEngineSnapshot, calculateFSRSManualReadUpdate } from '@/lib/learning-engine';
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

  async function fetchEngineRecommendation(chapterIdOverride?: number) {
    try {
      const url = chapterIdOverride
        ? `/api/recommendations?surface=dashboard&chapterId=${chapterIdOverride}`
        : `/api/recommendations?surface=dashboard`;
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

        await fetchEngineRecommendation();
      }
      setLoading(false);
    }

    loadDashboardData();
  }, []);

  const handleDrawNextChapter = async () => {
    if (!snapshot) return;
    setDrawingNext(true);

    const rec = snapshot.recommendation;
    // Log rerolled event for audit without mutating user metrics
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

    // Fetch next recommendation deterministically
    await fetchEngineRecommendation();
    setDrawingNext(false);
  };

  const handleMarkAsRead = async () => {
    if (!currentChapter || !snapshot) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const isAlreadyRead = readChapterIds.includes(currentChapter.id);
    const newReadIds = isAlreadyRead ? readChapterIds : Array.from(new Set([...readChapterIds, currentChapter.id]));
    setReadChapterIds(newReadIds);
    setStats((prev) => ({ ...prev, totalRead: newReadIds.length }));

    const currentMetrics = snapshot.chapterMetrics[currentChapter.id];
    const currentCount = currentMetrics?.readCount || (isAlreadyRead ? 1 : 0);
    const newCount = isAlreadyRead ? currentCount + 1 : 1;
    const nowIso = new Date().toISOString();

    // 1. Update chapter_progress
    await supabase.from('chapter_progress').upsert({
      user_id: user.id,
      chapter_id: currentChapter.id,
      is_read: true,
      read_at: currentMetrics?.readAt || nowIso,
      read_count: newCount,
      last_read_at: nowIso,
    });

    // 2. Insert into chapter_read_logs
    await supabase.from('chapter_read_logs').insert({
      user_id: user.id,
      chapter_id: currentChapter.id,
      read_count_snapshot: newCount,
      source: 'dashboard_recommendation',
    });

    // 3. Update FSRS chapter_review_stats for manual read
    const { data: stat } = await supabase
      .from('chapter_review_stats')
      .select('*')
      .eq('user_id', user.id)
      .eq('chapter_id', currentChapter.id)
      .maybeSingle();

    const fsrsUpdate = calculateFSRSManualReadUpdate(stat);
    await supabase.from('chapter_review_stats').upsert({
      user_id: user.id,
      chapter_id: currentChapter.id,
      ...fsrsUpdate,
    });

    // 4. Log recommendation event
    const rec = snapshot.recommendation;
    await fetch('/api/recommendations/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recommendedChapterId: rec.recommendedChapterId,
        selectedChapterId: currentChapter.id,
        surface: 'dashboard',
        mode: rec.mode,
        prioritySnapshot: rec.factors,
        action: 'accepted',
      }),
    }).catch(() => {});

    await fetchEngineRecommendation(currentChapter.id);
    setShowTestModal(true);
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
                  onClick={handleMarkAsRead}
                  className="btn-primary"
                  style={{ padding: '12px 24px', fontSize: '0.95rem' }}
                >
                  <CheckCircle2 size={18} /> Marcar 1ª Leitura como Concluída
                </button>
              ) : (
                <>
                  <button
                    onClick={handleMarkAsRead}
                    className="btn-primary"
                    style={{
                      padding: '12px 24px',
                      fontSize: '0.95rem',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    }}
                  >
                    <RefreshCw size={18} /> Registrar Releitura Concluída (Revisão #{(currentMetrics?.readCount || 1) + 1})
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

              <button
                onClick={handleDrawNextChapter}
                className="btn-secondary"
                style={{ padding: '12px 20px', fontSize: '0.95rem' }}
              >
                <RefreshCw size={18} /> Sortear Próxima Sugestão
              </button>
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
    </div>
  );
}
