/**
 * AI Model Router and Task Profiles for EmergeMed
 * 
 * Optimized for OpenRouter models (September 2026 generation):
 * - openai/gpt-6-luna ($0.10 in / $0.50 out): Primary clinical reasoning, question generation, and rigorous medical evaluation.
 * - deepseek/deepseek-v4.1-flash ($0.0336 in / $1.188 out): #1 Health/Academia on OpenRouter, long book chapter analysis and preceptorship feedbacks.
 * - xiaomi/mimo-v2.6-flash ($0.10 in / $0.28 out): Ultra-fast extraction, chapter parsing, and high-efficiency formatting.
 * - deepseek/deepseek-v4-flash-0731: High-speed clinical fallback.
 */

export const AI_TASK_PROFILES = {
  // Geração de casos e testes: alta fidelidade JSON e farmacologia precisa da UPA
  CLINICAL_CORE: [
    'openai/gpt-6-luna',
    'deepseek/deepseek-v4.1-flash',
    'deepseek/deepseek-v4-flash-0731',
    'minimax/minimax-m3',
  ],

  // Avaliação de condutas, prescrições e sequenciamento de leitos
  CLINICAL_EVALUATION: [
    'openai/gpt-6-luna',
    'deepseek/deepseek-v4.1-flash',
    'deepseek/deepseek-v4-pro-0813',
    'deepseek/deepseek-v4-flash-0731',
  ],

  // Preceptoria geral e passagem de plantão da sala vermelha (Markdown longo com livro)
  CLINICAL_FEEDBACK: [
    'deepseek/deepseek-v4.1-flash',
    'openai/gpt-6-luna',
    'deepseek/deepseek-v4-flash-0731',
  ],

  // Extração e estruturação de capítulos de PDF / texto bruto
  DOCUMENT_EXTRACTION: [
    'xiaomi/mimo-v2.6-flash',
    'deepseek/deepseek-v4.1-flash',
    'openai/gpt-6-luna',
  ],

  // Formatação rápida e padronização de prescrição ditada por voz
  PRESCRIPTION_FAST_FORMAT: [
    'deepseek/deepseek-v4.1-flash',
    'xiaomi/mimo-v2.6-flash',
    'openai/gpt-6-luna',
    'deepseek/deepseek-v4-flash-0731',
  ],
} as const;

export type AITaskProfileKey = keyof typeof AI_TASK_PROFILES;

/**
 * Returns the cascade of models to try for a given task,
 * placing any user-selected model first if provided.
 */
export function getModelCascade(profile: AITaskProfileKey, userPreferredModel?: string): string[] {
  const profileModels = AI_TASK_PROFILES[profile] || AI_TASK_PROFILES.CLINICAL_CORE;
  if (!userPreferredModel) {
    return [...profileModels];
  }
  // Put user preferred model first, followed by profile defaults without duplicates
  return Array.from(new Set([userPreferredModel, ...profileModels]));
}
