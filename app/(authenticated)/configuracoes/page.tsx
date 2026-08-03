'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Settings,
  Key,
  Cpu,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Save,
  Shield,
} from 'lucide-react';

export default function ConfiguracoesPage() {
  const supabase = createClient();

  const [openrouterKey, setOpenrouterKey] = useState<string>('');
  const [questionModel, setQuestionModel] = useState<string>('openai/gpt-5.6-luna');
  const [prescriptionModel, setPrescriptionModel] = useState<string>('openai/gpt-5.6-luna');
  const [fallbackModel, setFallbackModel] = useState<string>('nvidia/nemotron-3-ultra-550b-a55b:free');

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState<boolean>(true);
  const [loadedChapterCount, setLoadedChapterCount] = useState<number>(0);

  useEffect(() => {
    async function loadSettings() {
      setLoadingSettings(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Load user settings
        const { data: settings } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (settings) {
          if (settings.openrouter_api_key) setOpenrouterKey(settings.openrouter_api_key);
          if (settings.question_model) setQuestionModel(settings.question_model);
          if (settings.prescription_model) setPrescriptionModel(settings.prescription_model);
          if (settings.fallback_model) setFallbackModel(settings.fallback_model);
        }

        // Count loaded chapter contents
        const { count } = await supabase
          .from('chapter_contents')
          .select('*', { count: 'exact', head: true });

        if (count !== null) {
          setLoadedChapterCount(count);
        }
      }
      setLoadingSettings(false);
    }

    loadSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedSuccess(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { error: upsertErr } = await supabase.from('user_settings').upsert({
        user_id: user.id,
        openrouter_api_key: openrouterKey,
        question_model: questionModel,
        prescription_model: prescriptionModel,
        fallback_model: fallbackModel,
        updated_at: new Date().toISOString(),
      });

      if (upsertErr) throw upsertErr;

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar configurações.');
    }
  };

  const handlePdfUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile) return;

    setError(null);
    setUploading(true);
    setUploadProgress('Enviando PDF do livro completo...');

    try {
      const formData = new FormData();
      formData.append('pdf', pdfFile);

      setUploadProgress('Extraindo texto das páginas e separando capítulos por IA...');

      const res = await fetch('/api/process-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar o PDF do livro.');
      }

      setUploadProgress(`Sucesso! ${data.chaptersSaved || 122} capítulos extraídos e salvos.`);
      setLoadedChapterCount(data.chaptersSaved || 122);
    } catch (err: any) {
      setError(err.message || 'Erro ao processar PDF.');
    } finally {
      setUploading(false);
    }
  };

  if (loadingSettings) {
    return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando configurações...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '840px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc' }}>
          Configurações & Integreção de IA
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Gerencie sua chave do OpenRouter, escolha os modelos médicos e anexe o livro Medicina de Emergência.
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

      {savedSuccess && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#34d399',
        }}>
          <CheckCircle2 size={20} />
          <span>Configurações salvas com sucesso!</span>
        </div>
      )}

      {/* Form 1: API Key & Models */}
      <form onSubmit={handleSaveSettings} className="glass-panel" style={{ padding: '32px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Key size={20} color="#38bdf8" /> Chave de API & Motores OpenRouter
        </h3>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
            OpenRouter API Key (sk-or-v1-...)
          </label>
          <input
            type="password"
            className="input-field"
            placeholder="sk-or-v1-..."
            value={openrouterKey}
            onChange={(e) => setOpenrouterKey(e.target.value)}
          />
          <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Shield size={14} color="#34d399" />
            <span>Sua chave é armazenada de forma segura na sua conta. Caso deixe em branco, a chave de ambiente será utilizada.</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Modelo para Geração de Questões
            </label>
            <select
              className="input-field"
              value={questionModel}
              onChange={(e) => setQuestionModel(e.target.value)}
              style={{ background: 'rgba(15, 23, 42, 0.8)' }}
            >
              <optgroup label="🥇 Líderes em Saúde & Raciocínio Médio/Alto">
                <option value="openai/gpt-5.6-luna">OpenAI GPT-5.6 Luna ($0.10/1M - 🥇 #1 em Saúde)</option>
                <option value="z-ai/glm-5.2">Z.ai GLM 5.2 ($0.27/1M - 🏥 #3 em Saúde, #4 Academia)</option>
                <option value="deepseek/deepseek-v4-pro">DeepSeek V4 Pro ($0.43/1M - 🏥 #9 em Saúde, 1.6T MoE)</option>
                <option value="xiaomi/mimo-v2.5-pro">Xiaomi MiMo-V2.5-Pro ($0.34/1M - Agentic Pro)</option>
              </optgroup>
              <optgroup label="⚡ Alta Eficiência & Baixo Custo (Sub-0.20/1M)">
                <option value="deepseek/deepseek-v4-flash-0731">DeepSeek V4 Flash 0731 ($0.09/1M - Ultra Rápido MoE)</option>
                <option value="xiaomi/mimo-v2.5">Xiaomi MiMo-V2.5 ($0.11/1M - 🏥 #12 em Saúde)</option>
                <option value="tencent/hy3-preview">Tencent Hy3 Preview ($0.06/1M - ⚡ MoE Ultra Barato)</option>
                <option value="inclusionai/ring-2.6-1t">inclusionAI Ring-2.6-1T ($0.075/1M - 1T Thinking MoE)</option>
                <option value="qwen/qwen3.6-35b-a3b">Qwen 3.6 35B A3B ($0.10/1M - 🧠 Thinking Mode)</option>
                <option value="qwen/qwen3.7-plus">Qwen 3.7 Plus ($0.32/1M - Multi-Modal Agent)</option>
                <option value="stepfun/step-3.7-flash">StepFun Step 3.7 Flash ($0.20/1M - Fast MoE)</option>
                <option value="google/gemma-4-31b-it">Google Gemma 4 31B ($0.09/1M - 🏥 #17 em Saúde)</option>
                <option value="openai/gpt-5.4-nano">OpenAI GPT-5.4 Nano ($0.20/1M - Low Latency)</option>
                <option value="minimax/minimax-m3">MiniMax M3 ($0.24/1M - 🏥 #16 em Saúde, 1M Contexto)</option>
              </optgroup>
              <optgroup label="🎁 100% Gratuitos (Free Tier OpenRouter)">
                <option value="nvidia/nemotron-3-ultra-550b-a55b:free">NVIDIA Nemotron 3 Ultra (🎁 GRÁTIS - 550B MoE)</option>
                <option value="google/gemma-4-31b-it:free">Google Gemma 4 31B (🎁 GRÁTIS - DeepMind)</option>
                <option value="google/gemma-4-26b-a4b-it:free">Google Gemma 4 26B (🎁 GRÁTIS - MoE 3.8B Ativo)</option>
              </optgroup>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Modelo para Avaliação de Prescrições
            </label>
            <select
              className="input-field"
              value={prescriptionModel}
              onChange={(e) => setPrescriptionModel(e.target.value)}
              style={{ background: 'rgba(15, 23, 42, 0.8)' }}
            >
              <optgroup label="🥇 Líderes em Saúde & Raciocínio Médio/Alto">
                <option value="openai/gpt-5.6-luna">OpenAI GPT-5.6 Luna ($0.10/1M - 🥇 #1 em Saúde)</option>
                <option value="z-ai/glm-5.2">Z.ai GLM 5.2 ($0.27/1M - 🏥 #3 em Saúde, #4 Academia)</option>
                <option value="deepseek/deepseek-v4-pro">DeepSeek V4 Pro ($0.43/1M - 🏥 #9 em Saúde, 1.6T MoE)</option>
                <option value="xiaomi/mimo-v2.5-pro">Xiaomi MiMo-V2.5-Pro ($0.34/1M - Agentic Pro)</option>
              </optgroup>
              <optgroup label="⚡ Alta Eficiência & Baixo Custo (Sub-0.20/1M)">
                <option value="deepseek/deepseek-v4-flash-0731">DeepSeek V4 Flash 0731 ($0.09/1M - Ultra Rápido MoE)</option>
                <option value="xiaomi/mimo-v2.5">Xiaomi MiMo-V2.5 ($0.11/1M - 🏥 #12 em Saúde)</option>
                <option value="tencent/hy3-preview">Tencent Hy3 Preview ($0.06/1M - ⚡ MoE Ultra Barato)</option>
                <option value="inclusionai/ring-2.6-1t">inclusionAI Ring-2.6-1T ($0.075/1M - 1T Thinking MoE)</option>
                <option value="qwen/qwen3.6-35b-a3b">Qwen 3.6 35B A3B ($0.10/1M - 🧠 Thinking Mode)</option>
                <option value="google/gemma-4-31b-it">Google Gemma 4 31B ($0.09/1M - 🏥 #17 em Saúde)</option>
                <option value="minimax/minimax-m3">MiniMax M3 ($0.24/1M - 🏥 #16 em Saúde, 1M Contexto)</option>
              </optgroup>
              <optgroup label="🎁 100% Gratuitos (Free Tier OpenRouter)">
                <option value="nvidia/nemotron-3-ultra-550b-a55b:free">NVIDIA Nemotron 3 Ultra (🎁 GRÁTIS - 550B MoE)</option>
                <option value="google/gemma-4-31b-it:free">Google Gemma 4 31B (🎁 GRÁTIS - DeepMind)</option>
                <option value="google/gemma-4-26b-a4b-it:free">Google Gemma 4 26B (🎁 GRÁTIS - MoE 3.8B Ativo)</option>
              </optgroup>
            </select>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
            Modelo de Fallback (Reserva de Segurança)
          </label>
          <select
            className="input-field"
            value={fallbackModel}
            onChange={(e) => setFallbackModel(e.target.value)}
            style={{ background: 'rgba(15, 23, 42, 0.8)' }}
          >
            <option value="nvidia/nemotron-3-ultra-550b-a55b:free">NVIDIA Nemotron 3 Ultra (🎁 GRÁTIS - Recomendado)</option>
            <option value="google/gemma-4-31b-it:free">Google Gemma 4 31B (🎁 GRÁTIS)</option>
            <option value="google/gemma-4-26b-a4b-it:free">Google Gemma 4 26B (🎁 GRÁTIS)</option>
            <option value="tencent/hy3-preview">Tencent Hy3 Preview ($0.06/1M)</option>
            <option value="openai/gpt-5.6-luna">OpenAI GPT-5.6 Luna ($0.10/1M)</option>
          </select>
        </div>

        {/* Visual Cheat Sheet Box */}
        <div style={{
          background: 'rgba(14, 165, 233, 0.06)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: '14px',
          padding: '16px 20px',
          fontSize: '0.83rem',
          lineHeight: '1.5',
        }}>
          <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={16} /> 💡 Guia Estratégico de Perfis Médicos (OpenRouter 2026):
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px 12px', borderRadius: '10px', borderLeft: '3px solid #34d399' }}>
              <div style={{ fontWeight: 700, color: '#34d399' }}>🎁 Perfil Custo Zero</div>
              <div style={{ color: 'var(--text-muted)' }}>Questões: <strong>Nemotron 3 Ultra</strong></div>
              <div style={{ color: 'var(--text-muted)' }}>Avaliação: <strong>Gemma 4 31B Free</strong></div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '4px' }}>Custo: $0,00 / mês</div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px 12px', borderRadius: '10px', borderLeft: '3px solid #38bdf8' }}>
              <div style={{ fontWeight: 700, color: '#38bdf8' }}>🥇 Campeão Médico #1</div>
              <div style={{ color: 'var(--text-muted)' }}>Questões: <strong>GPT-5.6 Luna</strong> (#1 Saúde)</div>
              <div style={{ color: 'var(--text-muted)' }}>Avaliação: <strong>GPT-5.6 Luna</strong> / <strong>MiMo-V2.5</strong></div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '4px' }}>~$0,05 por 100 simulados</div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px 12px', borderRadius: '10px', borderLeft: '3px solid #fb923c' }}>
              <div style={{ fontWeight: 700, color: '#fb923c' }}>⚡ Ultra Econômico</div>
              <div style={{ color: 'var(--text-muted)' }}>Questões: <strong>DeepSeek V4 Flash</strong> / <strong>Tencent Hy3</strong></div>
              <div style={{ color: 'var(--text-muted)' }}>Avaliação: <strong>Ring-2.6-1T</strong> / <strong>V4 Flash</strong></div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '4px' }}>Menos de $0,02 por 100 simulados</div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '10px 12px', borderRadius: '10px', borderLeft: '3px solid #a855f7' }}>
              <div style={{ fontWeight: 700, color: '#c084fc' }}>💎 Preceptor Elite (R3)</div>
              <div style={{ color: 'var(--text-muted)' }}>Questões: <strong>GPT-5.6 Luna</strong></div>
              <div style={{ color: 'var(--text-muted)' }}>Avaliação: <strong>Z.ai GLM 5.2</strong> (#3 Saúde) / <strong>V4 Pro</strong></div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '4px' }}>Raciocínio de preceptor sênior</div>
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start', padding: '12px 24px' }}>
          <Save size={18} /> Salvar Preferências de IA
        </button>
      </form>

      {/* Form 2: PDF Upload & Book Indexing */}
      <form onSubmit={handlePdfUpload} className="glass-panel" style={{ padding: '32px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UploadCloud size={20} color="#34d399" /> Livro Medicina de Emergência (PDF)
          </h3>
          <span style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '4px 12px', borderRadius: '9999px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            {loadedChapterCount} de 122 capítulos indexados no banco
          </span>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Faça upload do arquivo PDF único do livro completo. O sistema extrairá automaticamente os textos e organizará por capítulo para servir como base factual de alta precisão nas questões e prescrições.
        </p>

        {/* Local Script Instruction Box */}
        <div style={{
          background: 'rgba(16, 185, 129, 0.05)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '12px',
          padding: '16px',
          fontSize: '0.85rem',
          color: '#e2e8f0',
          lineHeight: '1.5',
        }}>
          <div style={{ fontWeight: 700, color: '#34d399', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} /> 🚀 Dica de Alta Performance (Indexação Local por Script):
          </div>
          <div>
            Para livros em PDF muito grandes (100MB+), você pode rodar o comando local de 1 clique no terminal (com suporte a rotação de IAs gratuitas e início na <strong>página 166</strong>):
          </div>
          <code style={{
            display: 'block',
            background: '#090d16',
            color: '#34d399',
            padding: '10px 14px',
            borderRadius: '8px',
            marginTop: '8px',
            fontFamily: 'monospace',
            fontSize: '0.82rem',
            border: '1px solid var(--border-subtle)',
          }}>
            npm run index-pdf -- --file="./seu_livro.pdf" --start-page=166
          </code>
        </div>

        <div style={{
          border: '2px dashed var(--border-subtle)',
          borderRadius: '16px',
          padding: '36px',
          textAlign: 'center',
          background: 'rgba(15, 23, 42, 0.4)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}>
          <input
            type="file"
            accept=".pdf"
            id="pdf-input"
            style={{ display: 'none' }}
            onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
          />
          <label htmlFor="pdf-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <FileText size={40} color={pdfFile ? '#34d399' : '#38bdf8'} />
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                {pdfFile ? pdfFile.name : 'Clique para selecionar o PDF do Livro'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginTop: '4px' }}>
                {pdfFile ? `${(pdfFile.size / (1024 * 1024)).toFixed(1)} MB selecionados` : 'Suporta arquivos PDF de qualquer tamanho'}
              </div>
            </div>
          </label>
        </div>

        {uploading && (
          <div style={{
            background: 'rgba(14, 165, 233, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '12px',
            padding: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#38bdf8',
            fontSize: '0.9rem',
          }}>
            <Loader2 size={20} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            <span>{uploadProgress}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!pdfFile || uploading}
          className="btn-primary"
          style={{ alignSelf: 'flex-start', padding: '12px 24px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
        >
          <UploadCloud size={18} /> Processar & Indexar Capítulos do PDF
        </button>
      </form>
    </div>
  );
}
