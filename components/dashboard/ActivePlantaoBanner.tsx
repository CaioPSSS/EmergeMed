'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock,
  AlertTriangle,
  Sparkles,
  Stethoscope,
  RefreshCw,
  Zap,
  Play,
  FileText,
  X,
  CheckCircle2,
} from 'lucide-react';
import { PlantaoTestStatus } from '@/types/plantao';

export interface ActivePlantaoData {
  id: string;
  status: PlantaoTestStatus;
  score?: number | null;
  created_at?: string;
  completed_at?: string | null;
  plantao_data?: {
    plantaoNumber?: number;
    bedCount?: number;
    batch_job_id?: string;
    batch_bed_eval_id?: string;
    feedback_batch_id?: string;
    batch_submitted_at?: string;
    batch_bed_eval_submitted_at?: string;
    feedback_batch_submitted_at?: string;
    adverseEvolutions?: number;
    [key: string]: any;
  } | null;
  [key: string]: any;
}

export interface ActivePlantaoBannerProps {
  plantao: ActivePlantaoData;
  onRefreshBatch?: () => Promise<void> | void;
  isRefreshing?: boolean;
  onDismiss?: () => void;
}

export function ActivePlantaoBanner({
  plantao,
  onRefreshBatch,
  isRefreshing = false,
  onDismiss,
}: ActivePlantaoBannerProps) {
  const router = useRouter();
  const status = plantao.status;
  const pData = plantao.plantao_data || {};
  const plantaoNumber = pData.plantaoNumber || '—';
  const bedCount = pData.bedCount || 4;

  const formatTimestamp = (iso?: string) => {
    if (!iso) return 'Recente';
    try {
      const date = new Date(iso);
      if (isNaN(date.getTime())) return 'Recente';
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recente';
    }
  };

  const rawSubmittedAt =
    pData.batch_submitted_at ||
    pData.batch_bed_eval_submitted_at ||
    pData.feedback_batch_submitted_at ||
    plantao.created_at;
  const submittedAt = formatTimestamp(rawSubmittedAt);

  // Variant A: Awaiting Batch (Bed evaluation or General feedback)
  if (status === 'awaiting_batch_bed_evaluation' || status === 'awaiting_batch_feedback') {
    const isFeedback = status === 'awaiting_batch_feedback';
    return (
      <div
        className="glass-panel active-plantao-banner-awaiting-batch"
        data-testid="active-plantao-banner-batch"
        data-plantao-status={status}
        style={{
          padding: '20px 24px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(99, 102, 241, 0.08) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          boxShadow: '0 8px 24px rgba(14, 165, 233, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', maxWidth: '780px' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: '12px',
              background: 'rgba(14, 165, 233, 0.2)',
              color: '#38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Clock size={24} className="animate-spin" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(56, 189, 248, 0.2)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                }}
              >
                OpenRouter Batch • 50% de Economia
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                Plantão #{plantaoNumber} ({bedCount} Leitos)
              </span>
            </div>
            <h3
              style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 4px 0' }}
              data-testid="banner-heading"
            >
              ⏳ Passagem de Plantão Assíncrona em processamento no lote (OpenRouter Batch)...
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {isFeedback
                ? 'Gerando relatório pedagógico de preceptoria pós-adversos.'
                : 'Avaliando condutas e prescrições dos leitos na fila noturna.'}{' '}
              <strong style={{ color: '#e2e8f0' }}>Enviado em: {submittedAt}</strong>
            </p>
          </div>
        </div>

        <button
          onClick={onRefreshBatch}
          disabled={isRefreshing}
          className="btn-secondary"
          data-testid="btn-refresh-batch"
          style={{
            padding: '10px 18px',
            fontSize: '0.88rem',
            background: 'rgba(14, 165, 233, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            color: '#38bdf8',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 700,
            cursor: isRefreshing ? 'wait' : 'pointer',
          }}
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          <span>{isRefreshing ? 'Consultando Lote...' : '🔄 Atualizar Status do Lote'}</span>
        </button>
      </div>
    );
  }

  // Variant B: Ready for Adverse Evolution
  if (status === 'ready_for_adverse') {
    return (
      <div
        className="glass-panel active-plantao-banner-adverse"
        data-testid="active-plantao-banner-adverse"
        data-plantao-status={status}
        style={{
          padding: '20px 24px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(244, 63, 94, 0.15) 100%)',
          border: '1px solid rgba(239, 68, 68, 0.5)',
          boxShadow: '0 8px 24px rgba(239, 68, 68, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          animation: 'pulse 3s infinite',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', maxWidth: '780px' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.25)',
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                }}
              >
                Urgência Clínica • Ação Imediata
              </span>
              <span style={{ fontSize: '0.8rem', color: '#fca5a5' }}>
                Plantão #{plantaoNumber}
              </span>
            </div>
            <h3
              style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fef2f2', margin: '0 0 4px 0' }}
              data-testid="banner-heading"
            >
              🔔 Intercorrência Clínica! O leito descompensou após a conduta inicial. Clique para atender a evolução adversa.
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#fecaca' }}>
              A avaliação do lote identificou falha de conduta ou choque refratário. O paciente necessita de manobra de resgate na Sala Vermelha.
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push(`/testes/${plantao.id}`)}
          className="btn-primary"
          data-testid="btn-adverse-action"
          style={{
            padding: '10px 22px',
            fontSize: '0.9rem',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          <Zap size={16} />
          <span>🚨 Atender Intercorrência</span>
        </button>
      </div>
    );
  }

  // Variant C: Completed
  if (status === 'completed') {
    return (
      <div
        className="glass-panel active-plantao-banner-completed"
        data-testid="active-plantao-banner-completed"
        data-plantao-status={status}
        style={{
          padding: '20px 24px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.08) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          boxShadow: '0 8px 24px rgba(16, 185, 129, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', maxWidth: '780px' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                }}
              >
                Concluído • Nota {plantao.score !== null && plantao.score !== undefined ? `${plantao.score}/10` : 'Pronta'}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                Plantão #{plantaoNumber}
              </span>
            </div>
            <h3
              style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', margin: '0 0 4px 0' }}
              data-testid="banner-heading"
            >
              ✨ Passagem de Plantão concluída! Veja seu relatório pedagógico de preceptoria.
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Feedback consolidado por leitos, identificação de lacunas de prescrição e pontuação geral já disponíveis.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => router.push(`/testes/${plantao.id}/resultado`)}
            className="btn-primary"
            data-testid="btn-view-results"
            style={{
              padding: '10px 20px',
              fontSize: '0.88rem',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <FileText size={16} />
            <span>📊 Ver Resultados</span>
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              data-testid="btn-dismiss-completed"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
              }}
              title="Dispensar aviso"
              aria-label="Dispensar aviso"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Variant D: In Progress
  return (
    <div
      className="glass-panel active-plantao-banner-in-progress"
      data-testid="active-plantao-banner-in-progress"
      data-plantao-status={status || 'in_progress'}
      style={{
        padding: '18px 24px',
        borderRadius: '16px',
        background: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', maxWidth: '780px' }}>
        <div
          style={{
            padding: '10px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#34d399',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Stethoscope size={22} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(249, 115, 22, 0.15)',
                color: '#fb923c',
                border: '1px solid rgba(249, 115, 22, 0.3)',
              }}
            >
              Plantão em Andamento
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
              Plantão #{plantaoNumber} ({bedCount} Leitos)
            </span>
          </div>
          <h4
            style={{ fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}
            data-testid="banner-heading"
          >
            🏥 Plantão em Andamento — Leitos aguardando prescrição e conduta na Sala Vermelha.
          </h4>
        </div>
      </div>

      <button
        onClick={() => router.push(`/testes/${plantao.id}`)}
        className="btn-primary"
        data-testid="btn-continue-plantao"
        style={{
          padding: '9px 18px',
          fontSize: '0.85rem',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <span>Continuar Plantão</span>
        <Play size={14} />
      </button>
    </div>
  );
}
