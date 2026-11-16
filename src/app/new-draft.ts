/**
 * A new workout being written, kept on the device as it is typed so a reload or a closed tab does
 * not lose it (review D9: iOS autosaves a new workout from its first change). Cleared when it is
 * saved, started or discarded.
 */
import type { Runsheet } from '@/features/runsheet/model';

/** A new key; nothing older is renamed. */
const KEY = 'tiger:new-workout-draft';

/** Something worth keeping: a name, or an exercise. A block left empty is not (`Edit.storable` on iOS). */
export const worthKeeping = (r: Runsheet): boolean =>
  !!r.title.trim() || r.items.some(it => it.kind === 'exercise' || (it.kind === 'block' && it.steps.some(s => s.kind === 'exercise')));

export const loadNewDraft = (): Runsheet | null => {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    return r && typeof r === 'object' && Array.isArray(r.items) && typeof r.title === 'string' ? r : null;
  } catch {
    return null;
  }
};

export const saveNewDraft = (r: Runsheet | null) => {
  try {
    if (r && worthKeeping(r)) localStorage.setItem(KEY, JSON.stringify(r));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage full or blocked: the draft lives in memory only */
  }
};
