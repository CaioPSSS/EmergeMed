'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Chapter, Section } from '@/lib/chapters-data';
import { getUnifiedSections, getUnifiedChapters } from '@/lib/chapters-service';
import { calculateFSRSManualReadUpdate } from '@/lib/learning-engine';
import { recordActivityAndAwardXP } from '@/lib/gamification-engine';
import { fetchStudyQueue, addToStudyQueue, removeFromStudyQueue } from '@/lib/study-queue-service';
import { RereadQuizModal } from '@/components/RereadQuizModal';
import { ChapterReaderModal } from '@/components/ChapterReaderModal';
import {
  Search,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  BookOpen,
  Plus,
  Bookmark,
  Layers,
  Edit3,
  Trash2,
  RefreshCw,
  Eye,
  FileQuestion,
  HelpCircle,
} from 'lucide-react';

export default function CapitulosPage() {
  const router = useRouter();
  const supabase = createClient();

  const [sections, setSections] = useState<Section[]>([]);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const [readChapterIds, setReadChapterIds] = useState<number[]>([]);
  const [progressMap, setProgressMap] = useState<Record<number, { is_read: boolean; read_count: number; last_read_at?: string }>>({});
  const [search, setSearch] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'official' | 'custom' | 'read' | 'unread'>('all');
  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [queueChapterIds, setQueueChapterIds] = useState<number[]>([]);
  const [queueToast, setQueueToast] = useState<string | null>(null);

  // Modals
  const [rereadQuizTarget, setRereadQuizTarget] = useState<Chapter | null>(null);
  const [readerChapterTarget, setReaderChapterTarget] = useState<Chapter | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const [unifiedSections, unifiedCaps, progressRes, queueIds] = await Promise.all([
        getUnifiedSections(supabase, user.id),
        getUnifiedChapters(supabase, user.id),
        supabase
          .from('chapter_progress')
          .select('chapter_id, is_read, read_count, last_read_at')
          .eq('user_id', user.id),
        fetchStudyQueue(supabase, user.id),
      ]);

      setSections(unifiedSections);
      setAllChapters(unifiedCaps);
      setQueueChapterIds(queueIds);

      if (progressRes.data) {
        const pMap: Record<number, { is_read: boolean; read_count: number; last_read_at?: string }> = {};
        const readIds: number[] = [];
        progressRes.data.forEach((p) => {
          if (p.is_read) {
            readIds.push(p.chapter_id);
            pMap[p.chapter_id] = {
              is_read: p.is_read,
              read_count: p.read_count || 1,
              last_read_at: p.last_read_at || undefined,
            };
          }
        });
        setProgressMap(pMap);
        setReadChapterIds(readIds);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRegisterReadAndGoToTest = async (chapterId: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setActionLoading((prev) => ({ ...prev, [chapterId]: true }));

    try {
      const isAlreadyRead = readChapterIds.includes(chapterId);
      const current = progressMap[chapterId];
      const currentCount = current?.read_count || (isAlreadyRead ? 1 : 0);
      const newCount = currentCount + 1;
      const nowIso = new Date().toISOString();

      await supabase.from('chapter_progress').upsert({
        user_id: user.id,
        chapter_id: chapterId,
        is_read: true,
        read_at: current?.last_read_at || nowIso,
        read_count: newCount,
        last_read_at: nowIso,
      });

      await supabase.from('chapter_read_logs').insert({
        user_id: user.id,
        chapter_id: chapterId,
        read_count_snapshot: newCount,
        source: isAlreadyRead ? 'reread_manual_chapter_list' : 'first_read_manual_chapter_list',
      });

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

      await recordActivityAndAwardXP(supabase, user.id, { type: 'first_read' });

      setProgressMap((prev) => ({
        ...prev,
        [chapterId]: {
          is_read: true,
          read_count: newCount,
          last_read_at: nowIso,
        },
      }));

      setReadChapterIds((prev) => Array.from(new Set([...prev, chapterId])));
    } catch (err) {
      console.error('Erro ao registrar leitura/releitura:', err);
    } finally {
      setActionLoading((prev) => ({ ...prev, [chapterId]: false }));
    }

    router.push(`/testes?chapterId=${chapterId}`);
  };

  const toggleChapterRead = async (chapterId: number) => {
    const isCurrentlyRead = readChapterIds.includes(chapterId);
    if (!isCurrentlyRead) {
      await handleRegisterReadAndGoToTest(chapterId);
    } else {
      const updated = readChapterIds.filter((id) => id !== chapterId);
      setReadChapterIds(updated);
      setProgressMap((prev) => {
        const copy = { ...prev };
        delete copy[chapterId];
        return copy;
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('chapter_progress').upsert({
          user_id: user.id,
          chapter_id: chapterId,
          is_read: false,
        });
      }
    }
  };

  const handleToggleQueue = async (chapterId: number, chapterTitle: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (queueChapterIds.includes(chapterId)) {
      const updated = await removeFromStudyQueue(supabase, user.id, chapterId);
      setQueueChapterIds(updated);
      setQueueToast(`"${chapterTitle}" removido da fila de estudos.`);
    } else {
      const updated = await addToStudyQueue(supabase, user.id, chapterId);
      setQueueChapterIds(updated);
      setQueueToast(`"${chapterTitle}" adicionado à fila de estudos!`);
    }
    setTimeout(() => setQueueToast(null), 3000);
  };

  const handleDeleteCustomChapter = async (chapterId: number) => {
    if (!confirm('Tem certeza que deseja excluir este capítulo personalizado?')) return;

    setDeletingId(chapterId);
    try {
      const res = await fetch(`/api/custom-chapters/${chapterId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao excluir');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir capítulo');
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSectionCollapse = (secNum: number) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [secNum]: !prev[secNum],
    }));
  };

  const totalChapters = allChapters.length;
  const customChapters = allChapters.filter((c) => c.isCustom);
  const readCount = readChapterIds.length;
  const progressPercent = totalChapters > 0 ? Math.round((readCount / totalChapters) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
            Índice de Capítulos & Literatura Médica
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            {totalChapters} Capítulos organizados em seções clínicas — Estude, leia e registre revisões no motor FSRS
          </p>
        </div>

        {/* Action Button & Global Progress */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/capitulos/novo"
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              fontSize: '0.95rem',
              boxShadow: '0 0 20px rgba(56, 189, 248, 0.3)',
            }}
          >
            <Plus size={18} />
            Adicionar Capítulo de Livro
          </Link>

          <div className="glass-panel" style={{ padding: '10px 18px', borderRadius: '14px', minWidth: '200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
              <span>Lidos: {readCount} / {totalChapters}</span>
              <span style={{ color: '#38bdf8' }}>{progressPercent}%</span>
            </div>
            <div className="progress-bar-bg" style={{ height: '6px' }}>
              <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '260px', position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          <input
            type="text"
            className="input-field"
            style={{ paddingLeft: '42px' }}
            placeholder="Buscar por título, doença, livro de origem ou fármaco..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: filter === 'all' ? 'var(--primary)' : 'transparent',
              color: filter === 'all' ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s ease',
            }}
          >
            Todos ({totalChapters})
          </button>

          <button
            onClick={() => setFilter('official')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: filter === 'official' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: filter === 'official' ? '#38bdf8' : 'var(--text-muted)',
              borderBottom: filter === 'official' ? '2px solid #38bdf8' : 'none',
            }}
          >
            Oficiais (122)
          </button>

          <button
            onClick={() => setFilter('custom')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: filter === 'custom' ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
              color: filter === 'custom' ? '#c084fc' : 'var(--text-muted)',
              borderBottom: filter === 'custom' ? '2px solid #c084fc' : 'none',
            }}
          >
            Meus Livros ({customChapters.length})
          </button>

          <button
            onClick={() => setFilter('read')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: filter === 'read' ? 'var(--secondary)' : 'transparent',
              color: filter === 'read' ? '#fff' : 'var(--text-muted)',
            }}
          >
            Lidos ({readCount})
          </button>

          <button
            onClick={() => setFilter('unread')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: filter === 'unread' ? 'rgba(244, 63, 94, 0.8)' : 'transparent',
              color: filter === 'unread' ? '#fff' : 'var(--text-muted)',
            }}
          >
            Não Lidos ({totalChapters - readCount})
          </button>
        </div>
      </div>

      {/* Sections & Chapters List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {sections.map((sec) => {
          const sectionFilteredChapters = sec.chapters.filter((cap) => {
            const matchesSearch =
              cap.title.toLowerCase().includes(search.toLowerCase()) ||
              (cap.sourceBook && cap.sourceBook.toLowerCase().includes(search.toLowerCase())) ||
              (cap.category && cap.category.toLowerCase().includes(search.toLowerCase()));

            const isRead = readChapterIds.includes(cap.id);

            if (filter === 'official') return matchesSearch && !cap.isCustom;
            if (filter === 'custom') return matchesSearch && cap.isCustom;
            if (filter === 'read') return matchesSearch && isRead;
            if (filter === 'unread') return matchesSearch && !isRead;
            return matchesSearch;
          });

          if (sectionFilteredChapters.length === 0) return null;

          const isCollapsed = collapsedSections[sec.number];
          const secReadCount = sec.chapters.filter((c) => readChapterIds.includes(c.id)).length;
          const secProgress = sec.chapters.length > 0 ? Math.round((secReadCount / sec.chapters.length) * 100) : 0;

          return (
            <div
              key={sec.number}
              className="glass-panel"
              style={{
                padding: '20px',
                borderRadius: '16px',
                border: sec.isCustom ? '1px solid rgba(168, 85, 247, 0.3)' : undefined,
              }}
            >
              {/* Section Header */}
              <div
                onClick={() => toggleSectionCollapse(sec.number)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {isCollapsed ? (
                    <ChevronRight size={20} color={sec.isCustom ? '#c084fc' : '#38bdf8'} />
                  ) : (
                    <ChevronDown size={20} color={sec.isCustom ? '#c084fc' : '#38bdf8'} />
                  )}
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {sec.title}
                      {sec.isCustom && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: 'rgba(168, 85, 247, 0.2)',
                            color: '#c084fc',
                          }}
                        >
                          Personalizado
                        </span>
                      )}
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                      {secReadCount} de {sec.chapters.length} lidos ({secProgress}%)
                    </span>
                  </div>
                </div>

                <div style={{ width: '120px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="progress-bar-bg" style={{ height: '6px' }}>
                    <div className="progress-bar-fill" style={{ width: `${secProgress}%` }} />
                  </div>
                </div>
              </div>

              {/* Chapters List */}
              {!isCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                  {sectionFilteredChapters.map((cap) => {
                    const isRead = readChapterIds.includes(cap.id);
                    const pInfo = progressMap[cap.id];
                    const rCount = pInfo?.read_count || (isRead ? 1 : 0);
                    const isLoadingThis = actionLoading[cap.id] || false;
                    const isDeletingThis = deletingId === cap.id;

                    return (
                      <div
                        key={cap.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          background: isRead
                            ? 'rgba(16, 185, 129, 0.05)'
                            : cap.isCustom
                            ? 'rgba(168, 85, 247, 0.04)'
                            : 'rgba(15, 23, 42, 0.4)',
                          border: isRead
                            ? '1px solid rgba(16, 185, 129, 0.2)'
                            : cap.isCustom
                            ? '1px solid rgba(168, 85, 247, 0.2)'
                            : '1px solid var(--border-subtle)',
                          transition: 'all 0.2s ease',
                          gap: '16px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '240px' }}>
                          <button
                            onClick={() => toggleChapterRead(cap.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: isRead ? '#34d399' : 'var(--text-subtle)',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title={isRead ? 'Marcar como não lido' : 'Marcar 1ª leitura'}
                          >
                            {isRead ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                          </button>

                          <div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: isRead ? '#e2e8f0' : '#ffffff', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span
                                onClick={() => setReaderChapterTarget(cap)}
                                style={{ cursor: 'pointer', transition: 'color 0.2s' }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = '#38bdf8')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = isRead ? '#e2e8f0' : '#ffffff')}
                              >
                                {cap.isCustom ? cap.title : `Capítulo ${cap.number}: ${cap.title}`}
                              </span>

                              {cap.sourceBook && (
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '9999px',
                                    background: 'rgba(168, 85, 247, 0.15)',
                                    color: '#c084fc',
                                    border: '1px solid rgba(168, 85, 247, 0.3)',
                                  }}
                                >
                                  {cap.sourceBook}
                                </span>
                              )}

                              {isRead && (
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '9999px',
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: '#34d399',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                  }}
                                >
                                  Revisão #{rCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => setReaderChapterTarget(cap)}
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                            title="Abrir leitor de texto do capítulo"
                          >
                            <BookOpen size={14} /> Ler
                          </button>

                          {isRead && (
                            <button
                              onClick={() => handleRegisterReadAndGoToTest(cap.id)}
                              disabled={isLoadingThis}
                              className="btn-secondary"
                              style={{
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                                color: '#34d399',
                                borderColor: 'rgba(52, 211, 153, 0.4)',
                              }}
                              title="Registrar releitura e ir para gerador de testes"
                            >
                              <RefreshCw size={14} className={isLoadingThis ? 'animate-spin' : ''} /> {isLoadingThis ? 'Salvando...' : '+ Releitura'}
                            </button>
                          )}

                          <button
                            onClick={() => router.push(`/testes?chapterId=${cap.id}`)}
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                          >
                            <Sparkles size={14} /> Testar IA
                          </button>

                          <button
                            onClick={() => handleToggleQueue(cap.id, cap.title)}
                            className="btn-secondary"
                            style={{
                              padding: '6px 12px',
                              fontSize: '0.8rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: queueChapterIds.includes(cap.id) ? '#38bdf8' : 'var(--text-muted)',
                              borderColor: queueChapterIds.includes(cap.id) ? 'rgba(56, 189, 248, 0.4)' : 'var(--border-subtle)',
                              background: queueChapterIds.includes(cap.id) ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                            }}
                            title={queueChapterIds.includes(cap.id) ? 'Remover da minha fila de estudos' : 'Adicionar à minha fila de estudos'}
                          >
                            <Bookmark size={14} /> {queueChapterIds.includes(cap.id) ? 'Na Fila ✓' : '+ Fila'}
                          </button>

                          {cap.isCustom && (
                            <>
                              <Link
                                href={`/capitulos/novo?editId=${cap.id}`}
                                className="btn-secondary"
                                style={{ padding: '6px 10px', fontSize: '0.8rem', textDecoration: 'none', color: '#94a3b8' }}
                                title="Editar capítulo"
                              >
                                <Edit3 size={14} />
                              </Link>

                              <button
                                onClick={() => handleDeleteCustomChapter(cap.id)}
                                disabled={isDeletingThis}
                                className="btn-secondary"
                                style={{ padding: '6px 10px', fontSize: '0.8rem', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                title="Excluir capítulo personalizado"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reader Modal */}
      {readerChapterTarget && (
        <ChapterReaderModal
          chapter={readerChapterTarget}
          isOpen={Boolean(readerChapterTarget)}
          onClose={() => setReaderChapterTarget(null)}
          onMarkRead={handleRegisterReadAndGoToTest}
          onTriggerRereadQuiz={(cap) => setRereadQuizTarget(cap)}
          isRead={readChapterIds.includes(readerChapterTarget.id)}
          readCount={progressMap[readerChapterTarget.id]?.read_count || (readChapterIds.includes(readerChapterTarget.id) ? 1 : 0)}
        />
      )}

      {/* Re-read Quiz Modal */}
      {rereadQuizTarget && (
        <RereadQuizModal
          chapterId={rereadQuizTarget.id}
          chapterNumber={rereadQuizTarget.number}
          chapterTitle={rereadQuizTarget.title}
          onClose={() => setRereadQuizTarget(null)}
          onSuccess={async () => {
            setRereadQuizTarget(null);
            await loadData();
          }}
        />
      )}

      {/* Toast Notification de Fila */}
      {queueToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
            border: '1px solid rgba(56, 189, 248, 0.5)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
            color: '#f8fafc',
            padding: '12px 20px',
            borderRadius: '12px',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          <div style={{ color: '#38bdf8' }}>
            <Bookmark size={18} />
          </div>
          <span>{queueToast}</span>
        </div>
      )}
    </div>
  );
}
