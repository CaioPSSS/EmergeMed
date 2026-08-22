'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
  testId: string;
  supabase: SupabaseClient;
  userAnswers: Record<number, any>;
  currentIndex: number;
  enabled?: boolean;
  debounceMs?: number;
}

export function useAutoSave({
  testId,
  supabase,
  userAnswers,
  currentIndex,
  enabled = true,
  debounceMs = 3000,
}: UseAutoSaveOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // References to keep track of latest values and prevent stale closures in timers
  const userAnswersRef = useRef(userAnswers);
  const currentIndexRef = useRef(currentIndex);
  const enabledRef = useRef(enabled);
  const testIdRef = useRef(testId);
  const lastSavedPayloadRef = useRef<string>('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hideSavedBadgeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Update refs on each render
  useEffect(() => {
    userAnswersRef.current = userAnswers;
    currentIndexRef.current = currentIndex;
    enabledRef.current = enabled;
    testIdRef.current = testId;
  }, [userAnswers, currentIndex, enabled, testId]);

  const storageKey = `test-draft-${testId}`;

  // Helper to save to localStorage as an instant local mirror
  const saveToLocalMirror = useCallback((answers: Record<number, any>, index: number) => {
    if (typeof window === 'undefined' || !testId) return;
    try {
      if (Object.keys(answers).length > 0) {
        localStorage.setItem(
          `test-draft-${testId}`,
          JSON.stringify({
            answers,
            currentIndex: index,
            savedAt: new Date().toISOString(),
          })
        );
      }
    } catch (e) {
      console.warn('[useAutoSave] Failed to save draft to localStorage:', e);
    }
  }, [testId]);

  // Execute database save to Supabase
  const executeSupabaseSave = useCallback(
    async (answersToSave: Record<number, any>, indexToSave: number): Promise<boolean> => {
      if (!enabledRef.current || !testIdRef.current) return false;

      // Don't save empty drafts to DB if nothing has been answered yet
      if (Object.keys(answersToSave).length === 0) return true;

      const payloadString = JSON.stringify({ answers: answersToSave, draft_index: indexToSave });
      // If nothing changed since last DB save, skip network trip
      if (payloadString === lastSavedPayloadRef.current) {
        return true;
      }

      setSaveStatus('saving');

      try {
        const { error } = await supabase
          .from('tests')
          .update({
            answers: answersToSave,
            draft_index: indexToSave,
          })
          .eq('id', testIdRef.current);

        if (error) {
          console.error('[useAutoSave] Supabase update failed:', error);
          setSaveStatus('error');
          return false;
        }

        lastSavedPayloadRef.current = payloadString;
        const now = new Date();
        setLastSavedAt(now);
        setSaveStatus('saved');

        // Automatically revert 'saved' badge back to 'idle' after 3.5 seconds
        if (hideSavedBadgeTimerRef.current) {
          clearTimeout(hideSavedBadgeTimerRef.current);
        }
        hideSavedBadgeTimerRef.current = setTimeout(() => {
          setSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, 3500);

        return true;
      } catch (err) {
        console.error('[useAutoSave] Unexpected error during auto-save:', err);
        setSaveStatus('error');
        return false;
      }
    },
    [supabase]
  );

  // Immediate force save (for step changes, beforeunload, or before adverse evolution checks)
  const forceSave = useCallback(
    async (
      answersOverride?: Record<number, any>,
      indexOverride?: number
    ): Promise<boolean> => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      const answers = answersOverride ?? userAnswersRef.current;
      const index = indexOverride ?? currentIndexRef.current;

      saveToLocalMirror(answers, index);
      return await executeSupabaseSave(answers, index);
    },
    [executeSupabaseSave, saveToLocalMirror]
  );

  // Clear local draft when test is submitted/completed
  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined' || !testId) return;
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.warn('[useAutoSave] Failed to remove draft from localStorage:', e);
    }
  }, [testId, storageKey]);

  // Read local backup (fallback if network failed during load)
  const getLocalBackup = useCallback(() => {
    if (typeof window === 'undefined' || !testId) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.answers === 'object') {
        return parsed as {
          answers: Record<number, any>;
          currentIndex: number;
          savedAt: string;
        };
      }
    } catch (e) {
      console.warn('[useAutoSave] Failed to read draft from localStorage:', e);
    }
    return null;
  }, [testId, storageKey]);

  // Debounced auto-save effect whenever userAnswers or currentIndex changes
  useEffect(() => {
    if (!enabled) return;

    const answers = userAnswers;
    const index = currentIndex;

    // Immediately mirror to localStorage
    saveToLocalMirror(answers, index);

    if (Object.keys(answers).length === 0) return;

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Schedule new Supabase save
    debounceTimerRef.current = setTimeout(() => {
      executeSupabaseSave(answers, index);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [userAnswers, currentIndex, enabled, debounceMs, executeSupabaseSave, saveToLocalMirror]);

  // Cleanup hideSavedBadgeTimer on unmount
  useEffect(() => {
    return () => {
      if (hideSavedBadgeTimerRef.current) {
        clearTimeout(hideSavedBadgeTimerRef.current);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Warn user before closing tab if currently saving
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = 'Suas respostas estão sendo salvas. Tem certeza que deseja sair?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  return {
    saveStatus,
    lastSavedAt,
    forceSave,
    clearDraft,
    getLocalBackup,
  };
}
