import OpenAI from 'openai';
import { SYSTEM_PROMPT_QUESTION_GENERATOR, SYSTEM_PROMPT_PRESCRIPTION_EVALUATOR } from './prompts';

export interface QuestionOption {
  text: string;
}

export interface QuestionItem {
  id: number;
  type: 'multiple_choice' | 'prescription';
  chapterId: number;
  chapterTitle: string;
  vignette: string;
  options?: string[];
  correctOption?: number; // 0-indexed: 0=A, 1=B, 2=C, 3=D, 4=E
  explanation?: string;
  promptText?: string;
  idealPrescription?: string;
  evaluationCriteria?: string[];
}

export interface PrescriptionEvaluation {
  score: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  detailedFeedback: string;
  idealPrescription: string;
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
  questionType?: 'multiple_choice' | 'prescription' | 'mixed';
}): Promise<QuestionItem[]> {
  const openai = getOpenAIClient(apiKey);

  const chaptersPrompt = chaptersInfo
    .map((c) => `- Capítulo ${c.number}: ${c.title} (Seção: ${c.sectionTitle})`)
    .join('\n');

  let textContext = '';
  if (chapterTexts && Object.keys(chapterTexts).length > 0) {
    textContext = '\n\nTrechos de referência dos capítulos do livro:\n' +
      Object.entries(chapterTexts)
        .map(([id, text]) => `--- TEXTO DO CAPÍTULO ${id} ---\n${text.slice(0, 10000)}...`)
        .join('\n');
  }

  const userPrompt = `Gere ${count} questões clínicas de medicina de emergência para UPA sobre os seguintes capítulos:
${chaptersPrompt}
${textContext}

Tipo de questões desejadas: ${questionType === 'mixed' ? 'mistas (múltipla escolha e prescrição)' : questionType === 'multiple_choice' ? 'apenas múltipla escolha (A-E)' : 'apenas prescrever condutas'}.

Retorne ESTRITAMENTE uma array JSON com os objetos no formato especificado. Responda APENAS o JSON válido sem marcações markdown de código.`;

  // Scale max_tokens dynamically: ~800 tokens per question, minimum 4000, maximum 16000
  const calculatedMaxTokens = Math.min(16000, Math.max(4000, count * 800));

  const runCompletion = async (selectedModel: string) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_QUESTION_GENERATOR },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: calculatedMaxTokens,
    });

    const content = response.choices[0]?.message?.content || '[]';
    // Clean response in case model wrapped it in ```json ... ```
    const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(cleaned) as QuestionItem[];

    // Normalize correctOption to always be a 0-indexed integer
    for (const q of parsed) {
      if (q.type === 'multiple_choice' && q.correctOption !== undefined) {
        const raw = q.correctOption as unknown;
        if (typeof raw === 'string') {
          // Handle letter answers like "A", "B", "C", "D", "E"
          const upper = raw.trim().toUpperCase();
          if (/^[A-E]$/.test(upper)) {
            q.correctOption = upper.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3, E=4
          } else {
            q.correctOption = parseInt(raw, 10);
          }
        }
        // Sanity check: if value is out of 0-4 range, default to 0
        if (typeof q.correctOption !== 'number' || isNaN(q.correctOption) || q.correctOption < 0 || q.correctOption > 4) {
          q.correctOption = 0;
        }
      }
      // Also strip any letter prefixes from options (e.g. "A) ...", "B) ...")
      if (q.options) {
        q.options = q.options.map(opt => opt.replace(/^[A-E]\)\s*/i, ''));
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
}: {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  vignette: string;
  userPrescription: string;
  idealPrescription?: string;
  evaluationCriteria?: string[];
  chapterText?: string;
}): Promise<PrescriptionEvaluation> {
  const openai = getOpenAIClient(apiKey);

  const userPrompt = `Avalie a seguinte prescrição médica para um caso de emergência na UPA:

CASO CLÍNICO:
${vignette}

PRESCRIÇÃO ESCRITA PELO MÉDICO:
${userPrescription}

${idealPrescription ? `GABARITO / PRESCRIÇÃO DE REFERÊNCIA:\n${idealPrescription}\n` : ''}
${evaluationCriteria ? `CRITÉRIOS ESPERADOS:\n${evaluationCriteria.join('\n')}\n` : ''}
${chapterText ? `TEXTO DE REFERÊNCIA DO LIVRO:\n${chapterText.slice(0, 2000)}\n` : ''}

Retorne ESTRITAMENTE o JSON de avaliação conforme o formato exigido, sem markdown extra.`;

  const runCompletion = async (selectedModel: string) => {
    const response = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_PRESCRIPTION_EVALUATOR },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(cleaned) as PrescriptionEvaluation;
  };

  try {
    return await runCompletion(model);
  } catch (error) {
    console.warn(`Primary prescription model ${model} failed, using fallback ${fallbackModel}:`, error);
    return await runCompletion(fallbackModel);
  }
}
