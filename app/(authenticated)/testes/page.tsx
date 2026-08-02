'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CHAPTERS_DATA, SECTIONS, Chapter } from '@/lib/chapters-data';
import {
  Sparkles,
  BookOpen,
  FileQuestion,
  Layers,
  Check,
  AlertCircle,
  Loader2,
  Sliders,
} from 'lucide-react';

function TestGeneratorForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedChapterId = searchParams.get('chapterId');

  const [selectedChapterIds, setSelectedChapterIds] = useState<number[]>([]);
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [questionType, setQuestionType] = useState<'multiple_choice' | 'prescription' | 'mixed'>('mixed');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [chapterSearch, setChapterSearch] = useState<string>('');

  useEffect(() => {
    if (preselectedChapterId) {
      const capId = Number(preselectedChapterId);
      if (!isNaN(capId) && CHAPTERS_DATA.some((c) => c.id === capId)) {
        setSelectedChapterIds([capId]);
      }
    }
  }, [preselectedChapterId]);

  const toggleChapterSelect = (id: number) => {
    setSelectedChapterIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectSection = (sectionNumber: number) => {
    const sectionCapIds = CHAPTERS_DATA.filter((c) => c.sectionNumber === sectionNumber).map((c) => c.id);
    const allSelected = sectionCapIds.every((id) => selectedChapterIds.includes(id));

    if (allSelected) {
      setSelectedChapterIds((prev) => prev.filter((id) => !sectionCapIds.includes(id)));
    } else {
      setSelectedChapterIds((prev) => Array.from(new Set([...prev, ...sectionCapIds])));
    }
  };

  const handleGenerateTest = async () => {
    if (selectedChapterIds.length === 0) {
      setError('Selecione pelo menos um capítulo para gerar o teste.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterIds: selectedChapterIds,
          count: questionCount,
          questionType: questionType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao gerar o teste com IA');
      }

      router.push(`/testes/${data.testId}`);
    } catch (err: any) {
      setError(err.message || 'Erro de conexão.');
      setLoading(false);
    }
  };

  const filteredChapters = CHAPTERS_DATA.filter((c) =>
    c.title.toLowerCase().includes(chapterSearch.toLowerCase()) ||
    c.sectionTitle.toLowerCase().includes(chapterSearch.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '900px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="pulse-badge">
            <Sparkles size={14} /> OpenRouter AI Engine
          </span>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc' }}>
          Gerador de Simulados & Prescrições
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Configure seu teste por capítulos com questões de múltipla escolha e casos de prescrição em sala vermelha.
        </p>
      </div>

      {error && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.1)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#fda4af',
        }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Config Form */}
      <div className="glass-panel" style={{ padding: '32px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
        
        {/* Step 1: Chapter selection */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <label style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={18} color="#38bdf8" /> 1. Selecionar Capítulos ({selectedChapterIds.length} selecionados)
            </label>
            {selectedChapterIds.length > 0 && (
              <button
                onClick={() => setSelectedChapterIds([])}
                style={{ background: 'transparent', border: 'none', color: '#f43f5e', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
              >
                Limpar Seleção
              </button>
            )}
          </div>

          <input
            type="text"
            className="input-field"
            style={{ marginBottom: '12px' }}
            placeholder="Filtrar por nome ou seção..."
            value={chapterSearch}
            onChange={(e) => setChapterSearch(e.target.value)}
          />

          <div style={{
            maxHeight: '260px',
            overflowY: 'auto',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
            background: 'rgba(15, 23, 42, 0.5)',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            {filteredChapters.map((cap) => {
              const isSelected = selectedChapterIds.includes(cap.id);
              return (
                <div
                  key={cap.id}
                  onClick={() => toggleChapterSelect(cap.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                    border: isSelected ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: '0.88rem', color: isSelected ? '#38bdf8' : '#e2e8f0', fontWeight: isSelected ? 600 : 400 }}>
                    Cap. {cap.number}: {cap.title}
                  </div>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '6px',
                    border: isSelected ? 'none' : '1px solid var(--border-subtle)',
                    background: isSelected ? '#0ea5e9' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                  }}>
                    {isSelected && <Check size={14} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 2: Question Count */}
        <div>
          <label style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <FileQuestion size={18} color="#38bdf8" /> 2. Quantidade de Questões
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            {[5, 10, 20].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setQuestionCount(num)}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: '12px',
                  border: questionCount === num ? '1px solid #38bdf8' : '1px solid var(--border-subtle)',
                  background: questionCount === num ? 'rgba(14, 165, 233, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                  color: questionCount === num ? '#38bdf8' : 'var(--text-muted)',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {num} Questões
              </button>
            ))}
          </div>
        </div>

        {/* Step 3: Question Format */}
        <div>
          <label style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Sliders size={18} color="#38bdf8" /> 3. Formato do Simulado
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {[
              { id: 'mixed', label: 'Misto (Recomendado)', desc: 'Múltipla Escolha + Prescrições' },
              { id: 'multiple_choice', label: 'Apenas Múltipla Escolha', desc: 'Questões objetivas A-E' },
              { id: 'prescription', label: 'Apenas Prescrição', desc: 'Escrever conduta e via' },
            ].map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => setQuestionType(fmt.id as any)}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: questionType === fmt.id ? '1px solid #34d399' : '1px solid var(--border-subtle)',
                  background: questionType === fmt.id ? 'rgba(16, 185, 129, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                  color: questionType === fmt.id ? '#34d399' : 'var(--text-muted)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: questionType === fmt.id ? '#34d399' : '#fff', marginBottom: '4px' }}>
                  {fmt.label}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
                  {fmt.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleGenerateTest}
          disabled={loading || selectedChapterIds.length === 0}
          className="btn-primary"
          style={{ padding: '16px', fontSize: '1.05rem', marginTop: '10px' }}
        >
          {loading ? (
            <>
              <Loader2 size={20} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
              IA Processando Caso Clínico e Questões...
            </>
          ) : (
            <>
              <Sparkles size={20} /> Gerar Teste por IA Agora
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function TestesPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-muted)' }}>Carregando configurador...</div>}>
      <TestGeneratorForm />
    </Suspense>
  );
}
