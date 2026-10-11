import { describe, expect, it } from 'vitest';
import { decodeLogged, decodeShared, logUrl, shareUrl } from './share';
import { enc } from './link';
import type { SessionResult } from '@/features/runsheet/progression';
import type { Runsheet } from '@/features/runsheet/model';

const session = (): SessionResult => ({
  id: 's-test',
  runsheetId: 'u-1',
  title: 'Swings & sprints',
  startedAt: '2026-09-15T17:26:00.000Z',
  endedAt: '2026-09-15T17:50:00.000Z',
  durationSec: 1440,
  completed: false,
  notes: 'Logged by hand',
  steps: [{ stepId: 'e-1', exerciseKey: 'sprint', target: 14.5, incline: 6, reps: [], success: true }],
});

describe('a logged session in a link', () => {
  it('survives the round trip', () => {
    const url = logUrl(session(), 'https://tigerworkouts.com/');
    const payload = url.split('#/log/')[1];
    expect(decodeLogged(payload)).toEqual(session());
  });

  it('refuses anything that is not a session', () => {
    expect(decodeLogged('bm90LWpzb24')).toBeNull();
    expect(decodeLogged(btoa(JSON.stringify({ title: 'no steps' })))).toBeNull();
  });
});

describe('a shared workout in a link', () => {
  const workout = (): Runsheet => ({
    title: 'Legs',
    creator: 'Nick',
    items: [
      { kind: 'exercise', id: 'e-1', exercise: { key: 'bb_back_squat', name: 'Barbell back squat', unit: 'kg', step: 2.5, clip: 'squat.mp4' }, target: 60, forMode: 'reps', forValue: 5 },
      { kind: 'block', id: 'b-1', name: 'Finisher', repeat: 3, steps: [{ kind: 'rest', id: 'r-1', seconds: 30 }] },
      { kind: 'ref', id: 'f-1', runsheetId: 'warm-up' },
    ],
  });
  const payload = (v: unknown) => enc(JSON.stringify(v));

  it('survives the round trip without its clips', () => {
    const r = decodeShared(shareUrl(workout(), 'https://tigerworkouts.com/').split('#/import/')[1]);
    expect(r?.items).toHaveLength(3);
    expect(r?.items[0]).toMatchObject({ exercise: { key: 'bb_back_squat', name: 'Barbell back squat' }, target: 60 });
    expect(JSON.stringify(r)).not.toContain('squat.mp4');
  });

  it('refuses a payload that would save a workout every screen crashes on', () => {
    for (const items of [[null], ['x'], [{ kind: 'exercise', id: 'e' }], [{ kind: 'block', id: 'b', name: 'B' }], [{ kind: 'block', id: 'b', name: 'B', steps: [null] }], [{ kind: 'ref', id: 'f' }]])
      expect(decodeShared(payload({ title: 'Bad', items }))).toBeNull();
    expect(decodeShared(payload({ title: 42, items: [] }))).toBeNull();
    expect(decodeShared(payload([]))).toBeNull();
    expect(decodeShared('not base64!')).toBeNull();
  });
});
