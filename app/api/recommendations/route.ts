import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildReadinessSnapshot } from '@/lib/learning-engine';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const surfaceParam = searchParams.get('surface');
    const surface = surfaceParam === 'plantao' ? 'plantao' : 'dashboard';
    const requestedChapterId = searchParams.get('chapterId') ? Number(searchParams.get('chapterId')) : undefined;
    const excludeParam = searchParams.get('exclude');
    const excludeChapterIds = excludeParam
      ? excludeParam.split(',').map(Number).filter((n) => !isNaN(n))
      : undefined;

    // Fetch user progress
    const { data: progressList } = await supabase
      .from('chapter_progress')
      .select('chapter_id, is_read, read_at, read_count, last_read_at')
      .eq('user_id', user.id);

    // Fetch review stats (FSRS)
    const { data: reviewStatsList } = await supabase
      .from('chapter_review_stats')
      .select('*')
      .eq('user_id', user.id);

    // Fetch test history
    const { data: testsList } = await supabase
      .from('tests')
      .select('id, chapter_ids, mode, score, completed, completed_at, results, plantao_data')
      .eq('user_id', user.id);

    // Fetch recent recommendation events for context
    const { data: recentEvents } = await supabase
      .from('chapter_recommendation_events')
      .select('recommended_chapter_id, selected_chapter_id, surface, mode, action, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const snapshot = buildReadinessSnapshot({
      progressList: progressList || [],
      reviewStatsList: reviewStatsList || [],
      testsList: testsList || [],
      recentEvents: (recentEvents as any[]) || [],
      surface,
      requestedChapterId,
      excludeChapterIds,
    });

    return NextResponse.json(snapshot);
  } catch (error: any) {
    console.error('Error computing recommendations:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao calcular recomendação' },
      { status: 500 }
    );
  }
}
