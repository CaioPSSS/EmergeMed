import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processPlantaoBatchCheck } from '@/lib/plantao/batch-processor';

function validateCronAuth(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  // If no secret configured in development, allow local invocation
  if (!cronSecret) {
    return process.env.NODE_ENV !== 'production';
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === cronSecret) return true;
  }

  const xCronSecret = request.headers.get('x-cron-secret');
  if (xCronSecret && xCronSecret === cronSecret) return true;

  const url = new URL(request.url);
  const queryKey = url.searchParams.get('key');
  if (queryKey && queryKey === cronSecret) return true;

  return false;
}

async function handleCronExecution(request: Request) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const adminSupabase = createAdminClient();

  // Query all pending plantões awaiting either bed evaluations or feedback batch
  const { data: pendingTests, error: pendingErr } = await adminSupabase
    .from('tests')
    .select('*')
    .eq('mode', 'plantao')
    .in('status', ['awaiting_batch_bed_evaluation', 'awaiting_batch_feedback'])
    .order('created_at', { ascending: false })
    .limit(10);

  if (pendingErr) {
    console.error('[CronCheckBatch] Erro ao consultar testes pendentes:', pendingErr);
    return NextResponse.json({ error: 'Erro ao consultar banco de dados.' }, { status: 500 });
  }

  if (!pendingTests || pendingTests.length === 0) {
    return NextResponse.json({
      success: true,
      processed: 0,
      message: 'Nenhum plantão aguardando processamento em lote.',
    });
  }

  const results: any[] = [];
  for (const testRecord of pendingTests) {
    try {
      const outcome = await processPlantaoBatchCheck({
        testRecord,
        supabase: adminSupabase,
      });
      results.push(outcome);
    } catch (procErr: any) {
      console.error(`[CronCheckBatch] Falha ao processar teste ${testRecord.id}:`, procErr);
      results.push({
        testId: testRecord.id,
        updated: false,
        error: procErr.message,
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    timestamp: new Date().toISOString(),
    tests: results,
  });
}

export async function POST(request: Request) {
  return handleCronExecution(request);
}

export async function GET(request: Request) {
  return handleCronExecution(request);
}
