import { createClient } from '@/lib/supabase/server';
import { LEARNING_TRACKS } from '@/lib/learning-tracks';
import { CHAPTERS_DATA } from '@/lib/chapters-data';
import { buildReadinessSnapshot } from '@/lib/learning-engine';
import Link from 'next/link';
import { CheckCircle2, Lock, Sparkles, BookOpen, ArrowRight } from 'lucide-react';

export default async function TrilhasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: progressList } = await supabase
    .from('chapter_progress')
    .select('chapter_id, is_read, read_at, read_count')
    .eq('user_id', user.id);

  const { data: reviewStatsList } = await supabase
    .from('chapter_review_stats')
    .select('*')
    .eq('user_id', user.id);

  const { data: testsList } = await supabase
    .from('tests')
    .select('id, chapter_ids, mode, score, completed, completed_at, results')
    .eq('user_id', user.id);

  const snapshot = buildReadinessSnapshot({
    progressList: progressList || [],
    reviewStatsList: reviewStatsList || [],
    testsList: testsList || [],
    surface: 'dashboard',
  });

  const readSet = new Set((progressList || []).filter((p) => p.is_read).map((p) => p.chapter_id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header */}
      <div>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 12px',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 600,
          background: 'rgba(16, 185, 129, 0.1)',
          color: '#34d399',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          marginBottom: '12px',
        }}>
          <Sparkles size={14} />
          <span>Roadmap Visual RPG</span>
        </div>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: '#f1f5f9' }}>
          Trilhas de Aprendizagem por Especialidade
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: '4px', fontSize: '0.95rem' }}>
          Sequências estruturadas de estudo da Sala Vermelha até procedimentos de alta complexidade.
        </p>
      </div>

      {/* Tracks Grid */}
      <div className="trilhas-grid">
        {LEARNING_TRACKS.map((track) => {
          const trackChapters = track.chapters.map((id) => CHAPTERS_DATA.find((c) => c.id === id)).filter(Boolean);
          const completedCount = track.chapters.filter((id) => readSet.has(id)).length;
          const progressPercent = Math.round((completedCount / track.chapters.length) * 100);

          return (
            <div
              key={track.id}
              className="glass-panel glass-panel-hover"
              style={{
                padding: '24px',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                {/* Track Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        minWidth: '48px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        backgroundColor: `${track.color}20`,
                        border: `1px solid ${track.color}40`,
                      }}
                    >
                      {track.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2 }}>{track.name}</h2>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{track.description}</p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#e2e8f0' }}>{progressPercent}%</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-subtle)', display: 'block' }}>concluído</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{
                  width: '100%',
                  height: '6px',
                  background: 'rgba(30, 41, 59, 0.8)',
                  borderRadius: '9999px',
                  overflow: 'hidden',
                  marginBottom: '20px',
                }}>
                  <div
                    style={{
                      width: `${progressPercent}%`,
                      height: '100%',
                      borderRadius: '9999px',
                      backgroundColor: track.color,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>

                {/* Vertical Skill Tree Nodes */}
                <div style={{
                  position: 'relative',
                  paddingLeft: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}>
                  {/* Vertical line */}
                  <div style={{
                    position: 'absolute',
                    left: '11px',
                    top: '14px',
                    bottom: '14px',
                    width: '2px',
                    background: 'rgba(30, 41, 59, 0.8)',
                    borderRadius: '1px',
                  }} />

                  {trackChapters.map((cap) => {
                    if (!cap) return null;
                    const isCompleted = readSet.has(cap.id);
                    const prereqs = cap.prerequisites || [];
                    const prereqsMet = prereqs.every((pId) => readSet.has(pId));
                    const isLocked = !isCompleted && !prereqsMet;
                    const metric = snapshot.chapterMetrics[cap.id];
                    const readiness = metric ? Math.round(metric.topicReadiness) : 0;

                    // Node dot styles
                    const dotBase: React.CSSProperties = {
                      position: 'absolute',
                      left: '-28px',
                      top: '8px',
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 2,
                    };

                    const dotStyle: React.CSSProperties = isCompleted
                      ? {
                        ...dotBase,
                        backgroundColor: '#10b981',
                        color: '#0f172a',
                        boxShadow: '0 0 0 4px #0f172a, 0 0 8px rgba(16, 185, 129, 0.4)',
                      }
                      : isLocked
                        ? {
                          ...dotBase,
                          backgroundColor: '#1e293b',
                          color: '#64748b',
                          border: '1px solid #334155',
                          boxShadow: '0 0 0 4px #0f172a',
                        }
                        : {
                          ...dotBase,
                          backgroundColor: '#06b6d4',
                          color: '#0f172a',
                          boxShadow: '0 0 0 4px rgba(6, 182, 212, 0.15), 0 0 12px rgba(6, 182, 212, 0.3)',
                          animation: 'pulse-ring 1.8s infinite cubic-bezier(0.66, 0, 0, 1)',
                        };

                    // Card styles
                    const cardStyle: React.CSSProperties = isCompleted
                      ? {
                        flex: 1,
                        padding: '12px 14px',
                        borderRadius: '12px',
                        background: 'rgba(16, 185, 129, 0.06)',
                        border: '1px solid rgba(16, 185, 129, 0.15)',
                        color: '#cbd5e1',
                        transition: 'all 0.2s ease',
                      }
                      : isLocked
                        ? {
                          flex: 1,
                          padding: '12px 14px',
                          borderRadius: '12px',
                          background: 'rgba(2, 6, 23, 0.4)',
                          border: '1px solid rgba(30, 41, 59, 0.6)',
                          color: '#64748b',
                          transition: 'all 0.2s ease',
                        }
                        : {
                          flex: 1,
                          padding: '12px 14px',
                          borderRadius: '12px',
                          background: 'rgba(6, 182, 212, 0.06)',
                          border: '1px solid rgba(6, 182, 212, 0.2)',
                          color: '#e2e8f0',
                          transition: 'all 0.2s ease',
                        };

                    return (
                      <div key={cap.id} style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        {/* Node Status Dot */}
                        <div style={dotStyle}>
                          {isCompleted ? (
                            <CheckCircle2 size={13} />
                          ) : isLocked ? (
                            <Lock size={12} />
                          ) : (
                            <BookOpen size={12} />
                          )}
                        </div>

                        {/* Node Card */}
                        <div style={cardStyle}>
                          <div className="trilha-node-content">
                            <div style={{ minWidth: 0 }}>
                              <span style={{
                                fontSize: '0.62rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                fontWeight: 600,
                                opacity: 0.7,
                              }}>
                                Cap {cap.number} • {cap.sectionTitle}
                              </span>
                              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '2px' }}>{cap.title}</h3>
                            </div>
                            {isCompleted ? (
                              <span style={{
                                fontSize: '0.7rem',
                                color: '#34d399',
                                fontWeight: 500,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}>
                                Concluído
                              </span>
                            ) : isLocked ? (
                              <span style={{
                                fontSize: '0.7rem',
                                color: '#64748b',
                                fontWeight: 500,
                                padding: '3px 8px',
                                borderRadius: '6px',
                                background: 'rgba(30, 41, 59, 0.6)',
                                border: '1px solid #334155',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}>
                                <Lock size={11} /> Requer Cap {prereqs.join(', ')}
                              </span>
                            ) : (
                              <Link
                                href={`/capitulos?cap=${cap.id}`}
                                style={{
                                  fontSize: '0.7rem',
                                  color: '#22d3ee',
                                  fontWeight: 600,
                                  padding: '5px 10px',
                                  borderRadius: '8px',
                                  background: 'rgba(6, 182, 212, 0.1)',
                                  border: '1px solid rgba(6, 182, 212, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  textDecoration: 'none',
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                Estudar <ArrowRight size={12} />
                              </Link>
                            )}
                          </div>

                          {isCompleted && (
                            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              <span>Prontidão: <strong style={{ color: '#34d399' }}>{readiness}%</strong></span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
