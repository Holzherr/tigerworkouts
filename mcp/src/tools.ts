/**
 * The tool handlers, free of MCP and HTTP: each takes the user's Db (Supabase as that user) and
 * plain arguments and returns plain JSON. server.ts wires them to MCP; the tests call them directly
 * against a mocked Supabase.
 */
import { fromRow, workoutFromRow } from '@/features/cloud/rows';
import type { LibraryExercise } from '@/features/exercises/library';
import { forLabel, loadLabel, modeLabel, ROLE_LABEL, runsheetMinutes, type ExerciseStep, type Item, type Runsheet, type Step } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { shareUrlAt } from '@/features/share/link';
import { catalogue, FULL_LIBRARY, libraryRef } from './catalogue';
import { normalise, type RunsheetInput } from './runsheet';
import type { Db } from './supabase';

export const SITE = 'https://tigerworkouts.com/';

export class ToolError extends Error {}

const enc = encodeURIComponent;
const appUrl = (id: string) => `${SITE}#/w/${enc(id)}`;

interface WorkoutRow {
  id: string;
  owner: string | null;
  creator: string | null;
  title: string | null;
  public: boolean;
  data: unknown;
  updated_at?: string;
}
interface SessionRow {
  id: string;
  workout_id: string | null;
  type: string;
  title: string | null;
  started_at: string;
  ended_at: string | null;
  duration_min: number | null;
  completed: boolean;
  data: unknown;
}
const WORKOUT_COLS = 'id,owner,creator,title,public,data,updated_at';
const SESSION_COLS = 'id,workout_id,type,title,started_at,ended_at,duration_min,completed,data';

// ── readable forms ──
const exerciseName = (key: string, own: Record<string, LibraryExercise> = {}) => own[key]?.name ?? FULL_LIBRARY[key]?.name ?? key;
const stepLine = (s: Step) => (s.kind === 'rest' ? `Rest ${s.seconds}s` : [s.exercise.name, forLabel(s), loadLabel(s), s.incline ? `${s.incline}% incline` : ''].filter(Boolean).join(' · '));
/** One line per step, blocks indented, parts headed — what a person would read off the screen. */
export const outline = (r: Runsheet): string => {
  const lines: string[] = [];
  let part: string | undefined;
  const head = (it: Item) => {
    const p = it.kind === 'ref' ? undefined : ROLE_LABEL[it.role ?? 'main'];
    if (p && p !== part) lines.push(`${p}:`), (part = p);
  };
  for (const it of r.items) {
    head(it);
    if (it.kind === 'ref') lines.push(`  (shared section ${it.runsheetId})`);
    else if (it.kind === 'block') {
      lines.push(`  ${it.name} — ${modeLabel(it)}${it.restBetweenSec ? `, ${it.restBetweenSec}s between` : ''}`);
      for (const s of it.steps) lines.push(`    ${stepLine(s)}`);
    } else lines.push(`  ${stepLine(it)}`);
  }
  return lines.join('\n');
};

const exerciseKeys = (r: Runsheet) => [...new Set(r.items.flatMap(it => (it.kind === 'block' ? it.steps : it.kind === 'ref' ? [] : [it])).filter((s): s is ExerciseStep => s.kind === 'exercise').map(s => s.exercise.key))];

type Owner = 'me' | 'other' | 'catalogue';
const summary = (r: Runsheet, owner: Owner, extra: { public?: boolean; source?: string; updatedAt?: string } = {}) => ({
  id: r.id!,
  title: r.title,
  creator: r.creator ?? r.source?.author,
  owner,
  ...(owner === 'me' ? { public: extra.public ?? false } : {}),
  source: extra.source ?? r.source?.kind,
  program: r.program ? `${r.program.name} — ${r.program.day}` : undefined,
  minutes: runsheetMinutes(r),
  level: r.level,
  tags: r.tags,
  exercises: exerciseKeys(r).slice(0, 12),
  updatedAt: extra.updatedAt,
});

const sessionView = (s: SessionResult, row: SessionRow, own: Record<string, LibraryExercise>) => ({
  id: s.id ?? row.id,
  workoutId: row.workout_id ?? s.runsheetId,
  title: s.title ?? row.title,
  type: s.activity ? 'activity' : 'workout',
  startedAt: s.startedAt ?? row.started_at,
  endedAt: s.endedAt ?? row.ended_at ?? undefined,
  durationMin: s.durationSec ? Math.round(s.durationSec / 60) : (row.duration_min ?? undefined),
  completed: s.completed ?? row.completed,
  startedFrom: s.startedFrom,
  activity: s.activity,
  score: s.score,
  scoreText: s.scoreText,
  notes: s.notes,
  device: s.device,
  exercises: s.steps.map(x => ({ exerciseKey: x.exerciseKey, name: exerciseName(x.exerciseKey, own), load: x.target, incline: x.incline, reps: x.reps, success: x.success })),
});

const ownExercises = async (db: Db): Promise<Record<string, LibraryExercise>> => {
  const rows = await db.get<{ key: string; data: Omit<LibraryExercise, 'key'> }[]>(`exercises?owner=eq.${db.userId}&select=key,data`);
  return Object.fromEntries((rows ?? []).map(r => [r.key, { ...r.data, key: r.key } as LibraryExercise]));
};

const clampLimit = (n: number | undefined, def: number, max: number) => Math.max(1, Math.min(max, Math.floor(n ?? def)));

// ── tools ──

export const getProfile = async (db: Db, email?: string) => {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [profiles, states, recent, own] = await Promise.all([
    db.get<{ name: string | null; units: string }[]>(`profiles?id=eq.${db.userId}&select=name,units`),
    db.get<{ favorites: unknown; prefs: Record<string, unknown> }[]>(`user_state?owner=eq.${db.userId}&select=favorites,prefs`),
    db.get<{ id: string }[]>(`sessions?owner=eq.${db.userId}&started_at=gte.${enc(since)}&select=id`),
    db.get<{ id: string }[]>(`workouts?owner=eq.${db.userId}&select=id`),
  ]);
  const p = profiles?.[0];
  const prefs = (states?.[0]?.prefs ?? {}) as { name?: string; units?: string; bodyweightKg?: number; trainingMaxes?: Record<string, number>; saved?: string[] };
  return {
    userId: db.userId,
    email,
    name: prefs.name ?? p?.name ?? undefined,
    units: prefs.units ?? p?.units ?? 'metric',
    bodyweightKg: prefs.bodyweightKg,
    trainingMaxes: prefs.trainingMaxes ?? {},
    savedWorkoutIds: prefs.saved ?? [],
    sessionsLast30Days: recent?.length ?? 0,
    ownWorkouts: own?.length ?? 0,
    note: 'Loads are kg unless units is imperial (display only; stored values are still kg). trainingMaxes are kg, keyed by exercise key.',
  };
};

export const listSessions = async (db: Db, a: { limit?: number; since?: string; until?: string; workoutId?: string }) => {
  const q = new URLSearchParams({ owner: `eq.${db.userId}`, select: SESSION_COLS, order: 'started_at.desc', limit: String(clampLimit(a.limit, 20, 100)) });
  if (a.since) q.append('started_at', `gte.${a.since}`);
  if (a.until) q.append('started_at', `lt.${a.until}`);
  if (a.workoutId) q.set('workout_id', `eq.${a.workoutId}`);
  const [rows, own] = await Promise.all([db.get<SessionRow[]>(`sessions?${q}`), ownExercises(db)]);
  return { sessions: (rows ?? []).map(r => sessionView(fromRow(r), r, own)) };
};

export const getSession = async (db: Db, id: string) => {
  const rows = await db.get<SessionRow[]>(`sessions?id=eq.${enc(id)}&owner=eq.${db.userId}&select=${SESSION_COLS}`);
  const row = rows?.[0];
  if (!row) throw new ToolError(`No session ${id} in your history. list_sessions shows the ids.`);
  const s = fromRow(row);
  const own = await ownExercises(db);
  const workout = s.activity ? null : await findWorkout(db, row.workout_id ?? s.runsheetId).catch(() => null);
  return { ...sessionView(s, row, own), workout: workout ? { id: workout.runsheet.id, title: workout.runsheet.title, outline: outline(workout.runsheet) } : undefined };
};

const findWorkout = async (db: Db, id: string): Promise<{ runsheet: Runsheet; owner: Owner; row?: WorkoutRow; source?: string } | null> => {
  const rows = await db.get<WorkoutRow[]>(`workouts?id=eq.${enc(id)}&select=${WORKOUT_COLS}`);
  const row = rows?.[0];
  if (row) return { runsheet: workoutFromRow(row), owner: row.owner === db.userId ? 'me' : 'other', row };
  const c = catalogue().find(w => w.runsheet.id === id);
  return c ? { runsheet: c.runsheet, owner: 'catalogue', source: c.source } : null;
};

export interface ListWorkoutsArgs {
  scope?: 'mine' | 'public' | 'catalogue' | 'all';
  query?: string;
  source?: string;
  tag?: string;
  exercise?: string;
  minMinutes?: number;
  maxMinutes?: number;
  limit?: number;
  offset?: number;
}
export const listWorkouts = async (db: Db, a: ListWorkoutsArgs) => {
  const scope = a.scope ?? 'all';
  const out: ReturnType<typeof summary>[] = [];
  if (scope === 'mine' || scope === 'all') {
    const rows = await db.get<WorkoutRow[]>(`workouts?owner=eq.${db.userId}&select=${WORKOUT_COLS}&order=updated_at.desc`);
    for (const r of rows ?? []) out.push(summary(workoutFromRow(r), 'me', { public: r.public, source: 'user', updatedAt: r.updated_at }));
  }
  if (scope === 'public' || scope === 'all') {
    const rows = await db.get<WorkoutRow[]>(`workouts?public=eq.true&owner=neq.${db.userId}&select=${WORKOUT_COLS}&order=updated_at.desc&limit=500`);
    for (const r of rows ?? []) out.push(summary(workoutFromRow(r), 'other', { source: 'community', updatedAt: r.updated_at }));
  }
  if (scope === 'catalogue' || scope === 'all') for (const w of catalogue()) out.push(summary(w.runsheet, 'catalogue', { source: w.source }));

  const words = (a.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const hit = out.filter(w => {
    const hay = [w.title, w.creator, w.program, w.source, ...(w.tags ?? []), ...w.exercises].join(' ').toLowerCase();
    if (words.some(x => !hay.includes(x))) return false;
    if (a.source && w.source !== a.source) return false;
    if (a.tag && !(w.tags ?? []).some(t => t.toLowerCase() === a.tag!.toLowerCase())) return false;
    if (a.exercise && !w.exercises.includes(a.exercise)) return false;
    if (a.minMinutes !== undefined && w.minutes < a.minMinutes) return false;
    if (a.maxMinutes !== undefined && w.minutes > a.maxMinutes) return false;
    return true;
  });
  const offset = Math.max(0, Math.floor(a.offset ?? 0));
  const limit = clampLimit(a.limit, 25, 100);
  return { total: hit.length, offset, workouts: hit.slice(offset, offset + limit), sources: [...new Set(catalogue().map(w => w.source))] };
};

export const getWorkout = async (db: Db, id: string) => {
  const w = await findWorkout(db, id);
  if (!w) throw new ToolError(`No workout ${id} that you can see. list_workouts shows the ids.`);
  return {
    ...summary(w.runsheet, w.owner, { public: w.row?.public, source: w.source }),
    canEdit: w.owner === 'me',
    description: w.runsheet.description,
    outline: outline(w.runsheet),
    appUrl: appUrl(id),
    runsheet: w.runsheet,
  };
};

const newId = () => `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const resolver = async (db: Db) => {
  const own = await ownExercises(db);
  return (key: string) => libraryRef(key) ?? own[key];
};

const profileName = async (db: Db) => {
  const [states, profiles] = await Promise.all([db.get<{ prefs: { name?: string } }[]>(`user_state?owner=eq.${db.userId}&select=prefs`), db.get<{ name: string | null }[]>(`profiles?id=eq.${db.userId}&select=name`)]);
  return states?.[0]?.prefs?.name ?? profiles?.[0]?.name ?? undefined;
};

export const createWorkout = async (db: Db, a: { workout: RunsheetInput; public?: boolean }) => {
  const r = normalise(a.workout, await resolver(db));
  const id = newId();
  const creator = r.creator ?? (await profileName(db));
  const runsheet: Runsheet = { ...r, id, creator, source: { title: r.title, kind: 'user', author: creator } };
  await db.post('workouts', { id, owner: db.userId, creator: creator ?? null, title: r.title, public: a.public ?? false, data: runsheet });
  return { id, title: r.title, public: a.public ?? false, minutes: runsheetMinutes(runsheet), outline: outline(runsheet), appUrl: appUrl(id), previewUrl: previewUrl(runsheet) };
};

export const updateWorkout = async (db: Db, a: { id: string; workout?: RunsheetInput; public?: boolean }) => {
  if (!a.workout && a.public === undefined) throw new ToolError('Nothing to change: pass workout, public, or both.');
  const rows = await db.get<WorkoutRow[]>(`workouts?id=eq.${enc(a.id)}&owner=eq.${db.userId}&select=${WORKOUT_COLS}`);
  const row = rows?.[0];
  if (!row) {
    const other = await findWorkout(db, a.id);
    throw new ToolError(other ? `${a.id} is not yours to edit (${other.owner === 'catalogue' ? 'catalogue' : "someone else's"} workout). Copy it with create_workout instead.` : `No workout ${a.id}. list_workouts scope "mine" shows yours.`);
  }
  const before = workoutFromRow(row);
  let runsheet = before;
  if (a.workout) {
    const r = normalise(a.workout, await resolver(db));
    const creator = r.creator ?? before.creator;
    runsheet = { ...r, id: a.id, creator, source: before.source ?? { title: r.title, kind: 'user', author: creator }, icon: before.icon, video: before.video };
  }
  const patch: Record<string, unknown> = {};
  if (a.workout) Object.assign(patch, { title: runsheet.title, creator: runsheet.creator ?? null, data: runsheet });
  if (a.public !== undefined) patch.public = a.public;
  const updated = await db.patch<WorkoutRow[]>(`workouts?id=eq.${enc(a.id)}&owner=eq.${db.userId}`, patch);
  if (!updated?.length) throw new ToolError(`Could not update ${a.id}.`);
  return { id: a.id, title: runsheet.title, public: updated[0].public, minutes: runsheetMinutes(runsheet), outline: outline(runsheet), appUrl: appUrl(a.id), previewUrl: previewUrl(runsheet) };
};

/** The web app's own share link: the runsheet travels in the URL, so it opens with no sign-in. */
export const previewUrl = (r: Runsheet) => shareUrlAt(r, SITE);

export const previewWorkoutUrl = async (db: Db, a: { id?: string; workout?: RunsheetInput }) => {
  let r: Runsheet;
  if (a.workout) r = normalise(a.workout, await resolver(db));
  else if (a.id) {
    const w = await findWorkout(db, a.id);
    if (!w) throw new ToolError(`No workout ${a.id} that you can see.`);
    r = w.runsheet;
  } else throw new ToolError('Pass id (a saved workout) or workout (a draft).');
  return { title: r.title, minutes: runsheetMinutes(r), previewUrl: previewUrl(r), note: 'Opens on tigerworkouts.com with no sign-in: title, length, and "Save to my workouts", after which the timer runs. Nothing is saved until the person taps Save.' };
};

export const searchExercises = async (db: Db, a: { query?: string; group?: string; limit?: number }) => {
  const own = await ownExercises(db);
  const all = [...Object.values(own).map(e => ({ ...e, mine: true })), ...Object.values(FULL_LIBRARY).map(e => ({ ...e, mine: false }))];
  const words = (a.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const hits = all.filter(e => (!a.group || e.group === a.group) && words.every(w => `${e.key} ${e.name} ${e.group}`.toLowerCase().includes(w)));
  const seen = new Set<string>();
  const unique = hits.filter(e => !seen.has(e.key) && seen.add(e.key));
  return { total: unique.length, exercises: unique.slice(0, clampLimit(a.limit, 30, 200)).map(e => ({ key: e.key, name: e.name, unit: e.unit, step: e.step, group: e.group, cue: e.cue, mine: e.mine || undefined })) };
};
