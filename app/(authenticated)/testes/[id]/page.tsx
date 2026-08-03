'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { QuestionItem } from '@/lib/ai/openrouter';
import { calculateSM2Update, determineBedOutcome } from '@/lib/spaced-repetition';
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
  CheckCircle2,
  AlertTriangle,
  Flame,
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

  const [testRecord, setTestRecord] = useState<any>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<number, any>>({});
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [generatingAdverse, setGeneratingAdverse] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Plantão specific state
  const isPlantao = testRecord?.mode === 'plantao';
  const plantaoData = testRecord?.plantao_data || null;
  const beds = plantaoData?.beds || [];

  useEffect(() => {
    async function loadTest() {
      setLoading(true);
      const { data, error } = await supabase
        .from('tests')
        .select('*')
        .eq('id', testId)
        .single();

      if (error || !data) {
        setError('Simulado ou Plantão não encontrado.');
      } else {
        setTestRecord(data);
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

  // Helper to find which bed the current question belongs to
  const currentBed = beds.find((b: any) =>
    (b.questionIds || []).includes(questions[currentIndex]?.id) ||
    b.bonusQuestionId === questions[currentIndex]?.id
  );

  const triggerAdverseEvolutionIfNeeded = async (bed: any) => {
    if (!bed || bed.bonusQuestionId) return; // Already has bonus question

    const bedQuestions = questions.filter(
      (q) => (bed.questionIds || []).includes(q.id)
    );

    // Count wrong multiple choice questions
    const mcqWrong = bedQuestions.filter(
      (q) => q.type === 'multiple_choice' && userAnswers[q.id] !== undefined && userAnswers[q.id] !== q.correctOption
    );

    // If 2+ MCQ questions were answered wrong, trigger adverse evolution
    if (mcqWrong.length >= 2) {
      setGeneratingAdverse(true);
      try {
        const errorsContext = mcqWrong.map((q) => ({
          questionType: q.type,
          vignette: q.vignette,
          userText: q.options?.[userAnswers[q.id]] || 'Opção incorreta',
          idealText: q.options?.[q.correctOption || 0] || 'Opção correta',
        }));

        const res = await fetch('/api/generate-adverse-evolution', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            testId,
            bedNumber: bed.bedNumber,
            chapterTitle: bed.chapterTitle,
            originalVignette: bedQuestions[0]?.vignette || '',
            errorsContext,
          }),
        });

        const data = await res.json();
        if (res.ok && data.question) {
          // Append new Q5 to questions list
          setQuestions((prev) => {
            if (prev.some((q) => q.id === data.question.id)) return prev;
            return [...prev, data.question];
          });
        }
      } catch (err) {
        console.warn('Failed to generate adverse evolution:', err);
      } finally {
        setGeneratingAdverse(false);
      }
    }
  };

  const handleNext = async () => {
    if (isPlantao && currentBed) {
      await triggerAdverseEvolutionIfNeeded(currentBed);
    }
    setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1));
  };

  const handleSubmitTest = async () => {
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

      const { data: { user } } = await supabase.auth.getUser();

      // If it's a Plantão, calculate SM-2 updates for each chapter
      if (isPlantao && beds.length > 0 && user) {
        for (const bed of beds) {
          const bedQs = questions.filter(
            (q) => (bed.questionIds || []).includes(q.id) || bed.bonusQuestionId === q.id
          );
          let bedPoints = 0;
          bedQs.forEach((q) => {
            bedPoints += evaluations[q.id]?.score || 0;
          });
          const bedAvgScore = bedQs.length > 0 ? bedPoints / bedQs.length : 0;

          // Fetch current stat for this chapter
          const { data: stat } = await supabase
            .from('chapter_review_stats')
            .select('*')
            .eq('user_id', user.id)
            .eq('chapter_id', bed.chapterId)
            .single();

          const update = calculateSM2Update(stat, bedAvgScore);

          await supabase.from('chapter_review_stats').upsert({
            user_id: user.id,
            chapter_id: bed.chapterId,
            ...update,
          });
        }
      }

      // Update test record in Supabase
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
        Carregando...
      </div>
    );
  }

  if (error || questions.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', maxWidth: '500px', margin: '40px auto' }}>
        <AlertCircle size={36} color="#f43f5e" style={{ margin: '0 auto 16px auto' }} />
        <h2 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '8px' }}>Erro ao Carregar</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>{error}</p>
        <button onClick={() => router.push('/testes')} className="btn-primary">
          Voltar para Testes
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const currentAnswer = userAnswers[currentQ.id];
  const typeBadge = getTypeBadge(currentQ.type);

  return (
    <div style={{ display: 'flex', gap: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Plantão Bed Sidebar (If in Plantão Mode) */}
      {isPlantao && beds.length > 0 && (
        <aside
          style={{
            width: '240px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              padding: '16px',
              borderRadius: '16px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#34d399', fontWeight: 800, fontSize: '0.9rem' }}>
              <Stethoscope size={18} />
              <span>Plantão Noturno #{plantaoData?.plantaoNumber || 1}</span>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Leitos de Emergência ({beds.length}):
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {beds.map((bed: any) => {
                const bedQuestionIds = [...(bed.questionIds || []), bed.bonusQuestionId].filter(Boolean);
                const isCurrentBed = bedQuestionIds.includes(currentQ.id);

                // Check how many answered in this bed
                const answeredInBed = bedQuestionIds.filter((qId) => userAnswers[qId] !== undefined).length;
                const totalInBed = bedQuestionIds.length;

                return (
                  <div
                    key={bed.bedNumber}
                    onClick={() => {
                      // Navigate to first question of this bed
                      const firstQIndex = questions.findIndex((q) => q.id === bedQuestionIds[0]);
                      if (firstQIndex !== -1) setCurrentIndex(firstQIndex);
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: isCurrentBed
                        ? 'rgba(16, 185, 129, 0.2)'
                        : 'rgba(15, 23, 42, 0.5)',
                      border: isCurrentBed
                        ? '1px solid #34d399'
                        : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: isCurrentBed ? '#34d399' : '#fff' }}>
                        🛏️ Leito {bed.bedNumber}
                      </span>
                      {bed.bonusQuestionId && (
                        <span style={{ fontSize: '0.68rem', background: 'rgba(244, 63, 94, 0.2)', color: '#fda4af', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          EVOLUÇÃO ADVERSA
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Cap. {bed.chapterId}: {bed.chapterTitle}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Progresso:</span>
                      <span style={{ fontWeight: 700, color: answeredInBed === totalInBed ? '#34d399' : '#e2e8f0' }}>
                        {answeredInBed} / {totalInBed}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      )}

      {/* Main Question Card Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Test Top Bar */}
        <div
          className="glass-panel"
          style={{
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderRadius: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Stethoscope size={22} color={isPlantao ? '#34d399' : '#38bdf8'} />
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
              {isPlantao ? `Modo Plantão UPA (Leito ${currentBed?.bedNumber || 1})` : 'Simulado de Emergência'}
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

        {generatingAdverse && (
          <div
            style={{
              padding: '14px 20px',
              borderRadius: '12px',
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              color: '#fda4af',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            <span>⚠️ Paciente descompensando! IA analisando evolução adversa e gerando complicação...</span>
          </div>
        )}

        {/* Question Card */}
        <div
          className="glass-panel"
          style={{
            padding: '32px',
            borderRadius: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          {/* Chapter Tag + Type Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 700,
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              Capítulo: {currentQ.chapterTitle}
            </span>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '9999px',
                fontSize: '0.78rem',
                fontWeight: 700,
                background: typeBadge.bg,
                color: typeBadge.color,
                border: `1px solid ${typeBadge.border}`,
              }}
            >
              {typeBadge.label}
            </span>
          </div>

          {/* Clinical Vignette */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              padding: '20px',
              borderRadius: '14px',
              borderLeft: `4px solid ${typeBadge.color}`,
              fontSize: '1rem',
              lineHeight: '1.6',
              color: '#f8fafc',
            }}
          >
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
                    <div
                      style={{
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
                      }}
                    >
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
          {currentQ.type === 'ventilator' && (() => {
            const currentVentData = (currentAnswer as Record<string, string>) || {};
            const selectedMode = currentVentData.modo || '';

            const ventModes: Record<string, { title: string; subtitle: string; fields: { key: string; label: string; unit?: string; placeholder: string; isTextarea?: boolean }[] }> = {
              VCV: {
                title: 'VCV — Ventilação Controlada a Volume',
                subtitle: 'Modo a volume fixo (alvo de Vt). Recomendado para controle rígido do volume corrente.',
                fields: [
                  { key: 'volumeCorrente', label: 'Volume Corrente (Vt)', unit: 'mL', placeholder: 'Ex: 420' },
                  { key: 'frequenciaRespiratoria', label: 'Frequência Respiratória (FR)', unit: 'irpm', placeholder: 'Ex: 20' },
                  { key: 'peep', label: 'PEEP', unit: 'cmH₂O', placeholder: 'Ex: 10' },
                  { key: 'fio2', label: 'Fração Inspirada de O₂ (FiO₂)', unit: '%', placeholder: 'Ex: 100%' },
                  { key: 'fluxoOuPressao', label: 'Fluxo Inspiratório & Onda', unit: 'L/min', placeholder: 'Ex: 60 L/min' },
                  { key: 'relacaoIE', label: 'Relação I:E ou Tempo Inspiratório', placeholder: 'Ex: 1:2' },
                  { key: 'sensibilidade', label: 'Sensibilidade (Disparo/Trigger)', placeholder: 'Ex: 2 L/min' },
                  { key: 'pressaoPlatoAlvo', label: 'Alvo de Pplatô', unit: 'cmH₂O', placeholder: 'Ex: < 30 cmH₂O' },
                  { key: 'alarmes', label: 'Alarmes Configurados', placeholder: 'Ppico, Vt, FR, SpO₂...', isTextarea: true },
                ],
              },
              PCV: {
                title: 'PCV — Ventilação Controlada a Pressão',
                subtitle: 'Modo a pressão fixa acima da PEEP.',
                fields: [
                  { key: 'pressaoInspiratoria', label: 'Pressão Inspiratória (Pinsp ou ΔP)', unit: 'cmH₂O', placeholder: 'Ex: 15 cmH₂O' },
                  { key: 'frequenciaRespiratoria', label: 'Frequência Respiratória (FR)', unit: 'irpm', placeholder: 'Ex: 20' },
                  { key: 'tempoInspiratorio', label: 'Tempo Inspiratório (Ti)', placeholder: 'Ex: Ti 1.0s' },
                  { key: 'peep', label: 'PEEP', unit: 'cmH₂O', placeholder: 'Ex: 10' },
                  { key: 'fio2', label: 'Fração Inspirada de O₂ (FiO₂)', unit: '%', placeholder: 'Ex: 100%' },
                  { key: 'sensibilidade', label: 'Sensibilidade', placeholder: 'Ex: 2 L/min' },
                  { key: 'volumeCorrente', label: 'Volume Corrente Resultante Alvo', unit: 'mL', placeholder: 'Ex: Monitorar Vt 400 mL' },
                  { key: 'alarmes', label: 'Alarmes Configurados', placeholder: 'Vt, FR, SpO₂...', isTextarea: true },
                ],
              },
              PSV: {
                title: 'PSV — Pressão de Suporte (Assistida)',
                subtitle: 'Modo espontâneo assistido.',
                fields: [
                  { key: 'pressaoSuporte', label: 'Pressão de Suporte (PS)', unit: 'cmH₂O', placeholder: 'Ex: 12 cmH₂O' },
                  { key: 'peep', label: 'PEEP', unit: 'cmH₂O', placeholder: 'Ex: 8' },
                  { key: 'fio2', label: 'Fração Inspirada de O₂ (FiO₂)', unit: '%', placeholder: 'Ex: 40%' },
                  { key: 'sensibilidade', label: 'Sensibilidade Inspiratória', placeholder: 'Ex: 2 L/min' },
                  { key: 'ciclagemFluxo', label: 'Ciclagem Expiratória (% Fluxo)', placeholder: 'Ex: 25%' },
                  { key: 'ventilacaoBackup', label: 'Ventilação de Backup (Apneia)', placeholder: 'Ex: VCV, FR 15 irpm, Vt 400 mL' },
                  { key: 'alarmes', label: 'Alarmes Configurados', placeholder: 'Apneia 20s, Vt, FR...', isTextarea: true },
                ],
              },
            };

            const modeConfig = ventModes[selectedMode];

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <label style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Settings2 size={18} color="#a78bfa" />
                  {currentQ.promptText || 'Configure os parâmetros do ventilador mecânico:'}
                </label>

                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-subtle)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    1. Selecione o Modo Ventilatório:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                    {[
                      { key: 'VCV', name: 'VCV', desc: 'Volume Controlado', badge: 'Volume Fixo' },
                      { key: 'PCV', name: 'PCV', desc: 'Pressão Controlada', badge: 'Pressão Fixa' },
                      { key: 'PSV', name: 'PSV', desc: 'Pressão de Suporte', badge: 'Espontâneo' },
                    ].map((m) => {
                      const isSelected = selectedMode === m.key;
                      return (
                        <div
                          key={m.key}
                          onClick={() => handleVentilatorFieldChange(currentQ.id, 'modo', m.key)}
                          style={{
                            padding: '16px',
                            borderRadius: '14px',
                            background: isSelected ? 'rgba(139, 92, 246, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                            border: isSelected ? '2px solid #a78bfa' : '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: isSelected ? '#a78bfa' : '#fff' }}>
                              {m.name}
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', background: isSelected ? '#a78bfa' : 'rgba(255, 255, 255, 0.08)', color: isSelected ? '#0f172a' : 'var(--text-subtle)' }}>
                              {m.badge}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.desc}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {!selectedMode ? (
                  <div style={{ padding: '28px', borderRadius: '14px', background: 'rgba(139, 92, 246, 0.06)', border: '1px dashed rgba(167, 139, 250, 0.3)', textAlign: 'center', color: '#a78bfa', fontSize: '0.9rem', fontWeight: 600 }}>
                    👆 Escolha um Modo Ventilatório acima (VCV, PCV ou PSV) para exibir os parâmetros ajustáveis correspondentes.
                  </div>
                ) : modeConfig ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.12)', borderLeft: '4px solid #a78bfa', fontSize: '0.85rem', color: '#e2e8f0' }}>
                      <strong style={{ color: '#a78bfa' }}>{modeConfig.title}:</strong> {modeConfig.subtitle}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                      {modeConfig.fields.map((field) => (
                        <div key={field.key} style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#a78bfa' }}>
                            {field.label} {field.unit && <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}>({field.unit})</span>}
                          </label>

                          {field.isTextarea ? (
                            <textarea
                              className="input-field"
                              rows={2}
                              style={{ fontSize: '0.88rem', padding: '8px 12px', resize: 'vertical' }}
                              placeholder={field.placeholder}
                              value={currentVentData[field.key] || ''}
                              onChange={(e) => handleVentilatorFieldChange(currentQ.id, field.key, e.target.value)}
                            />
                          ) : (
                            <input
                              type="text"
                              className="input-field"
                              style={{ fontSize: '0.88rem', padding: '8px 12px' }}
                              placeholder={field.placeholder}
                              value={currentVentData[field.key] || ''}
                              onChange={(e) => handleVentilatorFieldChange(currentQ.id, field.key, e.target.value)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })()}

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
              <button onClick={handleNext} className="btn-primary">
                Próxima <ChevronRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleSubmitTest}
                disabled={submitting}
                className="btn-primary"
                style={{
                  background: isPlantao
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    : 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)',
                  boxShadow: isPlantao ? '0 4px 14px rgba(16, 185, 129, 0.3)' : '0 4px 14px rgba(2, 132, 199, 0.3)',
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Avaliando via IA...
                  </>
                ) : (
                  <>
                    {isPlantao ? 'Finalizar Plantão & Ver Relatório IA' : 'Finalizar & Ver Resultado IA'} <Send size={18} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
