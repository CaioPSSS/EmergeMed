import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { formatPrescriptionWithAI } from '@/lib/ai/openrouter';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { rawText } = (await request.json().catch(() => ({}))) as {
      rawText?: string;
    };

    if (!rawText || !rawText.trim()) {
      return NextResponse.json({ error: 'Texto para formatação ausente.' }, { status: 400 });
    }

    // Get user model settings if available
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;

    // Use fast formatting model (Xiaomi MiMo V2.6 Flash ~2s / OpenAI GPT-6 Luna fallback)
    const formattedPrescription = await formatPrescriptionWithAI({
      rawText,
      apiKey,
      model: 'xiaomi/mimo-v2.6-flash',
      fallbackModel: 'openai/gpt-6-luna',
    });

    return NextResponse.json({ formattedPrescription: formattedPrescription || rawText });
  } catch (error: any) {
    console.error('Error formatting prescription with fast AI:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao formatar prescrição.' },
      { status: 500 }
    );
  }
}
