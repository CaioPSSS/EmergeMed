import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ALGORITHM_VERSION } from '@/lib/learning-engine';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const {
      recommendedChapterId,
      selectedChapterId,
      surface = 'dashboard',
      mode = 'remediation',
      prioritySnapshot = {},
      action,
    } = body;

    if (!recommendedChapterId || !selectedChapterId || !action) {
      return NextResponse.json(
        { error: 'Campos recomendados: recommendedChapterId, selectedChapterId e action.' },
        { status: 400 }
      );
    }

    const { data: newEvent, error } = await supabase
      .from('chapter_recommendation_events')
      .insert({
        user_id: user.id,
        recommended_chapter_id: Number(recommendedChapterId),
        selected_chapter_id: Number(selectedChapterId),
        surface: String(surface),
        mode: String(mode),
        algorithm_version: ALGORITHM_VERSION,
        priority_snapshot: prioritySnapshot,
        action: String(action),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, event: newEvent });
  } catch (error: any) {
    console.error('Error logging recommendation event:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao registrar evento de recomendação' },
      { status: 500 }
    );
  }
}
