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
import { generatePlantaoBedQuestionsWithAI, QuestionItem } from '@/lib/ai/openrouter';

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
                if (bedQs.length >= 4) {
                  const newBankRow = {
                    chapter_id: b.chapterId,
                    chapter_title: b.chapterTitle,
                    section_title: b.sectionTitle || '',
                    phenotype_title: bedQs[0]?.vignette ? bedQs[0].vignette.slice(0, 90) + '...' : b.chapterTitle,
                    questions: bedQs,
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

    // 7. Organize beds and generate questions using hybrid algorithm (40% to 80% weighted reuse)
    // with resilient concurrency (Promise.allSettled + retry fallback)
    const beds = organizePlantaoBeds(selectedChapterIds, chaptersList, customWeights);
    const allQuestions: QuestionItem[] = [];
    const plantaoBedsData: any[] = [];

    const bedPromises = beds.map(async (bed) => {
      const capInfo = chaptersList.find((c) => c.id === bed.chapterId);
      if (!capInfo) return null;

      const availableCases = bankedCasesByChapter[bed.chapterId] || [];
      const caseCount = availableCases.length;

      // Ponderação do usuário: quanto mais casos salvos, maior a chance de reutilizar (40% a 80%, nunca 100%)
      let reuseChance = 0;
      if (caseCount === 1) reuseChance = 0.40;
      else if (caseCount === 2) reuseChance = 0.55;
      else if (caseCount === 3) reuseChance = 0.68;
      else if (caseCount >= 4) reuseChance = 0.80;

      const shouldReuse = caseCount > 0 && Math.random() < reuseChance;

      if (shouldReuse && availableCases.length > 0) {
        // Seleção aleatória entre os casos menos utilizados para evitar repetição do mesmo fenótipo
        const minTimesUsed = Math.min(...availableCases.map((c: any) => c.times_used || 0));
        const candidateCases = availableCases.filter((c: any) => (c.times_used || 0) <= minTimesUsed + 1);
        const chosenCase = candidateCases[Math.floor(Math.random() * candidateCases.length)] || availableCases[0];

        const rawQs = chosenCase.questions;
        if (Array.isArray(rawQs) && rawQs.length >= 4) {
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

          const clonedQs = rawQs.map((q: any) => ({
            ...q,
            chapterId: bed.chapterId,
            chapterTitle: capInfo.title,
            isFromBank: true,
          }));

          return { bed, questions: clonedQs, isFromBank: true };
        }
      }

      // Generate fresh bed via AI, passing existing phenotypes so AI creates diverse cases
      const existingPhenotypes = availableCases.map((c: any) => {
        return c.phenotype_title || c.questions?.[0]?.vignette?.slice(0, 100) || '';
      }).filter(Boolean);

      try {
        const questions = await generatePlantaoBedQuestionsWithAI({
          apiKey,
          model: questionModel,
          fallbackModel,
          bedNumber: bed.bedNumber,
          chapterInfo: capInfo,
          chapterText: chapterTexts[bed.chapterId],
          existingPhenotypes,
        });

        // Persist newly generated case into bed_case_bank for future plantões with appropriate complexity level
        if (questions && questions.length >= 4) {
          let complexityLevel: 'classic' | 'complex' | 'atypical' = 'classic';
          if (caseCount === 1) complexityLevel = 'complex';
          else if (caseCount >= 2) complexityLevel = 'atypical';

          void (async () => {
            try {
              const { error: insertBankErr } = await supabase
                .from('bed_case_bank')
                .insert({
                  chapter_id: bed.chapterId,
                  chapter_title: capInfo.title,
                  section_title: capInfo.sectionTitle,
                  phenotype_title: questions[0]?.vignette ? questions[0].vignette.slice(0, 90) + '...' : capInfo.title,
                  questions: questions,
                  complexity_level: complexityLevel,
                  times_used: 1,
                });
              if (insertBankErr) console.warn('[Plantao Bank] Falha ao persistir no bed_case_bank:', insertBankErr);
            } catch (e: any) {
              console.warn('[Plantao Bank] Insert error:', e);
            }
          })();
        }

        return { bed, questions, isFromBank: false };
      } catch (aiError: any) {
        console.warn(`[Plantao Bed ${bed.bedNumber}] AI generation failed, checking fallback bank:`, aiError);
        // Fallback: If AI fails and we have a banked case, use it!
        if (availableCases.length > 0) {
          const fallbackCase = availableCases[0];
          const rawQs = fallbackCase.questions;
          if (Array.isArray(rawQs) && rawQs.length >= 4) {
            const clonedQs = rawQs.map((q: any) => ({
              ...q,
              chapterId: bed.chapterId,
              chapterTitle: capInfo.title,
              isFromBank: true,
            }));
            return { bed, questions: clonedQs, isFromBank: true };
          }
        }
        throw aiError;
      }
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
