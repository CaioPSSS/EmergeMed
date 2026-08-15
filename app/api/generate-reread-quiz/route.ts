import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getChapterMetadata } from '@/lib/chapters-service';
import { generateQuestionsWithAI } from '@/lib/ai/openrouter';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { chapterId } = await request.json();
    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId é obrigatório' }, { status: 400 });
    }

    const cap = await getChapterMetadata(supabase, Number(chapterId), user.id);
    const capInfo = cap ? [cap] : [];
    
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;
    const model = settings?.question_model || 'openai/gpt-5.6-luna';
    const fallback = settings?.fallback_model || 'nvidia/nemotron-3-ultra-550b-a55b:free';

    // Buscar texto do capítulo se disponível
    const { data: content } = await supabase
      .from('chapter_contents')
      .select('content')
      .eq('chapter_id', chapterId)
      .single();
    
    const chapterTexts: Record<number, string> = {};
    if (content?.content) {
      chapterTexts[chapterId] = content.content;
    }

    const questions = await generateQuestionsWithAI({
      apiKey,
      model,
      fallbackModel: fallback,
      chaptersInfo: capInfo,
      chapterTexts,
      count: 3,
      questionType: 'multiple_choice',
    });

    return NextResponse.json({ questions });
  } catch (err: any) {
    console.error('Erro ao gerar quiz de releitura:', err);
    return NextResponse.json({ error: err.message || 'Erro ao gerar quiz' }, { status: 500 });
  }
}
