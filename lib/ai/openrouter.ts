import OpenAI from 'openai';
import {
  SYSTEM_PROMPT_QUESTION_GENERATOR,
  SYSTEM_PROMPT_PRESCRIPTION_EVALUATOR,
  SYSTEM_PROMPT_PLANTAO_GENERATOR,
  SYSTEM_PROMPT_ADVERSE_EVOLUTION,
  SYSTEM_PROMPT_GENERAL_FEEDBACK,
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

function fixMojibake(text: string): string {
  if (!text) return text;
  // Only attempt conversion if text contains true Mojibake patterns:
  // 'Ã' or 'Â' followed by Latin-1 supplement characters (\u0080-\u00BF)
  if (/[ÃÂ][\u0080-\u00BF]/.test(text)) {
    try {
      const converted = Buffer.from(text, 'latin1').toString('utf8');
      if (!converted.includes('\uFFFD')) {
        return converted;
      }
    } catch {}
  }
  return text;
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

  const runCompletion = async (selectedModel: string) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_QUESTION_GENERATOR },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: calculatedMaxTokens,
    });

    const content = response.choices[0]?.message?.content || '[]';
    const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned) as QuestionItem[];

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
  };

  try {
    return await runCompletion(model);
  } catch (error) {
    console.warn(`Primary model ${model} failed, attempting fallback ${fallbackModel}:`, error);
    try {
      return await runCompletion(fallbackModel);
    } catch (fallbackErr) {
      console.error('Fallback model also failed:', fallbackErr);
      throw new Error('Falha ao gerar questões por IA. Verifique sua chave API do OpenRouter.');
    }
  }
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

  const runCompletion = async (selectedModel: string) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_PRESCRIPTION_EVALUATOR },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
    const result = JSON.parse(cleaned) as PrescriptionEvaluation;

    if (result.verdict) result.verdict = fixMojibake(result.verdict);
    if (result.detailedFeedback) result.detailedFeedback = fixMojibake(result.detailedFeedback);
    if (result.idealPrescription) result.idealPrescription = fixMojibake(result.idealPrescription);

    return result;
  };

  try {
    return await runCompletion(model);
  } catch (error) {
    console.warn(`Primary prescription model ${model} failed, using fallback ${fallbackModel}:`, error);
    return await runCompletion(fallbackModel);
  }
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

  const runCompletion = async (selectedModel: string) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_PLANTAO_GENERATOR },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 8000,
    });

    const content = response.choices[0]?.message?.content || '[]';
    const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned) as QuestionItem[];

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
  };

  try {
    return await runCompletion(model);
  } catch (err) {
    console.warn(`Plantao bed generator failed on ${model}, trying fallback ${fallbackModel}`, err);
    return await runCompletion(fallbackModel);
  }
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

  const runCompletion = async (selectedModel: string) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_ADVERSE_EVOLUTION },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 3000,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned) as QuestionItem;

    if (parsed.vignette) parsed.vignette = fixMojibake(parsed.vignette);
    if (parsed.explanation) parsed.explanation = fixMojibake(parsed.explanation);
    if (parsed.promptText) parsed.promptText = fixMojibake(parsed.promptText);
    if (parsed.idealPrescription) parsed.idealPrescription = fixMojibake(parsed.idealPrescription);
    if ((parsed as any).type === 'prescription') {
      (parsed as any).type = 'prescription_complete';
    }

    return parsed;
  };

  try {
    return await runCompletion(model);
  } catch (err) {
    console.warn(`Adverse evolution generator failed on ${model}, trying fallback ${fallbackModel}`, err);
    return await runCompletion(fallbackModel);
  }
}

export async function generateGeneralFeedbackWithAI({
  apiKey,
  model = 'openai/gpt-5.6-luna',
  fallbackModel = 'nvidia/nemotron-3-ultra-550b-a55b:free',
  overallScore,
  totalQuestions,
  evaluationsSummary,
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
}): Promise<string> {
  const openai = getOpenAIClient(apiKey);

  const summaryText = evaluationsSummary
    .map(
      (item, idx) => `
--- QUESTÃO ${idx + 1}: ${item.questionTitle} ---
- Pontuação / Veredito: ${item.score}/10 ${item.verdict ? `(${item.verdict})` : ''}
- Caso Clínico: ${item.vignette.slice(0, 200)}...
- Resposta do Médico: "${item.userAnswer}"
${item.idealAnswer ? `- Gabarito Esperado: "${item.idealAnswer.slice(0, 250)}..."` : ''}
${item.strengths && item.strengths.length > 0 ? `- Pontos Fortes Notados: ${item.strengths.join('; ')}` : ''}
`
    )
    .join('\n');

  const userPrompt = `AVALIAÇÃO DE PLANTÃO / SIMULADO FINALIZADO:
Nota Final do Aluno: ${overallScore.toFixed(1)} / 10.0
Total de Questões: ${totalQuestions}

DESEMPENHO DETALHADO POR QUESTÃO:
${summaryText}

Gere o Feedback Geral de Preceptoria em Markdown contendo:
1. Síntese Geral (1 parágrafo curto)
2. Pontos Críticos e Condutas a Corrigir (Foque nos maiores erros de prescrição ou diagnóstico com explicação fisiopatológica/farmacológica do risco)
3. Recomendações de Estudo Prioritárias

Responda diretamente em Markdown sem blocos de código JSON.`;

  const runCompletion = async (selectedModel: string) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_GENERAL_FEEDBACK },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 3000,
    });

    const content = response.choices[0]?.message?.content || '';
    return fixMojibake(content.trim());
  };

  try {
    return await runCompletion(model);
  } catch (err) {
    console.warn(`General feedback generator failed on ${model}, trying fallback ${fallbackModel}`, err);
    return await runCompletion(fallbackModel);
  }
}

