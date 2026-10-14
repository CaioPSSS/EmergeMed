import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getOpenRouterBatchStatus,
  calculateBatchCost,
  fetchAccumulatedBudget,
  updateBatchLedgerRecord,
  BATCH_MODEL,
  DAILY_HARD_CAP_USD,
  MONTHLY_HARD_CAP_USD,
  BatchStatusResponse,
} from '@/lib/ai/openrouter-batch';
import {
  parseJsonFromMarkdown,
  generateAdverseEvolutionQuestionWithAI,
  verifyDisputedBedEvaluations,
  hasDisputedItems,
  MAX_DISPUTE_VERIFICATIONS_PER_RUN,
  QuestionItem,
} from '@/lib/ai/openrouter';
import { collectDeteriorationErrors } from '@/lib/ai/adverse-trigger';
import { parsePrescriptionDrugs, formatDrugFactsForPrompt } from '@/lib/ai/drug-math-validator';
import { fixMojibake } from '@/lib/text-sanitizer';
import { calculateFSRSUpdate } from '@/lib/spaced-repetition';
import { recordActivityAndAwardXP } from '@/lib/gamification-engine';

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
      // Background check for any pending plantão batches belonging to user
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

    // 2. Fetch AI settings once
    const { data: settings } = await supabase
      .from('user_settings')
      .select('openrouter_api_key, question_model, prescription_model, fallback_model')
      .eq('user_id', user.id)
      .maybeSingle();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;

    // Results tracking
    let anyUpdated = false;
    let anyPending = false;
    let latestResponsePayload: any = null;
    const processedTestsSummary: Array<{ testId: string; updated: boolean; status: string }> = [];

    for (const testRecord of targetTests) {
      const currentStatus = testRecord.status || testRecord.plantao_data?.status;

      // Skip if not awaiting batch
      if (
        currentStatus !== 'awaiting_batch_bed_evaluation' &&
        currentStatus !== 'awaiting_batch_feedback'
      ) {
        processedTestsSummary.push({
          testId: testRecord.id,
          updated: false,
          status: currentStatus,
        });
        continue;
      }

      // Resolve batch ID
      const plantaoData = testRecord.plantao_data || {};
      const batchJobId =
        currentStatus === 'awaiting_batch_feedback'
          ? plantaoData.feedbackBatchId || plantaoData.feedback_batch_id || plantaoData.batch_job_id
          : plantaoData.batch_job_id || plantaoData.batch_bed_eval_id || plantaoData.bedBatchId;

      if (!batchJobId) {
        console.warn(`[CheckBatchStatus] Plantão ${testRecord.id} sem batchJobId registrado.`);
        processedTestsSummary.push({
          testId: testRecord.id,
          updated: false,
          status: currentStatus,
        });
        continue;
      }

      // Concurrency Guard: Check if batch was already completed in ledger
      const { data: existingLedger } = await supabase
        .from('batch_generation_ledger')
        .select('*')
        .eq('batch_id', batchJobId)
        .maybeSingle();

      if (existingLedger?.status === 'completed') {
        processedTestsSummary.push({
          testId: testRecord.id,
          updated: false,
          status: testRecord.status,
        });
        continue;
      }

      const isMock =
        !apiKey ||
        apiKey === 'mock' ||
        apiKey === 'mock-openrouter-key' ||
        batchJobId.startsWith('batch_mock_') ||
        process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

      // 3. Query OpenRouter Batch Status
      let batchStatus: BatchStatusResponse;
      try {
        batchStatus = await getOpenRouterBatchStatus(batchJobId, apiKey, isMock);
      } catch (pollErr: any) {
        console.error(`[CheckBatchStatus] Falha ao consultar lote ${batchJobId}:`, pollErr);
        anyPending = true;
        continue;
      }

      // If batch still in progress
      if (batchStatus.status !== 'completed') {
        if (
          batchStatus.status === 'failed' ||
          batchStatus.status === 'cancelled' ||
          batchStatus.status === 'expired'
        ) {
          // Record failure in ledger and test metadata
          await updateBatchLedgerRecord(batchJobId, { status: 'failed' }, supabase);
          await supabase
            .from('tests')
            .update({
              plantao_data: {
                ...plantaoData,
                batch_error: `O lote falhou com status: ${batchStatus.status}`,
              },
            })
            .eq('id', testRecord.id);

          processedTestsSummary.push({
            testId: testRecord.id,
            updated: false,
            status: currentStatus,
          });
          continue;
        }

        anyPending = true;
        processedTestsSummary.push({
          testId: testRecord.id,
          updated: false,
          status: currentStatus,
        });
        continue;
      }

      // 4. Batch is COMPLETED -> Proceed to Ingestion
      const nowIso = new Date().toISOString();

      // Extract Token Usage & Cost
      let promptTokens = batchStatus.usage?.prompt_tokens ?? 0;
      let completionTokens = batchStatus.usage?.completion_tokens ?? 0;

      if (promptTokens === 0 && completionTokens === 0 && batchStatus.results) {
        for (const item of batchStatus.results) {
          promptTokens += item.response?.body?.usage?.prompt_tokens || 0;
          completionTokens += item.response?.body?.usage?.completion_tokens || 0;
        }
      }

      if (promptTokens === 0 && completionTokens === 0) {
        // Fallback realistic token estimation for accounting
        const count = batchStatus.results?.length || 1;
        promptTokens = currentStatus === 'awaiting_batch_bed_evaluation' ? count * 3500 : 3000;
        completionTokens = currentStatus === 'awaiting_batch_bed_evaluation' ? count * 1500 : 2000;
      }

      const costUsd = calculateBatchCost(promptTokens, completionTokens);

      // ======================================================================
      // INGESTION CASE 1: Awaiting Batch Bed Evaluation
      // ======================================================================
      if (currentStatus === 'awaiting_batch_bed_evaluation') {
        const questions = (testRecord.questions as any[]) || [];
        const userAnswers = testRecord.answers || {};
        const evaluations: Record<number, any> = { ...(testRecord.results || {}) };

        // Ensure MCQ questions have valid evaluation recorded
        for (const q of questions) {
          if (
            q.type === 'multiple_choice' &&
            (!evaluations[q.id] || typeof evaluations[q.id].score !== 'number')
          ) {
            const answer = userAnswers[q.id];
            const isCorrect = answer === q.correctOption;
            evaluations[q.id] = {
              userAnswer: answer,
              isCorrect,
              score: isCorrect ? 10 : 0,
              explanation: q.explanation,
            };
          }
        }

        // Parse Bed Evaluations from Batch Results
        const batchResults = batchStatus.results || [];

        // If mock mode with empty results, synthesize mock evaluations
        if (isMock && batchResults.length === 0) {
          const beds = plantaoData.beds || [];
          for (const b of beds) {
            const bedPrescQs = questions.filter(
              (q: any) => (b.questionIds || []).includes(q.id) && q.type !== 'multiple_choice'
            );
            for (const p of bedPrescQs) {
              const ans = userAnswers[p.id];
              const isAnswered = ans && (typeof ans === 'string' ? ans.trim().length > 10 : true);
              evaluations[p.id] = {
                userPrescription: typeof ans === 'string' ? ans : JSON.stringify(ans || ''),
                ventilatorData: typeof ans === 'object' ? ans : undefined,
                score: isAnswered ? 8.5 : 4.0,
                evaluation: {
                  score: isAnswered ? 8.5 : 4.0,
                  verdict: isAnswered ? 'Adequado' : 'Inadequado',
                  strengths: isAnswered
                    ? ['Prescrição estruturada com posologia e via adequadas.', 'Suporte clínico guiado por metas.']
                    : [],
                  improvements: isAnswered
                    ? ['Monitorar diurese horária e estabilidade pressórica.']
                    : ['Conduta incompleta ou com dosagem inadequada para o quadro de choque.'],
                  detailedFeedback: isAnswered
                    ? 'A conduta prescrita atende com eficácia aos critérios de ressuscitação inicial na Sala Vermelha.'
                    : 'A prescrição apresenta omissões críticas nas drogas de primeira linha.',
                  idealPrescription: p.idealPrescription || 'Conduta de referência conforme protocolo.',
                  errorTags: isAnswered ? [] : ['subdosagem', 'droga_ausente'],
                  deteriorationRisk: isAnswered
                    ? { triggered: false, mechanism: '', justification: 'Mock: conduta respondida.' }
                    : {
                        triggered: true,
                        mechanism: 'Omissão das drogas de primeira linha no choque (mock).',
                        justification: 'Mock: prescrição ausente/incompleta.',
                      },
                },
              };
            }
          }
        } else {
          // Parse live/cached results
          for (const item of batchResults) {
            let itemBedNumber: number | null = null;
            let questionIds: number[] = [];

            try {
              const parsedCustom = JSON.parse(item.custom_id);
              itemBedNumber = parsedCustom.bedNumber ?? parsedCustom.bed;
              questionIds = parsedCustom.questionIds || [];
            } catch {
              const match = item.custom_id.match(/bed[_-]?(\d+)/i);
              if (match) itemBedNumber = parseInt(match[1], 10);
            }

            const content = item.response?.body?.choices?.[0]?.message?.content || '{}';
            let parsedData: any = null;
            try {
              parsedData = parseJsonFromMarkdown<any>(content);
            } catch (parseErr) {
              console.warn(`[CheckBatchStatus] Falha ao processar JSON retornado para o leito:`, parseErr);
              parsedData = null;
            }

            const rawEvals = parsedData?.evaluations || parsedData;

            if (rawEvals && typeof rawEvals === 'object' && Object.keys(rawEvals).length > 0) {
              for (const [key, val] of Object.entries(rawEvals)) {
                const qId = parseInt(key, 10);
                if (!isNaN(qId) && val && typeof val === 'object') {
                  const evalObj = val as any;
                  if (evalObj.verdict) evalObj.verdict = fixMojibake(evalObj.verdict);
                  if (evalObj.detailedFeedback)
                    evalObj.detailedFeedback = fixMojibake(evalObj.detailedFeedback);
                  if (evalObj.idealPrescription)
                    evalObj.idealPrescription = fixMojibake(evalObj.idealPrescription);

                  const rawScore =
                    typeof evalObj.score === 'number' && !Number.isNaN(evalObj.score)
                      ? evalObj.score
                      : 0;

                  const ans = userAnswers[qId];
                  evaluations[qId] = {
                    userPrescription: typeof ans === 'string' ? ans : JSON.stringify(ans || ''),
                    ventilatorData: typeof ans === 'object' ? ans : undefined,
                    evaluation: evalObj,
                    score: rawScore,
                  };
                }
              }
            } else {
              // Fallback evaluation for this bed if parsedData is null or invalid
              let fallbackQIds = questionIds;
              if (fallbackQIds.length === 0 && itemBedNumber) {
                const bedMeta = (plantaoData.beds || []).find((b: any) => b.bedNumber === itemBedNumber);
                if (bedMeta && bedMeta.questionIds) {
                  fallbackQIds = questions
                    .filter((q: any) => bedMeta.questionIds.includes(q.id) && q.type !== 'multiple_choice')
                    .map((q: any) => q.id);
                }
              }

              for (const qId of fallbackQIds) {
                const ans = userAnswers[qId];
                evaluations[qId] = {
                  userPrescription: typeof ans === 'string' ? ans : JSON.stringify(ans || ''),
                  ventilatorData: typeof ans === 'object' ? ans : undefined,
                  evaluation: {
                    score: 5.0,
                    verdict: 'Requer Ajustes',
                    strengths: [],
                    improvements: ['Resposta de avaliação em lote indisponível ou corrompida. Recomendada revisão de conduta.'],
                    detailedFeedback: 'Falha ao processar o formato da avaliação retornado pelo modelo de lote. O leito foi avaliado com status de segurança de revisão clínica.',
                    idealPrescription: 'Revisar protocolo e diretriz de conduta para este quadro clínico.',
                    errorTags: ['reavaliacao_necessaria'],
                  },
                  score: 5.0,
                };
              }
            }
          }
        }

        // ==================================================================
        // Verificação sob dúvida (busca web) das avaliações com disputedItems.
        // Roda de forma síncrona APÓS o lote, pois depende do resultado dele;
        // usa o server tool openrouter:web_search (não permitido dentro do Batch).
        // ==================================================================
        if (!isMock) {
          let verificationsLeft = MAX_DISPUTE_VERIFICATIONS_PER_RUN;
          for (const bed of plantaoData.beds || []) {
            if (verificationsLeft <= 0) break;
            const bedPrescQs = questions.filter(
              (q: any) => (bed.questionIds || []).includes(q.id) && q.type !== 'multiple_choice'
            );
            const disputedQs = bedPrescQs.filter((q: any) => hasDisputedItems(evaluations[q.id]?.evaluation));
            if (disputedQs.length === 0) continue;

            let bedChapterText: string | undefined;
            const bedChapterId = bed.chapterId || bedPrescQs[0]?.chapterId;
            if (bedChapterId) {
              const { data: chapterContent } = await supabase
                .from('chapter_contents')
                .select('content')
                .eq('chapter_id', bedChapterId)
                .single();
              bedChapterText = chapterContent?.content;
            }

            const preliminaryEvals: Record<number, any> = {};
            bedPrescQs.forEach((q: any) => {
              if (evaluations[q.id]?.evaluation) preliminaryEvals[q.id] = evaluations[q.id].evaluation;
            });

            const verified = await verifyDisputedBedEvaluations({
              apiKey,
              model: settings?.prescription_model || 'openai/gpt-6-luna',
              fallbackModel: settings?.fallback_model || 'deepseek/deepseek-v4.1-flash',
              evaluations: preliminaryEvals,
              prescriptions: bedPrescQs.map((q: any) => {
                const ans = userAnswers[q.id];
                return {
                  id: q.id,
                  type: q.type,
                  vignette: q.vignette,
                  userPrescription: typeof ans === 'string' ? ans : undefined,
                  ventilatorData: ans && typeof ans === 'object' ? ans : undefined,
                };
              }),
              chapterText: bedChapterText,
              maxVerifications: verificationsLeft,
            });
            verificationsLeft -= Math.min(disputedQs.length, verificationsLeft);

            for (const q of disputedQs) {
              const revised = verified[q.id];
              if (revised && revised !== preliminaryEvals[q.id]) {
                evaluations[q.id] = {
                  ...evaluations[q.id],
                  evaluation: revised,
                  score: typeof revised.score === 'number' ? revised.score : evaluations[q.id].score,
                };
              }
            }
          }
        }

        // Evaluate Clinical Failure / Adverse Descompensation Criteria
        const beds = (plantaoData.beds || []).map((b: any) => ({ ...b }));
        const newlyGeneratedBonusQuestions: QuestionItem[] = [];
        const updatedQuestions = [...questions];

        for (const bed of beds) {
          // Concurrency guard: skip if Q5 was already generated
          if (bed.bonusQuestionId) continue;

          const bedQs = updatedQuestions.filter((q: any) =>
            (bed.questionIds || []).includes(q.id)
          );

          // Único gatilho: deteriorationRisk.triggered declarado pelo avaliador.
          // Múltipla escolha, veredito "Requer Ajustes" e média do leito NÃO disparam complicação.
          const errorsContext = collectDeteriorationErrors(bedQs, evaluations);

          if (errorsContext.length > 0) {
            // Math facts pre-calculation
            const weightMatch = (bedQs[0]?.vignette || '').match(/(\d{2,3})\s*kg\b/i);
            const patientWeight =
              bedQs.find((q: any) => q.patientWeight)?.patientWeight ||
              (weightMatch ? parseInt(weightMatch[1], 10) : 70);

            const allCalcs: any[] = [];
            for (const err of errorsContext) {
              if (err.userText) {
                const calcs = parsePrescriptionDrugs(err.userText, patientWeight);
                allCalcs.push(...calcs);
              }
            }
            const mathFactsText = formatDrugFactsForPrompt(allCalcs);

            const maxId = Math.max(...updatedQuestions.map((q: any) => q.id), 0);
            const newId = maxId + 1;

            let q5Question: QuestionItem | null;
            if (isMock) {
              q5Question = {
                id: newId,
                type: 'prescription_immediate',
                chapterId: bed.chapterId || bedQs[0]?.chapterId || 1,
                chapterTitle: `${bed.chapterTitle || 'Leito ' + bed.bedNumber} — COMPLICAÇÃO (EVOLUÇÃO ADVERSA)`,
                vignette: `[INTERCORRÊNCIA CLÍNICA - LEITO ${bed.bedNumber}] Paciente apresentou instabilidade hemodinâmica grave após a conduta inicial. Sinais vitais: PA 65/40 mmHg, FC 138 bpm, SatO2 86%. Prescreva a conduta imediata de emergência para resgate do paciente.`,
                patientWeight,
                promptText: 'Prescreva a conduta de emergência para estabilização imediata.',
              };
            } else {
              q5Question = await generateAdverseEvolutionQuestionWithAI({
                apiKey,
                model: settings?.question_model || 'openai/gpt-6-luna',
                fallbackModel: settings?.fallback_model || 'deepseek/deepseek-v4.1-flash',
                bedNumber: bed.bedNumber,
                chapterTitle: bed.chapterTitle || `Leito ${bed.bedNumber}`,
                originalVignette: bedQs[0]?.vignette || '',
                errorsContext,
                mathFactsText,
              });
              // Freio de bom senso do gerador: mecanismo não plausível → sem complicação.
              if (!q5Question) continue;
              q5Question.id = newId;
              q5Question.chapterTitle = `${bed.chapterTitle || 'Leito ' + bed.bedNumber} — COMPLICAÇÃO (EVOLUÇÃO ADVERSA)`;
            }

            bed.bonusQuestionId = newId;
            bed.hasAdverseEvolution = true;
            newlyGeneratedBonusQuestions.push(q5Question);
            updatedQuestions.push(q5Question);
          }
        }

        const hasAnyAdverse = beds.some((b: any) => Boolean(b.bonusQuestionId || b.hasAdverseEvolution));
        const updatedPlantaoData = {
          ...plantaoData,
          beds,
          hasAdverseEvolution: hasAnyAdverse,
          adverseEvolutions: beds.filter((b: any) => Boolean(b.bonusQuestionId)).length,
          bedEvaluationCompletedAt: nowIso,
          status: 'ready_for_adverse',
        };

        // Update tests in Supabase
        await supabase
          .from('tests')
          .update({
            status: 'ready_for_adverse',
            questions: updatedQuestions,
            total_questions: updatedQuestions.length,
            results: evaluations,
            plantao_data: updatedPlantaoData,
          })
          .eq('id', testRecord.id);

        // Ingestion Budget Accounting in Ledger
        const { dailyAccumulated, monthlyAccumulated } = await fetchAccumulatedBudget(supabase);
        await updateBatchLedgerRecord(
          batchJobId,
          {
            status: 'completed',
            completion_timestamp: batchStatus.completed_at || nowIso,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            cost_usd: costUsd,
            items_ingested: (batchStatus.results || []).length,
            items_failed: batchStatus.request_counts?.failed || 0,
            daily_accumulated_usd: Number((dailyAccumulated + costUsd).toFixed(6)),
            monthly_accumulated_usd: Number((monthlyAccumulated + costUsd).toFixed(6)),
          },
          supabase
        );

        anyUpdated = true;
        latestResponsePayload = {
          updated: true,
          pending: false,
          status: 'ready_for_adverse',
          hasAdverseEvolution: hasAnyAdverse,
          adverseBedsCount: newlyGeneratedBonusQuestions.length,
          results: evaluations,
          questions: updatedQuestions,
          testId: testRecord.id,
        };

        processedTestsSummary.push({
          testId: testRecord.id,
          updated: true,
          status: 'ready_for_adverse',
        });
      }

      // ======================================================================
      // INGESTION CASE 2: Awaiting Batch Feedback
      // ======================================================================
      else if (currentStatus === 'awaiting_batch_feedback') {
        let generalFeedback = '';

        if (isMock) {
          generalFeedback = `## Passagem de Plantão Noturno — Relatório de Preceptoria\n\n### Síntese Geral do Plantão\nO médico plantonista conduziu os casos de emergência na Sala Vermelha da UPA demonstrando raciocínio clínico coerente e segurança na tomada de decisões terapêuticas.\n\n### Pontos Críticos e Intercorrências\n- **Manejo Farmacológico:** As doses das drogas vasoativas foram ajustadas adequadamente por peso corporal.\n- **Suporte Ventilatório:** Os parâmetros de ventilação mecânica adotados respeitaram a estratégia protetora.\n\n### Recomendações de Estudo\nRevisar os protocolos dos capítulos pertinentes para consolidar os alvos hemodinâmicos e manter a retenção espaçada FSRS.`;
        } else {
          const fbItem =
            batchStatus.results?.find((r) => r.custom_id.includes('feedback')) ||
            batchStatus.results?.[0];
          generalFeedback = fbItem?.response?.body?.choices?.[0]?.message?.content || '';
          generalFeedback = fixMojibake(generalFeedback);
        }

        const updatedResults = {
          ...(testRecord.results || {}),
          generalFeedback,
        };

        // Compute final overall shift score (0.0 to 10.0)
        let totalPoints = 0;
        const questions = (testRecord.questions as any[]) || [];
        questions.forEach((q: any) => {
          totalPoints += updatedResults[q.id]?.score || 0;
        });
        const maxPoints = (questions.length || 1) * 10;
        const finalScore = Math.round((totalPoints / maxPoints) * 100) / 10;

        // FSRS Spaced Repetition Updates for Beds
        const beds = plantaoData.beds || [];
        for (const bed of beds) {
          if (!bed.chapterId) continue;
          const bedQs = questions.filter(
            (q: any) => (bed.questionIds || []).includes(q.id) || bed.bonusQuestionId === q.id
          );
          let bedPoints = 0;
          bedQs.forEach((q: any) => {
            bedPoints += updatedResults[q.id]?.score || 0;
          });
          const bedAvgScore = bedQs.length > 0 ? bedPoints / bedQs.length : 0;

          try {
            const { data: stat } = await supabase
              .from('chapter_review_stats')
              .select('*')
              .eq('user_id', user.id)
              .eq('chapter_id', bed.chapterId)
              .maybeSingle();

            const update = calculateFSRSUpdate(stat, bedAvgScore);
            await supabase.from('chapter_review_stats').upsert({
              user_id: user.id,
              chapter_id: bed.chapterId,
              ...update,
            });
          } catch (fsrsErr) {
            console.warn('[CheckBatchStatus] FSRS update error:', fsrsErr);
          }
        }

        // Award Gamification XP
        await recordActivityAndAwardXP(supabase, user.id, {
          type: 'plantao_complete',
          plantaoScore: finalScore,
        }).catch((xpErr) => console.warn('[CheckBatchStatus] XP award error:', xpErr));

        const updatedPlantaoData = {
          ...plantaoData,
          feedbackCompletedAt: nowIso,
          status: 'completed',
        };

        // Update DB
        await supabase
          .from('tests')
          .update({
            status: 'completed',
            completed: true,
            completed_at: nowIso,
            score: finalScore,
            results: updatedResults,
            plantao_data: updatedPlantaoData,
          })
          .eq('id', testRecord.id);

        // Ingestion Budget Accounting in Ledger
        const { dailyAccumulated, monthlyAccumulated } = await fetchAccumulatedBudget(supabase);
        await updateBatchLedgerRecord(
          batchJobId,
          {
            status: 'completed',
            completion_timestamp: batchStatus.completed_at || nowIso,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            cost_usd: costUsd,
            items_ingested: (batchStatus.results || []).length,
            items_failed: batchStatus.request_counts?.failed || 0,
            daily_accumulated_usd: Number((dailyAccumulated + costUsd).toFixed(6)),
            monthly_accumulated_usd: Number((monthlyAccumulated + costUsd).toFixed(6)),
          },
          supabase
        );

        anyUpdated = true;
        latestResponsePayload = {
          updated: true,
          pending: false,
          status: 'completed',
          score: finalScore,
          results: updatedResults,
          testId: testRecord.id,
        };

        processedTestsSummary.push({
          testId: testRecord.id,
          updated: true,
          status: 'completed',
        });
      }
    }

    // Single test request return
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

    // Multi-test background check return
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
