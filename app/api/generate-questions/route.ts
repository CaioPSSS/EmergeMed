import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CHAPTERS_DATA } from '@/lib/chapters-data';
import { generateQuestionsWithAI } from '@/lib/ai/openrouter';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { chapterIds, count = 5, questionType = 'mixed' } = await request.json() as {
      chapterIds: number[];
      count?: number;
      questionType?: 'multiple_choice' | 'prescription' | 'ventilator' | 'mixed';
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
    const questionModel = settings?.question_model || 'openai/gpt-5.6-luna';
    const fallbackModel = settings?.fallback_model || 'nvidia/nemotron-3-ultra-550b-a55b:free';

    // Get chapter titles and section info
    const chaptersInfo = CHAPTERS_DATA.filter((c) => chapterIds.includes(c.id));

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

    const reuseCount = Math.min(Math.floor(count * 0.6), bankedQuestions.length);
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

    // Adjust IDs for combined questions
    const finalQuestions = [
      ...reusedQuestions,
      ...newAiQuestions.map((q, idx) => ({ ...q, id: reuseCount + idx + 1 })),
    ];

    // Save newly generated AI questions into question_bank asynchronously
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
        source: 'ai_generated',
      }));

      supabase.from('question_bank').insert(toInsert).then(null, (err: any) => {
        console.warn('Failed to store new questions into question_bank:', err);
      });
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
