import { makeExercise, makeRest, type Block, type ExerciseRef, type Runsheet } from './model';

/** The six exercises that have demo clips, plus a couple without, for stories and tests. */
export const EX: Record<string, ExerciseRef> = {
  kb_swing: { key: 'kb_swing', name: 'Kettlebell swings', unit: 'kg', step: 4, clip: 'media/kb_swing.mp4', poster: 'media/kb_swing.jpg' },
  db_incline_press: { key: 'db_incline_press', name: 'Incline chest press', unit: 'kg per arm', step: 2.5, clip: 'media/db_incline_press.mp4', poster: 'media/db_incline_press.jpg' },
  db_shoulder_press: { key: 'db_shoulder_press', name: 'Shoulder press', unit: 'kg per arm', step: 2.5, clip: 'media/db_shoulder_press.mp4', poster: 'media/db_shoulder_press.jpg' },
  lat_raise: { key: 'lat_raise', name: 'Lateral raises', unit: 'kg per arm', step: 1.25, clip: 'media/lat_raise.mp4', poster: 'media/lat_raise.jpg' },
  sprint: { key: 'sprint', name: 'Treadmill sprints', unit: 'kph', step: 0.5, clip: 'media/sprint.mp4', poster: 'media/sprint.jpg' },
  incline_walk: { key: 'incline_walk', name: 'Incline walk', unit: 'kph', step: 0.5, clip: 'media/incline_walk.mp4', poster: 'media/incline_walk.jpg' },
  pushup: { key: 'pushup', name: 'Push-ups', unit: '', step: 1, icon: '💪' },
  row_erg: { key: 'row_erg', name: 'Rowing machine', unit: 'W', step: 10, icon: '🚣' },
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
