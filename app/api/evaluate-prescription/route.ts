import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { evaluatePrescriptionWithAI } from '@/lib/ai/openrouter';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const {
      vignette,
      userPrescription,
      idealPrescription,
      evaluationCriteria,
      chapterId,
    } = await request.json();

    if (!vignette || typeof vignette !== 'string') {
      return NextResponse.json({ error: 'Caso clínico (vignette) é obrigatório.' }, { status: 400 });
    }

    // Get user model settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;
    const prescriptionModel = settings?.prescription_model || 'openai/gpt-5.6-luna';
    const fallbackModel = settings?.fallback_model || 'nvidia/nemotron-3-ultra-550b-a55b:free';

    // Optional chapter text
    let chapterText: string | undefined = undefined;
    if (chapterId) {
      const { data: content } = await supabase
        .from('chapter_contents')
        .select('content')
        .eq('chapter_id', chapterId)
        .single();
      if (content) {
        chapterText = content.content;
      }
    }

    const evaluation = await evaluatePrescriptionWithAI({
      apiKey,
      model: prescriptionModel,
      fallbackModel,
      vignette,
      userPrescription,
      idealPrescription,
      evaluationCriteria,
      chapterText,
    });

    return NextResponse.json({ evaluation });
  } catch (error: any) {
    console.error('Error evaluating prescription:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao avaliar prescrição.' },
      { status: 500 }
    );
  }
}
