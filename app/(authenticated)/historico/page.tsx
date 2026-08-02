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
  BarChart3,
} from 'lucide-react';

export default function HistoricoPage() {
  const router = useRouter();
  const supabase = createClient();

  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadHistory() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data } = await supabase
          .from('tests')
          .select('*')
          .eq('user_id', user.id)
          .eq('completed', true)
          .order('completed_at', { ascending: false });

        if (data) {
          setTests(data);
        }
      }
      setLoading(false);
    }

    loadHistory();
  }, []);

  const totalTests = tests.length;
  const avgScore = totalTests > 0
    ? Math.round((tests.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0) / totalTests) * 10) / 10
    : 0;

  const getScoreBadge = (score: number) => {
    if (score >= 8) return { bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
    if (score >= 6) return { bg: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8', border: 'rgba(14, 165, 233, 0.3)' };
    if (score >= 4) return { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
    return { bg: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', border: 'rgba(244, 63, 94, 0.3)' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc' }}>
          Histórico de Simulados & Evolução
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Acompanhe seu desempenho ao longo do tempo nas questões clínicas e prescrições.
        </p>
      </div>

      {/* Stats summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total de Testes</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginTop: '6px' }}>{totalTests}</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Média Geral</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8', marginTop: '6px' }}>
            {avgScore > 0 ? `${avgScore} / 10` : '—'}
          </div>
        </div>
      </div>

      {/* Test history list */}
      <div className="glass-panel" style={{ padding: '24px', borderRadius: '18px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
          Testes Concluídos ({totalTests})
        </h3>

        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Carregando histórico...
          </div>
        ) : tests.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileQuestion size={36} style={{ margin: '0 auto 12px auto', color: 'var(--text-subtle)' }} />
            <p style={{ marginBottom: '16px' }}>Nenhum simulado realizado ainda.</p>
            <button onClick={() => router.push('/testes')} className="btn-primary">
              <Sparkles size={16} /> Gerar Primeiro Teste
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {tests.map((t) => {
              const dateStr = t.completed_at ? new Date(t.completed_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recente';
              const chapterCount = t.chapter_ids ? t.chapter_ids.length : 0;
              const badgeStyle = getScoreBadge(Number(t.score) || 0);

              const firstCap = CHAPTERS_DATA.find((c) => c.id === t.chapter_ids?.[0]);

              return (
                <div
                  key={t.id}
                  onClick={() => router.push(`/testes/${t.id}/resultado`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    background: 'rgba(15, 23, 42, 0.5)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      padding: '8px 14px',
                      borderRadius: '10px',
                      background: badgeStyle.bg,
                      color: badgeStyle.color,
                      border: `1px solid ${badgeStyle.border}`,
                      fontWeight: 800,
                      fontSize: '1.1rem',
                    }}>
                      {t.score !== null ? t.score : '—'}
                    </div>

                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
                        {firstCap ? `Cap. ${firstCap.number}: ${firstCap.title}` : `${chapterCount} Capítulos`}
                        {chapterCount > 1 && ` (+${chapterCount - 1} outros)`}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span><Calendar size={12} style={{ display: 'inline', marginRight: '4px' }} /> {dateStr}</span>
                        <span>• {t.total_questions} Questões</span>
                        <span>• Formato: {t.question_type === 'mixed' ? 'Misto' : t.question_type === 'prescription' ? 'Prescrição' : 'Múltipla Escolha'}</span>
                      </div>
                    </div>
                  </div>

                  <ChevronRight size={18} color="var(--text-subtle)" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
