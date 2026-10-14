import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parsePrescriptionDrugs, formatDrugFactsForPrompt, DrugCalculation } from '@/lib/ai/drug-math-validator';
import { SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR, buildBedEvaluationJsonTemplate } from '@/lib/ai/prompts';
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

export interface SubmitBatchRequestBody {
  testId: string;
  bedsData?: Array<{
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
    prescriptionsPayload?: Array<{
      id: number;
      type: 'prescription_complete' | 'prescription_immediate' | 'ventilator';
      vignette: string;
      userPrescription: string;
      idealPrescription?: string;
      evaluationCriteria?: string[];
      ventilatorData?: Record<string, string>;
    }>;
    prescriptions?: Array<{
      id: number;
      type: 'prescription_complete' | 'prescription_immediate' | 'ventilator';
      vignette: string;
      userPrescription: string;
      idealPrescription?: string;
      evaluationCriteria?: string[];
      ventilatorData?: Record<string, string>;
    }>;
  }>;
  userAnswers?: Record<number, any>;
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

    const body = (await request.json()) as SubmitBatchRequestBody;
    const { testId, bedsData, userAnswers } = body;

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

    // Idempotency: if already awaiting bed evaluation, return existing batch id
    if (testRecord.status === 'awaiting_batch_bed_evaluation' && testRecord.plantao_data?.batch_job_id) {
      return NextResponse.json({
        success: true,
        batchId: testRecord.plantao_data.batch_job_id,
        status: 'awaiting_batch_bed_evaluation',
        message: 'Lote de leitos já submetido e aguardando processamento.',
      });
    }

    if (testRecord.status === 'completed') {
      return NextResponse.json({ error: 'Plantão já concluído.' }, { status: 400 });
    }

    // 2. Resolve bed data (either from request body or reconstructed from testRecord)
    const rawBeds = bedsData && bedsData.length > 0
      ? bedsData
      : (testRecord.plantao_data?.beds || []);

    if (!rawBeds || rawBeds.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum leito disponível para avaliação em lote.' },
        { status: 400 }
      );
    }

    // 3. Resolve chapter contents for book context
    const chapterIds = Array.from(
      new Set(
        [
          ...(testRecord.chapter_ids || []),
          ...rawBeds.map((b: any) => b.chapterId).filter(Boolean),
        ]
      )
    );

    const chapterTexts: Record<number, string> = {};
    if (chapterIds.length > 0) {
      const { data: contents } = await supabase
        .from('chapter_contents')
        .select('chapter_id, content')
        .in('chapter_id', chapterIds);

      if (contents) {
        contents.forEach((c) => {
          chapterTexts[c.chapter_id] = c.content;
        });
      }
    }

    // 4. Build batch request items per bed with math validation
    const batchRequests: BatchRequestItem[] = [];
    const allBedCalculations: Record<number, DrugCalculation[]> = {};
    const effectiveAnswers = userAnswers || testRecord.answers || {};

    for (const bed of rawBeds) {
      const bedNumber = bed.bedNumber;
      const patientWeight = bed.patientWeight || 70;
      const chapterId = bed.chapterId || (testRecord.chapter_ids ? testRecord.chapter_ids[bedNumber - 1] : undefined);
      const chapterTitle = bed.chapterTitle || `Leito ${bedNumber}`;

      // Resolve prescriptions
      let prescriptions = bed.prescriptionsPayload || bed.prescriptions || [];
      if (prescriptions.length === 0 && Array.isArray(testRecord.questions)) {
        // Reconstruct from testRecord.questions
        const bedQuestionIds = (testRecord.plantao_data?.beds?.[bedNumber - 1]?.questionIds) || [];
        const bedQs = testRecord.questions.filter((q: any) =>
          bedQuestionIds.includes(q.id) && q.type !== 'multiple_choice'
        );
        prescriptions = bedQs.map((q: any) => {
          const ans = effectiveAnswers[q.id];
          const isVent = q.type === 'ventilator';
          return {
            id: q.id,
            type: q.type,
            vignette: q.vignette,
            userPrescription: typeof ans === 'string' ? ans : (ans ? JSON.stringify(ans) : 'Sem resposta enviada'),
            idealPrescription: q.idealPrescription,
            evaluationCriteria: q.evaluationCriteria,
            ventilatorData: isVent && typeof ans === 'object' ? ans : undefined,
          };
        });
      }

      if (prescriptions.length === 0) {
        continue;
      }

      // Pre-compute mathematical dosage calculations via drug-math-validator.ts
      const bedCalculations: DrugCalculation[] = [];
      for (const p of prescriptions) {
        if (p.type !== 'ventilator' && p.userPrescription && p.userPrescription.trim()) {
          const calcs = parsePrescriptionDrugs(p.userPrescription, patientWeight);
          bedCalculations.push(...calcs);
        }
      }
      allBedCalculations[bedNumber] = bedCalculations;
      const mathFactsText = formatDrugFactsForPrompt(bedCalculations);

      // Format MCQ section if present
      let mcqSection = '';
      const mcqs = bed.mcqResults || [];
      if (mcqs.length > 0) {
        mcqSection = `\n═══════════════════════════════════════════════════════════\nRESPOSTAS DO MÉDICO NAS 2 QUESTÕES DE MÚLTIPLA ESCOLHA COMPLEMENTARES:\n═══════════════════════════════════════════════════════════\n` +
          mcqs.map((m: any, idx: number) => `
QUESTÃO ${idx + 1} (ID: ${m.id}) - Múltipla Escolha:
- Caso Clínico: ${m.vignette}
- Opção Escolhida pelo Médico: "${m.userAnswer}" (${m.isCorrect ? 'CORRETO ✅' : 'INCORRETO ❌'})
${m.explanation ? `- Gabarito / Justificativa: ${m.explanation}` : ''}
`).join('\n');
      }

      // Format prescriptions section
      const prescriptionsSection = prescriptions.map((p: any, idx: number) => {
        const stageLabel = idx === 0
          ? 'ETAPA 1: CONDUTA IMEDIATA DE RESGATE'
          : 'ETAPA 2: CONDUTA DE MANUTENÇÃO / RESGATE / VENTILAÇÃO';

        const typeLabel = p.type === 'ventilator'
          ? 'CONFIGURAÇÃO DE VENTILADOR MECÂNICO'
          : p.type === 'prescription_immediate'
          ? 'PRESCRIÇÃO IMEDIATA (NO MOMENTO)'
          : 'PRESCRIÇÃO COMPLETA (DO DIA)';

        const ventilatorContent = p.ventilatorData
          ? `\nPARÂMETROS DO VENTILADOR CONFIGURADOS PELO MÉDICO:\n${Object.entries(p.ventilatorData).map(([k, v]) => `- ${k}: ${v || '(não preenchido)'}`).join('\n')}\n`
          : '';

        return `
═══════════════════════════════════════════════════════════
${stageLabel} (QUESTÃO ID: ${p.id}) — ${typeLabel}:
═══════════════════════════════════════════════════════════
TIPO DE QUESTÃO: ${p.type}
CASO CLÍNICO / EVOLUÇÃO NO MOMENTO DESTA CONDUTA:
${p.vignette}

${p.type === 'ventilator' ? ventilatorContent : `PRESCRIÇÃO ESCRITA PELO MÉDICO:\n${p.userPrescription}\n`}
${p.idealPrescription ? `GABARITO / CONDUTA DE REFERÊNCIA:\n${p.idealPrescription}\n` : ''}
${p.evaluationCriteria && p.evaluationCriteria.length > 0 ? `CRITÉRIOS ESPERADOS:\n${p.evaluationCriteria.join('\n')}\n` : ''}
`;
      }).join('\n');

      const rawChapterContent = chapterId ? chapterTexts[chapterId] : '';
      const cleanChapterText = fixMojibake(rawChapterContent || '');

      const userPrompt = `Avalie as condutas prescritas para o LEITO ${bedNumber} ${chapterTitle ? `(Tema: ${chapterTitle})` : ''} | Peso do Paciente: ${patientWeight} kg:

${mathFactsText ? `${mathFactsText}\n` : ''}
${mcqSection}
${prescriptionsSection}
${cleanChapterText ? `\n═══════════════════════════════════════════════════════════\nTEXTO COMPLETO DE REFERÊNCIA DO LIVRO:\n═══════════════════════════════════════════════════════════\n${cleanChapterText}\n` : ''}

INSTRUÇÃO FINAL:
Avalie CADA uma das ${prescriptions.length} prescrições acima levando em consideração o contexto cronológico do leito e os fatos matemáticos pré-calculados.
Retorne ESTRITAMENTE o JSON no formato:
${buildBedEvaluationJsonTemplate(prescriptions.map((p: any) => p.id))}`;

      batchRequests.push({
        custom_id: JSON.stringify({
          type: 'bed_evaluation',
          testId,
          bedNumber,
          chapterId,
          questionIds: prescriptions.map((p: any) => p.id),
        }),
        method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: BATCH_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT_BED_SEQUENCE_EVALUATOR },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        },
      });
    }

    if (batchRequests.length === 0) {
      return NextResponse.json({ error: 'Nenhuma conduta de leito válida encontrada para envio.' }, { status: 400 });
    }

    // 5. Budget Cap Check ($0.15 daily / $0.90 monthly)
    const { dailyAccumulated, monthlyAccumulated } = await fetchAccumulatedBudget(supabase);
    const estPromptTokens = batchRequests.length * 3500;
    const estCompletionTokens = batchRequests.length * 1500;
    const estimatedCost = calculateBatchCost(estPromptTokens, estCompletionTokens);

    const capBreach = evaluateBudgetCapBreach(dailyAccumulated, monthlyAccumulated, estimatedCost);
    if (!capBreach.canProceed) {
      const reasonDetail = capBreach.reason === 'daily_cap'
        ? `Teto diário de US$ ${DAILY_HARD_CAP_USD.toFixed(2)} atingido (consumo hoje: US$ ${dailyAccumulated.toFixed(4)}).`
        : `Teto mensal de US$ ${MONTHLY_HARD_CAP_USD.toFixed(2)} atingido (consumo no mês: US$ ${monthlyAccumulated.toFixed(4)}).`;

      return NextResponse.json(
        {
          error: `Limite de orçamento em lote atingido: ${reasonDetail} Por favor, utilize a "⚡ Correção em Tempo Real" ou tente novamente após a renovação do limite orçamentário.`,
          budgetBreach: true,
          reason: capBreach.reason,
          dailyAccumulated,
          monthlyAccumulated,
        },
        { status: 429 }
      );
    }

    // 6. Check user settings & API key (supports mock/demo mode)
    const { data: settings } = await supabase
      .from('user_settings')
      .select('openrouter_api_key')
      .eq('user_id', user.id)
      .single();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;
    const isMock = !apiKey || apiKey === 'mock' || apiKey === 'mock-openrouter-key' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

    // 7. Submit batch to OpenRouter Batch API
    const submission = await submitOpenRouterBatch(batchRequests, apiKey, isMock);

    // 8. Insert record into batch_generation_ledger
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
        items_requested: batchRequests.length,
        items_ingested: 0,
        items_failed: 0,
        status: 'submitted',
      },
      supabase
    );

    // 9. Update tests table and plantao_data metadata
    const plantaoData = testRecord.plantao_data || {};
    const updatedPlantaoData = {
      ...plantaoData,
      batch_job_id: submission.id,
      batch_submitted_at: nowIso,
      evaluationMode: 'batch',
      status: 'awaiting_batch_bed_evaluation',
    };

    const updatePayload: Record<string, any> = {
      status: 'awaiting_batch_bed_evaluation',
      plantao_data: updatedPlantaoData,
    };
    if (userAnswers) {
      updatePayload.answers = userAnswers;
    }

    const { error: updateErr } = await supabase
      .from('tests')
      .update(updatePayload)
      .eq('id', testId);

    if (updateErr) {
      console.error('Error updating test state:', updateErr);
      return NextResponse.json({ error: 'Erro ao atualizar estado do plantão.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      batchId: submission.id,
      status: 'awaiting_batch_bed_evaluation',
      totalRequests: batchRequests.length,
      isMock,
      submittedAt: nowIso,
    });
  } catch (error: any) {
    console.error('Error in /api/plantao/submit-batch:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao submeter lote de leitos.' },
      { status: 500 }
    );
  }
}
