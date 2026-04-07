import { useEffect, useRef, useState } from 'react';

interface UseAutoSaveProps<T> {
  data: T;
  onSave: (data: T) => void | Promise<void>;
  isDirty: boolean;
  condition?: boolean;
  delay?: number;
}

export type AutoSaveState = 'idle' | 'saving' | 'saved';

export function useAutoSave<T>({
  data,
  onSave,
  isDirty,
  condition = true,
  delay = 1500,
}: UseAutoSaveProps<T>) {
  const [saveState, setSaveState] = useState<AutoSaveState>('idle');
  const saveActionRef = useRef(onSave);
  const resetSavedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    saveActionRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!condition || !isDirty) return;

    const handler = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        await saveActionRef.current(data);
        setSaveState('saved');
      } catch (error) {
        console.error('Auto-Save fehlgeschlagen:', error);
        setSaveState('idle');
      }
    }, delay);

    return () => window.clearTimeout(handler);
  }, [data, isDirty, condition, delay]);

  useEffect(() => {
    if (saveState !== 'saved') return;
    if (resetSavedTimerRef.current) {
      window.clearTimeout(resetSavedTimerRef.current);
    }
    resetSavedTimerRef.current = window.setTimeout(() => {
      setSaveState('idle');
      resetSavedTimerRef.current = null;
    }, 3000);
    return () => {
      if (resetSavedTimerRef.current) {
        window.clearTimeout(resetSavedTimerRef.current);
        resetSavedTimerRef.current = null;
      }
    };
  }, [saveState]);

  return { saveState };
}
