import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CHAPTERS_DATA } from '@/lib/chapters-data';
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

    // 3. Build snapshot and select beds deterministically for surface 'plantao'
    const engineSnapshot = buildReadinessSnapshot({
      progressList: readProgress ? readProgress.map((p) => ({ chapter_id: p.chapter_id, is_read: true })) : [],
      reviewStatsList: reviewStats || [],
      testsList: testsList || [],
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
    const questionModel = settings?.question_model || 'openai/gpt-5.6-luna';
    const fallbackModel = settings?.fallback_model || 'nvidia/nemotron-3-ultra-550b-a55b:free';

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

    // 6. Generate 4 questions per bed using OpenRouter AI in parallel
    const beds = organizePlantaoBeds(selectedChapterIds);
    const allQuestions: QuestionItem[] = [];
    const plantaoBedsData: any[] = [];

    let globalQuestionIdCounter = 1;

    const bedPromises = beds.map(async (bed) => {
      const capInfo = CHAPTERS_DATA.find((c) => c.id === bed.chapterId);
      if (!capInfo) return null;

      const questions = await generatePlantaoBedQuestionsWithAI({
        apiKey,
        model: questionModel,
        fallbackModel,
        bedNumber: bed.bedNumber,
        chapterInfo: capInfo,
        chapterText: chapterTexts[bed.chapterId],
      });

      return { bed, questions };
    });

    const bedResults = await Promise.all(bedPromises);

    for (const res of bedResults) {
      if (!res) continue;

      const questionIdsForBed: number[] = [];

      res.questions.forEach((q) => {
        const uniqueId = globalQuestionIdCounter++;
        q.id = uniqueId;
        questionIdsForBed.push(uniqueId);
        allQuestions.push(q);
      });

      plantaoBedsData.push({
        bedNumber: res.bed.bedNumber,
        chapterId: res.bed.chapterId,
        chapterTitle: res.bed.chapterTitle,
        sectionTitle: res.bed.sectionTitle,
        frequencyScore: res.bed.frequencyScore,
        importanceScore: res.bed.importanceScore,
        questionIds: questionIdsForBed,
        patientSummary: res.questions[0]?.vignette
          ? res.questions[0].vignette.slice(0, 140) + '...'
          : `Paciente no Leito ${res.bed.bedNumber}`,
      });
    }

    // 7. Get user's plantão count for numbering
    const { count: plantaoCount } = await supabase
      .from('tests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('mode', 'plantao');

    const plantaoNumber = (plantaoCount || 0) + 1;

    // 8. Save test record in Supabase
    const { data: newTest, error: insertErr } = await supabase
      .from('tests')
      .insert({
        user_id: user.id,
        chapter_ids: selectedChapterIds,
        question_type: 'mixed',
        total_questions: allQuestions.length,
        questions: allQuestions,
        completed: false,
        mode: 'plantao',
        plantao_data: {
          plantaoNumber,
          bedCount: validBedCount,
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
