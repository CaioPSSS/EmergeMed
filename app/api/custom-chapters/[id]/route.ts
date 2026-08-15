import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const chapterId = parseInt(id, 10);
    if (isNaN(chapterId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const { data: chapter, error } = await supabase
      .from('custom_chapters')
      .select('*')
      .eq('id', chapterId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !chapter) {
      return NextResponse.json({ error: 'Capítulo não encontrado' }, { status: 404 });
    }

    return NextResponse.json({ chapter });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao carregar capítulo' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const chapterId = parseInt(id, 10);
    if (isNaN(chapterId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const body = await request.json() as {
      title?: string;
      sourceBook?: string;
      sectionTitle?: string;
      category?: string;
      summary?: string;
      content?: string;
      frequencyScore?: number;
      importanceScore?: number;
    };

    const nowIso = new Date().toISOString();
    const updates: Record<string, any> = {
      updated_at: nowIso,
    };

    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.sourceBook !== undefined) updates.source_book = body.sourceBook.trim();
    if (body.sectionTitle !== undefined) updates.section_title = body.sectionTitle.trim();
    if (body.category !== undefined) updates.category = body.category.trim();
    if (body.summary !== undefined) updates.summary = body.summary.trim();
    if (body.content !== undefined) {
      updates.content = body.content.trim();
      updates.word_count = body.content.trim().split(/\s+/).filter(Boolean).length;
    }
    if (body.frequencyScore !== undefined) {
      updates.frequency_score = Math.min(10, Math.max(1, Number(body.frequencyScore) || 5.0));
    }
    if (body.importanceScore !== undefined) {
      updates.importance_score = Math.min(10, Math.max(1, Number(body.importanceScore) || 5.0));
    }

    const { data: updated, error: updateErr } = await supabase
      .from('custom_chapters')
      .update(updates)
      .eq('id', chapterId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateErr || !updated) {
      throw updateErr || new Error('Capítulo não encontrado ou sem permissão para editar');
    }

    // Sync content if changed
    if (updated.content) {
      try {
        await supabase.from('chapter_contents').upsert(
          {
            chapter_id: chapterId,
            content: updated.content,
            word_count: updated.word_count,
            updated_at: nowIso,
          },
          { onConflict: 'chapter_id' }
        );
      } catch (e) {
        console.warn('Sync content error:', e);
      }
    }

    // Sync weights
    try {
      await supabase.from('chapter_weights').upsert(
        {
          chapter_id: chapterId,
          frequency_score: updated.frequency_score,
          importance_score: updated.importance_score,
          category: updated.category,
          updated_at: nowIso,
        },
        { onConflict: 'chapter_id' }
      );
    } catch (e) {
      console.warn('Sync weights error:', e);
    }

    return NextResponse.json({ success: true, chapter: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao atualizar capítulo' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const chapterId = parseInt(id, 10);
    if (isNaN(chapterId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    // Delete from custom_chapters
    const { error: delErr } = await supabase
      .from('custom_chapters')
      .delete()
      .eq('id', chapterId)
      .eq('user_id', user.id);

    if (delErr) {
      throw delErr;
    }

    // Clean up progress, review stats, read logs, and weights
    await Promise.allSettled([
      supabase.from('chapter_contents').delete().eq('chapter_id', chapterId),
      supabase.from('chapter_weights').delete().eq('chapter_id', chapterId),
      supabase.from('chapter_progress').delete().eq('chapter_id', chapterId).eq('user_id', user.id),
      supabase.from('chapter_review_stats').delete().eq('chapter_id', chapterId).eq('user_id', user.id),
      supabase.from('chapter_read_logs').delete().eq('chapter_id', chapterId).eq('user_id', user.id),
    ]);

    return NextResponse.json({ success: true, message: 'Capítulo excluído com sucesso' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao excluir capítulo' }, { status: 500 });
  }
}
