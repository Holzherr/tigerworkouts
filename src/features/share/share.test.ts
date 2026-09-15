import { describe, expect, it } from 'vitest';
import { decodeLogged, logUrl } from './share';
import type { SessionResult } from '@/features/runsheet/progression';

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
