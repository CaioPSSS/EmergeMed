import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUnifiedChapters } from '@/lib/chapters-service';
import { generateQuestionsWithAI } from '@/lib/ai/openrouter';
import { selectMCQsWithAntiRepetition } from '@/lib/mcq-queue-service';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const {
      chapterIds,
      count = 5,
      questionType = 'mixed',
      isPostChapter = false,
    } = (await request.json()) as {
      chapterIds: number[];
      count?: number;
      questionType?: 'multiple_choice' | 'prescription' | 'ventilator' | 'mixed';
      isPostChapter?: boolean;
    };

    if (!chapterIds || !Array.isArray(chapterIds) || chapterIds.length === 0) {
      return NextResponse.json({ error: 'Selecione pelo menos um capítulo.' }, { status: 400 });
    }

    // Get user model settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;
    const questionModel = settings?.question_model || 'openai/gpt-6-luna';
    const fallbackModel = settings?.fallback_model || 'deepseek/deepseek-v4.1-flash';

    let finalQuestions: any[] = [];

    // When post-chapter test, 10-MCQ test or single-chapter MCQ is requested:
    // Route 100% through anti-repetition queue service (R2 & R3)
    if (isPostChapter || (chapterIds.length === 1 && (count === 10 || questionType === 'multiple_choice'))) {
      const targetChapterId = String(chapterIds[0]);
      const queueResult = await selectMCQsWithAntiRepetition(
        user.id,
        targetChapterId,
        count,
        {
          supabase,
          userSettings: { apiKey, questionModel, fallbackModel },
        }
      );
      finalQuestions = queueResult.questions;
    } else {
      // General multi-chapter / mixed question generation flow
      // Get chapter titles and section info (Official + Custom)
      const allChapters = await getUnifiedChapters(supabase, user.id);
      const chaptersInfo = allChapters.filter((c) => chapterIds.includes(c.id));

      // Get optional saved chapter text contents from Supabase
      const { data: contents } = await supabase
        .from('chapter_contents')
        .select('chapter_id, content')
        .in('chapter_id', chapterIds);

      const chapterTexts: Record<number, string> = {};
      if (contents) {
        contents.forEach((item) => {
          chapterTexts[item.chapter_id] = item.content;
        });
      }

      // Check existing question bank for matching chapters
      let bankedQuestions: any[] = [];
      try {
        const { data: qBankData } = await supabase
          .from('question_bank')
          .select('*')
          .in('chapter_id', chapterIds)
          .order('times_shown', { ascending: true })
          .limit(count);
        if (qBankData) bankedQuestions = qBankData;
      } catch (e) {
        console.warn('question_bank table lookup failed, generating 100% via AI', e);
      }

      // Eliminate arbitrary 60% ceiling: consume up to 100% from bank if available
      const reuseCount = Math.min(count, bankedQuestions.length);
      const generateCount = count - reuseCount;

      const reusedQuestions = bankedQuestions.slice(0, reuseCount).map((q, idx) => ({
        id: idx + 1,
        chapterId: q.chapter_id,
        type: q.question_type,
        vignette: q.vignette,
        options: q.options,
        correctOption: q.correct_option,
        explanation: q.explanation,
        idealPrescription: q.ideal_prescription,
        evaluationCriteria: q.evaluation_criteria,
        idealVentilator: q.ideal_ventilator,
        promptText: q.prompt_text,
        isFromBank: true,
        bankQuestionId: q.id,
        difficulty_tier: q.difficulty_tier || 'standard',
        question_subformat: q.question_subformat || 'case_conduct',
      }));

      // Generate remaining questions via AI if needed
      const newAiQuestions = generateCount > 0
        ? await generateQuestionsWithAI({
            apiKey,
            model: questionModel,
            fallbackModel,
            chaptersInfo,
            chapterTexts,
            count: generateCount,
            questionType,
          })
        : [];

      // Save newly generated AI questions into question_bank asynchronously and link bankQuestionId
      if (newAiQuestions.length > 0) {
        const toInsert = newAiQuestions.map((q) => ({
          chapter_id: q.chapterId,
          question_type: q.type,
          vignette: q.vignette,
          options: q.options || null,
          correct_option: q.correctOption !== undefined ? q.correctOption : null,
          explanation: q.explanation || null,
          ideal_prescription: q.idealPrescription || null,
          evaluation_criteria: q.evaluationCriteria || null,
          ideal_ventilator: q.idealVentilator || null,
          prompt_text: q.promptText || null,
          difficulty_tier: q.difficulty_tier || 'standard',
          question_subformat: q.question_subformat || 'case_conduct',
          source: 'ai_generated',
        }));

        try {
          const { data: inserted } = await supabase.from('question_bank').insert(toInsert).select();
          if (inserted && inserted.length > 0) {
            inserted.forEach((row, i) => {
              if (newAiQuestions[i]) {
                newAiQuestions[i].bankQuestionId = row.id;
              }
            });
          }
        } catch (err: any) {
          console.warn('Failed to store new questions into question_bank:', err);
        }
      }

      // Adjust IDs for combined questions
      finalQuestions = [
        ...reusedQuestions,
        ...newAiQuestions.map((q, idx) => ({ ...q, id: reuseCount + idx + 1 })),
      ];
    }

    // Save newly generated test in Supabase table
    const { data: newTest, error: insertErr } = await supabase
      .from('tests')
      .insert({
        user_id: user.id,
        chapter_ids: chapterIds,
        question_type: questionType,
        total_questions: finalQuestions.length,
        questions: finalQuestions,
        completed: false,
      })
      .select()
      .single();

    if (insertErr || !newTest) {
      throw insertErr || new Error('Erro ao salvar o teste no banco de dados.');
    }

    return NextResponse.json({ testId: newTest.id, questions: finalQuestions });
  } catch (error: any) {
    console.error('Error generating questions:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno ao gerar questões.' },
      { status: 500 }
    );
  }
}
