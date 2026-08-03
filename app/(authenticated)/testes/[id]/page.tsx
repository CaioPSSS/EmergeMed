'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { QuestionItem } from '@/lib/ai/openrouter';
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Loader2,
  AlertCircle,
  FileText,
  Stethoscope,
  Zap,
  Settings2,
} from 'lucide-react';

const VENTILATOR_FIELD_LABELS: Record<string, { label: string; unit: string; placeholder: string }> = {
  modo: { label: 'Modo Ventilatório', unit: '', placeholder: 'VCV, PCV ou PSV' },
  volumeCorrente: { label: 'Volume Corrente', unit: 'mL', placeholder: 'Ex: 420' },
  frequenciaRespiratoria: { label: 'Frequência Respiratória', unit: 'irpm', placeholder: 'Ex: 20' },
  peep: { label: 'PEEP', unit: 'cmH₂O', placeholder: 'Ex: 10' },
  fio2: { label: 'FiO₂', unit: '', placeholder: 'Ex: 1.0 ou 0.6' },
  relacaoIE: { label: 'Relação I:E', unit: '', placeholder: 'Ex: 1:2' },
  pressaoPlatoAlvo: { label: 'Pressão de Platô Alvo', unit: 'cmH₂O', placeholder: 'Ex: < 30' },
  fluxoOuPressao: { label: 'Fluxo / Pressão Inspiratória', unit: '', placeholder: 'Ex: 50 L/min' },
  alarmes: { label: 'Alarmes Configurados', unit: '', placeholder: 'Ppico, Vt, FR, SpO2...' },
};

function getTypeBadge(type: string) {
  switch (type) {
    case 'multiple_choice':
      return { label: 'Múltipla Escolha', bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
    case 'prescription_complete':
      return { label: 'Prescrição Completa', bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
    case 'prescription_immediate':
      return { label: 'Prescrição Imediata', bg: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', border: 'rgba(249, 115, 22, 0.3)' };
    case 'ventilator':
      return { label: 'Ventilador Mecânico', bg: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', border: 'rgba(139, 92, 246, 0.3)' };
    default:
      return { label: 'Questão', bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' };
  }
}

export default function TakeTestPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const testId = resolvedParams.id;
  const router = useRouter();
  const supabase = createClient();

  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<number, any>>({});
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTest() {
      setLoading(true);
      const { data, error } = await supabase
        .from('tests')
        .select('*')
        .eq('id', testId)
        .single();

      if (error || !data) {
        setError('Teste não encontrado ou já concluído.');
      } else {
        setQuestions(data.questions as QuestionItem[]);
        if (data.answers) {
          setUserAnswers(data.answers);
        }
      }
      setLoading(false);
    }

    loadTest();
  }, [testId]);

  const handleSelectOption = (questionId: number, optionIndex: number) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const handlePrescriptionTextChange = (questionId: number, text: string) => {
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: text,
    }));
  };

  const handleVentilatorFieldChange = (questionId: number, field: string, value: string) => {
    setUserAnswers((prev) => {
      const current = (prev[questionId] as Record<string, string>) || {};
      return {
        ...prev,
        [questionId]: { ...current, [field]: value },
      };
    });
  };

  const handleSubmitTest = async () => {
    // B8: Check unanswered questions count
    const unansweredCount = questions.filter((q) => {
      const answer = userAnswers[q.id];
      if (answer === undefined || answer === null) return true;
      if (typeof answer === 'string' && answer.trim() === '') return true;
      if (q.type === 'ventilator' && typeof answer === 'object') {
        return Object.values(answer).every((v) => !v || (v as string).trim() === '');
      }
      return false;
    }).length;

    if (unansweredCount > 0) {
      const confirmSubmit = window.confirm(
        `Você possui ${unansweredCount} questão(ões) sem resposta. Deseja finalizar e enviar o teste mesmo assim?`
      );
      if (!confirmSubmit) return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const evaluations: Record<number, any> = {};
      let totalPoints = 0;
      const maxPoints = questions.length * 10;

      // Evaluate multiple choice immediately, prepare promises for AI-evaluated questions
      const aiEvalPromises: Promise<{ id: number; evalData: any; userAnswer: any }>[] = [];

      for (const q of questions) {
        const answer = userAnswers[q.id];

        if (q.type === 'multiple_choice') {
          const isCorrect = answer === q.correctOption;
          const score = isCorrect ? 10 : 0;
          totalPoints += score;

          evaluations[q.id] = {
            userAnswer: answer,
            isCorrect,
            score,
            explanation: q.explanation,
          };
        } else if (q.type === 'prescription_complete' || q.type === 'prescription_immediate') {
          const userPrescription = answer || 'Sem resposta enviada';

          aiEvalPromises.push(
            fetch('/api/evaluate-prescription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                vignette: q.vignette,
                userPrescription,
                idealPrescription: q.idealPrescription,
                evaluationCriteria: q.evaluationCriteria,
                chapterId: q.chapterId,
                questionType: q.type,
              }),
            })
              .then((res) => res.json())
              .then((evalData) => ({ id: q.id, evalData, userAnswer: userPrescription }))
          );
        } else if (q.type === 'ventilator') {
          const ventilatorData = (answer as Record<string, string>) || {};
          const userPrescription = Object.entries(ventilatorData)
            .map(([k, v]) => `${k}: ${v || '(vazio)'}`)
            .join('\n');

          aiEvalPromises.push(
            fetch('/api/evaluate-prescription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                vignette: q.vignette,
                userPrescription,
                idealPrescription: q.idealVentilator
                  ? Object.entries(q.idealVentilator).map(([k, v]) => `${k}: ${v}`).join('\n')
                  : undefined,
                evaluationCriteria: q.evaluationCriteria,
                chapterId: q.chapterId,
                questionType: 'ventilator',
                ventilatorData,
              }),
            })
              .then((res) => res.json())
              .then((evalData) => ({ id: q.id, evalData, userAnswer: ventilatorData }))
          );
        }
      }

      // B4: Run AI evaluations in parallel via Promise.all
      if (aiEvalPromises.length > 0) {
        const aiResults = await Promise.all(aiEvalPromises);

        for (const res of aiResults) {
          const score = Number(res.evalData.evaluation?.score) || 0;
          totalPoints += score;

          evaluations[res.id] = {
            userPrescription: typeof res.userAnswer === 'string' ? res.userAnswer : JSON.stringify(res.userAnswer),
            ventilatorData: typeof res.userAnswer === 'object' ? res.userAnswer : undefined,
            evaluation: res.evalData.evaluation,
            score,
          };
        }
      }

      const finalScore = Math.round((totalPoints / maxPoints) * 100) / 10; // 0.0 to 10.0

      // Update test record in Supabase
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('tests')
        .update({
          answers: userAnswers,
          results: evaluations,
          score: finalScore,
          completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq('id', testId);

      router.push(`/testes/${testId}/resultado`);
    } catch (err: any) {
      setError(err.message || 'Erro ao submeter e avaliar o teste.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Loader2 size={32} className="spin" style={{ margin: '0 auto 16px auto', animation: 'spin 1s linear infinite' }} />
        Carregando simulado...
      </div>
    );
  }

  if (error || questions.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', maxWidth: '500px', margin: '40px auto' }}>
        <AlertCircle size={36} color="#f43f5e" style={{ margin: '0 auto 16px auto' }} />
        <h2 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '8px' }}>Erro ao Carregar Simulado</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>{error}</p>
        <button onClick={() => router.push('/testes')} className="btn-primary">
          Voltar para Gerador de Testes
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const currentAnswer = userAnswers[currentQ.id];
  const typeBadge = getTypeBadge(currentQ.type);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '840px', margin: '0 auto' }}>
      {/* Test Top Bar */}
      <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Stethoscope size={22} color="#38bdf8" />
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
            Simulado de Emergência
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            Questão {currentIndex + 1} de {questions.length}
          </span>
          <div style={{ width: '100px' }} className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Question Card */}
      <div className="glass-panel" style={{ padding: '32px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Chapter Tag + Type Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '0.78rem',
            fontWeight: 700,
            background: 'rgba(56, 189, 248, 0.15)',
            color: '#38bdf8',
            border: '1px solid rgba(56, 189, 248, 0.3)',
          }}>
            Capítulo: {currentQ.chapterTitle}
          </span>
          <span style={{
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '0.78rem',
            fontWeight: 700,
            background: typeBadge.bg,
            color: typeBadge.color,
            border: `1px solid ${typeBadge.border}`,
          }}>
            {typeBadge.label}
          </span>
        </div>

        {/* Clinical Vignette */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          padding: '20px',
          borderRadius: '14px',
          borderLeft: `4px solid ${typeBadge.color}`,
          fontSize: '1rem',
          lineHeight: '1.6',
          color: '#f8fafc',
        }}>
          {currentQ.vignette}
        </div>

        {/* Multiple Choice Options */}
        {currentQ.type === 'multiple_choice' && currentQ.options && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {currentQ.options.map((optText, optIdx) => {
              const isSelected = currentAnswer === optIdx;
              return (
                <div
                  key={optIdx}
                  onClick={() => handleSelectOption(currentQ.id, optIdx)}
                  style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    background: isSelected ? 'rgba(14, 165, 233, 0.15)' : 'rgba(15, 23, 42, 0.4)',
                    border: isSelected ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    color: isSelected ? '#38bdf8' : '#e2e8f0',
                    fontWeight: isSelected ? 600 : 400,
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: isSelected ? '2px solid #38bdf8' : '1px solid var(--border-subtle)',
                    background: isSelected ? '#38bdf8' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: isSelected ? '#090d16' : 'var(--text-subtle)',
                    flexShrink: 0,
                  }}>
                    {String.fromCharCode(65 + optIdx)}
                  </div>
                  <span>{optText}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Prescription Complete Text Area */}
        {currentQ.type === 'prescription_complete' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} color="#fbbf24" />
              {currentQ.promptText || 'Escreva sua prescrição COMPLETA de internação para este caso:'}
            </label>
            <textarea
              className="input-field"
              rows={14}
              style={{
                fontFamily: 'monospace',
                fontSize: '0.92rem',
                lineHeight: '1.5',
                padding: '16px',
                resize: 'vertical',
              }}
              placeholder={`Estrutura sugerida:
REPOUSO E CABECEIRA: ...
DIETA: ...
HIDRATAÇÃO E INFUSÕES:
1. SF 0,9% ...
MEDICAMENTOS FIXOS:
2. Ceftriaxona ...
SINTOMÁTICOS E PROTOCOLOS:
• DOR/FEBRE: Dipirona ...
• HIPERGLICEMIA: Insulina Regular SC conforme HGT ...
• PROFILAXIA TEV: Enoxaparina ...
• PROFILAXIA MUCOSA: Omeprazol ...`}
              value={currentAnswer || ''}
              onChange={(e) => handlePrescriptionTextChange(currentQ.id, e.target.value)}
            />
          </div>
        )}

        {/* Prescription Immediate Text Area */}
        {currentQ.type === 'prescription_immediate' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={16} color="#fb923c" />
              {currentQ.promptText || 'Prescreva a MEDICAÇÃO/CONDUTA IMEDIATA para este momento:'}
            </label>
            <textarea
              className="input-field"
              rows={5}
              style={{
                fontFamily: 'monospace',
                fontSize: '0.92rem',
                lineHeight: '1.5',
                padding: '16px',
                resize: 'vertical',
              }}
              placeholder={`Exemplo:
Diazepam 10mg (2mL) IV em flush AGORA
Se sem acesso: Midazolam 10mg IM`}
              value={currentAnswer || ''}
              onChange={(e) => handlePrescriptionTextChange(currentQ.id, e.target.value)}
            />
          </div>
        )}

        {/* Ventilator Configuration Fields */}
        {currentQ.type === 'ventilator' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings2 size={16} color="#a78bfa" />
              {currentQ.promptText || 'Configure os parâmetros do ventilador mecânico:'}
            </label>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '12px',
            }}>
              {Object.entries(VENTILATOR_FIELD_LABELS).map(([fieldKey, fieldInfo]) => {
                const currentVentData = (currentAnswer as Record<string, string>) || {};
                return (
                  <div key={fieldKey} style={{
                    background: 'rgba(15, 23, 42, 0.5)',
                    padding: '14px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-subtle)',
                  }}>
                    <label style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#a78bfa',
                      display: 'block',
                      marginBottom: '6px',
                    }}>
                      {fieldInfo.label} {fieldInfo.unit && <span style={{ color: 'var(--text-subtle)' }}>({fieldInfo.unit})</span>}
                    </label>
                    {fieldKey === 'alarmes' ? (
                      <textarea
                        className="input-field"
                        rows={2}
                        style={{ fontSize: '0.88rem', padding: '8px 12px', resize: 'vertical' }}
                        placeholder={fieldInfo.placeholder}
                        value={currentVentData[fieldKey] || ''}
                        onChange={(e) => handleVentilatorFieldChange(currentQ.id, fieldKey, e.target.value)}
                      />
                    ) : (
                      <input
                        type="text"
                        className="input-field"
                        style={{ fontSize: '0.88rem', padding: '8px 12px' }}
                        placeholder={fieldInfo.placeholder}
                        value={currentVentData[fieldKey] || ''}
                        onChange={(e) => handleVentilatorFieldChange(currentQ.id, fieldKey, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom Navigation & Submit Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '20px', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0 || submitting}
            className="btn-secondary"
            style={{ opacity: currentIndex === 0 ? 0.5 : 1 }}
          >
            <ChevronLeft size={18} /> Anterior
          </button>

          {!isLastQuestion ? (
            <button
              onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
              className="btn-primary"
            >
              Próxima <ChevronRight size={18} />
            </button>
          ) : (
            <button
              onClick={handleSubmitTest}
              disabled={submitting}
              className="btn-primary"
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)' }}
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Avaliando via IA...
                </>
              ) : (
                <>
                  Finalizar & Ver Resultado IA <Send size={18} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
