/**
 * The two things the targets remember on this device: how hard to push (Settings → Suggestions)
 * and which stalls were dismissed. New keys; nothing else reads them. Wrapped so a browser that
 * blocks storage still gets maintain and every stall.
 */
import type { Intent } from '@/features/runsheet/targets';

const INTENT = 'tiger:intent';
const DISMISSED = 'tiger:stalls-dismissed';

export const getIntent = (): Intent => {
  try {
    const v = localStorage.getItem(INTENT);
    return v === 'restore' || v === 'overreach' ? v : 'maintain';
  } catch {
    return 'maintain';
  }
};

export const setIntent = (v: Intent) => {
  try {
    localStorage.setItem(INTENT, v);
  } catch {
    /* ignore */
  }
};

export const getDismissed = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export const dismissStall = (id: string): string[] => {
  const next = [...new Set([...getDismissed(), id])];
  try {
    localStorage.setItem(DISMISSED, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
};
