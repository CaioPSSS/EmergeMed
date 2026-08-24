import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateAdverseEvolutionQuestionWithAI, QuestionItem } from '@/lib/ai/openrouter';
import { parsePrescriptionDrugs, formatDrugFactsForPrompt } from '@/lib/ai/drug-math-validator';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { testId, bedNumber, chapterTitle, originalVignette, errorsContext, mathFactsText } =
      (await request.json()) as {
        testId: string;
        bedNumber: number;
        chapterTitle: string;
        originalVignette: string;
        errorsContext: { questionType: string; vignette: string; userText: string; idealText?: string }[];
        mathFactsText?: string;
      };

    if (!testId || !bedNumber) {
      return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
    }

    // 1. Fetch current test from Supabase
    const { data: testRecord, error: fetchErr } = await supabase
      .from('tests')
      .select('*')
      .eq('id', testId)
      .single();

    if (fetchErr || !testRecord) {
      return NextResponse.json({ error: 'Plantão não encontrado.' }, { status: 404 });
    }

    // Check if Q5 was already generated for this bed
    const plantaoData = testRecord.plantao_data || {};
    const bedIndex = (plantaoData.beds || []).findIndex((b: any) => b.bedNumber === bedNumber);

    if (bedIndex !== -1 && plantaoData.beds[bedIndex].bonusQuestionId) {
      // Find existing bonus question
      const existingQ5 = (testRecord.questions as QuestionItem[]).find(
        (q) => q.id === plantaoData.beds[bedIndex].bonusQuestionId
      );
      if (existingQ5) {
        return NextResponse.json({ question: existingQ5 });
      }
    }

    // 2. Fetch AI model settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;
    const questionModel = settings?.question_model || 'openai/gpt-5.6-luna';
    const fallbackModel = settings?.fallback_model || 'minimax/minimax-m3';

    // 3. Compute math facts if not provided
    let finalMathFactsText = mathFactsText || '';
    if (!finalMathFactsText && errorsContext && errorsContext.length > 0) {
      const weightMatch = originalVignette.match(/(\d{2,3})\s*kg\b/i);
      const patientWeight = weightMatch ? parseInt(weightMatch[1], 10) : 70;
      const allCalcs: any[] = [];
      for (const err of errorsContext) {
        if (err.userText) {
          const calcs = parsePrescriptionDrugs(err.userText, patientWeight);
          allCalcs.push(...calcs);
        }
      }
      finalMathFactsText = formatDrugFactsForPrompt(allCalcs);
    }

    // 4. Generate Q5 bonus question
    const q5Question = await generateAdverseEvolutionQuestionWithAI({
      apiKey,
      model: questionModel,
      fallbackModel,
      bedNumber,
      chapterTitle,
      originalVignette,
      errorsContext,
      mathFactsText: finalMathFactsText,
    });

    const currentQuestions = (testRecord.questions as QuestionItem[]) || [];
    const maxId = Math.max(...currentQuestions.map((q) => q.id), 0);
    const newId = maxId + 1;

    q5Question.id = newId;
    q5Question.chapterTitle = `${chapterTitle} — COMPLICAÇÃO (EVOLUÇÃO ADVERSA)`;

    const updatedQuestions = [...currentQuestions, q5Question];

    // 4. Update plantao_data structure
    const updatedBeds = [...(plantaoData.beds || [])];
    if (bedIndex !== -1) {
      updatedBeds[bedIndex] = {
        ...updatedBeds[bedIndex],
        bonusQuestionId: newId,
        hasAdverseEvolution: true,
      };
    }

    const updatedPlantaoData = {
      ...plantaoData,
      beds: updatedBeds,
      adverseEvolutions: (plantaoData.adverseEvolutions || 0) + 1,
    };

    // 5. Update DB
    await supabase
      .from('tests')
      .update({
        questions: updatedQuestions,
        total_questions: updatedQuestions.length,
        plantao_data: updatedPlantaoData,
      })
      .eq('id', testId);

    return NextResponse.json({ question: q5Question });
  } catch (error: any) {
    console.error('Error generating adverse evolution:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao gerar evolução adversa.' },
      { status: 500 }
    );
  }
}
