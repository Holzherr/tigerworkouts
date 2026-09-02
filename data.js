// Workout Hub — seed content.
// Exercises are the shared library (one YouTube demo each). Workouts reference
// them by key. Add a workout by appending to WORKOUTS; add an exercise by
// adding a key to EXERCISES. No personal logs live here — those stay on-device.

const EXERCISES = {
  kb_swing: {
    name: 'Kettlebell swings',
    video: 'bDCeXbMJVNs',
    unit: 'kg', step: 4,
    cue: 'Hinge, not squat. Snap the hips, arms are ropes, bell to chest height.',
  },
  db_shoulder_press: {
    name: 'Shoulder press',
    video: '6eDlfTDb7Po',
    unit: 'kg per arm', step: 2.5,
    cue: 'Standing, dumbbells at shoulders, press overhead. Ribs down, no arching.',
  },
  db_incline_press: {
    name: 'Incline chest press',
    video: 'c1ZX5ZXMQVk',
    unit: 'kg per arm', step: 2.5,
    cue: 'Bench at ~30°. Elbows ~45° from torso, press up and slightly back.',
  },
  sprint: {
    name: 'Treadmill sprints',
    video: 'spg6AXxM3Pk',
    unit: 'kph', step: 0.5,
    cue: 'Belt keeps running. Hands on rails, hop to the side platforms for the rest, step back on for the next sprint.',
  },
  lat_raise: {
    name: 'Lateral raises',
    video: 'FmouSdWmFxw',
    unit: 'kg per arm', step: 2.5,
    cue: 'Slight elbow bend, raise to shoulder height, lead with the elbows, control the way down.',
  },
  incline_walk: {
    name: 'Incline walk',
    video: 'Ii71nAaRc_8',
    unit: 'kph', step: 0.5,
    cue: 'Hands off the rails. Walk tall, push through the whole foot.',
  },
};

// Block types:
//   interval — rounds × (each exercise: work_s on, rest_s off)
//   steady   — segments × repeat, each segment is timed at a speed/incline
const WORKOUTS = [
  {
    id: 'priyanka-swings-incline-press-sprints',
    title: 'Swings, incline press & sprints',
    creator: 'Priyanka',
    created: '2026-09-02',
    level: 'Hard',
    tags: ['HIIT', 'Kettlebell', 'Treadmill'],
    blocks: [
      { name: 'Swings + incline press', type: 'interval', work_s: 30, rest_s: 30, rounds: 8,
        exercises: [ { ex: 'kb_swing', target: 28 }, { ex: 'db_incline_press', target: 15 } ] },
      { name: 'Sprints', type: 'interval', work_s: 30, rest_s: 30, rounds: 8,
        exercises: [ { ex: 'sprint', target: 14.5 } ] },
      { name: 'Swings + lateral raises', type: 'interval', work_s: 30, rest_s: 30, rounds: 4,
        exercises: [ { ex: 'kb_swing', target: 28 }, { ex: 'lat_raise', target: 7.5 } ] },
      { name: 'Incline walk', type: 'steady', ex: 'incline_walk', incline: 6, repeat: 2,
        segments: [ { s: 120, speed: 6 }, { s: 180, speed: 9 } ] },
    ],
  },
  {
    id: 'priyanka-swings-press-sprints',
    title: 'Swings, shoulder press & sprints',
    creator: 'Priyanka',
    created: '2026-08-23',
    level: 'Hard',
    tags: ['HIIT', 'Kettlebell', 'Treadmill'],
    blocks: [
      { name: 'Swings + shoulder press', type: 'interval', work_s: 30, rest_s: 30, rounds: 8,
        exercises: [ { ex: 'kb_swing', target: 28 }, { ex: 'db_shoulder_press', target: 15 } ] },
      { name: 'Sprints', type: 'interval', work_s: 30, rest_s: 30, rounds: 8,
        exercises: [ { ex: 'sprint', target: 14.5 } ] },
      { name: 'Swings', type: 'interval', work_s: 30, rest_s: 30, rounds: 8,
        exercises: [ { ex: 'kb_swing', target: 24 } ] },
      { name: 'Lateral raises', type: 'interval', work_s: 30, rest_s: 30, rounds: 2,
        exercises: [ { ex: 'lat_raise', target: 7.5 } ] },
      { name: 'Incline walk', type: 'steady', ex: 'incline_walk', incline: 6, repeat: 3,
        segments: [ { s: 120, speed: 6 }, { s: 180, speed: 9 } ] },
    ],
  },
];
