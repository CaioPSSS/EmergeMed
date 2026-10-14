import { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { QuestionItem } from '@/lib/ai/openrouter';
import { generateQuestionsWithAI } from '@/lib/ai/openrouter';
import { getChapterMetadata } from '@/lib/chapters-service';

export interface BankQuestionRow {
  id: string;
  chapter_id: string | number;
  question_type: string;
  difficulty_tier: 'standard' | 'advanced';
  question_subformat: 'case_conduct' | 'direct_content' | 'diagnostic_criteria';
  vignette: string;
  options: string[];
  correct_option: number;
  explanation: string;
  times_shown?: number;
  times_correct?: number;
  times_incorrect?: number;
  avg_score?: number;
  difficulty_computed?: number;
  is_curated?: boolean;
  source?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserQuestionHistoryRow {
  id?: string;
  user_id: string;
  question_id: string;
  chapter_id: string;
  last_is_correct: boolean;
  times_answered: number;
  times_correct: number;
  last_answered_at: string;
}

export interface SelectMCQResult {
  questions: QuestionItem[];
  source: 'bank' | 'hybrid' | 'generated';
  deficit: {
    standard: number;
    advanced: number;
    total: number;
  };
  recycled: boolean;
}

export interface MCQQueueRepository {
  getBankQuestions(chapterId: string | number): Promise<BankQuestionRow[]>;
  getUserQuestionHistory(userId: string, chapterId: string | number): Promise<UserQuestionHistoryRow[]>;
  saveNewBankQuestions(questions: Omit<BankQuestionRow, 'id' | 'created_at' | 'updated_at'>[]): Promise<BankQuestionRow[]>;
  recordUserAnswers(
    userId: string,
    chapterId: string | number,
    answers: { questionId: string; isCorrect: boolean }[]
  ): Promise<void>;
}

/**
 * In-memory repository implementation for deterministic unit tests, verification scripts,
 * and offline mocking.
 */
export class InMemoryMCQQueueRepository implements MCQQueueRepository {
  private bankQuestions: BankQuestionRow[] = [];
  private userHistory: UserQuestionHistoryRow[] = [];

  constructor(
    initialBankQuestions: BankQuestionRow[] = [],
    initialUserHistory: UserQuestionHistoryRow[] = []
  ) {
    this.bankQuestions = [...initialBankQuestions];
    this.userHistory = [...initialUserHistory];
  }

  async getBankQuestions(chapterId: string | number): Promise<BankQuestionRow[]> {
    const cidStr = String(chapterId);
    return this.bankQuestions.filter((q) => String(q.chapter_id) === cidStr);
  }

  async getUserQuestionHistory(userId: string, chapterId: string | number): Promise<UserQuestionHistoryRow[]> {
    const cidStr = String(chapterId);
    return this.userHistory.filter((h) => h.user_id === userId && String(h.chapter_id) === cidStr);
  }

  async saveNewBankQuestions(
    questions: Omit<BankQuestionRow, 'id' | 'created_at' | 'updated_at'>[]
  ): Promise<BankQuestionRow[]> {
    const saved: BankQuestionRow[] = questions.map((q, idx) => {
      const row: BankQuestionRow = {
        ...q,
        id: `mock-bq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${idx}`,
        times_shown: 0,
        times_correct: 0,
        times_incorrect: 0,
        avg_score: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.bankQuestions.push(row);
      return row;
    });
    return saved;
  }

  async recordUserAnswers(
    userId: string,
    chapterId: string | number,
    answers: { questionId: string; isCorrect: boolean }[]
  ): Promise<void> {
    const cidStr = String(chapterId);
    const nowIso = new Date().toISOString();

    for (const ans of answers) {
      // 1. Update user question history
      const existingIdx = this.userHistory.findIndex(
        (h) => h.user_id === userId && h.question_id === ans.questionId
      );

      if (existingIdx >= 0) {
        const prev = this.userHistory[existingIdx];
        this.userHistory[existingIdx] = {
          ...prev,
          last_is_correct: ans.isCorrect,
          times_answered: prev.times_answered + 1,
          times_correct: prev.times_correct + (ans.isCorrect ? 1 : 0),
          last_answered_at: nowIso,
        };
      } else {
        this.userHistory.push({
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          user_id: userId,
          question_id: ans.questionId,
          chapter_id: cidStr,
          last_is_correct: ans.isCorrect,
          times_answered: 1,
          times_correct: ans.isCorrect ? 1 : 0,
          last_answered_at: nowIso,
        });
      }

      // 2. Increment question bank usage statistics
      const qBank = this.bankQuestions.find((q) => q.id === ans.questionId);
      if (qBank) {
        const shown = (qBank.times_shown || 0) + 1;
        const correct = (qBank.times_correct || 0) + (ans.isCorrect ? 1 : 0);
        const incorrect = (qBank.times_incorrect || 0) + (ans.isCorrect ? 0 : 1);
        qBank.times_shown = shown;
        qBank.times_correct = correct;
        qBank.times_incorrect = incorrect;
        qBank.avg_score = Number(((correct / shown) * 10).toFixed(2));
        qBank.updated_at = nowIso;
      }
    }
  }

  // Debug & inspection helpers for tests
  getAllBankQuestions(): BankQuestionRow[] {
    return [...this.bankQuestions];
  }

  getAllUserHistory(): UserQuestionHistoryRow[] {
    return [...this.userHistory];
  }
}

/**
 * Supabase-backed repository implementation for production usage.
 */
export class SupabaseMCQQueueRepository implements MCQQueueRepository {
  private client: SupabaseClient | any;

  constructor(client: SupabaseClient | any) {
    this.client = client;
  }

  async getBankQuestions(chapterId: string | number): Promise<BankQuestionRow[]> {
    const cidNum = Number(chapterId);
    let query = this.client
      .from('question_bank')
      .select('*')
      .eq('question_type', 'multiple_choice');

    if (!isNaN(cidNum) && String(cidNum) === String(chapterId)) {
      query = query.or(`chapter_id.eq.${cidNum},chapter_id.eq.${String(chapterId)}`);
    } else {
      query = query.eq('chapter_id', String(chapterId));
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Erro ao consultar question_bank:', error);
      return [];
    }

    return (data || []).map((q: any) => ({
      id: String(q.id),
      chapter_id: q.chapter_id,
      question_type: q.question_type,
      difficulty_tier: q.difficulty_tier === 'advanced' ? 'advanced' : 'standard',
      question_subformat:
        q.question_subformat === 'direct_content' || q.question_subformat === 'diagnostic_criteria'
          ? q.question_subformat
          : 'case_conduct',
      vignette: q.vignette,
      options: Array.isArray(q.options) ? q.options : [],
      correct_option: Number(q.correct_option) || 0,
      explanation: q.explanation || '',
      times_shown: q.times_shown || 0,
      times_correct: q.times_correct || 0,
      times_incorrect: q.times_incorrect || 0,
      avg_score: q.avg_score || 0,
      created_at: q.created_at,
      updated_at: q.updated_at,
    }));
  }

  async getUserQuestionHistory(userId: string, chapterId: string | number): Promise<UserQuestionHistoryRow[]> {
    const cidStr = String(chapterId);
    const { data, error } = await this.client
      .from('user_question_history')
      .select('*')
      .eq('user_id', userId)
      .eq('chapter_id', cidStr);

    if (error) {
      console.warn('Erro ao consultar user_question_history:', error);
      return [];
    }

    return (data || []).map((h: any) => ({
      id: h.id,
      user_id: h.user_id,
      question_id: String(h.question_id),
      chapter_id: String(h.chapter_id),
      last_is_correct: Boolean(h.last_is_correct),
      times_answered: Number(h.times_answered) || 1,
      times_correct: Number(h.times_correct) || 0,
      last_answered_at: h.last_answered_at || new Date().toISOString(),
    }));
  }

  async saveNewBankQuestions(
    questions: Omit<BankQuestionRow, 'id' | 'created_at' | 'updated_at'>[]
  ): Promise<BankQuestionRow[]> {
    const toInsert = questions.map((q) => ({
      chapter_id: isNaN(Number(q.chapter_id)) ? q.chapter_id : Number(q.chapter_id),
      question_type: 'multiple_choice',
      difficulty_tier: q.difficulty_tier,
      question_subformat: q.question_subformat,
      vignette: q.vignette,
      options: q.options,
      correct_option: q.correct_option,
      explanation: q.explanation,
      times_shown: 0,
      times_correct: 0,
      times_incorrect: 0,
      avg_score: 0,
      source: q.source || 'ai_generated',
    }));

    const { data, error } = await this.client
      .from('question_bank')
      .insert(toInsert)
      .select();

    if (error) {
      console.error('Falha ao salvar novas questões em question_bank:', error);
      return [];
    }

    return (data || []).map((q: any) => ({
      id: String(q.id),
      chapter_id: q.chapter_id,
      question_type: q.question_type,
      difficulty_tier: q.difficulty_tier === 'advanced' ? 'advanced' : 'standard',
      question_subformat: q.question_subformat || 'case_conduct',
      vignette: q.vignette,
      options: q.options,
      correct_option: q.correct_option,
      explanation: q.explanation,
      times_shown: q.times_shown,
      times_correct: q.times_correct,
      times_incorrect: q.times_incorrect,
      avg_score: q.avg_score,
      created_at: q.created_at,
      updated_at: q.updated_at,
    }));
  }

  async recordUserAnswers(
    userId: string,
    chapterId: string | number,
    answers: { questionId: string; isCorrect: boolean }[]
  ): Promise<void> {
    const cidStr = String(chapterId);
    const nowIso = new Date().toISOString();

    for (const ans of answers) {
      // 1. Fetch current history for (user_id, question_id)
      const { data: existing } = await this.client
        .from('user_question_history')
        .select('*')
        .eq('user_id', userId)
        .eq('question_id', ans.questionId)
        .maybeSingle();

      const timesAnswered = (existing?.times_answered || 0) + 1;
      const timesCorrect = (existing?.times_correct || 0) + (ans.isCorrect ? 1 : 0);

      await this.client
        .from('user_question_history')
        .upsert(
          {
            user_id: userId,
            question_id: ans.questionId,
            chapter_id: cidStr,
            last_is_correct: ans.isCorrect,
            times_answered: timesAnswered,
            times_correct: timesCorrect,
            last_answered_at: nowIso,
          },
          { onConflict: 'user_id,question_id' }
        );

      // 2. Increment stats in question_bank
      const { data: qb } = await this.client
        .from('question_bank')
        .select('times_shown, times_correct, times_incorrect')
        .eq('id', ans.questionId)
        .maybeSingle();

      if (qb) {
        const shown = (qb.times_shown || 0) + 1;
        const correct = (qb.times_correct || 0) + (ans.isCorrect ? 1 : 0);
        const incorrect = (qb.times_incorrect || 0) + (ans.isCorrect ? 0 : 1);
        const avgScore = Number(((correct / shown) * 10).toFixed(2));

        await this.client
          .from('question_bank')
          .update({
            times_shown: shown,
            times_correct: correct,
            times_incorrect: incorrect,
            avg_score: avgScore,
            updated_at: nowIso,
          })
          .eq('id', ans.questionId);
      }
    }
  }
}

export interface SelectMCQOptions {
  supabase?: any;
  repository?: MCQQueueRepository;
  aiGenerator?: (params: {
    chapterId: string | number;
    standardCount: number;
    advancedCount: number;
  }) => Promise<Omit<BankQuestionRow, 'id' | 'created_at' | 'updated_at'>[]>;
  userSettings?: {
    apiKey?: string;
    questionModel?: string;
    fallbackModel?: string;
  };
}

/**
 * Anti-Repetition Spaced Repetition MCQ Selection Algorithm (R2 & R3)
 *
 * Rules:
 * - Count: exactly 10 questions (or specified count).
 * - Quota: 60% Standard (6 Qs) and 40% Advanced (4 Qs).
 * - Partitions:
 *   - P1 Inéditas: never answered by user. Highest priority.
 *   - P2 Erradas: last_is_correct === false. Remediation priority over correct questions.
 *   - P3 Acertadas: last_is_correct === true. STRICT RULE: Acertadas ONLY re-appear if
 *     ALL available questions for that chapter in the bank have been answered and correct (FIFO by last_answered_at ASC).
 * - Deficit: if bank lacks sufficient standard or advanced questions, fallback generates
 *   the exact deficit via AI, saving new questions to `question_bank`.
 * - bankQuestionId is preserved on every returned question!
 */
export async function selectMCQsWithAntiRepetition(
  userId: string,
  chapterId: string | number,
  count: number = 10,
  options: SelectMCQOptions = {}
): Promise<SelectMCQResult> {
  const cidStr = String(chapterId);

  // 1. Resolve repository
  let repo: MCQQueueRepository;
  if (options.repository) {
    repo = options.repository;
  } else if (options.supabase) {
    repo = new SupabaseMCQQueueRepository(options.supabase);
  } else {
    try {
      const serverSupabase = await createClient();
      repo = new SupabaseMCQQueueRepository(serverSupabase);
    } catch {
      // In case outside Next.js request context (e.g. CLI), fallback to in-memory
      repo = new InMemoryMCQQueueRepository();
    }
  }

  // 2. Fetch all bank questions and user question history for this chapter
  const allBankQuestions = await repo.getBankQuestions(chapterId);
  const userHistory = await repo.getUserQuestionHistory(userId, chapterId);

  const historyMap = new Map<string, UserQuestionHistoryRow>();
  for (const h of userHistory) {
    historyMap.set(h.question_id, h);
  }

  // 3. Quota calculation (60% standard, 40% advanced)
  const targetStandard = Math.round(count * 0.6);
  const targetAdvanced = count - targetStandard;

  // 4. Strict cycle completeness check for P3 (Acertadas):
  // Acertadas ONLY re-appear if ALL available questions for that chapter in the bank
  // have been answered AND are currently marked correct (last_is_correct === true).
  const hasAnyUnseenInBank = allBankQuestions.some((q) => {
    const hist = historyMap.get(q.id);
    return !hist || hist.times_answered === 0;
  });

  const hasAnyWrongInBank = allBankQuestions.some((q) => {
    const hist = historyMap.get(q.id);
    return hist && !hist.last_is_correct;
  });

  const isCycleComplete =
    allBankQuestions.length > 0 && !hasAnyUnseenInBank && !hasAnyWrongInBank;
  const canRecycleCorrect = isCycleComplete;

  // Helper to partition questions by tier and SRS status
  function partitionTier(tier: 'standard' | 'advanced') {
    const tierBank = allBankQuestions.filter(
      (q) => (q.difficulty_tier === 'advanced' ? 'advanced' : 'standard') === tier
    );

    const unseen: BankQuestionRow[] = [];
    const wrong: BankQuestionRow[] = [];
    const correct: BankQuestionRow[] = [];

    for (const q of tierBank) {
      const hist = historyMap.get(q.id);
      if (!hist || hist.times_answered === 0) {
        unseen.push(q);
      } else if (!hist.last_is_correct) {
        wrong.push(q);
      } else {
        correct.push(q);
      }
    }

    // Balance unseen across subformats (round-robin / alternating)
    const unseenCaseConduct = unseen.filter((q) => q.question_subformat === 'case_conduct');
    const unseenDirectContent = unseen.filter((q) => q.question_subformat === 'direct_content');
    const unseenDiagCriteria = unseen.filter((q) => q.question_subformat === 'diagnostic_criteria');
    const balancedUnseen: BankQuestionRow[] = [];
    const maxLen = Math.max(
      unseenCaseConduct.length,
      unseenDirectContent.length,
      unseenDiagCriteria.length
    );
    for (let i = 0; i < maxLen; i++) {
      if (i < unseenCaseConduct.length) balancedUnseen.push(unseenCaseConduct[i]);
      if (i < unseenDirectContent.length) balancedUnseen.push(unseenDirectContent[i]);
      if (i < unseenDiagCriteria.length) balancedUnseen.push(unseenDiagCriteria[i]);
    }

    // Sort wrong questions by last_answered_at ascending (oldest attempt first)
    wrong.sort((a, b) => {
      const ta = new Date(historyMap.get(a.id)?.last_answered_at || 0).getTime();
      const tb = new Date(historyMap.get(b.id)?.last_answered_at || 0).getTime();
      return ta - tb;
    });

    // Sort correct questions by last_answered_at ascending (FIFO for end-of-queue recycling)
    correct.sort((a, b) => {
      const ta = new Date(historyMap.get(a.id)?.last_answered_at || 0).getTime();
      const tb = new Date(historyMap.get(b.id)?.last_answered_at || 0).getTime();
      return ta - tb;
    });

    return {
      unseen: balancedUnseen.length > 0 ? balancedUnseen : unseen,
      wrong,
      correct,
    };
  }

  const standardPartition = partitionTier('standard');
  const advancedPartition = partitionTier('advanced');

  // Select questions per tier
  function selectFromTier(
    partition: { unseen: BankQuestionRow[]; wrong: BankQuestionRow[]; correct: BankQuestionRow[] },
    targetCount: number
  ) {
    const selected: BankQuestionRow[] = [];

    // P1: Erradas (Remediação prioritária nos próximos simulados)
    for (const q of partition.wrong) {
      if (selected.length < targetCount) selected.push(q);
    }

    // P2: Inéditas (Preenchimento de vagas com questões nunca vistas)
    for (const q of partition.unseen) {
      if (selected.length < targetCount) selected.push(q);
    }

    // P3: Acertadas (Fim da fila — ONLY if cycle is strictly complete)
    let usedCorrect = false;
    if (selected.length < targetCount && canRecycleCorrect) {
      for (const q of partition.correct) {
        if (selected.length < targetCount) {
          selected.push(q);
          usedCorrect = true;
        }
      }
    }

    const deficit = Math.max(0, targetCount - selected.length);
    return { selected, deficit, usedCorrect };
  }

  const stdSelection = selectFromTier(standardPartition, targetStandard);
  const advSelection = selectFromTier(advancedPartition, targetAdvanced);

  const deficit = {
    standard: stdSelection.deficit,
    advanced: advSelection.deficit,
    total: stdSelection.deficit + advSelection.deficit,
  };

  const selectedBankRows = [...stdSelection.selected, ...advSelection.selected];
  const recycled = stdSelection.usedCorrect || advSelection.usedCorrect;

  // 5. Fallback generation for deficits
  let generatedBankRows: BankQuestionRow[] = [];

  if (deficit.total > 0) {
    if (options.aiGenerator) {
      // Use provided custom AI generator (e.g. for unit tests)
      const generatedRaw = await options.aiGenerator({
        chapterId,
        standardCount: deficit.standard,
        advancedCount: deficit.advanced,
      });

      if (generatedRaw && generatedRaw.length > 0) {
        generatedBankRows = await repo.saveNewBankQuestions(generatedRaw);
      }
    } else {
      // Production AI generation via generateQuestionsWithAI
      try {
        const apiKey = options.userSettings?.apiKey || process.env.OPENROUTER_API_KEY;
        const model = options.userSettings?.questionModel || 'openai/gpt-6-luna';
        const fallbackModel = options.userSettings?.fallbackModel || 'deepseek/deepseek-v4.1-flash';

        let capMetadata: any = null;
        let chapterText: string | undefined = undefined;
        const numId = Number(chapterId) || 1;

        if (options.supabase) {
          try {
            const [meta, contentRes] = await Promise.all([
              getChapterMetadata(options.supabase, numId, userId),
              options.supabase
                .from('chapter_contents')
                .select('content')
                .eq('chapter_id', numId)
                .maybeSingle(),
            ]);
            capMetadata = meta;
            if (contentRes?.data?.content) {
              chapterText = contentRes.data.content;
            }
          } catch (e) {
            console.warn('Erro ao carregar metadados ou conteúdo do capítulo para IA:', e);
          }
        }

        const chaptersInfo = [
          {
            id: numId,
            number: capMetadata?.number || numId,
            title: capMetadata?.title || `Capítulo ${chapterId}`,
            sectionTitle: capMetadata?.sectionTitle || 'Emergência Clínica',
          },
        ];

        const aiQuestions = await generateQuestionsWithAI({
          apiKey,
          model,
          fallbackModel,
          chaptersInfo,
          chapterTexts: chapterText ? { [numId]: chapterText } : undefined,
          count: deficit.total,
          questionType: 'multiple_choice',
          difficultyMix: {
            standard: deficit.standard,
            advanced: deficit.advanced,
          },
          isPostChapter: true,
        });

        // Subformat round-robin assignments if model omitted
        const subformats: ('case_conduct' | 'direct_content' | 'diagnostic_criteria')[] = [
          'case_conduct',
          'direct_content',
          'diagnostic_criteria',
        ];

        // Ensure difficulty tags match requested deficit counts
        const toSave = aiQuestions.map((q, idx) => {
          const isStandardIdx = idx < deficit.standard;
          const assignedTier: 'standard' | 'advanced' = isStandardIdx ? 'standard' : 'advanced';
          const assignedSubformat =
            q.question_subformat || subformats[idx % subformats.length];

          return {
            chapter_id: cidStr,
            question_type: 'multiple_choice',
            difficulty_tier: assignedTier,
            question_subformat: assignedSubformat,
            vignette: q.vignette,
            options: q.options || ['Opção A', 'Opção B', 'Opção C', 'Opção D', 'Opção E'],
            correct_option: typeof q.correctOption === 'number' ? q.correctOption : 0,
            explanation: q.explanation || 'Explicação clínica baseada nos protocolos de emergência.',
            source: 'ai_deficit_fallback',
          };
        });

        if (toSave.length > 0) {
          generatedBankRows = await repo.saveNewBankQuestions(toSave);
        }
      } catch (genErr) {
        console.warn('Falha na geração via IA de déficit de questões:', genErr);
      }
    }
  }

  // 6. Combine banked and fallback questions
  const combinedRows = [...selectedBankRows, ...generatedBankRows];

  // 7. Map to QuestionItem format ensuring bankQuestionId is preserved
  const finalQuestions: QuestionItem[] = combinedRows.map((row, idx) => ({
    id: idx + 1,
    chapterId: row.chapter_id,
    type: 'multiple_choice',
    vignette: row.vignette,
    options: row.options,
    correctOption: row.correct_option,
    explanation: row.explanation,
    difficulty_tier: row.difficulty_tier,
    question_subformat: row.question_subformat,
    bankQuestionId: row.id, // Preserved UUID from question_bank!
    isFromBank: !generatedBankRows.some((g) => g.id === row.id),
  }));

  // Determine overall source
  let source: 'bank' | 'hybrid' | 'generated' = 'bank';
  if (selectedBankRows.length === 0 && generatedBankRows.length > 0) {
    source = 'generated';
  } else if (selectedBankRows.length > 0 && generatedBankRows.length > 0) {
    source = 'hybrid';
  }

  return {
    questions: finalQuestions,
    source,
    deficit,
    recycled,
  };
}

/**
 * Record user answers to user_question_history and update question_bank statistics.
 */
export async function recordUserQuestionAnswers(
  userId: string,
  chapterId: string | number,
  answers: { questionId: string; isCorrect: boolean }[],
  options: SelectMCQOptions = {}
): Promise<void> {
  let repo: MCQQueueRepository;
  if (options.repository) {
    repo = options.repository;
  } else if (options.supabase) {
    repo = new SupabaseMCQQueueRepository(options.supabase);
  } else {
    try {
      const serverSupabase = await createClient();
      repo = new SupabaseMCQQueueRepository(serverSupabase);
    } catch {
      return;
    }
  }

  await repo.recordUserAnswers(userId, chapterId, answers);
}
