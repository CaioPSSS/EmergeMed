import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processPlantaoBatchCheck } from '@/lib/plantao/batch-processor';

export interface CheckBatchStatusRequestBody {
  testId?: string;
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

    const body = (await request.json().catch(() => ({}))) as CheckBatchStatusRequestBody;
    const { testId } = body;

    // 1. Identify tests to process
    let targetTests: any[] = [];

    if (testId) {
      const { data: testRecord, error: testErr } = await supabase
        .from('tests')
        .select('*')
        .eq('id', testId)
        .eq('user_id', user.id)
        .single();

      if (testErr || !testRecord) {
        return NextResponse.json({ error: 'Plantão não encontrado.' }, { status: 404 });
      }
      targetTests = [testRecord];
    } else {
      const { data: pendingTests, error: pendingErr } = await supabase
        .from('tests')
        .select('*')
        .eq('user_id', user.id)
        .eq('mode', 'plantao')
        .in('status', ['awaiting_batch_bed_evaluation', 'awaiting_batch_feedback'])
        .order('created_at', { ascending: false })
        .limit(5);

      if (pendingErr || !pendingTests || pendingTests.length === 0) {
        return NextResponse.json({
          updated: false,
          pending: false,
          message: 'Nenhum plantão aguardando processamento em lote.',
        });
      }
      targetTests = pendingTests;
    }

    let anyUpdated = false;
    let anyPending = false;
    let latestResponsePayload: any = null;
    const processedTestsSummary: Array<{ testId: string; updated: boolean; status: string }> = [];

    for (const testRecord of targetTests) {
      const result = await processPlantaoBatchCheck({ testRecord, supabase });
      if (result.updated) anyUpdated = true;
      if (result.pending) anyPending = true;
      if (testId) latestResponsePayload = result;

      processedTestsSummary.push({
        testId: result.testId,
        updated: result.updated,
        status: result.status,
      });
    }

    if (testId && latestResponsePayload) {
      return NextResponse.json(latestResponsePayload);
    }

    if (testId && !latestResponsePayload) {
      const singleTest = targetTests[0];
      return NextResponse.json({
        updated: false,
        pending: anyPending,
        status: singleTest?.status || singleTest?.plantao_data?.status || 'unknown',
      });
    }

    return NextResponse.json({
      updated: anyUpdated,
      pending: anyPending,
      processed: processedTestsSummary.length,
      tests: processedTestsSummary,
      latest: latestResponsePayload,
    });
  } catch (error: any) {
    console.error('Error in /api/plantao/check-batch-status:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao verificar status do lote.' },
      { status: 500 }
    );
  }
}
