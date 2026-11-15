/**
 * What the catalogue lists and in which order. Pure: the screen draws what this returns.
 */
import type { Runsheet } from '@/features/runsheet/model';

export type DiscoverFilter = 'all' | 'coach' | 'benchmark' | 'program' | 'video' | 'article' | 'protocol';

const wid = (r: Runsheet) => r.id ?? r.title;

/** One workout per id, the first kept: the app's lists come from several places (yours, a coach,
 * public ones, the catalogue), and an id met twice is the same workout. */
export const uniqueById = (list: Runsheet[]): Runsheet[] => {
  const seen = new Set<string>();
  return list.filter(r => !seen.has(wid(r)) && !!seen.add(wid(r)));
};

const titleOf = (r: Runsheet) => r.title.trim().toLowerCase();
const exercisesOf = (r: Runsheet) =>
  r.items
    .flatMap(i => (i.kind === 'block' ? i.steps : i.kind === 'ref' ? [] : [i]))
    .flatMap(s => (s.kind === 'exercise' ? [s.exercise.key] : []))
    .join(',');

/** One row per workout: no id twice, and no second workout that reads as one already listed, which
 * is the same title with the same exercises (someone's public copy) or by the same creator (their
 * second copy). The first is kept. */
export const uniqueListings = (list: Runsheet[]): Runsheet[] => {
  const seen = new Set<string>();
  return uniqueById(list).filter(r => {
    const keys = [`${titleOf(r)}|x|${exercisesOf(r)}`, `${titleOf(r)}|by|${(r.source?.author ?? r.creator ?? '').trim().toLowerCase()}`];
    if (keys.some(k => seen.has(k))) return false;
    for (const k of keys) seen.add(k);
    return true;
  });
};

const isNhs = (r: Runsheet) => /^nhs\b/i.test(r.source?.author ?? r.creator ?? '');

/** Whether a workout belongs under a kind chip. A workout of your own or a creator's (no source
 * kind) is under none of them; the NHS chip is what the NHS wrote, its Couch to 5K included, and a
 * guide by anyone else is a protocol. */
export const matchesFilter = (r: Runsheet, filter: DiscoverFilter): boolean => {
  const kind = r.source?.kind ?? 'user';
  switch (filter) {
    case 'all':
      return true;
    case 'article':
      return isNhs(r);
    case 'protocol':
      return kind === 'protocol' || (kind === 'article' && !isNhs(r));
    case 'video':
      return kind === 'video';
    default:
      return kind === filter;
  }
};

/**
 * How well a workout answers a search, 0 for not at all. The title counts most: the search itself,
 * then a title that starts with it, a word in the title that starts with it, the title containing
 * it; after those the creator, program and tags, and last the description (a mention). So "cindy"
 * lists Cindy above Chelsea, whose description names it.
 */
export const searchScore = (r: Runsheet, query: string): number => {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const title = r.title.toLowerCase();
  if (title === q) return 6;
  if (title.startsWith(q)) return 5;
  if (title.split(/[^\p{L}\p{N}]+/u).some(w => w.startsWith(q))) return 4;
  if (title.includes(q)) return 3;
  const who = `${r.creator ?? ''} ${r.source?.author ?? ''} ${r.source?.handle ? `@${r.source.handle}` : ''} ${r.program?.name ?? ''} ${(r.tags ?? []).join(' ')}`.toLowerCase();
  if (who.includes(q)) return 2;
  return (r.description ?? '').toLowerCase().includes(q) ? 1 : 0;
};

/** The catalogue as listed: programs folded to a row each while browsing, one row per workout
 * otherwise. A search lists every match as a row, best match first, ties in catalogue order. */
export const catalogueList = (workouts: Runsheet[], query: string, filter: DiscoverFilter): { programs: Map<string, Runsheet[]>; singles: Runsheet[] } => {
  const q = query.trim();
  const programs = new Map<string, Runsheet[]>();
  // A copy is a version of something in the catalogue, not new content: the catalogue lists the original.
  const listed = uniqueListings(workouts.filter(r => !r.copyOf));
  if (q) {
    const scored = listed.map((r, i) => ({ r, i, s: searchScore(r, q) })).filter(x => x.s > 0);
    return { programs, singles: scored.sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.r) };
  }
  const singles: Runsheet[] = [];
  for (const r of listed) {
    if (!matchesFilter(r, filter)) continue;
    if (r.program) (programs.get(r.program.name) ?? programs.set(r.program.name, []).get(r.program.name)!).push(r);
    else singles.push(r);
  }
  for (const list of programs.values()) list.sort((a, b) => (a.program?.order ?? 0) - (b.program?.order ?? 0));
  return { programs, singles };
};
