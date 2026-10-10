/**
 * What to do next, from what was done last: the following day of the program the last session
 * belonged to, or else that same workout again. Pure; nothing when there is no history, so the
 * first run stays the catalogue.
 */
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';

export interface NextUp {
  runsheet: Runsheet;
  /** "Next in StrongLifts 5×5" or "Your last workout". */
  reason: string;
  /** When the session this follows on from was started. */
  lastAt: string;
}

const id = (r: Runsheet) => r.id ?? r.title;
/** The workout a copy was made from, or the workout itself. */
export const root = (r: Runsheet) => r.copyOf ?? id(r);

/** Your edited copy of each workout, by the id it was copied from. With two copies of one workout
 * the later in the list wins. iOS: `NextUp.copies`. */
export const copiesOf = (all: Runsheet[]) => new Map(all.filter(r => r.copyOf).map(r => [r.copyOf!, r]));

/** A program's days in order, one per day: your copy of a day in place of the day, and never the
 * day twice (the original and its copy, or two copies). iOS: `NextUp.programDays`. */
export const programDays = (all: Runsheet[], program: string, copies: Map<string, Runsheet>): Runsheet[] => {
  const seen = new Set<string>();
  const days: Runsheet[] = [];
  for (const r of all) {
    if (r.program?.name !== program || seen.has(root(r))) continue;
    seen.add(root(r));
    days.push(copies.get(root(r)) ?? r);
  }
  return days.sort((a, b) => (a.program?.order ?? 0) - (b.program?.order ?? 0));
};

export const nextUp = (all: Runsheet[], results: SessionResult[]): NextUp | undefined => {
  const byId = new Map<string, Runsheet>();
  for (const r of all) if (!byId.has(id(r))) byId.set(id(r), r);
  const latest = [...results].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).find(x => byId.has(x.runsheetId));
  if (!latest) return undefined;
  // Your edited copy of a day replaces the day, whether the last session ran the copy or the original.
  const copies = copiesOf(all);
  const found = byId.get(latest.runsheetId)!;
  const last = copies.get(root(found)) ?? found;
  const program = last.program?.name;
  if (program) {
    const days = programDays(all, program, copies);
    const i = days.findIndex(d => root(d) === root(last));
    if (days.length > 1 && i >= 0) return { runsheet: days[(i + 1) % days.length], reason: `Next in ${program}`, lastAt: latest.startedAt };
  }
  return { runsheet: last, reason: 'Your last workout', lastAt: latest.startedAt };
};

/** Minutes trained across every logged session: the timer's own duration, or what a quick log said. */
export const totalMinutes = (results: SessionResult[]) => Math.round(results.reduce((t, r) => t + (r.durationSec ? r.durationSec / 60 : (r.activity?.minutes ?? 0)), 0));

/** "45 min", "3 h 20". */
export const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`);
