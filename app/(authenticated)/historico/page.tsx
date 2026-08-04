'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CHAPTERS_DATA } from '@/lib/chapters-data';
import {
  History,
  Award,
  Calendar,
  ChevronRight,
  FileQuestion,
  Sparkles,
  Play,
  Clock,
  CheckCircle2,
  Stethoscope,
  Filter,
} from 'lucide-react';

export default function HistoricoPage() {
  const router = useRouter();
  const supabase = createClient();

  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [modeFilter, setModeFilter] = useState<'all' | 'simulado' | 'plantao'>('all');

  useEffect(() => {
    async function loadHistory() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data } = await supabase
          .from('tests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (data) {
          setTests(data);
        }
      }
      setLoading(false);
    }

    loadHistory();
  }, []);

  const completedTests = tests.filter((t) => t.completed);
  const pendingTests = tests.filter((t) => !t.completed);

  const totalCompleted = completedTests.length;
  const totalPending = pendingTests.length;
  const avgScore = totalCompleted > 0
    ? Math.round((completedTests.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0) / totalCompleted) * 10) / 10
    : 0;

  const getScoreBadge = (score: number) => {
    if (score >= 8) return { bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
    if (score >= 6) return { bg: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8', border: 'rgba(14, 165, 233, 0.3)' };
    if (score >= 4) return { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
    return { bg: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', border: 'rgba(244, 63, 94, 0.3)' };
  };

  const filteredTests = tests.filter((t) => {
    if (filter === 'pending' && t.completed) return false;
    if (filter === 'completed' && !t.completed) return false;

    if (modeFilter === 'plantao' && t.mode !== 'plantao') return false;
    if (modeFilter === 'simulado' && t.mode === 'plantao') return false;

    return true;
  });

  const getFormatLabel = (fmt: string) => {
    switch (fmt) {
      case 'mixed': return 'Misto';
      case 'prescription': return 'Prescrição';
      case 'ventilator': return 'Ventilador Mecânico';
      case 'multiple_choice': return 'Múltipla Escolha';
      default: return fmt || 'Geral';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc' }}>
          Histórico de Simulados & Evolução
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Acompanhe seu desempenho e retome simulados em andamento a qualquer momento.
        </p>
      </div>

      {/* Stats summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Testes Concluídos</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399', marginTop: '6px' }}>{totalCompleted}</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Em Andamento</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fb923c', marginTop: '6px' }}>{totalPending}</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Média Geral</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8', marginTop: '6px' }}>
            {avgScore > 0 ? `${avgScore} / 10` : '—'}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-subtle)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginRight: '6px' }}>
            <Filter size={14} /> Filtros:
          </span>

          {[
            { id: 'all', label: `Todos (${tests.length})` },
            { id: 'pending', label: `Em Andamento (${totalPending})` },
            { id: 'completed', label: `Concluídos (${totalCompleted})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={filter === tab.id ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '6px 14px', fontSize: '0.82rem' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'Todos os Formatos' },
            { id: 'simulado', label: '📝 Simulados Clássicos' },
            { id: 'plantao', label: '🩺 Plantões Noturnos' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setModeFilter(tab.id as any)}
              style={{
                padding: '6px 14px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                background: modeFilter === tab.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                color: modeFilter === tab.id ? '#38bdf8' : 'var(--text-muted)',
                border: modeFilter === tab.id ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid var(--border-subtle)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Test history list */}
      <div className="glass-panel" style={{ padding: '24px', borderRadius: '18px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
          {filter === 'pending' ? 'Simulados Em Andamento' : filter === 'completed' ? 'Simulados Concluídos' : 'Todos os Simulados'}
        </h3>

        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Carregando histórico...
          </div>
        ) : filteredTests.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileQuestion size={36} style={{ margin: '0 auto 12px auto', color: 'var(--text-subtle)' }} />
            <p style={{ marginBottom: '16px' }}>
              {filter === 'pending' ? 'Nenhum teste em andamento no momento.' : 'Nenhum simulado encontrado.'}
            </p>
            <button onClick={() => router.push('/testes')} className="btn-primary">
              <Sparkles size={16} /> Gerar Novo Teste
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filteredTests.map((t) => {
              const isCompleted = t.completed;
              const isPlantao = t.mode === 'plantao';
              const plantaoData = t.plantao_data || {};
              const beds = plantaoData.beds || [];
              const dateVal = isCompleted ? t.completed_at || t.created_at : t.created_at;
              const dateStr = dateVal
                ? new Date(dateVal).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Recente';
              const chapterCount = t.chapter_ids ? t.chapter_ids.length : 0;
              const badgeStyle = getScoreBadge(Number(t.score) || 0);
              const firstCap = CHAPTERS_DATA.find((c) => c.id === t.chapter_ids?.[0]);

              const cardBorder = isPlantao
                ? isCompleted ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(249, 115, 22, 0.4)'
                : isCompleted ? '1px solid var(--border-subtle)' : '1px solid rgba(249, 115, 22, 0.3)';

              const cardBg = isPlantao
                ? isCompleted ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.7) 100%)' : 'rgba(249, 115, 22, 0.08)'
                : isCompleted ? 'rgba(15, 23, 42, 0.5)' : 'rgba(249, 115, 22, 0.06)';

              return (
                <div
                  key={t.id}
                  onClick={() => router.push(isCompleted ? `/testes/${t.id}/resultado` : `/testes/${t.id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '18px 22px',
                    borderRadius: '14px',
                    background: cardBg,
                    border: cardBorder,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isPlantao ? '0 4px 20px rgba(16, 185, 129, 0.05)' : 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = isPlantao ? '#34d399' : isCompleted ? 'rgba(56, 189, 248, 0.4)' : '#fb923c')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = isPlantao ? (isCompleted ? 'rgba(16, 185, 129, 0.35)' : 'rgba(249, 115, 22, 0.4)') : isCompleted ? 'var(--border-subtle)' : 'rgba(249, 115, 22, 0.3)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                    {isCompleted ? (
                      <div style={{
                        padding: '8px 14px',
                        borderRadius: '10px',
                        background: badgeStyle.bg,
                        color: badgeStyle.color,
                        border: `1px solid ${badgeStyle.border}`,
                        fontWeight: 800,
                        fontSize: '1.1rem',
                        minWidth: '58px',
                        textAlign: 'center',
                      }}>
                        {t.score !== null ? t.score : '—'}
                      </div>
                    ) : (
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: '10px',
                        background: 'rgba(249, 115, 22, 0.15)',
                        color: '#fb923c',
                        border: '1px solid rgba(249, 115, 22, 0.3)',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap',
                      }}>
                        <Clock size={14} /> Em Andamento
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {isPlantao ? (
                          <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Stethoscope size={12} /> PLANTÃO NOTURNO #{plantaoData.plantaoNumber || 1}
                          </span>
                        ) : (
                          <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Sparkles size={12} /> SIMULADO IA
                          </span>
                        )}

                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                          {firstCap ? `Cap. ${firstCap.number}: ${firstCap.title}` : `${chapterCount} Capítulos`}
                          {chapterCount > 1 && ` (+${chapterCount - 1} outros)`}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <span><Calendar size={12} style={{ display: 'inline', marginRight: '4px' }} /> {dateStr}</span>
                        <span>• {isPlantao && beds.length > 0 ? `🛏️ ${beds.length} Leitos de UPA (${t.total_questions} condutas)` : `${t.total_questions} Questões`}</span>
                        <span>• Formato: {getFormatLabel(t.question_type)}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {!isCompleted ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/testes/${t.id}`);
                        }}
                        className="btn-primary"
                        style={{ padding: '8px 16px', fontSize: '0.82rem', background: isPlantao ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
                      >
                        {isPlantao ? 'Retomar Plantão' : 'Continuar Teste'} <Play size={14} />
                      </button>
                    ) : (
                      <ChevronRight size={18} color="var(--text-subtle)" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

