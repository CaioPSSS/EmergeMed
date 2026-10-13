import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { selectMCQsWithAntiRepetition } from '@/lib/mcq-queue-service';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { chapterId } = await request.json();
    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId é obrigatório' }, { status: 400 });
    }

    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;
    const model = settings?.question_model || 'openai/gpt-6-luna';
    const fallback = settings?.fallback_model || 'deepseek/deepseek-v4.1-flash';

    // Generate 10 MCQs via the Anti-Repetition Spaced Repetition Queue Service (R2 & R3)
    const queueResult = await selectMCQsWithAntiRepetition(
      user.id,
      String(chapterId),
      10,
      {
        supabase,
        userSettings: {
          apiKey,
          questionModel: model,
          fallbackModel: fallback,
        },
      }
    );

    const questions = queueResult.questions;

    // Persist test record in tests table
    const cidNum = Number(chapterId);
    const { data: newTest } = await supabase
      .from('tests')
      .insert({
        user_id: user.id,
        chapter_ids: isNaN(cidNum) ? [1] : [cidNum],
        question_type: 'multiple_choice',
        total_questions: questions.length,
        questions: questions,
        completed: false,
      })
      .select()
      .single();

    return NextResponse.json({
      testId: newTest?.id,
      questions,
      source: queueResult.source,
      deficit: queueResult.deficit,
    });
  } catch (err: any) {
    console.error('Erro ao gerar quiz de releitura:', err);
    return NextResponse.json({ error: err.message || 'Erro ao gerar quiz' }, { status: 500 });
  }
}
