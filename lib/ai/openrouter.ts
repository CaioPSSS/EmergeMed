import OpenAI from 'openai';
import { fixMojibake } from '@/lib/text-sanitizer';
import {
  SYSTEM_PROMPT_QUESTION_GENERATOR,
  SYSTEM_PROMPT_PRESCRIPTION_EVALUATOR,
  SYSTEM_PROMPT_PLANTAO_GENERATOR,
  SYSTEM_PROMPT_ADVERSE_EVOLUTION,
  SYSTEM_PROMPT_GENERAL_FEEDBACK,
  SYSTEM_PROMPT_PLANTAO_FEEDBACK,
} from './prompts';

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
}

export interface PrescriptionEvaluation {
  score: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  detailedFeedback: string;
  idealPrescription: string;
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
 * Helper function for executing AI calls with exponential backoff retries per model
 * and multi-model fallback cascade across candidate models.
 */
export async function executeWithModelCascade<T>(
  models: string[],
  fn: (model: string) => Promise<T>,
  options: { maxRetriesPerModel?: number; initialDelayMs?: number } = {}
): Promise<T> {
  const maxRetries = options.maxRetriesPerModel ?? 2;
  const initialDelay = options.initialDelayMs ?? 500;

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
  fallbackModel = 'nvidia/nemotron-3-ultra-550b-a55b:free',
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

  const modelsCascade = [model, fallbackModel, 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct:free'];

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
    const parsed = parseJsonFromMarkdown<QuestionItem[]>(content);

    for (const q of parsed) {
      if (q.vignette) q.vignette = fixMojibake(q.vignette);
      if (q.explanation) q.explanation = fixMojibake(q.explanation);
      if (q.promptText) q.promptText = fixMojibake(q.promptText);
      if (q.idealPrescription) q.idealPrescription = fixMojibake(q.idealPrescription);
      if (q.options) {
        q.options = q.options.map(opt => fixMojibake(opt).replace(/^[A-E]\)\s*/i, ''));
      }
      // Normalize legacy 'prescription' type to 'prescription_complete'
      if ((q as any).type === 'prescription') {
        (q as any).type = 'prescription_complete';
      }
    }

    return parsed;
  });
}

export async function evaluatePrescriptionWithAI({
  apiKey,
  model = 'openai/gpt-5.6-luna',
  fallbackModel = 'nvidia/nemotron-3-ultra-550b-a55b:free',
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

  const modelsCascade = [model, fallbackModel, 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct:free'];

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
  fallbackModel = 'nvidia/nemotron-3-ultra-550b-a55b:free',
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
Q1: Múltipla escolha A-E (Triagem / Diagnóstico inicial)
Q2: Múltipla escolha A-E (Exames / Confirmação diagnóstica)
Q3: Prescrição Imediata ("prescription_immediate") - Resgate de emergência
Q4: Prescrição Completa ("prescription_complete") OU Ventilador Mecânico ("ventilator", se indicado)

Retorne ESTRITAMENTE uma array JSON com os 4 objetos de questão no formato especificado. Sem explicações ou markdown adicional.`;

  const modelsCascade = [model, fallbackModel, 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct:free'];

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
    const parsed = parseJsonFromMarkdown<QuestionItem[]>(content);

    for (const q of parsed) {
      if (q.vignette) q.vignette = fixMojibake(q.vignette);
      if (q.explanation) q.explanation = fixMojibake(q.explanation);
      if (q.promptText) q.promptText = fixMojibake(q.promptText);
      if (q.idealPrescription) q.idealPrescription = fixMojibake(q.idealPrescription);
      if (q.options) {
        q.options = q.options.map((opt) => fixMojibake(opt).replace(/^[A-E]\)\s*/i, ''));
      }
      if ((q as any).type === 'prescription') {
        (q as any).type = 'prescription_complete';
      }
      q.chapterId = chapterInfo.id;
      q.chapterTitle = chapterInfo.title;
    }

    return parsed;
  });
}

export async function generateAdverseEvolutionQuestionWithAI({
  apiKey,
  model = 'openai/gpt-5.6-luna',
  fallbackModel = 'nvidia/nemotron-3-ultra-550b-a55b:free',
  bedNumber,
  chapterTitle,
  originalVignette,
  errorsContext,
}: {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  bedNumber: number;
  chapterTitle: string;
  originalVignette: string;
  errorsContext: { questionType: string; vignette: string; userText: string; idealText?: string }[];
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

ERROS COMETIDOS PELO MÉDICO NO ATENDIMENTO INICIAL:
${errorsSummary}

Gere UMA única questão bônus (tipo "prescription_immediate" ou "multiple_choice") onde o paciente descompensa devido aos erros cometidos e exige conduta de emergência salvadora.

Retorne ESTRITAMENTE o JSON de um único objeto QuestionItem válido. Sem markdown extra.`;

  const modelsCascade = [model, fallbackModel, 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct:free'];

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
    const parsed = parseJsonFromMarkdown<QuestionItem>(content);

    if (parsed.vignette) parsed.vignette = fixMojibake(parsed.vignette);
    if (parsed.explanation) parsed.explanation = fixMojibake(parsed.explanation);
    if (parsed.promptText) parsed.promptText = fixMojibake(parsed.promptText);
    if (parsed.idealPrescription) parsed.idealPrescription = fixMojibake(parsed.idealPrescription);
    if ((parsed as any).type === 'prescription') {
      (parsed as any).type = 'prescription_complete';
    }

    return parsed;
  });
}

export async function generateGeneralFeedbackWithAI({
  apiKey,
  model = 'openai/gpt-5.6-luna',
  fallbackModel = 'nvidia/nemotron-3-ultra-550b-a55b:free',
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

  const modelsCascade = [model, fallbackModel, 'google/gemini-2.5-flash', 'meta-llama/llama-3.3-70b-instruct:free'];
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
