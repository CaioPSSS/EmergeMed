'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import {
  Sparkles,
  BookOpen,
  ArrowLeft,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Bookmark,
  Layers,
  Sliders,
  Eye,
  Edit3,
  HelpCircle,
  Flame,
  Zap,
} from 'lucide-react';

const MEDICAL_CATEGORIES = [
  'Cardiovascular',
  'Respiratório',
  'Infectologia',
  'Neurologia',
  'Trauma',
  'Metabólico',
  'Toxicologia',
  'Gastroenterologia',
  'Nefrologia / Urologia',
  'Pediatria',
  'Ginecologia / Obstetrícia',
  'Dermatologia / Alergia',
  'Psiquiatria',
  'Geral',
];

const SUGGESTED_BOOKS = [
  'Medicina de Emergência USP (18ª Ed.)',
  'Harrison — Medicina Interna (21ª Ed.)',
  'Rosen — Medicina de Emergência (10ª Ed.)',
  'ATLS — Advanced Trauma Life Support (10ª Ed.)',
  'ACLS — Suporte Avançado de Vida em Cardiologia (AHA 2025)',
  'PALS — Suporte Avançado de Vida em Pediatria',
  'Sanar — Manual de Emergências Clínicas',
  'Rotinas em Pronto-Socorro / UPA',
  'Diretrizes SBC / AMIB / AMB',
];

function NewChapterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('editId');
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<'paste' | 'metadata' | 'preview'>('paste');

  // Form states
  const [rawText, setRawText] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [sourceBook, setSourceBook] = useState<string>('');
  const [sectionTitle, setSectionTitle] = useState<string>('Capítulos Personalizados');
  const [category, setCategory] = useState<string>('Cardiovascular');
  const [summary, setSummary] = useState<string>('');
  const [cleanedContent, setCleanedContent] = useState<string>('');
  const [frequencyScore, setFrequencyScore] = useState<number>(7.0);
  const [importanceScore, setImportanceScore] = useState<number>(8.0);
  const [markAsRead, setMarkAsRead] = useState<boolean>(true);

  // Status states
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadingEdit, setLoadingEdit] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successSaved, setSuccessSaved] = useState<boolean>(false);
  const [savedChapterId, setSavedChapterId] = useState<number | null>(null);

  // Load existing if editId
  useEffect(() => {
    if (!editId) return;

    async function loadForEdit() {
      setLoadingEdit(true);
      try {
        const res = await fetch(`/api/custom-chapters/${editId}`);
        if (!res.ok) throw new Error('Falha ao carregar capítulo');
        const data = await res.json();
        if (data.chapter) {
          setTitle(data.chapter.title || '');
          setSourceBook(data.chapter.source_book || '');
          setSectionTitle(data.chapter.section_title || 'Capítulos Personalizados');
          setCategory(data.chapter.category || 'Geral');
          setSummary(data.chapter.summary || '');
          setCleanedContent(data.chapter.content || '');
          setRawText(data.chapter.raw_content || data.chapter.content || '');
          setFrequencyScore(Number(data.chapter.frequency_score) || 5.0);
          setImportanceScore(Number(data.chapter.importance_score) || 5.0);
          setActiveTab('metadata');
        }
      } catch (err: any) {
        setError(err.message || 'Erro ao carregar');
      } finally {
        setLoadingEdit(false);
      }
    }

    loadForEdit();
  }, [editId]);

  const charCount = rawText.length;
  const wordEstimate = rawText.trim().split(/\s+/).filter(Boolean).length;
  const tokenEstimate = Math.ceil(charCount / 4);

  const handleAnalyzeWithAI = async () => {
    if (!rawText || rawText.trim().length < 50) {
      setError('Por favor, cole pelo menos 50 caracteres para que a IA possa analisar e estruturar.');
      return;
    }

    setError(null);
    setAnalyzing(true);

    try {
      const res = await fetch('/api/custom-chapters/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          suggestedBookTitle: sourceBook.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro na análise da IA');
      }

      const { analysis } = data;
      setTitle(analysis.title || title || 'Capítulo Médico');
      setSourceBook(analysis.sourceBook || sourceBook || 'Livro Personalizado');
      setSectionTitle(analysis.sectionTitle || sectionTitle || 'Capítulos Personalizados');
      setCategory(analysis.category || category || 'Geral');
      setSummary(analysis.summary || '');
      setCleanedContent(analysis.cleanedContent || rawText);
      setFrequencyScore(analysis.frequencyScore || frequencyScore);
      setImportanceScore(analysis.importanceScore || importanceScore);

      setActiveTab('metadata');
    } catch (err: any) {
      console.error('Erro na análise:', err);
      setError(err.message || 'Falha ao processar texto com IA');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    const finalTitle = title.trim();
    const finalContent = cleanedContent.trim() || rawText.trim();

    if (!finalTitle) {
      setError('Por favor, informe um título para o capítulo.');
      setActiveTab('metadata');
      return;
    }

    if (!finalContent) {
      setError('O conteúdo do capítulo não pode estar vazio.');
      setActiveTab('paste');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const isUpdating = Boolean(editId);
      const url = isUpdating ? `/api/custom-chapters/${editId}` : '/api/custom-chapters';
      const method = isUpdating ? 'PUT' : 'POST';

      const payload = {
        title: finalTitle,
        sourceBook: sourceBook.trim() || 'Livro Personalizado',
        sectionTitle: sectionTitle.trim() || 'Capítulos Personalizados',
        category: category.trim() || 'Geral',
        summary: summary.trim() || null,
        content: finalContent,
        rawContent: rawText.trim() || null,
        frequencyScore,
        importanceScore,
        markAsRead: !isUpdating && markAsRead,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar capítulo');
      }

      const newId = isUpdating ? Number(editId) : data.chapter?.id;
      setSavedChapterId(newId);
      setSuccessSaved(true);
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      setError(err.message || 'Falha ao salvar capítulo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <Link
            href="/capitulos"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#38bdf8',
              fontSize: '0.85rem',
              fontWeight: 600,
              textDecoration: 'none',
              marginBottom: '8px',
            }}
          >
            <ArrowLeft size={16} /> Voltar para o Índice de Capítulos
          </Link>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
            {editId ? '✏️ Editar Capítulo Personalizado' : '📖 Adicionar Novo Capítulo de Livro'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            Cole o texto de qualquer livro ou protocolo médico para estruturar com IA e integrar aos testes e repetição espaçada FSRS.
          </p>
        </div>

        {/* Action Buttons Top */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleSave}
            disabled={saving || analyzing}
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 22px',
              fontSize: '0.95rem',
            }}
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {editId ? 'Salvar Alterações' : 'Salvar e Integrar'}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#fca5a5',
          }}
        >
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Success Modal / Banner */}
      {successSaved && (
        <div
          className="glass-panel"
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(56, 189, 248, 0.15) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#34d399' }}>
            <CheckCircle2 size={24} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>
              Capítulo Salvo com Sucesso! 🎉
            </h3>
          </div>
          <p style={{ color: '#cbd5e1', fontSize: '0.95rem', lineHeight: 1.6 }}>
            O capítulo <strong>&ldquo;{title}&rdquo;</strong> foi integrado ao banco de dados, configurado no motor FSRS e está pronto para geração de questões e casos clínicos pela IA!
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px' }}>
            <button
              onClick={() => router.push(`/testes?chapterId=${savedChapterId}`)}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Zap size={16} />
              Gerar Teste Agora Deste Capítulo
            </button>
            <button
              onClick={() => router.push('/capitulos')}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <BookOpen size={16} />
              Ver na Lista de Capítulos
            </button>
            <button
              onClick={() => {
                setSuccessSaved(false);
                setRawText('');
                setTitle('');
                setCleanedContent('');
                setSummary('');
                setActiveTab('paste');
              }}
              className="btn-secondary"
            >
              ➕ Adicionar Outro Capítulo
            </button>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          background: 'rgba(15, 23, 42, 0.7)',
          padding: '6px',
          borderRadius: '14px',
          border: '1px solid var(--border-subtle)',
          width: 'fit-content',
        }}
      >
        <button
          onClick={() => setActiveTab('paste')}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'paste' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'paste' ? '#fff' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <FileText size={16} />
          1. Colar Texto Bruto
        </button>

        <button
          onClick={() => setActiveTab('metadata')}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'metadata' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'metadata' ? '#fff' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <Sparkles size={16} />
          2. Metadados & Pérolas Clínicas
        </button>

        <button
          onClick={() => setActiveTab('preview')}
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            background: activeTab === 'preview' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'preview' ? '#fff' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <Eye size={16} />
          3. Preview Formatado
        </button>
      </div>

      {/* Loading state for edit */}
      {loadingEdit && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '12px' }}>
          <Loader2 className="animate-spin" size={28} color="#38bdf8" />
          <span style={{ color: 'var(--text-muted)' }}>Carregando dados do capítulo...</span>
        </div>
      )}

      {/* Tab 1: Paste Text */}
      {!loadingEdit && activeTab === 'paste' && (
        <div className="glass-panel" style={{ padding: '28px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
              Livro / Fonte de Referência (Opcional ou selecione):
            </label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="input-field"
                style={{ flex: 1, minWidth: '280px' }}
                placeholder="Ex: Harrison 21ª Ed, Rosen 10ª Ed, Rotinas UPA..."
                value={sourceBook}
                onChange={(e) => setSourceBook(e.target.value)}
              />
            </div>
            {/* Quick suggested chips */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              {SUGGESTED_BOOKS.slice(0, 5).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSourceBook(b)}
                  style={{
                    background: sourceBook === b ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.6)',
                    border: `1px solid ${sourceBook === b ? '#38bdf8' : 'var(--border-subtle)'}`,
                    color: sourceBook === b ? '#38bdf8' : 'var(--text-muted)',
                    borderRadius: '20px',
                    padding: '4px 12px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
                Texto Bruto do Capítulo / Protocolo:
              </label>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                {charCount.toLocaleString()} caracteres | ~{wordEstimate.toLocaleString()} palavras | ~{tokenEstimate.toLocaleString()} tokens
              </span>
            </div>

            <textarea
              className="input-field"
              rows={16}
              style={{
                width: '100%',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                lineHeight: 1.6,
                padding: '16px',
                borderRadius: '12px',
                resize: 'vertical',
              }}
              placeholder={`Cole aqui o texto bruto do capítulo copiado do PDF, e-book, artigo ou resumo...
Exemplo:
CETOACIDOSE DIABÉTICA (CAD)
A CAD é uma emergência metabólica caracterizada pela tríade hiperglicemia (> 250 mg/dL), acidose metabólica (pH < 7.30, HCO3 < 18 mEq/L) e cetonemia/cetonúria.
Tratamento inicial:
1. Hidratação com SF 0.9% 1000 mL na 1ª hora.
2. Checagem obrigatória do Potássio antes da Insulina.
3. Se K+ > 3.3 mEq/L: Insulina Regular 0.1 UI/kg IV bolus + 0.1 UI/kg/h em bomba de infusão...`}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
          </div>

          {/* AI Action Banner */}
          <div
            style={{
              padding: '20px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', marginBottom: '4px' }}>
                ✨ Processamento Inteligente com IA
              </h4>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>
                A IA removerá artefatos de PDF, organizará em Markdown limpo, identificará dosagens e gerará o resumo clínico executivo.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAnalyzeWithAI}
              disabled={analyzing || rawText.trim().length < 50}
              className="btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                fontSize: '0.95rem',
                fontWeight: 700,
                boxShadow: '0 0 20px rgba(56, 189, 248, 0.4)',
              }}
            >
              {analyzing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Estruturando com IA...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Analisar e Estruturar com IA
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Metadata & Clinical Pearls */}
      {!loadingEdit && activeTab === 'metadata' && (
        <div className="glass-panel" style={{ padding: '28px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {/* Title */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                Título do Capítulo: *
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: Cetoacidose Diabética e Estado Hiperosmolar"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Source Book */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                Livro / Obra de Referência:
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: Harrison Medicina Interna"
                value={sourceBook}
                onChange={(e) => setSourceBook(e.target.value)}
              />
            </div>

            {/* Section / Module */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                Seção Clínica:
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: Emergências Metabólicas & Endócrinas"
                value={sectionTitle}
                onChange={(e) => setSectionTitle(e.target.value)}
              />
            </div>

            {/* Category */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                Categoria Médica (Ontologia EmergeMed):
              </label>
              <select
                className="input-field"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {MEDICAL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} style={{ background: '#0f172a' }}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* FSRS Weights (Sliders) */}
          <div
            style={{
              padding: '20px',
              borderRadius: '14px',
              background: 'rgba(30, 41, 59, 0.4)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f8fafc', fontWeight: 700 }}>
              <Sliders size={18} color="#38bdf8" />
              Pesos Clínicos para o Motor FSRS de Repetição Espaçada
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Gravidade / Importância Clínica (1 a 10):</span>
                  <span style={{ color: '#38bdf8', fontWeight: 800 }}>{importanceScore.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={importanceScore}
                  onChange={(e) => setImportanceScore(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#38bdf8' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Frequência no Pronto-Socorro / UPA (1 a 10):</span>
                  <span style={{ color: '#a855f7', fontWeight: 800 }}>{frequencyScore.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={0.5}
                  value={frequencyScore}
                  onChange={(e) => setFrequencyScore(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#a855f7' }}
                />
              </div>
            </div>
          </div>

          {/* Clinical Pearls & Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                Resumo Executivo & Pérolas de Sala Vermelha (Markdown):
              </label>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                Exibido no topo do leitor e nas revisões
              </span>
            </div>
            <textarea
              className="input-field"
              rows={6}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem', lineHeight: 1.6 }}
              placeholder={`### 🎯 Pérolas Clínicas
- **Red Flag**: K+ < 3.3 mEq/L contraindica início de insulina antes da reposição!
- **Conduta Imediata**: Expansão volêmica agressiva com cristaloides.
- **Droga de Escolha**: Insulina Regular 0.1 UI/kg IV.`}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>

          {/* Mark as read option */}
          {!editId && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                userSelect: 'none',
                color: '#e2e8f0',
                fontSize: '0.9rem',
              }}
            >
              <input
                type="checkbox"
                checked={markAsRead}
                onChange={(e) => setMarkAsRead(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              <span>Marcar como lido imediatamente e inicializar agendamento FSRS (+50 XP)</span>
            </label>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className="btn-secondary"
            >
              ← Voltar ao Texto Bruto
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Eye size={16} />
              Ver Preview Formatado →
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: Formatted Preview */}
      {!loadingEdit && activeTab === 'preview' && (
        <div className="glass-panel" style={{ padding: '28px', borderRadius: '18px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '20px',
                    background: 'rgba(168, 85, 247, 0.2)',
                    color: '#c084fc',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                  }}
                >
                  📘 {sourceBook || 'Livro Personalizado'}
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: '20px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                >
                  {category}
                </span>
              </div>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f8fafc' }}>
                {title || 'Capítulo Sem Título'}
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-subtle)' }}>
                {sectionTitle}
              </span>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 26px', fontSize: '1rem' }}
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {editId ? 'Salvar Alterações' : 'Salvar e Integrar ao Sistema'}
            </button>
          </div>

          {/* Clinical summary block */}
          {summary && (
            <div
              style={{
                padding: '16px 20px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 700, marginBottom: '8px', fontSize: '0.95rem' }}>
                <Sparkles size={16} />
                Pérolas Clínicas de Sala Vermelha
              </div>
              <MarkdownRenderer content={summary} />
            </div>
          )}

          {/* Content Markdown */}
          <div style={{ color: '#e2e8f0', lineHeight: 1.8, fontSize: '0.95rem' }}>
            <MarkdownRenderer content={cleanedContent || rawText} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function NovoCapituloPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', color: '#94a3b8' }}>Carregando formulário...</div>}>
      <NewChapterForm />
    </Suspense>
  );
}
