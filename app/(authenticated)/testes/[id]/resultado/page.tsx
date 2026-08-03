'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { QuestionItem } from '@/lib/ai/openrouter';
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
  volumeCorrente: 'Volume Corrente',
  frequenciaRespiratoria: 'Frequência Respiratória',
  peep: 'PEEP',
  fio2: 'FiO₂',
  relacaoIE: 'Relação I:E',
  pressaoPlatoAlvo: 'Pressão de Platô Alvo',
  fluxoOuPressao: 'Fluxo / Pressão',
  alarmes: 'Alarmes',
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

  const getScoreColor = (val: number) => {
    if (val >= 8) return '#34d399'; // Emerald
    if (val >= 6) return '#38bdf8'; // Cyan
    if (val >= 4) return '#fbbf24'; // Amber
    return '#f43f5e'; // Rose
  };

  const scoreColor = getScoreColor(score);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '880px', margin: '0 auto' }}>
      
      {/* Score Header Card */}
      <div
        className="glass-panel"
        style={{
          padding: '36px',
          borderRadius: '24px',
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.8) 100%)',
          border: `1px solid ${scoreColor}40`,
          boxShadow: `0 12px 40px ${scoreColor}15`,
        }}
      >
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '24px',
          background: `${scoreColor}20`,
          border: `1px solid ${scoreColor}50`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px auto',
          color: scoreColor,
        }}>
          <Award size={38} />
        </div>

        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-subtle)', marginBottom: '4px' }}>
          DESEMPENHO AVALIADO POR IA
        </div>
        <div style={{ fontSize: '3rem', fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
          {score} <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>/ 10</span>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '12px', maxWidth: '500px', margin: '12px auto 0 auto' }}>
          {score >= 8
            ? 'Excelente raciocínio clínico! Conduta segura para sala vermelha e porta de UPA.'
            : score >= 6
            ? 'Bom desempenho! Revise as observações e posologias sugeridas pela IA.'
            : 'Atenção aos pontos de melhoria nas prescrições e condutas de emergência.'}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '24px' }}>
          <button onClick={() => router.push('/testes')} className="btn-primary">
            <Sparkles size={18} /> Gerar Novo Teste
          </button>
          <button onClick={() => router.push('/dashboard')} className="btn-secondary">
            Voltar ao Dashboard
          </button>
        </div>
      </div>

      {/* Detailed Questions Review */}
      <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>
        Análise Detalhada Questão por Questão
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {questions.map((q, idx) => {
          const res = results[q.id] || {};
          const isMultiple = q.type === 'multiple_choice';
          const isExpanded = expandedItems[q.id] !== false; // Default expanded
          const badge = getTypeBadge(q.type);
          const qScoreColor = isMultiple
            ? res.isCorrect ? '#34d399' : '#f43f5e'
            : getScoreColor(res.score || 0);

          return (
            <div
              key={q.id}
              className="glass-panel"
              style={{
                padding: '24px',
                borderRadius: '16px',
                borderLeft: `4px solid ${qScoreColor}`,
              }}
            >
              {/* Question Header */}
              <div
                onClick={() => toggleExpand(q.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {isMultiple ? (
                    res.isCorrect ? <CheckCircle2 size={22} color="#34d399" /> : <XCircle size={22} color="#f43f5e" />
                  ) : (
                    <badge.icon size={22} color={badge.color} />
                  )}
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontWeight: 600 }}>
                      Questão {idx + 1} • {q.chapterTitle}
                    </span>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', marginTop: '2px' }}>
                      {badge.label}
                    </h3>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: qScoreColor,
                  }}>
                    {isMultiple ? (res.isCorrect ? '+10 pts' : '0 pts') : `${res.score || 0} / 10 pts`}
                  </span>
                  {isExpanded ? <ChevronUp size={18} color="var(--text-subtle)" /> : <ChevronDown size={18} color="var(--text-subtle)" />}
                </div>
              </div>

              {/* Expanded Body */}
              {isExpanded && (
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Vignette */}
                  <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '14px', borderRadius: '10px', fontSize: '0.92rem', color: 'var(--text-muted)' }}>
                    {q.vignette}
                  </div>

                  {/* Multiple Choice Feedback */}
                  {isMultiple && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, padding: '12px', borderRadius: '10px', background: res.isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)', border: `1px solid ${res.isCorrect ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}` }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-subtle)' }}>Sua Resposta:</span>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: res.isCorrect ? '#34d399' : '#f43f5e', marginTop: '2px' }}>
                            {res.userAnswer !== undefined && q.options ? q.options[res.userAnswer] : 'Não respondida'}
                          </div>
                        </div>

                        {!res.isCorrect && q.options && q.correctOption !== undefined && (
                          <div style={{ flex: 1, padding: '12px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-subtle)' }}>Resposta Correta:</span>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#38bdf8', marginTop: '2px' }}>
                              {q.options[q.correctOption]}
                            </div>
                          </div>
                        )}
                      </div>

                      {q.explanation && (
                        <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '14px', borderRadius: '10px', borderLeft: '3px solid #38bdf8', fontSize: '0.88rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                          <strong style={{ color: '#38bdf8' }}>Explicação Clínica:</strong> {q.explanation}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prescription / Ventilator AI Evaluation Feedback */}
                  {!isMultiple && res.evaluation && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '14px', borderRadius: '10px', borderLeft: `3px solid ${getScoreColor(res.score)}` }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: getScoreColor(res.score), marginBottom: '6px' }}>
                          PARECER DO PRECEPTOR IA: {res.evaluation.verdict || 'Avaliado'}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: '#f8fafc', lineHeight: 1.5 }}>
                          {res.evaluation.detailedFeedback}
                        </div>
                      </div>

                      {/* Strengths & Improvements */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                        {res.evaluation.strengths && res.evaluation.strengths.length > 0 && (
                          <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34d399', marginBottom: '6px' }}>
                              ✓ Pontos Fortes:
                            </div>
                            <ul style={{ paddingLeft: '18px', fontSize: '0.82rem', color: '#e2e8f0' }}>
                              {res.evaluation.strengths.map((item: string, i: number) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {res.evaluation.improvements && res.evaluation.improvements.length > 0 && (
                          <div style={{ padding: '12px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24', marginBottom: '6px' }}>
                              ⚠ O que Pode/Deve Ajustar:
                            </div>
                            <ul style={{ paddingLeft: '18px', fontSize: '0.82rem', color: '#e2e8f0' }}>
                              {res.evaluation.improvements.map((item: string, i: number) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Ventilator Comparison Table */}
                      {q.type === 'ventilator' && res.ventilatorData && q.idealVentilator && (
                        <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#a78bfa', marginBottom: '12px' }}>
                            Comparação: Seus Parâmetros vs. Ideal
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                <th style={{ textAlign: 'left', padding: '8px', color: 'var(--text-subtle)', fontWeight: 600 }}>Parâmetro</th>
                                <th style={{ textAlign: 'left', padding: '8px', color: '#fb923c', fontWeight: 600 }}>Sua Config.</th>
                                <th style={{ textAlign: 'left', padding: '8px', color: '#34d399', fontWeight: 600 }}>Ideal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(q.idealVentilator).map(([key, idealVal]) => (
                                <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                  <td style={{ padding: '8px', color: '#e2e8f0', fontWeight: 600 }}>
                                    {VENTILATOR_FIELD_LABELS[key] || key}
                                  </td>
                                  <td style={{ padding: '8px', color: '#fb923c' }}>
                                    {res.ventilatorData[key] || '(não preenchido)'}
                                  </td>
                                  <td style={{ padding: '8px', color: '#34d399' }}>
                                    {idealVal}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* User Prescription vs Ideal Prescription */}
                      {(q.type === 'prescription_complete' || q.type === 'prescription_immediate') && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '12px', borderRadius: '10px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-subtle)' }}>Sua Prescrição Escrita:</span>
                            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem', color: '#e2e8f0', marginTop: '6px' }}>
                              {res.userPrescription}
                            </pre>
                          </div>

                          {res.evaluation.idealPrescription && (
                            <div style={{ background: 'rgba(14, 165, 233, 0.08)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8' }}>Prescrição de Referência:</span>
                              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem', color: '#38bdf8', marginTop: '6px' }}>
                                {res.evaluation.idealPrescription}
                              </pre>
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
  );
}
