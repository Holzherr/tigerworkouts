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

export const nextUp = (all: Runsheet[], results: SessionResult[]): NextUp | undefined => {
  const byId = new Map(all.map(r => [id(r), r]));
  const latest = [...results].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).find(x => byId.has(x.runsheetId));
  if (!latest) return undefined;
  const last = byId.get(latest.runsheetId)!;
  const program = last.program?.name;
  if (program) {
    const days = all.filter(r => r.program?.name === program).sort((a, b) => (a.program?.order ?? 0) - (b.program?.order ?? 0));
    const i = days.findIndex(d => id(d) === id(last));
    const next = days[(i + 1) % days.length];
    if (days.length > 1 && next) return { runsheet: next, reason: `Next in ${program}`, lastAt: latest.startedAt };
  }
  return { runsheet: last, reason: 'Your last workout', lastAt: latest.startedAt };
};

/** Minutes trained across every logged session: the timer's own duration, or what a quick log said. */
export const totalMinutes = (results: SessionResult[]) => Math.round(results.reduce((t, r) => t + (r.durationSec ? r.durationSec / 60 : (r.activity?.minutes ?? 0)), 0));

/** "45 min", "3 h 20". */
export const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`);
