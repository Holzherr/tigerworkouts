import { makeExercise, makeRest, type Block, type ExerciseRef, type Runsheet } from './model';

import { LIBRARY } from '@/features/exercises/library';

/** Exercises used by stories and tests, straight from the shared library (six have demo clips). */
export const EX: Record<string, ExerciseRef> = {
  ...LIBRARY,
  pushup: LIBRARY.bw_pushup,
  row_erg: LIBRARY.cardio_rower,
};

const b = (id: string, name: string, repeat: number, steps: Block['steps']): Block => ({ kind: 'block', id, name, repeat, steps });

/** Priyanka's 2 Sep circuit in runsheet form, with stable ids so stories are deterministic. */
export const priyanka = (): Runsheet => ({
  id: 'priyanka-swings-incline-press-sprints',
  title: 'Swings, incline press & sprints',
  creator: 'Priyanka',
  items: [
    b('b1', 'Swings + incline press', 8, [
      { ...makeExercise(EX.kb_swing, { target: 28 }), id: 's1' },
      { ...makeRest(30), id: 'r1' },
      { ...makeExercise(EX.db_incline_press, { target: 20 }), id: 's2' },
      { ...makeRest(30), id: 'r2' },
    ]),
    b('b2', 'Sprints', 8, [
      { ...makeExercise(EX.sprint, { target: 14.5 }), id: 's3' },
      { ...makeRest(30), id: 'r3' },
    ]),
    b('b3', 'Swings + lateral raises', 4, [
      { ...makeExercise(EX.kb_swing, { target: 28 }), id: 's4' },
      { ...makeRest(30), id: 'r4' },
      { ...makeExercise(EX.lat_raise, { target: 7.5 }), id: 's5' },
      { ...makeRest(30), id: 'r5' },
    ]),
    { ...makeExercise(EX.incline_walk, { forMode: 'minutes', forValue: 10, target: 6, incline: 6 }), id: 's6' },
  ],
});

/** A few loose steps, for grouping demos. */
export const loose = (): Runsheet => ({
  title: 'Scratch',
  items: [
    { ...makeExercise(EX.kb_swing, { target: 28 }), id: 'l1' },
    { ...makeExercise(EX.db_incline_press, { target: 20 }), id: 'l2' },
    { ...makeExercise(EX.sprint, { target: 14.5 }), id: 'l3' },
    { ...makeExercise(EX.pushup, { forMode: 'reps', forValue: 12 }), id: 'l4' },
  ],
});
