'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CHAPTERS_DATA, Chapter } from '@/lib/chapters-data';
import {
  Shuffle,
  CheckCircle2,
  BookOpen,
  FileQuestion,
  Award,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Search,
  Activity,
  Flame,
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [readChapterIds, setReadChapterIds] = useState<number[]>([]);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [stats, setStats] = useState({
    totalRead: 0,
    testsCompleted: 0,
    averageScore: 0,
  });

  const [showTestModal, setShowTestModal] = useState<boolean>(false);
  const [showManualSelectModal, setShowManualSelectModal] = useState<boolean>(false);
  const [manualSearch, setManualSearch] = useState<string>('');

  useEffect(() => {
    async function loadDashboardData() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Fetch read progress
        const { data: progress } = await supabase
          .from('chapter_progress')
          .select('chapter_id, is_read')
          .eq('user_id', user.id)
          .eq('is_read', true);

        const readIds = progress ? progress.map((p) => p.chapter_id) : [];
        setReadChapterIds(readIds);

        // Fetch test stats
        const { data: testsData } = await supabase
          .from('tests')
          .select('score, completed')
          .eq('user_id', user.id)
          .eq('completed', true);

        const validTests = testsData ? testsData.filter((t) => t.score !== null && t.score !== undefined) : [];
        const testsCount = validTests.length;
        const avg = testsCount > 0
          ? Math.round((validTests.reduce((acc, curr) => acc + Number(curr.score), 0) / testsCount) * 10) / 10
          : 0;

        setStats({
          totalRead: readIds.length,
          testsCompleted: testsCount,
          averageScore: avg,
        });

        // Pick initial current chapter from saved setting or random unread
        const { data: settings } = await supabase
          .from('user_settings')
          .select('current_chapter_id')
          .eq('user_id', user.id)
          .single();

        let initialCapId = settings?.current_chapter_id;
        let selectedCap = CHAPTERS_DATA.find((c) => c.id === initialCapId);

        if (!selectedCap) {
          // Sortear um não lido e SALVAR para persistir entre reloads
          selectedCap = getRandomUnreadChapter(readIds);
          await supabase
            .from('user_settings')
            .upsert({ user_id: user.id, current_chapter_id: selectedCap.id, updated_at: new Date().toISOString() });
        }

        setCurrentChapter(selectedCap);
      }
      setLoading(false);
    }

    loadDashboardData();
  }, []);

  function getRandomUnreadChapter(readIds: number[]): Chapter {
    const unread = CHAPTERS_DATA.filter((c) => !readIds.includes(c.id));
    if (unread.length === 0) {
      // Se leu todos, sorteia qualquer um
      const randIndex = Math.floor(Math.random() * CHAPTERS_DATA.length);
      return CHAPTERS_DATA[randIndex];
    }
    const randIndex = Math.floor(Math.random() * unread.length);
    return unread[randIndex];
  }

  const handleDrawNextChapter = async () => {
    const nextChapter = getRandomUnreadChapter(readChapterIds);
    setCurrentChapter(nextChapter);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, current_chapter_id: nextChapter.id, updated_at: new Date().toISOString() });
    }
  };

  const handleMarkAsRead = async () => {
    if (!currentChapter) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newReadIds = [...readChapterIds, currentChapter.id];
    setReadChapterIds(newReadIds);
    setStats((prev) => ({ ...prev, totalRead: newReadIds.length }));

    await supabase.from('chapter_progress').upsert({
      user_id: user.id,
      chapter_id: currentChapter.id,
      is_read: true,
      read_at: new Date().toISOString(),
    });

    // Abrir modal sugerindo teste sobre este capítulo
    setShowTestModal(true);
  };

  const handleSelectChapterManually = async (cap: Chapter) => {
    setCurrentChapter(cap);
    setShowManualSelectModal(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, current_chapter_id: cap.id, updated_at: new Date().toISOString() });
    }
  };

  const isCurrentRead = currentChapter ? readChapterIds.includes(currentChapter.id) : false;
  const filteredChapters = CHAPTERS_DATA.filter((c) =>
    c.title.toLowerCase().includes(manualSearch.toLowerCase()) ||
    c.sectionTitle.toLowerCase().includes(manualSearch.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="pulse-badge">
              <span className="pulse-dot" /> Sala Vermelha & Emergências UPA
            </span>
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc' }}>
            Central de Preparação Clínica
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Livro Medicina de Emergência — 122 Capítulos de Prática Intensiva
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => router.push('/testes')}
            className="btn-primary"
            style={{ padding: '12px 20px' }}
          >
            <Sparkles size={18} /> Novo Teste por IA
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>Capítulos Lidos</span>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8' }}>
              <BookOpen size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', marginTop: '12px' }}>
            {stats.totalRead} <span style={{ fontSize: '1rem', color: 'var(--text-subtle)', fontWeight: 500 }}>/ {CHAPTERS_DATA.length}</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>Simulados Realizados</span>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
              <FileQuestion size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', marginTop: '12px' }}>
            {stats.testsCompleted}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>Nota Média IA</span>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
              <Award size={20} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f8fafc', marginTop: '12px' }}>
            {stats.averageScore > 0 ? `${stats.averageScore} / 10` : '—'}
          </div>
        </div>
      </div>

      {/* Main Chapter Focus Card (Capítulo Sorteado em Destaque) */}
      <div
        className="glass-panel"
        style={{
          padding: '36px',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.7) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, transparent 70%)',
          borderRadius: '50%',
          pointerEvents: 'none',
        }} />

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Carregando capítulo sorteado...
          </div>
        ) : currentChapter ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}>
                  SEÇÃO {currentChapter.sectionNumber} — {currentChapter.sectionTitle}
                </span>
                {isCurrentRead && (
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <CheckCircle2 size={14} /> Lido
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowManualSelectModal(true)}
                  className="btn-secondary"
                  style={{ fontSize: '0.88rem', padding: '8px 14px' }}
                >
                  <Search size={16} /> Mudar Capítulo
                </button>
                <button
                  onClick={handleDrawNextChapter}
                  className="btn-secondary"
                  style={{
                    fontSize: '0.88rem',
                    padding: '8px 14px',
                    borderColor: 'rgba(56, 189, 248, 0.4)',
                    color: '#38bdf8',
                  }}
                >
                  <Shuffle size={16} /> Sortear de Novo
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-subtle)', fontWeight: 600, marginBottom: '4px' }}>
                SUGESTÃO DE LEITURA ATUAL (SORTEIO ALEATÓRIO)
              </div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.25 }}>
                Capítulo {currentChapter.number}: {currentChapter.title}
              </h2>
            </div>

            {/* Actions for current chapter */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginTop: '12px',
              paddingTop: '20px',
              borderTop: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
            }}>
              {!isCurrentRead ? (
                <button
                  onClick={handleMarkAsRead}
                  className="btn-primary"
                  style={{ padding: '12px 24px', fontSize: '0.95rem' }}
                >
                  <CheckCircle2 size={18} /> Marcar Capítulo como Lido
                </button>
              ) : (
                <button
                  onClick={() => router.push(`/testes?chapterId=${currentChapter.id}`)}
                  className="btn-primary"
                  style={{ padding: '12px 24px', fontSize: '0.95rem' }}
                >
                  <Sparkles size={18} /> Criar Teste Sobre Este Capítulo
                </button>
              )}

              <button
                onClick={handleDrawNextChapter}
                className="btn-secondary"
                style={{ padding: '12px 20px', fontSize: '0.95rem' }}
              >
                <RefreshCw size={18} /> Sortear Próximo Capítulo
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Modal de confirmação para se testar após concluir leitura */}
      {showTestModal && currentChapter && (
        <div style={{
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
          zIndex: 100,
          padding: '24px',
        }}>
          <div className="glass-panel" style={{ maxWidth: '500px', width: '100%', padding: '32px', textAlign: 'center' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(14, 165, 233, 0.2))',
              border: '1px solid rgba(52, 211, 153, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px auto',
              color: '#34d399',
            }}>
              <CheckCircle2 size={32} />
            </div>

            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
              Capítulo Concluído com Sucesso!
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '24px' }}>
              Você marcou o <strong>Capítulo {currentChapter.number}: {currentChapter.title}</strong> como lido. Deseja gerar um teste de fixeza imediato sobre este tema?
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setShowTestModal(false);
                  handleDrawNextChapter();
                }}
                className="btn-secondary"
                style={{ flex: 1, padding: '12px' }}
              >
                Apenas Sortear Próximo
              </button>

              <button
                onClick={() => {
                  setShowTestModal(false);
                  router.push(`/testes?chapterId=${currentChapter.id}`);
                }}
                className="btn-primary"
                style={{ flex: 1, padding: '12px' }}
              >
                <Sparkles size={18} /> Testar Agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Seleção Manual de Capítulo */}
      {showManualSelectModal && (
        <div style={{
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
          zIndex: 100,
          padding: '24px',
        }}>
          <div className="glass-panel" style={{ maxWidth: '640px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                Selecionar Capítulo Manualmente
              </h3>
              <button
                onClick={() => setShowManualSelectModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input
                type="text"
                className="input-field"
                style={{ paddingLeft: '42px' }}
                placeholder="Buscar por título ou número..."
                value={manualSearch}
                onChange={(e) => setManualSearch(e.target.value)}
              />
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredChapters.map((cap) => {
                const isRead = readChapterIds.includes(cap.id);
                return (
                  <div
                    key={cap.id}
                    onClick={() => handleSelectChapterManually(cap)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '10px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                  >
                    <div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
                        Seção {cap.sectionNumber}: {cap.sectionTitle}
                      </div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fff' }}>
                        Cap. {cap.number}: {cap.title}
                      </div>
                    </div>

                    {isRead ? (
                      <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={14} /> Lido
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Não lido</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
