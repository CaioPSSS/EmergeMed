import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyzeCustomChapterWithAI } from '@/lib/ai/openrouter';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { rawText, suggestedBookTitle } = await request.json() as {
      rawText: string;
      suggestedBookTitle?: string;
    };

    if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 50) {
      return NextResponse.json(
        { error: 'Por favor, cole um texto com pelo menos 50 caracteres para análise.' },
        { status: 400 }
      );
    }

    // Get user model settings if configured
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;
    const model = settings?.question_model || 'openai/gpt-4o-mini';
    const fallbackModel = settings?.fallback_model || 'google/gemini-2.5-flash';

    const analysis = await analyzeCustomChapterWithAI({
      apiKey,
      model,
      fallbackModel,
      rawText,
      suggestedBookTitle,
    });

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error: any) {
    console.error('Error analyzing custom chapter:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao processar texto com IA' },
      { status: 500 }
    );
  }
}
