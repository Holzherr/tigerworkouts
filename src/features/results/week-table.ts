/**
 * A workout week by week (Priyanka via Nick, 15 Nov 2026: "Running the same workout ~4 weeks and
 * changing it as you go, you can't see what you did the week before"): one row per exercise and
 * set, one column per session of the workout and the workouts it was duplicated from or into, each
 * cell what was logged, set by set, with the change since the column before. Pure. Port of
 * `ios/TigerWorkouts/Results/WeekTable.swift`.
 */
import { lineage, measureOf, type ExerciseStep, type Runsheet } from '@/features/runsheet/model';
import { isWorking, type SessionResult, type SetResult } from '@/features/runsheet/progression';
import { fmtNum, setLabel, setsOf } from './logbook';
import { loadDelta } from '@/shared/utils/units';

export interface WeekColumn {
  /** The session's id (its start when it has none yet). */
  id: string;
  startedAt: string;
  /** "Wk 3": weeks counted from the week of the first session, Monday to Sunday. */
  week: number;
  /** The newest column: the one highlighted. */
  latest: boolean;
  runsheetId: string;
  label: string;
}

export interface WeekCell {
  set: SetResult;
  /** "100 × 8", "500 m in 1:52". */
  text: string;
  /** "+5 kg", "+1 rep", "−2.5 kg · +2 reps"; unset when nothing changed or there is nothing before. */
  delta?: string;
  /** Heavier, or more reps at the same load (more metres, calories or seconds): true. Lighter, or
   * fewer reps at the same load: false. Unset when unchanged or not comparable. */
  better?: boolean;
}

export interface WeekRow {
  exerciseKey: string;
  name: string;
  /** 0-based working set number. */
  set: number;
  /** One per column, null where that session has no such set. */
  cells: (WeekCell | null)[];
  id: string;
}

export interface WeekTable {
  columns: WeekColumn[];
  rows: WeekRow[];
}

const keyOf = (r: Pick<Runsheet, 'id' | 'title'>) => r.id ?? r.title;

/** The ids whose sessions belong in this workout's table: its own, the original's for an edited
 * copy (`copyOf`), and every workout linked to it by ⋯ Duplicate (`duplicatedFrom`), back to week 1
 * and on to the newest week. */
export const weekFamily = (r: Runsheet, workouts: Runsheet[]): Set<string> => {
  const byKey = new Map(workouts.map(w => [keyOf(w), w]));
  byKey.set(keyOf(r), r);
  const ids = new Set<string>();
  const queue = [keyOf(r)];
  while (queue.length) {
    const key = queue.pop()!;
    if (ids.has(key)) continue;
    ids.add(key);
    const w = byKey.get(key);
    if (!w) continue;
    queue.push(...lineage(w).slice(1));
    if (w.duplicatedFrom) queue.push(w.duplicatedFrom);
    queue.push(...workouts.filter(x => x.duplicatedFrom === key).map(keyOf));
  }
  return ids;
};

/** Working sets of one exercise in one session, in order: every row of that exercise (a step done
 * twice, a swap) one after the other. Warm-ups are not the work, so they are left out. */
export const weekSets = (r: SessionResult, exerciseKey: string, unit?: string): SetResult[] =>
  r.steps
    .filter(s => s.exerciseKey === exerciseKey)
    .flatMap(s => setsOf(s, unit))
    .filter(x => isWorking(x) && setLabel(x) !== '');

const signed = (d: number, suffix: string) => `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d))}${suffix}`;

/** The change from `a` to `b`, in what the set counts. */
export const weekDelta = (a: SetResult, b: SetResult, unit = 'kg'): { text?: string; better?: boolean } => {
  for (const [x, y, suffix] of [
    [a.meters, b.meters, ' m'],
    [a.calories, b.calories, ' cal'],
  ] as const) {
    if (x === undefined && y === undefined) continue;
    if (x === undefined || y === undefined || x === y) return {};
    return { text: signed(y - x, suffix), better: y > x };
  }
  const parts: string[] = [];
  const dl = (b.load ?? 0) - (a.load ?? 0);
  const dr = (b.reps ?? 0) - (a.reps ?? 0);
  if (Math.abs(dl) > 1e-9) parts.push(loadDelta(dl, unit));
  if (Math.abs(dr) > 1e-9 && a.reps !== undefined && b.reps !== undefined) parts.push(signed(dr, Math.abs(dr) === 1 ? ' rep' : ' reps'));
  if (!parts.length && a.seconds !== undefined && b.seconds !== undefined && Math.abs(b.seconds - a.seconds) >= 1 && a.reps === undefined && b.reps === undefined)
    return { text: signed(b.seconds - a.seconds, ' s'), better: b.seconds > a.seconds };
  if (!parts.length) return {};
  return { text: parts.join(' · '), better: Math.abs(dl) > 1e-9 ? dl > 0 : dr > 0 };
};

/** Monday 00:00 local of the week `d` falls in. */
const weekStart = (d: Date) => {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
};
/** Whole calendar days from `a` to `b`, local, so a clock change does not shift a day. */
const daysBetween = (a: Date, b: Date) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 864e5);

const exerciseSteps = (r: Runsheet): ExerciseStep[] =>
  r.items.flatMap(i => (i.kind === 'block' ? i.steps : i.kind === 'ref' ? [] : [i])).filter((s): s is ExerciseStep => s.kind === 'exercise');

/** The table for a workout: columns oldest first, rows in the workout's exercise order (then any
 * exercise only an older week had), each exercise's sets in order. `name` and `unit` resolve an
 * exercise key (the library in the app). */
export const weekTable = (r: Runsheet, results: SessionResult[], workouts: Runsheet[], name: (key: string) => string, unit: (key: string) => string | undefined): WeekTable => {
  const ids = weekFamily(r, workouts);
  const sessions = results.filter(s => ids.has(s.runsheetId) && !s.activity && s.steps.length > 0).sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
  if (!sessions.length) return { columns: [], rows: [] };
  const start = weekStart(new Date(sessions[0].startedAt));
  const columns: WeekColumn[] = sessions.map((s, i) => {
    const week = Math.floor(Math.max(0, daysBetween(start, new Date(s.startedAt))) / 7) + 1;
    return { id: s.id ?? s.startedAt, startedAt: s.startedAt, week, latest: i === sessions.length - 1, runsheetId: s.runsheetId, label: `Wk ${week}` };
  });

  // The workout's own order first, then exercises only older weeks did, in the order first done.
  const keys: string[] = [];
  const names = new Map<string, string>();
  for (const s of exerciseSteps(r)) {
    if (keys.includes(s.exercise.key)) continue;
    keys.push(s.exercise.key);
    names.set(s.exercise.key, s.exercise.name);
  }
  for (const s of sessions) for (const x of s.steps) if (!keys.includes(x.exerciseKey)) keys.push(x.exerciseKey);

  const rows: WeekRow[] = [];
  for (const key of keys) {
    const u = unit(key);
    const perSession = sessions.map(s => weekSets(s, key, u));
    const count = Math.max(0, ...perSession.map(x => x.length));
    const shown = (u ?? '').replace(' per arm', '').replace(' per side', '').trim();
    const deltaUnit = measureOf(shown) ? '' : shown;
    for (let n = 0; n < count; n++) {
      const cells: (WeekCell | null)[] = [];
      let before: SetResult | undefined;
      for (const sets of perSession) {
        const x = sets[n];
        if (!x) {
          cells.push(null);
          continue;
        }
        const d = before ? weekDelta(before, x, deltaUnit) : {};
        cells.push({ set: x, text: setLabel(x), ...(d.text ? { delta: d.text, better: d.better } : {}) });
        before = x;
      }
      rows.push({ exerciseKey: key, name: names.get(key) ?? name(key), set: n, cells, id: `${key}#${n}` });
    }
  }
  return { columns, rows };
};
