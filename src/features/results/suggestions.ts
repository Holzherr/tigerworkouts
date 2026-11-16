/**
 * The two things the targets remember on this device: how hard to push (Settings → Suggestions)
 * and which stalls were dismissed. New keys; nothing else reads them. Wrapped so a browser that
 * blocks storage still gets maintain and every stall.
 */
import type { Intent, ProgressMode } from '@/features/runsheet/targets';
import { hasLoad, lineage, measureOf, shortUnit, type ExerciseStep, type Runsheet } from '@/features/runsheet/model';

const INTENT = 'tiger:intent';
const DISMISSED = 'tiger:stalls-dismissed';

export const getIntent = (): Intent => {
  try {
    const v = localStorage.getItem(INTENT);
    return v === 'restore' || v === 'overreach' ? v : 'maintain';
  } catch {
    return 'maintain';
  }
};

export const setIntent = (v: Intent) => {
  try {
    localStorage.setItem(INTENT, v);
  } catch {
    /* ignore */
  }
};

export const getDismissed = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export const dismissStall = (id: string): string[] => {
  const next = [...new Set([...getDismissed(), id])];
  try {
    localStorage.setItem(DISMISSED, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
};

// ── whether to suggest at all, and how ──

/**
 * `user_state.prefs.suggestions`, shared with the iPhone app (`SuggestPrefs` in Suggestions.swift).
 * Every field optional, so an empty object is the default: on, by reps. Fields this build does
 * not know ride along untouched.
 */
export interface SuggestPrefs {
  /** True turns every suggestion off for the account: no Today line, no target on the timer, no
   * Next time, no stall cards. */
  off?: boolean;
  /** The account's mode; unset is reps. */
  mode?: ProgressMode;
  /** The setup question ("Want suggestions on how to progress?") has been answered. */
  asked?: boolean;
  /** Per exercise key, over the account's mode. */
  exercises?: Record<string, ProgressMode>;
  /** Workout ids with suggestions off. */
  offWorkouts?: string[];
}

export const PROGRESS_MODES: { id: ProgressMode; label: string; note: string }[] = [
  { id: 'reps', label: 'Reps', note: 'Add reps up to the top of the range, then add weight and start again.' },
  { id: 'weight', label: 'Weight', note: 'Keep the reps, add a step of weight (+2.5 kg) once every set makes them.' },
  { id: 'effort', label: 'Effort', note: 'Keep weight and reps, rate how hard it was (RPE), add weight once it feels easier.' },
];
const isMode = (v: unknown): v is ProgressMode => v === 'reps' || v === 'weight' || v === 'effort';

/** The pref as stored, read safely: an unknown mode (a newer build's) reads as unset. */
export const readSuggest = (json: unknown): SuggestPrefs => {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  const j = json as Record<string, unknown>;
  const exercises = j.exercises && typeof j.exercises === 'object' ? Object.fromEntries(Object.entries(j.exercises as Record<string, unknown>).filter((e): e is [string, ProgressMode] => isMode(e[1]))) : undefined;
  const offWorkouts = Array.isArray(j.offWorkouts) ? j.offWorkouts.filter((x): x is string => typeof x === 'string') : undefined;
  return {
    ...j,
    off: j.off === true ? true : undefined,
    asked: j.asked === true ? true : undefined,
    mode: isMode(j.mode) ? j.mode : undefined,
    exercises: exercises && Object.keys(exercises).length ? exercises : undefined,
    offWorkouts: offWorkouts?.length ? offWorkouts : undefined,
  };
};

/** The value to store: undefined for the default (written as a cleared field), unset fields left out. */
export const storedSuggest = (p: SuggestPrefs | undefined): SuggestPrefs | undefined => {
  const out = Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined && v !== null));
  return Object.keys(out).length ? (out as SuggestPrefs) : undefined;
};

export const suggestEnabled = (p: SuggestPrefs | undefined) => p?.off !== true;
export const modeFor = (p: SuggestPrefs | undefined, exerciseKey: string): ProgressMode => p?.exercises?.[exerciseKey] ?? p?.mode ?? 'reps';

/** On for this workout: on for the account and not turned off for it, or for the workout it was copied from. */
export const suggestOn = (p: SuggestPrefs | undefined, r: Pick<Runsheet, 'id' | 'title' | 'copyOf'>) => suggestEnabled(p) && !lineage(r).some(id => (p?.offWorkouts ?? []).includes(id));

const steps = (r: Runsheet): ExerciseStep[] => r.items.flatMap(it => (it.kind === 'block' ? it.steps : it.kind === 'ref' ? [] : [it])).filter((s): s is ExerciseStep => s.kind === 'exercise');

/** Ask the setup question on a workout that has a loaded exercise, once per account. */
export const shouldAsk = (p: SuggestPrefs | undefined, r: Runsheet) =>
  p?.asked !== true && suggestEnabled(p) && steps(r).some(s => ((s.target ?? 0) > 0 || !!s.sets?.some(x => (x.load ?? 0) > 0)) && hasLoad(s.exercise) && shortUnit(s.exercise.unit) !== 'kph' && !measureOf(s.exercise.unit));

/** The setup question answered: No turns suggestions off, Yes takes the mode picked. */
export const answered = (p: SuggestPrefs | undefined, yes: boolean, mode?: ProgressMode): SuggestPrefs => ({ ...p, asked: true, off: yes ? undefined : true, ...(mode ? { mode } : {}) });

/** Suggestions on or off for one workout (and the workout it was copied from). */
export const withWorkout = (p: SuggestPrefs | undefined, r: Pick<Runsheet, 'id' | 'title' | 'copyOf'>, on: boolean): SuggestPrefs => {
  const ids = (p?.offWorkouts ?? []).filter(id => !lineage(r).includes(id));
  if (!on) ids.push(r.id ?? r.title);
  return { ...p, offWorkouts: ids.length ? ids : undefined };
};

/** An exercise's own mode; undefined follows the account's. */
export const withExercise = (p: SuggestPrefs | undefined, key: string, mode: ProgressMode | undefined): SuggestPrefs => {
  const m = { ...p?.exercises };
  if (mode) m[key] = mode;
  else delete m[key];
  return { ...p, exercises: Object.keys(m).length ? m : undefined };
};
