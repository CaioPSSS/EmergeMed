import { SupabaseClient } from '@supabase/supabase-js';

export interface StudyQueueItem {
  id?: string;
  user_id?: string;
  chapter_id: number;
  position: number;
  completed: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

const LOCAL_STORAGE_PREFIX = 'emergemed_study_queue_v2_';
const LEGACY_STORAGE_PREFIX = 'emergemed_study_queue_';

function getStorageKey(userId?: string): string {
  return `${LOCAL_STORAGE_PREFIX}${userId || 'guest'}`;
}

export function getLocalStudyQueue(userId?: string): StudyQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx) => {
          if (typeof item === 'number') {
            return { chapter_id: item, position: idx, completed: false };
          }
          return {
            chapter_id: Number(item.chapter_id),
            position: typeof item.position === 'number' ? item.position : idx,
            completed: Boolean(item.completed),
            notes: item.notes || null,
          };
        }).filter((item) => !isNaN(item.chapter_id));
      }
    }

    // Check legacy storage
    const legacyRaw = localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${userId || 'guest'}`);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw);
      if (Array.isArray(legacyParsed)) {
        const items: StudyQueueItem[] = legacyParsed.map((id, idx) => ({
          chapter_id: Number(id),
          position: idx,
          completed: false,
        })).filter((item) => !isNaN(item.chapter_id));
        saveLocalStudyQueue(items, userId);
        return items;
      }
    }

    return [];
  } catch {
    return [];
  }
}

export function saveLocalStudyQueue(items: StudyQueueItem[], userId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(items));
  } catch (err) {
    console.warn('Failed to save study queue to localStorage:', err);
  }
}

/**
 * Fetches user study queue ordered by position ASC.
 */
export async function fetchStudyQueue(
  supabase: SupabaseClient,
  userId?: string
): Promise<StudyQueueItem[]> {
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return getLocalStudyQueue();
    userId = user.id;
  }

  const localItems = getLocalStudyQueue(userId);

  try {
    const { data, error } = await supabase
      .from('study_queue')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true });

    if (error) {
      return localItems;
    }

    if (data && data.length > 0) {
      const dbItems: StudyQueueItem[] = data.map((d: any, idx: number) => ({
        id: d.id,
        user_id: d.user_id,
        chapter_id: Number(d.chapter_id),
        position: typeof d.position === 'number' ? d.position : idx,
        completed: Boolean(d.completed),
        notes: d.notes || null,
        created_at: d.created_at,
        updated_at: d.updated_at,
      }));
      saveLocalStudyQueue(dbItems, userId);
      return dbItems;
    }

    // If DB is empty but we had local items, sync local items to DB
    if (localItems.length > 0) {
      await syncQueueToDatabase(supabase, userId, localItems);
      return localItems;
    }

    return [];
  } catch (err) {
    console.warn('Error fetching study queue from Supabase, using localStorage:', err);
    return localItems;
  }
}

/**
 * Synchronizes an array of StudyQueueItem to Supabase public.study_queue.
 */
async function syncQueueToDatabase(
  supabase: SupabaseClient,
  userId: string,
  items: StudyQueueItem[]
): Promise<void> {
  try {
    await supabase.from('study_queue').delete().eq('user_id', userId);

    if (items.length === 0) return;

    const rows = items.map((item, idx) => ({
      user_id: userId,
      chapter_id: item.chapter_id,
      position: idx,
      completed: Boolean(item.completed),
      notes: item.notes || null,
    }));

    await supabase.from('study_queue').insert(rows);
  } catch (err) {
    console.warn('Failed to sync study queue to database:', err);
  }
}

/**
 * Adds a single chapter to the study queue. Always starts with completed: false.
 */
export async function addToStudyQueue(
  supabase: SupabaseClient,
  userId: string,
  chapterId: number
): Promise<StudyQueueItem[]> {
  const current = await fetchStudyQueue(supabase, userId);
  if (current.some((item) => item.chapter_id === chapterId)) {
    return current;
  }

  const newItem: StudyQueueItem = {
    chapter_id: chapterId,
    position: current.length,
    completed: false,
  };

  const updated = [...current, newItem];
  saveLocalStudyQueue(updated, userId);

  try {
    await supabase.from('study_queue').insert({
      user_id: userId,
      chapter_id: chapterId,
      position: current.length,
      completed: false,
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
): Promise<StudyQueueItem[]> {
  const current = await fetchStudyQueue(supabase, userId);
  const existingIds = new Set(current.map((item) => item.chapter_id));
  const toAdd = chapterIds.filter((id) => !existingIds.has(id));
  if (toAdd.length === 0) return current;

  const newItems: StudyQueueItem[] = toAdd.map((id, index) => ({
    chapter_id: id,
    position: current.length + index,
    completed: false,
  }));

  const updated = [...current, ...newItems];
  saveLocalStudyQueue(updated, userId);

  try {
    const rows = newItems.map((item) => ({
      user_id: userId,
      chapter_id: item.chapter_id,
      position: item.position,
      completed: false,
    }));
    await supabase.from('study_queue').insert(rows);
  } catch (err) {
    console.warn('Failed to insert multiple chapters to study_queue:', err);
  }

  return updated;
}

/**
 * Updates completed status for a chapter within the current queue.
 */
export async function setQueueItemCompleted(
  supabase: SupabaseClient,
  userId: string,
  chapterId: number,
  completed: boolean
): Promise<StudyQueueItem[]> {
  const current = await fetchStudyQueue(supabase, userId);
  const updated = current.map((item) =>
    item.chapter_id === chapterId ? { ...item, completed } : item
  );
  saveLocalStudyQueue(updated, userId);

  try {
    await supabase
      .from('study_queue')
      .update({ completed })
      .eq('user_id', userId)
      .eq('chapter_id', chapterId);
  } catch (err) {
    console.warn('Failed to update completed status on study_queue:', err);
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
): Promise<StudyQueueItem[]> {
  const current = await fetchStudyQueue(supabase, userId);
  const updated = current
    .filter((item) => item.chapter_id !== chapterId)
    .map((item, idx) => ({ ...item, position: idx }));

  saveLocalStudyQueue(updated, userId);

  try {
    await supabase
      .from('study_queue')
      .delete()
      .eq('user_id', userId)
      .eq('chapter_id', chapterId);

    await syncQueueToDatabase(supabase, userId, updated);
  } catch (err) {
    console.warn('Failed to delete chapter from study_queue:', err);
  }

  return updated;
}

/**
 * Reorders the entire study queue according to the provided StudyQueueItem array.
 */
export async function reorderStudyQueue(
  supabase: SupabaseClient,
  userId: string,
  reorderedItems: StudyQueueItem[]
): Promise<StudyQueueItem[]> {
  const indexed = reorderedItems.map((item, idx) => ({ ...item, position: idx }));
  saveLocalStudyQueue(indexed, userId);
  await syncQueueToDatabase(supabase, userId, indexed);
  return indexed;
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
