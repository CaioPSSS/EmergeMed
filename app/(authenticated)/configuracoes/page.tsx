'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Settings,
  Key,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Shield,
  Database,
  DollarSign,
  Activity,
  Layers,
  RefreshCw,
  BarChart3,
  Clock,
  Sparkles,
} from 'lucide-react';
import { AI_TASK_PROFILES } from '@/lib/ai/model-router';

interface BatchLedgerEntry {
  id: string;
  batch_id: string;
  submission_timestamp: string;
  completion_timestamp: string | null;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  daily_accumulated_usd: number;
  monthly_accumulated_usd: number;
  hard_cap_interrupted: boolean;
  items_requested: number;
  items_ingested: number;
  items_failed: number;
  status: string;
}

export default function ConfiguracoesPage() {
  const supabase = createClient();

  const [openrouterKey, setOpenrouterKey] = useState<string>('');
  const [questionModel, setQuestionModel] = useState<string>('openai/gpt-6-luna');
  const [prescriptionModel, setPrescriptionModel] = useState<string>('openai/gpt-6-luna');
  const [fallbackModel, setFallbackModel] = useState<string>('deepseek/deepseek-v4.1-flash');

  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Statistics State
  const [bedBankCount, setBedBankCount] = useState<number>(0);
  const [questionBankCount, setQuestionBankCount] = useState<number>(0);
  const [studyQueueCount, setStudyQueueCount] = useState<number>(0);
  const [userQuestionCount, setUserQuestionCount] = useState<number>(0);
  const [userCorrectCount, setUserCorrectCount] = useState<number>(0);

  // Batch Governance State
  const [ledgerEntries, setLedgerEntries] = useState<BatchLedgerEntry[]>([]);
  const [dailySpent, setDailySpent] = useState<number>(0);
  const [monthlySpent, setMonthlySpent] = useState<number>(0);
  const [isHardCapReached, setIsHardCapReached] = useState<boolean>(false);
  const [refreshingStats, setRefreshingStats] = useState<boolean>(false);

  const DAILY_HARD_CAP = 0.15;
  const MONTHLY_HARD_CAP = 0.90;

  async function loadData() {
    setLoadingSettings(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // 1. User Settings
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

        // 2. Bed Case Bank Count
        const { count: bedsCount } = await supabase
          .from('bed_case_bank')
          .select('*', { count: 'exact', head: true });
        if (bedsCount !== null) setBedBankCount(bedsCount);

        // 3. Question Bank Count
        const { count: questionsCount } = await supabase
          .from('question_bank')
          .select('*', { count: 'exact', head: true });
        if (questionsCount !== null) setQuestionBankCount(questionsCount);

        // 4. User Study Queue Count
        const { count: queueCount } = await supabase
          .from('study_queue')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        if (queueCount !== null) setStudyQueueCount(queueCount);

        // 5. User Question History
        const { data: qHistory } = await supabase
          .from('user_question_history')
          .select('last_is_correct')
          .eq('user_id', user.id);
        if (qHistory) {
          setUserQuestionCount(qHistory.length);
          setUserCorrectCount(qHistory.filter((q) => q.last_is_correct).length);
        }

        // 6. Batch Ledger & Budget
        const { data: ledger } = await supabase
          .from('batch_generation_ledger')
          .select('*')
          .order('submission_timestamp', { ascending: false })
          .limit(10);

        if (ledger && ledger.length > 0) {
          setLedgerEntries(ledger as BatchLedgerEntry[]);

          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);

          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);

          let dayTotal = 0;
          let monthTotal = 0;
          let capFlag = false;

          ledger.forEach((item) => {
            const itemTime = new Date(item.submission_timestamp);
            const cost = Number(item.cost_usd || 0);

            if (itemTime >= startOfMonth) {
              monthTotal += cost;
            }
            if (itemTime >= startOfDay) {
              dayTotal += cost;
            }
            if (item.hard_cap_interrupted) {
              capFlag = true;
            }
          });

          setDailySpent(dayTotal);
          setMonthlySpent(monthTotal);
          setIsHardCapReached(capFlag || dayTotal >= DAILY_HARD_CAP || monthTotal >= MONTHLY_HARD_CAP);
        }
      }
    } catch (err: any) {
      console.error('Error loading configuracoes data:', err);
    } finally {
      setLoadingSettings(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleRefreshStats = async () => {
    setRefreshingStats(true);
    await loadData();
    setRefreshingStats(false);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedSuccess(false);
    setSavingSettings(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Sessão expirada. Por favor, recarregue a página ou faça login novamente.');
      }

      const { error: upsertErr } = await supabase.from('user_settings').upsert(
        {
          user_id: user.id,
          openrouter_api_key: openrouterKey,
          question_model: questionModel,
          prescription_model: prescriptionModel,
          fallback_model: fallbackModel,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (upsertErr) throw upsertErr;

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar configurações.');
    } finally {
      setSavingSettings(false);
    }
  };

  if (loadingSettings) {
    return (
      <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <Loader2 size={28} className="spin" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
        <p>Carregando configurações de IA e estatísticas do sistema...</p>
      </div>
    );
  }

  const dailyPercent = Math.min(100, Math.round((dailySpent / DAILY_HARD_CAP) * 100));
  const monthlyPercent = Math.min(100, Math.round((monthlySpent / MONTHLY_HARD_CAP) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '960px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Cpu size={28} color="#38bdf8" />
            Configurações & Governança de IA
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '4px' }}>
            Gerencie sua chave do OpenRouter, visualize a governança orçamentária do modo Batch e as métricas do acervo pré-gerado.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshStats}
          disabled={refreshingStats}
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem' }}
          title="Recarregar estatísticas do banco"
        >
          <RefreshCw size={14} className={refreshingStats ? 'spin' : ''} style={refreshingStats ? { animation: 'spin 1s linear infinite' } : {}} />
          <span>Atualizar Métricas</span>
        </button>
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
          <span>Configurações salvas com sucesso! As cascatas de IA aplicarão suas preferências.</span>
        </div>
      )}

      {/* Grid: Stat Cards (Batch Budget & Content Repository) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {/* Daily Batch Spend */}
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', borderLeft: '4px solid #38bdf8' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '8px' }}>
            <span>Gasto Diário (Batch)</span>
            <DollarSign size={16} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc' }}>
            ${dailySpent.toFixed(4)} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-subtle)' }}>/ ${DAILY_HARD_CAP.toFixed(2)}</span>
          </div>
          <div style={{ marginTop: '10px', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
            <div style={{ width: `${dailyPercent}%`, height: '100%', background: dailyPercent > 80 ? '#f43f5e' : '#38bdf8', transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginTop: '6px' }}>
            {dailyPercent}% do teto diário consumido
          </div>
        </div>

        {/* Monthly Batch Spend */}
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', borderLeft: '4px solid #a855f7' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '8px' }}>
            <span>Gasto Mensal (Batch)</span>
            <BarChart3 size={16} color="#a855f7" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc' }}>
            ${monthlySpent.toFixed(4)} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-subtle)' }}>/ ${MONTHLY_HARD_CAP.toFixed(2)}</span>
          </div>
          <div style={{ marginTop: '10px', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '9999px', overflow: 'hidden' }}>
            <div style={{ width: `${monthlyPercent}%`, height: '100%', background: monthlyPercent > 80 ? '#f43f5e' : '#a855f7', transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginTop: '6px' }}>
            {monthlyPercent}% do teto mensal (~R$ 5,00/mês)
          </div>
        </div>

        {/* Bed Case Bank */}
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '8px' }}>
            <span>Banco de Leitos (Plantão)</span>
            <Layers size={16} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc' }}>
            {bedBankCount} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-subtle)' }}>leitos</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginTop: '16px' }}>
            Casos de 2 estágios (meta: até 6/capítulo)
          </div>
        </div>

        {/* Question Bank */}
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '8px' }}>
            <span>Banco de MCQs (60/40)</span>
            <Database size={16} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc' }}>
            {questionBankCount} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-subtle)' }}>questões</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginTop: '16px' }}>
            Respondidas: {userQuestionCount} (Acertos: {userCorrectCount})
          </div>
        </div>
      </div>

      {/* Form 1: API Key & Model Configuration */}
      <form onSubmit={handleSaveSettings} className="glass-panel" style={{ padding: '32px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Key size={20} color="#38bdf8" /> Chave OpenRouter & Motores Médicos
          </h3>
          <span style={{ fontSize: '0.76rem', color: '#38bdf8', background: 'rgba(14, 165, 233, 0.12)', padding: '4px 10px', borderRadius: '9999px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            Geração Setembro/Outubro 2026
          </span>
        </div>

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
            <span>Sua chave é armazenada de forma segura na sua conta. Caso deixe em branco, a chave institucional do ambiente (.env.local) será utilizada.</span>
          </div>
        </div>

        {/* Model Selectors Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Raciocínio Clínico & Geração (CLINICAL_CORE)
            </label>
            <select
              className="input-field"
              value={questionModel}
              onChange={(e) => setQuestionModel(e.target.value)}
              style={{ background: 'rgba(15, 23, 42, 0.8)' }}
            >
              <optgroup label="⭐ Modelos Oficiais Aprovados">
                <option value="openai/gpt-6-luna">OpenAI GPT-6 Luna ($0.10/1M - 🥇 Padrão Ouro Clínico)</option>
                <option value="deepseek/deepseek-v4.1-flash">DeepSeek V4.1 Flash ($0.0336/1M - ⚡ CED Architecture)</option>
                <option value="deepseek/deepseek-v4-flash-0731">DeepSeek V4 Flash 0731 ($0.0128/1M - Fallback Rápido)</option>
              </optgroup>
            </select>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginTop: '4px' }}>
              Utilizado na geração de casos de leito, testes de 10 MCQs e cenários de plantão.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Avaliação de Prescrições (CLINICAL_EVALUATION)
            </label>
            <select
              className="input-field"
              value={prescriptionModel}
              onChange={(e) => setPrescriptionModel(e.target.value)}
              style={{ background: 'rgba(15, 23, 42, 0.8)' }}
            >
              <optgroup label="⭐ Modelos Oficiais Aprovados">
                <option value="openai/gpt-6-luna">OpenAI GPT-6 Luna ($0.10/1M - 🥇 Avaliação Rigorosa UPA)</option>
                <option value="deepseek/deepseek-v4.1-flash">DeepSeek V4.1 Flash ($0.0336/1M - #1 Saúde OpenRouter)</option>
                <option value="deepseek/deepseek-v4-pro-0813">DeepSeek V4 Pro 0813 ($0.2495/1M - 1.6T MoE Audit)</option>
              </optgroup>
            </select>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginTop: '4px' }}>
              Utilizado na atribuição de notas (0-10), detecção de erros posológicos e condutas ideais.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Modelo de Contingência / Fallback
            </label>
            <select
              className="input-field"
              value={fallbackModel}
              onChange={(e) => setFallbackModel(e.target.value)}
              style={{ background: 'rgba(15, 23, 42, 0.8)' }}
            >
              <optgroup label="⭐ Modelos Oficiais Aprovados">
                <option value="deepseek/deepseek-v4.1-flash">DeepSeek V4.1 Flash ($0.0336/1M - Resiliente)</option>
                <option value="openai/gpt-6-luna">OpenAI GPT-6 Luna ($0.10/1M - Backup Raciocínio)</option>
                <option value="xiaomi/mimo-v2.6-flash">Xiaomi MiMo-V2.6 Flash ($0.10/1M - Velocidade Pura)</option>
              </optgroup>
            </select>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginTop: '4px' }}>
              Acionado automaticamente caso o modelo primário atinja timeout ou cota.
            </div>
          </div>
        </div>

        {/* Summary Card of Task Profiles Active in Code */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.06) 0%, rgba(99, 102, 241, 0.06) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          borderRadius: '16px',
          padding: '20px',
          fontSize: '0.84rem',
        }}>
          <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} />
            Mapeamento dos Perfis Oficiais em Produção (lib/ai/model-router.ts):
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '10px', borderLeft: '3px solid #38bdf8' }}>
              <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.82rem' }}>CLINICAL_CORE</div>
              <div style={{ color: 'var(--text-subtle)', fontSize: '0.76rem', marginTop: '2px' }}>Primário: <strong>openai/gpt-6-luna</strong></div>
              <div style={{ color: 'var(--text-subtle)', fontSize: '0.76rem' }}>Fallback: deepseek-v4.1-flash</div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '10px', borderLeft: '3px solid #10b981' }}>
              <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.82rem' }}>CLINICAL_EVALUATION</div>
              <div style={{ color: 'var(--text-subtle)', fontSize: '0.76rem', marginTop: '2px' }}>Primário: <strong>openai/gpt-6-luna</strong></div>
              <div style={{ color: 'var(--text-subtle)', fontSize: '0.76rem' }}>Fallback: deepseek-v4.1-flash / pro</div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '10px', borderLeft: '3px solid #a855f7' }}>
              <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.82rem' }}>CLINICAL_FEEDBACK</div>
              <div style={{ color: 'var(--text-subtle)', fontSize: '0.76rem', marginTop: '2px' }}>Primário: <strong>deepseek/deepseek-v4.1-flash</strong></div>
              <div style={{ color: 'var(--text-subtle)', fontSize: '0.76rem' }}>Fallback: openai/gpt-6-luna</div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: '10px', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.82rem' }}>PRESCRIPTION_FAST_FORMAT</div>
              <div style={{ color: 'var(--text-subtle)', fontSize: '0.76rem', marginTop: '2px' }}>Primário: <strong>xiaomi/mimo-v2.6-flash (~1,8s)</strong></div>
              <div style={{ color: 'var(--text-subtle)', fontSize: '0.76rem' }}>Fallback: openai/gpt-6-luna</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={savingSettings}
            className="btn-primary"
            style={{ padding: '12px 24px' }}
          >
            {savingSettings ? (
              <>
                <Loader2 size={18} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> Salvando...
              </>
            ) : (
              <>
                <Save size={18} /> Salvar Preferências de IA
              </>
            )}
          </button>
        </div>
      </form>

      {/* Section 2: Batch Generation Ledger & Recent Batches */}
      <div className="glass-panel" style={{ padding: '32px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Clock size={20} color="#a855f7" /> Histórico de Lotes Assíncronos (OpenRouter Batch API)
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px' }}>
              Execuções noturnas com o modelo <code>openai/gpt-6-luna:batch</code> ($0.05 / $0.25 por 1M tokens — 50% off).
            </p>
          </div>

          {isHardCapReached && (
            <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#fda4af', background: 'rgba(244, 63, 94, 0.15)', padding: '6px 12px', borderRadius: '9999px', border: '1px solid rgba(244, 63, 94, 0.4)' }}>
              ⚠️ Hard Cap Atingido
            </span>
          )}
        </div>

        {ledgerEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-subtle)', fontSize: '0.88rem' }}>
            Nenhum lote noturno registrado no ledger até o momento. As execuções do script <code>nightly-batch-pipeline.ts</code> serão registradas aqui automaticamente.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 12px' }}>Batch ID</th>
                  <th style={{ padding: '10px 12px' }}>Data / Envio</th>
                  <th style={{ padding: '10px 12px' }}>Tokens (In / Out)</th>
                  <th style={{ padding: '10px 12px' }}>Custo (USD)</th>
                  <th style={{ padding: '10px 12px' }}>Itens (Req / Ingeridos)</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.map((batch) => {
                  const isCompleted = batch.status === 'completed';
                  const isCapped = batch.status === 'capped' || batch.hard_cap_interrupted;
                  const isFailed = batch.status === 'failed';

                  return (
                    <tr key={batch.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#38bdf8' }}>
                        {batch.batch_id.slice(0, 16)}...
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-subtle)' }}>
                        {new Date(batch.submission_timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>
                        {(batch.prompt_tokens || 0).toLocaleString()} / {(batch.completion_tokens || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#34d399' }}>
                        ${Number(batch.cost_usd || 0).toFixed(4)}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>
                        {batch.items_requested || 0} / <strong style={{ color: '#34d399' }}>{batch.items_ingested || 0}</strong>
                        {batch.items_failed > 0 && <span style={{ color: '#fda4af' }}> ({batch.items_failed} falhas)</span>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          background: isCompleted ? 'rgba(16, 185, 129, 0.15)' : isCapped ? 'rgba(245, 158, 11, 0.15)' : isFailed ? 'rgba(244, 63, 94, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                          color: isCompleted ? '#34d399' : isCapped ? '#fbbf24' : isFailed ? '#fda4af' : '#38bdf8',
                        }}>
                          {batch.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
