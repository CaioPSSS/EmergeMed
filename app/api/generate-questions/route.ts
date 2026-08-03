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

    // Call OpenRouter AI
    const questions = await generateQuestionsWithAI({
      apiKey,
      model: questionModel,
      fallbackModel,
      chaptersInfo,
      chapterTexts,
      count,
      questionType,
    });

    // Save newly generated test in Supabase table
    const { data: newTest, error: insertErr } = await supabase
      .from('tests')
      .insert({
        user_id: user.id,
        chapter_ids: chapterIds,
        question_type: questionType,
        total_questions: questions.length,
        questions,
        completed: false,
      })
      .select()
      .single();

    if (insertErr || !newTest) {
      throw insertErr || new Error('Erro ao salvar o teste no banco de dados.');
    }

    return NextResponse.json({ testId: newTest.id, questions });
  } catch (error: any) {
    console.error('Error generating questions:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno ao gerar questões.' },
      { status: 500 }
    );
  }
}
