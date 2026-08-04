'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { QuestionItem } from '@/lib/ai/openrouter';
import { determineBedOutcome } from '@/lib/spaced-repetition';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import {
  Award,
  CheckCircle2,
  XCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  Settings2,
  Stethoscope,
  AlertTriangle,
  Flame,
} from 'lucide-react';

function getTypeBadge(type: string) {
  switch (type) {
    case 'multiple_choice':
      return { label: 'Múltipla Escolha', color: '#34d399', icon: CheckCircle2 };
    case 'prescription_complete':
      return { label: 'Prescrição Completa', color: '#fbbf24', icon: FileText };
    case 'prescription_immediate':
      return { label: 'Prescrição Imediata', color: '#fb923c', icon: Zap };
    case 'ventilator':
      return { label: 'Ventilador Mecânico', color: '#a78bfa', icon: Settings2 };
    default:
      return { label: 'Questão', color: '#38bdf8', icon: FileText };
  }
}

const VENTILATOR_FIELD_LABELS: Record<string, string> = {
  modo: 'Modo Ventilatório',
  volumeCorrente: 'Volume Corrente (Vt)',
  frequenciaRespiratoria: 'Frequência Respiratória (FR)',
  pressaoInspiratoria: 'Pressão Inspiratória (Pinsp / ΔP)',
  pressaoSuporte: 'Pressão de Suporte (PS)',
  tempoInspiratorio: 'Tempo Inspiratório (Ti)',
  peep: 'PEEP',
  fio2: 'FiO₂',
  relacaoIE: 'Relação I:E / Ti',
  fluxoOuPressao: 'Fluxo / Pressão Inspiratória',
  sensibilidade: 'Sensibilidade (Trigger)',
  pressaoPlatoAlvo: 'Alvo de Pplatô / Driving Pressure',
  ciclagemFluxo: 'Ciclagem por Fluxo (% Fluxo)',
  ventilacaoBackup: 'Ventilação de Backup (Apneia)',
  alarmes: 'Alarmes Configurados',
};

export default function TestResultPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const testId = resolvedParams.id;
  const router = useRouter();
  const supabase = createClient();

  const [testData, setTestData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});

  useEffect(() => {
    async function loadResult() {
      setLoading(true);
      const { data, error } = await supabase
        .from('tests')
        .select('*')
        .eq('id', testId)
        .single();

      if (data) {
        setTestData(data);
      }
      setLoading(false);
    }

    loadResult();
  }, [testId]);

  const toggleExpand = (id: number) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando resultado...</div>;
  }

  if (!testData) {
    return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Resultado não encontrado.</div>;
  }

  const score = Number(testData.score) || 0;
  const questions = (testData.questions || []) as QuestionItem[];
  const results = testData.results || {};
  const isPlantao = testData.mode === 'plantao';
  const plantaoData = testData.plantao_data || {};
  const beds = plantaoData.beds || [];

  const getScoreColor = (val: number) => {
    if (val >= 8) return '#34d399'; // Emerald
    if (val >= 6) return '#38bdf8'; // Cyan
    if (val >= 4) return '#fbbf24'; // Amber
    return '#f43f5e'; // Rose
  };

  const mainScoreColor = getScoreColor(score);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Top Banner Card */}
      <div
        className="glass-panel"
        style={{
          padding: '36px',
          borderRadius: '24px',
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.7) 100%)',
          border: `1px solid ${mainScoreColor}40`,
          boxShadow: `0 10px 40px ${mainScoreColor}15`,
        }}
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '20px',
            background: `${mainScoreColor}20`,
            border: `1px solid ${mainScoreColor}50`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px auto',
            color: mainScoreColor,
          }}
        >
          {isPlantao ? <Stethoscope size={36} /> : <Award size={36} />}
        </div>

        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
          {isPlantao ? `Relatório de Plantão Noturno #${plantaoData.plantaoNumber || 1}` : 'Desempenho no Simulado IA'}
        </h1>

        <div style={{ fontSize: '3rem', fontWeight: 900, color: mainScoreColor, margin: '16px 0 8px 0' }}>
          {score} <span style={{ fontSize: '1.4rem', color: 'var(--text-subtle)', fontWeight: 600 }}>/ 10.0</span>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          {isPlantao
            ? `Atendimento simulado em ${beds.length} leitos de UPA. ${questions.length} questões respondidas.`
            : `Avaliação do simulado contendo ${questions.length} questões de emergência.`}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '24px' }}>
          <button onClick={() => router.push(isPlantao ? '/plantoes' : '/historico')} className="btn-secondary">
            Ver Histórico
          </button>
          <button
            onClick={() => router.push(isPlantao ? '/testes?mode=plantao' : '/testes')}
            className="btn-primary"
            style={{
              background: isPlantao
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)',
            }}
          >
            <Sparkles size={18} /> {isPlantao ? 'Iniciar Novo Plantão' : 'Gerar Novo Teste'}
          </button>
        </div>
      </div>

      {/* GENERAL PRECEPTOR FEEDBACK CARD */}
      {results?.generalFeedback && (
        <div
          className="glass-panel"
          style={{
            padding: '28px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            boxShadow: '0 8px 32px rgba(56, 189, 248, 0.08)',
          }}
        >
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#38bdf8',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <Sparkles size={22} color="#38bdf8" />
            Feedback do Preceptor — Análise Geral & Plano de Aprimoramento
          </h2>

          <div
            style={{
              background: 'rgba(15, 23, 42, 0.5)',
              padding: '22px',
              borderRadius: '14px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <MarkdownRenderer content={results.generalFeedback} />
          </div>
        </div>
      )}

      {/* PLANTÃO BEDS MAP GRID */}
      {isPlantao && beds.length > 0 && (
        <div className="glass-panel" style={{ padding: '28px', borderRadius: '20px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Stethoscope size={20} color="#34d399" />
            Mapa de Leitos do Plantão ({beds.length} Pacientes)
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {beds.map((bed: any) => {
              const bedQs = questions.filter(
                (q) => (bed.questionIds || []).includes(q.id) || bed.bonusQuestionId === q.id
              );
              let bedPoints = 0;
              bedQs.forEach((q) => {
                bedPoints += results[q.id]?.score || 0;
              });

              const bedAvgScore = bedQs.length > 0 ? bedPoints / bedQs.length : 0;
              const outcome = determineBedOutcome(bedAvgScore, 10);

              const outcomeColors: Record<string, { bg: string; color: string; border: string }> = {
                green: { bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)' },
                yellow: { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
                orange: { bg: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', border: 'rgba(249, 115, 22, 0.3)' },
                red: { bg: 'rgba(244, 63, 94, 0.15)', color: '#fda4af', border: 'rgba(244, 63, 94, 0.3)' },
              };

              const style = outcomeColors[outcome.color];

              return (
                <div
                  key={bed.bedNumber}
                  style={{
                    padding: '20px',
                    borderRadius: '16px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: `1px solid ${style.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 800, color: '#fff', fontSize: '1rem' }}>
                      🛏️ Leito 0{bed.bedNumber}
                    </span>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: style.bg,
                        color: style.color,
                        border: `1px solid ${style.border}`,
                      }}
                    >
                      {outcome.label}
                    </span>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0' }}>
                      Cap. {bed.chapterId}: {bed.chapterTitle}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', marginTop: '4px' }}>
                      {bed.sectionTitle}
                    </div>
                  </div>

                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {outcome.message}
                  </div>

                  {bed.bonusQuestionId && (
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#fda4af',
                        background: 'rgba(244, 63, 94, 0.15)',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <AlertTriangle size={14} /> EVOLUÇÃO ADVERSA ACIONADA (Q5 Extra)
                    </div>
                  )}

                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: style.color, paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                    Nota do Leito: {Math.round(bedAvgScore * 10) / 10} / 10
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DETAILED QUESTION EVALUATION LIST */}
      <div className="glass-panel" style={{ padding: '32px', borderRadius: '20px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', marginBottom: '20px' }}>
          Detalhamento das Respostas & Avaliações IA
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {questions.map((q, idx) => {
            const res = results[q.id] || {};
            const isExpanded = expandedItems[q.id];
            const badge = getTypeBadge(q.type);
            const qScore = Number(res.score) || 0;
            const qColor = getScoreColor(qScore);

            return (
              <div
                key={q.id}
                style={{
                  borderRadius: '14px',
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: `1px solid ${qColor}40`,
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Collapsed Header */}
                <div
                  onClick={() => toggleExpand(q.id)}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: 'rgba(15, 23, 42, 0.6)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                    <div
                      style={{
                        padding: '6px 12px',
                        borderRadius: '10px',
                        background: `${qColor}20`,
                        color: qColor,
                        fontWeight: 800,
                        fontSize: '0.95rem',
                      }}
                    >
                      {qScore} / 10
                    </div>

                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff' }}>
                        Questão {idx + 1}: {q.chapterTitle}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: badge.color, fontWeight: 600 }}>{badge.label}</span>
                      </div>
                    </div>
                  </div>

                  {isExpanded ? <ChevronUp size={20} color="var(--text-subtle)" /> : <ChevronDown size={20} color="var(--text-subtle)" />}
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', borderTop: '1px solid var(--border-subtle)' }}>
                    {/* Vignette */}
                    <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '16px', borderRadius: '10px', fontSize: '0.92rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                      <strong>Caso Clínico:</strong> {q.vignette}
                    </div>

                    {/* MCQ Details */}
                    {q.type === 'multiple_choice' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {q.options?.map((opt, oIdx) => {
                          const isUser = res.userAnswer === oIdx;
                          const isCorrect = q.correctOption === oIdx;

                          let bg = 'rgba(15, 23, 42, 0.4)';
                          let border = 'var(--border-subtle)';
                          let color = '#94a3b8';

                          if (isCorrect) {
                            bg = 'rgba(16, 185, 129, 0.15)';
                            border = 'rgba(16, 185, 129, 0.4)';
                            color = '#34d399';
                          } else if (isUser && !isCorrect) {
                            bg = 'rgba(244, 63, 94, 0.15)';
                            border = 'rgba(244, 63, 94, 0.4)';
                            color = '#fda4af';
                          }

                          return (
                            <div
                              key={oIdx}
                              style={{
                                padding: '10px 14px',
                                borderRadius: '8px',
                                background: bg,
                                border: `1px solid ${border}`,
                                fontSize: '0.88rem',
                                color: color,
                                fontWeight: isCorrect || isUser ? 600 : 400,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <span>
                                {String.fromCharCode(65 + oIdx)}) {opt}
                              </span>
                              {isCorrect && <CheckCircle2 size={16} color="#34d399" />}
                              {isUser && !isCorrect && <XCircle size={16} color="#fda4af" />}
                            </div>
                          );
                        })}

                        {q.explanation && (
                          <div style={{ marginTop: '10px', padding: '12px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.08)', borderLeft: '3px solid #38bdf8', fontSize: '0.88rem', color: '#e2e8f0' }}>
                            <strong style={{ color: '#38bdf8', display: 'block', marginBottom: '6px' }}>Explicação:</strong>
                            <MarkdownRenderer content={q.explanation} />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Prescription / Ventilator AI Evaluation Details */}
                    {q.type !== 'multiple_choice' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-subtle)', marginBottom: '6px', textTransform: 'uppercase' }}>
                            Sua Resposta Enviada:
                          </div>
                          <div style={{ padding: '14px', borderRadius: '10px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', fontFamily: 'monospace', fontSize: '0.88rem', color: '#fff', whiteSpace: 'pre-wrap' }}>
                            {res.userPrescription || 'Sem resposta enviada'}
                          </div>
                        </div>

                        {res.evaluation && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(14, 165, 233, 0.06)', padding: '18px', borderRadius: '12px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38bdf8' }}>
                              Veredito IA: {res.evaluation.verdict || 'Avaliado'}
                            </div>

                            {res.evaluation.strengths?.length > 0 && (
                              <div>
                                <strong style={{ fontSize: '0.82rem', color: '#34d399' }}>Pontos Fortes:</strong>
                                <ul style={{ paddingLeft: '20px', marginTop: '4px', fontSize: '0.85rem', color: '#e2e8f0' }}>
                                  {res.evaluation.strengths.map((s: string, i: number) => (
                                    <li key={i}>{s}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {res.evaluation.improvements?.length > 0 && (
                              <div>
                                <strong style={{ fontSize: '0.82rem', color: '#fbbf24' }}>Pontos de Melhoria:</strong>
                                <ul style={{ paddingLeft: '20px', marginTop: '4px', fontSize: '0.85rem', color: '#e2e8f0' }}>
                                  {res.evaluation.improvements.map((imp: string, i: number) => (
                                    <li key={i}>{imp}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {res.evaluation.detailedFeedback && (
                              <div style={{ fontSize: '0.88rem', color: '#cbd5e1', marginTop: '6px', lineHeight: 1.5 }}>
                                <strong style={{ color: '#38bdf8', display: 'block', marginBottom: '6px' }}>Feedback Detalhado:</strong>
                                <MarkdownRenderer content={res.evaluation.detailedFeedback} />
                              </div>
                            )}

                            {res.evaluation.idealPrescription && (
                              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                                <strong style={{ fontSize: '0.82rem', color: '#34d399' }}>Gabarito de Referência (Nota 10):</strong>
                                <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', fontFamily: 'monospace', fontSize: '0.85rem', color: '#34d399', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                                  {res.evaluation.idealPrescription}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
