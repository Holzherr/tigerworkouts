import { daysAgo } from '@/features/coaching/rollup';
import { runsheetMinutes, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';

const wid = (r: Runsheet) => r.id ?? r.title;

/** The latest session of each workout id. */
export const lastDoneById = (results: SessionResult[]) => {
  const m = new Map<string, string>();
  for (const res of results) if ((m.get(res.runsheetId) ?? '') < res.startedAt) m.set(res.runsheetId, res.startedAt);
  return m;
};

/** The latest session of this workout or of the one it was copied from. */
export const lastDoneOf = (r: Runsheet, last: Map<string, string>) =>
  [last.get(wid(r)), r.copyOf ? last.get(r.copyOf) : undefined].filter((x): x is string => !!x).sort().pop();

/**
 * Mine on home: your own workouts and the ones you saved, as one list without repeats. Last done
 * or made, whichever is later, newest first, so a workout just made sits on top until you do it.
 * A workout you have your own copy of shows as the copy only. `skip` leaves out what is already
 * listed above it (what your coach sent). Ported to iOS as `Home.mine`.
 */
export const mineList = (workouts: Runsheet[], ownIds: string[], savedIds: string[], results: SessionResult[], skip: string[] = []) => {
  const listed = new Set([...ownIds, ...savedIds]);
  const skipped = new Set(skip);
  const last = lastDoneById(results);
  const copied = new Set(workouts.flatMap(r => (r.copyOf ? [r.copyOf] : [])));
  const seen = new Set<string>();
  const recent = (r: Runsheet) => [lastDoneOf(r, last) ?? '', r.createdAt ?? ''].sort().pop()!;
  return workouts
    .filter(r => {
      const id = wid(r);
      if (copied.has(id) || skipped.has(id) || seen.has(id) || !listed.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => recent(b).localeCompare(recent(a)));
};

/** "20 min · last done yesterday", "20 min · new" for your own not yet done, else "20 min". */
export const mineLine = (r: Runsheet, lastDone: string | undefined, isOwn: boolean, now = new Date()) => {
  const min = `${runsheetMinutes(r)} min`;
  if (lastDone) return `${min} · last done ${daysAgo(lastDone, now)}`;
  return isOwn ? `${min} · new` : min;
};
