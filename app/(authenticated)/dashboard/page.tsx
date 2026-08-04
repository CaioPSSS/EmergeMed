'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CHAPTERS_DATA, Chapter } from '@/lib/chapters-data';
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
} from 'lucide-react';

interface SpecialtyScore {
  name: string;
  score: number; // 0 - 100
  chapterIds: number[];
  color: string;
}

// 5 Emergency Medical Specialties for UPA Readiness
const SPECIALTIES_CONFIG: { name: string; chapterIds: number[]; color: string }[] = [
  {
    name: 'Cardiologia',
    chapterIds: [29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
    color: '#ef4444', // Red / Rose
  },
  {
    name: 'Pneumologia',
    chapterIds: [2, 6, 7, 41, 42, 43, 44, 45, 46, 47],
    color: '#38bdf8', // Sky Blue
  },
  {
    name: 'Infectologia',
    chapterIds: [9, 48, 49, 50, 51, 52, 71],
    color: '#10b981', // Emerald Green
  },
  {
    name: 'Traumatologia',
    chapterIds: [62, 63, 64, 65, 66, 67, 68, 69],
    color: '#f59e0b', // Amber
  },
  {
    name: 'Terapia Intensiva',
    chapterIds: [1, 3, 4, 5, 8, 10, 13, 78, 80],
    color: '#a855f7', // Purple
  },
];

// Responsive SVG Radar Chart Component
function MedicalRadarChart({ data }: { data: SpecialtyScore[] }) {
  const cx = 200;
  const cy = 200;
  const radius = 110;
  const numAxes = data.length; // 5

  // Calculate polygon points
  const points = data.map((item, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / numAxes;
    const r = radius * (Math.max(10, Math.min(100, item.score)) / 100);
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return { x, y, angle, item };
  });

  const polygonPointsStr = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Grid levels (20%, 40%, 60%, 80%, 100%)
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

        {/* Concentric Pentagon Background Grids */}
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

        {/* Axis Lines from center */}
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

        {/* Filled Competence Polygon */}
        <polygon
          points={polygonPointsStr}
          fill="url(#radarGradient)"
          stroke="#10b981"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Data Point Nodes and Labels */}
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
              {/* Vertex Circle */}
              <circle
                cx={p.x}
                cy={p.y}
                r="5"
                fill={p.item.color}
                stroke="#0f172a"
                strokeWidth="2"
              />

              {/* Score Badge Text on Node */}
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

              {/* Specialty Name Label */}
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

  const [readChapterIds, setReadChapterIds] = useState<number[]>([]);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [stats, setStats] = useState({
    totalRead: 0,
    testsCompleted: 0,
    averageScore: 0,
  });

  const [specialtyScores, setSpecialtyScores] = useState<SpecialtyScore[]>([]);

  const [showTestModal, setShowTestModal] = useState<boolean>(false);
  const [showManualSelectModal, setShowManualSelectModal] = useState<boolean>(false);
  const [manualSearch, setManualSearch] = useState<string>('');

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Fetch read progress
        const { data: progress } = await supabase
          .from('chapter_progress')
          .select('chapter_id, is_read')
          .eq('user_id', user.id)
          .eq('is_read', true);

        const readIds = progress ? progress.map((p) => p.chapter_id) : [];
        setReadChapterIds(readIds);

        // Fetch test stats
        const { data: testsData } = await supabase
          .from('tests')
          .select('score, completed')
          .eq('user_id', user.id)
          .eq('completed', true);

        const validTests = testsData ? testsData.filter((t) => t.score !== null && t.score !== undefined) : [];
        const testsCount = validTests.length;
        const avg = testsCount > 0
          ? Math.round((validTests.reduce((acc, curr) => acc + Number(curr.score), 0) / testsCount) * 10) / 10
          : 0;

        setStats({
          totalRead: readIds.length,
          testsCompleted: testsCount,
          averageScore: avg,
        });

        // Compute Specialty Scores dynamically based on read progress & test stats
        const computedScores = SPECIALTIES_CONFIG.map((spec) => {
          const totalInSpec = spec.chapterIds.length;
          const readInSpec = spec.chapterIds.filter((id) => readIds.includes(id)).length;
          const readFraction = totalInSpec > 0 ? readInSpec / totalInSpec : 0;

          // Formula: 40% weight on reading completion + 60% weight on test average or fallback baseline
          let score = Math.round(readFraction * 40 + (avg > 0 ? (avg / 10) * 60 : 55));
          score = Math.min(100, Math.max(25, score));

          return {
            name: spec.name,
            score,
            chapterIds: spec.chapterIds,
            color: spec.color,
          };
        });

        setSpecialtyScores(computedScores);

        // Pick initial current chapter from saved setting or random unread
        const { data: settings } = await supabase
          .from('user_settings')
          .select('current_chapter_id')
          .eq('user_id', user.id)
          .single();

        let initialCapId = settings?.current_chapter_id;
        let selectedCap = CHAPTERS_DATA.find((c) => c.id === initialCapId);

        if (!selectedCap) {
          selectedCap = getRandomUnreadChapter(readIds);
          await supabase
            .from('user_settings')
            .upsert({ user_id: user.id, current_chapter_id: selectedCap.id, updated_at: new Date().toISOString() });
        }

        setCurrentChapter(selectedCap);
      } else {
        // Fallback default scores for unauthenticated preview state
        const defaultScores = SPECIALTIES_CONFIG.map((spec) => ({
          name: spec.name,
          score: 65,
          chapterIds: spec.chapterIds,
          color: spec.color,
        }));
        setSpecialtyScores(defaultScores);
      }
      setLoading(false);
    }

    loadDashboardData();
  }, []);

  function getRandomUnreadChapter(readIds: number[]): Chapter {
    const unread = CHAPTERS_DATA.filter((c) => !readIds.includes(c.id));
    if (unread.length === 0) {
      const randIndex = Math.floor(Math.random() * CHAPTERS_DATA.length);
      return CHAPTERS_DATA[randIndex];
    }
    const randIndex = Math.floor(Math.random() * unread.length);
    return unread[randIndex];
  }

  const handleDrawNextChapter = async () => {
    const nextChapter = getRandomUnreadChapter(readChapterIds);
    setCurrentChapter(nextChapter);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, current_chapter_id: nextChapter.id, updated_at: new Date().toISOString() });
    }
  };

  const handleMarkAsRead = async () => {
    if (!currentChapter) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newReadIds = [...readChapterIds, currentChapter.id];
    setReadChapterIds(newReadIds);
    setStats((prev) => ({ ...prev, totalRead: newReadIds.length }));

    await supabase.from('chapter_progress').upsert({
      user_id: user.id,
      chapter_id: currentChapter.id,
      is_read: true,
      read_at: new Date().toISOString(),
    });

    // Update specialty scores dynamically
    const updatedScores = SPECIALTIES_CONFIG.map((spec) => {
      const totalInSpec = spec.chapterIds.length;
      const readInSpec = spec.chapterIds.filter((id) => newReadIds.includes(id)).length;
      const readFraction = totalInSpec > 0 ? readInSpec / totalInSpec : 0;
      let score = Math.round(readFraction * 40 + (stats.averageScore > 0 ? (stats.averageScore / 10) * 60 : 55));
      score = Math.min(100, Math.max(25, score));
      return { name: spec.name, score, chapterIds: spec.chapterIds, color: spec.color };
    });
    setSpecialtyScores(updatedScores);

    setShowTestModal(true);
  };

  const handleSelectChapterManually = async (cap: Chapter) => {
    setCurrentChapter(cap);
    setShowManualSelectModal(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, current_chapter_id: cap.id, updated_at: new Date().toISOString() });
    }
  };

  const isCurrentRead = currentChapter ? readChapterIds.includes(currentChapter.id) : false;
  const filteredChapters = CHAPTERS_DATA.filter((c) =>
    c.title.toLowerCase().includes(manualSearch.toLowerCase()) ||
    c.sectionTitle.toLowerCase().includes(manualSearch.toLowerCase())
  );

  // Global UPA Readiness Score (Average across 5 specialties)
  const globalReadinessScore = specialtyScores.length > 0
    ? Math.round(specialtyScores.reduce((acc, curr) => acc + curr.score, 0) / specialtyScores.length)
    : 0;

  // Determine UPA Readiness Status Badge & Attributes
  let readinessBadge = {
    label: 'APTO — SALA VERMELHA & CASOS CRÍTICOS',
    color: '#34d399',
    bg: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.3)',
    icon: ShieldCheck,
    description: 'Prontidão médica excelente para Sala Vermelha, politrauma e intercorrências graves de plantão UPA.',
  };

  if (globalReadinessScore < 60) {
    readinessBadge = {
      label: 'CAPACITAÇÃO EM ANDAMENTO',
      color: '#38bdf8',
      bg: 'rgba(14, 165, 233, 0.15)',
      border: 'rgba(14, 165, 233, 0.3)',
      icon: Activity,
      description: 'Prontidão inicial. Recomendada revisão de condutas em Suporte de Vida e Prescrição de Emergência.',
    };
  } else if (globalReadinessScore < 80) {
    readinessBadge = {
      label: 'PRONTIDÃO INTERMEDIÁRIA (SOB SUPERVISÃO)',
      color: '#fbbf24',
      bg: 'rgba(245, 158, 11, 0.15)',
      border: 'rgba(245, 158, 11, 0.3)',
      icon: AlertTriangle,
      description: 'Capacidade técnica sólida para atendimentos de emergência geral com suporte de preceptoria.',
    };
  }

  const BadgeIcon = readinessBadge.icon;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="pulse-badge">
              <span className="pulse-dot" /> Sala Vermelha & Emergências UPA
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

      {/* Main Chapter Focus Card (Capítulo Sorteado em Destaque) */}
      <div
        className="glass-panel"
        style={{
          padding: '36px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.7) 100%)',
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
            Carregando capítulo sorteado...
          </div>
        ) : currentChapter ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                {isCurrentRead && (
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
                    <CheckCircle2 size={14} /> Lido
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
                  className="btn-secondary"
                  style={{
                    fontSize: '0.88rem',
                    padding: '8px 14px',
                    borderColor: 'rgba(56, 189, 248, 0.4)',
                    color: '#38bdf8',
                  }}
                >
                  <Shuffle size={16} /> Sortear de Novo
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-subtle)', fontWeight: 600, marginBottom: '4px' }}>
                SUGESTÃO DE LEITURA ATUAL (SORTEIO ALEATÓRIO)
              </div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.25 }}>
                Capítulo {currentChapter.number}: {currentChapter.title}
              </h2>
            </div>

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
                  <CheckCircle2 size={18} /> Marcar Capítulo como Lido
                </button>
              ) : (
                <button
                  onClick={() => router.push(`/testes?chapterId=${currentChapter.id}`)}
                  className="btn-primary"
                  style={{ padding: '12px 24px', fontSize: '0.95rem' }}
                >
                  <Sparkles size={18} /> Criar Teste Sobre Este Capítulo
                </button>
              )}

              <button
                onClick={handleDrawNextChapter}
                className="btn-secondary"
                style={{ padding: '12px 20px', fontSize: '0.95rem' }}
              >
                <RefreshCw size={18} /> Sortear Próximo Capítulo
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* COMPONENT 2 - DASHBOARD MEDICAL COMPETENCIES RADAR CHART & UPA READINESS INDICATOR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
        {/* Left Column: UPA Medical Readiness Indicator (Prontidão Médica da UPA) */}
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
                  Indicador Global de Competência de Emergência
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

          {/* Per-Specialty Progress Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TrendingUp size={16} style={{ color: '#38bdf8' }} /> Desempenho por Especialidade de Emergência
            </div>

            {specialtyScores.map((spec) => (
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
                background: globalReadinessScore >= 70 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                color: globalReadinessScore >= 70 ? '#34d399' : '#fbbf24',
              }}
            >
              {globalReadinessScore >= 70 ? 'Escala Liberada' : 'Sob Preceptoria'}
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

          <MedicalRadarChart data={specialtyScores} />
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
              NÚCLEO DE REPETIÇÃO ESPAÇADA
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
              Modo Plantão — Leitos UPA & Evolução de Pacientes
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: '600px' }}>
              Revise temas automaticamente priorizados pelo algoritmo SM-2 + matriz epidemiológica. Cada leito traz um caso em 4 etapas continuas.
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
