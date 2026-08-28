'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Chapter } from '@/lib/chapters-data';
import { calculateFSRSManualReadUpdate } from '@/lib/learning-engine';
import { recordActivityAndAwardXP } from '@/lib/gamification-engine';
import {
  StudyQueueItem,
  fetchStudyQueue,
  addToStudyQueue,
  addMultipleToStudyQueue,
  setQueueItemCompleted,
  removeFromStudyQueue,
  reorderStudyQueue,
  clearStudyQueue,
} from '@/lib/study-queue-service';
import { ChapterReaderModal } from '@/components/ChapterReaderModal';
import {
  ListOrdered,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Circle,
  Sparkles,
  BookOpen,
  Search,
  X,
  Shuffle,
  Layers,
  ArrowRight,
  Check,
  Zap,
  Bookmark,
  RefreshCw,
} from 'lucide-react';

interface StudyQueueWidgetProps {
  chaptersList: Chapter[];
  readChapterIds: number[];
  progressMap?: Record<number, { is_read: boolean; read_count: number; last_read_at?: string }>;
  onProgressUpdated?: () => Promise<void> | void;
  recommendedChapterIds?: number[];
}

export function StudyQueueWidget({
  chaptersList,
  readChapterIds,
  progressMap = {},
  onProgressUpdated,
  recommendedChapterIds = [],
}: StudyQueueWidgetProps) {
  const router = useRouter();
  const supabase = createClient();

  const [queueItems, setQueueItems] = useState<StudyQueueItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [studiedModalInfo, setStudiedModalInfo] = useState<{ chapter: Chapter; isReread: boolean; count: number } | null>(null);
  const [readerChapter, setReaderChapter] = useState<Chapter | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);

  // Load user study queue on mount
  useEffect(() => {
    async function loadQueue() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      const items = await fetchStudyQueue(supabase, user?.id);
      setQueueItems(items);
      setLoading(false);
    }
    loadQueue();
  }, []);

  const queueChapterIds = queueItems.map((item) => item.chapter_id);

  // Handle reordering up
  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;
    const newItems = [...queueItems];
    const temp = newItems[index - 1];
    newItems[index - 1] = newItems[index];
    newItems[index] = temp;

    setQueueItems(newItems);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await reorderStudyQueue(supabase, user.id, newItems);
    }
  };

  // Handle reordering down
  const handleMoveDown = async (index: number) => {
    if (index >= queueItems.length - 1) return;
    const newItems = [...queueItems];
    const temp = newItems[index + 1];
    newItems[index + 1] = newItems[index];
    newItems[index] = temp;

    setQueueItems(newItems);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await reorderStudyQueue(supabase, user.id, newItems);
    }
  };

  // Handle remove item from queue
  const handleRemove = async (chapterId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = queueItems.filter((item) => item.chapter_id !== chapterId);
    setQueueItems(updated);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await removeFromStudyQueue(supabase, user.id, chapterId);
    }
  };

  // Handle clear entire queue
  const handleClear = async () => {
    setQueueItems([]);
    setShowClearConfirm(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await clearStudyQueue(supabase, user.id);
    }
  };

  // Handle adding/removing chapter in selection modal
  const handleToggleAddChapter = async (chapterId: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (queueChapterIds.includes(chapterId)) {
      await handleRemove(chapterId);
    } else {
      const updated = await addToStudyQueue(supabase, user.id, chapterId);
      setQueueItems(updated);
    }
  };

  // Quick add recommendations
  const handleAddRecommendations = async () => {
    if (recommendedChapterIds.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const updated = await addMultipleToStudyQueue(supabase, user.id, recommendedChapterIds);
    setQueueItems(updated);
  };

  // Handle study checkbox toggle (marks 1st read OR re-read appropriately)
  const handleToggleStudy = async (chapter: Chapter, currentItem: StudyQueueItem) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setActionLoading((prev) => ({ ...prev, [chapter.id]: true }));

    try {
      const willBeCompleted = !currentItem.completed;

      if (willBeCompleted) {
        // Register reading / re-reading in Supabase database
        const hasReadBefore = readChapterIds.includes(chapter.id);
        const { data: currentProg } = await supabase
          .from('chapter_progress')
          .select('read_count, last_read_at')
          .eq('user_id', user.id)
          .eq('chapter_id', chapter.id)
          .maybeSingle();

        const currentCount = currentProg?.read_count || (hasReadBefore ? 1 : 0);
        const newCount = currentCount + 1;
        const nowIso = new Date().toISOString();

        // 1. Update chapter_progress
        await supabase.from('chapter_progress').upsert({
          user_id: user.id,
          chapter_id: chapter.id,
          is_read: true,
          read_at: currentProg?.last_read_at || nowIso,
          read_count: newCount,
          last_read_at: nowIso,
        });

        // 2. Insert into chapter_read_logs
        await supabase.from('chapter_read_logs').insert({
          user_id: user.id,
          chapter_id: chapter.id,
          read_count_snapshot: newCount,
          source: hasReadBefore ? 'reread_study_queue' : 'first_read_study_queue',
        });

        // 3. Update FSRS spaced repetition
        const { data: stat } = await supabase
          .from('chapter_review_stats')
          .select('*')
          .eq('user_id', user.id)
          .eq('chapter_id', chapter.id)
          .maybeSingle();

        const fsrsUpdate = calculateFSRSManualReadUpdate(stat);
        await supabase.from('chapter_review_stats').upsert({
          user_id: user.id,
          chapter_id: chapter.id,
          ...fsrsUpdate,
        });

        // 4. Award XP & Gamification
        await recordActivityAndAwardXP(supabase, user.id, { type: 'first_read' });

        // 5. Update queue item status
        const updatedQueue = await setQueueItemCompleted(supabase, user.id, chapter.id, true);
        setQueueItems(updatedQueue);

        // 6. Notify parent to refresh dashboard stats
        if (onProgressUpdated) {
          await onProgressUpdated();
        }

        // 7. Prompt to generate questions
        setStudiedModalInfo({
          chapter,
          isReread: hasReadBefore,
          count: newCount,
        });
      } else {
        // Unmark completion within current queue session
        const updatedQueue = await setQueueItemCompleted(supabase, user.id, chapter.id, false);
        setQueueItems(updatedQueue);
      }
    } catch (err) {
      console.error('Erro ao alternar status de estudo na fila:', err);
    } finally {
      setActionLoading((prev) => ({ ...prev, [chapter.id]: false }));
    }
  };

  // Direct test redirection
  const handleGoToTest = (chapterId: number) => {
    router.push(`/testes?chapterId=${chapterId}`);
  };

  // Filter chapters in add modal
  const uniqueSections = Array.from(
    new Set(chaptersList.map((c) => c.sectionTitle).filter(Boolean))
  );

  const modalFilteredChapters = chaptersList.filter((cap) => {
    const matchesSearch =
      cap.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cap.number ? String(cap.number).includes(searchQuery) : false) ||
      (cap.sectionTitle && cap.sectionTitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (cap.sourceBook && cap.sourceBook.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesSection =
      sectionFilter === 'all' || cap.sectionTitle === sectionFilter;

    return matchesSearch && matchesSection;
  });

  const totalInQueue = queueItems.length;
  const completedInQueue = queueItems.filter((item) => item.completed).length;
  const queueProgressPercent = totalInQueue > 0 ? Math.round((completedInQueue / totalInQueue) * 100) : 0;

  return (
    <div
      className="glass-panel"
      style={{
        padding: '28px',
        borderRadius: '20px',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.7) 100%)',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Header Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
            }}
          >
            <ListOrdered size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                Minha Fila de Estudos
              </h2>
              {totalInQueue > 0 && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: completedInQueue > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                    color: completedInQueue > 0 ? '#34d399' : '#38bdf8',
                    border: `1px solid ${completedInQueue > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
                  }}
                >
                  {completedInQueue}/{totalInQueue} Concluídos na Sessão
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>
              Adicione capítulos para 1ª leitura ou releituras programadas, alterne a ordem e gere simulados ao concluir
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {totalInQueue > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="btn-secondary"
              style={{
                fontSize: '0.82rem',
                padding: '8px 12px',
                color: '#f87171',
                borderColor: 'rgba(239, 68, 68, 0.3)',
              }}
              title="Limpar todos os itens da fila"
            >
              <Trash2 size={15} /> Limpar
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary"
            style={{
              fontSize: '0.86rem',
              padding: '9px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={16} /> Adicionar Capítulos
          </button>
        </div>
      </div>

      {/* Progress Bar if items exist */}
      {totalInQueue > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            <span>Progresso da Fila: {completedInQueue} de {totalInQueue} temas concluídos</span>
            <span style={{ color: completedInQueue > 0 ? '#34d399' : '#38bdf8' }}>{queueProgressPercent}%</span>
          </div>
          <div className="progress-bar-bg" style={{ height: '6px', background: 'rgba(255, 255, 255, 0.08)' }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${queueProgressPercent}%`,
                background: 'linear-gradient(90deg, #38bdf8, #10b981)',
              }}
            />
          </div>
        </div>
      )}

      {/* Empty State */}
      {loading ? (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px auto', display: 'block', color: '#38bdf8' }} />
          Carregando sua fila de estudos personalizada...
        </div>
      ) : totalInQueue === 0 ? (
        <div
          style={{
            padding: '36px 20px',
            borderRadius: '16px',
            background: 'rgba(15, 23, 42, 0.45)',
            border: '1px dashed rgba(255, 255, 255, 0.15)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '16px',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
            }}
          >
            <Bookmark size={26} />
          </div>

          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
              Sua fila de estudos está vazia
            </h3>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', maxWidth: '480px', margin: '0 auto' }}>
              Adicione os temas que você pretende revisar hoje ou nos próximos plantões (seja 1ª leitura ou releitura programada) para estudar na ordem desejada.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '6px' }}>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary"
              style={{ fontSize: '0.85rem', padding: '9px 18px' }}
            >
              <Plus size={16} /> Explorar e Adicionar Capítulos
            </button>

            {recommendedChapterIds.length > 0 && (
              <button
                onClick={handleAddRecommendations}
                className="btn-secondary"
                style={{ fontSize: '0.85rem', padding: '9px 18px', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34d399' }}
              >
                <Sparkles size={16} /> Adicionar Top 3 da IA
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Populated Queue List */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {queueItems.map((item, index) => {
            const chapter = chaptersList.find((c) => c.id === item.chapter_id);
            if (!chapter) return null;

            const isCompletedInQueue = Boolean(item.completed);
            const hasReadBefore = readChapterIds.includes(chapter.id);
            const currentReadCount = progressMap[chapter.id]?.read_count || (hasReadBefore ? 1 : 0);

            const isFirst = index === 0;
            const isLast = index === queueItems.length - 1;
            const isLoadingThis = actionLoading[chapter.id];

            return (
              <div
                key={chapter.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '14px 18px',
                  borderRadius: '14px',
                  background: isCompletedInQueue
                    ? 'rgba(16, 185, 129, 0.08)'
                    : hasReadBefore
                    ? 'rgba(30, 41, 59, 0.65)'
                    : 'rgba(15, 23, 42, 0.65)',
                  border: isCompletedInQueue
                    ? '1px solid rgba(16, 185, 129, 0.35)'
                    : hasReadBefore
                    ? '1px solid rgba(56, 189, 248, 0.2)'
                    : '1px solid var(--border-subtle)',
                  transition: 'all 0.2s ease',
                  flexWrap: 'wrap',
                }}
              >
                {/* Left: Position & Reorder Buttons + Checkbox + Chapter Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '260px' }}>
                  {/* Position Badge */}
                  <div
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '8px',
                      background: isCompletedInQueue ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.15)',
                      border: isCompletedInQueue ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(56, 189, 248, 0.3)',
                      color: isCompletedInQueue ? '#34d399' : '#38bdf8',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    #{index + 1}
                  </div>

                  {/* Reorder Arrows (Up / Down) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={isFirst}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isFirst ? 'rgba(255, 255, 255, 0.15)' : '#94a3b8',
                        cursor: isFirst ? 'not-allowed' : 'pointer',
                        padding: '1px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Mover para cima na fila"
                    >
                      <ChevronUp size={16} />
                    </button>

                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={isLast}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isLast ? 'rgba(255, 255, 255, 0.15)' : '#94a3b8',
                        cursor: isLast ? 'not-allowed' : 'pointer',
                        padding: '1px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Mover para baixo na fila"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>

                  {/* Study Checkbox Button */}
                  <button
                    onClick={() => handleToggleStudy(chapter, item)}
                    disabled={isLoadingThis}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: isCompletedInQueue ? '#34d399' : 'var(--text-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      padding: '4px',
                    }}
                    title={
                      isCompletedInQueue
                        ? 'Concluído na fila! Clique para desmarcar'
                        : hasReadBefore
                        ? `Clique para registrar Releitura (Revisão #${currentReadCount + 1}) e gerar teste`
                        : 'Clique para registrar 1ª leitura e gerar teste'
                    }
                  >
                    {isLoadingThis ? (
                      <RefreshCw size={22} className="animate-spin" style={{ color: '#38bdf8' }} />
                    ) : isCompletedInQueue ? (
                      <CheckCircle2 size={22} color="#34d399" />
                    ) : (
                      <Circle size={22} />
                    )}
                  </button>

                  {/* Chapter Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '0.94rem',
                          fontWeight: 700,
                          color: isCompletedInQueue ? '#94a3b8' : '#ffffff',
                          textDecoration: isCompletedInQueue ? 'line-through' : 'none',
                          lineHeight: 1.3,
                        }}
                      >
                        {chapter.isCustom ? chapter.title : `Capítulo ${chapter.number}: ${chapter.title}`}
                      </span>

                      {chapter.sectionTitle && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '1px 7px',
                            borderRadius: '9999px',
                            background: 'rgba(255, 255, 255, 0.06)',
                            color: 'var(--text-subtle)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {chapter.sectionTitle}
                        </span>
                      )}

                      {/* Study Mode Tags */}
                      {isCompletedInQueue ? (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '1px 8px',
                            borderRadius: '9999px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <CheckCircle2 size={11} /> {hasReadBefore ? `Revisão #${currentReadCount} Concluída ✓` : '1ª Leitura Concluída ✓'}
                        </span>
                      ) : hasReadBefore ? (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '1px 8px',
                            borderRadius: '9999px',
                            background: 'rgba(245, 158, 11, 0.12)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <RefreshCw size={11} /> Releitura Programada (Revisão #{currentReadCount + 1})
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '1px 8px',
                            borderRadius: '9999px',
                            background: 'rgba(56, 189, 248, 0.12)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <BookOpen size={11} /> 1ª Leitura (Pendente)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Quick Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => setReaderChapter(chapter)}
                    className="btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                    title="Abrir leitor de texto do capítulo"
                  >
                    <BookOpen size={14} /> Ler
                  </button>

                  <button
                    onClick={() => handleGoToTest(chapter.id)}
                    className="btn-secondary"
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      borderColor: 'rgba(56, 189, 248, 0.35)',
                      color: '#38bdf8',
                    }}
                    title="Gerar questões de teste com IA para este tema"
                  >
                    <Sparkles size={14} /> Gerar Questões
                  </button>

                  <button
                    onClick={(e) => handleRemove(chapter.id, e)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-subtle)',
                      cursor: 'pointer',
                      padding: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '8px',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-subtle)')}
                    title="Remover este capítulo da fila"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Adicionar Capítulos à Fila */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: '20px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '680px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              borderRadius: '20px',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                  Adicionar Capítulos ao Roteiro
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                  Selecione capítulos para 1ª leitura ou adicione temas já lidos para releitura programada
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            {/* Search and Filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={18}
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-subtle)',
                  }}
                />
                <input
                  type="text"
                  className="input-field"
                  style={{ paddingLeft: '42px', width: '100%' }}
                  placeholder="Buscar capítulo por nome, número ou tema..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Section Filter Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Filtrar Seção:</span>
                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  className="input-field"
                  style={{ fontSize: '0.82rem', padding: '6px 12px', flex: 1 }}
                >
                  <option value="all">Todas as Seções ({chaptersList.length} capítulos)</option>
                  {uniqueSections.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Chapter Selection List */}
            <div
              style={{
                overflowY: 'auto',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                paddingRight: '4px',
              }}
            >
              {modalFilteredChapters.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                  Nenhum capítulo encontrado com esse filtro.
                </div>
              ) : (
                modalFilteredChapters.map((cap) => {
                  const isInQueue = queueChapterIds.includes(cap.id);
                  const isRead = readChapterIds.includes(cap.id);
                  const rCount = progressMap[cap.id]?.read_count || (isRead ? 1 : 0);

                  return (
                    <div
                      key={cap.id}
                      onClick={() => handleToggleAddChapter(cap.id)}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: isInQueue
                          ? 'rgba(56, 189, 248, 0.12)'
                          : 'rgba(15, 23, 42, 0.6)',
                        border: isInQueue
                          ? '1px solid rgba(56, 189, 248, 0.4)'
                          : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isInQueue) e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isInQueue) e.currentTarget.style.borderColor = 'var(--border-subtle)';
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginBottom: '2px' }}>
                          {cap.sectionTitle} {cap.sourceBook ? `• ${cap.sourceBook}` : ''}
                        </div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#ffffff' }}>
                          {cap.isCustom ? cap.title : `Capítulo ${cap.number}: ${cap.title}`}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isRead && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              color: '#fbbf24',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                            }}
                          >
                            <RefreshCw size={11} /> Lido (#{rCount}) • + Releitura
                          </span>
                        )}

                        <button
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            background: isInQueue ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                            color: isInQueue ? '#f87171' : '#38bdf8',
                            border: isInQueue ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {isInQueue ? (
                            <>
                              <X size={13} /> Remover
                            </>
                          ) : (
                            <>
                              <Plus size={13} /> Adicionar
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {queueItems.length} capítulos selecionados na fila
              </span>
              <button
                onClick={() => setShowAddModal(false)}
                className="btn-primary"
                style={{ padding: '8px 20px', fontSize: '0.85rem' }}
              >
                Concluir Seleção
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Disparo de Questões após Marcar Estudo / Releitura */}
      {studiedModalInfo && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            padding: '20px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '500px',
              width: '100%',
              padding: '30px',
              textAlign: 'center',
              borderRadius: '20px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(52, 211, 153, 0.4)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid rgba(52, 211, 153, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                color: '#34d399',
              }}
            >
              <CheckCircle2 size={30} />
            </div>

            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
              {studiedModalInfo.isReread
                ? `Releitura Registrada (Revisão #${studiedModalInfo.count})!`
                : '1ª Leitura Registrada com Sucesso!'}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '22px', lineHeight: 1.4 }}>
              Você concluiu o estudo de <strong>{studiedModalInfo.chapter.isCustom ? studiedModalInfo.chapter.title : `Cap. ${studiedModalInfo.chapter.number}: ${studiedModalInfo.chapter.title}`}</strong>. Deseja gerar questões com IA para testar sua retenção clínica agora?
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => setStudiedModalInfo(null)}
                className="btn-secondary"
                style={{ flex: 1, padding: '10px' }}
              >
                Continuar na Fila
              </button>

              <button
                onClick={() => {
                  const capId = studiedModalInfo.chapter.id;
                  setStudiedModalInfo(null);
                  handleGoToTest(capId);
                }}
                className="btn-primary"
                style={{ flex: 1, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Sparkles size={16} /> Gerar Questões IA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Limpar Fila */}
      {showClearConfirm && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            padding: '20px',
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '420px',
              width: '100%',
              padding: '26px',
              textAlign: 'center',
              borderRadius: '18px',
            }}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
              Limpar Roteiro de Estudos?
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Isso removerá todos os capítulos da sua fila atual. O histórico de leitura e revisões dos capítulos permanecerá salvo no sistema.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="btn-secondary"
                style={{ flex: 1, padding: '9px' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleClear}
                className="btn-primary"
                style={{ flex: 1, padding: '9px', background: '#ef4444', borderColor: '#dc2626' }}
              >
                Sim, Limpar Fila
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reader Modal */}
      {readerChapter && (
        <ChapterReaderModal
          chapter={readerChapter}
          isOpen={Boolean(readerChapter)}
          onClose={() => setReaderChapter(null)}
          onMarkRead={async (capId) => {
            const cap = chaptersList.find((c) => c.id === capId);
            const item = queueItems.find((i) => i.chapter_id === capId);
            if (cap && item) {
              await handleToggleStudy(cap, item);
            }
          }}
          isRead={readChapterIds.includes(readerChapter.id)}
          readCount={readChapterIds.includes(readerChapter.id) ? (progressMap[readerChapter.id]?.read_count || 1) : 0}
        />
      )}
    </div>
  );
}
