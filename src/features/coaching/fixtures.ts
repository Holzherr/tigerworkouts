/** Example coaching data for stories, tests and the "For coaches" page. Dates are relative to now. */
import type { Assignment, CoachNote, Invite, MyAssignment } from '@/features/cloud/coaching';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { clientRollup, type ClientSummary } from './rollup';

const ago = (days: number, hour = 7) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export const COACH_ID = 'coach-nick';
export const CLIENT_ID = 'client-sam';

export const legDay = (): Runsheet => ({
  id: 'u-legday',
  title: 'Strength A: squat and hinge',
  creator: 'Nick',
  ownerId: COACH_ID,
  source: { title: 'Strength A: squat and hinge', author: 'Nick', kind: 'user' },
  items: [
    { kind: 'block', id: 'b-sq', name: 'Back squat', repeat: 3, steps: [{ ...makeExercise(EX.bb_back_squat, { target: 60, forMode: 'reps', forValue: 8 }), id: 'sq' }, { kind: 'rest', id: 'r-sq', seconds: 120 }] },
    { kind: 'block', id: 'b-rdl', name: 'Romanian deadlift', repeat: 3, steps: [{ ...makeExercise(EX.bb_rdl, { target: 50, forMode: 'reps', forValue: 10 }), id: 'rdl' }, { kind: 'rest', id: 'r-rdl', seconds: 90 }] },
    { ...makeExercise(EX.incline_walk, { forMode: 'minutes', forValue: 10, target: 6, incline: 6 }), id: 'walk' },
  ],
});

/** The coach's own workouts, for the assign picker. */
export const coachWorkouts = (): Runsheet[] => [legDay(), { ...priyanka(), id: 'u-circuit', ownerId: COACH_ID }];

export const clientSummaries = (): ClientSummary[] =>
  clientRollup(
    [
      { id: CLIENT_ID, name: 'Sam Patel', since: ago(40) },
      { id: 'client-jo', name: 'Jo Morgan', since: ago(60) },
      { id: 'client-alex', name: 'Alex Reid', since: ago(30) },
      { id: 'client-new', name: 'Priya Shah', since: ago(2) },
    ],
    [
      { owner: CLIENT_ID, startedAt: ago(1) },
      { owner: CLIENT_ID, startedAt: ago(3) },
      { owner: 'client-jo', startedAt: ago(0) },
      { owner: 'client-alex', startedAt: ago(12) },
    ]
  );

export const pendingInvites = (): Invite[] => [
  { code: 'k3x9q2m7v1', label: 'Priya', createdAt: ago(3) },
  { code: 'p8w2r5t4z6', label: 'Tom (Tuesday group)', createdAt: ago(1) },
];

export const clientSessionsFixture = (): SessionResult[] => [
  {
    id: 's-sam-2',
    runsheetId: 'u-legday',
    title: 'Strength A: squat and hinge',
    startedFrom: 'coach',
    startedAt: ago(1),
    durationSec: 46 * 60,
    completed: true,
    steps: [
      { stepId: 'sq', exerciseKey: 'bb_back_squat', sets: [{ load: 60, reps: 8 }, { load: 60, reps: 8 }, { load: 60, reps: 6 }] },
      { stepId: 'rdl', exerciseKey: 'bb_rdl', sets: [{ load: 50, reps: 10 }, { load: 50, reps: 10 }, { load: 52.5, reps: 10 }] },
      { stepId: 'walk', exerciseKey: 'incline_walk', sets: [{ load: 6, seconds: 600 }] },
    ],
    rpe: 8,
  },
  {
    id: 's-sam-1',
    runsheetId: 'u-circuit',
    title: 'Swings, incline press & sprints',
    startedAt: ago(3),
    durationSec: 31 * 60,
    completed: false,
    steps: [{ stepId: 's1', exerciseKey: 'kb_swing', sets: [{ load: 24, seconds: 30 }, { load: 24, seconds: 30 }, { load: 24, seconds: 30 }] }],
  },
];

export const assignmentsFixture = (): Assignment[] => [
  { id: 'a2', coach: COACH_ID, client: CLIENT_ID, workoutId: 'u-circuit', note: 'Keep the swings at 24 kg this week.', createdAt: ago(0, 6) },
  { id: 'a1', coach: COACH_ID, client: CLIENT_ID, workoutId: 'u-legday', note: 'Last set of squats: stop one rep short of failure.', createdAt: ago(2) },
];

export const notesFixture = (): CoachNote[] => [
  { id: 'n1', coach: COACH_ID, client: CLIENT_ID, author: COACH_ID, assignmentId: 'a1', body: 'New block starts Monday. Squats three times a week.', createdAt: ago(2, 9) },
  { id: 'n2', coach: COACH_ID, client: CLIENT_ID, author: CLIENT_ID, sessionId: 's-sam-2', body: 'Last squat set was heavy, lost depth on rep 7.', createdAt: ago(1, 9) },
  { id: 'n3', coach: COACH_ID, client: CLIENT_ID, author: COACH_ID, sessionId: 's-sam-2', body: 'Good call stopping at 6. Same weight next time.', createdAt: ago(1, 12) },
];

export const myAssignmentsFixture = (): MyAssignment[] => {
  const ws = coachWorkouts();
  return assignmentsFixture().map(a => ({ ...a, coachName: 'Nick Holzherr', workout: ws.find(w => w.id === a.workoutId) }));
};
