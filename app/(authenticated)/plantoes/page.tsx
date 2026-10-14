'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PlantaoTestStatus } from '@/types/plantao';
import {
  Stethoscope,
  Award,
  Calendar,
  ChevronRight,
  Sparkles,
  Play,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  RefreshCw,
  Zap,
  FileText,
} from 'lucide-react';

function getPlantaoState(t: any): PlantaoTestStatus {
  if (t.status) return t.status as PlantaoTestStatus;
  if (t.plantao_data?.status) return t.plantao_data.status as PlantaoTestStatus;
  return t.completed ? 'completed' : 'in_progress';
}

export default function PlantoesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [checkingBatchMap, setCheckingBatchMap] = useState<Record<string, boolean>>({});

  async function loadPlantaoHistory(isSilent: boolean = false) {
    if (!isSilent) setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from('tests')
        .select('*')
        .eq('user_id', user.id)
        .eq('mode', 'plantao')
        .order('created_at', { ascending: false });

      if (data) {
        setTests(data);

        // Check if any plantões are awaiting batch
        const pendingBatches = data.filter((t) => {
          const st = getPlantaoState(t);
          return st === 'awaiting_batch_bed_evaluation' || st === 'awaiting_batch_feedback';
        });

        if (pendingBatches.length > 0 && !isSilent) {
          // Trigger non-blocking background check
          runBackgroundBatchCheck();
        }
      }
    }
    if (!isSilent) setLoading(false);
  }

  async function runBackgroundBatchCheck() {
    try {
      const res = await fetch('/api/plantao/check-batch-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.updated) {
          await loadPlantaoHistory(true);
        }
      }
    } catch (e) {
      console.warn('[Plantoes] Non-blocking background check error:', e);
    }
  }

  const handleCheckBatchItem = async (e: React.MouseEvent, testId: string) => {
    e.stopPropagation();
    setCheckingBatchMap((prev) => ({ ...prev, [testId]: true }));
    try {
      const res = await fetch('/api/plantao/check-batch-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.updated) {
          await loadPlantaoHistory(true);
        }
      }
    } catch (e) {
      console.warn('[Plantoes] Manual item batch check error:', e);
    } finally {
      setCheckingBatchMap((prev) => ({ ...prev, [testId]: false }));
    }
  };

  useEffect(() => {
    loadPlantaoHistory();
  }, []);

  const completedTests = tests.filter((t) => getPlantaoState(t) === 'completed');
  const pendingTests = tests.filter((t) => getPlantaoState(t) !== 'completed');

  const totalCompleted = completedTests.length;
  const totalPending = pendingTests.length;
  const avgScore =
    totalCompleted > 0
      ? Math.round(
          (completedTests.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0) / totalCompleted) *
            10
        ) / 10
      : 0;

  const totalAdverseCount = tests.reduce(
    (acc, curr) => acc + (curr.plantao_data?.adverseEvolutions || 0),
    0
  );

  const filteredTests = tests.filter((t) => {
    const st = getPlantaoState(t);
    if (filter === 'pending') return st !== 'completed';
    if (filter === 'completed') return st === 'completed';
    return true;
  });

  const renderBadge = (t: any) => {
    const status = getPlantaoState(t);
    const score = t.score;

    switch (status) {
      case 'awaiting_batch_bed_evaluation':
        return (
          <div
            data-testid={`badge-${t.id}`}
            data-status={status}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'rgba(14, 165, 233, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              fontWeight: 700,
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <RefreshCw size={14} className="animate-spin" />
            <span>⏳ Avaliando Leitos (Lote)</span>
          </div>
        );

      case 'ready_for_adverse':
        return (
          <div
            data-testid={`badge-${t.id}`}
            data-status={status}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'rgba(244, 63, 94, 0.2)',
              color: '#fda4af',
              border: '1px solid rgba(244, 63, 94, 0.5)',
              fontWeight: 800,
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              animation: 'pulse 2s infinite',
            }}
          >
            <AlertTriangle size={14} />
            <span>🔔 Intercorrência Clínica!</span>
          </div>
        );

      case 'awaiting_batch_feedback':
        return (
          <div
            data-testid={`badge-${t.id}`}
            data-status={status}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'rgba(139, 92, 246, 0.15)',
              color: '#c084fc',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              fontWeight: 700,
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <RefreshCw size={14} className="animate-spin" />
            <span>⏳ Gerando Preceptoria (Lote)</span>
          </div>
        );

      case 'completed':
        return (
          <div
            data-testid={`badge-${t.id}`}
            data-status={status}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              fontWeight: 800,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <CheckCircle2 size={14} />
            <span>✓ Concluído ({score !== null && score !== undefined ? `${score}/10` : '—'})</span>
          </div>
        );

      case 'in_progress':
      default:
        return (
          <div
            data-testid={`badge-${t.id}`}
            data-status={status}
            style={{
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
            }}
          >
            <Clock size={14} />
            <span>Em Andamento</span>
          </div>
        );
    }
  };

  const renderAction = (t: any) => {
    const status = getPlantaoState(t);
    const isCheckingThis = !!checkingBatchMap[t.id];

    switch (status) {
      case 'awaiting_batch_bed_evaluation':
      case 'awaiting_batch_feedback':
        return (
          <button
            onClick={(e) => handleCheckBatchItem(e, t.id)}
            disabled={isCheckingThis}
            className="btn-secondary"
            data-testid={`btn-action-${t.id}`}
            style={{
              padding: '8px 16px',
              fontSize: '0.82rem',
              background: 'rgba(14, 165, 233, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700,
              cursor: isCheckingThis ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw size={14} className={isCheckingThis ? 'animate-spin' : ''} />
            <span>{isCheckingThis ? 'Consultando...' : '🔄 Atualizar Lote'}</span>
          </button>
        );

      case 'ready_for_adverse':
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/testes/${t.id}`);
            }}
            className="btn-primary"
            data-testid={`btn-action-${t.id}`}
            style={{
              padding: '8px 16px',
              fontSize: '0.82rem',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <Zap size={14} />
            <span>🚨 Atender Intercorrência</span>
          </button>
        );

      case 'completed':
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/testes/${t.id}/resultado`);
            }}
            className="btn-secondary"
            data-testid={`btn-action-${t.id}`}
            style={{
              padding: '8px 16px',
              fontSize: '0.82rem',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <span>Ver Resultados</span>
            <ChevronRight size={14} />
          </button>
        );

      case 'in_progress':
      default:
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/testes/${t.id}`);
            }}
            className="btn-primary"
            data-testid={`btn-action-${t.id}`}
            style={{
              padding: '8px 16px',
              fontSize: '0.82rem',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <span>Continuar Plantão</span>
            <Play size={14} />
          </button>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="pulse-badge">
            <Stethoscope size={14} /> Sala Vermelha & Leitos UPA
          </span>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc' }}>
          Histórico de Plantões Noturnos
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Acompanhe seu desempenho na repetição espaçada por leitos e evolução de casos clínicos.
        </p>
      </div>

      {/* Stats summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Plantões Realizados</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399', marginTop: '6px' }}>{totalCompleted}</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Em Andamento</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fb923c', marginTop: '6px' }}>{totalPending}</div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Nota Média Plantão</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8', marginTop: '6px' }}>
            {avgScore > 0 ? `${avgScore} / 10` : '—'}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Evoluções Adversas</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f43f5e', marginTop: '6px' }}>{totalAdverseCount}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { id: 'all', label: `Todos os Plantões (${tests.length})` },
            { id: 'pending', label: `Em Andamento (${totalPending})` },
            { id: 'completed', label: `Concluídos (${totalCompleted})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={filter === tab.id ? 'btn-primary' : 'btn-secondary'}
              style={{
                padding: '8px 16px',
                fontSize: '0.88rem',
                background: filter === tab.id ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : undefined,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => router.push('/testes?mode=plantao')}
          className="btn-primary"
          style={{ padding: '10px 18px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
        >
          <Stethoscope size={16} /> Novo Plantão Agora
        </button>
      </div>

      {/* Plantão list */}
      <div className="glass-panel" style={{ padding: '24px', borderRadius: '18px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
          {filter === 'pending' ? 'Plantões Em Andamento' : filter === 'completed' ? 'Plantões Concluídos' : 'Histórico Completo de Plantões'}
        </h3>

        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Carregando histórico de plantões...
          </div>
        ) : filteredTests.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Stethoscope size={36} style={{ margin: '0 auto 12px auto', color: 'var(--text-subtle)' }} />
            <p style={{ marginBottom: '16px' }}>Nenhum plantão encontrado.</p>
            <button onClick={() => router.push('/testes?mode=plantao')} className="btn-primary" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
              <Sparkles size={16} /> Iniciar Primeiro Plantão
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredTests.map((t) => {
              const itemStatus = getPlantaoState(t);
              const isCompleted = itemStatus === 'completed';
              const dateVal = isCompleted ? t.completed_at || t.created_at : t.created_at;
              const dateStr = dateVal
                ? new Date(dateVal).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Recente';

              const pData = t.plantao_data || {};
              const bedsCount = pData.bedCount || t.chapter_ids?.length || 4;
              const adverseCount = pData.adverseEvolutions || 0;

              return (
                <div
                  key={t.id}
                  onClick={() => router.push(isCompleted ? `/testes/${t.id}/resultado` : `/testes/${t.id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    background: isCompleted ? 'rgba(15, 23, 42, 0.5)' : 'rgba(16, 185, 129, 0.08)',
                    border: isCompleted ? '1px solid var(--border-subtle)' : '1px solid rgba(16, 185, 129, 0.3)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#34d399')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = isCompleted ? 'var(--border-subtle)' : 'rgba(16, 185, 129, 0.3)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {renderBadge(t)}

                    <div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>Plantão #{pData.plantaoNumber || '—'}</span>
                        <span style={{ fontSize: '0.78rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                          {bedsCount} Leitos
                        </span>
                      </div>

                      <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <span>
                          <Calendar size={12} style={{ display: 'inline', marginRight: '4px' }} /> {dateStr}
                        </span>
                        <span>• {t.total_questions} Questões</span>
                        {adverseCount > 0 && (
                          <span style={{ color: '#fda4af', fontWeight: 600 }}>
                            • ⚠️ {adverseCount} Evolução Adversa
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {renderAction(t)}
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
