'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CHAPTERS_DATA, SECTIONS, Chapter } from '@/lib/chapters-data';
import { calculateFSRSManualReadUpdate } from '@/lib/learning-engine';
import {
  Search,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  BookOpen,
  Filter,
  RefreshCw,
} from 'lucide-react';

export default function CapitulosPage() {
  const router = useRouter();
  const supabase = createClient();

  const [readChapterIds, setReadChapterIds] = useState<number[]>([]);
  const [progressMap, setProgressMap] = useState<Record<number, { is_read: boolean; read_count: number; last_read_at?: string }>>({});
  const [search, setSearch] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});

  useEffect(() => {
    async function loadProgress() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: progress } = await supabase
          .from('chapter_progress')
          .select('chapter_id, is_read, read_count, last_read_at')
          .eq('user_id', user.id);

        if (progress) {
          const pMap: Record<number, { is_read: boolean; read_count: number; last_read_at?: string }> = {};
          const readIds: number[] = [];
          progress.forEach((p) => {
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
    }
    loadProgress();
  }, []);

  const handleRegisterReRead = async (chapterId: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setActionLoading((prev) => ({ ...prev, [chapterId]: true }));

    try {
      const current = progressMap[chapterId];
      const isAlreadyRead = readChapterIds.includes(chapterId);
      const currentCount = current?.read_count || (isAlreadyRead ? 1 : 0);
      const newCount = currentCount + 1;
      const nowIso = new Date().toISOString();

      // 1. Update chapter_progress
      await supabase.from('chapter_progress').upsert({
        user_id: user.id,
        chapter_id: chapterId,
        is_read: true,
        read_at: current?.last_read_at || nowIso,
        read_count: newCount,
        last_read_at: nowIso,
      });

      // 2. Insert into chapter_read_logs
      await supabase.from('chapter_read_logs').insert({
        user_id: user.id,
        chapter_id: chapterId,
        read_count_snapshot: newCount,
        source: 'manual_chapter_list',
      });

      // 3. Update FSRS chapter_review_stats
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

      // 4. Update UI local state
      setProgressMap((prev) => ({
        ...prev,
        [chapterId]: {
          is_read: true,
          read_count: newCount,
          last_read_at: nowIso,
        },
      }));

      if (!readChapterIds.includes(chapterId)) {
        setReadChapterIds((prev) => [...prev, chapterId]);
      }
    } catch (err) {
      console.error('Erro ao registrar releitura:', err);
    } finally {
      setActionLoading((prev) => ({ ...prev, [chapterId]: false }));
    }
  };

  const toggleChapterRead = async (chapterId: number) => {
    const isCurrentlyRead = readChapterIds.includes(chapterId);
    if (!isCurrentlyRead) {
      // First time reading -> register as read
      await handleRegisterReRead(chapterId);
    } else {
      // Unmark read status
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

  const toggleSectionCollapse = (secNum: number) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [secNum]: !prev[secNum],
    }));
  };

  const totalChapters = CHAPTERS_DATA.length;
  const readCount = readChapterIds.length;
  const progressPercent = Math.round((readCount / totalChapters) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc' }}>
            Índice do Livro Medicina de Emergência
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            122 Capítulos organizados em 20 Seções Clínicas — Registre leituras e revisões manuais
          </p>
        </div>

        {/* Global Progress */}
        <div className="glass-panel" style={{ padding: '12px 20px', borderRadius: '14px', minWidth: '220px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
            <span>Lidos: {readCount} / {totalChapters}</span>
            <span style={{ color: '#38bdf8' }}>{progressPercent}%</span>
          </div>
          <div className="progress-bar-bg" style={{ height: '6px' }}>
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '260px', position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          <input
            type="text"
            className="input-field"
            style={{ paddingLeft: '42px' }}
            placeholder="Buscar por capítulo, doença, fármaco..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '8px 16px',
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
            onClick={() => setFilter('read')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: filter === 'read' ? 'var(--secondary)' : 'transparent',
              color: filter === 'read' ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s ease',
            }}
          >
            Lidos ({readCount})
          </button>
          <button
            onClick={() => setFilter('unread')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: filter === 'unread' ? 'rgba(244, 63, 94, 0.8)' : 'transparent',
              color: filter === 'unread' ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s ease',
            }}
          >
            Não Lidos ({totalChapters - readCount})
          </button>
        </div>
      </div>

      {/* Sections & Chapters List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {SECTIONS.map((sec) => {
          // Filter chapters in this section
          const sectionFilteredChapters = sec.chapters.filter((cap) => {
            const matchesSearch = cap.title.toLowerCase().includes(search.toLowerCase());
            const isRead = readChapterIds.includes(cap.id);
            if (filter === 'read') return matchesSearch && isRead;
            if (filter === 'unread') return matchesSearch && !isRead;
            return matchesSearch;
          });

          if (sectionFilteredChapters.length === 0) return null;

          const isCollapsed = collapsedSections[sec.number];
          const secReadCount = sec.chapters.filter((c) => readChapterIds.includes(c.id)).length;
          const secProgress = Math.round((secReadCount / sec.chapters.length) * 100);

          return (
            <div key={sec.number} className="glass-panel" style={{ padding: '20px', borderRadius: '16px' }}>
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
                  {isCollapsed ? <ChevronRight size={20} color="#38bdf8" /> : <ChevronDown size={20} color="#38bdf8" />}
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                      Seção {sec.number}: {sec.title}
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

                    return (
                      <div
                        key={cap.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          background: isRead ? 'rgba(16, 185, 129, 0.05)' : 'rgba(15, 23, 42, 0.4)',
                          border: isRead ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid var(--border-subtle)',
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
                              <span>Capítulo {cap.number}: {cap.title}</span>
                              {isRead && (
                                <span style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: '9999px',
                                  background: 'rgba(16, 185, 129, 0.15)',
                                  color: '#34d399',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                }}>
                                  Revisão #{rCount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {isRead && (
                            <button
                              onClick={() => handleRegisterReRead(cap.id)}
                              disabled={isLoadingThis}
                              className="btn-secondary"
                              style={{
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                                color: '#34d399',
                                borderColor: 'rgba(52, 211, 153, 0.4)',
                              }}
                              title="Registrar releitura/revisão manual deste capítulo para o FSRS"
                            >
                              <RefreshCw size={14} className={isLoadingThis ? 'animate-spin' : ''} /> {isLoadingThis ? 'Salvando...' : '+ Releitura'}
                            </button>
                          )}

                          <button
                            onClick={() => router.push(`/testes?chapterId=${cap.id}`)}
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          >
                            <Sparkles size={14} /> Testar IA
                          </button>
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
    </div>
  );
}
