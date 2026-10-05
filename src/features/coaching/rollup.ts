/**
 * Coaching rollups, pure: who trained this week and who has gone quiet (the coach dashboard),
 * whether an assigned workout was done, and a session's sets set against what the workout
 * prescribed (the client detail).
 */
import { startOfWeek } from '@/features/results/effort';
import { setLabel, setsOf } from '@/features/results/logbook';
import { forLabel, loadLabel, shortUnit, type ExerciseStep, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult, SetResult } from '@/features/runsheet/progression';

const DAY = 864e5;
/** Days without a session after which a client reads as quiet. */
export const QUIET_DAYS = 7;

export interface ClientLink {
  id: string;
  name: string;
  /** When the client accepted the invite. */
  since: string;
}

export interface ClientSummary extends ClientLink {
  sessionsThisWeek: number;
  /** Start of the client's latest session, if any. */
  lastActive?: string;
  /** No session for QUIET_DAYS or more (counted from joining when there is none yet). */
  quiet: boolean;
}

/** One row per client: sessions since Monday, last active, quiet. Quiet clients first, then the most recently active. */
export const clientRollup = (clients: ClientLink[], sessions: { owner: string; startedAt: string }[], now = new Date()): ClientSummary[] => {
  const week = startOfWeek(now).getTime();
  return clients
    .map(c => {
      const mine = sessions.filter(s => s.owner === c.id);
      const lastActive = mine.reduce<string | undefined>((a, s) => (!a || s.startedAt > a ? s.startedAt : a), undefined);
      const ref = Date.parse(lastActive ?? c.since);
      return { ...c, sessionsThisWeek: mine.filter(s => Date.parse(s.startedAt) >= week).length, lastActive, quiet: now.getTime() - ref >= QUIET_DAYS * DAY };
    })
    .sort((a, b) => Number(b.quiet) - Number(a.quiet) || (b.lastActive ?? '').localeCompare(a.lastActive ?? '') || a.name.localeCompare(b.name));
};

export interface WeekSummary {
  clients: number;
  /** Clients with at least one session since Monday. */
  trained: number;
  sessions: number;
  quiet: number;
}

export const weekSummary = (rows: ClientSummary[]): WeekSummary => ({
  clients: rows.length,
  trained: rows.filter(r => r.sessionsThisWeek > 0).length,
  sessions: rows.reduce((n, r) => n + r.sessionsThisWeek, 0),
  quiet: rows.filter(r => r.quiet).length,
});

/** "today", "yesterday", "3 days ago", "2 weeks ago". */
export const daysAgo = (iso: string, now = new Date()) => {
  const d = Math.floor((startOfDay(now) - startOfDay(new Date(iso))) / DAY);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  return `${Math.floor(d / 7)} weeks ago`;
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** The first session of the assigned workout started after it was assigned: that is "done". */
export const doneBy = (a: { workoutId: string; createdAt: string }, sessions: Pick<SessionResult, 'id' | 'runsheetId' | 'startedAt'>[]) =>
  sessions.filter(s => s.runsheetId === a.workoutId && s.startedAt >= a.createdAt).sort((x, y) => x.startedAt.localeCompare(y.startedAt))[0];

export interface PlanRow {
  stepId: string;
  exerciseKey: string;
  name: string;
  /** "3 × 8 reps @ 60 kg"; empty when the workout does not have the step. */
  planned: string;
  /** "60 × 8, 60 × 7"; empty when the step was not done. */
  done: string;
  /** hit = every prescribed set done at the reps and load; short = fewer, lighter or fewer reps; skipped = not done; extra = not in the plan; unset when there is no plan to compare. */
  verdict?: 'hit' | 'short' | 'skipped' | 'extra';
}

type Planned = { reps?: number; load?: number };

/** Each prescribed set of a step, with the per-set plan's carry-over (a value left out repeats the one before). */
const plannedSets = (s: ExerciseStep, rounds: number): Planned[] => {
  const reps = s.forMode === 'reps' || s.forMode === 'amrap' ? s.forValue : undefined;
  const n = Math.max(rounds, s.sets?.length ?? 0);
  const out: Planned[] = [];
  let r = reps;
  let l = s.target;
  for (let i = 0; i < n; i++) {
    const p = s.sets?.[i];
    if (p?.type === 'warmup') continue;
    r = p?.reps ?? r;
    l = p?.load ?? l;
    out.push({ reps: r, load: l });
  }
  return out;
};

const plannedLabel = (s: ExerciseStep, sets: Planned[]) => {
  const same = sets.every(x => x.reps === sets[0]?.reps && x.load === sets[0]?.load);
  if (!same && sets.some(x => x.reps !== undefined)) return sets.map(x => setLabel(x as SetResult, shortUnit(s.exercise.unit))).join(', ');
  const load = loadLabel(s);
  return `${sets.length > 1 ? `${sets.length} × ` : ''}${forLabel(s)}${load ? ` @ ${load}` : ''}`;
};

const working = (x: SetResult) => x.type !== 'warmup';

/**
 * A session's exercises against the workout it ran: what was prescribed, what was done, and
 * whether it was hit. Reps and load are compared set for set where the plan counts reps; other
 * steps (time, distance) count as hit when every set was done. Without a workout, only what was done.
 */
export const prescribedVsDone = (runsheet: Runsheet | undefined, result: SessionResult, name: (key: string) => { name: string; unit: string } = k => ({ name: k, unit: '' })): PlanRow[] => {
  const plan: { step: ExerciseStep; rounds: number }[] = [];
  for (const it of runsheet?.items ?? []) {
    if (it.kind === 'block') {
      for (const s of it.steps) if (s.kind === 'exercise') plan.push({ step: s, rounds: it.repeat ?? 1 });
    } else if (it.kind === 'exercise') plan.push({ step: it, rounds: 1 });
  }
  const rows: PlanRow[] = plan.map(({ step, rounds }) => {
    const got = result.steps.find(x => x.stepId === step.id);
    const sets = plannedSets(step, rounds);
    const done = got ? setsOf(got, step.exercise.unit).filter(working) : [];
    const unit = shortUnit(step.exercise.unit);
    const met = sets.every((p, i) => {
      const d = done[i];
      if (!d) return false;
      if (p.reps !== undefined && step.forMode === 'reps' && (d.reps ?? 0) < p.reps) return false;
      if (p.load !== undefined && d.load !== undefined && d.load + 1e-9 < p.load) return false;
      return true;
    });
    return {
      stepId: step.id,
      exerciseKey: step.exercise.key,
      name: step.exercise.name,
      planned: plannedLabel(step, sets),
      done: done.map(x => setLabel(x, unit)).filter(Boolean).join(', '),
      verdict: !got || !done.length ? 'skipped' : met ? 'hit' : 'short',
    };
  });
  for (const s of result.steps) {
    if (plan.some(p => p.step.id === s.stepId)) continue;
    const ex = name(s.exerciseKey);
    rows.push({ stepId: s.stepId, exerciseKey: s.exerciseKey, name: ex.name, planned: '', done: setsOf(s, ex.unit).filter(working).map(x => setLabel(x, shortUnit(ex.unit))).filter(Boolean).join(', '), verdict: runsheet ? 'extra' : undefined });
  }
  return rows;
};
