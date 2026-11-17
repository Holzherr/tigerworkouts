import { useSyncExternalStore } from 'react';
import { loadIsKg, shownMax, weightStepper } from './units';

/**
 * What − and + move a number by, per exercise: the library's own step (2.5 kg on a barbell) until
 * one is picked on the exercise's sheet (Priyanka, 14 Nov 2026: her track is 20 m). Kept on this
 * device, as the iPhone app keeps its own. Port of `ios/TigerWorkouts/Model/StepSizes.swift`.
 */
export type StepKind = 'load' | 'meters';

export const LOAD_STEP_CHOICES = [0.5, 1, 1.25, 2, 2.5, 4, 5, 10];
export const METER_STEP_CHOICES = [5, 10, 20, 25, 50, 100, 200, 400];

const KEY = 'workout-hub-next:stepSizes';
const idOf = (key: string, kind: StepKind) => (kind === 'load' ? key : `${key}:${kind}`);

const read = (): Record<string, number> => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

let all = read();
const listeners = new Set<() => void>();
if (typeof window !== 'undefined')
  window.addEventListener('storage', e => {
    if (e.key !== KEY) return;
    all = read();
    listeners.forEach(l => l());
  });

/** The step picked for this exercise, undefined when none was. */
export const customStep = (key: string, kind: StepKind): number | undefined => all[idOf(key, kind)];

/** Undefined, zero or less goes back to the exercise's own step. */
export const setStepSize = (key: string, kind: StepKind, value: number | undefined) => {
  const next = { ...all };
  if (value !== undefined && value > 0) next[idOf(key, kind)] = value;
  else delete next[idOf(key, kind)];
  all = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
  listeners.forEach(l => l());
};

/** The load (or speed) step: the one picked, else the exercise's own, never zero. */
export const loadStep = (ex: { key: string; step?: number }): number => customStep(ex.key, 'load') ?? (ex.step && ex.step > 0 ? ex.step : 1);

/** The metres step: the one picked, else `fallback` (10 m on a distance, the machine's own on a timed piece). */
export const metersStep = (ex: { key: string }, fallback: number): number => customStep(ex.key, 'meters') ?? fallback;

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

/** Re-render when a step size is picked. The value is the whole table; read it with `loadStep` / `metersStep`. */
export const useStepSizes = () => useSyncExternalStore(subscribe, () => all);

/** Tests only. */
export const resetStepSizes = () => {
  all = read();
  listeners.forEach(l => l());
};

/**
 * Props for the stepper on a step's load or speed: the step size above, and for a weight the
 * shown unit (U11: stepped in lb when loads show in lb, handed back as kg). A speed stays as it is.
 */
export const loadStepper = (ex: { key: string; step?: number; unit?: string }, value: number, onChange: (v: number) => void, max = 1000) =>
  loadIsKg(ex.unit) ? { ...weightStepper(value, loadStep(ex), onChange), max: shownMax(max) } : { value, step: loadStep(ex), onChange, max };
