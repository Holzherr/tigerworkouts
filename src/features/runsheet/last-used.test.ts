import { describe, expect, it } from 'vitest';
import { lastUsed, withLastUsed } from './last-used';
import type { SessionResult } from './progression';
import type { Runsheet } from './model';
import type { WorkoutSettings } from './settings';

const sprint = { key: 'sprint', name: 'Treadmill sprints', unit: 'kph', step: 0.5 };
const press = { key: 'db_incline_press', name: 'Incline chest press', unit: 'kg per arm', step: 2.5 };

const sheet = (): Runsheet => ({
  id: 'u-1',
  title: 'Swings & sprints',
  items: [
    { kind: 'block', id: 'b1', name: 'Sprints', repeat: 8, steps: [{ kind: 'exercise', id: 'e1', exercise: sprint, target: 14.5, forMode: 'seconds', forValue: 30 }, { kind: 'rest', id: 'r1', seconds: 30 }] },
    { kind: 'exercise', id: 'e2', exercise: press, target: 15, forMode: 'seconds', forValue: 30 },
  ],
});

const session = (startedAt: string, steps: SessionResult['steps']): SessionResult => ({ id: 's-' + startedAt, runsheetId: 'u-1', startedAt, steps });

describe('what you used last time', () => {
  it('prefers the newest session', () => {
    const m = lastUsed([
      session('2026-09-01T10:00:00Z', [{ stepId: 'e1', exerciseKey: 'sprint', target: 13 }]),
      session('2026-09-10T10:00:00Z', [{ stepId: 'e1', exerciseKey: 'sprint', target: 14.5, incline: 6 }]),
    ]);
    expect(m.get('step:u-1:e1')).toEqual({ target: 14.5, incline: 6, at: '2026-09-10T10:00:00Z' });
  });

  it('seeds speed, incline and weight into the workout', () => {
    const out = withLastUsed(sheet(), [session('2026-09-10T10:00:00Z', [
      { stepId: 'e1', exerciseKey: 'sprint', target: 15, incline: 6 },
      { stepId: 'e2', exerciseKey: 'db_incline_press', target: 20 },
    ])]);
    const block = out.items[0] as Extract<Runsheet['items'][number], { kind: 'block' }>;
    expect(block.steps[0]).toMatchObject({ target: 15, incline: 6 });
    expect(out.items[1]).toMatchObject({ target: 20 });
  });

  it('carries a machine across workouts by exercise when the step id is new', () => {
    const out = withLastUsed(sheet(), [session('2026-09-10T10:00:00Z', [{ stepId: 'somewhere-else', exerciseKey: 'sprint', target: 15.5, incline: 5 }])]);
    const block = out.items[0] as Extract<Runsheet['items'][number], { kind: 'block' }>;
    expect(block.steps[0]).toMatchObject({ target: 15.5, incline: 5 });
  });

  it('leaves the workout alone with no history', () => {
    const r = sheet();
    expect(withLastUsed(r, [])).toBe(r);
  });

  it('does not touch a percentage-of-training-max load', () => {
    const r = sheet();
    (r.items[1] as { target?: unknown }).target = { pct: 80 };
    const out = withLastUsed(r, [session('2026-09-10T10:00:00Z', [{ stepId: 'e2', exerciseKey: 'db_incline_press', target: 60 }])]);
    expect((out.items[1] as { target?: unknown }).target).toEqual({ pct: 80 });
  });

  it('does not take a step from another workout that happens to share its id', () => {
    // Catalogue step ids ("s1", "e1") repeat across workouts; only the exercise key carries over.
    const out = withLastUsed(sheet(), [{ ...session('2026-09-10T10:00:00Z', [{ stepId: 'e2', exerciseKey: 'kb_swing', target: 32 }]), runsheetId: 'someone-else' }]);
    expect(out.items[1]).toMatchObject({ target: 15 });
  });
});

describe('saved settings against what you used last time', () => {
  const settings = (at: string, target: number): WorkoutSettings => ({ updatedAt: at, steps: { e2: { target, at } }, blocks: {} });
  const press = (r: Runsheet) => r.items[1] as { target?: number };

  it('a setting beats a session done before it was saved', () => {
    const out = withLastUsed(sheet(), [session('2026-09-10T10:00:00Z', [{ stepId: 'e2', exerciseKey: 'db_incline_press', target: 20 }])], settings('2026-09-12T08:00:00Z', 22.5));
    expect(press(out).target).toBe(22.5);
  });

  it('a session of this workout done after the setting moves the number on', () => {
    const out = withLastUsed(sheet(), [session('2026-09-14T10:00:00Z', [{ stepId: 'e2', exerciseKey: 'db_incline_press', target: 25 }])], settings('2026-09-12T08:00:00Z', 22.5));
    expect(press(out).target).toBe(25);
  });

  it('a newer session of a different workout never overrides a setting', () => {
    const other = { ...session('2026-09-14T10:00:00Z', [{ stepId: 'x9', exerciseKey: 'db_incline_press', target: 30 }]), runsheetId: 'u-2' };
    const out = withLastUsed(sheet(), [other], settings('2026-09-12T08:00:00Z', 22.5));
    expect(press(out).target).toBe(22.5);
  });

  it('reps, rests and rounds come from the settings', () => {
    const ws: WorkoutSettings = { updatedAt: '2026-09-12T08:00:00Z', steps: { e2: { forValue: 45, at: '2026-09-12T08:00:00Z' }, r1: { seconds: 20, at: '2026-09-12T08:00:00Z' } }, blocks: { b1: { repeat: 6 } } };
    const out = withLastUsed(sheet(), [], ws);
    const block = out.items[0] as Extract<Runsheet['items'][number], { kind: 'block' }>;
    expect(block.repeat).toBe(6);
    expect(block.steps[1]).toMatchObject({ seconds: 20 });
    expect(out.items[1]).toMatchObject({ forValue: 45, target: 15 });
  });
});

