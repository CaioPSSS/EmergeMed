import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateFSRSManualReadUpdate } from '@/lib/learning-engine';
import { recordActivityAndAwardXP } from '@/lib/gamification-engine';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { data: customChapters, error } = await supabase
      .from('custom_chapters')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ customChapters: customChapters || [] });
  } catch (error: any) {
    console.error('Error fetching custom chapters:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao carregar capítulos personalizados' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json() as {
      title: string;
      sourceBook?: string;
      sectionTitle?: string;
      category?: string;
      summary?: string;
      content: string;
      rawContent?: string;
      frequencyScore?: number;
      importanceScore?: number;
      markAsRead?: boolean;
    };

    const {
      title,
      sourceBook,
      sectionTitle,
      category,
      summary,
      content,
      rawContent,
      frequencyScore = 5.0,
      importanceScore = 5.0,
      markAsRead = false,
    } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'O título do capítulo é obrigatório.' }, { status: 400 });
    }

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'O conteúdo do capítulo é obrigatório.' }, { status: 400 });
    }

    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
    const nowIso = new Date().toISOString();

    // 1. Insert into custom_chapters table
    const { data: created, error: insertErr } = await supabase
      .from('custom_chapters')
      .insert({
        user_id: user.id,
        title: title.trim(),
        source_book: sourceBook?.trim() || 'Livro Personalizado',
        section_title: sectionTitle?.trim() || 'Capítulos Personalizados',
        category: category?.trim() || 'Geral',
        summary: summary?.trim() || null,
        content: content.trim(),
        raw_content: rawContent?.trim() || null,
        frequency_score: Math.min(10, Math.max(1, Number(frequencyScore) || 5.0)),
        importance_score: Math.min(10, Math.max(1, Number(importanceScore) || 5.0)),
        word_count: wordCount,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select()
      .single();

    if (insertErr || !created) {
      throw insertErr || new Error('Falha ao salvar capítulo personalizado');
    }

    const chapterId = created.id;

    // 2. Synchronize into chapter_contents table so AI engines can use it immediately
    try {
      await supabase.from('chapter_contents').upsert(
        {
          chapter_id: chapterId,
          content: created.content,
          word_count: wordCount,
          updated_at: nowIso,
        },
        { onConflict: 'chapter_id' }
      );
    } catch (e) {
      console.warn('Sync to chapter_contents note:', e);
    }

    // 3. Synchronize into chapter_weights table
    try {
      await supabase.from('chapter_weights').upsert(
        {
          chapter_id: chapterId,
          frequency_score: created.frequency_score,
          importance_score: created.importance_score,
          category: created.category,
          updated_at: nowIso,
        },
        { onConflict: 'chapter_id' }
      );
    } catch (e) {
      console.warn('Sync to chapter_weights note:', e);
    }

    // 4. Optionally mark as read immediately
    if (markAsRead) {
      try {
        await supabase.from('chapter_progress').upsert(
          {
            user_id: user.id,
            chapter_id: chapterId,
            is_read: true,
            read_at: nowIso,
            read_count: 1,
            last_read_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: 'user_id,chapter_id' }
        );

        await supabase.from('chapter_read_logs').insert({
          user_id: user.id,
          chapter_id: chapterId,
          read_count_snapshot: 1,
          source: 'custom_chapter_creation',
          created_at: nowIso,
        });

        const fsrsUpdate = calculateFSRSManualReadUpdate(null);
        await supabase.from('chapter_review_stats').upsert(
          {
            user_id: user.id,
            chapter_id: chapterId,
            ...fsrsUpdate,
          },
          { onConflict: 'user_id,chapter_id' }
        );
      } catch (e) {
        console.warn('Mark read progress error:', e);
      }
    }

    // 5. Award Gamification XP
    try {
      await recordActivityAndAwardXP(supabase, user.id, { type: 'first_read' });
    } catch (e) {
      console.warn('Gamification error:', e);
    }

    return NextResponse.json({
      success: true,
      chapter: created,
    });
  } catch (error: any) {
    console.error('Error creating custom chapter:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao criar capítulo personalizado' },
      { status: 500 }
    );
  }
}
