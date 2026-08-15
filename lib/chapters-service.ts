import { SupabaseClient } from '@supabase/supabase-js';
import { CHAPTERS_DATA, SECTIONS, Chapter, Section } from './chapters-data';
import { DEFAULT_CHAPTER_WEIGHTS, ChapterWeight } from './chapter-weights-data';

export interface CustomChapterRow {
  id: number;
  user_id: string;
  title: string;
  source_book: string;
  section_title: string;
  category: string;
  summary: string | null;
  content: string;
  raw_content?: string | null;
  frequency_score: number;
  importance_score: number;
  word_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Transforms a custom_chapters database row into a standardized Chapter object.
 */
export function formatCustomChapterToChapter(row: CustomChapterRow, index: number = 0): Chapter {
  return {
    id: row.id,
    number: row.id,
    title: row.title,
    sectionNumber: 99, // Custom section group
    sectionTitle: row.section_title || 'Capítulos Personalizados',
    sourceBook: row.source_book || 'Livro Personalizado',
    category: row.category || 'Geral',
    isCustom: true,
    summary: row.summary || undefined,
    frequencyScore: Number(row.frequency_score) || 5.0,
    importanceScore: Number(row.importance_score) || 5.0,
    wordCount: row.word_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetches all custom chapters created by the authenticated user.
 */
export async function fetchUserCustomChapters(
  supabase: SupabaseClient,
  userId?: string
): Promise<Chapter[]> {
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    userId = user.id;
  }

  try {
    const { data, error } = await supabase
      .from('custom_chapters')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return (data as CustomChapterRow[]).map((row, idx) => formatCustomChapterToChapter(row, idx));
  } catch (err) {
    console.warn('Error fetching custom chapters:', err);
    return [];
  }
}

/**
 * Returns all chapters (122 official + user custom chapters).
 */
export async function getUnifiedChapters(
  supabase: SupabaseClient,
  userId?: string
): Promise<Chapter[]> {
  const customChapters = await fetchUserCustomChapters(supabase, userId);
  return [...CHAPTERS_DATA, ...customChapters];
}

/**
 * Returns all sections, adding custom chapters under their respective sections or grouped under custom book sections.
 */
export async function getUnifiedSections(
  supabase: SupabaseClient,
  userId?: string
): Promise<Section[]> {
  const customChapters = await fetchUserCustomChapters(supabase, userId);
  if (customChapters.length === 0) {
    return SECTIONS;
  }

  // Group custom chapters by source book or section
  const customByBook: Record<string, Chapter[]> = {};
  customChapters.forEach((cap) => {
    const bookKey = cap.sourceBook || 'Livros e Capítulos Personalizados';
    if (!customByBook[bookKey]) customByBook[bookKey] = [];
    customByBook[bookKey].push(cap);
  });

  const customSections: Section[] = Object.entries(customByBook).map(([bookTitle, caps], idx) => ({
    number: 100 + idx + 1,
    title: `📚 ${bookTitle}`,
    chapters: caps,
    isCustom: true,
  }));

  return [...SECTIONS, ...customSections];
}

/**
 * Resolves a single chapter info by ID (checks CHAPTERS_DATA first, then custom_chapters).
 */
export async function getChapterMetadata(
  supabase: SupabaseClient,
  chapterId: number,
  userId?: string
): Promise<Chapter | null> {
  const official = CHAPTERS_DATA.find((c) => c.id === chapterId);
  if (official) return official;

  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    userId = user.id;
  }

  const { data } = await supabase
    .from('custom_chapters')
    .select('*')
    .eq('id', chapterId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return null;
  return formatCustomChapterToChapter(data as CustomChapterRow);
}

/**
 * Resolves chapter content text from chapter_contents table.
 */
export async function getChapterContent(
  supabase: SupabaseClient,
  chapterId: number
): Promise<string | null> {
  const { data } = await supabase
    .from('chapter_contents')
    .select('content')
    .eq('chapter_id', chapterId)
    .maybeSingle();

  return data?.content || null;
}

/**
 * Returns merged chapter weights for both official and custom chapters.
 */
export async function getUnifiedChapterWeights(
  supabase: SupabaseClient,
  userId?: string
): Promise<Record<number, ChapterWeight>> {
  const customChapters = await fetchUserCustomChapters(supabase, userId);
  const weights: Record<number, ChapterWeight> = {};

  DEFAULT_CHAPTER_WEIGHTS.forEach((w) => {
    weights[w.chapterId] = w;
  });

  customChapters.forEach((cap) => {
    weights[cap.id] = {
      chapterId: cap.id,
      frequencyScore: cap.frequencyScore || 5.0,
      importanceScore: cap.importanceScore || 5.0,
      category: cap.category || 'Geral',
    };
  });

  return weights;
}
