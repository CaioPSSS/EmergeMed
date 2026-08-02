'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CHAPTERS_DATA, SECTIONS, Chapter } from '@/lib/chapters-data';
import {
  Search,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  BookOpen,
  Filter,
} from 'lucide-react';

export default function CapitulosPage() {
  const router = useRouter();
  const supabase = createClient();

  const [readChapterIds, setReadChapterIds] = useState<number[]>([]);
  const [search, setSearch] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadProgress() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: progress } = await supabase
          .from('chapter_progress')
          .select('chapter_id, is_read')
          .eq('user_id', user.id)
          .eq('is_read', true);

        if (progress) {
          setReadChapterIds(progress.map((p) => p.chapter_id));
        }
      }
      setLoading(false);
    }
    loadProgress();
  }, []);

  const toggleChapterRead = async (chapterId: number) => {
    const isCurrentlyRead = readChapterIds.includes(chapterId);
    const updated = isCurrentlyRead
      ? readChapterIds.filter((id) => id !== chapterId)
      : [...readChapterIds, chapterId];

    setReadChapterIds(updated);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('chapter_progress').upsert({
        user_id: user.id,
        chapter_id: chapterId,
        is_read: !isCurrentlyRead,
        read_at: !isCurrentlyRead ? new Date().toISOString() : null,
      });
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
            122 Capítulos organizados em 20 Seções Clínicas
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
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
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
                            title={isRead ? 'Marcar como não lido' : 'Marcar como lido'}
                          >
                            {isRead ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                          </button>

                          <div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: isRead ? '#e2e8f0' : '#ffffff' }}>
                              Capítulo {cap.number}: {cap.title}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
