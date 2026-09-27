/**
 * History as CSV, out and in. Export writes one row per set; import reads a Hevy or Strong
 * export (or this app's own) back into sessions. Pure functions: the screens do the file work.
 * The export is ported to `ios/TigerWorkouts/Results/CSV.swift`; change one, change the other.
 */
import type { ExerciseGroup, LibraryExercise } from '@/features/exercises/library';
import type { SessionResult, SetResult } from '@/features/runsheet/progression';
import { setsOf } from './logbook';

// ── export ──

export const EXPORT_COLUMNS = ['date', 'workout', 'exercise', 'exercise_key', 'set', 'load', 'unit', 'reps', 'duration_seconds', 'set_time_seconds', 'notes'] as const;

/** Set time in seconds of session time. Written by the timer from the set-time change on; older sets have none. */
type TimedSet = SetResult & { at?: number };

const num = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '' : Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

/** RFC 4180: quote a field holding a comma, a quote or a line break, and double its quotes. */
export const csvField = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const line = (fields: string[]) => fields.map(csvField).join(',');

/**
 * Every session, oldest first, one row per set. A session with nothing logged per exercise (a
 * quick-logged run) is one row with the exercise columns empty, so it is not lost; an exercise
 * with no sets is one row with the set columns empty.
 */
export const toCsv = (results: SessionResult[], exercise: (key: string) => { name: string; unit?: string }): string => {
  const rows = [line([...EXPORT_COLUMNS])];
  for (const r of [...results].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const head = [r.startedAt, r.title ?? r.activity?.name ?? r.runsheetId];
    const tail = (set?: TimedSet) => [num(r.durationSec ?? (r.activity ? r.activity.minutes * 60 : undefined)), num(set?.at), r.notes ?? ''];
    if (!r.steps.length) {
      rows.push(line([...head, '', '', '', '', '', '', ...tail()]));
      continue;
    }
    for (const s of r.steps) {
      const ex = exercise(s.exerciseKey);
      const sets = setsOf(s) as TimedSet[];
      if (!sets.length) rows.push(line([...head, ex.name, s.exerciseKey, '', '', ex.unit ?? '', '', ...tail()]));
      sets.forEach((x, i) => rows.push(line([...head, ex.name, s.exerciseKey, String(i + 1), num(x.load), ex.unit ?? '', num(x.reps), ...tail(x)])));
    }
  }
  return rows.join('\n') + '\n';
};

/** `tigerworkouts-2026-09-27.csv` */
export const exportFileName = (d = new Date()) => `tigerworkouts-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.csv`;

// ── reading CSV ──

/** Rows of fields. Handles quoted fields with commas, doubled quotes and line breaks, a BOM, CRLF, and `;` files. */
export const parseCsv = (text: string): string[][] => {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.filter(r => r.some(f => f.trim()));
};

// ── importing ──

export type CsvFormat = 'hevy' | 'strong' | 'tiger';
export const FORMAT_LABEL: Record<CsvFormat, string> = { hevy: 'Hevy', strong: 'Strong', tiger: 'TigerWorkouts' };

/** A set as a file has it: Hevy and Strong also time a set (a plank, a carry). */
export type ImportedSet = SetResult & { seconds?: number };

export interface ImportedExercise {
  name: string;
  /** Only this app's own export carries the key. */
  key?: string;
  unit?: string;
  sets: ImportedSet[];
}

export interface ImportedSession {
  title: string;
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
  notes?: string;
  exercises: ImportedExercise[];
}

export interface ParsedCsv {
  format: CsvFormat;
  sessions: ImportedSession[];
}

const LB = 0.45359237;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Hevy's "26 Sep 2026, 18:02", Strong's "2026-09-26 18:02:11" (both local time), or ISO 8601. */
export const parseDate = (s: string): Date | undefined => {
  const t = s.trim();
  let m = t.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const mo = MONTHS.indexOf(m[2].toLowerCase());
    if (mo >= 0) return new Date(+m[3], mo, +m[1], +m[4], +m[5], +(m[6] ?? 0));
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const d = Date.parse(t);
  return Number.isNaN(d) ? undefined : new Date(d);
};

/** Strong's "1h 5m", "45m", "30s", or plain seconds. */
export const parseDuration = (s: string): number | undefined => {
  const t = s.trim();
  if (!t) return undefined;
  if (/^\d+(\.\d+)?$/.test(t)) return +t;
  const part = (u: string) => +(t.match(new RegExp(`(\\d+)\\s*${u}`))?.[1] ?? 0);
  const total = part('h') * 3600 + part('m') * 60 + part('s');
  return total || undefined;
};

/** A number, reading a decimal comma too; blank and zero are "not logged". */
const val = (s: string | undefined): number | undefined => {
  const t = (s ?? '').trim().replace(/^(\d+),(\d+)$/, '$1.$2');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

type Row = (name: string) => string;

const group = (rows: string[][], read: (get: Row) => { session: Omit<ImportedSession, 'exercises'>; exercise: string; key?: string; unit?: string; set?: ImportedSet } | null): ImportedSession[] => {
  const [head, ...body] = rows;
  const cols = new Map(head.map((h, i) => [h.trim().toLowerCase(), i]));
  const sessions = new Map<string, ImportedSession>();
  for (const r of body) {
    const out = read(name => r[cols.get(name) ?? -1] ?? '');
    if (!out) continue;
    const id = `${out.session.startedAt}|${out.session.title}`;
    const s = sessions.get(id) ?? sessions.set(id, { ...out.session, exercises: [] }).get(id)!;
    if (!out.exercise) continue;
    let ex = s.exercises.find(e => e.name === out.exercise);
    if (!ex) s.exercises.push((ex = { name: out.exercise, ...(out.key ? { key: out.key } : {}), ...(out.unit !== undefined ? { unit: out.unit } : {}), sets: [] }));
    if (out.set) ex.sets.push(out.set);
  }
  return [...sessions.values()];
};

const set = (reps?: number, load?: number, seconds?: number): ImportedSet => ({ ...(reps !== undefined ? { reps } : {}), ...(load !== undefined ? { load } : {}), ...(seconds !== undefined ? { seconds } : {}) });

/**
 * Hevy: title, start_time, end_time, description, exercise_title, superset_id, exercise_notes,
 * set_index, set_type, weight_kg (or weight_lbs), reps, distance_km, duration_seconds, rpe.
 */
const hevy = (rows: string[][]): ImportedSession[] => {
  const lbs = rows[0].some(h => h.trim().toLowerCase() === 'weight_lbs');
  return group(rows, get => {
    const start = parseDate(get('start_time'));
    if (!start) return null;
    const end = parseDate(get('end_time'));
    const w = val(get(lbs ? 'weight_lbs' : 'weight_kg'));
    return {
      session: { title: get('title').trim() || 'Workout', startedAt: start.toISOString(), ...(end ? { endedAt: end.toISOString(), durationSec: Math.round((+end - +start) / 1000) } : {}), ...(get('description').trim() ? { notes: get('description').trim() } : {}) },
      exercise: get('exercise_title').trim(),
      set: set(val(get('reps')), w === undefined ? undefined : lbs ? Math.round(w * LB * 100) / 100 : w, val(get('duration_seconds'))),
    };
  });
};

/**
 * Strong: Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps, Distance, Seconds,
 * Notes, Workout Notes, RPE; older files add Weight Unit and Distance Unit. Newer ones add
 * "Rest Timer" rows, which are skipped.
 */
const strong = (rows: string[][]): ImportedSession[] =>
  group(rows, get => {
    const start = parseDate(get('date'));
    if (!start) return null;
    if (/rest/i.test(get('set order'))) return null;
    const dur = parseDuration(get('duration'));
    const w = val(get('weight'));
    const lbs = /lb/i.test(get('weight unit'));
    return {
      session: { title: get('workout name').trim() || 'Workout', startedAt: start.toISOString(), ...(dur ? { durationSec: dur, endedAt: new Date(+start + dur * 1000).toISOString() } : {}), ...(get('workout notes').trim() ? { notes: get('workout notes').trim() } : {}) },
      exercise: get('exercise name').trim(),
      set: set(val(get('reps')), w === undefined ? undefined : lbs ? Math.round(w * LB * 100) / 100 : w, val(get('seconds'))),
    };
  });

/** This app's own export, read back. */
const tiger = (rows: string[][]): ImportedSession[] =>
  group(rows, get => {
    const start = parseDate(get('date'));
    if (!start) return null;
    const dur = val(get('duration_seconds'));
    return {
      session: { title: get('workout').trim() || 'Workout', startedAt: start.toISOString(), ...(dur ? { durationSec: dur, endedAt: new Date(+start + dur * 1000).toISOString() } : {}), ...(get('notes') ? { notes: get('notes') } : {}) },
      exercise: get('exercise').trim(),
      key: get('exercise_key').trim() || undefined,
      unit: get('unit'),
      set: get('set').trim() ? set(val(get('reps')), val(get('load'))) : undefined,
    };
  });

/** Reads a Hevy, Strong or TigerWorkouts CSV export, told apart by their headers. */
export const parseWorkoutCsv = (text: string): ParsedCsv | { error: string } => {
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: 'That file has no rows.' };
  const h = new Set(rows[0].map(x => x.trim().toLowerCase()));
  if (h.has('exercise_title') && h.has('start_time')) return { format: 'hevy', sessions: hevy(rows) };
  if (h.has('exercise name') && h.has('workout name')) return { format: 'strong', sessions: strong(rows) };
  if (h.has('workout') && h.has('exercise') && h.has('date')) return { format: 'tiger', sessions: tiger(rows) };
  return { error: 'Not a Hevy or Strong export. Export workouts as CSV from either app and pick that file.' };
};

// ── mapping onto the catalogue ──

const STOP = new Set(['the', 'a', 'an', 'with', 'and', 'on', 'of']);

/** "Bench Press (Barbell)" and "Barbell bench press" sign the same: the words, singular, sorted. */
export const nameSignature = (name: string) =>
  name
    .toLowerCase()
    .replace(/[-‐]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(w => w && !STOP.has(w))
    .map(w => (w.length > 2 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .sort()
    .join(' ');

/**
 * Hevy and Strong names that say less than the catalogue's ("Squat (Barbell)" is a back squat),
 * by signature. Only the common lifts; anything else unmatched becomes your own exercise.
 */
const ALIASES: Record<string, string> = {
  'barbell squat': 'bb_back_squat',
  'barbell row': 'bb_row',
  'air squat': 'bw_squat',
};

/**
 * The catalogue key a name means: exact name, then the same words in any order, then the same
 * words run together ("Pull Up" and "Pull-up"), then the aliases.
 */
export const matcher = (library: Record<string, LibraryExercise>) => {
  const byName = new Map<string, string>();
  const bySig = new Map<string, string>();
  const byCompact = new Map<string, string>();
  for (const e of Object.values(library)) {
    const n = e.name.trim().toLowerCase();
    if (!byName.has(n)) byName.set(n, e.key);
    const s = nameSignature(e.name);
    if (s && !bySig.has(s)) bySig.set(s, e.key);
    const c = s.replace(/ /g, '');
    if (c && !byCompact.has(c)) byCompact.set(c, e.key);
  }
  return (name: string) => {
    const s = nameSignature(name);
    const alias = ALIASES[s];
    return byName.get(name.trim().toLowerCase()) ?? bySig.get(s) ?? byCompact.get(s.replace(/ /g, '')) ?? (alias && library[alias] ? alias : undefined);
  };
};

const GROUP_WORDS: [RegExp, ExerciseGroup][] = [
  [/kettlebell/i, 'kettlebell'],
  [/dumbbell/i, 'dumbbell'],
  [/barbell|machine|smith|lever|ez bar|trap bar/i, 'barbell'],
  [/cable|band/i, 'band'],
  [/treadmill/i, 'treadmill'],
  [/rowing|rower|ski ?erg/i, 'rower'],
  [/bike|cycling|spin/i, 'bike'],
  [/\brun|running|jog/i, 'run'],
  [/swim/i, 'swim'],
  [/walk|stair/i, 'walk'],
  [/plank|crunch|sit ?up|ab |abs\b|hollow|leg raise/i, 'core'],
];

/** The equipment group a name suggests; bodyweight when it says nothing. */
export const guessGroup = (name: string): ExerciseGroup => GROUP_WORDS.find(([re]) => re.test(name))?.[1] ?? 'body';

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** A new exercise as the picker makes one: `u_` key, unit and step, group from the name. */
export const customExercise = (name: string, opts: { unit?: string; loaded?: boolean; timed?: boolean; key?: string } = {}): LibraryExercise => {
  const g = guessGroup(name);
  const unit = opts.unit ?? (opts.loaded ? (g === 'dumbbell' ? 'kg per arm' : 'kg') : opts.timed ? 's' : '');
  return { key: opts.key ?? `u_${slug(name)}`, name: name.trim(), unit, step: unit === 'kph' ? 0.5 : unit ? 2.5 : 1, group: g, cue: '' };
};

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Two sessions are the same when they share a day and a workout name. */
export const sameSessionKey = (startedAt: string, title: string) => `${dayKey(startedAt)}|${title.trim().toLowerCase()}`;

/** FNV-1a, base 36: a stable id, so the same session imported on two devices is one row. */
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
};

export interface ImportPlan {
  format: CsvFormat;
  /** New sessions, newest first. */
  sessions: SessionResult[];
  /** Already in History (same day, same workout name), or twice in the file. */
  duplicates: { title: string; startedAt: string }[];
  /** Exercises the file names that nothing here matches; created on import. */
  newExercises: LibraryExercise[];
  /** Name in the file → catalogue exercise it was matched to. */
  matched: { name: string; key: string }[];
}

/** A timed set goes in as its seconds where the exercise counts seconds (a plank); otherwise the time is dropped. */
const toSet = ({ seconds, ...x }: ImportedSet, timed: boolean): SetResult => (timed && seconds !== undefined && x.load === undefined ? { ...x, load: seconds } : x);

/** What importing the file would add, before anything is written. */
export const planImport = (parsed: ParsedCsv, existing: SessionResult[], library: Record<string, LibraryExercise>): ImportPlan => {
  const match = matcher(library);
  const seen = new Set(existing.map(r => sameSessionKey(r.startedAt, r.title ?? r.activity?.name ?? r.runsheetId)));
  const created = new Map<string, LibraryExercise>();
  const matched = new Map<string, string>();
  const keyFor = (e: ImportedExercise): string => {
    if (e.key && library[e.key]) return e.key;
    const hit = match(e.name) ?? created.get(e.name.trim().toLowerCase())?.key;
    if (hit) {
      if (!e.key && library[hit]) matched.set(e.name, hit);
      return hit;
    }
    let ex = customExercise(e.name, { unit: e.unit, loaded: e.sets.some(x => (x.load ?? 0) > 0), timed: e.sets.some(x => x.seconds !== undefined && x.load === undefined && x.reps === undefined), key: e.key });
    for (let n = 2; library[ex.key] || [...created.values()].some(c => c.key === ex.key); n++) ex = { ...ex, key: `${customExercise(e.name).key}_${n}` };
    created.set(e.name.trim().toLowerCase(), ex);
    return ex.key;
  };
  const sessions: SessionResult[] = [];
  const duplicates: ImportPlan['duplicates'] = [];
  for (const s of parsed.sessions) {
    const k = sameSessionKey(s.startedAt, s.title);
    if (seen.has(k)) {
      duplicates.push({ title: s.title, startedAt: s.startedAt });
      continue;
    }
    seen.add(k);
    sessions.push({
      id: `s-imp-${hash(k)}`,
      runsheetId: `import:${parsed.format}`,
      title: s.title,
      startedAt: s.startedAt,
      ...(s.endedAt ? { endedAt: s.endedAt } : {}),
      ...(s.durationSec ? { durationSec: s.durationSec } : {}),
      completed: true,
      steps: s.exercises.map((e, i) => {
        const key = keyFor(e);
        const timed = (library[key] ?? [...created.values()].find(c => c.key === key))?.unit === 's';
        return { stepId: `imp${i}`, exerciseKey: key, sets: e.sets.map(x => toSet(x, timed)) };
      }),
      ...(s.notes ? { notes: s.notes } : {}),
    });
  }
  sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return { format: parsed.format, sessions, duplicates, newExercises: [...created.values()], matched: [...matched].map(([name, key]) => ({ name, key })) };
};
