import OpenAI from 'openai';
import { fixMojibake } from '@/lib/text-sanitizer';
import {
  SYSTEM_PROMPT_QUESTION_GENERATOR,
  SYSTEM_PROMPT_PRESCRIPTION_EVALUATOR,
  SYSTEM_PROMPT_PLANTAO_GENERATOR,
  SYSTEM_PROMPT_ADVERSE_EVOLUTION,
  SYSTEM_PROMPT_GENERAL_FEEDBACK,
  SYSTEM_PROMPT_PLANTAO_FEEDBACK,
  SYSTEM_PROMPT_CUSTOM_CHAPTER_ANALYZER,
  SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR,
} from './prompts';

export interface CustomChapterAnalysisResult {
  title: string;
  sourceBook: string;
  sectionTitle: string;
  category: string;
  summary: string;
  cleanedContent: string;
  frequencyScore: number;
  importanceScore: number;
}

export interface QuestionOption {
  text: string;
}

export interface QuestionItem {
  id: number;
  type: 'multiple_choice' | 'prescription_complete' | 'prescription_immediate' | 'ventilator';
  chapterId: number;
  chapterTitle: string;
  vignette: string;
  // Multiple choice fields
  options?: string[];
  correctOption?: number; // 0-indexed: 0=A, 1=B, 2=C, 3=D, 4=E
  explanation?: string;
  // Prescription fields (complete + immediate)
  promptText?: string;
  idealPrescription?: string;
  evaluationCriteria?: string[];
  // Ventilator fields
  ventilatorFields?: Record<string, string>;
  idealVentilator?: Record<string, string>;
  // Patient data (extracted for drug math validation)
  patientWeight?: number;
}

export interface PrescriptionEvaluation {
  score: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  detailedFeedback: string;
  idealPrescription: string;
  errorTags?: Array<{
    competency: 'farmacologia' | 'diagnostico' | 'conduta' | 'ventilacao' | 'prescricao_geral';
    severity: 'critico' | 'moderado' | 'leve';
    description: string;
  }>;
}

export { fixMojibake };

/**
 * Helper function to safely extract and parse JSON from AI model outputs wrapped in markdown codeblocks,
 * preambles, or postscript text.
 */
export function parseJsonFromMarkdown<T = any>(text: string): T {
  if (!text) {
    throw new Error('Resposta de texto da IA está vazia');
  }

  let cleaned = text.trim();

  // 1. Extract content inside markdown codeblock (```json ... ``` or ``` ... ```) if present anywhere in text
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const candidate = codeBlockMatch[1].trim();
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // If direct parse of codeblock failed, use candidate string for further bracket searching
      cleaned = candidate;
    }
  } else {
    // Strip leading/trailing codeblock markers if partial
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  // 2. Try direct JSON parse on cleaned text
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Proceed to bracket extraction
  }

  // 3. Extract JSON object or array payload if surrounded by preamble or trailing text
  const firstBracket = cleaned.search(/[\[\{]/);
  const lastBracket = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));

  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const sliced = cleaned.slice(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(sliced) as T;
    } catch {
      // If initial bracket slice failed (e.g., preamble or postscript had curly braces),
      // scan candidate bracket positions for valid JSON.
      for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];
        if (char === '{' || char === '[') {
          const closingChar = char === '{' ? '}' : ']';
          let endIdx = cleaned.lastIndexOf(closingChar);
          while (endIdx > i) {
            const candidate = cleaned.slice(i, endIdx + 1);
            try {
              return JSON.parse(candidate) as T;
            } catch {
              endIdx = cleaned.lastIndexOf(closingChar, endIdx - 1);
            }
          }
        }
      }
    }
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (err: any) {
    console.error('[OpenRouter JSON Parse Error] Conteúdo bruto:', text, err);
    throw new Error(`Falha ao converter resposta da IA em JSON válido: ${err.message}`);
  }
}

/**
 * Normalizes question objects returned by AI models to handle format variations
 * (e.g. options as object {A:..., B:...} vs array, correct_answer string "B" vs correctOption index 1).
 */
export function normalizeQuestionItem(q: any): QuestionItem {
  if (!q || typeof q !== 'object') return q;

  // 1. Sanitize vignette / question text
  if (q.vignette) q.vignette = fixMojibake(String(q.vignette));
  else if (q.question) q.vignette = fixMojibake(String(q.question));

  if (q.explanation) q.explanation = fixMojibake(String(q.explanation));
  if (q.promptText) q.promptText = fixMojibake(String(q.promptText));
  if (q.idealPrescription) q.idealPrescription = fixMojibake(String(q.idealPrescription));

  // 2. Normalize legacy 'prescription' type to 'prescription_complete'
  if ((q as any).type === 'prescription') {
    (q as any).type = 'prescription_complete';
  }

  // 3. Normalize options to string[]
  if (q.options) {
    if (Array.isArray(q.options)) {
      q.options = q.options.map((opt: any) => {
        if (typeof opt === 'string') {
          return fixMojibake(opt).replace(/^[A-E][\.\)]\s*/i, '');
        } else if (opt && typeof opt === 'object') {
          const textVal = opt.text || opt.label || Object.values(opt)[0] || String(opt);
          return fixMojibake(String(textVal)).replace(/^[A-E][\.\)]\s*/i, '');
        }
        return String(opt);
      });
    } else if (typeof q.options === 'object') {
      const keys = Object.keys(q.options).sort();
      q.options = keys.map((key) => {
        const val = q.options[key];
        return fixMojibake(String(val)).replace(/^[A-E][\.\)]\s*/i, '');
      });
    }
  }

  // 4. Normalize correctOption to 0-indexed number (0=A, 1=B, 2=C, 3=D, 4=E)
  let rawCorrect = q.correctOption !== undefined ? q.correctOption : (q.correct_answer !== undefined ? q.correct_answer : q.correctAnswer);

  if (typeof rawCorrect === 'string') {
    const trimmed = rawCorrect.trim().toUpperCase();
    if (trimmed === 'A') q.correctOption = 0;
    else if (trimmed === 'B') q.correctOption = 1;
    else if (trimmed === 'C') q.correctOption = 2;
    else if (trimmed === 'D') q.correctOption = 3;
    else if (trimmed === 'E') q.correctOption = 4;
    else {
      const parsedNum = parseInt(trimmed, 10);
      if (!isNaN(parsedNum)) q.correctOption = parsedNum;
    }
  } else if (typeof rawCorrect === 'number') {
    q.correctOption = rawCorrect;
  }

  // 5. Extract patientWeight if present
  if (q.patientWeight !== undefined) {
    q.patientWeight = Number(q.patientWeight) || undefined;
  } else if (q.patient_weight !== undefined) {
    q.patientWeight = Number(q.patient_weight) || undefined;
  } else if (q.weight !== undefined) {
    q.patientWeight = Number(q.weight) || undefined;
  }

  return q as QuestionItem;
}

/**
 * Helper function for executing AI calls with exponential backoff retries per model
 * and multi-model fallback cascade across candidate models.
 */
export async function executeWithModelCascade<T>(
  models: string[],
  fn: (model: string) => Promise<T>,
  options: { maxRetriesPerModel?: number; initialDelayMs?: number } = {}
): Promise<T> {
  const maxRetries = options.maxRetriesPerModel ?? 1;
  const initialDelay = options.initialDelayMs ?? 400;

  // Filter out empty or duplicate model names
  const modelList = Array.from(new Set(models.filter(Boolean)));
  let lastError: any = null;

  for (const model of modelList) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(model);
      } catch (err: any) {
        lastError = err;
        console.warn(`[OpenRouter Cascade] Tentativa ${attempt + 1}/${maxRetries + 1} com o modelo '${model}' falhou: ${err?.message || err}`);
        if (attempt < maxRetries) {
          const delay = initialDelay * Math.pow(2, attempt);
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }
    console.warn(`[OpenRouter Cascade] Modelo '${model}' esgotou todas as ${maxRetries + 1} tentativas. Alternando para o próximo modelo na cascata...`);
  }

  throw new Error(`Todos os modelos da cascata de IA falharam (${modelList.join(', ')}). Último erro: ${lastError?.message || lastError}`);
}

export function getOpenAIClient(userApiKey?: string) {
  const apiKey = userApiKey || process.env.OPENROUTER_API_KEY || '';
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://emergemed.vercel.app',
      'X-Title': 'EmergeMed',
    },
  });
}

export async function generateQuestionsWithAI({
  apiKey,
  model = 'openai/gpt-5.6-luna',
  fallbackModel = 'minimax/minimax-m3',
  chaptersInfo,
  chapterTexts,
  count = 5,
  questionType = 'mixed',
}: {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  chaptersInfo: { id: number; number: number; title: string; sectionTitle: string }[];
  chapterTexts?: Record<number, string>;
  count?: number;
  questionType?: 'multiple_choice' | 'prescription' | 'ventilator' | 'mixed';
}): Promise<QuestionItem[]> {
  const openai = getOpenAIClient(apiKey);

  const chaptersPrompt = chaptersInfo
    .map((c) => `- Capítulo ${c.number}: ${c.title} (Seção: ${c.sectionTitle})`)
    .join('\n');

  let textContext = '';
  if (chapterTexts && Object.keys(chapterTexts).length > 0) {
    textContext = '\n\nTEXTO COMPLETO DOS CAPÍTULOS DO LIVRO (FONTE PRIMÁRIA OBRIGATÓRIA):\n' +
      Object.entries(chapterTexts)
        .map(([id, text]) => {
          const cleaned = fixMojibake(text || '');
          return `--- TEXTO COMPLETO DO CAPÍTULO ${id} ---\n${cleaned}`;
        })
        .join('\n\n');
  }

  const typeDescriptions: Record<string, string> = {
    mixed: 'mistas — inclua questões de múltipla escolha, prescrição completa (do dia), prescrição imediata (no momento) e configuração de ventilador mecânico (SOMENTE quando cabível para a patologia do caso)',
    multiple_choice: 'apenas múltipla escolha (A-E) com 5 alternativas',
    prescription: 'apenas prescrições — alterne entre prescrição completa (prescription_complete) e prescrição imediata (prescription_immediate)',
    ventilator: 'apenas configuração de ventilador mecânico (somente se a patologia justificar ventilação mecânica invasiva)',
  };

  const userPrompt = `Gere ${count} questões clínicas de medicina de emergência para UPA sobre os seguintes capítulos:
${chaptersPrompt}
${textContext}

INSTRUÇÕES FUNDAMENTAIS:
1. O TEXTO COMPLETO DO CAPÍTULO FORNECIDO ACIMA É SUA FONTE PRIMÁRIA E OBRIGATÓRIA. Todas as questões devem ser derivadas de conceitos, dados, tabelas e protocolos presentes no capítulo.
2. Tipo de questões desejadas: ${typeDescriptions[questionType] || typeDescriptions.mixed}.
3. As questões devem ser DESAFIADORAS — nível de residência médica e prova de título.

Retorne ESTRITAMENTE uma array JSON com os objetos no formato especificado. Responda APENAS o JSON válido sem marcações markdown de código.`;

  // Scale max_tokens dynamically: ~1200 tokens per question, minimum 6000, maximum 24000
  const calculatedMaxTokens = Math.min(24000, Math.max(6000, count * 1200));

  const modelsCascade = [model, fallbackModel, 'deepseek/deepseek-v4-flash-0731', 'thinkingmachines/inkling-small:free'];

  return executeWithModelCascade(modelsCascade, async (selectedModel) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_QUESTION_GENERATOR },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: calculatedMaxTokens,
      plugins: [{ id: 'web', max_results: 3 }],
    } as any);

    const content = response.choices[0]?.message?.content || '[]';
    const parsedRaw = parseJsonFromMarkdown<any[]>(content);
    const parsed = Array.isArray(parsedRaw)
      ? parsedRaw.map((q) => normalizeQuestionItem(q))
      : [];

    return parsed;
  });
}

export async function evaluatePrescriptionWithAI({
  apiKey,
  model = 'openai/gpt-5.6-luna',
  fallbackModel = 'minimax/minimax-m3',
  vignette,
  userPrescription,
  idealPrescription,
  evaluationCriteria,
  chapterText,
  questionType,
  ventilatorData,
}: {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  vignette: string;
  userPrescription: string;
  idealPrescription?: string;
  evaluationCriteria?: string[];
  chapterText?: string;
  questionType?: 'prescription_complete' | 'prescription_immediate' | 'ventilator';
  ventilatorData?: Record<string, string>;
}): Promise<PrescriptionEvaluation> {
  const openai = getOpenAIClient(apiKey);

  const cleanChapterText = fixMojibake(chapterText || '');

  const typeLabel = questionType === 'ventilator'
    ? 'CONFIGURAÇÃO DE VENTILADOR MECÂNICO'
    : questionType === 'prescription_immediate'
    ? 'PRESCRIÇÃO IMEDIATA (NO MOMENTO)'
    : 'PRESCRIÇÃO COMPLETA (DO DIA)';

  const ventilatorSection = ventilatorData
    ? `\nPARÂMETROS DO VENTILADOR CONFIGURADOS PELO MÉDICO:\n${Object.entries(ventilatorData).map(([k, v]) => `- ${k}: ${v || '(não preenchido)'}`).join('\n')}\n`
    : '';

  const userPrompt = `Avalie a seguinte ${typeLabel} para um caso de emergência na UPA:

TIPO DE QUESTÃO: ${questionType || 'prescription_complete'}

CASO CLÍNICO:
${vignette}

${questionType === 'ventilator' ? ventilatorSection : `PRESCRIÇÃO ESCRITA PELO MÉDICO:\n${userPrescription}\n`}
${idealPrescription ? `GABARITO / PRESCRIÇÃO DE REFERÊNCIA:\n${idealPrescription}\n` : ''}
${evaluationCriteria ? `CRITÉRIOS ESPERADOS:\n${evaluationCriteria.join('\n')}\n` : ''}
${cleanChapterText ? `TEXTO COMPLETO DE REFERÊNCIA DO LIVRO:\n${cleanChapterText}\n` : ''}

Retorne ESTRITAMENTE o JSON de avaliação conforme o formato exigido, sem markdown extra.`;

  const modelsCascade = [model, fallbackModel, 'deepseek/deepseek-v4-flash-0731', 'thinkingmachines/inkling-small:free'];

  return executeWithModelCascade(modelsCascade, async (selectedModel) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_PRESCRIPTION_EVALUATOR },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      plugins: [{ id: 'web', max_results: 3 }],
    } as any);

    const content = response.choices[0]?.message?.content || '{}';
    const result = parseJsonFromMarkdown<PrescriptionEvaluation>(content);

    if (result.verdict) result.verdict = fixMojibake(result.verdict);
    if (result.detailedFeedback) result.detailedFeedback = fixMojibake(result.detailedFeedback);
    if (result.idealPrescription) result.idealPrescription = fixMojibake(result.idealPrescription);

    return result;
  });
}

export async function generatePlantaoBedQuestionsWithAI({
  apiKey,
  model = 'openai/gpt-5.6-luna',
  fallbackModel = 'minimax/minimax-m3',
  bedNumber,
  chapterInfo,
  chapterText,
}: {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  bedNumber: number;
  chapterInfo: { id: number; number: number; title: string; sectionTitle: string };
  chapterText?: string;
}): Promise<QuestionItem[]> {
  const openai = getOpenAIClient(apiKey);
  const cleanText = fixMojibake(chapterText || '');

  const userPrompt = `Crie a simulação completa para o LEITO ${bedNumber} (Capítulo ${chapterInfo.number}: ${chapterInfo.title} - Seção: ${chapterInfo.sectionTitle}).
${cleanText ? `\nTEXTO DE REFERÊNCIA DO LIVRO:\n${cleanText}\n` : ''}

Gere exatamente 4 questões sequenciais formando uma narrativa clínica contínua para um paciente atendido neste leito:
Q1: Múltipla escolha A-E (Triagem / Diagnóstico inicial) - "options" DEVE SER UMA ARRAY JSON DE STRINGS ex: ["Opção A", "Opção B", ...], "correctOption" DEVE SER ÍNDICE 0-BASED (0=A, 1=B, 2=C, 3=D, 4=E).
Q2: Múltipla escolha A-E (Exames / Confirmação diagnóstica) - "options" DEVE SER UMA ARRAY JSON DE STRINGS, "correctOption" DEVE SER ÍNDICE 0-BASED.
Q3: Prescrição Imediata ("prescription_immediate") - Resgate de emergência
Q4: Prescrição Completa ("prescription_complete") OU Ventilador Mecânico ("ventilator", se indicado)

Retorne ESTRITAMENTE uma array JSON com os 4 objetos de questão no formato especificado. Sem explicações ou markdown adicional.`;

  const modelsCascade = [model, fallbackModel, 'deepseek/deepseek-v4-flash-0731', 'thinkingmachines/inkling-small:free'];

  return executeWithModelCascade(modelsCascade, async (selectedModel) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_PLANTAO_GENERATOR },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 8000,
      plugins: [{ id: 'web', max_results: 3 }],
    } as any);

    const content = response.choices[0]?.message?.content || '[]';
    const parsedRaw = parseJsonFromMarkdown<any[]>(content);
    const parsed = Array.isArray(parsedRaw)
      ? parsedRaw.map((q) => {
          const norm = normalizeQuestionItem(q);
          norm.chapterId = chapterInfo.id;
          norm.chapterTitle = chapterInfo.title;
          return norm;
        })
      : [];

    return parsed;
  });
}

export async function evaluateBedSequenceWithAI({
  apiKey,
  model = 'openai/gpt-5.6-luna',
  fallbackModel = 'minimax/minimax-m3',
  bedNumber,
  patientWeight,
  chapterTitle,
  chapterText,
  mcqResults = [],
  prescriptions = [],
  mathFactsText = '',
}: {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  bedNumber: number;
  patientWeight?: number;
  chapterTitle?: string;
  chapterText?: string;
  mcqResults?: Array<{
    id: number;
    vignette: string;
    userAnswer: string;
    isCorrect: boolean;
    explanation?: string;
  }>;
  prescriptions: Array<{
    id: number;
    type: 'prescription_complete' | 'prescription_immediate' | 'ventilator';
    vignette: string;
    userPrescription: string;
    idealPrescription?: string;
    evaluationCriteria?: string[];
    ventilatorData?: Record<string, string>;
  }>;
  mathFactsText?: string;
}): Promise<Record<number, PrescriptionEvaluation>> {
  const openai = getOpenAIClient(apiKey);
  const cleanChapterText = fixMojibake(chapterText || '');

  let mcqSection = '';
  if (mcqResults && mcqResults.length > 0) {
    mcqSection = `\n═══════════════════════════════════════════════════════════\nRESPOSTAS DO MÉDICO NAS QUESTÕES DE TRIAGEM / DIAGNÓSTICO (Q1 / Q2):\n═══════════════════════════════════════════════════════════\n` +
      mcqResults.map((m, idx) => `
QUESTÃO ${idx + 1} (ID: ${m.id}) - Múltipla Escolha:
- Caso Clínico: ${m.vignette}
- Opção Escolhida pelo Médico: "${m.userAnswer}" (${m.isCorrect ? 'CORRETO ✅' : 'INCORRETO ❌'})
${m.explanation ? `- Gabarito / Justificativa: ${m.explanation}` : ''}
`).join('\n');
  }

  const prescriptionsSection = prescriptions.map((p, idx) => {
    const typeLabel = p.type === 'ventilator'
      ? 'CONFIGURAÇÃO DE VENTILADOR MECÂNICO'
      : p.type === 'prescription_immediate'
      ? 'PRESCRIÇÃO IMEDIATA (NO MOMENTO)'
      : 'PRESCRIÇÃO COMPLETA (DO DIA)';

    const ventilatorContent = p.ventilatorData
      ? `\nPARÂMETROS DO VENTILADOR CONFIGURADOS PELO MÉDICO:\n${Object.entries(p.ventilatorData).map(([k, v]) => `- ${k}: ${v || '(não preenchido)'}`).join('\n')}\n`
      : '';

    return `
═══════════════════════════════════════════════════════════
PRESCRIÇÃO ${idx + 1} (QUESTÃO ID: ${p.id}) — ${typeLabel}:
═══════════════════════════════════════════════════════════
TIPO DE QUESTÃO: ${p.type}
CASO CLÍNICO / EVOLUÇÃO NO MOMENTO DESTA CONDUTA:
${p.vignette}

${p.type === 'ventilator' ? ventilatorContent : `PRESCRIÇÃO ESCRITA PELO MÉDICO:\n${p.userPrescription}\n`}
${p.idealPrescription ? `GABARITO / CONDUTA DE REFERÊNCIA:\n${p.idealPrescription}\n` : ''}
${p.evaluationCriteria && p.evaluationCriteria.length > 0 ? `CRITÉRIOS ESPERADOS:\n${p.evaluationCriteria.join('\n')}\n` : ''}
`;
  }).join('\n');

  const userPrompt = `Avalie as condutas prescritas para o LEITO ${bedNumber} ${chapterTitle ? `(Tema: ${chapterTitle})` : ''} ${patientWeight ? `| Peso do Paciente: ${patientWeight} kg` : ''}:

${mathFactsText ? `${mathFactsText}\n` : ''}
${mcqSection}
${prescriptionsSection}
${cleanChapterText ? `\n═══════════════════════════════════════════════════════════\nTEXTO COMPLETO DE REFERÊNCIA DO LIVRO:\n═══════════════════════════════════════════════════════════\n${cleanChapterText}\n` : ''}

INSTRUÇÃO FINAL:
Avalie CADA uma das ${prescriptions.length} prescrições acima levando em consideração o contexto cronológico do leito e os fatos matemáticos pré-calculados.
Retorne ESTRITAMENTE o JSON no formato:
{
  "evaluations": {
${prescriptions.map(p => `    "${p.id}": { "score": 8.5, "verdict": "Adequado", "strengths": [...], "improvements": [...], "detailedFeedback": "...", "idealPrescription": "...", "errorTags": [...] }`).join(',\n')}
  }
}`;

  const modelsCascade = [model, fallbackModel, 'deepseek/deepseek-v4-flash-0731', 'thinkingmachines/inkling-small:free'];

  return executeWithModelCascade(modelsCascade, async (selectedModel) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: Math.min(16000, Math.max(4000, prescriptions.length * 3000)),
      plugins: [{ id: 'web', max_results: 3 }],
    } as any);

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = parseJsonFromMarkdown<any>(content);

    const rawEvals = (parsed && typeof parsed === 'object' && parsed.evaluations) ? parsed.evaluations : parsed;
    const finalEvaluations: Record<number, PrescriptionEvaluation> = {};

    if (rawEvals && typeof rawEvals === 'object') {
      for (const [key, val] of Object.entries(rawEvals)) {
        const qId = parseInt(key, 10);
        if (!isNaN(qId) && val && typeof val === 'object') {
          const evalObj = val as PrescriptionEvaluation;
          if (evalObj.verdict) evalObj.verdict = fixMojibake(evalObj.verdict);
          if (evalObj.detailedFeedback) evalObj.detailedFeedback = fixMojibake(evalObj.detailedFeedback);
          if (evalObj.idealPrescription) evalObj.idealPrescription = fixMojibake(evalObj.idealPrescription);
          finalEvaluations[qId] = evalObj;
        }
      }
    }

    // Safety fallback: ensure all requested prescriptions have an entry
    for (const p of prescriptions) {
      if (!finalEvaluations[p.id]) {
        console.warn(`[OpenRouter Bed Evaluation] Questão ${p.id} não foi retornada no JSON. Criando fallback.`);
        finalEvaluations[p.id] = {
          score: 7.0,
          verdict: 'Adequado',
          strengths: ['Conduta clínica registrada.'],
          improvements: ['Avaliação detalhada indisponível.'],
          detailedFeedback: 'A avaliação individual desta conduta não pôde ser estruturada separadamente pela IA, mas o leito foi analisado.',
          idealPrescription: p.idealPrescription || 'Conduta de referência do protocolo.',
        };
      }
    }

    return finalEvaluations;
  });
}

export async function generateAdverseEvolutionQuestionWithAI({
  apiKey,
  model = 'openai/gpt-5.6-luna',
  fallbackModel = 'deepseek/deepseek-v4-flash-0731',
  bedNumber,
  chapterTitle,
  originalVignette,
  errorsContext,
  mathFactsText = '',
}: {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  bedNumber: number;
  chapterTitle: string;
  originalVignette: string;
  errorsContext: { questionType: string; vignette: string; userText: string; idealText?: string }[];
  mathFactsText?: string;
}): Promise<QuestionItem> {
  const openai = getOpenAIClient(apiKey);

  const errorsSummary = errorsContext
    .map(
      (err, i) =>
        `Erro ${i + 1} (${err.questionType}): Resposta do médico: "${err.userText}" | Esperado: "${err.idealText || 'Conduta correta'}"`
    )
    .join('\n');

  const userPrompt = `Simule uma EVOLUÇÃO ADVERSA (Q5 BÔNUS DE COMPLICAÇÃO) para o LEITO ${bedNumber} (Tema: ${chapterTitle}).

CASO CLÍNICO ORIGINAL:
${originalVignette}

${mathFactsText ? `${mathFactsText}\nATENÇÃO RIGOROSA: Os valores acima são fatos matemáticos verificados. NUNCA invente uma complicação por "sobredose" ou "toxicidade" de uma droga se a dose calculada estiver DENTRO DA FAIXA terapêutica normal!\n` : ''}
ERROS COMETIDOS PELO MÉDICO NO ATENDIMENTO INICIAL:
${errorsSummary}

Gere UMA única questão bônus (tipo "prescription_immediate" ou "multiple_choice") onde o paciente descompensa devido aos erros cometidos e exige conduta de emergência salvadora.

Retorne ESTRITAMENTE o JSON de um único objeto QuestionItem válido. Sem markdown extra.`;

  const modelsCascade = [model, fallbackModel, 'thinkingmachines/inkling-small:free'];

  return executeWithModelCascade(modelsCascade, async (selectedModel) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_ADVERSE_EVOLUTION },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 3000,
      plugins: [{ id: 'web', max_results: 3 }],
    } as any);

    const content = response.choices[0]?.message?.content || '{}';
    const parsedRaw = parseJsonFromMarkdown<any>(content);
    return normalizeQuestionItem(parsedRaw);
  });
}

export async function generateGeneralFeedbackWithAI({
  apiKey,
  model = 'deepseek/deepseek-v4-flash-0731',
  fallbackModel = 'openai/gpt-5.6-luna',
  overallScore,
  totalQuestions,
  evaluationsSummary,
  chapterTexts,
  mode = 'simulado',
}: {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  overallScore: number;
  totalQuestions: number;
  evaluationsSummary: {
    questionTitle: string;
    vignette: string;
    userAnswer: string;
    score: number;
    verdict?: string;
    strengths?: string[];
    idealAnswer?: string;
  }[];
  chapterTexts?: Record<number, string>;
  mode?: 'simulado' | 'plantao';
}): Promise<string> {
  const openai = getOpenAIClient(apiKey);

  const summaryText = evaluationsSummary
    .map(
      (item, idx) => `
--- QUESTÃO ${idx + 1}: ${item.questionTitle} ---
- Pontuação / Veredito: ${item.score}/10 ${item.verdict ? `(${item.verdict})` : ''}
- Caso Clínico Completo: ${item.vignette}
- Resposta do Médico: "${item.userAnswer}"
${item.idealAnswer ? `- Gabarito Esperado: "${item.idealAnswer}"` : ''}
${item.strengths && item.strengths.length > 0 ? `- Pontos Fortes Notados: ${item.strengths.join('; ')}` : ''}
`
    )
    .join('\n');

  let bookContext = '';
  if (chapterTexts && Object.keys(chapterTexts).length > 0) {
    bookContext = '\n\nTEXTO COMPLETO DOS CAPÍTULOS DE REFERÊNCIA DO LIVRO (FONTE PRIMÁRIA OBRIGATÓRIA PARA AVALIAÇÃO):\n' +
      Object.entries(chapterTexts)
        .map(([id, text]) => `--- TEXTO DO CAPÍTULO ${id} ---\n${fixMojibake(text || '')}`)
        .join('\n\n');
  }

  const isPlantao = mode === 'plantao';

  const userPrompt = `AVALIAÇÃO DE ${isPlantao ? 'PLANTÃO NOTURNO NA SALA VERMELHA DE UPA' : 'SIMULADO FINALIZADO'}:
Nota Final do Aluno: ${overallScore.toFixed(1)} / 10.0
Total de Questões/Leitos: ${totalQuestions}

DESEMPENHO DETALHADO POR QUESTÃO / LEITO (ATENÇÃO: LEIA O CASO CLÍNICO COMPLETO DE CADA QUESTÃO, POIS VÁRIAS QUESTÕES DESCREVEM A EVOLUÇÃO DO PACIENTE APÓS TRATAMENTO INICIAL, COMO QUEDA DA GLICEMIA OU MELHORA DA PRESSÃO ARTERIAL):
${summaryText}
${bookContext}

REGRAS OBRIGATÓRIAS PARA O FEEDBACK GERAL:
1. Mantenha coerência com as avaliações individuais. Se uma questão foi avaliada como "Adequada" ou obteve boa nota, priorize a seção de pontos críticos para os erros reais cometidos nas questões com nota mais baixa. Caso queira abordar algum detalhe em questões com boa nota, mencione como sugestão de refinamento técnico, e não como falha grave.
2. Preste atenção estrita aos dados de EVOLUÇÃO da vinheta (ex: glicemia que já caiu para 285 mg/dL, PA que já subiu para 102/64 mmHg). NUNCA confunda parâmetros de admissão com a situação atual apresentada no momento da conduta.
3. Baseie as explicações nos protocolos e no texto dos capítulos do livro fornecidos acima.

${isPlantao ? 'Gere o Feedback de Passagem de Plantão Noturno em Markdown.' : 'Gere o Feedback Geral de Preceptoria em Markdown contendo Síntese Geral, Pontos Críticos e Recomendações de Estudo.'}

Responda diretamente em Markdown sem blocos de código JSON.`;

  const modelsCascade = [model, fallbackModel, 'minimax/minimax-m3', 'thinkingmachines/inkling-small:free'];
  const systemPrompt = isPlantao ? SYSTEM_PROMPT_PLANTAO_FEEDBACK : SYSTEM_PROMPT_GENERAL_FEEDBACK;

  return executeWithModelCascade(modelsCascade, async (selectedModel) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 3000,
      plugins: [{ id: 'web', max_results: 3 }],
    } as any);

    const content = response.choices[0]?.message?.content || '';
    return fixMojibake(content.trim());
  });
}

/**
 * Analyzes, extracts structured medical metadata, and formats raw text pasted from any book chapter.
 */
export async function analyzeCustomChapterWithAI({
  apiKey,
  model = 'deepseek/deepseek-v4-flash-0731',
  fallbackModel = 'openai/gpt-5.6-luna',
  rawText,
  suggestedBookTitle,
}: {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  rawText: string;
  suggestedBookTitle?: string;
}): Promise<CustomChapterAnalysisResult> {
  const openai = getOpenAIClient(apiKey);

  const userPrompt = `Analise, extraia metadados e estruture o texto médico colado abaixo:
${suggestedBookTitle ? `LIVRO / FONTE SUGERIDA PELO USUÁRIO: "${suggestedBookTitle}"\n` : ''}
TEXTO MÉDICO BRUTO:
"""
${rawText}
"""

Retorne ESTRITAMENTE o JSON estruturado conforme as instruções do prompt de sistema.`;

  const modelsCascade = [
    model,
    fallbackModel,
    'thinkingmachines/inkling-small:free',
  ];

  return executeWithModelCascade(modelsCascade, async (selectedModel) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_CUSTOM_CHAPTER_ANALYZER },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 16000,
    } as any);

    const content = response.choices[0]?.message?.content || '';
    const parsed = parseJsonFromMarkdown<CustomChapterAnalysisResult>(content);
    return {
      title: fixMojibake(parsed.title || 'Capítulo Sem Título'),
      sourceBook: fixMojibake(parsed.sourceBook || suggestedBookTitle || 'Livro Personalizado'),
      sectionTitle: fixMojibake(parsed.sectionTitle || 'Capítulos Personalizados'),
      category: parsed.category || 'Geral',
      summary: fixMojibake(parsed.summary || ''),
      cleanedContent: fixMojibake(parsed.cleanedContent || rawText),
      frequencyScore: Math.min(10, Math.max(1, Number(parsed.frequencyScore) || 5.0)),
      importanceScore: Math.min(10, Math.max(1, Number(parsed.importanceScore) || 5.0)),
    };
  });
}

