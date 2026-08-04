import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateGeneralFeedbackWithAI, QuestionItem } from '@/lib/ai/openrouter';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { testId, overallScore, evaluationsSummary } = (await request.json()) as {
      testId: string;
      overallScore: number;
      evaluationsSummary: {
        questionTitle: string;
        vignette: string;
        userAnswer: string;
        score: number;
        verdict?: string;
        strengths?: string[];
        idealAnswer?: string;
      }[];
    };

    if (!testId) {
      return NextResponse.json({ error: 'ID do teste ausente.' }, { status: 400 });
    }

    // 1. Fetch user AI settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;
    const questionModel = settings?.question_model || 'openai/gpt-5.6-luna';
    const fallbackModel = settings?.fallback_model || 'nvidia/nemotron-3-ultra-550b-a55b:free';

    // 2. Fetch test record to get chapter_ids for book reference text and test mode
    const { data: testRecord } = await supabase
      .from('tests')
      .select('results, chapter_ids, mode')
      .eq('id', testId)
      .single();

    const chapterTexts: Record<number, string> = {};
    if (testRecord?.chapter_ids && testRecord.chapter_ids.length > 0) {
      const { data: contents } = await supabase
        .from('chapter_contents')
        .select('chapter_id, content')
        .in('chapter_id', testRecord.chapter_ids);

      if (contents) {
        contents.forEach((c) => {
          chapterTexts[c.chapter_id] = c.content;
        });
      }
    }

    // 3. Generate general feedback markdown via AI with full chapter texts and mode context
    const generalFeedback = await generateGeneralFeedbackWithAI({
      apiKey,
      model: questionModel,
      fallbackModel,
      overallScore,
      totalQuestions: evaluationsSummary ? evaluationsSummary.length : 0,
      evaluationsSummary: evaluationsSummary || [],
      chapterTexts,
      mode: (testRecord?.mode as 'simulado' | 'plantao') || 'simulado',
    });

    const updatedResults = {
      ...(testRecord?.results || {}),
      generalFeedback,
    };

    await supabase
      .from('tests')
      .update({ results: updatedResults })
      .eq('id', testId);

    return NextResponse.json({ generalFeedback });
  } catch (error: any) {
    console.error('Error generating general feedback:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao gerar feedback geral.' },
      { status: 500 }
    );
  }
}
