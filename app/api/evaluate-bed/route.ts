import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { evaluateBedSequenceWithAI } from '@/lib/ai/openrouter';
import { parsePrescriptionDrugs, formatDrugFactsForPrompt, DrugCalculation } from '@/lib/ai/drug-math-validator';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const {
      bedNumber,
      patientWeight = 70,
      chapterId,
      chapterTitle,
      mcqResults = [],
      prescriptions = [],
    } = (await request.json()) as {
      bedNumber: number;
      patientWeight?: number;
      chapterId?: number;
      chapterTitle?: string;
      mcqResults?: Array<{
        id: number;
        vignette: string;
        userAnswer: string;
        isCorrect: boolean;
        explanation?: string;
      }>;
      prescriptions: Array<{
        id: number;
        type: 'prescription_complete' | 'prescription_immediate' | 'ventilator';
        vignette: string;
        userPrescription: string;
        idealPrescription?: string;
        evaluationCriteria?: string[];
        ventilatorData?: Record<string, string>;
      }>;
    };

    if (!bedNumber || !prescriptions || prescriptions.length === 0) {
      return NextResponse.json(
        { error: 'Dados do leito ou prescrições ausentes.' },
        { status: 400 }
      );
    }

    // 1. Get user model settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;
    const prescriptionModel = settings?.prescription_model || 'openai/gpt-5.6-luna';
    const fallbackModel = settings?.fallback_model || 'minimax/minimax-m3';

    // 2. Fetch chapter content if available
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

    // 3. Run programmatic math validation on all prescription texts
    const allCalculations: DrugCalculation[] = [];
    for (const p of prescriptions) {
      if (p.type !== 'ventilator' && p.userPrescription) {
        const calcs = parsePrescriptionDrugs(p.userPrescription, patientWeight);
        allCalculations.push(...calcs);
      }
    }

    const mathFactsText = formatDrugFactsForPrompt(allCalculations);

    // 4. Perform unified AI evaluation for the entire bed
    const evaluations = await evaluateBedSequenceWithAI({
      apiKey,
      model: prescriptionModel,
      fallbackModel,
      bedNumber,
      patientWeight,
      chapterTitle,
      chapterText,
      mcqResults,
      prescriptions,
      mathFactsText,
    });

    return NextResponse.json({
      evaluations,
      drugCalculations: allCalculations,
    });
  } catch (error: any) {
    console.error('Error evaluating bed sequence:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao avaliar leito.' },
      { status: 500 }
    );
  }
}
