'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Chapter } from '@/lib/chapters-data';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
  X,
  BookOpen,
  CheckCircle2,
  Sparkles,
  FileQuestion,
  Edit3,
  Loader2,
  Bookmark,
  Layers,
  Clock,
  Award,
} from 'lucide-react';

interface ChapterReaderModalProps {
  chapter: Chapter | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkRead?: (chapterId: number) => void;
  onTriggerRereadQuiz?: (chapter: Chapter) => void;
  isRead?: boolean;
  readCount?: number;
}

export function ChapterReaderModal({
  chapter,
  isOpen,
  onClose,
  onMarkRead,
  onTriggerRereadQuiz,
  isRead = false,
  readCount = 0,
}: ChapterReaderModalProps) {
  const router = useRouter();
  const supabase = createClient();

  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<'normal' | 'large'>('normal');

  useEffect(() => {
    if (!isOpen || !chapter) {
      setContent('');
      return;
    }

    async function fetchContent() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('chapter_contents')
          .select('content, word_count')
          .eq('chapter_id', chapter!.id)
          .maybeSingle();

        if (data?.content) {
          setContent(data.content);
        } else {
          setContent('');
        }
      } catch (err) {
        console.warn('Erro ao buscar conteúdo do capítulo:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchContent();
  }, [isOpen, chapter]);

  if (!isOpen || !chapter) return null;

  const handleStartTest = () => {
    onClose();
    router.push(`/testes?chapterId=${chapter.id}`);
  };

  const handleEdit = () => {
    onClose();
    router.push(`/capitulos/novo?editId=${chapter.id}`);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '900px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '20px',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(10, 15, 30, 0.98) 100%)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            background: 'rgba(30, 41, 59, 0.4)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '20px',
                  background: chapter.isCustom
                    ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(59, 130, 246, 0.25))'
                    : 'rgba(56, 189, 248, 0.15)',
                  color: chapter.isCustom ? '#c084fc' : '#38bdf8',
                  border: `1px solid ${chapter.isCustom ? 'rgba(168, 85, 247, 0.4)' : 'rgba(56, 189, 248, 0.3)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Bookmark size={12} />
                {chapter.sourceBook || (chapter.isCustom ? 'Capítulo Personalizado' : 'Medicina de Emergência USP')}
              </span>

              {chapter.category && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: '20px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <Layers size={12} />
                  {chapter.category}
                </span>
              )}

              {isRead && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: '20px',
                    background: 'rgba(34, 197, 94, 0.2)',
                    color: '#4ade80',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <CheckCircle2 size={12} />
                  Lido ({readCount}x)
                </span>
              )}
            </div>

            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.3 }}>
              {chapter.isCustom ? chapter.title : `Capítulo ${chapter.number}: ${chapter.title}`}
            </h2>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-subtle)' }}>
              {chapter.sectionTitle}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setFontSize(fontSize === 'normal' ? 'large' : 'normal')}
              title="Ajustar tamanho da fonte"
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {fontSize === 'normal' ? 'A+' : 'A-'}
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                borderRadius: '10px',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '24px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            fontSize: fontSize === 'large' ? '1.05rem' : '0.95rem',
          }}
        >
          {/* Summary / Pearls Block if present */}
          {chapter.summary && (
            <div
              style={{
                padding: '16px 20px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 700, marginBottom: '8px', fontSize: '0.95rem' }}>
                <Sparkles size={16} />
                Pérolas Clínicas & Pontos de Atenção Imediata
              </div>
              <MarkdownRenderer content={chapter.summary} />
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '12px' }}>
              <Loader2 className="animate-spin" size={32} color="#38bdf8" />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Carregando texto completo do capítulo...</span>
            </div>
          ) : content ? (
            <div style={{ color: '#e2e8f0', lineHeight: 1.8 }}>
              <MarkdownRenderer content={content} />
            </div>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                background: 'rgba(15, 23, 42, 0.4)',
                borderRadius: '12px',
                border: '1px dashed var(--border-subtle)',
              }}
            >
              <BookOpen size={40} color="#64748b" style={{ margin: '0 auto 12px' }} />
              <h4 style={{ color: '#f8fafc', fontWeight: 700, marginBottom: '6px' }}>Conteúdo em Processamento</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto' }}>
                O texto completo deste capítulo ainda não foi indexado na íntegra no banco de dados. Você ainda pode gerar simulados e testes normalmente!
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            background: 'rgba(15, 23, 42, 0.8)',
          }}
        >
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {chapter.isCustom && (
              <button
                onClick={handleEdit}
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
              >
                <Edit3 size={14} />
                Editar Capítulo
              </button>
            )}

            {onMarkRead && (
              <button
                onClick={() => onMarkRead(chapter.id)}
                className="btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.85rem',
                  color: isRead ? '#4ade80' : undefined,
                  borderColor: isRead ? 'rgba(34, 197, 94, 0.4)' : undefined,
                }}
              >
                <CheckCircle2 size={14} />
                {isRead ? 'Registrar Nova Leitura (+FSRS)' : 'Marcar como Lido (+50 XP)'}
              </button>
            )}

            {isRead && onTriggerRereadQuiz && (
              <button
                onClick={() => {
                  onClose();
                  onTriggerRereadQuiz(chapter);
                }}
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.4)' }}
              >
                <Sparkles size={14} />
                Quiz de Releitura (3 Qs)
              </button>
            )}
          </div>

          <button
            onClick={handleStartTest}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}
          >
            <FileQuestion size={16} />
            Gerar Casos e Questões Deste Capítulo
          </button>
        </div>
      </div>
    </div>
  );
}
