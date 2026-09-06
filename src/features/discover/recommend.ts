/**
 * Recommendations from what the user has already done. Pure: takes the catalogue, results and
 * saved ids, returns ranked picks with a one-line reason. Cold start falls back to a curated mix.
 */
import type { ExerciseStep, Runsheet } from '@/features/runsheet/model';
import { runsheetMinutes } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';

export interface Recommendation {
  runsheet: Runsheet;
  reason: string;
  score: number;
}

const id = (r: Runsheet) => r.id ?? r.title;
const exerciseKeys = (r: Runsheet) => new Set(r.items.flatMap(i => (i.kind === 'block' ? i.steps : i.kind === 'ref' ? [] : [i])).filter((s): s is ExerciseStep => s.kind === 'exercise').map(s => s.exercise.key));
const author = (r: Runsheet) => r.source?.author ?? r.creator ?? '';

export const recommend = (all: Runsheet[], results: SessionResult[], saved: string[] = [], limit = 20): Recommendation[] => {
  const byId = new Map(all.map(r => [id(r), r]));
  const done = results.map(x => byId.get(x.runsheetId)).filter((r): r is Runsheet => !!r);
  const doneIds = new Set(results.map(x => x.runsheetId));
  const recent = new Set(results.slice(0, 5).map(x => x.runsheetId));

  if (done.length === 0) {
    const pick = (pred: (r: Runsheet) => boolean, reason: string) => {
      const r = all.find(pred);
      return r ? [{ runsheet: r, reason, score: 1 }] : [];
    };
    return [
      ...pick(r => (r.source?.kind ?? 'user') === 'user', 'Made for you'),
      ...pick(r => r.title === 'Cindy', 'A classic 20-minute AMRAP to set a baseline'),
      ...pick(r => r.program?.name === 'Couch to 5K' && r.program.order === 1, 'Start running, three short sessions a week'),
      ...pick(r => r.source?.kind === 'video' && runsheetMinutes(r) <= 15, 'A short follow-along to try the player'),
      ...pick(r => !!r.program?.name?.startsWith('StrongLifts') && r.program.order === 1, 'The simplest strength program: three lifts, add weight every session'),
      ...pick(r => r.title.includes('7-Minute'), 'Seven minutes, no equipment'),
    ].slice(0, limit);
  }

  // signals from history
  const authors = new Map<string, number>();
  const kinds = new Map<string, number>();
  const keys = new Map<string, number>();
  let minutes = 0;
  for (const r of done) {
    authors.set(author(r), (authors.get(author(r)) ?? 0) + 1);
    const k = r.source?.kind ?? 'user';
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
    for (const key of exerciseKeys(r)) keys.set(key, (keys.get(key) ?? 0) + 1);
    minutes += runsheetMinutes(r);
  }
  const avgMin = minutes / done.length;

  // next session of any program in progress
  const programNext: Recommendation[] = [];
  const programs = new Map<string, Runsheet[]>();
  for (const r of all) if (r.program) (programs.get(r.program.name) ?? programs.set(r.program.name, []).get(r.program.name)!).push(r);
  for (const [name, days] of programs) {
    const sorted = [...days].sort((a, b) => (a.program?.order ?? 0) - (b.program?.order ?? 0));
    const lastDone = results.find(x => sorted.some(d => id(d) === x.runsheetId));
    if (!lastDone) continue;
    const i = sorted.findIndex(d => id(d) === lastDone.runsheetId);
    const next = sorted[(i + 1) % sorted.length];
    programNext.push({ runsheet: next, reason: `Next in ${name}`, score: 100 });
  }

  const scored: Recommendation[] = [];
  for (const r of all) {
    const rid = id(r);
    if (recent.has(rid) || programNext.some(p => id(p.runsheet) === rid)) continue;
    if (r.program && !programNext.length && r.program.order !== 1) continue; // only first days of untouched programs
    let s = 0;
    const reasons: [number, string][] = [];
    const a = author(r);
    if (a && authors.has(a)) {
      s += 3 * authors.get(a)!;
      reasons.push([3 * authors.get(a)!, `More from ${a}`]);
    }
    const k = r.source?.kind ?? 'user';
    if (kinds.has(k)) s += kinds.get(k)!;
    const overlap = [...exerciseKeys(r)].filter(x => keys.has(x)).length;
    if (overlap) {
      s += overlap * 2;
      const mostDone = [...exerciseKeys(r)].filter(x => keys.has(x)).sort((x, y) => keys.get(y)! - keys.get(x)!)[0];
      const like = done.find(d => exerciseKeys(d).has(mostDone));
      if (like) reasons.push([overlap * 2, `Because you did ${like.title}`]);
    }
    const dm = Math.abs(runsheetMinutes(r) - avgMin);
    if (dm <= 5) {
      s += 2;
      reasons.push([1, `About ${runsheetMinutes(r)} min, like your usual`]);
    }
    if (saved.includes(rid) && !doneIds.has(rid)) {
      s += 4;
      reasons.push([4, 'Saved and not done yet']);
    }
    if (doneIds.has(rid)) {
      s += 1;
      reasons.push([0.5, 'Beat your last score']);
    }
    if (s <= 0) continue;
    reasons.sort((x, y) => y[0] - x[0]);
    scored.push({ runsheet: r, reason: reasons[0]?.[1] ?? 'Popular', score: s });
  }
  scored.sort((x, y) => y.score - x.score);
  // keep the list varied: at most 3 per author
  const perAuthor = new Map<string, number>();
  const out = [...programNext];
  for (const rec of scored) {
    const a = author(rec.runsheet);
    if ((perAuthor.get(a) ?? 0) >= 3) continue;
    perAuthor.set(a, (perAuthor.get(a) ?? 0) + 1);
    out.push(rec);
    if (out.length >= limit) break;
  }
  return out;
};
