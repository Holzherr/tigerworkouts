import { describe, expect, it } from 'vitest';
import { lastUsed, withLastUsed } from './last-used';
import type { SessionResult } from './progression';
import type { Runsheet } from './model';

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
    expect(m.get('step:e1')).toEqual({ target: 14.5, incline: 6 });
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
});
