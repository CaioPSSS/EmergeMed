'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CHAPTERS_DATA, Chapter } from '@/lib/chapters-data';
import { getUnifiedChapters } from '@/lib/chapters-service';
import { calculateChapterScores, ScoredChapter } from '@/lib/spaced-repetition';
import {
  Sparkles,
  BookOpen,
  FileQuestion,
  Check,
  AlertCircle,
  Loader2,
  Sliders,
  Stethoscope,
  Clock,
  ShieldAlert,
  Flame,
  Eye,
  EyeOff,
  Bookmark,
} from 'lucide-react';

function TestGeneratorForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const preselectedChapterId = searchParams.get('chapterId');
  const initialMode = searchParams.get('mode') === 'plantao' ? 'plantao' : 'classic';

  const [activeTab, setActiveTab] = useState<'classic' | 'plantao'>(initialMode);
  const [chaptersList, setChaptersList] = useState<Chapter[]>(CHAPTERS_DATA);

  // Classic mode state
  const [selectedChapterIds, setSelectedChapterIds] = useState<number[]>([]);
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [questionType, setQuestionType] = useState<
    'multiple_choice' | 'prescription' | 'ventilator' | 'mixed'
  >('mixed');
  const [chapterSearch, setChapterSearch] = useState<string>('');

  // Plantão mode state
  const [bedCount, setBedCount] = useState<number>(4);
  const [readChapterIds, setReadChapterIds] = useState<number[]>([]);
  const [scoredChapters, setScoredChapters] = useState<ScoredChapter[]>([]);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [showPlantaoTopics, setShowPlantaoTopics] = useState<boolean>(false);

  // General state
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadChapters() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const unified = await getUnifiedChapters(supabase, user.id);
        setChaptersList(unified);
      }
    }
    loadChapters();
  }, []);

  useEffect(() => {
    if (preselectedChapterId) {
      const capId = Number(preselectedChapterId);
      if (!isNaN(capId) && chaptersList.some((c) => c.id === capId)) {
        setSelectedChapterIds([capId]);
      }
    }
  }, [preselectedChapterId, chaptersList]);

  useEffect(() => {
    async function loadDataForPlantao() {
      setLoadingStats(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Fetch read progress
        const { data: progress } = await supabase
          .from('chapter_progress')
          .select('chapter_id')
          .eq('user_id', user.id)
          .eq('is_read', true);

        const readIds = progress ? progress.map((p) => p.chapter_id) : [];
        setReadChapterIds(readIds);

        try {
          const res = await fetch('/api/recommendations?surface=plantao');
          if (res.ok) {
            const snapshot = await res.json();
            const readMetrics = Object.values(snapshot.chapterMetrics || {})
              .filter((m: any) => m.isRead)
              .map((m: any) => ({
                chapterId: m.chapterId,
                chapterNumber: m.chapterNumber,
                title: m.title,
                sectionNumber: m.sectionNumber,
                sectionTitle: m.sectionTitle,
                frequencyScore: m.frequencyScore,
                importanceScore: m.importanceScore,
                daysSinceLastReview: m.daysSinceLastEvidence,
                accuracyRate: m.confidence,
                compositeScore: m.recommendationScore,
                lastReviewedAt: null,
              }))
              .sort((a: any, b: any) => b.compositeScore - a.compositeScore);

            setScoredChapters(readMetrics);
          }
        } catch (err) {
          console.error('Failed to load plantao recommendation engine preview:', err);
        }
      }
      setLoadingStats(false);
    }

    loadDataForPlantao();
  }, []);

  const toggleChapterSelect = (id: number) => {
    setSelectedChapterIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleGenerateClassicTest = async () => {
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

  const handleGeneratePlantao = async () => {
    if (readChapterIds.length === 0) {
      setError('Você precisa ter pelo menos 1 capítulo marcado como lido para fazer o Modo Plantão.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/generate-plantao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bedCount }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao gerar plantão');
      }

      router.push(`/testes/${data.testId}`);
    } catch (err: any) {
      setError(err.message || 'Erro de conexão.');
      setLoading(false);
    }
  };

  const filteredChapters = chaptersList.filter(
    (c) =>
      c.title.toLowerCase().includes(chapterSearch.toLowerCase()) ||
      c.sectionTitle.toLowerCase().includes(chapterSearch.toLowerCase()) ||
      (c.sourceBook && c.sourceBook.toLowerCase().includes(chapterSearch.toLowerCase())) ||
      (c.category && c.category.toLowerCase().includes(chapterSearch.toLowerCase()))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '920px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span className="pulse-badge">
            <Sparkles size={14} /> OpenRouter AI Engine
          </span>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc' }}>
          Gerador de Simulados & Modo Plantão
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Escolha entre a seleção manual de capítulos ou a repetição espaçada simulando um plantão de UPA.
        </p>
      </div>

      {/* Mode Tabs Selector */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          background: 'rgba(15, 23, 42, 0.7)',
          padding: '6px',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab('classic');
            setError(null);
          }}
          style={{
            flex: 1,
            padding: '14px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'classic' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'classic' ? '#fff' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <Sliders size={18} />
          Modo Clássico (Seleção Manual)
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('plantao');
            setError(null);
          }}
          style={{
            flex: 1,
            padding: '14px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: 'pointer',
            background:
              activeTab === 'plantao'
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'transparent',
            color: activeTab === 'plantao' ? '#fff' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: activeTab === 'plantao' ? '0 4px 14px rgba(16, 185, 129, 0.3)' : 'none',
          }}
        >
          <Stethoscope size={18} />
          🏥 Modo Plantão (Repetição Espaçada)
        </button>
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#fda4af',
          }}
        >
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* MODO PLANTÃO UI */}
      {activeTab === 'plantao' && (
        <div
          className="glass-panel"
          style={{
            padding: '32px',
            borderRadius: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '28px',
            border: '1px solid rgba(16, 185, 129, 0.3)',
          }}
        >
          {/* Header Banner */}
          <div
            style={{
              padding: '20px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(14, 165, 233, 0.1))',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: 800 }}>
              <Stethoscope size={20} />
              <span>Algoritmo de Repetição Espaçada + Matriz Epidemiológica</span>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#e2e8f0', lineHeight: 1.5 }}>
              O Modo Plantão seleciona temas automaticamente combinando <strong>dias sem revisão</strong>,{' '}
              <strong>frequência na vida real da UPA</strong>, <strong>importância médica</strong> e seu{' '}
              <strong>histórico de erros</strong>. Cada leito representa um paciente com 4 questões em contínuo clínico.
            </p>
          </div>

          {/* Config: Bed Count */}
          <div>
            <label
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '14px',
              }}
            >
              <FileQuestion size={18} color="#34d399" />
              1. Número de Leitos no Plantão (Pacientes)
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '10px' }}>
              {[2, 3, 4, 5, 6, 7, 8].map((num) => {
                const isSelected = bedCount === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setBedCount(num)}
                    style={{
                      padding: '14px',
                      borderRadius: '12px',
                      border: isSelected ? '2px solid #34d399' : '1px solid var(--border-subtle)',
                      background: isSelected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(15, 23, 42, 0.6)',
                      color: isSelected ? '#34d399' : 'var(--text-muted)',
                      fontWeight: 800,
                      fontSize: '1rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>{num} Leitos</span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 500 }}>
                      ({num * 4} Questões)
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority Topics Preview */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <label
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Clock size={16} color="#38bdf8" />
                Temas Selecionados pelo Algoritmo ({readChapterIds.length} capítulos lidos)
              </label>

              <button
                type="button"
                onClick={() => setShowPlantaoTopics(!showPlantaoTopics)}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  color: showPlantaoTopics ? '#38bdf8' : 'var(--text-muted)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease',
                }}
              >
                {showPlantaoTopics ? <EyeOff size={14} /> : <Eye size={14} />}
                {showPlantaoTopics ? 'Ocultar Temas (Sem Spoilers)' : 'Exibir Temas (Ocultado por Padrão)'}
              </button>
            </div>

            {loadingStats ? (
              <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>
                <Loader2 size={20} className="spin" style={{ margin: '0 auto 8px auto', animation: 'spin 1s linear infinite' }} />
                Calculando prioridades do algoritmo SM-2...
              </div>
            ) : scoredChapters.length === 0 ? (
              <div
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  background: 'rgba(244, 63, 94, 0.08)',
                  border: '1px solid rgba(244, 63, 94, 0.2)',
                  color: '#fda4af',
                  fontSize: '0.9rem',
                }}
              >
                ⚠️ Você ainda não possui nenhum capítulo marcado como lido. Acesse a aba <strong>Capítulos</strong> e marque alguns temas para poder usar o Modo Plantão.
              </div>
            ) : !showPlantaoTopics ? (
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  background: 'rgba(15, 23, 42, 0.4)',
                  border: '1px dashed var(--border-subtle)',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <EyeOff size={18} color="#38bdf8" />
                  <span>Os diagnósticos e capítulos sorteados estão <strong>ocultados por padrão</strong> para simular a emergência sem spoilers.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPlantaoTopics(true)}
                  style={{
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    color: '#38bdf8',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Exibir Temas
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  borderRadius: '12px',
                  border: '1px solid var(--border-subtle)',
                  background: 'rgba(15, 23, 42, 0.5)',
                  padding: '10px',
                }}
              >
                {scoredChapters.slice(0, 6).map((sc, i) => (
                  <div
                    key={sc.chapterId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontWeight: 800,
                          color: '#34d399',
                          fontSize: '0.75rem',
                          background: 'rgba(16, 185, 129, 0.15)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        #{i + 1}
                      </span>
                      <span style={{ color: '#fff', fontWeight: 600 }}>
                        Cap. {sc.chapterNumber}: {sc.title}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                      <span title="Frequência na UPA">Freq: {sc.frequencyScore}/10</span>
                      <span>•</span>
                      <span title="Importância Médica">Import: {sc.importanceScore}/10</span>
                      <span>•</span>
                      <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                        Score: {sc.compositeScore}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleGeneratePlantao}
            disabled={loading || readChapterIds.length === 0}
            className="btn-primary"
            style={{
              padding: '16px',
              fontSize: '1.05rem',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
            }}
          >
            {loading ? (
              <>
                <Loader2 size={20} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                IA Organizando Leitos e Casos Clínicos...
              </>
            ) : (
              <>
                <Stethoscope size={20} /> Iniciar Plantão Noturno ({bedCount} Leitos / {bedCount * 4} Questões)
              </>
            )}
          </button>
        </div>
      )}

      {/* MODO CLÁSSICO UI */}
      {activeTab === 'classic' && (
        <div
          className="glass-panel"
          style={{
            padding: '32px',
            borderRadius: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '28px',
          }}
        >
          {/* Step 1: Chapter selection */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <label
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <BookOpen size={18} color="#38bdf8" /> 1. Selecionar Capítulos ({selectedChapterIds.length} selecionados)
              </label>
              {selectedChapterIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedChapterIds([])}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f43f5e',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
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

            <div
              style={{
                maxHeight: '260px',
                overflowY: 'auto',
                borderRadius: '12px',
                border: '1px solid var(--border-subtle)',
                background: 'rgba(15, 23, 42, 0.5)',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
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
                    <div
                      style={{
                        fontSize: '0.88rem',
                        color: isSelected ? '#38bdf8' : '#e2e8f0',
                        fontWeight: isSelected ? 600 : 400,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>{cap.isCustom ? cap.title : `Cap. ${cap.number}: ${cap.title}`}</span>
                      {cap.isCustom && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '6px',
                            background: 'rgba(168, 85, 247, 0.2)',
                            color: '#c084fc',
                            border: '1px solid rgba(168, 85, 247, 0.3)',
                          }}
                        >
                          📘 {cap.sourceBook || 'Personalizado'}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '6px',
                        border: isSelected ? 'none' : '1px solid var(--border-subtle)',
                        background: isSelected ? '#0ea5e9' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                      }}
                    >
                      {isSelected && <Check size={14} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 2: Question Count */}
          <div>
            <label
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '14px',
              }}
            >
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
            <label
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '14px',
              }}
            >
              <Sliders size={18} color="#38bdf8" /> 3. Formato do Simulado
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              {[
                { id: 'mixed', label: 'Misto (Recomendado)', desc: 'MCQ + Prescrições + Ventilador' },
                { id: 'multiple_choice', label: 'Apenas Múltipla Escolha', desc: 'Questões objetivas A-E' },
                { id: 'prescription', label: 'Apenas Prescrições', desc: 'Completa (do dia) + Imediata (no momento)' },
                { id: 'ventilator', label: 'Ventilador Mecânico', desc: 'Configurar VM (quando cabível)' },
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
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      color: questionType === fmt.id ? '#34d399' : '#fff',
                      marginBottom: '4px',
                    }}
                  >
                    {fmt.label}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>{fmt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleGenerateClassicTest}
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
      )}
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
