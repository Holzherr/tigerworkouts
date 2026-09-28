/**
 * What the timer handed the result sheet, kept on the device while the sheet is open. The row is
 * logged when the run ends; without this, a reload on /result lost its id, so Save added a second
 * row and Discard left the logged one behind.
 */
import type { SessionResult } from '@/features/runsheet/progression';

const KEY = 'tiger:pending';

export const loadPending = (): Partial<SessionResult> | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
};

export const savePending = (p: Partial<SessionResult> | null) => {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
