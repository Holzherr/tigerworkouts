/**
 * Your versions of a workout (Nick, 19 Oct 2026: "keep one as base - but our model should allow
 * people to make edits and have those workouts saved as variants the user has done - but these are
 * not published"). The workout is the base; a session run with changes keeps what it ran as
 * `version` on its own row, which only its owner (and their coach) can read. A version is never a
 * workout of its own. Ported one for one to ios/TigerWorkouts/Model/Versions.swift.
 */
import type { ExerciseStep, Item, Runsheet, Step } from './model';
import type { SessionResult } from './progression';

/** What a session ran when it was not the workout as saved: its items, nothing else. */
export interface SessionVersion {
  items: Item[];
}

/** The same JSON with every `id` left out and keys in order: two lists that read the same match. */
export const fingerprint = (items: Item[]): string => JSON.stringify(strip(items));
const strip = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .filter(k => k !== 'id' && (v as Record<string, unknown>)[k] !== undefined && (v as Record<string, unknown>)[k] !== null)
        .sort()
        .map(k => [k, strip((v as Record<string, unknown>)[k])]),
    );
  return v;
};

const steps = (items: Item[]): ExerciseStep[] => items.flatMap(it => (it.kind === 'block' ? it.steps : it.kind === 'ref' ? [] : [it])).filter((s): s is ExerciseStep => s.kind === 'exercise');
const LOAD = ['target', 'incline', 'targetPct', 'loadFactor'] as const;

/**
 * The run's items with the loads the app filled in itself put back to the workout's own: a step
 * whose load and incline are what the app started it on (last time's, a programme's next step, a %
 * of a training max worked out) reads as the base has it. A load somebody set stays.
 */
export const unseeded = (items: Item[], auto: Runsheet, base: Runsheet): Item[] => {
  const was = new Map(steps(auto.items).map(s => [s.id, s]));
  const own = new Map(steps(base.items).map(s => [s.id, s]));
  const step = (s: Step): Step => {
    if (s.kind !== 'exercise') return s;
    const a = was.get(s.id);
    const b = own.get(s.id);
    if (!a || !b || a.exercise.key !== s.exercise.key || s.target !== a.target || s.incline !== a.incline) return s;
    const out: ExerciseStep = { ...s };
    for (const k of LOAD) {
      if (b[k] === undefined) delete out[k];
      else out[k] = b[k];
    }
    return out;
  };
  return items.map(it => (it.kind === 'block' ? { ...it, steps: it.steps.map(step) } : it.kind === 'ref' ? it : step(it)));
};

/**
 * What a session ran, when it was not the workout: `run` is the sheet the timer ended on, `auto` the
 * same workout as the app would have started it untouched (refs inlined, loads filled in), `base`
 * the workout as saved. Undefined when only the app's own fill-ins differ.
 */
export const versionOf = (run: Runsheet, auto: Runsheet, base: Runsheet): SessionVersion | undefined => {
  const items = unseeded(run.items, auto, base);
  return fingerprint(items) === fingerprint(unseeded(auto.items, auto, base)) ? undefined : { items };
};

/** One version on the workout page: the newest session that ran it stands for it. */
export interface VersionRow {
  key: string;
  items: Item[];
  /** "Swings first · + Romanian deadlift" — what is different from the base. */
  changes: string;
  sessions: number;
  lastDone: string;
  sessionId?: string;
}

/** The versions of `base` its sessions ran, newest first; one that matches the base now is not one. */
export const versionsOf = (results: SessionResult[], base: Runsheet, limit = 6): VersionRow[] => {
  const id = base.id ?? base.title;
  const now = fingerprint(base.items);
  const rows = new Map<string, VersionRow>();
  for (const r of [...results].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    if (r.runsheetId !== id || !r.version?.items?.length) continue;
    const key = fingerprint(r.version.items);
    if (key === now) continue;
    const row = rows.get(key);
    if (row) row.sessions++;
    else rows.set(key, { key, items: r.version.items, changes: changesFrom(base.items, r.version.items), sessions: 1, lastDone: r.startedAt, sessionId: r.id });
  }
  return [...rows.values()].slice(0, limit);
};

/** What a version does differently, in at most three short parts. */
export const changesFrom = (base: Item[], version: Item[]): string => {
  const a = steps(base);
  const b = steps(version);
  const count = (xs: ExerciseStep[]) => xs.reduce((m, s) => m.set(s.exercise.key, (m.get(s.exercise.key) ?? 0) + 1), new Map<string, number>());
  const ca = count(a);
  const cb = count(b);
  const name = new Map([...a, ...b].map(s => [s.exercise.key, s.exercise.name]));
  const parts: string[] = [];
  const firstA = a.find(s => cb.has(s.exercise.key));
  const firstB = b.find(s => ca.has(s.exercise.key));
  const orderA = a.filter(s => cb.has(s.exercise.key)).map(s => s.exercise.key);
  const orderB = b.filter(s => ca.has(s.exercise.key)).map(s => s.exercise.key);
  if (firstB && firstA && firstB.exercise.key !== firstA.exercise.key) parts.push(`${firstB.exercise.name} first`);
  else if (orderA.join() !== orderB.join()) parts.push('New order');
  for (const [k, n] of cb) if (n > (ca.get(k) ?? 0)) parts.push(`+ ${name.get(k)}`);
  for (const [k, n] of ca) if (n > (cb.get(k) ?? 0)) parts.push(`− ${name.get(k)}`);
  if (!parts.length) parts.push('Other sets, reps or loads');
  return parts.length > 3 ? `${parts.slice(0, 3).join(' · ')} · …` : parts.join(' · ');
};

/**
 * One workout folded into another as a version (a duplicate made by mistake): its sessions become
 * the other's, each keeping what it ran — its own version if it had one, else the folded workout's
 * items. A session whose items match the base needs no version.
 */
export const mergeSessions = (results: SessionResult[], from: Runsheet, into: Runsheet): SessionResult[] => {
  const fromId = from.id ?? from.title;
  const intoId = into.id ?? into.title;
  const base = fingerprint(into.items);
  return results.map(r => {
    if (r.runsheetId !== fromId) return r;
    const items = r.version?.items ?? from.items;
    const { version: _v, ...rest } = r;
    void _v;
    return fingerprint(items) === base ? { ...rest, runsheetId: intoId } : { ...rest, runsheetId: intoId, version: { items } };
  });
};
