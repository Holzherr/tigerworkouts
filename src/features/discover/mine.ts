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
 * Mine on home: your own workouts and the ones you saved, as one list without repeats. Your own
 * not yet done come first, newest first (Nick, 18 Oct 2026: a workout just made for you is what to
 * do next); then the rest by last done or made, whichever is later, newest first. A workout you
 * have your own copy of shows as the copy only. `skip` leaves out what is already listed above it
 * (what your coach sent). Ported to iOS as `Home.mine`.
 */
export const mineList = (workouts: Runsheet[], ownIds: string[], savedIds: string[], results: SessionResult[], skip: string[] = []) => {
  const own = new Set(ownIds);
  const listed = new Set([...ownIds, ...savedIds]);
  const skipped = new Set(skip);
  const last = lastDoneById(results);
  const copied = new Set(workouts.flatMap(r => (r.copyOf ? [r.copyOf] : [])));
  const seen = new Set<string>();
  const fresh = (r: Runsheet) => own.has(wid(r)) && !lastDoneOf(r, last);
  const recent = (r: Runsheet) => [lastDoneOf(r, last) ?? '', r.createdAt ?? ''].sort().pop()!;
  return workouts
    .filter(r => {
      const id = wid(r);
      if (copied.has(id) || skipped.has(id) || seen.has(id) || !listed.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => Number(fresh(b)) - Number(fresh(a)) || recent(b).localeCompare(recent(a)));
};

/** "20 min · Medium · last done yesterday"; "20 min" when never done, where the badge says new. */
export const mineLine = (r: Runsheet, lastDone: string | undefined, now = new Date()) =>
  [`${runsheetMinutes(r)} min`, r.level, lastDone ? `last done ${daysAgo(lastDone, now)}` : undefined].filter(Boolean).join(' · ');

/** What is in it, by block name: "Swings · Incline press · Sprints · Abs". A loose exercise counts
 * by its name; warm-up, cool-down, rests and included workouts are left out. */
export const contentsLine = (r: Runsheet) => {
  const names: string[] = [];
  for (const it of r.items) {
    if (it.kind === 'rest' || it.kind === 'ref' || (it.role ?? 'main') !== 'main') continue;
    const name = it.kind === 'block' ? it.name.trim() : it.exercise.name;
    if (name && names[names.length - 1] !== name) names.push(name);
  }
  return names.join(' · ');
};

/** The description's first sentence: why this workout, in one line. */
export const whyLine = (r: Runsheet): string | undefined => r.description?.trim().split(/(?<=[.!?])\s/)[0]?.trim() || undefined;

/** Made by a coach (an AI coach signs "AI Coach"), not by you. */
export const madeForYou = (r: Runsheet) => /\bcoach\b/i.test(r.creator ?? r.source?.author ?? '');

/** The badge on a workout of yours not done yet. */
export const newBadge = (r: Runsheet) => (madeForYou(r) ? 'New · made for you' : 'New');

/**
 * The one card Mine accents as Up next: the first of your own not yet done, else the one done
 * longest ago, which keeps the rotation even. Undefined when nothing qualifies.
 */
export const upNextOf = (list: Runsheet[], ownIds: string[], last: Map<string, string>) => {
  const own = new Set(ownIds);
  const fresh = list.find(r => own.has(wid(r)) && !lastDoneOf(r, last));
  if (fresh) return wid(fresh);
  let oldest: { id: string; at: string } | undefined;
  for (const r of list) {
    const at = lastDoneOf(r, last);
    if (at && (!oldest || at < oldest.at)) oldest = { id: wid(r), at };
  }
  return oldest?.id;
};

/** The Up next card first, the rest in their order (Nick, 27 Oct 2026). Ported to iOS as `Home.upNextFirst`. */
export const upNextFirst = <T>(list: T[], isNext: (t: T) => boolean) => {
  const i = list.findIndex(isNext);
  return i < 0 ? list : [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
};
