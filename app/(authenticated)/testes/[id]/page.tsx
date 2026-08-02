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
} from 'lucide-react';

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

  const handleSubmitTest = async () => {
    // B8: Check unanswered questions count
    const unansweredCount = questions.filter(
      (q) => userAnswers[q.id] === undefined || userAnswers[q.id] === '' || userAnswers[q.id] === null
    ).length;

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

      // Evaluate multiple choice immediately, prepare promises for prescriptions
      const prescriptionPromises: Promise<{ id: number; evalData: any; userPrescription: string }>[] = [];

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
        } else if (q.type === 'prescription') {
          const userPrescription = answer || 'Sem resposta enviada';

          prescriptionPromises.push(
            fetch('/api/evaluate-prescription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                vignette: q.vignette,
                userPrescription,
                idealPrescription: q.idealPrescription,
                evaluationCriteria: q.evaluationCriteria,
                chapterId: q.chapterId,
              }),
            })
              .then((res) => res.json())
              .then((evalData) => ({ id: q.id, evalData, userPrescription }))
          );
        }
      }

      // B4: Run prescription evaluations in parallel via Promise.all
      if (prescriptionPromises.length > 0) {
        const prescriptionResults = await Promise.all(prescriptionPromises);

        for (const res of prescriptionResults) {
          const score = Number(res.evalData.evaluation?.score) || 0;
          totalPoints += score;

          evaluations[res.id] = {
            userPrescription: res.userPrescription,
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
        
        {/* Chapter Tag */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            background: currentQ.type === 'multiple_choice' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            color: currentQ.type === 'multiple_choice' ? '#34d399' : '#fbbf24',
            border: `1px solid ${currentQ.type === 'multiple_choice' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
          }}>
            {currentQ.type === 'multiple_choice' ? 'Múltipla Escolha' : 'Prescrição Médica'}
          </span>
        </div>

        {/* Clinical Vignette */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.6)',
          padding: '20px',
          borderRadius: '14px',
          borderLeft: '4px solid #38bdf8',
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

        {/* Prescription Text Area */}
        {currentQ.type === 'prescription' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} color="#34d399" />
              {currentQ.promptText || 'Escreva sua prescrição completa para este caso:'}
            </label>
            <textarea
              className="input-field"
              rows={8}
              style={{
                fontFamily: 'monospace',
                fontSize: '0.92rem',
                lineHeight: '1.5',
                padding: '16px',
                resize: 'vertical',
              }}
              placeholder={`Exemplo de formato:
1. Soro Fisiológico 0.9% 1000mL IV agora em 30 min
2. Ceftriaxona 2g IV agora (após culturas)
3. Hemoculturas 2 pares + Urocultura
4. Monitorização contínua de SpO2, PA e ECG
5. Se PAM < 65 mmHg: iniciar Noradrenalina 0.05 mcg/kg/min...`}
              value={currentAnswer || ''}
              onChange={(e) => handlePrescriptionTextChange(currentQ.id, e.target.value)}
            />
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
                  <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Avaliando Prescrições via IA...
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
