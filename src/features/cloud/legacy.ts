/**
 * Converters for rows written by the v0.9 app (and its localStorage), so history and workouts
 * from before the React app show unchanged. Legacy session data is kept on the result as
 * `legacy` so an edit pushes back a shape the old app can still read.
 */
import { LIBRARY } from '@/features/exercises/library';
import { fromLegacy, type LegacyWorkout, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult, StepResult } from '@/features/runsheet/progression';

export interface LegacySession {
  id: string;
  workoutId?: string;
  title: string;
  creator?: string;
  type?: string;
  startedAt: string;
  endedAt?: string | null;
  duration_min?: number;
  completed?: boolean;
  notes?: string;
  icon?: string;
  intensity?: string;
  blocks?: LegacyBlock[];
}
interface LegacyBlock {
  type: 'interval' | 'sets' | 'steady';
  name: string;
  skipped?: boolean;
  exercises?: { ex: string; name?: string; target?: number; actual?: number; actuals?: number[]; reps?: number; sets?: number; done?: { reps: number; weight: number }[]; removed?: boolean }[];
  ex?: string;
  speeds_actual?: number[];
  minutes_done?: number;
}

export const isLegacySession = (data: unknown): data is LegacySession => !!data && typeof data === 'object' && !('format' in (data as object)) && 'startedAt' in (data as object);

export const fromLegacySession = (s: LegacySession): SessionResult => {
  const steps: StepResult[] = [];
  (s.blocks ?? []).forEach((b, bi) => {
    if (b.skipped) return;
    (b.exercises ?? []).forEach((e, ei) => {
      if (e.removed) return;
      steps.push({ stepId: `${bi}-${ei}-${e.ex}`, exerciseKey: e.ex, target: e.actual ?? e.target, reps: e.done?.length ? e.done.map(d => d.reps) : undefined, success: undefined });
    });
    if (b.type === 'steady' && b.ex) steps.push({ stepId: `${bi}-${b.ex}`, exerciseKey: b.ex, target: b.speeds_actual?.[0] });
  });
  return {
    runsheetId: s.workoutId ?? s.id,
    title: s.title,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? undefined,
    durationSec: s.duration_min ? s.duration_min * 60 : undefined,
    completed: s.completed,
    notes: s.notes || undefined,
    activity: s.type === 'activity' ? { name: s.title, icon: s.icon, minutes: s.duration_min ?? 0, intensity: s.intensity } : undefined,
    steps,
    legacy: s,
    id: s.id,
  };
};

/** v0.9 localStorage store shape, for the one-off migration on first load. */
export interface LegacyLocal {
  sessions?: LegacySession[];
  workouts?: LegacyWorkout[];
  favorites?: { name: string; icon?: string; minutes: number; intensity?: string }[];
  saved?: string[];
  name?: string;
  avatar?: unknown;
  exercises?: Record<string, { name: string; unit?: string; step?: number; icon?: string; cue?: string }>;
}

export const readLegacyLocal = (): LegacyLocal | null => {
  try {
    return JSON.parse(localStorage.getItem('workout-hub:v1') || 'null');
  } catch {
    return null;
  }
};

export const legacyWorkoutToRunsheet = (w: LegacyWorkout): Runsheet => {
  const lib = { ...LIBRARY } as Record<string, (typeof LIBRARY)[string]>;
  const r = fromLegacy(w, lib);
  return { ...r, source: { title: w.title, kind: 'user', author: w.creator, importedAt: undefined }, tags: (w as { tags?: string[] }).tags, level: (w as { level?: 'Easy' | 'Medium' | 'Hard' }).level };
};
