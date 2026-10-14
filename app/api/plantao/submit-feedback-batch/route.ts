import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SYSTEM_PROMPT_PLANTAO_FEEDBACK } from '@/lib/ai/prompts';
import { fixMojibake } from '@/lib/text-sanitizer';
import {
  submitOpenRouterBatch,
  insertBatchLedgerRecord,
  fetchAccumulatedBudget,
  evaluateBudgetCapBreach,
  calculateBatchCost,
  BATCH_MODEL,
  DAILY_HARD_CAP_USD,
  MONTHLY_HARD_CAP_USD,
  BatchRequestItem,
} from '@/lib/ai/openrouter-batch';

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

    const body = (await request.json()) as SubmitFeedbackBatchRequestBody;
    const { testId, evaluationsSummary, overallScore = 0 } = body;

    if (!testId) {
      return NextResponse.json({ error: 'ID do teste (testId) é obrigatório.' }, { status: 400 });
    }

    // 1. Fetch test record
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

    // Idempotency: if already awaiting batch feedback, return existing feedback batch id
    if (testRecord.status === 'awaiting_batch_feedback' && testRecord.plantao_data?.feedbackBatchId) {
      return NextResponse.json({
        success: true,
        batchId: testRecord.plantao_data.feedbackBatchId,
        status: 'awaiting_batch_feedback',
        message: 'Lote de feedback já submetido e aguardando processamento.',
      });
    }

    // 2. Fetch book reference contents
    const chapterTexts: Record<number, string> = {};
    if (testRecord.chapter_ids && testRecord.chapter_ids.length > 0) {
      const { data: contents } = await supabase
        .from('chapter_contents')
        .select('chapter_id, content')
        .in('chapter_id', testRecord.chapter_ids);

      if (contents) {
        contents.forEach((c) => {
          chapterTexts[c.chapter_id] = c.content;
        });
      }
    }

    let bookContext = '';
    if (Object.keys(chapterTexts).length > 0) {
      bookContext = '\n\nTEXTO COMPLETO DOS CAPÍTULOS DE REFERÊNCIA DO LIVRO (FONTE PRIMÁRIA OBRIGATÓRIA PARA AVALIAÇÃO):\n' +
        Object.entries(chapterTexts)
          .map(([id, text]) => `--- TEXTO DO CAPÍTULO ${id} ---\n${fixMojibake(text || '')}`)
          .join('\n\n');
    }

    // 3. Prepare summary text
    let summaryText = '';
    if (Array.isArray(evaluationsSummary)) {
      summaryText = evaluationsSummary.map((item: any, idx: number) => `
--- QUESTÃO / LEITO ${idx + 1}: ${item.questionTitle || `Item ${idx + 1}`} ---
- Pontuação / Veredito: ${item.score}/10 ${item.verdict ? `(${item.verdict})` : ''}
- Caso Clínico Completo: ${item.vignette || ''}
- Resposta do Médico: "${item.userAnswer || ''}"
${item.idealAnswer ? `- Gabarito Esperado: "${item.idealAnswer}"` : ''}
${item.strengths && item.strengths.length > 0 ? `- Pontos Fortes Notados: ${item.strengths.join('; ')}` : ''}
`).join('\n');
    } else if (typeof evaluationsSummary === 'string') {
      summaryText = evaluationsSummary;
    } else {
      // Reconstruct summary from testRecord.results if available
      const results = testRecord.results || {};
      const questions = (testRecord.questions as any[]) || [];
      summaryText = questions.map((q: any, idx: number) => {
        const res = results[q.id];
        return `
--- QUESTÃO ${idx + 1} (${q.type}): ${q.chapterTitle || ''} ---
- Pontuação: ${res?.score ?? 'N/A'}/10
- Caso Clínico: ${q.vignette || ''}
- Resposta: ${typeof res?.userPrescription === 'string' ? res.userPrescription : JSON.stringify(testRecord.answers?.[q.id] || '')}
- Feedback: ${res?.evaluation?.detailedFeedback || ''}
`;
      }).join('\n');
    }

    const effectiveScore = typeof overallScore === 'number'
      ? overallScore
      : (typeof testRecord.score === 'number' ? testRecord.score : 0);

    const userPrompt = `AVALIAÇÃO DE PLANTÃO NOTURNO NA SALA VERMELHA DE UPA:
Nota Final do Aluno: ${effectiveScore.toFixed(1)} / 10.0
Total de Questões/Leitos: ${testRecord.total_questions || (Array.isArray(evaluationsSummary) ? evaluationsSummary.length : 0)}

DESEMPENHO DETALHADO POR QUESTÃO / LEITO (ATENÇÃO: LEIA O CASO CLÍNICO COMPLETO DE CADA QUESTÃO, POIS VÁRIAS QUESTÕES DESCREVEM A EVOLUÇÃO DO PACIENTE APÓS TRATAMENTO INICIAL):
${summaryText}
${bookContext}

REGRAS OBRIGATÓRIAS PARA O FEEDBACK GERAL:
1. Mantenha coerência com as avaliações individuais dos leitos. Se uma questão foi avaliada como "Adequada" ou obteve boa nota, priorize a seção de pontos críticos para os erros reais cometidos nas questões com nota mais baixa.
2. Preste atenção estrita aos dados de EVOLUÇÃO da vinheta (ex: desfechos de choque, PCR revertida, estabilização alcançada).
3. Baseie as explicações nos protocolos e no texto dos capítulos do livro fornecidos acima.

Gere o Feedback de Passagem de Plantão Noturno em Markdown.
Responda diretamente em Markdown sem blocos de código JSON.`;

    const batchRequests: BatchRequestItem[] = [
      {
        custom_id: JSON.stringify({
          type: 'plantao_feedback',
          testId,
          overallScore: effectiveScore,
        }),
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: BATCH_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT_PLANTAO_FEEDBACK },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
        },
      },
    ];

    // 4. Budget cap check ($0.15 daily / $0.90 monthly)
    const { dailyAccumulated, monthlyAccumulated } = await fetchAccumulatedBudget(supabase);
    const estPromptTokens = 3000;
    const estCompletionTokens = 2000;
    const estimatedCost = calculateBatchCost(estPromptTokens, estCompletionTokens);

    const capBreach = evaluateBudgetCapBreach(dailyAccumulated, monthlyAccumulated, estimatedCost);
    if (!capBreach.canProceed) {
      const reasonDetail = capBreach.reason === 'daily_cap'
        ? `Teto diário de US$ ${DAILY_HARD_CAP_USD.toFixed(2)} atingido (consumo hoje: US$ ${dailyAccumulated.toFixed(4)}).`
        : `Teto mensal de US$ ${MONTHLY_HARD_CAP_USD.toFixed(2)} atingido (consumo no mês: US$ ${monthlyAccumulated.toFixed(4)}).`;

      return NextResponse.json(
        {
          error: `Limite de orçamento em lote atingido: ${reasonDetail} Por favor, gere o relatório em tempo real ou aguarde a virada do ciclo orçamentário.`,
          budgetBreach: true,
          reason: capBreach.reason,
          dailyAccumulated,
          monthlyAccumulated,
        },
        { status: 429 }
      );
    }

    // 5. User settings & API Key
    const { data: settings } = await supabase
      .from('user_settings')
      .select('openrouter_api_key')
      .eq('user_id', user.id)
      .single();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;
    const isMock = !apiKey || apiKey === 'mock' || apiKey === 'mock-openrouter-key' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

    // 6. Submit batch
    const submission = await submitOpenRouterBatch(batchRequests, apiKey, isMock);

    // 7. Insert ledger record
    const nowIso = new Date().toISOString();
    await insertBatchLedgerRecord(
      {
        batch_id: submission.id,
        submission_timestamp: nowIso,
        model: BATCH_MODEL,
        prompt_tokens: estPromptTokens,
        completion_tokens: estCompletionTokens,
        cost_usd: estimatedCost,
        daily_accumulated_usd: Number((dailyAccumulated + estimatedCost).toFixed(6)),
        monthly_accumulated_usd: Number((monthlyAccumulated + estimatedCost).toFixed(6)),
        hard_cap_interrupted: false,
        items_requested: 1,
        items_ingested: 0,
        items_failed: 0,
        status: 'submitted',
      },
      supabase
    );

    // 8. Update tests table
    const plantaoData = testRecord.plantao_data || {};
    const updatedPlantaoData = {
      ...plantaoData,
      feedbackBatchId: submission.id,
      feedback_batch_submitted_at: nowIso,
      feedbackEvaluationMode: 'batch',
      status: 'awaiting_batch_feedback',
    };

    const { error: updateErr } = await supabase
      .from('tests')
      .update({
        status: 'awaiting_batch_feedback',
        plantao_data: updatedPlantaoData,
      })
      .eq('id', testId);

    if (updateErr) {
      console.error('Error updating test record:', updateErr);
      return NextResponse.json({ error: 'Erro ao atualizar status de feedback do plantão.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      batchId: submission.id,
      status: 'awaiting_batch_feedback',
      isMock,
      submittedAt: nowIso,
    });
  } catch (error: any) {
    console.error('Error in /api/plantao/submit-feedback-batch:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao submeter lote de feedback.' },
      { status: 500 }
    );
  }
}
