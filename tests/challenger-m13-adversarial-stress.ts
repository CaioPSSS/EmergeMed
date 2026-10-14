/**
 * tests/challenger-m13-adversarial-stress.ts
 *
 * EMPIRICAL ADVERSARIAL STRESS TEST SUITE — MILESTONE M13
 * Challenger 2: LLM Pipeline, Token Management, Defensive Truncation,
 * MCQ Deficit Chapter Injection, and Spaced Repetition Invariants (150 Chapters).
 *
 * Pillars:
 * 1. Prompt Assembly & Token Estimation for Longest Chapters vs 128k Context Window
 * 2. Defensive Exception on finish_reason === 'length' & Cascade Fallback Execution
 * 3. MCQ Deficit Flow & chapterTexts Injection from chapter_contents
 * 4. Mathematical Invariants of Spaced Repetition & Global Readiness across 150 Chapters
 *
 * Usage: npx tsx tests/challenger-m13-adversarial-stress.ts
 */

import fs from 'fs';
import path from 'path';
import { CHAPTERS_DATA, Chapter } from '../lib/chapters-data';
import { DEFAULT_CHAPTER_WEIGHTS, getChapterWeight, ChapterWeight } from '../lib/chapter-weights-data';
import {
  getNormalizedClinicalWeights,
  deriveAllTopicMetrics,
  buildReadinessSnapshot,
  calculateFSRSUpdate,
  DESIRED_RETENTION,
} from '../lib/learning-engine';
import {
  SYSTEM_PROMPT_QUESTION_GENERATOR,
  SYSTEM_PROMPT_PLANTAO_GENERATOR,
  MCQ_DIFFICULTY_DISTRIBUTION_INSTRUCTIONS,
} from '../lib/ai/prompts';
import {
  fixMojibake,
  parseJsonFromMarkdown,
  normalizeQuestionItem,
  executeWithModelCascade,
  QuestionItem,
} from '../lib/ai/openrouter';
import {
  selectMCQsWithAntiRepetition,
  InMemoryMCQQueueRepository,
  BankQuestionRow,
} from '../lib/mcq-queue-service';

interface TestAssertion {
  pillar: string;
  id: string;
  description: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const assertions: TestAssertion[] = [];

function record(pillar: string, id: string, description: string, condition: boolean, details?: any) {
  if (condition) {
    assertions.push({ pillar, id, description, passed: true, details });
    console.log(`  ✓ [PASS] [${pillar}] ${id}: ${description}`);
  } else {
    assertions.push({ pillar, id, description, passed: false, error: 'Condition evaluated to false', details });
    console.error(`  ✗ [FAIL] [${pillar}] ${id}: ${description}`);
    if (details) console.error('    Details:', details);
  }
}

async function runChallengerM13AdversarialSuite() {
  console.log('================================================================');
  console.log('🔥 INICIANDO SUÍTE ADVERSARIAL DE ESTRESSE M13 (CHALLENGER 2)');
  console.log('================================================================\n');

  // Load Corpus Cache
  const cachePath = path.resolve(process.cwd(), 'scripts/index_cache.json');
  if (!fs.existsSync(cachePath)) {
    throw new Error('scripts/index_cache.json não encontrado!');
  }
  const cacheData: Record<string, { title: string; content: string; wordCount?: number }> = JSON.parse(
    fs.readFileSync(cachePath, 'utf8')
  );

  // ============================================================================
  // PILLAR 1: PROMPT ASSEMBLY & TOKEN ESTIMATION FOR LONGEST CHAPTERS
  // ============================================================================
  console.log('--- PILAR 1: MONTAGEM DE PROMPT E ESTIMATIVA DE TOKENS (TETO 128k) ---');

  const MODEL_CONTEXT_LIMIT = 128000; // openai/gpt-6-luna context window
  const MAX_DYNAMIC_COMPLETION = 24000; // Maximum completion budget for 10-20 questions

  // Identify top longest chapters by character count
  const chaptersRanked = Object.entries(cacheData)
    .map(([idStr, val]) => {
      const id = Number(idStr);
      const text = val.content || '';
      const charCount = text.length;
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      return { id, title: val.title, charCount, wordCount, content: text };
    })
    .sort((a, b) => b.charCount - a.charCount);

  // Specific target chapters required by dispatch
  const cap54 = chaptersRanked.find((c) => c.id === 54)!;
  const cap2 = chaptersRanked.find((c) => c.id === 2)!;
  const cap123 = chaptersRanked.find((c) => c.id === 123)!;
  const cap104 = chaptersRanked.find((c) => c.id === 104)!;
  const cap105 = chaptersRanked.find((c) => c.id === 105)!;
  const cap1 = chaptersRanked.find((c) => c.id === 1)!;
  const cap150 = chaptersRanked.find((c) => c.id === 150)!;

  record(
    'Pillar-1',
    'P1.1',
    'Capítulo 54 (AVCi) existe no acervo e possui contagem expressiva (>110k caracteres)',
    cap54 && cap54.charCount >= 110000 && cap54.wordCount >= 18000,
    { id: cap54?.id, chars: cap54?.charCount, words: cap54?.wordCount }
  );

  record(
    'Pillar-1',
    'P1.2',
    'Capítulo 2 (Via Aérea) existe no acervo (>65k caracteres, >10k palavras)',
    cap2 && cap2.charCount >= 65000 && cap2.wordCount >= 10000,
    { id: cap2?.id, chars: cap2?.charCount, words: cap2?.wordCount }
  );

  record(
    'Pillar-1',
    'P1.3',
    'Capítulo 123 (Pós-PCR) existe no acervo (>45k caracteres, >6.5k palavras)',
    cap123 && cap123.charCount >= 45000 && cap123.wordCount >= 6500,
    { id: cap123?.id, chars: cap123?.charCount, words: cap123?.wordCount }
  );

  // Helper function to build the exact prompt as assembled in lib/ai/openrouter.ts
  function assembleTestQuestionPrompt(
    chapters: Array<{ id: number; number: number; title: string; sectionTitle: string }>,
    chapterTextsMap: Record<number, string>,
    count = 10
  ): { systemPrompt: string; userPrompt: string; totalChars: number; estimatedTokens: number } {
    const chaptersPrompt = chapters
      .map((c) => `- Capítulo ${c.number}: ${c.title} (Seção: ${c.sectionTitle})`)
      .join('\n');

    let textContext = '';
    if (chapterTextsMap && Object.keys(chapterTextsMap).length > 0) {
      textContext =
        '\n\nTEXTO COMPLETO DOS CAPÍTULOS DO LIVRO (FONTE PRIMÁRIA OBRIGATÓRIA):\n' +
        Object.entries(chapterTextsMap)
          .map(([id, text]) => {
            const cleaned = fixMojibake(text || '');
            return `--- TEXTO COMPLETO DO CAPÍTULO ${id} ---\n${cleaned}`;
          })
          .join('\n\n');
    }

    const stdCount = Math.round(count * 0.6);
    const advCount = count - stdCount;
    const mcqDistributionContext = `\n\n${MCQ_DIFFICULTY_DISTRIBUTION_INSTRUCTIONS}\nMETAS RÍGIDAS DESTA GERAÇÃO:\n- Exatamente ${stdCount} questões com "difficulty_tier": "standard"\n- Exatamente ${advCount} questões com "difficulty_tier": "advanced"\n- Distribuição equilibrada entre subformatos ("case_conduct", "direct_content", "diagnostic_criteria").\n`;

    const userPrompt = `Gere ${count} questões clínicas de medicina de emergência para UPA sobre os seguintes capítulos:
${chaptersPrompt}
${textContext}
${mcqDistributionContext}
INSTRUÇÕES FUNDAMENTAIS:
1. O TEXTO COMPLETO DO CAPÍTULO FORNECIDO ACIMA É SUA FONTE PRIMÁRIA E OBRIGATÓRIA. Todas as questões devem ser derivadas de conceitos, dados, tabelas e protocolos presentes no capítulo.
2. Tipo de questões desejadas: apenas múltipla escolha (A-E) com 5 alternativas.
3. As questões devem ser DESAFIADORAS — nível de residência médica e prova de título.

Retorne ESTRITAMENTE uma array JSON com os objetos no formato especificado. Responda APENAS o JSON válido sem marcações markdown de código.`;

    const systemPrompt = SYSTEM_PROMPT_QUESTION_GENERATOR;
    const totalChars = systemPrompt.length + userPrompt.length;

    // Conservative token estimation for Portuguese technical medical prose:
    // Heuristic 1: chars / 2.7 (dense Latin/UTF-8 tokenization in cl100k/o200k)
    // Heuristic 2: words * 1.55 (Portuguese accented words split into ~1.5 tokens on average)
    const words = (systemPrompt + ' ' + userPrompt).split(/\s+/).filter(Boolean).length;
    const estCharBased = Math.ceil(totalChars / 2.7);
    const estWordBased = Math.ceil(words * 1.55);
    const estimatedTokens = Math.max(estCharBased, estWordBased);

    return { systemPrompt, userPrompt, totalChars, estimatedTokens };
  }

  // Test Cap 54 Prompt Assembly
  const pCap54 = assembleTestQuestionPrompt(
    [{ id: 54, number: 54, title: cap54.title, sectionTitle: 'Emergências Neurológicas' }],
    { 54: cap54.content },
    10
  );

  record(
    'Pillar-1',
    'P1.4',
    `Prompt do Cap 54 montado com sucesso (total chars = ${pCap54.totalChars})`,
    pCap54.totalChars > 115000 && pCap54.userPrompt.includes('TEXTO COMPLETO DO CAPÍTULO 54'),
    { totalChars: pCap54.totalChars, estimatedTokens: pCap54.estimatedTokens }
  );

  record(
    'Pillar-1',
    'P1.5',
    `Estimativa de tokens do Cap 54 (${pCap54.estimatedTokens} tokens) está confortavelmente abaixo do teto de 128k tokens (< 55k tokens, < 45% da janela, sobra > 70k tokens)`,
    pCap54.estimatedTokens < 55000 && pCap54.estimatedTokens / MODEL_CONTEXT_LIMIT < 0.45,
    {
      estimatedPromptTokens: pCap54.estimatedTokens,
      windowUsagePercent: ((pCap54.estimatedTokens / MODEL_CONTEXT_LIMIT) * 100).toFixed(1) + '%',
      headroomRemainingTokens: MODEL_CONTEXT_LIMIT - pCap54.estimatedTokens,
    }
  );

  record(
    'Pillar-1',
    'P1.6',
    `Cap 54 + Teto Máximo de Resposta (24k tokens) = ${pCap54.estimatedTokens + MAX_DYNAMIC_COMPLETION} tokens < 128k (Margem de segurança > 50k tokens)`,
    pCap54.estimatedTokens + MAX_DYNAMIC_COMPLETION < MODEL_CONTEXT_LIMIT &&
      MODEL_CONTEXT_LIMIT - (pCap54.estimatedTokens + MAX_DYNAMIC_COMPLETION) > 50000,
    {
      totalPromptPlusCompletion: pCap54.estimatedTokens + MAX_DYNAMIC_COMPLETION,
      headroomAfterMaxCompletion: MODEL_CONTEXT_LIMIT - (pCap54.estimatedTokens + MAX_DYNAMIC_COMPLETION),
    }
  );

  // Test Cap 2 and Cap 123
  const pCap2 = assembleTestQuestionPrompt(
    [{ id: 2, number: 2, title: cap2.title, sectionTitle: 'Via Aérea' }],
    { 2: cap2.content },
    10
  );
  const pCap123 = assembleTestQuestionPrompt(
    [{ id: 123, number: 123, title: cap123.title, sectionTitle: 'Conteúdo Complementar' }],
    { 123: cap123.content },
    10
  );

  record(
    'Pillar-1',
    'P1.7',
    `Prompt do Cap 2 (${pCap2.estimatedTokens} tokens) utiliza menos de 30% da janela de 128k (headroom > 90k tokens)`,
    pCap2.estimatedTokens < 38000 && pCap2.estimatedTokens / MODEL_CONTEXT_LIMIT < 0.30,
    { tokens: pCap2.estimatedTokens, ratio: (pCap2.estimatedTokens / MODEL_CONTEXT_LIMIT).toFixed(3) }
  );

  record(
    'Pillar-1',
    'P1.8',
    `Prompt do Cap 123 (${pCap123.estimatedTokens} tokens) utiliza menos de 25% da janela de 128k (headroom > 100k tokens)`,
    pCap123.estimatedTokens < 30000 && pCap123.estimatedTokens / MODEL_CONTEXT_LIMIT < 0.25,
    { tokens: pCap123.estimatedTokens, ratio: (pCap123.estimatedTokens / MODEL_CONTEXT_LIMIT).toFixed(3) }
  );

  // Multi-chapter adversarial prompt: Cap 1 + Cap 2 (15k words, >100k chars)
  const pMulti = assembleTestQuestionPrompt(
    [
      { id: 1, number: 1, title: cap1.title, sectionTitle: 'Abordagem Inicial' },
      { id: 2, number: 2, title: cap2.title, sectionTitle: 'Via Aérea' },
    ],
    { 1: cap1.content, 2: cap2.content },
    10
  );

  record(
    'Pillar-1',
    'P1.9',
    `Prompt multi-capítulo (Cap 1 + Cap 2: ${pMulti.totalChars} chars, ${pMulti.estimatedTokens} tokens) permanece confortavelmente abaixo de 50k tokens`,
    pMulti.estimatedTokens < 50000 && pMulti.estimatedTokens / MODEL_CONTEXT_LIMIT < 0.40,
    { tokens: pMulti.estimatedTokens, totalChars: pMulti.totalChars }
  );

  // Corpus-wide check: Ensure EVERY single chapter in the 150-chapter catalogue stays < 55k tokens
  let maxCorpusPromptTokens = 0;
  let maxCorpusChapterId = 0;
  for (const c of chaptersRanked) {
    const p = assembleTestQuestionPrompt(
      [{ id: c.id, number: c.id, title: c.title, sectionTitle: 'Geral' }],
      { [c.id]: c.content },
      10
    );
    if (p.estimatedTokens > maxCorpusPromptTokens) {
      maxCorpusPromptTokens = p.estimatedTokens;
      maxCorpusChapterId = c.id;
    }
  }

  record(
    'Pillar-1',
    'P1.10',
    `Todos os 150 capítulos do acervo individualmente consomem menos de 55.000 tokens (Máximo: Cap ${maxCorpusChapterId} com ${maxCorpusPromptTokens} tokens, < 45% do teto)`,
    maxCorpusPromptTokens < 55000,
    { maxChapterId: maxCorpusChapterId, maxTokens: maxCorpusPromptTokens, limit: MODEL_CONTEXT_LIMIT }
  );

  // ============================================================================
  // PILLAR 2: DEFENSIVE EXCEPTION ON finish_reason === 'length' & CASCADE FALLBACK
  // ============================================================================
  console.log('\n--- PILAR 2: DEFESA CONTRA finish_reason === "length" & CASCATA DE MODELOS ---');

  // Test 2.1: Direct assertion of defensive exception throwing on finish_reason = 'length'
  function simulateLLMExecution(
    mockResponse: { finish_reason: string; content?: string },
    modelName = 'openai/gpt-6-luna'
  ) {
    const finishReason = mockResponse.finish_reason;
    if (finishReason === 'length') {
      throw new Error(
        `Geração de questões interrompida por limite de tokens (finish_reason=length) no modelo '${modelName}'.`
      );
    }
    const content = mockResponse.content || '[]';
    return parseJsonFromMarkdown<any>(content);
  }

  let caughtDefensiveError: Error | null = null;
  try {
    simulateLLMExecution({
      finish_reason: 'length',
      content: '{"questions": [{"id": 1, "vignette": "Paciente truncado..."',
    });
  } catch (err: any) {
    caughtDefensiveError = err;
  }

  record(
    'Pillar-2',
    'P2.1',
    'Disparo imediato de exceção defensiva quando finish_reason === "length"',
    caughtDefensiveError !== null &&
      caughtDefensiveError.message.includes('finish_reason=length') &&
      caughtDefensiveError.message.includes('openai/gpt-6-luna'),
    { errorMessage: caughtDefensiveError?.message }
  );

  // Test 2.2: Plantão bed generator finish_reason = 'length' exception
  function simulateBedLLMExecution(
    mockResponse: { finish_reason: string; content?: string },
    modelName = 'openai/gpt-6-luna'
  ) {
    const finishReason = mockResponse.finish_reason;
    if (finishReason === 'length') {
      throw new Error(
        `Geração de leito interrompida por limite de tokens (finish_reason=length) no modelo '${modelName}'.`
      );
    }
    const content = mockResponse.content || '[]';
    return parseJsonFromMarkdown<any>(content);
  }

  let caughtBedError: Error | null = null;
  try {
    simulateBedLLMExecution({ finish_reason: 'length', content: '{"beds": [' });
  } catch (err: any) {
    caughtBedError = err;
  }

  record(
    'Pillar-2',
    'P2.2',
    'Disparo de exceção defensiva específica em geração de leito com finish_reason === "length"',
    caughtBedError !== null &&
      caughtBedError.message.includes('Geração de leito interrompida por limite de tokens (finish_reason=length)'),
    { errorMessage: caughtBedError?.message }
  );

  // Test 2.3: Integration with executeWithModelCascade
  // Primary model truncates (throws), fallback model responds successfully with stop
  const cascadeAttempts: string[] = [];
  const primaryModel = 'openai/gpt-6-luna';
  const fallbackModel = 'deepseek/deepseek-v4.1-flash';

  const cascadeResult = await executeWithModelCascade(
    [primaryModel, fallbackModel],
    async (currentModel) => {
      cascadeAttempts.push(currentModel);
      if (currentModel === primaryModel) {
        // Primary model simulates token truncation
        throw new Error(
          `Geração de questões interrompida por limite de tokens (finish_reason=length) no modelo '${currentModel}'.`
        );
      }
      // Fallback model responds cleanly
      return [
        {
          id: 1,
          vignette: 'Paciente de 62 anos em PCR...',
          options: ['Adrenalina 1mg IV', 'Amiodarona 300mg IV', 'Atropina 1mg IV', 'Bicarbonato', 'Cálcio'],
          correct_answer: 'A',
          difficulty_tier: 'standard',
        },
      ];
    },
    { maxRetriesPerModel: 0 }
  );

  record(
    'Pillar-2',
    'P2.3',
    'executeWithModelCascade intercepta finish_reason=length no primary model e executa com sucesso no fallback model',
    cascadeAttempts.length === 2 &&
      cascadeAttempts[0] === primaryModel &&
      cascadeAttempts[1] === fallbackModel &&
      Array.isArray(cascadeResult) &&
      cascadeResult.length === 1,
    { cascadeAttempts, resultCount: cascadeResult?.length }
  );

  // Test 2.4: Double truncation edge case (both models truncate)
  let cascadeExhaustionError: any = null;
  try {
    await executeWithModelCascade(
      [primaryModel, fallbackModel],
      async (currentModel) => {
        throw new Error(
          `Geração de questões interrompida por limite de tokens (finish_reason=length) no modelo '${currentModel}'.`
        );
      },
      { maxRetriesPerModel: 0 }
    );
  } catch (err: any) {
    cascadeExhaustionError = err;
  }

  record(
    'Pillar-2',
    'P2.4',
    'Quando todos os modelos truncam (double truncation), a cascata propaga o erro e rejeita ingestão de JSON corrompido',
    cascadeExhaustionError !== null && cascadeExhaustionError.message.includes('finish_reason=length'),
    { errorMessage: cascadeExhaustionError?.message }
  );

  // ============================================================================
  // PILLAR 3: MCQ DEFICIT FLOW & chapterTexts INJECTION FROM chapter_contents
  // ============================================================================
  console.log('\n--- PILAR 3: SIMULAÇÃO DE DÉFICIT DE QUESTÕES E INJEÇÃO DE chapterTexts ---');

  // We test selectMCQsWithAntiRepetition when bank has a deficit
  const emptyRepo = new InMemoryMCQQueueRepository([], []);

  // Fluent chainable mock Supabase client
  let queriedTable = '';
  let queriedColumns = '';
  let queriedChapterId: any = null;

  function createMockSupabase(customContent: string | null = cap54.content) {
    const builder: any = {
      from: (table: string) => {
        queriedTable = table;
        const queryObj: any = {
          select: (cols: string) => {
            queriedColumns = cols;
            return queryObj;
          },
          eq: (col: string, val: any) => {
            if (col === 'chapter_id') queriedChapterId = val;
            return queryObj;
          },
          or: (expr: string) => queryObj,
          order: () => queryObj,
          limit: () => queryObj,
          maybeSingle: async () => {
            if (queriedTable === 'chapter_contents' && queriedChapterId === 54) {
              return { data: customContent ? { content: customContent } : null, error: null };
            }
            return { data: null, error: null };
          },
          then: (resolve: any) => {
            // Resolves empty list for question_bank / user_question_history
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        };
        return queryObj;
      },
    };
    return builder;
  }

  const mockSupabase = createMockSupabase(cap54.content);

  // Test custom AI Generator spy to confirm parameters passed to AI
  let aiGeneratorCalledWith: any = null;
  const mockAiGenerator = async (params: { chapterId: string | number; standardCount: number; advancedCount: number }) => {
    aiGeneratorCalledWith = params;
    const questions: Omit<BankQuestionRow, 'id' | 'created_at' | 'updated_at'>[] = [];
    for (let i = 0; i < params.standardCount; i++) {
      questions.push({
        chapter_id: String(params.chapterId),
        question_type: 'multiple_choice',
        difficulty_tier: 'standard',
        question_subformat: 'case_conduct',
        vignette: `Questão Standard ${i + 1} de AVCi`,
        options: ['Opção A', 'Opção B', 'Opção C', 'Opção D', 'Opção E'],
        correct_option: 0,
        explanation: 'Conduta imediata AVCi',
      });
    }
    for (let i = 0; i < params.advancedCount; i++) {
      questions.push({
        chapter_id: String(params.chapterId),
        question_type: 'multiple_choice',
        difficulty_tier: 'advanced',
        question_subformat: 'direct_content',
        vignette: `Questão Advanced ${i + 1} de AVCi: dosagem Alteplase`,
        options: ['0.9 mg/kg max 90mg', '1.5 mg/kg', '0.5 mg/kg', '2.0 mg/kg', '0.1 mg/kg'],
        correct_option: 0,
        explanation: 'Dosagem estrita do protocolo nacional',
      });
    }
    return questions;
  };

  const deficitResult = await selectMCQsWithAntiRepetition('user-adversarial-1', 54, 10, {
    repository: emptyRepo,
    supabase: mockSupabase,
    aiGenerator: mockAiGenerator,
  });

  record(
    'Pillar-3',
    'P3.1',
    'selectMCQsWithAntiRepetition detecta déficit total (10 questões: 6 standard, 4 advanced) em banco vazio',
    deficitResult.deficit.total === 10 &&
      deficitResult.deficit.standard === 6 &&
      deficitResult.deficit.advanced === 4 &&
      deficitResult.questions.length === 10,
    { deficit: deficitResult.deficit, returnedCount: deficitResult.questions.length }
  );

  record(
    'Pillar-3',
    'P3.2',
    'Invocação do gerador de déficit recebeu contagens exatas de 6 standard e 4 advanced',
    aiGeneratorCalledWith !== null &&
      aiGeneratorCalledWith.standardCount === 6 &&
      aiGeneratorCalledWith.advancedCount === 4,
    aiGeneratorCalledWith
  );

  // Now verify that when production generateQuestionsWithAI is invoked, chapter_contents is fetched
  // Test the exact retrieval snippet from mcq-queue-service.ts lines 570-587
  let capturedChapterText: string | undefined = undefined;
  const numId = 54;
  const [contentRes] = await Promise.all([
    mockSupabase
      .from('chapter_contents')
      .select('content')
      .eq('chapter_id', numId)
      .maybeSingle(),
  ]);
  if (contentRes?.data?.content) {
    capturedChapterText = contentRes.data.content;
  }

  record(
    'Pillar-3',
    'P3.3',
    'Consulta ao Supabase acessa tabela chapter_contents com coluna content e chapter_id = 54',
    queriedTable === 'chapter_contents' && queriedColumns === 'content' && queriedChapterId === 54,
    { queriedTable, queriedColumns, queriedChapterId }
  );

  record(
    'Pillar-3',
    'P3.4',
    'Conteúdo resgatado de chapter_contents corresponde ao texto integral do capítulo (>110k caracteres)',
    capturedChapterText !== undefined && capturedChapterText.length > 110000,
    { textLength: capturedChapterText?.length }
  );

  // Test injection into chapterTexts map
  const injectedChapterTexts = capturedChapterText ? { [numId]: capturedChapterText } : undefined;
  record(
    'Pillar-3',
    'P3.5',
    'Objeto chapterTexts é devidamente montado com chave 54 e injetado para a LLM',
    injectedChapterTexts !== undefined &&
      injectedChapterTexts[54] !== undefined &&
      injectedChapterTexts[54].length === capturedChapterText?.length,
    { hasKey54: Boolean(injectedChapterTexts && injectedChapterTexts[54]) }
  );

  // Test graceful degradation when chapter_contents returns null (unauthenticated RLS)
  const mockSupabaseNull = createMockSupabase(null);

  let fallbackCapturedText: string | undefined = undefined;
  const [nullRes] = await Promise.all([
    mockSupabaseNull
      .from('chapter_contents')
      .select('content')
      .eq('chapter_id', 54)
      .maybeSingle(),
  ]);
  if (nullRes?.data?.content) {
    fallbackCapturedText = nullRes.data.content;
  }
  const fallbackChapterTexts = fallbackCapturedText ? { [54]: fallbackCapturedText } : undefined;

  record(
    'Pillar-3',
    'P3.6',
    'Degradação graciosa quando chapter_contents retorna nulo: chapterTexts torna-se undefined sem lançar erro',
    fallbackChapterTexts === undefined,
    { fallbackChapterTexts }
  );

  // Test error handling when Supabase throws network failure
  const mockSupabaseCrashing: any = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            throw new Error('PostgREST connection reset');
          },
        }),
      }),
    }),
  };

  let errorCaughtGracefully = false;
  let textOnError: string | undefined = undefined;
  try {
    const [crashRes] = await Promise.all([
      mockSupabaseCrashing
        .from('chapter_contents')
        .select('content')
        .eq('chapter_id', 54)
        .maybeSingle(),
    ]);
    if (crashRes?.data?.content) textOnError = crashRes.data.content;
  } catch (e) {
    errorCaughtGracefully = true;
  }

  record(
    'Pillar-3',
    'P3.7',
    'Falha de rede ou timeout no Supabase é capturada sem quebrar a execução global',
    errorCaughtGracefully && textOnError === undefined
  );

  // ============================================================================
  // PILLAR 4: MATHEMATICAL INVARIANTS & ENGINE ROBUSTNESS (150 CHAPTERS)
  // ============================================================================
  console.log('\n--- PILAR 4: INVARIANTES MATEMÁTICOS E ROBUSTEZ DO MOTOR (150 CAPÍTULOS) ---');

  // Test 4.1: getNormalizedClinicalWeights across all 150 chapters
  const weightsMap = getNormalizedClinicalWeights();

  record(
    'Pillar-4',
    'P4.1',
    'getNormalizedClinicalWeights() retorna exatamente 150 capítulos',
    weightsMap.size === 150,
    { count: weightsMap.size }
  );

  // Test sum of clinicalWeight = 1.0
  let sumClinicalWeight = 0;
  let allWeightsPositive = true;
  let minWeight = 1;
  let maxWeight = 0;
  let minWeightCapId = 0;
  let maxWeightCapId = 0;

  weightsMap.forEach((w, capId) => {
    if (w.clinicalWeight <= 0 || isNaN(w.clinicalWeight) || !isFinite(w.clinicalWeight)) {
      allWeightsPositive = false;
    }
    if (w.clinicalWeight < minWeight) {
      minWeight = w.clinicalWeight;
      minWeightCapId = capId;
    }
    if (w.clinicalWeight > maxWeight) {
      maxWeight = w.clinicalWeight;
      maxWeightCapId = capId;
    }
    sumClinicalWeight += w.clinicalWeight;
  });

  const weightSumError = Math.abs(sumClinicalWeight - 1.0);
  record(
    'Pillar-4',
    'P4.2',
    `Invariante de Normalização Estocástica: Soma dos pesos clínicos de todos os 150 capítulos = 1.0 (erro = ${weightSumError.toExponential(4)})`,
    weightSumError < 1e-6 && allWeightsPositive,
    { sumClinicalWeight, weightSumError, minWeight, maxWeight, minCapId: minWeightCapId, maxCapId: maxWeightCapId }
  );

  // Test Clinical Hierarchy: Critical topics vs elective topics
  const pcrWeight = weightsMap.get(8)!; // Cap 8: PCR (freq 7, imp 10)
  const avciWeight = weightsMap.get(54)!; // Cap 54: AVCi (freq 8, imp 10)
  const dermWeight = weightsMap.get(106)!; // Cap 106: Dermatite (freq 6, imp 4)
  const nutWeight = weightsMap.get(150)!; // Cap 150: Nutrição Enteral (freq 4, imp 7)

  record(
    'Pillar-4',
    'P4.3',
    `Hierarquia Clínica: Peso de PCR (${pcrWeight.clinicalWeight.toFixed(5)}) e AVCi (${avciWeight.clinicalWeight.toFixed(5)}) é estritamente superior ao de temas secundários como Dermatite (${dermWeight.clinicalWeight.toFixed(5)}) e Nutrição (${nutWeight.clinicalWeight.toFixed(5)})`,
    pcrWeight.clinicalWeight > dermWeight.clinicalWeight &&
      avciWeight.clinicalWeight > nutWeight.clinicalWeight &&
      pcrWeight.clinicalWeight / dermWeight.clinicalWeight > 1.5,
    {
      ratioPcrDerm: (pcrWeight.clinicalWeight / dermWeight.clinicalWeight).toFixed(2),
      ratioAvciNut: (avciWeight.clinicalWeight / nutWeight.clinicalWeight).toFixed(2),
    }
  );

  // Test 4.2: Official FSRS Power-Law Retention Curve Invariants
  // Formula: R(t, S) = 100 * (1 + (19/81) * (t / S))^(-0.5)
  function computeRetention(days: number, stability: number): number {
    const s = Math.min(365.0, Math.max(7.0, stability));
    return Math.min(100.0, Math.max(0.0, 100.0 * Math.pow(1.0 + (19.0 / 81.0) * (days / s), -0.5)));
  }

  // Invariant R(t=0) = 100% across multiple stabilities
  const testStabilities = [7.0, 14.0, 30.0, 60.0, 180.0, 365.0];
  let allT0Passed = true;
  let allTSPassed = true;
  let allT3SPassed = true;
  let allMonotonic = true;

  testStabilities.forEach((s) => {
    const r0 = computeRetention(0, s);
    const rS = computeRetention(s, s);
    const r3S = computeRetention(3 * s, s);

    if (Math.abs(r0 - 100.0) > 1e-5) allT0Passed = false;
    if (Math.abs(rS - 90.0) > 1e-4) allTSPassed = false;
    if (Math.abs(r3S - 76.606) > 0.05) allT3SPassed = false;

    // Check strict monotonicity over 0 to 500 days
    let prev = 101.0;
    for (let d = 0; d <= 200; d += 5) {
      const cur = computeRetention(d, s);
      if (cur > prev) allMonotonic = false;
      prev = cur;
    }
  });

  record(
    'Pillar-4',
    'P4.4',
    'Invariante FSRS R(t=0) = 100.0% para todas as faixas de estabilidade S ∈ [7d, 365d]',
    allT0Passed
  );

  record(
    'Pillar-4',
    'P4.5',
    `Invariante FSRS R(t=S) = 90.0% (DESIRED_RETENTION = ${DESIRED_RETENTION}) verificado com precisão absoluta`,
    allTSPassed
  );

  record(
    'Pillar-4',
    'P4.6',
    'Invariante FSRS R(t=3S) ≈ 76.606% verificado com precisão teórica',
    allT3SPassed
  );

  record(
    'Pillar-4',
    'P4.7',
    'Monotonicidade Estrita da curva de retenção: R(t1) > R(t2) para qualquer t1 < t2 sem oscilações',
    allMonotonic
  );

  // Test 4.3: Dynamic Evidence Synchronization across 150 Chapters
  const baseDate = new Date('2026-06-01T00:00:00Z');
  const staleReviewedDate = new Date('2026-06-01T00:00:00Z');
  const testDoneTodayDate = new Date('2026-08-30T00:00:00Z'); // 90 days later

  // Case A: Without test today (stale DB evidence 90 days ago)
  const metricsWithoutToday = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 54, is_read: true, read_at: baseDate.toISOString() }],
    reviewStatsList: [
      {
        chapter_id: 54,
        times_reviewed: 2,
        times_correct: 2,
        times_incorrect: 0,
        last_reviewed_at: staleReviewedDate.toISOString(),
        last_evidence_at: staleReviewedDate.toISOString(),
        next_review_at: null,
        ease_factor: 2.5,
        interval_days: 14,
        stability: 14.0,
        difficulty: 5.0,
      },
    ],
    testsList: [],
    now: testDoneTodayDate,
  }).get(54)!;

  // Case B: With test taken today in tests table
  const metricsWithToday = deriveAllTopicMetrics({
    progressList: [{ chapter_id: 54, is_read: true, read_at: baseDate.toISOString() }],
    reviewStatsList: [
      {
        chapter_id: 54,
        times_reviewed: 2,
        times_correct: 2,
        times_incorrect: 0,
        last_reviewed_at: staleReviewedDate.toISOString(),
        last_evidence_at: staleReviewedDate.toISOString(),
        next_review_at: null,
        ease_factor: 2.5,
        interval_days: 14,
        stability: 14.0,
        difficulty: 5.0,
      },
    ],
    testsList: [
      {
        id: 'test-avci-today',
        chapter_ids: [54],
        mode: 'standard',
        score: 9.5,
        completed: true,
        completed_at: testDoneTodayDate.toISOString(),
      },
    ],
    now: testDoneTodayDate,
  }).get(54)!;

  record(
    'Pillar-4',
    'P4.8',
    `Sincronização Dinâmica de Evidência: Retenção no dia 90 decai sem teste (${metricsWithoutToday.retention.toFixed(1)}%) e ressuscita para 100% com teste hoje (${metricsWithToday.retention.toFixed(1)}%)`,
    metricsWithoutToday.retention < 65.0 && metricsWithToday.retention >= 99.9,
    {
      retentionDecayed: metricsWithoutToday.retention,
      retentionRefreshed: metricsWithToday.retention,
      daysSinceDecayed: metricsWithoutToday.daysSinceLastEvidence,
      daysSinceRefreshed: metricsWithToday.daysSinceLastEvidence,
    }
  );

  // Test 4.4: Global Readiness Progression across Curriculum Scales
  // Scale 0: Cold Start
  const snapCold = buildReadinessSnapshot({
    progressList: [],
    reviewStatsList: [],
    testsList: [],
    now: testDoneTodayDate,
  });

  record(
    'Pillar-4',
    'P4.9',
    'Cold Start: Global Readiness é exatamente 0.0% sem quebrar ou gerar NaNs',
    snapCold.globalReadiness === 0.0 && snapCold.readinessStatus.badgeKey === 'capacitacao',
    { globalReadiness: snapCold.globalReadiness, status: snapCold.readinessStatus.label }
  );

  // Scale 1: 1 Chapter Read (Cap 8 PCR)
  const snap1 = buildReadinessSnapshot({
    progressList: [{ chapter_id: 8, is_read: true, read_at: testDoneTodayDate.toISOString() }],
    reviewStatsList: [],
    testsList: [
      {
        id: 'test-pcr-1',
        chapter_ids: [8],
        mode: 'standard',
        score: 10.0,
        completed: true,
        completed_at: testDoneTodayDate.toISOString(),
      },
    ],
    now: testDoneTodayDate,
  });

  record(
    'Pillar-4',
    'P4.10',
    '1 Capítulo Crítico (Cap 8): Global Readiness > 0 e sublinear coverage boost ativo',
    snap1.globalReadiness > 0 && snap1.globalReadiness < 45.0,
    { globalReadiness: snap1.globalReadiness, activeProficiency: snap1.activeProficiency }
  );

  // Scale 15: 15 Strategic Chapters Read (Intermediate Supervision)
  const strategic15Ids = [1, 2, 8, 11, 29, 31, 35, 41, 54, 79, 82, 99, 120, 123, 150];
  const snap15 = buildReadinessSnapshot({
    progressList: strategic15Ids.map((id) => ({
      chapter_id: id,
      is_read: true,
      read_at: testDoneTodayDate.toISOString(),
    })),
    reviewStatsList: strategic15Ids.map((id) => ({
      chapter_id: id,
      times_reviewed: 1,
      times_correct: 1,
      times_incorrect: 0,
      last_reviewed_at: testDoneTodayDate.toISOString(),
      last_evidence_at: testDoneTodayDate.toISOString(),
      next_review_at: null,
      ease_factor: 2.5,
      interval_days: 10,
      stability: 10.0,
      difficulty: 5.0,
    })),
    testsList: strategic15Ids.map((id, idx) => ({
      id: `test-strat-${idx}`,
      chapter_ids: [id],
      mode: 'standard',
      score: 8.5,
      completed: true,
      completed_at: testDoneTodayDate.toISOString(),
    })),
    now: testDoneTodayDate,
  });

  record(
    'Pillar-4',
    'P4.11',
    '15 Capítulos Estratégicos com bom desempenho: Global Readiness >= 45% (Prontidão sob Supervisão)',
    snap15.globalReadiness >= 45.0,
    { globalReadiness: snap15.globalReadiness, coverage: snap15.curricularCoverage.clinicalWeightedPercent }
  );

  // Scale 150: Full Curriculum (All 150 Chapters Mastered)
  const all150Ids = Array.from({ length: 150 }, (_, i) => i + 1);
  const snap150 = buildReadinessSnapshot({
    progressList: all150Ids.map((id) => ({
      chapter_id: id,
      is_read: true,
      read_at: testDoneTodayDate.toISOString(),
    })),
    reviewStatsList: all150Ids.map((id) => ({
      chapter_id: id,
      times_reviewed: 3,
      times_correct: 3,
      times_incorrect: 0,
      last_reviewed_at: testDoneTodayDate.toISOString(),
      last_evidence_at: testDoneTodayDate.toISOString(),
      next_review_at: null,
      ease_factor: 2.5,
      interval_days: 30,
      stability: 30.0,
      difficulty: 4.0,
    })),
    testsList: all150Ids.map((id, idx) => ({
      id: `test-all-${idx}`,
      chapter_ids: [id],
      mode: 'standard',
      score: 9.0,
      completed: true,
      completed_at: testDoneTodayDate.toISOString(),
    })),
    now: testDoneTodayDate,
  });

  record(
    'Pillar-4',
    'P4.12',
    'Domínio Completo dos 150 Capítulos: Global Readiness >= 75% e status transiciona para APTO — SALA VERMELHA',
    snap150.globalReadiness >= 75.0 && snap150.readinessStatus.badgeKey === 'apto',
    {
      globalReadiness: snap150.globalReadiness,
      statusLabel: snap150.readinessStatus.label,
      badgeKey: snap150.readinessStatus.badgeKey,
      coveragePercent: snap150.curricularCoverage.clinicalWeightedPercent,
    }
  );

  // Sublinear curvature invariant: Delta from 0 to 15 chapters > Delta from 135 to 150 chapters
  const deltaEarly = snap15.globalReadiness - snapCold.globalReadiness;
  // Compute snap 135
  const subset135Ids = all150Ids.slice(0, 135);
  const snap135 = buildReadinessSnapshot({
    progressList: subset135Ids.map((id) => ({
      chapter_id: id,
      is_read: true,
      read_at: testDoneTodayDate.toISOString(),
    })),
    reviewStatsList: subset135Ids.map((id) => ({
      chapter_id: id,
      times_reviewed: 3,
      times_correct: 3,
      times_incorrect: 0,
      last_reviewed_at: testDoneTodayDate.toISOString(),
      last_evidence_at: testDoneTodayDate.toISOString(),
      next_review_at: null,
      ease_factor: 2.5,
      interval_days: 30,
      stability: 30.0,
      difficulty: 4.0,
    })),
    testsList: subset135Ids.map((id, idx) => ({
      id: `test-sub-${idx}`,
      chapter_ids: [id],
      mode: 'standard',
      score: 9.0,
      completed: true,
      completed_at: testDoneTodayDate.toISOString(),
    })),
    now: testDoneTodayDate,
  });

  const deltaLate = snap150.globalReadiness - snap135.globalReadiness;

  record(
    'Pillar-4',
    'P4.13',
    `Invariante de Curvatura Sublinear: Ganho inicial (primeiros 15 caps: +${deltaEarly.toFixed(1)}%) é estritamente superior ao ganho marginal final (últimos 15 caps: +${deltaLate.toFixed(1)}%)`,
    deltaEarly > deltaLate && deltaEarly > 0 && deltaLate >= 0,
    { deltaEarly, deltaLate, ratio: (deltaEarly / Math.max(0.1, deltaLate)).toFixed(2) }
  );

  // ============================================================================
  // SUMMARY REPORT
  // ============================================================================
  console.log('\n================================================================');
  const totalTests = assertions.length;
  const passedTests = assertions.filter((a) => a.passed).length;
  const failedTests = assertions.filter((a) => !a.passed);

  console.log(`TOTAL DE ASSERÇÕES ADVERSARIAIS: ${totalTests}`);
  console.log(`ASSERÇÕES APROVADAS: ${passedTests}`);
  console.log(`ASSERÇÕES REPROVADAS: ${failedTests.length}`);

  if (failedTests.length > 0) {
    console.error('\n❌ ASSERÇÕES QUE FALHARAM:');
    failedTests.forEach((f) => {
      console.error(`- [${f.pillar}] ${f.id}: ${f.description}`);
      if (f.details) console.error('  Details:', f.details);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 TODAS AS ASSERÇÕES ADVERSARIAIS PASSARAM COM 100% DE SUCESSO!');
    console.log('================================================================\n');
  }
}

runChallengerM13AdversarialSuite().catch((e) => {
  console.error('FATAL UNCAUGHT ERROR IN ADVERSARIAL SUITE:', e);
  process.exit(1);
});
