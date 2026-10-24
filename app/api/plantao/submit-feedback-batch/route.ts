import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dispatchPlantaoFeedbackBatch } from '@/lib/ai/openrouter-batch';

export interface SubmitFeedbackBatchRequestBody {
  testId: string;
  evaluationsSummary?: any[] | string;
  overallScore?: number;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as SubmitFeedbackBatchRequestBody;
    const { testId, evaluationsSummary, overallScore = 0 } = body;

    if (!testId) {
      return NextResponse.json({ error: 'ID do teste (testId) é obrigatório.' }, { status: 400 });
    }

    // 1. Fetch test record to ensure ownership
    const { data: testRecord, error: testErr } = await supabase
      .from('tests')
      .select('*')
      .eq('id', testId)
      .single();

    if (testErr || !testRecord) {
      return NextResponse.json({ error: 'Plantão não encontrado.' }, { status: 404 });
    }

    if (testRecord.user_id !== user.id) {
      return NextResponse.json({ error: 'Acesso negado a este plantão.' }, { status: 403 });
    }

    // 2. Dispatch batch feedback via shared engine
    const result = await dispatchPlantaoFeedbackBatch({
      testId,
      supabase,
      userId: user.id,
      testRecord,
      evaluationsSummary,
      overallScore,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Erro ao submeter lote de feedback.' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error in /api/plantao/submit-feedback-batch:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao submeter lote de feedback.' },
      { status: 500 }
    );
  }
}
