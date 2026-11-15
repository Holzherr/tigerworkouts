/**
 * What to do next. `pickUpNext` is the rule for the Up next card on Workouts; `nextUp` is the older
 * one (the following day of the program the last session belonged to, or else that same workout
 * again). Pure; nothing when there is no history, so the first run stays the catalogue.
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

/** The one card to do next, and why it was picked. iOS: `NextUp.Pick`. */
export interface UpNextPick {
  id: string;
  /** `new`: yours and not done yet. `usual`: the one started most lately. `oldest`: done longest ago. */
  why: 'new' | 'usual' | 'oldest';
  /** For `usual`: this workout was `count` of the last `of` sessions. */
  count?: number;
  of?: number;
}

const DAY = 86_400_000;
/** How far back "started most" counts, and how lately done rules a workout out. */
export const USUAL_DAYS = 28;
export const JUST_DONE_HOURS = 20;

/**
 * Up next (Nick, review D2, 15 Nov 2026): a workout of yours not done yet comes first. Otherwise
 * the workout started most in the last 28 days, at least twice, unless it was done in the last 20
 * hours, then the next most started. Done longest ago is only the fallback. A copy counts its
 * original's sessions. Undefined when nothing qualifies. Ported to iOS as `NextUp.pick`.
 */
export const pickUpNext = (list: Runsheet[], ownIds: string[], results: SessionResult[], now = new Date()): UpNextPick | undefined => {
  const own = new Set(ownIds);
  const starts = (r: Runsheet) => results.filter(x => x.runsheetId === id(r) || (!!r.copyOf && x.runsheetId === r.copyOf)).map(x => Date.parse(x.startedAt));
  const rows = list.map(r => {
    const at = starts(r);
    return { r, last: at.length ? Math.max(...at) : undefined, lately: at.filter(t => t >= now.getTime() - USUAL_DAYS * DAY).length };
  });
  const fresh = rows.find(x => own.has(id(x.r)) && x.last === undefined);
  if (fresh) return { id: id(fresh.r), why: 'new' };
  const justDone = now.getTime() - JUST_DONE_HOURS * 3_600_000;
  // Most started first; between equals the one done longer ago, which keeps a rotation even.
  const usual = rows.filter(x => x.lately >= 2 && x.last! < justDone).sort((a, b) => b.lately - a.lately || a.last! - b.last!)[0];
  if (usual) {
    const lastFive = [...results].filter(x => !x.activity).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5);
    const count = lastFive.filter(x => x.runsheetId === id(usual.r) || x.runsheetId === usual.r.copyOf).length;
    return { id: id(usual.r), why: 'usual', count, of: lastFive.length };
  }
  const oldest = rows.filter(x => x.last !== undefined).sort((a, b) => a.last! - b.last!)[0];
  return oldest && { id: id(oldest.r), why: 'oldest' };
};

/** The label over the Up next card. */
export const upNextBadge = (pick: Pick<UpNextPick, 'why'> | undefined) => (pick?.why === 'usual' ? 'Up next · your usual' : 'Up next');

/** "4 of your last 5" for the meta line, where the usual one was at least two of them. */
export const usualLine = (pick: UpNextPick | undefined) => (pick?.why === 'usual' && (pick.count ?? 0) >= 2 ? `${pick.count} of your last ${pick.of}` : undefined);
