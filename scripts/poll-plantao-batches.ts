import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { processPlantaoBatchCheck } from '../lib/plantao/batch-processor';

async function main() {
  const args = process.argv.slice(2);
  const isMock = args.includes('--mock');
  const testIdArgIdx = args.indexOf('--test-id');
  const specificTestId = testIdArgIdx !== -1 ? args[testIdArgIdx + 1] : undefined;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('❌ Erro: Variáveis do Supabase (URL / SERVICE_ROLE_KEY) não encontradas.');
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('   EMERGEMED — POLLING AUTÔNOMO DE LOTES DE PLANTÃO       ');
  console.log('═══════════════════════════════════════════════════════════');

  let query = supabase
    .from('tests')
    .select('*')
    .eq('mode', 'plantao');

  if (specificTestId) {
    query = query.eq('id', specificTestId);
  } else {
    query = query.in('status', ['awaiting_batch_bed_evaluation', 'awaiting_batch_feedback']);
  }

  const { data: tests, error } = await query;

  if (error) {
    console.error('❌ Erro ao consultar plantões no Supabase:', error.message);
    process.exit(1);
  }

  if (!tests || tests.length === 0) {
    console.log('✓ Nenhum plantão aguardando processamento em lote no momento.');
    process.exit(0);
  }

  console.log(`📋 Encontrados ${tests.length} plantão(ões) para verificação:\n`);

  for (const testRecord of tests) {
    console.log(`▶ Processando Plantão ${testRecord.id} (Status atual: ${testRecord.status})...`);
    try {
      const outcome = await processPlantaoBatchCheck({
        testRecord,
        supabase,
      });

      if (outcome.updated) {
        console.log(`  ✓ Atualizado com sucesso! Novo status: ${outcome.status}`);
        if (outcome.status === 'awaiting_batch_feedback') {
          console.log(`  ⚡ Auto-chaining ativado: Lote de Feedback despachado (${outcome.feedbackBatchId})`);
        } else if (outcome.status === 'completed') {
          console.log(`  🏆 Plantão concluído! Nota Final: ${outcome.score}/10.0`);
        } else if (outcome.status === 'ready_for_adverse') {
          console.log(`  🔔 Descompensação clínica detectada! Intercorrência Q5 gerada.`);
        }
      } else if (outcome.pending) {
        console.log(`  ⏳ O lote ainda está sendo processado na fila da IA.`);
      } else {
        console.log(`  — Sem alterações (Status: ${outcome.status}).`);
      }
    } catch (err: any) {
      console.error(`  ✗ Erro ao processar plantão ${testRecord.id}:`, err.message);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('   VERIFICAÇÃO CONCLUÍDA                                  ');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch((e) => {
  console.error('Fatal error in poll-plantao-batches:', e);
  process.exit(1);
});
