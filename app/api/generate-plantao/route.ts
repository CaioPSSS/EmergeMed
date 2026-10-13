import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CHAPTERS_DATA } from '@/lib/chapters-data';
import { getUnifiedChapters, getUnifiedChapterWeights } from '@/lib/chapters-service';
import {
  calculateChapterScores,
  selectPlantaoChapters,
  organizePlantaoBeds,
} from '@/lib/spaced-repetition';
import {
  buildReadinessSnapshot,
  selectPlantaoBedsWithEngine,
} from '@/lib/learning-engine';
import { generatePlantaoBedQuestionsWithAI, generateQuestionsWithAI, QuestionItem } from '@/lib/ai/openrouter';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { bedCount = 4 } = (await request.json().catch(() => ({}))) as {
      bedCount?: number;
    };

    const validBedCount = Math.min(8, Math.max(1, Number(bedCount) || 4));

    // 1. Fetch user's read chapters
    const { data: readProgress } = await supabase
      .from('chapter_progress')
      .select('chapter_id')
      .eq('user_id', user.id)
      .eq('is_read', true);

    const readChapterIds = readProgress ? readProgress.map((p) => p.chapter_id) : [];

    if (readChapterIds.length === 0) {
      return NextResponse.json(
        { error: 'Você precisa marcar pelo menos um capítulo como lido antes de iniciar o Modo Plantão.' },
        { status: 400 }
      );
    }

    // 2. Fetch user's review stats and test history for snapshot
    const { data: reviewStats } = await supabase
      .from('chapter_review_stats')
      .select('*')
      .eq('user_id', user.id);

    const { data: testsList } = await supabase
      .from('tests')
      .select('id, chapter_ids, mode, score, completed, completed_at, results, plantao_data')
      .eq('user_id', user.id);

    // Fetch unified chapters and weights
    const [chaptersList, customWeights] = await Promise.all([
      getUnifiedChapters(supabase, user.id),
      getUnifiedChapterWeights(supabase, user.id),
    ]);

    // 3. Build snapshot and select beds deterministically for surface 'plantao'
    const engineSnapshot = buildReadinessSnapshot({
      progressList: readProgress ? readProgress.map((p) => ({ chapter_id: p.chapter_id, is_read: true })) : [],
      reviewStatsList: reviewStats || [],
      testsList: testsList || [],
      chaptersList,
      customWeights,
      surface: 'plantao',
    });

    const selectedBedsWithEngine = selectPlantaoBedsWithEngine({
      snapshot: engineSnapshot,
      bedCount: validBedCount,
      maxPerSection: 2,
    });

    const selectedChapterIds = selectedBedsWithEngine.map((b) => b.chapterId);

    // 4. Fetch user AI settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const apiKey = settings?.openrouter_api_key || process.env.OPENROUTER_API_KEY;
    const questionModel = settings?.question_model || 'openai/gpt-6-luna';
    const fallbackModel = settings?.fallback_model || 'deepseek/deepseek-v4.1-flash';

    // 5. Fetch chapter full text contents (if uploaded to DB)
    const { data: contents } = await supabase
      .from('chapter_contents')
      .select('chapter_id, content')
      .in('chapter_id', selectedChapterIds);

    const chapterTexts: Record<number, string> = {};
    if (contents) {
      contents.forEach((item) => {
        chapterTexts[item.chapter_id] = item.content;
      });
    }

    // 6. Check bed_case_bank for previously validated bed quartets
    const bankedCasesByChapter: Record<number, any[]> = {};
    try {
      const { data: bankData } = await supabase
        .from('bed_case_bank')
        .select('*')
        .in('chapter_id', selectedChapterIds)
        .order('times_used', { ascending: true });

      if (bankData && Array.isArray(bankData)) {
        bankData.forEach((row) => {
          if (!bankedCasesByChapter[row.chapter_id]) {
            bankedCasesByChapter[row.chapter_id] = [];
          }
          bankedCasesByChapter[row.chapter_id].push(row);
        });
      }
    } catch (err) {
      console.warn('[Plantao Bank] Erro ao consultar bed_case_bank:', err);
    }

    // 6.1 Fetch MCQs from question_bank for each selected chapter
    const bankedMcqsByChapter: Record<number, any[]> = {};
    try {
      const { data: mcqData } = await supabase
        .from('question_bank')
        .select('*')
        .in('chapter_id', selectedChapterIds)
        .eq('question_type', 'multiple_choice')
        .order('times_shown', { ascending: true });

      if (mcqData && Array.isArray(mcqData)) {
        mcqData.forEach((row) => {
          if (!bankedMcqsByChapter[row.chapter_id]) {
            bankedMcqsByChapter[row.chapter_id] = [];
          }
          bankedMcqsByChapter[row.chapter_id].push(row);
        });
      }
    } catch (err) {
      console.warn('[Plantao Bank] Erro ao consultar question_bank:', err);
    }

    // Se algum capítulo selecionado ainda não possui casos no banco, busca nos plantões anteriores do usuário em 'tests'
    const missingChapterIds = selectedChapterIds.filter(
      (id) => !bankedCasesByChapter[id] || bankedCasesByChapter[id].length === 0
    );

    if (missingChapterIds.length > 0) {
      try {
        const { data: pastPlantões } = await supabase
          .from('tests')
          .select('questions, plantao_data')
          .eq('user_id', user.id)
          .eq('mode', 'plantao')
          .order('created_at', { ascending: false })
          .limit(10);

        if (pastPlantões && Array.isArray(pastPlantões)) {
          for (const p of pastPlantões) {
            const pBeds = p.plantao_data?.beds || [];
            const pQuestions = (p.questions || []) as QuestionItem[];

            for (const b of pBeds) {
              if (missingChapterIds.includes(b.chapterId) && (!bankedCasesByChapter[b.chapterId] || bankedCasesByChapter[b.chapterId].length === 0)) {
                const bedQs = pQuestions.filter((q) => (b.questionIds || []).includes(q.id));
                const prescStages = bedQs.filter((q) => q.type !== 'multiple_choice');
                if (prescStages.length >= 2) {
                  const newBankRow = {
                    chapter_id: b.chapterId,
                    chapter_title: b.chapterTitle,
                    section_title: b.sectionTitle || '',
                    phenotype_title: prescStages[0]?.vignette ? prescStages[0].vignette.slice(0, 90) + '...' : b.chapterTitle,
                    questions: [prescStages[0], prescStages[1]],
                    complexity_level: 'classic' as const,
                    times_used: 1,
                  };

                  if (!bankedCasesByChapter[b.chapterId]) bankedCasesByChapter[b.chapterId] = [];
                  bankedCasesByChapter[b.chapterId].push(newBankRow);

                  // Persist in background so bed_case_bank remains populated
                  void (async () => {
                    try {
                      await supabase.from('bed_case_bank').insert(newBankRow);
                    } catch (e) {
                      console.warn('[Plantao Bank] Auto-seed from past tests failed:', e);
                    }
                  })();
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Plantao Bank] Erro ao buscar histórico de plantões em tests:', err);
      }
    }

    // 7. Organize beds and generate questions using hybrid algorithm
    // with 2 prescription stages + 2 MCQs per bed and resilient concurrency
    const beds = organizePlantaoBeds(selectedChapterIds, chaptersList, customWeights);
    const allQuestions: QuestionItem[] = [];
    const plantaoBedsData: any[] = [];

    const bedPromises = beds.map(async (bed) => {
      const capInfo = chaptersList.find((c) => c.id === bed.chapterId);
      if (!capInfo) return null;

      const availableCases = bankedCasesByChapter[bed.chapterId] || [];
      // Filter for valid 2-stage cases (starts with prescription_immediate)
      const valid2StageCases = availableCases.filter((c: any) => {
        const qs = c.questions;
        return Array.isArray(qs) && qs.length >= 2 && qs[0]?.type === 'prescription_immediate';
      });
      const caseCount = valid2StageCases.length;

      // Ponderação do usuário atualizada (35% a 90%):
      // 1 (35%), 2 (50%), 3 (65%), 4 (75%), 5 (85%), 6 (90% teto máximo)
      let reuseChance = 0;
      if (caseCount === 1) reuseChance = 0.35;
      else if (caseCount === 2) reuseChance = 0.50;
      else if (caseCount === 3) reuseChance = 0.65;
      else if (caseCount === 4) reuseChance = 0.75;
      else if (caseCount === 5) reuseChance = 0.85;
      else if (caseCount >= 6) reuseChance = 0.90;

      const shouldReuse = caseCount > 0 && Math.random() < reuseChance;

      let stage1Immediate: QuestionItem | null = null;
      let stage2Maintenance: QuestionItem | null = null;
      let isCaseFromBank = false;

      if (shouldReuse && valid2StageCases.length > 0) {
        // Seleção aleatória entre os casos menos utilizados para evitar repetição do mesmo fenótipo
        const minTimesUsed = Math.min(...valid2StageCases.map((c: any) => c.times_used || 0));
        const candidateCases = valid2StageCases.filter((c: any) => (c.times_used || 0) <= minTimesUsed + 1);
        const chosenCase = candidateCases[Math.floor(Math.random() * candidateCases.length)] || valid2StageCases[0];

        const rawQs = chosenCase.questions;
        if (Array.isArray(rawQs) && rawQs.length >= 2) {
          stage1Immediate = {
            ...rawQs[0],
            chapterId: bed.chapterId,
            chapterTitle: capInfo.title,
            isFromBank: true,
          };
          stage2Maintenance = {
            ...rawQs[1],
            chapterId: bed.chapterId,
            chapterTitle: capInfo.title,
            isFromBank: true,
          };
          isCaseFromBank = true;

          // Increment times_used in background
          if (chosenCase.id) {
            void (async () => {
              try {
                await supabase
                  .from('bed_case_bank')
                  .update({ times_used: (chosenCase.times_used || 0) + 1, updated_at: new Date().toISOString() })
                  .eq('id', chosenCase.id);
              } catch (e: any) {
                console.warn('[Plantao Bank] Update times_used failed:', e);
              }
            })();
          }
        }
      }

      // Generate fresh 2-stage bed case via AI if not reused from bank
      if (!stage1Immediate || !stage2Maintenance) {
        const existingPhenotypes = availableCases.map((c: any) => {
          return c.phenotype_title || c.questions?.[0]?.vignette?.slice(0, 100) || '';
        }).filter(Boolean);

        try {
          const generatedStages = await generatePlantaoBedQuestionsWithAI({
            apiKey,
            model: questionModel,
            fallbackModel,
            bedNumber: bed.bedNumber,
            chapterInfo: capInfo,
            chapterText: chapterTexts[bed.chapterId],
            existingPhenotypes,
          });

          if (!generatedStages || generatedStages.length < 2) {
            throw new Error(`Falha ao gerar as 2 etapas do leito ${bed.bedNumber}`);
          }

          stage1Immediate = {
            ...generatedStages[0],
            chapterId: bed.chapterId,
            chapterTitle: capInfo.title,
            isFromBank: false,
          };
          stage2Maintenance = {
            ...generatedStages[1],
            chapterId: bed.chapterId,
            chapterTitle: capInfo.title,
            isFromBank: false,
          };

          // Persist newly generated 2-stage case into bed_case_bank
          let complexityLevel: 'classic' | 'complex' | 'atypical' = 'classic';
          if (caseCount === 1 || caseCount === 2) complexityLevel = 'complex';
          else if (caseCount >= 3) complexityLevel = 'atypical';

          void (async () => {
            try {
              const { error: insertBankErr } = await supabase
                .from('bed_case_bank')
                .insert({
                  chapter_id: bed.chapterId,
                  chapter_title: capInfo.title,
                  section_title: capInfo.sectionTitle,
                  phenotype_title: stage1Immediate?.vignette ? stage1Immediate.vignette.slice(0, 90) + '...' : capInfo.title,
                  questions: [stage1Immediate, stage2Maintenance],
                  complexity_level: complexityLevel,
                  times_used: 1,
                });
              if (insertBankErr) console.warn('[Plantao Bank] Falha ao persistir no bed_case_bank:', insertBankErr);
            } catch (e: any) {
              console.warn('[Plantao Bank] Insert error:', e);
            }
          })();
        } catch (aiError: any) {
          console.warn(`[Plantao Bed ${bed.bedNumber}] AI case generation failed, checking fallback bank:`, aiError);
          if (valid2StageCases.length > 0) {
            const fallbackCase = valid2StageCases[0];
            const rawQs = fallbackCase.questions;
            stage1Immediate = {
              ...rawQs[0],
              chapterId: bed.chapterId,
              chapterTitle: capInfo.title,
              isFromBank: true,
            };
            stage2Maintenance = {
              ...rawQs[1],
              chapterId: bed.chapterId,
              chapterTitle: capInfo.title,
              isFromBank: true,
            };
            isCaseFromBank = true;
          } else {
            throw aiError;
          }
        }
      }

      // Fetch 2 MCQs from question_bank for bed.chapterId (or generate via AI if unavailable)
      const availableMcqs = bankedMcqsByChapter[bed.chapterId] || [];
      const bedMcqs: QuestionItem[] = [];

      const mcqsFromBank = availableMcqs.slice(0, 2);
      for (const mcqRow of mcqsFromBank) {
        bedMcqs.push({
          id: 0,
          chapterId: bed.chapterId,
          chapterTitle: capInfo.title,
          type: 'multiple_choice',
          vignette: mcqRow.vignette,
          options: mcqRow.options,
          correctOption: mcqRow.correct_option,
          explanation: mcqRow.explanation,
          isFromBank: true,
        });

        if (mcqRow.id) {
          void (async () => {
            try {
              await supabase
                .from('question_bank')
                .update({ times_shown: (mcqRow.times_shown || 0) + 1 })
                .eq('id', mcqRow.id);
            } catch (e: any) {
              console.warn('[Question Bank] Update times_shown failed:', e);
            }
          })();
        }
      }

      const mcqsNeeded = 2 - bedMcqs.length;
      if (mcqsNeeded > 0) {
        try {
          const generatedMcqs = await generateQuestionsWithAI({
            apiKey,
            model: questionModel,
            fallbackModel,
            chaptersInfo: [capInfo],
            chapterTexts: chapterTexts[bed.chapterId] ? { [bed.chapterId]: chapterTexts[bed.chapterId] } : undefined,
            count: mcqsNeeded,
            questionType: 'multiple_choice',
          });

          for (const q of generatedMcqs) {
            q.chapterId = bed.chapterId;
            q.chapterTitle = capInfo.title;
            bedMcqs.push(q);
          }

          if (generatedMcqs.length > 0) {
            const toInsert = generatedMcqs.map((q) => ({
              chapter_id: bed.chapterId,
              question_type: 'multiple_choice',
              vignette: q.vignette,
              options: q.options || null,
              correct_option: q.correctOption !== undefined ? q.correctOption : null,
              explanation: q.explanation || null,
              source: 'ai_generated',
              times_shown: 1,
            }));

            void (async () => {
              try {
                await supabase.from('question_bank').insert(toInsert);
              } catch (err) {
                console.warn('[Question Bank] Falha ao persistir MCQs:', err);
              }
            })();
          }
        } catch (mcqErr) {
          console.warn(`[Plantao Bed ${bed.bedNumber}] Falha ao gerar MCQs via IA:`, mcqErr);
        }
      }

      if (!stage1Immediate || !stage2Maintenance) {
        throw new Error(`Falha ao obter as etapas clínicas para o Leito ${bed.bedNumber}`);
      }

      // Assemble the 4 bed questions: [etapa1_immediate, etapa2_maintenance, mcq1, mcq2]
      const bedQuestions: QuestionItem[] = [
        stage1Immediate,
        stage2Maintenance,
        ...bedMcqs.slice(0, 2),
      ];

      return { bed, questions: bedQuestions, isFromBank: isCaseFromBank };
    });

    // Execute with resilient Promise.allSettled
    const settledResults = await Promise.allSettled(bedPromises);

    let globalQuestionIdCounter = 1;

    for (let i = 0; i < settledResults.length; i++) {
      const outcome = settledResults[i];
      const bed = beds[i];

      if (outcome.status === 'fulfilled' && outcome.value) {
        const res = outcome.value;
        const questionIdsForBed: number[] = [];
        const sequentialBedNumber = plantaoBedsData.length + 1;

        res.questions.forEach((q: QuestionItem) => {
          const uniqueId = globalQuestionIdCounter++;
          q.id = uniqueId;
          questionIdsForBed.push(uniqueId);
          allQuestions.push(q);
        });

        plantaoBedsData.push({
          bedNumber: sequentialBedNumber,
          chapterId: res.bed.chapterId,
          chapterTitle: res.bed.chapterTitle,
          sectionTitle: res.bed.sectionTitle,
          frequencyScore: res.bed.frequencyScore,
          importanceScore: res.bed.importanceScore,
          questionIds: questionIdsForBed,
          isFromBank: res.isFromBank || false,
          patientSummary: res.questions[0]?.vignette
            ? res.questions[0].vignette.slice(0, 140) + '...'
            : `Paciente no Leito ${sequentialBedNumber}`,
        });
      } else {
        console.error(`[Plantao Error] Falha definitiva no leito ${bed.bedNumber}:`, (outcome as PromiseRejectedResult).reason);
      }
    }

    if (plantaoBedsData.length === 0) {
      throw new Error('Não foi possível gerar nenhum dos leitos do plantão. Verifique sua chave da API OpenRouter ou tente novamente.');
    }

    // 8. Get user's plantão count for numbering
    const { count: plantaoCount } = await supabase
      .from('tests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('mode', 'plantao');

    const plantaoNumber = (plantaoCount || 0) + 1;

    // 9. Save test record in Supabase
    const { data: newTest, error: insertErr } = await supabase
      .from('tests')
      .insert({
        user_id: user.id,
        chapter_ids: plantaoBedsData.map((b) => b.chapterId),
        question_type: 'mixed',
        total_questions: allQuestions.length,
        questions: allQuestions,
        completed: false,
        mode: 'plantao',
        plantao_data: {
          plantaoNumber,
          bedCount: plantaoBedsData.length,
          beds: plantaoBedsData,
          adverseEvolutions: 0,
          algorithmVersion: engineSnapshot.algorithmVersion,
          globalReadinessAtStart: engineSnapshot.globalReadiness,
        },
      })
      .select()
      .single();

    if (insertErr || !newTest) {
      throw insertErr || new Error('Erro ao salvar o plantão no banco de dados.');
    }

    return NextResponse.json({ testId: newTest.id, plantaoNumber, beds: plantaoBedsData });
  } catch (error: any) {
    console.error('Error generating Plantao:', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno ao gerar o plantão.' },
      { status: 500 }
    );
  }
}
