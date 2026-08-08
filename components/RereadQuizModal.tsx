'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { calculateFSRSRereadWithQuiz, calculateFSRSManualReadUpdate } from '@/lib/learning-engine';
import { recordActivityAndAwardXP } from '@/lib/gamification-engine';
import { Sparkles, CheckCircle2, X } from 'lucide-react';

interface RereadQuizModalProps {
  chapterId: number;
  chapterNumber: number;
  chapterTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function RereadQuizModal({
  chapterId,
  chapterNumber,
  chapterTitle,
  onClose,
  onSuccess,
}: RereadQuizModalProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState<boolean>(true);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [result, setResult] = useState<{ correct: number; total: number; fullBonus: boolean } | null>(null);

  useEffect(() => {
    async function loadQuiz() {
      setLoading(true);
      try {
        const res = await fetch('/api/generate-reread-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chapterId }),
        });
        const data = await res.json();
        if (res.ok && data.questions) {
          setQuestions(data.questions);
        } else {
          throw new Error(data.error || 'Erro ao gerar quiz');
        }
      } catch (e) {
        console.warn('Fallback: quiz generation error, applying standard FSRS update', e);
        // Fallback: apply standard read update if AI generation fails
        await applyFallbackRead();
      } finally {
        setLoading(false);
      }
    }
    loadQuiz();
  }, [chapterId]);

  const applyFallbackRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: stat } = await supabase
        .from('chapter_review_stats')
        .select('*')
        .eq('user_id', user.id)
        .eq('chapter_id', chapterId)
        .maybeSingle();

      const fsrsUpdate = calculateFSRSManualReadUpdate(stat);
      await supabase.from('chapter_review_stats').upsert({
        user_id: user.id,
        chapter_id: chapterId,
        ...fsrsUpdate,
      });

      const { data: prog } = await supabase
        .from('chapter_progress')
        .select('read_count')
        .eq('user_id', user.id)
        .eq('chapter_id', chapterId)
        .maybeSingle();

      const newCount = (prog?.read_count || 0) + 1;
      const nowIso = new Date().toISOString();

      await supabase.from('chapter_progress').upsert({
        user_id: user.id,
        chapter_id: chapterId,
        is_read: true,
        read_count: newCount,
        last_read_at: nowIso,
      });

      await recordActivityAndAwardXP(supabase, user.id, { type: 'first_read' });
    }
    onSuccess();
  };

  const handleSubmit = async () => {
    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (answers[idx] === q.correctOption) correctCount++;
    });

    const totalCount = questions.length;
    const fullBonus = totalCount > 0 ? correctCount / totalCount >= 0.66 : false;

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: stat } = await supabase
        .from('chapter_review_stats')
        .select('*')
        .eq('user_id', user.id)
        .eq('chapter_id', chapterId)
        .maybeSingle();

      const fsrsUpdate = calculateFSRSRereadWithQuiz(stat, correctCount, totalCount);

      await supabase.from('chapter_review_stats').upsert({
        user_id: user.id,
        chapter_id: chapterId,
        ...fsrsUpdate,
      });

      const { data: prog } = await supabase
        .from('chapter_progress')
        .select('read_count')
        .eq('user_id', user.id)
        .eq('chapter_id', chapterId)
        .maybeSingle();

      const newCount = (prog?.read_count || 0) + 1;
      const nowIso = new Date().toISOString();

      await supabase.from('chapter_progress').upsert({
        user_id: user.id,
        chapter_id: chapterId,
        is_read: true,
        read_count: newCount,
        last_read_at: nowIso,
      });

      await supabase.from('chapter_read_logs').insert({
        user_id: user.id,
        chapter_id: chapterId,
        read_count_snapshot: newCount,
        source: 'reread_quiz',
      });

      await recordActivityAndAwardXP(supabase, user.id, {
        type: 'reread_quiz',
        quizPassed: fullBonus,
      });
    }

    setSubmitted(true);
    setResult({ correct: correctCount, total: totalCount, fullBonus });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 110, padding: '24px',
    }}>
      <div className="glass-panel" style={{ maxWidth: '680px', width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <span className="pulse-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
              <Sparkles size={14} /> Mini-Quiz de Releitura (3 Questões)
            </span>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
              Cap. {chapterNumber}: {chapterTitle}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Gerando 3 questões rápidas de múltipla escolha pela IA para este capítulo...
          </div>
        ) : submitted && result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: result.fullBonus ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              border: result.fullBonus ? '2px solid #34d399' : '2px solid #fbbf24',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
              color: result.fullBonus ? '#34d399' : '#fbbf24', fontSize: '1.5rem', fontWeight: 900
            }}>
              {result.correct}/{result.total}
            </div>

            <div>
              <h4 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                {result.fullBonus ? '✅ Bônus Completo FSRS Aplicado! (S × 1.35)' : '⚠️ Bônus Parcial Aplicado (S × 1.10)'}
              </h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
                {result.fullBonus
                  ? 'Você demonstrou retenção sólida no quiz de verificação. Sua estabilidade FSRS subiu 35% e você ganhou +30 XP!'
                  : 'Acertos abaixo de 66%. Releitura registrada com bônus parcial de 10% na estabilidade +10 XP.'}
              </p>
            </div>

            <button
              onClick={onSuccess}
              className="btn-primary"
              style={{ padding: '12px 24px', margin: '0 auto' }}
            >
              Concluir e Atualizar
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {questions.map((q, idx) => (
              <div key={idx} style={{ padding: '16px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700, marginBottom: '6px' }}>
                  QUESTÃO {idx + 1} DE {questions.length}
                </div>
                <p style={{ fontSize: '0.95rem', color: '#f8fafc', fontWeight: 600, marginBottom: '12px' }}>
                  {q.vignette}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(q.options || []).map((opt: string, optIdx: number) => {
                    const selected = answers[idx] === optIdx;
                    return (
                      <div
                        key={optIdx}
                        onClick={() => setAnswers((prev) => ({ ...prev, [idx]: optIdx }))}
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: selected ? 'rgba(14, 165, 233, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                          border: selected ? '1px solid #38bdf8' : '1px solid transparent',
                          color: selected ? '#38bdf8' : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '0.88rem',
                          fontWeight: selected ? 700 : 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <span style={{
                          width: '20px', height: '20px', borderRadius: '50%',
                          border: selected ? '2px solid #38bdf8' : '2px solid var(--text-subtle)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.72rem', fontWeight: 700
                        }}>
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <span>{opt}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <button
              onClick={handleSubmit}
              disabled={Object.keys(answers).length < questions.length}
              className="btn-primary"
              style={{
                padding: '12px 24px',
                opacity: Object.keys(answers).length < questions.length ? 0.5 : 1,
              }}
            >
              <CheckCircle2 size={18} /> Finalizar Quiz e Confirmar Releitura
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
