import { SupabaseClient } from '@supabase/supabase-js';

export interface StudyQueueItem {
  id?: string;
  user_id?: string;
  chapter_id: number;
  position: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

const LOCAL_STORAGE_PREFIX = 'emergemed_study_queue_';

function getStorageKey(userId?: string): string {
  return `${LOCAL_STORAGE_PREFIX}${userId || 'guest'}`;
}

export function getLocalStudyQueue(userId?: string): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => !isNaN(n)) : [];
  } catch {
    return [];
  }
}

export function saveLocalStudyQueue(chapterIds: number[], userId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(chapterIds));
  } catch (err) {
    console.warn('Failed to save study queue to localStorage:', err);
  }
}

/**
 * Fetches user study queue ordered by position ASC.
 * Integrates database persistence with transparent localStorage caching/fallback.
 */
export async function fetchStudyQueue(
  supabase: SupabaseClient,
  userId?: string
): Promise<number[]> {
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return getLocalStudyQueue();
    userId = user.id;
  }

  const localIds = getLocalStudyQueue(userId);

  try {
    const { data, error } = await supabase
      .from('study_queue')
      .select('chapter_id, position')
      .eq('user_id', userId)
      .order('position', { ascending: true });

    if (error) {
      // Table may not exist yet or connection issue -> use localStorage fallback
      return localIds;
    }

    if (data && data.length > 0) {
      const dbIds = data.map((d: any) => Number(d.chapter_id));
      saveLocalStudyQueue(dbIds, userId);
      return dbIds;
    }

    // If DB is empty but we had local items, sync local items to DB
    if (localIds.length > 0) {
      await syncQueueToDatabase(supabase, userId, localIds);
      return localIds;
    }

    return [];
  } catch (err) {
    console.warn('Error fetching study queue from Supabase, using localStorage:', err);
    return localIds;
  }
}

/**
 * Synchronizes an array of chapterIds to Supabase public.study_queue with updated positions.
 */
async function syncQueueToDatabase(
  supabase: SupabaseClient,
  userId: string,
  chapterIds: number[]
): Promise<void> {
  try {
    // Delete existing entries for user
    await supabase.from('study_queue').delete().eq('user_id', userId);

    if (chapterIds.length === 0) return;

    const rows = chapterIds.map((chapterId, idx) => ({
      user_id: userId,
      chapter_id: chapterId,
      position: idx,
    }));

    await supabase.from('study_queue').insert(rows);
  } catch (err) {
    console.warn('Failed to sync study queue to database:', err);
  }
}

/**
 * Adds a single chapter to the end of the user's study queue.
 */
export async function addToStudyQueue(
  supabase: SupabaseClient,
  userId: string,
  chapterId: number
): Promise<number[]> {
  const current = await fetchStudyQueue(supabase, userId);
  if (current.includes(chapterId)) {
    return current; // already in queue
  }

  const updated = [...current, chapterId];
  saveLocalStudyQueue(updated, userId);

  try {
    await supabase.from('study_queue').insert({
      user_id: userId,
      chapter_id: chapterId,
      position: current.length,
    });
  } catch (err) {
    console.warn('Failed to insert chapter to study_queue table:', err);
  }

  return updated;
}

/**
 * Adds multiple chapters to the study queue.
 */
export async function addMultipleToStudyQueue(
  supabase: SupabaseClient,
  userId: string,
  chapterIds: number[]
): Promise<number[]> {
  const current = await fetchStudyQueue(supabase, userId);
  const toAdd = chapterIds.filter((id) => !current.includes(id));
  if (toAdd.length === 0) return current;

  const updated = [...current, ...toAdd];
  saveLocalStudyQueue(updated, userId);

  try {
    const rows = toAdd.map((id, index) => ({
      user_id: userId,
      chapter_id: id,
      position: current.length + index,
    }));
    await supabase.from('study_queue').insert(rows);
  } catch (err) {
    console.warn('Failed to insert multiple chapters to study_queue:', err);
  }

  return updated;
}

/**
 * Removes a chapter from the study queue.
 */
export async function removeFromStudyQueue(
  supabase: SupabaseClient,
  userId: string,
  chapterId: number
): Promise<number[]> {
  const current = await fetchStudyQueue(supabase, userId);
  const updated = current.filter((id) => id !== chapterId);
  saveLocalStudyQueue(updated, userId);

  try {
    await supabase
      .from('study_queue')
      .delete()
      .eq('user_id', userId)
      .eq('chapter_id', chapterId);

    // Re-index remaining positions
    await syncQueueToDatabase(supabase, userId, updated);
  } catch (err) {
    console.warn('Failed to delete chapter from study_queue:', err);
  }

  return updated;
}

/**
 * Reorders the entire study queue according to the provided chapter IDs order.
 */
export async function reorderStudyQueue(
  supabase: SupabaseClient,
  userId: string,
  reorderedChapterIds: number[]
): Promise<number[]> {
  saveLocalStudyQueue(reorderedChapterIds, userId);
  await syncQueueToDatabase(supabase, userId, reorderedChapterIds);
  return reorderedChapterIds;
}

/**
 * Clears the entire user study queue.
 */
export async function clearStudyQueue(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  saveLocalStudyQueue([], userId);
  try {
    await supabase.from('study_queue').delete().eq('user_id', userId);
  } catch (err) {
    console.warn('Failed to clear study_queue:', err);
  }
}
